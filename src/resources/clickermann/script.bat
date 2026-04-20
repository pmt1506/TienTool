@echo off

set CLICKERMANN_PATH="__CLICKERMANN_DIR__\Clickermann.exe"
set CONFIG_DIR="__CLICKERMANN_DIR__\data"
set HISTORY_DIR="__CLICKERMANN_DIR__\data"

for %%i in (1 2 3 4) do (
    copy /y %CONFIG_DIR%\config%%i.ini %CONFIG_DIR%\config.ini
    copy /y %HISTORY_DIR%\history1.txt %HISTORY_DIR%\history.txt
    start "" %CLICKERMANN_PATH%
    timeout /t 1 >nul
)

exit
