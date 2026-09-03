"""Chèn cầu nối công cụ vào ClassUtils của Loading.swf, ở mức assembly.

Cách dùng (cần RABCDAsm — https://github.com/CyberShadow/RABCDAsm/releases):

    abcexport Loading.swf                 # tách 171 khối ABC; ClassUtils nằm ở 15
    rabcdasm Loading-15.abc
    python patch-loading-swf.py Loading-15/com/pickgliss/utils/ClassUtils.class.asasm
    rabcasm Loading-15/Loading-15.main.asasm
    abcreplace Loading.swf 15 Loading-15/Loading-15.main.abc

Vì sao không dùng JPEXS: trình biên dịch AS3 của nó dựng lại cả class từ mã nguồn
và tự nhận là EXPERIMENTAL. Ở đây chỉ thêm trait vào bản disassembly rồi lắp ráp
lại, nên phần bytecode cũ giữ nguyên từng byte.

Vì sao SWF phải tự hỏi vòng thay vì đăng ký ExternalInterface callback: chiều
JS -> Flash hỏng hẳn trong QtWebKit — gọi cả callback GỐC của game
(SetFlashLoadExternal) cũng ra "Error calling method on NPObject". Chiều ngược
lại (ExternalInterface.call) thì chạy tốt.

Vì sao móc vào CreatInstance: hàm này chắc chắn được gọi sớm và nhiều lần, còn
cinit chạy trước khi ExternalInterface sẵn sàng.

Lệnh nhận qua hàng đợi của trang:
    q:<mức>    chất lượng vẽ (high/medium/low)
    s:<kiểu>   kiểu co giãn (showAll/noScale), giữ lại và ép mỗi nhịp
    m:         dọn thư: nhận hết đính kèm rồi xếp túi
    b:         xếp túi vào cả 5 két, mỗi két một gói, giãn ra cho server kịp
    d:         điểm danh + nhận quà ngày (tự chạy một lần sau khi vào sảnh)
    c:         đọc trạng thái bảng lịch ra log (số ngày điểm danh, mốc quà)
    còn lại    mở kho ma pháp, tab Kho báu
"""
import io
import sys

path = sys.argv[1]
# --probe: báo ra tên lớp của mọi thành phần giao diện, mỗi tên đúng một lần.
# Dùng để tìm mốc nhận biết trạng thái game từ dữ liệu thật thay vì đoán. Không
# bật trong bản dùng hằng ngày — nó nói quá nhiều.
probe = "--probe" in sys.argv[2:]
# --auto-bag: chạy chuỗi xếp túi ngay sau khi nạp, khỏi cần người bấm. Chỉ dùng
# lúc dò lỗi.
auto_bag = "--auto-bag" in sys.argv[2:]
# --bag-stage <n>: cắt bớt thân toolPushBank để khoanh vùng chỗ hỏng.
#   1 chỉ trả về chuỗi, 2 thêm phần lấy túi/két, 3 thêm vòng quét két,
#   4 thêm vòng quét túi, 5 (mặc định) đầy đủ.
bag_stage = 5
if "--bag-stage" in sys.argv:
    bag_stage = int(sys.argv[sys.argv.index("--bag-stage") + 1])
s = io.open(path, encoding="utf-8").read()

EI = 'QName(PackageNamespace("flash.external"), "ExternalInterface")'
KEY = 'MultinameL([PackageNamespace("")])'


def pub(name):
    return 'QName(PackageNamespace(""), "%s")' % name


def op(name, arg=""):
    return "     %-19s %s\n" % (name, arg) if arg else "     %s\n" % name


def get_prop(name):
    return op("getproperty", pub(name))


def get_class(name):
    """getDefinitionByName(name) -> Class trên đỉnh stack.

    Bấm nút trước khi người chơi chạm vào bất cứ giao diện nào thì lớp của
    magicHouse ra Error #1065: chúng nằm ở ApplicationDomain khác và chỉ hiện ra
    sau khi game tự nạp module giao diện lần đầu — đúng cú đơ vài giây mà bản
    game chính thức cũng có. Các lớp ddt.manager.* thì thấy được ngay.

    `ClassUtils.uiSourceDomain.getDefinition()` cũng đã thử, vẫn #1065.
    """
    return (op("getlex", 'QName(PackageNamespace("flash.utils"), "getDefinitionByName")')
            + op("getglobalscope")
            + op("pushstring", '"%s"' % name)
            + op("call", "1"))


def report(expr):
    """ExternalInterface.call("toolLog", <biểu thức đã sinh ra một chuỗi>)."""
    return (op("getlex", EI)
            + op("pushstring", '"toolLog"')
            + expr
            + op("callpropvoid", "%s, 2" % pub("call"))
            + "\n")


def ret(text):
    return op("pushstring", '"%s"' % text) + op("returnvalue")


# Lấy lớp qua findpropstrict chứ không qua getlocal0: trong một closure làm
# listener thì không chắc local0 còn là đối tượng lớp.
CLS = (op("findpropstrict", 'QName(PackageNamespace("com.pickgliss.utils"), "ClassUtils")')
       + op("getproperty", 'QName(PackageNamespace("com.pickgliss.utils"), "ClassUtils")'))

# Stage lấy qua lớp đầu tiên của LayerManager. LayerManager nằm ngay trong
# Loading.swf nên getlex tới thẳng, không vướng chuyện khác ApplicationDomain.
STAGE = (op("getlex", 'QName(PackageNamespace("com.pickgliss.ui"), "LayerManager")')
         + get_prop("Instance")
         + op("pushbyte", "0")
         + op("callproperty", "%s, 1" % pub("getLayerByType"))
         + get_prop("stage"))


def try_block(name):
    """Khối try dùng nhãn L<name>Try / L<name>End / L<name>Catch."""
    return ('    try\n'
            '     from L%sTry\n'
            '     to L%sEnd\n'
            '     target L%sCatch\n'
            '     type %s\n'
            '     name null\n'
            '    end ; try\n' % (name, name, name, pub("Error")))


def catch_prologue():
    """Vào catch thì ngăn scope bị xoá và ngoại lệ nằm trên stack."""
    return op("getlocal0") + op("pushscope")


# ----------------------------------------------------------------- CreatInstance

# Dựng Timer một lần duy nhất, canh bằng cờ _toolReg. Timer phải cất vào slot
# tĩnh, không thì bộ nhớ tự động thu hồi và vòng hỏi chết lặng.
PROLOGUE = (
    op("getlocal0") + get_prop("_toolReg") + op("iftrue", "LtoolSkip") + "\n"
    + op("getlex", EI) + get_prop("available") + op("iffalse", "LtoolSkip") + "\n"
    + op("getlocal0") + op("pushtrue") + op("setproperty", pub("_toolReg")) + "\n"
    + op("getlocal0")
    + op("findpropstrict", 'QName(PackageNamespace("flash.utils"), "Timer")')
    + op("pushshort", "250")
    + op("constructprop", 'QName(PackageNamespace("flash.utils"), "Timer"), 1')
    + op("setproperty", pub("_toolTimer")) + "\n"
    + op("getlocal0") + get_prop("_toolTimer")
    + op("dup")
    + op("pushstring", '"timer"')
    + op("getlocal0") + get_prop("toolTick")
    + op("callpropvoid", "%s, 2" % pub("addEventListener"))
    + op("callpropvoid", "%s, 0" % pub("start")) + "\n"
    + ((op("getlocal0") + op("pushbyte", "1")
        + op("setproperty", pub("_toolBagStep")) + "\n") if auto_bag else "")
    + "LtoolSkip:\n")

# Báo tên lớp lần đầu gặp. Lọc trùng ngay trong AS3: CreatInstance được gọi liên
# tục, gọi ExternalInterface mỗi lần thì game giật.
PROBE = (
    op("getlocal0") + get_prop("_toolSeen") + op("pushnull") + op("ifne", "LseenReady") + "\n"
    + op("getlocal0") + op("newobject", "0") + op("setproperty", pub("_toolSeen")) + "\n"
    + "LseenReady:\n"
    + op("getlocal0") + get_prop("_toolSeen") + op("getlocal1")
    + op("getproperty", KEY) + op("iftrue", "LseenSkip") + "\n"
    + op("getlocal0") + get_prop("_toolSeen") + op("getlocal1") + op("pushtrue")
    + op("setproperty", KEY) + "\n"
    + report(op("pushstring", '"cls "') + op("getlocal1") + op("add"))
    + "LseenSkip:\n")

