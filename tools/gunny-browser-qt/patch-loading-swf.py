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

ANCHOR = '''     pushnull
     setlocal            4
'''
assert s.count(ANCHOR) == 1, "mốc CreatInstance không duy nhất: %d" % s.count(ANCHOR)
s = s.replace(ANCHOR, PROLOGUE)

# Lấy lớp qua findpropstrict chứ không qua getlocal0: trong một closure làm
# listener thì không chắc local0 còn là đối tượng lớp.
CLS = ('     findpropstrict      QName(PackageNamespace("com.pickgliss.utils"), "ClassUtils")\n'
       '     getproperty         QName(PackageNamespace("com.pickgliss.utils"), "ClassUtils")\n')

# Hỏi hàng đợi lệnh của trang 250ms một lần. Tab 1 = Kho báu.
TICK_BODY = (
    '     getlex              %s\n'
    '     pushstring          "toolPoll"\n'
    '     callproperty        %s, 1\n'
    '     coerce_s\n'
    '     setlocal2\n'
    '     getlocal2\n'
    '     iffalse             LtickEnd\n\n' % (EI, PUB % '"call"')
    + CLS
    + '     pushbyte            1\n'
      '     callpropvoid        %s, 1\n\n' % (PUB % '"toolOpenMagicHouse"')
    + 'LtickEnd:\n     returnvoid\n')

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
    + method("toolTick", 'QName(PackageNamespace(""), "Object")', TICK_BODY)
    + method("toolOpenMagicHouse", 'QName(PackageNamespace(""), "int")', OPEN_BODY, TRY)
    + 'end ; class\n')

assert s.rstrip().endswith("end ; class")
s = s.rstrip()[: -len("end ; class")] + TRAITS

io.open(path, "w", encoding="utf-8").write(s)
print("chen xong: toolTick=%d toolOpenMagicHouse=%d"
      % (s.count("toolTick"), s.count("toolOpenMagicHouse")))
