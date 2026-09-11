// Local-only stand-in for Phase 2 (Firebase). Accumulates every finished
// drawing per zone as a list of data URLs in sessionStorage so contributions
// stack up on the street immediately, with no backend. Phase 2 replaces this
// with a Storage upload + Firestore collection read; the shape here (an array
// of URLs per zone, oldest first) is what StreetScene already expects, so the
// swap stays contained to this file.

const KEY = "toGather.drawings.v2"; // v1 held a single URL per zone; v2 holds a list
const listeners = new Set();

function readAll() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY)) || {};
    // Be forgiving if an old/hand-edited value slipped a bare string in.
    for (const k of Object.keys(parsed)) {
      if (!Array.isArray(parsed[k])) parsed[k] = parsed[k] ? [parsed[k]] : [];
    }
    return parsed;
  } catch {
    return {};
  }
}

// Always an array (oldest contribution first), even for an untouched zone.
export function getDrawings(zoneKey) {
  return readAll()[zoneKey] || [];
}

export function getAllDrawings() {
  return readAll();
}

// Append one finished drawing to a zone. (Every zone accumulates now — the
// tree scatters its list into the canopy; stem/free currently just show the
// most recent, but the history is kept for when they accumulate too.)
export function saveDrawing(zoneKey, dataUrl) {
  const all = readAll();
  all[zoneKey] = [...(all[zoneKey] || []), dataUrl];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // sessionStorage full / unavailable — non-fatal for this placeholder
  }
  listeners.forEach((fn) => fn(all));
}

// Wipe a zone's contributions (handy while tuning the scene). No-arg clears all.
export function clearDrawings(zoneKey) {
  const all = zoneKey ? readAll() : {};
  if (zoneKey) delete all[zoneKey];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* non-fatal */
  }
  listeners.forEach((fn) => fn(all));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
