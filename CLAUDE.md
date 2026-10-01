# Rules for de-karteikarten (Amr's app)

The engine rules in `karteikarten-engine/CLAUDE.md` apply here in full. This file adds what is specific to this app.

## What this repo holds
- `index.html`: everything personal: colours, fonts, icon, title "DE: Karteikarten", header "Redemittel", German UI
  texts (`window.APP.t`), card `fields`, Gemini `rules`, `phrases`, `practice`, `remind`, public `vapid` key.
  Nothing else about behaviour lives here; the engine is loaded from `/karteikarten-engine/app.js` with a `?v=`
  cache buster through the `data-loader` script tags (keep them; the tools skip them).
- `cards.js`: the word list, one card per line, edited by the app and by `pending.mjs`. Hand edits follow the same
  format (`appendCards` style, ids as `slug`). Example sentences carry the target word in the needed form in `<b>`.
- `manifest.json`, `sw.js` (push notifications, no caching), `.github/workflows/remind.yml` (runs the engine's
  `tools/remind.mjs` with the engine checked out as `.engine/`).
- Branch `progress`: `progress.json`, `push.json`, `sent.json` written by the app and the reminder. Never edit
  progress by hand except when the user asks (and then only on that branch).

## Rules
1. The inline `<script>` blocks must run in Node's `vm` without `document` (the tools execute them). Keep them to
   `window.APP = { … }` plus small pure helper functions; no DOM access, no fetch.
2. New engine features need their German texts added to `window.APP.t` here **and** the Arabic ones in
   eman-deutsch, in the same change.
3. UI language is German, du-form, no dashes used as thoughts; Gemini rules say "Keine Bindestriche als
   Gedankenstrich verwenden" and must keep it.
4. Gemini rules: the card is for an Arabic native speaker at B1 to B2; input may be German, English or Arabic; the
   target word in `ex` appears in the form the sentence needs, every part bold; notes explain a trap, never the
   scanned sheet.
5. Changes go through a branch and a PR; merge when the user says so. GitHub Pages serves `main`.
6. Secrets (`VAPID_PRIVATE`, tokens, Gemini key) live only in repository secrets or on the phone, never in files.
7. Before a PR, run the engine's `npm test` with this checkout next to the engine; the suite reads this app's
   `index.html` and compares the Gemini request against a recorded fingerprint. A change to `rules` changes that
   fingerprint on purpose: say so and update it as described in the engine rules.
