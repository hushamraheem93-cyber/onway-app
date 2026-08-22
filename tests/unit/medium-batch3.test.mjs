import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const routes = fs.readFileSync(new URL("../../server/routes.ts", import.meta.url), "utf8");
const firebase = fs.readFileSync(new URL("../../server/firebase.ts", import.meta.url), "utf8");
const envSetup = fs.readFileSync(new URL("../../deployment/env-setup.sh", import.meta.url), "utf8");
const bucketScript = fs.readFileSync(new URL("../../server/scripts/create-storage-bucket.ts", import.meta.url), "utf8");

function canonicalPhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00964")) return "0" + digits.slice(5);
  if (digits.startsWith("964")) return "0" + digits.slice(3);
  if (digits.startsWith("07")) return digits;
  if (digits.startsWith("7")) return "0" + digits;
  return digits;
}

function sameLocalPhone(a, b) {
  const left = canonicalPhone(a);
  const right = canonicalPhone(b);
  return /^07\d{9}$/.test(left) && left === right;
}

describe("M-23 — canonical identity and resource ownership", () => {
  test("equivalent Iraqi phone forms compare equal, invalid identities do not", () => {
    assert.equal(sameLocalPhone("+964 770 000 0001", "07700000001"), true);
    assert.equal(sameLocalPhone("009647700000001", "07700000001"), true);
    assert.equal(sameLocalPhone("", ""), false);
    assert.equal(sameLocalPhone("07700000001", "07700000002"), false);
  });

  test("ownership routes use sameLocalPhone rather than literal phone equality", () => {
    assert.match(routes, /function sameLocalPhone\(a: unknown, b: unknown\)/);
    assert.match(routes, /sameLocalPhone\(order\.phoneNumber \|\| order\.customerPhone, callerPhone\)/);
    assert.match(routes, /sameLocalPhone\(ownerPhone, callerPhone\)/);
    assert.match(routes, /sameLocalPhone\(data\.customerPhone, callerPhone\)/);
    assert.match(routes, /sameLocalPhone\(verifiedPhone, String\(phoneNumber\)\)/);
    assert.doesNotMatch(routes, /if \(\(req as any\)\.customerPhone !== phoneNumber\)/);
  });
});

describe("M-26 — admin order transitions use the server state machine", () => {
  test("admin status route does not force-bypass transitions", () => {
    const start = routes.indexOf('app.put("/api/admin/orders/:id/status"');
    assert.ok(start >= 0);
    const body = routes.slice(start, start + 9000);
    assert.match(body, /const success = await updateOrderStatus\(orderId, status\);/);
    assert.doesNotMatch(body, /updateOrderStatus\(orderId, status, \{ force: true \}\)/);
    assert.match(body, /res\.status\(409\)\.json\(\{ error: "انتقال حالة الطلب غير مسموح" \}\)/);
  });

  test("terminal states remain terminal in the production state machine", () => {
    assert.match(firebase, /delivered:\s*\[\]/);
    assert.match(firebase, /cancelled:\s*\[\]/);
    assert.match(firebase, /if \(!force\)/);
  });
});

describe("M-27 — deployment prompts do not reveal secret prefixes", () => {
  test("secret prompts show only configured state", () => {
    assert.doesNotMatch(envSetup, /CURRENT:0:8/);
    assert.match(envSetup, /\[configured\]/);
    assert.match(envSetup, /read -rsp/);
  });
});

describe("M-28 — Storage bucket access control", () => {
  test("new and existing buckets enable uniform bucket-level access", () => {
    assert.match(bucketScript, /uniformBucketLevelAccess:\s*\{ enabled: true \}/);
    assert.doesNotMatch(bucketScript, /uniformBucketLevelAccess:\s*\{ enabled: false \}/);
    const existingBranch = bucketScript.slice(bucketScript.indexOf("if (exists)"), bucketScript.indexOf("console.log(`  ⚙️  الـ bucket غير موجود"));
    assert.match(existingBranch, /await bucket\.setMetadata/);
    assert.match(existingBranch, /enabled: true/);
  });

  test("private driver documents do not receive permanent download tokens", () => {
    assert.match(firebase, /uploadPrivateToFirebaseStorage/);
    const privateSection = firebase.slice(firebase.indexOf("export async function uploadPrivateToFirebaseStorage"), firebase.indexOf("export async function getSignedDriverDocUrl"));
    const privateCode = privateSection.replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(privateCode, /firebaseStorageDownloadTokens/);
    assert.match(firebase, /action: "read"/);
    assert.match(firebase, /uploadToFirebaseStorage[\s\S]*firebaseStorageDownloadTokens/);
  });
});
