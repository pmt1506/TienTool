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
    src/flash-module.cpp \
    src/packet-proxy.cpp \
    src/overlay-window.cpp \
    src/game-web-view.cpp \
    src/local-page-server.cpp \
    src/referer-network-manager.cpp \
    src/speed-dialog.cpp \
    src/speed-hack.cpp \
    src/tool-bridge.cpp \
    third_party/minhook/src/buffer.c \
    third_party/minhook/src/hook.c \
    third_party/minhook/src/trampoline.c \
    third_party/minhook/src/hde/hde32.c \
    third_party/minhook/src/hde/hde64.c

HEADERS += \
    src/main-window.h \
    src/flash-module.h \
    src/packet-proxy.h \
    src/overlay-window.h \
    src/game-web-view.h \
    src/local-page-server.h \
    src/referer-network-manager.h \
    src/speed-dialog.h \
    src/speed-hack.h \
    src/tool-bridge.h

RESOURCES += resources/resources.qrc

# MinHook: vá inline vào thân hàm — cùng cơ chế Cheat Engine dùng cho speedhack.
# Vá IAT không ăn thua vì NPSWF32.dll không import hàm thời gian nào.
INCLUDEPATH += third_party/minhook/include

# packet-proxy vá vào send/recv của winsock.
LIBS += -lws2_32
