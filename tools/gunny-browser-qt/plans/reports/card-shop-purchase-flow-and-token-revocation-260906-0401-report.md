# Mua hộp thẻ bài từ webshop — trạng thái và các bẫy đã gặp

Ngày 2026-09-06. Commit: `c7a8595` → `044c157`.

## Đã chạy được

Menu **Thẻ bài** trong launcher Qt:

- `Đọc thẻ trong game` — lệnh `C:` cho SWF dump ra `sothe` (sổ thẻ), `cothe`
  (thẻ đang có + phẩm chất), `bothe` (bộ + thẻ mà bộ cần). **Phải mở bảng thẻ
  trong game trước**, không thì `hasCards` rỗng và mọi thẻ trông như chưa có.
- `Mua full thẻ Vàng (999/loại)` và `Mua full Bạch Kim (4995/loại)`.
  Phẩm chất: `1 = Vàng … 4 = Bạch Kim`.

Luồng: `fetchBalance()` → `fetchCardBoxes()` (phân trang `GetShopItem`,
`searchType 18`) → ghép tên → bảng xác nhận → `UserSendItem`.

## Số liệu xác nhận được từ bundle webshop

`https://gnddt.com/main-es2015.*.js`:

```js
getTotalMoney(){ Total = 0; Param.forEach(l => Total += l.Price * l.Count) }
onCheckPay(){ return Total > 0 && Total*(100-VipReduction)/100 <= Cash + CashFree }
onCheckCount(l){ ... l.Count > 5*l.MaxCount && (l.Count = 5*l.MaxCount) }
```

- Tiền thật = `tổng × (100 − VipReduction) / 100`. `VipReduction` là trường của
  `oauth/GetUserInfo`, cùng chỗ `Cash`/`CashFree`. Tài khoản test VipLv 0 → 0%.
- **4995 = 5 × MaxCount(999)**, đúng trần một dòng giỏ hàng, không phải số tuỳ ý.
- `GetShopItem` trả cả `PriceOld` và `Reduction` riêng từng món; `Price` đã là
  giá sau giảm của món, nên dùng thẳng `Price` (web cũng vậy).

## Ba lỗi đã sửa, đáng nhớ

1. **`Error creating SSL context`.** Qt 5.5.1 nạp OpenSSL lúc chạy chứ không link
   sẵn. Thiếu `libeay32.dll` + `ssleay32.dll` (32-bit, 1.0.x) cạnh exe thì mọi
   request https chết trước khi ra khỏi máy. `build/` bị gitignore → clone sạch
   dính lại; đã ghi chú đầu `gunny-browser-qt.pro`.

2. **401 dù token còn hạn.** `web-token-cache.js` chỉ đọc `exp` để quyết định
   dùng lại token. Đo thực tế: token cấp 03:37:32, `exp` là 03:37 hôm sau, đã
   401 lúc 03:43 ở *mọi* endpoint cần auth, trong khi `GetCaptcha` (không auth)
   vẫn 200 và token rác cũng 401 y hệt → server thu hồi, không phải hết hạn,
   không phải chặn IP, không phải sai định dạng header (thử cả `Bearer`). Nay
   gọi thử `GetUserInfo` trước khi tin cache.

3. **`QLatin1Char('đ')`** là hằng nhiều byte → chữ đ không được quy về d, mọi tên
   có đ đều so trượt. Đổi sang `QChar(0x0111)`. Compiler có cảnh báo
   `-Wmultichar`, tôi bỏ qua ở lần build đầu.

## Ghép tên hộp ↔ tên thẻ

`normalizeCardName()` bỏ dấu, bỏ `hop/the/bai`, sắp xếp từ rồi so tập từ — chịu
được lệch thứ tự chữ nhưng không chịu được lệch từ.

Ca không ghép được, phải chỉ tay trong `kUnlistedBoxes`:

| TemplateID | Hộp | Thẻ trong game |
|---|---|---|
| 20149 | Hộp Thẻ Dũng Sĩ Thi Đấu | Thẻ Đấu Trường Dũng Sĩ |

Hộp này `GetShopItem` không liệt kê nhưng mua được. Bảng nối vào sau khi phân
trang xong và bỏ qua nếu `TemplateID` đã có → mai server trả về thì giá server
thắng. Giá 15 là hard-code, sẽ sai nếu server đổi giá.

## Còn dở

- **Nút "Nâng một bộ…" chưa có.** `bothe` đã parse ra log nhưng chưa có hộp
  thoại chọn bộ. Bộ nào chứa thẻ chỉ ra từ "hộp thẻ bài thần bí" thì phải báo là
  không nâng được bằng webshop — user không cần mấy thẻ đó.
- **Chưa test end-to-end một đơn mua thật.** Mới tới bảng xác nhận.
- **Chưa biết bao nhiêu hộp nâng được một bậc phẩm chất.** 999 và 4995 là con số
  user vẫn dùng, không phải con số đo được.

## Câu chưa trả lời được

- Chính xác cái gì thu hồi token JWT? Suy từ hiện tượng là "server chỉ giữ một
  token sống mỗi tài khoản", chưa test được vòng đăng nhập hai lần vì cần mật
  khẩu tài khoản. Nếu sau này vẫn 401 ngay từ lần mở đầu tiên thì giả thuyết sai.
- `Reduction` theo món và `VipReduction` có cộng dồn không? Chưa gặp món nào
  `Reduction > 0` để kiểm.