ANCHOR = "     pushnull\n     setlocal            4\n"
assert s.count(ANCHOR) == 1, "mốc CreatInstance không duy nhất: %d" % s.count(ANCHOR)
s = s.replace(ANCHOR, PROLOGUE + (PROBE if probe else "") + ANCHOR)

# ---------------------------------------------------------------------- toolTick

# Theo dõi trạng thái game để bên ngoài biết lúc nào vào trận, lúc nào ra.
#
# Đọc thẳng StateManager.currentStateType (getter tĩnh) chứ không đoán theo tên
# component đang được dựng: tên component chỉ xuất hiện lúc mở màn, không có mốc
# nào cho lúc đóng, và mỗi tên chỉ dựng một lần cho cả phiên.
STATE_BODY = (
    "LsTry:\n"
    + get_class("ddt.manager.StateManager") + get_prop("currentStateType")
    + op("coerce_s") + op("setlocal3") + "\n"
    + CLS + get_prop("_toolState") + op("getlocal3") + op("ifeq", "LsEnd") + "\n"
    + CLS + op("getlocal3") + op("setproperty", pub("_toolState")) + "\n"
    + report(op("pushstring", '"state "') + op("getlocal3") + op("add"))
    # Vừa vào sảnh thì hẹn giờ điểm danh. Chỉ một lần cho cả phiên: state đổi
    # qua lại mỗi trận đánh, điểm danh lại mỗi lần là gửi gói thừa vô ích.
    + CLS + get_prop("_toolDailyDone") + op("iftrue", "LsEnd") + "\n"
    + op("getlocal3") + op("pushstring", '"main"') + op("ifne", "LsEnd") + "\n"
    + CLS + op("pushtrue") + op("setproperty", pub("_toolDailyDone"))
    + CLS + op("pushbyte", "1") + op("setproperty", pub("_toolDailyStep")) + "\n"
    + "LsEnd:\n" + op("jump", "LsAfter") + "\n"
    + "LsCatch:\n" + catch_prologue() + op("pop") + "\n"
    + "LsAfter:\n")

# Ép lại scaleMode mỗi nhịp: game tự đặt lại khi vào màn game. So trước rồi mới
# đặt, không thì bắt Flash tính lại bố cục 4 lần mỗi giây.
ENFORCE_BODY = (
    "LeTry:\n"
    + CLS + get_prop("_toolScale") + op("coerce_s") + op("setlocal3")
    + op("getlocal3") + op("iffalse", "LeEnd") + "\n"
    + STAGE + get_prop("scaleMode") + op("getlocal3") + op("ifeq", "LeEnd") + "\n"
    + STAGE + op("getlocal3") + op("setproperty", pub("scaleMode")) + "\n"
    + "LeEnd:\n" + op("jump", "LeAfter") + "\n"
    + "LeCatch:\n" + catch_prologue() + op("pop") + "\n"
    + "LeAfter:\n")

# Xếp túi: _toolBagStep đếm 1..20, cứ 4 nhịp (1 giây) đẩy một két. Giãn ra vì
# server phải trả lời xong thì mô hình túi mới đúng cho két kế tiếp; bắn 5 gói
# liên tiếp là bốn gói sau tính trên dữ liệu cũ.
#
# Đếm từ 1 chứ không từ 0: slot kiểu int mặc định bằng 0, nên 0 phải là "đang
# rảnh". Dùng 0 làm bước đầu thì chuỗi tự nổ ngay lúc game vừa nạp.
BAG_STEP_BODY = (
    "LbTry:\n"
    + CLS + get_prop("_toolBagStep") + op("convert_i") + op("setlocal3")
    + op("getlocal3") + op("iffalse", "LbEnd") + "\n"
    + op("getlocal3") + op("decrement_i") + op("setlocal2")
    + op("getlocal2") + op("pushbyte", "4") + op("modulo") + op("convert_i")
    + op("iftrue", "LbNext") + "\n"
    + report(CLS + op("getlocal2") + op("pushbyte", "4") + op("divide")
             + op("convert_i")
             + op("callproperty", "%s, 1" % pub("toolPushBank")))
    + "LbNext:\n"
    + op("getlocal3") + op("increment_i") + op("setlocal3")
    + op("getlocal3") + op("pushbyte", "20") + op("ifle", "LbStore")
    + op("pushbyte", "0") + op("setlocal3") + "\n"
    + "LbStore:\n"
    + CLS + op("getlocal3") + op("setproperty", pub("_toolBagStep")) + "\n"
    + "LbEnd:\n" + op("jump", "LbAfter") + "\n"
    # Báo lỗi chứ không nuốt: nuốt thì hỏng ở đâu cũng chỉ thấy "không có gì
    # xảy ra". Hai khối trên nuốt được vì chúng ném liên tục trước khi game nạp
    # xong, còn khối này chỉ chạy khi người dùng bấm.
    + "LbCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + report(op("pushstring", '"xep tui hong: "') + op("getlocal2") + op("add"))
    + CLS + op("pushbyte", "0") + op("setproperty", pub("_toolBagStep")) + "\n"
    + "LbAfter:\n")

# Điểm danh: đợi 5 giây kể từ lúc vào sảnh rồi mới gửi. Gửi ngay lúc state đổi
# thì gói đi trước khi server dựng xong dữ liệu người chơi và bị bỏ qua lặng lẽ.
DAILY_STEP_BODY = (
    "LdTry:\n"
    + CLS + get_prop("_toolDailyStep") + op("convert_i") + op("setlocal3")
    + op("getlocal3") + op("iffalse", "LdEnd") + "\n"
    + op("getlocal3") + op("pushbyte", "20") + op("ifge", "LdRun") + "\n"
    + CLS + op("getlocal3") + op("increment_i")
    + op("setproperty", pub("_toolDailyStep")) + op("jump", "LdEnd") + "\n"
    + "LdRun:\n"
    + CLS + op("pushbyte", "0") + op("setproperty", pub("_toolDailyStep")) + "\n"
    + report(CLS + op("pushbyte", "0")
             + op("callproperty", "%s, 1" % pub("toolDaily")))
    + "LdEnd:\n" + op("jump", "LdAfter") + "\n"
    + "LdCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + report(op("pushstring", '"diem danh hong: "') + op("getlocal2") + op("add"))
    + CLS + op("pushbyte", "0") + op("setproperty", pub("_toolDailyStep")) + "\n"
    + "LdAfter:\n")

