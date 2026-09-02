#pragma once

#include <QDialog>

class QDoubleSpinBox;
class QSlider;

// Hộp thoại chỉnh hệ số tốc độ: kéo thanh trượt hoặc gõ số.
// Áp dụng ngay khi kéo (live preview) để người dùng thấy hiệu quả tức thì.
class SpeedDialog : public QDialog
{
    Q_OBJECT

public:
    explicit SpeedDialog(double current, QWidget *parent = nullptr);

    double value() const;

signals:
    // Phát liên tục trong lúc kéo để áp dụng ngay.
    void multiplierPreview(double m);

private:
    QSlider *m_slider;
    QDoubleSpinBox *m_spin;
    double m_original;
};
