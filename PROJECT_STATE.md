# Project State — to-gather

Audit date: 2026-09-21. Repo audited: `to-gather-scaffold/to-gather 2` (has its own `.git`, remote `https://github.com/umaaaahh/to-gather.git`, branch `main`, 3 commits, working tree clean — VERIFIED via `git status`/`git log`).

Tags: **VERIFIED** (ran it / observed it live), **READ** (from source only, not executed), **UNKNOWN** (could not determine).

---

## 1. Overview

**Game concept — READ.** Not a scored/competitive game. It's a collaborative community-art + bulletin app called "**Grow the Street**": visitors see a phone-sized illustrated street scene, tap one of three zones to draw something (a leaf, a flower, a character) with a constrained palette, and the finished drawing uploads and scatters live into the shared scene for every visitor to see. A "community notice board" page shows a festival events calendar. Mock event titles ("Street Festival Kickoff", "Community BBQ") indicate this is built for a real-world street-festival activation. Source: [src/pages/StreetScene.jsx](src/pages/StreetScene.jsx), [src/pages/NoticeBoard.jsx](src/pages/NoticeBoard.jsx).

**Tech stack — READ, versions VERIFIED via `npm install`.**
- React 19.2.8 + React Router 7.18.2, built with Vite 8.2.2 / `@vitejs/plugin-react`.
- Firebase 12.18.0 (Firestore + Storage only — no Auth, no Functions, no Hosting SDK usage found).
- `qrcode.react` 4.2.0 is a declared dependency but is **never imported anywhere in `src/`** (verified with a repo-wide grep) — dead dependency.
- Drawing is a hand-rolled `<canvas>` 2D implementation (brush/eraser/scanline flood-fill) — no drawing library.
- Linting: `oxlint` 1.79.0 via `.oxlintrc.json`. No CSS framework — plain CSS files per component/page.
- No test framework/runner is configured (`package.json` has no `test` script; no `*.test.*`/`*.spec.*` files found in `src/`).

**Folder structure — READ.**
```
src/
  App.jsx            route table
  main.jsx           React root
  index.css          global reset
  assets/            bundled SVGs (house, tree, stem, kangaroo, clouds, leaf outline)
  lib/
    firebase.js      Firebase app/Firestore/Storage init
    drawingsStore.js Firestore+Storage read/write/subscribe for drawings
    zones.js         per-zone palette/template/export-size config
    assets.js        asset URL resolution (local bundle vs. R2 CDN)
  components/
    DrawingCanvas.jsx/.css   the drawing surface (brush/eraser/fill/undo/export)
  pages/
    StreetScene.jsx/.css     "/" — the main scene
    DrawZone.jsx             "/draw/:zoneId" — wraps DrawingCanvas, saves to Firebase
    NoticeBoard.jsx/.css     "/notices" — calendar + mock events
    CanvasTest.jsx           "/canvas-test" — standalone dev harness, no Firebase
public/            favicon.svg, icons.svg (static assets served as-is)
firestore.rules, storage.rules   security rules (committed, not tied to any firebase.json)
```

**Routes/screens — READ**, from [src/App.jsx](src/App.jsx):
| Route | Component | Purpose |
|---|---|---|
| `/` | StreetScene | main scene, view/contribute toggle |
| `/draw/:zoneId` | DrawZone | drawing surface for `tree`\|`stem`\|`free` (`flower` aliases to `stem`) |
| `/notices` | NoticeBoard | calendar + events list (mock data) |
| `/canvas-test` | CanvasTest | internal dev harness, reachable in production build, no nav link to it |

**Data model — READ**, from [src/lib/drawingsStore.js](src/lib/drawingsStore.js) and [firestore.rules](firestore.rules):
- Firestore collection `drawings`, one doc per contribution, auto-ID. Fields: `zone` (`"tree"|"stem"|"free"`), `url` (Storage download URL, string, <2000 chars), `path` (Storage object path), `createdAt` (`serverTimestamp()`).
- Storage path: `drawings/{zone}/{timestamp}-{random6}.png`, PNG only, <5MB (enforced by [storage.rules](storage.rules)).
- No `events` Firestore collection exists yet — NoticeBoard's own code comment says one is planned ("Phase 2 will read this from a Firestore 'events' collection instead") but it still reads a hardcoded local array. See [src/pages/NoticeBoard.jsx:7](src/pages/NoticeBoard.jsx#L7).

