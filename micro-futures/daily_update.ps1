# 每日排程用：更新當天真實成交快取，再跑 ORB 模擬盤記錄。
# 由 Windows 工作排程器呼叫，非交易日 taifex_loader 會抓不到資料但不會中斷。
#
# 平日觸發一次：20:00，跟另一個 ETF-Active-Tracker 排程整併成同一個時間，
# 方便只記一個時間點。原本 14:00/16:30 兩次分開嘗試是為了應付日盤收盤後
# 資料偶爾不完整的問題；20:00 已經比兩次嘗試都晚很多（taifex_loader 內部
# 本身也有重試機制，見 data/taifex_loader.py 的 RETRY_ATTEMPTS），實務上
# 資料到這個時間點應該都穩了。是安全時間點（day session 早就收盤、資料
# 不會再變；不會撞到夜盤中途的部位強制平倉風險）。整支腳本是增量/冪等
# 設計（taifex_loader 用 date 去重、paper_trade.py 只處理還沒記錄過的
# 交易時段），就算之後想再加一次保險檢查、同一天跑兩次也完全安全。
#
# 工作排程器設定：這個工作跟 ETF-Active-Tracker 都設了 WakeToRun（連同
# Windows 電源設定的「允許喚醒計時器」），2026-08-04 系統事件日誌實測
# 驗證過睡眠中的電腦真的會被排程器叫醒（喚醒來源明確記錄是排定的工作），
# 兩個排程都準時執行成功、NumberOfMissedRuns 是 0。
#
# 另外還有一個獨立的 WakeBuffer_20h00 排程，19:57（提早 3 分鐘）觸發、
# 動作只是 `cmd /c exit`（什麼都不做），純粹負責提前把電腦叫醒，讓
# 20:00 這兩個真正做事的排程執行時系統已經完全清醒、留一點 buffer，
# 不是把這兩個工作本身的時間往前移。

$ErrorActionPreference = 'Continue'
$env:PYTHONIOENCODING = 'utf-8'

$ProjectDir = "C:\Users\User\Desktop\Claude Project\台指期測試\hom-tracker\micro-futures"
$LogDir = Join-Path $ProjectDir "reports"
$LogFile = Join-Path $LogDir "daily_run.log"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$today = Get-Date -Format "yyyy-MM-dd"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Add-Content -Path $LogFile -Value "===== $stamp 開始執行（交易日：$today） =====" -Encoding utf8

Set-Location $ProjectDir

py -m data.taifex_loader --date $today 2>&1 | Add-Content -Path $LogFile -Encoding utf8
py paper_trade.py --session day 2>&1 | Add-Content -Path $LogFile -Encoding utf8
py paper_trade.py --session night 2>&1 | Add-Content -Path $LogFile -Encoding utf8
py paper_trade.py --session day --variant combo 2>&1 | Add-Content -Path $LogFile -Encoding utf8
py paper_trade.py --session day --variant chip 2>&1 | Add-Content -Path $LogFile -Encoding utf8
py paper_trade.py --session night --variant us_open 2>&1 | Add-Content -Path $LogFile -Encoding utf8

Add-Content -Path $LogFile -Value "===== $stamp 執行完成 =====`n" -Encoding utf8
