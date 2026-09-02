# Build bằng qmake — đường native của Qt5, dùng thẳng mkspecs/modules mà bản
# QtWebKit 5.212 prebuilt kèm theo. CMakeLists.txt vẫn giữ làm lựa chọn thứ hai
# (Qt5 config file đôi khi xung khắc với CMake 4.x).
#
#   qmake && mingw32-make -j8

QT += core gui widgets network webkit webkitwidgets
CONFIG += c++17
TEMPLATE = app
TARGET = gunny-browser-qt

SOURCES += \
    src/main.cpp \
    src/main-window.cpp \
    src/game-web-view.cpp \
    src/local-page-server.cpp \
    src/referer-network-manager.cpp \
    src/tool-bridge.cpp

HEADERS += \
    src/main-window.h \
    src/game-web-view.h \
    src/local-page-server.h \
    src/referer-network-manager.h \
    src/tool-bridge.h

RESOURCES += resources/resources.qrc
