#include "warehouse-search-dialog.h"

#include <QLabel>
#include <QLineEdit>
#include <QListWidget>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QPainter>
#include <QPixmap>
#include <QStyledItemDelegate>
#include <QUrl>
#include <QVBoxLayout>

#include "tool-bridge.h"

namespace {

// Host ảnh của game. Phần đường dẫn phía sau do PathManager.solveGoodsPath
// trong bản vá dựng — trường Pic một mình không đủ, thư mục còn tuỳ loại món.
const char kIconBase[] = "http://gunny.vcdn.vn/";

const int kRoleBagType = Qt::UserRole;
const int kRolePlace = Qt::UserRole + 1;
const int kRoleName = Qt::UserRole + 2;

const int kCell = 64;

// Vẽ ô giống trong game: ảnh chiếm cả ô, số lượng đè lên góc phải dưới. Kiểu
// mặc định của QListWidget đặt chữ xuống dưới ảnh, nhìn rời rạc và tốn chỗ.
class CellDelegate : public QStyledItemDelegate
{
public:
    using QStyledItemDelegate::QStyledItemDelegate;

    void paint(QPainter *p, const QStyleOptionViewItem &opt,
               const QModelIndex &idx) const override
    {
        QStyleOptionViewItem o(opt);
        initStyleOption(&o, idx);
        if (o.state & QStyle::State_Selected) {
            p->fillRect(o.rect, o.palette.highlight());
        }

        const QIcon icon = qvariant_cast<QIcon>(idx.data(Qt::DecorationRole));
        if (!icon.isNull()) {
            icon.paint(p, o.rect.adjusted(2, 2, -2, -2));
        }

        const QString count = idx.data(Qt::DisplayRole).toString();
        if (count.isEmpty()) {
            return;
        }
        QFont f = o.font;
        f.setBold(true);
        p->setFont(f);
        const QRect box = o.rect.adjusted(0, 0, -3, -2);
        // Viền tối quanh chữ để số vẫn đọc được trên ảnh sáng.
        p->setPen(Qt::black);
        for (int dx = -1; dx <= 1; ++dx) {
            for (int dy = -1; dy <= 1; ++dy) {
                p->drawText(box.translated(dx, dy),
                            Qt::AlignRight | Qt::AlignBottom, count);
            }
        }
        p->setPen(Qt::white);
        p->drawText(box, Qt::AlignRight | Qt::AlignBottom, count);
    }
};

} // namespace

const QVector<int> &WarehouseSearchDialog::warehouseTypes()
{
    static const QVector<int> types{51, 60, 70, 11, 53};
    return types;
}

WarehouseSearchDialog::WarehouseSearchDialog(ToolBridge *bridge, QWidget *parent)
    : QDialog(parent), m_bridge(bridge),
      m_net(new QNetworkAccessManager(this))
{
    setWindowTitle(QStringLiteral("Tìm vật phẩm trong kho"));
    resize(600, 480);

    auto *layout = new QVBoxLayout(this);
    m_search = new QLineEdit(this);
    m_search->setPlaceholderText(QStringLiteral("Nhập tên món đồ cần tìm"));
    layout->addWidget(m_search);

    m_grid = new QListWidget(this);
    m_grid->setViewMode(QListView::IconMode);
    m_grid->setIconSize(QSize(kCell - 4, kCell - 4));
    m_grid->setGridSize(QSize(kCell + 4, kCell + 4));
    m_grid->setItemDelegate(new CellDelegate(m_grid));
    m_grid->setResizeMode(QListView::Adjust);
    m_grid->setMovement(QListView::Static);
    m_grid->setWordWrap(true);
    m_grid->setUniformItemSizes(true);
    layout->addWidget(m_grid);

    m_status = new QLabel(
        QStringLiteral("Bấm đúp một món để chuyển về túi."), this);
    layout->addWidget(m_status);

    connect(m_search, &QLineEdit::textChanged, this, [this] { applyFilter(); });
    connect(m_grid, &QListWidget::itemDoubleClicked, this,
            [this](QListWidgetItem *cell) { moveToBag(cell); });
}

