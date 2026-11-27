@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-preview.ps1" -WebPort 5173 -ServerPort 3000 -Lan
echo.
echo 上面 "Tablet/LAN" 那一行的地址，就是平板上要打开的网址。
echo 平板必须和这台电脑连同一个 Wi-Fi，然后用浏览器输入这个地址。
echo.
pause