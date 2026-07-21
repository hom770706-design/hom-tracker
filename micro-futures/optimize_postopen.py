"""
探索：開盤區間交給 ORB 顧（維持現行單次進場），開盤區間『結束之後』的
時間換另一個策略接手，勝率/風險特性會不會比單用 ORB 好。

作法：
1. 對 ma_cross / kd_cross / bollinger / macd / rsi 五個策略掃參數，
   但訊號只在『ORB 開盤區間結束之後』才算數（區間內訊號直接清成 0），
   日盤、夜盤分開跑，找出「盤中時段」單獨表現最好的策略+參數。
2. 把 ORB 的訊號（只在開盤區間附近觸發，維持原樣）跟上面選出的
   最佳「盤中策略」訊號合併成同一條 signal（ORB 優先），
   丟進同一顆引擎跑一次完整回測，跟純 ORB 比較。

用法：
    python optimize_postopen.py --session day
    python optimize_postopen.py --session night
"""

from __future__ import annotations

import argparse
import itertools

import pandas as pd

from config import BacktestConfig, SESSION_TIMES, REPORT_DIR
from data.taifex_loader import load_cached_bars
from data.sessions import filter_session
from backtest.engine import BacktestEngine
from backtest.metrics import compute_metrics, format_report

from strategies.orb import ORBStrategy
from strategies.ma_cross import MACrossStrategy
from strategies.kd_cross import KDCrossStrategy
from strategies.bollinger import BollingerStrategy
from strategies.macd_cross import MACDStrategy
from strategies.rsi_reversal import RSIReversalStrategy

MIN_TRADES = 10

# 跟 ORB 開盤區間一致，兩個時段的「開盤區間結束時間」（分鐘，from session open）
OPENING_MINUTES = {"day": 5, "night": 60}


def mask_before_open_end(prepared: pd.DataFrame, session_start: str, opening_minutes: int) -> pd.DataFrame:
    """把開盤區間內的訊號清成 0，只留區間結束之後的訊號。"""
    prepared = prepared.copy()
    h, m = session_start.split(":")
    start_min = int(h) * 60 + int(m)

    def _minutes(ts) -> int:
        t = ts.time()
        mins = t.hour * 60 + t.minute - start_min
        return mins if mins >= 0 else mins + 24 * 60

    elapsed = prepared["ts"].apply(_minutes)
    prepared.loc[elapsed < opening_minutes, "signal"] = 0
    return prepared


def sweep(name, strat_factory, param_grid, df, sl_tp_grid, cfg_base, session_start, opening_minutes):
    rows = []
    for params in param_grid:
        strat = strat_factory(**params)
        prepared = strat.prepare(df)
        prepared = mask_before_open_end(prepared, session_start, opening_minutes)
        for sl, tp in sl_tp_grid:
            cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp, **cfg_base)
            result = BacktestEngine(cfg).run(prepared, strat)
            m = compute_metrics(result)
            if m.get("trades", 0) < MIN_TRADES:
                continue
            rows.append({
                "strategy": name, "params": str(params), "sl": sl, "tp": tp,
                "trades": m["trades"], "win_rate": m["win_rate"],
                "profit_factor": m["profit_factor"], "total_net_pnl": m["total_net_pnl"],
                "max_drawdown": m["max_drawdown"], "sharpe": m["sharpe"],
            })
    return rows


def param_grids():
    ma = [{"fast": f, "slow": s} for f, s in itertools.product([3, 5, 8, 13], [15, 20, 34, 50]) if s - f >= 5]
    kd = [{"period": p, "smooth": sm, "oversold": os_, "overbought": ob}
          for p, sm, (os_, ob) in itertools.product([9, 14, 21], [3, 5], [(20, 80), (30, 70)])]
    bb = [{"period": p, "num_std": n} for p, n in itertools.product([10, 20, 30], [1.5, 2.0, 2.5])]
    macd = [{"fast": f, "slow": s, "signal": sig}
            for f, s, sig in itertools.product([8, 12], [21, 26], [5, 9])]
    rsi = [{"period": p, "oversold": os_, "overbought": ob}
           for p, (os_, ob) in itertools.product([7, 14, 21], [(20, 80), (30, 70)])]
    return {
        "ma_cross": (MACrossStrategy, ma),
        "kd_cross": (KDCrossStrategy, kd),
        "bollinger": (BollingerStrategy, bb),
        "macd": (MACDStrategy, macd),
        "rsi": (RSIReversalStrategy, rsi),
    }


