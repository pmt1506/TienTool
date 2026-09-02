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

## Cập nhật sau khi cài JPEXS (0:35)

Đã cài JRE 17 portable + JPEXS 21.0.5, giải mã được `Loading.swf` (356 script).

**Sửa lại hai kết luận sai ở trên:**

1. `cmodule.decry` KHÔNG phải mã hoá gói tin. Nó là module Alchemy dùng bởi
   `com.pickgliss.loader.ModuleLoader.decry()` để giải mã SWF module tải về.
   Mà thực tế gần như không dùng: quét 8000+ file cache, có 1228 SWF thường,
   đúng 2 file mang dấu `"^_^"` của `NewCrypto`, phần còn lại là PNG/JPG.
   `ModuleLoader` chỉ gọi `decry()` khi 3 byte đầu khác `"CWS"`.
2. `NewCrypto` (com/crypto) chỉ obfuscate file tài nguyên: tiền tố UTF `"^_^"`,
   rồi đảo bit một byte ở vị trí 16. Không liên quan socket.

**Tìm ra code game thật.** Không nằm trong bất kỳ SWF nào trên đĩa —
`game.swf`/`gameBattle.swf`/`gameiii.swf` chỉ chứa tên symbol đồ hoạ
(`asset.game.angle`, `emblemWind*`, `asset.game.power:ShootMsg`).

Code nằm trong **SWF giả dạng PNG**:

| URL | Kích thước | ABC bytecode |
|---|---|---|
| `res1.gnddt.com/flash/4.png` | 8.1 MB | **19.0 MB** |
| `res1.gnddt.com/flash/2.png` | 3.6 MB | 7.9 MB |
| `res1.gnddt.com/flash/3.png` | 2.7 MB | — |
| `res1.gnddt.com/flash/1.png` | 326 KB | — |

Server trả `Content-Type: image/png`. Tải trực tiếp được, không cần phiên đăng nhập.

Lấy từ cache `.sol` của Flash: `%APPDATA%\Macromedia\Flash Player\#SharedObjects\
3TFZ9AL9\res1.gnddt.com\flash-4-png.sol` (`LoaderSavingManager` lưu dưới
SharedObject tên `7road/files`). Bóc bằng cách tìm chữ ký `CWS` rồi cắt tới hết.

Lớp liên quan tới bắn trong `4.png`:

```
game.actions:ShootBombAction
gameStarling.actions:ShootBombAction
game.view.effects:ShootPercentView
gameStarling.view.effects:ShootPercentView3D
```

Hằng số: `BEGIN_SHOOT`, `ANGLE_CHANGED`, `ANGLE_TO_RADIAN`, `ANGLE_P1/P2/P3`,
`CHANGEMAXFORCE`, `BREAKFORCESLV`, `EMITTER_TYPE_GRAVITY`.

Đây là đích cho cả thước ngắm, tự bắn, lẫn tầng mã hoá gói tin.

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
