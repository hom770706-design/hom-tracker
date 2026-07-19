"""
技術指標（pandas 版）。對照 taiwan-stock/src/lib/indicators.ts 的邏輯移植。
全部回傳與輸入等長的 Series，前段不足期數的位置為 NaN。
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period, min_periods=period).mean()


def ema(series: pd.Series, period: int) -> pd.Series:
    # 與 TS 版一致：前 period 個先用 SMA 當種子，再遞迴
    seed = series.rolling(window=period, min_periods=period).mean()
    out = series.ewm(span=period, adjust=False).mean()
    # 讓不足期數的位置維持 NaN
    out[seed.isna()] = np.nan
    return out.astype(float)


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def kd(high: pd.Series, low: pd.Series, close: pd.Series,
       period: int = 9, smooth: int = 3) -> tuple[pd.Series, pd.Series]:
    """KD 隨機指標。回傳 (K, D)。採台股常見的 1/3、2/3 平滑。"""
    lowest = low.rolling(window=period, min_periods=period).min()
    highest = high.rolling(window=period, min_periods=period).max()
    rsv = (close - lowest) / (highest - lowest) * 100
    rsv = rsv.fillna(50)

    k_vals, d_vals = [], []
    k_prev, d_prev = 50.0, 50.0
    for i, r in enumerate(rsv):
        if pd.isna(highest.iloc[i]):        # 尚未滿足期數
            k_vals.append(np.nan)
            d_vals.append(np.nan)
            continue
        k_prev = k_prev * (1 - 1 / smooth) + r * (1 / smooth)
        d_prev = d_prev * (1 - 1 / smooth) + k_prev * (1 / smooth)
        k_vals.append(k_prev)
        d_vals.append(d_prev)
    return (pd.Series(k_vals, index=close.index, dtype=float),
            pd.Series(d_vals, index=close.index, dtype=float))


def atr(high: pd.Series, low: pd.Series, close: pd.Series,
        period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