# Hỏi hàng đợi lệnh của trang 250ms một lần.
CMD_BODY = (
    "LcTry:\n"
    + op("getlex", EI) + op("pushstring", '"toolPoll"')
    + op("callproperty", "%s, 1" % pub("call")) + op("coerce_s") + op("setlocal2")
    + op("getlocal2") + op("iffalse", "LcEnd") + "\n"
    + op("getlocal2") + op("pushbyte", "0") + op("pushbyte", "2")
    + op("callproperty", "%s, 2" % pub("substr")) + op("setlocal3") + "\n"
    + op("getlocal3") + op("pushstring", '"q:"') + op("ifne", "LcNotQuality") + "\n"
    + STAGE + op("getlocal2") + op("pushbyte", "2")
    + op("callproperty", "%s, 1" % pub("substr"))
    + op("setproperty", pub("quality")) + op("jump", "LcEnd") + "\n"
    + "LcNotQuality:\n"
    + op("getlocal3") + op("pushstring", '"s:"') + op("ifne", "LcNotPet") + "\n"
    # Nhớ lại để khối ép bên trên đặt vào stage mỗi nhịp.
    + CLS + op("getlocal2") + op("pushbyte", "2")
    + op("callproperty", "%s, 1" % pub("substr"))
    + op("setproperty", pub("_toolScale")) + op("jump", "LcEnd") + "\n"
    + "LcNotPet:\n"
    + op("getlocal3") + op("pushstring", '"p:"') + op("ifne", "LcNotBatch") + "\n"
    + report(CLS + op("pushbyte", "0")
             + op("callproperty", "%s, 1" % pub("toolPet")))
    + op("jump", "LcEnd") + "\n"
    + "LcNotBatch:\n"
    + op("getlocal3") + op("pushstring", '"x:"') + op("ifne", "LcNotOpen") + "\n"
    + report(CLS + op("pushbyte", "0")
             + op("callproperty", "%s, 1" % pub("toolOpenBatch")))
    + op("jump", "LcEnd") + "\n"
    + "LcNotOpen:\n"
    + op("getlocal3") + op("pushstring", '"o:"') + op("ifne", "LcNotList") + "\n"
    + report(CLS + op("getlocal2") + op("pushbyte", "2")
             + op("callproperty", "%s, 1" % pub("substr")) + op("convert_i")
             + op("callproperty", "%s, 1" % pub("toolOpenSlot")))
    + op("jump", "LcEnd") + "\n"
    + "LcNotList:\n"
    + op("getlocal3") + op("pushstring", '"l:"') + op("ifne", "LcNotMail") + "\n"
    + report(CLS + op("pushbyte", "0")
             + op("callproperty", "%s, 1" % pub("toolBagList")))
    + op("jump", "LcEnd") + "\n"
    + "LcNotMail:\n"
      + op("getlocal3") + op("pushstring", '"m:"') + op("ifne", "LcNotBag") + "\n"
    + CLS + op("pushbyte", "1") + op("setproperty", pub("_toolMailStep"))
    + op("jump", "LcEnd") + "\n"
    + "LcNotBag:\n"
    + op("getlocal3") + op("pushstring", '"b:"') + op("ifne", "LcNotDaily") + "\n"
    + CLS + op("pushbyte", "1") + op("setproperty", pub("_toolBagStep"))
    + op("jump", "LcEnd") + "\n"
    + "LcNotDaily:\n"
    + op("getlocal3") + op("pushstring", '"d:"') + op("ifne", "LcNotCal") + "\n"
    + report(CLS + op("pushbyte", "0")
             + op("callproperty", "%s, 1" % pub("toolDaily")))
    + op("jump", "LcEnd") + "\n"
    + "LcNotCal:\n"
    + op("getlocal3") + op("pushstring", '"c:"') + op("ifne", "LcMagic") + "\n"
    + report(CLS + op("pushbyte", "0")
             + op("callproperty", "%s, 1" % pub("toolCalendar")))
    + op("jump", "LcEnd") + "\n"
    + "LcMagic:\n"
    + CLS + op("pushbyte", "1")
    + op("callpropvoid", "%s, 1" % pub("toolOpenMagicHouse")) + "\n"
    + "LcEnd:\n" + op("jump", "LcAfter") + "\n"
    + "LcCatch:\n" + catch_prologue() + op("pop") + "\n"
    + "LcAfter:\n" + op("returnvoid"))


# ------------------------------------------------------------ toolOpenMagicHouse

# show() chứ không phải dispatchEvent("showMainView"): show() nạp trước các module
# UI (magicHouse, ddtbagandinfo...) rồi mới phát sự kiện. Phát thẳng thì style
# "magicHouse.mainViewFrame" chưa có. Sảnh cũng gọi đúng hàm này (hall.HallStateView).
OPEN_BODY = (
    "LoTry:\n"
    + get_class("magicHouse.MagicHouseControl") + get_prop("instance")
    + op("callpropvoid", "%s, 0" % pub("setup")) + "\n"
    + get_class("magicHouse.MagicHouseModel") + get_prop("instance")
    + op("getlocal1") + op("setproperty", pub("viewIndex")) + "\n"
    + get_class("magicHouse.MagicHouseManager") + get_prop("instance")
    + op("callpropvoid", "%s, 0" % pub("show")) + "\n"
    + ret("magic ok")
    + "LoEnd:\n"
    + "LoCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + report(op("pushstring", '"magic loi: "') + op("getlocal2") + op("add"))
    + ret("magic loi"))

# ------------------------------------------------------------------ toolPushBank

# Bê nguyên thuật toán "xếp nhanh" của game (magicHouse.WarehouseView.
# __oneStepPushHandler), chỉ bỏ phần đọc dropdown và thay bằng tham số.
#
# Chỉ ghép vào ô ĐÃ CÓ item cùng loại — bản gốc cũng vậy, ô trống nó không dùng.
# Khoá gộp là TemplateID kèm cờ khoá, vì hàng khoá và không khoá không chồng
# được lên nhau.
#
# Bỏ phần tính số ô theo cấp VIP / cấp Guild của bản gốc: quét thẳng 100 ô là an
# toàn vì ô ngoài sức chứa trả về null, mà ta chỉ ghép vào ô có sẵn item.
BANK_TYPES = [51, 60, 70, 11, 53]

R_SELF, R_TYPE, R_BANK, R_BAG = 2, 3, 4, 5
R_FIRST, R_COUNT, R_EX, R_I = 6, 7, 8, 9
R_ITEM, R_KEY, R_TGT = 10, 11, 12


def local(n):
    return op("getlocal", str(n))


def store(n):
    return op("setlocal", str(n))


def make_key(reg):
    """key = String(item.TemplateID) + String(item.IsBinds) -> R_KEY.

    Hàng khoá và không khoá không chồng lên nhau được nên cờ khoá phải nằm trong
    khoá gộp. Bản gốc viết `IsBinds ? "true" : "false"`; ở đây convert_s trên
    Boolean cho đúng hai chuỗi ấy mà không cần nhánh rẽ nào.
    """
    return (local(reg) + get_prop("TemplateID") + op("coerce_s")
            + local(reg) + get_prop("IsBinds") + op("convert_s")
            + op("add") + store(R_KEY))


PART_HEAD = (
    "LpTry:\n"
    + get_class("ddt.manager.PlayerManager") + get_prop("Instance") + get_prop("Self")
    + store(R_SELF) + "\n"
    + "".join(op("pushshort", str(t)) for t in BANK_TYPES)
    + op("newarray", str(len(BANK_TYPES)))
    + op("getlocal1") + op("getproperty", KEY) + op("convert_i") + store(R_TYPE) + "\n"
    + local(R_SELF) + local(R_TYPE) + op("callproperty", "%s, 1" % pub("getBag"))
    + store(R_BANK)
    + local(R_SELF) + op("pushbyte", "1") + op("callproperty", "%s, 1" % pub("getBag"))
    + store(R_BAG)
    + op("newobject", "0") + store(R_FIRST)
    + op("newobject", "0") + store(R_COUNT)
    + op("newarray", "0") + store(R_EX) + "\n")

PART_SCAN_BANK = (
    # Vòng 1 — quét két, nhớ ô có SỐ LƯỢNG NHỎ NHẤT cho mỗi loại. Nhỏ nhất để
    # gộp được nhiều nhất trước khi chạm trần MaxCount.
    op("pushbyte", "0") + store(R_I) + "\n"
    + "Lp1:\n"
    + local(R_I) + op("pushbyte", "100") + op("ifge", "Lp1End") + "\n"
    + local(R_BANK) + local(R_I) + op("callproperty", "%s, 1" % pub("getItemAt"))
    + store(R_ITEM)
    + local(R_ITEM) + op("iffalse", "Lp1Next") + "\n"
    # isCanAdd: Count < MaxCount
    + local(R_ITEM) + get_prop("Count")
    + local(R_ITEM) + get_prop("MaxCount") + op("ifge", "Lp1Next") + "\n"
    + make_key(R_ITEM)
    + local(R_FIRST) + local(R_KEY) + op("getproperty", KEY)
    + op("pushundefined") + op("ifstrictne", "Lp1Have") + "\n"
    + local(R_FIRST) + local(R_KEY) + local(R_I) + op("setproperty", KEY)
    + local(R_COUNT) + local(R_KEY) + local(R_ITEM) + get_prop("Count")
    + op("setproperty", KEY) + op("jump", "Lp1Next") + "\n"
    + "Lp1Have:\n"
    + local(R_ITEM) + get_prop("Count")
    + local(R_COUNT) + local(R_KEY) + op("getproperty", KEY)
    + op("ifge", "Lp1Next") + "\n"
    + local(R_FIRST) + local(R_KEY) + local(R_I) + op("setproperty", KEY)
    + local(R_COUNT) + local(R_KEY) + local(R_ITEM) + get_prop("Count")
    + op("setproperty", KEY) + "\n"
    + "Lp1Next:\n"
    + local(R_I) + op("increment_i") + store(R_I) + op("jump", "Lp1") + "\n"
    + "Lp1End:\n")

