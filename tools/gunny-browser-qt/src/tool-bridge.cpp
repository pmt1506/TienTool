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

void ToolBridge::queueCommand(const QString &command)
{
    if (!m_frame) {
        return;
    }
    QString escaped = command;
    escaped.replace(QLatin1Char('\\'), QLatin1String("\\\\"));
    escaped.replace(QLatin1Char('\''), QLatin1String("\\'"));
    // Đẩy vào hàng đợi: một lần quét tham số xếp cả trăm lệnh, ghi đè một ô
    // như trước thì chỉ lệnh cuối sống sót.
    m_frame->evaluateJavaScript(
        QStringLiteral("(window.__toolQueue=window.__toolQueue||[]).push('%1');")
            .arg(escaped));
}

QString ToolBridge::probeCallbacks()
{
    if (!m_frame) {
        return QStringLiteral("chưa có frame");
    }
    // typeof trên NPObject trả "function" cho callback đã đăng ký, "undefined"
    // cho tên không có. Không cần gọi thật nên không gây tác dụng phụ.
    // Gọi thật chứ không chỉ typeof: "Error calling method on NPObject" xuất
    // hiện cả khi callback tồn tại, nên phải so callback của ta với callback
    // GỐC của game để biết lỗi nằm ở bản vá hay ở cả chiều JS -> Flash.
    const QString script = QStringLiteral(
        "(function(){var o=document.getElementById('game');"
        "if(!o)return 'khong thay object';"
        "var r=[];"
        "function t(l,f){try{r.push(l+'='+String(f()));}catch(e){r.push(l+'!'+e);}}"
        "t('typeof toolMagic',function(){return typeof o.toolMagic;});"
        "t('toolMagic(1)',function(){return o.toolMagic(1);});"
        "t('toolMagic()',function(){return o.toolMagic();});"
        "t('SetFlashLoadExternal()',function(){return o.SetFlashLoadExternal();});"
        "return r.join(' | ');})()");
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
