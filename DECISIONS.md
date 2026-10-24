# Decisions

Newest first. Each: what was decided, and why.

## 2026-10-24 — Shelf bad words: block notes, mask everything shown
Notes with bad words are refused in the app with a friendly message. Titles, authors and notes are masked (`s***`) wherever the public shelf shows them; admin sees raw text. Uses `obscenity` (English list + leetspeak transformers).
**Why:** real book titles contain swear words, so titles can't be blocked. Masking on display also covers anything written straight to Firestore. No word list in the security rules: rules can't share the library's list, and a short list there is easy to dodge.

## 2026-10-24 — Admins are an allowlist in Firestore
`isAdmin()` = a doc exists at `admins/{uid}`, added by hand in the console. Clients can't read or write `admins`. Storage rules check the same list via a Firestore lookup.
**Why:** the old check ("signed in and not anonymous") let anyone create an email/password account with the public API key and delete everything. An allowlist means no uid in the repo and adding an admin is a console action.

## 2026-10-24 — Drawings: create-only files, own-bucket URLs only
Storage drawings can be created but never overwritten. A drawing doc's `url`/`thumbUrl` must point into this project's bucket under `drawings/{its zone}/`.
**Why:** paths are public, so overwrite = swap anyone's drawing; free-form URLs let a doc put any image from anywhere on the street.

## 2026-10-24 — Trees capped at 65 / 150 / 65, oldest drawings kept
Trees and flower beds load their oldest N drawings; once full they stay full and nothing moves. Extras are stored, never shown ("hide, don't delete"). Characters show the newest 114.
**Why:** a finished tree should look finished and stable; no retirement job needed.

## 2026-10-24 — Events come from a CSV plus a scraper, not Firestore
`src/data/events.csv` is the source; `scripts/event-scraper` refreshes it from venue sites and is run by hand.
**Why:** listings change slowly and are curated; no admin UI or database needed. Supersedes the old "Phase 2 events collection" plan.

## 2026-10-19 — Shelf in Firestore with anonymous sign-in
One vote per anonymous visitor, kept honest by batched writes the rules check.
**Why:** a shared shelf without accounts. Accepted trade-off: a new browser profile can vote again.

## 2026-10-02 — Notice board is a street button, not a pull-up tab
The pull-up NoticeTab trial was dropped; the board glows and opens `EventsPopout` like the other street buttons. `/notices` is no longer linked.
**Why:** consistency with the radio, shelf, sign and poster.

## 2026-10-02 — Don't position animated items with `translate`/`scale`
Use left/top/margins/flex anchors instead.
**Why:** older iOS Safari drops the individual `translate` property on animated elements; drawings rendered one height too low. Not reproducible in desktop browsers.

## 2026-09-30 — Asset caching / custom domain deferred
Scene art stays on the `r2.dev` dev domain (no Cache-Control) for now.
**Why:** waiting for an overall hosting/compute review. Plan then: custom domain on the bucket, cache rule `max-age=86400, stale-while-revalidate=604800`, later versioned filenames with long immutable caching.

## 2026-09-30 — Canvas templates and instant sounds bundled locally
**Why:** the R2 bucket sends no CORS headers; canvas export and Web Audio need same-origin files.

## Standing
- Solo developer: no multi-dev scaffolding (`.env.example`, contributor docs, etc.).
- Root `.md` files belong to the planning agent; don't delete them, even if empty.
