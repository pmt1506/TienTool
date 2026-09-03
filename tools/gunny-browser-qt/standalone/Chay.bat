@echo off
rem Mo game bang tai khoan ghi trong account.txt.
rem Goi powershell bang duong dan tuyet doi: neu PATH cua tien trinh cha thieu
rem System32 thi goi bang ten se khong tim thay.
set PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0play.ps1"
if errorlevel 1 pause
