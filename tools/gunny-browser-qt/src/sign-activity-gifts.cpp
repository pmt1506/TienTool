#include "sign-activity-gifts.h"

#include <QHash>
#include <QStringList>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>
#include <QUrlQuery>
#include <QXmlStreamReader>

namespace signactivity {

namespace {

// Hoạt động điểm danh trong gmactivityinfo.xml mang activityType 31.
const int kSignActivityType = 31;

} // namespace

QString claimCommand(const QString &activityId, const GiftBag &bag)
{
    return QStringLiteral("a:%1|%2|%3")
        .arg(activityId, bag.giftbagId)
        .arg(bag.rewards);
}

QString statusCommand(const QString &activityId)
{
    return QStringLiteral("g:") + activityId;
}

QHash<int, int> parseStatus(const QString &line)
{
    QHash<int, int> out;
    // "trangthai 0:2 1:1 2:0 …" — bỏ từ đầu, còn lại là các cặp id:giá trị.
    const QStringList parts = line.split(QLatin1Char(' '), QString::SkipEmptyParts);
    for (int i = 1; i < parts.size(); ++i) {
        const int colon = parts.at(i).indexOf(QLatin1Char(':'));
        if (colon <= 0) {
            continue;
        }
        bool okId = false, okValue = false;
        const int id = parts.at(i).left(colon).toInt(&okId);
        const int value = parts.at(i).mid(colon + 1).toInt(&okValue);
        if (okId && okValue) {
            out.insert(id, value);
        }
    }
    return out;
}

Loader::Loader(QObject *parent)
    : QObject(parent), m_net(new QNetworkAccessManager(this))
{
}

void Loader::load(const QString &swfUrl)
{
    const QString configUrl =
        QUrlQuery(QUrl(swfUrl)).queryItemValue(QStringLiteral("config"),
                                               QUrl::FullyDecoded);
    if (configUrl.isEmpty()) {
        fail(QStringLiteral("URL game không có tham số config"));
        return;
    }
    fetchConfig(configUrl);
}

void Loader::fetchConfig(const QString &configUrl)
{
    QNetworkReply *reply = m_net->get(QNetworkRequest(QUrl(configUrl)));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            fail(QStringLiteral("không tải được config: ") + reply->errorString());
            return;
        }
        const QByteArray xml = inflate(reply->readAll());

        // REQUEST_PATH là host phát dữ liệu game (quest1/quest2 tuỳ server);
        // FLASHSITE chỉ phát tài nguyên hình ảnh nên không dùng được.
        QXmlStreamReader r(xml);
        QString path;
        while (!r.atEnd()) {
            if (r.readNext() == QXmlStreamReader::StartElement
                && r.name() == QLatin1String("REQUEST_PATH")) {
                path = r.attributes().value(QLatin1String("value")).toString();
                break;
            }
        }
        if (path.isEmpty()) {
            fail(QStringLiteral("config không có REQUEST_PATH"));
            return;
        }
        fetchActivities(path);
    });
}

void Loader::fetchActivities(const QString &requestPath)
{
    QString url = requestPath;
    if (!url.endsWith(QLatin1Char('/'))) {
        url += QLatin1Char('/');
    }
    url += QStringLiteral("gmactivityinfo.xml");
    QNetworkReply *reply = m_net->get(QNetworkRequest(QUrl(url)));
    connect(reply, &QNetworkReply::finished, this, [this, reply] {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            fail(QStringLiteral("không tải được gmactivityinfo.xml: ")
                 + reply->errorString());
            return;
        }
        parseActivities(inflate(reply->readAll()));
    });
}

