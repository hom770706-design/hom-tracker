@echo off
chcp 65001 >nul
title Podcast YouTube 代理伺服器

echo ================================================
echo  Podcast 轉文字稿 - YouTube 代理伺服器
echo ================================================
echo.

:: 檢查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [錯誤] 找不到 Python！
    echo.
    echo 請先安裝 Python：
    echo   1. 開啟 https://www.python.org/downloads/
    echo   2. 下載並安裝（記得勾選 "Add to PATH"）
    echo   3. 安裝完成後重新執行此檔案
    echo.
    pause
    exit /b 1
)

:: 切換到腳本所在目錄
cd /d "%~dp0"

:: 啟動代理伺服器
python ytdlp_proxy.py

pause
