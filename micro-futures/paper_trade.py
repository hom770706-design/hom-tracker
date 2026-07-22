"""
純邏輯模擬盤（不接真實券商，第二階段元大介面之前的過渡方案）。

不連線下單、不需要元大帳號。做法是：把「已經確定選用的策略參數」
套在『目前為止收到的所有真實分K』上，只針對還沒記錄過的交易時段產生
訊號/出場結果，寫進一份持續累積的模擬交易記錄，藉此觀察這組參數在
之後陸續進來的新資料（真正的樣本外資料）上是否還站得住腳。

四條獨立的模擬盤記錄：
    python paper_trade.py --session day                    # 純 ORB 日盤，opening_minutes=5,  SL50/TP60
    python paper_trade.py --session night                  # 純 ORB 夜盤，opening_minutes=60, SL40/TP60
    python paper_trade.py --session day --variant combo     # ORB(開盤)+ma_cross(盤中) 日盤，SL50/TP60
    python paper_trade.py --session day --variant chip      # ORB 日盤 + 小台(MTX)外資籌碼濾網，SL50/TP60

chip 變體需要連網抓 FinMind 籌碼資料（見 data/finmind_loader.py），抓不到就跳過
濾網、當作沒有籌碼資料可用，不會中斷整個流程。

每日流程（建議排 Windows 工作排程器，收盤後執行）：
    python -m data.taifex_loader --date YYYY-MM-DD   # 先把當天真實成交更新進快取
    python paper_trade.py --session day
    python paper_trade.py --session night
    python paper_trade.py --session day --variant combo
    python paper_trade.py --session day --variant chip

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
from strategies.combo import ComboStrategy
from strategies.ma_cross import MACrossStrategy
from strategies.kd_cross import KDCrossStrategy
from strategies.bollinger import BollingerStrategy
from strategies.macd_cross import MACDStrategy
from strategies.rsi_reversal import RSIReversalStrategy

SECONDARY_STRATEGIES = {
    "ma_cross": MACrossStrategy,
    "kd_cross": KDCrossStrategy,
    "bollinger": BollingerStrategy,
    "macd": MACDStrategy,
    "rsi": RSIReversalStrategy,
}

# 來自 optimize.py / optimize_postopen.py 在修正日/夜盤跨夜分組後重新搜尋的結果。
VARIANT_DEFAULTS = {
    ("day", "orb"): {
        "opening_minutes": 5, "sl": 50.0, "tp": 60.0,
    },
    ("night", "orb"): {
        "opening_minutes": 60, "sl": 40.0, "tp": 60.0,
    },
    ("day", "combo"): {
        "opening_minutes": 5, "sl": 50.0, "tp": 60.0,
        "secondary": "ma_cross", "secondary_params": {"fast": 8, "slow": 50},
    },
    ("day", "chip"): {
        "opening_minutes": 5, "sl": 50.0, "tp": 60.0,
        "chip_product": "MTX",
    },
}

# 籌碼資料抓多久以前的（要涵蓋所有分K資料的起始日，並留一點緩衝）。
CHIP_START_DATE = "2026-05-01"


def log_path(session: str, variant: str) -> str:
    tag = session if variant == "orb" else f"{session}_{variant}"
    return os.path.join(REPORT_DIR, f"paper_trades_orb_{tag}.csv")


def load_log(path: str) -> pd.DataFrame:
    if os.path.exists(path):
        log = pd.read_csv(path, parse_dates=["entry_ts", "exit_ts"])
        # CSV 讀回來的 date 欄位是字串，要轉回 date 物件才能跟
        # filter_session() 產生的 session_date 正確比對。
        log["date"] = pd.to_datetime(log["date"]).dt.date
        return log
    return pd.DataFrame()


def build_strategy(session: str, variant: str, opening_minutes: int, d: dict):
    if variant == "orb":
        return ORBStrategy(opening_minutes=opening_minutes)
    if variant == "chip":
        strat = ORBStrategy(opening_minutes=opening_minutes)
        strat.name = f"orb+{d['chip_product'].lower()}chip"
        return strat
    secondary_cls = SECONDARY_STRATEGIES[d["secondary"]]
    secondary = secondary_cls(**d["secondary_params"])
    return ComboStrategy(opening_minutes=opening_minutes, secondary=secondary,
                         secondary_name=d["secondary"])


def main():
    ap = argparse.ArgumentParser(description="ORB / 組合策略純邏輯模擬盤（分時段+分策略各自記錄，不接真實券商）")
    ap.add_argument("--session", choices=list(SESSION_TIMES), default="day",
                    help="交易時段：day=日盤，night=夜盤（預設 day）")
    ap.add_argument("--variant", choices=["orb", "combo", "chip"], default="orb",
                    help="orb=純開盤突破，combo=開盤 ORB + 盤中另一策略，"
                         "chip=ORB + 外資籌碼方向濾網（目前僅日盤支援）")
    ap.add_argument("--opening-minutes", type=int, default=None,
                    help="開盤區間分鐘數（預設依組合套用優化結果）")
    ap.add_argument("--sl", type=float, default=None, help="停損點數（預設依組合套用優化結果）")
    ap.add_argument("--tp", type=float, default=None, help="停利點數（預設依組合套用優化結果）")
    args = ap.parse_args()

    key = (args.session, args.variant)
    if key not in VARIANT_DEFAULTS:
        ap.error(f"目前不支援 --session {args.session} --variant {args.variant} 這個組合")
    d = VARIANT_DEFAULTS[key]

    opening_minutes = args.opening_minutes if args.opening_minutes is not None else d["opening_minutes"]
    sl = args.sl if args.sl is not None else d["sl"]
    tp = args.tp if args.tp is not None else d["tp"]

    st = SESSION_TIMES[args.session]
    cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp,
                         session_start=st["start"], entry_cutoff=st["cutoff"],
                         session_close=st["close"])
    strat = build_strategy(args.session, args.variant, opening_minutes, d)
    tag = f"[{args.session}/{args.variant}]"
    path = log_path(args.session, args.variant)

    bias = None
    if args.variant == "chip":
        try:
            from data.finmind_loader import foreign_oi_bias
            bias = foreign_oi_bias(d["chip_product"], start_date=CHIP_START_DATE)
            print(f"{tag} 抓到 {d['chip_product']} 外資籌碼 {len(bias)} 天")
        except Exception as e:  # noqa: BLE001
            print(f"{tag} 籌碼資料抓取失敗（{e}），這次先不套用濾網")
            bias = None

    raw = load_cached_bars(cfg.data_product)
    df = filter_session(raw, args.session)

    log = load_log(path)
    logged_dates = set(log["date"]) if not log.empty else set()

    new_df = df[~df["date"].isin(logged_dates)]

    if new_df.empty:
        print(f"{tag} 沒有新的交易時段需要記錄（快取資料都已經記錄過了，先去跑 taifex_loader 更新資料）。")
    else:
        new_dates = sorted(new_df["date"].unique())
        print(f"{tag} 發現 {len(new_dates)} 個尚未記錄的交易時段：{new_dates[0]} ~ {new_dates[-1]}")

        prepared = strat.prepare(new_df)
        result = BacktestEngine(cfg).run(prepared, strat, daily_bias=bias)

        if result.trades.empty:
            print(f"{tag} 這些新交易時段裡沒有觸發任何訊號，沒有新增記錄。")
        else:
            combined = (pd.concat([log, result.trades], ignore_index=True)
                        if not log.empty else result.trades)
            os.makedirs(REPORT_DIR, exist_ok=True)
            combined.to_csv(path, index=False, encoding="utf-8-sig")
            print(f"{tag} 新增 {len(result.trades)} 筆模擬交易，已寫入：{path}")

    log = load_log(path)
    if log.empty:
        print(f"{tag} 目前累積 0 筆模擬交易。")
        return

    daily = log.groupby("date")["net_pnl"].sum().rename("pnl").reset_index()
    daily["equity"] = daily["pnl"].cumsum()
    cumulative = BacktestResult(log, daily, cfg)
    metrics = compute_metrics(cumulative)
    print("\n" + format_report(metrics, f"{strat.name} ({args.session}, paper / forward log 累積至今)", cfg))


if __name__ == "__main__":
    main()
