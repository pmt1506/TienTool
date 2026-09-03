"""Chèn cầu nối "Mở kho ma pháp" vào ClassUtils của Loading.swf, ở mức assembly.

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
"""
import io
import sys

path = sys.argv[1]
# --probe: báo ra tên lớp của mọi thành phần giao diện, mỗi tên đúng một lần.
# Dùng để tìm mốc nhận biết trạng thái game (vào trận, hết trận) từ dữ liệu thật
# thay vì đoán. Không bật trong bản dùng hằng ngày — nó nói quá nhiều.
probe = "--probe" in sys.argv[2:]
s = io.open(path, encoding="utf-8").read()

EI = 'QName(PackageNamespace("flash.external"), "ExternalInterface")'
PUB = 'QName(PackageNamespace(""), %s)'


def get_class(name):
    """getDefinitionByName(name) -> Class trên đỉnh stack.

    Bấm nút trước khi người chơi chạm vào bất cứ giao diện nào thì ra Error
    #1065. Không phải do chưa đủ thời gian: thử lại 10 lần trong 20 giây vẫn
    #1065 y nguyên. Lớp `magicHouse.*` nằm ở ApplicationDomain khác và chỉ hiện
    ra với domain của Loading.swf sau khi game tự nạp module giao diện lần đầu —
    đúng cú đơ vài giây mà bản game chính thức cũng có.

    `ClassUtils.uiSourceDomain.getDefinition()` cũng đã thử, vẫn #1065.

    Muốn hết hẳn thì phải vá SWF game (res1.gnddt.com/flash/4.png) để chính nó
    gọi HelperUIModuleLoad sớm; ở Loading.swf thì không với tới được.
    """
    return (
        '     getlex              QName(PackageNamespace("flash.utils"), "getDefinitionByName")\n'
        '     getglobalscope\n'
        '     pushstring          "%s"\n'
        '     call                1\n' % name)


# Dựng Timer một lần duy nhất, canh bằng cờ _toolReg. Timer phải cất vào slot
# tĩnh, không thì bộ nhớ tự động thu hồi và vòng hỏi chết lặng.
PROLOGUE = '''     getlocal0
     getproperty         QName(PackageNamespace(""), "_toolReg")
     iftrue              LtoolSkip

     getlex              QName(PackageNamespace("flash.external"), "ExternalInterface")
     getproperty         QName(PackageNamespace(""), "available")
     iffalse             LtoolSkip

     getlocal0
     pushtrue
     setproperty         QName(PackageNamespace(""), "_toolReg")

     getlocal0
     findpropstrict      QName(PackageNamespace("flash.utils"), "Timer")
     pushshort           250
     constructprop       QName(PackageNamespace("flash.utils"), "Timer"), 1
     setproperty         QName(PackageNamespace(""), "_toolTimer")

     getlocal0
     getproperty         QName(PackageNamespace(""), "_toolTimer")
     dup
     pushstring          "timer"
     getlocal0
     getproperty         QName(PackageNamespace(""), "toolTick")
     callpropvoid        QName(PackageNamespace(""), "addEventListener"), 2
     callpropvoid        QName(PackageNamespace(""), "start"), 0

LtoolSkip:
     pushnull
     setlocal            4
'''

# Báo tên lớp lần đầu gặp. Lọc trùng ngay trong AS3: CreatInstance được gọi liên
# tục, gọi ExternalInterface mỗi lần thì game giật.
PROBE = '''     getlocal0
     getproperty         QName(PackageNamespace(""), "_toolSeen")
     pushnull
     ifne                LseenReady

     getlocal0
     newobject           0
     setproperty         QName(PackageNamespace(""), "_toolSeen")

LseenReady:
     getlocal0
     getproperty         QName(PackageNamespace(""), "_toolSeen")
     getlocal1
     getproperty         MultinameL([PackageNamespace("")])
     iftrue              LseenSkip

     getlocal0
     getproperty         QName(PackageNamespace(""), "_toolSeen")
     getlocal1
     pushtrue
     setproperty         MultinameL([PackageNamespace("")])

     getlex              QName(PackageNamespace("flash.external"), "ExternalInterface")
     pushstring          "toolLog"
     pushstring          "cls "
     getlocal1
     add
     callpropvoid        QName(PackageNamespace(""), "call"), 2

LseenSkip:
     pushnull
     setlocal            4
'''

if probe:
    PROLOGUE = PROLOGUE.replace('''LtoolSkip:
     pushnull
     setlocal            4
''', "LtoolSkip:\n" + PROBE)

ANCHOR = '''     pushnull
     setlocal            4
'''
assert s.count(ANCHOR) == 1, "mốc CreatInstance không duy nhất: %d" % s.count(ANCHOR)
s = s.replace(ANCHOR, PROLOGUE)

# Lấy lớp qua findpropstrict chứ không qua getlocal0: trong một closure làm
# listener thì không chắc local0 còn là đối tượng lớp.
CLS = ('     findpropstrict      QName(PackageNamespace("com.pickgliss.utils"), "ClassUtils")\n'
       '     getproperty         QName(PackageNamespace("com.pickgliss.utils"), "ClassUtils")\n')

