#pragma once

#include "sign-activity-gifts.h"

#include <QAction>
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
    OverlayWindow *m_overlay = nullptr;
    QAction *m_rulerAction = nullptr;
    QAction *m_rulerAuto = nullptr;
    bool m_scaleSent = false;
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
