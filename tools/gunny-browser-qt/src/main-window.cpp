#include "main-window.h"

#include <QMenuBar>
#include <QStatusBar>
#include <QWebPage>

#include "game-web-view.h"
#include "referer-network-manager.h"
#include "tool-bridge.h"

MainWindow::MainWindow(const QString &swfUrl,
                       const QString &referer,
                       int stageWidth,
                       int stageHeight,
                       QWidget *parent)
    : QMainWindow(parent), m_swfUrl(swfUrl), m_stageWidth(stageWidth), m_stageHeight(stageHeight)
{
    m_bridge = new ToolBridge(this);
    m_view = new GameWebView(m_bridge, this);

    // Mọi request của Flash đi qua manager này để được gắn Referer hợp lệ.
    m_network = new RefererNetworkManager(referer, this);
    m_view->page()->setNetworkAccessManager(m_network);

    setCentralWidget(m_view);
    buildMenuBar();
    statusBar()->showMessage(QStringLiteral("Đang tải game…"));

    connect(m_view, &GameWebView::toolActionRequested, this, &MainWindow::onToolAction);
    connect(m_bridge, &ToolBridge::flashMessage, this,
            [this](const QString &m) { statusBar()->showMessage(m, 5000); });
    connect(m_view, &QWebView::loadFinished, this, [this](bool ok) {
        statusBar()->showMessage(ok ? QStringLiteral("Đã nạp Flash")
                                    : QStringLiteral("Nạp trang thất bại"), 5000);
    });

    resize(stageWidth, stageHeight + menuBar()->height() + statusBar()->height());
    m_view->loadGame(m_swfUrl, m_stageWidth, m_stageHeight);
}

void MainWindow::buildMenuBar()
{
    // Bố cục menu theo LazyGunny; hành động thật sẽ nối dần vào onToolAction.
    struct Entry { const char *menu; const char *id; const char *text; };
    static const Entry entries[] = {
        {"Giao diện", "toggle-overlay", "Hiện bảng cài đặt"},
        {"Giao diện", "reload", "Tải lại game"},
        {"Tiện ích", "clean-bag", "Dọn túi"},
        {"Tiện ích", "clean-mail", "Dọn thư"},
        {"Tiện ích", "open-magic-store", "Mở kho ma pháp"},
        {"Tiện ích", "clear-cache", "Xóa cache"},
    };

    QHash<QString, QMenu *> menus;
    for (const Entry &e : entries) {
        const QString name = QString::fromUtf8(e.menu);
        QMenu *&m = menus[name];
        if (!m) {
            m = menuBar()->addMenu(name);
        }
        QAction *act = m->addAction(QString::fromUtf8(e.text));
        const QString id = QString::fromUtf8(e.id);
        connect(act, &QAction::triggered, this, [this, id] { onToolAction(id); });
    }
}

void MainWindow::onToolAction(const QString &actionId)
{
    if (actionId == QLatin1String("reload")) {
        m_view->loadGame(m_swfUrl, m_stageWidth, m_stageHeight);
        return;
    }

    // Các tính năng game (dọn túi, dọn thư, mở kho…) là hành động phía server.
    // Hai đường triển khai, chưa cái nào nối vào đây:
    //   1. gửi packet qua proxy socket
    //   2. patch SWF thêm ExternalInterface.addCallback rồi gọi qua m_bridge
    // Ví dụ đường 2:  m_bridge->callFlash("cleanBag");
    statusBar()->showMessage(
        QStringLiteral("Chưa nối hành động: %1").arg(actionId), 4000);
}
