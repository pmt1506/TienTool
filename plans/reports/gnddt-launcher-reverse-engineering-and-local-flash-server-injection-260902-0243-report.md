# gnddt Launcher — Reverse Engineering & Điểm Inject qua Local Flash Server

Date: 2026-09-02 | Scope: recon-only (static strings analysis)
Thay thế mục 2 của `gunny-flash-window-launcher-architecture-and-aim-overlay-260902-0225-report.md`

## TL;DR — sửa lại kết luận trước

Report trước tôi nói phải dựng `gunny-shell` Electron 9 + bundle `pepflashplayer.dll`. **Sai hướng.** Sau khi dump UTF-16 strings của `GunnyClient.exe`: bạn **không cần Electron 9, không cần bundle Flash, không cần viết Qt**. Cửa sổ Flash đã có sẵn là `GunnyBrowser.exe` (143KB). Cái cần thay chỉ là **launcher**, và launcher đó về bản chất là **một HTTP server local** — Node làm dễ hơn .NET.

## 1. Kiến trúc thật của gnddt (đã verify)

```
GunnyClient.exe  (.NET WinForms — "LauncherGunny")
  1. Login       → api.gnddt.com/api/Launcher/LauncherWebV566
                 → api.gnddt.com/api/Oauth/GetBlockApp   ← anti-tool blocklist
  2. Update res  → config.gnddt.com/ResourceInfo.xml
                 → res.gnddt.com/Resource.txt  →  tải về .\resource\
  3. Flash Server LOCAL:
       netsh http add urlacl url=http://+:9999/  user=Everyone
       netsh http add urlacl url=https://+:9998/ user=Everyone
       netsh http add sslcert ipport=0.0.0.0:9998 certhash=… certstorename=MY
       → serve .\resource\ ; crossdomain.xml tại localhost:9999 / :9998
  4. spawn GunnyBrowser.exe
          ↓
GunnyBrowser.exe (143KB — Qt5Core/Gui/Network/WebKit/WebKitWidgets + NPSWF32.dll)
  → load https://www.gnddt.com/  → nhúng SWF, SWF nạp resource từ localhost
```

### Bằng chứng strings (UTF-16, `GunnyClient.exe`)

| Nhóm | Strings |
|---|---|
| .NET WinForms | `LauncherGunny.Properties.Resources`, `txtName`, `txtPass`, `btnLogin`, `btnLoginNew`, `cbbServer`, `chkSSL`, `chkSRC`, `progressBar`, `lblMessage`, `deleteCacheToolStripMenuItem` |
| API | `http://api.gnddt.com/api/Launcher/LauncherWebV566`, `http://api.gnddt.com/api/Oauth/GetBlockApp` |
| Resource | `http://config.gnddt.com/`, `http://res.gnddt.com/Resource.txt`, `ResourceInfo.xml`, `.\resource\`, `.\urls.txt`, `missing_urls.txt`, `DownloadResource`, `Hash`, `Progress {0}/{1} files ({2}%)`, `{0:0.00} MB` |
| Local server | `http add urlacl url=http://+:9999/`, `https://+:9998/`, `http add sslcert ipport=0.0.0.0:9998`, `CN=localhost`, `1.3.6.1.5.5.7.3.1`, `http://localhost:9999/crossdomain.xml`, `Method must be GET`, `LISTENING`, `netsh`, `netstat`, `runas` |
| MIME serve | `application/x-shockwave-flash`, `image/png`, `application/xml`, `text/plain`, `application/octet-stream` |
| Cache | `Macromedia\Flash Player`, `InetCpl.cpl,ClearMyTracksByProcess 255` |
| **hosts** | `drivers\etc\hosts`, `127.0.0.1`, `#localhost`, `# disabled` |
| **HWID** | `SELECT SerialNumber FROM Win32_PhysicalMedia`, `Win32_PhysicalMedia` |
| Spawn | `GunnyBrowser.exe`, `resource.exe`, `rundll32.exe` |
| Mirror domains | `gnddt.com`, `gunny6789.com`, `gunnylaumienphi2017.com` |
| Toggle | `UseSSL`, `UseSRC`, `use ssl`, `use src` |

`GunnyBrowser.exe` (UTF-8 strings): chỉ 1 URL hardcode `https://www.gnddt.com/`, import `Qt5WebKit.dll` + `Qt5WebKitWidgets.dll`, có `CommandLineToArgvW`. Không packed (entropy 4.59).

### Cơ chế mấu chốt: hosts + local server

Launcher sửa `drivers\etc\hosts` (có cả string `# disabled` để bật/tắt dòng map). Nhiều khả năng map `res.gnddt.com` → `127.0.0.1`, để URL tuyệt đối trong SWF vẫn trỏ về server local. `UseSRC` = chọn resource local (:9999) hay remote. `UseSSL` = 9998 (self-signed `CN=localhost`) thay vì 9999.

## 2. Vì sao đây là tin cực tốt

**Local HTTP server là của bạn ⇒ bạn quyết định nội dung mọi file SWF mà Flash nạp.**

Đó chính là điểm inject — sạch hơn hẳn proxy MITM của LazyGunny:

| Cách | Độ khó | Ghi chú |
|---|---|---|
| **Serve SWF đã patch từ local server** (gnddt-style) | **Thấp** | Chỉ là `res.sendFile()` trỏ vào bản patch. Không TLS MITM, không cert, không hook |
| Proxy patch on-the-fly (LazyGunny-style) | Cao | Phải MITM HTTPS, pattern-match trong stream |
| Bundle Flash trong Electron 9 | Trung bình | **Không cần nữa** |

