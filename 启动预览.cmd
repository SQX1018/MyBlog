@echo off
cd /d "%~dp0"
set "ASTRO_TELEMETRY_DISABLED=1"
call npm.cmd run dev -- --force
pause
