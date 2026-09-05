#include "card-shop-client.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QStringList>
#include <QUrl>

namespace {

const char *kApiBase = "https://api.gnddt.com/api/Function/";
const char *kReferer = "https://gnddt.com/";
// CategoryID của hộp thẻ bài, dùng chung cho cả game lẫn tham số searchType của
// shop — cùng một bảng phân loại.
const int kCardBoxCategory = 18;
const int kRowsPerPage = 12;

QNetworkRequest makeRequest(const QString &path, const QString &token)
{
    QNetworkRequest req(QUrl(QString::fromLatin1(kApiBase) + path));
    req.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
    req.setRawHeader("Accept", "application/json");
    req.setRawHeader("Authorization", token.toUtf8());
    req.setRawHeader("Referer", kReferer);
    return req;
}

QJsonObject pageBody(int page, int rows)
{
    QJsonObject body;
    body["currPage"] = page;
    body["rowPage"] = rows;
    body["totalPage"] = 1;
    body["searchValue"] = QString();
    body["searchType"] = kCardBoxCategory;
    body["serverId"] = 1;
    body["userId"] = 0;
    body["IsBandMoney"] = false;
    body["BeginDate"] = QStringLiteral("0001-01-01T00:00:00");
    body["EndDate"] = QStringLiteral("0001-01-01T00:00:00");
    return body;
}

// Doi loi mang thanh cau nguoi dung lam duoc gi. 401 o day gan nhu luon la token
// bi thu hoi, ma dong "Host requires authentication" cua Qt khong noi len dieu do.
QString netError(QNetworkReply *reply)
{
    if (reply->error() == QNetworkReply::AuthenticationRequiredError
        || reply->error() == QNetworkReply::ContentAccessDenied) {
        return QStringLiteral("Token webshop bị từ chối — đóng game rồi mở lại từ TienTool.");
    }
    return reply->errorString();
}

}  // namespace

QString normalizeCardName(const QString &raw)
{
    QString s = raw.trimmed().toLower();
    // Bỏ dấu tiếng Việt bằng chuẩn hoá phân rã rồi loại ký tự dấu, để "Dũng Sĩ"
    // và "dung si" so được với nhau.
    s = s.normalized(QString::NormalizationForm_D);
    QString bare;
    for (const QChar &c : s) {
        if (c.category() != QChar::Mark_NonSpacing) {
            bare.append(c);
        }
    }
    // U+0111 khong phan ra duoc bang NFD nen phai doi tay; viet bang ma so vi
    // ky tu ngoai Latin-1 khong lot qua QLatin1Char.
    bare.replace(QChar(0x0111), QLatin1Char('d'));

    // Bỏ hai tiền tố hay gặp rồi sắp xếp từ: thứ tự chữ giữa shop và game không
    // giống nhau ở mọi món.
    QStringList words = bare.split(QRegExp(QStringLiteral("[^a-z0-9]+")), QString::SkipEmptyParts);
    words.removeAll(QStringLiteral("hop"));
    words.removeAll(QStringLiteral("the"));
    words.removeAll(QStringLiteral("bai"));
    words.sort();
    return words.join(QLatin1Char(' '));
}

QString ShopItem::cardName() const
{
    QString n = name.trimmed();
    if (n.startsWith(QStringLiteral("Hộp Thẻ "), Qt::CaseInsensitive)) {
        return n.mid(QStringLiteral("Hộp Thẻ ").size()).trimmed();
    }
    return n;
}

CardShopClient::CardShopClient(QObject *parent)
    : QObject(parent), m_net(new QNetworkAccessManager(this))
{
}

void CardShopClient::setAccount(const QString &token, int userId, int serverId)
{
    m_token = token;
    m_userId = userId;
    m_serverId = serverId;
}

void CardShopClient::fetchCardBoxes()
{
    if (!ready()) {
        emit failed(QStringLiteral("Chưa có token webshop — mở game từ TienTool để có."));
        return;
    }
    fetchPage(1, {});
}

