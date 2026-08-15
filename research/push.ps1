# 自动推送到 GitHub（沙箱友好）
# 解决沙箱中 git schannel/MSYS ssh 不可用的问题：
# 走 Windows 原生 OpenSSH（GIT_SSH），ssh 配置在 .ssh-home\.ssh\config，
# 密钥在 .ssh\deploy-key（均已被 .gitignore 排除）。
param(
  [switch]$SkipRebase
)
$ErrorActionPreference = 'Stop'
$env:USERPROFILE = 'D:\AI\dsp-calculator\.ssh-home'
$env:GIT_SSH = 'C:\Windows\System32\OpenSSH\ssh.exe'
$env:GIT_SSH_VARIANT = 'ssh'

Set-Location 'D:\AI\dsp-calculator'

if (-not $SkipRebase) {
  Write-Host '[1/3] 与远程历史对齐 (rebase)'
  git pull --rebase origin main
  if ($LASTEXITCODE -ne 0) { throw 'rebase 失败，请检查远程状态' }
} else {
  Write-Host '[1/3] 跳过 rebase'
}

Write-Host '[2/3] 推送 main'
git push -u origin main
if ($LASTEXITCODE -ne 0) { throw '推送 main 失败' }

Write-Host '[3/3] 推送标签'
git push origin --tags
if ($LASTEXITCODE -ne 0) { throw '推送标签失败' }

Write-Host "✔ 已推送: https://github.com/gaodastar/dsp-calculator"
