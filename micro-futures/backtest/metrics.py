"""
績效指標與報告輸出。
"""

from __future__ import annotations

import os

import numpy as np
import pandas as pd

from backtest.engine import BacktestResult


def compute_metrics(result: BacktestResult) -> dict:
    tdf = result.trades
    if tdf.empty:
        return {"trades": 0}

    wins = tdf[tdf["net_pnl"] > 0]
    losses = tdf[tdf["net_pnl"] < 0]
    gross_win = wins["net_pnl"].sum()
    gross_loss = -losses["net_pnl"].sum()

    daily = result.daily_pnl
    equity = daily["equity"]
    peak = equity.cummax()
    drawdown = equity - peak
    max_dd = drawdown.min() if not drawdown.empty else 0.0

    daily_ret = daily["pnl"]
    sharpe = (daily_ret.mean() / daily_ret.std() * np.sqrt(252)
              if daily_ret.std() else 0.0)

    return {
        "trades": len(tdf),
        "win_rate": len(wins) / len(tdf),
        "avg_win": wins["net_pnl"].mean() if len(wins) else 0.0,
        "avg_loss": losses["net_pnl"].mean() if len(losses) else 0.0,
        "profit_factor": (gross_win / gross_loss) if gross_loss else float("inf"),
        "total_net_pnl": tdf["net_pnl"].sum(),
        "total_cost": tdf["cost"].sum(),
        "max_drawdown": max_dd,
        "sharpe": sharpe,
        "avg_points": tdf["points"].mean(),
        "exit_breakdown": tdf["exit_reason"].value_counts().to_dict(),
    }


def format_report(metrics: dict, strategy_name: str, cfg) -> str:
    if metrics.get("trades", 0) == 0:
        return f"[{strategy_name}] 沒有任何交易（可能訊號太嚴或資料太短）。"

    m = metrics
    lines = [
        "=" * 48,
        f" 策略：{strategy_name}    商品：微台({cfg.trade_product}) 每點 {cfg.point_value} 元",
        f" 停損 {cfg.stop_loss_points} 點 / 停利 {cfg.take_profit_points} 點 / 每次 {cfg.lots} 口",
        "=" * 48,
        f" 交易次數     : {m['trades']}",
        f" 勝率         : {m['win_rate']:.1%}",
        f" 獲利因子(PF) : {m['profit_factor']:.2f}",
        f" 平均獲利     : {m['avg_win']:,.0f} 元",
        f" 平均虧損     : {m['avg_loss']:,.0f} 元",
        f" 平均點數     : {m['avg_points']:+.1f} 點",
        f" 總淨損益     : {m['total_net_pnl']:,.0f} 元",
        f" 總成本       : {m['total_cost']:,.0f} 元",
        f" 最大回檔(MDD): {m['max_drawdown']:,.0f} 元",
        f" 夏普值(年化) : {m['sharpe']:.2f}",
        f" 出場原因     : {m['exit_breakdown']}",
        "=" * 48,
    ]
    return "\n".join(lines)


def save_report(result: BacktestResult, strategy_name: str, report_dir: str) -> None:
    """輸出交易明細 CSV 與損益曲線圖。"""
    os.makedirs(report_dir, exist_ok=True)
    if result.trades.empty:
        return

    trades_path = os.path.join(report_dir, f"{strategy_name}_trades.csv")
    result.trades.to_csv(trades_path, index=False, encoding="utf-8-sig")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(10, 4))
        d = result.daily_pnl
        ax.plot(pd.to_datetime(d["date"]), d["equity"], marker="o", ms=3)
        ax.set_title(f"{strategy_name} equity curve (NT$)")
        ax.axhline(0, color="grey", lw=0.8)
        ax.grid(alpha=0.3)
        fig.tight_layout()
        fig.savefig(os.path.join(report_dir, f"{strategy_name}_equity.png"), dpi=120)
        plt.close(fig)
    except Exception as e:  # noqa: BLE001
        print(f"（略過畫圖：{e}）")

    print(f"報告已輸出至：{report_dir}")
