/* Karteikarten-Engine: Leitner-Wiederholung, Artikel-Quiz, GitHub-Sync, Backup.
   Wird von index.html über window.APP (Einstellungen, Texte) und window.CARDS (Karten) gesteuert. */
(function () {
  "use strict";
  const C = window.APP, CARDS = window.CARDS;
  const T = k => (C.t[k] !== undefined ? C.t[k] : k);
  const ART = { der: "der", die: "die", das: "das", pl: "die", x: "" };
  const DAY = 864e5, INT = [0, 1, 3, 7, 14, 30, 60];
  const $ = s => document.querySelector(s);
  const byId = Object.fromEntries(CARDS.map(c => [c.id, c]));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- Fortschritt ---------- */
  const emptyP = () => ({ v: 1, cards: {}, art: {}, newDay: { d: "", n: 0 }, opts: {}, updated: 0 });
  function loadP() {
    try { const p = JSON.parse(localStorage.getItem(C.key) || "null"); if (p && p.v === 1) return Object.assign(emptyP(), p); } catch (e) {}
    const p = emptyP();
    if (C.migrate) try { C.migrate(p); } catch (e) {}
    return p;
  }
  let P = loadP(), dirty = false;
  function writeLocal() { try { localStorage.setItem(C.key, JSON.stringify(P)); } catch (e) {} }
  function changed() { P.updated = Date.now(); dirty = true; writeLocal(); scheduleSync(); }

  function merge(a, b) {
    const o = emptyP();
    for (const src of [a, b]) {
      for (const [id, s] of Object.entries(src.cards || {})) if (!o.cards[id] || s.t > o.cards[id].t) o.cards[id] = s;
      for (const [id, s] of Object.entries(src.art || {})) if (!o.art[id] || s.t > o.art[id].t) o.art[id] = s;
    }
    const na = a.newDay || { d: "", n: 0 }, nb = b.newDay || { d: "", n: 0 };
    o.newDay = na.d === nb.d ? { d: na.d, n: Math.max(na.n, nb.n) } : (na.d > nb.d ? na : nb);
    o.opts = (a.updated || 0) >= (b.updated || 0) ? Object.assign({}, b.opts, a.opts) : Object.assign({}, a.opts, b.opts);
    o.updated = Math.max(a.updated || 0, b.updated || 0);
    return o;
  }
  const opt = (k, d) => (P.opts && P.opts[k] !== undefined ? P.opts[k] : d);
  function setOpt(k, v) { P.opts = P.opts || {}; P.opts[k] = v; changed(); }

  /* ---------- Wiederholung ---------- */
  function newToday() { return P.newDay && P.newDay.d === today() ? P.newDay.n : 0; }
  function dueCards() {
    const now = Date.now();
    return CARDS.filter(c => P.cards[c.id] && P.cards[c.id].due <= now).sort((a, b) => P.cards[a.id].due - P.cards[b.id].due);
  }
  function freshCards() {
    const left = Math.max(0, opt("newPerDay", C.newPerDay || 10) - newToday());
    return CARDS.filter(c => !P.cards[c.id]).slice(0, left);
  }
  let queue = [], cur = null, flipped = false;
  function buildQueue() { queue = shuffle(dueCards()).concat(freshCards()); }
  function answer(ok) {
    const c = cur, now = Date.now();
    let s = P.cards[c.id];
    if (!s) {
      s = P.cards[c.id] = { b: 0, due: now, t: now, n: 0, w: 0 };
      if (!P.newDay || P.newDay.d !== today()) P.newDay = { d: today(), n: 0 };
      P.newDay.n++;
    }
    s.n++; s.t = now;
    if (ok) { s.b = Math.min(s.b + 1, INT.length - 1); s.due = startOfDay(now) + INT[s.b] * DAY; }
    else { s.w++; s.b = 0; s.due = now; queue.push(c); }
    changed();
    next();
  }
  function next() { cur = queue.shift() || null; flipped = false; render(); }

  /* ---------- Artikel-Quiz ---------- */
  const nouns = CARDS.filter(c => c.g === "der" || c.g === "die" || c.g === "das");
  let quiz = null;
  function pickQuiz() {
    if (!nouns.length) { quiz = null; return; }
    const w = nouns.map(c => { const a = P.art[c.id]; return 1 + (a ? a.w * 3 - a.ok * 0.5 : 2); }).map(x => Math.max(0.3, x));
    let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
    while (r > w[i]) { r -= w[i]; i++; }
    const c = nouns[Math.min(i, nouns.length - 1)];
    quiz = { c: quiz && quiz.c === c && nouns.length > 1 ? nouns[(i + 1) % nouns.length] : c, picked: null };
  }
  function quizAnswer(g) {
    if (quiz.picked) return;
    quiz.picked = g;
    const id = quiz.c.id, a = P.art[id] || { ok: 0, w: 0, t: 0 };
    if (g === quiz.c.g) a.ok++; else a.w++;
    a.t = Date.now(); P.art[id] = a; changed();
    render();
    speak(ART[quiz.c.g] + " " + quiz.c.w);
  }

  /* ---------- Aussprache ---------- */
  const hasTTS = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  let deVoice = null;
  function pickVoice() { const v = speechSynthesis.getVoices(); deVoice = v.find(x => x.lang === "de-DE") || v.find(x => (x.lang || "").toLowerCase().startsWith("de")) || null; }
  if (hasTTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function plain(h) { const d = document.createElement("div"); d.innerHTML = h; return d.textContent.replace(/…/g, "").trim(); }
  function speak(text) {
    if (!hasTTS) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plain(text));
      u.lang = "de-DE"; if (deVoice) u.voice = deVoice;
      u.rate = opt("slow", false) ? 0.7 : 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  const fullWord = c => (ART[c.g] ? ART[c.g] + " " : "") + c.w;

  /* ---------- GitHub-Sync ---------- */
  const TK = C.key + ":token";
  let token = "", sha = null, syncTimer = null, status = "local", busy = false;
  try { token = localStorage.getItem(TK) || ""; } catch (e) {}
  const API = "https://api.github.com/repos/" + C.repo + "/contents/progress.json";
  const b64enc = s => btoa(unescape(encodeURIComponent(s)));
  const b64dec = s => decodeURIComponent(escape(atob(s.replace(/\n/g, ""))));
  function gh(method, body) {
    return fetch(API + (method === "GET" ? "?ref=progress&t=" + Date.now() : ""), {
      method, cache: "no-store", keepalive: method !== "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
      body: body ? JSON.stringify(body) : undefined
    });
  }
  async function pull() {
    const r = await gh("GET");
    if (r.status === 404) { sha = null; return null; }
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(); sha = j.sha;
    return JSON.parse(b64dec(j.content));
  }
  async function makeBranch() {
    const base = "https://api.github.com/repos/" + C.repo + "/git/";
    const h = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" };
    try {
      const m = await fetch(base + "ref/heads/main", { headers: h, cache: "no-store" });
      if (!m.ok) return false;
      const r = await fetch(base + "refs", { method: "POST", headers: h, body: JSON.stringify({ ref: "refs/heads/progress", sha: (await m.json()).object.sha }) });
      return r.ok || r.status === 422;
    } catch (e) { return false; }
  }
  async function push() {
    const body = () => { const b = { message: "Fortschritt", content: b64enc(JSON.stringify(P)), branch: "progress" }; if (sha) b.sha = sha; return b; };
    let r = await gh("PUT", body());
    if ((r.status === 404 || r.status === 422) && !sha && await makeBranch()) r = await gh("PUT", body());
    if (r.status === 409 || r.status === 422) {
      const remote = await pull(); if (remote) { P = merge(P, remote); writeLocal(); }
      r = await gh("PUT", body());
    }
    if (!r.ok) throw new Error(r.status);
    sha = (await r.json()).content.sha; dirty = false;
  }
  async function sync(full) {
    if (!token || busy) return;
    busy = true; setStatus("syncing");
    try {
      if (full || sha === null) {
        const remote = await pull();
        if (remote) {
          const before = JSON.stringify(P.cards) + JSON.stringify(P.art);
          const m = merge(P, remote);
          if (JSON.stringify(m.cards) + JSON.stringify(m.art) !== JSON.stringify(remote.cards) + JSON.stringify(remote.art)) dirty = true;
          P = m; writeLocal();
          if (before !== JSON.stringify(P.cards) + JSON.stringify(P.art) && !cur) { buildQueue(); cur = queue.shift() || null; }
        } else dirty = true;
      }
      if (dirty) await push();
      setStatus("ok");
    } catch (e) { setStatus(String(e.message) === "401" ? "badtoken" : "error"); }
    busy = false; render();
  }
  function scheduleSync() { if (!token) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 15000); }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && dirty && token) { clearTimeout(syncTimer); sync(false); }
    if (document.visibilityState === "visible" && token) sync(true);
  });
  function setStatus(s) { status = s; const el = $("#syncDot"); if (el) { el.dataset.s = s; el.title = T("st_" + s); } const st = $("#syncState"); if (st) st.textContent = T("st_" + s); }

  /* ---------- Backup ---------- */
  function exportFile() {
    const blob = new Blob([JSON.stringify(P, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = C.key + "-" + today() + ".json";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function importFile(f) {
    const r = new FileReader();
    r.onload = () => {
      try { const p = JSON.parse(r.result); if (!p || p.v !== 1) throw 0; P = merge(P, p); changed(); flash(T("imported")); buildQueue(); next(); }
      catch (e) { flash(T("importFail")); }
    };
    r.readAsText(f);
  }

  /* ---------- Oberfläche ---------- */
  let mode = "learn", listOpen = null;
  function flash(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => (el.hidden = true), 2600); }
  const gClass = c => "g-" + (c.g || "x");
  const speakBtn = (what, label) => `<button class="say" data-say="${what}" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg></button>`;
  const wordHTML = c => `<span class="de word">${ART[c.g] ? `<span class="art">${ART[c.g]}</span> ` : ""}${esc(c.w)}</span>`;

  function renderLearn() {
    const due = dueCards().length, fresh = freshCards().length;
    if (!cur) {
      const tomorrow = CARDS.filter(c => P.cards[c.id] && P.cards[c.id].due <= startOfDay(Date.now()) + 2 * DAY).length;
      return `<div class="done"><p class="big">${T("doneTitle")}</p><p>${T("doneText").replace("{n}", tomorrow)}</p>
        <button class="btn" data-act="more">${T("moreNew")}</button></div>`;
    }
    const c = cur, s = P.cards[c.id], arFirst = opt("arFirst", false);
    const front = arFirst
      ? `<p class="ar-big">${esc(c.ar)}</p><p class="hint">${T("whatDe")}</p>`
      : `${wordHTML(c)}${c.hint ? `<p class="hint de">${esc(c.hint)}</p>` : ""}`;
    const back = `
      ${arFirst ? wordHTML(c) + (c.hint ? `<p class="hint de">${esc(c.hint)}</p>` : "") : ""}
      <p class="ar" lang="ar" dir="rtl">${esc(c.ar)}</p>
      ${c.def ? `<p class="def de">${c.def}</p>` : ""}
      ${c.perf ? `<p class="perf de">Perfekt: <b>${esc(c.perf)}</b></p>` : ""}
      <div class="exrow"><p class="ex de">${c.ex}</p>${speakBtn("ex", T("sayEx"))}</div>
      ${c.tr ? `<p class="tr" lang="ar" dir="rtl">${esc(c.tr)}</p>` : ""}
      ${c.note ? `<p class="note">${c.note}</p>` : ""}`;
    return `
      <p class="meta">${T("left").replace("{n}", queue.length + 1)}${s ? "" : ` <span class="new">${T("newCard")}</span>`}</p>
      <div class="card ${gClass(c)} ${flipped ? "flipped" : ""}" data-act="flip" role="button" tabindex="0" aria-label="${T("flip")}">
        ${c.cat ? `<p class="cat">${esc(c.cat)}</p>` : ""}
        <div class="face">${flipped ? back : front}</div>
        ${speakBtn("w", T("sayWord"))}
      </div>
      ${flipped
        ? `<div class="rate"><button class="btn again" data-act="no">${T("again")}</button><button class="btn ok" data-act="yes">${T("good")}</button></div>`
        : `<button class="btn wide" data-act="flip">${T("show")}</button>`}
      <p class="meta dim">${T("todayStat").replace("{d}", due).replace("{f}", fresh)}</p>`;
  }

  function renderQuiz() {
    if (!quiz) pickQuiz();
    if (!quiz) return `<div class="done"><p>${T("noNouns")}</p></div>`;
    const c = quiz.c, a = P.art[c.id];
    const opts = ["der", "die", "das"].map(g => {
      let cls = "btn art-" + g;
      if (quiz.picked) { if (g === c.g) cls += " right"; else if (g === quiz.picked) cls += " wrong"; else cls += " fade"; }
      return `<button class="${cls}" data-act="art" data-g="${g}">${g}</button>`;
    }).join("");
    return `
      <p class="meta">${T("artQ")}</p>
      <div class="card quiz ${quiz.picked ? gClass(c) : ""}">
        <div class="face"><span class="de word">${quiz.picked ? `<span class="art">${ART[c.g]}</span> ` : "<span class=\"blank\">___</span> "}${esc(c.w)}</span>
        ${quiz.picked ? `<p class="ar" lang="ar" dir="rtl">${esc(c.ar)}</p>` : ""}</div>
      </div>
      <div class="arts">${opts}</div>
      ${quiz.picked ? `<button class="btn wide" data-act="nextq">${T("next")}</button>` : ""}
      <p class="meta dim">${a ? T("artStat").replace("{ok}", a.ok).replace("{w}", a.w) : ""}</p>`;
  }

  function renderList() {
    const rows = CARDS.map(c => {
      const s = P.cards[c.id], b = s ? s.b : -1;
      const dots = Array.from({ length: INT.length - 1 }, (_, i) => `<i class="${i < b ? "on" : ""}"></i>`).join("");
      const open = listOpen === c.id;
      return `<li class="${gClass(c)}"><button class="row" data-act="open" data-id="${c.id}">
        ${wordHTML(c)}<span class="lvl" aria-label="${T("level")} ${Math.max(b, 0)}">${dots}</span></button>
        ${open ? `<div class="detail"><p class="ar" lang="ar" dir="rtl">${esc(c.ar)}</p>${c.perf ? `<p class="perf de">Perfekt: <b>${esc(c.perf)}</b></p>` : ""}<p class="ex de">${c.ex}</p>${c.tr ? `<p class="tr" lang="ar" dir="rtl">${esc(c.tr)}</p>` : ""}</div>` : ""}</li>`;
    }).join("");
    const learned = CARDS.filter(c => P.cards[c.id] && P.cards[c.id].b >= 3).length;
    return `<p class="meta">${T("listStat").replace("{a}", learned).replace("{t}", CARDS.length)}</p><ul class="list">${rows}</ul>`;
  }

  function renderSettings() {
    return `<div class="settings">
      <h2>${T("syncH")}</h2>
      <p class="dim">${T("syncHelp")}</p>
      <p><span id="syncDot" data-s="${status}"></span> <span id="syncState">${T("st_" + status)}</span></p>
      ${token
        ? `<div class="row2"><button class="btn" data-act="syncnow">${T("syncNow")}</button><button class="btn" data-act="deltoken">${T("delToken")}</button></div>`
        : `<label class="fld">${T("tokenLabel")}<input id="tok" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…"></label>
           <button class="btn ok" data-act="savetoken">${T("saveToken")}</button>`}
      <h2>${T("backupH")}</h2>
      <div class="row2"><button class="btn" data-act="export">${T("export")}</button>
      <label class="btn filebtn">${T("import")}<input id="imp" type="file" accept="application/json,.json"></label></div>
      <h2>${T("optsH")}</h2>
      <label class="fld inline">${T("newPerDay")} <input id="npd" type="number" min="0" max="50" value="${opt("newPerDay", C.newPerDay || 10)}"></label>
      <label class="chk"><input id="arf" type="checkbox" ${opt("arFirst", false) ? "checked" : ""}> ${T("arFirst")}</label>
      <label class="chk"><input id="slw" type="checkbox" ${opt("slow", false) ? "checked" : ""}> ${T("slow")}</label>
      <h2>${T("resetH")}</h2>
      <button class="btn again" data-act="reset">${T("reset")}</button>
    </div>`;
  }

  function render() {
    document.querySelectorAll("nav button").forEach(b => b.setAttribute("aria-current", b.dataset.mode === mode ? "page" : "false"));
    const dueN = dueCards().length + freshCards().length;
    const badge = $("#badge"); if (badge) { badge.textContent = dueN; badge.hidden = !dueN; }
    $("#main").innerHTML = mode === "learn" ? renderLearn() : mode === "quiz" ? renderQuiz() : mode === "list" ? renderList() : renderSettings();
    setStatus(status);
  }

  document.addEventListener("click", e => {
    const nb = e.target.closest("nav button");
    if (nb) { mode = nb.dataset.mode; if (mode === "quiz" && !quiz) pickQuiz(); render(); window.scrollTo(0, 0); return; }
    const say = e.target.closest(".say");
    if (say) { e.stopPropagation(); const c = mode === "quiz" ? quiz && quiz.c : cur; if (c) speak(say.dataset.say === "ex" ? c.ex : fullWord(c)); return; }
    const el = e.target.closest("[data-act]"); if (!el) return;
    const act = el.dataset.act;
    if (act === "flip") { if (!flipped) { flipped = true; render(); } }
    else if (act === "yes") answer(true);
    else if (act === "no") answer(false);
    else if (act === "more") { P.newDay = { d: today(), n: Math.max(0, newToday() - opt("newPerDay", C.newPerDay || 10)) }; changed(); buildQueue(); next(); }
    else if (act === "art") quizAnswer(el.dataset.g);
    else if (act === "nextq") { pickQuiz(); render(); }
    else if (act === "open") { listOpen = listOpen === el.dataset.id ? null : el.dataset.id; render(); }
    else if (act === "savetoken") {
      const v = ($("#tok").value || "").trim(); if (!v) return;
      token = v; try { localStorage.setItem(TK, v); } catch (x) {}
      sync(true).then(() => flash(status === "ok" ? T("tokenOk") : T("st_" + status)));
    }
    else if (act === "deltoken") { token = ""; sha = null; try { localStorage.removeItem(TK); } catch (x) {} setStatus("local"); render(); }
    else if (act === "syncnow") sync(true).then(() => flash(T("st_" + status)));
    else if (act === "export") exportFile();
    else if (act === "reset") { if (confirm(T("resetQ"))) { P = Object.assign(emptyP(), { opts: P.opts }); changed(); buildQueue(); next(); } }
  });
  document.addEventListener("change", e => {
    if (e.target.id === "imp" && e.target.files[0]) importFile(e.target.files[0]);
    else if (e.target.id === "npd") { setOpt("newPerDay", Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0))); if (!cur) { buildQueue(); cur = queue.shift() || null; } }
    else if (e.target.id === "arf") setOpt("arFirst", e.target.checked);
    else if (e.target.id === "slw") setOpt("slow", e.target.checked);
  });
  document.addEventListener("keydown", e => {
    if (mode !== "learn" || !cur || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!flipped) { flipped = true; render(); } }
    else if (flipped && (e.key === "1" || e.key === "ArrowLeft")) answer(false);
    else if (flipped && (e.key === "2" || e.key === "ArrowRight")) answer(true);
  });

  buildQueue(); cur = queue.shift() || null;
  setStatus(token ? "syncing" : "local");
  render();
  if (token) sync(true);
})();
