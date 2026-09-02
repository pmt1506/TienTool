#pragma once

#include <QByteArray>
#include <QNetworkReply>

// Trả nội dung từ một tệp trên đĩa nhưng vẫn khai báo URL gốc trên mạng.
//
// Dùng để tráo SWF đã patch. Không thể chỉ đổi URL sang 127.0.0.1: Flash xếp
// sandbox theo origin của SWF, đổi origin là mất quyền gọi sang gnddt.com và
// game hỏng. Giữ nguyên URL thì Flash vẫn coi SWF thuộc res1.gnddt.com.
class LocalFileReply : public QNetworkReply
{
    Q_OBJECT

public:
    LocalFileReply(const QNetworkRequest &request,
                   const QByteArray &content,
                   QObject *parent = nullptr);

    void abort() override {}
    qint64 bytesAvailable() const override;
    bool isSequential() const override { return true; }

protected:
    qint64 readData(char *data, qint64 maxSize) override;

private:
    QByteArray m_content;
    qint64 m_offset = 0;
};
