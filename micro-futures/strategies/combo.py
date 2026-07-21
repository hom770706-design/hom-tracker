"""
組合策略：開盤區間交給 ORB（單次進場），區間結束之後換另一個策略接手
盤中訊號。引擎本身一次只會有一個部位，兩邊訊號同一根K同時出現時
以 ORB 優先（實務上開盤區間內盤中策略訊號已經被清成 0，很少真的撞在一起）。
"""

from __future__ import annotations

import pandas as pd

from strategies.base import Strategy
from strategies.orb import ORBStrategy


class ComboStrategy(Strategy):
    def __init__(self, opening_minutes: int, secondary: Strategy, secondary_name: str | None = None):
        self.opening_minutes = opening_minutes
        self.orb = ORBStrategy(opening_minutes=opening_minutes)
        self.secondary = secondary
        self.name = f"orb+{secondary_name or getattr(secondary, 'name', 'secondary')}"

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        orb_prepared = self.orb.prepare(df).sort_values("ts").reset_index(drop=True)
        sec_prepared = self.secondary.prepare(df).sort_values("ts").reset_index(drop=True)

        orb_prepared["ts"] = pd.to_datetime(orb_prepared["ts"])
        sec_prepared["ts"] = pd.to_datetime(sec_prepared["ts"])

        # 用 ts 對齊（不用位置對齊），避免兩邊 groupby 順序不一致時錯位。
        sec_signal = (sec_prepared.set_index("ts")["signal"]
                      .reindex(orb_prepared["ts"]).fillna(0).to_numpy().copy())

        session_start = orb_prepared.groupby("date")["ts"].transform("min")
        elapsed_min = (orb_prepared["ts"] - session_start).dt.total_seconds() / 60
        sec_signal[elapsed_min.to_numpy() < self.opening_minutes] = 0

        combined = orb_prepared.copy()
        combined["signal"] = orb_prepared["signal"].where(
            orb_prepared["signal"] != 0, pd.Series(sec_signal, index=orb_prepared.index))
        return combined
