#pragma once

#include <QByteArray>
#include <QTcpServer>

// HTTP server tí hon phục vụ đúng một trang: trang wrapper nhúng SWF.
//
// Vì sao cần: nạp trang bằng QWebView::setHtml() thì document không có URL
// http thật, Flash coi origin là rỗng và tự abort (process thoát với
// STATUS_BREAKPOINT 0x80000003). GunnyClient gốc cũng chạy HTTP server local
// (cổng 9999/9998) đúng vì lý do này.
class LocalPageServer : public QTcpServer
{
    Q_OBJECT

public:
    explicit LocalPageServer(QObject *parent = nullptr);

    // Mở cổng ngẫu nhiên trên loopback. Trả URL của trang, rỗng nếu lỗi.
    QString start(const QByteArray &html);

protected:
    void incomingConnection(qintptr socketDescriptor) override;

private:
    QByteArray m_html;
};
