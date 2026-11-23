"""ตัดรูปจากภาพหน้าจอ Summoners War (หน้าทดลองต่อสู้กิลด์) ให้เป็นไฟล์สำหรับเว็บ

พิกัดทั้งหมดวัดจากภาพหน้าจอขนาด 2576x1159 แล้วแปลงเป็นสัดส่วนของความสูงภาพ
นับจากกึ่งกลางแนวนอน เพราะ UI ของเกมจัดกึ่งกลางและย่อขยายตามความสูงจอ
จึงใช้ได้กับมือถือที่สัดส่วนจอต่างกัน (ควรเปิดดูผลลัพธ์ทุกครั้ง)

ส่วนที่ตัด *ไม่รวม* ชื่อผู้เล่นและรูปโปรไฟล์ เพื่อความเป็นส่วนตัว
"""
from PIL import Image

REF_W, REF_H = 2576, 1159
REF_CX = REF_W / 2

# กรอบรายละเอียดมอน: สเตตัส + วงรูน + สกิล (ใต้ชื่อผู้เล่น)
RUNE_PANEL = (680, 405, 1915, 1025)

# ไอคอนในหน้าต่าง VS (ป๊อปอัปหลังกดดูรีเพลย์)
VS_POPUP_ATK = [(862, 490, 952, 580), (970, 490, 1062, 580), (1080, 490, 1172, 580)]
VS_POPUP_DEF = [(1405, 490, 1497, 580), (1513, 490, 1605, 580), (1622, 490, 1715, 580)]

# ไอคอนในรายการ "เด็คตั้งรับของ ..." (แถวที่ 1 และแถวที่ 2)
def _list_row(y):
    atk = [(x, y, x + 108, y + 108) for x in (1075, 1202, 1328)]
    dfn = [(x, y, x + 108, y + 108) for x in (1604, 1730, 1857)]
    return atk, dfn

LIST_ROWS = {1: _list_row(408), 2: _list_row(702)}


def scale_box(img, box):
    """แปลงกรอบจากภาพอ้างอิงให้ตรงกับขนาดภาพจริง"""
    w, h = img.size
    s = h / REF_H
    cx = w / 2
    x0, y0, x1, y1 = box
    return (round(cx + (x0 - REF_CX) * s), round(y0 * s),
            round(cx + (x1 - REF_CX) * s), round(y1 * s))


def crop(img, box):
    return img.crop(scale_box(img, box))


def save_jpeg(img, path, width=None, quality=78):
    img = img.convert("RGB")
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
