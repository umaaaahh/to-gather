// Phase 2: real backing store. Every finished drawing is a PNG uploaded to
// Firebase Storage under drawings/{zone}/{id}.png, with a matching Firestore
// doc in the "drawings" collection ({ zone, url, path, createdAt }) so the
// street scene can subscribe to live updates and order contributions by
// arrival time. Shape returned to callers stays what Phase 1 already used —
// an array of URLs per zone, oldest first — so StreetScene/DrawZone didn't
// need to change beyond DrawZone now awaiting saveDrawing.

import { db, storage } from "./firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  addDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

const COLLECTION = "drawings";
const listeners = new Set();

// Hard per-zone read cap: each zone's scene listener only ever fetches its N
// most recent drawings (orderBy createdAt desc + limit), instead of the whole
// unfiltered collection. Sized from DISCOVERIES.md's per-zone capacity pass —
// keep LEAF_BOXES/STEM_BOXES/FREE_BOXES in StreetScene.jsx summing to match
// these so visual clustering capacity and actual fetched-data capacity agree.
// Anything older than the Nth drawing simply falls outside the query — it
// stays in Firestore/Storage untouched ("hide, don't delete"), so no
// retirement job is needed.
const ZONE_LIMITS = { tree: 149, stem: 25, free: 114 };

// Thumbnails keep the scattered street scene cheap to load: every upload
// also produces a 150x150 PNG alongside the full-resolution export, and the
// scene renders that instead. Long, immutable cache headers are safe because
// a drawing's file at a given path never changes after upload.
const THUMB_SIZE = 150;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

let cache = { tree: [], stem: [], free: [] }; // { zoneKey: [thumbUrl, ...] }, oldest first
const zoneUnsubscribes = [];

// "submitted" signal — fires once per successful saveDrawing(), after both
// the Storage upload and the Firestore doc write have completed. This is the
// intended hook point for future consumers that react to a fresh publish
// (e.g. an entry animation or the kangaroo's post-drawing reaction) without
// touching the submit path in DrawZone/DrawingCanvas at all.
const submissionListeners = new Set();
let lastSubmission = null; // { zone, id, url, path, createdAt } | null

export function subscribeToSubmissions(fn) {
  submissionListeners.add(fn);
  return () => submissionListeners.delete(fn);
}

// Most recent successful publish (or null if none yet this session).
export function getLastSubmission() {
  return lastSubmission;
}

function startListening() {
  if (zoneUnsubscribes.length) return;
  for (const zoneKey of Object.keys(ZONE_LIMITS)) {
    const q = query(
      collection(db, COLLECTION),
      where("zone", "==", zoneKey),
      orderBy("createdAt", "desc"),
      limit(ZONE_LIMITS[zoneKey]),
    );
    zoneUnsubscribes.push(
      onSnapshot(q, (snap) => {
        // Query comes back newest-first (that's what limit() keeps); reverse
        // to oldest-first so layoutScatter's index-based seeding stays as
        // stable as possible while a zone is under its cap. Falls back to the
        // full-res url for drawings uploaded before thumbnails existed, so
        // pre-migration drawings don't just vanish from the scene.
        const urls = snap.docs
          .map((d) => d.data())
          .reverse()
          .map((data) => data.thumbUrl || data.url)
          .filter(Boolean);
        cache = { ...cache, [zoneKey]: urls };
        listeners.forEach((fn) => fn(cache));
      }),
    );
  }
}

// Always an array (oldest contribution first), even for an untouched zone.
export function getDrawings(zoneKey) {
  startListening();
  return cache[zoneKey] || [];
}

export function getAllDrawings() {
  startListening();
  return cache;
}

export function subscribe(fn) {
  startListening();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Downscale a finished drawing's flattened PNG to a small square thumbnail
// for the scattered street scene. The full-res export is already square
// (exportSize x exportSize, see DrawingCanvas), so a direct draw into a
// THUMB_SIZE canvas never distorts it.
async function makeThumbnail(pngBlob, size) {
  const bitmap = await createImageBitmap(pngBlob);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, size, size);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Thumbnail export failed"));
    }, "image/png");
  });
}

// Upload one finished drawing (a PNG Blob from DrawingCanvas) to Storage —
// both the full-resolution original and a generated thumbnail — then record
// it in Firestore. Firestore's onSnapshot listeners above pick the new doc
// up and push it out to every subscriber.
export async function saveDrawing(zoneKey, pngBlob) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `drawings/${zoneKey}/${id}.png`;
  const thumbPath = `drawings/${zoneKey}/${id}-thumb.png`;
  const thumbBlob = await makeThumbnail(pngBlob, THUMB_SIZE);

  const storageRef = ref(storage, path);
  const thumbStorageRef = ref(storage, thumbPath);
  const uploadOpts = { contentType: "image/png", cacheControl: CACHE_CONTROL };

  await Promise.all([
    uploadBytes(storageRef, pngBlob, uploadOpts),
    uploadBytes(thumbStorageRef, thumbBlob, uploadOpts),
  ]);
  const [url, thumbUrl] = await Promise.all([
    getDownloadURL(storageRef),
    getDownloadURL(thumbStorageRef),
  ]);

  const docRef = await addDoc(collection(db, COLLECTION), {
    zone: zoneKey,
    url,
    path,
    thumbUrl,
    thumbPath,
    createdAt: serverTimestamp(),
  });

  const submission = { zone: zoneKey, id: docRef.id, url, path, thumbUrl, thumbPath, createdAt: Date.now() };
  lastSubmission = submission;
  submissionListeners.forEach((fn) => fn(submission));
  return submission;
}

// Admin listing: every drawing with its doc id (needed to target a single
// delete), newest first. Requires an authenticated admin session per the
// Firestore rules — callers should only invoke this from the gated /admin
// route.
export function subscribeAdminDrawings(fn) {
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    fn(snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })));
  });
}

async function deleteStorageObject(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // storage object already gone — non-fatal
  }
}

// Delete a single drawing (admin action). Removes the Firestore doc and both
// its Storage objects (full-res + thumbnail, if present); the live
// onSnapshot listeners in StreetScene/Admin pick up the removal
// automatically.
export async function deleteDrawing(id, path, thumbPath) {
  await deleteDoc(doc(db, COLLECTION, id));
  await Promise.all([deleteStorageObject(path), deleteStorageObject(thumbPath)]);
}

// Wipe a zone's contributions (handy while tuning the scene). No-arg clears
// all. Deletes both the Firestore docs and both Storage objects each.
export async function clearDrawings(zoneKey) {
  const base = collection(db, COLLECTION);
  const q = zoneKey ? query(base, where("zone", "==", zoneKey)) : query(base);
  const snap = await getDocs(q);

  await Promise.all(
    snap.docs.map(async (docSnap) => {
      const { path, thumbPath } = docSnap.data();
      await deleteDoc(docSnap.ref);
      await Promise.all([deleteStorageObject(path), deleteStorageObject(thumbPath)]);
    }),
  );
}
