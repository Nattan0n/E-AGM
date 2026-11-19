@echo off
rem E-AGM e2e bot - double-click to run. Menu and messages are in run_tests.py (cmd cannot read Thai in a .bat).
title E-AGM Test Bot
cd /d "%~dp0"
where python >/dev/null 2>/dev/null
if errorlevel 1 (
  echo [X] Python not found. Install it from https://www.python.org/downloads/
  echo     and tick "Add python.exe to PATH" during setup.
  pause
  exit /b 1
)
python run_tests.py
echo.
pause
