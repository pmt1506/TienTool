#include "main-window.h"

#include <QActionGroup>
#include <QDateTime>
#include <QDir>
#include <QMenuBar>
#include <QStatusBar>
#include <QTimer>
#include <QWebPage>

#include "game-web-view.h"
#include "overlay-window.h"
#include "packet-proxy.h"
#include "referer-network-manager.h"
#include "speed-dialog.h"
#include "speed-hack.h"
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

    // Ghi URL ngay từ đầu chứ không đợi bật ở menu: SWF chứa logic game được
    // nạp trong lúc khởi động, bật muộn là chỉ còn thấy ảnh trang bị với đạn.
    m_network->setUrlLog(QDir(QDir::tempPath()).filePath(QStringLiteral("gunny-urls.txt")));

    setCentralWidget(m_view);
    buildMenuBar();
    buildSpeedMenu();
    buildPacketMenu();
    buildOverlayMenu();
    statusBar()->showMessage(QStringLiteral("Đang tải game…"));

    tryHookSpeed();

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

void MainWindow::buildSpeedMenu()
{
    QMenu *menu = menuBar()->addMenu(QStringLiteral("Cheat Speed"));

    // Ba mục loại trừ nhau -> nhóm lại để Qt tự quản dấu tích.
    auto *group = new QActionGroup(this);
    group->setExclusive(true);

    auto addMode = [&](const QString &text, bool checked) {
        QAction *a = menu->addAction(text);
        a->setCheckable(true);
        a->setChecked(checked);
        group->addAction(a);
        return a;
    };

    m_speedNormal = addMode(QStringLiteral("Bình thường (x1)"), true);
    m_speedTurbo = addMode(QStringLiteral("Tối ưu (x5)"), false);
    m_speedCustom = addMode(QStringLiteral("Tùy chỉnh…"), false);

    connect(m_speedNormal, &QAction::triggered, this, [this] { applySpeed(1.0); });
    connect(m_speedTurbo, &QAction::triggered, this, [this] { applySpeed(5.0); });
    connect(m_speedCustom, &QAction::triggered, this, [this] {
        SpeedDialog dlg(SpeedHack::multiplier(), this);
        // Áp dụng ngay trong lúc kéo; hộp thoại tự trả lại giá trị cũ nếu Hủy.
        connect(&dlg, &SpeedDialog::multiplierPreview, this, &MainWindow::applySpeed);
        dlg.exec();
    });
}

void MainWindow::buildPacketMenu()
{
    QMenu *menu = menuBar()->addMenu(QStringLiteral("Gói tin"));

    m_captureAction = menu->addAction(QStringLiteral("Ghi ra tệp"));
    m_captureAction->setCheckable(true);
    connect(m_captureAction, &QAction::toggled, this, &MainWindow::togglePacketCapture);

    QAction *show = menu->addAction(QStringLiteral("Xem số liệu"));
    connect(show, &QAction::triggered, this, [this] {
        const PacketProxy::Stats s = PacketProxy::stats();
        statusBar()->showMessage(
            QStringLiteral("Gói: gửi %1 (%2 B) / nhận %3 (%4 B)")
                .arg(s.sent).arg(s.bytesSent).arg(s.received).arg(s.bytesReceived),
            8000);
    });
}

void MainWindow::togglePacketCapture(bool on)
{
    if (!on) {
        PacketProxy::stopCapture();
        statusBar()->showMessage(QStringLiteral("Đã dừng ghi: %1").arg(m_capturePath), 8000);
        return;
    }

    // Mỗi phiên một tệp riêng để so sánh được hai lần bắt với nhau.
    m_capturePath =
        QDir(QDir::tempPath())
            .filePath(QStringLiteral("gunny-packets-%1.log")
                          .arg(QDateTime::currentDateTime().toString(QStringLiteral("yyMMdd-hhmmss"))));

    if (PacketProxy::startCapture((const wchar_t *)m_capturePath.utf16())) {
        statusBar()->showMessage(QStringLiteral("Đang ghi: %1").arg(m_capturePath), 8000);
    } else {
        m_captureAction->setChecked(false);
        statusBar()->showMessage(QStringLiteral("Không mở được tệp ghi"), 5000);
    }
}

