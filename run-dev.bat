@echo off
rem Chay ban dev TienTool: build neu chua co, roi mo Electron.
rem Truyen tham so "rebuild" de ep build lai sau khi sua code: run-dev.bat rebuild
cd /d "%~dp0"

set TIENTOOL_DISABLE_UPDATE=1

if /i "%~1"=="rebuild" goto compile
if not exist ".vite\build\main.js" goto compile
goto run

:compile
echo [TienTool] Dang build...
call npm run build
if errorlevel 1 (
  echo [TienTool] Build that bai.
  pause
  exit /b 1
)

:run
echo [TienTool] Dang mo app...
call npx electron .
if errorlevel 1 pause
