#pragma once

#include <QList>
#include <QObject>
#include <QString>

class QNetworkAccessManager;

// Một món trên webshop. Chỉ giữ những trường cần để mua lại đúng món đó.
struct ShopItem
{
    int templateId = 0;
    QString name;      // "Hộp Thẻ Vua Bóng Tối"
    QString image;
    int price = 0;
    int maxCount = 999;
    // Tên thẻ trong game, khi không suy ra được từ tên hộp. Xem kBoxAliases.
    QString cardAlias;

    // Tên thẻ mà hộp này cho ra: bỏ tiền tố "Hộp Thẻ ".
    QString cardName() const;
};

// Gọi API webshop của gnddt bằng token do TienTool truyền sang.
//
// Không tự đăng nhập: việc giải captcha và lấy JWT đã có sẵn bên TienTool
// (apiService.getLoginToken), viết lại ở đây là trùng việc.
class CardShopClient : public QObject
{
    Q_OBJECT

public:
    explicit CardShopClient(QObject *parent = nullptr);

    void setAccount(const QString &token, int userId, int serverId);
    bool ready() const { return !m_token.isEmpty() && m_userId > 0; }

    // Tải toàn bộ hộp thẻ (CategoryID 18). Trả về qua boxesReady().
    void fetchCardBoxes();

    // Số dư của tài khoản: Cash là coin nạp, CashFree là coin tặng. Cả hai đều
    // tiêu được nên chỗ kiểm tra "đủ tiền không" phải cộng lại.
    void fetchBalance();

    // Gửi một lần mua nhiều loại; mỗi phần tử là món và số lượng.
    void buy(const QList<QPair<ShopItem, int>> &order);

signals:
    void boxesReady(const QList<ShopItem> &boxes);
    void balanceReady(qint64 cash, qint64 cashFree);
    void bought(bool ok, const QString &message);
    void failed(const QString &message);

private:
    void fetchPage(int page, QList<ShopItem> collected);

    QNetworkAccessManager *m_net;
    QString m_token;
    int m_userId = 0;
    int m_serverId = 0;
};

// So tên hộp với tên thẻ: bỏ dấu, thường hoá, tách từ rồi so tập từ.
//
// Cần vì có món lệch thứ tự chữ — shop ghi "Hộp Thẻ Dũng Sĩ Thi Đấu" còn game ghi
// "Thẻ Đấu Trường Dũng Sĩ". So chuỗi thô thì trượt đúng món đó.
QString normalizeCardName(const QString &raw);
