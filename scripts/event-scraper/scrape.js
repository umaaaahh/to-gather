#!/usr/bin/env node
// To Gather event scraper
// Reads venues.json, pulls upcoming events from each source,
// and merges them into the app's events file (src/data/events.csv).
//
// Usage:
//   node scrape.js                         scrape everything, merge into src/data/events.csv
//   node scrape.js --existing path/to.csv  merge into a different existing events file (CSV or JSON)
//   node scrape.js --only "The Curtin"     scrape one source (handy while setting one up)
//   node scrape.js --dry                   print what it found, write nothing
//   node scrape.js --debug "The Curtin"    save that source's raw HTML to debug/ so you can look at it

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TZ = 'Australia/Melbourne';
const COLS = ['id', 'title', 'date', 'start_time', 'end_time', 'location', 'genre', 'description', 'link', 'link_label', 'address'];
const GENRES = ['Music', 'Comedy', 'Theatre & Cabaret', 'Food & Drink', 'Games & Play', 'Arts & Making', 'Talks & Community'];

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const DRY = flag('--dry');
const ONLY = opt('--only');
const DEBUG = opt('--debug');
const EXISTING = opt('--existing') || path.join(HERE, '../../src/data/events.csv');
const VENUES_FILE = opt('--venues') || path.join(HERE, 'venues.json');
const DEBUG_DIR = path.join(HERE, 'debug');

// ---------- small helpers ----------
const clean = (s) => (s ?? '').toString().replace(/\s+/g, ' ').trim();
const stripHtml = (s) => clean(cheerio.load((s ?? '').toString().replace(/</g, ' <'), null, false).root().text());
const slug = (s) => clean(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const truncate = (s, n = 280) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// .text() glues neighbouring elements together ("OCTOBERKILAT"), so read text with gaps between tags
const textOf = ($, el) => clean(cheerio.load(($.html(el) || '').replace(/</g, ' <'), null, false).root().text());
const junk = (s) => clean(s).replace(/Icon\s*\/[^.]*?Created with Sketch\.?/gi, ' ').replace(/\s+/g, ' ').trim();

// Date object -> { date: 'YYYY-MM-DD', time: '7:30 pm' } in Melbourne time
function localParts(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: true, weekday: 'short',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`, weekday: p.weekday };
}
const todayLocal = () => localParts(new Date()).date;

// Melbourne offset (+10:00 / +11:00) for a given local date, so local times become real instants
function melbOffset(y, m, d) {
  const probe = new Date(Date.UTC(y, m - 1, d, 12));
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(probe).find((x) => x.type === 'timeZoneName').value; // e.g. GMT+11
  const h = parseInt(name.replace('GMT', '') || '0', 10);
  return `${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`;
}
function fromLocal(y, m, d, hh = 0, mm = 0) {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${melbOffset(y, m, d)}`;
  return new Date(iso);
}
const ymd = (dateStr) => dateStr.split('-').map(Number);

// Parse an ISO-ish string. Strings with no offset are treated as Melbourne local time.
function parseIso(s) {
  if (!s) return null;
  s = clean(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, off] = m;
  if (off) return { at: new Date(s.replace(' ', 'T')), hasTime: !!hh };
  return { at: fromLocal(+y, +mo, +d, +(hh || 0), +(mi || 0)), hasTime: !!hh };
}

// ---------- reading human dates and times ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
const DAY_FIRST = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}(?:,?\\s+(\\d{4}))?`, 'g');
const MON_FIRST = new RegExp(`${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'g');
const TIME_RE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi;
const TIME_RANGE_RE = /\b(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to|until)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm))\b/i;

