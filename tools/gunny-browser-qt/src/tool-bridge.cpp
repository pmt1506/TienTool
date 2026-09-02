#include "tool-bridge.h"

#include <QDebug>
#include <QVariant>
#include <QWebFrame>

ToolBridge::ToolBridge(QObject *parent) : QObject(parent) {}

void ToolBridge::setFrame(QWebFrame *frame)
{
    m_frame = frame;
}

QString ToolBridge::callFlash(const QString &callback, const QString &jsonArgs)
{
    if (!m_frame) {
        return {};
    }

    // Object Flash mang id "game" (xem resources/play.html). Bọc try/catch để
    // callback chưa được SWF đăng ký thì không làm vỡ luồng JS.
    const QString script = QStringLiteral(
        "(function(){try{var o=document.getElementById('game');"
        "return String(o.%1(%2));}catch(e){return 'ERR:'+e;}})()")
        .arg(callback, jsonArgs);

    return m_frame->evaluateJavaScript(script).toString();
}

void ToolBridge::log(const QString &message)
{
    qInfo().noquote() << "[flash]" << message;
    emit flashMessage(message);
}

QString ToolBridge::appVersion() const
{
    return QStringLiteral("gunny-browser-qt 0.1.0");
}
