// Läuft stündlich in GitHub Actions. Schickt eine Erinnerung, wenn die eingestellte Stunde erreicht ist
// und Karten fällig sind. Liest push.json und progress.json aus dem Branch "progress" und cards.js aus main.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import webpush from "web-push";

const force = process.env.FORCE === "true";
const git = f => { try { return execSync(`git show origin/progress:${f}`, { encoding: "utf8" }); } catch { return null; } };
const push = JSON.parse(git("push.json") || "null");
if (!push || !push.enabled || !push.sub) { console.log("Keine Erinnerung eingerichtet."); process.exit(0); }

const tz = push.tz || "Europe/Berlin";
const hourNow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hour12: false }).format(new Date())) % 24;
if (!force && hourNow !== Number(push.hour)) { console.log(`Jetzt ${hourNow} Uhr, Erinnerung um ${push.hour} Uhr.`); process.exit(0); }

const ctx = { window: {} };
vm.runInNewContext(readFileSync("cards.js", "utf8"), ctx);
const cards = ctx.window.CARDS || [];
const P = JSON.parse(git("progress.json") || "null") || { cards: {}, newDay: {}, opts: {} };
const now = Date.now();
const due = cards.filter(c => P.cards[c.id] && P.cards[c.id].due <= now).length;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const perDay = (P.opts && P.opts.newPerDay !== undefined) ? P.opts.newPerDay : 10;
const doneNew = P.newDay && P.newDay.d === today ? P.newDay.n : 0;
const fresh = Math.min(cards.filter(c => !P.cards[c.id]).length, Math.max(0, perDay - doneNew));
const total = due + fresh;
if (!total && !force) { console.log("Heute ist nichts mehr fällig."); process.exit(0); }

const parts = [];
if (due) parts.push(`${due} ${due === 1 ? "Karte" : "Karten"} zur Wiederholung`);
if (fresh) parts.push(`${fresh} neue ${fresh === 1 ? "Wort" : "Wörter"}`);
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:noreply@example.com", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const msg = { title: "DE: Karteikarten", body: parts.join(", ") || "Test: Erinnerungen funktionieren", count: total };
console.log("Nachricht:", msg.body);
try {
  await webpush.sendNotification(push.sub, JSON.stringify(msg));
  console.log("Gesendet:", parts.join(", "));
} catch (e) {
  console.error("Fehler beim Senden:", e.statusCode, e.body);
  process.exit(e.statusCode === 404 || e.statusCode === 410 ? 0 : 1);
}
