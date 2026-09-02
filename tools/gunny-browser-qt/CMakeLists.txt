cmake_minimum_required(VERSION 3.16)
project(gunny-browser-qt LANGUAGES CXX)

# Thay thế GunnyBrowser.exe: shell Qt nhúng Flash (NPAPI) qua QtWebKit.
# Launcher (TienTool) lo login + CreateLogin rồi truyền link SWF vào --swf.
#
# YÊU CẦU: Qt5 kèm QtWebKit. Qt chính thức đã bỏ QtWebKit từ 5.6, phải dùng
# bản cộng đồng QtWebKit 5.212 (https://github.com/qtwebkit/qtwebkit).

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)

find_package(Qt5 REQUIRED COMPONENTS Core Gui Widgets Network WebKit WebKitWidgets)

add_executable(gunny-browser-qt WIN32
    src/main.cpp
    src/main-window.cpp
    src/main-window.h
    src/game-web-view.cpp
    src/game-web-view.h
    src/referer-network-manager.cpp
    src/referer-network-manager.h
    src/tool-bridge.cpp
    src/tool-bridge.h
    resources/resources.qrc
)

target_link_libraries(gunny-browser-qt PRIVATE
    Qt5::Core Qt5::Gui Qt5::Widgets Qt5::Network Qt5::WebKit Qt5::WebKitWidgets
)

# NPSWF32.dll phải nằm cạnh exe trong thư mục plugins/ (main.cpp trỏ
# QTWEBKIT_PLUGIN_PATH vào đó).
install(TARGETS gunny-browser-qt RUNTIME DESTINATION .)
