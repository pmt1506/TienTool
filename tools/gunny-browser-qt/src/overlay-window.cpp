#include "overlay-window.h"

#include <QEvent>
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

void OverlayWindow::setTrajectory(const QVector<QPointF> &points)
{
    m_points = points;
    if (m_points.isEmpty()) {
        hide();
        return;
    }
    syncGeometry();
    show();
    update();
}

void OverlayWindow::clearTrajectory()
{
    m_points.clear();
    hide();
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
    if (m_points.size() < 2) {
        return;
    }

    QPainter p(this);
    p.setRenderHint(QPainter::Antialiasing);

    QPainterPath path(m_points.first());
    for (int i = 1; i < m_points.size(); ++i) {
        path.lineTo(m_points.at(i));
    }

    // Viền tối bên dưới để đường vẫn đọc được trên nền sáng của bản đồ.
    p.setPen(QPen(QColor(0, 0, 0, 150), 5, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
    p.drawPath(path);
    p.setPen(QPen(QColor(60, 220, 120, 230), 2, Qt::SolidLine, Qt::RoundCap, Qt::RoundJoin));
    p.drawPath(path);

    // Đánh dấu điểm chạm đất.
    const QPointF end = m_points.last();
    p.setBrush(QColor(60, 220, 120, 200));
    p.setPen(QPen(QColor(0, 0, 0, 180), 1.5));
    p.drawEllipse(end, 4.5, 4.5);
}
