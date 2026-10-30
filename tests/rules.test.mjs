// Security-rules test suite — runs against the Firestore/Storage emulators
// only (never production). Invoke via `npm run test:rules`, which wraps this
// in `firebase emulators:exec`.
//
// Checks that reads stay public, creates stay public (with validation, and
// only pointing at our own uploads), uploaded files can't be overwritten, and
// delete needs an account listed in admins/{uid}, for both Firestore docs and
// Storage objects — any other sign-in, anonymous or email/password, is refused. Then the Shelf: one vote per person,
// vote counts that can't drift, and validated books and notes.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, deleteObject } from "firebase/storage";

// Matches --project in the test:rules script, so the Storage rules' Firestore
// lookup (isAdmin) sees the admins seeded here. demo- projects are
// emulator-only and never reach production.
const PROJECT_ID = "demo-to-gather";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes

const FIRESTORE_RULES = readFileSync("firestore.rules", "utf8");
const STORAGE_RULES = readFileSync("storage.rules", "utf8");

const ADMIN_UID = "uma-uid";

// A download URL the way saveDrawing gets one back from Storage.
const drawingUrl = (path) =>
  `https://firebasestorage.googleapis.com/v0/b/to-gather-54dd7.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media&token=abc`;

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`  ok - ${name}`);
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: FIRESTORE_RULES,
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: STORAGE_RULES,
      host: "127.0.0.1",
      port: 9199,
    },
  });

  try {
    let seededId;
    const seededPath = "drawings/tree/seed.png";

    const seededThumbPath = "drawings/tree/seed-thumb.png";

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // As if added by hand in the Firebase console.
      await setDoc(doc(ctx.firestore(), "admins", ADMIN_UID), {});
      const ref_ = await addDoc(collection(ctx.firestore(), "drawings"), {
        zone: "tree",
        url: drawingUrl(seededPath),
        path: seededPath,
        thumbUrl: drawingUrl(seededThumbPath),
        thumbPath: seededThumbPath,
        createdAt: new Date(),
      });
      seededId = ref_.id;
      await uploadBytes(ref(ctx.storage(), seededPath), PNG_BYTES, {
        contentType: "image/png",
      });
      await uploadBytes(ref(ctx.storage(), seededThumbPath), PNG_BYTES, {
        contentType: "image/png",
      });
    });

    const anon = testEnv.unauthenticatedContext();
    const admin = testEnv.authenticatedContext(ADMIN_UID);
    // A shelf visitor: signed in, but anonymously.
    const visitorToken = { firebase: { sign_in_provider: "anonymous" } };
    const visitor = testEnv.authenticatedContext("visitor-a", visitorToken);
    const visitorB = testEnv.authenticatedContext("visitor-b", visitorToken);
    // Someone who made their own email/password account with the public API
    // key: signed in, not anonymous, and still not the admin.
    const stranger = testEnv.authenticatedContext("stranger", {
      email: "stranger@example.com",
      firebase: { sign_in_provider: "password" },
    });

    await check("nobody can add themselves to admins, or read the list", async () => {
      await assertFails(setDoc(doc(stranger.firestore(), "admins", "stranger"), {}));
      await assertFails(setDoc(doc(visitor.firestore(), "admins", "visitor-a"), {}));
      await assertFails(getDoc(doc(stranger.firestore(), "admins", ADMIN_UID)));
    });

    await check("unauthenticated read succeeds (Firestore)", async () => {
      await assertSucceeds(getDoc(doc(anon.firestore(), "drawings", seededId)));
      await assertSucceeds(getDocs(collection(anon.firestore(), "drawings")));
    });

    await check("unauthenticated create succeeds with valid shape (Firestore)", async () => {
      await assertSucceeds(
        addDoc(collection(anon.firestore(), "drawings"), {
          zone: "stem",
          url: drawingUrl("drawings/stem/1-new.png"),
          path: "drawings/stem/1-new.png",
          thumbUrl: drawingUrl("drawings/stem/1-new-thumb.png"),
          thumbPath: "drawings/stem/1-new-thumb.png",
          createdAt: serverTimestamp(),
        }),
      );
    });

    await check("create rejected when an image is hosted elsewhere (Firestore)", async () => {
      const drawings = collection(anon.firestore(), "drawings");
      const valid = {
        zone: "stem",
        url: drawingUrl("drawings/stem/2-new.png"),
        path: "drawings/stem/2-new.png",
        thumbUrl: drawingUrl("drawings/stem/2-new-thumb.png"),
        thumbPath: "drawings/stem/2-new-thumb.png",
        createdAt: serverTimestamp(),
      };
      await assertFails(addDoc(drawings, { ...valid, url: "https://example.com/new.png" }));
      await assertFails(addDoc(drawings, { ...valid, thumbUrl: "https://example.com/new-thumb.png" }));
      // Another bucket, and our bucket but outside drawings/{zone}/.
      await assertFails(
        addDoc(drawings, { ...valid, url: valid.url.replace("to-gather-54dd7", "someone-else") }),
      );
      await assertFails(addDoc(drawings, { ...valid, url: drawingUrl("other/2-new.png") }));
      // A real drawing, but from a different zone's folder.
      await assertFails(addDoc(drawings, { ...valid, url: drawingUrl("drawings/tree/2-new.png") }));
    });

    await check("unauthenticated create rejected with invalid zone (Firestore)", async () => {
      await assertFails(
        addDoc(collection(anon.firestore(), "drawings"), {
          zone: "not-a-zone",
          url: "https://example.com/bad.png",
          path: "drawings/bad/new.png",
          thumbUrl: "https://example.com/bad-thumb.png",
          thumbPath: "drawings/bad/bad-thumb.png",
          createdAt: serverTimestamp(),
        }),
      );
    });

    await check("unauthenticated create rejected when missing thumbUrl (Firestore)", async () => {
      await assertFails(
        addDoc(collection(anon.firestore(), "drawings"), {
          zone: "stem",
          url: drawingUrl("drawings/stem/no-thumb.png"),
          path: "drawings/stem/no-thumb.png",
          createdAt: serverTimestamp(),
        }),
      );
    });

    await check("unauthenticated delete is REJECTED (Firestore)", async () => {
      await assertFails(deleteDoc(doc(anon.firestore(), "drawings", seededId)));
    });

    await check("anonymous visitor delete is REJECTED (Firestore)", async () => {
      await assertFails(deleteDoc(doc(visitor.firestore(), "drawings", seededId)));
    });

    await check("non-admin email/password user delete is REJECTED (Firestore)", async () => {
      await assertFails(deleteDoc(doc(stranger.firestore(), "drawings", seededId)));
    });

    await check("unauthenticated upload succeeds (Storage, matches create rule)", async () => {
      await assertSucceeds(
        uploadBytes(ref(anon.storage(), "drawings/tree/anon-upload.png"), PNG_BYTES, {
          contentType: "image/png",
        }),
      );
    });

    await check("overwriting an existing drawing is REJECTED (Storage)", async () => {
      await assertFails(
        uploadBytes(ref(anon.storage(), seededPath), PNG_BYTES, { contentType: "image/png" }),
      );
      await assertFails(
        uploadBytes(ref(stranger.storage(), seededThumbPath), PNG_BYTES, { contentType: "image/png" }),
      );
    });

    await check("unauthenticated read succeeds (Storage)", async () => {
      const { getBytes } = await import("firebase/storage");
      await assertSucceeds(getBytes(ref(anon.storage(), seededPath)));
    });

    await check("unauthenticated delete is REJECTED (Storage)", async () => {
      await assertFails(deleteObject(ref(anon.storage(), seededPath)));
    });

    await check("anonymous visitor delete is REJECTED (Storage)", async () => {
      await assertFails(deleteObject(ref(visitor.storage(), seededPath)));
    });

    await check("non-admin email/password user delete is REJECTED (Storage)", async () => {
      await assertFails(deleteObject(ref(stranger.storage(), seededPath)));
    });

    await check("authenticated admin delete succeeds (Firestore)", async () => {
      await assertSucceeds(deleteDoc(doc(admin.firestore(), "drawings", seededId)));
    });

    await check("authenticated admin delete succeeds (Storage)", async () => {
      await assertSucceeds(deleteObject(ref(admin.storage(), seededPath)));
    });

    await check("authenticated admin delete succeeds (Storage thumbnail)", async () => {
      await assertSucceeds(deleteObject(ref(admin.storage(), seededThumbPath)));
    });

    await shelfTests(testEnv, { anon, admin, visitor, visitorB, stranger });
    await eventsTests({ anon, admin, visitor, stranger });

    console.log(`\n${passed} rules tests passed.`);
  } finally {
    await testEnv.cleanup();
  }
}

