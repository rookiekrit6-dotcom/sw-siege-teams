"""นำเข้าข้อมูลจากไฟล์บันทึก SWEX (FullLogger: full_log.txt) หน้า "ทดลองต่อสู้กิลด์"

  python tools/import_swex.py path/to/full_log.txt [--dry]

อ่านคำสั่ง:
  GetGuildTestDeckDetail  -> เด็คตั้งรับ + รายการรีเพลย์ที่ตีชนะ (ทีมตี + วันที่)
  GetGuildTestReplayData  -> รูนของทีมตี (ได้เมื่อกดดูรูน/กด ▶ ในเกม)
เก็บเฉพาะคู่ที่มีรูนทีมตีครบ 3 ตัว (ตามกติกาเว็บ) ไม่เก็บชื่อผู้เล่น/ชื่อกิลด์
ไฟล์บันทึกมีรหัสเข้าระบบของผู้ใช้ — ห้าม commit ไฟล์นี้ขึ้น repo
"""
import argparse, base64, datetime, json, os, re, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
SET = {1: "Energy", 2: "Guard", 3: "Swift", 4: "Blade", 5: "Rage", 6: "Focus", 7: "Endure", 8: "Fatal", 10: "Despair",
       11: "Vampire", 13: "Violent", 14: "Nemesis", 15: "Will", 16: "Shield", 17: "Revenge", 18: "Destroy", 19: "Fight",
       20: "Determination", 21: "Enhance", 22: "Accuracy", 23: "Tolerance", 24: "Seal", 25: "Intangible", 99: "Immemorial"}
FOUR = {3, 5, 8, 10, 11, 13, 17, 18}  # ชุด 4 ชิ้น
EFF = {1: "HP", 2: "HP%", 3: "ATK", 4: "ATK%", 5: "DEF", 6: "DEF%", 8: "SPD", 9: "CR", 10: "CD", 11: "RES", 12: "ACC"}
BKK = datetime.timezone(datetime.timedelta(hours=7))


def blocks(text):
    for b in re.split(r"\nAPI Command: ", "\n" + text):
        name = b.split(" ", 1)[0].strip()
        if not (name.startswith("GetGuildTest") or name == "GetGuildSiegeBattleReplayData"):
            continue
        i, j = b.find("Request:"), b.find("Response:")
        try:
            yield name, json.loads(b[i + 8:j].strip()), json.loads(b[j + 9:].strip())
        except Exception:
            continue


def fam(mid):
    return f"h{mid // 100}-{mid % 10}" if mid >= 1000000 else f"{mid // 100}-{mid % 10}"


