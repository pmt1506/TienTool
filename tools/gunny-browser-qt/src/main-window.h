#pragma once

#include "sign-activity-gifts.h"
#include "trajectory-solver.h"

#include <QAction>
#include <QPointF>
#include <QTimer>
#include <QMainWindow>
#include <QString>

class GameWebView;
class OverlayWindow;
class WarehouseSearchDialog;
class RefererNetworkManager;
class ToolBridge;

// Cửa sổ chính: thanh menu tiện ích (như LazyGunny) + khung game bên dưới.
class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(const QString &swfUrl,
               const QString &referer,
               int stageWidth,
               int stageHeight,
               QWidget *parent = nullptr);

private slots:
    void onToolAction(const QString &actionId);
    // Đặt hệ số tốc độ, cập nhật dấu tích trên menu và thanh trạng thái.
    void applySpeed(double multiplier);

private:
    // Báo trạng thái lên tiêu đề cửa sổ rồi tự trả lại tên cũ. Thay cho thanh
    // trạng thái: thanh đó chiếm một dải trắng dưới đáy, mà khung game thì cao
    // cố định nên dải đó chỉ tổ làm cửa sổ lệch khỏi kích thước sân khấu.
    void showStatus(const QString &text, int msec);

    void buildMenuBar();
    // Ghi một dòng vào %TEMP%\gunny-flash.log VÀ ra stdout. Stdout để tiến
    // trình cha (TienTool) gom vào cùng bảng log với thao tác trên giao diện.
    void logEvent(const QString &line);
    void buildSpeedMenu();
    // Menu "Cheat Level": theo server, hoặc chọn một mức 1..70.
    void buildLevelMenu();
    // Gửi level xuống bản vá SWF và lưu lại lựa chọn. 0 = thôi ép, để
    // nguyên level thật server gửi.
    void applyLevel(int level);
    // Dat lai ve “level thật” sau mỗi lần nạp game.
    void resetLevelMenu();
    // Menu "Thời gian lượt": Bình thường / 15 giây.
    void buildTurnTimeMenu();
    // Menu "Tàng hình": gỡ cờ ẩn để thấy người dùng đồ tàng hình.
    void buildStealthMenu();
    void applyShowHidden(bool on);
    // Menu "Đường đạn": bật/tắt vẽ quỹ đạo.
    void buildAimMenu();
    // Bật/tắt: báo cho bản vá biết có cần gửi dữ liệu ngắm không, và xoá đường
    // đang vẽ khi tắt.
    void applyAim(bool on);
    // Đọc một dòng "aim ...", mô phỏng rồi đẩy sang overlay.
    void onAimData(const QString &line);
    // Phím bấm trong game, do bản vá bắt ở sân khấu Flash rồi báo ra.
    void onGameKey(int keyCode);
    // Cuộn chuột trong game: tăng giảm lực của đường đang vẽ.
    void onGameWheel(int delta);
    // Xoá đường vẽ khi hết lượt mình.
    void clearAim();
    // Gửi số giây xuống bản vá SWF và lưu lại lựa chọn. 0 = để nguyên giá trị
    // server gửi mỗi lượt.
    void applyTurnTime(int seconds);
    static int turnTimeValue();
    void buildOverlayMenu();
    // Bật/tắt thước đo (một thanh ngang, một thanh dọc, có vạch chia).
    void toggleRuler(bool on);
    // Bật/tắt thước theo trạng thái game do bản vá SWF báo ra.
    void onGameState(const QString &state);
    void buildMagicAction();
    void setupSignClaim();
    void claimSignGifts();
    void onSignGiftsLoaded(const QString &error);
    void onSignStatus(const QString &line);
    void onDressScan(const QString &line);
    QString signClaimKey() const;
    bool signClaimedToday() const;
    void markSignClaimedToday();
    void buildGraphicsMenu();
    void buildFlashMenu(QMenu *parent);
    // Chọn wmode của thẻ embed; đổi xong phải nạp lại game.
    void addWindowModeMenu(QMenu *menu);
    static QString windowModeValue();
    // Đọc lựa chọn đã lưu và chuyển cho khung xem, dùng cho lần nạp đầu tiên.
    // Đổi lúc đang chạy thì gửi lệnh vào Flash, không nạp lại trang.
    void applyRenderOptions();
    static QString qualityValue();
    static QString scaleValue();
    // Bật/tắt ghi gói tin ra tệp hex để phân tích ngoại tuyến.
    // Flash nạp trễ sau khi trang render -> dò module rồi mới vá được IAT.
    void tryHookSpeed();

    GameWebView *m_view = nullptr;
    RefererNetworkManager *m_network = nullptr;
    ToolBridge *m_bridge = nullptr;
    QString m_swfUrl;
    int m_stageWidth;
    int m_stageHeight;

    QAction *m_speedNormal = nullptr;
    QAction *m_speedTurbo = nullptr;
    QAction *m_speedCustom = nullptr;

    QAction *m_levelOff = nullptr;
    QAction *m_levelPick = nullptr;
    // 0 = không ép. Chỉ sống trong một lần nạp game.
    int m_level = 0;
    OverlayWindow *m_overlay = nullptr;
    QAction *m_rulerAction = nullptr;
    QAction *m_rulerAuto = nullptr;
    bool m_scaleSent = false;
    QAction *m_aimAction = nullptr;
    // Trạng thái ngắm mới nhất, để lúc bấm Tab còn có cái mà giải.
    AimState m_lastAim;
    // Dòng thô gần nhất, để bấm Tab là soi được bản vá gửi gì.
    QString m_lastAimLine;
    // Dòng hỏng đã báo, để không ghi lại 25 lần mỗi giây.
    QString m_lastBadAimLine;
    // Thông báo chẩn đoán gần nhất, để không ghi lặp.
    QString m_lastAimNote;
    // Lực giải ra ở lần bấm Tab gần nhất; 0 = chưa bấm.
    double m_solvedPower = 0.0;
    // Đích của lần bấm Tab gần nhất, để cắt cung đúng chỗ.
    QPointF m_solvedTarget;
    bool m_solvedTargetValid = false;
    // Khoảng cách hụt của lần giải gần nhất, quyết định màu đường vẽ.
    double m_solvedMiss = 0.0;
    QAction *m_spreadAction = nullptr;
    QAction *m_stealthAction = nullptr;
    QTimer *m_aimIdle = nullptr;
    // Chỉ tự nhận quà một lần mỗi phiên: vào lại sảnh sau mỗi trận đấu thì
    // trạng thái "main" lặp lại liên tục.
    bool m_signClaimed = false;
    // Đã tới sảnh nhưng bảng quà chưa tải xong.
    bool m_signPending = false;
    signactivity::Loader *m_signLoader = nullptr;
    // giftbagOrder -> statusValue; rỗng là game chưa có dữ liệu hoạt động.
    QHash<int, int> m_signStatus;
    WarehouseSearchDialog *m_warehouse = nullptr;
};
