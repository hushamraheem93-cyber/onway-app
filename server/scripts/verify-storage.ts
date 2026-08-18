/**
 * OnWay — Firebase Storage round-trip verification
 *
 *   npx tsx server/scripts/verify-storage.ts
 *
 * Proves the whole upload path end to end against the REAL bucket:
 *   1. the Admin SDK resolves the expected bucket
 *   2. that bucket actually exists and is writable
 *   3. uploadToFirebaseStorage() — the exact function every upload route calls —
 *      returns a Storage URL and NOT a Base64 data URI
 *   4. the returned URL is publicly fetchable and returns the same bytes
 *   5. the object is removed again, so the check leaves nothing behind
 *
 * Requires FIREBASE_SERVICE_ACCOUNT (and optionally FIREBASE_STORAGE_BUCKET) in
 * the environment or .env. Exits non-zero on the first failure.
 */
import admin from "firebase-admin";
import * as dotenv from "dotenv";
import {
  initializeFirebase,
  getFirestore,
  uploadToFirebaseStorage,
  deleteFromFirebaseStorage,
} from "../firebase";

// Must run before initializeFirebase() reads FIREBASE_SERVICE_ACCOUNT. It does:
// this executes while the module is being evaluated, and initializeFirebase() is
// called from main(), afterwards. Importing ../firebase has no side effect of its
// own — that is precisely why the initialisation below has to be explicit.
dotenv.config();

const EXPECTED_BUCKET = "onway-74c20.firebasestorage.app";

// Smallest possible real image: a 1x1 red PNG. Real magic bytes, so it also
// exercises the content-type handling rather than uploading arbitrary text.
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function step(n: number, label: string) {
  console.log(`\n[${n}] ${label}`);
}

function fail(msg: string): never {
  console.error(`\n❌ FAILED: ${msg}\n`);
  process.exit(1);
}

async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    fail("FIREBASE_SERVICE_ACCOUNT is not set — cannot talk to Firebase.");
  }

  // H-76: this used to call getFirestore() alone, with a comment claiming that
  // "initialising Firestore is what wires up the Admin SDK". It does not.
  // getFirestore() is a plain getter over a module-level handle that stays null
  // until initializeFirebase() has run, and importing ../firebase runs nothing.
  // Only server/index.ts ever called the initialiser, so this script read null
  // and exited 1 at this very step — on every machine, with every configuration,
  // however correct. An operator who ran the documented pre-launch check saw it
  // fail for a reason that was not true, and skipped the check.
  //
  // initializeFirebase() is the server's own initialiser, deliberately reused
  // rather than a second admin.initializeApp() here: it is what computes the
  // storageBucket default, and uploadToFirebaseStorage() — the function this
  // script exists to exercise — resolves its bucket from that same app. Rolling
  // a separate init would let the check pass against a different bucket than
  // production uploads use.
  step(1, "Initialising the Admin SDK");
  const initialised = initializeFirebase();
  if (!initialised)
    fail(
      "Admin SDK did not initialise — check FIREBASE_SERVICE_ACCOUNT is present and is valid JSON.",
    );

  // Re-read through the public accessor: this asserts the module-level handle
  // the rest of server/firebase.ts uses was actually populated, not merely that
  // the initialiser returned something.
  const db = getFirestore();
  if (!db)
    fail("Admin SDK initialised but the Firestore handle is still unset.");

  step(2, "Resolving the configured bucket");
  const bucket = admin.storage().bucket();
  console.log(`    configured : ${bucket.name}`);
  console.log(`    expected   : ${EXPECTED_BUCKET}`);
  if (bucket.name !== EXPECTED_BUCKET) {
    console.warn(
      `    ⚠ bucket differs from the expected name. That is only correct if you deliberately ` +
        `migrated buckets — otherwise unset FIREBASE_STORAGE_BUCKET.`,
    );
  }

  step(3, "Checking the bucket exists and is reachable");
  const [exists] = await bucket.exists();
  if (!exists)
    fail(
      `bucket ${bucket.name} does not exist or the service account cannot see it.`,
    );
  console.log("    ✓ bucket exists");

  const path = `_verify/storage-check-${Date.now()}.png`;
  let url = "";

  try {
    step(
      4,
      "Uploading through uploadToFirebaseStorage() — the real upload path",
    );
    url = await uploadToFirebaseStorage(PNG_1x1, path, "image/png");
    console.log(`    ✓ uploaded → ${url.slice(0, 96)}…`);

    step(5, "Asserting the result is a Storage URL, not a Base64 fallback");
    if (url.startsWith("data:"))
      fail("a Base64 data URI came back — the Storage upload did not happen.");
    if (!url.startsWith("https://firebasestorage.googleapis.com/")) {
      fail(`unexpected URL shape: ${url}`);
    }
    if (!url.includes(`/b/${bucket.name}/`))
      fail(`URL points at a different bucket: ${url}`);
    if (!url.includes("token="))
      fail("URL carries no download token — it would not be fetchable.");
    console.log("    ✓ real Storage URL, correct bucket, token present");

    step(6, "Fetching the URL back and comparing bytes");
    const res = await fetch(url);
    if (!res.ok) fail(`GET on the returned URL failed: HTTP ${res.status}`);
    const got = Buffer.from(await res.arrayBuffer());
    if (!got.equals(PNG_1x1))
      fail(`round-trip mismatch: sent ${PNG_1x1.length}B, got ${got.length}B`);
    console.log(
      `    ✓ ${got.length} bytes returned, identical to what was uploaded`,
    );
    console.log(`    content-type: ${res.headers.get("content-type")}`);
  } finally {
    step(7, "Cleaning up the test object");
    if (url) {
      await deleteFromFirebaseStorage(url).catch((e: any) =>
        console.warn(`    ⚠ could not delete ${path}: ${e?.message}`),
      );
    }
    await bucket
      .file(path)
      .delete()
      .catch(() => {});
    console.log("    ✓ removed");
  }

  console.log(
    `\n✅ Firebase Storage is working end to end on ${bucket.name}. No Base64 fallback was used.\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Verification threw:", err?.message || err, "\n");
  process.exit(1);
});
