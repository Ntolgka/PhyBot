@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22.5 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies, this can take a few minutes...
  call npm install || goto :failed
)

if not exist "apps\web\dist\index.html" (
  echo Building PhyBot...
  call npm run build || goto :failed
)

rem Tells the bot a launcher is watching, so /restart and the dashboard button
rem can bring it back with the console window intact.
set PHYBOT_SUPERVISED=1

:run
echo Starting PhyBot. Close this window to stop the bot.
call npm start
rem Exit code 42 is the bot asking to be restarted.
if errorlevel 42 if not errorlevel 43 (
  echo.
  echo Restarting PhyBot...
  echo.
  goto :run
)
goto :end

:failed
echo.
echo PhyBot could not start. Read the message above, fix the problem and try again.
pause
exit /b 1

:end
endlocal
