#include "overlay-window.h"

#include <QEvent>
#include <QFont>
#include <QFontMetrics>
#include <QPainter>
#include <QPainterPath>
#include <QPen>

namespace {

// Khung game quy ước chia thành 10 khoảng ngang x 7 khoảng dọc.
const int kCols = 10;
const int kRows = 7;
// Thước ngang đặt ở đường chia thứ 5 từ trên xuống, thước dọc ở đường chia thứ 6
// từ trái sang.
const int kRulerRow = 5;
const int kRulerCol = 6;

// Chiều dài vạch, tính từ trục thước ra mỗi bên. Chỉ còn vạch 1 và 0.5: mốc
// 0.25 chia quá dày, nhìn rối hơn là giúp ngắm.
const double kTickFull = 9.0;
const double kTickHalf = 6.0;

const QColor kShadow(0, 0, 0, 160);
// Vạch tròn chẵn đỏ đậm và dày hơn hẳn để đếm nhanh; trục và vạch 0.5 màu chàm
// (tím ngả xanh nước biển) nên không tranh chỗ với vạch đỏ.
const QColor kWhole(190, 25, 25, 245);
const QColor kInk(72, 61, 205, 235);
const double kWholeWidth = 2.6;

}  // namespace

OverlayWindow::OverlayWindow(QWidget *target)
    // Cửa sổ Tool có cha là cửa sổ game: nó chỉ nổi trên đúng cửa sổ cha, và tự
    // thu/ẩn theo cha. KHÔNG dùng WindowStaysOnTopHint với cha là nullptr —
    // làm thế thì thước nổi trên mọi ứng dụng khác của máy, không riêng gì game.
    : QWidget(target ? target->window() : nullptr,
              Qt::FramelessWindowHint | Qt::Tool | Qt::WindowTransparentForInput),
      m_target(target)
{
    setAttribute(Qt::WA_TranslucentBackground);
    setAttribute(Qt::WA_TransparentForMouseEvents);
    // Không nhận focus, nếu không mỗi lần vẽ lại sẽ cướp bàn phím của game.
    setFocusPolicy(Qt::NoFocus);

    // Khung game di chuyển hoặc đổi cỡ thì overlay phải đi theo.
    if (m_target) {
        m_target->installEventFilter(this);
        m_target->window()->installEventFilter(this);
    }
}

void OverlayWindow::setRuler(bool on)
{
    m_ruler = on;
    refreshVisibility();
}

void OverlayWindow::setTrajectory(const QVector<QPointF> &points)
{
    m_points = points;
    refreshVisibility();
}

void OverlayWindow::refreshVisibility()
{
    if (!m_ruler && m_points.size() < 2) {
        hide();
        return;
    }
    syncGeometry();
    show();
    update();
}

void OverlayWindow::syncGeometry()
{
    if (!m_target) {
        return;
    }
    // mapToGlobal của góc (0,0) cho đúng vị trí khung game trên màn hình, đã tính
    // cả thanh menu lẫn thanh trạng thái.
    setGeometry(QRect(m_target->mapToGlobal(QPoint(0, 0)), m_target->size()));
}

bool OverlayWindow::eventFilter(QObject *watched, QEvent *event)
{
    switch (event->type()) {
    case QEvent::Move:
    case QEvent::Resize:
        if (isVisible()) {
            syncGeometry();
        }
        break;
    // Không ẩn khi cửa sổ game mất focus. Overlay là cửa sổ con của cửa sổ game
    // nên Windows đã lo đúng thứ tự lớp: luôn nằm trên game, và tự lùi xuống
    // dưới khi người dùng chuyển sang ứng dụng khác. Tự ẩn thêm ở đây chỉ làm
    // thước biến mất mỗi lần click ra ngoài rồi quay lại.
    case QEvent::Show:
        refreshVisibility();
        break;
    case QEvent::Hide:
    case QEvent::Close:
        hide();
        break;
    default:
        break;
    }
    return QWidget::eventFilter(watched, event);
}

