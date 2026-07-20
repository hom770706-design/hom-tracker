"""
日內當沖回測引擎。

規則：
- 一次最多持有一個部位（固定口數）。
- 進場：策略在某根K收盤確定 signal → 『下一根K開盤』進場（避免未來函數）。
- 出場：固定停損 / 停利（以該根K的高低點判斷是否觸價），或到收盤時間強制平倉。
- 不留倉：每天結束一定平倉。
- 成本：手續費 + 期交稅，進出各計一次。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import datetime as dt

import pandas as pd

from config import BacktestConfig
from strategies.base import Strategy


@dataclass
class Trade:
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    direction: int            # +1 多 / -1 空
    entry_price: float
    exit_price: float
    exit_reason: str          # tp / sl / eod
    points: float
    gross_pnl: float
    cost: float
    net_pnl: float
    date: object = None       # 交易時段日期（session_date），非 exit_ts 的日曆日期
                               # ——夜盤跨夜時兩者會不同，見 data/sessions.py


@dataclass
class BacktestResult:
    trades: pd.DataFrame
    daily_pnl: pd.DataFrame
    config: BacktestConfig = field(repr=False)


def _to_time(s: str) -> dt.time:
    h, m = s.split(":")
    return dt.time(int(h), int(m))


def _minutes(t: dt.time) -> int:
    return t.hour * 60 + t.minute


class BacktestEngine:
    def __init__(self, config: BacktestConfig):
        self.cfg = config
        # 用「距離該時段開盤經過幾分鐘」比較，而不是直接比時鐘時間——
        # 夜盤跨過午夜（15:00 開盤、翌日 05:00 收盤），15:xx 在時鐘上數字
        # 比 04:xx 大，直接比較會誤判成「已過截止時間」，導致夜盤晚上
        # 那一大段完全無法進場。日盤沒有跨夜問題，這個算法對日盤等價於
        # 原本直接比時鐘時間的結果。
        self._start_min = _minutes(_to_time(config.session_start))
        self._cutoff_min = self._elapsed(_to_time(config.entry_cutoff))
        self._close_min = self._elapsed(_to_time(config.session_close))

    def _elapsed(self, t: dt.time) -> int:
        m = _minutes(t) - self._start_min
        return m if m >= 0 else m + 24 * 60

    def run(self, prepared: pd.DataFrame, strategy: Strategy,
            daily_bias: dict | None = None) -> BacktestResult:
        """
        daily_bias: 可選的籌碼過濾 {date: +1/-1/0}。
          +1 → 當天只允許做多；-1 → 只允許做空；0 或未提供 → 多空皆可。
        """
        cfg = self.cfg
        pv = cfg.point_value
        prepared = prepared.copy()
        prepared["ts"] = pd.to_datetime(prepared["ts"])
        # 沿用呼叫端算好的交易時段感知 date（見 data.sessions.filter_session），
        # 沒有的話才退回日曆日期（適用於還沒套用 session 切分的舊用法）。
        if "date" not in prepared.columns:
            prepared["date"] = prepared["ts"].dt.date

        trades: list[Trade] = []

        for day_date, day in prepared.groupby("date"):
            day = day.sort_values("ts").reset_index(drop=True)
            bias = daily_bias.get(day_date, 0) if daily_bias else 0
            position = 0
            entry_price = 0.0
            entry_ts = None
            pending = 0

            for row in day.itertuples(index=False):
                te = self._elapsed(row.ts.time())

                # 1) 進場：使用『上一根K』確定的訊號，在本根K開盤成交
                #    若有籌碼過濾，僅在方向與 bias 一致時才進場（bias=0 不限制）
                allowed = (bias == 0 or pending == bias)
                if (position == 0 and pending != 0 and allowed
                        and te < self._cutoff_min and te < self._close_min):
                    position = pending
                    entry_price = float(row.open)
                    entry_ts = row.ts

                # 2) 出場判斷（剛進場的當根也要檢查觸價）
                if position != 0:
                    exit_price, reason = self._check_exit(
                        row, position, entry_price, te)
                    if reason:
                        trades.append(self._make_trade(
                            entry_ts, row.ts, position,
                            entry_price, exit_price, reason, pv, cfg, day_date))
                        position = 0

                # 3) 記錄本根訊號，供下一根進場使用
                pending = int(getattr(row, "signal", 0) or 0)

            # 收盤仍有部位 → 以當日最後一根收盤價強制平倉
            if position != 0:
                last = day.iloc[-1]
                trades.append(self._make_trade(
                    entry_ts, last.ts, position, entry_price,
                    float(last.close), "eod", pv, cfg, day_date))

        return self._build_result(trades)

    def _check_exit(self, row, position, entry_price, te):
        cfg = self.cfg
        sl, tp = cfg.stop_loss_points, cfg.take_profit_points

        if position == 1:
            stop = entry_price - sl
            target = entry_price + tp
            # 同一根同時觸及停損與停利 → 保守假設先觸停損
            if row.low <= stop:
                return stop, "sl"
            if row.high >= target:
                return target, "tp"
        else:  # position == -1
            stop = entry_price + sl
            target = entry_price - tp
            if row.high >= stop:
                return stop, "sl"
            if row.low <= target:
                return target, "tp"

        if te >= self._close_min:
            return float(row.close), "eod"
        return 0.0, ""

    @staticmethod
    def _make_trade(entry_ts, exit_ts, direction, entry_price, exit_price,
                    reason, pv, cfg, day_date) -> Trade:
        points = (exit_price - entry_price) * direction
        gross = points * pv * cfg.lots
        cost = cfg.cost.round_trip_cost(entry_price, exit_price, pv, cfg.lots)
        return Trade(
            entry_ts=entry_ts, exit_ts=exit_ts, direction=direction,
            entry_price=entry_price, exit_price=exit_price, exit_reason=reason,
            points=points, gross_pnl=gross, cost=cost, net_pnl=gross - cost,
            date=day_date,
        )

    def _build_result(self, trades: list[Trade]) -> BacktestResult:
        if not trades:
            empty = pd.DataFrame()
            return BacktestResult(empty, empty, self.cfg)

        # date 是交易時段日期（session_date，見 _make_trade），不是重新從
        # exit_ts 算日曆日期——夜盤跨夜的話，出場時間的日曆日期會跟真正
        # 開盤所屬的交易日不同，用 exit_ts 算會把損益歸到錯的一天。
        tdf = pd.DataFrame([t.__dict__ for t in trades])
        daily = (tdf.groupby("date")["net_pnl"].sum()
                 .rename("pnl").reset_index())
        daily["equity"] = daily["pnl"].cumsum()
        return BacktestResult(tdf, daily, self.cfg)