## 3. Kiến trúc đề xuất (thay bản cũ)

```
TienTool (Electron 41 — GIỮ NGUYÊN, không hạ version)
  ├─ login          ← đã có: loginService.js / apiService.js / authService.js
  ├─ resource sync  ← đã có config: config.gnddt.com/ResourceInfo.xml, res.gnddt.com/
  ├─ HTTP server local (Node http/express, :9999)   ← MỚI, ~80 dòng
  │     └─ middleware patch: request tới game.swf → trả bản đã patch
  ├─ quản lý hosts (tùy chọn, cần admin)
  └─ spawn GunnyBrowser.exe (dùng lại file có sẵn hoặc tự ship)
        └─ Qt5 WebKit + NPSWF32 → Flash chạy, nạp SWF từ server của bạn
```

Ưu điểm:
- **Không đụng Electron version** — TienTool giữ Electron 41, đầy đủ updater/Mongo/UI hiện tại
- **Không phải viết C++/Qt** — `GunnyBrowser.exe` 143KB dùng lại được
- **Không phải bundle Flash** — NPSWF32.dll đã nằm cạnh GunnyBrowser
- Node serve file **dễ hơn nhiều** so với HttpListener + netsh + self-signed cert của .NET. Nếu dùng port >1024 và không cần HTTPS thì **không cần quyền admin** (bỏ được `netsh urlacl`, `runas`)
- Multi-account: mỗi account 1 tiến trình `GunnyBrowser.exe`, chung 1 server local

## 4. Menu / overlay làm thế nào

`GunnyBrowser.exe` là exe đóng, không inject JS vào được như Electron. 3 lựa chọn:

| Cách | Mô tả | Đánh giá |
|---|---|---|
| **A. Patch trang HTML** | Server local serve luôn trang wrapper chứa `<embed>` SWF + HTML/JS menu của bạn. GunnyBrowser trỏ vào `localhost` thay vì `www.gnddt.com` | **Đơn giản nhất.** Menu là HTML/JS thuần, WebKit render. Cần GunnyBrowser nhận URL qua argv — chưa xác nhận; nếu không thì tự build shell Qt/Electron9 sau |
| B. Patch SWF | Sửa AS3 trong `game.swf` bằng JPEXS, serve bản patch | Mạnh nhất (menu vẽ trong game, đọc biến trực tiếp), nhưng phải patch lại mỗi lần server update SWF |
| C. Overlay cửa sổ ngoài | Cửa sổ Electron trong suốt, always-on-top, bám theo HWND của GunnyBrowser | **Bạn đã có sẵn `koffiService.js`** (FindWindow/GetWindowRect/SetWindowPos). Làm được ngay, độc lập hoàn toàn với Flash. Hợp cho aim overlay 3 tia |

Khuyến nghị: **A + C**. A cho menu chức năng, C cho overlay vẽ đè lên game.

## 5. Rủi ro mới phát hiện

- **`api/Oauth/GetBlockApp`** = server trả danh sách app bị chặn (nhiều khả năng tên process của tool). Launcher tự check và từ chối chạy. Cần biết nó match theo gì (tên process / window title / hash) trước khi làm gì tiếp.
- **HWID lock**: `SELECT SerialNumber FROM Win32_PhysicalMedia` — khóa theo serial ổ đĩa. Ban theo máy chứ không chỉ theo account.
- **Sửa `hosts` cần admin** và ảnh hưởng toàn hệ thống — nên tránh; ưu tiên serve trang wrapper để mọi URL là tương đối.
- Bản `GunnyClient` đang cài có `resource/flash/config.xml` trỏ `id.gunnyzing.vn` = di sản từ client Zing gốc mà gnddt reskin lại. Nguồn đáng tin là **strings trong exe**, không phải config.xml.

## 6. Bước tiếp theo (đã sắp lại)

1. **Xác nhận `GunnyBrowser.exe` có nhận URL qua argv không** — chạy `GunnyBrowser.exe http://localhost:9999/test.html` và xem. Quyết định cách A có khả thi không. *Rẻ nhất, làm trước.*
2. Bật `GunnyClient.exe`, chạy `netstat` + Fiddler xem chính xác trang nào được load, resource nào đi qua :9999/:9998, và `GetBlockApp` trả về gì.
3. Dựng HTTP server local trong TienTool serve `resource/` có sẵn → spawn GunnyBrowser → game chạy. **Đây là mốc chứng minh khả thi.**
4. Decompile `game.swf` (JPEXS): hằng số vật lý cho aim, `ExternalInterface.addCallback`, packet có mã hóa không.
5. Aim overlay 3 tia bằng cách C (Electron trong suốt + koffi).

## Câu hỏi chưa rõ

1. `api.gnddt.com` — TienTool đang gọi API này, vậy bạn là **người vận hành server gnddt** hay chỉ là người chơi? Câu này quyết định `GetBlockApp`/HWID là rào cản hay là thứ bạn kiểm soát được.
2. Được phép ship lại `GunnyBrowser.exe` + `NPSWF32.dll` trong installer của TienTool không?
3. Muốn TienTool **thay hẳn** `GunnyClient.exe`, hay chạy song song?
4. Có bản `GunnyClient.exe` cũ hơn / không obfuscate để dnSpy decompile không? (là .NET nên decompile ra C# gần như nguyên bản — nhanh hơn đoán strings rất nhiều)
