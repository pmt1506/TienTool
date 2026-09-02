# Gunny — Kiến trúc cửa sổ game Flash riêng + Aim Overlay ("3 tia")

Date: 2026-09-02 | Tiếp nối: `gunny-traffic-interception-and-custom-launcher-feasibility-260902-0206-report.md`
Scope: recon-only

## 1. Giải mã mô hình LazyGunny (đúng như bạn nhận xét: không lưu resource client)

Bằng chứng từ `LazyGunny.exe` + `%APPDATA%\LazyGunny\`:

| Artifact | Nội dung | Kết luận |
|---|---|---|
| `LazyGunny.exe` strings | `zing.vn/login-game`, `zing.vn/server-game` | Gọi thẳng API login + server list chính chủ (headless login, giống `loginService.js` của TienTool) |
| `LazyGunny.exe` strings | `lazygunny.xyz/command`, `lazygunny.xyz/report` | **C2 riêng**: tool pull lệnh/feature-flag/kill-switch từ server của họ, và report ngược lại |
| `proxyv2.bin` 226KB | entropy cao, **đã mã hóa** (`4b 52 14 c0 99 e3 33 e4…`) | Payload patch tải từ `lazygunny.xyz`, giải mã trong RAM. 226KB → không phải game.swf, mà là **module SWF đã patch / payload inject** |
| `Data.lg` 256B | base64 chuẩn, đúng 256 byte | Blob license RSA-2048 |
| `Configs/<hex(username)>.lg` | 1 file/account | Profile per-account |
| `V4Storage/https_idgunny.zing.vn_0.localstorage` | Flash/WebKit storage | Game load **trực tiếp từ web**, không phải từ đĩa |

**Mô hình LazyGunny:**
```
LazyGunny.exe (Qt5 WebKit + NPSWF32 riêng)
  ├─ login headless → zing.vn/login-game, /server-game  → token + server list
  ├─ trỏ WebKit thẳng vào web game (KHÔNG cache resource local)
  ├─ proxy nội bộ (proxyv2.bin) chen giữa → patch/thay SWF on-the-fly + đọc socket
  └─ lazygunny.xyz/command → bật tắt tính năng từ xa
```

**Ưu điểm của cách này so với cách gnddt (lưu resource local):**
- Không bao giờ lệch version — server update SWF, tool tự ăn theo
- Không cần build/ship vài trăm MB resource
- Patch nằm ở proxy nên **tách rời khỏi resource**, không phải patch lại file mỗi lần game update
- Nhược: phụ thuộc mạng, và patch phải viết theo kiểu "tìm & thay pattern" chứ không sửa file cố định

**=> Đây là hướng nên theo cho bạn.** Không copy cách gnddt.

## 2. RÀO CẢN LỚN NHẤT: Electron của bạn không chạy được Flash

Đã đo trực tiếp:

| App | Runtime |
|---|---|
| Gunny PC (`gunny-launcher`) | **Electron 9.4.4 / Chromium 83** + `pepflashplayer.dll` |
| Lazy Gunny v4 | Qt5 WebKit + `NPSWF32.dll` (NPAPI) |
| GunnyClient | Qt5 WebKit + `NPSWF32.dll` |
| **TienTool (hiện tại)** | **Electron 41** — Chromium đã **bỏ hoàn toàn PPAPI Flash từ Chromium 88 / Electron 12** |

→ **Không thể nhét Flash vào TienTool hiện tại.** Đây là lý do Gunny PC vẫn kẹt ở Electron 9 (2020).

### Hệ quả kiến trúc: tách 2 process

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ TienTool (Electron 41)      │  IPC   │ gunny-shell (Electron 9)     │
│ - quản lý account, login    │◄──────►│ - BrowserWindow + PPAPI Flash│
│ - MongoDB, license, updater │ local  │ - BrowserView overlay (menu) │
│ - UI chính                  │ socket │ - proxy TCP nội bộ           │
│ - spawn N cửa sổ game       │        │ - 1 instance = 1 account     │
└─────────────────────────────┘        └──────────────────────────────┘
```

- TienTool giữ nguyên Electron 41 — **không phải hạ version**, không mất updater/tính năng hiện có
- `gunny-shell` là app Electron 9 riêng, nhỏ, ship kèm `pepflashplayer.dll`, spawn bằng `child_process`
- Giao tiếp: named pipe / `127.0.0.1` websocket. TienTool truyền token login (đã có sẵn từ `loginService.js`) → shell mở game đã đăng nhập
- Multi-account = spawn nhiều instance `gunny-shell`, mỗi cái `--user-data-dir` riêng

**Lựa chọn thay thế cho `gunny-shell`:**

| Phương án | Ưu | Nhược |
|---|---|---|
| **Electron 9 + PPAPI Flash** (như Gunny PC) | JS thuần, tái dùng skill sẵn có, DevTools debug được, overlay bằng BrowserView | Chromium 83 EOL, không vá bảo mật |
| Qt5 WebKit + NPSWF32 (như LazyGunny) | Nhẹ hơn nhiều (~50MB vs ~200MB), đúng cách tool nổi tiếng làm | Phải viết C++/Qt |
| CEF cũ + Flash | Linh hoạt | Nặng công |
| **Ruffle** (AS3, Rust/WASM) | Tương lai, chạy Electron mới, **hook được ngay ở tầng AVM2 → cực mạnh cho overlay** | AS3 chưa đủ chín cho game nặng như Gunny; phải test thật mới biết |