const BOOK = {
  title: "Piranesi",
  authors: "Susanna Clarke",
  cover: "https://books.google.com/books/content?id=abc",
  link: "https://books.google.com/books?id=abc",
};

// Mirrors shelfStore.js's writes.
function addBookBatch(ctx, uid, bookId, { note, book = BOOK, votes = 1, withVote = true } = {}) {
  const db = ctx.firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "shelfBooks", bookId), { ...book, votes, createdAt: serverTimestamp() });
  if (withVote) {
    batch.set(doc(db, "shelfVotes", `${uid}_${bookId}`), { uid, bookId, createdAt: serverTimestamp() });
  }
  if (note) {
    batch.set(doc(collection(db, "shelfNotes")), { bookId, text: note, uid, createdAt: serverTimestamp() });
  }
  return batch.commit();
}

function voteBatch(ctx, uid, bookId, { by = 1 } = {}) {
  const db = ctx.firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "shelfVotes", `${uid}_${bookId}`), { uid, bookId, createdAt: serverTimestamp() });
  batch.update(doc(db, "shelfBooks", bookId), { votes: increment(by) });
  return batch.commit();
}

function unvoteBatch(ctx, uid, bookId) {
  const db = ctx.firestore();
  const batch = writeBatch(db);
  batch.delete(doc(db, "shelfVotes", `${uid}_${bookId}`));
  batch.update(doc(db, "shelfBooks", bookId), { votes: increment(-1) });
  return batch.commit();
}