void WarehouseSearchDialog::addWarehouse(const QString &line)
{
    // "kho <loại>;;<ô>|<mã>|<số lượng>|<tên>|<ảnh>;;…"
    const QStringList parts = line.split(QStringLiteral(";;"));
    if (parts.isEmpty()) {
        return;
    }
    const int bagType = parts.first().mid(4).trimmed().toInt();

    for (int i = 1; i < parts.size(); ++i) {
        const QStringList f = parts.at(i).split(QLatin1Char('|'));
        if (f.size() < 4) {
            continue;
        }
        // Tên trống thì lấy mã: vẫn tìm và chuyển được, chỉ khó đọc hơn.
        const QString name = f.at(3).isEmpty() ? f.at(1) : f.at(3);
        const int count = f.at(2).toInt();

        auto *cell = new QListWidgetItem(m_grid);
        // Số lượng 1 thì không ghi, giống trong game.
        cell->setText(count > 1 ? QString::number(count) : QString());
        // Khoá và hạn dùng: hai thứ quyết định món có mang đi được không, nên
        // hiện luôn khi rê chuột. ValidDate 0 là vĩnh viễn, khác 0 là số ngày.
        const QString bound = (f.size() >= 6 && f.at(5) == QLatin1String("true"))
                                  ? QStringLiteral("khoá")
                                  : QStringLiteral("không khoá");
        const int valid = f.size() >= 7 ? f.at(6).toInt() : 0;
        const QString life = valid > 0 ? QStringLiteral("còn %1 ngày").arg(valid)
                                       : QStringLiteral("vĩnh viễn");
        cell->setToolTip(QStringLiteral("%1\n%2 · %3").arg(name, bound, life));
        cell->setData(kRoleBagType, bagType);
        cell->setData(kRolePlace, f.at(0).toInt());
        cell->setData(kRoleName, name);
        if (f.size() >= 5 && !f.at(4).isEmpty()) {
            requestIcon(cell, f.at(4));
        }
    }
    applyFilter();
}

void WarehouseSearchDialog::requestIcon(QListWidgetItem *cell, const QString &pic)
{
    const auto cached = m_icons.constFind(pic);
    if (cached != m_icons.constEnd()) {
        cell->setIcon(QIcon(*cached));
        return;
    }

    // Bản vá đã trả về đường dẫn do PathManager.solveGoodsPath dựng, chỉ thiếu
    // phần host.
    // CDN phân biệt hoa thường, mà Pic trong dữ liệu lại viết hoa lẫn lộn
    // ("boliBall"); game gọi bằng chữ thường. Host giữ nguyên.
    QString url = pic;
    const int slash = url.indexOf(QStringLiteral("//"));
    const int pathAt = slash >= 0 ? url.indexOf(QLatin1Char('/'), slash + 2) : -1;
    if (pathAt > 0) {
        url = url.left(pathAt) + url.mid(pathAt).toLower();
    } else {
        url = url.toLower();
    }
    if (!url.startsWith(QLatin1String("http"))) {
        if (url.startsWith(QLatin1Char('/'))) {
            url.remove(0, 1);
        }
        url = QLatin1String(kIconBase) + url;
    }
    QNetworkReply *reply = m_net->get(QNetworkRequest(QUrl(url)));

    // Ô có thể đã bị xoá trước khi ảnh về (bấm đúp chuyển đi mất), nên bám theo
    // con trỏ ô qua QPointer thì không an toàn với QListWidgetItem — dò lại
    // trong danh sách bằng vị trí lưu kèm.
    const int bagType = cell->data(kRoleBagType).toInt();
    const int place = cell->data(kRolePlace).toInt();
    connect(reply, &QNetworkReply::finished, this, [this, reply, pic, bagType, place] {
        reply->deleteLater();
        if (reply->error() != QNetworkReply::NoError) {
            return;
        }
        QPixmap pix;
        if (!pix.loadFromData(reply->readAll())) {
            return;
        }
        m_icons.insert(pic, pix);
        for (int i = 0; i < m_grid->count(); ++i) {
            QListWidgetItem *c = m_grid->item(i);
            if (c->data(kRoleBagType).toInt() == bagType
                && c->data(kRolePlace).toInt() == place) {
                c->setIcon(QIcon(pix));
                return;
            }
        }
    });
}

void WarehouseSearchDialog::applyFilter()
{
    const QString needle = m_search->text().trimmed();
    int shown = 0;
    for (int i = 0; i < m_grid->count(); ++i) {
        QListWidgetItem *cell = m_grid->item(i);
        const bool match =
            needle.isEmpty()
            || cell->data(kRoleName).toString().contains(needle, Qt::CaseInsensitive);
        cell->setHidden(!match);
        shown += match ? 1 : 0;
    }
    m_status->setText(QStringLiteral("%1 món — bấm đúp để chuyển về túi")
                          .arg(shown));
}

void WarehouseSearchDialog::moveToBag(QListWidgetItem *cell)
{
    if (!cell) {
        return;
    }
    m_bridge->queueCommand(QStringLiteral("v:%1|%2")
                               .arg(cell->data(kRoleBagType).toInt())
                               .arg(cell->data(kRolePlace).toInt()));

    // Bỏ ô khỏi lưới ngay: món đã rời kho, để lại thì bấm đúp lần nữa sẽ gửi
    // một lệnh chuyển vào ô đã trống.
    delete cell;
    applyFilter();
}
