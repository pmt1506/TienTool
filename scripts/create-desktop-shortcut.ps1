# Tao shortcut "TienTool Dev" ngoai Desktop, tro toi run-dev.bat trong repo.
# Chay lai bat cu luc nao de cap nhat shortcut.
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$target = Join-Path $repo "run-dev.bat"
$icon = Join-Path $repo "assets\icon.ico"

if (-not (Test-Path $target)) { throw "Khong thay run-dev.bat tai $target" }

$link = Join-Path ([Environment]::GetFolderPath("Desktop")) "TienTool Dev.lnk"

$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($link)
$sc.TargetPath = $target
$sc.WorkingDirectory = $repo
$sc.Description = "TienTool ban dev (khong check update)"
# 7 = cua so console thu nho; app Electron van hien binh thuong.
$sc.WindowStyle = 7
if (Test-Path $icon) { $sc.IconLocation = $icon }
$sc.Save()

Write-Host "Da tao shortcut: $link"
