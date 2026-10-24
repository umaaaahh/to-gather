# Project State — to-gather

Updated 2026-10-24 (replaces the 2026-09-21 audit, which described a 3-commit repo and is now wrong in most places). Repo: `https://github.com/umaaaahh/to-gather.git`, branch `main`, 68 commits at `b52337e`. Solo developer (Uma).

Tags: **VERIFIED** (ran it this session), **READ** (from source, not run), **UNKNOWN**.

---

## ⚠ Pending right now

Committed 2026-10-24 (VERIFIED by tests/build) but **not deployed** — the live Firebase rules are still the old ones:

1. **Security rules fix** — `firestore.rules`, `storage.rules`, `tests/rules.test.mjs`, `package.json` (`test:rules` now uses `--project demo-to-gather`).
   - Admin is now "listed in Firestore `admins/{uid}`", not "any non-anonymous sign-in" (anyone could create an email/password account with the public API key and delete everything).
   - Storage drawings are create-only (`resource == null`); before, anyone could overwrite any drawing's PNG.
   - Drawing docs' `url`/`thumbUrl` must be this project's own Storage download URLs in `drawings/{zone}/`.
   - Shelf cover/link must be real Google hosts (`books.google.evil.com` used to pass).
   - `npm run test:rules`: 39/39 pass.
2. **Shelf profanity filter** — new `src/lib/profanity.js` (`obscenity@0.4.6`), wired into `src/lib/shelfStore.js` and `src/components/Bookshelf.jsx`. Notes with bad words are blocked client-side; titles/authors/notes are masked (`s***`) on the public shelf; admin sees raw text.

**Deploy order matters** (or Uma loses admin): add a doc `admins/<Uma's uid>` in the Firebase console first, then `firebase deploy --only firestore:rules,storage` (accept the prompt letting Storage rules read Firestore). After deploying, submit one leaf to confirm the new URL check accepts real uploads — the URL pattern was matched against the SDK's format, not live data.

---

## 1. What it is

"to-gather" — a phone-sized, hand-drawn (crayon) illustration of Cardigan St, Carlton (Melbourne) for a street festival / community activation. Visitors pan along the street, tap the crayon sun to **Draw**, and contribute a leaf (tree), a flower (flower bed) or a character (walks the street). Drawings upload and appear live for everyone. The street also has buttons that open popups: what's on, radio, a community bookshelf, street history, street stats.

## 2. Stack — READ

- React 19 + React Router 7, Vite 8, `@vitejs/plugin-react`. Plain CSS per component (`src/popup.css` shared popup look, `src/index.css` globals).
- Firebase 12: Firestore, Storage, Auth (email/password for admin, anonymous for Shelf visitors). Config in `src/lib/firebase.js`; `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_APP_ID` from `.env`.
- Google Books API for Shelf search (`VITE_GOOGLE_BOOKS_KEY`, optional).
- `obscenity` (pending, see above).
- Dev: `oxlint`, `firebase-tools` + `@firebase/rules-unit-testing` for the rules tests. No unit/UI tests.

## 3. Routes — READ (`src/App.jsx`)

| Route | What |
|---|---|
| `/` | `StreetScene` — the street |
| `/draw/:zoneId` | `DrawZone`, a child route rendered as an overlay over the blurred street. `tree` \| `stem` \| `free` (unknown → `free`) |
| `/admin` → `/admin/drawings`, `/admin/shelf` | Moderation, behind email/password sign-in |
| `/notices` | Old full-page notice board. Still routed, **not linked** from the street (superseded by `EventsPopout`) |
| `/canvas-test` | Dev harness for `DrawingCanvas`, no Firebase. Reachable in production |

App-wide layers outside the routes: `AccessMenu` (Settings), `SplashScreen`, `RadioLayer` (+ draggable `MiniRadio`), `BookshelfLayer`, `StreetHistoryLayer`, `StreetStatsLayer`.

## 4. Features — READ unless noted

