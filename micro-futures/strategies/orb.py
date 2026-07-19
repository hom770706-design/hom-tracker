"""
開盤區間突破 Opening Range Breakout（經典日內當沖）：
- 取每天開盤後 N 分鐘的高低點作為「開盤區間」。
- 收盤價『向上突破』區間高點 → 當天第一次時做多 (+1)
- 收盤價『向下突破』區間低點 → 當天第一次時做空 (-1)
- 每天最多觸發一次進場訊號（取最先發生的方向）。
"""

from __future__ import annotations

import pandas as pd

from strategies.base import Strategy


class ORBStrategy(Strategy):
    name = "orb"

    def __init__(self, opening_minutes: int = 30):
        self.opening_minutes = opening_minutes

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)
        df["ts"] = pd.to_datetime(df["ts"])
        df["signal"] = 0

        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy().sort_values("ts")
            start = g["ts"].iloc[0]
            or_end = start + pd.Timedelta(minutes=self.opening_minutes)

            window = g[g["ts"] < or_end]
            if window.empty:
                return g
            or_high = window["high"].max()
            or_low = window["low"].min()

            after = g["ts"] >= or_end
            up = after & (g["close"] > or_high)
            down = after & (g["close"] < or_low)

            first_up = g.index[up].min() if up.any() else None
            first_down = g.index[down].min() if down.any() else None

            # 取最先發生的突破方向
            if first_up is not None and (first_down is None or first_up <= first_down):
                g.loc[first_up, "signal"] = 1
            elif first_down is not None:
                g.loc[first_down, "signal"] = -1
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
