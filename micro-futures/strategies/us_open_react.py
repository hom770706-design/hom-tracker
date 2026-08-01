"""
美股開盤反應策略（夜盤專用）：不管 TAIEX 自己開盤區間怎麼走，直接看
那斯達克期貨(NQ)美股開盤後 15 分鐘的反應方向，同方向進場 TAIEX。

跟 ORB 的差異：訊號完全來自外部市場（NQ），不是 TAIEX 自己的價格行為；
一個時段一樣最多進場一次（美股開盤反應只算一次），時間點固定在美股
開盤反應確認的那一刻，不是看 TAIEX 自己的區間有沒有被突破。
"""

from __future__ import annotations

import pandas as pd

from strategies.base import Strategy


class USOpenReactStrategy(Strategy):
    name = "us_open_react"

    def __init__(self, bias: dict, entry_time: dict):
        """bias / entry_time：data.us_market.compute_open_reaction() 的回傳值，
        以 date 為 key。分開傳入（而不是策略自己抓資料），方便回測/模擬盤
        重複使用同一份已經抓好的 NQ 資料，不用每次都重新下載。"""
        self.bias = bias
        self.entry_time = entry_time

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._with_date(df)
        df["ts"] = pd.to_datetime(df["ts"])
        df["signal"] = 0

        def _per_day(g: pd.DataFrame) -> pd.DataFrame:
            g = g.copy().sort_values("ts")
            d = g["date"].iloc[0]
            direction = self.bias.get(d, 0)
            et = self.entry_time.get(d)
            if direction == 0 or et is None:
                return g
            candidates = g[g["ts"].dt.time >= et]
            if candidates.empty:
                return g
            g.loc[candidates.index[0], "signal"] = direction
            return g

        return (
            df.groupby("date", group_keys=False)[df.columns.tolist()]
            .apply(_per_day)
            .reset_index(drop=True)
        )
