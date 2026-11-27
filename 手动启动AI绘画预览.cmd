@echo off
chcp 65001 >nul
set "WEB_PORT=5173"
set "SERVER_PORT=3000"
set /p "WEB_PORT=Web port (Enter=5173): "
if not defined WEB_PORT set "WEB_PORT=5173"
set /p "SERVER_PORT=Server port (Enter=3000): "
if not defined SERVER_PORT set "SERVER_PORT=3000"
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-preview.ps1" -WebPort %WEB_PORT% -ServerPort %SERVER_PORT%
pause
