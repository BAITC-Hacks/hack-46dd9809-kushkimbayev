@echo off
setlocal
cd /d "%~dp0"
node --env-file-if-exists=.env scripts/launcher.js stop
if errorlevel 1 pause
