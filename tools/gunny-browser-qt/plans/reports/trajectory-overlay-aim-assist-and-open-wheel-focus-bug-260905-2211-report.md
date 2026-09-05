# Đường đạn + trợ giúp ngắm — đã xong, và lỗi cuộn chuột còn treo

Date: 2026-09-05 | Branch: feat/gunny-flash-launcher

## Đã làm

**Bản vá SWF** (`patch-loading-swf.py`) thêm lệnh và dữ liệu:

| Lệnh | Việc |
|---|---|
| `d:<0\|1>` | mỗi 40ms báo một dòng `aim …` khi tới lượt mình |
| `f:<lực>` | bắn ngay bằng lực cho trước (`sendShootAction`) |
| `e:<0\|1>` | ghi vị trí từng viên đạn, để đo đường đạn thật |

Dòng `aim` gồm: điểm đầu nòng (toạ độ map), góc `calcBombAngle()`, gió, `windRate`,
trọng lực, lực cản, điểm neo trên sân khấu, `scaleX`, 4 hệ số của viên đạn, và danh
sách toạ độ mọi địch còn sống. Bản vá còn nghe `keyDown` và `mouseWheel` trên sân
khấu rồi báo ra (`key <mã>`, `wheel <nấc>`) — phải bắt phía Flash vì QtWebKit không
đẩy phím lên widget khi plugin đang giữ con trỏ.

**Qt**: `src/trajectory-solver.{h,cpp}` port vòng Euler của game; `main-window` vẽ qua
`OverlayWindow`. Tab = giải lực cho địch gần nhất ở góc hiện tại, cuộn chuột = nhích
lực ±25, V = bắn.

## Mấy chỗ đã tra được bằng mã, không phải đoán

- **Công thức 3 tia** — mã nguồn máy chủ DDTank 4.1 (`Game.Logic/Living.cs`, `ShootImp`,
  repo `pnkl1999/DDTank41`): viên 1 lực ×1.0 góc +0; viên 2 ×0.9 góc −5°; viên 3 ×1.1
  góc +5°. `vx = (int)(force × hệ_số × cos(góc + lệch))`. `AddBallSpell.cs` xác nhận
  món đồ: `BallCount = Property2`, `CurrentDamagePlus *= 0.5f`.
- **Không có hệ số ẩn** giữa lực và vận tốc: server dùng đúng `force × cos/sin`.
- **Gió**: `_mapWind = wind × windRate × 240`; `windRate` đọc được ở
  `Current.windRate` (gán tại `GameView.as:2540`).
- **Điểm xuất phát** là đầu nòng `shootPoint()` = `_body.localToGlobal(_ballpos)`
  (`GamePlayer.as:1815-1821`), không phải tâm nhân vật — đây là nguyên nhân "đạn bay
  mạnh hơn đường vẽ" chứ không phải sai hệ số lực.
- **Vật lý đạn thật** lấy hệ số từ template viên đạn (`Physics.setMap`), không phải bộ
  10/70/240 mà `GameViewBase` hardcode cho đường trợ giúp ngắm.

## LỖI CÒN TREO: cuộn chuột làm game mất focus

Triệu chứng: cuộn bánh xe ngoài trận thì cửa sổ game mất focus. Trong trận thì không
thấy (hoặc ít thấy).

Đã thử và **không** giải quyết được:

1. `Qt::WA_ShowWithoutActivating` cho overlay, và chỉ `show()` khi đang ẩn thay vì gọi
   25 lần mỗi giây. (Vẫn nên giữ — đây là sửa đúng, chỉ không phải nguyên nhân.)
2. Đổi overlay từ `Qt::Tool` sang `Qt::Window` + `Qt::WindowDoesNotAcceptFocus`
   (ánh xạ sang `WS_EX_NOACTIVATE`).
3. `wmode = window` thay cho `direct` — **hỏng**: Stage3D/Starling báo lỗi 3D context.
   Đã để thành tuỳ chọn menu, mặc định vẫn `direct`.
4. Đổi Flash 19.0.0.226 (của GunnyClient) sang **11.3.300.273** (bản LazyGunny dùng).
   Vẫn lỗi.

Ghi chú lúc làm bước 4: QtWebKit **luôn quét `<thư mục exe>/plugins`** ngoài
`QTWEBKIT_PLUGIN_PATH`, nên để `NPSWF32.dll` ở gốc `plugins/` là vô hiệu hoá menu chọn
bản Flash. Đã tách thành `plugins/11/` và `plugins/19/`, gốc `plugins/` không còn DLL.
Kiểm bằng khoá file: DLL nào bị tiến trình giữ thì đó là bản đang chạy.

Hướng còn lại chưa thử:
- Chặn `wheelEvent` ở `GameWebView`. Đánh đổi: bản vá Flash có thể mất `mouseWheel`,
  tức mất chỉnh lực bằng cuộn.
- Kiểm xem lúc mất focus thì cửa sổ nào đang được kích hoạt (`GetForegroundWindow`),
  để biết thủ phạm là overlay, là cửa sổ con của plugin, hay là cái khác hẳn.

## Câu hỏi chưa giải đáp

- Vẫn còn lệch nhẹ giữa đường vẽ và đạn thật? Sau khi sửa điểm đầu nòng chưa đo lại.
  `BallManager` ném #1065 nên 4 hệ số của viên đạn đang là 0 (rơi về bộ hằng số) —
  nếu còn lệch thì đó là chỗ tiếp theo cần sửa, hoặc dùng lệnh `e:` để đo.
- Độ toả 3 tia đã có công thức từ mã server nhưng **chưa đối chiếu bằng trận thật**.
