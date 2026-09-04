#include "overlay-window.h"

#include <QEvent>
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

// Thước là hai đường chấm pixel vuông góc, không phải lưới: chỉ hai đường và
// các mốc chia, không nối mốc thành ô, không đánh số.
//
// Vẽ thủ công từng chấm chứ không dùng Qt::DotLine: kiểu nét của Qt co giãn
// theo bề dày và bị làm mượt, ra chấm xám nhoè. Ở đây cần cạnh sắc, đúng pixel.

// Mỗi khoảng nguyên chia thành 10 mốc 0.1.
const int kSub = 10;

// Nới khoảng toạ độ thật, không phóng to ảnh: mỗi khoảng ngang dài thêm 1px,
// mỗi khoảng dọc thêm 2px. Thước do đó dài hơn khung game một chút.
const double kExtraX = 1.0;
const double kExtraY = 2.0;

// Mọi mốc dài bằng nhau, chỉ khác bề ngang và màu — đọc thước bằng màu và độ
// dày chứ không bằng chiều dài, nên nhìn gọn hơn hẳn kiểu vạch so le.
//
// Mốc vẽ vuông góc với đường thước: thước ngang thì vạch dựng đứng, thước dọc
// thì vạch nằm ngang. Cùng chiều với đường thước thì chúng nối vào nhau thành
// một vệt liền, không còn đếm được mốc.
const int kMarkLen = 5;      // chiều dài mốc thường
const int kMarkCenter = 7;   // mốc giữa dài thêm, bề ngang giữ nguyên
const int kThinSub = 1;    // bề ngang mốc 0.1
const int kThinWhole = 3;  // bề ngang mốc nguyên

const QColor kWhole(255, 0, 0, 255);       // mốc nguyên
const QColor kCenter(0, 230, 0, 255);      // mốc giữa thước ngang
const QColor kSubColor(0, 0, 255, 230);    // mốc 0.1

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
    // Hình thước không đổi theo thời gian, chỉ theo kích thước cửa sổ. Vẽ một
    // lần vào ảnh nhớ rồi dán lại: mỗi lần cửa sổ cần vẽ lại mà dựng 172 ô
    // vuông là phí, nhất là khi lớp phủ nằm trên game đang chạy.
    if (m_rulerCache.size() != size()) {
        m_rulerCache = QPixmap(size());
        m_rulerCache.fill(Qt::transparent);
        QPainter rp(&m_rulerCache);
        drawRuler(rp);
    }
    p.drawPixmap(0, 0, m_rulerCache);
}

void OverlayWindow::drawRuler(QPainter &p)
{
    // Không làm mượt: thước cần cạnh sắc từng pixel, bật lên là chấm nhỏ thành
    // vệt xám mờ.
    p.setRenderHint(QPainter::Antialiasing, false);

    // Khoảng toạ độ = khung chia đều, cộng thêm phần nới. Cộng vào ĐƠN VỊ chứ
    // không nhân cả thước, nên mốc thứ n dịch đi n lần phần nới.
    const double unitX = double(width()) / kCols + kExtraX;
    const double unitY = double(height()) / kRows + kExtraY;
    const int axisY = qRound(unitY * kRulerRow);
    const int axisX = qRound(unitX * kRulerCol);

    p.setPen(Qt::NoPen);

    // Vẽ một mốc: hình chữ nhật w×h, tâm đặt đúng vào (x, y).
    auto mark = [&p](int x, int y, int w, int h, const QColor &c) {
        p.setBrush(c);
        p.drawRect(QRect(x - w / 2, y - h / 2, w, h));
    };

    // Thước ngang: 10 khoảng, mỗi khoảng 10 mốc con, vạch dựng đứng. Mốc giữa
    // (đúng 50% chiều dài) tô xanh lá để nhận ra tâm ngay.
    const int mid = kCols * kSub / 2;
    for (int i = 0; i <= kCols * kSub; ++i) {
        const bool whole = i % kSub == 0;
        // Mốc giữa chỉ dài thêm theo chiều dọc; nới cả bề ngang thì nó thành
        // cục vuông, không còn là vạch.
        mark(qRound(unitX * i / kSub), axisY,
             whole ? kThinWhole : kThinSub,
             i == mid ? kMarkCenter : kMarkLen,
             i == mid ? kCenter : (whole ? kWhole : kSubColor));
    }
    // Thước dọc: 7 khoảng, vạch nằm ngang.
    for (int i = 0; i <= kRows * kSub; ++i) {
        const bool whole = i % kSub == 0;
        mark(axisX, qRound(unitY * i / kSub),
             kMarkLen, whole ? kThinWhole : kThinSub,
             whole ? kWhole : kSubColor);
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
