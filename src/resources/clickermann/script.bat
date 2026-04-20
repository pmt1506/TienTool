@echo off

set "CLICKERMANN_DIR=__CLICKERMANN_DIR__"
if "%CLICKERMANN_DIR%"=="__CLICKERMANN_DIR__" set "CLICKERMANN_DIR=%~dp0"

set "CLICKERMANN_PATH=%CLICKERMANN_DIR%\Clickermann.exe"
set "CONFIG_DIR=%CLICKERMANN_DIR%\data"
set "HISTORY_DIR=%CLICKERMANN_DIR%\data"

for %%i in (1 2 3 4) do (
    copy /y %CONFIG_DIR%\config%%i.ini %CONFIG_DIR%\config.ini
    copy /y %HISTORY_DIR%\history1.txt %HISTORY_DIR%\history.txt
    start "" %CLICKERMANN_PATH%
    timeout /t 1 >nul
)

exit