PART_SCAN_BAG = (
    # Vòng 2 — quét 48 ô túi, ghép vào ô đã nhớ.
    op("pushbyte", "0") + store(R_I) + "\n"
    + "Lp2:\n"
    # Bản gốc dừng ở 48 nên bỏ sót ô thứ 49 — túi là 7x7. Quét rộng hơn sức
    # chứa không hại gì: ô ngoài trả về null, mà ta chỉ ghép vào ô két đã có sẵn.
    + local(R_I) + op("pushbyte", "60") + op("ifge", "Lp2End") + "\n"
    + local(R_BAG) + local(R_I) + op("callproperty", "%s, 1" % pub("getItemAt"))
    + store(R_ITEM)
    + local(R_ITEM) + op("iffalse", "Lp2Next") + "\n"
    + make_key(R_ITEM)
    + local(R_FIRST) + local(R_KEY) + op("getproperty", KEY)
    + op("pushundefined") + op("ifstricteq", "Lp2Next") + "\n"
    + local(R_BANK) + local(R_FIRST) + local(R_KEY) + op("getproperty", KEY)
    + op("callproperty", "%s, 1" % pub("getItemAt")) + store(R_TGT) + "\n"
    # Hàng có hạn dùng (380029) chỉ gộp được khi cùng ngày hết hạn.
    + local(R_ITEM) + get_prop("TemplateID") + op("pushint", "380029")
    + op("ifne", "Lp2Ok") + "\n"
    + local(R_ITEM) + get_prop("remainDate")
    + local(R_TGT) + get_prop("remainDate") + op("ifne", "Lp2Next") + "\n"
    + "Lp2Ok:\n"
    + local(R_COUNT) + local(R_KEY) + op("getproperty", KEY)
    + local(R_ITEM) + get_prop("Count") + op("add")
    + local(R_ITEM) + get_prop("MaxCount") + op("ifgt", "Lp2Next") + "\n"
    + local(R_ITEM) + get_prop("remainDate") + op("pushbyte", "0")
    + op("ifle", "Lp2Next") + "\n"
    + local(R_EX)
    + op("pushstring", '"place"') + local(R_I)
    + op("pushstring", '"toplace"') + local(R_FIRST) + local(R_KEY)
    + op("getproperty", KEY)
    + op("newobject", "2") + op("callpropvoid", "%s, 1" % pub("push")) + "\n"
    + local(R_COUNT) + local(R_KEY)
    + local(R_COUNT) + local(R_KEY) + op("getproperty", KEY)
    + local(R_ITEM) + get_prop("Count") + op("add")
    + op("setproperty", KEY) + "\n"
    + "Lp2Next:\n"
    + local(R_I) + op("increment_i") + store(R_I) + op("jump", "Lp2") + "\n"
    + "Lp2End:\n")

PART_SEND = (
    local(R_EX) + get_prop("length") + op("iffalse", "LpNone") + "\n"
    + get_class("ddt.manager.SocketManager") + get_prop("Instance") + get_prop("out")
    + op("pushbyte", "1") + local(R_TYPE) + local(R_EX)
    + op("callpropvoid", "%s, 3" % pub("sendOneStepBagToBank")) + "\n"
    + op("pushstring", '"ket "') + local(R_TYPE) + op("add")
    + op("pushstring", '": xep "') + op("add")
    + local(R_EX) + get_prop("length") + op("add")
    + op("pushstring", '" mon"') + op("add") + op("returnvalue") + "\n"
    + "LpNone:\n"
    + op("pushstring", '"ket "') + local(R_TYPE) + op("add")
    + op("pushstring", '": khong co gi de gop"') + op("add") + op("returnvalue") + "\n")

PART_TAIL = (
    "LpEnd:\n"
    + "LpCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + store(R_KEY) + "\n"
    + op("pushstring", '"xep tui loi: "') + local(R_KEY) + op("add")
    + op("returnvalue"))

# Ghép theo giai đoạn để khoanh vùng: mỗi giai đoạn phải tự trả về một giá trị,
# nếu không hàm rơi ra ngoài khối code.
PARTS = [PART_HEAD, PART_SCAN_BANK, PART_SCAN_BAG, PART_SEND]
PUSH_BANK_BODY = ("".join(PARTS[:bag_stage])
                  + (ret("giai doan %d" % bag_stage) if bag_stage < 4 else "")
                  + PART_TAIL)

# Dọn thư chạy theo nhịp giống xếp túi, nhưng giãn 2 giây vì danh sách thư tải
# qua HTTP chứ không qua socket game.
MAIL_STEP_BODY = (
    "LnTry:\n"
    + CLS + get_prop("_toolMailStep") + op("convert_i") + op("setlocal3")
    + op("getlocal3") + op("iffalse", "LnEnd") + "\n"
    + op("getlocal3") + op("decrement_i") + op("setlocal2")
    + op("getlocal2") + op("pushbyte", "2") + op("modulo") + op("convert_i")
    + op("iftrue", "LnNext") + "\n"
    + op("getlocal2") + op("pushbyte", "2") + op("divide") + op("convert_i")
    + op("setlocal2")
    + op("getlocal2") + op("pushbyte", "3") + op("iflt", "LnReady") + "\n"
    # Xong phần thư: giao lại cho bộ xếp túi và dừng.
    + CLS + op("pushbyte", "1") + op("setproperty", pub("_toolBagStep"))
    + CLS + op("pushbyte", "0") + op("setproperty", pub("_toolMailStep"))
    + op("jump", "LnEnd") + "\n"

    # Nhịp nhận đính kèm chờ theo cờ isLoaded của EmailModel chứ không chờ theo
    # đồng hồ: danh sách thư về sau chừng nửa giây, đặt cứng 2 giây là phí.
    # Không tăng bộ đếm khi chưa xong, nên nhịp sau vào lại đúng chỗ này.
    + "LnReady:\n"
    + op("getlocal2") + op("pushbyte", "1") + op("ifne", "LnRun") + "\n"
    + get_class("email.MailManager") + get_prop("Instance") + get_prop("Model")
    + get_prop("isLoaded") + op("iftrue", "LnRun") + "\n"
    # Chờ mãi mà không thấy thì bỏ, đừng để kẹt im lặng.
    + CLS + get_prop("_toolMailWait") + op("convert_i") + op("increment_i")
    + op("setlocal3")
    + CLS + op("getlocal3") + op("setproperty", pub("_toolMailWait"))
    + op("getlocal3") + op("pushbyte", "40") + op("iflt", "LnEnd") + "\n"
    + report(op("pushstring", '"don thu: khong tai duoc danh sach"'))
    + CLS + op("pushbyte", "0") + op("setproperty", pub("_toolMailStep"))
    + op("jump", "LnEnd") + "\n"
    + "LnRun:\n"
    + report(CLS + op("getlocal2")
             + op("callproperty", "%s, 1" % pub("toolMail")))
    + "LnNext:\n"
    + op("getlocal3") + op("increment_i") + op("setlocal3")
    + CLS + op("getlocal3") + op("setproperty", pub("_toolMailStep")) + "\n"
    + "LnEnd:\n" + op("jump", "LnAfter") + "\n"
    + "LnCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + report(op("pushstring", '"don thu hong: "') + op("getlocal2") + op("add"))
    + CLS + op("pushbyte", "0") + op("setproperty", pub("_toolMailStep")) + "\n"
    + "LnAfter:\n")


# ------------------------------------------------------------------ toolDaily

# Điểm danh và nhận quà ngày.
#
# Cả ba việc đi qua một gói duy nhất, gói 13 mang một số nguyên "getWay"
# (GameSocketOut.sendDailyAward). Ba giá trị client dùng, đọc từ module lịch:
#
#     5 -> điểm danh hôm nay   (CalendarControl.setSignInfo)
#     0 -> nhận quà ngày       (CalendarControl.reciveDayAward)
#     3 -> nhận gói quà VIP    (CalendarFrame.__sendReward)
#
# Bản gốc chặn trước bằng cờ phía client (dailyAwardState, hasSigned) rồi mới
# gửi. Ở đây không đọc được những cờ đó — chúng nằm trong calendar.CalendarManager,
# lớp chỉ hiện ra sau khi người chơi mở bảng lịch — nên cứ gửi và để server tự
# từ chối. Gửi thừa không mất gì: server chỉ phát quà một lần mỗi ngày.
#
# Riêng gói VIP thì hỏi được: cờ nằm trên PlayerManager.Instance.Self.
#
# Quà mốc ("đủ 3/7/15… ngày") là gói khác, gói 90 mang số ngày đã điểm danh
# (sendSignAward). Mốc lấy từ chính tệp cấu hình game đọc lúc đăng nhập,
# quest2.gnddt.com/dailyawardlist.xml: các Item có GetWay="4", trường AwardDays.
# Gửi cả năm mốc, server tự từ chối mốc chưa tới hoặc đã nhận — client gốc cũng
# gửi đúng gói này, chỉ khác là nó lọc trước bằng dữ liệu trong bảng lịch.
SIGN_MILESTONES = [3, 7, 15, 23, 28]

