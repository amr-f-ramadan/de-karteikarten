// Läuft in GitHub Actions. Erstellt Karten für Wörter auf der Warteliste (progress.json, Branch "progress")
// mit Gemini und hängt sie an cards.js im Branch main an. Braucht die Secrets GEMINI_KEY und GITHUB_TOKEN.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const key = process.env.GEMINI_KEY, gh = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
if (!key || !gh || !repo) { console.log("GEMINI_KEY oder GITHUB_TOKEN fehlt, Warteliste wird übersprungen."); process.exit(0); }
const git = f => { try { return execSync(`git show origin/progress:${f}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };
const P = JSON.parse(git("progress.json") || "null") || {};
const load = src => { const ctx = { window: {} }; vm.runInNewContext(src, ctx); return ctx.window.CARDS || []; };
let src = readFileSync("cards.js", "utf8");
let cards = load(src);
const isDone = k => cards.some(c => c.w.toLowerCase() === k || c.src === k);
const todo = Object.entries(P.pending || {}).filter(([k, s]) => !s.done && !isDone(k)).slice(0, 5);
if (!todo.length) { console.log("Warteliste ist leer."); process.exit(0); }

const famKey = c => c.fam || c.w.toLowerCase();
const plainDe = t => String(t || "").toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss");
const sameStem = (w, fam) => { const st = plainDe(fam).replace(/(end|ern|eln|en|n|e)$/, ""); return st.length >= 3 && plainDe(w).includes(st); };
const topicOf = list => { const n = {}; list.forEach(x => { if (x.cat) n[x.cat] = (n[x.cat] || 0) + 1; }); let best = null; for (const x of list) if (x.cat && (!best || n[x.cat] > n[best])) best = x.cat; return best; };
const PROMPT = w => `Du erstellst eine Lernkarte für einen arabischen Muttersprachler (Deutsch B1 bis B2).
Wort oder Ausdruck: "${w}"
Regeln:
- w: das Wort in Grundform, bei Nomen OHNE Artikel.
- g: "der", "die" oder "das" bei Nomen im Singular, "pl" bei Nomen nur im Plural, sonst "x".
- hint: kurz, z. B. Pluralform bei Nomen, "trennbar: ich rufe … an" oder Präposition mit Kasus.
- perf: nur bei Verben die Perfektform mit hat/ist, z. B. "hat gekündigt". Sonst leer.
- ar: die Bedeutung auf Arabisch, kurz, zwei Varianten mit Komma getrennt wenn sinnvoll.
- def: einfache deutsche Erklärung in einem Satz, B1-Niveau.
- ex: ein natürlicher Beispielsatz aus dem Alltag oder Beruf, B1-Niveau; das Zielwort in <b>…</b>.
- note: nur wenn es eine typische Falle gibt (Verwechslung, Kasus, falscher Freund), sonst leer.
- fam: das Stammwort der Wortfamilie, klein geschrieben, meist der Infinitiv des Verbs, sonst das Grundwort (z. B. "empfinden" für empfindlich, Empfindung und empfinden).
  Schon vorhandene Wortfamilien: ${[...new Set(cards.map(famKey))].join(", ")}.
  Wenn das Wort wirklich zu einer davon gehört, nimm genau diesen Wert. Sonst ein neues Stammwort.
  Wichtig: Wortfamilie heißt gleicher Wortstamm in der Form (abwesend und Abwesenheit), NICHT ähnliche Bedeutung (abwesend und verlassen sind keine Familie) und NICHT nur gleiche Vorsilbe.
- cat: das Thema der Karte auf Deutsch, ein bis drei Wörter.
  Schon vorhandene Themen: ${[...new Set(cards.map(c => c.cat).filter(Boolean))].join(", ")}.
  Nimm eines davon, wenn es inhaltlich passt. Nur wenn keines passt, erfinde ein neues, eher allgemeines Thema (z. B. "Arbeit", "Gesundheit", "Wohnen").
Keine Bindestriche als Gedankenstrich verwenden.`;
const SCHEMA = { type: "OBJECT", properties: {
  w: { type: "STRING" }, g: { type: "STRING", enum: ["der", "die", "das", "pl", "x"] }, hint: { type: "STRING" },
  perf: { type: "STRING" }, ar: { type: "STRING" }, def: { type: "STRING" }, ex: { type: "STRING" }, note: { type: "STRING" }, fam: { type: "STRING" }, cat: { type: "STRING" } },
  required: ["w", "g", "hint", "ar", "def", "ex", "fam", "cat"] };
async function gen(word) {
  for (const m of ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(word) }] }], generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.4 } })
    });
    if (r.status === 404 || r.status === 429 || r.status >= 500) { console.log(`${m}: ${r.status}`); continue; }
    if (!r.ok) { console.log(`${m}: ${r.status}`); return null; }
    const j = await r.json();
    try { return JSON.parse(j.candidates[0].content.parts.map(p => p.text || "").join("")); } catch { return null; }
  }
  return null;
}
const slug = w => w.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "").slice(0, 30) || "wort";

const added = [];
for (const [k, s] of todo) {
  const c = await gen(s.w);
  if (!c || !c.w || !c.ar || !c.ex) { console.log(`Noch nicht möglich: ${s.w}`); continue; }
  let id = slug(c.w), n = 2;
  while (cards.some(x => x.id === id)) id = slug(c.w) + n++;
  const o = { id, g: c.g, w: c.w, cat: (c.cat || "").trim() || "Selbst hinzugefügt", hint: c.hint || "", ar: c.ar, def: c.def || "", ex: c.ex, src: k };
  if (c.perf) o.perf = c.perf; if (c.note) o.note = c.note;
  const fk = (c.fam || "").trim().toLowerCase();
  if (fk && sameStem(o.w, fk) && (fk !== o.w.toLowerCase() || cards.some(x => famKey(x) === fk))) o.fam = fk;
  if (o.fam) { const kin = cards.filter(x => famKey(x) === o.fam && x.cat); if (kin.length) o.cat = topicOf(kin); }
  if (cards.some(x => x.w.toLowerCase() === o.w.toLowerCase())) { console.log(`Schon vorhanden: ${o.w}`); continue; }
  cards.push(o); added.push(o);
  const i = src.lastIndexOf("\n];");
  src = src.slice(0, i) + ",\n " + JSON.stringify(o) + src.slice(i);
}
if (!added.length) { console.log("Nichts hinzugefügt."); process.exit(0); }

const url = `https://api.github.com/repos/${repo}/contents/cards.js`;
const h = { Authorization: `Bearer ${gh}`, Accept: "application/vnd.github+json" };
const cur = await (await fetch(url + "?ref=main", { headers: h })).json();
if (Buffer.from(cur.content, "base64").toString() !== readFileSync("cards.js", "utf8")) { console.log("cards.js hat sich gerade geändert, nächster Lauf versucht es wieder."); process.exit(0); }
const r = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({ message: "Warteliste: " + added.map(o => o.w).join(", "), branch: "main", sha: cur.sha, content: Buffer.from(src).toString("base64") }) });
console.log("cards.js:", r.status, added.map(o => o.w).join(", "));
