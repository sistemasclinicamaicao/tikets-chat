@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
set "REPO=%cd%"

echo ============================================
echo  Chat-Tikets - inicio automatico (local)
echo  Repo: %REPO%
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%REPO%\scripts\iniciar-desarrollo-local.ps1" %*

echo.
pause
endlocal
