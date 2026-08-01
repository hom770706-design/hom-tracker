"""
美股期貨資料層：用 yfinance 抓那斯達克期貨(NQ=F)分K，算出「美股開盤反應」
方向，給夜盤策略當獨立訊號用（不是從 TAIEX 自己的價格猜美股，是真的抓
美股資料）。

背景：TAIEX 夜盤跟美股科技股（那斯達克/半導體）高度連動，NQ 期貨美股
開盤（21:30 台北時間）後的頭 15 分鐘反應，經回測比等更久（30/60分鐘）
的版本明顯更好——跟「不要等確認、快速反應」的既有結論一致。
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

try:
    import yfinance as yf
except ImportError:  # pragma: no cover
    yf = None

US_OPEN_TIME = dt.time(21, 30)  # 美股開盤（21:30 台北時間，對應美東 9:30 EDT；EST 期間會差 1 小時，見下方說明）
DEFAULT_REACTION_MINUTES = 15
DEFAULT_THRESHOLD_PCT = 0.05


def fetch_nq_bars(period: str = "60d", interval: str = "5m") -> pd.DataFrame:
    """抓 NQ=F（那斯達克期貨）分K，轉成台北時區。免費版 yfinance 分K
    最長只能抓 60 天，這對我們目前 2 個月出頭的資料範圍夠用，但之後
    資料累積更久要注意這個上限。"""
    if yf is None:
        raise ImportError("請先 `pip install yfinance`")
    data = yf.download("NQ=F", period=period, interval=interval, progress=False)
    data.columns = [c[0] if isinstance(c, tuple) else c for c in data.columns]
    data.index = data.index.tz_convert("Asia/Taipei")
    data.index.name = "ts"
    data = data.reset_index()
    data["ts"] = data["ts"].dt.tz_localize(None)
    data["date"] = data["ts"].dt.date
    return data


def compute_open_reaction(nq: pd.DataFrame, reaction_minutes: int = DEFAULT_REACTION_MINUTES,
                          threshold_pct: float = DEFAULT_THRESHOLD_PCT) -> tuple[dict, dict]:
    """算出每個美股交易日「開盤後 reaction_minutes 分鐘」的漲跌幅方向。

    重要（避免未來函數）：bias 用『開盤那根K的開盤價』對比『reaction_minutes
    分鐘後那根K的收盤價』，entry_time 就是那根確認K的時間——TAIEX 那邊
    要在這個時間點（或之後第一根）才能用這個訊號進場，不能提早用到。

    回傳 (bias, entry_time)，皆以 date 為 key：
      bias: +1 開盤反應向上、-1 向下、0 漲跌幅不到門檻（不足以當訊號）
      entry_time: 那根確認K的時間（datetime.time），TAIEX 用這個時間點進場
    """
    confirm_time = (dt.datetime.combine(dt.date.today(), US_OPEN_TIME)
                    + dt.timedelta(minutes=reaction_minutes)).time()
    bias: dict = {}
    entry_time: dict = {}
    for d, g in nq.groupby("date"):
        g = g.sort_values("ts")
        open_rows = g[g["ts"].dt.time == US_OPEN_TIME]
        confirm_rows = g[g["ts"].dt.time >= confirm_time]
        if open_rows.empty or confirm_rows.empty:
            continue
        open_price = open_rows.iloc[0]["Open"]
        confirm_row = confirm_rows.iloc[0]
        chg = (confirm_row["Close"] - open_price) / open_price * 100
        if chg > threshold_pct:
            bias[d] = 1
        elif chg < -threshold_pct:
            bias[d] = -1
        else:
            bias[d] = 0
        entry_time[d] = confirm_row["ts"].time()
    return bias, entry_time
