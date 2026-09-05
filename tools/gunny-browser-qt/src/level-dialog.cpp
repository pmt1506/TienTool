#include "level-dialog.h"

#include <QDialogButtonBox>
#include <QFormLayout>
#include <QLabel>
#include <QSpinBox>
#include <QVBoxLayout>

namespace {
// Game chỉ có level 1..70. Đặt 0 hoặc quá 70 là dữ liệu hỏng: giao diện đọc
// bảng chỉ số theo level nên tra ra ngoài mảng, game đứng và phải đăng nhập lại.
constexpr int kMin = 1;
constexpr int kMax = 70;
}  // namespace

LevelDialog::LevelDialog(int current, QWidget *parent) : QDialog(parent)
{
    setWindowTitle(QStringLiteral("Chọn level"));
    setModal(true);

    m_spin = new QSpinBox(this);
    m_spin->setRange(kMin, kMax);
    m_spin->setValue(current >= kMin && current <= kMax ? current : kMax);

    auto *buttons = new QDialogButtonBox(QDialogButtonBox::Ok | QDialogButtonBox::Cancel, this);
    connect(buttons, &QDialogButtonBox::accepted, this, &QDialog::accept);
    connect(buttons, &QDialogButtonBox::rejected, this, &QDialog::reject);

    auto *form = new QFormLayout;
    form->addRow(QStringLiteral("Level (1–70):"), m_spin);

    auto *note = new QLabel(
        QStringLiteral("Chỉ đổi con số phía máy mình. Server vẫn tính level thật, "
                       "nên thoát ra vào lại là về như cũ."),
        this);
    note->setWordWrap(true);

    auto *root = new QVBoxLayout(this);
    root->addLayout(form);
    root->addWidget(note);
    root->addWidget(buttons);

    setMinimumWidth(360);
}

int LevelDialog::value() const
{
    return m_spin->value();
}
