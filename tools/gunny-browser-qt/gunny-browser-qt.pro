# Build bằng qmake.
#
#   set PATH=C:\Qt5.5.1\5.5\mingw492_32\bin;C:\Qt5.5.1\Tools\mingw492_32\bin;%PATH%
#   qmake && mingw32-make -j8
#
# PHẢI dùng Qt 5.5.1 (QtWebKit chính chủ, 32-bit) — bản Qt/kit khác đã thử và
# hỏng:
#   - QtWebKit 5.212-alpha4 (cộng đồng): nạp Loading.swf là abort với
#     STATUS_BREAKPOINT 0x80000003, dù SWF nhỏ vẫn chạy.
#   - Bản 64-bit: NPSWF32.dll là 32-bit nên không nạp được plugin.
# Đây cũng đúng tổ hợp mà GunnyClient và LazyGunny dùng.

QT += core gui widgets network webkit webkitwidgets
# Qt 5.5.1 đi kèm MinGW 4.9.2 (GCC 4.9) — chưa có C++17.
CONFIG += c++11
TEMPLATE = app
TARGET = gunny-browser-qt

SOURCES += \
    src/main.cpp \
    src/main-window.cpp \
    src/game-web-view.cpp \
    src/local-page-server.cpp \
    src/referer-network-manager.cpp \
    src/speed-dialog.cpp \
    src/speed-hack.cpp \
    src/tool-bridge.cpp

HEADERS += \
    src/main-window.h \
    src/game-web-view.h \
    src/local-page-server.h \
    src/referer-network-manager.h \
    src/speed-dialog.h \
    src/speed-hack.h \
    src/tool-bridge.h

RESOURCES += resources/resources.qrc
