# Qt nhúng Flash: menu "gắn vào Flash" bằng cách nào + Vì sao GunnyClient lag

Date: 2026-09-02 | Branch: `feat/gunny-flash-launcher`

## 1. Câu hỏi 1 — Menu Qt điều khiển được Flash bằng cách nào?

Đúng, **phải gắn vào Flash**. Chuỗi cầu nối 2 chặng:

```
Qt/C++  ──QWebFrame::evaluateJavaScript()──►  JS trong trang
JS      ──document.getElementById('game').<tênCallback>(args)──►  AS3 trong SWF

AS3     ──ExternalInterface.call("tênHàmJS", args)──►  JS
JS      ──object đã addToJavaScriptWindowObject()──►  Qt/C++
```

Cả 4 mắt xích đều có trong `LazyGunny.exe` (`evaluateJavaScript`, `addToJavaScriptWindowObject`) và trang game thật bật sẵn `allowScriptAccess="always"` — điều kiện bắt buộc để JS gọi được vào SWF.

### Game ĐÃ có sẵn cầu cho launcher desktop

Rút từ `Loading.swf` / `DDT_Loading.swf` (3 + 2 lần `addCallback`):

**JS → AS3 (callback game tự đăng ký):**

| Callback | Dùng để |
|---|---|
| `SetFlashLoadExternal` | Bật chế độ nạp resource từ ngoài (kèm `loadFromExternal`, `getFilePathFromExternal`, `path`) — **chính là đường GunnyClient đưa file từ HTTP server local vào game** |
| `setLoginType` | Đặt kiểu đăng nhập |
| `IsDesktop` | Báo cho game biết đang chạy trong launcher desktop |

**AS3 → JS (game gọi ra host):**
`BrowserAgent()`, `ExternalLoadStart`, `ExternalLoadStop`, `WindowReturn`, `toLocation`, `alert`, `tellVersion`, `loadConfig`, `setDailyTask`, `setDailyActivity`, `setFatigue`

Có cả `isMicroClient` — **SWF được thiết kế sẵn để chạy trong client native**, không chỉ trên web.

### Nhưng cầu sẵn KHÔNG đủ cho tính năng tiện ích

Mấy callback trên chỉ phục vụ nạp resource + login. Không có `dọnTúi()` hay `mởKho()`. Nên tính năng thật đi 1 trong 2 đường:

| Đường | Cách | Phù hợp với |
|---|---|---|
| **A. Packet** — proxy socket, tự gửi/sửa gói tin | Không đụng SWF | **Hầu hết menu LazyTool**: Dọn thư, Dọn túi, Mở kho ma pháp, Điểm danh clone, auto — đều là hành động phía server |
| **B. Patch SWF** — thêm `ExternalInterface.addCallback` của mình + `ContextMenu` items, serve bản patch qua `QNetworkAccessManager` | Cần JPEXS + patch lại mỗi lần game update | Đọc/ghi state client, menu chuột phải trong game |

`Loading.swf` đã có sẵn **4 lần `ContextMenu`** ⇒ khung menu chuột phải có sẵn, patch thêm item vào đó là khả thi.

Còn menu chuột phải kiểu LazyTool thì đơn giản hơn nhiều: họ **override `contextMenuEvent` của `QWebView`** (đã xác nhận trong symbol) — menu Qt native vẽ đè lên, không đụng Flash.

## 2. Câu hỏi 2 — Vì sao GunnyClient lag?

### Bằng chứng thu được

- Trang game thật đặt **`wmode="Direct"`** → game dùng **Stage3D (GPU)**. Log Ruffle cũng cho thấy game tải texture **Starling** (`starling/hall_scene/*.png`) ⇒ sảnh render bằng GPU.
- `GunnyBrowser.exe` **không chứa** `wmode`, `<embed`, `<object>` ⇒ nó không tự dựng trang, chỉ trỏ vào `www.gnddt.com` và ăn nguyên `wmode="Direct"` của server.
- GunnyClient bundle **`opengl32sw.dll` 14.5 MB** (Mesa — OpenGL phần mềm) + `D3Dcompiler_47.dll`. LazyGunny cũng có (15.3 MB). Đây là fallback khi máy không có GL driver phù hợp.

### Nguyên nhân nhiều khả năng nhất

`wmode="Direct"` cần plugin Flash có **HWND riêng + surface D3D riêng**. Khi QtWebKit composite trang vào một `QWidget`, plugin NPAPI thường bị đẩy sang **windowless mode** — mà windowless **không dùng được Stage3D**. Kết quả: Starling rớt về rasterizer phần mềm, mỗi frame vẽ 1000×600 bằng CPU rồi lại blit qua đường composite của Qt (có thể lại là `opengl32sw` phần mềm nữa). Lag đúng kiểu bạn thấy.

