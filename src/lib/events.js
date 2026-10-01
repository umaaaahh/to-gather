// Events for the notice board, read from src/data/events.csv (exported from
// the events spreadsheet — replace the file to update the listings).
// Columns: id,title,date,start_time,end_time,location,genre,description,
// link,link_label,address.
import csv from "../data/events.csv?raw";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Carousel/filter order. A genre in the sheet that isn't listed here still
// shows up, after these.
const GENRE_ORDER = [
  "Music",
  "Comedy",
  "Theatre & Cabaret",
  "Games & Play",
  "Arts & Making",
  "Food & Drink",
  "Talks & Community",
];

// One crayon colour per genre, used on the whiteboard notes and in the
// pop-out. All dark enough to carry white text and read on the cream/white
// card backgrounds.
const GENRE_COLORS = {
  Music: "#2c5f9e", // whiteboard marker blue
  Comedy: "#c25e10", // orange
  "Theatre & Cabaret": "#8e3a86", // plum
  "Games & Play": "#2f7d4f", // green
  "Arts & Making": "#c0483a", // red marker
  "Food & Drink": "#94650f", // mustard
  "Talks & Community": "#237a7a", // teal
};
const FALLBACK_COLOR = "#6b3517"; // board brown

export const genreColor = (genre) => GENRE_COLORS[genre] ?? FALLBACK_COLOR;

// RFC 4180-ish: quoted fields may hold commas, newlines and "" escapes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.some((v) => v.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// "5:00 PM" -> [17, 0]; null if blank or unreadable.
function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return [h, Number(m[2])];
}

// Tracking params (one link in the sheet has tab characters pasted into
// its utm_campaign) aren't ours to send on.
function cleanLink(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_")) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function toEvent(r) {
  const [y, mo, d] = r.date.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  const [sh, sm] = parseTime(r.start_time) ?? [0, 0];
  const start = new Date(y, mo - 1, d, sh, sm);
  const endT = parseTime(r.end_time);
  let end = null;
  if (endT) {
    end = new Date(y, mo - 1, d, endT[0], endT[1]);
    // "12:00 AM" (or any end before the start) runs past midnight.
    if (end <= start) end.setDate(end.getDate() + 1);
  }
  return {
    id: r.id,
    title: r.title,
    date,
    start,
    end,
    timeLabel: r.end_time ? `${r.start_time} – ${r.end_time}` : r.start_time,
    startLabel: r.start_time,
    location: r.location,
    address: r.address,
    genre: r.genre || "Other",
    description: r.description,
    link: cleanLink(r.link),
    linkLabel: r.link_label || "More info",
    // Repeat sessions of the same show share a key.
    showId: `${r.title}|${r.location}`,
  };
}

export const EVENTS = parseCsv(csv)
  .filter((r) => r.title && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
  .map(toEvent)
  .sort((a, b) => a.start - b.start);

export const GENRES = (() => {
  const inData = new Set(EVENTS.map((e) => e.genre));
  const known = GENRE_ORDER.filter((g) => inData.has(g));
  const extra = [...inData].filter((g) => !GENRE_ORDER.includes(g));
  return [...known, ...extra];
})();

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// A month as calendar cells, Sunday first: null for the blanks before the 1st
// and after the last day, so every row is a full week.
export function buildMonthGrid(year, month) {
  const startOffset = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Still on or yet to come. Events with no end time count until 2h after
// they start.
export const isUpcoming = (e, now) =>
  (e.end ?? new Date(e.start.getTime() + 2 * 3600e3)) > now;

// Upcoming sessions grouped into shows, soonest first. Each show carries the
// first session's details (description falls back to any session's) plus
// all of its upcoming sessions.
export function upcomingShows(now, genre = null) {
  const shows = new Map();
  for (const e of EVENTS) {
    if (genre && e.genre !== genre) continue;
    if (!isUpcoming(e, now)) continue;
    let show = shows.get(e.showId);
    if (!show) {
      show = { ...e, sessions: [] };
      shows.set(e.showId, show);
    }
    if (!show.description && e.description) show.description = e.description;
    show.sessions.push(e);
  }
  return [...shows.values()];
}

// "Thu 1 Oct"
export const shortDate = (d) =>
  `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
