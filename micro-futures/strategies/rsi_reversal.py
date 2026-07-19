"""
RSI 超買超賣『逆勢』策略（盤整盤好用）：
- RSI 由下往上『穿回』超賣線(oversold) → 做多 (+1)（跌深反彈）
- RSI 由上往下『跌破』超買線(overbought) → 做空 (-1)（漲多回落）
"""

from __future__ import annotations

import pandas as pd

from indicators.ta import rsi
from strategies.base import Strategy


class RSIReversalStrategy(Strategy):
    name = "rsi"

    def __init__(self, period: int = 14, oversold: float = 30,
                 overbought: float = 70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)

        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy()
            r = rsi(g["close"], self.period)
            g["rsi"] = r
            prev = r.shift(1)
            g["signal"] = 0
            g.loc[(prev < self.oversold) & (r >= self.oversold), "signal"] = 1
            g.loc[(prev > self.overbought) & (r <= self.overbought), "signal"] = -1
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
