@echo off
REM 沙箱自动推送通道：Windows 原生 OpenSSH + 工作区 ssh 配置
REM 用法: research\push.cmd [--skip-rebase]
cd /d "%~dp0\.."
set "USERPROFILE=D:\AI\dsp-calculator\.ssh-home"
set "HOME=D:\AI\dsp-calculator\.ssh-home"
set "GIT_SSH=C:\Windows\System32\OpenSSH\ssh.exe"
set "GIT_SSH_VARIANT=ssh"

if /I "%~1"=="--skip-rebase" goto push

echo [1/3] 与远程历史对齐 (rebase)
git pull --rebase origin main
if errorlevel 1 (
  echo rebase 失败，请检查远程状态
  exit /b 1
)

:push
echo [2/3] 推送 main
git push -u origin main
if errorlevel 1 (
  echo 推送 main 失败
  exit /b 1
)

echo [3/3] 推送标签
git push origin --tags
if errorlevel 1 (
  echo 推送标签失败
  exit /b 1
)

echo ✔ 已推送: https://github.com/gaodastar/dsp-calculator
