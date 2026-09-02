#include "local-file-reply.h"

#include <QTimer>

LocalFileReply::LocalFileReply(const QNetworkRequest &request,
                               const QByteArray &content,
                               QObject *parent)
    : QNetworkReply(parent), m_content(content)
{
    setRequest(request);
    setUrl(request.url());
    setOperation(QNetworkAccessManager::GetOperation);
    setHeader(QNetworkRequest::ContentTypeHeader,
              QVariant(QStringLiteral("application/x-shockwave-flash")));
    setHeader(QNetworkRequest::ContentLengthHeader, QVariant(m_content.size()));
    setAttribute(QNetworkRequest::HttpStatusCodeAttribute, 200);
    open(ReadOnly | Unbuffered);

    // Phát tín hiệu ở vòng lặp sự kiện kế tiếp: người gọi cần kịp nối slot vào
    // reply trước khi nó báo xong.
    QTimer::singleShot(0, this, [this] {
        emit metaDataChanged();
        emit downloadProgress(m_content.size(), m_content.size());
        emit readyRead();
        emit finished();
    });
}

qint64 LocalFileReply::bytesAvailable() const
{
    return m_content.size() - m_offset + QNetworkReply::bytesAvailable();
}

qint64 LocalFileReply::readData(char *data, qint64 maxSize)
{
    if (m_offset >= m_content.size()) {
        return -1;
    }
    const qint64 n = qMin(maxSize, (qint64)m_content.size() - m_offset);
    memcpy(data, m_content.constData() + m_offset, n);
    m_offset += n;
    return n;
}
