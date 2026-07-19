"""
元大券商介面（第二階段：每日模擬盤 / 下單）—— 目前只是骨架。

設計目的：讓「回測」與「模擬盤/實盤」共用同一套策略。
第二階段時，在你自己的 Windows 電腦上：
  1. 安裝元大 API 元件（SmartAPI / SPARK API）與對應 Python 套件
  2. 把下面各方法接到元大 API 的實際呼叫
  3. 帳號密碼/憑證放本機 .env，切勿進 git

模擬盤跑法（概念）：
  broker = YuantaBroker(simulate=True)   # simulate=True 時只記錄假單、不真的送出
  broker.connect()
  while 盤中:
      bar = broker.get_latest_bar("TMF")          # 取即時分K
      signal = strategy.entry_signal(bar)         # 與回測共用的策略
      if signal and broker.position() == 0:
          broker.place_order("TMF", signal, lots=1)
      # 停損/停利/收盤平倉邏輯（可從 backtest.engine 抽出共用）
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BrokerConfig:
    account: str = ""
    simulate: bool = True     # True = 模擬盤（不真的下單）


class YuantaBroker:
    """元大介面骨架。第二階段再實作。"""

    def __init__(self, config: BrokerConfig | None = None):
        self.cfg = config or BrokerConfig()

    def connect(self):
        raise NotImplementedError("第二階段實作：連線元大 API")

    def get_latest_bar(self, product: str):
        raise NotImplementedError("第二階段實作：取得即時分K")

    def position(self) -> int:
        raise NotImplementedError("第二階段實作：查詢目前部位")

    def place_order(self, product: str, direction: int, lots: int = 1):
        raise NotImplementedError("第二階段實作：下單（simulate=True 時記錄假單）")

    def close_all(self, product: str):
        raise NotImplementedError("第二階段實作：全部平倉")
