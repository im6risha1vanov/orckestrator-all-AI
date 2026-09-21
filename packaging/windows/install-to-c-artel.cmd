@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Ставлю Артель в C:\Artel …
taskkill /F /IM Artel.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
mkdir C:\Artel 2>nul

set ZIP=
if exist "%~dp0Artel-windows-20260920e.zip" set ZIP=%~dp0Artel-windows-20260920e.zip
if exist "%~dp0Artel-windows-20260920d.zip" set ZIP=%~dp0Artel-windows-20260920d.zip
if exist "%~dp0Artel-windows.zip" set ZIP=%~dp0Artel-windows.zip

if defined ZIP (
  echo Распаковываю %ZIP%
  powershell -NoProfile -Command ^
    "$z='${ZIP}'; $tmp=Join-Path $env:TEMP 'artel-unpack'; if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force}; New-Item -ItemType Directory -Path $tmp | Out-Null; Expand-Archive -Force -LiteralPath $z -DestinationPath $tmp; $src=$tmp; if(Test-Path (Join-Path $tmp 'Artel\Artel.exe')){ $src=Join-Path $tmp 'Artel' }; Copy-Item -Path (Join-Path $src '*') -Destination 'C:\Artel' -Recurse -Force"
) else if exist "%~dp0Artel\Artel.exe" (
  robocopy "%~dp0Artel" C:\Artel /E /XD webview-data edge-app /XF artel.log /R:1 /W:1 /NFL /NDL /NJH /NJS
) else if exist "%~dp0Artel.exe" (
  robocopy "%~dp0." C:\Artel /E /XD webview-data edge-app /XF artel.log /R:1 /W:1 /NFL /NDL /NJH /NJS
) else (
  echo Нет zip рядом с этим файлом.
  pause
  exit /b 1
)

if not exist C:\Artel\app\node_modules\@next\env\package.json (
  echo Нет C:\Artel\app\node_modules\@next\env — распаковка неполная.
  echo Если есть C:\Artel\Artel\Artel.exe — перенеси файлы из C:\Artel\Artel в C:\Artel
  pause
  exit /b 1
)

echo Готово. Запускаю C:\Artel\Artel.exe
start "" C:\Artel\Artel.exe
