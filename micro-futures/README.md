# 微台日內當沖 — 程式交易框架

用 Python 對**微型臺指期貨(TMF)**做日內當沖策略的**回測**，並預留第二階段的**每日模擬盤 / 元大下單**介面。

> 觀念：台指期大台/小台/微台走勢相同，差別只在每點金額。本框架用小台(MTX)的
> 逐筆成交還原 1 分K 走勢，損益再用微台每點 **10 元** 換算。

## 目錄結構

```
micro-futures/
├── config.py              # 合約規格、成本、停損停利等預設參數
├── data/
│   ├── taifex_loader.py   # 下載 TAIFEX 逐筆 → 聚合 1 分K → parquet 快取 / 每日累積 / demo 合成資料
│   └── finmind_loader.py  # 輔助：FinMind 免費日K、三大法人籌碼
├── indicators/ta.py       # EMA/SMA/KD/RSI/ATR
├── strategies/            # 策略（回測與模擬盤共用同一介面）
│   ├── base.py
│   ├── ma_cross.py        # 均線交叉
│   ├── kd_cross.py        # KD 交叉
│   └── orb.py             # 開盤區間突破
├── backtest/
│   ├── engine.py          # 日內當沖回測引擎（停損停利、收盤平倉、成本）
│   └── metrics.py         # 績效指標 + 報告 + 損益曲線圖
├── broker/yuanta_stub.py  # 元大介面骨架（第二階段）
└── run_backtest.py        # 回測進入點
```

## 快速開始

```bash
pip install -r requirements.txt

# 1) 無需網路，用 demo 合成資料跑通整條流程（先確認框架 OK）
python run_backtest.py --strategy all --demo 30

# 2) 下載真實分K（在你自己電腦、每天收盤後執行）
python -m data.taifex_loader --backfill 30      # 一次補最近 30 個交易日
python -m data.taifex_loader --date 2026-07-18  # 每天只抓當天（可設 Windows 工作排程器）

# 3) 用真實資料回測
python run_backtest.py --strategy orb
python run_backtest.py --strategy ma_cross --sl 25 --tp 50
```

## 資料來源說明

| 用途 | 來源 | 費用 |
|------|------|------|
| 回測分K（當沖） | 期交所 TAIFEX 逐筆 → 聚合 1 分K（免費僅最近 30 交易日，之後靠每日累積） | 免費 |
| 日K / 三大法人籌碼 | FinMind 免費版（設 `FINMIND_TOKEN`） | 免費 |
| 模擬盤 / 下單 | 元大 SmartAPI / SPARK API（第二階段，你的帳號） | 免費 |

## 重要提醒

- **demo 資料是合成的隨機走勢，只用來驗證程式流程，績效數字沒有參考意義。**
- 真正每天接元大、抱單、下單的模擬盤，建議在**你自己的 Windows 電腦**跑
  （這雲端環境是暫時性的、會被回收）。帳號憑證只放本機 `.env`，切勿進 git。
- 回測績效不代表未來，實單前務必用模擬盤充分驗證、控制風險。
```
