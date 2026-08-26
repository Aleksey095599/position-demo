@echo off
cd /d "%~dp0"
set "DEMO_PORT=8000"
set "DEMO_URL=http://127.0.0.1:%DEMO_PORT%"
title Demo FX Position Application

echo Starting Demo FX Position Application...
echo Opening %DEMO_URL% in your browser.
echo Press Ctrl+C in this window to stop the application.
echo.
node scripts\build-frontend.mjs
if errorlevel 1 (
  echo Frontend build failed.
  pause
  exit /b 1
)
node scripts\prepare-demo-port.mjs
if errorlevel 1 (
  echo Port preparation failed. The process using port %DEMO_PORT% was not stopped.
  pause
  exit /b 1
)
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 750; Start-Process '%DEMO_URL%'" >nul 2>&1
node --no-warnings server.js
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo The application stopped with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
