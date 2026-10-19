// Security-rules test suite — runs against the Firestore/Storage emulators
// only (never production). Invoke via `npm run test:rules`, which wraps this
// in `firebase emulators:exec`.
//
// Checks that reads stay public, creates stay public (with validation), and
// delete requires an authenticated, non-anonymous (admin) user for both
// Firestore docs and Storage objects. Then the Shelf: one vote per person,
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
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, deleteObject } from "firebase/storage";

const PROJECT_ID = "to-gather-rules-test";
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes

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
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync("storage.rules", "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });

  try {
    let seededId;
    const seededPath = "drawings/tree/seed.png";

    const seededThumbPath = "drawings/tree/seed-thumb.png";

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const ref_ = await addDoc(collection(ctx.firestore(), "drawings"), {
        zone: "tree",
        url: "https://example.com/seed.png",
        path: seededPath,
        thumbUrl: "https://example.com/seed-thumb.png",
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
    const admin = testEnv.authenticatedContext("uma-uid");
    // A shelf visitor: signed in, but anonymously.
    const visitorToken = { firebase: { sign_in_provider: "anonymous" } };
    const visitor = testEnv.authenticatedContext("visitor-a", visitorToken);
    const visitorB = testEnv.authenticatedContext("visitor-b", visitorToken);

    await check("unauthenticated read succeeds (Firestore)", async () => {
      await assertSucceeds(getDoc(doc(anon.firestore(), "drawings", seededId)));
      await assertSucceeds(getDocs(collection(anon.firestore(), "drawings")));
    });

    await check("unauthenticated create succeeds with valid shape (Firestore)", async () => {
      await assertSucceeds(
        addDoc(collection(anon.firestore(), "drawings"), {
          zone: "stem",
          url: "https://example.com/new.png",
          path: "drawings/stem/new.png",
          thumbUrl: "https://example.com/new-thumb.png",
          thumbPath: "drawings/stem/new-thumb.png",
          createdAt: serverTimestamp(),
        }),
      );
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
          url: "https://example.com/no-thumb.png",
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

    await check("unauthenticated write succeeds (Storage, matches create rule)", async () => {
      await assertSucceeds(
        uploadBytes(ref(anon.storage(), "drawings/tree/anon-upload.png"), PNG_BYTES, {
          contentType: "image/png",
        }),
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

    await check("authenticated admin delete succeeds (Firestore)", async () => {
      await assertSucceeds(deleteDoc(doc(admin.firestore(), "drawings", seededId)));
    });

    await check("authenticated admin delete succeeds (Storage)", async () => {
      await assertSucceeds(deleteObject(ref(admin.storage(), seededPath)));
    });

    await check("authenticated admin delete succeeds (Storage thumbnail)", async () => {
      await assertSucceeds(deleteObject(ref(admin.storage(), seededThumbPath)));
    });

    await shelfTests(testEnv, { anon, admin, visitor, visitorB });

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

async function shelfTests(testEnv, { anon, admin, visitor, visitorB }) {
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

  await check("visitor can't delete books or notes; admin can (Shelf)", async () => {
    await assertFails(deleteDoc(doc(visitor.firestore(), "shelfBooks", "book1")));
    await assertSucceeds(deleteDoc(doc(admin.firestore(), "shelfBooks", "book1")));
  });
}

main().catch((err) => {
  console.error("\nRULES TEST FAILURE:", err);
  process.exit(1);
});
