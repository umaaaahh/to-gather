// The Shelf's Firestore data, in three collections:
//
//   shelfBooks/{volumeId}  { title, authors, cover, link, votes, createdAt }
//     One doc per book, keyed by its Google Books volume id. `votes` is a
//     running count kept in step with shelfVotes by the security rules.
//   shelfNotes/{autoId}    { bookId, text, uid, createdAt }
//     The "why you should read it" notes, oldest first.
//   shelfVotes/{uid}_{volumeId}  { uid, bookId, createdAt }
//     One doc per person per book, so nobody can vote twice. Only readable
//     by the person who cast it.
//
// "Person" is a Firebase anonymous sign-in, made the first time a visitor
// adds or votes on something and remembered by their browser after that.
// Every write is a batch, so a vote and its counter change land together or
// not at all (firestore.rules rejects one without the other).

import { auth, db } from "./firebase";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

const BOOKS = "shelfBooks";
const NOTES = "shelfNotes";
const VOTES = "shelfVotes";

// Read caps so one popup open can never pull an unbounded collection. Books
// load most-voted first, so the Top 5 is always right even past the cap.
const BOOK_LIMIT = 500;
const NOTE_LIMIT = 2000;

/**
 * Live shelf: calls onChange with every book (most-voted first), each with
 * its notes as `reasons` (oldest first), whenever anything changes.
 * Returns an unsubscribe function.
 */
export function subscribeShelf(onChange, onError) {
  let books = null;
  let notesByBook = null;
  const emit = () => {
    if (!books || !notesByBook) return;
    onChange(books.map((b) => ({ ...b, reasons: notesByBook.get(b.id) || [] })));
  };

  const unsubBooks = onSnapshot(
    query(collection(db, BOOKS), orderBy("votes", "desc"), limit(BOOK_LIMIT)),
    (snap) => {
      books = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    onError,
  );
  const unsubNotes = onSnapshot(
    query(collection(db, NOTES), orderBy("createdAt", "asc"), limit(NOTE_LIMIT)),
    (snap) => {
      notesByBook = new Map();
      for (const d of snap.docs) {
        const { bookId, text } = d.data();
        if (!notesByBook.has(bookId)) notesByBook.set(bookId, []);
        notesByBook.get(bookId).push(text);
      }
      emit();
    },
    onError,
  );
  return () => {
    unsubBooks();
    unsubNotes();
  };
}

/**
 * Live set of book ids this visitor has voted for. Empty until they've
 * signed in (i.e. voted or added something at least once on this browser).
 */
export function subscribeMyVotes(onChange) {
  let unsubVotes = () => {};
  const unsubAuth = onAuthStateChanged(auth, (user) => {
    unsubVotes();
    unsubVotes = () => {};
    if (!user) {
      onChange(new Set());
      return;
    }
    unsubVotes = onSnapshot(
      query(collection(db, VOTES), where("uid", "==", user.uid)),
      (snap) => onChange(new Set(snap.docs.map((d) => d.data().bookId))),
      (err) => console.warn("Shelf votes listener failed:", err),
    );
  });
  return () => {
    unsubAuth();
    unsubVotes();
  };
}

// The visitor's uid, signing them in anonymously the first time.
async function currentUid() {
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

function addNote(batch, bookId, uid, note) {
  batch.set(doc(collection(db, NOTES)), {
    bookId,
    text: note,
    uid,
    createdAt: serverTimestamp(),
  });
}

function addVote(batch, bookId, uid) {
  batch.set(doc(db, VOTES, `${uid}_${bookId}`), { uid, bookId, createdAt: serverTimestamp() });
}

/** Put a new book on the shelf with this visitor's vote and optional note. */
export async function addBook(book, note) {
  const uid = await currentUid();
  const batch = writeBatch(db);
  batch.set(doc(db, BOOKS, book.id), {
    title: book.title,
    authors: book.authors,
    cover: book.cover,
    link: book.link,
    votes: 1,
    createdAt: serverTimestamp(),
  });
  addVote(batch, book.id, uid);
  if (note) addNote(batch, book.id, uid, note);
  await batch.commit();
}

/** Add this visitor's vote and/or note to a book already on the shelf. */
export async function addToBook(bookId, { vote, note }) {
  const uid = await currentUid();
  const batch = writeBatch(db);
  if (vote) {
    addVote(batch, bookId, uid);
    batch.update(doc(db, BOOKS, bookId), { votes: increment(1) });
  }
  if (note) addNote(batch, bookId, uid, note);
  await batch.commit();
}

/** Add (on = true) or take back (on = false) this visitor's vote. */
export async function setVote(bookId, on) {
  if (on) return addToBook(bookId, { vote: true });
  const uid = await currentUid();
  const batch = writeBatch(db);
  batch.delete(doc(db, VOTES, `${uid}_${bookId}`));
  batch.update(doc(db, BOOKS, bookId), { votes: increment(-1) });
  await batch.commit();
}
