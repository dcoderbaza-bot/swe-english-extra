@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=4175
set HOST=0.0.0.0
echo ====================================================================
echo   SWE ENGLISH EXTRA v5 — Lokal Wi-Fi + Global 4G/5G HTTPS Server
echo   O'quvchilar telefonlaridan (4G/5G/Wi-Fi) to'g'ridan-to'g'ri kiradi!
echo ====================================================================
node server.js
pause