# Theo dõi trạng thái game để bên ngoài biết lúc nào vào trận, lúc nào ra.
#
# Đọc thẳng StateManager.currentStateType (getter tĩnh) chứ không đoán theo tên
# component đang được dựng: tên component chỉ xuất hiện lúc mở màn, không có mốc
# nào cho lúc đóng, và mỗi tên chỉ dựng một lần cho cả phiên.
#
# Nuốt lỗi: trước khi game nạp xong module giao diện thì getDefinitionByName ném
# Error #1065 — lớp của game nằm ở ApplicationDomain khác. Cứ thử lại mỗi nhịp.
STATE_BODY = '''LsTry:
     getlex              QName(PackageNamespace("flash.utils"), "getDefinitionByName")
     getglobalscope
     pushstring          "ddt.manager.StateManager"
     call                1
     getproperty         QName(PackageNamespace(""), "currentStateType")
     coerce_s
     setlocal3

''' + CLS + '''     getproperty         QName(PackageNamespace(""), "_toolState")
     getlocal3
     ifeq                LsDone

''' + CLS + '''     getlocal3
     setproperty         QName(PackageNamespace(""), "_toolState")

     getlex              QName(PackageNamespace("flash.external"), "ExternalInterface")
     pushstring          "toolLog"
     pushstring          "state "
     getlocal3
     add
     callpropvoid        QName(PackageNamespace(""), "call"), 2

LsDone:
LsEnd:
     jump                LsAfter

LsCatch:
     getlocal0
     pushscope
     pop

LsAfter:
'''

STATE_TRY = '''    try
     from LsTry
     to LsEnd
     target LsCatch
     type QName(PackageNamespace(""), "Error")
     name null
    end ; try
'''

# Stage lấy qua lớp đầu tiên của LayerManager. LayerManager nằm ngay trong
# Loading.swf nên getlex tới thẳng, không vướng chuyện khác ApplicationDomain
# như các lớp của game.
STAGE = '''     getlex              QName(PackageNamespace("com.pickgliss.ui"), "LayerManager")
     getproperty         QName(PackageNamespace(""), "Instance")
     pushbyte            0
     callproperty        QName(PackageNamespace(""), "getLayerByType"), 1
     getproperty         QName(PackageNamespace(""), "stage")
'''


def set_stage_prop(name):
    """stage.<name> = phần lệnh sau dấu hai chấm."""
    return (STAGE
            + '     getlocal2\n'
              '     pushbyte            2\n'
              '     callproperty        %s, 1\n'
              '     setproperty         %s\n'
              '     jump                LcEnd\n\n'
            % (PUB % '"substr"', PUB % ('"%s"' % name)))


# Ep lai scaleMode moi nhip. So truoc roi moi dat: dat lai lien tuc se bat Flash
# tinh lai bo cuc 4 lan moi giay.
ENFORCE_BODY = '''LeTry:
''' + CLS + '''     getproperty         QName(PackageNamespace(""), "_toolScale")
     coerce_s
     setlocal3
     getlocal3
     iffalse             LeEnd

''' + STAGE + '''     getproperty         QName(PackageNamespace(""), "scaleMode")
     getlocal3
     ifeq                LeEnd

''' + STAGE + '''     getlocal3
     setproperty         QName(PackageNamespace(""), "scaleMode")

LeEnd:
     jump                LeAfter

LeCatch:
     getlocal0
     pushscope
     pop

LeAfter:
'''

ENFORCE_TRY = '''    try
     from LeTry
     to LeEnd
     target LeCatch
     type QName(PackageNamespace(""), "Error")
     name null
    end ; try
'''

# Hỏi hàng đợi lệnh của trang 250ms một lần.
#
# "q:<mức>"  -> chất lượng vẽ (high/medium/low)
# "s:<kiểu>" -> kiểu co giãn (showAll/noScale)
# còn lại    -> mở kho ma pháp, tab 1 = Kho báu
#
# Đặt thẳng vào stage chứ không nạp lại trang: Flash đổi được cả hai thứ khi đang
# chạy — đúng thứ menu chuột phải của nó vẫn làm.
TICK_BODY = (
    STATE_BODY
    + ENFORCE_BODY
    + 'LcTry:\n'
      '     getlex              %s\n'
    '     pushstring          "toolPoll"\n'
    '     callproperty        %s, 1\n'
    '     coerce_s\n'
    '     setlocal2\n'
    '     getlocal2\n'
    '     iffalse             LcEnd\n\n'
    '     getlocal2\n'
    '     pushbyte            0\n'
    '     pushbyte            2\n'
    '     callproperty        %s, 2\n'
    '     setlocal3\n\n'
    '     getlocal3\n'
    '     pushstring          "q:"\n'
    '     ifne                LcNotQuality\n\n' % (EI, PUB % '"call"', PUB % '"substr"')
    + set_stage_prop("quality")
    + 'LcNotQuality:\n'
      '     getlocal3\n'
      '     pushstring          "s:"\n'
      '     ifne                LcMagic\n\n'
    # Nho lai roi de khoi ep ben duoi dat vao stage: game se ghi de scaleMode
    # khi vao man game, dat mot lan o day khong giu duoc.
    + CLS
    + '     getlocal2\n'
      '     pushbyte            2\n'
      '     callproperty        %s, 1\n'
      '     setproperty         %s\n'
      '     jump                LcEnd\n\n' % (PUB % '"substr"', PUB % '"_toolScale"')
    + 'LcMagic:\n'
    + CLS
    + '     pushbyte            1\n'
      '     callpropvoid        %s, 1\n\n' % (PUB % '"toolOpenMagicHouse"')
    + 'LcEnd:\n'
      '     jump                LtickEnd\n\n'
      'LcCatch:\n'
      '     getlocal0\n'
      '     pushscope\n'
      '     pop\n\n'
      'LtickEnd:\n     returnvoid\n')

