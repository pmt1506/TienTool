# Ruffle compatibility test + Phương án host KHÔNG dùng wrapper

Date: 2026-09-02 | Scope: test thực nghiệm, không sửa code TienTool
Artifacts: `<scratchpad>/flash-res-server.py`, `<scratchpad>/ruffle/ruffle.exe`, log `rl3.log`, `rf-game.log`, `rf-login.log`

## 1. Đính chính report trước

Report trước tôi viết "spawn Flash = ngõ cụt vì `ExternalInterface.available == false`". **Chỉ đúng với `flashplayer_sa.exe` (projector).** Sai nếu bạn **tự host plugin**:

`NPSWF32.dll` là plugin NPAPI. Bên host chỉ cần implement phía browser của NPAPI — bao gồm **NPRuntime** (`NPN_Invoke`, `NPN_GetProperty`…). NPRuntime **chính là** cái Flash dùng để hiện thực `ExternalInterface`. Nên một **NPAPI host tối giản** (vài trăm dòng C++, không cần engine browser) vẫn có đủ cầu 2 chiều với AS3.

Điều đó khớp với quan sát của bạn: LazyTool cho chọn bản Flash 11/12/19/21 — tức là nó **nạp `NPSWF32.dll` theo version bạn chọn**, không phải nhúng browser đầy đủ. Bạn đúng, và đó là lý do nó nhẹ.

## 2. Test Ruffle — kết quả tốt hơn dự đoán

### Cách test
1. Dựng lại **local Flash server** đúng logic `LauncherCommon.RunFlash()` bằng Python (`flash-res-server.py`): serve `resource/`, thiếu file thì tải từ `https://res.gn.zing.vn/` / `https://gunny.vcdn.vn/` (lấy từ `LauncherCommon.BaseUrls`) rồi cache.
2. `config<areaId>.xml` không có trên CDN nào (`www.gnddt.com/config14.xml` chỉ là SPA fallback trả index.html) → alias tạm sang `flash/config.xml`.
3. Ruffle desktop v0.5.0 trỏ vào `http://127.0.0.1:8899/...`

### Kết quả

| SWF | Kích thước | Ruffle | Stub | Error / panic |
|---|---|---|---|---|
| `flash/Loading.swf` (ZWS/LZMA, **SWF v28**) | 327KB | ✅ Loaded 1000x600 @25fps | 1 (`URLLoader.close()`) | 0 AVM2 error |
| `flash/ui/vietnam/swf/game.swf` (CWS, v15, AS3) | 2.5MB → 2.9MB | ✅ Loaded 1000x600 @24fps | 2 (`PerspectiveProjection.fieldOfView/projectionCenter` setter — chỉ mỹ thuật) | **0** |
| `flash/login.swf` (CWS, v9, AS3) | 297KB | ✅ Loaded 1000x700 @25fps | 0 | **0** |

**Ruffle chạy AS3 của Gunny đúng tới mức thực thi logic nghiệp vụ thật:**
- Đọc & parse `config14.xml` (24KB)
- Lấy `REQUEST_PATH` rồi gọi đúng API login gốc: `http://id.gunnyzing.vn/Request/LoginSelectList.ashx?username=null&rnd=…`
- Khi request fail, **dispatch đúng handler của game**: `Loading/__onloadSelectListError()` với `ErrorEvent type="SELECTLIST_LOAD_ERROR"`
- In được `trace` gốc tiếng Trung của DDT: `加载configError:Error #2032: Stream Error`

Hai lỗi duy nhất gặp phải đều **không phải lỗi tương thích**:
- `InvalidDomain` — Ruffle chặn cross-domain, cần crossdomain.xml/cấu hình, giải quyết được
- `username=null` — do chưa truyền flashvars

Không có một dòng `panic`, `unimplemented`, hay `AVM2 error` nào.

## 3. Ruffle giải quyết luôn bài toán "không wrapper"

Với Ruffle bạn **không nhúng browser + plugin**. Bạn render SWF vào **canvas do bạn sở hữu**, menu là HTML/native bao quanh. Đó chính là "không wrapper" mà bạn muốn, và nhẹ hơn Flash host.

### Bonus lớn: `socketProxy` = packet proxy miễn phí

