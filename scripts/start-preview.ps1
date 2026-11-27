param([int]$WebPort = 5173, [int]$ServerPort = 3000, [string]$ProxyUrl = 'http://127.0.0.1:15721', [switch]$NoBrowser, [switch]$Lan)
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads .ps1 as ANSI when the
# file has no BOM, so non-ASCII comments/strings get garbled and break the parser.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $runtimeRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes'
  if (Test-Path -LiteralPath $runtimeRoot) {
    $candidate = Get-ChildItem -LiteralPath $runtimeRoot -Filter node.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) { $node = $candidate.FullName }
  }
}
if (-not $node) { throw 'Node.js not found.' }

function Get-ListeningPids([int]$port) {
  netstat -ano | Select-String (":$port\s+.*LISTENING\s+(\d+)$") | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Select-Object -Unique
}

# A single 250ms TcpClient probe is unreliable (first connect after boot, or a port the OS
# just released, can both miss). That used to raise a false "startup timed out" and then the
# script killed a service that had actually started fine - the user just saw "cannot start".
function Test-Port([int]$port) {
  for ($attempt = 0; $attempt -lt 3; $attempt++) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $task = $client.ConnectAsync('127.0.0.1', $port)
      if ($task.Wait(600) -and $client.Connected) { return $true }
    } catch {} finally { $client.Dispose() }
    Start-Sleep -Milliseconds 150
  }
  # Fallback for environments where local TCP connect is blocked: port has a listener.
  return [bool](@(Get-ListeningPids $port).Count)
}

function Get-LogText([string]$name) {
  $path = Join-Path $logDir $name
  if (Test-Path -LiteralPath $path) { return (Get-Content -LiteralPath $path -Raw -ErrorAction SilentlyContinue) }
  return ''
}

if (Test-Port $ServerPort -or Test-Port $WebPort) {
  $runningPids = @()
  foreach ($port in @($ServerPort, $WebPort)) { $runningPids += @(Get-ListeningPids $port) }
  Write-Host "Preview is already running (ports $ServerPort/$WebPort, PIDs: $($runningPids -join ', '))."
  Write-Host 'Restarting to load the latest code...'
}
foreach ($port in @($ServerPort, $WebPort)) {
  foreach ($processId in @(Get-ListeningPids $port)) { try { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } catch {} }
}
Start-Sleep -Milliseconds 800
# A process killed a moment ago may still be holding the port for a short while. Wait for it
# instead of failing immediately - otherwise a quick second click reports "port in use" even
# though nothing is really there anymore.
$freeDeadline = (Get-Date).AddSeconds(8)
foreach ($port in @($ServerPort, $WebPort)) {
  while ((Get-Date) -lt $freeDeadline -and (Test-Port $port)) { Start-Sleep -Milliseconds 300 }
  if (Test-Port $port) {
    foreach ($processId in @(Get-ListeningPids $port)) {
      try { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } catch {}
    }
    Start-Sleep -Milliseconds 1200
  }
  if (Test-Port $port) { throw "Port $port is still in use by another program. Close it and retry." }
}
$env:PORT = "$ServerPort"
$env:VITE_SERVER_PORT = "$ServerPort"
$env:VITE_API_PROXY_TARGET = "http://127.0.0.1:$ServerPort"
Remove-Item Env:HTTP_PROXY, Env:HTTPS_PROXY, Env:ALL_PROXY, Env:http_proxy, Env:https_proxy, Env:all_proxy -ErrorAction SilentlyContinue
$directProbe = curl.exe -4 -sS -o NUL -w '%{http_code}' --connect-timeout 4 --max-time 8 'https://ark.cn-beijing.volces.com/api/v3/models' 2>$null
if ("$directProbe" -ne '000') {
  Write-Host 'AI network: direct connection is available, no proxy will be used.'
} else {
  $env:HTTP_PROXY = $ProxyUrl
  $env:HTTPS_PROXY = $ProxyUrl
  $env:ALL_PROXY = $ProxyUrl
  $networkCheck = & (Join-Path $PSScriptRoot 'check-ai-network.ps1') -ProxyUrl $ProxyUrl
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "AI network is unavailable (proxy $ProxyUrl). Image/video generation may fail until the proxy is repaired."
  }
}

# Launch as a separate process with its own (hidden) console, redirecting output to logs.
# Start-Process intentionally omits -NoNewWindow: node must not stay on the launcher console,
# otherwise closing the launcher window can take the servers down with it.
$devArgs = @('scripts/dev.mjs', '--web-port', "$WebPort", '--server-port', "$ServerPort")
if ($Lan) { $devArgs += @('--host', '0.0.0.0') }
$proc = Start-Process -FilePath $node -ArgumentList $devArgs -WorkingDirectory $projectRoot -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDir 'preview-web.out.log') `
  -RedirectStandardError (Join-Path $logDir 'preview-web.err.log') -PassThru
if (-not $proc) { throw 'Failed to spawn the preview process.' }

$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline -and (-not (Test-Port $ServerPort) -or -not (Test-Port $WebPort))) { Start-Sleep -Milliseconds 500 }
$serverUp = Test-Port $ServerPort
$webUp = Test-Port $WebPort

if (-not $serverUp -or -not $webUp) {
  # Never blind-call stop-preview here. The previous version did exactly that and killed a
  # service that had already come up, which is why clicking the launcher looked like a total
  # failure. Decide by log evidence first, and only stop when there is no startup trace at all.
  $outText = Get-LogText 'preview-web.out.log'
  $errText = Get-LogText 'preview-web.err.log'
  $hasBackendLog = $outText -match 'AI backend gateway running'
  $hasViteLog = $outText -match 'ready in'
  if ($hasBackendLog -or $hasViteLog -or $serverUp -or $webUp) {
    Write-Warning 'Port probe did not pass, but the startup log shows the services are up. Not stopping them.'
    Write-Host ("  server 3000 listening: " + $(if ($serverUp) { 'yes' } else { 'no' }))
    Write-Host ("  web 5173 listening:    " + $(if ($webUp) { 'yes' } else { 'no' }))
    Write-Host ("  backend startup log:   " + $(if ($hasBackendLog) { 'yes' } else { 'no' }))
    Write-Host ("  vite ready log:        " + $(if ($hasViteLog) { 'yes' } else { 'no' }))
    if ($errText) {
      Write-Host '--- tail of logs\preview-web.err.log ---'
      Write-Host ($errText.Substring([Math]::Max(0, $errText.Length - 1200)))
    }
  } else {
    & (Join-Path $PSScriptRoot 'stop-preview.ps1') -WebPort $WebPort -ServerPort $ServerPort
    throw 'Preview startup timed out (no startup log found). Check logs\preview-*.log.'
  }
}

$url = "http://127.0.0.1:$WebPort/student/paint"
Write-Host "Preview started: $url"
Write-Host "API health: http://127.0.0.1:$ServerPort/api/health"
if ($Lan) {
  $lanIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -ExpandProperty IPAddress -Unique
  foreach ($ip in $lanIps) {
    Write-Host "Tablet/LAN: http://${ip}:$WebPort/student/paint"
  }
  if (-not $lanIps) { Write-Warning 'No LAN IPv4 found. Connect this PC to Wi-Fi/LAN first.' }
  Write-Host 'Note: tablet must be on the SAME Wi-Fi; Windows firewall must allow node.exe inbound.'
}
Write-Host 'Tip: if the page was already open, press Ctrl+Shift+R to force reload.'
if (-not $NoBrowser) { Start-Process $url }