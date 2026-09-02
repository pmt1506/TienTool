# ✅ VÀO ĐƯỢC SẢNH GAME bằng Ruffle — và nguyên nhân treo ở Loading.swf

Date: 2026-09-02 | Test thật trên account `vh.amee0001`, server AreaID=2 (Gà MYTHIC)
Artifacts: `<scratchpad>/gnddt-launch.py`, `flash-res-server.py`, `capture-ruffle.ps1`, `shot5.png`

## TL;DR

Ruffle **chạy Gunny hoàn chỉnh tới sảnh game**, socket sống, chat thế giới chạy real-time.
Nguyên nhân "treo ở Loading.swf" của tool cũ là **thiếu 2 thứ, không phải thiếu header ở SWF**:

1. **Không gọi `CreateLogin.aspx`** — bước đăng ký session key lên game server (trang gate làm bằng JavaScript, `fl.exe` không chạy JS nên bỏ qua).
2. **`ServerList.ashx` kiểm tra `Referer`** — không phải `play.gnddt.com` thì trả IP giả `127.0.0.1:9000`.

## 1. Chuỗi khởi động ĐẦY ĐỦ (đã verify chạy được)

```
1. POST api.gnddt.com/api/Launcher/LauncherWebV566
     username, password, PublicKey=PublicKey-<HWID>          -> TOKEN (256 ký tự)
     ("0"=khóa acc, "1"=sai pass)

2. GET  play.gnddt.com/RedircetPlayGame?user=<TOKEN>&s=<AreaID>
     -> HTML gate, đặt cookie ASP.NET_SessionId
     -> trong HTML có chuỗi:  content=<user>|<keyGUID>|<số>|<md5>

3. GET  api.ipify.org                                        -> IP public

4. GET  quest2.gnddt.com/CreateLogin.aspx?content=<content>&active=<IP>
     ★ BƯỚC BỊ THIẾU. Trả "0" = OK.
     Thiếu bước này -> login.ashx trả "Đăng nhập thất bại.." -> treo 100% Loading

5. GET  play.gnddt.com/PlayGame.aspx?rand=...
     -> <embed src="http://res1.gnddt.com/flash/Loading.swf
          ?user=..&key=<keyGUID>&isGuest=False&ua=&loginType=0
          &fbapp=false&v=10950&rand=..&config=http://config.gnddt.com/config<AreaID>.xml">

6. SWF boot -> quest2/ServerList.ashx -> socket tới game server
```

## 2. Cổng chặn `Referer` trên ServerList.ashx

| Referer gửi lên | ServerList.ashx trả |
|---|---|
| `http://play.gnddt.com/` (bất kỳ path) | **`IP=15.235.230.126 Port=9001`** ✅ thật |
| `http://res1.gnddt.com/flash/Loading.swf` | `IP=127.0.0.1 Port=9000` ❌ |
| `http://www.gnddt.com/` | `127.0.0.1:9000` ❌ |
| localhost / không có Referer | `127.0.0.1:9000` ❌ |

Flash projector nạp SWF trực tiếp gửi Referer là URL của SWF ⇒ luôn nhận IP giả ⇒ treo. **Đây chính là "update gì đó" làm hỏng tool cũ.**

Cách vượt: reverse-proxy các request `REQUEST_PATH` và chèn `Referer: http://play.gnddt.com/PlayGame.aspx`. Điểm móc: tham số `config=` trong URL SWF — serve `config<N>.xml` đã sửa `REQUEST_PATH` trỏ về proxy local. Không cần đụng `hosts`.

## 3. Ruffle: cần bật socket

Ruffle desktop mặc định **hỏi người dùng** mỗi lần SWF mở socket (hộp thoại "Requesting Network Access"). Chạy không người trông ⇒ tự từ chối ⇒ tưởng nhầm là lỗi kết nối.
→ Chạy với `--tcp-connections allow` (hoặc `--socket-allow host:port`).

## 4. Kết quả cuối

`login.ashx` → `<Result value="true" message="Đăng nhập thành công.">` (1018B)

