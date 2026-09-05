#pragma once

#include <QDialog>

class QSpinBox;

// Hộp thoại chọn level muốn ép. Chỉ một ô số: level game chỉ chạy 1..70 nên
// không có gì để kéo thả như hộp thoại tốc độ.
//
// Không xem trước trực tiếp như SpeedDialog: mỗi lần ghi thật là một lần đổi dữ
// liệu nhân vật, kéo qua từng mức trung gian không đem lại gì mà chỉ làm giao
// diện game nhấp nháy.
class LevelDialog : public QDialog
{
    Q_OBJECT

public:
    // current = 0 khi chưa ép; ô số khi đó mở sẵn ở mức cao nhất.
    explicit LevelDialog(int current, QWidget *parent = nullptr);

    int value() const;

private:
    QSpinBox *m_spin;
};