async function votesOn(testEnv, bookId) {
  let votes;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    votes = (await getDoc(doc(ctx.firestore(), "shelfBooks", bookId))).data().votes;
  });
  return votes;
}

async function shelfTests(testEnv, { anon, admin, visitor, visitorB, stranger }) {
  await check("signed-out visitor can't add a book (Shelf)", async () => {
    await assertFails(addBookBatch(anon, "nobody", "book1"));
  });

  await check("visitor adds a book with their vote and a note (Shelf)", async () => {
    await assertSucceeds(addBookBatch(visitor, "visitor-a", "book1", { note: "So good." }));
  });

  await check("anyone can read the shelf and its notes (Shelf)", async () => {
    await assertSucceeds(getDocs(collection(anon.firestore(), "shelfBooks")));
    await assertSucceeds(getDocs(collection(anon.firestore(), "shelfNotes")));
  });

  await check("book can't be added without the adder's vote (Shelf)", async () => {
    await assertFails(addBookBatch(visitor, "visitor-a", "book2", { withVote: false }));
  });

  await check("book can't start with more than 1 vote (Shelf)", async () => {
    await assertFails(addBookBatch(visitor, "visitor-a", "book2", { votes: 50 }));
  });

  await check("book with a non-Google cover is rejected (Shelf)", async () => {
    await assertFails(
      addBookBatch(visitor, "visitor-a", "book2", { book: { ...BOOK, cover: "https://evil.example/x.png" } }),
    );
  });

  await check("book with a lookalike Google link or cover is rejected (Shelf)", async () => {
    await assertFails(
      addBookBatch(visitor, "visitor-a", "book2", {
        book: { ...BOOK, link: "https://books.google.evil.com/books?id=abc" },
      }),
    );
    await assertFails(
      addBookBatch(visitor, "visitor-a", "book2", {
        book: { ...BOOK, cover: "https://books.google.evil.com/x.png" },
      }),
    );
  });

  await check("book with a country Google Books link is accepted (Shelf)", async () => {
    await assertSucceeds(
      addBookBatch(visitor, "visitor-a", "book-au", {
        book: {
          ...BOOK,
          cover: "https://books.google.com.au/books/content?id=xyz",
          link: "https://play.google.com/store/books/details?id=xyz",
        },
      }),
    );
  });

  await check("a second visitor can vote (Shelf)", async () => {
    await assertSucceeds(voteBatch(visitorB, "visitor-b", "book1"));
    assert.equal(await votesOn(testEnv, "book1"), 2);
  });

  await check("voting twice is REJECTED (Shelf)", async () => {
    await assertFails(voteBatch(visitorB, "visitor-b", "book1"));
  });

  await check("voting as someone else is REJECTED (Shelf)", async () => {
    await assertFails(voteBatch(visitorB, "visitor-c", "book1"));
  });

  await check("a vote can't add more than 1 (Shelf)", async () => {
    await assertFails(voteBatch(visitor, "visitor-a", "book1", { by: 5 }));
  });

  await check("changing the count without a vote doc is REJECTED (Shelf)", async () => {
    await assertFails(updateDoc(doc(visitorB.firestore(), "shelfBooks", "book1"), { votes: increment(1) }));
  });

  await check("changing a book's title is REJECTED (Shelf)", async () => {
    await assertFails(updateDoc(doc(visitor.firestore(), "shelfBooks", "book1"), { title: "Rude" }));
  });

  await check("visitor can see their own votes but not others' (Shelf)", async () => {
    await assertSucceeds(getDoc(doc(visitor.firestore(), "shelfVotes", "visitor-a_book1")));
    await assertFails(getDoc(doc(visitor.firestore(), "shelfVotes", "visitor-b_book1")));
  });

  await check("visitor can take back their vote (Shelf)", async () => {
    await assertSucceeds(unvoteBatch(visitorB, "visitor-b", "book1"));
    assert.equal(await votesOn(testEnv, "book1"), 1);
  });

  await check("taking back a vote you don't have is REJECTED (Shelf)", async () => {
    await assertFails(unvoteBatch(visitorB, "visitor-b", "book1"));
  });

  await check("visitor can add a note to an existing book (Shelf)", async () => {
    await assertSucceeds(
      setDoc(doc(collection(visitorB.firestore(), "shelfNotes")), {
        bookId: "book1",
        text: "Loved it.",
        uid: "visitor-b",
        createdAt: serverTimestamp(),
      }),
    );
  });

  await check("note too long, or on a missing book, is REJECTED (Shelf)", async () => {
    const notes = collection(visitorB.firestore(), "shelfNotes");
    const note = { bookId: "book1", text: "x".repeat(141), uid: "visitor-b", createdAt: serverTimestamp() };
    await assertFails(addDoc(notes, note));
    await assertFails(addDoc(notes, { ...note, text: "hi", bookId: "no-such-book" }));
  });

  await check("admin can read everyone's votes on a book (Shelf)", async () => {
    await assertSucceeds(
      getDocs(query(collection(admin.firestore(), "shelfVotes"), where("bookId", "==", "book1"))),
    );
    await assertFails(
      getDocs(query(collection(visitor.firestore(), "shelfVotes"), where("bookId", "==", "book1"))),
    );
  });

  await check("visitor can't delete books or notes; admin can (Shelf)", async () => {
    await assertFails(deleteDoc(doc(visitor.firestore(), "shelfBooks", "book1")));
    await assertFails(deleteDoc(doc(stranger.firestore(), "shelfBooks", "book1")));
    await assertFails(
      getDocs(query(collection(stranger.firestore(), "shelfVotes"), where("bookId", "==", "book1"))),
    );
    // Mirrors shelfStore.js's deleteBook: votes and notes, then the book.
    const db = admin.firestore();
    const [votes, notes] = await Promise.all([
      getDocs(query(collection(db, "shelfVotes"), where("bookId", "==", "book1"))),
      getDocs(query(collection(db, "shelfNotes"), where("bookId", "==", "book1"))),
    ]);
    const batch = writeBatch(db);
    for (const d of [...votes.docs, ...notes.docs]) batch.delete(d.ref);
    await assertSucceeds(batch.commit());
    await assertSucceeds(deleteDoc(doc(db, "shelfBooks", "book1")));
  });
}

