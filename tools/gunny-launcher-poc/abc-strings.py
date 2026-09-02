"""Rút string constant pool từ các tag DoABC trong SWF (không cần Java/JPEXS).

Đủ để tìm tên class/method/property AS3, hằng số, và URL nhúng trong game.
Dùng: python abc-strings.py <file.swf> [regex-filter]
"""
import re
import struct
import sys
import zlib


def read_swf_body(path):
    """Giải nén thân SWF (FWS thô / CWS zlib / ZWS lzma)."""
    d = open(path, "rb").read()
    sig = d[:3]
    body = d[8:]
    if sig == b"CWS":
        return zlib.decompress(body)
    if sig == b"ZWS":
        import lzma
        # ZWS: 4 byte compressed-length rồi 5 byte LZMA props + dữ liệu (thiếu size field)
        props = body[4:9]
        raw = body[9:]
        dec = lzma.LZMADecompressor(format=lzma.FORMAT_RAW,
                                    filters=[lzma._decode_filter_properties(lzma.FILTER_LZMA1, props)])
        return dec.decompress(raw)
    return body


def iter_tags(body):
    """Duyệt tag SWF, yield (code, payload)."""
    nbits = body[0] >> 3
    i = (5 + nbits * 4 + 7) // 8 + 4  # bỏ RECT + framerate + framecount
    while i + 2 <= len(body):
        (th,) = struct.unpack("<H", body[i:i + 2])
        i += 2
        code, length = th >> 6, th & 0x3F
        if length == 0x3F:
            (length,) = struct.unpack("<I", body[i:i + 4])
            i += 4
        yield code, body[i:i + length]
        i += length
        if code == 0:
            break


def u30(b, i):
    """Đọc số nguyên biến độ dài u30 của ABC."""
    val = shift = 0
    while True:
        byte = b[i]
        i += 1
        val |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return val, i
        shift += 7


def abc_strings(abc):
    """Trả về danh sách string trong constant pool của một abcFile."""
    i = 4  # minor+major u16
    n, i = u30(abc, i)                      # int_count
    for _ in range(max(0, n - 1)):
        _, i = u30(abc, i)
    n, i = u30(abc, i)                      # uint_count
    for _ in range(max(0, n - 1)):
        _, i = u30(abc, i)
    n, i = u30(abc, i)                      # double_count
    i += 8 * max(0, n - 1)
    n, i = u30(abc, i)                      # string_count
    out = []
    for _ in range(max(0, n - 1)):
        ln, i = u30(abc, i)
        out.append(abc[i:i + ln].decode("utf-8", "replace"))
        i += ln
    return out


def main():
    path = sys.argv[1]
    filt = re.compile(sys.argv[2], re.I) if len(sys.argv) > 2 else None
    body = read_swf_body(path)
    strings = []
    for code, payload in iter_tags(body):
        if code != 82:  # DoABC
            continue
        j = 4  # flags u32
        while payload[j] != 0:  # name (cstring)
            j += 1
        j += 1
        try:
            strings += abc_strings(payload[j:])
        except Exception as e:
            print(f"[warn] DoABC parse lỗi: {e}", file=sys.stderr)
    uniq = sorted(set(strings))
    print(f"# {path}: {len(strings)} strings ({len(uniq)} unique)", file=sys.stderr)
    for s in uniq:
        if filt is None or filt.search(s):
            print(s)


if __name__ == "__main__":
    main()