**Env / deploy setup — READ**, from [src/lib/firebase.js](src/lib/firebase.js), [.env](.env), [.env.example](.env.example):
- `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` come from Vite env vars; `.env` holds real values locally and is git-ignored (VERIFIED not present in `git ls-tree` of the first commit). `.env.example` ships blank placeholders.
- `authDomain`, `projectId` (`to-gather-54dd7`), `storageBucket`, `messagingSenderId` are hardcoded directly in `firebase.js`, not env-driven.
- Scene artwork (house/tree/stem/kangaroo/notice-board/canvas-frame) loads from an external Cloudflare R2 public dev bucket, overridable via `VITE_ASSET_BASE_URL`. The code comment itself flags this bucket as dev-only: "swap it for a custom domain before launch (it's rate-limited and not meant for production traffic)" — [src/lib/assets.js:1-7](src/lib/assets.js#L1-L7).
- No `firebase.json` / `.firebaserc` found anywhere in the repo (VERIFIED via glob) — no committed Hosting/deploy target.

---

## 2. Run it

All commands run directly in `to-gather-scaffold/to-gather 2` with Node v24.14.0 / npm 11.11.0.

| Step | Result | Status |
|---|---|---|
| `npm install` | "up to date, audited 116 packages in 28s ... found 0 vulnerabilities" | **VERIFIED** |
| `npm run build` (`vite build`) | Succeeded in 2.92s, 55 modules transformed. Output: `dist/assets/index-*.js` = 734.25 kB (224.19 kB gzip). Vite warned: chunk >500kB, suggests code-splitting. | **VERIFIED** |
| `npm run lint` (`oxlint`) | Ran, no output/errors — clean. | **VERIFIED** |
| `npm run dev` (`vite`) | Started on `http://localhost:5184` (5183 was already taken by something else on this machine) in 1.1s. `curl` against `/` returned HTTP 200 and the SPA shell HTML. | **VERIFIED** |
| Interactive/visual behavior (drawing, scene rendering, live scatter animation, notice board rendering) | Not checked — no headless-browser tool (`chromium-cli` or similar) is available in this environment, and installing one would mean adding new dependencies, which falls outside the read-only scope of this audit. | **READ only** (from source), not VERIFIED visually |
| Test suite | No test script exists in `package.json`; no test files found anywhere under `src/`. | **VERIFIED absent** |
| Firebase backend reachability | A direct, read-only query against the live Firestore project (`to-gather-54dd7`, using the real API key from `.env`) succeeded and returned 206 real documents in the `drawings` collection (84 `tree`, 51 `stem`, 71 `free`), each with valid Storage download URLs. No writes or deletes were performed. | **VERIFIED** |
| Timestamp analysis of those 206 docs | All 206 `createdAt` timestamps fall within roughly a 1.5-hour window on 2026-09-11 — consistent with a single dev/test session on the day of the "Phase 2" commit, not real end-user traffic. No documents dated after that. | **VERIFIED** (computed directly from the returned data) |

---

## 3. Feature inventory

| Feature | Status | Files | Evidence |
|---|---|---|---|
| Street scene view (pan/scroll, clouds, house art) | Working | [StreetScene.jsx](src/pages/StreetScene.jsx), [StreetScene.css](src/pages/StreetScene.css) | READ — code complete; dev server serves the shell (VERIFIED), visual render not confirmed in a browser |
| Start/Return toggle (view ↔ contribute mode) | Working | StreetScene.jsx:495-500 | READ |
| "Colour the tree" zone → draw → publish | Working | [DrawZone.jsx](src/pages/DrawZone.jsx), [zones.js](src/lib/zones.js), [drawingsStore.js](src/lib/drawingsStore.js) | VERIFIED — 84 real `tree` docs exist in the live Firestore collection with valid Storage URLs |
| "Draw a flower" (stem) zone → draw → publish | Working | same | VERIFIED — 51 real `stem` docs exist |
| "Draw a character" (free) zone → draw → publish | Working | same | VERIFIED — 71 real `free` docs exist |
| DrawingCanvas: brush / eraser / scanline fill / undo (6 steps) / clear / done-export | Working | [DrawingCanvas.jsx](src/components/DrawingCanvas.jsx) | READ — logic reviewed line-by-line, exercises no obvious bug; not run in a browser |
| Contributions scatter into the scene (leaf canopy, flower bed, walking characters) | Working (per code) | StreetScene.jsx:98-192, 345-460 | READ — deterministic seeded layout logic looks sound; real data exists to render (see above) but the render itself wasn't visually confirmed |
| Community notice board — calendar + events list | Partial (working UI, hardcoded data) | [NoticeBoard.jsx](src/pages/NoticeBoard.jsx) | READ — `EVENTS` is a local JS array, not Firestore-backed, despite a code comment saying Phase 2 will wire it up (NoticeBoard.jsx:5-7) |
| Hidden "sound" window surprise (🎵 icon → SoundCloud playlist modal) | Working | StreetScene.jsx:305-322, 502-524 | READ — depends on a third-party SoundCloud iframe embed |
| Hidden "book" window surprise (📖 icon) | **Stubbed / broken** | StreetScene.jsx:326-343 | READ — `onClick={() => {}}`; the icon renders and is announced to assistive tech via `aria-label`, but tapping it does nothing. Code comment confirms: "no action wired up yet" |
| `/canvas-test` route (standalone DrawingCanvas harness, no Firebase) | Working, but dev-only | [CanvasTest.jsx](src/pages/CanvasTest.jsx), App.jsx:14 | READ — functional, but it's a Phase-1 debug tool still wired into the router and reachable in the production build with no nav link gating it |
| `clearDrawings()` (wipe a zone or all drawings) | Working, but no UI | drawingsStore.js:82-100 | READ — only reachable by importing the function directly (e.g. from a console); not exposed through any button or page |
| Live real-time sync across viewers (Firestore `onSnapshot`) | Working (backend confirmed live) | drawingsStore.js:29-42 | VERIFIED that the backend is live and has real synced data; multi-tab live-update behavior itself not manually observed in two simultaneous browser sessions |

---

## 4. Leftovers

- **No trace of "2 Truths and a Lie," a leaderboard, or a pose-and-draw photo game anywhere in this repo.** Grepped the full `src/` tree and the entire git history (3 commits total, all "Grow the Street") for `leaderboard`, `two truths`, `pose`, `trivia`, `quiz`, `scavenger`, etc. — no matches except one unrelated CSS class name (`.board-zone`, part of the notice board). **READ / VERIFIED-absent** within this repo. If those concepts exist, they live somewhere this audit didn't have access to.
- **A separate, unrelated prototype exists outside this repo**, at `to-gather-app (1)\to-gather-app\index.html` (no `.git` of its own). It's a single self-contained static HTML mockup of the *same* "Grow the Street" concept — plain JS/localStorage, no Firebase, no React — titled "To Gather — Grow the Street." Its own code says: "Prototype only — drawings and notices here simulate what a shared, growing scene would look like. In the real build both persist to everyone's view via the Firebase backend." This reads as an earlier design mockup that predates the Vite/React app, not a leftover from a different game concept. **READ.**
- **README.md** is the unmodified default Vite+React template text (mentions Oxc/SWC plugins, React Compiler) — never updated to describe this actual app. [README.md](README.md). **READ.**
- **`public/icons.svg`** contains the default Vite template's set of social icons (Bluesky, Discord, "documentation", GitHub, "social", X) — grepped `src/` and confirmed none of these symbol IDs are referenced anywhere. Dead scaffold leftover. **READ / VERIFIED-unused.**
- **`public/favicon.svg`** is a generic purple/blue gradient blob mark, not an obviously custom "to-gather" brand icon — likely a placeholder never replaced. **READ**, unconfirmed intent.
- **`qrcode.react` dependency** is installed (`package.json`) but never imported in `src/` — likely intended for an unbuilt "scan a QR code to join" flow. **VERIFIED-unused via grep.**
- **`src/assets/Kangaroo.svg`** is bundled locally and also has a CDN entry (`ASSETS.kangaroo`) in [src/lib/assets.js:38](src/lib/assets.js#L38), but neither the local file nor the CDN URL is referenced by any page/component. Dead asset at two levels. **VERIFIED via grep.**
- **`WINDOW_BOOK` "surprise"** (see Feature Inventory) is a half-built feature, not fully a leftover of something removed — but functionally it's dead code shipped live.

---

## 5. Risks

**Firebase security / open backend (highest severity — VERIFIED live):**
- [firestore.rules](firestore.rules): `allow read: if true` (fully public), `allow delete: if true` on every `drawings` doc — the rule file's own comment admits this: `// dev-only: powers clearDrawings() while tuning the scene`. As deployed today, **any anonymous browser can wipe the entire live collection** with a single unauthenticated request. Same pattern in [storage.rules](storage.rules) for the uploaded PNGs.
- `allow create` has some validation (field allowlist, `zone` enum, `url` is a string <2000 chars, `createdAt == request.time`) but **no auth, no per-user/session rate limit, no CAPTCHA/App Check** — anyone can script unlimited uploads.
- I did **not** test the write/delete rules against production (that would risk destroying the 206 real docs currently there) — so it's **UNKNOWN** whether the rules text in this repo is exactly what's deployed live, versus some other version pushed via the Firebase console or CLI outside this repo. No `firebase.json`/`.firebaserc` is committed, so there's no in-repo record of how rules get deployed at all.
- `.env` holds a real, working Firebase API key/App ID in plaintext on disk. It's git-ignored (not in history), so this is a local-machine concern rather than a leaked-secret one — but worth noting since Firebase web API keys are only as safe as the security rules protecting the project, and those rules are currently wide open.

**Scale / quota / cost exposure:**
- `drawingsStore.js` runs a single unbounded `onSnapshot(query(collection(db,"drawings"), orderBy("createdAt","asc")))` with no `limit()` — every client that opens the app downloads the entire historical collection and keeps a live listener open. As contributions grow, per-client read cost and payload size grow with total lifetime drawings, not with what's visible. No pagination, archiving, or cap exists.
- No moderation of user-drawn content — the "free" character zone lets anyone draw and publish anything live to every viewer, with no review step.
- Real user-facing data observed is all from one ~1.5-hour test session (2026-09-11); genuine concurrent multi-user festival load has not been exercised against this backend.

**Build / performance:**
- Production JS bundle is a single 734KB chunk (224KB gzip) — Vite's own build output flags it as over the 500KB warning threshold, with no code-splitting configured. On festival-grounds cellular data this is a meaningful first-load cost. **VERIFIED via `npm run build`.**

**Accessibility:**
- `prefers-reduced-motion` is respected for the scatter sway/walk animations (StreetScene.css:364-368, 399-403) but **not** for the cloud drift/bob, zone-pulse glow, notice-board shine, or window-sound-pulse animations — inconsistent handling. **READ.**
- The 📖 "book surprise" button has an `aria-label` promising an action ("Something's in the window") but does nothing when activated — a dead affordance for both sighted and assistive-tech users. **READ.**
- Drawing is pointer/touch-only by design (a canvas tool); no alternative input path exists, which is likely acceptable for this kind of feature but is worth naming explicitly.

**Deploy/process gaps:**
- No CI/CD config found (no `.github/workflows`, no `netlify.toml`, no `vercel.json`). **VERIFIED-absent via glob.**
- No automated tests exist at all.

---

## 6. Deploy state

- **Backend (Firebase project `to-gather-54dd7`) is live and populated.** VERIFIED via a direct read-only Firestore query: 206 real documents exist in `drawings`, and their Storage-hosted PNG URLs resolve through `firebasestorage.googleapis.com`. This is a real, working, publicly-reachable backend today — not just local/mock.
- **No evidence the frontend itself is deployed anywhere.** No `firebase.json`/`.firebaserc`, no Netlify/Vercel config, no GitHub Actions workflow exists in the repo. A local `dist/` build folder exists on disk (gitignored, dated 2026-09-11), proving a production build was run locally at least once, but there's no proof it was ever published to a URL. **UNKNOWN** whether/where the built site is hosted.
- **Source control**: GitHub remote `https://github.com/umaaaahh/to-gather.git` (origin), branch `main`, 3 commits, local tree clean and up to date with origin. **VERIFIED via git.**
- **Scene artwork CDN**: served from a Cloudflare R2 **dev-tier public bucket** (`pub-c3a1d03c8bed4e6d8bc732274ae6b7b2.r2.dev`), which the code's own comment says is rate-limited and "not meant for production traffic" — i.e., a piece of the currently-live experience is explicitly flagged as pre-launch infrastructure. **READ**, directly quoting [src/lib/assets.js](src/lib/assets.js).
