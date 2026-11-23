"""นับเด็คตั้งรับของกิลด์ศัตรูจากไฟล์บันทึก SWEX (full_log.txt) ระหว่างสงครามแห่งการยึดครอง

  python tools/import_siege.py path/to/full_log.txt [--dry] [--include-own]

วิธีเก็บข้อมูล: เปิด SWEX (FullLogger) ไว้ แล้วในเกมกดดูฐานของกิลด์ศัตรูทีละฐาน
เก็บเฉพาะมอน 3 ตัวของแต่ละเด็ค + เลขฐาน (ไม่เก็บชื่อผู้เล่น/ชื่อกิลด์)
นับเด็คเดียวกันในสงครามเดียวกันแค่ครั้งเดียว ต่อให้กดดูซ้ำ
ประเภทบ้าน: ถ้าเกมบอก base_type มา จะเก็บไว้ด้วย / ถ้าไม่มี ใช้กฎ "ทุกเด็คในฐานมีแต่มอนไม่เกิน 4 ดาว = บ้าน 4★"
ไฟล์บันทึกมีรหัสเข้าระบบของผู้ใช้ — ห้าม commit ไฟล์นี้ขึ้น repo
"""
import argparse, datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_swex import ROOT, D, BKK, fam, add_monster  # noqa: E402


def blocks(text):
    for b in re.split(r"\nAPI Command: ", "\n" + text):
        name = b.split(" ", 1)[0].strip()
        if not name.startswith("GetGuildSiege"):
            continue
        i, j = b.find("Request:"), b.find("Response:")
        try:
            yield name, json.loads(b[i + 8:j].strip()), json.loads(b[j + 9:].strip())
        except Exception:
            continue


def walk(o):
    if isinstance(o, dict):
        yield o
        for v in o.values():
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("logs", nargs="+")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--include-own", action="store_true", help="ทดสอบ: นับเด็คกิลด์ตัวเองด้วย")
    a = ap.parse_args()
    mons = json.load(open(os.path.join(D, "monsters.json"), encoding="utf-8"))
    by_fam = {fam(v["id"]): k for k, v in mons.items() if v.get("id")}
    stars = {r[0]: r[2] for r in json.load(open(os.path.join(ROOT, "tools", "swarfarm_monsters.json"), encoding="utf-8"))}
    path = os.path.join(D, "sightings.json")
    sg = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"seen": [], "decks": {}, "base_types": {}}
    seen = set(sg["seen"])
    own, siege_id = set(), None
    found = []  # (siege, deck_id, base_number, guild, [mid x3], date)
    base_type = {}
    for path_log in a.logs:
        text = open(path_log, encoding="utf-8", errors="replace").read()
        for name, req, resp in blocks(text):
            pi = resp.get("participation_info") or {}
            if pi.get("guild_id"):
                own.add(pi["guild_id"])
            if pi.get("siege_id"):
                siege_id = pi["siege_id"]
            for d in walk(resp):
                if "base_number" in d and "base_type" in d:
                    base_type[f"{d.get('guild_id')}-{d['base_number']}"] = d["base_type"]
            units = resp.get("defense_unit_list")
            assign = resp.get("defense_deck_assign_list")
            if not units or not assign:
                continue
            guild_of = {w["wizard_id"]: w.get("guild_id") for w in resp.get("wizard_info_list") or []}
            wiz_of = {x["deck_id"]: x.get("wizard_id") for x in resp.get("defense_deck_list") or []}
            base_of = {x["deck_id"]: x["base_number"] for x in assign}
            decks = {}
            for u in units:
                decks.setdefault(u["deck_id"], []).append((u.get("pos_id", 0), u["unit_info"]["unit_master_id"]))
            date = datetime.datetime.fromtimestamp(resp.get("tvalue") or 0, BKK).date().isoformat()
            for did, us in decks.items():
                if did not in base_of or len(us) != 3:
                    continue
                g = guild_of.get(wiz_of.get(did))
                found.append((siege_id or date, did, base_of[did], g, [m for _, m in sorted(us)], date))
    # บ้าน 4★ ต่อฐาน: ทุกเด็คในฐานมีแต่มอน ≤4 ดาว
    per_base = {}
    for s, did, b, g, ms, date in found:
        per_base.setdefault((s, g, b), []).extend(ms)
    is4 = {k: all((stars.get(m) or 5) <= 4 for m in v) for k, v in per_base.items()}
    added, skipped_own, new_mons = 0, 0, []
    for s, did, b, g, ms, date in found:
        if g in own and not a.include_own:
            skipped_own += 1
            continue
        key = f"{s}-{did}"
        if key in seen:
            continue
        names = []
        for mid in ms:
            k = by_fam.get(fam(mid)) or add_monster(mid, mons, a.dry)
            if k and fam(mid) not in by_fam:
                by_fam[fam(mid)] = k; new_mons.append(k)
            names.append(k)
        if None in names:
            continue
        seen.add(key)
        dk = "|".join(sorted(names))
        e = sg["decks"].setdefault(dk, {"m": names, "n": 0, "b": "5", "last": ""})
        e["n"] += 1
        bt = base_type.get(f"{g}-{b}")
        if is4.get((s, g, b)):
            e["b"] = "4"
        if bt is not None:
            e["bt"] = bt
        e["last"] = max(e["last"], date)
        added += 1
    print(f"เจอเด็ค {len(found)} · ของกิลด์เรา (ข้าม) {skipped_own} · นับเพิ่ม {added} · เด็คทั้งหมดในสถิติ {len(sg['decks'])}")
    if base_type:
        print("base_type ที่เกมส่งมา:", base_type)
    if new_mons:
        print("เพิ่มมอนใหม่:", ", ".join(new_mons))
    if not a.dry and (added or new_mons):
        sg["seen"] = sorted(seen)
        sg["updated"] = datetime.date.today().isoformat()
        json.dump(sg, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        if new_mons:
            open(os.path.join(D, "monsters.json"), "w", encoding="utf-8").write(json.dumps(mons, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
