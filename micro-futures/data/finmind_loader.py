"""
輔助資料層：FinMind 免費版（日K、三大法人籌碼）。

免費版沒有期貨『分K』，只有日K —— 分K請用 taifex_loader。
這裡的資料適合拿來做『過濾條件』，例如：只在三大法人偏多的日子做多。

需在環境變數設定 FINMIND_TOKEN（.env 亦可），沒 token 也能用但額度較低。
"""

from __future__ import annotations

import os

import pandas as pd
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # noqa: BLE001
    pass

BASE_URL = "https://api.finmindtrade.com/api/v4/data"


def _fetch(dataset: str, params: dict) -> pd.DataFrame:
    token = os.environ.get("FINMIND_TOKEN", "")
    query = {"dataset": dataset, **params}
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.get(BASE_URL, params=query, headers=headers, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("status") != 200:
        raise RuntimeError(payload.get("msg", "FinMind error"))
    return pd.DataFrame(payload["data"])


def futures_daily(data_id: str = "MTX", start_date: str = "2020-01-01") -> pd.DataFrame:
    """期貨日K（免費）。"""
    return _fetch("TaiwanFuturesDaily", {"data_id": data_id, "start_date": start_date})


def institutional_futures(data_id: str = "TX",
                          start_date: str = "2020-01-01") -> pd.DataFrame:
    """期貨三大法人買賣/未平倉（免費），可作為策略過濾條件。"""
    return _fetch("TaiwanFuturesInstitutionalInvestors",
                  {"data_id": data_id, "start_date": start_date})


# --------------------------------------------------------------------------
# 籌碼過濾：把外資期貨未平倉淨額轉成每日「方向偏好」(bias)
#   bias = +1 → 當天只做多；-1 → 只做空；0 → 多空皆可
# --------------------------------------------------------------------------
def foreign_oi_bias(data_id: str = "TX", start_date: str = "2020-01-01") -> dict:
    """
    以『外資期貨未平倉淨額』的正負，決定每個交易日的方向偏好。

    重要（避免未來函數）：期交所籌碼是每天收盤後才公布，
    所以『第 D 天要用的 bias』是用『第 D-1 天的籌碼』算出來的 → 這裡做 shift(1)。
    回傳 {date(datetime.date): +1/-1/0}。
    """
    df = institutional_futures(data_id, start_date)
    if df.empty:
        return {}

    # 只留外資（欄位名稱可能是 institutional_investors 或 name）
    name_col = "institutional_investors" if "institutional_investors" in df.columns else "name"
    foreign = df[df[name_col].astype(str).str.contains("外資")].copy()
    if foreign.empty:
        return {}

    # 優先用『未平倉餘額』欄位，沒有就退回用『買賣淨額』
    long_col = _first_present(foreign, [
        "long_open_interest_balance_volume", "long_open_interest_balance",
    ])
    short_col = _first_present(foreign, [
        "short_open_interest_balance_volume", "short_open_interest_balance",
    ])
    if long_col and short_col:
        foreign["net"] = foreign[long_col] - foreign[short_col]
    else:
        lc = _first_present(foreign, ["long_deal_volume"])
        sc = _first_present(foreign, ["short_deal_volume"])
        foreign["net"] = foreign[lc] - foreign[sc]

    daily = (foreign.groupby("date")["net"].sum().sort_index())
    bias = daily.apply(lambda v: 1 if v > 0 else (-1 if v < 0 else 0))
    bias = bias.shift(1).dropna()  # 用前一日籌碼 → 隔日才可用

    out = {}
    for d, b in bias.items():
        out[pd.Timestamp(d).date()] = int(b)
    return out


def _first_present(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def demo_bias(bars: pd.DataFrame, seed: int = 7) -> dict:
    """測試用：對每個交易日隨機給一個 bias（僅供驗證過濾機制，非真實籌碼）。"""
    import numpy as np
    rng = np.random.default_rng(seed)
    dates = sorted(pd.to_datetime(bars["ts"]).dt.date.unique())
    return {d: int(rng.choice([-1, 1])) for d in dates}
