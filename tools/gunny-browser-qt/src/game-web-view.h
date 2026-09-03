#pragma once

#include <QWebView>

class LocalPageServer;
class ToolBridge;

// QWebView chứa game, kèm menu chuột phải riêng.
//
// LazyGunny làm custom right-click đúng theo cách này: override
// contextMenuEvent của QWebView và vẽ QMenu native đè lên, KHÔNG cần patch
// ContextMenu bên trong SWF.
class GameWebView : public QWebView
{
    Q_OBJECT

public:
    explicit GameWebView(ToolBridge *bridge, QWidget *parent = nullptr);

    // Dựng trang wrapper (từ resource) nhúng SWF với wmode/allowScriptAccess
    // đúng như trang game thật, rồi nạp.
    void loadGame(const QString &swfUrl, int stageWidth, int stageHeight);

    // Chất lượng vẽ ("high"/"medium"/"low") và kiểu co giãn ("showall"/
    // "noscale") của plugin Flash. Chỉ có tác dụng ở lần loadGame kế tiếp:
    // Flash đọc hai thứ này lúc dựng plugin, không đổi được khi đang chạy.
    void setRenderOptions(const QString &quality, const QString &scale);

signals:
    // Người dùng chọn một mục trong menu chuột phải; MainWindow xử lý.
    void toolActionRequested(const QString &actionId);

protected:
    void contextMenuEvent(QContextMenuEvent *event) override;

private slots:
    // QtWebKit xoá sạch window object mỗi lần điều hướng -> phải gắn lại cầu.
    void reinstallBridge();

private:
    ToolBridge *m_bridge;
    LocalPageServer *m_pageServer;
    QString m_quality = QStringLiteral("high");
    QString m_scale = QStringLiteral("noscale");
};
