@echo off
cd /d "%~dp0"
set "DEMO_URL=http://127.0.0.1:8000"

powershell.exe -NoProfile -Command "try { $health = Invoke-RestMethod -Uri '%DEMO_URL%/api/health' -TimeoutSec 2; if ($health.status -eq 'UP') { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 (
  echo Demo FX Position Application is already running.
  echo Opening %DEMO_URL% ...
  start "" "%DEMO_URL%"
  exit /b 0
)

echo Starting Demo FX Position Application...
echo Opening %DEMO_URL% in your browser.
echo.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Milliseconds 750; Start-Process '%DEMO_URL%'" >nul 2>&1
node --no-warnings server.js
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
