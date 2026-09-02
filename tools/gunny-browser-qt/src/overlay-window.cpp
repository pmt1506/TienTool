#include "overlay-window.h"

#include <QEvent>
#include <QFont>
#include <QPainter>
#include <QPainterPath>
#include <QPen>

OverlayWindow::OverlayWindow(QWidget *target)
    : QWidget(nullptr,
              Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool
                  | Qt::WindowTransparentForInput),
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

void OverlayWindow::setGrid(bool on, int cols, int rows)
{
    m_grid = on;
    m_cols = qMax(1, cols);
    m_rows = qMax(1, rows);
    refreshVisibility();
}

void OverlayWindow::setTrajectory(const QVector<QPointF> &points)
{
    m_points = points;
    refreshVisibility();
}

void OverlayWindow::refreshVisibility()
{
    if (!m_grid && m_points.size() < 2) {
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
    case QEvent::Show:
        if (isVisible()) {
            syncGeometry();
        }
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

void OverlayWindow::paintEvent(QPaintEvent *)
{
    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing);

    if (m_grid) {
        const double w = width();
        const double h = height();
        const double dx = w / m_cols;
        const double dy = h / m_rows;

        QFont f = p.font();
        f.setPixelSize(10);
        p.setFont(f);

        // Vẽ hai lượt: nét đen mờ bên dưới rồi nét sáng bên trên, để lưới đọc
        // được cả trên nền trời sáng lẫn nền đất tối.
        for (int pass = 0; pass < 2; ++pass) {
            p.setPen(pass == 0 ? QPen(QColor(0, 0, 0, 90), 3)
                               : QPen(QColor(255, 255, 255, 110), 1));
            for (int i = 1; i < m_cols; ++i) {
                const double x = dx * i;
                p.drawLine(QPointF(x, 0), QPointF(x, h));
            }
            for (int j = 1; j < m_rows; ++j) {
                const double y = dy * j;
                p.drawLine(QPointF(0, y), QPointF(w, y));
            }
        }

        // Đánh số cột để đếm nhanh khoảng cách tới mục tiêu.
        p.setPen(QColor(255, 255, 255, 190));
        for (int i = 1; i < m_cols; ++i) {
            p.drawText(QPointF(dx * i + 3, 12), QString::number(i));
        }
        for (int j = 1; j < m_rows; ++j) {
            p.drawText(QPointF(3, dy * j - 3), QString::number(j));
        }
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
