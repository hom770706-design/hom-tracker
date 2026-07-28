"""
資料層：從期交所(TAIFEX)下載逐筆成交，聚合成 1 分K，並做本地快取 / 每日累積。

TAIFEX 免費提供「前 30 個交易日」每筆成交資料，每天一個 zip：
    https://www.taifex.com.tw/file/taifex/Dailydownload/DailydownloadCSV/Daily_YYYY_MM_DD.zip

裡面是當天「所有期貨商品」的逐筆成交 CSV（Big5 編碼），欄位大致為：
    成交日期, 商品代號, 到期月份(週別), 成交時間, 成交價格, 成交數量(B+S), ...

用法（在你自己電腦、每天收盤後排程執行）：
    # 一次補最近 30 天
    python -m data.taifex_loader --backfill 30
    # 每天只抓當天
    python -m data.taifex_loader --date 2026-07-18

無網路 / 想先測框架時，用 demo 合成資料：
    from data.taifex_loader import load_demo_bars
"""

from __future__ import annotations

import io
import os
import time
import zipfile
import argparse
import datetime as dt

import numpy as np
import pandas as pd
import requests

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import DATA_DIR, DATA_PRODUCT  # noqa: E402


TAIFEX_URL = (
    "https://www.taifex.com.tw/file/taifex/Dailydownload/"
    "DailydownloadCSV/Daily_{y}_{m:02d}_{d:02d}.zip"
)

# TAIFEX 逐筆 CSV 的欄位（依位置對應，避免中文表頭編碼問題）
_RAW_COLS = [
    "trade_date", "product", "expiry", "time",
    "price", "volume_bs",  # volume_bs 是買賣雙邊都計，實際量要 /2
]


def _cache_path(product: str) -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    return os.path.join(DATA_DIR, f"{product}_1min.parquet")


def download_day(date: dt.date, product: str = DATA_PRODUCT,
                 timeout: int = 30) -> pd.DataFrame:
    """下載某一天的逐筆成交，回傳指定商品(前月)的 1 分K DataFrame。"""
    url = TAIFEX_URL.format(y=date.year, m=date.month, d=date.day)
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        name = zf.namelist()[0]
        raw = zf.read(name)

    # Big5 編碼，第一列是中文表頭 → 跳過，用位置命名
    df = pd.read_csv(
        io.BytesIO(raw), encoding="big5", skiprows=1, header=None,
        usecols=range(len(_RAW_COLS)), names=_RAW_COLS, dtype=str,
    )
    df["product"] = df["product"].str.strip()
    df = df[df["product"] == product].copy()
    if df.empty:
        raise ValueError(f"{date} 找不到商品 {product} 的成交資料")

    # 只取「前月」合約（當天成交量最大的到期月份）
    df["expiry"] = df["expiry"].str.strip()
    front = df.groupby("expiry")["volume_bs"].count().idxmax()
    df = df[df["expiry"] == front].copy()

    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["volume"] = pd.to_numeric(df["volume_bs"], errors="coerce") / 2.0
    df = df.dropna(subset=["price", "time"])

    # 時間欄位可能是 "084501" 或 "84501" 或帶微秒 → 取前 6 碼
    t = df["time"].str.strip().str.zfill(6).str[:6]
    ts = pd.to_datetime(
        date.strftime("%Y-%m-%d") + " " + t, format="%Y-%m-%d %H%M%S",
        errors="coerce",
    )
    df = df.assign(ts=ts).dropna(subset=["ts"]).set_index("ts").sort_index()

    return _aggregate_minute(df)


def _aggregate_minute(tick_df: pd.DataFrame) -> pd.DataFrame:
    """逐筆 → 1 分K OHLCV。"""
    bars = tick_df["price"].resample("1min").ohlc()
    bars["volume"] = tick_df["volume"].resample("1min").sum()
    bars = bars.dropna(subset=["open"])  # 去掉沒有成交的分鐘
    bars.index.name = "ts"
    return bars.reset_index()


_DAY_SESSION_START = dt.time(8, 45)
_DAY_SESSION_END = dt.time(13, 45)

RETRY_ATTEMPTS = 4        # 平日資料不完整時，總共嘗試幾次（含第一次）
RETRY_DELAY_SECONDS = 60  # 每次重試之間等待幾秒
# 連續三個交易日（7/23, 7/24, 7/27）14:00 排程都遇到資料不完整，原本 5 秒的
# 間隔太短、重試 3 次都救不回來，但手動晚一點重跑幾乎每次都能拿到完整資料——
# 代表問題比較像是「這個時間點查詢資料源還沒準備好」，不是單純隨機瑕疵，
# 所以把間隔拉長到 60 秒、多留一次重試機會（同一次執行最多等 3 分鐘）。


def _is_complete(d: dt.date, bars: pd.DataFrame) -> bool:
    """平日下載回來的資料如果完全沒有日盤時段(08:45-13:45)的K，
    多半是資料源當下回傳了不完整的檔案（曾經真的發生過），不是真的休市。
    週末/假日本來就可能沒資料，不當作不完整。"""
    if d.weekday() >= 5:
        return True
    t = pd.to_datetime(bars["ts"]).dt.time
    return ((t >= _DAY_SESSION_START) & (t <= _DAY_SESSION_END)).any()


