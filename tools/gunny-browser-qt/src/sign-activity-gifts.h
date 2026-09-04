#pragma once

#include <QString>

// Bảng quà của hoạt động điểm danh "Đăng nhập 14 ngày".
//
// Số liệu đọc từ http://quest1.gnddt.com/gmactivityinfo.xml — hoạt động
// activityType 31. Mỗi gói quà có một GUID riêng; điều kiện conditionIndex 1
// là quà của ngày thứ N, conditionIndex 2 là quà mốc ngày liên tiếp.
//
// `rewards` là số món trong gói. Cần con số này vì gói tin nhận quà lặp lại
// giftbagId đúng chừng ấy lần — xem toolClaimGift trong patch-loading-swf.py.
//
// Hoạt động có thời hạn (31/08–13/09/2026). Hết đợt thì server đổi ID, phải
// tải lại gmactivityinfo.xml và cập nhật bảng này.
namespace signactivity {

struct GiftBag {
    int label;              // ngày thứ mấy, hoặc mốc mấy ngày
    int rewards;            // số món trong gói
    const char *giftbagId;  // GUID của gói quà
};

extern const char kActivityId[];
extern const GiftBag kDailyGifts[14];
extern const GiftBag kMilestones[6];

// Lệnh cho hàng đợi: "a:<activityId>|<giftbagId>|<số món>".
QString claimCommand(const GiftBag &bag);

} // namespace signactivity
