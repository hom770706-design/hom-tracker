"""
分批出場回測引擎：同一次進場買多口，價格到第一個停利點先出一部分，
剩下的口數留到更遠的停利點才出，讓賺錢的單有機會抱更久、放大獲利；
停損統一（打到停損，剩餘口數一次全部出場，不分批停損）。

跟 backtest/engine.py 的差異：BacktestEngine 一次進場只有一組停損停利、
固定口數；這裡允許『多組停利點 + 各自口數』，其餘規則（下一根K開盤進場、
收盤強制平倉、進場截止時間、同根K停損停利衝突時保守假設先觸停損）
都跟原本引擎一致，方便互相比較。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import datetime as dt

import pandas as pd

from config import BacktestConfig
from backtest.engine import BacktestResult
from strategies.base import Strategy


@dataclass
class ScaleOutLeg:
    entry_ts: pd.Timestamp
    exit_ts: pd.Timestamp
    direction: int            # +1 多 / -1 空
    entry_price: float
    exit_price: float
    exit_reason: str          # tp1/tp2/.../sl/eod
    lots: int
    points: float
    gross_pnl: float
    cost: float
    net_pnl: float
    date: object = None


def _to_time(s: str) -> dt.time:
    h, m = s.split(":")
    return dt.time(int(h), int(m))


def _minutes(t: dt.time) -> int:
    return t.hour * 60 + t.minute


class ScaleOutEngine:
    def __init__(self, config: BacktestConfig, tp_levels: list[tuple[float, int]]):
        """tp_levels: [(停利點數, 口數), ...]，由近到遠排序；口數加總 = 這次進場的總口數。
        停損統一用 config.stop_loss_points，打到時剩餘所有口數一次出場。"""
        self.cfg = config
        self.tp_levels = sorted(tp_levels, key=lambda x: x[0])
        self.total_lots = sum(lots for _, lots in tp_levels)
        self._start_min = _minutes(_to_time(config.session_start))
        self._cutoff_min = self._elapsed(_to_time(config.entry_cutoff))
        self._close_min = self._elapsed(_to_time(config.session_close))

    def _elapsed(self, t: dt.time) -> int:
        m = _minutes(t) - self._start_min
        return m if m >= 0 else m + 24 * 60

    def run(self, prepared: pd.DataFrame, strategy: Strategy) -> BacktestResult:
        cfg = self.cfg
        pv = cfg.point_value
        sl = cfg.stop_loss_points
        prepared = prepared.copy()
        prepared["ts"] = pd.to_datetime(prepared["ts"])
        if "date" not in prepared.columns:
            prepared["date"] = prepared["ts"].dt.date

        legs: list[ScaleOutLeg] = []

        for day_date, day in prepared.groupby("date"):
            day = day.sort_values("ts").reset_index(drop=True)
            position = 0
            entry_price = 0.0
            entry_ts = None
            pending = 0
            remaining: list[tuple[float, int]] = []  # 還沒出場的 (停利點數, 口數)

            for row in day.itertuples(index=False):
                te = self._elapsed(row.ts.time())

                if (position == 0 and pending != 0
                        and te < self._cutoff_min and te < self._close_min):
                    position = pending
                    entry_price = float(row.open)
                    entry_ts = row.ts
                    remaining = list(self.tp_levels)

                if position != 0:
                    stop = entry_price - sl if position == 1 else entry_price + sl
                    hit_sl = (row.low <= stop) if position == 1 else (row.high >= stop)

                    if hit_sl:
                        lots_left = sum(l for _, l in remaining)
                        if lots_left > 0:
                            legs.append(self._make_leg(
                                entry_ts, row.ts, position, entry_price, stop,
                                "sl", lots_left, pv, cfg, day_date))
                        position = 0
                        remaining = []
                    else:
                        still_open = []
                        for i, (tp_points, lots) in enumerate(remaining):
                            target = entry_price + tp_points if position == 1 else entry_price - tp_points
                            hit_tp = (row.high >= target) if position == 1 else (row.low <= target)
                            if hit_tp:
                                legs.append(self._make_leg(
                                    entry_ts, row.ts, position, entry_price, target,
                                    f"tp{i + 1}", lots, pv, cfg, day_date))
                            else:
                                still_open.append((tp_points, lots))
                        remaining = still_open

                        if not remaining:
                            position = 0
                        elif te >= self._close_min:
                            lots_left = sum(l for _, l in remaining)
                            legs.append(self._make_leg(
                                entry_ts, row.ts, position, entry_price, float(row.close),
                                "eod", lots_left, pv, cfg, day_date))
                            position = 0
                            remaining = []

                pending = int(getattr(row, "signal", 0) or 0)

            if position != 0 and remaining:
                last = day.iloc[-1]
                lots_left = sum(l for _, l in remaining)
                legs.append(self._make_leg(
                    entry_ts, last.ts, position, entry_price, float(last.close),
                    "eod", lots_left, pv, cfg, day_date))

        return self._build_result(legs)

    @staticmethod
    def _make_leg(entry_ts, exit_ts, direction, entry_price, exit_price,
                 reason, lots, pv, cfg, day_date) -> ScaleOutLeg:
        points = (exit_price - entry_price) * direction
        gross = points * pv * lots
        cost = cfg.cost.round_trip_cost(entry_price, exit_price, pv, lots)
        return ScaleOutLeg(
            entry_ts=entry_ts, exit_ts=exit_ts, direction=direction,
            entry_price=entry_price, exit_price=exit_price, exit_reason=reason,
            lots=lots, points=points, gross_pnl=gross, cost=cost, net_pnl=gross - cost,
            date=day_date,
        )

    def _build_result(self, legs: list[ScaleOutLeg]) -> BacktestResult:
        if not legs:
            empty = pd.DataFrame()
            return BacktestResult(empty, empty, self.cfg)
        tdf = pd.DataFrame([l.__dict__ for l in legs])
        daily = (tdf.groupby("date")["net_pnl"].sum()
                 .rename("pnl").reset_index())
        daily["equity"] = daily["pnl"].cumsum()
        return BacktestResult(tdf, daily, self.cfg)