def _download_with_retry(d: dt.date, product: str) -> pd.DataFrame:
    bars = download_day(d, product)
    attempt = 1
    while not _is_complete(d, bars) and attempt < RETRY_ATTEMPTS:
        attempt += 1
        print(f"  ⚠ {d} 資料看起來不完整（沒有日盤時段的K），"
              f"{RETRY_DELAY_SECONDS} 秒後重試第 {attempt}/{RETRY_ATTEMPTS} 次...")
        time.sleep(RETRY_DELAY_SECONDS)
        bars = download_day(d, product)
    if not _is_complete(d, bars):
        print(f"  ⚠ {d} 重試 {RETRY_ATTEMPTS} 次後仍然沒有日盤時段的K，"
              f"先寫入目前抓到的版本——可能真的是特殊假日，也可能資料源持續異常，"
              f"建議晚點手動重跑 `python -m data.taifex_loader --date {d}` 確認。")
    return bars


def update_cache(dates: list[dt.date], product: str = DATA_PRODUCT) -> pd.DataFrame:
    """下載多天資料並合併進本地 parquet 快取（去重、累積）。"""
    path = _cache_path(product)
    existing = pd.read_parquet(path) if os.path.exists(path) else pd.DataFrame()

    frames = [existing] if not existing.empty else []
    for d in dates:
        try:
            bars = _download_with_retry(d, product)
            frames.append(bars)
            print(f"  ✓ {d} 取得 {len(bars)} 根分K")
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ {d} 略過：{e}")

    if not frames:
        return existing

    merged = (
        pd.concat(frames, ignore_index=True)
        .drop_duplicates(subset="ts")
        .sort_values("ts")
        .reset_index(drop=True)
    )
    merged.to_parquet(path, index=False)
    print(f"快取已更新：{path}（共 {len(merged)} 根分K）")
    return merged


def load_cached_bars(product: str = DATA_PRODUCT) -> pd.DataFrame:
    """讀取本地快取的分K。"""
    path = _cache_path(product)
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"找不到快取 {path}。請先執行 taifex_loader 下載，或用 --demo 產生測試資料。"
        )
    return pd.read_parquet(path)


# --------------------------------------------------------------------------
# Demo 合成資料：讓框架在無網路 / 沒申請資料時也能端對端跑通
# --------------------------------------------------------------------------
def load_demo_bars(days: int = 20, seed: int = 42,
                   base_price: float = 23000.0) -> pd.DataFrame:
    """產生合成的日內 1 分K（僅供測試框架，非真實行情）。"""
    rng = np.random.default_rng(seed)
    all_bars = []
    day = dt.date(2026, 6, 1)
    made = 0
    price = base_price
    while made < days:
        if day.weekday() < 5:  # 只取平日
            minutes = pd.date_range(
                f"{day} 08:45", f"{day} 13:44", freq="1min"
            )
            # 帶輕微趨勢 + 雜訊的隨機漫步
            drift = rng.normal(0, 0.05)
            steps = rng.normal(drift, 3.0, size=len(minutes))
            closes = price + np.cumsum(steps)
            opens = np.concatenate([[closes[0]], closes[:-1]])
            highs = np.maximum(opens, closes) + rng.uniform(0, 4, len(minutes))
            lows = np.minimum(opens, closes) - rng.uniform(0, 4, len(minutes))
            vols = rng.integers(50, 500, len(minutes)).astype(float)
            day_df = pd.DataFrame({
                "ts": minutes,
                "open": np.round(opens),
                "high": np.round(highs),
                "low": np.round(lows),
                "close": np.round(closes),
                "volume": vols,
            })
            all_bars.append(day_df)
            price = closes[-1] + rng.normal(0, 20)  # 隔日跳空
            made += 1
        day += dt.timedelta(days=1)
    return pd.concat(all_bars, ignore_index=True)


def _recent_trading_days(n: int) -> list[dt.date]:
    days, d = [], dt.date.today()
    while len(days) < n:
        d -= dt.timedelta(days=1)
        if d.weekday() < 5:
            days.append(d)
    return sorted(days)


def main():
    ap = argparse.ArgumentParser(description="TAIFEX 逐筆下載 → 1 分K 快取")
    ap.add_argument("--product", default=DATA_PRODUCT, help="商品代號，如 MTX")
    ap.add_argument("--date", help="下載單一日期 YYYY-MM-DD")
    ap.add_argument("--backfill", type=int, help="回補最近 N 個交易日")
    ap.add_argument("--demo", type=int, metavar="DAYS",
                    help="產生 N 天 demo 合成資料寫入快取")
    args = ap.parse_args()

    if args.demo:
        bars = load_demo_bars(days=args.demo)
        os.makedirs(DATA_DIR, exist_ok=True)
        bars.to_parquet(_cache_path(args.product), index=False)
        print(f"已產生 demo 資料 {len(bars)} 根分K → {_cache_path(args.product)}")
        return

    if args.date:
        d = dt.datetime.strptime(args.date, "%Y-%m-%d").date()
        update_cache([d], args.product)
    elif args.backfill:
        update_cache(_recent_trading_days(args.backfill), args.product)
    else:
        ap.error("請指定 --date、--backfill 或 --demo")


if __name__ == "__main__":
    main()
