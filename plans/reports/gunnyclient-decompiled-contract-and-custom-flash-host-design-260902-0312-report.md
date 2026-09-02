# GunnyClient.exe decompiled — Contract đầy đủ + Thiết kế Flash Host riêng

Date: 2026-09-02 | Nguồn: ilspycmd decompile `GunnyClient.exe` (.NET 4.0, **không obfuscate**)
Source đã giải: `<scratchpad>/gc-src/LauncherGunny/` (13 file, 2220 dòng C#)

## 1. Decompile: thành công, source gần như nguyên bản

`dnSpy.Console.exe` fail (`SetConsoleOutputEncoding: handle is invalid` — cần console thật). Dùng **`ilspycmd`** (`dotnet tool install -g ilspycmd`) thì ra sạch.

Namespace `LauncherGunny`: `Login`, `LauncherCommon` (632 dòng, lõi), `AutoUpdate`, `AutoDownloadRes`, `DownloadResource`, `GameMgr`, `HostsFileManager`, `ProcessingForm`, `ListServer`, `FileResourceInfo`.

## 2. CONTRACT QUAN TRỌNG NHẤT — cách spawn GunnyBrowser

`Login.cs:225-245`:

```csharp
string arguments = string.Format("{0} {1} {2} {3} {4} {5}",
    GameMgr.UserName,      // username
    GameMgr.Token,         // token trả từ API login
    listServer.AreaID,     // ID server chọn ở cbbServer
    flag2 ? "1" : "0",     // useLocalResource (chkSRC && port khả dụng)
    serialNumber,          // HWID = serial ổ đĩa
    flag ? "1" : "0");     // useSSL  (chkSSL && :9998 khả dụng)
new ProcessStartInfo(Path.Combine(Directory.GetCurrentDirectory(), "GunnyBrowser.exe"), arguments)
```

⇒ **`GunnyBrowser.exe <user> <token> <areaId> <useLocalRes> <hwid> <useSSL>`**

Không nhận URL — URL hardcode `https://www.gnddt.com/`, browser tự ghép param. Nghĩa là **spawn được ngay từ TienTool**, nhưng **không đổi được URL** ⇒ muốn trỏ vào trang wrapper của mình thì phải tự viết host.

## 3. Login API (khớp với TienTool đang dùng)

`LauncherCommon.cs:216`:
```
POST http://api.gnddt.com/api/Launcher/LauncherWebV566
form: username, password, PublicKey = "PublicKey-" + <HWID>
resp: "0" → account bị khóa | "1" → sai user/pass | còn lại = TOKEN (plain text, bỏ dấu ")
```
HWID: `SELECT SerialNumber FROM Win32_PhysicalMedia` (WMI, serial ổ đĩa vật lý).

## 4. Local Flash Server — toàn bộ logic chỉ ~40 dòng

`LauncherCommon.cs:429-497`:
```csharp
listener.Prefixes.Add("http://+:9999/");     // luôn
listener.Prefixes.Add("https://+:9998/");    // nếu UseSSL
// handler:
if (method != GET) → 405 "Method must be GET"
fileName = RawUrl.TrimStart('/').Split('?')[0]
fullPath = Path.Combine(resourcePath, fileName)     // .\resource\
if (!File.Exists && !await TryDownloadOnlineFileAsync(fileName, fullPath)) → 404
ContentType = .swf→application/x-shockwave-flash | .xml→application/xml
             | .png→image/png | .txt→text/plain | _→application/octet-stream
stream file ra response
```
Có **lazy-download**: file thiếu thì tải từ `res.gnddt.com` rồi cache, ghi vào `missing_urls.txt`.

Cert HTTPS: self-signed `CN=localhost` RSA-2048, SAN = localhost + 127.0.0.1, EKU `1.3.6.1.5.5.7.3.1`, nhét vào store `MY` rồi `netsh http add sslcert`. Kiểm tra sống bằng GET `localhost:9999/crossdomain.xml`.

**Node viết lại cái này dễ hơn nhiều** — và nếu bỏ HTTPS thì khỏi cert, khỏi netsh, khỏi quyền admin.

## 5. Phòng thủ chống tool (mới phát hiện)

`HostsFileManager.CheckHost()` — **xóa mọi dòng trong `drivers\etc\hosts` trỏ tới `gnddt` / `gunny6789` / `gunnylaumienphi2017`**, kể cả dòng đã comment bằng `# disabled `. Rồi set lại file read-only.

⇒ Hướng "map domain → 127.0.0.1 qua hosts" bị chặn thẳng. Không dùng được. Phải đi đường khác (host riêng + URL tương đối).

Ngoài ra: `rundll32.exe InetCpl.cpl,ClearMyTracksByProcess 255` + xoá `Macromedia\Flash Player` cache.

## 6. Trả lời: "spawn mỗi Flash có đủ không?" — KHÔNG

Đây là điểm quan trọng nhất của report này.

**Flash Projector standalone (`flashplayer_sa.exe game.swf`) là ngõ cụt cho custom.** Lý do: `ExternalInterface.available == false` khi chạy ngoài browser ⇒ **không có cầu JS↔AS3**. Không bridge thì không có menu, không đọc được state game, không gọi được hàm trong SWF. Chỉ được đúng 1 cửa sổ chạy game.

Muốn có tính năng như LazyTool thì cần **4 tầng**, không phải 1:

| Tầng | Làm gì | Bắt buộc cho |
|---|---|---|
| 1. Host shell | cửa sổ + menu bar + multi-window/tab | Toàn bộ menu header |
| 2. Bridge JS↔AS3 | `ExternalInterface` (chỉ có khi Flash nhúng trong **browser**) | Đọc/ghi state game từ host |
| 3. SWF patch | sửa AS3, serve bản patch từ server local | **Right-click custom**, menu trong game |
| 4. Process/packet | hook timer, đọc/chèn packet | Cheat Speed, auto |

### Map menu LazyTool → tầng cần có

| Menu (ảnh bạn gửi) | Tầng |
|---|---|
| Giao diện, Đổi Server, Xóa Cache, Gia hạn tool, Gỡ mã kích hoạt, Quản lý Cloud | 1 (host thuần) |
| Điểm danh clone | 1 + HTTP API (TienTool đã có) |
| Dọn thư, Dọn túi, Mở kho ma pháp | 2 hoặc 4 (gọi hành động in-game) |
| Hiện bảng cài đặt | 2 + 3 (overlay trong game) |
| **Cheat Speed** | 4 — hook `QueryPerformanceCounter`/`timeGetTime`/`GetTickCount` trong process Flash (speedhack cổ điển) |
| **Custom right-click** | **3 bắt buộc** — Flash context menu chỉ đổi được bằng `ContextMenu` API **trong AS3**. Host không chèn item vào đó được |

**⇒ Custom right-click của LazyTool là bằng chứng chắc chắn họ patch/inject SWF.** Khớp với `proxyv2.bin` (226KB, mã hóa) tìm được ở report trước.

## 7. Thiết kế host riêng (đúng ý bạn: tự làm, không xài GunnyBrowser)

```
TienTool (Electron 41 — quản lý account, login, Mongo, license, updater)
   │  spawn + IPC
   ▼
gunny-host  (browser tối giản có Flash)
   ├─ trang wrapper LOCAL:  http://127.0.0.1:PORT/play.html
   │     <embed src="game.swf" flashvars="user=…&token=…&area=…">
   │     + menu bar HTML/JS  + overlay canvas (3 tia)
   ├─ HTTP server local (Node)  ← thay LauncherCommon, ~80 dòng
   │     └─ middleware: request game.swf → trả bản ĐÃ PATCH
   └─ bridge:  JS  ⇄ ExternalInterface ⇄ AS3
```

Vì trang wrapper là của bạn ⇒ **mọi URL đều tương đối tới localhost** ⇒ **không cần đụng `hosts`**, né được `CheckHost()`.

### Chọn runtime cho `gunny-host`

| Phương án | Flash API | Đánh giá |
|---|---|---|
| **Electron 11** (Chromium 87 — bản **cuối** còn PPAPI Flash) | PPAPI | **Khuyến nghị.** JS thuần, DevTools, BrowserView overlay, menu native. Mới hơn Electron 9 của Gunny PC |
| Qt5 WebKit + NPSWF32 (LazyGunny) | NPAPI | Nhẹ nhất (~50MB), nhưng phải viết C++ |
| CEF 3 cũ (≤ 87) | PPAPI | Linh hoạt hơn Electron, nặng công hơn |
| Ruffle | AVM2 riêng | Chạy Electron mới, **hook thẳng AVM2 = mạnh nhất**, nhưng AS3 chưa chắc kham nổi Gunny |

**TienTool giữ nguyên Electron 41.** Chỉ `gunny-host` là Electron 11, đóng gói riêng, spawn bằng `child_process`. Multi-account = N instance, mỗi cái `--user-data-dir` riêng, dùng chung 1 HTTP server.

## 8. Bước tiếp theo (thứ tự thực thi)

1. **Test Ruffle với `resource/flash/ui/vietnam/swf/game.swf`** — 1-2 tiếng. Nếu chạy được thì bỏ hết Electron 11 + Flash, mọi tầng 2/3 dễ gấp nhiều lần. Đáng thử trước.
2. **PoC `gunny-host`**: Electron 11 + pepflash + `play.html` tự viết + Node server serve `resource/` có sẵn + flashvars từ contract mục 2 → **game chạy được**. Mốc quyết định.
3. Kiểm tra `ExternalInterface.available` trong SWF (JPEXS grep `ExternalInterface`) → có sẵn callback nào không.
4. **Menu bar + overlay canvas** (tầng 1) — dễ, có ngay giá trị.
5. Patch SWF thử: thêm 1 item vào `ContextMenu` (tầng 3) — chứng minh làm được custom right-click.
6. Aim overlay 3 tia.
7. Cheat Speed + packet (tầng 4) — sau cùng.

## 9. Rủi ro

- **Electron 11 / Chromium 87** EOL bảo mật. Chỉ load `127.0.0.1` + domain game ⇒ chấp nhận được; bật `contextIsolation`, whitelist navigation.
- Patch SWF phải làm lại mỗi lần server update `game.swf`. Giảm đau bằng patch theo **pattern AS3** (script hoá bằng JPEXS CLI trong build), không sửa tay.
- `CheckHost()` xoá hosts entry — thiết kế ở mục 7 né được, nhưng nếu sau này họ thêm check khác (port :9999 lạ, tên process) thì phải điều chỉnh.
- Ship lại `pepflashplayer.dll` / `NPSWF32.dll` = redistribute binary Adobe EOL.

## Câu hỏi chưa rõ

1. `api.gnddt.com` — bạn **vận hành** server hay là người chơi? Quyết định HWID/token có phải rào cản không. (Hỏi lần 2, vẫn chưa có đáp án)
2. Ưu tiên **1 cửa sổ game custom sâu** hay **multi-account nhiều cửa sổ**? Ảnh hưởng chọn Electron 11 (~200MB/instance) vs Qt (~50MB).
3. Có sẵn bản `game.swf` mới nhất để tôi thử decompile + test Ruffle không? (`resource/flash/ui/vietnam/swf/` trong máy có thể đã cũ)
4. Cheat Speed có nằm trong phạm vi muốn làm không? Nó là tầng khác hẳn (inject DLL vào process) — nặng nhất và dễ bị phát hiện nhất.
