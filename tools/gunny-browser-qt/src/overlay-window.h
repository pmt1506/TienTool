#pragma once

#include <QColor>
#include <QPointF>
#include <QVector>
#include <QPixmap>
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

    // Thước đo: một thanh ngang và một thanh dọc, chia vạch như thước thật.
    //
    // Khung game được coi như chia thành 10 khoảng ngang x 7 khoảng dọc. Thước
    // ngang nằm ở đường chia dọc thứ 5 tính từ trên xuống; thước dọc nằm ở đường
    // chia ngang thứ 6 tính từ trái sang. Mỗi khoảng có vạch chia 0.25 / 0.5 / 1,
    // vạch nguyên được đánh số.
    //
    // Không cần dữ liệu gì từ game nên dùng được ngay.
    void setRuler(bool on);
    bool rulerEnabled() const { return m_ruler; }

    // Một đường đạn kèm màu của nó.
    struct Line
    {
        QVector<QPointF> points;
        QColor color;
    };

    // Đường đạn, theo toạ độ khung game (gốc góc trên trái). Để trống khi chưa
    // có dữ liệu — chưa đọc được vị trí nhân vật, góc, gió và lực thì không vẽ
    // gì cả còn hơn vẽ một đường sai chỗ.
    void setTrajectory(const QVector<QPointF> &points);
    // Nhiều đường cùng lúc: đường tới mục tiêu, đường lực tối đa, các tia phụ.
    void setTrajectories(const QVector<Line> &lines);

    // Bám lại theo khung game. Gọi khi cửa sổ chính di chuyển hoặc đổi kích thước.
    void syncGeometry();

protected:
    void paintEvent(QPaintEvent *event) override;
    bool eventFilter(QObject *watched, QEvent *event) override;

private:
    // Hiện nếu có thứ để vẽ, ẩn nếu không.
    void refreshVisibility();
    void paintRuler(QPainter &p);
    void drawRuler(QPainter &p);

    QWidget *m_target;
    QVector<Line> m_lines;
    // Thước vẽ sẵn một lần rồi dán lại: hình nó cố định, chỉ đổi khi cửa sổ
    // đổi kích thước. Vẽ lại 172 ô vuông mỗi lần cửa sổ cần repaint là phí.
    QPixmap m_rulerCache;
    bool m_ruler = false;
};
