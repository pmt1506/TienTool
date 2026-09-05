#include "main-window.h"

#include <cstdio>

#include <QActionGroup>
#include <QCoreApplication>
#include <QDateTime>
#include <QSet>
#include <QSettings>
#include <QInputDialog>
#include <QRectF>
#include <QUrl>
#include <QUrlQuery>
#include <QDir>
#include <QFile>
#include <QMenu>
#include <QMenuBar>
#include <QMessageBox>
#include <QPushButton>
#include <QStringList>
#include <QTimer>
#include <QWebPage>

#include "game-web-view.h"
#include "overlay-window.h"
#include "referer-network-manager.h"
#include "level-dialog.h"
#include "speed-dialog.h"
#include "card-shop-client.h"
#include "trajectory-solver.h"
#include "sign-activity-gifts.h"
#include "speed-hack.h"
#include "tool-bridge.h"
#include "warehouse-search-dialog.h"

// Bố cục menu theo LazyGunny; hành động thật nối vào onToolAction.
//
// Để ở phạm vi tệp vì dùng ở hai chỗ: dựng menu, và đổi mã hành động thành tên
// tiếng Việt khi ghi log — log mà chỉ có "clean-bag" thì đọc lại chẳng hiểu.
// Độ lệch góc giả định của hai tia phụ khi bật "3 tia". Chưa đo được từ game nên
// để một con số dễ nhìn; sửa khi có số thật từ một cú bắn toả.
static const double kSpreadDegrees = 2.5;

// Coi là trúng khi đường đạn đi qua trong khoảng này quanh tâm địch (đơn vị map,
// cỡ nửa thân nhân vật).
static const double kHitRadius = 40.0;

// Dòng "giảm VIP / thực trả" trong bảng xác nhận mua, viết giống chỗ giỏ hàng
// của webshop để hai bên đọc ra cùng một con số.
static QString vipLine(int reduction, double payable)
{
    return QStringLiteral("\nGiảm VIP: %1%\nThực trả: %2\n")
        .arg(reduction)
        .arg(qRound64(payable));
}

struct Entry { const char *menu; const char *id; const char *text; };
static const Entry kMenuEntries[] = {
    {"Giao diện", "toggle-overlay", "Hiện bảng cài đặt"},
    {"Giao diện", "reload", "Tải lại game"},
    {"Tiện ích", "list-bag", "Liệt kê túi đạo cụ (ra log)"},
    // Tạm thời, để dò số hiệu túi thời trang và tên trường chỉ số trước khi
    // viết chức năng bán. Gỡ ngay sau khi đã chốt được hai thứ đó.
    {"Tiện ích", "dump-bags", "Dò các túi (ra log)"},
    {"Tiện ích", "clean-bag", "Dọn túi"},
    {"Tiện ích", "clean-mail", "Dọn thư"},
    {"Tiện ích", "clear-cache", "Xóa cache"},
    {"Tiện ích", "open-batch", "Mở nhanh items"},
    {"Tiện ích", "use-pet", "Dùng nhanh phụ kiện thú & pet"},
    {"Tiện ích", "sell-dress", "Bán thời trang 5 chỉ số"},
    {"Tiện ích", "find-item", "Tìm vật phẩm trong kho"},
};

