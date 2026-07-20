"""
回測進入點。

範例：
    # 先用 demo 合成資料跑通（無需網路）
    python run_backtest.py --strategy all --demo 20

    # 用已下載的 TAIFEX 快取資料
    python run_backtest.py --strategy orb
    python run_backtest.py --strategy macd --start 2026-06-01 --end 2026-06-30

    # 加上「籌碼過濾」（順著外資期貨未平倉方向才做）
    python run_backtest.py --strategy orb --chip-filter

    # 一次跑全部策略比較
    python run_backtest.py --strategy all --demo 30
"""

from __future__ import annotations

import argparse

import pandas as pd

from config import BacktestConfig, SESSION_TIMES, REPORT_DIR
from data.taifex_loader import load_cached_bars, load_demo_bars
from data.sessions import filter_session
from backtest.engine import BacktestEngine
from backtest.metrics import compute_metrics, format_report, save_report

from strategies.ma_cross import MACrossStrategy
from strategies.kd_cross import KDCrossStrategy
from strategies.orb import ORBStrategy
from strategies.bollinger import BollingerStrategy
from strategies.macd_cross import MACDStrategy
from strategies.rsi_reversal import RSIReversalStrategy

STRATEGIES = {
    "ma_cross": MACrossStrategy,
    "kd_cross": KDCrossStrategy,
    "orb": ORBStrategy,
    "bollinger": BollingerStrategy,
    "macd": MACDStrategy,
    "rsi": RSIReversalStrategy,
}


def load_data(args, cfg) -> pd.DataFrame:
    if args.demo:
        print(f"使用 demo 合成資料（{args.demo} 天）—— 僅供測試框架，非真實行情。")
        df = load_demo_bars(days=args.demo)
    else:
        df = load_cached_bars(cfg.data_product)
        print(f"讀取快取分K：{len(df)} 根")

    df = df.copy()
    df["ts"] = pd.to_datetime(df["ts"])

    # 只留選定的時段（日盤 08:45-13:45 或夜盤 15:00-翌日05:00）。
    # 夜盤跨過午夜，filter_session 會把跨夜的資料正確歸回同一個交易時段，
    # 而不是被日曆日期切斷（見 data/sessions.py 的說明）。
    n_before = len(df)
    df = filter_session(df, args.session)
    if len(df) < n_before:
        print(f"已過濾為「{args.session}」時段：{n_before} 根 → {len(df)} 根")

    if args.start:
        df = df[df["ts"] >= pd.Timestamp(args.start)]
    if args.end:
        df = df[df["ts"] <= pd.Timestamp(args.end) + pd.Timedelta(days=1)]
    return df.reset_index(drop=True)


def build_bias(args, df, cfg) -> dict | None:
    if not args.chip_filter:
        return None
    if args.demo:
        from data.finmind_loader import demo_bias
        print("籌碼過濾：使用 demo 隨機 bias（非真實籌碼，僅測試機制）")
        return demo_bias(df)
    # 真實資料：抓外資期貨未平倉，建當日方向偏好
    from data.finmind_loader import foreign_oi_bias
    start = df["ts"].min().strftime("%Y-%m-%d")
    print("籌碼過濾：抓 FinMind 外資期貨未平倉 → 建立每日方向偏好")
    bias = foreign_oi_bias(data_id="TX", start_date=start)
    print(f"  取得 {len(bias)} 天籌碼方向")
    return bias


def run_one(name: str, df: pd.DataFrame, cfg: BacktestConfig, bias):
    strat = STRATEGIES[name]()
    prepared = strat.prepare(df)
    result = BacktestEngine(cfg).run(prepared, strat, daily_bias=bias)
    metrics = compute_metrics(result)
    print("\n" + format_report(metrics, name, cfg))
    save_report(result, name, REPORT_DIR)
    return metrics


def main():
    ap = argparse.ArgumentParser(description="微台日內當沖回測")
    ap.add_argument("--strategy", default="all",
                    choices=list(STRATEGIES) + ["all"])
    ap.add_argument("--demo", type=int, metavar="DAYS",
                    help="用 N 天 demo 合成資料（無需網路）")
    ap.add_argument("--chip-filter", action="store_true",
                    help="開啟籌碼過濾（順著外資期貨未平倉方向才進場）")
    ap.add_argument("--session", choices=list(SESSION_TIMES), default="day",
                    help="交易時段：day=日盤 08:45-13:45，night=夜盤 15:00-翌日05:00（預設 day）")
    ap.add_argument("--start", help="起始日 YYYY-MM-DD")
    ap.add_argument("--end", help="結束日 YYYY-MM-DD")
    ap.add_argument("--sl", type=float, help="停損點數（覆寫預設）")
    ap.add_argument("--tp", type=float, help="停利點數（覆寫預設）")
    ap.add_argument("--lots", type=int, help="每次口數（覆寫預設）")
    args = ap.parse_args()

    st = SESSION_TIMES[args.session]
    cfg = BacktestConfig(session_start=st["start"],
                         entry_cutoff=st["cutoff"],
                         session_close=st["close"])
    if args.sl is not None:
        cfg.stop_loss_points = args.sl
    if args.tp is not None:
        cfg.take_profit_points = args.tp
    if args.lots is not None:
        cfg.lots = args.lots

    df = load_data(args, cfg)
    bias = build_bias(args, df, cfg)

    names = list(STRATEGIES) if args.strategy == "all" else [args.strategy]
    for name in names:
        run_one(name, df, cfg, bias)


if __name__ == "__main__":
    main()
