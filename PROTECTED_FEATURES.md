*(DRAFT, pending owner review)*

# Protected Features

Features below were **VERIFIED working** during the 2026-09-21 audit (see `PROJECT_STATE.md`). A fix, refactor, or dependency bump could break any of these silently — re-verify with the listed steps before/after touching the related files.

---

### 1. Local dev pipeline (install / build / lint / dev server)
**Why protected:** the whole team's ability to work on the app at all.
**Files:** [package.json](package.json), [vite.config.js](vite.config.js), [.oxlintrc.json](.oxlintrc.json)
**Re-verify:**
```
npm install     # expect "found 0 vulnerabilities", no peer-dep errors
npm run build   # expect "✓ built in ~3s", dist/ assets emitted
npm run lint    # expect no output (clean)
npm run dev     # expect "VITE ... ready", curl http://localhost:<port>/ returns 200
```

### 2. Firebase Firestore/Storage backend is live and reachable
**Why protected:** every drawing-publish feature depends on this; it's a real production-like backend with 206 real documents already in it (not a mock).
**Files:** [src/lib/firebase.js](src/lib/firebase.js), [.env](.env)
**Re-verify (read-only — do NOT write/delete against this project casually, it holds real data):**
Run a small Node script from inside the repo (so `firebase` resolves from `node_modules`) that calls `getDocs(query(collection(db, "drawings"), orderBy("createdAt","asc")))` using the config in `firebase.js` + the API key from `.env`, and confirm it returns documents without throwing a permission error.

### 3. Drawing → publish pipeline for all three zones (tree / stem / free)
**Why protected:** this is the core user-facing loop of the app.
**Files:** [src/pages/DrawZone.jsx](src/pages/DrawZone.jsx), [src/lib/drawingsStore.js](src/lib/drawingsStore.js), [src/lib/zones.js](src/lib/zones.js), [src/components/DrawingCanvas.jsx](src/components/DrawingCanvas.jsx)
**Evidence at audit time:** live Firestore query returned 84 `tree`, 51 `stem`, and 71 `free` documents, each with a resolvable Storage download URL.
**Re-verify:** in a browser, open `/draw/tree` (or `/draw/stem`, `/draw/free`), draw something, tap Done, confirm no error toast appears and the app navigates back to `/`; then re-run the read-only Firestore check above and confirm the document count increased by one in the matching zone.

### 4. Firestore/Storage security rules currently deployed publicly allow reads
**Why protected:** if this flips to requiring auth, every read path in the app (scene rendering, scatter layout) breaks with permission-denied errors.
**Files:** [firestore.rules](firestore.rules), [storage.rules](storage.rules)
**Re-verify:** the same read-only Firestore script from #2 — a permission error there means the live rules changed from what's committed.
**Caution:** do not attempt to verify the `create`/`delete` rules by actually writing/deleting against production; that risks damaging real data. Test rule changes against the Firebase emulator suite instead.

### 5. `/canvas-test` standalone harness (no-Firebase drawing test page)
**Why protected:** it's the fastest way to sanity-check `DrawingCanvas` in isolation without touching the live backend.
**Files:** [src/pages/CanvasTest.jsx](src/pages/CanvasTest.jsx), [src/App.jsx](src/App.jsx)
**Re-verify:** navigate to `/canvas-test`, pick a zone from the dropdown, draw, tap Done — confirm a PNG preview and a working "download png" link appear below the canvas.

### 6. Notice board calendar rendering
**Why protected:** self-contained, easy to accidentally break while wiring it up to real Firestore `events` data later.
**Files:** [src/pages/NoticeBoard.jsx](src/pages/NoticeBoard.jsx), [src/pages/NoticeBoard.css](src/pages/NoticeBoard.css)
**Re-verify:** navigate to `/notices`, confirm the current month renders with the correct day-of-week alignment, event dots appear on days with events, and month prev/next arrows update the grid and events list together.
