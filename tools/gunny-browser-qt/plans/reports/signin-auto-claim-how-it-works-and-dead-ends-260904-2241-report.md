# Điểm danh tự động: cách chạy, và những ngả cụt

2026-09-04. Gộp và thay hai báo cáo cũ trong ngày (`...-1834-`, `...-2145-`),
cả hai đều đã lỗi thời: một cái kết luận nhầm lớp, một cái chép cứng GUID.

## Chạy thế nào

Vào sảnh (`StateManager.currentStateType == "main"`) → chờ 5 giây → tải bảng
quà → hỏi trạng thái → nhận đúng gói đang sáng. Không có mục menu nào.

Bảng quà **đọc từ server**, không chép cứng — GUID đổi theo mỗi đợt hoạt động:

1. URL Loading.swf mang tham số `config` → `config.xml` / `config2.xml`.
2. Trong config lấy `REQUEST_PATH` → host phát dữ liệu (quest1 hay quest2).
3. `GET <REQUEST_PATH>gmactivityinfo.xml` → hoạt động `activityType=31`.

Ghép theo khoá chứ không theo cây XML: `<Gift>` mang sẵn `activityId`,
`<Condition>`/`<Reward>` trỏ ngược về `giftbagId`.

Đợt 31/08–13/09/2026 có 20 gói: `conditionIndex=1` giá trị 1..14 là quà từng
ngày (1 món/gói), `conditionIndex=2` giá trị 3/5/7/9/11/14 là quà mốc (3
món/gói). Bảng parse ra khớp 20/20 với bảng chép tay trước đó.

## Gói tin nhận quà

Đọc từ `signActivity.view.SignActivityItem`:

```actionscript
var info:SendGiftInfo = new SendGiftInfo();
info.activityId = SignActivityMgr.instance.model.actId;
var ids:Array = [];
for (var i:int = 0; i < giftInfo.giftRewardArr.length; i++)
    ids[i] = giftInfo.giftbagId;      // lặp CÙNG một id, mỗi món một lần
info.giftIdArr = ids;
var vec:Vector.<SendGiftInfo> = new Vector.<SendGiftInfo>();
vec.push(info);
SocketManager.Instance.out.sendWonderfulActivityGetReward(vec);
```

Hai chỗ đánh lừa: `describeType` báo hàm này **không có tham số** (thật ra là
`...rest`), và `giftIdArr` không phải danh sách nhiều gói.

## Lọc gói sáng

`WonderfulActivityManager.Instance.getActivityInitDataById(actId).statusArr`,
mỗi phần tử là `CanGetData{statusID, statusValue}`. `SignActivityItem` chỉ gắn
listener `"click"` khi `statusValue == 1`; `2` là đã nhận. `statusID` trùng
`giftbagOrder` (0..19). Chưa có dữ liệu thì gửi hết, server tự từ chối.

## Tìm mã ở đâu

Mã lõi giấu dưới đuôi `.png`: `CodeLoader.DDT_CLASS_PATH = "DDT_Core"`, nạp
bằng `loadPNG()`. `http://res1.gnddt.com/flash/2.png` và `4.png` là SWF nén
CWS. Bản Zing (`res732.gn.zing.vn`, `gunny.vcdn.vn`) chung nguồn nên
`Loading.swf` của họ chỉ ra cơ chế này.

Đã bới mà KHÔNG có mã: 109 module `flash/ui/vietnam/swf/*.swf` (toàn ảnh/skin,
tên lấy từ tên tệp cache SharedObject vì config.xml không liệt kê hết),
`game.swf`/`gameii.swf` (không có DoABC nào), `Loading.swf` (chỉ
`com.pickgliss` + preloader), 13.326 tệp `.sol`, 328 tệp `.tmp` của plugin.

## Đã loại trừ (gửi được, không ra quà, trạng thái CÓ nhận được)

`sendSignIn(int)` 0..100, `sendSignAward(int)` 0..100, `sendDailyAward(int)`
0..100, `sendBuyGift(giftbagId, a, b, c)` với a,b,c ∈ 0..2. Mọi hàm nhận `int`
đều không thể đúng — định danh là GUID.

Lớp đoán sai: `calendar.CalendarManager` (bảng lịch, hệ khác),
`activity.signin.SignInManager` (bảng 28 ngày trong tháng, nạp từ
`ts_everydaysignin.xml`, hệ khác).

## Bẫy đã vấp, ghi để khỏi lặp

- `loaderInfo.url` trả về SWF chứa **display list**, không phải nơi định nghĩa
  lớp → mọi đối tượng đều báo `Loading.swf`. Không dùng để tìm module.
- `config.xml` mở đầu bằng **BOM UTF-8** rồi mới tới `<`; `gmactivityinfo.xml`
  là zlib trần. Đoán kiểu phải cắt BOM trước.
- Khối ABC chứa `ClassUtils` **không cố định** (15 → 14 khi server đổi
  Loading.swf). Tìm bằng cách rabcdasm rồi xem khối nào đẻ ra
  `ClassUtils.class.asasm`.
- Nhánh lệnh cuối trong `CMD_BODY` mà nhảy thẳng `LcMagic` thì các nhánh sau
  thành mã chết — RABCDAsm in ra dạng byte thô trong comment.
- Suy từ kiểu dữ liệu sang tên hàm (`GiftBagInfo` → `sendWonderfulActivity`) là
  đoán, không phải bằng chứng. Sai hai lần liền.

## Nguồn lag

Nhận quà → nhiệm vụ/độ hoạt động ngày đổi → game chạy animation thanh tiến
trình → gọi `setDailyTask`/`setDailyActivity` **mỗi khung hình** (đo được ~40
lần/giây). Mỗi lần là một cú NPObject sang host cộng một lượt mở/ghi/đóng tệp
log. Đã bỏ chuyển tiếp hai callback đó và giữ tệp log mở.

## Chưa rõ

- Phần lọc trạng thái (`g:`) chưa có lần chạy thật nào xác nhận.
- Ba tham số int của `sendBuyGift` nghĩa là gì (không còn cần, ghi cho đủ).
