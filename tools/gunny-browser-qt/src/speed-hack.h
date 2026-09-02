#pragma once

#include <cstdint>

// Chỉnh tốc độ game bằng cách nói dối các hàm đo thời gian mà Flash gọi.
//
// Cách làm giống hệt Cheat Engine: KHÔNG vá IAT mà vá thẳng vào THÂN HÀM
// (inline detour) của GetTickCount / GetTickCount64 / QueryPerformanceCounter /
// timeGetTime. Vá IAT đã thử và thất bại vì NPSWF32.dll chỉ import 22 hàm, không
// có hàm thời gian nào — Flash tra chúng lúc chạy. Vá thân hàm thì Flash lấy địa
// chỉ kiểu gì cũng đi vào bẫy.
//
// Vá thân hàm là vá chung cho cả tiến trình, nên để chỉ tác động vào Flash mà
// không kéo theo Qt, mỗi lần bẫy chạy ta soi ĐỊA CHỈ TRẢ VỀ: rơi trong khoảng
// địa chỉ của NPSWF32.dll thì trả giờ ảo, ngoài ra trả giờ thật. Timer giao
// diện, mạng, animation menu của Qt vì thế chạy đúng tốc độ.
//
// Giờ ảo được neo lại mỗi lần đổi hệ số nên không bao giờ nhảy lùi:
//   ảo = mốc_ảo + (thực - mốc_thực) * hệ_số
namespace SpeedHack {

// Đặt bẫy vào các hàm thời gian. Gọi một lần lúc khởi động, trước cả khi Flash
// nạp — bẫy nằm sẵn, module nào nạp sau cũng dính. Trả về số hàm bẫy được.
int install();

// Tìm NPSWF32.dll và ghi lại khoảng địa chỉ của nó để lọc địa chỉ trả về.
// Flash nạp trễ (sau khi trang dựng xong thẻ <embed>) nên phải gọi lại định kỳ.
// Trả true khi đã tìm thấy.
bool locateFlash();

// Hệ số tốc độ, 1.0 = bình thường. Kẹp trong [0.1, 20.0].
void setMultiplier(double m);
double multiplier();

// Đã đặt được bẫy và đã tìm thấy module Flash chưa.
bool isHooked();

// Số lần đồng hồ bị hỏi, tách theo nguồn gọi. Dùng để trả lời câu hỏi mấu chốt:
// Flash có thật sự tự đọc đồng hồ không, hay nhịp khung hình do host bơm vào?
struct Stats { uint64_t fromFlash; uint64_t fromElsewhere; };
Stats stats();

}  // namespace SpeedHack
