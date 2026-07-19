"""
均線交叉策略（日內）：
- 短均線『上穿』長均線 → 做多進場 (+1)
- 短均線『下穿』長均線 → 做空進場 (-1)
均線在分K上計算；不留倉（收盤平倉由引擎負責）。
"""

from __future__ import annotations

import pandas as pd

from indicators.ta import ema
from strategies.base import Strategy


class MACrossStrategy(Strategy):
    name = "ma_cross"

    def __init__(self, fast: int = 5, slow: int = 20):
        self.fast = fast
        self.slow = slow

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)
        # 均線逐日重算，避免跨日把昨天尾盤帶進今天開盤
        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy()
            g["ma_fast"] = ema(g["close"], self.fast)
            g["ma_slow"] = ema(g["close"], self.slow)
            diff = g["ma_fast"] - g["ma_slow"]
            prev = diff.shift(1)
            g["signal"] = 0
            g.loc[(prev <= 0) & (diff > 0), "signal"] = 1     # 黃金交叉
            g.loc[(prev >= 0) & (diff < 0), "signal"] = -1    # 死亡交叉
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
