#pragma once

#include <QDialog>
#include <QHash>
#include <QString>
#include <QVector>

class QLineEdit;
class QLabel;
class QListWidget;
class QListWidgetItem;
class QNetworkAccessManager;
class ToolBridge;

// Tìm vật phẩm trong năm kho, bấm đúp để chuyển về túi.
//
// Game bản này không có sẵn chức năng đó — đã quét hết tên lớp có "Search"
// trong cả hai gói mã lõi, chỉ có tìm trong cửa hàng, tìm ở tab Thời Trang và
// tìm thành viên bang. Muốn lấy một món ra khỏi kho thì phải mở từng kho rồi
// lật từng trang.
//
// Bày theo lưới ảnh kèm số lượng cho giống trong game, chứ không phải bảng chữ.
// Ảnh lấy từ chính CDN của game theo trường Pic của món đồ, và giữ lại trong bộ
// nhớ để cuộn qua cuộn lại không tải đi tải lại.
//
// Lọc ngay tại chỗ chứ không hỏi lại game: dữ liệu đã nằm sẵn nên gõ tới đâu
// thấy tới đó, không phải chờ vòng lệnh 250ms.
class WarehouseSearchDialog : public QDialog
{
    Q_OBJECT

public:
    // Năm kho, cùng bộ mã mà chức năng xếp túi vào két dùng. Túi người chơi
    // (0 trang bị, 1 đạo cụ) không nằm đây: mục đích là lấy đồ TỪ kho về.
    static const QVector<int> &warehouseTypes();

    explicit WarehouseSearchDialog(ToolBridge *bridge, QWidget *parent = nullptr);

    // Nạp kết quả một lệnh đọc kho:
    // "kho <loại>;;<ô>|<mã>|<số lượng>|<tên>|<ảnh>;;…".
    void addWarehouse(const QString &line);

private:
    void applyFilter();
    void moveToBag(QListWidgetItem *cell);
    void requestIcon(QListWidgetItem *cell, const QString &pic);

    ToolBridge *m_bridge = nullptr;
    QNetworkAccessManager *m_net = nullptr;
    QLineEdit *m_search = nullptr;
    QListWidget *m_grid = nullptr;
    QLabel *m_status = nullptr;
    // Ảnh đã tải, khoá theo đường dẫn Pic.
    QHash<QString, QPixmap> m_icons;
};