// Tên hiển thị của một hành động. Vài hành động nằm ngoài bảng menu (nút riêng
// trên thanh, hoặc gọi từ --auto-magic) nên có thêm nhánh dự phòng.
static QString actionLabel(const QString &id)
{
    for (const Entry &e : kMenuEntries) {
        if (id == QLatin1String(e.id)) {
            return QString::fromUtf8(e.text);
        }
    }
    if (id == QLatin1String("open-magic-store")) {
        return QStringLiteral("Kho ma pháp");
    }
    return id;
}

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
    buildLevelMenu();
    buildTurnTimeMenu();
    buildAimMenu();
    buildStealthMenu();
    buildCardMenu();
    buildOverlayMenu();
    buildMagicAction();
    setupSignClaim();
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
                // Cùng lý do: bản vá giữ con số rồi tự ép mỗi nhịp, nên chỉ cần
                // nói một lần cho mỗi lần nạp game.
                m_bridge->queueCommand(QStringLiteral("n:")
                                       + QString::number(turnTimeValue()));
                m_bridge->queueCommand(
                    QStringLiteral("d:")
                    + (m_aimAction && m_aimAction->isChecked() ? QStringLiteral("1")
                                                               : QStringLiteral("0")));
                m_bridge->queueCommand(
                    QStringLiteral("h:")
                    + (m_stealthAction && m_stealthAction->isChecked() ? QStringLiteral("1")
                                                                       : QStringLiteral("0")));
            }
        }
        if (m.startsWith(QLatin1String("trangthai"))) {
            onSignStatus(m);
        }
        if (m.startsWith(QLatin1String("ttdo"))) {
            onDressScan(m.mid(4).trimmed());
        }
        if (m.startsWith(QLatin1String("kho ")) && m_warehouse) {
            m_warehouse->addWarehouse(m);
        }
        // Hai dòng chẩn đoán của bản vá cũng mở đầu bằng "aim " nên phải bắt trước
        // bộ lọc dữ liệu bên dưới, không thì chúng bị nuốt mất.
        if (m.startsWith(QLatin1String("aim cmd")) || m.startsWith(QLatin1String("aim loi"))) {
            // Lỗi trong khối ngắm lặp lại 25 lần mỗi giây; chỉ ghi khi nội dung
            // đổi, không thì log ngập trong một thông báo duy nhất.
            if (m_lastAimNote != m) {
                m_lastAimNote = m;
                showStatus(m, 5000);
                logEvent(m);
            }
            return;
        }
        // Dữ liệu ngắm về 25 lần mỗi giây: xử lý rồi thoát ngay, đừng để nó chạy
        // xuống thanh tiêu đề và tệp log.
        if (m.startsWith(QLatin1String("aim "))) {
            onAimData(m);
            return;
        }
        // Phím bấm: xử lý rồi thoát. Không ghi log — người chơi còn gõ chat trong
        // game, ghi ra tệp là ghi lại cả câu chat.
        if (m.startsWith(QLatin1String("key "))) {
            onGameKey(m.mid(4).trimmed().toInt());
            return;
        }
        if (m.startsWith(QLatin1String("wheel "))) {
            onGameWheel(m.mid(6).trimmed().toInt());
            return;
        }
        if (m.startsWith(QLatin1String("pick "))) {
            onGamePick(m.mid(5));
            return;
        }
        // Dữ liệu thẻ về hàng trăm dòng một lượt: nhớ vào bộ nhớ rồi ghi log,
        // đừng để nó chạy qua thanh tiêu đề.
        if (m.startsWith(QLatin1String("sothe ")) || m.startsWith(QLatin1String("cothe "))
            || m.startsWith(QLatin1String("bothe "))) {
            onCardData(m);
            logEvent(m);
            return;
        }
        showStatus(m, 5000);
        logEvent(m);
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
        resetLevelMenu();
        // Nạp lại trang là SWF mới: slot tĩnh giữ tỉ lệ và thời gian lượt về 0,
        // nên phải cho phép gửi lại hai lệnh ấy, không thì lựa chọn của người
        // dùng mất im lặng sau mỗi lần bấm "Tải lại".
        m_scaleSent = false;
        showStatus(ok ? QStringLiteral("Đã nạp Flash")
                                    : QStringLiteral("Nạp trang thất bại"), 5000);
    });

    adjustSize();
    m_view->setWindowMode(windowModeValue());
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
    QHash<QString, QMenu *> menus;
    for (const Entry &e : kMenuEntries) {
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

// Điểm danh chạy hoàn toàn tự động, không có mục menu nào: mỗi ngày chỉ có
// một hai gói mở ra, bấm tay không thêm được gì mà lại phải nhớ.
void MainWindow::setupSignClaim()
{
    m_signLoader = new signactivity::Loader(this);
    connect(m_signLoader, &signactivity::Loader::finished, this,
            &MainWindow::onSignGiftsLoaded);
    // Chưa tải vội: bảng quà chỉ cần khi đã vào sảnh, mà lúc này game đang
    // kéo về vài chục MB tài nguyên. Xem onGameState.
}

void MainWindow::onSignGiftsLoaded(const QString &error)
{
    if (!error.isEmpty()) {
        logEvent(QStringLiteral("Bảng quà điểm danh: ") + error);
        return;
    }
    logEvent(QStringLiteral("Bảng quà điểm danh: %1 gói")
                 .arg(m_signLoader->gifts().size()));

    // Hỏi trạng thái trước rồi mới nhận: game biết gói nào đang sáng, gói nào
    // đã nhận hay chưa tới lượt. Trả lời về qua flashMessage.
    if (m_signPending) {
        m_bridge->queueCommand(signactivity::statusCommand(m_signLoader->activityId()));
    }
}

// Kết quả quét thời trang: "ttdo <ô>:<TemplateID> …". Hỏi trước khi bán —
// sendSellGoods là một chiều, không có đường lấy lại món đã bán.
void MainWindow::onDressScan(const QString &line)
{
    // "ttdo n=<số ô> chan=<số món hình tượng chặn>;;<ô>|<mã>|<tên>;;…"
    const QStringList parts = line.split(QStringLiteral(";;"));
    logEvent(QStringLiteral("Quét thời trang: %1, %2 món khớp")
                 .arg(parts.value(0).trimmed())
                 .arg(parts.size() - 1));
    if (parts.size() < 2) {
        showStatus(QStringLiteral("Không có thời trang 5 chỉ số nào"), 5000);
        return;
    }

    // Liệt kê tên món ngay trong hộp hỏi. Bán là một chiều nên người bấm phải
    // đọc được mình sắp bán cái gì, không chỉ là một con số.
    QStringList names;
    for (int i = 1; i < parts.size(); ++i) {
        const QStringList f = parts.at(i).split(QLatin1Char('|'));
        if (f.size() < 3) {
            continue;
        }
        names << (f.at(2).isEmpty() ? f.at(1) : f.at(2));
    }
    // Dài quá thì cắt: hộp thoại cao hơn màn hình sẽ mất luôn hai nút bấm.
    const int kShow = 20;
    QString list = QStringList(names.mid(0, kShow)).join(QLatin1Char('\n'));
    if (names.size() > kShow) {
        list += QStringLiteral("\n… và %1 món nữa").arg(names.size() - kShow);
    }

    QMessageBox box(this);
    box.setIcon(QMessageBox::Warning);
    box.setWindowTitle(QStringLiteral("Bán thời trang 5 chỉ số"));
    box.setText(QStringLiteral("Sẽ bán %1 món. Bán rồi không lấy lại được.")
                    .arg(names.size()));
    box.setInformativeText(list);
    box.setStandardButtons(QMessageBox::Yes | QMessageBox::Cancel);
    box.setDefaultButton(QMessageBox::Cancel);
    box.button(QMessageBox::Yes)->setText(QStringLiteral("Bán"));
    box.button(QMessageBox::Cancel)->setText(QStringLiteral("Thôi"));
    if (box.exec() != QMessageBox::Yes) {
        logEvent(QStringLiteral("Bán thời trang: đã huỷ"));
        return;
    }

    logEvent(QStringLiteral("Bán thời trang: %1 món").arg(names.size()));
    m_bridge->queueCommand(QStringLiteral("j:"));
    showStatus(QStringLiteral("Đang bán %1 món…").arg(names.size()), 6000);
}

// Khoá theo tài khoản và theo ngày. Trạng thái từ game không phải lúc nào cũng
// có (server chưa gửi gói khởi tạo thì mình gửi hết), nên thiếu cái khoá này
// thì mỗi lần vào lại game là một lượt gửi thừa hai chục gói.
QString MainWindow::signClaimKey() const
{
    const QString user =
        QUrlQuery(QUrl(m_swfUrl)).queryItemValue(QStringLiteral("user"));
    return QStringLiteral("sign/claimed/") + (user.isEmpty() ? QStringLiteral("?")
                                                             : user);
}

bool MainWindow::signClaimedToday() const
{
    return QSettings().value(signClaimKey()).toString()
           == QDate::currentDate().toString(Qt::ISODate);
}

void MainWindow::markSignClaimedToday()
{
    QSettings().setValue(signClaimKey(),
                         QDate::currentDate().toString(Qt::ISODate));
}

// Trả lời của lệnh hỏi trạng thái.
void MainWindow::onSignStatus(const QString &line)
{
    m_signStatus = signactivity::parseStatus(line);
    if (m_signPending) {
        m_signPending = false;
        claimSignGifts();
    }
}

// Gửi hết các gói quà. Không cần biết hôm nay là ngày thứ mấy hay đã nhận tới
// đâu: gói nào chưa tới lượt hoặc đã nhận rồi thì server tự từ chối.
void MainWindow::claimSignGifts()
{
    const QVector<signactivity::GiftBag> gifts = m_signLoader->gifts();
    if (gifts.isEmpty()) {
        return;
    }
    // Trạng thái rỗng nghĩa là game chưa nhận gói khởi tạo của hoạt động —
    // lúc đó gửi hết còn hơn không gửi gì, server tự từ chối gói không hợp lệ.
    const bool filter = !m_signStatus.isEmpty();
    int sent = 0;
    for (const signactivity::GiftBag &g : gifts) {
        if (filter
            && m_signStatus.value(g.order, 0) != signactivity::kStatusClaimable) {
            continue;
        }
        m_bridge->queueCommand(signactivity::claimCommand(m_signLoader->activityId(), g));
        ++sent;
    }
    // Ghi cờ cả khi không gửi gì: đã hỏi trạng thái và biết hôm nay không có
    // gì để nhận, lần vào sau khỏi hỏi lại.
    markSignClaimedToday();
    if (sent == 0) {
        logEvent(QStringLiteral("Điểm danh: không có gói nào đang nhận được"));
        return;
    }
    logEvent(filter ? QStringLiteral("Nhận quà điểm danh (%1 gói đang sáng)").arg(sent)
                    : QStringLiteral("Nhận quà điểm danh (%1 gói, chưa rõ trạng thái)")
                          .arg(sent));
    showStatus(QStringLiteral("Đang nhận quà điểm danh…"), 8000);
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

void MainWindow::buildLevelMenu()
{
    QMenu *menu = menuBar()->addMenu(QStringLiteral("Cheat Level"));

    // Hai muc loai tru nhau -> nhom lai de Qt tu quan dau tich.
    auto *group = new QActionGroup(this);
    group->setExclusive(true);

    const int saved = m_level;

    m_levelOff = menu->addAction(QStringLiteral("Bình thường (level thật)"));
    m_levelOff->setCheckable(true);
    m_levelOff->setChecked(saved == 0);
    group->addAction(m_levelOff);
    connect(m_levelOff, &QAction::triggered, this, [this] { applyLevel(0); });

    m_levelPick = menu->addAction(QStringLiteral("Chọn level…"));
    m_levelPick->setCheckable(true);
    m_levelPick->setChecked(saved != 0);
    group->addAction(m_levelPick);
    connect(m_levelPick, &QAction::triggered, this, [this] {
        LevelDialog dlg(m_level, this);
        if (dlg.exec() == QDialog::Accepted) {
            applyLevel(dlg.value());
        }
        // Nhom loai tru da doi dau tich ngay luc bam, truoc khi biet nguoi dung
        // co Huy hay khong. Dat lai theo gia tri thuc te de dau tich khong noi
        // doi.
        m_levelOff->setChecked(m_level == 0);
        m_levelPick->setChecked(m_level != 0);
    });
}

void MainWindow::resetLevelMenu()
{
    // Moi lan nap game, ban va SWF bat dau lai voi slot rong nen nhan vat dang o
    // level that. Dat lai dau tich cho khop, neu khong menu se noi la dang ep
    // trong khi khong ep gi ca.
    m_level = 0;
    if (m_levelOff) {
        m_levelOff->setChecked(true);
    }
    if (m_levelPick) {
        m_levelPick->setChecked(false);
    }
}

void MainWindow::applyLevel(int level)
{
    m_level = level;

    // Ban va chi nho con so roi tu ep moi nhip. Gui ca khi chua vao san: luc vao
    // la co san.
    m_bridge->queueCommand(QStringLiteral("c:") + QString::number(level));

    showStatus(level == 0 ? QStringLiteral("Level: theo server")
                          : QStringLiteral("Level: %1").arg(level),
               4000);
}

void MainWindow::buildTurnTimeMenu()
{
    QMenu *menu = menuBar()->addMenu(QStringLiteral("Thời gian lượt"));

    auto *group = new QActionGroup(this);
    group->setExclusive(true);

    const int saved = turnTimeValue();
    auto addMode = [&](const QString &text, int seconds) {
        QAction *a = menu->addAction(text);
        a->setCheckable(true);
        a->setChecked(saved == seconds);
        group->addAction(a);
        connect(a, &QAction::triggered, this, [this, seconds] { applyTurnTime(seconds); });
    };

    // 0 = tắt ghi đè: mỗi lượt server gửi số giây của phòng và bản vá không đụng
    // vào, đúng như game gốc.
    // Chỉ hai mức, bật hoặc tắt. Đặt cao hơn 15 gần như không đổi gì trong thực
    // chiến: trần thật là của server (đo được ~22 giây, tính cả lúc giữ space),
    // mà nạp đầy thanh lực ngốn 8,3 giây, nên dù mốc là bao nhiêu thì cũng phải
    // bắt đầu giữ space quanh giây thứ 13. Thêm mốc chỉ tổ phải cân nhắc.
    addMode(QStringLiteral("Bình thường (theo server)"), 0);
    addMode(QStringLiteral("15 giây"), 15);
}

int MainWindow::turnTimeValue()
{
    // Kẹp về 0 khi giá trị lưu lạc mốc: sửa tay registry hoặc đổi mốc ở bản sau
    // sẽ để menu không mục nào được tích mà vẫn âm thầm ép số cũ.
    const int saved = QSettings().value(QStringLiteral("battle/turnTime"), 0).toInt();
    if (saved == 22 || saved == 30) {
        return 15;  // mốc của các bản trước, dồn về mốc còn lại thay vì tắt lặng lẽ
    }
    return saved == 15 ? 15 : 0;
}

void MainWindow::applyTurnTime(int seconds)
{
    QSettings().setValue(QStringLiteral("battle/turnTime"), seconds);

    // Bản vá SWF chỉ nhớ con số rồi ép vào người chơi ở nhịp 40ms của nó. Gửi
    // ngay cả khi chưa vào trận: lúc vào trận là có sẵn.
    m_bridge->queueCommand(QStringLiteral("n:") + QString::number(seconds));

    showStatus(seconds == 0
                   ? QStringLiteral("Thời gian lượt: theo server")
                   : QStringLiteral("Thời gian lượt: %1 giây").arg(seconds),
               4000);
}

void MainWindow::addWindowModeMenu(QMenu *menu)
{
    QMenu *sub = menu->addMenu(QStringLiteral("Chế độ vẽ Flash"));
    auto *group = new QActionGroup(this);
    group->setExclusive(true);

    const QString current = windowModeValue();
    struct Mode { const char *text; const char *value; };
    static const Mode modes[] = {
        {"direct (GPU, mặc định)", "direct"},
        {"window (Flash cửa sổ riêng)", "window"},
    };
    for (const Mode &m : modes) {
        QAction *a = sub->addAction(QString::fromUtf8(m.text));
        a->setCheckable(true);
        const QString value = QString::fromLatin1(m.value);
        a->setChecked(value == current);
        group->addAction(a);
        connect(a, &QAction::triggered, this, [this, value] {
            QSettings().setValue(QStringLiteral("render/wmode"), value);
            m_view->setWindowMode(value);
            // Flash chỉ đọc wmode lúc dựng plugin nên phải nạp lại trang.
            m_scaleSent = false;
            m_view->loadGame(m_swfUrl, m_stageWidth, m_stageHeight);
            showStatus(QStringLiteral("Chế độ vẽ: %1 — đang nạp lại game").arg(value), 5000);
        });
    }
}

void MainWindow::claimSignInDay()
{
    // Chạy tự động sau khi vào sảnh, không có nút nào để bấm.
    //
    // Hai bước: hỏi trạng thái (gói 632/1) rồi mới đọc được currentID/lastDate mà
    // server trả về; bản vá tự tính ngày cần nhận nên không phải rải 1..28.
    m_bridge->queueCommand(QStringLiteral("z:"));
    showStatus(QStringLiteral("Đang hỏi trạng thái điểm danh…"), 3000);
    QTimer::singleShot(2000, this, [this] { m_bridge->queueCommand(QStringLiteral("u:0")); });
}

void MainWindow::setWebshopAccount(const QString &token, int userId, int serverId)
{
    m_webToken = token;
    m_webUserId = userId;
    m_webServerId = serverId;
    if (m_shop) {
        m_shop->setAccount(token, userId, serverId);
    }
}

void MainWindow::buildCardMenu()
{
    m_shop = new CardShopClient(this);
    m_shop->setAccount(m_webToken, m_webUserId, m_webServerId);
    connect(m_shop, &CardShopClient::failed, this, [this](const QString &msg) {
        showStatus(msg, 6000);
        logEvent(QStringLiteral("The bai: ") + msg);
    });
    connect(m_shop, &CardShopClient::bought, this, [this](bool ok, const QString &msg) {
        const QString line = (ok ? QStringLiteral("Mua the xong: ")
                                 : QStringLiteral("Mua the hong: ")) + msg;
        showStatus(line, 8000);
        logEvent(line);
    });

    QMenu *menu = menuBar()->addMenu(QStringLiteral("Thẻ bài"));

    QAction *dump = menu->addAction(QStringLiteral("Đọc thẻ trong game (mở bảng thẻ trước)"));
    connect(dump, &QAction::triggered, this, [this] {
        m_cardProfile.clear();
        m_bridge->queueCommand(QStringLiteral("C:"));
        showStatus(QStringLiteral("Đang đọc dữ liệu thẻ…"), 5000);
    });

    menu->addSeparator();

    QAction *gold = menu->addAction(QStringLiteral("Mua full thẻ Vàng (999 hộp/loại)"));
    connect(gold, &QAction::triggered, this, [this] {
        // Vàng là bậc 1, tức chỉ cần SỞ HỮU thẻ; thẻ đã có thì nút này không đụng.
        buyCardBoxes(1, 999, QStringLiteral("full Vàng"));
    });

    QAction *plat = menu->addAction(QStringLiteral("Mua full Bạch Kim (4995 hộp/loại)"));
    connect(plat, &QAction::triggered, this, [this] {
        buyCardBoxes(4, 4995, QStringLiteral("full Bạch Kim"));
    });
}

void MainWindow::onCardData(const QString &line)
{
    const int sep = line.indexOf(QLatin1Char(' '));
    const QStringList f = line.mid(sep + 1).split(QLatin1Char('|'));
    if (f.size() < 3) {
        return;
    }
    const int id = f.at(0).toInt();
    if (id <= 0) {
        return;
    }

    if (line.startsWith(QLatin1String("sothe "))) {
        m_cardName.insert(id, f.at(1).trimmed());
    } else if (line.startsWith(QLatin1String("cothe "))) {
        m_cardName.insert(id, f.at(1).trimmed());
        m_cardProfile.insert(id, f.at(2).toInt());
    }
}

void MainWindow::buyCardBoxes(int targetProfile, int count, const QString &what)
{
    if (!m_shop || !m_shop->ready()) {
        showStatus(QStringLiteral("Chưa có token webshop — mở game từ TienTool."), 6000);
        return;
    }
    if (m_cardName.isEmpty()) {
        showStatus(QStringLiteral("Chưa có dữ liệu thẻ — bấm \"Đọc thẻ trong game\" trước."), 6000);
        return;
    }
    // Có sổ thẻ mà không có thẻ đang sở hữu nghĩa là chưa mở bảng thẻ trong game.
    // Chạy tiếp thì mọi thẻ trông như "chưa có" và mua thừa cả loạt.
    if (m_cardProfile.isEmpty()) {
        showStatus(QStringLiteral("Chưa đọc được thẻ đang có — mở bảng thẻ trong game rồi đọc lại."),
                   8000);
        return;
    }

    // Tên thẻ cần nâng, chuẩn hoá sẵn để so với tên hộp.
    QHash<QString, QString> wanted;
    for (auto it = m_cardName.constBegin(); it != m_cardName.constEnd(); ++it) {
        if (m_cardProfile.value(it.key(), 0) < targetProfile) {
            wanted.insert(normalizeCardName(it.value()), it.value());
        }
    }
    if (wanted.isEmpty()) {
        showStatus(QStringLiteral("Không có thẻ nào dưới mức yêu cầu."), 5000);
        return;
    }

    // Hỏi số dư trước, rồi mới tới danh sách hộp: có cả hai mới nói được "đủ tiền
    // hay không" ngay trong bảng xác nhận, thay vì để server từ chối giữa chừng
    // sau khi đã trừ mất một phần.
    disconnect(m_shop, &CardShopClient::balanceReady, this, nullptr);
    connect(m_shop, &CardShopClient::balanceReady, this,
            [this, wanted, count, what](qint64 cash, qint64 cashFree, int vipReduction) {
                m_shopCash = cash;
                m_shopCashFree = cashFree;
                m_shopVipReduction = vipReduction;
                m_shop->fetchCardBoxes();
            });

    // Chờ danh sách hộp rồi mới chốt đơn: giá gửi lên phải là giá server niêm yết.
    disconnect(m_shop, &CardShopClient::boxesReady, this, nullptr);
    connect(m_shop, &CardShopClient::boxesReady, this,
            [this, wanted, count, what](const QList<ShopItem> &boxes) {
                QList<QPair<ShopItem, int>> order;
                long long total = 0;
                for (const ShopItem &box : boxes) {
                    if (wanted.contains(normalizeCardName(box.cardName()))) {
                        order.append(qMakePair(box, count));
                        total += (long long)box.price * count;
                    }
                }
                if (order.isEmpty()) {
                    showStatus(QStringLiteral("Không thẻ nào cần nâng có hộp trên shop."), 6000);
                    return;
                }

                const int noBox = wanted.size() - order.size();
                QString msg = QStringLiteral("Mua %1:\n\n%2 loại hộp x %3 = %4 hộp\nTổng tiền: %5\n")
                                  .arg(what)
                                  .arg(order.size())
                                  .arg(count)
                                  .arg((long long)order.size() * count)
                                  .arg(total);
                if (noBox > 0) {
                    msg += QStringLiteral("\n%1 thẻ cần nâng KHÔNG có hộp trên shop, bỏ qua.\n")
                               .arg(noBox);
                }
                // Gio hang web tinh tien that theo VipReduction (phan tram) chu
                // khong theo tong gia niem yet - bam dung cong thuc cua ho de con
                // so o day khop voi luc bam mua tren web.
                const qint64 have = m_shopCash + m_shopCashFree;
                const double payable = (double)total * (100 - m_shopVipReduction) / 100.0;
                msg += vipLine(m_shopVipReduction, payable);
                msg += QStringLiteral("\nCoin: %1 + Coin tặng: %2 = %3\n")
                           .arg(m_shopCash)
                           .arg(m_shopCashFree)
                           .arg(have);

                // Không đủ thì chặn hẳn chứ không chỉ nhắc: gửi đơn quá tiền,
                // server rất có thể trừ được bao nhiêu thì mua bấy nhiêu rồi
                // dừng, để lại một mớ nửa vời không biết đã mua tới đâu.
                if (payable > (double)have) {
                    QMessageBox::warning(
                        this, QStringLiteral("Không đủ coin"),
                        QStringLiteral("Cần %1 nhưng chỉ có %2 (thiếu %3).\n\n"
                                       "Giảm số lượng mỗi loại rồi thử lại.")
                            .arg(qRound64(payable))
                            .arg(have)
                            .arg(qRound64(payable) - have));
                    return;
                }

                msg += QStringLiteral("\nMua là không hoàn lại. Tiếp tục?");

                if (QMessageBox::question(this, QStringLiteral("Xác nhận mua"), msg,
                                          QMessageBox::Yes | QMessageBox::No)
                    != QMessageBox::Yes) {
                    return;
                }
                logEvent(QStringLiteral("The bai: gui lenh mua %1 loai, %2 hop moi loai")
                             .arg(order.size())
                             .arg(count));
                m_shop->buy(order);
            });

    m_shop->fetchBalance();
}

void MainWindow::buildStealthMenu()
{
    QMenu *menu = menuBar()->addMenu(QStringLiteral("Tàng hình"));
    m_stealthAction = menu->addAction(QStringLiteral("Hiện người đang tàng hình"));
    m_stealthAction->setCheckable(true);
    m_stealthAction->setChecked(
        QSettings().value(QStringLiteral("battle/showHidden"), false).toBool());
    connect(m_stealthAction, &QAction::toggled, this, &MainWindow::applyShowHidden);
}

void MainWindow::applyShowHidden(bool on)
{
    QSettings().setValue(QStringLiteral("battle/showHidden"), on);
    m_bridge->queueCommand(on ? QStringLiteral("h:1") : QStringLiteral("h:0"));
    showStatus(on ? QStringLiteral("Tàng hình: hiện tất cả")
                  : QStringLiteral("Tàng hình: để nguyên như game"),
               3000);
}

void MainWindow::buildAimMenu()
{
    trajectory::velocityScale =
        QSettings().value(QStringLiteral("battle/velocityScale"), 1.0).toDouble();

    // Ngừng nhận dữ liệu ngắm quá 400ms là đã sang lượt người khác: xoá đường vẽ.
    m_aimIdle = new QTimer(this);
    m_aimIdle->setSingleShot(true);
    m_aimIdle->setInterval(400);
    connect(m_aimIdle, &QTimer::timeout, this, &MainWindow::clearAim);

    QMenu *menu = menuBar()->addMenu(QStringLiteral("Đường đạn"));
    m_aimAction = menu->addAction(QStringLiteral("Vẽ quỹ đạo (lực tối đa)"));
    m_aimAction->setCheckable(true);
    m_aimAction->setChecked(QSettings().value(QStringLiteral("battle/aim"), false).toBool());
    connect(m_aimAction, &QAction::toggled, this, &MainWindow::applyAim);

    // Núm hiệu chỉnh: quan hệ lực -> vận tốc nằm ở server nên chỉ khớp được bằng
    // quan sát. Bắn xa hơn đường vẽ thì tăng, ngắn hơn thì giảm.
    QAction *calib = menu->addAction(QStringLiteral("Hiệu chỉnh lực…"));
    connect(calib, &QAction::triggered, this, [this] {
        bool ok = false;
        const double percent = QInputDialog::getDouble(
            this, QStringLiteral("Hiệu chỉnh đường đạn"),
            QStringLiteral("Đạn bay xa hơn đường vẽ thì tăng số này (%):"),
            trajectory::velocityScale * 100.0, 80.0, 130.0, 1, &ok);
        if (!ok) {
            return;
        }
        trajectory::velocityScale = percent / 100.0;
        QSettings().setValue(QStringLiteral("battle/velocityScale"), trajectory::velocityScale);
        showStatus(QStringLiteral("Hiệu chỉnh lực: %1%").arg(percent), 4000);
    });

    // Ghi vị trí từng viên đạn ra log để đo đường đạn thật: hệ số đổi lực -> vận tốc
    // và độ toả của buff bắn 3 tia đều nằm ở server, chỉ đo mới ra số đúng.
    m_spreadAction = menu->addAction(QStringLiteral("Xem 3 tia (buff bắn 3 nhánh)"));
    m_spreadAction->setCheckable(true);
    m_spreadAction->setChecked(QSettings().value(QStringLiteral("battle/aimSpread"), false).toBool());
    connect(m_spreadAction, &QAction::toggled, this, [](bool on) {
        QSettings().setValue(QStringLiteral("battle/aimSpread"), on);
    });

    QAction *bombLog = menu->addAction(QStringLiteral("Ghi log đạn thật (để đo)"));
    bombLog->setCheckable(true);
    connect(bombLog, &QAction::toggled, this, [this](bool on) {
        m_bridge->queueCommand(on ? QStringLiteral("e:1") : QStringLiteral("e:0"));
        showStatus(on ? QStringLiteral("Đang ghi log đạn — bắn một phát rồi tắt")
                      : QStringLiteral("Đã tắt ghi log đạn"),
                   4000);
    });
}

void MainWindow::applyAim(bool on)
{
    QSettings().setValue(QStringLiteral("battle/aim"), on);
    m_bridge->queueCommand(on ? QStringLiteral("d:1") : QStringLiteral("d:0"));
    if (!on) {
        m_solvedPower = 0.0;
        m_solvedTargetValid = false;
        if (m_overlay) {
            m_overlay->setTrajectory(QVector<QPointF>());
        }
    }
    showStatus(on ? QStringLiteral("Đường đạn: bật") : QStringLiteral("Đường đạn: tắt"), 3000);
}

void MainWindow::onAimData(const QString &line)
{
    if (!m_overlay || !m_aimAction || !m_aimAction->isChecked()) {
        return;
    }

    // Lưu trước khi parse: dòng hỏng mới là dòng cần nhìn, mà lưu sau thì đúng lúc
    // hỏng lại không có gì để xem.
    m_lastAimLine = line;
    // Bản vá ngừng gửi ngay khi hết lượt mình (isAttacking tắt). Không có đồng hồ
    // này thì đường vẽ đứng nguyên giữa màn hình suốt lượt của người khác.
    m_aimIdle->start();

    const AimState state = AimState::parse(line);
    if (!state.valid) {
        // Báo đúng một lần cho mỗi dòng hỏng khác nhau: 25 dòng mỗi giây, ghi hết
        // là ngập log.
        if (m_lastBadAimLine != line) {
            m_lastBadAimLine = line;
            logEvent(QStringLiteral("aim khong doc duoc: ") + line);
        }
        return;
    }
    m_lastAim = state;

    // Toạ độ map -> sân khấu -> widget. Sân khấu và widget thường bằng nhau
    // (setFixedSize theo đúng kích thước sân khấu) nhưng vẫn tính tỉ lệ: chế độ co
    // giãn showAll làm sân khấu khác cỡ khung.
    const double rx = m_stageWidth > 0 ? (double)m_view->width() / m_stageWidth : 1.0;
    const double ry = m_stageHeight > 0 ? (double)m_view->height() / m_stageHeight : 1.0;
    auto toScreen = [&](const QVector<QPointF> &mapPoints) {
        QVector<QPointF> screen;
        screen.reserve(mapPoints.size());
        for (const QPointF &p : mapPoints) {
            // Độ lệch so với nhân vật, quy về pixel màn hình rồi cộng vào điểm neo.
            screen.append(QPointF((state.anchorX + (p.x() - state.x) * state.scale) * rx,
                                  (state.anchorY + (p.y() - state.y) * state.scale) * ry));
        }
        return screen;
    };

    QVector<OverlayWindow::Line> lines;
    auto addLine = [&](const QVector<QPointF> &mapPoints, const QColor &color) {
        if (mapPoints.size() >= 2) {
            OverlayWindow::Line line;
            line.points = toScreen(mapPoints);
            line.color = color;
            lines.append(line);
        }
    };

    // Không cắt theo khung nhìn nữa: kéo bản đồ cho nhân vật ra ngoài lề là điểm
    // xuất phát đã nằm ngoài, cắt từ đó thì mất sạch tia. QPainter tự xén phần thừa,
    // còn độ dài đường thì vòng mô phỏng đã tự dừng khi đạn rơi khỏi bản đồ.

    // Buff "bắn 3 tia": server sinh đúng ba viên theo công thức dưới, chép từ
    // Game.Logic/Living.cs hàm ShootImp của mã nguồn máy chủ DDTank 4.1 —
    //   viên 1: lực x1.0, góc +0
    //   viên 2: lực x0.9, góc -5
    //   viên 3: lực x1.1, góc +5
    // (vx = force * hệ số * cos(góc + lệch), vy = tương tự với sin).
    struct Shot { double powerMul; double angleOffset; QColor color; };
    static const Shot kShots[3] = {
        {1.0, 0.0, QColor(90, 210, 255, 235)},
        {0.9, -5.0, QColor(255, 190, 60, 205)},
        {1.1, 5.0, QColor(255, 120, 200, 205)},
    };

    if (m_solvedPower > 0.0) {
        const int count = (m_spreadAction && m_spreadAction->isChecked()) ? 3 : 1;
        for (int i = 0; i < count; ++i) {
            AimState shot = state;
            shot.angleDeg = state.angleDeg + kShots[i].angleOffset;
            addLine(trajectory::simulate(shot, m_solvedPower * kShots[i].powerMul),
                    kShots[i].color);
        }
    }

    m_overlay->setTrajectories(lines);
}

void MainWindow::onGameKey(int keyCode)
{
    if (!m_aimAction || !m_aimAction->isChecked()) {
        return;
    }

    // V (86): bắn luôn bằng lực đang vẽ, khỏi giữ space. Bản vá gọi
    // sendShootAction — đúng đường mà chế độ uỷ thác của game vẫn dùng.
    if (keyCode == 86) {
        if (m_solvedPower <= 0.0) {
            showStatus(QStringLiteral("Chưa có lực nào để bắn — bấm Tab trước"), 3000);
            return;
        }
        m_bridge->queueCommand(QStringLiteral("f:") + QString::number(qRound(m_solvedPower)));
        showStatus(QStringLiteral("Đã bắn ở lực %1").arg(qRound(m_solvedPower)), 3000);
        return;
    }

    // Tab (9): giải lực để đường đạn đi qua mục tiêu, ở đúng góc hiện tại. Bấm lại
    // là tính lại — sau khi xoay nòng thì lực cũ không còn đúng.
    if (keyCode != 9) {
        return;
    }
    // Ghi dòng thô mỗi lần bấm Tab: đây là cách duy nhất nhìn được bản vá thực sự
    // gửi gì, vì dòng "aim" bị chặn trước khi vào log (25 dòng mỗi giây).
    logEvent(m_lastAimLine.isEmpty() ? QStringLiteral("Tab: chưa nhận được dòng aim nào")
                                     : QStringLiteral("Tab: ") + m_lastAimLine);

    QPointF target;
    if (!m_lastAim.valid || !m_lastAim.nearestFoe(&target)) {
        showStatus(QStringLiteral("Chưa thấy địch (%1 dòng, %2 địch) — xem log")
                       .arg(m_lastAim.valid ? QStringLiteral("có") : QStringLiteral("không"))
                       .arg(m_lastAim.foes.size()),
                   6000);
        return;
    }

    double missDistance = 0.0;
    m_solvedPower = trajectory::solvePower(m_lastAim, target, &missDistance);
    m_solvedTarget = target;
    m_solvedTargetValid = true;
    m_solvedMiss = missDistance;
    showStatus(missDistance <= kHitRadius
                   ? QStringLiteral("Lực cần: %1 (%2%)")
                         .arg(qRound(m_solvedPower))
                         .arg(qRound(m_solvedPower / trajectory::kMaxPower * 100))
                   // Góc quá cao hoặc quá thấp thì không lực nào qua được tâm địch.
                   // Vẫn vẽ đường tốt nhất, nhưng nói rõ còn hụt bao nhiêu.
                   : QStringLiteral("Lực %1 — góc này còn hụt ~%2, xoay nòng rồi bấm lại")
                         .arg(qRound(m_solvedPower))
                         .arg(qRound(missDistance)),
               6000);
}

void MainWindow::clearAim()
{
    m_solvedPower = 0.0;
    m_solvedTargetValid = false;
    if (m_overlay) {
        m_overlay->setTrajectory(QVector<QPointF>());
    }
}

void MainWindow::onGamePick(const QString &payload)
{
    // Shift + bấm chuột: ngắm vào đúng chỗ vừa bấm thay vì địch gần nhất. Bản vá
    // đã đổi sang toạ độ map giúp, nên ở đây chỉ việc giải lực.
    if (!m_aimAction || !m_aimAction->isChecked() || !m_lastAim.valid) {
        return;
    }

    const QStringList xy = payload.trimmed().split(QLatin1Char(' '), QString::SkipEmptyParts);
    if (xy.size() != 2) {
        return;
    }
    bool okx = false;
    bool oky = false;
    const QPointF target(xy.at(0).toDouble(&okx), xy.at(1).toDouble(&oky));
    if (!okx || !oky) {
        return;
    }

    double miss = 0.0;
    m_solvedPower = trajectory::solvePower(m_lastAim, target, &miss);
    m_solvedTarget = target;
    m_solvedTargetValid = true;
    m_solvedMiss = miss;
    showStatus(miss <= kHitRadius
                   ? QStringLiteral("Ngắm điểm đã chọn — lực %1 (%2%)")
                         .arg(qRound(m_solvedPower))
                         .arg(qRound(m_solvedPower / trajectory::kMaxPower * 100))
                   : QStringLiteral("Lực %1 — điểm này còn hụt ~%2, xoay nòng rồi bấm lại")
                         .arg(qRound(m_solvedPower))
                         .arg(qRound(miss)),
               6000);
}

void MainWindow::onGameWheel(int delta)
{
    // Cuộn để dò lực quanh mức Tab vừa tính. Một nấc = 25 đơn vị trên thang 2000,
    // đủ mịn để nhích mà không phải cuộn cả buổi.
    if (!m_aimAction || !m_aimAction->isChecked() || m_solvedPower <= 0.0) {
        return;
    }
    m_solvedPower = qBound(20.0, m_solvedPower + (delta > 0 ? 25.0 : -25.0),
                           trajectory::kMaxPower);
    showStatus(QStringLiteral("Lực: %1 (%2%)")
                   .arg(qRound(m_solvedPower))
                   .arg(qRound(m_solvedPower / trajectory::kMaxPower * 100)),
               2000);
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

    addWindowModeMenu(menu);
    buildFlashMenu(menu);
}

QString MainWindow::windowModeValue()
{
    // "direct" là mặc định của trang game thật; "window" cho Flash một cửa sổ
    // riêng của hệ điều hành, hết cảnh tranh giành focus với lớp vẽ đè nhưng mất
    // tăng tốc GPU cho Stage3D.
    return QSettings().value(QStringLiteral("render/wmode"), QStringLiteral("direct"))
                       .toString();
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

    // Vào tới sảnh thì nhận quà điểm danh. Chờ 5 giây: gửi ngay lúc trạng thái
    // đổi thì gói đi trước khi server dựng xong dữ liệu người chơi và bị bỏ qua
    // lặng lẽ.
    // Vào tới sảnh mới tải bảng quà rồi nhận. Chờ 5 giây: gửi ngay lúc trạng
    // thái đổi thì gói đi trước khi server dựng xong dữ liệu người chơi và bị
    // bỏ qua lặng lẽ; chỗ nghỉ đó cũng để game tải nốt tài nguyên sảnh.
    if (!m_signClaimed && state == QLatin1String("main")) {
        m_signClaimed = true;
        // Bảng "Điểm danh" là hệ riêng, server tự từ chối nếu hôm nay đã nhận, nên
        // cứ gửi mỗi lần vào sảnh — không dùng chung cờ với quà hoạt động.
        QTimer::singleShot(6000, this, [this] { claimSignInDay(); });

        if (signClaimedToday()) {
            logEvent(QStringLiteral("Điểm danh: hôm nay đã nhận rồi, bỏ qua"));
            return;
        }
        m_signPending = true;
        QTimer::singleShot(5000, this, [this] { m_signLoader->load(m_swfUrl); });
    }

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

void MainWindow::logEvent(const QString &line)
{
    const QString stamped =
        QDateTime::currentDateTime().toString(QStringLiteral("hh:mm:ss ")) + line;

    // Mở một lần rồi giữ: game có thể gọi ra hàng chục lần một giây, mở và
    // đóng tệp mỗi dòng thì phần I/O chặn ngay trên luồng giao diện.
    static QFile log(QDir(QDir::tempPath()).filePath(QStringLiteral("gunny-flash.log")));
    if (!log.isOpen()) {
        log.open(QIODevice::Append | QIODevice::Text);
    }
    if (log.isOpen()) {
        log.write(stamped.toUtf8());
        log.write("\n");
        log.flush();
    }

    // Tiến trình cha đọc stdout để gộp vào bảng log chung. Phải flush: stdout
    // khi bị chuyển hướng qua pipe là có đệm, không flush thì log chỉ hiện ra
    // lúc đóng game.
    fputs(stamped.toUtf8().constData(), stdout);
    fputc('\n', stdout);
    fflush(stdout);
}

void MainWindow::onToolAction(const QString &actionId)
{
    logEvent(QStringLiteral("Bấm: ") + actionLabel(actionId));
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

    if (actionId == QLatin1String("list-bag")) {
        // Ghi từng ô túi đạo cụ ra %TEMP%\gunny-flash.log. Cần trước khi tự
        // động mở hộp: phân loại phải dựa trên dữ liệu thật, mở nhầm là mất đồ.
        m_bridge->queueCommand(QStringLiteral("l:"));
        showStatus(QStringLiteral("Đang liệt kê túi…"), 4000);
        return;
    }

    if (actionId == QLatin1String("find-item")) {
        // Mở cửa sổ rỗng rồi hỏi từng kho: trả lời về qua flashMessage, cửa sổ
        // tự đổ thêm hàng vào bảng khi có.
        delete m_warehouse;
        m_warehouse = new WarehouseSearchDialog(m_bridge, this);
        m_warehouse->setAttribute(Qt::WA_DeleteOnClose, false);
        m_warehouse->show();
        for (int type : WarehouseSearchDialog::warehouseTypes()) {
            m_bridge->queueCommand(QStringLiteral("w:") + QString::number(type));
        }
        return;
    }

    if (actionId == QLatin1String("sell-dress")) {
        // Đếm trước, hỏi, rồi mới bán. Bán là không lấy lại được, nên không
        // bao giờ gửi gói ngay từ cú bấm.
        m_bridge->queueCommand(QStringLiteral("k:"));
        showStatus(QStringLiteral("Đang tìm thời trang 5 chỉ số…"), 4000);
        return;
    }

    if (actionId == QLatin1String("dump-bags")) {
        // Chỉ túi 0. Không có túi thời trang riêng: quét 0..12 chỉ thấy 0 và 1
        // có đồ, còn lại rỗng hoặc không tồn tại; PlayerDressManager cũng
        // không giữ túi nào. Tab "Thời Trang" là túi 0 lọc bằng
        // DressUtils.isDress — bản vá gọi thẳng vị từ đó của game.
        m_bridge->queueCommand(QStringLiteral("t:0"));
        showStatus(QStringLiteral("Đang dò các túi…"), 4000);
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