def rune_summary(unit):
    """สรุปรูน: ชุด, ค่าหลักช่อง 2/4/6, ค่าที่บวกจากรูน (เหมือนเลขสีเขียวในเกม)"""
    runes = unit.get("runes") or []
    if isinstance(runes, dict):
        runes = list(runes.values())
    tot = {}
    sets = {}
    mains = {}
    for r in runes:
        sets[r["set_id"]] = sets.get(r["set_id"], 0) + 1
        effs = [r.get("pri_eff") or [0, 0], r.get("prefix_eff") or [0, 0]] + [[s[0], s[1] + (s[3] if len(s) > 3 else 0)] for s in r.get("sec_eff") or []]
        for t, v in effs:
            if t in EFF:
                tot[t] = tot.get(t, 0) + v
        if r["slot_no"] in (2, 4, 6) and r["pri_eff"][0] in EFF:
            mains[r["slot_no"]] = EFF[r["pri_eff"][0]]
    full = []
    left = dict(sets)
    intang = left.pop(25, 0)
    for sid, n in sorted(left.items(), key=lambda kv: -kv[1]):
        need = 4 if sid in FOUR else 2
        k = n // need
        if k == 0 and intang and n + intang >= need:
            intang -= need - n; k = 1
        full += [sid] * k
    base_hp, base_atk, base_def, base_spd = unit.get("con", 0) * 15, unit.get("atk", 0), unit.get("def", 0), unit.get("spd", 0)
    pct = lambda base, p: -(-base * p // 100)  # ปัดขึ้น
    hp_p = tot.get(2, 0) + 15 * full.count(1)
    atk_p = tot.get(4, 0) + 35 * full.count(8)
    def_p = tot.get(6, 0) + 15 * full.count(2)
    st = {
        "hp": tot.get(1, 0) + pct(base_hp, hp_p),
        "atk": tot.get(3, 0) + pct(base_atk, atk_p),
        "def": tot.get(5, 0) + pct(base_def, def_p),
        "spd": tot.get(8, 0) + (pct(base_spd, 25) if 3 in full else 0),
        "cr": tot.get(9, 0) + 12 * full.count(4),
        "cd": tot.get(10, 0) + 40 * full.count(5),
        "res": tot.get(11, 0) + 20 * full.count(7),
        "acc": tot.get(12, 0) + 20 * full.count(6),
    }
    return {"sets": [SET.get(s, str(s)) for s in full], "main": [mains.get(2, "-"), mains.get(4, "-"), mains.get(6, "-")], "st": st, "n": len(runes)}


SKILL_NOTE = "ลำดับใน action_data: [ลำดับ, ชนิด, ตัวเรา(0-2), สกิล(0=S1), เป้า(0-2 ฝั่งเรา, 3-5 ฝั่งศัตรู), ?, สุ่ม]"


def first_moves(j, atk_keys, def_keys):
    """ตาแรกของทีมตีแต่ละตัว: สกิลที่กด + เป้า (เฉพาะเมื่อเล็งศัตรู) เรียงตามลำดับที่ได้เล่น"""
    seen, out = set(), []
    for a in j.get("action_data") or []:
        if len(a) < 5 or a[1] != 0 or not (0 <= a[2] < 3) or a[2] in seen:
            continue
        seen.add(a[2])
        t = def_keys[a[4] - 3] if 3 <= a[4] < 6 else None
        out.append({"m": atk_keys[a[2]], "s": a[3] + 1, "t": t})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("logs", nargs="+")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    mons = json.load(open(os.path.join(D, "monsters.json"), encoding="utf-8"))
    by_fam = {}
    for k, v in mons.items():
        if v.get("id"):
            by_fam.setdefault(fam(v["id"]), k)
    replays = {}   # replay_info_ref -> {atk ids, def ids, date}
    runes = {}     # replay_info_ref -> [summary x3] (ตามลำดับทีมตี)
    for path in a.logs:
        text = open(path, encoding="utf-8", errors="replace").read()
        for name, req, resp in blocks(text):
            if name in ("GetGuildTestDeckDetail", "GetGuildTestDeckList"):
                det = resp if name == "GetGuildTestDeckDetail" else resp.get("detail_info") or {}
                for rp in det.get("replay_list") or []:
                    bi = rp.get("battle_info") or {}
                    if not bi.get("unit_list") or not bi.get("opp_unit_list"):
                        continue
                    replays[rp["replay_info_ref"]] = {
                        "atk": bi["unit_list"][0], "def": bi["opp_unit_list"][0],
                        "date": datetime.datetime.fromtimestamp(bi.get("end_time") or rp.get("battle_key") or 0, BKK).date().isoformat(),
                    }
            elif name in ("GetGuildTestReplayData", "GetGuildSiegeBattleReplayData"):
                siege = name == "GetGuildSiegeBattleReplayData"
                ref = ("s%s" % req.get("replay_rid_ref")) if siege else req.get("replay_info_ref")
                raw = resp.get("replay_data")
                for rd in ([{"data": raw}] if isinstance(raw, str) else raw or []):
                    try:
                        j = json.loads(zlib.decompress(base64.b64decode(rd["data"])))
                    except Exception:
                        continue
                    users = (j.get("battle_info") or {}).get("battle_users") or []
                    if not users:
                        continue
                    units = sorted(users[0].get("battle_units") or [], key=lambda u: u.get("pos_id", 0))
                    runes[ref] = [(u["unit"]["unit_master_id"], rune_summary(u["unit"])) for u in units]
                    if ref not in replays and len(users) > 1:
                        dunits = [u["unit"]["unit_master_id"] for u in sorted(users[1].get("battle_units") or [], key=lambda u: u.get("pos_id", 0))]
                        replays[ref] = {"atk": [m for m, _ in runes[ref]], "def": dunits, "date": None}
                    if siege:
                        win = (j.get("win_lose_data") or j.get("win_lose"))
                        replays[ref].update(siege=True, win=win, j=j,
                                            date=datetime.datetime.fromtimestamp(resp.get("tvalue") or 0, BKK).date().isoformat())
    data = json.load(open(os.path.join(D, "matchups.json"), encoding="utf-8"))
    have = {x.get("ref") for x in data["matchups"] if x.get("ref")}
    n = 1 + max([int(x["id"][1:]) for x in data["matchups"] if x["id"][1:].isdigit()] or [0])
    today = datetime.date.today().isoformat()
    missing, added, skipped = set(), 0, 0
    for ref, rp in sorted(replays.items(), key=lambda kv: str(kv[0])):
        if ref in have:
            continue
        if ref not in runes or len(runes[ref]) != 3:
            skipped += 1
            continue
        keys = []
        for mid in rp["atk"] + rp["def"]:
            k = by_fam.get(fam(mid))
            if not k:
                missing.add(mid)
            keys.append(k)
        if None in keys:
            skipped += 1
            continue
        atk, dfn = keys[:3], keys[3:]
        if rp.get("siege") and rp.get("win") != 1:
            skipped += 1
            continue
        summ = {by_fam[fam(mid)]: s for mid, s in runes[ref]}
        mu = {
            "id": f"m{n}", "ref": ref, "src": "swex", "atk": atk, "def": dfn, "date": rp["date"], "added": today,
            "season": None, "note": "",
            "runes": [dict(m=k, spd=summ[k]["st"]["spd"], rs=summ[k]) for k in atk],
        }
        if rp.get("siege"):
            mu["guide"] = {"games": 1, "first": first_moves(rp["j"], atk, dfn)}
        data["matchups"].append(mu)
        n += 1; added += 1
    print(f"รีเพลย์ {len(replays)} · มีรูนทีมตี {len(runes)} · เพิ่มใหม่ {added} · ข้าม {skipped}")
    if missing:
        print("มอนที่ยังไม่มีในเว็บ (unit_master_id):", sorted(missing))
    if added and not a.dry:
        data["updated"] = today
        json.dump(data, open(os.path.join(D, "matchups.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
