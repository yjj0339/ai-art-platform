param([string]$ProxyUrl = 'http://127.0.0.1:15721')
$ErrorActionPreference = 'SilentlyContinue'
$targets = @(
  'https://api.agnes-ai.cn/v1/models',
  'https://ark.cn-beijing.volces.com/api/v3/models',
  'https://api.openai.com/v1/models'
)
$failed = @()
foreach ($target in $targets) {
  $result = curl.exe -4 -sS -o NUL -w '%{http_code}' --proxy $ProxyUrl --connect-timeout 4 --max-time 8 $target 2>$null
  if ([string]$result -eq '000') { $failed += $target }
}
if ($failed.Count) {
  Write-Host 'AI network proxy is not ready.'
  Write-Host "Proxy: $ProxyUrl"
  Write-Host 'Please start/repair the proxy client and its HTTPS/TUNNEL node, then retry.'
  exit 1
}
Write-Host 'AI network proxy is ready.'
