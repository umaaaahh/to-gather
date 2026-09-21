// Security-rules test suite — runs against the Firestore/Storage emulators
// only (never production). Invoke via `npm run test:rules`, which wraps this
// in `firebase emulators:exec`.
//
// Covers Task Brief #2's acceptance criteria: reads stay public, creates stay
// public (existing validation untouched), and delete now requires an
// authenticated user for both Firestore docs and Storage objects.

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
  serverTimestamp,
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

    await check("authenticated admin delete succeeds (Firestore)", async () => {
      await assertSucceeds(deleteDoc(doc(admin.firestore(), "drawings", seededId)));
    });

    await check("authenticated admin delete succeeds (Storage)", async () => {
      await assertSucceeds(deleteObject(ref(admin.storage(), seededPath)));
    });

    await check("authenticated admin delete succeeds (Storage thumbnail)", async () => {
      await assertSucceeds(deleteObject(ref(admin.storage(), seededThumbPath)));
    });

    assert.equal(passed, 11);
    console.log(`\n${passed}/11 rules tests passed.`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((err) => {
  console.error("\nRULES TEST FAILURE:", err);
  process.exit(1);
});