def main():
    ap = argparse.ArgumentParser(description="盤中（開盤區間之後）策略搜尋，準備跟 ORB 搭配")
    ap.add_argument("--session", choices=list(SESSION_TIMES), default="day")
    args = ap.parse_args()

    st = SESSION_TIMES[args.session]
    cfg_base = {"session_start": st["start"], "entry_cutoff": st["cutoff"], "session_close": st["close"]}
    opening_minutes = OPENING_MINUTES[args.session]

    raw = load_cached_bars(BacktestConfig().data_product)
    df = filter_session(raw, args.session)
    n_days = df["date"].nunique()
    print(f"[{args.session}] 資料：{len(df)} 根，共 {n_days} 個交易時段；開盤區間結束＝開盤後 {opening_minutes} 分鐘")

    sl_tp_grid = [(sl, tp) for sl in (15, 20, 30, 40, 50) for tp in (30, 45, 60, 80, 100) if tp >= sl]

    all_rows = []
    for name, (factory, grid) in param_grids().items():
        rows = sweep(name, factory, grid, df, sl_tp_grid, cfg_base, st["start"], opening_minutes)
        all_rows += rows
        print(f"  {name}: {len(rows)} 組合達門檻")

    if not all_rows:
        print("沒有任何組合達到最少交易門檻。")
        return

    result = pd.DataFrame(all_rows).sort_values("total_net_pnl", ascending=False)
    out_path = f"{REPORT_DIR}/optimize_postopen_{args.session}.csv"
    result.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"\n完整結果：{out_path}")

    pd.set_option("display.width", 160)
    print(f"\n===== [{args.session}] 盤中策略排名前 10（依淨損益，僅開盤區間之後的訊號）=====")
    print(result.head(10).to_string(index=False, formatters={
        "win_rate": "{:.1%}".format, "profit_factor": "{:.2f}".format,
        "total_net_pnl": "{:,.0f}".format, "max_drawdown": "{:,.0f}".format, "sharpe": "{:.2f}".format,
    }))
    for name in param_grids():
        sub = result[result["strategy"] == name].head(3)
        if sub.empty:
            continue
        print(f"\n[{name}] 前 3 名：")
        print(sub.to_string(index=False, formatters={
            "win_rate": "{:.1%}".format, "profit_factor": "{:.2f}".format,
            "total_net_pnl": "{:,.0f}".format, "max_drawdown": "{:,.0f}".format, "sharpe": "{:.2f}".format,
        }))

    # ---- 組合最佳盤中策略（僅用它的指標參數）+ ORB，統一重新搜一次 SL/TP ----
    best = result.iloc[0]
    factory, _ = param_grids()[best["strategy"]]
    import ast
    best_params = ast.literal_eval(best["params"])
    print(f"\n===== 組合：ORB(開盤，opening_minutes={opening_minutes}) + "
          f"{best['strategy']}(盤中，{best_params}) vs 純 ORB =====")

    orb_params = {"day": dict(opening_minutes=5), "night": dict(opening_minutes=60)}[args.session]
    orb = ORBStrategy(**orb_params)
    secondary = factory(**best_params)

    orb_prepared = orb.prepare(df)
    sec_prepared = mask_before_open_end(secondary.prepare(df), st["start"], opening_minutes)
    combined_signal = orb_prepared["signal"].where(orb_prepared["signal"] != 0, sec_prepared["signal"])
    combined_df = orb_prepared.drop(columns=["signal"]).copy()
    combined_df["signal"] = combined_signal

    class _CombinedStrategy:
        name = f"orb+{best['strategy']}"
        def prepare(self, _df):
            return combined_df

    combo_rows = []
    for sl, tp in sl_tp_grid:
        cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp, **cfg_base)
        result_combo = BacktestEngine(cfg).run(combined_df, _CombinedStrategy())
        m = compute_metrics(result_combo)
        if m.get("trades", 0) < MIN_TRADES:
            continue
        combo_rows.append({"sl": sl, "tp": tp, **m})

    if not combo_rows:
        print("組合策略沒有組合達到最少交易門檻。")
        return

    combo_df = pd.DataFrame(combo_rows).sort_values("total_net_pnl", ascending=False)
    print("\n組合策略 SL/TP 搜尋前 5 名：")
    print(combo_df[["sl", "tp", "trades", "win_rate", "profit_factor", "total_net_pnl", "max_drawdown", "sharpe"]]
          .head(5).to_string(index=False, formatters={
              "win_rate": "{:.1%}".format, "profit_factor": "{:.2f}".format,
              "total_net_pnl": "{:,.0f}".format, "max_drawdown": "{:,.0f}".format, "sharpe": "{:.2f}".format,
          }))

    best_combo = combo_df.iloc[0]
    cfg_best = BacktestConfig(stop_loss_points=best_combo["sl"], take_profit_points=best_combo["tp"], **cfg_base)
    result_best = BacktestEngine(cfg_best).run(combined_df, _CombinedStrategy())
    print("\n" + format_report(compute_metrics(result_best), f"orb+{best['strategy']} ({args.session})", cfg_best))

    # ---- 純 ORB 基準（用已知最佳參數）----
    orb_sl_tp = {"day": (50.0, 60.0), "night": (40.0, 60.0)}[args.session]
    cfg_orb = BacktestConfig(stop_loss_points=orb_sl_tp[0], take_profit_points=orb_sl_tp[1], **cfg_base)
    result_orb = BacktestEngine(cfg_orb).run(orb_prepared, orb)
    print("\n" + format_report(compute_metrics(result_orb), f"純 orb ({args.session}) 基準", cfg_orb))


if __name__ == "__main__":
    main()
