@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
echo.
echo ================================================
echo   正在启动 AI 创意美术教学平台本地预览...
echo   首次启动约需 5-15 秒，请不要关闭这个窗口
echo ================================================
echo.
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-preview.ps1" -WebPort 5173 -ServerPort 3000
set "RC=%errorlevel%"
echo.
if "%RC%"=="0" (
  echo ================================================
  echo   [成功] 预览已启动，浏览器应该已经打开了
  echo   地址: http://127.0.0.1:5173/student/paint
  echo.
  echo   这个窗口可以直接关闭，服务不会停。
  echo   要停止服务：双击「停止本地预览.cmd」
  echo ================================================
) else (
  echo ================================================
  echo   [失败] 启动没有成功，错误码 %RC%
  echo   请把本窗口的报错内容截图发给技术同学
  echo   日志位置: logs\preview-web.out.log / logs\preview-web.err.log
  echo ================================================
)
echo.
pause
exit /b %RC%
