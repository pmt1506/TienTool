#pragma once

#include <QWebView>

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
};
