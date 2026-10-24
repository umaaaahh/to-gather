# Ideas

Backlog, not commitments. Roughly most useful first. Added 2026-10-24 from a code review.

## Before the festival
- **Deploy the pending rules** (see PROJECT_STATE "Pending"): add `admins/<uid>` first, then deploy, then test one leaf.
- **App Check** (reCAPTCHA Enterprise) on Firestore and Storage — the only real defence against a script filling the oldest-first trees with junk.
- **Bulk delete in `/admin/drawings`** (select several, or "everything after time X") for cleaning up a spam burst on the day.
- **Untick Firebase Auth sign-up** (Authentication → Settings → User actions). Not needed for safety any more, just tidier.
- **Lazy-load `/admin` and `/canvas-test`** with `React.lazy` (bundle ≈322 KB gzip for every visitor; festival crowds are on mobile data). Gate `/canvas-test` to `import.meta.env.DEV`.

## Moderation
- Flag bad-word books/notes in `/admin/shelf` so they're quick to find.
- `/admin` says "this account isn't an admin" instead of showing tabs that can't delete (allow a user to read only their own `admins` doc).

## Correctness
- Shelf notes: load newest-first so the newest aren't the ones dropped past the 2000 cap.
- Fix the StreetScene `openEvents` / `setEventsOpen` ordering lint warning.

## Code health
- Move tree/bed/character layout data and `placeDrawings` / scatter maths out of `StreetScene.jsx` (1,517 lines) and unit-test them.
- Unit tests for `lib/events.js` (CSV parsing, times past midnight, grouping).
- Rename bucket assets (`Untitled - …`, `resized assests`), replace the TEMP notice board PNG with the WebP.
- Decide whether `/notices` (unlinked old page) stays or goes.

## Product
- Template art for the `free` (character) zone.
- What's on: list vs category "cubes" layout was still undecided.
- Custom domain + caching for the asset bucket (see DECISIONS 2026-09-30).