Ruffle vào **sảnh game đầy đủ**:
- Nhân vật `GNLMP500K9YZBl`, Lv 29, Lực chiến 1539, HP 1500/1500, server MYTHIC
- Toàn bộ UI: EVENT, CHIẾN ĐẤU, THƯƠNG MẠI, Đặc sắc, Nhiệm vụ, Hạng, GM, shop, pet…
- **Chat thế giới real-time** ([Loa lớn] từ Ngọc Trinh, CGZD, ĐinhTuấn, CANEzzz…) ⇒ socket game hoạt động hoàn chỉnh
- Danh sách nhiệm vụ, avatar, trang bị (`hair44`, `cloth76`, `axe`, `wings.swf`) render đúng

**Packet đã đọc được ngay từ trace của game:** `......pkg.code...... 40 / b2 / 48`, kèm nội dung túi đồ tiếng Việt ("Đá Chu Tước 1", "Đá Cường Hóa", "Nước kinh nghiệm 1/2"). Công việc map protocol có thể bắt đầu ngay.

Socket duy nhất còn fail: `127.0.0.1:5840` = **chat server phụ** (bắt đầu đúng lúc `chat.swf` load). Không chặn gameplay — nhưng nếu muốn chat đầy đủ thì cần proxy thêm cổng này.

## 5. Công cụ đã dựng (dùng lại được cho TienTool)

| File | Việc |
|---|---|
| `gnddt-launch.py` | Login → gate → **CreateLogin** → PlayGame → trả URL SWF. Thay hoàn toàn WebView2 của tool cũ, không cần chạy JS |
| `flash-res-server.py` | Server resource local + reverse-proxy `/q/*` chèn Referer + serve `config-patched.xml` (REQUEST_PATH → proxy) + dump request/response |
| `capture-ruffle.ps1` | Chạy Ruffle rồi chụp cửa sổ ra PNG (dùng để kiểm chứng bằng mắt) |
| `abc-strings.py` | Parse ABC constant pool trong SWF, không cần Java |

Port dùng khi test: 8902.

## 6. Ý nghĩa cho kiến trúc

Xác nhận toàn bộ hướng đã chọn:
- **Ruffle chạy được Gunny thật** — không cần Flash binary, không cần Electron 9/11, không cần Qt. TienTool giữ Electron 41.
- Trong Electron, cả 2 rào cản đều dễ hơn bản test này: chèn Referer bằng `session.webRequest.onBeforeSendHeaders` (khỏi cần reverse-proxy), và `socketProxy` của ruffle-web vừa nối socket vừa **là chỗ đọc/sửa packet**.
- Menu / right-click custom làm bằng HTML overlay (giống `rightClick.js` của bản web), không bắt buộc patch SWF.

## 7. ⚠️ Vấn đề bảo mật cần xử lý ngay (ngoài phạm vi task)

Repo public [vhung64/LoadGameFlashPlayer](https://github.com/vhung64/LoadGameFlashPlayer) đang **lộ connection string MongoDB kèm mật khẩu**, hardcode ở 8+ chỗ trong `Form1.cs` và `LoginForm.cs` (cluster `qltk.ladph0b.mongodb.net`, user `pmt1506`). Repo để public ⇒ ai cũng đọc/ghi được DB `qltk` (collection `keys` — bảng license).

Nên: đổi mật khẩu DB, giới hạn IP allowlist trên Atlas, gỡ repo về private hoặc xoá lịch sử. Lưu ý TienTool cũng dùng MongoDB — kiểm tra xem có dùng chung cluster/credential không.

## 8. Bước tiếp theo

1. **Đánh 1 trận** qua Ruffle → chốt phần gameplay/vật lý/particle (rủi ro Ruffle còn lại duy nhất).
2. Proxy thêm chat server `:5840`.
3. Port `gnddt-launch.py` sang Node, nhét vào TienTool (tái dùng `loginService.js`).
4. Dựng `play.html` + ruffle-web + `socketProxy` trong Electron → dump packet → map protocol (đối chiếu source DDTank-3.0).
5. Menu overlay + aim 3 tia.

## Câu hỏi chưa rõ

1. Cho tôi tiếp tục **vào trận đánh thử** để kiểm chứng gameplay không? (bước rủi ro cuối)
2. Cổng chat `5840` — có cần không, hay bỏ qua giai đoạn đầu?
3. `api.gnddt.com` bạn vận hành hay là người chơi? (vẫn chưa có đáp án — giờ ít quan trọng hơn vì đã chạy được, nhưng ảnh hưởng mức độ thoải mái khi test)
4. Vụ lộ credential MongoDB ở mục 7 — bạn muốn tôi xử lý luôn (đổi sang env var, kiểm tra TienTool) hay để bạn tự làm?
