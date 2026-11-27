@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-preview.ps1" -WebPort 5173 -ServerPort 3000
if errorlevel 1 pause
exit /b %errorlevel%
