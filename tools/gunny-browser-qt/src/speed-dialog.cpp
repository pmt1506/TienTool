#include "speed-dialog.h"

#include <QDialogButtonBox>
#include <QDoubleSpinBox>
#include <QFormLayout>
#include <QLabel>
#include <QSlider>
#include <QVBoxLayout>

namespace {
// Thanh trượt Qt chỉ nhận số nguyên -> lưu hệ số nhân 10 (x0.1 .. x20.0).
constexpr int kScale = 10;
constexpr int kMin = 1;    // x0.1
constexpr int kMax = 200;  // x20.0
}  // namespace

SpeedDialog::SpeedDialog(double current, QWidget *parent)
    : QDialog(parent), m_original(current)
{
    setWindowTitle(QStringLiteral("Tùy chỉnh tốc độ"));
    setModal(true);

    m_slider = new QSlider(Qt::Horizontal, this);
    m_slider->setRange(kMin, kMax);
    m_slider->setValue(qRound(current * kScale));
    m_slider->setTickPosition(QSlider::TicksBelow);
    m_slider->setTickInterval(kScale);  // mỗi nấc lớn = x1

    m_spin = new QDoubleSpinBox(this);
    m_spin->setRange((double)kMin / kScale, (double)kMax / kScale);
    m_spin->setSingleStep(0.1);
    m_spin->setDecimals(1);
    m_spin->setSuffix(QStringLiteral("x"));
    m_spin->setValue(current);

    // Hai widget đồng bộ hai chiều; áp dụng ngay để xem hiệu quả tức thì.
    connect(m_slider, &QSlider::valueChanged, this, [this](int v) {
        const double m = (double)v / kScale;
        if (!qFuzzyCompare(m_spin->value(), m)) {
            m_spin->setValue(m);
        }
        emit multiplierPreview(m);
    });
    connect(m_spin, static_cast<void (QDoubleSpinBox::*)(double)>(&QDoubleSpinBox::valueChanged),
            this, [this](double m) {
                const int v = qRound(m * kScale);
                if (m_slider->value() != v) {
                    m_slider->setValue(v);
                }
            });

    auto *buttons = new QDialogButtonBox(QDialogButtonBox::Ok | QDialogButtonBox::Cancel, this);
    connect(buttons, &QDialogButtonBox::accepted, this, &QDialog::accept);
    connect(buttons, &QDialogButtonBox::rejected, this, [this] {
        emit multiplierPreview(m_original);  // hủy thì trả về giá trị cũ
        reject();
    });

    auto *form = new QFormLayout;
    form->addRow(QStringLiteral("Hệ số:"), m_spin);

    auto *root = new QVBoxLayout(this);
    root->addWidget(new QLabel(
        QStringLiteral("Kéo thanh trượt hoặc nhập số. Áp dụng ngay khi kéo."), this));
    root->addWidget(m_slider);
    root->addLayout(form);
    root->addWidget(buttons);

    setMinimumWidth(360);
}

double SpeedDialog::value() const
{
    return m_spin->value();
}
