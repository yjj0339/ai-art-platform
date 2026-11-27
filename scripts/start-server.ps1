param([int]$ServerPort = 3000, [string]$ProxyUrl = 'http://127.0.0.1:15721')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  $searchRoots = @(
    (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes\cua_node'),
    (Join-Path $env:USERPROFILE '.cache\codex-runtimes')
  )
  foreach ($root in $searchRoots) {
    if (Test-Path -LiteralPath $root) {
      $candidate = Get-ChildItem -LiteralPath $root -Filter node.exe -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($candidate) { $node = $candidate.FullName; break }
    }
  }
}
if (-not $node) { throw 'Node.js not found.' }
$busy = Get-NetTCPConnection -LocalPort $ServerPort -State Listen -ErrorAction SilentlyContinue
if ($busy) { Write-Host "Server port $ServerPort is already running."; exit 0 }
$env:PORT = "$ServerPort"
$env:HTTP_PROXY = $ProxyUrl
$env:HTTPS_PROXY = $ProxyUrl
$env:ALL_PROXY = $ProxyUrl
Push-Location $projectRoot
try { & $node (Join-Path (Join-Path $projectRoot 'server') 'index.js') }
finally { Pop-Location }
