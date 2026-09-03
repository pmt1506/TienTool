#include "main-window.h"

#include <QActionGroup>
#include <QCoreApplication>
#include <QDateTime>
#include <QSet>
#include <QSettings>
#include <QDir>
#include <QFile>
#include <QInputDialog>
#include <QMenuBar>
#include <QTimer>
#include <QWebPage>

#include "game-web-view.h"
#include "overlay-window.h"
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
    // Thứ tự trên thanh menu theo đúng thứ tự gọi ở đây.
    buildGraphicsMenu();
    buildMenuBar();
    buildSpeedMenu();
    buildOverlayMenu();
    buildMagicAction();
    showStatus(QStringLiteral("Đang tải game…"), 4000);

    tryHookSpeed();

    connect(m_view, &GameWebView::toolActionRequested, this, &MainWindow::onToolAction);
    // Ghi mọi báo cáo từ AS3 ra tệp. Tiêu đề cửa sổ chỉ hiện được vài giây và
    // phải có người ngồi nhìn; tệp thì đọc lại được sau.
    connect(m_bridge, &ToolBridge::flashMessage, this, [this](const QString &m) {
        if (m.startsWith(QLatin1String("state "))) {
            onGameState(m.mid(6));
            // Game tự đặt lại stage.scaleMode khi vào màn game, nên bản vá giữ
            // lựa chọn và ép lại mỗi nhịp. Báo cho nó biết giữ gì, một lần.
            if (!m_scaleSent) {
                m_scaleSent = true;
                m_bridge->queueCommand(QStringLiteral("s:") + scaleValue());
            }
        }
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
    applyRenderOptions();
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
        {"Tiện ích", "clear-cache", "Xóa cache"},
        {"Tiện ích", "list-bag", "Liệt kê túi (ra log)"},
        {"Tiện ích", "open-slot", "Mở ô túi…"},
        {"Tiện ích", "open-batch", "Mở nhanh (hết số lượng)"},
        {"Tiện ích", "use-pet", "Dùng nhanh phụ kiện thú & pet"},
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

void MainWindow::buildMagicAction()
{
    // Nút dùng thường xuyên đặt thẳng trên thanh menu, không giấu trong menu con.
    QAction *magic = menuBar()->addAction(QStringLiteral("Kho ma pháp"));
    connect(magic, &QAction::triggered, this,
            [this] { onToolAction(QStringLiteral("open-magic-store")); });
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

void MainWindow::buildOverlayMenu()
{
    m_overlay = new OverlayWindow(m_view);

    QMenu *menu = menuBar()->addMenu(QStringLiteral("Thước"));
    m_rulerAction = menu->addAction(QStringLiteral("Hiện thước"));
    m_rulerAction->setCheckable(true);
    connect(m_rulerAction, &QAction::toggled, this, &MainWindow::toggleRuler);

    m_rulerAuto = menu->addAction(QStringLiteral("Tự hiện khi vào trận"));
    m_rulerAuto->setCheckable(true);
    m_rulerAuto->setChecked(true);
}

void MainWindow::buildGraphicsMenu()
{
    QSettings cfg;
    QMenu *menu = menuBar()->addMenu(QStringLiteral("Đồ họa"));

    // Ba mức chất lượng của chính Flash. Thấp bỏ khử răng cưa và lọc ảnh, đổi
    // lại chạy mượt hơn hẳn trên máy yếu.
    auto *group = new QActionGroup(this);
    group->setExclusive(true);
    const QString current = cfg.value(QStringLiteral("render/quality"),
                                      QStringLiteral("high")).toString();

    struct Level { const char *text; const char *value; };
    static const Level levels[] = {
        {"Cao", "high"},
        {"Vừa", "medium"},
        {"Thấp", "low"},
    };
    for (const Level &lv : levels) {
        QAction *a = menu->addAction(QString::fromUtf8(lv.text));
        a->setCheckable(true);
        const QString value = QString::fromLatin1(lv.value);
        a->setChecked(value == current);
        group->addAction(a);
        connect(a, &QAction::triggered, this, [this, value] {
            QSettings().setValue(QStringLiteral("render/quality"), value);
            m_view->setRenderOptions(value, scaleValue());
            m_bridge->queueCommand(QStringLiteral("q:") + value);
            showStatus(QStringLiteral("Đồ họa: %1").arg(value), 3000);
        });
    }

    menu->addSeparator();
    QAction *fit = menu->addAction(QStringLiteral("Vừa khung hình (Show All)"));
    fit->setCheckable(true);
    fit->setChecked(cfg.value(QStringLiteral("render/showAll"), false).toBool());
    connect(fit, &QAction::toggled, this, [this](bool on) {
        QSettings().setValue(QStringLiteral("render/showAll"), on);
        m_view->setRenderOptions(qualityValue(), scaleValue());
        m_bridge->queueCommand(QStringLiteral("s:") + scaleValue());
        showStatus(on ? QStringLiteral("Vừa khung hình: bật")
                      : QStringLiteral("Vừa khung hình: tắt"), 3000);
    });

    buildFlashMenu(menu);
}

void MainWindow::buildFlashMenu(QMenu *parent)
{
    // Mỗi bản Flash để trong một thư mục con của plugins/ (plugins/11,
    // plugins/32...). Đường dẫn plugin phải đặt trước khi QtWebKit dò plugin, tức
    // trước khi cửa sổ này tồn tại — nên đổi bản là phải mở lại chương trình.
    QMenu *menu = parent->addMenu(QStringLiteral("Phiên bản Flash"));
    const QDir dir(QDir(QCoreApplication::applicationDirPath())
                       .filePath(QStringLiteral("plugins")));
    const QString current = QSettings().value(QStringLiteral("flash/build")).toString();

    auto *group = new QActionGroup(this);
    group->setExclusive(true);

    auto addChoice = [&](const QString &text, const QString &value) {
        QAction *a = menu->addAction(text);
        a->setCheckable(true);
        a->setChecked(value == current);
        group->addAction(a);
        connect(a, &QAction::triggered, this, [this, value] {
            QSettings().setValue(QStringLiteral("flash/build"), value);
            showStatus(QStringLiteral("Đã chọn Flash: %1 — mở lại chương trình để dùng")
                           .arg(value.isEmpty() ? QStringLiteral("mặc định") : value),
                       8000);
        });
    };

    addChoice(QStringLiteral("Mặc định (plugins/)"), QString());
    for (const QString &sub : dir.entryList(QDir::Dirs | QDir::NoDotAndDotDot, QDir::Name)) {
        addChoice(sub, sub);
    }
}

QString MainWindow::qualityValue()
{
    return QSettings().value(QStringLiteral("render/quality"),
                             QStringLiteral("high")).toString();
}

QString MainWindow::scaleValue()
{
    // Tên đúng của StageScaleMode; dùng luôn cho tham số scale của thẻ embed, Flash
    // nhận cả hai chỗ với cùng chuỗi này.
    return QSettings().value(QStringLiteral("render/showAll"), false).toBool()
               ? QStringLiteral("showAll")
               : QStringLiteral("noScale");
}

void MainWindow::applyRenderOptions()
{
    m_view->setRenderOptions(qualityValue(), scaleValue());
}

void MainWindow::onGameState(const QString &state)
{
    // Tên trạng thái lấy từ ddt.manager.StateManager; bản vá Loading.swf đọc
    // currentStateType mỗi 250ms và chỉ báo ra khi đổi.
    //
    // Chỉ liệt kê các trận có ngắm bắn. Trận kiểu khác (đua, thời trang...) để
    // ngoài, thêm sau nếu cần.
    static const QSet<QString> battle{
        QStringLiteral("fighting"),
        QStringLiteral("fighting3d"),
        QStringLiteral("campBattleScene"),
        QStringLiteral("consortiaBattleScene"),
        QStringLiteral("dungeon"),
        QStringLiteral("plotdungeon"),
    };

    if (!m_rulerAuto || !m_rulerAuto->isChecked()) {
        return;
    }
    // Đặt qua ô đánh dấu để menu và thước không nói hai chuyện khác nhau.
    m_rulerAction->setChecked(battle.contains(state));
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

    if (actionId == QLatin1String("use-pet")) {
        // Phụ kiện thú là mảnh sưu tập thú cưỡi: CategoryID 11 kèm Property1
        // 82, kích hoạt bằng sendActiveHorsePicCherish(Place) — một gói cho
        // mỗi ô, không có số lượng.
        m_bridge->queueCommand(QStringLiteral("p:"));
        showStatus(QStringLiteral("Đang dùng phụ kiện thú…"), 8000);
        return;
    }

    if (actionId == QLatin1String("open-batch")) {
        // Đúng bằng "Nhiều" > MAX > Đồng ý trong game, lặp cho từng chồng hộp.
        // Điều kiện lấy thẳng từ EquipType.isOpenBatch/isCanBatchHandler — hai
        // vị từ CellMenu dùng để quyết định có hiện nút "Nhiều" hay không.
        m_bridge->queueCommand(QStringLiteral("x:"));
        showStatus(QStringLiteral("Đang mở nhanh…"), 8000);
        return;
    }

    if (actionId == QLatin1String("open-slot")) {
        // Mở đúng một ô để thử từng loại. Cả túi đạo cụ đều là CategoryID 11 và
        // BagView chỉ rẽ hai nhánh cho nhóm đó, nhưng nhóm ấy còn có cả vật
        // liệu — chưa rõ cờ nào cho phép mở, nên chưa quét cả túi.
        bool ok = false;
        // Đánh số 1–49 cho khớp với 7x7 ô người chơi nhìn thấy; bên trong game
        // đếm từ 0.
        const int slot = QInputDialog::getInt(
            this, QStringLiteral("Mở ô túi"),
            QStringLiteral("Ô số (1–49), xem \"Liệt kê túi\" để biết ô nào là gì:"),
            1, 1, 49, 1, &ok);
        if (ok) {
            m_bridge->queueCommand(QStringLiteral("o:%1").arg(slot - 1));
        }
        return;
    }

    if (actionId == QLatin1String("list-bag")) {
        // Ghi từng ô túi ra %TEMP%\gunny-flash.log. Cần trước khi tự động mở
        // hộp: phân loại phải dựa trên dữ liệu thật, mở nhầm là mất đồ.
        m_bridge->queueCommand(QStringLiteral("l:"));
        showStatus(QStringLiteral("Đang liệt kê túi…"), 4000);
        return;
    }

    if (actionId == QLatin1String("clean-mail")) {
        // Nhận hết đính kèm rồi tự chuyển sang xếp túi. Không thể nhận thẳng
        // vào két: gói 113 không có trường đích, server luôn trả về túi.
        m_bridge->queueCommand(QStringLiteral("m:"));
        showStatus(QStringLiteral("Đang dọn thư…"), 8000);
        return;
    }

    if (actionId == QLatin1String("clean-bag")) {
        // Một lệnh, bản vá tự chạy lần lượt cả 5 két: giao thức chỉ nhận một
        // két mỗi gói (sendOneStepBagToBank), và phải giãn ra cho server trả
        // lời xong thì mô hình túi mới đúng cho két kế tiếp.
        m_bridge->queueCommand(QStringLiteral("b:"));
        showStatus(QStringLiteral("Đang xếp túi vào các két…"), 6000);
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

    // Dọn túi, dọn thư, xóa cache chưa nối. Cách làm giống hệt "Mở kho ma
    // pháp": thêm một lệnh vào hàng đợi và cho bản vá SWF gọi hàm tương ứng
    // trong AS3 (xem patch-loading-swf.py).
    showStatus(
        QStringLiteral("Chưa nối hành động: %1").arg(actionId), 4000);
}
