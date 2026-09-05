# Đường đạn + trợ giúp ngắm

Nhánh: `feat/gunny-flash-launcher` | Bắt đầu: 2026-09-05

## Mục tiêu

Vẽ quỹ đạo từ vị trí nhân vật lên overlay, rồi thêm hai phím tắt: Tab giải lực cần
thiết để trúng mục tiêu (giữ nguyên góc), V bắn bằng lực đó.

## Vì sao làm được

Toàn bộ dữ liệu và ba đòn bẩy đều là thành viên **public**, gọi được từ `ClassUtils`
của `Loading.swf` đã vá:

| Cần | Lấy ở |
|---|---|
| vị trí nhân vật (toạ độ map) | `GameControl.Instance.Current.selfGamePlayer.pos` |
| góc bắn thật | `selfGamePlayer.calcBombAngle()` (đã gộp hướng quay + độ dốc) |
| gió | `Current.wind`, `Current.windRate` |
| trọng lực / lực cản | `GameControl.Instance.gameView.map.gravity` / `.airResistance` |
| map → màn hình | `map.localToGlobal(0,0)`, `map.scaleX` |
| danh sách địch | `Current.livings` (có `pos`, `team`, `isLiving`, `isHidden`) |
| đặt góc | `selfGamePlayer.gunAngle = x` (setter tự kẹp theo min/max vũ khí) |
| bắn | `selfGamePlayer.sendShootAction(force)` |

Công thức mô phỏng lấy nguyên từ game (`GameViewBase.getRouteData` +
`phy/math/EulerVector.as:36-41`), hằng số ở `GameViewBase.as:233-253`:

```
mass = 10, dt = 0.04, gravityFactor = 70
gf  = map.gravity * mass * gravityFactor        arf = map.airResistance
vx0 = int(power * cos(góc))                     vy0 = int(power * sin(góc))
mỗi bước, cho từng trục:  a = (F - arf*v)/mass;  v += a*dt;  x += v*dt
     F = wind (trục X) | gf (trục Y)
```

## Kiến trúc

Dồn toán sang C++, AS3 chỉ làm phần tối thiểu vì phải viết assembly bằng tay.

- **Bản vá SWF**: mỗi 40ms báo một dòng `aim <x> <y> <góc> <gió> <grav> <drag> <ox> <oy> <scale>`
  và `foe <id> <x> <y>` cho từng địch; bắt phím trên stage → `key <mã>`; nhận lệnh
  `g:<góc>` (đặt gunAngle) và `f:<lực>` (bắn).
- **Qt**: port Euler, giải lực bằng chia đôi 0..2000 như `getPower`, vẽ qua
  `OverlayWindow::setTrajectory` (phần vẽ đã có sẵn ở `overlay-window.cpp:184-208`).

Vì sao không vẽ thẳng trong AS3 dù toạ độ tiện hơn: vòng mô phỏng + `Graphics` viết
bằng ABC assembly tốn gấp nhiều lần, mà `OverlayWindow` đã vẽ sẵn rồi.

## Phase 1 — đường đạn (chỉ hiển thị)

- [ ] AS3: khối `AIM_BODY` báo scalars mỗi 40ms khi đang là lượt mình
- [ ] Qt: `trajectory-solver.{h,cpp}` — port Euler + giải lực
- [ ] Qt: parse dòng `aim`, đổi toạ độ map → stage → widget, gọi `setTrajectory`
- [ ] Menu bật/tắt, lưu QSettings
- [ ] Kiểm: đường vẽ ra có trùng đường đạn thật không (bắn rồi so)

## Phase 2 — Tab: giải lực cho mục tiêu

- [ ] AS3: báo `foe`, bắt phím Tab
- [ ] Qt: chọn mục tiêu (bấm tiếp thì xoay vòng), chia đôi tìm lực, vẽ đường tới đích
- [ ] Hiện số lực cần thiết lên overlay

## Phase 3 — V: bắn bằng lực đã giải

- [ ] AS3: lệnh `f:<lực>` gọi `sendShootAction`
- [ ] Kiểm desync: `EnergyView` không phải nơi phát cú bắn này, xem thanh lực và
      trạng thái lượt có sạch không

## Rủi ro

- Toạ độ stage → widget: phụ thuộc `scaleMode` (showAll có viền đen). Phải lấy tỉ lệ
  từ kích thước sân khấu thật chứ không giả định 1:1.
- Độ trễ: lệnh đi qua hàng đợi 40ms, khứ hồi tối đa ~80ms. Đủ cho ngắm/bắn.
- Buff 3 tia: danh sách viên đạn do **server** gửi (`ShootBombAction._bombs`), độ lệch
  góc không có sẵn phía ngắm ⇒ phải ghi log một trận thật rồi suy ra.
- `sendShootAction` chỉ dispatch sự kiện; nếu không có listener nào đang gắn (ngoài
  luồng `EnergyView`) thì cú bắn im lặng không xảy ra — phải thử mới biết.

## Câu hỏi chưa giải đáp

- Buff 3 tia lệch bao nhiêu độ mỗi viên? Chưa đo.
- Khi trúng đích thì `getRouteData` cắt đường tại điểm chạm (`ifHit`); bản C++ có cần
  cắt theo địa hình không, hay cứ vẽ tới khi ra khỏi map?
