@echo off
cd /d "%~dp0"
set "DEMO_URL=http://127.0.0.1:8000"
title Demo FX Position Application

echo Starting Demo FX Position Application...
echo Opening %DEMO_URL% in your browser.
echo Press Ctrl+C in this window to stop the application.
echo.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 750; Start-Process '%DEMO_URL%'" >nul 2>&1
node --no-warnings server.js
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo The application stopped with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
