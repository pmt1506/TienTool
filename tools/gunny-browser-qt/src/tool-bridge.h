#pragma once

#include <QObject>
#include <QString>

class QWebFrame;

// Cầu 2 chiều giữa C++ và game.
//
//   C++ -> AS3 : callFlash()  ->  evaluateJavaScript  ->  ExternalInterface callback
//   AS3 -> C++ : ExternalInterface.call("<tên>")  ->  JS  ->  slot ở lớp này
//
// Object này được gắn vào window bằng addToJavaScriptWindowObject("tool", ...),
// nên JS trong trang gọi được `tool.log("...")`.
//
// Callback game ĐÃ đăng ký sẵn (rút từ Loading.swf/DDT_Loading.swf):
//   SetFlashLoadExternal, setLoginType, IsDesktop
// Muốn có thêm hàm riêng (dọn túi, mở kho...) thì phải patch SWF để thêm
// ExternalInterface.addCallback, hoặc đi đường packet qua proxy socket.
class ToolBridge : public QObject
{
    Q_OBJECT

public:
    explicit ToolBridge(QObject *parent = nullptr);

    void setFrame(QWebFrame *frame);

    // Gọi một ExternalInterface callback trong SWF. `jsonArgs` là các đối số
    // đã ở dạng literal JavaScript (vd: "1, 'abc'"). Trả về kết quả dạng chuỗi.
    QString callFlash(const QString &callback, const QString &jsonArgs = QString());

    // Đặt một lệnh vào hàng đợi cho SWF đã patch lấy về.
    //
    // Không gọi thẳng callback: chiều JS -> Flash qua NPObject chập chờn với
    // wmode=direct. SWF hỏi hàng đợi này 250ms một lần rồi báo kết quả ngược ra
    // qua toolLog, tới đây thành flashMessage.
    void queueCommand(const QString &command);

    // Hỏi xem những callback nào thực sự có trên object Flash. Dùng để phân biệt
    // "bản patch không chạy" với "ExternalInterface không hoạt động".
    QString probeCallbacks();

public slots:
    // Các slot dưới đây gọi được trực tiếp từ JS qua object `tool`.
    void log(const QString &message);
    QString appVersion() const;

signals:
    // Phát khi game gọi ra host; MainWindow nối vào để cập nhật trạng thái.
    void flashMessage(const QString &message);

private:
    QWebFrame *m_frame = nullptr;
};
