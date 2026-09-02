#pragma once

#include <QFile>
#include <QNetworkAccessManager>
#include <QString>

// Chặn mọi request của Flash để gắn Referer hợp lệ.
//
// Vì sao cần: quest2.gnddt.com/ServerList.ashx nhìn Referer để quyết định trả
// địa chỉ game server. Referer bắt đầu bằng http://play.gnddt.com/ -> IP thật;
// bất cứ giá trị nào khác (kể cả link SWF trên res1) -> 127.0.0.1:9000 giả,
// socket bị từ chối và game đứng ở màn Loading 100%.
//
// Đây cũng là chỗ móc để tráo SWF đã patch về sau (xem swapRule()).
class RefererNetworkManager : public QNetworkAccessManager
{
    Q_OBJECT

public:
    explicit RefererNetworkManager(QString referer, QObject *parent = nullptr);

    // Thêm luật tráo: request khớp `urlContains` sẽ được nạp từ `replacement`
    // (đường dẫn file local hoặc URL khác). Dùng để serve SWF đã patch.
    void addSwapRule(const QString &urlContains, const QString &replacement);

    // Ghi mọi URL game tải về ra tệp. Cách duy nhất chắc chắn để biết SWF nào
    // chứa logic trận đấu: tên chúng dựng lúc chạy, đoán mò chỉ ra 404.
    // Đường dẫn rỗng để tắt.
    void setUrlLog(const QString &path);

protected:
    QNetworkReply *createRequest(Operation op,
                                 const QNetworkRequest &request,
                                 QIODevice *outgoingData) override;

private:
    QString m_referer;
    QList<QPair<QString, QString>> m_swapRules;
    QFile m_urlLog;
};
