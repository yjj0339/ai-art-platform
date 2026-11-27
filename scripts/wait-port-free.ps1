param(
  [int[]]$Ports = @(3000, 5173),
  [int]$TimeoutSeconds = 5
)

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  $busy = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $Ports -contains $_.LocalPort }
  if (-not $busy) { exit 0 }
  Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $deadline)

exit 1