R_OUT2, R_SELF2 = 2, 3

DAILY_BODY = (
    "LdaTry:\n"
    + get_class("ddt.manager.SocketManager") + get_prop("Instance") + get_prop("out")
    + store(R_OUT2) + "\n"
    + local(R_OUT2) + op("pushbyte", "5")
    + op("callpropvoid", "%s, 1" % pub("sendDailyAward")) + "\n"
    + local(R_OUT2) + op("pushbyte", "0")
    + op("callpropvoid", "%s, 1" % pub("sendDailyAward")) + "\n"
    + "".join(local(R_OUT2) + op("pushbyte", str(n))
              + op("callpropvoid", "%s, 1" % pub("sendSignAward")) + "\n"
              for n in SIGN_MILESTONES)
    + get_class("ddt.manager.PlayerManager") + get_prop("Instance") + get_prop("Self")
    + store(R_SELF2)
    + local(R_SELF2) + op("iffalse", "LdaNoVip")
    + local(R_SELF2) + get_prop("canTakeVipReward") + op("iffalse", "LdaNoVip") + "\n"
    + local(R_OUT2) + op("pushbyte", "3")
    + op("callpropvoid", "%s, 1" % pub("sendDailyAward")) + "\n"
    + ret("diem danh: da gui ngay + moc + goi VIP") + "\n"
    + "LdaNoVip:\n"
    + ret("diem danh: da gui ngay + moc") + "\n"
    + "LdaEnd:\n"
    + "LdaCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + report(op("pushstring", '"diem danh loi: "') + op("getlocal2") + op("add"))
    + ret("diem danh loi"))


# --------------------------------------------------------------- toolCalendar

# Đọc trạng thái bảng lịch.
#
# calendar.CalendarManager chỉ hiện ra sau khi người chơi mở bảng lịch một lần —
# nó nằm ở module giao diện, không phải lõi. Gọi sớm thì #1065, khối try bắt lại
# và báo ra, không làm chết vòng nhịp.
#
# Không đọc `model`: nó chỉ tồn tại trong lúc khung lịch đang mở, đóng khung là
# thành null (CalendarControl.__frameDispose). Ba thứ dưới đây sống lâu hơn:
# hasTodaySigned() đọc dayLog do lần tải HTTP gần nhất để lại, còn dailyAwardState
# và Self.Sign là cờ của phiên.
R_CAL, R_SELF3 = 2, 3

CALENDAR_BODY = (
    "LclTry:\n"
    + get_class("calendar.CalendarManager")
    + op("callproperty", "%s, 0" % pub("getInstance")) + store(R_CAL) + "\n"
    + get_class("ddt.manager.PlayerManager") + get_prop("Instance") + get_prop("Self")
    + store(R_SELF3) + "\n"
    + op("pushstring", '"lich: homNayDaDiemDanh="')
    + local(R_CAL) + op("callproperty", "%s, 0" % pub("hasTodaySigned")) + op("add")
    + op("pushstring", '" conQuaNgay="') + op("add")
    + local(R_CAL) + get_prop("dailyAwardState") + op("add")
    + op("pushstring", '" coSign="') + op("add")
    + local(R_SELF3) + get_prop("Sign") + op("add")
    + op("pushstring", '" conGoiVIP="') + op("add")
    + local(R_SELF3) + get_prop("canTakeVipReward") + op("add")
    + op("returnvalue") + "\n"
    + "LclEnd:\n"
    + "LclCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + op("pushstring", '"lich loi: "') + op("getlocal2") + op("add")
    + op("returnvalue"))


# ------------------------------------------------------------------- toolMail

# Dọn thư: nạp danh sách, nhận hết đính kèm, rồi để bộ xếp túi đẩy sang két.
#
# Không có cách nhận thẳng vào két: gói 113 chỉ mang loại thư và danh sách ID,
# server luôn trả đính kèm vào túi. Món nào két không có sẵn thì nằm lại trong
# túi, đúng như mong muốn — bộ xếp chỉ gộp vào ô đã có.
#
# Ba nhịp: nạp danh sách, nhận đính kèm, xoá. Xoá là cần thiết chứ không phải
# dọn dẹp cho gọn — hòm thư chỉ giữ 10 trang, xoá xong thư cũ hơn mới tràn vào.
R_MGR, R_LIST, R_IDX = 2, 3, 4

MAIL_BODY = (
    "LmTry:\n"
    + get_class("email.MailManager") + get_prop("Instance") + store(R_MGR) + "\n"
    + op("getlocal1") + op("pushbyte", "0") + op("ifne", "LmClaim") + "\n"
    + local(R_MGR) + op("pushbyte", "0")
    + op("callpropvoid", "%s, 1" % pub("loadMail"))
    + ret("dang tai danh sach thu") + "\n"
    + "LmClaim:\n"
    + op("getlocal1") + op("pushbyte", "1") + op("ifne", "LmDelete") + "\n"
    + local(R_MGR) + get_prop("Model") + get_prop("emails") + store(R_LIST)
    + local(R_LIST) + op("iffalse", "LmNone")
    + local(R_LIST) + get_prop("length") + op("iffalse", "LmNone") + "\n"
    + get_class("ddt.manager.SocketManager") + get_prop("Instance") + get_prop("out")
    + local(R_LIST) + op("pushbyte", "0")
    + op("callpropvoid", "%s, 2" % pub("sendGetMail")) + "\n"
    + op("pushstring", '"nhan dinh kem cua "') + local(R_LIST) + get_prop("length")
    + op("add") + op("pushstring", '" thu"') + op("add") + op("returnvalue") + "\n"

    # Xoá để giải phóng chỗ cho thư cũ hơn tràn vào — hòm thư chỉ giữ 10 trang.
    # Gửi cho cả danh sách: server tự từ chối thư nào còn đính kèm, nên thư nhận
    # hụt vì túi đầy sẽ không bị mất.
    + "LmDelete:\n"
    + local(R_MGR) + get_prop("Model") + get_prop("emails") + store(R_LIST)
    + local(R_LIST) + op("iffalse", "LmNone")
    + op("pushbyte", "0") + store(R_IDX) + "\n"
    + "LmDelLoop:\n"
    + local(R_IDX) + local(R_LIST) + get_prop("length") + op("ifge", "LmDelEnd") + "\n"
    + get_class("ddt.manager.SocketManager") + get_prop("Instance") + get_prop("out")
    + local(R_LIST) + local(R_IDX) + op("getproperty", KEY) + get_prop("ID")
    + op("callpropvoid", "%s, 1" % pub("sendDeleteMail")) + "\n"
    + local(R_IDX) + op("increment_i") + store(R_IDX)
    + op("jump", "LmDelLoop") + "\n"
    + "LmDelEnd:\n"
    + op("pushstring", '"xoa "') + local(R_IDX) + op("add")
    + op("pushstring", '" thu"') + op("add") + op("returnvalue") + "\n"
    + "LmNone:\n"
    + ret("khong co thu nao") + "\n"
    + "LmEnd:\n"
    + "LmCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + store(R_LIST) + "\n"
    + op("pushstring", '"don thu loi: "') + local(R_LIST) + op("add")
    + op("returnvalue"))


# ---------------------------------------------------------------- toolBagList

