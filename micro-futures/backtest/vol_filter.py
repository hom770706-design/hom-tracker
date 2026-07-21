"""
波動濾網：用『前一個交易時段為止』的日內波動度（True Range）跟自己的
歷史分位數比較——如果最近的波動度已經明顯偏高，今天/今晚直接不進場，
等波動降溫再說。取材自法人籌碼交易常見的 ATR 熔斷機制（原始做法是
12 日 ATR 超過過去 252 日 90% 分位數就清倉停手），這裡把『一天』對應
一個交易時段（日盤或夜盤各自獨立判斷，互不影響）。

因為樣本時段數不多（只有幾十個），用『擴張視窗』分位數（用到當時為止
看過的所有時段），而不是固定回看 252 天；歷史不夠長時（前 min_history
個時段）不套用濾網，避免用太少樣本就亂判斷。

門檻與 ATR 都用『shift(1)』只取前一個時段收盤為止已知的資訊，
不會用到當天自己的波動度來決定要不要交易當天（避免未來函數）。
"""

from __future__ import annotations

import pandas as pd


def high_vol_dates(prepared: pd.DataFrame, atr_period: int = 5,
                   percentile: float = 0.9, min_history: int = 10) -> set:
    """回傳應該跳過交易的 session_date 集合。"""
    daily = (prepared.groupby("date")
             .agg(high=("high", "max"), low=("low", "min"), close=("close", "last"))
             .sort_index())
    prev_close = daily["close"].shift(1)
    tr = pd.concat([
        daily["high"] - daily["low"],
        (daily["high"] - prev_close).abs(),
        (daily["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    tr.iloc[0] = daily["high"].iloc[0] - daily["low"].iloc[0]  # 第一天沒有前一天收盤可比

    atr = tr.rolling(atr_period, min_periods=1).mean()
    # 門檻跟訊號比的都是同一條 ATR 序列本身的歷史分位數（不是跟原始
    # 逐日 TR 比）——ATR 是平滑過的，跟沒平滑的 TR 分布比較不是同個尺度，
    # 幾乎不會觸發。
    threshold = atr.expanding(min_periods=min_history).quantile(percentile).shift(1)

    flagged = (atr.shift(1) > threshold).fillna(False)
    return set(daily.index[flagged])


def mask_high_vol(prepared: pd.DataFrame, vol_dates: set) -> pd.DataFrame:
    """把落在 vol_dates 裡的交易時段訊號清成 0（不進場）。"""
    out = prepared.copy()
    out.loc[out["date"].isin(vol_dates), "signal"] = 0
    return out
