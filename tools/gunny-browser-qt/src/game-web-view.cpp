#include "game-web-view.h"

#include <QContextMenuEvent>
#include <QFile>
#include <QMenu>
#include <QWebFrame>
#include <QWebPage>
#include <QWebSettings>

#include "local-page-server.h"
#include "tool-bridge.h"

GameWebView::GameWebView(ToolBridge *bridge, QWidget *parent)
    : QWebView(parent), m_bridge(bridge), m_pageServer(new LocalPageServer(this))
{
    QWebSettings *s = settings();
    s->setAttribute(QWebSettings::PluginsEnabled, true);          // bật NPAPI Flash
    s->setAttribute(QWebSettings::JavascriptEnabled, true);
    s->setAttribute(QWebSettings::LocalContentCanAccessRemoteUrls, true);
    s->setAttribute(QWebSettings::AcceleratedCompositingEnabled, true);
    s->setAttribute(QWebSettings::WebGLEnabled, true);

    // Nền đen giống trang game; tránh nháy trắng lúc Flash chưa dựng xong.
    QPalette pal = palette();
    pal.setBrush(QPalette::Base, Qt::black);
    setPalette(pal);

    // QWebView đặt sẵn Qt::WheelFocus, nghĩa là Qt tự trao focus cho widget khi
    // có cú lăn chuột. Flash chạy trong cửa sổ native con và KHÔNG xử lý
    // WM_MOUSEWHEEL, nên DefWindowProc đẩy thông điệp lên cửa sổ Qt cha; Qt thấy
    // vậy liền gọi SetFocus sang cửa sổ mình và cướp bàn phím khỏi Flash — lăn
    // một nấc là game hết nhận phím cho tới khi bấm chuột lại vào khung game.
    //
    // Bỏ đúng bit bánh xe, giữ nguyên tab và click, nên mọi cách lấy focus khác
    // vẫn như cũ. Chặn ở wheelEvent() không ăn thua: Qt trao focus trong lúc phân
    // phối sự kiện, trước khi widget kịp thấy nó.
    setFocusPolicy(Qt::StrongFocus);

    connect(page()->mainFrame(), &QWebFrame::javaScriptWindowObjectCleared,
            this, &GameWebView::reinstallBridge);
}

void GameWebView::setWindowMode(const QString &wmode)
{
    m_wmode = wmode;
}

void GameWebView::reinstallBridge()
{
    QWebFrame *frame = page()->mainFrame();
    m_bridge->setFrame(frame);
    frame->addToJavaScriptWindowObject(QStringLiteral("tool"), m_bridge);
}

void GameWebView::loadGame(const QString &swfUrl, int stageWidth, int stageHeight)
{
    QFile tpl(QStringLiteral(":/play.html"));
    if (!tpl.open(QIODevice::ReadOnly | QIODevice::Text)) {
        setHtml(QStringLiteral("<h3>Thiếu resource play.html</h3>"));
        return;
    }
    QString html = QString::fromUtf8(tpl.readAll());
    html.replace(QStringLiteral("__SWF_URL__"), swfUrl.toHtmlEscaped());
    html.replace(QStringLiteral("__WIDTH__"), QString::number(stageWidth));
    html.replace(QStringLiteral("__HEIGHT__"), QString::number(stageHeight));
    html.replace(QStringLiteral("__QUALITY__"), m_quality);
    html.replace(QStringLiteral("__SCALE__"), m_scale);
    html.replace(QStringLiteral("__WMODE__"), m_wmode);

    // Phải phục vụ qua HTTP thật, không dùng setHtml(): document do setHtml
    // tạo ra không có URL nên Flash thấy origin rỗng và tự abort
    // (STATUS_BREAKPOINT). GunnyClient gốc cũng chạy HTTP server local vì vậy.
    const QString url = m_pageServer->start(html.toUtf8());
    if (url.isEmpty()) {
        setHtml(QStringLiteral("<h3>Không mở được HTTP server local</h3>"));
        return;
    }
    load(QUrl(url));
}

void GameWebView::setRenderOptions(const QString &quality, const QString &scale)
{
    m_quality = quality;
    m_scale = scale;
}

void GameWebView::contextMenuEvent(QContextMenuEvent *event)
{
    // Nuốt menu mặc định của QtWebKit (Reload/Back/View Source...) và thay bằng
    // menu tiện ích. Flash không hề biết chuyện này.
    QMenu menu(this);

    const QList<QPair<QString, QString>> items = {
        {QStringLiteral("clean-bag"), QStringLiteral("Dọn túi")},
        {QStringLiteral("clean-mail"), QStringLiteral("Dọn thư")},
        {QStringLiteral("open-batch"), QStringLiteral("Mở nhanh items")},
        {QStringLiteral("sell-dress"), QStringLiteral("Bán thời trang 5 chỉ số")},
        {QStringLiteral("open-magic-store"), QStringLiteral("Mở kho ma pháp")},
        {QStringLiteral("toggle-overlay"), QStringLiteral("Hiện bảng cài đặt")},
    };
    for (const auto &item : items) {
        QAction *act = menu.addAction(item.second);
        const QString id = item.first;
        connect(act, &QAction::triggered, this, [this, id] { emit toolActionRequested(id); });
    }

    menu.addSeparator();
    QAction *reload = menu.addAction(QStringLiteral("Tải lại game"));
    connect(reload, &QAction::triggered, this, [this] { emit toolActionRequested(QStringLiteral("reload")); });

    menu.exec(event->globalPos());
}