Ruffle web (WASM) không mở TCP thẳng được, nên nó có option [`socketProxy`](https://ruffle.rs/js-docs/master/interfaces/Config.SocketProxy.html): khi SWF gọi `flash.net.Socket`, Ruffle tra bảng `{host, port, proxyUrl}` rồi **tunnel toàn bộ qua WebSocket**.

```js
window.RufflePlayer = { config: { socketProxy: [
  { host: "game.gnddt.com", port: 7800, proxyUrl: "ws://127.0.0.1:8181" }
]}};
```

⇒ Bạn viết cầu **WebSocket↔TCP** trong Node (~60 dòng). Cầu đó **chính là proxy packet** trong Phase 1 của report đầu tiên. Đọc/sửa/chèn packet miễn phí, không MITM, không hosts, không cert.

Tức là 3 thứ gộp làm 1: chạy game + bridge AS3 + đọc protocol.

### Tiền lệ
[aquaspy/aquastar-ruffle](https://github.com/aquaspy/aquastar-ruffle) — launcher AQWorlds (cũng là Flash MMO có socket) xây trên Ruffle. Cùng bài toán, đã có người làm.

## 4. So sánh 3 phương án host (cập nhật)

| | Ruffle (web/WASM trong Electron) | NPAPI host tự viết | Electron 11 + PPAPI |
|---|---|---|---|
| Runtime | **Electron mới nhất** — TienTool dùng chung được | C++/Qt riêng | Electron 11 (Chromium 87, EOL) |
| Binary Flash | **không cần** | NPSWF32.dll | pepflashplayer.dll |
| Bridge AS3 | ExternalInterface 2 chiều, JS thuần | NPRuntime (tự implement) | ExternalInterface |
| Socket | qua `socketProxy` → **proxy sẵn** | TCP thẳng, phải tự chen proxy | TCP thẳng, phải tự chen proxy |
| Patch/hook | **sửa được cả AVM2** (fork Rust) hoặc patch SWF | patch SWF | patch SWF |
| Rủi ro | tương thích khi chơi thật chưa chứng minh | phải viết C++ | EOL, nặng |
| Nhẹ | ~150MB (Electron) | **~50MB** | ~200MB |

## 5. Cái CHƯA chứng minh (đọc kỹ trước khi cam kết)

Test trên mới chỉ chứng minh **load + thực thi AS3 + logic khởi động**. Chưa chứng minh:
- **Gameplay thật**: render trận đấu, filter/blend mode, particle (`partical.xml`, `config.xml` emitter), animation bones — chỗ Ruffle hay lệch nhất
- **Hiệu năng**: game.swf 2.9MB + hàng chục module; Ruffle chậm hơn Flash native đáng kể ở scene nặng
- **Socket thật**: chưa chạy `flash.net.Socket` lần nào (mới chỉ HTTP)
- **Âm thanh**: `audio.swf`, `audiobattle.swf` chưa test

Muốn chứng minh nốt thì **cần 1 account thật đăng nhập được**.

## 6. Bước tiếp theo

1. **Cần bạn cung cấp 1 account gnddt** (hoặc chạy `GunnyClient.exe` một lần rồi bắt tham số) → có token + areaId + `config<N>.xml` thật.
2. Chạy Ruffle với flashvars thật → vào tới sảnh game. Đây là mốc quyết định Ruffle sống hay chết.
3. Nếu vào được sảnh: viết cầu WS↔TCP, bật `socketProxy`, dump packet → có luôn protocol map.
4. Nếu Ruffle gãy ở gameplay: quay về **NPAPI host tự viết** (phương án nhẹ nhất, đúng cách LazyTool làm).

## 7. Ghi chú vận hành

- `flash-res-server.py` đang chạy nền ở port 8899 (đã dừng sau khi test). Chạy lại: `python <scratchpad>/flash-res-server.py`
- Decompile .NET: `dnSpy.Console.exe` fail trong môi trường không có console thật → dùng `ilspycmd` (`dotnet tool install -g ilspycmd`)
- Ruffle desktop v0.5.0 tải sẵn ở `<scratchpad>/ruffle/ruffle.exe`

## Câu hỏi chưa rõ

1. **Cho tôi 1 account gnddt test được không?** Không có thì không đi tiếp bước 2 được — mọi kết luận về Ruffle sẽ dừng ở "khởi động OK, gameplay chưa rõ".
2. `api.gnddt.com` — bạn vận hành server hay là người chơi? (hỏi lần 3)
3. Ưu tiên **nhẹ** (NPAPI host C++ ~50MB) hay **dễ code** (Ruffle + Electron ~150MB)?
4. LazyTool cho chọn Flash 11/12/19/21 — bạn có biết vì sao cần nhiều version không (bản nào chạy mượt hơn? bản nào bypass check nào?). Thông tin này quyết định có nên đi đường NPAPI host không.
