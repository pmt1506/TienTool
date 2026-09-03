#include "referer-network-manager.h"

#include <QElapsedTimer>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QUrl>

#include "local-file-reply.h"

RefererNetworkManager::RefererNetworkManager(QString referer, QObject *parent)
    : QNetworkAccessManager(parent), m_referer(std::move(referer))
{
    m_since.start();
}

void RefererNetworkManager::addSwapRule(const QString &urlContains, const QString &replacement)
{
    m_swapRules.append({urlContains, replacement});
}

void RefererNetworkManager::addContentOverride(const QString &urlContains,
                                               const QString &localFile)
{
    QFile f(localFile);
    if (!f.open(QIODevice::ReadOnly)) {
        return;
    }
    m_contentOverrides.append({urlContains, f.readAll()});
}

void RefererNetworkManager::setUrlLog(const QString &path)
{
    if (m_urlLog.isOpen()) {
        m_urlLog.close();
    }
    if (path.isEmpty()) {
        return;
    }
    m_urlLog.setFileName(path);
    m_urlLog.open(QIODevice::WriteOnly | QIODevice::Truncate);
}

QNetworkReply *RefererNetworkManager::createRequest(Operation op,
                                                    const QNetworkRequest &request,
                                                    QIODevice *outgoingData)
{
    QNetworkRequest patched(request);

    // Gắn Referer cho mọi request đi ra. Flash tự đặt Referer là URL của SWF,
    // giá trị đó bị server coi là "không phải từ trang game".
    if (!m_referer.isEmpty()) {
        patched.setRawHeader("Referer", m_referer.toUtf8());
    }

    // Bản Flash mà server mong đợi; một số endpoint dùng header này để nhận
    // diện client.
    patched.setRawHeader("x-requested-with", "ShockwaveFlash/26.0.0.151");

    const QString url = request.url().toString();
    if (m_urlLog.isOpen()) {
        m_urlLog.write(QByteArray::number(m_since.elapsed()) + " ");
        m_urlLog.write(url.toUtf8());
        m_urlLog.write("\n");
        m_urlLog.flush();
    }

    for (const auto &ov : m_contentOverrides) {
        if (url.contains(ov.first)) {
            if (m_urlLog.isOpen()) {
                m_urlLog.write("  ^^ TRAO NOI DUNG (" + QByteArray::number(ov.second.size())
                               + " byte)\n");
                m_urlLog.flush();
            }
            return new LocalFileReply(patched, ov.second, this);
        }
    }

    for (const auto &rule : m_swapRules) {
        if (url.contains(rule.first)) {
            patched.setUrl(QUrl(rule.second));
            break;
        }
    }

    QNetworkReply *reply = QNetworkAccessManager::createRequest(op, patched, outgoingData);

    // Ghi thời gian và cỡ từng request. Cú đơ vài giây ở thao tác đầu tiên có
    // thể do tải tài nguyên, cũng có thể do Flash dựng giao diện; chỉ có số đo
    // mới phân biệt được.
    if (m_urlLog.isOpen()) {
        auto *timer = new QElapsedTimer;
        timer->start();
        connect(reply, &QNetworkReply::finished, this, [this, reply, timer] {
            if (m_urlLog.isOpen()) {
                // Content-Length chứ không phải bytesAvailable(): trang đọc hết
                // dữ liệu trước khi finished() bắn, lúc đó bộ đệm đã rỗng.
                m_urlLog.write("  ^^ " + QByteArray::number((qint64)timer->elapsed()) + "ms "
                               + reply->header(QNetworkRequest::ContentLengthHeader).toByteArray()
                               + "B xong=" + QByteArray::number(m_since.elapsed()) + "\n");
                m_urlLog.flush();
            }
            delete timer;
        });
    }

    return reply;
}
