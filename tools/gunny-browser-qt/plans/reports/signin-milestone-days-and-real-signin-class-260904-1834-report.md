# Điểm danh: mốc quà thật + lớp bảng điểm danh thật

Ngày 2026-09-04. Nguồn: cấu hình HTTP của server gnddt, `signin.ui`, dump
`describeType(GameSocketOut)` trong `%TEMP%\gunny-flash.log`, log URL phiên trước.

## Liên quan tới 3/5/7/9/11/14

Không có tệp cấu hình nào của server phát ra danh sách mốc này. Đã kiểm:

- `ts_everydaysignin.xml` → 28 món, ID 1..28 = quà **ngày 1..28 trong tháng**,
  không phải mốc.
- `loginawarditemtemplate.xml` → quà đăng nhập tích luỹ, mốc là 1..8,10,20,30,
  50,100,150. Khác hệ.
- `ts_activityconfig.xml`, `activelist.xml`, `subactivelist.ashx`,
  `everydayactive*` → không có mốc ngày nào.
- Thử 404: `ts_everydaysigninaward`, `signinaward`, `ts_signinaward`,
  `ts_everydaysignaward` — server không có.

→ Mốc 3/5/7/9/11/14 chỉ tồn tại phía server, client nhận qua gói socket
(`sendSignInData`). Không tra được bằng HTTP, phải bấm thử.

## Ba phát hiện đáng chú ý

1. **Bản trước bấm sai số.** Menu gửi `sendSignAward` với 3/7/15/23/28 — đoán.
   Chỉ 3 và 7 trùng mốc thật, và cả hai vẫn không ăn (log 16:14:48–16:15:00).
   Còn khả năng hàm nhận **chỉ số mốc 1..6** chứ không phải số ngày.

2. **Đang đọc nhầm bảng.** `signin.ui` (server tải lúc vào game) khai
   `runtime="activity.signin.view.SignInCell"`, lưới 7×4 = 28 ô. Lệnh `c:`
   lại đọc `calendar.CalendarManager` — hai hệ khác nhau.

3. **Kết quả `c:` không đáng tin.** `hasTodaySigned()` đọc `dayLog` do lần tải
   HTTP gần nhất để lại; trong toàn bộ log URL phiên đó **không có** request
   nào nạp dayLog → `homNayDaDiemDanh=false` là giá trị mặc định của log rỗng,
   không phải trạng thái thật.

## Đã sửa

- `src/main-window.cpp`: mốc đổi thành 3/5/7/9/11/14, thêm 4 mục gửi chỉ số
  mốc (1/2/4/6) để phân biệt "số ngày" với "chỉ số", thêm 3 mục dò lớp
  (`activity.signin.SignInManager`, `activity.signin.view.SignInMainView`,
  `calendar.CalendarManager`).
- `patch-loading-swf.py`: sửa docstring `k:<n>`.
- Không cần vá lại Loading.swf: `k:` và `y:` đã có sẵn trong bản đã vá.
- Build lại `build/release/gunny-browser-qt.exe` xong (phải tắt exe đang chạy
  mới link được).

## Bước kế tiếp (cần chạy game)

1. Bấm "Dò lớp: activity.signin.SignInManager" → biết bảng nào có thật.
2. Mở bảng điểm danh bằng tay một lần, rồi bấm `c:` → đọc trạng thái thật.
3. Bấm lần lượt 6 mốc theo số ngày, rồi 4 mốc theo chỉ số, xem log/quà.

## Câu hỏi chưa rõ

- Mốc 3/5/7/9/11/14 tính theo số ngày điểm danh **trong tháng** hay **liên
  tiếp**? Ảnh hưởng tới việc mốc nào đang mở.
- Hai nút trên bảng điểm danh trong game tên gì (điểm danh thường / điểm danh
  bù)? Biết tên thì khớp được với hàm trong `GameSocketOut`.
