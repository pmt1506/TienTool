# Ép thời gian lượt khi vào trận — cách làm, giới hạn, cách đo

Date: 2026-09-05 | Branch: feat/gunny-flash-launcher

## Game tính giây mỗi lượt thế nào (nguồn: decompile game SWF)

SWF chứa logic trận là bản tải từ server (`gameCommon.*`, `game.*`, `ddt.*`) — **không** nằm trong
`GunnyClient/resource/flash` (mấy file local chỉ có asset).

1. `game/actions/ChangePlayerAction.as:104-121` — mỗi gói đổi lượt: đọc một int từ server.
   `>0` → `LocalPlayer.turnTime = int đó`; `<=0` → `RoomManager.getTurnTimeByType(timeType)`.
   Nhánh `_turnTime != -1` (=0) chỉ dùng khi bật uỷ thác, kèm `sendGameSkipNext(0)`.
2. `room/RoomManager.as:118-135` — bảng fallback theo timeType 1..6: `6 / 8 / 11 / 16 / 21 / 31`.
3. `gameCommon/view/SelfMarkBar.as` — `startup(turnTime)`: `_alreadyTime = turnTime`, gọi `__mark`
   ngay (trừ 1 → 31 hiện ra 30), rồi `new Timer(1000, turnTime)`. `__markComplete` → `_self.skip()`;
   3 lượt đứng im liên tiếp → `sendGameTrusteeship(true)`.

**`turnTime` là hằng số cấu hình của lượt, không phải biến đếm ngược** — bộ đếm là
`SelfMarkBar._alreadyTime` (private). Ghi đè `turnTime` liên tục không làm đồng hồ đứng.

## Cài đặt

| Chỗ | Việc |
|---|---|
| `patch-loading-swf.py` | lệnh `n:<giây>` → slot tĩnh `_toolTurn`; Timer thứ hai 40ms `_toolFast` → method `toolTurnTick` |
| `toolTurnTick` | `GameControl.Instance.Current` (null-check) → `.selfGamePlayer` (null-check) → nếu `turnTime` khác giá trị mình ép thì log `luot server <N>` rồi ghi đè |
| `src/main-window.cpp/.h` | menu "Thời gian lượt" 2 mốc (0/15); giá trị cũ 22/30 tự dồn về 15, `QSettings("battle/turnTime")` kẹp về 0 nếu lạc mốc, gửi lệnh khi user chọn + mỗi lần game nạp xong |
| `patched/Loading.swf` | dựng lại từ bản gốc mới nhất `res1.gnddt.com/flash/Loading.swf`, khối ABC **14** |

**Vì sao 40ms chứ không gộp vào nhịp 250ms có sẵn:** server ghi `turnTime` trong `syncMap()`, chỉ
~5 khung hình (~170ms) sau `SelfMarkBar.startup()` mới đọc. Nhịp 250ms trượt cửa sổ đó gần như mọi lượt.
Khi tắt (`_toolTurn == 0`) mỗi tick chỉ tốn 1 getproperty + rẽ nhánh.

## Kiểm chứng đã làm

- `rabcasm` + `abcreplace` chạy sạch; ffdec decompile `toolTurnTick` ra đúng ý định (2 lớp null-check,
  log trước khi ghi đè).
- Chạy game thật: vào được sảnh, điểm danh tự động vẫn chạy ⇒ bản vá không làm hỏng tính năng cũ.
- Build Qt sạch, không cảnh báo mới.

## Đo thật trong trận (2026-09-05, phòng timeType 3)

Log `%TEMP%\gunny-flash.log`, mốc ép 30, speed x1:

```
12:00:34 luot server 0     đầu trận
12:00:42 luot server 11    lượt 1
12:01:15 luot server 11    lượt 2   (cách 33s = trọn một vòng)
12:01:53 luot server 11
```

- Đúng **1 dòng mỗi lượt** ⇒ không đè bộ đếm ngược (bộ đếm là `SelfMarkBar._alreadyTime`, private).
- Đồng hồ bắt đầu ở **29** ⇒ ghi đè ăn, cửa sổ 5 khung hình bắt trúng.
- Lượt kéo dài **~22 giây thật**, lúc server cắt đồng hồ còn **6-7** ⇒ nhịp 1 nấc/giây, không chạy đôi.

**Kết luận: trần server ≈ 22-23s, tức khoảng 2× con số 11 nó gửi.** Ép 22 lấy được ~12 giây thật
mỗi lượt so với mặc định 10 giây. Ép cao hơn trần chỉ làm đuôi đồng hồ dư ra: số dừng ở 6-7 trong
khi lượt đã hết, người chơi phải tự nhẩm — nên mốc là **22**, không phải 30.

## Thanh lực: cửa kết thúc lượt thứ hai, độc lập với đồng hồ

