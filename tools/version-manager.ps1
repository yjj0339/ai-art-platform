<#
  版本管理：一键存档 / 一键回退
  ------------------------------------------------------------------
  被同项目根目录下的两个批处理调用（那两个 .cmd 是纯 ASCII，不含中文）：
    存档当前版本.cmd    -> -Action snapshot
    回退到历史版本.cmd  -> -Action rollback

  为什么逻辑写在这里而不是写在 .cmd 里：
    cmd.exe 在 chcp 65001 下读取「含非 ASCII 字符的批处理文件」时，
    会按字节偏移前进而导致逐行错位，把 echo / pause 等命令名截断。
    因此批处理只做一件事：用纯 ASCII 命令启动本脚本。

  注意：本文件必须保存为 UTF-8 with BOM，否则 Windows PowerShell 5.1
        会把中文当成 ANSI 读取而显示乱码。
#>
param(
  [ValidateSet('snapshot','rollback')]
  [string]$Action = 'snapshot'
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Fail([string]$msg) {
  Write-Host ""
  Write-Host $msg
  Write-Host ""
  Read-Host "按回车关闭窗口" | Out-Null
  exit 1
}
function Done() {
  Write-Host ""
  Read-Host "按回车关闭窗口" | Out-Null
  exit 0
}

# ---------- 环境准备 ----------
$scriptDir = Split-Path -Parent $PSCommandPath
$root      = Split-Path -Parent $scriptDir
Set-Location $root

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) { $git = $gitCmd.Source }
elseif (Test-Path 'C:\Program Files\Git\cmd\git.exe') { $git = 'C:\Program Files\Git\cmd\git.exe' }
else { Fail "[错误] 没有找到 git，无法进行版本管理。" }

& $git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Fail "[错误] 这个文件夹不是 Git 仓库：`n  $root" }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-MsgFile([string]$text) {
  $f = Join-Path $env:TEMP "wb-version-msg.txt"
  [System.IO.File]::WriteAllText($f, $text, $utf8NoBom)
  return $f
}

Write-Host "============================================================"

# ---------- 存档 ----------
if ($Action -eq 'snapshot') {
  Write-Host "   存档当前版本   （做新功能之前，先运行一次）"
  Write-Host "============================================================"
  Write-Host ""

  $dirty = @(& $git status --porcelain)
  if ($dirty.Count -eq 0) {
    Write-Host "没有发现任何改动，当前已经是最新存档，跳过。"
    Done
  }

  Write-Host "检测到以下改动将被存档："
  Write-Host "------------------------------------------------------------"
  & $git status --short
  Write-Host "------------------------------------------------------------"
  Write-Host ""

  $msg = Read-Host "给这次存档写一句话说明（直接回车 = 用默认）"
  if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "存档" }

  $ts      = Get-Date -Format 'yyyyMMdd-HHmmss'
  $tagName = "存档-$ts"

  Write-Host ""
  Write-Host "正在提交改动..."

  $msgFile = Write-MsgFile $msg
  & $git add -A 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "[错误] 暂存改动失败，请把窗口内容截图发给技术人员。" }

  & $git commit -F $msgFile 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "[错误] 提交失败，请把窗口内容截图发给技术人员。" }

  & $git tag -a $tagName -F $msgFile 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "[警告] 提交已成功，但打标签失败。" }

  Write-Host ""
  Write-Host "============================================================"
  Write-Host "    存档完成"
  Write-Host "------------------------------------------------------------"
  Write-Host "    存档点：$tagName"
  Write-Host "    说明  ：$msg"
  Write-Host "============================================================"
  Write-Host ""
  Write-Host "以后想退回这个版本，运行「回退到历史版本.cmd」，"
  Write-Host "在弹出的列表里选择它即可。"
  Done
}

# ---------- 回退 ----------
Write-Host "    回退到历史版本"
Write-Host "============================================================"
Write-Host ""

$tags = @(& $git tag --sort=-creatordate)
if ($tags.Count -eq 0) {
  Write-Host "还没有任何存档点，无法回退。"
  Write-Host "请先运行「存档当前版本.cmd」建立第一个存档点。"
  Done
}

Write-Host "已有的存档点（数字越小越新）："
Write-Host "------------------------------------------------------------"
for ($i = 0; $i -lt $tags.Count; $i++) {
  $t = $tags[$i]
  $subj = (@(& $git log -1 --format=%s $t) -join '').Trim()
  Write-Host ("  {0})  {1}" -f ($i + 1), $t)
  if ($subj) { Write-Host ("        说明：{0}" -f $subj) }
}
Write-Host "------------------------------------------------------------"
Write-Host ""

$sel = Read-Host "请输入要回退到的编号（直接回车 = 取消）"
if ([string]::IsNullOrWhiteSpace($sel)) {
  Write-Host ""
  Write-Host "已取消，未做任何改动。"
  Done
}

$idx = 0
if (-not [int]::TryParse($sel.Trim(), [ref]$idx)) { Fail "[错误] 请输入列表中的数字编号。" }
if ($idx -lt 1 -or $idx -gt $tags.Count) { Fail "[错误] 编号超出范围，请输入 1 到 $($tags.Count)。" }

$chosen = $tags[$idx - 1]

Write-Host ""
Write-Host "你选择的是：$chosen"
Write-Host "该存档点信息："
& $git show -s --format="    提交：%h    时间：%cd    说明：%s" --date=iso $chosen
Write-Host ""
Write-Host "即将把整个项目回退到上面这个版本。"
Write-Host "回退前会先把「当前状态」自动另存成一个新的存档点，不会丢东西。"
Write-Host ""

$ok = Read-Host "确认请输入 Y ，其它任意键取消"
if ($ok.Trim() -notin @('Y','y')) {
  Write-Host ""
  Write-Host "已取消，未做任何改动。"
  Done
}

Write-Host ""
Write-Host "[1/3] 先把当前状态存成一个新存档点（兜底用）..."
$ts      = Get-Date -Format 'yyyyMMdd-HHmmss'
$backTag = "回退前自动存档-$ts"
$backMsg = "自动存档：回退到 $chosen 之前的当前状态"
$backFile = Write-MsgFile $backMsg

$dirty = @(& $git status --porcelain)
if ($dirty.Count -gt 0) {
  & $git add -A 2>&1 | Out-Null
  & $git commit -F $backFile 2>&1 | Out-Null
}
& $git tag -a $backTag -F $backFile 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "[错误] 创建兜底存档失败，已中止，未做任何回退。" }
Write-Host "      已存为：$backTag"

Write-Host "[2/3] 正在回退到 $chosen ..."
& $git checkout -B master $chosen 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "[错误] 回退失败。请把窗口内容截图发给技术人员。" }

Write-Host "[3/3] 完成"
Write-Host ""
Write-Host "============================================================"
Write-Host "    已回退到：$chosen"
Write-Host "------------------------------------------------------------"
& $git show -s --format="    当前版本：%h    %cd    %s" --date=iso HEAD
Write-Host "============================================================"
Write-Host ""
Write-Host "万一退错了，想回到回退之前的样子，"
Write-Host "重新运行本工具并选择存档点：$backTag"
Write-Host ""
Write-Host "提醒：如果预览窗口正开着，请关掉再重新启动一次，"
Write-Host "      这样才会加载回退后的代码。"
Done
