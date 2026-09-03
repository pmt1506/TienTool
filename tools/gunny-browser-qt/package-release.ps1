# Đóng gói build\release thành một zip tải về là chạy được ngay.
#
# Bỏ .o/.cpp/.h do trình biên dịch sinh ra trong cùng thư mục — chúng không cần
# cho việc chạy, chỉ làm gói nặng thêm và gây hiểu nhầm là mã nguồn.
#
# Chạy sau khi đã build và deploy:
#   qmake ..\gunny-browser-qt.pro; mingw32-make release
#   powershell -File deploy.ps1 -Kit <QtKit> -Mingw <MinGW>
#   powershell -File package-release.ps1
param(
    [string]$Rel = "$PSScriptRoot\build\release",
    [string]$OutDir = "$PSScriptRoot\build"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "$Rel\gunny-browser-qt.exe")) {
    throw "Chua build: khong thay $Rel\gunny-browser-qt.exe"
}
if (-not (Test-Path "$Rel\plugins\NPSWF32.dll")) {
    throw "Thieu plugins\NPSWF32.dll — chay deploy.ps1 truoc"
}
if (-not (Test-Path "$Rel\patched\Loading.swf")) {
    throw "Thieu patched\Loading.swf — chay deploy.ps1 truoc"
}

$stamp = Get-Date -Format "yyMMdd"
$sha = (git -C $PSScriptRoot rev-parse --short HEAD).Trim()
$name = "gunny-browser-qt-$stamp-$sha"
$stage = Join-Path $OutDir $name

Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item "$Rel\gunny-browser-qt.exe" $stage
Copy-Item "$Rel\*.dll" $stage
foreach ($d in Get-ChildItem $Rel -Directory) {
    Copy-Item $d.FullName $stage -Recurse
}

# Bộ chạy độc lập: đăng nhập rồi mở game mà không cần TienTool hay Python.
Copy-Item "$PSScriptRoot\standalone\*" $stage -Force

$zip = Join-Path $OutDir "$name.zip"
Remove-Item $zip -ErrorAction SilentlyContinue
Compress-Archive -Path "$stage\*" -DestinationPath $zip -CompressionLevel Optimal

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
$files = (Get-ChildItem $stage -Recurse -File).Count
"$zip"
"$files tep, $mb MB"
