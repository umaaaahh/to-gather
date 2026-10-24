# Protected Features

Updated 2026-10-24. Things that work and are easy to break silently. Re-check the listed way before and after touching the related files.

---

### 1. Build, lint and rules tests
**Files:** `package.json`, `vite.config.js`, `.oxlintrc.json`, `firestore.rules`, `storage.rules`, `tests/rules.test.mjs`
```
npm run build        # builds, only the >500 kB chunk warning
npm run lint         # warnings only, no errors
npm run test:rules   # all rules tests pass (39 on 2026-10-24); needs Java for the emulators
```
`test:rules` runs under the emulator-only project `demo-to-gather` so the Storage rules' Firestore lookup sees the seeded `admins` doc. Never point it at `to-gather-54dd7`.

### 2. Admin access
**Files:** `firestore.rules`, `storage.rules`, `src/pages/admin/`
Admin = a doc at `admins/{uid}` in Firestore, added by hand in the console. Any rules change must keep: no client can write `admins`; anonymous and other email/password accounts can't delete. Removing Uma's `admins` doc locks her out of `/admin` deletes.

### 3. Draw → save → arrival loop (all three zones)
**Files:** `src/pages/DrawZone.jsx`, `src/components/DrawingCanvas.jsx`, `src/lib/drawingsStore.js`, `src/lib/zones.js`, `src/components/DrawingArrival.jsx`, `src/pages/StreetScene.jsx`
**Check in a browser:** draw on `/draw/tree`, `/draw/stem`, `/draw/free`, press Done → back on the street, the drawing flies to its spot and the kangaroo cheers. No "didn't save" toast.
**Coupled numbers:** `ZONE_LIMITS` in `drawingsStore.js` must match the tree / bed / character capacities in StreetScene (tree 290 = 65+150+65 + 10 buffer, stem 70 = 30+30 + 10, free 114). Trees and beds load oldest-first so leaves never move — don't flip that.
**Rules coupling:** `isDrawingUrl` in `firestore.rules` assumes the bucket `to-gather-54dd7.firebasestorage.app` and paths `drawings/{zone}/[A-Za-z0-9_-]+.png`. Changing the bucket or the id scheme in `saveDrawing` breaks every save.

### 4. Shelf voting integrity
**Files:** `src/lib/shelfStore.js`, `firestore.rules`
Every vote change is a batch: the `shelfVotes` doc and the book's `votes` ±1 together. The rules reject one without the other. Covered by the Shelf section of the rules tests.

### 5. Shelf bad-word filter
**Files:** `src/lib/profanity.js`, `src/lib/shelfStore.js` (`subscribeShelf`), `src/components/Bookshelf.jsx`
**Check:** posting a note with a swear word shows "Let's keep the shelf friendly…"; a title like "…Not Giving a F*ck" shows masked. `toBook` and `subscribeShelf` must mask the same way, or "already on the shelf" matching breaks for those books. Admin (`subscribeAdminShelf`) stays unmasked on purpose.

### 6. Splash and tour start-up
**Files:** `src/components/SplashScreen.jsx`, `src/lib/drawingsStore.js` (`whenDrawingsLoaded`), `src/components/StreetTour.jsx`
The splash waits for the first drawings snapshot (bounded by MAX_MS). A listener that never resolves must still call `zoneLoaded`, or the splash sits at its maximum every visit.

### 7. Older iOS Safari layout
**Files:** `src/pages/StreetScene.css` (`.scatter-item`, `.street-scroll`)
On Uma's iPhone 13 mini, animated items positioned with the `translate` property render one item-height too low. Desktop Chromium/WebKit don't reproduce it. Keep `.scatter-item` as a zero-size flex anchor, and `overscroll-behavior-x: none` on `.street-scroll`. Check on the real phone after layout changes.

### 8. Settings applied before paint
**Files:** `index.html` (inline script), `src/lib/a11y.js`
The inline script mirrors `apply()` in `a11y.js` so saved settings (text size, motion, contrast, font, sound/music) never flash defaults. Change one, change both.

### 9. Same-origin bundled assets
**Files:** `src/lib/assets.js`
Leaf and stem templates, the click pop and the popup sound are bundled (not from R2) because the bucket sends no CORS headers: canvas export and Web Audio need same-origin. Moving them to the bucket silently drops templates from exported drawings.

### 10. `/canvas-test` harness
**Files:** `src/pages/CanvasTest.jsx`
Fastest way to test `DrawingCanvas` without Firebase. If it gets gated to dev-only, keep it working under `npm run dev`.
