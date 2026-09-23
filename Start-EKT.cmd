@echo off
setlocal
title EKT Assistant Server - keep this window open
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required on the server computer.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\adm-zip\package.json" (
  echo Installing server dependencies...
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node --env-file-if-exists=.env scripts/launcher.js
echo Server stopped. Press any key to close this window.
pause
