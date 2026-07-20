"""
純邏輯模擬盤（不接真實券商，第二階段元大介面之前的過渡方案）。

不連線下單、不需要元大帳號。做法是：把「已經確定選用的策略參數」
套在『目前為止收到的所有真實分K』上，只針對還沒記錄過的交易時段產生
訊號/出場結果，寫進一份持續累積的模擬交易記錄，藉此觀察這組參數在
之後陸續進來的新資料（真正的樣本外資料）上是否還站得住腳。

日盤、夜盤是分開的兩個 ORB 模擬盤（策略、時段不同，各自維護一份記錄）：
    python paper_trade.py --session day     # opening_minutes=5,  SL50/TP60
    python paper_trade.py --session night   # opening_minutes=60, SL40/TP60

每日流程（建議排 Windows 工作排程器，收盤後執行）：
    python -m data.taifex_loader --date YYYY-MM-DD   # 先把當天真實成交更新進快取
    python paper_trade.py --session day
    python paper_trade.py --session night

第一次執行時，快取裡原本就有的歷史資料會被當成起始基準一次寫入記錄；
之後每次執行只會處理「新出現、還沒記錄過」的交易時段。
"""

from __future__ import annotations

import argparse
import os

import pandas as pd

from config import BacktestConfig, SESSION_TIMES, REPORT_DIR
from data.taifex_loader import load_cached_bars
from data.sessions import filter_session
from backtest.engine import BacktestEngine, BacktestResult
from backtest.metrics import compute_metrics, format_report
from strategies.orb import ORBStrategy

# 來自 optimize.py 在修正日/夜盤跨夜分組後重新搜尋的結果。
DEFAULTS = {
    "day":   {"opening_minutes": 5,  "sl": 50.0, "tp": 60.0},
    "night": {"opening_minutes": 60, "sl": 40.0, "tp": 60.0},
}


def log_path(session: str) -> str:
    return os.path.join(REPORT_DIR, f"paper_trades_orb_{session}.csv")


def load_log(path: str) -> pd.DataFrame:
    if os.path.exists(path):
        log = pd.read_csv(path, parse_dates=["entry_ts", "exit_ts"])
        # CSV 讀回來的 date 欄位是字串，要轉回 date 物件才能跟
        # filter_session() 產生的 session_date 正確比對。
        log["date"] = pd.to_datetime(log["date"]).dt.date
        return log
    return pd.DataFrame()


def main():
    ap = argparse.ArgumentParser(description="ORB 純邏輯模擬盤（日盤/夜盤分開記錄，不接真實券商）")
    ap.add_argument("--session", choices=list(SESSION_TIMES), default="day",
                    help="交易時段：day=日盤，night=夜盤（預設 day）")
    ap.add_argument("--opening-minutes", type=int, default=None,
                    help="開盤區間分鐘數（預設依時段套用優化結果）")
    ap.add_argument("--sl", type=float, default=None, help="停損點數（預設依時段套用優化結果）")
    ap.add_argument("--tp", type=float, default=None, help="停利點數（預設依時段套用優化結果）")
    args = ap.parse_args()

    d = DEFAULTS[args.session]
    opening_minutes = args.opening_minutes if args.opening_minutes is not None else d["opening_minutes"]
    sl = args.sl if args.sl is not None else d["sl"]
    tp = args.tp if args.tp is not None else d["tp"]

    st = SESSION_TIMES[args.session]
    cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp,
                         session_start=st["start"], entry_cutoff=st["cutoff"],
                         session_close=st["close"])
    strat = ORBStrategy(opening_minutes=opening_minutes)
    path = log_path(args.session)

    raw = load_cached_bars(cfg.data_product)
    df = filter_session(raw, args.session)

    log = load_log(path)
    logged_dates = set(log["date"]) if not log.empty else set()

    new_df = df[~df["date"].isin(logged_dates)]

    if new_df.empty:
        print(f"[{args.session}] 沒有新的交易時段需要記錄（快取資料都已經記錄過了，先去跑 taifex_loader 更新資料）。")
    else:
        new_dates = sorted(new_df["date"].unique())
        print(f"[{args.session}] 發現 {len(new_dates)} 個尚未記錄的交易時段：{new_dates[0]} ~ {new_dates[-1]}")

        prepared = strat.prepare(new_df)
        result = BacktestEngine(cfg).run(prepared, strat)

        if result.trades.empty:
            print(f"[{args.session}] 這些新交易時段裡沒有觸發任何訊號，沒有新增記錄。")
        else:
            combined = (pd.concat([log, result.trades], ignore_index=True)
                        if not log.empty else result.trades)
            os.makedirs(REPORT_DIR, exist_ok=True)
            combined.to_csv(path, index=False, encoding="utf-8-sig")
            print(f"[{args.session}] 新增 {len(result.trades)} 筆模擬交易，已寫入：{path}")

    log = load_log(path)
    if log.empty:
        print(f"[{args.session}] 目前累積 0 筆模擬交易。")
        return

    daily = log.groupby("date")["net_pnl"].sum().rename("pnl").reset_index()
    daily["equity"] = daily["pnl"].cumsum()
    cumulative = BacktestResult(log, daily, cfg)
    metrics = compute_metrics(cumulative)
    print("\n" + format_report(metrics, f"orb-{args.session} (paper / forward log 累積至今)", cfg))


if __name__ == "__main__":
    main()
