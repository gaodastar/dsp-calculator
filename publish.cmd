@echo off
chcp 65001 >nul
REM 一键推送到 GitHub（SSH）。在仓库根目录运行，可重复执行。
cd /d "%~dp0"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [1/3] 添加远程仓库 origin
  git remote add origin git@github.com:gaodastar/dsp-calculator.git
) else (
  echo [1/3] 远程仓库 origin 已存在: 
  git remote -v
)

echo [2/3] 推送 main 分支
git push -u origin main
if errorlevel 1 (
  echo.
  echo 推送被拒绝。若 GitHub 仓库里已有内容：
  echo   已有关联历史: git pull --rebase origin main 后再运行本脚本
  echo   仓库内容可丢弃: git push -u origin main --force
  exit /b 1
)

echo [3/3] 推送版本标签 v1.0.0
git push origin v1.0.0

echo.
echo ✔ 推送完成: https://github.com/gaodastar/dsp-calculator
