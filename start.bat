@echo off
cd /d "%~dp0"
echo Starting Localfix. Keep this window open while using the website.
start "" cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"
npm start
pause
