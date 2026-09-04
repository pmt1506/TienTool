# Điểm danh 14 ngày: đã có ID quà, chưa có gói gửi

2026-09-04. Nối tiếp `signin-milestone-days-and-real-signin-class-260904-1834-report.md`.

## Chốt được (không cần dò lại)

Hoạt động **"Đăng nhập 14 ngày"** trong `quest1.gnddt.com/gmactivityinfo.xml`:

- `activityId = 1d3d171f-9517-a3d4-c5da-8d2b169ba44c`, `activityType = 31`
- 31/08 → 13/09/2026
- 20 gói quà, định danh là **GUID chuỗi** (`giftbagId`), KHÔNG phải số
  - `conditionIndex=1`, giá trị 1…14 → quà từng ngày
  - `conditionIndex=2`, giá trị **3/5/7/9/11/14** → quà mốc

20 GUID đã nhúng trong `src/main-window.cpp` (`kDailyGifts`, `kMilestones`).

## Lớp giao diện (dò bằng bản --probe lúc mở bảng)

- `signActivity.view.SignActivityFrame` — khung
- `signActivity.view.SignActivityItem` — một ô; `setGoods(wonderfulActivity.data::GiftBagInfo)`
- `wonderfulActivity.WonderfulActivityManager` / `.WonderfulActivityControl` — có thật
- `signActivity.SignActivityModel` / `.SignActivityControl` — #1065, không tồn tại

## Đã loại trừ

Gửi được (log `da goi`), không ra quà, trạng thái tài khoản CÓ nhận được:

- `sendSignIn(int)` 0..100, `sendSignAward(int)` 0..100, `sendDailyAward(int)` 0..100
- `sendBuyGift(giftbagId, 1, 0, 0)` cho cả 14 quà ngày và 6 mốc
- `sendBuyGift(giftbagId, a, b, c)` với a,b,c ∈ 0..2 (mốc 3 ngày)

Mọi hàm chỉ nhận `int` đều không thể đúng — định danh là GUID.

## Tìm mã: đã bới sạch những chỗ này, đều không có

- `Loading.swf` (931 KB giải nén, 171 khối ABC): chỉ `com.pickgliss` + preloader.
  Có `CORE_MODULE_NAME`, `DDT_Core`, `_coreLoader`, `MainResourceLoader` →
  nó nạp SWF lõi riêng.
- 109 module `flash/ui/vietnam/swf/*.swf` (tên lấy từ tên tệp cache
  SharedObject, KHÔNG có trong config.xml): toàn ảnh/skin. `signactivity.swf`
  chỉ chứa skin `day3/day7/day14/bigBtn`.
- `game.swf`, `gameii.swf`: không có DoABC nào.
- 13.326 tệp `.sol` trong cache Flash: không có `GameSocketOut`.
- 328 tệp `.tmp` của plugin trong %TEMP%: không có.
- Đoán URL SWF lõi (`DDT_Core`, `ddtcore`, `MainLoading`, `main`… trên 4 thư
  mục): 404 hết.

## Sai lầm đã mắc, ghi để khỏi lặp

- `loaderInfo.url` trả về SWF chứa **display list**, không phải nơi định nghĩa
  lớp → mọi đối tượng đều báo `Loading.swf`. Không dùng nó để tìm module.
- Suy từ kiểu dữ liệu (`GiftBagInfo` → `sendWonderfulActivity`) là đoán, không
  phải bằng chứng. Hai lần đoán kiểu này đều sai.

## Bug đã sửa trong lúc dò

- Nhánh lệnh cuối của `SEND_CMDS` nhảy thẳng `LcMagic`, khiến `z:` và `y:`
  thành mã chết (mọi lần bấm dò đều mở kho ma pháp). Vào từ 3582a72.
- `window.__toolCmd` chỉ giữ một lệnh → đổi thành hàng đợi FIFO.
- Khối ABC chứa `ClassUtils` trượt 15 → 14 khi server đổi `Loading.swf`.

## Còn lại hai đường

1. Bắt URL ở tầng mạng (Wireshark/Fiddler) một phiên đăng nhập, lọc `.swf`.
2. Tuồn bytecode module đã giải mã từ trong Flash ra dạng hex theo khối.

## Chưa rõ

- Ba tham số int của `sendBuyGift` nghĩa là gì.
- SWF lõi tải từ URL nào.
