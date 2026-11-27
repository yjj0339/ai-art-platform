@echo off
chcp 65001 >nul
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "TARGET=%~dp0启动本地预览.cmd"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$startup=[Environment]::GetFolderPath('Startup'); $ws=New-Object -ComObject WScript.Shell; $sc=$ws.CreateShortcut((Join-Path $startup 'AI创意美术教学平台预览.lnk')); $sc.TargetPath=$env:ComSpec; $sc.Arguments='/c ""%TARGET%""'; $sc.WorkingDirectory='%~dp0'; $sc.Save(); Write-Host '已设置登录后启动预览。'"
pause
