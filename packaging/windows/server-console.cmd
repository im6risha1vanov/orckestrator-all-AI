@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Артель — сервер в консоли. Ошибки будут видны здесь.
echo.
if not exist "runtime\node.exe" (
  echo Нет runtime\node.exe. Сначала один раз запусти Artel.exe — он скачает Node.js.
  pause
  exit /b 1
)
if not exist "app\boot-server.js" (
  echo Нет app\boot-server.js. Распакуй архив целиком.
  pause
  exit /b 1
)
cd app
set PORT=43147
set HOSTNAME=127.0.0.1
set NODE_ENV=production
..\runtime\node.exe boot-server.js
echo.
echo Сервер остановился. Код %ERRORLEVEL%.
pause