`gameCommon/view/EnergyView.as:283-303` — giữ space thì `calcForce()` cộng `_forceSpeed` (20, hoặc
80 khi có buff 414) mỗi khung hình; chạm `_maxForce` = 2000 thì `_dir = -1` và lực trôi ngược; về 0
thì `_self.skip()` → **hết lượt, không liên quan đồng hồ**. SWF game chạy 24fps ⇒ trọn chu kỳ
lên+xuống = 200 khung = **8,3 giây thật** (2,1 giây nếu có buff 414).

Thêm nữa: `EnergyView.__enterFrame` gọi `_self.beginShoot()` mỗi khung khi giữ space →
`Player.beginShoot()` dispatch `"beginShoot"` → `SelfMarkBar.__beginShoot` → `pause()`. Tức
**đồng hồ lượt dừng trong lúc kéo lực**, còn server vẫn đếm giây thật.

**Đo xong (2026-09-05): server đếm wall-clock, tính cả lúc giữ space.** Ngồi im 22 giây rồi mới giữ
space thì chỉ kéo được ~1,7 giây (lực tới ~40%) là mất lượt — tổng ~24 giây thật. Nghĩa là quỹ của
một lượt là một cục thời gian thật duy nhất, không có phần nào miễn phí cho việc nạp lực.

Hệ quả cho việc chọn mốc:
- Mốc client chỉ là trần cho phần **không** giữ space; nó không mua thêm giây kéo lực nào.
- Muốn nạp đủ lực thì phải bắt đầu giữ space khi trần server còn ~9 giây (nghĩ tối đa ~13 giây) —
  đúng như vậy với mọi mốc, nên 15 và 22 gần như không khác nhau trong thực chiến. Chốt 2 mốc 0/15.
- Đường duy nhất rút ngắn 8,3 giây: tăng tốc khung hình (Cheat Speed) — chưa kiểm.
- `EnergyView._forceSpeed`/`_maxForce` là private và nằm trong SWF game tải từ server ⇒ ngoài tầm
  bản vá `Loading.swf`.

Đặt sát trần KHÔNG nguy hiểm (đã soi lại `SelfMarkBar`): `__markComplete` → `_self.skip()` chỉ chạy
khi chưa bắn (bắn thì `__beginShoot` → `pause()`, đồng hồ dừng) — đúng bằng hành vi game gốc. Bẫy
`sendGameTrusteeship(true)` cần `_noActionTurn > 2`, mà biến này reset ở mỗi `mouseMove`/`keyDown`,
nên người chơi đang ngắm không bao giờ chạm ngưỡng.

Lưu ý: phòng timeType 6 (server gửi 31, hiện 30 giây) thì mốc 15 là đi lùi — chọn "Bình thường".

## Ghi chú lịch sử: rủi ro đã được loại bỏ bằng đo đạc

Logic hết giờ nằm ở server, không đọc được từ client. Đã biết chắc: 30s là mức hợp lệ
(timeType 6 → 31). Nếu phòng đặt 10s mà ép client 30s thì server vẫn gửi gói đổi lượt theo đồng hồ
của nó và `ChangePlayerAction` cắt lượt giữa chừng — client không chặn được.

**Cách đo:** menu → 15 hoặc 30 giây → vào trận → đọc `%TEMP%\gunny-flash.log`:
- `luot server <N>` mỗi lượt: N = số giây server thật sự cấp cho phòng.
- ~1 dòng/lượt = đúng như thiết kế. ~1 dòng/giây = giả thuyết "đè bộ đếm" đúng (đã bác bỏ bằng đọc
  code, nhưng log vẫn là kiểm chứng rẻ nhất).
- Lượt bị chuyển sang người khác lúc ~N giây dù đồng hồ còn chạy ⇒ server siết, chỉ mốc < N dùng được.

## Sửa theo review

- reset `m_scaleSent` ở `loadFinished` — trước đó bấm "Tải lại" là mất cả tỉ lệ co giãn lẫn thời gian
  lượt một cách im lặng (nợ có sẵn của lệnh `s:`, lệnh `n:` vừa kế thừa).
- `turnTimeValue()` kẹp về 0 khi giá trị lưu lạc mốc.
- Bỏ 3 con trỏ QAction không ai đọc (QActionGroup tự giữ dấu tích).
- Kiểm `Current` null trước khi lấy `selfGamePlayer`: bỏ 25 ngoại lệ/giây khi bật mà đang ngoài trận.

## Câu hỏi chưa giải đáp

- Trần ~22s đo ở một phòng timeType 3. Trần ở timeType khác là hằng số hay tỉ lệ theo turnTime? Chưa đo.
- Cheat Speed x2 có rút chu kỳ lực xuống ~4,2 giây thật không? Chưa đo — không định đụng tới. Trần ở timeType khác là hằng số hay tỉ lệ theo turnTime? Chưa đo.
- Có cần phân biệt chế độ trận (dungeon, campBattle...) không — hiện chạy ở mọi trận có `selfGamePlayer`.