void Loader::parseActivities(const QByteArray &body)
{
    // Quét một lượt, gom cả ba loại thẻ vào bảng tra rồi ghép sau. Ghép theo
    // khoá chứ không theo thứ tự lồng nhau: mỗi <Gift> đã mang sẵn activityId,
    // và <Condition>/<Reward> trỏ ngược về giftbagId, nên không cần bám vào
    // cấu trúc cây — cấu trúc đó server đổi lúc nào không báo.
    QHash<QString, GiftBag> bags;   // giftbagId -> gói
    QHash<QString, QString> owner;  // giftbagId -> activityId
    QHash<QString, int> rewards;    // giftId -> số món

    QXmlStreamReader r(body);
    while (!r.atEnd()) {
        if (r.readNext() != QXmlStreamReader::StartElement) {
            continue;
        }
        const QXmlStreamAttributes a = r.attributes();
        const QStringRef tag = r.name();

        if (tag == QLatin1String("Activity")) {
            if (a.value(QLatin1String("activityType")).toInt() == kSignActivityType) {
                m_activityId = a.value(QLatin1String("activityId")).toString();
            }
        } else if (tag == QLatin1String("Gift")) {
            const QString id = a.value(QLatin1String("giftbagId")).toString();
            owner.insert(id, a.value(QLatin1String("activityId")).toString());
            GiftBag &b = bags[id];
            b.giftbagId = id;
            b.order = a.value(QLatin1String("giftbagOrder")).toInt();
        } else if (tag == QLatin1String("Reward")) {
            rewards[a.value(QLatin1String("giftId")).toString()] += 1;
        } else if (tag == QLatin1String("Condition")) {
            const QString id = a.value(QLatin1String("giftbagId")).toString();
            if (id.isEmpty()) {
                continue;
            }
            GiftBag &b = bags[id];
            b.giftbagId = id;
            b.index = a.value(QLatin1String("conditionIndex")).toInt();
            b.value = a.value(QLatin1String("conditionValue")).toInt();
        }
    }
    if (r.hasError()) {
        fail(QStringLiteral("gmactivityinfo.xml hỏng: ") + r.errorString());
        return;
    }
    if (m_activityId.isEmpty()) {
        fail(QStringLiteral("không thấy hoạt động điểm danh (activityType %1)")
                 .arg(kSignActivityType));
        return;
    }

    m_gifts.clear();
    for (auto it = bags.begin(); it != bags.end(); ++it) {
        if (owner.value(it.key()) != m_activityId) {
            continue;
        }
        GiftBag b = it.value();
        b.rewards = rewards.value(b.giftbagId, 1);
        m_gifts.append(b);
    }
    // Xếp quà ngày trước quà mốc, trong mỗi nhóm theo số ngày tăng dần — menu
    // và thứ tự gửi đi đều theo đây.
    std::sort(m_gifts.begin(), m_gifts.end(), [](const GiftBag &x, const GiftBag &y) {
        return x.index != y.index ? x.index < y.index : x.value < y.value;
    });

    emit finished(m_gifts.isEmpty() ? QStringLiteral("hoạt động không có gói quà nào")
                                    : QString());
}

QByteArray Loader::inflate(const QByteArray &body)
{
    // config.xml mở đầu bằng BOM UTF-8 (EF BB BF) rồi mới tới '<', còn
    // gmactivityinfo.xml là luồng zlib trần. Cắt BOM trước khi đoán kiểu, nếu
    // không thì XML thô bị đem đi giải nén và ra rỗng.
    QByteArray data = body;
    if (data.startsWith("\xEF\xBB\xBF")) {
        data.remove(0, 3);
    }
    if (data.startsWith('<')) {
        return data;
    }
    // qUncompress đòi 4 byte độ dài ở đầu, còn server trả luồng zlib trần. Con
    // số chỉ là gợi ý cấp phát: Qt tự nhân đôi bộ đệm khi thiếu.
    QByteArray framed(4, Qt::Uninitialized);
    const quint32 hint = quint32(data.size()) * 8;
    framed[0] = char((hint >> 24) & 0xff);
    framed[1] = char((hint >> 16) & 0xff);
    framed[2] = char((hint >> 8) & 0xff);
    framed[3] = char(hint & 0xff);
    framed.append(data);
    return qUncompress(framed);
}

void Loader::fail(const QString &why)
{
    m_gifts.clear();
    emit finished(why);
}

} // namespace signactivity
