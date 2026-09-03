# Gom DLL + plugin cần thiết vào cạnh gunny-browser-qt.exe.
#
# windeployqt của Qt 5.14 báo "Unable to find the platform plugin" với kit cài
# bằng aqtinstall, nên tự đi cây phụ thuộc bằng objdump. Liệt kê tay dễ sót
# (Qt5QmlModels, libiconv, zlib1...) và mỗi lần sót là app hiện hộp thoại
# "không tìm thấy DLL" rồi đứng im.
#
# Usage: powershell -File deploy.ps1 [-Kit <QtKitDir>] [-Rel <build\release>]
param(
    [string]$Kit = "C:\Users\pmt\Qt\5.14.2\mingw73_64",
    [string]$Mingw = "C:\Users\pmt\Qt\Tools\mingw730_64",
    [string]$Rel = "$PSScriptRoot\build\release",
    [string]$FlashDll = "C:\Program Files (x86)\GunnyClient\plugins\NPSWF32.dll"
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $Rel)) { throw "Chua build: $Rel" }

$objdump = "$Mingw\bin\objdump.exe"
# Nơi tìm DLL, theo thứ tự ưu tiên. DLL hệ thống bỏ qua (đã có trong Windows).
$searchDirs = @("$Kit\bin", "$Mingw\bin", "$Kit\plugins")

function Get-DllImports([string]$path) {
    & $objdump -p $path |
        Select-String 'DLL Name:' |
        ForEach-Object { ($_ -split ':\s*')[1].Trim() }
}

function Find-Dll([string]$name) {
    foreach ($d in $searchDirs) {
        $hit = Get-ChildItem $d -Filter $name -Recurse -ErrorAction SilentlyContinue |
               Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

# Qt 5.5.1 ship cả bản release và debug cạnh nhau (Qt5Gui.dll / Qt5Guid.dll).
# Bản debug nặng gấp hàng chục lần và kéo theo cả chuỗi Qt debug -> loại bỏ.
function Test-DebugDll([System.IO.FileInfo]$file) {
    $base = $file.BaseName
    if (-not $base.EndsWith('d')) { return $false }
    return Test-Path (Join-Path $file.Directory.FullName ($base.Substring(0, $base.Length - 1) + '.dll'))
}

# Duyệt đệ quy từ exe + các plugin Qt, gom mọi DLL có trong kit/mingw.
$queue = New-Object System.Collections.Queue
$queue.Enqueue("$Rel\gunny-browser-qt.exe")
$seen = @{}
$toCopy = @{}

# Plugin Qt không được exe import trực tiếp -> nạp lúc chạy, phải đưa vào hàng đợi.
$pluginDirs = @('platforms', 'imageformats', 'bearer', 'mediaservice',
                'printsupport', 'styles', 'iconengines', 'audio')
foreach ($d in $pluginDirs) {
    if (Test-Path "$Kit\plugins\$d") {
        New-Item -ItemType Directory -Force "$Rel\$d" | Out-Null
        foreach ($f in Get-ChildItem "$Kit\plugins\$d" -Filter *.dll) {
            if (Test-DebugDll $f) { continue }
            Copy-Item $f.FullName "$Rel\$d" -Force
            $queue.Enqueue($f.FullName)
        }
    }
}

while ($queue.Count -gt 0) {
    $cur = $queue.Dequeue()
    foreach ($imp in Get-DllImports $cur) {
        if ($seen.ContainsKey($imp)) { continue }
        $seen[$imp] = $true
        $src = Find-Dll $imp
        if ($src) {
            $toCopy[$imp] = $src
            $queue.Enqueue($src)
        }
        # Không tìm thấy = DLL hệ thống (kernel32, user32...) -> bỏ qua.
    }
}

foreach ($kv in $toCopy.GetEnumerator()) {
    Copy-Item $kv.Value $Rel -Force
}

# Flash NPAPI: main.cpp trỏ QTWEBKIT_PLUGIN_PATH vào plugins\ cạnh exe.
New-Item -ItemType Directory -Force "$Rel\plugins" | Out-Null
if (Test-Path $FlashDll) {
    Copy-Item $FlashDll "$Rel\plugins\" -Force
} else {
    Write-Warning "Khong thay NPSWF32.dll tai $FlashDll"
}

# Loading.swf da va: main.cpp phuc vu tep nay tai dung URL goc de Flash van xep
# no vao sandbox cua res1.gnddt.com. Khong co tep thi game van chay, chi mat nut
# "Kho ma phap".
if (Test-Path "$PSScriptRoot\patched\Loading.swf") {
    New-Item -ItemType Directory -Force "$Rel\patched" | Out-Null
    Copy-Item "$PSScriptRoot\patched\Loading.swf" "$Rel\patched\" -Force
}

"$($toCopy.Count) DLL (da giai de quy), $($pluginDirs.Count) thu muc plugin"
"tong: $([math]::Round((Get-ChildItem $Rel -Recurse -File | Measure-Object Length -Sum).Sum/1MB,1)) MB"
