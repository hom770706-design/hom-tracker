"""
布林通道『逆勢/均值回歸』策略（盤整盤好用；趨勢盤會失靈，靠停損保護）：
- 收盤價由下往上『重新站回』下軌 → 做多 (+1)（跌深反彈）
- 收盤價由上往下『跌破回』上軌 → 做空 (-1)（漲多回落）

註：突破型（喇叭口）版本可另做，這裡先實作經典的區間回歸版。
"""

from __future__ import annotations

import pandas as pd

from indicators.ta import bollinger
from strategies.base import Strategy


class BollingerStrategy(Strategy):
    name = "bollinger"

    def __init__(self, period: int = 20, num_std: float = 2.0):
        self.period = period
        self.num_std = num_std

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)

        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy()
            mid, upper, lower = bollinger(g["close"], self.period, self.num_std)
            g["bb_mid"], g["bb_up"], g["bb_low"] = mid, upper, lower
            c, pc = g["close"], g["close"].shift(1)
            g["signal"] = 0
            # 由下方重新站回下軌 → 做多
            g.loc[(pc < lower.shift(1)) & (c >= lower), "signal"] = 1
            # 由上方跌破回上軌 → 做空
            g.loc[(pc > upper.shift(1)) & (c <= upper), "signal"] = -1
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