# Ghi ra từng ô túi: số ô, TemplateID, CategoryID, Property1, Property3, số
# lượng. Dùng để phân loại hộp bằng dữ liệu thật trước khi gửi lệnh mở nào.
#
# Rương chọn item nhận ra bằng CategoryID 11 kèm Property1 66 — đó là nhánh mở
# RewardSelectBox trong BagView.__cellOpen.
LIST_BODY = (
    "LlTry:\n"
    + get_class("ddt.manager.PlayerManager") + get_prop("Instance") + get_prop("Self")
    + op("pushbyte", "1") + op("callproperty", "%s, 1" % pub("getBag"))
    + store(R_BANK) + "\n"
    + op("pushbyte", "0") + store(R_I) + "\n"
    + "Ll1:\n"
    + local(R_I) + op("pushbyte", "60") + op("ifge", "Ll1End") + "\n"
    + local(R_BANK) + local(R_I) + op("callproperty", "%s, 1" % pub("getItemAt"))
    + store(R_ITEM)
    + local(R_ITEM) + op("iffalse", "Ll1Next") + "\n"
    + report(op("pushstring", '"o "') + local(R_I) + op("add")
             + op("pushstring", '" tpl="') + op("add")
             + local(R_ITEM) + get_prop("TemplateID") + op("add")
             + op("pushstring", '" cat="') + op("add")
             + local(R_ITEM) + get_prop("CategoryID") + op("add")
             + op("pushstring", '" p1="') + op("add")
             + local(R_ITEM) + get_prop("Property1") + op("add")
             + op("pushstring", '" p3="') + op("add")
             + local(R_ITEM) + get_prop("Property3") + op("add")
             + op("pushstring", '" x"') + op("add")
             + local(R_ITEM) + get_prop("Count") + op("add"))
    + "Ll1Next:\n"
    + local(R_I) + op("increment_i") + store(R_I) + op("jump", "Ll1") + "\n"
    + "Ll1End:\n"
    + ret("liet ke tui xong") + "\n"
    + "LlEnd:\n"
    + "LlCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + store(R_KEY) + "\n"
    + op("pushstring", '"liet ke tui loi: "') + local(R_KEY) + op("add")
    + op("returnvalue"))
# --------------------------------------------------- mở hộp: phần dùng chung

# Không có một lệnh mở chung. Cả BagView.__cellOpen lẫn hàm bấm "Đồng ý" của
# OpenBatchView đều là cây rẽ nhánh theo TemplateID/CategoryID, mỗi họ hộp một
# gói riêng — gửi nhầm gói thì server im lặng bỏ qua.
#
#   thẻ bài (11901…)      sendUseCard(BagType, Place, [TemplateID], PayType,
#                                     false, true, count)
#   4 mã hộp ngẫu nhiên   sendOpenRandomBox(Place, count)
#   CategoryID 18         sendOpenCardBox(Place, count, BagType)
#   CategoryID 66         sendOpenSpecialCardBox(Place, count, BagType)
#   còn lại               sendItemOpenUp(BagType, Place, count)
#
# CategoryID 68 (chọn nhẫn) và nhóm đổi giới tính mở ra bảng chọn nên bỏ qua.
R_OUT, R_TPL, R_CAT, R_CNT = 2, 3, 5, 6
R_CNT2 = 13

CARD_IDS = [11998, 11997, 11901, 11902, 11903, 11904, 11905,
            12535, 11956, 11955, 12746]
RANDOM_IDS = [112108, 112150, 1120538, 1120539]
SKIP_IDS = [1120412, 1120413, 1120414, 1120433, 1120434]


def id_in(ids, target):
    """indexOf trên mảng hằng: gọn hơn một chuỗi so sánh dài."""
    return ("".join(op("pushint", str(i)) for i in ids)
            + op("newarray", str(len(ids)))
            + local(R_TPL)
            + op("callproperty", "%s, 1" % pub("indexOf"))
            + op("pushbyte", "0") + op("ifge", target) + "\n")


def read_item():
    """Đọc TemplateID/CategoryID/Count của R_ITEM ra thanh ghi."""
    return (local(R_ITEM) + get_prop("TemplateID") + store(R_TPL)
            + local(R_ITEM) + get_prop("CategoryID") + store(R_CAT) + "\n")


def describe():
    """Chuỗi mô tả đầy đủ một món, để tra cứu về sau."""
    out = op("pushstring", '"o "') + local(R_I) + op("add")
    for name in ("TemplateID", "CategoryID", "Property1", "Property2",
                 "Property3", "Property4", "Count"):
        out += (op("pushstring", '" %s="' % name.replace("Property", "p")
                                              .replace("TemplateID", "tpl")
                                              .replace("CategoryID", "cat")
                                              .replace("Count", "x"))
                + op("add") + local(R_ITEM) + get_prop(name) + op("add"))
    return out


def open_dispatch(done, skip):
    """Gửi đúng gói cho món ở R_ITEM, số lượng ở R_CNT."""
    # Rương chọn item: BagView mở RewardSelectBox cho nó thay vì gửi gói mở.
    # Gửi thẳng lệnh mở thì game báo "Số lượng chọn không hợp lệ". isPackage
    # nhận cả Property1 66 nên phải chặn riêng ở đây, không tự loại được.
    return (local(R_ITEM) + get_prop("Property1") + op("pushbyte", "66")
            + op("ifeq", skip) + "\n"
            + local(R_CAT) + op("pushbyte", "68") + op("ifeq", skip) + "\n"
            + id_in(SKIP_IDS, skip)
            + id_in(CARD_IDS, "LxCard")
            + id_in(RANDOM_IDS, "LxRandom")
            + local(R_CAT) + op("pushbyte", "18") + op("ifeq", "LxCard18") + "\n"
            + local(R_CAT) + op("pushbyte", "66") + op("ifeq", "LxCard66") + "\n"
            + local(R_OUT) + local(R_ITEM) + get_prop("BagType")
            + local(R_ITEM) + get_prop("Place") + local(R_CNT)
            + op("callpropvoid", "%s, 3" % pub("sendItemOpenUp"))
            + op("pushstring", '" -> sendItemOpenUp"')
            + op("jump", done) + "\n"
            + "LxCard:\n"
            + local(R_OUT) + local(R_ITEM) + get_prop("BagType")
            + local(R_ITEM) + get_prop("Place")
            + local(R_TPL) + op("newarray", "1")
            + local(R_ITEM) + get_prop("PayType")
            + op("pushfalse") + op("pushtrue") + local(R_CNT)
            + op("callpropvoid", "%s, 7" % pub("sendUseCard"))
            + op("pushstring", '" -> sendUseCard"')
            + op("jump", done) + "\n"
            + "LxRandom:\n"
            + local(R_OUT) + local(R_ITEM) + get_prop("Place") + local(R_CNT)
            + op("callpropvoid", "%s, 2" % pub("sendOpenRandomBox"))
            + op("pushstring", '" -> sendOpenRandomBox"')
            + op("jump", done) + "\n"
            + "LxCard18:\n"
            + local(R_OUT) + local(R_ITEM) + get_prop("Place") + local(R_CNT)
            + local(R_ITEM) + get_prop("BagType")
            + op("callpropvoid", "%s, 3" % pub("sendOpenCardBox"))
            + op("pushstring", '" -> sendOpenCardBox"')
            + op("jump", done) + "\n"
            + "LxCard66:\n"
            + local(R_OUT) + local(R_ITEM) + get_prop("Place") + local(R_CNT)
            + local(R_ITEM) + get_prop("BagType")
            + op("callpropvoid", "%s, 3" % pub("sendOpenSpecialCardBox"))
            + op("pushstring", '" -> sendOpenSpecialCardBox"') + "\n")


def bag_and_out():
    return (get_class("ddt.manager.PlayerManager") + get_prop("Instance")
            + get_prop("Self")
            + op("pushbyte", "1") + op("callproperty", "%s, 1" % pub("getBag"))
            + store(R_BANK)
            + get_class("ddt.manager.SocketManager") + get_prop("Instance")
            + get_prop("out") + store(R_OUT) + "\n")


# --------------------------------------------------------------- toolOpenSlot

# Mở đúng một ô, số lượng 1, và ghi ra mọi thuộc tính của món cùng tên gói đã
# gửi — để tra cứu loại nào đi nhánh nào.
OPEN_SLOT_BODY = (
    "LoqTry:\n"
    + bag_and_out()
    + op("getlocal1") + store(R_I)
    + local(R_BANK) + local(R_I) + op("callproperty", "%s, 1" % pub("getItemAt"))
    + store(R_ITEM)
    + local(R_ITEM) + op("iffalse", "LoqEmpty") + "\n"
    + read_item()
    + op("pushbyte", "1") + store(R_CNT) + "\n"
    + describe()
    + open_dispatch("LoqDone", "LoqSkip") + "\n"
    + "LoqDone:\n"
    + op("add") + op("returnvalue") + "\n"
    + "LoqSkip:\n"
    + op("pushstring", '" -> bo qua, loai mo ra bang chon"') + op("add")
    + op("returnvalue") + "\n"
    + "LoqEmpty:\n"
    + ret("o trong") + "\n"
    + "LoqEnd:\n"
    + "LoqCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + store(R_KEY) + "\n"
    + op("pushstring", '"mo o loi: "') + local(R_KEY) + op("add")
    + op("returnvalue"))

# -------------------------------------------------------------- toolOpenBatch

