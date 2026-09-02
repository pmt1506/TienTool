# Open Gunny with Ruffle: login -> CreateLogin -> get SWF link -> run Ruffle (leave window open).
# Usage: powershell -File play-gunny.ps1 [-User u] [-Pass p] [-Area 2]
# Note: ASCII only - PowerShell 5.1 reads .ps1 as ANSI and breaks on non-ASCII text.
param(
    [Parameter(Mandatory=$true)][string]$User,
    [Parameter(Mandatory=$true)][string]$Pass,
    [string]$Area = "2",
    [int]$ProxyPort = 8899
)

$root = $PSScriptRoot
$line = (& python "$root\gnddt-launch.py" $User $Pass $Area | Select-String '^SWF: ')
if (-not $line) { "ERROR: could not get SWF link"; exit 1 }

# Point config= at the local proxy. The proxy injects Referer play.gnddt.com for
# ServerList.ashx; without it the server returns fake IP 127.0.0.1:9000 and the
# game hangs on the Loading screen at 100%.
$swf = $line.ToString().Substring(5).Trim()
$url = $swf -replace 'http://config\.gnddt\.com/config\d+\.xml', "http://127.0.0.1:$ProxyPort/config-patched.xml"

"user : $User (server $Area)"
"swf  : $($url.Substring(0, [Math]::Min(110, $url.Length)))..."
# --tcp-connections allow: skip Ruffle's per-socket permission dialog
$p = Start-Process "$root\ruffle\ruffle.exe" -ArgumentList "--tcp-connections", "allow", "`"$url`"" -PassThru
"ruffle PID $($p.Id) - window is open, closes when you close it"
