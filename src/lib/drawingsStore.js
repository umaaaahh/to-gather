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
  getDocs,
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

let cache = {}; // { zoneKey: [url, ...] }, oldest first
let unsubscribeSnapshot = null;

function startListening() {
  if (unsubscribeSnapshot) return;
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "asc"));
  unsubscribeSnapshot = onSnapshot(q, (snap) => {
    const next = {};
    snap.forEach((docSnap) => {
      const { zone, url } = docSnap.data();
      if (!zone || !url) return;
      (next[zone] ??= []).push(url);
    });
    cache = next;
    listeners.forEach((fn) => fn(cache));
  });
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

// Upload one finished drawing (a PNG Blob from DrawingCanvas) to Storage,
// then record it in Firestore. Firestore's onSnapshot listener above picks
// the new doc up and pushes it out to every subscriber.
export async function saveDrawing(zoneKey, pngBlob) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `drawings/${zoneKey}/${id}.png`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, pngBlob, { contentType: "image/png" });
  const url = await getDownloadURL(storageRef);

  await addDoc(collection(db, COLLECTION), {
    zone: zoneKey,
    url,
    path,
    createdAt: serverTimestamp(),
  });
}

// Wipe a zone's contributions (handy while tuning the scene). No-arg clears
// all. Deletes both the Firestore docs and their Storage objects.
export async function clearDrawings(zoneKey) {
  const base = collection(db, COLLECTION);
  const q = zoneKey ? query(base, where("zone", "==", zoneKey)) : query(base);
  const snap = await getDocs(q);

  await Promise.all(
    snap.docs.map(async (docSnap) => {
      const { path } = docSnap.data();
      await deleteDoc(docSnap.ref);
      if (path) {
        try {
          await deleteObject(ref(storage, path));
        } catch {
          // storage object already gone — non-fatal
        }
      }
    }),
  );
}