# Mở nhanh: chồng hộp đầu tiên mở nhiều được, mở HẾT số lượng. Điều kiện lấy
# thẳng từ hai vị từ CellMenu dùng để quyết định có hiện nút "Nhiều" hay không.
# Quét cả túi trong một lượt: mỗi chồng một gói mang Place riêng, chồng này mở
# không đổi vị trí chồng kia, nên không cần chờ giữa các gói.
OPEN_BATCH_BODY = (
    "LobTry:\n"
    + bag_and_out()
    + op("pushbyte", "0") + store(R_I)
    + op("pushbyte", "0") + store(R_CNT2) + "\n"
    + "Lob1:\n"
    + local(R_I) + op("pushbyte", "60") + op("ifge", "Lob1End") + "\n"
    + local(R_BANK) + local(R_I) + op("callproperty", "%s, 1" % pub("getItemAt"))
    + store(R_ITEM)
    + local(R_ITEM) + op("iffalse", "Lob1Next") + "\n"
    # Lọc theo đúng vị từ CellMenu hỏi trước khi vẽ nút "Mở": isPackage nhận
    # Property1 6/114/66, isChest nhận 6. Trước đây lọc bằng isOpenBatch — vị từ
    # của nút "Nhiều", chỉ nhận 12/13/21 — nên rương mở từng cái bị bỏ sót hết.
    # Hai vị từ này không đụng tới vật liệu (Property1 0) hay phụ kiện thú (82).
    + get_class("ddt.data.EquipType") + local(R_ITEM)
    + op("callproperty", "%s, 1" % pub("isPackage"))
    + op("iftrue", "LobTake") + "\n"
    + get_class("ddt.data.EquipType") + local(R_ITEM)
    + op("callproperty", "%s, 1" % pub("isChest"))
    + op("iffalse", "Lob1Next") + "\n"
    + "LobTake:\n"
    + read_item()
    # Luôn gửi hết số lượng. isOpenBatch chỉ nhận Property1 12/13/21 nên giao
    # diện không cho nhóm 6 bấm "Nhiều", nhưng gói tin vẫn có trường số lượng —
    # server nhận thì xong một lần, không nhận thì mở một cái như cũ và vòng lặp
    # gặp lại chồng đó ở nhịp sau. Không mất gì để thử.
    + local(R_ITEM) + get_prop("Count") + store(R_CNT) + "\n"
    + describe()
    + open_dispatch("LobDone", "LobSkip") + "\n"
    + "LobDone:\n"
    + op("add") + store(R_KEY)
    + report(local(R_KEY))
    + local(R_CNT2) + op("increment_i") + store(R_CNT2)
    + op("jump", "Lob1Next") + "\n"
    + "LobSkip:\n"
    + op("pop") + "\n"
    + "Lob1Next:\n"
    + local(R_I) + op("increment_i") + store(R_I) + op("jump", "Lob1") + "\n"
    + "Lob1End:\n"
    + op("pushstring", '"da mo "') + local(R_CNT2) + op("add")
    + op("pushstring", '" chong hop"') + op("add") + op("returnvalue") + "\n"
    + "LobEnd:\n"
    + "LobCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + store(R_KEY) + "\n"
    + op("pushstring", '"mo nhanh loi: "') + local(R_KEY) + op("add")
    + op("returnvalue"))


# ------------------------------------------------------------------- toolPet

# Dùng nhanh phụ kiện thú, cả túi trong một lượt. BagView nhận ra chúng bằng
# CategoryID 11 kèm
# Property1 82 rồi gửi đúng một gói mang số ô:
#
#     SocketManager.Instance.out.sendActiveHorsePicCherish(info.Place)
#
# Đây là mảnh sưu tập thú cưỡi nên không có số lượng — mỗi ô một gói. Các gói
# độc lập với nhau, không gói nào cần kết quả của gói trước, nên gửi hết một
# lượt được; không phải giãn nhịp như xếp túi hay mở hộp.
PET_BODY = (
    "LptTry:\n"
    + bag_and_out()
    + op("pushbyte", "0") + store(R_I)
    + op("pushbyte", "0") + store(R_CNT) + "\n"
    + "Lpt1:\n"
    + local(R_I) + op("pushbyte", "60") + op("ifge", "Lpt1End") + "\n"
    + local(R_BANK) + local(R_I) + op("callproperty", "%s, 1" % pub("getItemAt"))
    + store(R_ITEM)
    + local(R_ITEM) + op("iffalse", "Lpt1Next") + "\n"
    # Mảnh sưu tập thú cưỡi.
    + local(R_ITEM) + get_prop("CategoryID") + op("pushbyte", "11")
    + op("ifne", "LptCard") + "\n"
    + local(R_ITEM) + get_prop("Property1") + op("pushbyte", "82")
    + op("ifne", "Lpt1Next") + "\n"
    + local(R_OUT) + local(R_ITEM) + get_prop("Place")
    + op("callpropvoid", "%s, 1" % pub("sendActiveHorsePicCherish"))
    + local(R_CNT) + op("increment_i") + store(R_CNT)
    + op("jump", "Lpt1Next") + "\n"
    # Phụ kiện pet: CategoryID 62 kèm Property1 1, gói khác và mang thêm BagType.
    + "LptCard:\n"
    + local(R_ITEM) + get_prop("CategoryID") + op("pushbyte", "62")
    + op("ifne", "Lpt1Next") + "\n"
    + local(R_ITEM) + get_prop("Property1") + op("pushbyte", "1")
    + op("ifne", "Lpt1Next") + "\n"
    + local(R_OUT) + local(R_ITEM) + get_prop("BagType")
    + local(R_ITEM) + get_prop("Place")
    + op("callpropvoid", "%s, 2" % pub("sendUsePetTemporaryCard"))
    + local(R_CNT) + op("increment_i") + store(R_CNT) + "\n"
    + "Lpt1Next:\n"
    + local(R_I) + op("increment_i") + store(R_I) + op("jump", "Lpt1") + "\n"
    + "Lpt1End:\n"
    + op("pushstring", '"da dung "') + local(R_CNT) + op("add")
    + op("pushstring", '" phu kien"') + op("add") + op("returnvalue") + "\n"
    + "LptEnd:\n"
    + "LptCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + store(R_KEY) + "\n"
    + op("pushstring", '"phu kien thu loi: "') + local(R_KEY) + op("add")
    + op("returnvalue"))


# ------------------------------------------------------------------ toolMenu

# Thay menu chuột phải. Đặt trên root của Loading.swf — SWF game nằm bên trong
# nó — và gọi hideBuiltInItems() để bỏ Zoom In/Out/Show All/Chất lượng. Ba mục
# cuối (Settings, Global Settings, About) là của chính Flash Player, không API
# nào bỏ được, và người dùng muốn giữ chúng.
#
# Mỗi mục dùng chung một hàm xử lý, phân biệt bằng caption: làm mỗi mục một hàm
# thì phải sinh thêm chừng ấy method mà chẳng được gì.
MENU_ITEMS = [
    ("M\u1edf kho ma ph\u00e1p", "magic"),
    ("D\u1ecdn t\u00fai", "bag"),
    ("D\u1ecdn th\u01b0", "mail"),
    ("M\u1edf nhanh h\u1ed9p", "box"),
    ("D\u00f9ng nhanh ph\u1ee5 ki\u1ec7n th\u00fa & pet", "pet"),
    ("Nh\u1eadn qu\u00e0 \u0111i\u1ec3m danh", "daily"),
]

CM = 'QName(PackageNamespace("flash.ui"), "ContextMenu")'
CMI = 'QName(PackageNamespace("flash.ui"), "ContextMenuItem")'

R_MENU, R_ITEM2 = 2, 3

# Gán menu lên từng con của Stage. Không gán lên chính Stage được: nó ném
# Error #2071 "The Stage class does not implement this property or method", và
# `root` của lớp hiển thị lại chính là Stage vì lớp được thêm thẳng vào đó.
#
# Flash chọn contextMenu của đối tượng trong cùng dưới con trỏ, nên chỗ nào
# game đã tự gắn menu thì menu của game vẫn thắng.

