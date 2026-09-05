# Mua hộp thẻ và nâng bộ thẻ lên Bạch Kim

Nhánh: `feat/gunny-flash-launcher` | 2026-09-06

## Dữ liệu đã xác minh

**Trong game** (bản vá đã xuất được, lệnh `C:`):

| Dòng log | Nội dung |
|---|---|
| `sothe <id>\|<tên>\|<phẩm chất>` | sổ thẻ đầy đủ — 415 dòng = 83 thẻ × 5 phẩm chất |
| `cothe <id>\|<tên>\|<phẩm chất>` | thẻ đang có — chỉ có sau khi MỞ bảng thẻ trong game (gói 648) |
| `bothe <id>\|<tên bộ>\|<id thẻ cần>` | 26 bộ |

Phẩm chất: `tank.newCard.carProfile = Vàng, Bạc, Đồng, Bạch Kim`, tra theo `profile - 1`
⇒ **1 = Vàng, 2 = Bạc, 3 = Đồng, 4 = Bạch Kim**, 0 = chưa có. `CardModel.getSuitProfile`
xác nhận 4 là bậc cao nhất: bộ chỉ đạt 4 khi MỌI thẻ trong bộ đều ≥ 4.

**Trên webshop**:

```
POST /api/Function/GetShopItem   {..., "searchType": 18, ...}   -> 38 hộp, 4 trang
POST /api/Function/UserSendItem  {UserId, ServerId, Param:[{TemplateID, Count, Price, Name, ...}]}
```

`searchType 18` trùng CategoryID 18 của game. Tên hộp là `Hộp Thẻ <tên thẻ>`, mô tả ghi rõ
"Mở hộp nhận được 1 Thẻ X". `Param` là mảng nên gửi nhiều loại trong một request.

**Ba con số quan trọng đo được**:
- Chỉ **37/82** thẻ thuộc các bộ là có hộp trên shop; 45 thẻ còn lại không mua được.
- Trong 45 thẻ đó có **8 thẻ chưa đạt Bạch Kim** (Kiến Xanh, Gà Hồng, Chim Ưng, Sói Dữ,
  Minotaure, Công Binh Goblin, Gà Mái, túi vũ khí) ⇒ các bộ chứa chúng **không thể** lên
  Bạch Kim bằng webshop.
- Một hộp lệch tên do đảo chữ: shop `Hộp Thẻ Dũng Sĩ Thi Đấu` ↔ game `Thẻ Đấu Trường Dũng Sĩ`.
  Phải so tên bằng cách chuẩn hoá + sắp xếp từ, không so chuỗi thô.

## Kiến trúc

Tính năng nằm ở **launcher Qt** (nơi đọc được dữ liệu thẻ trong game). Token web do
**TienTool truyền sang** lúc mở game — bên đó đã có sẵn giải captcha bằng API Ninjas và
hàm lấy JWT, viết lại trong C++ là trùng việc.

```
TienTool  --webtoken <JWT> --userid <n> --serverid <n> -->  launcher Qt
                                                             |
                                        đọc thẻ trong game (lệnh C:)
                                        gọi GetShopItem / UserSendItem
```

JWT hạn 24h (`exp` trong payload) nên TienTool cache theo tài khoản, khỏi giải captcha
mỗi lần mở game.

## Việc

### Phase 1 — đường ống token
- [ ] TienTool: lấy JWT bằng `apiService.getLoginToken`, cache theo tài khoản tới `exp`
- [ ] TienTool: truyền `--webtoken`, `--userid`, `--serverid` cho launcher
- [ ] Qt: nhận ba tham số đó, không có thì tắt tính năng kèm lời nhắc

### Phase 2 — client shop
- [ ] `src/card-shop-client.{h,cpp}`: `fetchBoxes()` (4 trang) và `buy(list, userId, serverId)`
- [ ] Khớp tên hộp ↔ tên thẻ: bỏ dấu, thường hoá, tách từ rồi so tập từ

### Phase 3 — ba nút
- [ ] "Mua full thẻ Vàng" — 999 hộp mỗi loại
- [ ] "Mua full Bạch Kim" — 4995 hộp mỗi loại, chỉ mua thẻ đang dưới 4
- [ ] "Nâng một bộ…" — chọn bộ, chỉ mua hộp của thẻ thiếu trong bộ đó
- [ ] Trước khi gửi: hiện bảng xác nhận (số loại, tổng số hộp, tổng tiền)

## Rủi ro

- Mua là **không hoàn lại**. Mọi nút phải hỏi xác nhận kèm tổng tiền. 38 loại × 4995 × 15
  ≈ 2,85 triệu.
- Giá gửi lên lấy từ `GetShopItem`, không tự đặt.
- `cothe` rỗng nếu chưa mở bảng thẻ ⇒ phải nhắc người dùng, không được coi là "đã Bạch Kim hết".
- Số hộp cần cho mỗi bậc chưa biết; dùng số người dùng đưa (999 / 4995) rồi đọc lại phẩm chất.

## Câu hỏi chưa giải đáp

- Mở hộp cho "1 thẻ hoặc điểm thẻ bài" — tỉ lệ bao nhiêu, cần bao nhiêu điểm cho một bậc?
- 8 thẻ không có hộp thì lấy ở đâu (hoạt động, phó bản)?
