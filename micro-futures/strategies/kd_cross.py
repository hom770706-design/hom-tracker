"""
KD 指標交叉策略（日內）：
- K 由下往上穿越 D（黃金交叉），且在低檔區(< oversold) → 做多 (+1)
- K 由上往下穿越 D（死亡交叉），且在高檔區(> overbought) → 做空 (-1)
"""

from __future__ import annotations

import pandas as pd

from indicators.ta import kd
from strategies.base import Strategy


class KDCrossStrategy(Strategy):
    name = "kd_cross"

    def __init__(self, period: int = 9, smooth: int = 3,
                 oversold: float = 30, overbought: float = 70):
        self.period = period
        self.smooth = smooth
        self.oversold = oversold
        self.overbought = overbought

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)

        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy()
            k, d = kd(g["high"], g["low"], g["close"], self.period, self.smooth)
            g["k"], g["d"] = k, d
            diff = k - d
            prev = diff.shift(1)
            g["signal"] = 0
            golden = (prev <= 0) & (diff > 0) & (k < self.oversold)
            dead = (prev >= 0) & (diff < 0) & (k > self.overbought)
            g.loc[golden, "signal"] = 1
            g.loc[dead, "signal"] = -1
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
