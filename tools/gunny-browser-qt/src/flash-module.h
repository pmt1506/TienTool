#pragma once

#include <cstdint>

// Nhận diện module Flash trong tiến trình, dùng chung cho mọi thứ vá inline.
//
// Vá inline là vá vào thân hàm của Windows nên có tác dụng với CẢ tiến trình.
// Muốn chỉ động tới Flash mà không đụng Qt thì trong hàm bẫy phải soi địa chỉ
// trả về xem lời gọi phát ra từ đâu — đó là việc của chỗ này.
namespace FlashModule {

// Khởi động MinHook một lần cho toàn app. Gọi bao nhiêu lần cũng được.
bool ensureHookEngine();

// Tìm NPSWF32.dll và ghi lại khoảng địa chỉ. Flash nạp trễ (sau khi trang dựng
// xong thẻ <embed>) nên phải gọi lại theo chu kỳ cho tới khi thấy.
bool locate();

// Đã tìm thấy chưa.
bool found();

// Địa chỉ này có nằm trong Flash không. Phải rẻ: các hàm bẫy gọi nó vài nghìn
// lần mỗi giây.
bool containsAddress(const void *addr);

}  // namespace FlashModule
