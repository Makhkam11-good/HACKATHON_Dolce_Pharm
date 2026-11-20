@echo off
rem Двойной щелчок: поднимает приложение и туннель после перезагрузки ПК (см. scripts/start.sh)
chcp 65001 >nul
cd /d "%~dp0"
set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not exist "%BASH%" set "BASH=bash"
"%BASH%" scripts/start.sh
echo.
pause
