# Cheat Speed trên Qt/Flash — hook IAT cài được nhưng KHÔNG ăn

Date: 2026-09-02 | Branch: `feat/gunny-flash-launcher` | Trạng thái: **LỖI, chưa dùng được**

## Hiện trạng

Menu Cheat Speed (x1 / x5 / tùy chỉnh) hoạt động, thanh trạng thái báo đúng
`Tốc độ: x5`, tiến trình không sập — nhưng **game không nhanh lên**.

## Đã đi qua những gì

| Lần | Cách | Kết quả |
|---|---|---|
| 1 | Vá IAT theo **tên hàm** | 0 ô được vá. `NPSWF32.dll` có `OriginalFirstThunk = 0` (bảng tên import bị lược bỏ) nên vòng lặp `continue` bỏ qua sạch → "chưa gắn được vào Flash" |
| 2 | Hook `GetProcAddress` theo tên | Vẫn 0 ô, cùng lý do |
| 3 | Vá theo **địa chỉ**, quét mọi module | Sập ngay lúc khởi động — đụng vào IAT của `ntdll`/`kernel32` làm hỏng bộ nạp Windows |
| 4 | Bỏ qua DLL trong `C:\Windows` | `0xC00000FD` stack overflow: hàm hook gọi `::GetTickCount()` mà lời gọi đó đi qua IAT của chính exe vừa bị vá → tự gọi lại mình |
| 5 | Gọi con trỏ thật, bỏ qua exe của mình | **Chạy ổn, vá được ô, báo x5 — nhưng game không nhanh** |

## Vì sao vẫn không ăn

`NPSWF32.dll` chỉ import **22 hàm**, hàm liên quan duy nhất là
`KERNEL32!GetProcAddress`. Flash tra mọi hàm lúc chạy. Hai khả năng còn lại:

1. **Tra trước khi ta kịp vá.** Flash resolve các hàm thời gian ngay trong
   `DllMain`/`NP_Initialize`, xong giữ con trỏ thật. Vá IAT sau đó vô nghĩa.
2. **Flash không dùng mấy hàm đó.** Có thể nó đọc giờ qua `ntdll` trực tiếp
   (`NtQueryPerformanceCounter`), qua `KUSER_SHARED_DATA` (đọc thẳng bộ nhớ
   ở địa chỉ cố định, không gọi hàm nào — không hook được), hoặc nhịp khung
   hình do host cấp qua `NPN_ScheduleTimer` của QtWebKit.

Chưa xác định được là khả năng nào — cần gắn debugger đặt breakpoint vào các
hàm thời gian trong tiến trình 32-bit để biết Flash thật sự gọi cái gì.

## Hướng xử lý còn lại

1. **Inline hook như Cheat Engine** — vá thẳng 5 byte đầu của hàm trong
   kernel32/winmm + trampoline. Bắt được cả đường resolve lúc chạy và cả lời
   gọi đã giữ con trỏ từ trước. Cần bộ giải mã độ dài lệnh x86 (hoặc nhúng
   MinHook). **Không cứu được** nếu Flash đọc `KUSER_SHARED_DATA`.
2. **`NPN_ScheduleTimer`** — nếu nhịp khung do QtWebKit cấp thì chỉnh chu kỳ
   timer của host là xong, rất gọn. Cần xác minh trước.
3. **Chuyển sang Ruffle** — Ruffle (WASM) lấy giờ từ `performance.now()` của
   JS. Ghi đè một hàm JS trong trang là xong, không hook gì cả. Đây là lý do
   nhánh `feat/gunny-ruffle-launcher` được mở để so sánh.

## Câu hỏi chưa rõ

1. Flash lấy giờ từ đâu? Chưa đo. Quyết định giữa hướng 1 và 2.
2. Cheat Engine trên máy bạn chỉnh tốc độ Gunny có ăn không, và ăn với
   `GunnyBrowser.exe` hay chỉ với client khác? Nếu CE ăn thì hướng 1 chắc chắn
   khả thi.
