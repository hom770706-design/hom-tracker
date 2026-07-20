"""
交易時段判定：期交所日盤 08:45-13:45／夜盤 15:00-翌日05:00。

taifex_loader 下載回來的 1 分K是用『成交時間所在的日曆日期』組資料，
但夜盤跨過午夜，同一段連續的夜盤交易會被切成兩個日曆日期（例如
6/8 15:00~23:59 跟 6/9 00:00~05:00 其實是同一段夜盤）。

如果直接用日曆日期分組（原本的做法），『當天資料的第一根K』會落在
00:00（夜盤中段），不是任何真正的開盤時間，這對 ORB 這種依賴『開盤
區間』的策略是嚴重錯誤——訊號會在半夜觸發，不是日盤 08:45 或夜盤
15:00 的真開盤突破。

這支模組把 1 分K依照真正的交易時段重新分組，讓每個 session 都從真正
開盤時間開始、到真正收盤時間結束。
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

DAY_START = dt.time(8, 45)
DAY_END = dt.time(13, 45)
NIGHT_START = dt.time(15, 0)
NIGHT_TAIL_END = dt.time(5, 0)  # 夜盤跨夜段，最晚到隔天 05:00


def assign_session(df: pd.DataFrame) -> pd.DataFrame:
    """替 df 加上 session（'day'/'night'）與 session_date 欄位。
    不屬於任何時段的雜訊列（開盤前/收盤後的空檔）會被濾掉。"""
    df = df.copy()
    df["ts"] = pd.to_datetime(df["ts"])
    t = df["ts"].dt.time
    cal_date = df["ts"].dt.normalize()

    is_day = (t >= DAY_START) & (t <= DAY_END)
    is_night_evening = t >= NIGHT_START
    is_night_tail = t <= NIGHT_TAIL_END

    session = pd.Series(pd.NA, index=df.index, dtype="object")
    session_date = pd.Series(pd.NaT, index=df.index, dtype="datetime64[ns]")

    session[is_day] = "day"
    session_date[is_day] = cal_date[is_day]

    # 夜盤晚上段：屬於「今晚開始」的這個夜盤 session。
    session[is_night_evening] = "night"
    session_date[is_night_evening] = cal_date[is_night_evening]

    # 夜盤跨夜段：其實是前一晚就開始的同一個夜盤 session，日期歸回前一天。
    session[is_night_tail] = "night"
    session_date[is_night_tail] = cal_date[is_night_tail] - pd.Timedelta(days=1)

    df["session"] = session
    df["session_date"] = session_date.dt.date
    return df.dropna(subset=["session"]).reset_index(drop=True)


def filter_session(df: pd.DataFrame, session: str) -> pd.DataFrame:
    """回傳只含指定時段（'day' 或 'night'）的資料，並把 session_date
    當成策略/引擎分組用的『交易日』欄位（取代原本的日曆日期）。"""
    prepared = assign_session(df)
    out = prepared[prepared["session"] == session].copy()
    out["date"] = out["session_date"]
    return out.drop(columns=["session", "session_date"]).reset_index(drop=True)