main().catch((err) => {
  console.error("\nRULES TEST FAILURE:", err);
  process.exit(1);
});

// Admin > Events (eventsStore.js): anyone reads, only admins add, edit,
// hide or undo, and a doc is either a whole event or a hide marker.
async function eventsTests({ anon, admin, visitor, stranger }) {
  const event = {
    title: "Open mic",
    date: "2026-11-05",
    start_time: "7:30 PM",
    end_time: "",
    location: "The Curtin",
    genre: "Music",
    description: "",
    link: "https://example.com",
    link_label: "",
    address: "",
    image: "",
    updatedAt: serverTimestamp(),
  };

  await check("only admins can add or edit events (Events)", async () => {
    await assertFails(setDoc(doc(anon.firestore(), "events", "admin-open-mic-2026-11-05"), event));
    await assertFails(setDoc(doc(visitor.firestore(), "events", "admin-open-mic-2026-11-05"), event));
    await assertFails(setDoc(doc(stranger.firestore(), "events", "admin-open-mic-2026-11-05"), event));
    await assertSucceeds(setDoc(doc(admin.firestore(), "events", "admin-open-mic-2026-11-05"), event));
    await assertSucceeds(
      setDoc(doc(admin.firestore(), "events", "admin-open-mic-2026-11-05"), { ...event, title: "Open mic night" }),
    );
  });

  await check("anyone can read events (Events)", async () => {
    await assertSucceeds(getDocs(collection(anon.firestore(), "events")));
  });

  await check("event docs are validated (Events)", async () => {
    const db = admin.firestore();
    await assertFails(setDoc(doc(db, "events", "x-2026-11-05"), { ...event, title: "" }));
    await assertFails(setDoc(doc(db, "events", "x-2026-11-05"), { ...event, date: "next tuesday" }));
    await assertFails(setDoc(doc(db, "events", "x-2026-11-05"), { ...event, extra: "nope" }));
    await assertFails(setDoc(doc(db, "events", "Bad ID!"), event));
    await assertFails(setDoc(doc(db, "events", "x-2026-11-05"), { deleted: false, updatedAt: serverTimestamp() }));
  });

  await check("admins can hide a CSV event and undo it (Events)", async () => {
    const hide = { deleted: true, updatedAt: serverTimestamp() };
    await assertFails(setDoc(doc(stranger.firestore(), "events", "walter-majik-2026-09-03"), hide));
    await assertSucceeds(setDoc(doc(admin.firestore(), "events", "walter-majik-2026-09-03"), hide));
    await assertFails(deleteDoc(doc(stranger.firestore(), "events", "walter-majik-2026-09-03")));
    await assertSucceeds(deleteDoc(doc(admin.firestore(), "events", "walter-majik-2026-09-03")));
  });
}
