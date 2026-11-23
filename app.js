"use strict";
(() => {
  const EL = { water: ["น้ำ", "--water"], fire: ["ไฟ", "--fire"], wind: ["ลม", "--wind"], light: ["แสง", "--light"], dark: ["มืด", "--dark"] };
  const NEW_DAYS = 14;
  const MAX_PICK = 3;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = { mode: "def", q: "", el: "", only: false, pick: [], pq: "", open: new Set(), runesOpen: new Set() };
  let MON = {}, TEAMS = { def: [], atk: [] }, BY_ID = {}, UPDATED = "";

  /* ---------- helpers ---------- */
  const keyOf = (ms) => [...ms].sort().join("|");
  const monName = (k) => (MON[k] ? MON[k].n : k);
  const monColor = (k) => (MON[k] && EL[MON[k].el] ? `var(${EL[MON[k].el][1]})` : "var(--line)");
  const daysAgo = (iso) => (Date.now() - new Date(iso + "T00:00:00+07:00").getTime()) / 864e5;
  const isNew = (iso) => iso && daysAgo(iso) <= NEW_DAYS && daysAgo(iso) >= -1;
  const thDate = (iso) => {
    try { return new Date(iso + "T00:00:00+07:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); }
    catch (e) { return iso; }
  };
  const monHTML = (k) => {
    const m = MON[k];
    const src = m ? m.img : "";
    const name = monName(k);
    return `<span class="m" style="--c:${monColor(k)}"><img src="${esc(src)}" alt="" width="52" height="52" loading="lazy" decoding="async">${esc(name)}</span>`;
  };

  /* ---------- data model ---------- */
  function build(monsters, ranked, mu) {
    MON = monsters;
    UPDATED = mu.updated || "";
    const reg = { def: new Map(), atk: new Map() };
    for (const side of ["def", "atk"]) {
      for (const t of ranked[side]) {
        const k = keyOf(t.m);
        if (!reg[side].has(k)) reg[side].set(k, { side, id: `${side}-r${t.rank}`, rank: t.rank, m: t.m, mus: [] });
      }
    }
    for (const x of mu.matchups) {
      for (const side of ["atk", "def"]) {
        const k = keyOf(x[side]);
        if (!reg[side].has(k)) reg[side].set(k, { side, id: `${side}-x-${x.id}`, rank: null, m: x[side], mus: [] });
        reg[side].get(k).mus.push(x);
      }
    }
    BY_ID = {};
    for (const side of ["def", "atk"]) {
      const arr = [...reg[side].values()];
      arr.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
      for (const t of arr) {
        t.mus.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        t.newest = t.mus.reduce((d, x) => (x.added > d ? x.added : d), "");
        BY_ID[t.id] = t;
      }
      TEAMS[side] = arr;
    }
    // other side lookup for rank labels inside matchups
    for (const x of mu.matchups) {
      x._atk = reg.atk.get(keyOf(x.atk));
      x._def = reg.def.get(keyOf(x.def));
    }
  }

  /* ---------- rendering ---------- */
  function visibleTeams() {
    const q = state.q;
    return TEAMS[state.mode].filter((t) => {
      if (state.only && !t.mus.length) return false;
      if (state.el && !t.m.some((k) => MON[k] && MON[k].el === state.el)) return false;
      if (q && !t.m.some((k) => monName(k).toLowerCase().includes(q) || k.toLowerCase().includes(q))) return false;
      if (state.pick.length && !state.pick.every((k) => t.m.includes(k))) return false;
      return true;
    });
  }

  function matchupHTML(t, x) {
    const other = t.side === "atk" ? x._def : x._atk;
    const otherSide = t.side === "atk" ? "def" : "atk";
    const rid = `${t.id}:${x.id}`;
    const open = state.runesOpen.has(rid);
    const rk = other && other.rank ? `<span class="rkb">อันดับ ${other.rank}</span>` : `<span class="rkb">กิลด์</span>`;
    const runes = open
      ? `<div class="runes">${x.runes.map((r) => `<figure><img src="${esc(r.img)}" alt="รูน ${esc(monName(r.m))}" loading="lazy" decoding="async" width="720" height="361"><figcaption>${esc(monName(r.m))}</figcaption></figure>`).join("")}</div>`
      : "";
    return `<div class="mu">
      <div class="mu-top"><div class="mons">${x[otherSide].map(monHTML).join("")}</div>
        <div class="mu-meta">${rk}${x.date ? `<span>ตีเมื่อ ${esc(thDate(x.date))}</span>` : ""}${isNew(x.added) ? '<span class="new">ใหม่</span>' : ""}
          <button type="button" class="run-btn" data-runes="${esc(rid)}" aria-expanded="${open}">${open ? "ซ่อนรูน" : "ดูรูนทีมตี"}</button></div></div>
      ${runes}</div>`;
  }

  function detailHTML(t) {
    const title = t.side === "atk" ? `ตีชนะทีมตั้งรับ ${t.mus.length} ทีม` : `ทีมตีที่ชนะเด็คนี้ ${t.mus.length} ทีม`;
    return `<div class="det" id="det-${esc(t.id)}"><h3>${title}</h3>${t.mus.map((x) => matchupHTML(t, x)).join("")}
      <div class="det-foot"><button type="button" class="link-btn" data-share="${esc(t.id)}">🔗 คัดลอกลิงก์ทีมนี้</button></div></div>`;
  }

  function teamHTML(t) {
    const rk = t.rank ? `<span class="rk">${t.rank}</span>` : `<span class="rk g">กิลด์</span>`;
    const mons = `<span class="mons">${t.m.map(monHTML).join("")}</span>`;
    if (!t.mus.length) return `<article class="team" id="t-${esc(t.id)}"><div class="head">${rk}${mons}</div></article>`;
    const open = state.open.has(t.id);
    const label = t.side === "atk" ? `ตีได้ ${t.mus.length} ทีม` : `มีทีมแก้ ${t.mus.length} ทีม`;
    return `<article class="team" id="t-${esc(t.id)}">
      <button type="button" class="head" data-team="${esc(t.id)}" aria-expanded="${open}" aria-controls="det-${esc(t.id)}">${rk}${mons}
        <span class="badges"><span class="tag">${label}</span>${isNew(t.newest) ? '<span class="new">ใหม่</span>' : ""}</span></button>
      ${open ? detailHTML(t) : ""}</article>`;
  }

  function render() {
    const rows = visibleTeams();
    const total = TEAMS[state.mode].length;
    const withData = TEAMS[state.mode].filter((t) => t.mus.length).length;
    $("#cnt").textContent = `แสดง ${rows.length} จาก ${total} ทีม · มีข้อมูลรูน ${withData} ทีม`;
    $("#list").innerHTML = rows.map(teamHTML).join("") || '<div class="empty">ไม่พบทีมที่ตรงกับตัวกรอง ลองล้างช่องค้นหา ตัวที่เลือก หรือเลือกธาตุอื่น</div>';
    renderChips();
  }

  function renderChips() {
    $("#chips").innerHTML = state.pick.map((k) => `<span class="chip">${esc(monName(k))}<button type="button" data-unpick="${esc(k)}" aria-label="เอา ${esc(monName(k))} ออก">×</button></span>`).join("");
    $("#pickCount").textContent = state.pick.length ? `(${state.pick.length}/${MAX_PICK})` : "";
  }

  let pickOrder = [];
  function renderPicker() {
    const pq = state.pq;
    $("#pickGrid").innerHTML = pickOrder
      .filter((k) => !pq || monName(k).toLowerCase().includes(pq))
      .map((k) => `<button type="button" data-pick="${esc(k)}" aria-pressed="${state.pick.includes(k)}" style="--c:${monColor(k)}"><img src="${esc(MON[k].img)}" alt="" width="44" height="44" loading="lazy" decoding="async">${esc(monName(k))}</button>`)
      .join("") || '<div class="hint">ไม่พบมอนที่ค้นหา</div>';
  }

  /* ---------- actions ---------- */
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  async function share(id) {
    const url = location.origin + location.pathname + "#" + id;
    try { await navigator.clipboard.writeText(url); toast("คัดลอกลิงก์แล้ว ส่งในไลน์ได้เลย"); }
    catch (e) {
      const i = document.createElement("input");
      i.value = url; document.body.appendChild(i); i.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (e2) {}
      i.remove();
      toast(ok ? "คัดลอกลิงก์แล้ว" : url);
    }
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const t = BY_ID[id];
    if (!t) return;
    setMode(t.side);
    state.q = ""; state.el = ""; state.pick = []; state.only = false;
    $("#q").value = ""; $("#only").checked = false;
    document.querySelectorAll("#els button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.el === "")));
    if (t.mus.length) state.open.add(t.id);
    render(); renderPicker();
    const el = document.getElementById("t-" + id);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
    }
  }

  function bind() {
    $("#els").innerHTML = [["", "ทั้งหมด"], ...Object.entries(EL).map(([k, v]) => [k, v[0]])]
      .map(([k, l]) => `<button type="button" data-el="${k}" aria-pressed="${k === ""}">${l}</button>`).join("");
    $("#els").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      state.el = b.dataset.el;
      document.querySelectorAll("#els button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      render();
    });
    $("#tabs").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      setMode(b.dataset.m); render();
    });
    let qt;
    $("#q").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 120); });
    $("#pq").addEventListener("input", (e) => { state.pq = e.target.value.trim().toLowerCase(); renderPicker(); });
    $("#only").addEventListener("change", (e) => { state.only = e.target.checked; render(); });
    $("#pickClear").addEventListener("click", () => { state.pick = []; render(); renderPicker(); });
    $("#pickGrid").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-pick]"); if (!b) return;
      const k = b.dataset.pick;
      if (state.pick.includes(k)) state.pick = state.pick.filter((x) => x !== k);
      else if (state.pick.length < MAX_PICK) state.pick.push(k);
      else { toast(`เลือกได้สูงสุด ${MAX_PICK} ตัว`); return; }
      render(); renderPicker();
    });
    $("#chips").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-unpick]"); if (!b) return;
      state.pick = state.pick.filter((x) => x !== b.dataset.unpick); render(); renderPicker();
    });
    $("#list").addEventListener("click", (e) => {
      const img = e.target.closest(".runes img");
      if (img) { const lb = $("#lb"); lb.querySelector("img").src = img.src; lb.querySelector("img").alt = img.alt; lb.hidden = false; return; }
      const rb = e.target.closest("button[data-runes]");
      if (rb) { const r = rb.dataset.runes; state.runesOpen.has(r) ? state.runesOpen.delete(r) : state.runesOpen.add(r); render(); return; }
      const sb = e.target.closest("button[data-share]");
      if (sb) { share(sb.dataset.share); return; }
      const hb = e.target.closest("button[data-team]");
      if (hb) { const id = hb.dataset.team; state.open.has(id) ? state.open.delete(id) : state.open.add(id); render(); }
    });
    const closeLb = () => { $("#lb").hidden = true; };
    $("#lb").addEventListener("click", closeLb);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#lb").hidden) closeLb(); });
    window.addEventListener("hashchange", openFromHash);
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
    const freq = {};
    for (const side of ["def", "atk"]) for (const t of TEAMS[side]) for (const k of t.m) freq[k] = (freq[k] || 0) + 1;
    pickOrder = Object.keys(MON).filter((k) => freq[k]).sort((a, b) => freq[b] - freq[a] || monName(a).localeCompare(monName(b), "th"));
    render(); renderPicker();
    if (location.hash) openFromHash();
  }

  bind();
  load();
})();
