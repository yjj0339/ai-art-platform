@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "WEB_PORT=5173"
set "SERVER_PORT=3000"
set /p "WEB_PORT=请输入要停止的前端端口（直接回车使用 5173）："
if not defined WEB_PORT set "WEB_PORT=5173"
set /p "SERVER_PORT=请输入要停止的后端端口（直接回车使用 3000）："
if not defined SERVER_PORT set "SERVER_PORT=3000"

for %%P in (%WEB_PORT% %SERVER_PORT%) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /r /c:":%%P .*LISTENING"') do taskkill /PID %%I /T /F >nul 2>&1
)
echo 已尝试停止前端端口 %WEB_PORT% 和后端端口 %SERVER_PORT%。
pause