void MainWindow::buildOverlayMenu()
{
    m_overlay = new OverlayWindow(m_view);

    QMenu *menu = menuBar()->addMenu(QStringLiteral("Thước"));
    QAction *test = menu->addAction(QStringLiteral("Vẽ thử đường bắn"));
    test->setCheckable(true);
    connect(test, &QAction::toggled, this, &MainWindow::toggleTestTrajectory);
}

void MainWindow::toggleTestTrajectory(bool on)
{
    if (!on) {
        m_overlay->clearTrajectory();
        statusBar()->showMessage(QStringLiteral("Đã tắt thước"), 3000);
        return;
    }

    // Parabol giả: xuất phát từ mép trái, đỉnh ở giữa khung. Chỉ để nhìn xem
    // đường có nằm trên Flash không — hằng số vật lý thật còn phải moi từ
    // game.actions:ShootBombAction.
    const double w = m_stageWidth;
    const double h = m_stageHeight;
    const double x0 = w * 0.15, y0 = h * 0.75;
    const double x1 = w * 0.85;
    const double peak = h * 0.25;

    QVector<QPointF> pts;
    for (int i = 0; i <= 60; ++i) {
        const double t = i / 60.0;
        const double x = x0 + (x1 - x0) * t;
        // parabol chuẩn hoá: 4t(1-t) đạt 1 ở giữa
        const double y = y0 - (y0 - peak) * 4.0 * t * (1.0 - t);
        pts.append(QPointF(x, y));
    }
    m_overlay->setTrajectory(pts);
    statusBar()->showMessage(
        QStringLiteral("Nếu thấy đường xanh trên game -> overlay thắng được wmode=direct"),
        8000);
}

void MainWindow::tryHookSpeed()
{
    // Bẫy đã nằm sẵn trong kernel32 từ main(); ở đây chỉ còn việc dò khoảng địa
    // chỉ của NPSWF32.dll để lọc người gọi. Flash nạp trễ (sau khi trang dựng
    // xong <embed>) nên phải hỏi lại theo chu kỳ cho tới khi thấy.
    if (!SpeedHack::locateFlash()) {
        QTimer::singleShot(2000, this, &MainWindow::tryHookSpeed);
    }
}

void MainWindow::applySpeed(double multiplier)
{
    if (!SpeedHack::isHooked()) {
        SpeedHack::locateFlash();
    }
    if (!SpeedHack::isHooked()) {
        statusBar()->showMessage(
            QStringLiteral("Chưa gắn được vào Flash — chờ game tải xong rồi thử lại"), 4000);
        return;
    }

    SpeedHack::setMultiplier(multiplier);

    // Cập nhật dấu tích cho khớp khi tốc độ được đặt từ hộp thoại.
    if (m_speedNormal) {
        const double m = SpeedHack::multiplier();
        if (qFuzzyCompare(m, 1.0)) m_speedNormal->setChecked(true);
        else if (qFuzzyCompare(m, 5.0)) m_speedTurbo->setChecked(true);
        else m_speedCustom->setChecked(true);
    }

    // Kèm số lần đồng hồ bị hỏi, tách theo nguồn gọi. Nếu "flash" đứng yên ở 0
    // thì Flash không tự đọc đồng hồ, và mọi cách nói dối đồng hồ đều vô ích —
    // nhịp khung hình khi đó do host bơm vào qua timer của plugin.
    const SpeedHack::Stats s = SpeedHack::stats();
    statusBar()->showMessage(
        QStringLiteral("Tốc độ: x%1  (đồng hồ: flash %2 / khác %3)")
            .arg(SpeedHack::multiplier(), 0, 'g', 3)
            .arg(s.fromFlash)
            .arg(s.fromElsewhere),
        6000);
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
