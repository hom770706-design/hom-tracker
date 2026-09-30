"""Regenerate the DATASETS block in dashboard/orb_dashboard.html from the 5
paper_trade CSVs in reports/, then republish that file as the Artifact.

Lives in the repo (not a session scratchpad) so it survives across sessions
and OS temp-dir cleanups -- the scratchpad copy was lost twice (2026-09-18,
2026-09-30) before this was moved here.

Usage:
    python dashboard/regen_dashboard.py
Then bump the masthead snapshot date by hand and republish via the Artifact tool.
"""
import re
import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = ROOT / "reports"
HTML_PATH = Path(__file__).resolve().parent / "orb_dashboard.html"

DATASET_META = {
    "day": {
        "csv": "paper_trades_orb_day.csv",
        "label": "日盤 ORB", "paramLabel": "08:45 開盤 · 5分鐘區間 · SL50/TP60",
        "params": ["開盤區間 5 分鐘", "停損 50 點", "停利 60 點", "每次 1 口・微台 (TMF)"],
    },
    "night": {
        "csv": "paper_trades_orb_night.csv",
        "label": "夜盤 ORB", "paramLabel": "15:00 開盤 · 60分鐘區間 · SL40/TP60",
        "params": ["開盤區間 60 分鐘", "停損 40 點", "停利 60 點", "每次 1 口・微台 (TMF)"],
    },
    "combo": {
        "csv": "paper_trades_orb_day_combo.csv",
        "label": "日盤組合", "paramLabel": "ORB(5min,SL50/TP60) + ma_cross(8,50,盤中)",
        "params": ["開盤 5 分鐘用 ORB", "之後用 ma_cross(fast=8,slow=50)", "統一 停損 50 / 停利 60 點", "每次 1 口・微台 (TMF)"],
    },
    "chip": {
        "csv": "paper_trades_orb_day_chip.csv",
        "label": "日盤+籌碼", "paramLabel": "ORB(5min,SL50/TP60) + MTX外資籌碼濾網",
        "params": ["開盤區間 5 分鐘", "MTX 外資未平倉方向濾網", "停損 50 點 / 停利 60 點", "每次 1 口・微台 (TMF)"],
    },
    "us_open": {
        "csv": "paper_trades_orb_night_us_open.csv",
        "label": "夜盤+美股", "paramLabel": "NQ美股開盤反應(15min) · SL40/TP60",
        "params": ["那斯達克期貨(NQ)美股開盤後15分鐘反應方向", "反應幅度 > 0.05% 才算數", "停損 40 點 / 停利 60 點", "每次 1 口・微台 (TMF)"],
    },
}


def fmt_num(x):
    x = round(float(x), 2)
    return str(int(x)) if x == int(x) else str(x)


def build_trade_line(row):
    date = row["date"]
    dir_ = 1 if row["direction"] > 0 else -1
    entry_ts = pd.to_datetime(row["entry_ts"]).strftime("%m-%d %H:%M")
    exit_ts = pd.to_datetime(row["exit_ts"]).strftime("%m-%d %H:%M")
    entry = fmt_num(row["entry_price"])
    exit_ = fmt_num(row["exit_price"])
    reason = row["exit_reason"]
    points = fmt_num(row["points"])
    pnl = fmt_num(row["net_pnl"])
    return (f'        {{date:"{date}", dir:{dir_:2d}, entry_ts:"{entry_ts}", exit_ts:"{exit_ts}", '
            f'entry:{entry}, exit:{exit_}, reason:"{reason}", points:{points}, pnl:{pnl}}}')


def build_dataset_block(key, meta):
    df = pd.read_csv(REPORT_DIR / meta["csv"])
    lines = [build_trade_line(r) for _, r in df.iterrows()]
    trades_js = ",\n".join(lines)
    return (
        f"    {key}: {{\n"
        f"      label: '{meta['label']}', paramLabel: '{meta['paramLabel']}',\n"
        f"      params: {meta['params']!r},\n"
        f"      trades: [\n{trades_js}\n      ]\n"
        f"    }}"
    ), len(df)


def main():
    html = HTML_PATH.read_text(encoding="utf-8")

    blocks = []
    counts = {}
    for key, meta in DATASET_META.items():
        block, n = build_dataset_block(key, meta)
        blocks.append(block)
        counts[key] = n

    new_datasets = "const DATASETS = {\n" + ",\n".join(blocks) + "\n  };"

    pattern = re.compile(r"const DATASETS = \{.*?\n  \};", re.DOTALL)
    new_html, n_subs = pattern.subn(new_datasets, html, count=1)
    if n_subs != 1:
        raise RuntimeError(f"expected 1 substitution, got {n_subs}")

    HTML_PATH.write_text(new_html, encoding="utf-8")

    print("done. trades per dataset:")
    for k, v in counts.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
