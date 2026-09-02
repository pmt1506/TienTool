#pragma once

// Chỉnh tốc độ game bằng cách đổi hướng các hàm đo thời gian mà Flash gọi.
//
// Cách làm: vá bảng IAT (Import Address Table) của NPSWF32.dll, thay con trỏ
// của timeGetTime / GetTickCount / GetTickCount64 / QueryPerformanceCounter
// bằng phiên bản riêng có nhân hệ số. Chỉ vá IAT của module Flash nên Qt và
// phần còn lại của app vẫn chạy thời gian thật — timer giao diện, mạng, animation
// của menu không bị ảnh hưởng.
//
// Thời gian ảo được neo lại mỗi lần đổi hệ số nên không bao giờ nhảy lùi:
//   ảo = mốc_ảo + (thực - mốc_thực) * hệ_số
namespace SpeedHack {

// Vá IAT của mọi module đang nạp trong tiến trình — cùng phạm vi mà Cheat
// Engine tác động. Gọi lại định kỳ để bắt các module nạp sau (Flash nạp trễ,
// sau khi trang dựng xong thẻ <embed>). Trả về số ô đã vá trong lần này.
int applyToAll();

// Vá IAT của một module cụ thể (vd L"NPSWF32.dll").
// An toàn khi gọi lại nhiều lần. Trả false nếu chưa tìm thấy module.
bool applyTo(const wchar_t *moduleName);

// Hệ số tốc độ, 1.0 = bình thường. Kẹp trong [0.1, 20.0].
void setMultiplier(double m);
double multiplier();

// Đã vá thành công chưa.
bool isHooked();

}  // namespace SpeedHack
