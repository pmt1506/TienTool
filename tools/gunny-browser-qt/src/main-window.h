#pragma once

#include <QAction>
#include <QMainWindow>
#include <QString>

class GameWebView;
class OverlayWindow;
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
    void buildMenuBar();
    void buildSpeedMenu();
    void buildPacketMenu();
    void buildOverlayMenu();
    // Bật/tắt thước đo (một thanh ngang, một thanh dọc, có vạch chia).
    void toggleRuler(bool on);
    // Bật/tắt ghi gói tin ra tệp hex để phân tích ngoại tuyến.
    void togglePacketCapture(bool on);
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
    QAction *m_captureAction = nullptr;
    OverlayWindow *m_overlay = nullptr;
    QString m_capturePath;
};
