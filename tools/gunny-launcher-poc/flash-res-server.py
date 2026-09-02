"""Local Flash server + reverse proxy chèn Referer (PoC cho gnddt).

Hai việc:
1. Serve resource game (giống LauncherCommon.RunFlash của GunnyClient.exe),
   file thiếu thì tải từ CDN rồi cache.
2. Reverse-proxy /q/* -> quest2.gnddt.com/* và CHÈN Referer play.gnddt.com.
   Không có Referer này, ServerList.ashx trả IP giả 127.0.0.1:9000 -> game treo
   ở màn Loading. Đây là cổng chặn mà server thêm vào.

Kèm route /config-patched.xml: config2.xml gốc nhưng REQUEST_PATH trỏ về proxy.
"""
import http.server
import os
import socketserver
import threading
import http.cookiejar
import urllib.request

RES_DIRS = [
    r"C:\Program Files (x86)\GunnyClient\resource",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "res-cache"),
]
CACHE_DIR = RES_DIRS[1]
BASE_URLS = ["https://res.gn.zing.vn/", "https://gunny.vcdn.vn/"]

PORT = 8899
QUEST_UPSTREAM = "http://quest2.gnddt.com/"
CONFIG_UPSTREAM = "http://config.gnddt.com/config2.xml"
# Referer duy nhất khiến ServerList.ashx trả IP game server thật
MAGIC_REFERER = "http://play.gnddt.com/PlayGame.aspx"
UA = ("Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "37abc/2.0.6.16 Chrome/60.0.3112.113 Safari/537.36")

_locks, _locks_guard = {}, threading.Lock()

MIME = {
    ".swf": "application/x-shockwave-flash", ".xml": "application/xml",
    ".png": "image/png", ".txt": "text/plain", ".jpg": "image/jpeg",
    ".mp3": "audio/mpeg", ".ashx": "text/plain",
}


def resolve(rel):
    for d in RES_DIRS:
        p = os.path.join(d, rel.replace("/", os.sep))
        if os.path.isfile(p):
            return p
    return None


def download(rel):
    """Tải file thiếu từ CDN, cache lại."""
    with _locks_guard:
        lock = _locks.setdefault(rel, threading.Lock())
    with lock:
        if (p := resolve(rel)):
            return p
        dest = os.path.join(CACHE_DIR, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        for base in BASE_URLS:
            try:
                req = urllib.request.Request(base + rel, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=20) as r:
                    data = r.read()
                open(dest, "wb").write(data)
                print(f"  DL {rel} <- {base}", flush=True)
                return dest
            except Exception:
                continue
        return None


# Một cookiejar dùng chung cho mọi request upstream: server bind phiên đăng nhập
# vào cookie .AspNetCore.Session, mất cookie là login.ashx trả "Đăng nhập thất bại"
_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))


def upstream(url, referer):
    """GET upstream kèm Referer + cookie phiên. Trả (body, content-type)."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": referer,
        "x-requested-with": "ShockwaveFlash/26.0.0.151",
    })
    with _opener.open(req, timeout=25) as r:
        return r.read(), r.headers.get("Content-Type", "text/plain")


class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, data, ctype):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.lstrip("/")
        rel, _, query = path.partition("?")

        # 1. config đã patch: REQUEST_PATH trỏ về proxy của mình
        if rel == "config-patched.xml":
            body, _ = upstream(CONFIG_UPSTREAM, MAGIC_REFERER)
            body = body.replace(QUEST_UPSTREAM.encode(),
                                f"http://127.0.0.1:{PORT}/q/".encode())
            print("200 config-patched.xml (REQUEST_PATH -> proxy)", flush=True)
            return self._send(body, "application/xml")

        # 2. reverse proxy quest2 + chèn Referer hợp lệ
        if rel.startswith("q/"):
            url = QUEST_UPSTREAM + rel[2:] + (("?" + query) if query else "")
            try:
                body, ctype = upstream(url, MAGIC_REFERER)
            except Exception as e:
                print(f"502 {rel}: {e}", flush=True)
                return self.send_error(502, str(e))
            print(f"200 q/{rel[2:]} ({len(body)}B)", flush=True)
            print(f"    REQ {url}", flush=True)
            if len(body) < 2000:  # dump body nhỏ để soi lỗi login
                print("    RSP " + body.decode("utf-8", "replace")[:600].encode("ascii","replace").decode(), flush=True)
            return self._send(body, ctype)

        # 3. file resource tĩnh
        p = resolve(rel) or download(rel)
        if not p:
            print(f"404 {rel}", flush=True)
            return self.send_error(404, "File not found online")
        data = open(p, "rb").read()
        print(f"200 {rel} ({len(data)}B)", flush=True)
        self._send(data, MIME.get(os.path.splitext(rel)[1].lower(),
                                  "application/octet-stream"))

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.makedirs(CACHE_DIR, exist_ok=True)
    print(f"http://127.0.0.1:{PORT}/  | proxy /q/* -> quest2 (Referer injected)",
          flush=True)
    Server(("127.0.0.1", PORT), Handler).serve_forever()