void OverlayWindow::paintRuler(QPainter &p)
{
    const double w = width();
    const double h = height();
    const double unitX = w / kCols;   // một khoảng cách theo chiều ngang
    const double unitY = h / kRows;   // một khoảng cách theo chiều dọc
    const double axisY = unitY * kRulerRow;
    const double axisX = unitX * kRulerCol;

    QFont f = p.font();
    f.setPixelSize(10);
    f.setWeight(QFont::Black);
    p.setFont(f);
    const QFontMetrics fm(f);

    // Vẽ hai lượt: nét đen dày bên dưới rồi nét sáng mảnh bên trên, để thước đọc
    // được cả trên nền trời sáng lẫn nền đất tối.
    for (int pass = 0; pass < 2; ++pass) {
        const bool shadow = pass == 0;
        p.setPen(QPen(shadow ? kShadow : kInk, shadow ? 3.0 : 1.0));

        p.drawLine(QPointF(0, axisY), QPointF(w, axisY));
        p.drawLine(QPointF(axisX, 0), QPointF(axisX, h));

        // Vạch trên thước ngang: bước nửa khoảng, vạch nguyên dài và dày hơn.
        for (int q = 0; q <= kCols * 2; ++q) {
            const bool whole = q % 2 == 0;
            const double x = unitX * q / 2.0;
            const double len = whole ? kTickFull : kTickHalf;
            // Vạch đỏ dày lên thì viền đen phải dày theo, không thì mất viền.
            p.setPen(shadow ? QPen(kShadow, whole ? kWholeWidth + 1.8 : 2.4)
                            : QPen(whole ? kWhole : kInk, whole ? kWholeWidth : 1.0));
            p.drawLine(QPointF(x, axisY - len), QPointF(x, axisY + len));
        }
        // Vạch trên thước dọc.
        for (int q = 0; q <= kRows * 2; ++q) {
            const bool whole = q % 2 == 0;
            const double y = unitY * q / 2.0;
            const double len = whole ? kTickFull : kTickHalf;
            // Vạch đỏ dày lên thì viền đen phải dày theo, không thì mất viền.
            p.setPen(shadow ? QPen(kShadow, whole ? kWholeWidth + 1.8 : 2.4)
                            : QPen(whole ? kWhole : kInk, whole ? kWholeWidth : 1.0));
            p.drawLine(QPointF(axisX - len, y), QPointF(axisX + len, y));
        }
    }

    // Đánh số các vạch nguyên. Đếm từ mép trái và mép trên, cùng hệ quy chiếu với
    // cách mô tả vị trí thước (khoảng thứ 5 từ trên, thứ 6 từ trái).
    auto label = [&](const QPointF &at, const QString &text) {
        p.setPen(kShadow);
        p.drawText(at + QPointF(1, 1), text);
        p.setPen(kWhole);
        p.drawText(at, text);
    };

    for (int i = 1; i < kCols; ++i) {
        const QString text = QString::number(i);
        // Trừ nửa bề rộng chữ số để số nằm giữa vạch. Lấy thẳng toạ độ vạch làm
        // mép trái thì số lệch sang phải đúng nửa bề rộng đó.
        label(QPointF(unitX * i - fm.width(text) / 2.0,
                      axisY + kTickFull + fm.ascent() + 1),
              text);
    }
    for (int j = 1; j < kRows; ++j) {
        const QString text = QString::number(j);
        label(QPointF(axisX + kTickFull + 4,
                      unitY * j + (fm.ascent() - fm.descent()) / 2.0),
              text);
    }
}

void OverlayWindow::paintEvent(QPaintEvent *)
{
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing);

    if (m_ruler) {
        paintRuler(p);
    }

    if (m_points.size() >= 2) {
        QPainterPath path(m_points.first());
        for (int i = 1; i < m_points.size(); ++i) {
            path.lineTo(m_points.at(i));
        }
        p.setPen(QPen(QColor(0, 0, 0, 150), 5, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
        p.drawPath(path);
        p.setPen(QPen(QColor(60, 220, 120, 230), 2, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
        p.drawPath(path);

        const QPointF end = m_points.last();
        p.setBrush(QColor(60, 220, 120, 200));
        p.setPen(QPen(QColor(0, 0, 0, 180), 1.5));
        p.drawEllipse(end, 4.5, 4.5);
    }
}
