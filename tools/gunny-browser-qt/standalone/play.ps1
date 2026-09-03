# Đăng nhập rồi mở game, không cần TienTool, không cần Python.
#
# Chuỗi giống hệt gnddt-launch.py, viết lại bằng PowerShell để gói chạy được
# trên máy trắng:
#   1. POST LauncherWebV566                    -> token
#   2. GET  RedircetPlayGame?user=..&s=..      -> trang gate, chứa chuỗi content
#   3. GET  api.ipify.org                      -> IP public
#   4. GET  CreateLogin.aspx?content=..&active=IP
#      BẮT BUỘC: đăng ký session key lên game server. Thiếu bước này thì
#      login.ashx trả "Đăng nhập thất bại" và game treo ở màn Loading 100%.
#   5. GET  PlayGame.aspx                      -> HTML có <embed src=...swf>
#
# Tài khoản đọc từ account.txt cạnh tệp này, mỗi dòng một trường:
#   <tên đăng nhập>
#   <mật khẩu>
#   <số server>
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$accFile = Join-Path $here "account.txt"
if (-not (Test-Path $accFile)) { throw "Thieu account.txt canh play.ps1" }
$acc = Get-Content $accFile | Where-Object { $_.Trim() -ne "" -and -not $_.StartsWith("#") }
if ($acc.Count -lt 3) { throw "account.txt phai co 3 dong: user, pass, server" }
$user = $acc[0].Trim(); $pass = $acc[1].Trim(); $area = $acc[2].Trim()

$exe = Join-Path $here "gunny-browser-qt.exe"
if (-not (Test-Path $exe)) { throw "Thieu gunny-browser-qt.exe canh play.ps1" }

$UA = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "37abc/2.0.6.16 Chrome/60.0.3112.113 Safari/537.36"

# HWID mà launcher gốc dùng.
$hwid = ""
try {
    $hwid = (Get-CimInstance Win32_PhysicalMedia | Select-Object -First 1).SerialNumber
    if ($null -eq $hwid) { $hwid = "" }
} catch { $hwid = "" }
$hwid = $hwid.Trim()

Write-Host "Dang nhap $user ..."
$body = @{ username = $user; password = $pass; PublicKey = "PublicKey-$hwid" }
$tok = (Invoke-WebRequest -UseBasicParsing -Uri "http://api.gnddt.com/api/Launcher/LauncherWebV566" `
        -Method Post -Body $body -UserAgent $UA -SessionVariable ses `
        -TimeoutSec 30).Content.Trim().Trim('"')
if ($tok -eq "0") { throw "Tai khoan bi khoa" }
if ($tok -eq "1") { throw "Sai user/pass" }

$gate = "http://play.gnddt.com/RedircetPlayGame?user=" +
        [uri]::EscapeDataString($tok) + "&s=$area"
$gateHtml = (Invoke-WebRequest -UseBasicParsing -Uri $gate -UserAgent $UA -WebSession $ses -TimeoutSec 30).Content
$m = [regex]::Match($gateHtml, "CreateLogin\.aspx\?content=([^'`"&]+)")
if (-not $m.Success) { throw "Khong tim thay chuoi content trong trang gate" }
$content = $m.Groups[1].Value

$ip = ""
try { $ip = (Invoke-WebRequest -UseBasicParsing -Uri "http://api.ipify.org" -UserAgent $UA -TimeoutSec 15).Content.Trim() } catch { }

$res = (Invoke-WebRequest -UseBasicParsing -Uri "http://quest2.gnddt.com/CreateLogin.aspx?content=$content&active=$ip" `
        -Headers @{ Referer = $gate } -UserAgent $UA -WebSession $ses -TimeoutSec 30).Content.Trim()
if ($res -ne "0") { Write-Host "CreateLogin tra ve '$res' (mong doi '0')" }

$playHtml = (Invoke-WebRequest -UseBasicParsing -Uri "http://play.gnddt.com/PlayGame.aspx?rand=0.123456" `
             -Headers @{ Referer = $gate } -UserAgent $UA -WebSession $ses -TimeoutSec 30).Content
$m = [regex]::Match($playHtml, '<embed[^>]*\bsrc="([^"]+)"')
if (-not $m.Success) { $m = [regex]::Match($playHtml, 'name="movie"\s+value="([^"]+)"') }
if (-not $m.Success) { throw "Khong doc duoc link SWF tu PlayGame.aspx" }

Write-Host "Mo game..."
Start-Process $exe -ArgumentList @("--swf", $m.Groups[1].Value, "--title", "Gunny - $user") `
    -WorkingDirectory $here
