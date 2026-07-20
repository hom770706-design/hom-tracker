# 每日排程用：更新當天真實成交快取，再跑 ORB 模擬盤記錄。
# 由 Windows 工作排程器呼叫，非交易日 taifex_loader 會抓不到資料但不會中斷。

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

Add-Content -Path $LogFile -Value "===== $stamp 執行完成 =====`n" -Encoding utf8
