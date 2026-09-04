#pragma once

#include <QHash>
#include <QObject>
#include <QString>
#include <QVector>

class QNetworkAccessManager;
class QNetworkReply;

namespace signactivity {

// Một gói quà của hoạt động điểm danh.
struct GiftBag {
    QString giftbagId;  // GUID, đổi mỗi đợt hoạt động
    int rewards = 0;    // số món trong gói
    int index = 0;      // conditionIndex: 1 = quà ngày, 2 = quà mốc
    int value = 0;      // conditionValue: ngày thứ mấy, hoặc mốc mấy ngày
    int order = -1;     // giftbagOrder, khớp với statusID game trả về
};

// Lệnh cho hàng đợi: "a:<activityId>|<giftbagId>|<số món>".
QString claimCommand(const QString &activityId, const GiftBag &bag);

// Lệnh hỏi trạng thái từng gói: "g:<activityId>".
QString statusCommand(const QString &activityId);

// Đọc chuỗi "trangthai <id>:<giá trị> …" game trả về thành bảng
// giftbagOrder -> statusValue. Rỗng nghĩa là game chưa có dữ liệu.
QHash<int, int> parseStatus(const QString &line);

// statusValue của một gói đang nhận được. SignActivityItem chỉ gắn listener
// "click" khi giá trị bằng 1; 2 là đã nhận.
const int kStatusClaimable = 1;

// Tải bảng quà điểm danh từ server, không chép cứng vào mã.
//
// GUID của từng gói quà đổi theo mỗi đợt hoạt động (đợt hiện tại chỉ chạy hai
// tuần), nên chép vào nguồn là hỏng ngay đợt sau. Server phát sẵn bảng đầy đủ
// trong gmactivityinfo.xml — đọc thẳng chỗ đó thì đổi quà xong vẫn nhận được,
// không phải sửa gì.
//
// Ba chặng, vì địa chỉ không cố định: URL của SWF mang tham số `config` trỏ
// tới tệp cấu hình (config.xml hay config2.xml tuỳ server), trong đó
// REQUEST_PATH mới là host phát dữ liệu game.
class Loader : public QObject
{
    Q_OBJECT

public:
    explicit Loader(QObject *parent = nullptr);

    // `swfUrl` là URL Loading.swf đầy đủ, kèm tham số config.
    void load(const QString &swfUrl);

    QString activityId() const { return m_activityId; }
    QVector<GiftBag> gifts() const { return m_gifts; }

signals:
    // Phát khi đã có bảng quà. `error` rỗng nghĩa là thành công.
    void finished(const QString &error);

private:
    void fetchConfig(const QString &configUrl);
    void fetchActivities(const QString &requestPath);
    void parseActivities(const QByteArray &body);
    void fail(const QString &why);

    // Thân trả về có thể là XML thô hoặc luồng zlib; trả về XML.
    static QByteArray inflate(const QByteArray &body);

    QNetworkAccessManager *m_net = nullptr;
    QString m_activityId;
    QVector<GiftBag> m_gifts;
};

} // namespace signactivity
