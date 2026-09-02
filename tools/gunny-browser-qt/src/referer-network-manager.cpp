#include "referer-network-manager.h"

#include <QNetworkRequest>
#include <QUrl>

RefererNetworkManager::RefererNetworkManager(QString referer, QObject *parent)
    : QNetworkAccessManager(parent), m_referer(std::move(referer))
{
}

void RefererNetworkManager::addSwapRule(const QString &urlContains, const QString &replacement)
{
    m_swapRules.append({urlContains, replacement});
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
    for (const auto &rule : m_swapRules) {
        if (url.contains(rule.first)) {
            patched.setUrl(QUrl(rule.second));
            break;
        }
    }

    return QNetworkAccessManager::createRequest(op, patched, outgoingData);
}
