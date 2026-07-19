"""
彙整工具：讀取 reports/ 裡各策略的交易明細(*_trades.csv)，
自動算出關鍵績效、排名比較，並輸出一份 reports/summary.md。

用法：
    python run_backtest.py --strategy all       # 先跑出各策略結果
    python summarize.py                          # 再彙整成一張比較表 + 總結
"""

from __future__ import annotations

import glob
import os

import numpy as np
import pandas as pd

from config import REPORT_DIR


def _metrics_from_trades(tdf: pd.DataFrame) -> dict:
    wins = tdf[tdf["net_pnl"] > 0]
    losses = tdf[tdf["net_pnl"] < 0]
    gross_win = wins["net_pnl"].sum()
    gross_loss = -losses["net_pnl"].sum()

    tdf = tdf.copy()
    tdf["date"] = pd.to_datetime(tdf["exit_ts"]).dt.date
    daily = tdf.groupby("date")["net_pnl"].sum()
    equity = daily.cumsum()
    max_dd = (equity - equity.cummax()).min() if len(equity) else 0.0
    sharpe = (daily.mean() / daily.std() * np.sqrt(252)) if daily.std() else 0.0

    return {
        "交易數": len(tdf),
        "勝率": len(wins) / len(tdf) if len(tdf) else 0.0,
        "PF": (gross_win / gross_loss) if gross_loss else float("inf"),
        "淨損益": tdf["net_pnl"].sum(),
        "成本": tdf["cost"].sum(),
        "MDD": max_dd,
        "夏普": sharpe,
    }


def collect() -> pd.DataFrame:
    rows = []
    for path in sorted(glob.glob(os.path.join(REPORT_DIR, "*_trades.csv"))):
        name = os.path.basename(path).replace("_trades.csv", "")
        tdf = pd.read_csv(path)
        if tdf.empty:
            continue
        m = _metrics_from_trades(tdf)
        m = {"策略": name, **m}
        rows.append(m)
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    return df.sort_values("淨損益", ascending=False).reset_index(drop=True)


def _verdict(row) -> str:
    if row["淨損益"] > 0 and row["PF"] >= 1.1 and row["夏普"] > 0:
        return "🟢 有潛力(仍需更多資料驗證)"
    if row["淨損益"] > 0:
        return "🟡 勉強正報酬"
    return "🔴 這段期間虧損"


def main():
    df = collect()
    if df.empty:
        print("找不到任何交易明細，請先執行 python run_backtest.py --strategy all")
        return

    # 終端輸出
    print("\n===== 策略績效比較（依淨損益排序）=====")
    show = df.copy()
    show["勝率"] = (show["勝率"] * 100).round(1).astype(str) + "%"
    show["PF"] = show["PF"].round(2)
    for c in ["淨損益", "成本", "MDD"]:
        show[c] = show[c].round(0).astype(int)
    show["夏普"] = show["夏普"].round(2)
    print(show.to_string(index=False))

    # 寫成 markdown
    lines = ["# 回測績效總結\n", "依淨損益由高到低排序：\n"]
    lines.append("| 策略 | 交易數 | 勝率 | PF | 淨損益(元) | 成本(元) | MDD(元) | 夏普 | 評語 |")
    lines.append("|------|-------|------|----|-----------|---------|---------|------|------|")
    for _, r in df.iterrows():
        lines.append(
            f"| {r['策略']} | {int(r['交易數'])} | {r['勝率']*100:.1f}% | "
            f"{r['PF']:.2f} | {r['淨損益']:,.0f} | {r['成本']:,.0f} | "
            f"{r['MDD']:,.0f} | {r['夏普']:.2f} | {_verdict(r)} |"
        )
    best = df.iloc[0]
    lines.append("\n## 重點觀察\n")
    lines.append(f"- 這段期間表現最好的是 **{best['策略']}**"
                 f"（淨損益 {best['淨損益']:,.0f} 元、PF {best['PF']:.2f}）。")
    lines.append(f"- 全部 {len(df)} 個策略中，正報酬 "
                 f"{int((df['淨損益'] > 0).sum())} 個、虧損 "
                 f"{int((df['淨損益'] <= 0).sum())} 個。")
    lines.append("- ⚠️ 資料期間仍短，交易樣本有限，勿把單一名次當結論；"
                 "請持續累積資料，並用『訓練/驗證分段』檢驗是否過度最佳化。")

    out = os.path.join(REPORT_DIR, "summary.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"\n總結已輸出：{out}")


if __name__ == "__main__":
    main()
