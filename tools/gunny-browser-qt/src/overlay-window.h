#pragma once

#include <QPointF>
#include <QVector>
#include <QWidget>

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

    // Lưới đo: chia đều khung game thành `cols` khoảng ngang và `rows` khoảng dọc.
    // Không cần dữ liệu gì từ game nên dùng được ngay, và tự nó đã là thước ước
    // lượng khoảng cách tới mục tiêu.
    void setGrid(bool on, int cols = 10, int rows = 7);
    bool gridEnabled() const { return m_grid; }

    // Đường đạn, theo toạ độ khung game (gốc góc trên trái). Để trống khi chưa
    // có dữ liệu — chưa đọc được vị trí nhân vật, góc, gió và lực thì không vẽ
    // gì cả còn hơn vẽ một đường sai chỗ.
    void setTrajectory(const QVector<QPointF> &points);

    // Bám lại theo khung game. Gọi khi cửa sổ chính di chuyển hoặc đổi kích thước.
    void syncGeometry();

protected:
    void paintEvent(QPaintEvent *event) override;
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    // Hiện nếu có thứ để vẽ, ẩn nếu không.
    void refreshVisibility();

    QWidget *m_target;
    QVector<QPointF> m_points;
    bool m_grid = false;
    int m_cols = 10;
    int m_rows = 7;
};
