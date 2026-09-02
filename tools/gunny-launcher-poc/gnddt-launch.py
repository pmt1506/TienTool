"""Harness đăng nhập gnddt, thay thế WebView2 của tool cũ (không cần chạy JS).

Chuỗi đầy đủ:
  1. POST api/Launcher/LauncherWebV566          -> token
  2. GET  play/RedircetPlayGame?user=token&s=N  -> HTML gate (chứa chuỗi `content`)
  3. GET  api.ipify.org                         -> IP public
  4. GET  quest2/CreateLogin.aspx?content=..&active=IP   <-- BƯỚC BẮT BUỘC,
     đăng ký session key lên game server; thiếu bước này login.ashx trả
     "Đăng nhập thất bại" và game treo ở màn Loading 100%.
  5. GET  play/PlayGame.aspx                    -> HTML nhúng <embed src=...swf>

Dùng: python gnddt-launch.py <user> <pass> <areaId>
"""
import http.cookiejar
import re
import subprocess
import sys
import urllib.parse
import urllib.request

API_LOGIN = "http://api.gnddt.com/api/Launcher/LauncherWebV566"
GATE = "http://play.gnddt.com/RedircetPlayGame"
PLAYGAME = "http://play.gnddt.com/PlayGame.aspx"
CREATE_LOGIN = "http://quest2.gnddt.com/CreateLogin.aspx"
IPIFY = "http://api.ipify.org"
def disk_serial():
    """HWID mà launcher gốc dùng: SELECT SerialNumber FROM Win32_PhysicalMedia."""
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "(Get-CimInstance Win32_PhysicalMedia | Select-Object -First 1).SerialNumber"],
            capture_output=True, text=True, timeout=20,
        ).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    return ""


HWID = disk_serial()
UA = ("Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "37abc/2.0.6.16 Chrome/60.0.3112.113 Safari/537.36")

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def fetch(url, data=None, referer=None):
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, data=data, headers=headers)
    with opener.open(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def login(user, pwd):
    body = urllib.parse.urlencode({
        "username": user, "password": pwd, "PublicKey": "PublicKey-" + HWID,
    }).encode()
    tok = fetch(API_LOGIN, data=body).strip().strip('"')
    if tok in ("0", "1"):
        raise SystemExit("Tài khoản bị khóa" if tok == "0" else "Sai user/pass")
    return tok


def launch(token, area):
    """Chạy đủ gate -> CreateLogin -> PlayGame. Trả (swf_url, log)."""
    log = []
    gate_url = f"{GATE}?user={urllib.parse.quote(token, safe='')}&s={area}"
    gate_html = fetch(gate_url)

    m = re.search(r"CreateLogin\.aspx\?content=([^'\"&]+)", gate_html)
    if not m:
        raise SystemExit("không tìm thấy chuỗi content trong trang gate")
    content = m.group(1)
    log.append("content = " + urllib.parse.unquote(content))

    try:
        ip = fetch(IPIFY).strip()
    except Exception:
        ip = ""
    log.append("public IP = " + (ip or "(không lấy được)"))

    # Bước quyết định: đăng ký key lên game server. Trả '0' là thành công.
    res = fetch(f"{CREATE_LOGIN}?content={content}&active={ip}", referer=gate_url).strip()
    log.append(f"CreateLogin -> {res!r} " + ("OK" if res == "0" else "THẤT BẠI"))

    html = fetch(PLAYGAME + "?rand=0.123456", referer=gate_url)
    m = re.search(r'<embed[^>]*\bsrc="([^"]+)"', html) or \
        re.search(r'name="movie"\s+value="([^"]+)"', html)
    return (m.group(1) if m else None), log


def main():
    user, pwd, area = sys.argv[1], sys.argv[2], sys.argv[3]
    token = login(user, pwd)
    swf, log = launch(token, area)
    for line in log:
        print(line)
    print("COOKIES: " + "; ".join(f"{c.name}={c.value[:24]}" for c in jar))
    print("SWF: " + (swf or "(không parse được)"))


if __name__ == "__main__":
    main()
