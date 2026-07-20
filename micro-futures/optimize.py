"""
參數優化：在既有的 30 個交易日真實資料上，掃過三個策略的參數組合，
找出淨損益/獲利因子較好的設定。

注意：樣本只有 27 個交易日、每組合可能只有 10~40 筆交易，
統計上非常容易「過擬合」——這裡選出的最佳參數不保證未來有效，
只能當作進一步觀察/前進測試(forward test)的候選，不是可以直接實單的結論。

用法：
    python optimize.py                  # 日盤（預設）
    python optimize.py --session night  # 夜盤
"""

from __future__ import annotations

import argparse
import itertools

import pandas as pd

from config import BacktestConfig, SESSION_TIMES, REPORT_DIR
from data.taifex_loader import load_cached_bars
from data.sessions import filter_session
from backtest.engine import BacktestEngine
from backtest.metrics import compute_metrics

from strategies.ma_cross import MACrossStrategy
from strategies.kd_cross import KDCrossStrategy
from strategies.orb import ORBStrategy

MIN_TRADES = 10  # 交易次數太少的組合統計上不可靠，直接排除


def _run(strategy, df: pd.DataFrame, cfg: BacktestConfig) -> dict:
    prepared = strategy.prepare(df)
    result = BacktestEngine(cfg).run(prepared, strategy)
    return compute_metrics(result)


def _row(strategy_name: str, param_desc: str, cfg: BacktestConfig, m: dict) -> dict | None:
    if m.get("trades", 0) < MIN_TRADES:
        return None
    return {
        "strategy": strategy_name,
        "params": param_desc,
        "sl": cfg.stop_loss_points,
        "tp": cfg.take_profit_points,
        "trades": m["trades"],
        "win_rate": m["win_rate"],
        "profit_factor": m["profit_factor"],
        "total_net_pnl": m["total_net_pnl"],
        "max_drawdown": m["max_drawdown"],
        "sharpe": m["sharpe"],
    }


def sweep_ma_cross(df, sl_tp_grid, session_times: dict) -> list[dict]:
    rows = []
    fasts = [3, 5, 8, 13]
    slows = [15, 20, 34, 50]
    for fast, slow in itertools.product(fasts, slows):
        if slow - fast < 5:
            continue
        strat = MACrossStrategy(fast=fast, slow=slow)
        for sl, tp in sl_tp_grid:
            cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp, **session_times)
            m = _run(strat, df, cfg)
            row = _row("ma_cross", f"fast={fast},slow={slow}", cfg, m)
            if row:
                rows.append(row)
    return rows


def sweep_kd_cross(df, sl_tp_grid, session_times: dict) -> list[dict]:
    rows = []
    periods = [9, 14, 21]
    smooths = [3, 5]
    bands = [(20, 80), (30, 70)]
    for period, smooth, (os_, ob) in itertools.product(periods, smooths, bands):
        strat = KDCrossStrategy(period=period, smooth=smooth, oversold=os_, overbought=ob)
        for sl, tp in sl_tp_grid:
            cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp, **session_times)
            m = _run(strat, df, cfg)
            row = _row("kd_cross", f"period={period},smooth={smooth},os={os_},ob={ob}", cfg, m)
            if row:
                rows.append(row)
    return rows


def sweep_orb(df, sl_tp_grid, session_times: dict) -> list[dict]:
    rows = []
    for minutes in [5, 15, 30, 45, 60, 90]:
        strat = ORBStrategy(opening_minutes=minutes)
        for sl, tp in sl_tp_grid:
            cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp, **session_times)
            m = _run(strat, df, cfg)
            row = _row("orb", f"opening_minutes={minutes}", cfg, m)
            if row:
                rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser(description="策略參數優化（日盤/夜盤分開跑）")
    ap.add_argument("--session", choices=list(SESSION_TIMES), default="day",
                    help="交易時段：day=日盤，night=夜盤（預設 day）")
    args = ap.parse_args()

    session_times = {
        "session_start": SESSION_TIMES[args.session]["start"],
        "entry_cutoff": SESSION_TIMES[args.session]["cutoff"],
        "session_close": SESSION_TIMES[args.session]["close"],
    }

    cfg0 = BacktestConfig(**session_times)
    raw = load_cached_bars(cfg0.data_product)
    df = filter_session(raw, args.session)
    n_days = pd.to_datetime(df["ts"]).dt.date.nunique()
    print(f"讀取快取分K：{len(raw)} 根 → 過濾為「{args.session}」時段：{len(df)} 根，共 {n_days} 個交易時段")

    sl_tp_grid = [
        (sl, tp)
        for sl in (15, 20, 30, 40, 50)
        for tp in (30, 45, 60, 80, 100)
        if tp >= sl
    ]

    rows: list[dict] = []
    rows += sweep_ma_cross(df, sl_tp_grid, session_times)
    rows += sweep_kd_cross(df, sl_tp_grid, session_times)
    rows += sweep_orb(df, sl_tp_grid, session_times)

    if not rows:
        print(f"沒有任何組合達到最少交易次數門檻（{MIN_TRADES} 筆），資料量可能太少。")
        return

    result = pd.DataFrame(rows).sort_values("total_net_pnl", ascending=False)
    out_path = f"{REPORT_DIR}/optimize_results_{args.session}.csv"
    result.to_csv(out_path, index=False, encoding="utf-8-sig")

    pd.set_option("display.width", 160)
    pd.set_option("display.max_columns", 20)

    print(f"\n共測試 {len(result)} 組合（已排除交易次數 < {MIN_TRADES} 的組合）")
    print(f"完整結果已輸出至：{out_path}\n")

    print("=" * 100)
    print(" 全部策略 綜合排名前 10（依總淨損益）")
    print("=" * 100)
    print(result.head(10).to_string(index=False, formatters={
        "win_rate": "{:.1%}".format,
        "profit_factor": "{:.2f}".format,
        "total_net_pnl": "{:,.0f}".format,
        "max_drawdown": "{:,.0f}".format,
        "sharpe": "{:.2f}".format,
    }))

    for name in ("ma_cross", "kd_cross", "orb"):
        sub = result[result["strategy"] == name].head(5)
        if sub.empty:
            print(f"\n[{name}] 沒有組合達到最少交易次數門檻")
            continue
        print(f"\n[{name}] 前 5 名：")
        print(sub.to_string(index=False, formatters={
            "win_rate": "{:.1%}".format,
            "profit_factor": "{:.2f}".format,
            "total_net_pnl": "{:,.0f}".format,
            "max_drawdown": "{:,.0f}".format,
            "sharpe": "{:.2f}".format,
        }))

    print(
        "\n提醒：以上是在同一段 27 天資料上做參數搜尋的結果，"
        "組合數一多很容易『挑到剛好適合這段歷史』的參數（overfitting）。"
        "建議把排名前幾名的參數留到之後新資料上做前進測試(forward test)，"
        "而不是直接拿來實單。"
    )


if __name__ == "__main__":
    main()
