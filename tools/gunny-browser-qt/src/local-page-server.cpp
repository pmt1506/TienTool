#include "local-page-server.h"

#include <QHostAddress>
#include <QTcpSocket>

LocalPageServer::LocalPageServer(QObject *parent) : QTcpServer(parent) {}

QString LocalPageServer::start(const QByteArray &html)
{
    m_html = html;
    // Nạp lại game gọi start() lần nữa. listen() khi đang nghe sẽ thất bại, và
    // trước đây điều đó biến trang thành thông báo lỗi — giữ nguyên cổng cũ.
    // Cổng 0 = để OS chọn cổng trống; chỉ nghe loopback.
    if (!isListening() && !listen(QHostAddress::LocalHost, 0)) {
        return {};
    }
    return QStringLiteral("http://127.0.0.1:%1/play.html").arg(serverPort());
}

void LocalPageServer::incomingConnection(qintptr socketDescriptor)
{
    QTcpSocket *sock = new QTcpSocket(this);
    if (!sock->setSocketDescriptor(socketDescriptor)) {
        sock->deleteLater();
        return;
    }

    connect(sock, &QTcpSocket::readyRead, this, [this, sock] {
        // Chỉ cần đọc tới hết dòng request đầu; trang nào cũng trả cùng HTML.
        const QByteArray req = sock->readAll();
        if (!req.startsWith("GET")) {
            sock->disconnectFromHost();
            return;
        }

        QByteArray res = "HTTP/1.1 200 OK\r\n";
        res += "Content-Type: text/html; charset=utf-8\r\n";
        res += "Content-Length: " + QByteArray::number(m_html.size()) + "\r\n";
        res += "Connection: close\r\n\r\n";
        res += m_html;

        sock->write(res);
        sock->flush();
        sock->disconnectFromHost();
    });

    connect(sock, &QTcpSocket::disconnected, sock, &QObject::deleteLater);
}
