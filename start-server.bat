@echo off
cd /d "%~dp0"
set PORT=4175
set HOST=0.0.0.0
echo SWE ENGLISH EXTRA Server ishga tushirilmoqda (0.0.0.0:%PORT%)...
node server.js
pause
