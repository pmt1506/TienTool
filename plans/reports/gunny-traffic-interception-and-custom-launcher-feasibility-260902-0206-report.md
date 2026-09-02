# Gunny — Traffic Interception & Custom Launcher: Feasibility Research

Date: 2026-09-02 | Scope: recon-only, không sửa code

## 1. Kiến trúc thực tế (đã verify trên máy)

### GunnyClient (`C:\Program Files (x86)\GunnyClient`)
- Là **Qt5 + QtWebKit browser wrapper**, không phải game engine.
- Flash chạy qua **NPAPI plugin**: `plugins/NPSWF32.dll`.
- Config game: `resource/flash/config.xml`
  - `FLASHSITE = http://id.gunnyzing.vn/flash/`
  - `LOGIN_PATH = http://id.gunnyzing.vn/Default.aspx`
  - `RESOURCE_SITE`, `POLICY_FILES`, block `<update>` versioning 769→801
- `resource/crossdomain.xml` = `allow-access-from domain="*"` → Flash không chặn cross-domain.
- SWF nằm sẵn trên đĩa: `resource/flash/ui/vietnam/swf/*.swf` (game.swf, ddtcoreii.swf, ddtstore.swf, farm.swf, teamdungeon.swf…) → **decompile được trực tiếp**.
- `urls.txt` (47.9k dòng) = manifest resource; `missing_urls.txt` = log resource thiếu.

### Lazy Gunny v4 (`C:\Program Files (x86)\Lazy Gunny v4`)
- **Kiến trúc y hệt**: Qt5 WebKit riêng + `NPSWF32.dll` riêng → xác nhận: tool nổi tiếng = *tự đóng gói launcher riêng*, không hook vào game gốc.
- `%APPDATA%\LazyGunny\`:
  - `proxyv2.bin` → **có tầng proxy riêng** (rất nhiều khả năng là local TCP proxy cho game socket)
  - `Configs/<hex(username)>.lg` → config per-account, tên file = hex của username
  - `V4Storage/https_idgunny.zing.vn_0.localstorage`, `http_lazygunny.com_0.localstorage`
- => Mô hình LazyGunny = launcher riêng + proxy socket + profile per-account.

### Gunny PC (`%LOCALAPPDATA%\Programs\gunny-launcher`) — blueprint hiện đại
- **Electron** + **PPAPI Flash** (`resources/plugins/pepflashplayer.dll`)
- Custom scheme `roadclient://` phục vụ file game local
- UI overlay tách riêng bằng **BrowserView**: `bars.html` + `preload-bottom-bar.js` (16KB)
- `preload.js` expose `window.gunny.action(name)` → `ipcRenderer.send('toolbar-action')`; poll `<embed>/<object>` để bắt `flash-ready` gỡ splash
- => Chính là stack nên copy: **giống TienTool (Electron) 100%**.

### TienTool hiện tại
- Automation ở **tầng account/HTTP**: `src/services/apiService.js`, `autoService.js`, `vipRewardService.js` → `https://api.gnddt.com/api/...` (GetCodeEvent, login token, captcha).
- Tầng OS: `src/koffiService.js` (user32: FindWindow/EnumWindows/SetWindowPos/SendMessage), Clickermann macro, Tesseract OCR.
- **Chưa có gì ở tầng protocol game.** Đây là khoảng trống lớn nhất.

## 2. Trả lời: đọc được traffic không?

Có. Traffic Gunny chia 3 tầng:

| Tầng | Nội dung | Cách đọc | Độ khó |
|---|---|---|---|
| HTTP/HTTPS | login, shop, giftcode, nạp | Fiddler/mitmproxy, hoặc Electron `webRequest`/CDP | Dễ (đã làm) |
| Policy socket :843 | `<policy-file-request/>` của Flash | TCP listener | Rất dễ |
| **TCP game socket** | **toàn bộ gameplay: bắn, item, dungeon, pet, farm, shop, boss** | **local TCP proxy** | Trung bình — mọi tính năng "ngầm" nằm ở đây |

Game dùng `flash.net.Socket` với **protocol nhị phân DDTank** (Gunny = DDTank của 7Road). Packet = header độ dài + packet-ID + body.

