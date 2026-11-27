param([int]$WebPort = 5173, [int]$ServerPort = 3000)
$projectRoot = Split-Path -Parent $PSScriptRoot
foreach ($port in @($WebPort, $ServerPort)) {
  $matches = netstat -ano | Select-String (":$port\s+.*LISTENING\s+(\d+)$")
  foreach ($match in @($matches)) {
    $processId = [int]$match.Matches[0].Groups[1].Value
    try { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } catch {}
  }
}
Write-Host "Stopped project preview processes (web $WebPort, server $ServerPort)."
