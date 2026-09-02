# ✅ Ruffle boot Gunny end-to-end + Web-launch contract đầy đủ

Date: 2026-09-02 | Scope: test thực nghiệm với account thật (đã dừng, không đụng code TienTool)
Artifacts: `<scratchpad>/rf-real.log`, `config2.xml`, `pg2.html`, `flash-res-server.py`

## TL;DR

**Ruffle chạy được toàn bộ Gunny từ Loading tới bước mở socket game server.** Không còn nghi ngờ về khả thi runtime. Hướng "Ruffle, không wrapper" chốt được.

## 1. Web-launch contract (bằng chứng từ debug web của bạn + tự dò)

Chuỗi khởi động chính chủ, không cần launcher .NET:

```
1. Login  → POST api.gnddt.com/api/Launcher/LauncherWebV566   (user, pass, PublicKey-HWID)
              → trả TOKEN
2. Gate   → GET play.gnddt.com/RedircetPlayGame?user=<TOKEN>&s=<AreaID>
              → set cookie ASP.NET_SessionId, JS check IP (ipify) → PlayGame.aspx
3. Embed  → PlayGame.aspx render <embed src=
     http://res1.gnddt.com/flash/Loading.swf
       ?user=<username>&key=<GUID-session>&isGuest=False&loginType=0
       &fbapp=false&v=10950&rand=<ticks>
       &config=http://config.gnddt.com/config<AreaID>.xml
4. Boot   → Loading.swf đọc config → nạp module → mở SOCKET tới host:5840
```

Điểm mấu chốt: **`user=` ở bước 2 = token, `key=` ở bước 3 = GUID session** (khác nhau). Token đổi lấy session key qua gate. Server thứ 2 = `AreaID=2` "Gà MYTHIC" → `config2.xml`.

## 2. Test Ruffle với flashvars THẬT — kết quả

Serve `resource/` qua local server (`flash-res-server.py`), flashvars thật (key GUID `56e92533-…` từ debug của bạn), Ruffle desktop v0.5.0:

**Game boot đầy đủ, quan sát qua avm_trace gốc:**
- Loading.swf v28 (LZMA) load OK, 1000x600 @25fps
- Nạp nguyên **chuỗi module**: `7roadlogo`, `audiolite`, `ddthall`, `ddthallIcon`, `ddthallmain`, `wonderfulactivity`, `ddtcorei`, `ddtcoreii`, … — `moduleloader: … 加载完成` (tải xong) từng cái
- Kéo **~200 template XML** từ `quest2.gnddt.com` (ItemStrengthen, Pet, Relic, Suit, Mount, FightSpirit…) — `compressTextloader … 加载完成`
- Load **Starling GPU textures** (`hall_newyear_scene_build.png`, `default_resource.png`) — engine đồ họa tăng tốc phần cứng của game chạy được trên Ruffle
- Gọi `LoginSelectList.ashx`, `Login.ashx`
- **Mở socket**: `Failed to connect to 127.0.0.1:5840` (lặp lại, retry)

**Kết luận chắc chắn:**
- Game server socket = **host:5840**, host **lấy theo origin** nơi Loading.swf được nạp (nạp từ 127.0.0.1 → gõ 127.0.0.1:5840). Khi chạy web thật, origin là host game → gõ host đó:5840.
- Ruffle stub `Security.loadPolicyFile()` — cần cấu hình crossdomain, không phải chặn cứng.
- **0 panic, 0 lỗi tương thích AS3.** Hai "error" (`#2082 already connected`, `InvalidDomain`) là do môi trường test (retry socket, cross-domain), không phải Ruffle thiếu tính năng.

## 3. Ý nghĩa: 3 mảnh ghép cuối đã rõ

| Mảnh | Trạng thái |
|---|---|
| Runtime chạy game | ✅ Ruffle — boot tới socket, có cả Starling GPU |
| Cách mở game không launcher | ✅ contract mục 1 |
| Địa chỉ game server | ✅ `<host>:5840`, socket theo origin |
| Bridge AS3 | ✅ `ExternalInterface` có trong core (Loading/DDT_Loading) |
| Đọc packet | ✅ Ruffle `socketProxy` → WS↔TCP bridge |
| Custom right-click | web dùng `rightClick.js` chặn context menu gốc → **menu là HTML overlay, không cần patch SWF** cho cái này |

