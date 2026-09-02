#pragma once

#include <QMainWindow>
#include <QString>

class GameWebView;
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

private:
    void buildMenuBar();

    GameWebView *m_view = nullptr;
    RefererNetworkManager *m_network = nullptr;
    ToolBridge *m_bridge = nullptr;
    QString m_swfUrl;
    int m_stageWidth;
    int m_stageHeight;
};