function findDates(text) {
  const t = text.toLowerCase();
  const out = [];
  for (const m of t.matchAll(DAY_FIRST)) out.push({ i: m.index, day: +m[1], mon: MONTHS[m[2]], year: m[3] ? +m[3] : null });
  if (!out.length) for (const m of t.matchAll(MON_FIRST)) out.push({ i: m.index, day: +m[2], mon: MONTHS[m[1]], year: m[3] ? +m[3] : null });
  if (!out.length) {
    const m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (m) out.push({ i: m.index, day: +m[1], mon: +m[2], year: +(m[3].length === 2 ? '20' + m[3] : m[3]) });
  }
  return out.sort((a, b) => a.i - b.i);
}
const to24 = (h, m, ap) => ({ hh: (+h % 12) + (ap.toLowerCase() === 'pm' ? 12 : 0), mm: +(m || 0) });
function findTimes(text) {
  const r = text.match(TIME_RANGE_RE);
  if (r) {
    const endM = r[2].match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)/i);
    const startM = r[1].match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
    const end = to24(endM[1], endM[2], endM[3]);
    const start = to24(startM[1], startM[2], startM[3] || endM[3]);
    return { start, end };
  }
  const one = [...text.matchAll(TIME_RE)][0];
  return one ? { start: to24(one[1], one[2], one[3]) } : null;
}
// Pick the year for a day/month with no year: the next time that date comes around
function resolveYear(d, refDate = todayLocal()) {
  if (d.year) return d.year;
  const [ty] = ymd(refDate);
  const candidate = `${ty}-${String(d.mon).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
  // allow events up to 30 days in the past to still count as this year (so "ongoing since" ranges work)
  const daysBehind = (Date.parse(refDate) - Date.parse(candidate)) / 864e5;
  return daysBehind > 30 ? ty + 1 : ty;
}
const dateStr = (d) => `${resolveYear(d)}-${String(d.mon).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

// Returns { date, endDate, ongoing, times } or null
function parseWhen(text) {
  if (!text) return null;
  const t = clean(text);
  const iso = parseIso(t);
  if (iso) { const p = localParts(iso.at); return { date: p.date, times: iso.hasTime ? { start: to24(...p.time.match(/(\d+):(\d+) (am|pm)/).slice(1)) } : null }; }
  const dates = findDates(t);
  if (!dates.length) return null;
  const times = findTimes(t);
  const until = /\buntil\b|\bto\b\s*$/i.test(t.slice(0, dates[0].i)) || /^until\b/i.test(t.trim());
  if (until) return { date: null, endDate: dateStr(dates[0]), ongoing: true, times };
  // a second date close behind the first ("25 Oct 2026 - 14 Dec 2026") means a run of dates.
  // "19 Sept – 21 Nov 2026" only gives the year once, so the start takes it from the end.
  const isRun = dates[1] && dates[1].i - dates[0].i < 30;
  if (isRun && !dates[0].year && dates[1].year) dates[0].year = dates[1].year - (dates[0].mon > dates[1].mon ? 1 : 0);
  const first = dateStr(dates[0]);
  if (isRun) {
    const second = dateStr(dates[1]);
    if (second > first) {
      if (first < todayLocal() && second >= todayLocal()) return { date: null, endDate: second, ongoing: true, times };
      return { date: first, endDate: second, times };
    }
  }
  return { date: first, times };
}

// ---------- titles ----------
const WEEKDAY = '(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s+';
const DATE_PREFIX = new RegExp(`^\\s*(until\\s+)?(${WEEKDAY})?(\\d{1,2}(st|nd|rd|th)?(\\s*(-|–|—)\\s*\\d{1,2}(st|nd|rd|th)?)?\\s+${MON}|${MON}\\s+\\d{1,2}(st|nd|rd|th)?)(,?\\s+\\d{4})?\\s*(-|–|—|:|\\|)?\\s*`, 'i');
function cleanTitle(s) {
  let t = clean(s);
  for (let i = 0; i < 3 && DATE_PREFIX.test(t); i++) t = t.replace(DATE_PREFIX, '');
  return t.replace(/\s*(read more|more info|book now|buy tickets|tickets)\s*$/i, '').trim();
}
const KEEP_CAPS = new Set(['DJ', 'DJS', 'EP', 'LP', 'USA', 'UK', 'NZ', 'NSW', 'QLD', 'VIC', 'WA', 'SA', 'TAS', 'ACT', 'NT', 'II', 'III', 'IV', 'RMIT', 'MC', 'AU', 'TV', 'CD', 'NYC', 'LA', 'DC']);
const SMALL = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'feat.', 'vs', 'x']);
function titleCase(s) {
  return s.split(/(\s+)/).map((w, i, all) => {
    const bare = w.replace(/[^A-Za-z]/g, '');
    if (bare.length < 2 || bare !== bare.toUpperCase()) return w; // leave words that are already mixed case
    if (KEEP_CAPS.has(bare)) return w;
    const lower = w.toLowerCase();
    if (i > 0 && SMALL.has(lower)) return lower;
    // capitalise after an opening quote ('Tirai') but not an apostrophe (Devil's)
    return lower.replace(/(^[('"‘“]*|[\-/&+])([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }).join('');
}

// ---------- genre ----------
const TYPE_GENRE = {
  MusicEvent: 'Music', ComedyEvent: 'Comedy', TheaterEvent: 'Theatre & Cabaret', DanceEvent: 'Theatre & Cabaret',
  FoodEvent: 'Food & Drink', VisualArtsEvent: 'Arts & Making', ExhibitionEvent: 'Arts & Making', ScreeningEvent: 'Arts & Making',
  EducationEvent: 'Talks & Community', SocialEvent: 'Talks & Community', LiteraryEvent: 'Talks & Community', ChildrensEvent: 'Games & Play',
};
const KEYWORDS = [
  ['Comedy', /\b(comedy|comedian|stand-?up|open mic comedy|improv)\b/],
  ['Games & Play', /\b(trivia|quiz|d&d|dnd|dungeons|ttrpg|rpg|board ?games?|games? (night|day)|chess|warhammer|magic: the gathering|mtg|pokemon|bingo|larp|tournament)\b/],
  ['Theatre & Cabaret', /\b(theatre|theater|cabaret|burlesque|drag|musical|ballet|dance|play reading|circus|panto|opera)\b/],
  ['Food & Drink', /\b(parma|roast|counter meal|happy hour|tasting|dinner|lunch|brunch|night market|farmers'? market|oktoberfest|\$\d+ (pizza|pints?|wings|parmas?))\b/],
  ['Arts & Making', /\b(workshop|exhibition|life drawing|craft|zine|screening|film|cinema|art show|painting|jewellery|gallery|flea market)\b/],
  ['Talks & Community', /\b(talk|lecture|panel|forum|meetup|book club|walking tour|q&a|fundraiser|community|expo|seminar)\b/],
  ['Music', /\b(dj|band|live music|gig|album|single launch|ep launch|tour|acoustic|jazz|karaoke|open mic|busking|choir|concert|shanties)\b/],
];
function guessGenre({ types = [], title = '', description = '' }, fallback) {
  for (const t of types) if (TYPE_GENRE[t]) return TYPE_GENRE[t];
  const hay = `${title} ${description}`.toLowerCase();
  for (const [g, re] of KEYWORDS) if (re.test(hay)) return g;
  return GENRES.includes(fallback) ? fallback : 'Talks & Community';
}

// ---------- extractors ----------
// Every extractor returns events shaped like:
// { title, when: { date, endDate, ongoing, times }, description, link, types, location, address }

// 1. schema.org JSON-LD (most ticketing platforms and WordPress event plugins publish this)
function jsonLdEvents($) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const types = [].concat(node['@type'] || []);
    if (types.some((t) => /Event$/.test(t))) found.push(node);
    for (const k of ['@graph', 'itemListElement', 'item', 'subEvent', 'event', 'events']) if (node[k]) visit(node[k]);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try { visit(JSON.parse(raw)); } catch {
      try { visit(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '))); } catch { /* skip broken blocks */ }
    }
  });
  return found;
}
function whenFromIso(startS, endS) {
  const s = parseIso(startS);
  if (!s) return parseWhen(startS);
  const sp = localParts(s.at);
  const e = parseIso(endS);
  const ep = e ? localParts(e.at) : null;
  const hm = (p) => { const m = p.time.match(/(\d+):(\d+) (am|pm)/); return to24(m[1], m[2], m[3]); };
  return {
    date: sp.date,
    endDate: ep && ep.date !== sp.date ? ep.date : undefined,
    times: s.hasTime ? { start: hm(sp), end: e?.hasTime && ep.date === sp.date ? hm(ep) : undefined } : null,
  };
}
function fromJsonLd($, pageUrl) {
  return jsonLdEvents($).map((e) => {
    const offer = [].concat(e.offers || [])[0] || {};
    const loc = [].concat(e.location || [])[0] || {};
    const addr = loc.address;
    return {
      title: stripHtml(e.name),
      when: whenFromIso(e.startDate, e.endDate),
      description: stripHtml(e.description),
      link: absolute(e.url || offer.url, pageUrl),
      types: [].concat(e['@type'] || []),
      location: typeof loc === 'string' ? loc : clean(loc.name),
      address: typeof addr === 'string' ? clean(addr) : clean([addr?.streetAddress, addr?.addressLocality].filter(Boolean).join(', ')),
    };
  });
}

// 2. iCal feeds (.ics)
function fromIcs(text, pageUrl) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null;
  const val = (line) => line.slice(line.indexOf(':') + 1).replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
  const icsIso = (line) => {
    const m = val(line).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, hh, mi, ss, z] = m;
    return hh ? `${y}-${mo}-${d}T${hh}:${mi}:${ss}${z ? 'Z' : ''}` : `${y}-${mo}-${d}`;
  };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur) out.push({ ...cur, when: whenFromIso(cur.s, cur.e) }); cur = null; }
    else if (cur) {
      const key = line.split(/[;:]/)[0];
      if (key === 'SUMMARY') cur.title = clean(val(line));
      else if (key === 'DTSTART') cur.s = icsIso(line);
      else if (key === 'DTEND') cur.e = icsIso(line);
      else if (key === 'DESCRIPTION') cur.description = stripHtml(val(line));
      else if (key === 'URL') cur.link = absolute(val(line), pageUrl);
      else if (key === 'LOCATION') cur.location = clean(val(line));
    }
  }
  return out;
}

// 3. CSS selectors you set per source, for sites where you want exact control
function fromSelectors($, sel, pageUrl) {
  const out = [];
  $(sel.item).each((_, el) => {
    const $el = $(el);
    const pick = (s) => (s ? clean($el.find(s).first().text()) : '');
    const attr = (s, a) => (s ? $el.find(s).first().attr(a) : undefined);
    const dateText = [attr(sel.date, 'datetime') || attr(sel.date, 'content') || pick(sel.date), pick(sel.time)].filter(Boolean).join(' ');
    const linkHref = sel.link ? attr(sel.link, 'href') : ($el.is('a') ? $el.attr('href') : $el.find('a').first().attr('href'));
    out.push({
      title: cleanTitle(pick(sel.title)),
      when: parseWhen(dateText),
      description: pick(sel.description),
      link: absolute(linkHref, pageUrl),
      types: [],
      location: pick(sel.location),
    });
  });
  return out;
}

// 4. Event links: find every link whose URL matches link_pattern, then read the title and date
//    from the link and the box around it. No class names needed, so it survives site redesigns.
function fromLinks($, v, pageUrl) {
  const re = new RegExp(v.link_pattern, 'i');
  const page = absolute(pageUrl, pageUrl);
  const groups = new Map();
  $('a[href]').each((_, a) => {
    const href = absolute($(a).attr('href'), pageUrl).replace(/#.*$/, '');
    if (!href || !re.test(href) || href === page) return;
    if (!groups.has(href)) groups.set(href, []);
    groups.get(href).push(a);
  });
  const matchingHrefs = (el) => {
    const s = new Set();
    $(el).find('a[href]').each((_, a) => {
      const h = absolute($(a).attr('href'), pageUrl).replace(/#.*$/, '');
      if (h && re.test(h) && h !== page) s.add(h);
    });
    return s.size;
  };
  const out = [];
  for (const [href, anchors] of groups) {
    // grow outwards from the link until the box would include a different event
    let box = $(anchors[0]);
    for (let p = box.parent(); p.length && !p.is('body, html'); p = p.parent()) {
      if (matchingHrefs(p) > 1) break;
      box = p;
    }
    const linkTexts = anchors.map((a) => junk(textOf($, a))).filter(Boolean);
    const alts = anchors.flatMap((a) => $(a).find('img[alt]').map((_, i) => clean($(i).attr('alt'))).get()).filter(Boolean);
    const boxText = junk(textOf($, box));
    const best = linkTexts.sort((a, b) => b.length - a.length)[0] || alts[0] || '';
    const when = parseWhen(best) || alts.map(parseWhen).find(Boolean) || parseWhen(boxText);
    // title_from_heading: the card link holds a label, an <h3>Title</h3> and the date, so use just the heading
    const heading = v.title_from_heading && anchors.map((a) => textOf($, $(a).find('h1,h2,h3,h4,h5,h6').first())).find(Boolean);
    let title = cleanTitle(heading || (best.length > 160 ? (textOf($, box.find('h1,h2,h3,h4,h5').first()) || best) : best));
    if (v.title_case) title = titleCase(title);
    let description = boxText;
    for (const s of [best, ...alts]) description = description.replace(s, ' ');
    description = cleanTitle(clean(description.replace(DATE_PREFIX, ' ')));
    out.push({ title, when, description, link: href, types: [] });
  }
  return out;
}

function absolute(href, base) {
  if (!href) return '';
  try { return new URL(href, base).toString(); } catch { return ''; }
}

// ---------- event pages (follow: true) ----------
// Fills in the time, venue and description from each event's own page.
function readEventPage(html, ev, v) {
  const $ = cheerio.load(html);
  const ld = fromJsonLd($, ev.link)[0];
  if (ld?.when?.date) {
    ev.when = { ...ev.when, ...ld.when, ongoing: ev.when?.ongoing && !ld.when.date };
    ev.types = ld.types;
    ev.location = ev.location || ld.location;
    ev.address = ev.address || ld.address;
    if (ld.description) ev.description = ld.description;
  }
  // Google Calendar "add to calendar" links carry an exact start time (Oztix uses these)
  const gcal = $('a[href*="calendar.google.com"], a[href*="google.com/calendar"]').attr('href');
  const gdates = gcal && decodeURIComponent(gcal).match(/dates=(\d{8}T\d{6}Z?)\/(\d{8}T\d{6}Z?)/);
  if (gdates && !ev.when?.times) {
    const fmt = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}${s.endsWith('Z') ? 'Z' : ''}`;
    const w = whenFromIso(fmt(gdates[1]), gdates[2] !== gdates[1] ? fmt(gdates[2]) : undefined);
    if (!ev.when?.date || ev.when.date === w.date) ev.when = { ...ev.when, ...w };
  }
  const main = $('main').length ? $('main') : $('body');
  main.find('script, style, nav, header, footer, noscript').remove();
  const text = junk(textOf($, main));
  if (!ev.when?.times) {
    const times = findTimes(text);
    if (times) ev.when = { ...(ev.when || {}), times };
  }
  if (!ev.when?.date && !ev.when?.ongoing) {
    const w = parseWhen(text.slice(0, 600));
    if (w) ev.when = { ...w, times: ev.when?.times || w.times };
  }
  // "Location" / "Where" / "Venue" label followed by the place
  if (!ev.location) {
    $('dt, th, h2, h3, h4, h5, h6, strong, b, span, p, div').each((_, el) => {
      if ($(el).children().length > 1) return;
      if (!/^(location|where|venue|address)\s*:?$/i.test(clean($(el).text()))) return;
      const target = $(el).next().length ? $(el).next() : $(el).parent().next();
      const parts = target.find('*').addBack().contents().filter((_, n) => n.type === 'text').map((_, n) => clean($(n).text())).get().filter(Boolean);
      // a venue name is short; anything longer is a caption or paragraph that happened to follow the label
      if (parts.length && parts[0].length <= 80 && !/image credit|courtesy/i.test(parts[0])) { ev.location = parts[0]; ev.address = ev.address || parts.slice(1, 3).join(', '); return false; }
    });
  }
  const og = clean($('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'));
  if (og && (!ev.description || ev.description.length < 40)) ev.description = og;
  ev.pageText = text.slice(0, 3000);
  return ev;
}

// ---------- fetching ----------
async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': `ToGatherEventBot/1.0 (community notice board for Cardigan St, Carlton${process.env.CONTACT_EMAIL ? `; contact ${process.env.CONTACT_EMAIL}` : ''})`,
      Accept: 'text/html,application/xhtml+xml,text/calendar,*/*',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function scrapeSource(v) {
  const urls = [].concat(v.url || []).filter(Boolean);
  const methods = new Set();
  let raw = [];
  const shouldFetch = v.link_pattern || v.selectors?.item || !v.recurring;
  if (shouldFetch) {
    for (const url of urls) {
      const body = await get(url);
      if (DEBUG === v.name) {
        fs.mkdirSync(DEBUG_DIR, { recursive: true });
        const f = path.join(DEBUG_DIR, `${slug(v.name)}-${urls.indexOf(url) + 1}.html`);
        fs.writeFileSync(f, body);
        console.log(`\n  saved raw page to ${f}`);
      }
      if (/BEGIN:VCALENDAR/.test(body.slice(0, 500))) { raw.push(...fromIcs(body, url)); methods.add('ical'); }
      else {
        const $ = cheerio.load(body);
        if (v.selectors?.item) { raw.push(...fromSelectors($, v.selectors, url)); methods.add('selectors'); }
        else if (v.link_pattern) { raw.push(...fromLinks($, v, url)); methods.add('links'); }
        else { raw.push(...fromJsonLd($, url)); methods.add('json-ld'); }
      }
      if (urls.length > 1) await sleep(1000);
    }
  }
  // the same event linked from two listing pages only counts once
  raw = [...new Map(raw.map((e) => [e.link && v.link_pattern ? e.link : `${e.title}|${e.when?.date}|${JSON.stringify(e.when?.times)}`, e])).values()];

  const today = todayLocal();
  const keepOngoing = !!v.include_ongoing;
  // only worth opening event pages for things that could end up on the board
  const candidates = raw.filter((e) => e.title && (e.when?.ongoing ? keepOngoing && e.when.endDate >= today : (!e.when || !e.when.date || e.when.date >= today)));
  if (v.follow) {
    const max = v.max_follow ?? 60;
    let n = 0, failed = 0;
    for (const e of candidates) {
      if (!e.link || n >= max) continue;
      n++;
      try { readEventPage(await get(e.link), e, v); } catch { failed++; }
      await sleep(v.delay_ms ?? 800);
    }
    methods.add(`opened ${n} event pages${failed ? `, ${failed} failed` : ''}`);
  }
  return { events: candidates, methods: [...methods] };
}

// Repeating specials (e.g. a Sunday roast) turned into dated rows for the next few weeks
const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function recurringEvents(v) {
  const out = [];
  const weeks = v.weeks_ahead ?? 4;
  const [y, m, d] = ymd(todayLocal());
  for (let i = 0; i < weeks * 7; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i));
    const iso = day.toISOString().slice(0, 10);
    const dow = day.getUTCDay();
    for (const r of v.recurring) {
      if (!r.days.some((x) => DAY_INDEX[x.toLowerCase().slice(0, 3)] === dow)) continue;
      if ((r.skip_months || []).includes(day.getUTCMonth() + 1)) continue;
      if (r.from && iso < r.from) continue;
      if (r.until && iso > r.until) continue;
      const st = r.start_time ? findTimes(r.start_time)?.start : null;
      const et = r.end_time ? findTimes(r.end_time)?.start : null;
      out.push({
        title: r.title,
        when: { date: iso, times: st ? { start: st, end: et || undefined } : null },
        description: r.description || '',
        link: r.link || [].concat(v.url || [])[0] || '',
        types: [],
        genre: r.genre,
        link_label: r.link_label,
      });
    }
  }
  return out;
}

// ---------- shaping rows ----------
// "7:30 PM", matching the times already in the events sheet
const fmtTime = ({ hh, mm }) => `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
const prettyDate = (s) => { const [y, m, d] = ymd(s); return `${d} ${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[m - 1]}`; };

function toRow(e, v) {
  if (!e.title) return null;
  const today = todayLocal();
  let date = e.when?.date;
  let description = e.description || '';
  if (e.when?.ongoing) {
    if (!v.include_ongoing || !e.when.endDate || e.when.endDate < today) return null;
    date = today; // ongoing things are pinned to "today" each run
    description = `On until ${prettyDate(e.when.endDate)}. ${description}`;
  } else if (e.when?.endDate && e.when.endDate !== date) {
    description = `Runs until ${prettyDate(e.when.endDate)}. ${description}`;
  }
  if (!date || date < today) return null;
  const times = e.when?.times;
  const location = v.aggregator ? (e.location || v.name) : v.name;
  const address = v.aggregator ? (e.address || (e.location ? '' : v.address || '')) : (v.address || '');
  const link = e.link || [].concat(v.url || [])[0] || '';
  const row = {
    title: e.title,
    date,
    start_time: times?.start ? fmtTime(times.start) : '',
    end_time: times?.end ? fmtTime(times.end) : '',
    location,
    genre: GENRES.includes(e.genre) ? e.genre : guessGenre(e, v.default_genre),
    description: truncate(clean(description)),
    link,
    link_label: link ? (e.link_label || v.link_label || 'More info') : '',
    address,
  };
  if (v.filter) {
    const hay = [row.title, row.description, row.location, row.address, e.pageText].join(' ');
    if (!new RegExp(v.filter, 'i').test(hay)) return null;
  }
  return row;
}

function assignIds(rows, taken = new Set()) {
  for (const r of rows) {
    const base = `${slug(r.title)}-${r.date}`;
    let id = base, n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    r.id = id; taken.add(id);
  }
  return rows;
}

// ---------- CSV in/out ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.replace(/^﻿/, ''), r[i] ?? ''])));
}
const csvCell = (v) => { const s = (v ?? '').toString(); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => [COLS.join(','), ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

function loadExisting(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const rows = file.endsWith('.json') ? JSON.parse(text) : parseCsv(text);
  return rows.map((r) => Object.fromEntries(COLS.map((c) => [c, r[c] ?? ''])));
}

function toMinutes(t) {
  const m = (t || '').match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return -1;
  return ((+m[1] % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0)) * 60 + +m[2];
}

// ---------- main ----------
async function main() {
  const sources = JSON.parse(fs.readFileSync(VENUES_FILE, 'utf8'))
    .filter((v) => !v.disabled && ([].concat(v.url || []).some(Boolean) || v.recurring?.length))
    .filter((v) => !ONLY || v.name === ONLY)
    .filter((v) => !DEBUG || v.name === DEBUG);
  if (!sources.length) { console.log('Nothing to scrape. Check venues.json (or the name you passed).'); return; }

  const today = todayLocal();
  const results = [];

  for (const v of sources) {
    process.stdout.write(`${v.name} ... `);
    try {
      const { events, methods } = await scrapeSource(v);
      if (v.recurring?.length) { events.push(...recurringEvents(v)); methods.push('repeating specials'); }
      const rows = events.map((e) => toRow(e, v)).filter(Boolean);
      const uniq = [...new Map(rows.map((r) => [`${r.title}|${r.date}|${r.start_time}`, r])).values()];
      console.log(`${uniq.length} upcoming (${methods.join(', ')})`);
      if (!uniq.length && !v.recurring) {
        console.log(`  Nothing found. Run: node scrape.js --debug "${v.name}" and see the README section "When a source finds nothing".`);
      }
      results.push({ source: v, rows: uniq });
    } catch (err) {
      console.log(`failed: ${err.message}`);
      results.push({ source: v, rows: [], error: err.message });
    }
    await sleep(1500); // be polite between sites
  }

  // the same event can turn up from two sources (e.g. a venue page and City of Melbourne); keep the first
  const seenEvent = new Set();
  for (const r of results) {
    r.rows = r.rows.filter((x) => {
      const key = `${slug(x.title)}|${x.date}`;
      if (seenEvent.has(key)) return false;
      seenEvent.add(key);
      return true;
    });
  }
  const scraped = results.flatMap((r) => r.rows);

  if (DRY || DEBUG) {
    assignIds(scraped);
    for (const r of scraped.sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.start_time) - toMinutes(b.start_time))) {
      console.log(`  ${r.date} ${r.start_time.padEnd(8)} [${r.genre}] ${r.title} @ ${r.location}`);
    }
    console.log(`\n${scraped.length} events found. Dry run, nothing written.`);
    return;
  }

  // Merge. Each source owns the upcoming rows it wrote last time (tracked in the .scraped.json file)
  // plus any upcoming rows with its name as the location. Those get replaced; everything else is kept.
  const base = EXISTING.replace(/\.(csv|json)$/, '');
  const stateFile = `${base}.scraped.json`;
  const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
  const existing = loadExisting(EXISTING);
  const owned = new Set();
  const ownedNames = new Set();
  for (const r of results.filter((x) => !x.error)) {
    (state[r.source.name] || []).forEach((id) => owned.add(id));
    ownedNames.add(r.source.name);
  }
  const kept = existing.filter((r) => !(r.date >= today && (owned.has(r.id) || ownedNames.has(r.location))));
  const taken = new Set(kept.map((r) => r.id));
  for (const r of results.filter((x) => !x.error)) {
    assignIds(r.rows, taken);
    state[r.source.name] = r.rows.map((x) => x.id);
  }
  const merged = [...kept, ...scraped].sort((a, b) =>
    a.date.localeCompare(b.date) || toMinutes(a.start_time) - toMinutes(b.start_time) || a.title.localeCompare(b.title));

  // The app only reads the CSV (src/lib/events.js), so that's all we write besides the state file
  fs.writeFileSync(`${base}.csv`, toCsv(merged));
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 1) + '\n');

  console.log(`\nWrote ${merged.length} events to ${base}.csv`);
  console.log(`  ${scraped.length} scraped, ${existing.length - kept.length} old upcoming rows from those sources replaced, ${kept.length} other rows kept.`);
  const failed = results.filter((r) => r.error);
  if (failed.length) console.log(`  Failed (their existing rows were left alone): ${failed.map((f) => f.source.name).join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