Khuyến nghị: **Electron 9 trước** (nhanh, chắc chắn chạy), khảo sát Ruffle song song vì nếu Ruffle chạy được thì mọi tính năng làm dễ gấp 10 lần.

## 3. Tool "vẽ đường 3 tia" — có, và đây là tính năng NÊN LÀM ĐẦU TIÊN

Đã xác nhận đây là tính năng có thật, phổ biến trong hệ tool Gunny VN: hiển thị **góc bắn / gió / lực** ở góc màn hình, kèm cửa sổ nhỏ vẽ sẵn quỹ đạo đạn để canh né địa hình ([Gunny Fire](https://firegunny.blogspot.com/2013/06/gunny-fire-183-tool-for-gunny-game.html), [mô tả tính năng](https://1bigaustria.com/tai-tool-gunny/)). "3 tia" = vẽ đồng thời nhiều nghiệm quỹ đạo (nhiều tổ hợp góc/lực cùng tới đích) để chọn đường không vướng vật cản.

### Vì sao nên làm đầu tiên

**Nó là 100% client-side, không đụng packet.** Chỉ đọc → tính → vẽ. Server không nhận thêm/khác gói tin nào ⇒ **không có gì để server phát hiện**. Rủi ro ban gần như bằng 0, khác hẳn auto-farm (mức "Chèn"/"Sửa" trong report trước).

### Vật lý cần
Đạn Gunny là parabol có gió tác động ngang:
```
x(t) = v·cos(θ)·t + ½·k_wind·W·t²
y(t) = v·sin(θ)·t − ½·g·t²
```
Cần lấy 3 hằng số từ SWF: `g` (gravity), `k_wind` (hệ số gió), và scale lực→vận tốc `v = f(force)`. Ngoài ra mỗi loại súng có hệ số riêng.

### 3 cách lấy input (θ, W, force) — theo độ khó tăng dần

| Cách | Nguồn dữ liệu | Đánh giá |
|---|---|---|
| A. OCR/pixel | Đọc số góc/gió trên màn hình | Bạn **đã có sẵn Tesseract + Jimp** trong TienTool. Chạy được ngay, nhưng chậm + hay sai |
| B. Packet | Parse gói tin gió/lượt từ proxy | Chính xác tuyệt đối, cần Phase 1 của report trước |
| C. AS3 hook | Đọc thẳng biến trong SWF (`ExternalInterface` hoặc patch qua proxy) | Chuẩn nhất + realtime, khó nhất |

### Vẽ ở đâu
Overlay trong suốt bằng **BrowserView phủ lên game** (đúng cách Gunny PC làm với `bars.html` + `preload-bottom-bar.js`) → vẽ canvas 2D, `setIgnoreMouseEvents(true)` để click xuyên qua. Không đụng DOM/SWF của game.

### Lộ trình khả thi nhất
1. Dựng `gunny-shell` Electron 9 → mở được game bằng Flash (mốc quan trọng nhất)
2. Overlay BrowserView trong suốt + canvas — vẽ thử 1 parabol tĩnh
3. Decompile `game.swf` lấy `g`, `k_wind`, bảng lực (JPEXS)
4. Input bằng cách A (OCR, tái dùng code có sẵn) → có tia đầu tiên chạy được
5. Nâng lên cách B/C khi proxy đã đọc được packet

## 4. Ưu tiên lại (thay đổi so với report trước)

Report trước đề xuất decompile trước. Sau khi biết rào cản Electron 9, thứ tự nên là:

1. **PoC `gunny-shell`**: Electron 9 + pepflashplayer + load game từ web (không cache local) — chứng minh mở được game. *Nếu bước này fail thì mọi thứ sau vô nghĩa.*
2. **Overlay BrowserView** trong suốt, click-through
3. **Decompile `game.swf`** (JPEXS) → hằng số vật lý + kiểm tra `ExternalInterface.addCallback` + xem có encrypt packet không
4. **Aim overlay 3 tia** — tính năng đầu tiên, rủi ro ~0
5. Proxy TCP + packet map → các tính năng "ngầm" nặng hơn

## 5. Rủi ro

- **Electron 9 EOL** — Chromium 83, không còn vá bảo mật. Chấp nhận được vì chỉ dùng để load 1 domain game duy nhất; nên bật `contextIsolation`, chặn navigation ra ngoài whitelist.
- **`pepflashplayer.dll` phân phối lại** — về pháp lý là redistribute binary Adobe đã EOL. Gunny PC và LazyGunny đều làm; rủi ro thực tế thấp nhưng có tồn tại.
- **Aim assist vẫn vi phạm ToS** dù không đụng packet — chỉ là không bị phát hiện tự động, người chơi khác vẫn report được.
- Nếu **Ruffle** chạy được thì toàn bộ mục 2 trở nên lỗi thời → nên bỏ 1-2 tiếng test Ruffle với `game.swf` trước khi cam kết Electron 9.

## Câu hỏi chưa rõ

1. Target cuối là **gunnyzing.vn** (chính chủ) hay **gnddt.com**? — quyết định login flow + anti-cheat
2. `gunny-shell` chạy **kèm** TienTool (spawn từ TienTool) hay là app đứng riêng?
3. Có sẵn `pepflashplayer.dll` để dùng lại từ `gunny-launcher`, hay muốn thử Ruffle trước?
4. Multi-account bao nhiêu cửa sổ song song? (ảnh hưởng chọn Electron 9 ~200MB/instance vs Qt ~50MB)
5. Ưu tiên aim overlay trước hay auto-farm trước?
