@echo off

set CLICKERMANN_PATH="C:\Program Files (x86)\gunnyclient\Auto\Clickermann.exe"
set CONFIG_DIR="C:\Program Files (x86)\gunnyclient\Auto\data"
set HISTORY_DIR="C:\Program Files (x86)\gunnyclient\Auto\data"

for %%i in (1 2 3 4) do (
    copy /y %CONFIG_DIR%\config%%i.ini %CONFIG_DIR%\config.ini
    copy /y %HISTORY_DIR%\history1.txt %HISTORY_DIR%\history.txt
    start "" %CLICKERMANN_PATH%
    timeout /t 1 >nul
)

exit
