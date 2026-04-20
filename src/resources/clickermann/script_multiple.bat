@echo off

:START
:: Prompt user for the number of windows
set /p NUM_WINDOWS="Enter the number of windows to open (1 to 4): "

:: Validate the number of windows (must be 1, 2, 3, or 4)
if "%NUM_WINDOWS%" neq "1" if "%NUM_WINDOWS%" neq "2" if "%NUM_WINDOWS%" neq "3" if "%NUM_WINDOWS%" neq "4" (
    echo Invalid input. Please enter a number between 1 and 4.
    goto START
)

:: Prompt user for the starting number
set /p START_NUMBER="Enter the starting window number (odd number between 1 and 7): "

:: Validate the starting number (must be odd and between 1 and 7)
if %START_NUMBER% lss 1 (
    echo Starting number must be between 1 and 7.
    goto START
)
if %START_NUMBER% gtr 7 (
    echo Starting number must be between 1 and 7.
    goto START
)
set /a REMAINDER=%START_NUMBER% %% 2
if %REMAINDER% equ 0 (
    echo Starting number must be odd.
    goto START
)

:: Validate the number of windows does not exceed available files
set /a END_NUMBER=%START_NUMBER%+%NUM_WINDOWS%-1
if %END_NUMBER% gtr 8 (
    echo Not enough config files from that starting point. Please enter valid inputs.
    goto START
)

:: Set paths for Clickermann and config/history files
set CLICKERMANN_PATH="C:\Program Files (x86)\gunnyclient\Auto\Clickermann.exe"
set CONFIG_DIR="C:\Program Files (x86)\gunnyclient\Auto\data"
set HISTORY_DIR="C:\Program Files (x86)\gunnyclient\Auto\data"

:: Loop to open the specified number of windows starting from the specified odd number
for /l %%i in (%START_NUMBER%,1,%END_NUMBER%) do (
    echo Opening window %%i...
    copy /y %CONFIG_DIR%\config%%i.ini %CONFIG_DIR%\config.ini
    copy /y %HISTORY_DIR%\history1.txt %HISTORY_DIR%\history.txt
    start "" %CLICKERMANN_PATH%
    timeout /t 1 >nul
)

exit