| Feature | Where | Notes |
|---|---|---|
| Splash + Acknowledgement of Country | `SplashScreen` | Holds until street art and first drawings snapshot load (min/max time bounded) |
| Kangaroo street tour | `StreetTour` | First visit per page load; replay by tapping the kangaroo by the sign. Spotlights buttons, hops with sound |
| Street scene | `StreetScene.jsx` (1,517 lines) | Pan track, clouds, shadows, crayon buildings/road from R2 |
| Draw: 3 crayon trees | `CRAYON_TREES` in StreetScene | Leaf capacity 65 / 150 / 65. Only the first non-full tree is open; later ones "locked" |
| Draw: 2 flower beds | `FLOWER_BEDS` | 30 each, same open/locked logic |
| Draw: characters | `CHARACTER_BOXES` | Newest 114 walk the street |
| Drawing canvas | `DrawingCanvas.jsx` | Brush / eraser / fill / undo / clear, fixed palettes per zone (`zones.js`), templates baked into export (400×400 PNG). Lose-your-drawing warnings |
| Drawing arrival | `DrawingArrival`, StreetScene | Background save; drawing flies from the paper to its spot, glows, kangaroo two-bubble cheer. Save failure → toast |
| What's on | `EventsPopout`, opened from the notice board | Events from `src/data/events.csv` (509 rows, 2026-09-03 → 2027-09-03), grouped Today / This week / … with genre colours and thumbnails |
| Event scraper | `scripts/event-scraper/` | Node script, 11 sources in `venues.json`. Run by hand, commit the CSV + `events.scraped.json` |
| Radio | `Boombox`, `RadioLayer`, `MiniRadio` | Triple R, SYN, Radio Fodder live streams; ducks the street music; draggable mini radio persists position |
| The Shelf | `Bookshelf.jsx`, `shelfStore.js` | Google Books search, add a book with a note, one vote per (anonymous) visitor, Top 5. Firestore-backed since 2026-10-19 |
| About (street history) | `StreetHistory` | Timeline, from the Cardigan St sign |
| Street stats | `StreetStats` | ABS 2021 Census, Carlton vs Victoria, from the neon poster |
| Settings | `AccessMenu`, `lib/a11y.js` | Text size, reduced motion, high contrast, readable font, sound effects + music switches and volumes. Applied pre-paint by an inline script in `index.html` |
| Sounds | `lib/sounds.js` | Click pop on every button, popup sounds, background lofi loop, cues |
| Admin | `src/pages/admin/` | Drawings tab (delete one at a time), Shelf tab (delete notes / books with their votes) |

## 5. Data model — READ

- **`drawings`** `{ zone, url, path, thumbUrl, thumbPath, createdAt }`. Files at `drawings/{zone}/{ts}-{rand}.png` and `-thumb.png` (150×150), `Cache-Control: immutable`.
  - Scene reads per zone with caps (`ZONE_LIMITS` in `drawingsStore.js`): tree 290 and stem 70 **oldest-first** (full trees stay full, nothing moves; extras are stored but never shown), free 114 newest-first. Caps must stay in step with StreetScene capacities.
  - Composite indexes for zone + createdAt asc/desc in `firestore.indexes.json`.
- **`shelfBooks/{googleVolumeId}`** `{ title, authors, cover, link, votes, createdAt }` — `votes` kept in step with `shelfVotes` by the rules.
- **`shelfVotes/{uid}_{bookId}`** `{ uid, bookId, createdAt }` — readable only by the voter (and admin).
- **`shelfNotes/{auto}`** `{ bookId, text ≤140, uid, createdAt }`.
- **`admins/{uid}`** (pending deploy) — console-only allowlist, no client read/write.

## 6. Security — VERIFIED via emulator tests (with the pending changes)

- Public read on drawings and the Shelf. Public create on drawings (validated shape, own-bucket URLs). Shelf writes need an (anonymous) sign-in.
- Delete only for accounts in `admins`. No updates to drawings or notes.
- **Not covered:** no App Check or rate limiting — a script can still post unlimited drawings and fill the oldest-first trees/beds permanently with junk (admin deletes one at a time). Anonymous sign-in is per browser, so "one vote per person" is one per browser profile. No moderation queue; moderation is after the fact in `/admin`.

## 7. Build & deploy

- `npm run build` VERIFIED: one JS chunk ≈1.11 MB (≈322 KB gzip), Vite warns >500 KB. Admin, `/canvas-test` and Firebase Auth ship to every visitor.
- `npm run lint` VERIFIED: warnings only (StreetScene `openEvents` declared before `setEventsOpen`; one set-state-in-effect in Bookshelf; scraper unused vars).
- Hosting: `wrangler.toml` serves `dist/` as Cloudflare Workers static assets with SPA fallback. A commit "Trigger rebuild to pick up VITE_GOOGLE_BOOKS_KEY" suggests Cloudflare builds from git pushes. Live URL **UNKNOWN** (not in the repo).
- Firebase rules/indexes deploy via `firebase.json` + `.firebaserc` (project `to-gather-54dd7`).
- Scene art and most sounds: Cloudflare R2 dev domain `pub-…r2.dev` (`src/lib/assets.js`), no Cache-Control, rate-limited. Canvas templates, click pop and popup sound are bundled same-origin because the bucket sends no CORS headers.

## 8. Known rough edges — READ

- `README.md` is the default Vite template (being replaced in this update).
- Shelf read caps: notes load oldest-first with limit 2000 (newest disappear past that); books by votes with limit 500 (a new 1-vote book past 500 never shows).
- `ASSETS.noticeBoard` is a TEMP PNG until the WebP is replaced; several bucket names are `Untitled - …` and the folder is `resized assests`.
- `free` zone has no template art yet (`zones.js`).
- `/admin` shows its tabs to any email/password account; non-admins' deletes just fail.
- Older iOS Safari: animated scene items must not be positioned with `translate`/`scale` (see DECISIONS).
