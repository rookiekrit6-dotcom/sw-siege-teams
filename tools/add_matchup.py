"""เพิ่มข้อมูล "ทีมตีชนะทีมตั้งรับ" 1 คู่ จากภาพหน้าจอ

ตัวอย่าง:
  python tools/add_matchup.py \
    --atk "มิฮยาง,โดว่า,ราคิ" --def "เพลตี้,ไอรีน,unk2" \
    --date 2025-10-28 --season SS21 --spd 180,220,27 --note "ต้องได้เทิร์นแรก" \
    --runes shots/rune1.jpg shots/rune2.jpg shots/rune3.jpg

- ชื่อมอนต้องมีอยู่ใน data/monsters.json (ถ้าเป็นมอนใหม่ ให้เพิ่มด้วย --new-mon ก่อน)
- --runes: ภาพหน้ารายละเอียดมอนของทีมตี 3 ภาพ เรียงตาม --atk
  ระบบตัดเฉพาะกรอบสเตตัส/รูน/สกิล ไม่เอาชื่อผู้เล่นและรูปโปรไฟล์
- --spd: สปีดที่บวกจากรูน (ตัวเลขสีเขียว +xxx) ของทีมตี เรียงตาม --atk
- --season / --note ไม่บังคับ (note มาจากช่องหมายเหตุในฟอร์ม ห้ามมีชื่อผู้เล่น)
- ทีมที่ไม่มีภาพรูนครบ 3 ตัว จะไม่ถูกเพิ่ม (ตามกติกาของเว็บ)

เพิ่มมอนที่ไม่มีในรายชื่อ (ตัดไอคอนจากภาพหน้าจอ):
  python tools/add_matchup.py --new-mon "ราคิ" --el fire --from shot.jpg --box 1328,702,1436,810
  (ไม่รู้ชื่อให้ใช้ชื่อ "?" แล้วระบบจะตั้งคีย์ unkN ให้)
"""
import argparse, datetime, json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from crop import crop, save_jpeg, RUNE_PANEL  # noqa: E402

D = os.path.join(ROOT, "data")


def load(name):
    with open(os.path.join(D, name), encoding="utf-8") as f:
        return json.load(f)


def save_monsters(mons):
    with open(os.path.join(D, "monsters.json"), "w", encoding="utf-8") as f:
        json.dump(mons, f, ensure_ascii=False, separators=(",", ":"))


def new_mon(a):
    mons = load("monsters.json")
    if a.new_mon != "?" and a.new_mon in mons:
        sys.exit(f"มี {a.new_mon} อยู่แล้ว")
    used = {os.path.basename(v["img"]).split(".")[0] for v in mons.values()}
    prefix = "unk" if a.new_mon == "?" else "c"
    i = 1
    while f"{prefix}{i:03d}" in used or f"{prefix}{i}" in used:
        i += 1
    fid = f"{prefix}{i:03d}"
    box = tuple(int(v) for v in a.box.split(","))
    fn = f"img/mon/{fid}.jpg"
    save_jpeg(crop(Image.open(a.src), box), os.path.join(ROOT, fn), width=104, quality=82)
    key = fid if a.new_mon == "?" else a.new_mon
    mons[key] = {"n": a.new_mon, "el": a.el, "img": fn}
    save_monsters(mons)
    print("เพิ่มมอน", key, "->", fn, "(เปิดดูรูปก่อน commit)")


def add(a):
    mons = load("monsters.json")
    atk = [s.strip() for s in a.atk.split(",")]
    dfn = [s.strip() for s in a.dfn.split(",")]
    for k in atk + dfn:
        if k not in mons:
            sys.exit(f"ไม่รู้จักมอน: {k} (เพิ่มด้วย --new-mon ก่อน)")
    if len(atk) != 3 or len(dfn) != 3:
        sys.exit("ทีมต้องมี 3 ตัว")
    if not a.runes or len(a.runes) != 3:
        sys.exit("ต้องมีภาพรูนครบ 3 ภาพ")
    data = load("matchups.json")
    n = 1 + max([int(x["id"][1:]) for x in data["matchups"]] or [0])
    mid = f"m{n}"
    spd = [int(v) for v in a.spd.split(",")] if a.spd else [None, None, None]
    if len(spd) != 3:
        sys.exit("--spd ต้องมี 3 ค่า")
    runes = []
    for i, (mon, src, sp) in enumerate(zip(atk, a.runes, spd), 1):
        fn = f"img/runes/{mid}-{i}.jpg"
        save_jpeg(crop(Image.open(src), RUNE_PANEL), os.path.join(ROOT, fn), width=720, quality=74)
        runes.append({"m": mon, "img": fn, "spd": sp})
    today = datetime.date.today().isoformat()
    data["matchups"].append({"id": mid, "atk": atk, "def": dfn, "date": a.date, "added": today,
                             "season": a.season, "note": a.note or "", "runes": runes})
    data["updated"] = today
    with open(os.path.join(D, "matchups.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("เพิ่ม", mid, "แล้ว — เปิดดูภาพใน img/runes ว่าไม่มีชื่อผู้เล่นก่อน commit")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--atk"); p.add_argument("--def", dest="dfn"); p.add_argument("--date")
    p.add_argument("--runes", nargs="*")
    p.add_argument("--spd"); p.add_argument("--season"); p.add_argument("--note")
    p.add_argument("--new-mon"); p.add_argument("--el", choices=["water", "fire", "wind", "light", "dark"])
    p.add_argument("--from", dest="src"); p.add_argument("--box")
    a = p.parse_args()
    if a.new_mon:
        new_mon(a)
    elif a.atk and a.dfn:
        add(a)
    else:
        p.print_help()
