#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>

// Đọc gói tin game bằng cách vá inline vào winsock — cùng kỹ thuật đã dùng cho
// Cheat Speed, chỉ đổi hàm mục tiêu.
//
// Vì sao không làm proxy TCP riêng như bên nhánh Ruffle: Ruffle chạy WASM nên
// buộc phải tunnel qua WebSocket, còn Flash thật mở TCP thẳng. Chen một proxy
// vào giữa sẽ phải đổi địa chỉ server mà SWF nhìn thấy (vá config, vá DNS...).
// Bẫy ngay tại send/recv thì không phải đụng gì tới đường mạng.
//
// Lời gọi từ Qt (mạng của WebKit, tải ảnh, ashx...) bị bỏ qua nhờ soi địa chỉ
// trả về, nên nhật ký chỉ còn đúng luồng game.
namespace PacketProxy {

enum class Direction { Outgoing, Incoming };

// Gọi cho mỗi lượt dữ liệu qua socket của Flash. CHẠY TRÊN LUỒNG CỦA FLASH và
// nằm ngay trong đường truyền dữ liệu — không làm gì nặng, không đụng Qt GUI ở
// đây; muốn đẩy lên giao diện thì queue sang luồng chính.
using Observer = std::function<void(Direction, const uint8_t *, size_t)>;

// Đặt bẫy vào send/recv/WSASend/WSARecv của ws2_32. Trả về số hàm bẫy được.
int install();

// Ghi mọi gói ra tệp dạng hex để phân tích ngoại tuyến. Truyền đường dẫn rỗng
// để tắt. Trả false nếu không mở được tệp.
bool startCapture(const wchar_t *path);
void stopCapture();
bool isCapturing();

// Quan sát trực tiếp trong tiến trình — chỗ về sau đọc trạng thái trận đấu
// (góc, gió, lực) để nuôi thước ngắm.
void setObserver(Observer observer);

struct Stats { uint64_t sent; uint64_t received; uint64_t bytesSent; uint64_t bytesReceived; };
Stats stats();

}  // namespace PacketProxy
