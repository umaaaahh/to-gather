# to-gather

A hand-drawn Cardigan St, Carlton, that the people who visit it help finish. Tap the sun, draw a leaf, a flower or a character, and it joins the street for everyone. The street also has what's on nearby, local radio, a community bookshelf, and a bit of the street's history.

## Run it

You need Node 20+ and a `.env` with `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_APP_ID` (optionally `VITE_GOOGLE_BOOKS_KEY`).

```
npm install
npm run dev
```

- `npm run build` builds to `dist/`, which Cloudflare serves (`wrangler.toml`).
- `npm run test:rules` tests the Firebase security rules against the local emulators (needs Java).
- `firebase deploy --only firestore:rules,storage` deploys the rules.
- Events live in `src/data/events.csv`; `scripts/event-scraper` refreshes them (see its README).

Moderation is at `/admin`.
