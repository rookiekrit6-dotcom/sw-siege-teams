"use strict";
(() => {
  const EL = { water: ["น้ำ", "--water"], fire: ["ไฟ", "--fire"], wind: ["ลม", "--wind"], light: ["แสง", "--light"], dark: ["มืด", "--dark"] };
  const NEW_DAYS = 14;
  const OLD_DAYS = 365; // ตีไว้นานกว่านี้ ขึ้นป้าย "ข้อมูลเก่า"
  const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSc1rqq_RnKAq3Cj2cuzaY803iS1UplVPSjjcH0cPlXlvbo0Ig/viewform";
  const MAX_PICK = 3;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = { mode: "def", q: "", el: "", data: "", season: "", pick: [], pq: "", pel: "", open: new Set(), runesOpen: new Set() };
  let MON = {}, TEAMS = { def: [], atk: [] }, BY_ID = {}, UPDATED = "", SEASONS = [], MUS = [];

  /* ---------- helpers ---------- */
  const keyOf = (ms) => [...ms].sort().join("|");
  const monName = (k) => (MON[k] ? MON[k].n : k);
  const monMatch = (k, q) => monName(k).toLowerCase().includes(q) || (MON[k] && MON[k].en ? MON[k].en.toLowerCase().includes(q) : false);
  const monColor = (k) => (MON[k] && EL[MON[k].el] ? `var(${EL[MON[k].el][1]})` : "var(--line)");
  const bkk = (iso) => new Date(iso + "T00:00:00+07:00").getTime();
  const isOld = (iso) => !!iso && (Date.now() - bkk(iso)) / 864e5 > OLD_DAYS;
  const OLD_TAG = '<span class="old" title="ตีไว้นานกว่า 1 ปี เกมอาจปรับสมดุลไปแล้ว">ข้อมูลเก่า</span>';
  const isNew = (iso) => { if (!iso) return false; const d = (Date.now() - bkk(iso)) / 864e5; return d <= NEW_DAYS && d >= -1; };
  const thDate = (iso) => {
    try { return new Date(bkk(iso)).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }); }
    catch (e) { return iso; }
  };
  const monHTML = (k, extra, extraHtml) => {
    const m = MON[k];
    const nm = monName(k), sp = nm.match(/^(.+?)\s*(\(.+\))$/);
    const label = sp ? `${esc(sp[1])}<small>${esc(sp[2])}</small>` : esc(nm);
    return `<span class="m" style="--c:${monColor(k)}" title="${esc(nm)}"><img src="${esc(m ? m.img : "")}" alt="" width="52" height="52" loading="lazy" decoding="async">${label}${extra ? `<b class="spd-tag">${esc(extra)}</b>` : ""}${extraHtml || ""}</span>`;
  };

  /* ---------- สถิติการใช้งาน (GoatCounter) ----------
     นับแบบไม่เก็บข้อมูลส่วนตัว: เปิดทีมไหน ค้นหาอะไรแล้วเจอ/ไม่เจอทีมแก้
     เปิดใช้โดยใส่รหัสใน window.GC_CODE ที่ index.html */
  function track(path, title) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: path.slice(0, 200), title: title || path, event: true }); } catch (e) {}
  }
  const teamLabel = (t) => t.m.map(monName).join(" · ");

  /* ---------- กล่องมอนของฉัน (ไฟล์ SWEX) ----------
     อ่านไฟล์ในเบราว์เซอร์เท่านั้น ไม่อัปโหลด เก็บไว้ในเครื่องแค่ "มีมอนตัวไหน + SPD จากรูน" */
  const BOX_KEY = "mybox.v1";
  let BOX = null; // { name, at, n, u: { "<family>-<element>": spdBonus } }
  try { BOX = JSON.parse(localStorage.getItem(BOX_KEY) || "null"); } catch (e) { BOX = null; }
  const famKey = (id) => (id >= 1000000 ? `h${Math.floor(id / 100)}-${id % 10}` : `${Math.floor(id / 100)}-${id % 10}`);
  const boxSpd = (k) => (BOX && MON[k] && MON[k].id ? BOX.u[famKey(MON[k].id)] : undefined);
  const boxHas = (k) => boxSpd(k) !== undefined;
  const ownsAll = (team) => !!BOX && team.every(boxHas);

  // SPD ที่บวกจากรูน = ค่า SPD แบนทุกจุด (หลัก/รอง/ย่อย+เจียร) + ชุดสวิฟท์ 25% ของสปีดฐาน
  function runeSpd(u) {
    const runes = Array.isArray(u.runes) ? u.runes : Object.values(u.runes || {});
    let flat = 0, swift = 0, intangible = 0;
    for (const r of runes) {
      if (!r) continue;
      if (r.set_id === 3) swift++;
      if (r.set_id === 25) intangible++;
      if (r.pri_eff && r.pri_eff[0] === 8) flat += +r.pri_eff[1] || 0;
      if (r.prefix_eff && r.prefix_eff[0] === 8) flat += +r.prefix_eff[1] || 0;
      for (const sx of r.sec_eff || []) if (sx && sx[0] === 8) flat += (+sx[1] || 0) + (+sx[3] || 0);
    }
    const hasSwift = swift >= 4 || (swift === 3 && intangible > 0);
    return flat + (hasSwift ? Math.ceil((+u.spd || 0) * 0.25) : 0);
  }
  function parseSwex(data) {
    if (!data || !Array.isArray(data.unit_list)) throw new Error("ไม่ใช่ไฟล์ SWEX (ไม่พบรายชื่อมอน unit_list)");
    const units = [...data.unit_list, ...(Array.isArray(data.unit_storage_list) ? data.unit_storage_list : [])];
    const u = {};
    let n = 0;
    for (const x of units) {
      const id = +x.unit_master_id;
      if (!id) continue;
      const aw = Math.floor(id / 10) % 10;
      if (id < 1000000 && aw === 0) continue; // ยังไม่ปลุก ไม่นับ
      const key = famKey(id), sp = runeSpd(x);
      if (!(key in u) || sp > u[key]) u[key] = sp;
      n++;
    }
    if (!n) throw new Error("ไม่พบมอนที่ปลุกแล้วในไฟล์");
    const w = data.wizard_info || {};
    return { name: String(w.wizard_name || "").slice(0, 40), at: new Date().toISOString().slice(0, 10), n, u };
  }
  function saveBox(b) { BOX = b; try { b ? localStorage.setItem(BOX_KEY, JSON.stringify(b)) : localStorage.removeItem(BOX_KEY); } catch (e) {} }

  // ป้ายเทียบ SPD ใต้ไอคอนทีมตี
  function boxTag(k, need) {
    if (!BOX) return "";
    const mine = boxSpd(k);
    if (mine === undefined) return '<b class="my-tag no">ไม่มี</b>';
    if (need == null) return `<b class="my-tag ok">คุณ +${mine}</b>`;
    const gap = need - mine;
    return gap <= 0 ? `<b class="my-tag ok">คุณ +${mine}</b>` : `<b class="my-tag low">คุณ +${mine}<br>ขาด ${gap}</b>`;
  }

  /* ---------- data model ---------- */
  function build(monsters, ranked, mu) {
    MON = monsters;
    UPDATED = mu.updated || "";
    MUS = mu.matchups;
    const reg = { def: new Map(), atk: new Map() };
    for (const side of ["def", "atk"]) {
      for (const t of ranked[side]) {
        const k = keyOf(t.m);
        if (!reg[side].has(k)) reg[side].set(k, { side, id: `${side}-r${t.rank}`, rank: t.rank, swlens: true, pop: t.pop, m: t.m, mus: [] });
      }
    }
    for (const x of mu.matchups) {
      for (const side of ["atk", "def"]) {
        const k = keyOf(x[side]);
        if (!reg[side].has(k)) reg[side].set(k, { side, id: `${side}-x-${x.id}`, rank: null, pop: "", m: x[side], mus: [] });
        reg[side].get(k).mus.push(x);
      }
      x._atk = reg.atk.get(keyOf(x.atk));
      x._def = reg.def.get(keyOf(x.def));
    }
    BY_ID = {};
    for (const side of ["def", "atk"]) {
      const arr = [...reg[side].values()];
      // ทีมที่ไม่มีในอันดับ SWLens ต่อท้ายเป็นอันดับถัดไป (101, 102, …) ตามลำดับที่ส่งข้อมูลเข้ามา
      let next = Math.max(0, ...arr.filter((t) => t.rank).map((t) => t.rank)) + 1;
      for (const t of arr) if (!t.rank) t.rank = next++;
      arr.sort((a, b) => a.rank - b.rank);
      for (const t of arr) {
        t.mus.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        t.newest = t.mus.reduce((d, x) => (x.added > d ? x.added : d), "");
        t.latest = t.mus.reduce((d, x) => ((x.date || "") > d ? x.date : d), "");
        t.allOld = t.mus.length > 0 && t.mus.every((x) => isOld(x.date));
        BY_ID[t.id] = t;
      }
      TEAMS[side] = arr;
    }
    SEASONS = [...new Set(mu.matchups.map((x) => x.season).filter(Boolean))].sort().reverse();
  }

  const musFor = (t) => (state.season ? t.mus.filter((x) => x.season === state.season) : t.mus);

  /* ---------- filtering ---------- */
  function baseFilter(t, ignorePick) {
    const mus = musFor(t);
    if (state.data === "with" && !mus.length) return false;
    if (state.data === "without" && t.mus.length) return false;
    if (state.data === "mine" && !(BOX && (t.side === "atk" ? mus.length && ownsAll(t.m) : mus.some((x) => ownsAll(x.atk))))) return false;
    if (state.season && !mus.length) return false;
    if (state.el && !t.m.some((k) => MON[k] && MON[k].el === state.el)) return false;
    if (state.q && !t.m.some((k) => monMatch(k, state.q))) return false;
    if (!ignorePick && state.pick.length && !state.pick.every((k) => t.m.includes(k))) return false;
    return true;
  }
  const visibleTeams = () => TEAMS[state.mode].filter((t) => baseFilter(t, false));

  /* ---------- rendering ---------- */
  function matchupHTML(t, x) {
    const otherSide = t.side === "atk" ? "def" : "atk";
    const other = t.side === "atk" ? x._def : x._atk;
    const rid = `${t.id}:${x.id}`;
    const open = state.runesOpen.has(rid);
    const spdOf = Object.fromEntries((x.runes || []).map((r) => [r.m, r.spd]));
    const icons = x[otherSide].map((k) => monHTML(k, otherSide === "atk" && spdOf[k] ? `SPD +${spdOf[k]}` : "", otherSide === "atk" ? boxTag(k, spdOf[k]) : "")).join("");
    const miss = BOX ? x.atk.filter((k) => !boxHas(k)) : [];
    const mine = BOX ? (miss.length ? `<span class="my-sum no">ขาด ${miss.length} ตัว</span>` : '<span class="my-sum ok">✓ มีครบ</span>') : "";
    const mySpd = BOX && t.side === "atk" ? `<div class="mu-line">ของคุณ: ${x.atk.map((k) => { const v = boxSpd(k); return `${esc(monName(k))} ${v === undefined ? "ไม่มี" : "+" + v}`; }).join(" · ")}</div>` : "";
    const rk = other ? `${otherSide === "atk" ? "ทีมตีอันดับ" : "เด็คอันดับ"} ${other.rank}` : "";
    const atkSpd = t.side === "atk" && x.runes && x.runes.some((r) => r.spd)
      ? `<div class="mu-line">SPD ทีมตี: ${x.runes.map((r) => `${esc(monName(r.m))} ${r.spd != null ? "+" + r.spd : "-"}`).join(" · ")}</div>` : "";
    const runes = open
      ? `<p class="hint tap">แตะรูปเพื่อขยาย</p><div class="runes">${x.runes.map((r) => `<figure><img src="${esc(r.img)}" alt="รูน ${esc(monName(r.m))}" loading="eager" decoding="async" width="720" height="361"><figcaption>${esc(monName(r.m))}${r.spd ? ` · SPD +${r.spd}` : ""}</figcaption></figure>`).join("")}</div>`
      : "";
    return `<div class="mu">
      <div class="mu-top"><div class="mons">${icons}</div>
        <div class="mu-meta"><span class="rkb">${rk}</span>${mine}${x.season ? `<span class="season">${esc(x.season)}</span>` : ""}${x.date ? `<span>ตีเมื่อ ${esc(thDate(x.date))}</span>` : ""}${isOld(x.date) ? OLD_TAG : ""}${isNew(x.added) && !isOld(x.date) ? '<span class="new">ใหม่</span>' : ""}
          <button type="button" class="run-btn" data-runes="${esc(rid)}" aria-expanded="${open}">${open ? "ซ่อนรูน" : "ดูรูนทีมตี"}</button></div></div>
      ${atkSpd}${mySpd}${x.note ? `<div class="mu-line note-line">💬 ${esc(x.note)}</div>` : ""}
      ${runes}</div>`;
  }

  function detailHTML(t) {
    const mus = musFor(t);
    const title = t.side === "atk" ? `ตีชนะทีมตั้งรับ ${mus.length} ทีม` : `ทีมตีที่ชนะเด็คนี้ ${mus.length} ทีม`;
    return `<div class="det" id="det-${esc(t.id)}"><h3>${title}</h3>${mus.map((x) => matchupHTML(t, x)).join("")}
      <div class="det-foot"><button type="button" class="link-btn" data-share="${esc(t.id)}">🔗 คัดลอกลิงก์ทีมนี้</button></div></div>`;
  }

  function teamHTML(t) {
    const rk = `<span class="rk">${t.rank}</span>`;
    const mons = `<span class="mons">${t.m.map((k) => monHTML(k)).join("")}</span>`;
    const mus = musFor(t);
    const open = state.open.has(t.id);
    if (!mus.length) {
      const msg = t.side === "def" ? "ยังไม่มีทีมแก้เด็คนี้" : "ยังไม่มีข้อมูลว่าทีมนี้ตีชนะเด็คไหน";
      return `<article class="team" id="t-${esc(t.id)}">
      <button type="button" class="head" data-team="${esc(t.id)}" aria-expanded="${open}" aria-controls="det-${esc(t.id)}">${rk}${mons}</button>
      ${open ? `<div class="det" id="det-${esc(t.id)}"><p class="nodata">${msg} ถ้าเคยตีชนะ ส่งภาพหน้าจอมาได้เลย</p>
        <div class="det-foot"><a class="link-btn" href="${FORM_URL}" target="_blank" rel="noopener">📤 ส่งข้อมูลทีมนี้</a><button type="button" class="link-btn" data-share="${esc(t.id)}">🔗 คัดลอกลิงก์</button></div></div>` : ""}</article>`;
    }
    let label = t.side === "atk" ? `ตีได้ ${mus.length} ทีม` : `มีทีมแก้ ${mus.length} ทีม`;
    let myBadge = "";
    if (BOX) {
      const can = t.side === "atk" ? (ownsAll(t.m) ? 1 : 0) : mus.filter((x) => ownsAll(x.atk)).length;
      if (can) myBadge = `<span class="my-sum ok">${t.side === "atk" ? "✓ คุณมีครบ" : `คุณทำได้ ${can}`}</span>`;
    }
    return `<article class="team has" id="t-${esc(t.id)}">
      <button type="button" class="head" data-team="${esc(t.id)}" aria-expanded="${open}" aria-controls="det-${esc(t.id)}">${rk}${mons}
        <span class="badges"><span class="tag">${label}</span>${myBadge}</span></button>
      ${open ? detailHTML(t) : ""}</article>`;
  }

  function render() {
    document.body.classList.toggle("stats-mode", state.mode === "stats");
    if (state.mode === "stats") { renderStats(); return; }
    const all = TEAMS[state.mode];
    const rows = visibleTeams();
    const nData = all.filter((t) => musFor(t).length).length;
    const filtered = rows.length !== all.length;
    $("#cnt").textContent = (filtered ? `แสดง ${rows.length} จาก ` : "ทั้งหมด ") + `${all.length} ทีม · มีข้อมูลรูน ${nData} ทีม`;
    $("#list").innerHTML = rows.map(teamHTML).join("") || '<div class="empty">ไม่พบทีมที่ตรงกับตัวกรอง ลองล้างช่องค้นหา ตัวที่เลือก หรือเลือกธาตุอื่น</div>';
    renderChips();
    const done = $("#pickDone");
    done.textContent = `ดูผลลัพธ์ (${rows.length} ทีม)`;
    trackSearch(rows);
  }

  // นับคำค้น: รอให้พิมพ์เสร็จก่อน แล้วบันทึกว่าเจอทีมที่มีข้อมูลรูนไหม
  let lastQ = "", searchT;
  function trackSearch(rows) {
    clearTimeout(searchT);
    const q = state.q;
    if (!q || q === lastQ) return;
    const hit = rows.some((t) => musFor(t).length);
    searchT = setTimeout(() => { lastQ = q; track(`ค้นหา/${state.mode}/${hit ? "เจอ" : "ไม่เจอ"}/${q}`); }, 1500);
  }

  /* ---------- หน้าสถิติ ---------- */
  function renderStats() {
    const defs = TEAMS.def.filter((t) => t.mus.length), atks = TEAMS.atk.filter((t) => t.mus.length);
    const rankedDef = defs.filter((t) => t.swlens).length, totalRankedDef = TEAMS.def.filter((t) => t.swlens).length;
    const latest = MUS.reduce((d, x) => ((x.date || "") > d ? x.date : d), "");
    const oldN = MUS.filter((x) => isOld(x.date)).length;
    $("#cnt").textContent = `สรุปจากข้อมูลทีมตีชนะ ${MUS.length} คู่`;
    const box = (n, l) => `<div class="st-box"><b>${n}</b><span>${l}</span></div>`;
    // มอนที่ใช้ตีบ่อย
    const used = {};
    MUS.forEach((x) => x.atk.forEach((k) => (used[k] = (used[k] || 0) + 1)));
    const top = Object.entries(used).sort((a, b) => b[1] - a[1] || monName(a[0]).localeCompare(monName(b[0]), "th")).slice(0, 10);
    const max = top.length ? top[0][1] : 1;
    const bars = top.map(([k, n]) => `<div class="st-bar">${monHTML(k)}<span class="st-track"><span style="width:${Math.max(8, (n / max) * 100)}%"></span></span><b>${n}</b></div>`).join("");
    // เด็คที่มีทีมแก้มากสุด
    const most = [...defs].sort((a, b) => b.mus.length - a.mus.length || (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, 5);
    const decks = most.map((t) => `<a class="st-deck" href="#${esc(t.id)}"><span class="rk">${t.rank}</span><span class="mons">${t.m.map((k) => monHTML(k)).join("")}</span><span class="tag">${t.mus.length} ทีมแก้</span></a>`).join("");
    // ข้อมูลตามปี
    const yrs = {};
    MUS.forEach((x) => { const y = x.date ? String(Number(x.date.slice(0, 4)) + 543) : "ไม่ระบุ"; yrs[y] = (yrs[y] || 0) + 1; });
    const ymax = Math.max(1, ...Object.values(yrs));
    const years = Object.entries(yrs).sort((a, b) => a[0].localeCompare(b[0])).map(([y, n]) => `<div class="st-bar"><span class="st-y">${y === "ไม่ระบุ" ? y : "พ.ศ. " + y}</span><span class="st-track"><span style="width:${Math.max(8, (n / ymax) * 100)}%"></span></span><b>${n}</b></div>`).join("");
    $("#list").innerHTML = `
      <div class="st-grid">${box(MUS.length, "คู่ทีมตีชนะ")}${box(defs.length, "เด็คตั้งรับที่มีทีมแก้")}${box(`${rankedDef}/${totalRankedDef}`, "เด็คอันดับ SWLens ที่มีทีมแก้")}${box(latest ? thDate(latest) : "-", "ข้อมูลล่าสุดตีเมื่อ")}</div>
      <h2 class="sec">มอนที่ใช้ตีบ่อยที่สุด</h2><div class="st-list">${bars}</div>
      <h2 class="sec">เด็คตั้งรับที่มีทีมแก้มากที่สุด</h2><div class="st-list">${decks}</div>
      <h2 class="sec">จำนวนข้อมูลตามปีที่ตี</h2><div class="st-list">${years}</div>
      <p class="hint">${oldN ? `มี ${oldN} คู่ที่ตีไว้นานกว่า 1 ปี จะขึ้นป้าย "ข้อมูลเก่า" เพราะเกมอาจปรับสมดุลไปแล้ว · ` : ""}นับเฉพาะเกมที่ตีชนะ ไม่ใช่อัตราชนะ · ทีมตีทั้งหมด ${atks.length} ทีม</p>
      <a class="results-btn" href="${FORM_URL}" target="_blank" rel="noopener">📤 ช่วยส่งข้อมูลเพิ่ม</a>`;
  }

  // วาดใหม่เฉพาะการ์ดทีมเดียว ไม่แตะการ์ดอื่น (รูปรูนที่เปิดค้างไว้จะไม่กระพริบ)
  function rerenderTeam(id) {
    const t = BY_ID[id], el = document.getElementById("t-" + id);
    if (!t || !el) { render(); return; }
    const focusedTeam = document.activeElement && document.activeElement.closest && document.activeElement.closest(".team") === el;
    const focusSel = focusedTeam && document.activeElement.dataset.runes ? `[data-runes="${CSS.escape(document.activeElement.dataset.runes)}"]` : "button.head";
    const tpl = document.createElement("template");
    tpl.innerHTML = teamHTML(t).trim();
    el.replaceWith(tpl.content.firstElementChild);
    if (focusedTeam) { const f = document.getElementById("t-" + id).querySelector(focusSel); if (f) f.focus({ preventScroll: true }); }
  }

  function renderChips() {
    $("#chips").innerHTML = state.pick.map((k) => `<span class="chip">${esc(monName(k))}<button type="button" data-unpick="${esc(k)}" aria-label="เอา ${esc(monName(k))} ออก">×</button></span>`).join("")
      + (state.pick.length ? '<button type="button" class="link-btn" data-unpick="*">ล้างทั้งหมด</button>' : "");
    $("#pickCount").textContent = state.pick.length ? `(${state.pick.length}/${MAX_PICK})` : "";
  }

  let pickOrder = [];
  function pickCandidates() {
    if (!state.pick.length) return pickOrder;
    // เฉพาะตัวที่เคยอยู่ทีมเดียวกับทุกตัวที่เลือก (ในแท็บปัจจุบัน และตามตัวกรองอื่น)
    const co = new Set();
    for (const t of TEAMS[state.mode]) {
      if (!baseFilter(t, true)) continue;
      if (state.pick.every((k) => t.m.includes(k))) t.m.forEach((k) => co.add(k));
    }
    return [...state.pick, ...pickOrder.filter((k) => co.has(k) && !state.pick.includes(k))];
  }
  function renderPicker() {
    const pq = state.pq, pel = state.pel;
    const list = pickCandidates().filter((k) => state.pick.includes(k) || ((!pq || monMatch(k, pq)) && (!pel || (MON[k] && MON[k].el === pel))));
    $("#pickGrid").innerHTML = list
      .map((k) => `<button type="button" data-pick="${esc(k)}" aria-pressed="${state.pick.includes(k)}" style="--c:${monColor(k)}"><img src="${esc(MON[k].img)}" alt="" width="44" height="44" loading="lazy" decoding="async">${esc(monName(k))}</button>`)
      .join("") || '<div class="hint">ไม่พบมอนที่ตรงกับตัวกรอง</div>';
    $("#pickHint").textContent = state.pick.length
      ? `แสดงเฉพาะตัวที่เคยอยู่ทีมเดียวกับ ${state.pick.map(monName).join(" + ")} (${list.length - state.pick.length} ตัว)`
      : "เลือกได้สูงสุด 3 ตัว เลือกแล้วไอคอนจะเหลือเฉพาะตัวที่เคยอยู่ทีมเดียวกัน";
  }

  /* ---------- actions ---------- */
  function setPressed(sel, attr, val) {
    document.querySelectorAll(sel).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === val)));
  }
  function setMode(m) { state.mode = m; setPressed("#tabs button", "m", m); }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2400);
  }

  async function share(id) {
    const url = location.origin + location.pathname + "#" + id;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      const i = document.createElement("textarea");
      i.value = url; i.setAttribute("readonly", ""); i.style.position = "fixed"; i.style.opacity = "0";
      document.body.appendChild(i); i.select();
      try { ok = document.execCommand("copy"); } catch (e2) {}
      i.remove();
    }
    toast(ok ? "คัดลอกลิงก์แล้ว ส่งในไลน์ได้เลย" : url);
  }

  function resetFilters() {
    Object.assign(state, { q: "", el: "", data: "", season: "", pick: [], pq: "", pel: "" });
    $("#q").value = ""; $("#pq").value = ""; $("#season").value = "";
    setPressed("#els button", "el", ""); setPressed("#pels button", "el", ""); setPressed("#dataSeg button", "d", "");
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id === "stats") { setMode("stats"); render(); window.scrollTo(0, 0); try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} return; }
    const t = BY_ID[id];
    if (!t) return;
    setMode(t.side); resetFilters();
    state.open.add(t.id);
    render(); renderPicker();
    // เปิดจากลิงก์แล้วลบ #... ออกจากที่อยู่ เพื่อให้กดรีเฟรชแล้วกลับไปหน้าแรกตามปกติ
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    const el = document.getElementById("t-" + id);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  }

  function elChips(sel, onPick) {
    const box = $(sel);
    box.innerHTML = [["", "ทั้งหมด"], ...Object.entries(EL).map(([k, v]) => [k, v[0]])]
      .map(([k, l]) => `<button type="button" data-el="${k}" aria-pressed="${k === ""}">${l}</button>`).join("");
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setPressed(sel + " button", "el", b.dataset.el); onPick(b.dataset.el);
    });
  }

  function openLightbox(src, alt) {
    const lb = $("#lb"), img = lb.querySelector("img");
    img.src = src; img.alt = alt; lb.classList.remove("zoom"); lb.hidden = false;
    lb.querySelector(".lb-close").focus();
  }
  function closeLightbox() { const lb = $("#lb"); lb.hidden = true; lb.classList.remove("zoom"); }

  function bind() {
    elChips("#els", (v) => { state.el = v; render(); renderPicker(); });
    elChips("#pels", (v) => { state.pel = v; renderPicker(); });
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setMode(b.dataset.m); render(); if (state.mode !== "stats") renderPicker();
      if (state.mode === "stats") track("ดูหน้าสถิติ");
    });
    $("#dataSeg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      state.data = b.dataset.d; setPressed("#dataSeg button", "d", state.data); render(); renderPicker();
    });
    $("#season").addEventListener("change", (e) => { state.season = e.target.value; render(); renderPicker(); });
    let qt;
    $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); renderPicker(); }, 120); });
    $("#pq").addEventListener("input", (e) => { state.pq = e.target.value.trim().toLowerCase(); renderPicker(); });
    $("#pickClear").addEventListener("click", () => { state.pick = []; render(); renderPicker(); });
    const setPicker = (open) => { $("#picker").hidden = !open; $("#pickToggle").setAttribute("aria-expanded", String(open)); };
    $("#pickToggle").addEventListener("click", () => setPicker($("#picker").hidden));
    $("#pickDone").addEventListener("click", () => { setPicker(false); $("#cnt").scrollIntoView({ block: "start", behavior: "smooth" }); });
    $("#pickGrid").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-pick]"); if (!b) return;
      const k = b.dataset.pick;
      if (state.pick.includes(k)) state.pick = state.pick.filter((x) => x !== k);
      else if (state.pick.length < MAX_PICK) { state.pick.push(k); state.pq = ""; $("#pq").value = ""; }
      else { toast(`เลือกได้สูงสุด ${MAX_PICK} ตัว`); return; }
      render(); renderPicker();
    });
    $("#chips").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-unpick]"); if (!b) return;
      const k = b.dataset.unpick;
      state.pick = k === "*" ? [] : state.pick.filter((x) => x !== k); render(); renderPicker();
    });
    $("#list").addEventListener("click", (e) => {
      const img = e.target.closest(".runes img");
      if (img) { openLightbox(img.src, img.alt); return; }
      const rb = e.target.closest("button[data-runes]");
      if (rb) { const r = rb.dataset.runes; state.runesOpen.has(r) ? state.runesOpen.delete(r) : state.runesOpen.add(r); rerenderTeam(r.split(":")[0]); return; }
      const sb = e.target.closest("button[data-share]");
      if (sb) { share(sb.dataset.share); return; }
      const hb = e.target.closest("button[data-team]");
      if (hb) {
        const id = hb.dataset.team, t = BY_ID[id];
        if (state.open.has(id)) state.open.delete(id);
        else { state.open.add(id); if (t) track(`${t.mus.length ? "เปิดทีม" : "ไม่มีทีมแก้"}/${id}`, `${t.mus.length ? "เปิดทีม" : "ขอทีมแก้"}: ${teamLabel(t)}`); }
        rerenderTeam(id);
      }
    });
    $("#lb").addEventListener("click", (e) => {
      if (e.target.tagName === "IMG") { $("#lb").classList.toggle("zoom"); return; }
      closeLightbox();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#lb").hidden) closeLightbox(); });
    const top = $("#toTop");
    top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { top.hidden = window.scrollY < 900; ticking = false; });
    }, { passive: true });
    window.addEventListener("hashchange", openFromHash);
    bindBox();
  }

  function renderBox() {
    const st = $("#boxStatus"), clr = $("#boxClear"), btn = $("#boxBtn");
    const mineBtn = document.querySelector('#dataSeg button[data-d="mine"]');
    if (BOX) {
      st.textContent = `${BOX.name ? BOX.name + " · " : ""}มอน ${BOX.n} ตัว · โหลดเมื่อ ${thDate(BOX.at)}`;
      clr.hidden = false; btn.classList.add("on"); mineBtn.hidden = false;
    } else {
      st.textContent = "ยังไม่ได้โหลดไฟล์";
      clr.hidden = true; btn.classList.remove("on"); mineBtn.hidden = true;
      if (state.data === "mine") { state.data = ""; setPressed("#dataSeg button", "d", ""); }
    }
  }
  function bindBox() {
    const panel = $("#box"), btn = $("#boxBtn");
    const setOpen = (o) => { panel.hidden = !o; btn.setAttribute("aria-expanded", String(o)); };
    btn.addEventListener("click", () => setOpen(panel.hidden));
    $("#boxClose").addEventListener("click", () => setOpen(false));
    $("#boxFile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      $("#boxStatus").textContent = "กำลังอ่านไฟล์…";
      const rd = new FileReader();
      rd.onerror = () => { toast("อ่านไฟล์ไม่ได้"); renderBox(); };
      rd.onload = () => {
        try {
          saveBox(parseSwex(JSON.parse(rd.result)));
          renderBox(); render(); setOpen(false);
          toast(`โหลดกล่องมอนแล้ว ${BOX.n} ตัว`);
          track("โหลดกล่องมอน");
        } catch (err) {
          renderBox();
          $("#boxStatus").textContent = "โหลดไม่สำเร็จ: " + (err instanceof SyntaxError ? "ไฟล์ไม่ใช่ JSON" : err.message);
        }
      };
      rd.readAsText(f);
    });
    $("#boxClear").addEventListener("click", () => { saveBox(null); renderBox(); render(); toast("ลบข้อมูลกล่องมอนแล้ว"); });
    renderBox();
  }

  async function load() {
    const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
    try {
      const [monsters, ranked, mu] = await Promise.all([get("data/monsters.json"), get("data/ranked.json"), get("data/matchups.json")]);
      build(monsters, ranked, mu);
    } catch (e) {
      $("#cnt").textContent = "";
      $("#list").innerHTML = '<div class="err">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</div>';
      console.error(e);
      return;
    }
    if (UPDATED) $("#updated").textContent = `· อัปเดต ${thDate(UPDATED)}`;
    if (SEASONS.length) {
      const s = $("#season");
      s.innerHTML = '<option value="">ทุกซีซั่น</option>' + SEASONS.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
      s.hidden = false;
    }
    const freq = {};
    for (const side of ["def", "atk"]) for (const t of TEAMS[side]) for (const k of t.m) freq[k] = (freq[k] || 0) + 1;
    pickOrder = Object.keys(MON).filter((k) => freq[k]).sort((a, b) => freq[b] - freq[a] || monName(a).localeCompare(monName(b), "th"));
    render(); renderPicker();
    if (location.hash) openFromHash();
  }

  if (window.GC_CODE) {
    const g = document.createElement("script");
    g.async = true; g.src = "https://gc.zgo.at/count.js";
    g.dataset.goatcounter = `https://${window.GC_CODE}.goatcounter.com/count`;
    document.head.appendChild(g);
  }
  /* ---------- บังคับรีเฟรชเมื่อมีเวอร์ชันใหม่ ----------
     เช็ก version.json ตอนเปิดหน้าและทุกครั้งที่กลับมาที่แท็บ (เช่น สลับจากไลน์)
     ถ้าไม่ตรงกับเวอร์ชันที่เปิดอยู่ จะโหลดหน้าใหม่ด้วย ?v=ใหม่ เพื่อข้ามแคช (กันวนด้วย sessionStorage) */
  async function checkVersion() {
    try {
      const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const v = String((await r.json()).v || "");
      if (!v || v === window.APP_V) return;
      let done = "";
      try { done = sessionStorage.getItem("reloadedFor") || ""; } catch (e) {}
      if (done === v) return;
      try { sessionStorage.setItem("reloadedFor", v); } catch (e) {}
      const u = new URL(location.href);
      u.searchParams.set("v", v);
      location.replace(u.toString());
    } catch (e) {}
  }
  // กดรีเฟรชแล้วเริ่มที่บนสุดเสมอ (ไม่ค้างที่ตำแหน่งเดิม)
  try { history.scrollRestoration = "manual"; } catch (e) {}
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkVersion(); });
  checkVersion();

  bind();
  load();
})();