Riêng điểm cuối lật lại kết luận report #4: **bản web đã chứng minh right-click custom làm bằng JS/HTML overlay** (`rightClick.js` chỉ `return false` trên context menu của `<object>` rồi vẽ menu riêng). Không bắt buộc patch SWF. Patch SWF chỉ cần cho tính năng đọc/sửa state sâu.

## 4. Kiến trúc chốt (đề xuất cuối)

```
TienTool (Electron 41, giữ nguyên)
  ├─ login (đã có) → token → gate → session key
  ├─ Ruffle (ruffle web WASM) nhúng trong renderer  ← chạy game, KHÔNG wrapper Flash
  │     RufflePlayer.config.socketProxy = [{host, port:5840, proxyUrl:"ws://127.0.0.1:PORT"}]
  ├─ WS↔TCP bridge (Node ~60 dòng)  → forward tới <gamehost>:5840, dump/parse/sửa packet
  ├─ local HTTP server serve resource + play.html (menu bar + overlay canvas)
  └─ menu/right-click = HTML overlay (như rightClick.js), aim 3 tia = canvas overlay
```

Toàn bộ trong **1 process Electron 41**. Không Electron 9/11, không pepflash, không NPSWF32, không Qt, không sửa hosts (né `CheckHost()`).

## 5. Cái vẫn chưa chứng minh (trung thực)

- **Gameplay trận đấu thật** (bắn, vật lý, particle): mới boot tới sảnh + socket, **chưa vào trận**. Cần socket sống. Đây vẫn là rủi ro Ruffle lớn nhất còn lại.
- **Hiệu năng**: boot mất ~20s trong test (có tải mạng). Cần đo FPS khi đánh nhau.
- **Socket thật chưa nối**: key GUID trong debug có thể đã hết hạn. Cần 1 phiên login tươi.

## 6. Bước tiếp theo

1. **Viết WS↔TCP bridge** + `play.html` nhúng ruffle-web + `socketProxy` trỏ `<gamehost>:5840`. Cần biết gamehost thật (khả năng cao = `play.gnddt.com` hoặc IP `15.235.219.79` bạn thấy trong debug).
2. Login tươi lấy session key mới → nối socket thật → **vào sảnh + đánh 1 trận** qua Ruffle. Mốc chốt cuối cùng.
3. Bridge chạy → **dump packet** → bắt đầu protocol map (đối chiếu source DDTank-3.0).
4. Nếu gameplay Ruffle lỗi nặng → fallback NPAPI host (nhẹ nhất, như LazyTool).

## 7. Trạng thái công cụ

- `flash-res-server.py` — local resource server (đã dừng). Có alias `config<N>.xml`→`config.xml` (giờ nên bỏ, dùng `config.gnddt.com/config2.xml` thật).
- `abc-strings.py` — parse ABC constant pool không cần Java.
- Ruffle v0.5.0: `<scratchpad>/ruffle/ruffle.exe`
- ilspycmd (global dotnet tool) để decompile .NET.

## Câu hỏi chưa rõ

1. Gamehost thật cho socket :5840 — là `play.gnddt.com` hay IP `15.235.219.79`? (Cần để cấu hình bridge; tôi có thể tự dò bằng phiên login mới.)
2. **`api.gnddt.com` — bạn vận hành server hay người chơi?** (hỏi lần 4 — giờ quan trọng hơn vì nó quyết định: nếu bạn có quyền server thì test socket/gameplay thoải mái, không sợ ban.)
3. Cho tôi chạy tiếp bước 6.1–6.2 (dựng bridge + login tươi + vào trận) luôn không? Đây là lúc chuyển từ recon sang PoC thật.
4. Bản web `v=10950` — có phải phiên bản resource mới nhất không? (resource local trong máy có thể cũ hơn, nhưng server tự lazy-download nên không chặn.)
