"""
策略基底：回測引擎與（第二階段的）模擬盤共用同一套介面。

約定：
- prepare(df)：吃整段 1 分K（欄位 ts/open/high/low/close/volume），
  算好指標，並產生一個 `signal` 欄位：+1=做多進場、-1=做空進場、0=不動作。
- 為避免未來函數(look-ahead)，signal 是「該根K收盤後才確定」的訊號；
  回測引擎會在『下一根K開盤』才進場。
"""

from __future__ import annotations

import pandas as pd


class Strategy:
    name: str = "base"

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        """回傳含 `signal` 欄位的 DataFrame。子類別覆寫。"""
        raise NotImplementedError

    def entry_signal(self, row) -> int:
        """給引擎逐根呼叫。預設直接讀 prepare 算好的 signal 欄。"""
        return int(getattr(row, "signal", 0) or 0)

    @staticmethod
    def _with_date(df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["date"] = pd.to_datetime(df["ts"]).dt.date
        return df