MENU_BODY = (
    "LmuTry:\n"
    # Đặt lại mỗi khi Stage đổi số con, chứ không đặt một lần rồi khoá bằng cờ.
    # Menu gắn vào từng con của Stage, nên con nào game thêm vào SAU lần đặt đầu
    # tiên vẫn mang menu mặc định — và game thêm con trong lúc nạp, nên khoá sớm
    # một nhịp là mất menu tuỳ chỉnh, khoá muộn thì còn. Đó là lý do nó lúc được
    # lúc không. So theo numChildren thì lần nào game dựng thêm lớp cũng gắn lại.
    + CLS + get_prop("_toolMenuKids") + op("convert_i")
    + STAGE + get_prop("numChildren") + op("ifeq", "LmuEnd") + "\n"
    + STAGE + op("iffalse", "LmuEnd") + "\n"
    + op("findpropstrict", CM) + op("constructprop", "%s, 0" % CM)
    + store(R_MENU)
    + local(R_MENU) + op("callpropvoid", "%s, 0" % pub("hideBuiltInItems")) + "\n"
    + "".join(
        op("findpropstrict", CMI) + op("pushstring", '"%s"' % cap)
        + op("constructprop", "%s, 1" % CMI) + store(R_ITEM2)
        + local(R_ITEM2) + op("pushstring", '"menuItemSelect"')
        + CLS + get_prop("toolMenuPick")
        + op("callpropvoid", "%s, 2" % pub("addEventListener"))
        + local(R_MENU) + get_prop("customItems") + local(R_ITEM2)
        + op("callpropvoid", "%s, 1" % pub("push")) + "\n"
        for cap, _ in MENU_ITEMS)
    + op("pushbyte", "0") + store(R_I) + "\n"
    + "LmuChild:\n"
    + local(R_I) + STAGE + get_prop("numChildren") + op("ifge", "LmuDone") + "\n"
    + STAGE + local(R_I) + op("callproperty", "%s, 1" % pub("getChildAt"))
    + local(R_MENU) + op("setproperty", pub("contextMenu")) + "\n"
    + local(R_I) + op("increment_i") + store(R_I) + op("jump", "LmuChild") + "\n"
    + "LmuDone:\n"
    + CLS + STAGE + get_prop("numChildren")
    + op("setproperty", pub("_toolMenuKids")) + "\n"
    + "LmuEnd:\n" + op("jump", "LmuAfter") + "\n"
    # Báo lỗi chứ không nuốt: nuốt thì hỏng kiểu nào cũng chỉ thấy menu cũ.
    + "LmuCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal3") + "\n"
    + report(op("pushstring", '"menu chuot phai hong: "') + op("getlocal3")
             + op("add"))
    # Số không bao giờ trùng numChildren -> thôi thử lại, khỏi kêu mỗi nhịp.
    # Không đọc Stage ở đây: đọc nó chính là thứ vừa ném lỗi, mà khối catch thì
    # nằm ngoài vùng try nên ném thêm lần nữa là chết cả vòng nhịp.
    + CLS + op("pushshort", "9999")
    + op("setproperty", pub("_toolMenuKids")) + "\n"
    + "LmuAfter:\n")


# Bấm một mục: so caption rồi chạy đúng việc, không đi vòng qua hàng đợi lệnh
# của trang.
def menu_case(cap, kind, nxt):
    head = (op("getlocal1") + get_prop("target") + get_prop("caption")
            + op("pushstring", '"%s"' % cap) + op("ifne", nxt) + "\n")
    if kind == "magic":
        body = CLS + op("pushbyte", "1") + op("callpropvoid", "%s, 1" % pub("toolOpenMagicHouse"))
    elif kind == "bag":
        body = CLS + op("pushbyte", "1") + op("setproperty", pub("_toolBagStep"))
    elif kind == "mail":
        body = (CLS + op("pushbyte", "0") + op("setproperty", pub("_toolMailWait"))
                + CLS + op("pushbyte", "1") + op("setproperty", pub("_toolMailStep")))
    elif kind == "box":
        body = report(CLS + op("pushbyte", "0")
                      + op("callproperty", "%s, 1" % pub("toolOpenBatch")))
    elif kind == "daily":
        body = report(CLS + op("pushbyte", "0")
                      + op("callproperty", "%s, 1" % pub("toolDaily")))
    else:
        body = report(CLS + op("pushbyte", "0")
                      + op("callproperty", "%s, 1" % pub("toolPet")))
    return head + body + op("returnvoid") + "\n"


PICK_BODY = (
    "LmpTry:\n"
    + "".join(menu_case(cap, kind, "LmpCase%d" % (i + 1))
              + "LmpCase%d:\n" % (i + 1)
              for i, (cap, kind) in enumerate(MENU_ITEMS))
    + op("returnvoid") + "\n"
    + "LmpEnd:\n"
    + "LmpCatch:\n" + catch_prologue() + get_prop("message") + op("coerce_s")
    + op("setlocal2") + "\n"
    + report(op("pushstring", '"menu loi: "') + op("getlocal2") + op("add"))
    + op("returnvoid"))


TICK_BODY = (STATE_BODY + ENFORCE_BODY + MENU_BODY + BAG_STEP_BODY
             + MAIL_STEP_BODY + DAILY_STEP_BODY + CMD_BODY)
TICK_TRY = (try_block("s") + try_block("e") + try_block("mu")
            + try_block("b") + try_block("n") + try_block("d") + try_block("c"))

# ---------------------------------------------------------------------- lắp ráp


def mark_labels(body):
    """Đặt opcode `label` ngay sau mỗi nhãn.

    AVM2 đòi đích của nhánh lùi phải là một `label`; thiếu nó thì verify hỏng
    với Error #1021 "branch target was not on a valid instruction". Trình biên
    dịch của Adobe cũng sinh ra như vậy (xem hall.HallStateView). `label` là
    lệnh rỗng nên đặt ở mọi nhãn cho khỏi phải nhớ nhãn nào là đích nhánh lùi.
    """
    out = []
    for line in body.splitlines(True):
        out.append(line)
        if line.rstrip().endswith(":") and not line.startswith(" "):
            out.append(op("label"))
    return "".join(out)


def method(name, param, body, tryblock="", stack=14, locals_=14):
    body = mark_labels(body)
    # try phải nằm SAU code: nhãn chỉ tồn tại khi khối code đã đọc xong.
    return ''' trait method %s
  method
   name "%s"
   refid "com.pickgliss.utils:ClassUtils/class/%s"
   param %s
   flag HAS_PARAM_NAMES
   paramname "arg"
   body
    maxstack %d
    localcount %d
    initscopedepth 0
    maxscopedepth 1
    code
     getlocal0
     pushscope

%s    end ; code
%s   end ; body
  end ; method
 end ; trait
''' % (pub(name), name, name, param, stack, locals_, body, tryblock)


def slot(name, type_):
    return " trait slot %s type %s end\n" % (pub(name), type_)


TRAITS = (
    slot("_toolReg", pub("Boolean"))
    + slot("_toolTimer", 'QName(PackageNamespace("flash.utils"), "Timer")')
    + slot("_toolState", pub("String"))
    + slot("_toolScale", pub("String"))
    + slot("_toolBagStep", pub("int"))
    + slot("_toolMailStep", pub("int"))
    + slot("_toolMailWait", pub("int"))
    + slot("_toolMenuKids", pub("int"))
    + slot("_toolDailyStep", pub("int"))
    + slot("_toolDailyDone", pub("Boolean"))
    + (slot("_toolSeen", pub("Object")) if probe else "")
    + method("toolTick", pub("Object"), TICK_BODY, TICK_TRY)
    + method("toolOpenMagicHouse", pub("int"), OPEN_BODY, try_block("o"))
    + method("toolPushBank", pub("int"), PUSH_BANK_BODY, try_block("p"))
    + method("toolMail", pub("int"), MAIL_BODY, try_block("m"))
    + method("toolDaily", pub("int"), DAILY_BODY, try_block("da"))
    + method("toolCalendar", pub("int"), CALENDAR_BODY, try_block("cl"))
    + method("toolBagList", pub("int"), LIST_BODY, try_block("l"))
    + method("toolOpenSlot", pub("int"), OPEN_SLOT_BODY, try_block("oq"))
    + method("toolOpenBatch", pub("int"), OPEN_BATCH_BODY, try_block("ob"))
    + method("toolPet", pub("int"), PET_BODY, try_block("pt"))
    + method("toolMenuPick", pub("Object"), PICK_BODY, try_block("mp"))
    + "end ; class\n")

assert s.rstrip().endswith("end ; class")
s = s.rstrip()[: -len("end ; class")] + TRAITS

io.open(path, "w", encoding="utf-8").write(s)
print("chen xong: toolTick=%d toolPushBank=%d"
      % (s.count("toolTick"), s.count("toolPushBank")))
