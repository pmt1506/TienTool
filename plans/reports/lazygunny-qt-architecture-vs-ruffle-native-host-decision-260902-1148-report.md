# LazyGunny thực sự dùng gì + Chọn host: Qt/WebKit hay Ruffle native

Date: 2026-09-02 | Branch: `feat/gunny-flash-launcher`
Tiếp nối: `ruffle-full-login-success-and-createlogin-missing-step-260902-1059-report.md`

## 1. Đính chính: LazyGunny VẪN là browser nhúng

Bạn nghĩ LazyTool chạy Flash trực tiếp chứ không nhúng browser. Không phải — `LazyGunny.exe` (443KB) **import trực tiếp**:

```
Qt5Core.dll  Qt5Gui.dll  Qt5Widgets.dll  Qt5Network.dll
Qt5WebKit.dll  Qt5WebKitWidgets.dll        <-- browser engine
```

Symbol MSVC-mangled cho thấy chính xác nó làm gì:

| Symbol | Ý nghĩa |
|---|---|
| `??0QWebView@@QAE@PAVQWidget@@@Z`, `??1QWebView@@UAE@XZ` | **Kế thừa `QWebView`** — game render trong QtWebKit, Flash nạp qua NPAPI (`NPSWF32.dll`) |
| `?contextMenuEvent@QWebView@@MAEXPAVQContextMenuEvent@@@Z` | **Override menu chuột phải** — đây là cách họ custom right-click, **không phải patch SWF** ✔ đúng như kết luận trước |
| `?evaluateJavaScript@QWebFrame@@...` | Chạy JS trong trang |
| `?addToJavaScriptWindowObject@QWebFrame@@...` | **Expose object C++ ra JS** — cầu 2 chiều native ⇄ trang ⇄ SWF |
| `QWebElement` / `QWebElementCollection` / `findAllElements` | Đọc/sửa DOM (lấy link SWF, chèn UI) |
| `QNetworkAccessManager` (14 lần) | **Điểm chặn request** — nơi chèn Referer / tráo SWF. Chính là chỗ `proxyv2.bin` cắm vào |
| `QMenuBar` (28), `QAction` (25) | Thanh menu native trong ảnh bạn gửi |

Không có `QTcpServer`/`QTcpSocket` trong exe ⇒ phần proxy nằm trong payload `proxyv2.bin` tải về, không biên dịch sẵn.

**Cảm giác "nhẹ" của bạn đúng, nhưng lý do khác:** QtWebKit nhẹ hơn Chromium nhiều, không phải vì nó bỏ browser.

## 2. Dung lượng thực đo

| Giải pháp | Dung lượng |
|---|---|
| Lazy Gunny v4 (Qt + WebKit + Flash) | **171 MB** (riêng 10 DLL lõi đã 84 MB) |
| Gunny PC (Electron 9 + PPAPI Flash) | 157 MB |
| GunnyClient (Qt + WebKit + resource) | 320 MB |
| **ruffle.exe** — native Rust, **1 file duy nhất** | **23 MB** |

⇒ **Ruffle native nhẹ hơn LazyGunny ~7 lần.** Và đã chứng minh chạy được Gunny tới sảnh (report trước).

## 3. Ba phương án host

### A. Clone LazyGunny — Qt5 + QtWebKit + NPSWF32
- ✅ Đúng cách tool nổi tiếng làm, chắc chắn tương thích 100% (Flash thật)
- ✅ Có sẵn `contextMenuEvent`, `addToJavaScriptWindowObject`, `QNetworkAccessManager`
- ❌ ~90-170 MB; phải viết C++/Qt; QtWebKit đã bỏ hỗ trợ từ Qt 5.6 (2016)
- ❌ Phải phân phối lại `NPSWF32.dll` (binary Adobe EOL)

### B. Electron 41 + ruffle-web (WASM)
- ✅ Tái dùng nguyên stack TienTool (Vite, Tailwind, Mongo, updater), viết JS
- ✅ `socketProxy` = chỗ đọc/sửa packet miễn phí; chèn Referer bằng `webRequest.onBeforeSendHeaders`
- ❌ ~150 MB, nặng nhất khi chạy nhiều account
- ⚠️ WASM chậm hơn native Ruffle

### C. ⭐ Ruffle native (Rust) làm host riêng — **khuyến nghị**
Ruffle desktop là app Rust dùng `ruffle_core` + wgpu. Fork/nhúng crate đó:
- ✅ **~25-30 MB, 1 file** — nhẹ hơn cả LazyGunny
- ✅ **Truy cập thẳng AVM2**: đọc/ghi biến AS3, hook hàm game ở tầng máy ảo. Mạnh hơn hẳn patch SWF hay đọc packet — đây là thứ LazyTool **không làm được**
- ✅ Socket đi qua code Rust của mình ⇒ đọc/sửa packet ngay trong process, không cần proxy ngoài
- ✅ Không cần Flash binary, không NPAPI, không vấn đề pháp lý Adobe
- ✅ Menu/overlay vẽ bằng egui (Ruffle desktop đã dùng sẵn) hoặc winit
- ❌ Phải viết Rust; UI phải tự dựng (không có HTML/CSS)
- ❌ Rủi ro tương thích Ruffle khi vào trận vẫn chưa kiểm chứng

### Gợi ý kết hợp
Giai đoạn đầu **B** (nhanh, tái dùng TienTool, ra tính năng sớm), giữ **C** làm đích khi cần nhẹ + hook sâu. Cả B và C đều dùng chung Ruffle nên kiến thức không phí. **A chỉ dùng nếu Ruffle gãy ở gameplay.**

## 4. Đã làm trên nhánh `feat/gunny-flash-launcher`

Thêm `tools/gunny-launcher-poc/`:

| File | Việc |
|---|---|
| `gnddt-launch.py` | Login → gate → **CreateLogin.aspx** → PlayGame → in link SWF. HWID đọc động qua WMI. Thay hoàn toàn WebView2 |
| `flash-res-server.py` | Server resource local + reverse-proxy `/q/*` chèn Referer + `config-patched.xml` |
| `play-gunny.ps1` | Chạy 1 phát: login → mở Ruffle. User/Pass là tham số bắt buộc (không hardcode) |
| `capture-ruffle.ps1` | Chụp cửa sổ Ruffle ra PNG để kiểm chứng |
| `abc-strings.py` | Đọc constant pool ABC trong SWF, không cần Java |

Đã kiểm tra: **không có credential nào bị commit**.

## 5. Bước tiếp theo

1. **Vào trận đánh thử** — rủi ro Ruffle cuối cùng. Quyết định giữa C và A.
2. Port `gnddt-launch.py` sang Node, nhét vào TienTool (dùng chung `loginService.js`).
3. Dựng `play.html` + ruffle-web + `socketProxy` (phương án B) → dump packet.
4. Proxy chat server `:5840`.
5. Menu overlay + aim 3 tia.

## Câu hỏi chưa rõ

1. **Bạn có sẵn sàng viết Rust không?** Quyết định giữa B (JS, 150MB) và C (Rust, 25MB + hook AVM2). Nếu ngại Rust thì chốt B.
2. Ưu tiên **nhẹ/nhiều account** hay **ra tính năng nhanh**?
3. Cho tôi vào trận đánh thử luôn chứ? (cần thiết trước khi cam kết kiến trúc)
4. Menu muốn kiểu **thanh menu native** như LazyTool, hay **overlay trong game**?
