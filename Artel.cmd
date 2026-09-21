@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js не найден.
  echo Скачай LTS с https://nodejs.org , установи, потом снова дважды кликни Artel.cmd
  start https://nodejs.org/en/download
  pause
  exit /b 1
)

if not exist "package.json" (
  echo Нет package.json. Распакуй архив так, чтобы Artel.cmd лежал рядом с package.json.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Первый запуск: ставлю зависимости. Это один раз, минута-две.
  call npm.cmd install
  if errorlevel 1 (
    echo Не удалось выполнить npm install.
    pause
    exit /b 1
  )
)

echo Откроется браузер: http://127.0.0.1:43147
echo Это окно не закрывай. Остановка: Ctrl+C
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:43147"
call npm.cmd run dev
pause
