"use strict";
(() => {
  const EL = { water: ["น้ำ", "--water"], fire: ["ไฟ", "--fire"], wind: ["ลม", "--wind"], light: ["แสง", "--light"], dark: ["มืด", "--dark"] };
  const NEW_DAYS = 14;
  const MAX_PICK = 3;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const state = { mode: "def", q: "", el: "", data: "", season: "", pick: [], pq: "", pel: "", open: new Set(), runesOpen: new Set() };
  let MON = {}, TEAMS = { def: [], atk: [] }, BY_ID = {}, UPDATED = "", SEASONS = [];

  /* ---------- helpers ---------- */
  const keyOf = (ms) => [...ms].sort().join("|");
  const monName = (k) => (MON[k] ? MON[k].n : k);
  const monColor = (k) => (MON[k] && EL[MON[k].el] ? `var(${EL[MON[k].el][1]})` : "var(--line)");
  const bkk = (iso) => new Date(iso + "T00:00:00+07:00").getTime();
  const isNew = (iso) => { if (!iso) return false; const d = (Date.now() - bkk(iso)) / 864e5; return d <= NEW_DAYS && d >= -1; };
  const thDate = (iso) => {
    try { return new Date(bkk(iso)).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }); }
    catch (e) { return iso; }
  };
  const monHTML = (k, extra) => {
    const m = MON[k];
    const nm = monName(k), sp = nm.match(/^(.+?)\s*(\(.+\))$/);
    const label = sp ? `${esc(sp[1])}<small>${esc(sp[2])}</small>` : esc(nm);
    return `<span class="m" style="--c:${monColor(k)}" title="${esc(nm)}"><img src="${esc(m ? m.img : "")}" alt="" width="52" height="52" loading="lazy" decoding="async">${label}${extra ? `<b class="spd-tag">${esc(extra)}</b>` : ""}</span>`;
  };

  /* ---------- data model ---------- */
  function build(monsters, ranked, mu) {
    MON = monsters;
    UPDATED = mu.updated || "";
    const reg = { def: new Map(), atk: new Map() };
    for (const side of ["def", "atk"]) {
      for (const t of ranked[side]) {
        const k = keyOf(t.m);
        if (!reg[side].has(k)) reg[side].set(k, { side, id: `${side}-r${t.rank}`, rank: t.rank, pop: t.pop, m: t.m, mus: [] });
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
      arr.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
      for (const t of arr) {
        t.mus.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        t.newest = t.mus.reduce((d, x) => (x.added > d ? x.added : d), "");
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
    if (state.season && !mus.length) return false;
    if (state.el && !t.m.some((k) => MON[k] && MON[k].el === state.el)) return false;
    if (state.q && !t.m.some((k) => monName(k).toLowerCase().includes(state.q))) return false;
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
    const icons = x[otherSide].map((k) => monHTML(k, otherSide === "atk" && spdOf[k] ? `SPD +${spdOf[k]}` : "")).join("");
    const rk = other && other.rank ? `อันดับ ${other.rank}` : "กิลด์";
    const atkSpd = t.side === "atk" && x.runes && x.runes.some((r) => r.spd)
      ? `<div class="mu-line">SPD ทีมตี: ${x.runes.map((r) => `${esc(monName(r.m))} ${r.spd != null ? "+" + r.spd : "-"}`).join(" · ")}</div>` : "";
    const runes = open
      ? `<p class="hint tap">แตะรูปเพื่อขยาย</p><div class="runes">${x.runes.map((r) => `<figure><img src="${esc(r.img)}" alt="รูน ${esc(monName(r.m))}" loading="eager" decoding="async" width="720" height="361"><figcaption>${esc(monName(r.m))}${r.spd ? ` · SPD +${r.spd}` : ""}</figcaption></figure>`).join("")}</div>`
      : "";
    return `<div class="mu">
      <div class="mu-top"><div class="mons">${icons}</div>
        <div class="mu-meta"><span class="rkb">${rk}</span>${x.season ? `<span class="season">${esc(x.season)}</span>` : ""}${x.date ? `<span>ตีเมื่อ ${esc(thDate(x.date))}</span>` : ""}${isNew(x.added) ? '<span class="new">ใหม่</span>' : ""}
          <button type="button" class="run-btn" data-runes="${esc(rid)}" aria-expanded="${open}">${open ? "ซ่อนรูน" : "ดูรูนทีมตี"}</button></div></div>
      ${atkSpd}${x.note ? `<div class="mu-line note-line">💬 ${esc(x.note)}</div>` : ""}
      ${runes}</div>`;
  }

  function detailHTML(t) {
    const mus = musFor(t);
    const title = t.side === "atk" ? `ตีชนะทีมตั้งรับ ${mus.length} ทีม` : `ทีมตีที่ชนะเด็คนี้ ${mus.length} ทีม`;
    return `<div class="det" id="det-${esc(t.id)}"><h3>${title}</h3>${mus.map((x) => matchupHTML(t, x)).join("")}
      <div class="det-foot"><button type="button" class="link-btn" data-share="${esc(t.id)}">🔗 คัดลอกลิงก์ทีมนี้</button></div></div>`;
  }

  function teamHTML(t) {
    const rk = t.rank ? `<span class="rk">${t.rank}</span>` : `<span class="rk g">กิลด์</span>`;
    const mons = `<span class="mons">${t.m.map((k) => monHTML(k)).join("")}</span>`;
    const mus = musFor(t);
    if (!mus.length) return `<article class="team" id="t-${esc(t.id)}"><div class="head">${rk}${mons}</div></article>`;
    const open = state.open.has(t.id);
    const label = t.side === "atk" ? `ตีได้ ${mus.length} ทีม` : `มีทีมแก้ ${mus.length} ทีม`;
    return `<article class="team has" id="t-${esc(t.id)}">
      <button type="button" class="head" data-team="${esc(t.id)}" aria-expanded="${open}" aria-controls="det-${esc(t.id)}">${rk}${mons}
        <span class="badges"><span class="tag">${label}</span>${isNew(t.newest) ? '<span class="new">ใหม่</span>' : ""}</span></button>
      ${open ? detailHTML(t) : ""}</article>`;
  }

  function render() {
    const all = TEAMS[state.mode];
    const rows = visibleTeams();
    const nRank = all.filter((t) => t.rank).length, nGuild = all.length - nRank, nData = all.filter((t) => musFor(t).length).length;
    const filtered = rows.length !== all.length;
    $("#cnt").textContent = (filtered ? `แสดง ${rows.length} ทีม · ` : "") + `อันดับ ${nRank} ทีม` + (nGuild ? ` + กิลด์ ${nGuild} ทีม` : "") + ` · มีข้อมูลรูน ${nData} ทีม`;
    const withD = rows.filter((t) => musFor(t).length), without = rows.filter((t) => !musFor(t).length);
    let html = "";
    if (withD.length) html += `<h2 class="sec">ทีมที่มีข้อมูลรูน (${withD.length})</h2>` + withD.map(teamHTML).join("");
    if (without.length) {
      const label = state.mode === "def" && withD.length ? "เด็คที่ยังไม่มีทีมแก้ — ช่วยกันส่งข้อมูลได้" : "อันดับทีมยอดนิยม";
      html += `<h2 class="sec">${label} (${without.length})</h2>` + without.map(teamHTML).join("");
    }
    $("#list").innerHTML = html || '<div class="empty">ไม่พบทีมที่ตรงกับตัวกรอง ลองล้างช่องค้นหา ตัวที่เลือก หรือเลือกธาตุอื่น</div>';
    renderChips();
    const done = $("#pickDone");
    done.textContent = `ดูผลลัพธ์ (${rows.length} ทีม)`;
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
    const list = pickCandidates().filter((k) => state.pick.includes(k) || ((!pq || monName(k).toLowerCase().includes(pq)) && (!pel || (MON[k] && MON[k].el === pel))));
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
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  }

  function resetFilters() {
    Object.assign(state, { q: "", el: "", data: "", season: "", pick: [], pq: "", pel: "" });
    $("#q").value = ""; $("#pq").value = ""; $("#season").value = "";
    setPressed("#els button", "el", ""); setPressed("#pels button", "el", ""); setPressed("#dataSeg button", "d", "");
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const t = BY_ID[id];
    if (!t) return;
    setMode(t.side); resetFilters();
    if (t.mus.length) state.open.add(t.id);
    render(); renderPicker();
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
      setMode(b.dataset.m); render(); renderPicker();
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
      if (hb) { const id = hb.dataset.team; state.open.has(id) ? state.open.delete(id) : state.open.add(id); rerenderTeam(id); }
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

  bind();
  load();
})();
