// Điểm vào của gunny-browser-qt — bản thay thế GunnyBrowser.exe.
//
// Khác với GunnyBrowser gốc (hardcode https://www.gnddt.com/ rồi tự ghép tham
// số), bản này nhận thẳng link SWF từ launcher. Launcher đã lo chuỗi
// login -> RedircetPlayGame -> CreateLogin.aspx -> PlayGame.aspx, nên ở đây
// chỉ còn việc dựng trang và nạp Flash.

#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QFileInfo>

#include "main-window.h"
#include "packet-proxy.h"
#include "speed-hack.h"

int main(int argc, char *argv[])
{
    // Đặt bẫy đồng hồ trước mọi thứ khác. Bẫy nằm trong thân hàm của kernel32
    // nên module nào nạp sau — kể cả NPSWF32.dll — cũng đi vào bẫy, không cần
    // canh đúng lúc Flash nạp như bản vá IAT trước đây.
    SpeedHack::install();

    // Bẫy winsock cũng phải nằm sẵn từ đây: socket game được mở ngay khi
    // Loading.swf chạy xong, muộn hơn là lỡ mất phần bắt tay đầu phiên.
    PacketProxy::install();

    // Ép dùng OpenGL desktop thay vì ANGLE/phần mềm. Game bật wmode="direct"
    // (Stage3D + Starling); đường composite bằng phần mềm là nguồn giật chính
    // của client gốc.
    QApplication::setAttribute(Qt::AA_UseDesktopOpenGL);

    QApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("gunny-browser-qt"));

    // QtWebKit tìm plugin NPAPI theo QTWEBKIT_PLUGIN_PATH. Trỏ vào plugins/
    // cạnh exe để NPSWF32.dll đi kèm bản build, không phụ thuộc Flash hệ thống.
    const QString pluginDir =
        QDir(QCoreApplication::applicationDirPath()).filePath(QStringLiteral("plugins"));
    qputenv("QTWEBKIT_PLUGIN_PATH", QFile::encodeName(QDir::toNativeSeparators(pluginDir)));

    QCommandLineParser parser;
    parser.setApplicationDescription(
        QStringLiteral("Qt/Flash shell cho Gunny. Launcher truyền link SWF vào --swf."));
    parser.addHelpOption();

    const QCommandLineOption swfOpt(
        QStringLiteral("swf"),
        QStringLiteral("URL đầy đủ của Loading.swf kèm user/key/config."),
        QStringLiteral("url"));
    const QCommandLineOption titleOpt(
        QStringLiteral("title"), QStringLiteral("Tiêu đề cửa sổ."),
        QStringLiteral("text"), QStringLiteral("Gunny"));
    const QCommandLineOption widthOpt(
        QStringLiteral("width"), QStringLiteral("Bề rộng sân khấu Flash."),
        QStringLiteral("px"), QStringLiteral("1000"));
    const QCommandLineOption heightOpt(
        QStringLiteral("height"), QStringLiteral("Chiều cao sân khấu Flash."),
        QStringLiteral("px"), QStringLiteral("600"));
    // Referer mà server yêu cầu để ServerList.ashx trả IP game server thật;
    // sai giá trị này thì server trả 127.0.0.1:9000 và game treo ở màn Loading.
    const QCommandLineOption refererOpt(
        QStringLiteral("referer"), QStringLiteral("Referer gắn vào request tới game."),
        QStringLiteral("url"), QStringLiteral("http://play.gnddt.com/PlayGame.aspx"));

    parser.addOptions({swfOpt, titleOpt, widthOpt, heightOpt, refererOpt});
    parser.process(app);

    const QString swfUrl = parser.value(swfOpt);
    if (swfUrl.isEmpty()) {
        parser.showHelp(1);
    }

    MainWindow window(swfUrl,
                      parser.value(refererOpt),
                      parser.value(widthOpt).toInt(),
                      parser.value(heightOpt).toInt());
    window.setWindowTitle(parser.value(titleOpt));
    window.show();

    return app.exec();
}
