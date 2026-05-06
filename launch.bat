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
npm start