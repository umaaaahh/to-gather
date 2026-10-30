// The live events list: src/data/events.csv with Admin > Events' changes on
// top. Those live in the Firestore "events" collection, one doc per event id:
//   - every field in EVENT_FIELDS: an event added in admin, or an edit that
//     replaces the CSV row with the same id
//   - { deleted: true }: hides the CSV row with that id
// Deleting a doc undoes it (an added event goes, an edit or hide reverts to
// the CSV). The scraper never touches Firestore, so admin changes survive
// its runs, and an edit or hide keeps applying while the row keeps its id.
//
// Until the first snapshot arrives (or if it fails), it's the CSV alone.

import { useSyncExternalStore } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { buildEvents, CSV_ROWS, EVENT_FIELDS, genresOf, isValidRow } from "./events";

const COLLECTION = "events";

export const CSV_BY_ID = new Map(CSV_ROWS.map((r) => [r.id, r]));

// The fields we know, as trimmed strings: nothing else from a doc gets in.
const pickFields = (data) =>
  Object.fromEntries(EVENT_FIELDS.map((f) => [f, String(data[f] ?? "").trim()]));

function makeState(overrides) {
  const byId = new Map(CSV_BY_ID);
  for (const [id, data] of overrides) {
    if (data.deleted) byId.delete(id);
    else byId.set(id, { id, ...pickFields(data) });
  }
  const rows = [...byId.values()].filter(isValidRow);
  const events = buildEvents(rows);
  return { overrides, rows, events, genres: genresOf(events) };
}

let state = makeState(new Map());
const listeners = new Set();
let unsubscribe = null;

function start() {
  if (unsubscribe) return;
  unsubscribe = onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      state = makeState(new Map(snap.docs.map((d) => [d.id, d.data()])));
      listeners.forEach((fn) => fn());
    },
    (err) => console.warn("Events listener failed:", err),
  );
}

function subscribe(fn) {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// { events, genres } for the board, plus { rows, overrides } for the admin.
export const useEvents = () => useSyncExternalStore(subscribe, () => state);

// The scraper's id pattern (scrape.js's slug), with an "admin-" prefix so a
// scraped row can never land on an added event's id.
const slug = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export function newEventId(row) {
  const base = `admin-${slug(row.title) || "event"}-${row.date}`;
  let id = base;
  for (let n = 2; CSV_BY_ID.has(id) || state.overrides.has(id); n++) id = `${base}-${n}`;
  return id;
}

// Add a new event or edit any event (admin only, per the rules).
export const saveEvent = (id, row) =>
  setDoc(doc(db, COLLECTION, id), { ...pickFields(row), updatedAt: serverTimestamp() });

// Delete an event: an added one goes for good; a CSV one is hidden.
export const deleteEvent = (id) =>
  CSV_BY_ID.has(id)
    ? setDoc(doc(db, COLLECTION, id), { deleted: true, updatedAt: serverTimestamp() })
    : deleteDoc(doc(db, COLLECTION, id));

// Put a CSV event back as the CSV has it (undoes an edit or a delete).
export const revertEvent = (id) => deleteDoc(doc(db, COLLECTION, id));
