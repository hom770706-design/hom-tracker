# 每日排程用：更新當天真實成交快取，再跑 ORB 模擬盤記錄。
# 由 Windows 工作排程器呼叫，非交易日 taifex_loader 會抓不到資料但不會中斷。
#
# 平日觸發兩次：14:00（日盤收盤後、夜盤開盤前，第一次嘗試）、
# 16:30（第二次保險檢查）。兩者都是安全時間點（day session 早就收盤、
# 資料不會再變；不會撞到夜盤中途的部位強制平倉風險）。整支腳本是
# 增量/冪等設計（taifex_loader 用 date 去重、paper_trade.py 只處理
# 還沒記錄過的交易時段），所以同一天跑兩次完全安全，第二次如果
# 第一次已經成功會直接印出「沒有新的交易時段」，不會重複記錄。

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