**Chưa chứng minh 100%** — cần profile GunnyClient lúc chạy mới chắc. Nhưng đây là giả thuyết khớp toàn bộ bằng chứng.

### Đối chiếu: Ruffle chạy GPU thật

Log test hôm nay:
```
Using preferred backend Vulkan
Using graphics API vulkan on Intel(R) Iris(R) Xe Graphics (type: IntegratedGpu)
```
Ruffle render bằng **Vulkan trên GPU**. Không có tầng composite plugin windowless nào ở giữa.

### ⚠️ Rủi ro cho quyết định Qt của bạn

Nếu làm **Qt + QtWebKit + NPSWF32** thì rất dễ **thừa hưởng đúng cái lag của GunnyClient**, vì nguyên nhân nằm ở chính mô hình host plugin trong web view. LazyGunny cũng cùng mô hình — nếu LazyGunny mượt hơn GunnyClient thì họ đã xử lý gì đó (ép windowed mode, hoặc dùng bản QtWebKit/Flash khác).

Thêm 2 trở ngại thực tế:
- **QtWebKit đã bị Qt khai tử từ 5.6 (2016)**. Muốn dùng hôm nay phải lấy bản cộng đồng *QtWebKit 5.212* build cho Qt 5.15 — build được nhưng cực nhọc.
- Phải phân phối lại `NPSWF32.dll` (binary Adobe đã EOL).

## 3. Đề xuất: Qt shell + Ruffle làm engine (giữ nguyên ý bạn muốn Qt)

Không cần viết Rust — dùng `ruffle.exe` như một tiến trình con và **nhúng cửa sổ của nó vào layout Qt**:

```cpp
// Qt nhúng HWND ngoài vào widget của mình
QWindow  *w   = QWindow::fromWinId((WId)ruffleHwnd);
QWidget  *box = QWidget::createWindowContainer(w, this);
layout->addWidget(box);          // menu bar Qt nằm trên, game nằm dưới
```

| | Qt + QtWebKit + Flash | **Qt + Ruffle (đề xuất)** |
|---|---|---|
| Dung lượng | ~90–170 MB | **~23 MB + Qt core (~30 MB)** |
| Render | Windowless → nhiều khả năng CPU → lag | **Vulkan/DX12 GPU** |
| QtWebKit đã chết | ❌ phải build bản cộng đồng | ✅ không cần |
| Ship Flash binary | ❌ có | ✅ không |
| Menu bar / chuột phải Qt native | ✅ | ✅ (`contextMenuEvent` trên container) |
| Cầu ExternalInterface JS⇄AS3 | ✅ có | ❌ **không có** |
| Đọc/sửa packet | qua proxy | qua proxy (như nhau) |
| Rủi ro tương thích gameplay | thấp (Flash thật) | **chưa kiểm chứng khi đánh nhau** |

Mất mát duy nhất là cầu `ExternalInterface`. Nhưng như mục 1: **hầu hết menu LazyTool là hành động server ⇒ làm bằng packet, không cần cầu đó.**

## 4. Việc cần trước khi viết code

Máy hiện **chưa có toolchain**: không `qmake`, `cmake`, `g++`, `cl`, `ninja`; không thấy thư mục Qt. Có Visual Studio (chưa vào PATH). Cần cài trước:
- Qt 5.15 hoặc 6.x + Qt Creator (hướng Ruffle chỉ cần Qt Widgets, **không cần QtWebKit**)
- CMake + trình biên dịch (MSVC qua VS Build Tools, hoặc MinGW kèm Qt)

Nếu chọn hướng QtWebKit thì phải thêm bước build **QtWebKit 5.212** — nặng nhất trong toàn bộ kế hoạch.

## Câu hỏi chưa rõ

1. **Chốt hướng nào?**
   (a) Qt + Ruffle nhúng HWND — nhẹ, GPU, không QtWebKit, mất cầu ExternalInterface
   (b) Qt + QtWebKit + Flash — giống hệt LazyGunny, có cầu đầy đủ, nhưng nhiều khả năng lag + phải build QtWebKit 5.212
2. Bạn thấy **LazyGunny có mượt hơn GunnyClient không?** Câu này quyết định giả thuyết lag ở mục 2 — nếu LazyGunny mượt thì hướng (b) vẫn cứu được.
3. Cho tôi **vào trận đánh thử bằng Ruffle** chứ? Nếu Ruffle gãy khi đánh nhau thì (a) sập, phải quay về (b).
4. Cài Qt/CMake bạn tự làm hay muốn tôi hướng dẫn từng bước?