void CardShopClient::fetchPage(int page, QList<ShopItem> collected)
{
    const QJsonObject body = pageBody(page, kRowsPerPage);
    QNetworkReply *reply = m_net->post(makeRequest(QStringLiteral("GetShopItem"), m_token),
                                       QJsonDocument(body).toJson(QJsonDocument::Compact));

    connect(reply, &QNetworkReply::finished, this, [this, reply, page, collected]() mutable {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit failed(QStringLiteral("Lỗi khi đọc shop: ") + netError(reply));
            return;
        }

        const QJsonObject root = QJsonDocument::fromJson(reply->readAll()).object();
        for (const QJsonValue &v : root.value(QStringLiteral("ListItem")).toArray()) {
            const QJsonObject o = v.toObject();
            ShopItem item;
            item.templateId = o.value(QStringLiteral("TemplateID")).toInt();
            item.name = o.value(QStringLiteral("Name")).toString();
            item.image = o.value(QStringLiteral("Image")).toString();
            item.price = o.value(QStringLiteral("Price")).toInt();
            item.maxCount = o.value(QStringLiteral("MaxCount")).toInt(999);
            if (item.templateId > 0) {
                collected.append(item);
            }
        }

        const int totalPages =
            root.value(QStringLiteral("pageModel")).toObject()
                .value(QStringLiteral("totalPage")).toInt(1);
        if (page < totalPages) {
            fetchPage(page + 1, collected);
            return;
        }
        emit boxesReady(collected);
    });
}

void CardShopClient::fetchBalance()
{
    if (!ready()) {
        emit failed(QStringLiteral("Chưa có token webshop."));
        return;
    }

    // Endpoint này chỉ nhận GET; POST trả 405.
    QNetworkRequest req(QUrl(QStringLiteral("https://api.gnddt.com/api/oauth/GetUserInfo")));
    req.setRawHeader("Accept", "application/json");
    req.setRawHeader("Authorization", m_token.toUtf8());
    req.setRawHeader("Referer", kReferer);

    QNetworkReply *reply = m_net->get(req);
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            emit failed(QStringLiteral("Không đọc được số dư: ") + netError(reply));
            return;
        }
        const QJsonObject info = QJsonDocument::fromJson(reply->readAll())
                                     .object()
                                     .value(QStringLiteral("UserInfo"))
                                     .toObject();
        emit balanceReady((qint64)info.value(QStringLiteral("Cash")).toDouble(),
                          (qint64)info.value(QStringLiteral("CashFree")).toDouble());
    });
}

void CardShopClient::buy(const QList<QPair<ShopItem, int>> &order)
{
    if (!ready()) {
        emit failed(QStringLiteral("Chưa có token webshop."));
        return;
    }
    if (order.isEmpty()) {
        emit bought(true, QStringLiteral("Không có gì để mua."));
        return;
    }

    QJsonArray params;
    for (const QPair<ShopItem, int> &line : order) {
        QJsonObject o;
        o["TemplateID"] = line.first.templateId;
        o["Count"] = line.second;
        o["Attack"] = 0;
        o["Defence"] = 0;
        o["Luck"] = 0;
        o["Agility"] = 0;
        o["Strengthen"] = 0;
        o["ValiDate"] = 0;
        o["IsBinds"] = true;
        o["MaxCount"] = line.first.maxCount;
        // Giá lấy nguyên từ GetShopItem. Body cho phép client tự đặt giá; gửi số
        // của mình thì thành khai man, nên chỉ chuyển tiếp đúng giá server báo.
        o["Price"] = line.first.price;
        o["Image"] = line.first.image;
        o["Name"] = line.first.name;
        params.append(o);
    }

    QJsonObject body;
    body["UserId"] = m_userId;
    body["ServerId"] = m_serverId;
    body["Param"] = params;

    QNetworkReply *reply = m_net->post(makeRequest(QStringLiteral("UserSendItem"), m_token),
                                       QJsonDocument(body).toJson(QJsonDocument::Compact));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        const QByteArray raw = reply->readAll();
        if (reply->error() != QNetworkReply::NoError) {
            emit bought(false, QStringLiteral("Lỗi mạng: ") + netError(reply)
                                   + QLatin1Char(' ') + QString::fromUtf8(raw.left(200)));
            return;
        }
        const QJsonObject root = QJsonDocument::fromJson(raw).object();
        const bool ok = root.value(QStringLiteral("result")).toBool();
        const QString msg = root.value(QStringLiteral("msg")).toString();
        emit bought(ok, msg.isEmpty() ? QString::fromUtf8(raw.left(200)) : msg);
    });
}
