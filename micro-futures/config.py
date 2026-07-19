"""
全域設定：合約規格、交易成本、回測預設參數。

重點觀念：
- 台指期不論大台(TX)/小台(MTX)/微台(TMF)，走勢（指數點位）都是同一個。
  差別只在「每點多少錢」（契約乘數）。
- 因此我們用 TAIFEX 的小台(MTX)逐筆成交來還原 1 分K 走勢，
  損益再用「微台(TMF)每點 10 元」換算即可。
"""

from dataclasses import dataclass, field


# --- 合約規格（每點新台幣元）---
CONTRACT_POINT_VALUE = {
    "TX": 200,    # 大台（臺股期貨）
    "MTX": 50,    # 小台（小型臺指期貨）
    "TMF": 10,    # 微台（微型臺指期貨）—— 我們實際要交易的商品
}

# 回測資料抓哪個商品的走勢（小台流動性好、資料完整）
DATA_PRODUCT = "MTX"

# 損益用哪個商品的點值換算（我們真正要下單的微台）
TRADE_PRODUCT = "TMF"


@dataclass
class CostConfig:
    """交易成本設定（每一口、單邊）。數字為預設值，可依你的券商調整。"""
    fee_per_side: float = 12.0          # 手續費：每口每邊（微台通常較低，實際看券商）
    tax_rate: float = 0.00002           # 期交稅：契約總金額的十萬分之二（單邊）

    def round_trip_cost(self, entry_price: float, exit_price: float,
                        point_value: float, lots: int = 1) -> float:
        """一趟完整交易（進+出）的總成本。"""
        fee = self.fee_per_side * 2 * lots
        # 期交稅 = 成交價 * 契約乘數 * 稅率，買賣各一次
        tax = (entry_price + exit_price) * point_value * self.tax_rate * lots
        return fee + tax


@dataclass
class BacktestConfig:
    """回測預設參數（日內當沖）。"""
    # 資料
    data_product: str = DATA_PRODUCT
    trade_product: str = TRADE_PRODUCT
    bar_minutes: int = 1                 # 聚合成幾分K

    # 交易規則
    lots: int = 1                        # 每次固定口數
    stop_loss_points: float = 30.0       # 固定停損（點）
    take_profit_points: float = 60.0     # 固定停利（點）
    allow_reverse: bool = False          # 出現反向訊號時是否直接反手（先關閉，較單純）

    # 當沖時間（日盤）。收盤前平倉，不留倉。
    session_start: str = "08:45"
    entry_cutoff: str = "13:00"          # 這時間後不再開新倉（避免尾盤才進場）
    session_close: str = "13:44"         # 這時間強制平倉

    # 成本
    cost: CostConfig = field(default_factory=CostConfig)

    @property
    def point_value(self) -> float:
        """實際下單商品（微台）的每點金額。"""
        return CONTRACT_POINT_VALUE[self.trade_product]


# 專案路徑
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "cache")
REPORT_DIR = os.path.join(BASE_DIR, "reports")
