"""
輔助資料層：FinMind 免費版（日K、三大法人籌碼）。

免費版沒有期貨『分K』，只有日K —— 分K請用 taifex_loader。
這裡的資料適合拿來做『過濾條件』，例如：只在三大法人偏多的日子做多。

需在環境變數設定 FINMIND_TOKEN（.env 亦可），沒 token 也能用但額度較低。
"""

from __future__ import annotations

import os

import pandas as pd
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:  # noqa: BLE001
    pass

BASE_URL = "https://api.finmindtrade.com/api/v4/data"


def _fetch(dataset: str, params: dict) -> pd.DataFrame:
    token = os.environ.get("FINMIND_TOKEN", "")
    query = {"dataset": dataset, **params}
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    resp = requests.get(BASE_URL, params=query, headers=headers, timeout=30)
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("status") != 200:
        raise RuntimeError(payload.get("msg", "FinMind error"))
    return pd.DataFrame(payload["data"])


def futures_daily(data_id: str = "MTX", start_date: str = "2020-01-01") -> pd.DataFrame:
    """期貨日K（免費）。"""
    return _fetch("TaiwanFuturesDaily", {"data_id": data_id, "start_date": start_date})


def institutional_futures(start_date: str = "2020-01-01") -> pd.DataFrame:
    """期貨三大法人買賣（免費），可作為策略過濾條件。"""
    return _fetch("TaiwanFuturesInstitutionalInvestors", {"start_date": start_date})
