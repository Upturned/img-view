@echo off
cd /d "%~dp0"

:: ── Port configuration ────────────────────────────────────────────────────────
:: To use a different port, either:
::   1. Change the number below, or
::   2. Set the PORT environment variable before running this file
::      e.g.  set PORT=4000  &&  launch.bat
:: ─────────────────────────────────────────────────────────────────────────────
set PORT=2080

echo.
echo  img-view — starting on port %PORT%
echo  Close the server window to stop.
echo.

:: Start the Node server in a minimized window (won't block this script)
start "img-view server" /MIN cmd /c "npm start"

:: Wait for the server to be ready (adjust if your machine is slow)
timeout /t 3 /nobreak >nul

:: Open the browser
start http://localhost:%PORT%
