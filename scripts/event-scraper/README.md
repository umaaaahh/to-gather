# To Gather event scraper

Pulls upcoming events from venue websites and event listings and merges them into the notice board's events file, `src/data/events.csv`. It uses the same columns the app already reads:

`id, title, date, start_time, end_time, location, genre, description, link, link_label, address`

## Setup

You need Node 20.18 or newer.

```
cd scripts/event-scraper
npm install
```

## Running it

```
node scrape.js --dry                              # show what it finds, change nothing
node scrape.js --only "The Curtin" --dry          # test one source
node scrape.js                                    # update src/data/events.csv
node scrape.js --existing some/other.csv          # update a different events file
node scrape.js --debug "The Curtin"               # save that source's raw page to debug/
```

Paths default to the app's events file and this folder's `venues.json`, so it works from any directory.

What a run does to the events file:

- Each source's upcoming rows from its last run are replaced with fresh ones, so cancelled or moved events drop off. `src/data/events.scraped.json` keeps track of which rows came from which source, so commit it alongside the events file.
- Past rows, rows from other sources, and anything you added by hand (like the festival events) are left untouched. The file is re-sorted by date and time.
- If a source's site is down or errors, its existing rows are kept as they are.
- If the same event turns up from two sources, it's only listed once.
- IDs follow the existing `title-date` pattern, and a second session on the same day gets `-2`. Times are in Melbourne time as `7:30 PM`, like the rest of the sheet. Descriptions are trimmed to about 280 characters for the cards.

The first time you add a source, check the genres on its new rows. The scraper guesses them from keywords, so set `default_genre` for any venue it keeps getting wrong.

## Sources (`venues.json`)

Each entry is a venue or a listings page. A source with no `url` and no `recurring` items, or with `"disabled": true`, is skipped. The `note` field is just for you; the scraper ignores it.

### Common fields

| field | what it does |
|---|---|
| `name` | Shown on the card as the location. Keep it identical to the name already in the events file. |
| `address` | Street address for the card. |
| `url` | The events page. Can be a list of pages. |
| `default_genre` | Used when it can't tell the genre. One of: Music, Comedy, Theatre & Cabaret, Food & Drink, Games & Play, Arts & Making, Talks & Community. |
| `link_label` | Button text on the card, e.g. "Get tickets". |

### Ways to read a page

The scraper uses the first of these that applies:

1. **`recurring`** turns repeating specials into dated rows for the next `weeks_ahead` weeks (default 4). With only recurring items, the scraper doesn't load the site at all. Example:
   ```json
   "recurring": [{ "title": "Sunday Roast", "days": ["Sun"], "start_time": "12:00 pm", "end_time": "3:00 pm",
                   "description": "...", "genre": "Food & Drink", "link": "...", "skip_months": [12] }]
   ```
   You can add `from` and `until` dates (`"2026-11-01"`) for specials that are only on for a while.
2. **`selectors`** gives exact CSS selectors when you want full control: `item`, `title`, `date`, `time`, `description`, `link`, `location`.
3. **`link_pattern`** handles most gig guides and listings. You give it a pattern that only event links match, and it finds every matching link and reads the title and date from the link and the box around it. It doesn't need any class names, so it keeps working through site redesigns. Patterns are regular expressions, so escape dots as `\\.`.
4. **Neither of those** makes it read the hidden schema.org event data that many ticketing sites and WordPress plugins publish, or an `.ics` calendar feed if the `url` points to one.

### Extra options

| option | what it does |
|---|---|
| `follow: true` | Opens each event's own page to get the start time, venue and a proper description. Use it when the listing shows dates but no times, as on The Curtin, RMIT and City of Melbourne. `max_follow` caps how many pages it opens (default 60). |
| `aggregator: true` | For listing sites covering many venues (City of Melbourne, RMIT). The card shows each event's own venue instead of the source name. Needs `follow`. |
| `filter` | Only keeps events whose text matches, e.g. `"carlton\|parkville\|cardigan\|lygon"` to limit City of Melbourne to the neighbourhood. |
| `include_ongoing: true` | Includes exhibitions and runs ("Until 25 Oct", "6 Jun to 5 Dec"). They're pinned to the day of the run with "On until..." in the description. These are off by default so they don't crowd the board. |
| `title_case: true` | Tidies SHOUTY titles: "BODY MAINTENANCE with..." becomes "Body Maintenance with...". |
| `title_from_heading: true` | For listings where the whole card is one link ("Event \| Venue", title, date): uses just the heading inside the link as the title, as on the Potter. |

### When a source finds nothing

1. Run `node scrape.js --debug "Name"` and open the saved page in `debug/`. If it's nearly empty, the site builds its listings with JavaScript, and the scraper can't see them. Look for an `.ics` link, the ticketing platform's own venue page (Oztix, Humanitix and Eventbrite pages usually work), or use `recurring`.
2. If the events are there, find what their links have in common and use that as `link_pattern`.
3. Instagram-only and Facebook-only venues stay manual.

## Running it automatically (optional)

GitHub can run this every week and commit the updated events file. Add `.github/workflows/scrape-events.yml`:

```yaml
name: Scrape events
on:
  schedule:
    - cron: "0 19 * * 0"   # Monday 6am Melbourne (daylight time)
  workflow_dispatch:
permissions:
  contents: write
jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
        working-directory: scripts/event-scraper
      - run: node scrape.js
        working-directory: scripts/event-scraper
      - run: |
          git config user.name "event-bot"
          git config user.email "event-bot@users.noreply.github.com"
          git add src/data/events.csv src/data/events.scraped.json
          git diff --cached --quiet || git commit -m "Update venue events"
          git push
```

Cloudflare will redeploy on the push like any other commit.

## Being a good neighbour

The scraper waits between pages and between sites, and identifies itself as the To Gather notice board. If you want venues to be able to reach you, set a `CONTACT_EMAIL` environment variable. Weekly runs are plenty. If a venue's site asks not to be scraped, keep that venue manual.
