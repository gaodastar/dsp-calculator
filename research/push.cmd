@echo off
REM Sandbox-friendly auto-push channel: Windows native OpenSSH + workspace ssh config
REM Usage: research\push.cmd [--skip-rebase]
cd /d "%~dp0\.."
set "USERPROFILE=D:\AI\dsp-calculator\.ssh-home"
set "HOME=D:\AI\dsp-calculator\.ssh-home"
set "GIT_SSH=C:\Windows\System32\OpenSSH\ssh.exe"
set "GIT_SSH_VARIANT=ssh"

if /I "%~1"=="--skip-rebase" goto push

echo [1/3] rebase onto origin/main
git pull --rebase origin main
if errorlevel 1 (
  echo rebase failed, check remote state
  exit /b 1
)

:push
echo [2/3] push main
git push -u origin main
if errorlevel 1 (
  echo push main failed
  exit /b 1
)

echo [3/3] push tags
git push origin --tags
if errorlevel 1 (
  echo push tags failed
  exit /b 1
)

echo DONE: https://github.com/gaodastar/dsp-calculator
