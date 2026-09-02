# Gói tin game bị mã hoá — và code client nằm ở đâu

Date: 2026-09-03 | Branch: `feat/gunny-flash-launcher` | Bắt gói: OK | Đọc nội dung: **CHƯA**

## Đã dựng được

Bẫy winsock (`send`/`recv`/`WSASend`/`WSARecv`) qua MinHook, lọc theo địa chỉ trả về
nên chỉ ghi luồng của `NPSWF32.dll`, không lẫn HTTP của Qt. Một phiên thật:
190 gói, 60 OUT / 130 IN, 96KB. Nhật ký hex + nhật ký URL.

## Kết quả: luồng game bị mã hoá

| Phép thử | Kết quả |
|---|---|
| Entropy gói lớn (5648B) | 7.99 / 8.00 |
| Bảng byte | 256/256 giá trị |
| Header nén zlib/gzip/SWF | không |
| XOR hai gói cùng độ dài | 0 byte bằng 0 → keystream không lặp |
| Tiền tố độ dài uint16, offset 0–7, LE+BE | không khớp gói nào |
| Chuỗi ASCII ≥4 | không có chuỗi thật |

DDTank gốc dùng nhị phân thô có tiền tố độ dài — phép thử cuối đã bắt được ngay
nếu vậy. gnddt.com có thêm lớp mã hoá.

## Code client nằm ở đâu

Kiểm kê tag SWF:

| SWF | ABC bytecode | Kết luận |
|---|---|---|
| `Loading.swf` (326KB) | **544KB, 171 tag DoABC** | toàn bộ khung client |
| `game.swf` (2.6MB) | 86KB | chủ yếu tranh ảnh |
| `gameBattle.swf` (1.6MB) | 41KB | chủ yếu tranh ảnh |

Đường dẫn thật trên CDN: `http://res1.gnddt.com/flash/ui/vietnam/swf/<tên>.swf`
(dò `flash/<tên>.swf` ra 404 — trước đó tìm sai chỗ).

Namespace trong `Loading.swf`: `yzhkof` (352, framework UI/engine), `mx` (301, Flex),
`com` (159), **`cmodule` (123)**, `flash` (40), `ddt` (6).

`cmodule.decry` là module **Alchemy/CrossBridge** — C biên dịch sang ABC. Tên nói
thẳng chức năng. Đây là nơi mã hoá/giải mã gói tin, và là lý do bẫy winsock chỉ
thấy byte ngẫu nhiên.

## Hệ quả

Bẫy ở winsock là quá muộn: dữ liệu đã qua `cmodule.decry`. Nhưng bản rõ có tồn
tại — ngay trong Flash, trước khi mã hoá và sau khi giải mã. Nên chỗ móc đúng là
**bên trong SWF**, không phải winsock.

Điều này gộp hai việc làm một: cùng một lần patch SWF vừa lấy được bản rõ gói tin,
vừa lấy được góc/gió/lực cho thước ngắm, vừa lấy được hàm bắn mà màn tutorial gọi.

`RefererNetworkManager::addSwapRule()` dựng sẵn từ trước chính là để phục vụ việc
này: tráo `Loading.swf` bằng bản đã patch.

## Việc còn treo

- Cài JPEXS (cần Java) để giải mã AS3 của `Loading.swf`.
- Tìm điểm vào của `cmodule.decry` và bọc nó để soi bản rõ.
- Chưa xác định code trận đấu nạp từ đâu: `game.swf`/`gameBattle.swf` chỉ là art.
  Ứng viên: `res1.gnddt.com/flash/ui/vietnam/zhancode.txt`, hoặc ABC nạp động qua
  `com.hurlant.eval:ByteLoader.loadBytes` (Loading.swf có 18 tag DefineBinaryData).
- Nhật ký gói chưa ghi địa chỉ đầu kia ở lần bắt này (đã thêm, chưa chạy lại) —
  nên chưa chắc chắn 100% mọi gói đều thuộc socket game, dù tỉ lệ 3KB gửi / 93KB
  nhận phù hợp với luồng game.

## Câu hỏi chưa trả lời

- `cmodule.decry` chỉ mã hoá gói tin, hay còn dùng để giải mã chính code game
  (`zhancode.txt`)? Nếu là vế sau thì code trận đấu cũng nằm sau lớp đó.
- Server có kiểm tra tính toàn vẹn của SWF không? Nếu có thì tráo SWF sẽ bị chặn.
