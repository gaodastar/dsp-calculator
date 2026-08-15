@echo off
chcp 65001 >nul
REM 一键推送到 GitHub（SSH）。在仓库根目录运行，可重复执行。
REM 流程: 添加远程 → rebase 同步远程历史 → 推送 main → 推送标签
cd /d "%~dp0"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [1/4] 添加远程仓库 origin
  git remote add origin git@github.com:gaodastar/dsp-calculator.git
) else (
  echo [1/4] 远程仓库 origin 已存在
)

echo [2/4] 与远程历史对齐 (rebase)
git pull --rebase origin main
if errorlevel 1 (
  echo.
  echo rebase 失败。若远程只有可丢弃的测试提交，可改用:
  echo   git push -u origin main --force
  exit /b 1
)

echo [3/4] 推送 main 分支
git push -u origin main
if errorlevel 1 (
  echo 推送被拒绝，请检查远程状态或联系维护者。
  exit /b 1
)

echo [4/4] 移动并推送版本标签 v1.0.0
git tag -f v1.0.0 >nul
git push -f origin v1.0.0

echo.
echo ✔ 推送完成: https://github.com/gaodastar/dsp-calculator
