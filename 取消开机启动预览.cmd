@echo off
chcp 65001 >nul
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$p=Join-Path ([Environment]::GetFolderPath('Startup')) 'AI创意美术教学平台预览.lnk'; if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force }; Write-Host '已取消登录后启动预览。'"
pause