**Điểm mấu chốt: protocol này public.** Source server emulator DDTank có sẵn kèm nguyên enum packet ID:
- [geniushuai/DDTank-3.0](https://github.com/geniushuai/DDTank-3.0) — có `gspacketin 2.6.cs` (bảng packet ID) và `Fighting.Server/FightServer.cs`
- [zsj0613/DDTServer](https://github.com/zsj0613/DDTServer)
- [SkelletonX/DDTank4.1](https://github.com/SkelletonX/DDTank4.1)

Nghĩa là **không phải reverse từ số 0** — map ~80% packet ID từ source có sẵn, phần VN custom đối chiếu bằng SWF decompile.

## 3. Lộ trình đề xuất (4 phase)

### Phase 1 — Recon protocol (chưa cần launcher)
1. Decompile SWF bằng **JPEXS FFDec** (`ffdec.jar`, có CLI export AS3):
   - Target: `resource/flash/ui/vietnam/swf/game.swf`, `ddtcoreii.swf`
   - Tìm class kiểu `GameServiceEventProvider`, `SocketManager`, `CommandID`/`eCommand`, các `send()`/`writeShort()`
   - → Lấy bảng cmdID + thứ tự field mỗi packet, và biết có encrypt/XOR key hay không
2. Viết **proxy TCP** đơn giản (Node `net`, ~100 dòng): listen `127.0.0.1:PORT` → relay tới server thật, dump hex + parse header.
3. Ép game trỏ vào proxy: sửa `config.xml` / file `hosts`, hoặc redirect ngay trong launcher riêng.

**Deliverable**: `protocol-map.md` — cmdID ↔ ý nghĩa ↔ struct.

### Phase 2 — Launcher riêng (Electron, tái dùng stack TienTool)
Copy đúng mô hình Gunny PC:
- Electron + `pepflashplayer.dll` (`app.commandLine.appendSwitch('ppapi-flash-path')`); hoặc **Ruffle** cho đường dài
- Custom scheme `gnclient://` phục vụ SWF từ cache local → kiểm soát hoàn toàn resource (có thể thay/patch SWF)
- Game render trong `BrowserWindow`; **menu tool render trong `BrowserView` riêng** (overlay) — không đụng DOM game, đúng cách Gunny PC làm
- Proxy Phase 1 nhúng luôn vào main process → mọi packet đi qua Electron

**Lợi thế**: Electron + Vite + Tailwind đã có sẵn trong TienTool → tái dùng renderer, MongoDB, auth/license, electron-updater.

### Phase 3 — Menu in-game + tính năng ngầm
Khi proxy đã hiểu packet, 3 mức can thiệp tăng dần:

| Mức | Kỹ thuật | Ví dụ |
|---|---|---|
| Đọc | parse packet → hiển thị | HUD vàng/exp/HP real-time, log rơi đồ, đếm lượt boss, cảnh báo reset dungeon |
| Chèn | proxy tự gửi packet thay user | auto nhận quà daily, auto quest, auto ăn pet, auto farm, auto vào phòng |
| Sửa | rewrite packet on-the-fly | hỗ trợ góc/lực bắn, auto-retry, skip animation |

Mức "Sửa" là mức LazyTool/DucTool làm. Lưu ý server validate → chỉ sửa được cái server không check.

**Đường tắt**: nếu SWF có `ExternalInterface.addCallback`, gọi thẳng hàm AS3 từ JS Electron — không cần đụng protocol. Kiểm tra ngay khi decompile.

### Phase 4 — Multi-account & headless
- Proxy stateless → chạy N session song song. Endgame: **socket client thuần Node, bỏ hẳn Flash** (tự bắt tay + gửi packet) → auto farm 20 acc không tốn RAM.
- Nối vào `accountService` / MongoDB sẵn có.

## 4. Ý tưởng tính năng (dễ → khó)

1. **Packet logger UI** — cửa sổ xem live traffic, filter theo cmdID. Nền tảng cho mọi thứ sau.
2. **HUD overlay** — vàng/xu/exp/vé dungeon/buff, lấy từ packet chứ không OCR → chính xác 100%, thay được Tesseract hiện tại.
3. **Auto daily** — quà, giftcode, VIP week, quest. Tầng socket phủ được cả phần web API không có.
4. **Auto farm / auto dungeon** — gửi chuỗi packet, thay hoàn toàn Clickermann (bỏ macro chuột, không lệ thuộc resolution/focus).
5. **Hỗ trợ ngắm** — tính góc + lực từ packet gió/địa hình, vẽ đường bắn overlay.
6. **Shop/market scanner** — poll packet shop, alert khi có item.
7. **Config per-account** — giống `.lg` của LazyGunny, đã có MongoDB rồi.

## 5. Rủi ro

- **Anti-cheat**: `config.xml` có `<CHECKDESK_KILL enable="false"/>` — server chính chủ có cơ chế phát hiện launcher lạ và kick sau 10 phút (đang tắt). Private server thường lỏng hơn.
- **ToS**: tự động hóa vi phạm ToS server chính chủ → nguy cơ khóa account. An toàn: private server bạn có quyền, hoặc account của chính bạn.
- **Flash EOL**: PPAPI Flash không còn update. Ngắn hạn bundle `pepflashplayer.dll` như Gunny PC; dài hạn cân nhắc Ruffle (AS3 chưa chắc chạy nổi Gunny).
- **Encryption**: nếu DDTank VN thêm XOR/RC4 lên packet, phải lấy key từ SWF trước khi proxy parse được. Đây là rủi ro lớn nhất của Phase 1.

## 6. Bước tiếp theo

Phase 1 step 1 trước tất cả: decompile `game.swf`, tìm class socket + bảng cmdID + xác định có encrypt không. Kết quả quyết định toàn bộ độ khả thi. Ước lượng: 1 buổi.

## Câu hỏi chưa rõ

1. Target là server **chính chủ (gunnyzing.vn)** hay **private (gnddt.com)**? Protocol/anti-cheat khác nhau, ảnh hưởng lớn tới thiết kế.
2. `api.gnddt.com` là backend của TienTool hay của private server? Ai sở hữu?
3. Launcher mới **thay thế** GunnyClient hoàn toàn, hay chạy song song với tool hiện tại?
4. Có chấp nhận rủi ro ban account để test proxy trên server thật không?