# Một try riêng cho khối lệnh: nếu gộp chung với try đọc trạng thái thì lúc chưa
# nạp xong game, lỗi ở đó sẽ nuốt luôn lệnh và người dùng không thấy báo gì.
CMD_TRY = '''    try
     from LcTry
     to LcEnd
     target LcCatch
     type QName(PackageNamespace(""), "Error")
     name null
    end ; try
'''

OPEN_BODY = (
    'Ltry:\n'
    + get_class("magicHouse.MagicHouseControl")
    + '     getproperty         QName(PackageNamespace(""), "instance")\n'
      '     callpropvoid        QName(PackageNamespace(""), "setup"), 0\n\n'
    + get_class("magicHouse.MagicHouseModel")
    + '     getproperty         QName(PackageNamespace(""), "instance")\n'
      '     getlocal1\n'
      '     setproperty         QName(PackageNamespace(""), "viewIndex")\n\n'
    # show() chứ không phải dispatchEvent("showMainView"): show() nạp trước các
    # module UI (magicHouse, ddtbagandinfo...) rồi mới phát sự kiện. Phát thẳng
    # thì style "magicHouse.mainViewFrame" chưa có. Sảnh cũng gọi đúng hàm này
    # (xem hall.HallStateView).
    + get_class("magicHouse.MagicHouseManager")
    + '     getproperty         QName(PackageNamespace(""), "instance")\n'
      '     callpropvoid        QName(PackageNamespace(""), "show"), 0\n\n'
      '     pushstring          "magic ok"\n'
      '     returnvalue\n'
    # Bắt lỗi để đọc được thông báo: ném ra ngoài listener của Timer thì Flash
    # nuốt mất, không còn manh mối nào.
    + 'Lend:\n'
      'Lcatch:\n'
      '     getlocal0\n'
      '     pushscope\n'
      '     getproperty         QName(PackageNamespace(""), "message")\n'
      '     coerce_s\n'
      '     setlocal2\n\n'
      '     getlex              %s\n'
      '     pushstring          "toolLog"\n'
      '     pushstring          "magic loi: "\n'
      '     getlocal2\n'
      '     add\n'
      '     callpropvoid        %s, 2\n\n' % (EI, PUB % '"call"')
    + '     pushstring          "magic loi"\n     returnvalue\n')

TRY = '''    try
     from Ltry
     to Lend
     target Lcatch
     type QName(PackageNamespace(""), "Error")
     name null
    end ; try
'''


def method(name, param, body, tryblock=""):
    # try phải nằm SAU code: nhãn chỉ tồn tại khi khối code đã đọc xong.
    return ''' trait method QName(PackageNamespace(""), "%s")
  method
   name "%s"
   refid "com.pickgliss.utils:ClassUtils/class/%s"
   param %s
   flag HAS_PARAM_NAMES
   paramname "arg"
   body
    maxstack 10
    localcount 4
    initscopedepth 0
    maxscopedepth 1
    code
     getlocal0
     pushscope

%s    end ; code
%s   end ; body
  end ; method
 end ; trait
''' % (name, name, name, param, body, tryblock)


TRAITS = (
    ' trait slot QName(PackageNamespace(""), "_toolReg")'
    ' type QName(PackageNamespace(""), "Boolean") end\n'
    ' trait slot QName(PackageNamespace(""), "_toolTimer")'
    ' type QName(PackageNamespace("flash.utils"), "Timer") end\n'
    + ' trait slot QName(PackageNamespace(""), "_toolState")'
      ' type QName(PackageNamespace(""), "String") end\n'
    + (' trait slot QName(PackageNamespace(""), "_toolSeen")'
       ' type QName(PackageNamespace(""), "Object") end\n' if probe else '')
    + method("toolTick", 'QName(PackageNamespace(""), "Object")', TICK_BODY,
              STATE_TRY + ENFORCE_TRY + CMD_TRY)
    + method("toolOpenMagicHouse", 'QName(PackageNamespace(""), "int")', OPEN_BODY, TRY)
    + 'end ; class\n')

assert s.rstrip().endswith("end ; class")
s = s.rstrip()[: -len("end ; class")] + TRAITS

io.open(path, "w", encoding="utf-8").write(s)
print("chen xong: toolTick=%d toolOpenMagicHouse=%d"
      % (s.count("toolTick"), s.count("toolOpenMagicHouse")))
