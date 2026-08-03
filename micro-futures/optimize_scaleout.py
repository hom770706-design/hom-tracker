"""
分批出場探索：針對目前 Sharpe 最高的三條策略（日盤ORB、日盤組合、夜盤+美股），
測試「買多口、到不同停利點分批出場」有沒有機會放大損益，並且跟『純粹加碼
（多口但同一個停利點出場，不分批）』分開比較，才知道分批本身有沒有額外幫助，
不是只是口數變多的效果。

用法：
    python optimize_scaleout.py
"""

from __future__ import annotations

import pandas as pd

from config import BacktestConfig, SESSION_TIMES
from data.taifex_loader import load_cached_bars
from data.sessions import filter_session
from backtest.engine import BacktestEngine
from backtest.scaleout_engine import ScaleOutEngine
from backtest.metrics import compute_metrics
from strategies.orb import ORBStrategy
from strategies.combo import ComboStrategy
from strategies.ma_cross import MACrossStrategy
from strategies.us_open_react import USOpenReactStrategy
from data.us_market import fetch_nq_bars, compute_open_reaction

pd.set_option("display.width", 160)


def run_variant(label, prepared, cfg_base, sl, tp_levels):
    """tp_levels: [(tp點數, 口數), ...]"""
    cfg = BacktestConfig(stop_loss_points=sl, take_profit_points=tp_levels[0][0], **cfg_base)
    engine = ScaleOutEngine(cfg, tp_levels)
    result = engine.run(prepared, None)
    m = compute_metrics(result)
    lots = sum(l for _, l in tp_levels)
    if m.get("trades", 0) == 0:
        print(f"  {label:38s} (無交易)")
        return
    print(f"  {label:38s} 總口數={lots} legs={m['trades']:3d} win={m['win_rate']:.1%} "
         f"PF={m['profit_factor']:.2f} net={m['total_net_pnl']:>9,.0f} "
         f"MDD={m['max_drawdown']:>9,.0f} sharpe={m['sharpe']:>6.2f}")


def section(name):
    print(f"\n{'=' * 90}\n {name}\n{'=' * 90}")


raw = load_cached_bars(BacktestConfig().data_product)

# ---------------------------------------------------------------- 日盤 ORB
section("日盤 ORB（基準 SL50/TP60，1口）")
st = SESSION_TIMES["day"]
cfg_base_day = dict(session_start=st["start"], entry_cutoff=st["cutoff"], session_close=st["close"])
df_day = filter_session(raw, "day")
orb = ORBStrategy(opening_minutes=5)
prepared_orb = orb.prepare(df_day)

run_variant("1口 @60（現行基準）", prepared_orb, cfg_base_day, 50, [(60, 1)])
run_variant("2口 全部@60（純加碼，對照組）", prepared_orb, cfg_base_day, 50, [(60, 2)])
for tp2 in (80, 100, 150, 200):
    run_variant(f"2口 分批: 1口@60 + 1口@{tp2}", prepared_orb, cfg_base_day, 50, [(60, 1), (tp2, 1)])
run_variant("3口 全部@60（純加碼，對照組）", prepared_orb, cfg_base_day, 50, [(60, 3)])
for tp2, tp3 in [(80, 120), (100, 150), (100, 200), (80, 150)]:
    run_variant(f"3口 分批: 1口@60 + 1口@{tp2} + 1口@{tp3}", prepared_orb, cfg_base_day, 50, [(60, 1), (tp2, 1), (tp3, 1)])

# ---------------------------------------------------------------- 日盤組合
section("日盤組合 ORB+ma_cross（基準 SL50/TP60，1口）")
combo = ComboStrategy(opening_minutes=5, secondary=MACrossStrategy(fast=8, slow=50), secondary_name="ma_cross")
prepared_combo = combo.prepare(df_day)

run_variant("1口 @60（現行基準）", prepared_combo, cfg_base_day, 50, [(60, 1)])
run_variant("2口 全部@60（純加碼，對照組）", prepared_combo, cfg_base_day, 50, [(60, 2)])
for tp2 in (80, 100, 150, 200):
    run_variant(f"2口 分批: 1口@60 + 1口@{tp2}", prepared_combo, cfg_base_day, 50, [(60, 1), (tp2, 1)])
run_variant("3口 全部@60（純加碼，對照組）", prepared_combo, cfg_base_day, 50, [(60, 3)])
for tp2, tp3 in [(80, 120), (100, 150), (100, 200)]:
    run_variant(f"3口 分批: 1口@60 + 1口@{tp2} + 1口@{tp3}", prepared_combo, cfg_base_day, 50, [(60, 1), (tp2, 1), (tp3, 1)])

# ---------------------------------------------------------------- 夜盤+美股
section("夜盤+美股 us_open_react（基準 SL40/TP60，1口）")
st_night = SESSION_TIMES["night"]
cfg_base_night = dict(session_start=st_night["start"], entry_cutoff=st_night["cutoff"], session_close=st_night["close"])
df_night = filter_session(raw, "night")
nq = fetch_nq_bars(period="60d")
bias, entry_time = compute_open_reaction(nq, reaction_minutes=15, threshold_pct=0.05)
us = USOpenReactStrategy(bias=bias, entry_time=entry_time)
prepared_us = us.prepare(df_night)

run_variant("1口 @60（現行基準）", prepared_us, cfg_base_night, 40, [(60, 1)])
run_variant("2口 全部@60（純加碼，對照組）", prepared_us, cfg_base_night, 40, [(60, 2)])
for tp2 in (80, 100, 150, 200):
    run_variant(f"2口 分批: 1口@60 + 1口@{tp2}", prepared_us, cfg_base_night, 40, [(60, 1), (tp2, 1)])
run_variant("3口 全部@60（純加碼，對照組）", prepared_us, cfg_base_night, 40, [(60, 3)])
for tp2, tp3 in [(80, 120), (100, 150), (100, 200)]:
    run_variant(f"3口 分批: 1口@60 + 1口@{tp2} + 1口@{tp3}", prepared_us, cfg_base_night, 40, [(60, 1), (tp2, 1), (tp3, 1)])

print("\n提醒：ScaleOutEngine 對每筆交易的 strategy 參數傳 None，因為 legs 的\n"
      "trades/date 分組邏輯跟策略本身無關，只要 prepared 資料裡已經有正確的\n"
      "signal/date 欄位即可——不影響回測結果正確性。")
