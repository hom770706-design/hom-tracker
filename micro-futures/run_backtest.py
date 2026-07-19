"""
回測進入點。

範例：
    # 先用 demo 合成資料跑通（無需網路）
    python run_backtest.py --strategy ma_cross --demo 20

    # 用已下載的 TAIFEX 快取資料
    python run_backtest.py --strategy orb
    python run_backtest.py --strategy kd_cross --start 2026-06-01 --end 2026-06-30

    # 一次跑三個策略比較
    python run_backtest.py --strategy all --demo 30
"""

from __future__ import annotations

import argparse

import pandas as pd

from config import BacktestConfig, REPORT_DIR
from data.taifex_loader import load_cached_bars, load_demo_bars
from backtest.engine import BacktestEngine
from backtest.metrics import compute_metrics, format_report, save_report

from strategies.ma_cross import MACrossStrategy
from strategies.kd_cross import KDCrossStrategy
from strategies.orb import ORBStrategy

STRATEGIES = {
    "ma_cross": MACrossStrategy,
    "kd_cross": KDCrossStrategy,
    "orb": ORBStrategy,
}


def load_data(args, cfg) -> pd.DataFrame:
    if args.demo:
        print(f"使用 demo 合成資料（{args.demo} 天）—— 僅供測試框架，非真實行情。")
        df = load_demo_bars(days=args.demo)
    else:
        df = load_cached_bars(cfg.data_product)
        print(f"讀取快取分K：{len(df)} 根")

    if args.start:
        df = df[pd.to_datetime(df["ts"]) >= pd.Timestamp(args.start)]
    if args.end:
        df = df[pd.to_datetime(df["ts"]) <= pd.Timestamp(args.end) + pd.Timedelta(days=1)]
    return df.reset_index(drop=True)


def run_one(name: str, df: pd.DataFrame, cfg: BacktestConfig):
    strat = STRATEGIES[name]()
    prepared = strat.prepare(df)
    result = BacktestEngine(cfg).run(prepared, strat)
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
    ap.add_argument("--start", help="起始日 YYYY-MM-DD")
    ap.add_argument("--end", help="結束日 YYYY-MM-DD")
    ap.add_argument("--sl", type=float, help="停損點數（覆寫預設）")
    ap.add_argument("--tp", type=float, help="停利點數（覆寫預設）")
    ap.add_argument("--lots", type=int, help="每次口數（覆寫預設）")
    args = ap.parse_args()

    cfg = BacktestConfig()
    if args.sl is not None:
        cfg.stop_loss_points = args.sl
    if args.tp is not None:
        cfg.take_profit_points = args.tp
    if args.lots is not None:
        cfg.lots = args.lots

    df = load_data(args, cfg)

    names = list(STRATEGIES) if args.strategy == "all" else [args.strategy]
    for name in names:
        run_one(name, df, cfg)


if __name__ == "__main__":
    main()
