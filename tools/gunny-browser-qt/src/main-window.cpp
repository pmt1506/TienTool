#include "main-window.h"

#include <QActionGroup>
#include <QCoreApplication>
#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QMenuBar>
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

    // Bản Loading.swf đã patch thêm ExternalInterface callback. Phục vụ nó tại
    // đúng URL gốc để Flash vẫn xếp SWF vào sandbox của res1.gnddt.com. Không có
    // tệp thì bỏ qua, game chạy như thường, chỉ mất mấy nút gọi vào AS3.
    const QString patched =
        QDir(QCoreApplication::applicationDirPath()).filePath(QStringLiteral("patched/Loading.swf"));
    if (QFile::exists(patched)) {
        m_network->addContentOverride(QStringLiteral("/Loading.swf"), patched);
    }

    // Sân khấu Flash có kích thước cố định, nên khung xem cũng phải đúng bằng nó.
    // Để khung to hơn thì thừa ra dải đen; nhỏ hơn thì game bị cắt.
    m_view->setFixedSize(stageWidth, stageHeight);
    setCentralWidget(m_view);
    buildMenuBar();
    buildSpeedMenu();
    buildPacketMenu();
    buildOverlayMenu();
    showStatus(QStringLiteral("Đang tải game…"), 4000);

    tryHookSpeed();

    connect(m_view, &GameWebView::toolActionRequested, this, &MainWindow::onToolAction);
    // Ghi mọi báo cáo từ AS3 ra tệp. Tiêu đề cửa sổ chỉ hiện được vài giây và
    // phải có người ngồi nhìn; tệp thì đọc lại được sau.
    connect(m_bridge, &ToolBridge::flashMessage, this, [this](const QString &m) {
        showStatus(m, 5000);
        QFile f(QDir(QDir::tempPath()).filePath(QStringLiteral("gunny-flash.log")));
        if (f.open(QIODevice::Append | QIODevice::Text)) {
            f.write(QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss ")).toUtf8());
            f.write(m.toUtf8());
            f.write("\n");
        }
    });

    // --auto-magic <giây>: tự bấm "Kho ma pháp" sau khi game tải xong. Để chạy
    // thử không cần người ngồi bấm.
    const int autoArg = QCoreApplication::arguments().indexOf(QStringLiteral("--auto-magic"));
    if (autoArg > 0 && autoArg + 1 < QCoreApplication::arguments().size()) {
        const int secs = QCoreApplication::arguments().at(autoArg + 1).toInt();
        QTimer::singleShot(secs * 1000, this,
                           [this] { onToolAction(QStringLiteral("open-magic-store")); });
    }
    connect(m_view, &QWebView::loadFinished, this, [this](bool ok) {
        showStatus(ok ? QStringLiteral("Đã nạp Flash")
                                    : QStringLiteral("Nạp trang thất bại"), 5000);
    });

    adjustSize();
    m_view->loadGame(m_swfUrl, m_stageWidth, m_stageHeight);
}

void MainWindow::showStatus(const QString &text, int msec)
{
    setWindowTitle(QStringLiteral("Gunny — %1").arg(text));
    QTimer::singleShot(msec, this, [this] { setWindowTitle(QStringLiteral("Gunny")); });
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

    // Nút dùng thường xuyên đặt thẳng trên thanh menu, không giấu trong menu con.
    QAction *magic = menuBar()->addAction(QStringLiteral("Kho ma pháp"));
    connect(magic, &QAction::triggered, this,
            [this] { onToolAction(QStringLiteral("open-magic-store")); });

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
        showStatus(
            QStringLiteral("Gói: gửi %1 (%2 B) / nhận %3 (%4 B)")
                .arg(s.sent).arg(s.bytesSent).arg(s.received).arg(s.bytesReceived),
            8000);
    });
}

void MainWindow::togglePacketCapture(bool on)
{
    if (!on) {
        PacketProxy::stopCapture();
        showStatus(QStringLiteral("Đã dừng ghi: %1").arg(m_capturePath), 8000);
        return;
    }

    // Mỗi phiên một tệp riêng để so sánh được hai lần bắt với nhau.
    m_capturePath =
        QDir(QDir::tempPath())
            .filePath(QStringLiteral("gunny-packets-%1.log")
                          .arg(QDateTime::currentDateTime().toString(QStringLiteral("yyMMdd-hhmmss"))));

    if (PacketProxy::startCapture((const wchar_t *)m_capturePath.utf16())) {
        showStatus(QStringLiteral("Đang ghi: %1").arg(m_capturePath), 8000);
    } else {
        m_captureAction->setChecked(false);
        showStatus(QStringLiteral("Không mở được tệp ghi"), 5000);
    }
}

void MainWindow::buildOverlayMenu()
{
    m_overlay = new OverlayWindow(m_view);

    QMenu *menu = menuBar()->addMenu(QStringLiteral("Thước"));
    QAction *ruler = menu->addAction(QStringLiteral("Hiện thước"));
    ruler->setCheckable(true);
    connect(ruler, &QAction::toggled, this, &MainWindow::toggleRuler);
}

void MainWindow::toggleRuler(bool on)
{
    m_overlay->setRuler(on);
    showStatus(
        on ? QStringLiteral("Thước: bật") : QStringLiteral("Thước: tắt"), 3000);
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
        showStatus(
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
    showStatus(
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

    if (actionId == QLatin1String("open-magic-store")) {
        // Tab 1 mở thẳng WarehouseView ("Kho báu") — xem __changeHandler của
        // magicHouse.MagicHouseMainView. Callback do bản Loading.swf đã patch
        // đăng ký; game gốc không mở sẵn cửa nào gọi được từ ngoài.
        // Hiện kết quả trả về chứ không nuốt: chuỗi đó phân biệt được ba kiểu
        // hỏng khác nhau — "ERR:" là JS không gọi được (callback chưa đăng ký,
        // tức bản patch chưa chạy), "err:" là AS3 ném lỗi (tìm không ra lớp),
        // "ok" là đã dispatch xong.
        // So sánh với callback mà game GỐC đăng ký: nếu cái đó cũng không thấy
        // thì lỗi nằm ở ExternalInterface/allowScriptAccess chứ không phải ở
        // bản patch.
        // Đặt lệnh vào hàng đợi cho SWF đã vá lấy về. Không gọi thẳng callback:
        // chiều JS -> Flash hỏng hẳn ở QtWebKit — gọi cả callback GỐC của game
        // (SetFlashLoadExternal) cũng ra "Error calling method on NPObject".
        // Chiều ngược lại (ExternalInterface.call) thì chạy tốt, nên SWF hỏi
        // hàng đợi này 250ms một lần rồi báo kết quả về qua toolLog.
        // Đúng một lệnh cho mỗi lần bấm. Gửi lại nhiều lần thì lệnh còn treo
        // trong hàng đợi và tự nổ vào thao tác kế tiếp của người chơi.
        m_bridge->queueCommand(QStringLiteral("magic:1"));
        showStatus(QStringLiteral("Đã gửi lệnh mở kho…"), 3000);
        return;
    }

    // Các tính năng game (dọn túi, dọn thư, mở kho…) là hành động phía server.
    // Hai đường triển khai, chưa cái nào nối vào đây:
    //   1. gửi packet qua proxy socket
    //   2. patch SWF thêm ExternalInterface.addCallback rồi gọi qua m_bridge
    // Ví dụ đường 2:  m_bridge->callFlash("cleanBag");
    showStatus(
        QStringLiteral("Chưa nối hành động: %1").arg(actionId), 4000);
}
