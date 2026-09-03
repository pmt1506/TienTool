# Không patch được `Loading.swf` bằng JPEXS — và vì sao

Date: 2026-09-03 | Branch: `feat/gunny-flash-launcher` | Trạng thái: **KẾT LUẬN SAI, đã bị bác bỏ 2026-09-03**

## Đính chính

Toàn bộ bảng đo dưới đây **không dùng được**. Mọi lần chạy đều truyền
`--auto-magic`, mà tham số đó chưa được khai báo trong `QCommandLineParser`.
Với app GUI trên Windows, `process()` gặp tham số lạ thì bật hộp thoại
"Unknown option" rồi thoát — nên con số 35–52MB đo cái hộp thoại đó, không đo
bản vá. Xem `fix: declare --auto-magic so the app does not die at startup`.

Sau khi sửa, JPEXS chưa được đo lại. Tính năng "Mở kho ma pháp" đã làm xong
bằng RABCDAsm (sửa ở mức assembly), nên không còn lý do quay lại đo.

Phần "Những gì ĐÃ xác minh được" và "Về tính năng Mở kho ma pháp" bên dưới vẫn
đúng — chúng dựa trên nhật ký chứ không dựa trên phép đo bộ nhớ.

## Kết luận (đã bị bác bỏ)

JPEXS recompile lại **bất kỳ sửa đổi nào** trong `Loading.swf` đều tạo ra class
hỏng: Flash nạp được SWF nhưng không nạp được module nào nữa, game đứng ở ~35–52MB
thay vì ~520–590MB.

Đo bằng working set của tiến trình, đối chứng đầy đủ:

| Thử nghiệm | Kết quả |
|---|---|
| Không patch | **521–589 MB** — chạy tốt |
| `ModuleLoader` recompile **y nguyên**, không sửa gì | **589 MB** — chạy tốt |
| `ModuleLoader` + 1 biến static + 1 hàm rỗng, không gọi ở đâu | 35 MB — hỏng |
| `ModuleLoader` + hàm rỗng, gọi từ constructor | 35 MB — hỏng |
| `ModuleLoader` + cầu nối Timer/ExternalInterface | 35 MB — hỏng |
| `ClassUtils` + cầu nối | 35 MB — hỏng |
| `ClassUtils` sửa **thân hàm** có sẵn, có thêm import | 52 MB — hỏng |
| `ClassUtils` sửa thân hàm, **không thêm import** (tên đầy đủ) | 35 MB — hỏng |

Recompile y nguyên thì chạy, sửa một dòng là hỏng. Không phải lỗi code chèn vào,
cũng không phải lỗi import hay thêm thành viên — là bản thân trình biên dịch AS3
của JPEXS (chính nó cảnh báo `This feature is EXPERIMENTAL`) không dựng lại đúng
class trong SWF này.

## Những gì ĐÃ xác minh được trước khi bế tắc

Hạ tầng quanh nó chạy đúng, chỉ mỗi khâu biên dịch hỏng:

- Tráo nội dung SWF tại đúng URL gốc: **chạy** (`^^ TRAO NOI DUNG (327273 byte)`
  trong nhật ký URL, và Flash vẫn nhận sandbox của res1.gnddt.com).
- `ExternalInterface.addCallback` chèn vào: **có đăng ký** (`toolPing=function`).
- Gọi được vào AS3 và nhận giá trị trả về: **chạy** (`magic ok`).
- Chiều JS→Flash qua NPObject: chập chờn — callback của chính game
  (`SetFlashLoadExternal`) lúc thấy lúc không. Đã đổi sang cho SWF hỏi vòng
  trang 250ms/lần, chiều đó luôn ổn định.

## Về tính năng "Mở kho ma pháp"

Đường đi trong game đã đọc xong, chỉ thiếu cách bấm vào nó từ ngoài:

```as3
// magicHouse.MagicHouseControl
MagicHouseManager.instance.addEventListener("showMainView", __showHandler);
// __showHandler:
_magicHouseMainView = ComponentFactory.Instance
    .creatComponentByStylename("magicHouse.mainViewFrame");
_magicHouseMainView.show(MagicHouseModel.instance.viewIndex);
```

`MagicHouseMainView.show(index)` tự `LayerManager.addToLayer` và tự đặt
`_btnGroup.selectIndex`, nên mở cửa sổ và chọn tab là một thao tác. Map tab từ
`__changeHandler`: 0 = Sưu tầm, 1 = Kho báu (WarehouseView), 2 = Hộp Ma Pháp.

Hai chi tiết đã đo được, không phải suy đoán:
- Dispatch `showMainView` trả về "ok" mà không mở gì → `MagicHouseControl` là
  singleton lười, `setup()` (nơi đăng ký listener) chưa ai gọi.
- Gọi thẳng `ComponentFactory.creatComponentByStylename("magicHouse.mainViewFrame")`
  ném **Error #1065** → `ClassUtils.CreatInstance` lấy tên lớp từ style XML, mà
  style của màn này chỉ nạp khi chính game mở nó lần đầu.

## Hướng còn lại

1. **Trình biên dịch AS3 khác.** RABCDAsm (`abcexport`/`rabcasm`) sửa ở mức
   assembly, không dựng lại class từ mã nguồn — tránh đúng chỗ JPEXS hỏng.
   Nặng tay nhưng là hướng nghiêm túc nhất.
2. **Giả lập cú bấm** vào biểu tượng kho ở sảnh. Game tự lo nạp module và style,
   nên không vướng 1065. Đổi lại phụ thuộc toạ độ biểu tượng, dễ vỡ khi giao
   diện đổi.
3. **Gửi gói tin** thay vì điều khiển giao diện — dùng cho các tính năng phía
   server (dọn túi, dọn thư). Không dùng được cho việc chỉ mở một cửa sổ.

## Đã dựng được trong lúc thử (giữ lại)

- `--auto-magic <giây>`: tự bấm nút sau khi game tải xong, chạy thử không cần người.
- Mọi báo cáo từ AS3 ghi ra `%TEMP%\gunny-flash.log`.
- Working set là thước đo nhanh và đáng tin để biết bản patch có làm hỏng SWF
  không: dưới 150MB là Flash không nạp được module.

## Câu hỏi đã trả lời từ đó

- `Loading.swf` có 171 tag DoABC, mỗi tag **một class**. `ClassUtils` nằm trọn
  trong tag 15, nên giả thuyết "hỏng do class khác cùng tag" là sai.
- Cách vào kho đúng là `MagicHouseManager.instance.show()` chứ không phải phát
  thẳng `showMainView`: `show()` nạp trước các module UI rồi mới phát sự kiện.
  Sảnh cũng gọi đúng hàm đó (`hall.HallStateView`).
- Chiều JS -> Flash hỏng hẳn ở QtWebKit: gọi cả callback GỐC của game
  (`SetFlashLoadExternal`) cũng ra "Error calling method on NPObject". Đây mới
  là lý do phải cho SWF hỏi vòng.

## Câu hỏi chưa trả lời

- JPEXS có thật sự hỏng không? Chưa đo lại sau khi sửa `--auto-magic`. Không
  còn cần thiết vì RABCDAsm đã chạy.
