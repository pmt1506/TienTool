#pragma once

#include <QPointF>
#include <QVector>
#include <QWidget>

class QWidget;

// Lớp vẽ trong suốt nằm đè lên khung game.
//
// Vì sao phải là cửa sổ riêng chứ không phải widget con: game chạy wmode="direct"
// (bắt buộc, bỏ đi là mất Stage3D), nghĩa là Flash vẽ vào bề mặt riêng đè lên
// toàn bộ trang. Không thẻ HTML nào — và cũng không widget con nào của QWebView —
// nằm trên nó được. Một cửa sổ top-level luôn-trên-cùng thì nằm trên được, vì nó
// do trình quản lý cửa sổ xếp lớp chứ không phải trình duyệt.
//
// Cửa sổ này xuyên chuột hoàn toàn: mọi cú click rơi xuống game bên dưới.
class OverlayWindow : public QWidget
{
    Q_OBJECT

public:
    // `target` là widget khung game; overlay tự bám theo vị trí và kích thước của nó.
    explicit OverlayWindow(QWidget *target);

    // Đường cần vẽ, theo toạ độ của khung game (gốc ở góc trên trái). Danh sách
    // rỗng thì overlay tự ẩn — đúng hành vi mong muốn: chỉ hiện khi có dữ liệu,
    // tức là chỉ khi đang trong trận.
    void setTrajectory(const QVector<QPointF> &points);
    void clearTrajectory();

    // Bám lại theo khung game. Gọi khi cửa sổ chính di chuyển hoặc đổi kích thước.
    void syncGeometry();

protected:
    void paintEvent(QPaintEvent *event) override;
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    QWidget *m_target;
    QVector<QPointF> m_points;
};
