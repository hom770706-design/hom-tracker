"""
開盤區間突破 Opening Range Breakout（經典日內當沖）：
- 取每天開盤後 N 分鐘的高低點作為「開盤區間」。
- 收盤價『向上突破』區間高點 → 做多 (+1)
- 收盤價『向下突破』區間低點 → 做空 (-1)

allow_multiple=False（預設，原本行為）：一個交易時段最多觸發一次進場訊號
（取最先發生的方向），之後就算收盤價又穿越區間邊界也不再訊號。

allow_multiple=True：只要空手、且收盤價「新穿越」區間邊界（由未穿越變成
穿越，不是每一根還停留在邊界外的K都算）就再給一次訊號，同一個時段可以
反覆進出、多空都可能觸發。引擎本身一次只會有一個部位，所以還是「出場後
才會再進場」，不會同時疊倉。
"""

from __future__ import annotations

import pandas as pd

from strategies.base import Strategy


class ORBStrategy(Strategy):
    name = "orb"

    def __init__(self, opening_minutes: int = 30, allow_multiple: bool = False):
        self.opening_minutes = opening_minutes
        self.allow_multiple = allow_multiple

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

            if not self.allow_multiple:
                first_up = g.index[up].min() if up.any() else None
                first_down = g.index[down].min() if down.any() else None
                # 取最先發生的突破方向
                if first_up is not None and (first_down is None or first_up <= first_down):
                    g.loc[first_up, "signal"] = 1
                elif first_down is not None:
                    g.loc[first_down, "signal"] = -1
                return g

            # 持續進場：每次「由未穿越變成穿越」都算一次新訊號
            fresh_up = up & ~up.shift(1, fill_value=False)
            fresh_down = down & ~down.shift(1, fill_value=False)
            g.loc[fresh_up, "signal"] = 1
            g.loc[fresh_down, "signal"] = -1
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
