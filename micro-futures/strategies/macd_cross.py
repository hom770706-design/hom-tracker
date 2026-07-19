"""
MACD 策略（順勢型）：
- 柱狀體(hist)由負轉正（MACD 線上穿訊號線）→ 做多 (+1)
- 柱狀體由正轉負（MACD 線下穿訊號線）→ 做空 (-1)
"""

from __future__ import annotations

import pandas as pd

from indicators.ta import macd
from strategies.base import Strategy


class MACDStrategy(Strategy):
    name = "macd"

    def __init__(self, fast: int = 12, slow: int = 26, signal: int = 9):
        self.fast = fast
        self.slow = slow
        self.signal = signal

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)

        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy()
            macd_line, sig_line, hist = macd(
                g["close"], self.fast, self.slow, self.signal)
            g["macd"], g["macd_signal"], g["macd_hist"] = macd_line, sig_line, hist
            prev = hist.shift(1)
            g["signal"] = 0
            g.loc[(prev <= 0) & (hist > 0), "signal"] = 1
            g.loc[(prev >= 0) & (hist < 0), "signal"] = -1
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
