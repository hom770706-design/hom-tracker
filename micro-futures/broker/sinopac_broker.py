"""
永豐金證券 Shioaji API 券商介面（第二階段：模擬盤 / 下單）。

跟元大不一樣，Shioaji 是純 Python 套件（`pip install shioaji`），不需要
Windows COM/DLL 元件安裝，理論上不限本機環境。

設定：
    pip install shioaji

    # .env 或環境變數（切勿進 git，.gitignore 已經排除 .env）：
    #   SHIOAJI_API_KEY=...
    #   SHIOAJI_SECRET_KEY=...
    # 這組金鑰要在永豐金開戶後，到 Shioaji 簽署中心申請「期貨」API 使用權限並簽署條款：
    # https://sinotrade.github.io/zh/tutor/prepare/terms/

模擬盤跑法（概念，呼應 yuanta_stub.py 原本的設計）：
    broker = SinopacBroker(simulate=True)
    broker.connect()
    broker.subscribe("MXF")
    while 盤中:
        bar = broker.get_latest_bar("MXF")
        signal = strategy.entry_signal(bar)
        if signal and broker.position("MXF") == 0:
            broker.place_order("MXF", signal, lots=1)
    broker.close_all("MXF")

已知、還沒能力驗證的事（等你申請到帳號、能真的登入之後要一起確認）：
1. 舊教學文件常提到的「公開測試帳號」(person_id=PAPIUSER01, passwd=2222)
   在目前安裝的版本（shioaji==1.7.0）已經失效——`Shioaji.login()` 現在
   只吃 `api_key`/`secret_key`，代表就算是 simulation 模式，也需要你
   自己申請、簽署過的金鑰才能連線，不能用公開帳密先試。這件事已經
   實測確認過（呼叫時噴 TypeError），不是猜的。
2. TMF（微台）2024/7 才上市，Shioaji 的 `Contracts.Futures` 底下有沒有
   TMF 這個分類、代碼命名規則是什麼，沒登入查不到，還沒驗證過。
   `_contract()` 目前假設代碼命名是「近月連續 = f"{product}R1"」，這是
   業界常見慣例但沒有針對 Shioaji 實測過，很可能要調整。
   如果 Shioaji 真的沒有 TMF，就跟專案原本「資料用 MTX(小台)走勢、
   損益換算成 TMF 每點金額」的做法一致，改成連下單也用 MXF（小台），
   只是部位大小要記得換算（TMF 一口 vs MXF 一口的槓桿/保證金差很多，
   不能直接 1:1 代換口數）。
3. 以下所有方法簽章（`sj.FuturesOrder(...)` 的必要欄位、`Action`/
   `FuturesOCType`/`FuturesPriceType`/`OrderType` 這幾個 enum 的值、
   `place_order`/`list_positions` 的參數）都是直接內省安裝好的
   shioaji 套件本身得到的，不是查教學文件猜的——但『內省』只能看到
   介面形狀，看不到登入後的實際行為（例如 place_order 送出後多久
   會觸發 on_order callback、模擬環境的部位查詢延遲多久才更新），
   這些要等真的登入才能測。
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field

try:
    import shioaji as sj
except ImportError:  # pragma: no cover
    sj = None


@dataclass
class BrokerConfig:
    api_key: str = field(default_factory=lambda: os.environ.get("SHIOAJI_API_KEY", ""))
    secret_key: str = field(default_factory=lambda: os.environ.get("SHIOAJI_SECRET_KEY", ""))
    simulate: bool = True  # True = 連 Shioaji 的 simulation 環境


class SinopacBroker:
    """永豐 Shioaji 介面。跟 backtest 引擎共用同一套策略訊號邏輯。"""

    def __init__(self, config: BrokerConfig | None = None):
        if sj is None:
            raise ImportError("請先 `pip install shioaji`")
        self.cfg = config or BrokerConfig()
        self.api = sj.Shioaji(simulation=self.cfg.simulate)
        self._latest_bar: dict[str, dict] = {}
        self._lock = threading.Lock()
        self._contracts: dict[str, object] = {}

    def connect(self):
        if not self.cfg.api_key or not self.cfg.secret_key:
            raise ValueError(
                "請在環境變數或 .env 設定 SHIOAJI_API_KEY / SHIOAJI_SECRET_KEY"
                "（永豐金開戶後到 Shioaji 簽署中心申請期貨 API 權限）"
            )
        self.api.login(api_key=self.cfg.api_key, secret_key=self.cfg.secret_key)

    def _contract(self, product: str):
        """product 例如 'MXF'（小台）、'TXF'（大台）、'TMF'（微台，若已上市）。
        代碼命名規則（近月連續 = f"{product}R1"）還沒實測過，見檔案開頭說明。"""
        if product not in self._contracts:
            category = getattr(self.api.Contracts.Futures, product)
            self._contracts[product] = category[f"{product}R1"]
        return self._contracts[product]

    def subscribe(self, product: str):
        """訂閱即時逐筆成交，內部維護「目前最新一筆報價」當作 bar 用。"""
        contract = self._contract(product)

        @self.api.on_tick_fop_v1(bind=True)
        def _on_tick(api, tick):  # noqa: ANN001
            if tick.code != contract.code:
                return
            with self._lock:
                price = float(tick.close)
                self._latest_bar[product] = {
                    "ts": tick.datetime,
                    "open": price, "high": price, "low": price, "close": price,
                    "volume": tick.volume,
                }

        self.api.subscribe(contract, quote_type=sj.QuoteType.Tick)

    def get_latest_bar(self, product: str) -> dict | None:
        """回傳目前收到的最新一筆報價（用最新成交價模擬 OHLC，不是真正的分K）。
        真正要用分K的話，這裡之後可以改成每分鐘自己把逐筆彙整成一根K，
        跟 taifex_loader._aggregate_minute() 邏輯一樣。"""
        with self._lock:
            return self._latest_bar.get(product)

    def position(self, product: str) -> int:
        """回傳目前口數，正數=多、負數=空、0=空手。"""
        contract = self._contract(product)
        positions = self.api.list_positions(self.api.futopt_account)
        for p in positions:
            if p.code == contract.code:
                qty = int(p.quantity)
                return qty if p.direction == sj.Action.Buy else -qty
        return 0

    def place_order(self, product: str, direction: int, lots: int = 1):
        """direction: +1 做多、-1 做空。用市價單（MKT）、ROD、自動判斷開平倉（Auto）。"""
        contract = self._contract(product)
        order = self.api.FuturesOrder(
            action=sj.Action.Buy if direction > 0 else sj.Action.Sell,
            price=0,
            quantity=lots,
            price_type=sj.FuturesPriceType.MKT,
            order_type=sj.OrderType.ROD,
            octype=sj.FuturesOCType.Auto,
            account=self.api.futopt_account,
        )
        return self.api.place_order(contract, order)

    def close_all(self, product: str):
        pos = self.position(product)
        if pos != 0:
            self.place_order(product, -1 if pos > 0 else 1, lots=abs(pos))
