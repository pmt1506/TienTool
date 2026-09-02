# Chạy Ruffle với URL truyền vào, chờ rồi chụp cửa sổ ra PNG.
# Dùng: powershell -File capture-ruffle.ps1 -Url <swf-url> -Wait 45 -Out shot.png
param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$Wait = 45,
    [string]$Out = "ruffle-shot.png",
    [string]$Ruffle = "$PSScriptRoot\ruffle\ruffle.exe"
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@

$log = Join-Path $PSScriptRoot "ruffle-capture.log"
$p = Start-Process $Ruffle -ArgumentList "--tcp-connections","allow","`"$Url`"" -PassThru
Start-Sleep -Seconds $Wait

$p.Refresh()
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { "no window"; $p.Kill(); exit 1 }

[void][Win]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 800
$r = New-Object Win+RECT
[void][Win]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $ht = $r.B - $r.T
"window $w x $ht at $($r.L),$($r.T)"

$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$path = Join-Path $PSScriptRoot $Out
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
"saved $path"
$p.Kill()
