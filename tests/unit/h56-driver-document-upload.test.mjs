/**
 * H-56 — identity documents must not travel as full-resolution base64.
 *
 * Half of the finding was already fixed on the SERVER before this round:
 * storeDriverDocument() (routes.ts) rotates, resizes to 1400px, re-encodes to
 * WebP and uploads privately, storing only the object path — so Firestore's 1 MB
 * document cap is no longer in play at all. That part is recorded here as fixed,
 * not re-fixed.
 *
 * What was still true: DriverRegistrationScreen asked expo-image-picker for
 * `base64: true` and put the untouched, full-resolution photo into the JSON body
 * of POST /api/drivers. Measured on a synthetic 4032×3024 ID photo with sensor
 * grain, that is ~850 KB per document and ~2.55 MB for three — over mobile data,
 * in one non-resumable request.
 *
 * These tests execute real code: the screen's own handleImageResult lifted from
 * the .tsx and driven with a fake picker/manipulator, the real checkDocumentAsset
 * and SIZE_CONFIG from client/lib/imageUtils.ts, the real storeDriverDocument
 * pipeline reproduced through the same sharp operations the server performs, and
 * real byte measurements — never a size assumed.
 *
 * No real identity data is used anywhere: every image is generated.
 *
 * Run:  node --test tests/unit/h56-driver-document-upload.test.mjs
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const SCREEN = read("client/screens/DriverRegistrationScreen.tsx");
const IMAGE_UTILS = read("client/lib/imageUtils.ts");
const ROUTES = read("server/routes.ts");

/**
 * client/lib/imageUtils.ts cannot be imported here: it pulls in
 * expo-image-manipulator → react-native, which esbuild will not transform outside
 * Metro. The document rules are therefore LIFTED from that file and executed, so
 * these are still the shipped definitions rather than copies.
 */
const {
  checkDocumentAsset,
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_INPUT_BYTES,
  DOCUMENT_REJECTION_TEXT,
} = (() => {
  // One contiguous slice: the four document rules sit together in the file.
  const from = IMAGE_UTILS.indexOf("export const DOCUMENT_MIME_TYPES");
  const anchor = IMAGE_UTILS.indexOf("export const DOCUMENT_REJECTION_TEXT");
  assert.ok(from !== -1 && anchor > from, "the document rules moved in client/lib/imageUtils.ts");
  const to = IMAGE_UTILS.indexOf("\n};", anchor) + 3;
  const src = IMAGE_UTILS.slice(from, to).replace(/^export /gm, "");
  const js = ts.transpileModule(
    `${src}\nreturn { checkDocumentAsset, DOCUMENT_MIME_TYPES, MAX_DOCUMENT_INPUT_BYTES, DOCUMENT_REJECTION_TEXT };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return new Function(js)();
})();

// ── lifting the screen's own handler ────────────────────────────────────────
function braceBlock(src, start) {
  const open = src.indexOf("{", start);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces");
}
const liftDecl = (src, name) => {
  const m = new RegExp(`const ${name} =\\s`).exec(src);
  if (!m) return "";
  const semi = src.indexOf(";", m.index);
  const brace = src.indexOf("{", m.index);
  if (brace === -1 || semi < brace) return src.slice(m.index, semi + 1);
  return braceBlock(src, m.index) + ";";
};

/**
 * DriverRegistrationScreen.handleImageResult, executed. `prepare` stands in for
 * compressAndConvertToBase64 (expo-image-manipulator is native-only); everything
 * else — the validation call, the ordering, the error handling — is the shipped code.
 */
function runPicked(asset, { prepare } = {}) {
  const seen = { stored: null, errors: [], processing: [], prepared: [] };
  const js = ts.transpileModule(
    `${liftDecl(SCREEN, "handleImageResult")}\nreturn handleImageResult;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const env = {
    getSetterForType: () => (v) => { seen.stored = v; },
    checkDocumentAsset,
    DOCUMENT_REJECTION_TEXT,
    setErrorMessage: (m) => seen.errors.push(m),
    setIsProcessingImage: (v) => seen.processing.push(v),
    compressAndConvertToBase64: async (uri, kind) => {
      seen.prepared.push([uri, kind]);
      if (prepare) return prepare(uri, kind);
      return "data:image/webp;base64,UFJFUEFSRUQ=";
    },
    Haptics: { notificationAsync: () => {}, NotificationFeedbackType: {} },
  };
  const keys = Object.keys(env);
  const handler = new Function(...keys, js)(...keys.map((k) => env[k]));
  return { handler, seen };
}

const picked = (over = {}) => ({
  canceled: false,
  assets: [{ uri: "file:///tmp/doc.jpg", mimeType: "image/jpeg", fileSize: 4_200_000, ...over }],
});

// ── synthetic ID photo, generated (no personal data) ────────────────────────
let ORIGINAL, TODAY, PREPARED;
before(async () => {
  const lines = Array.from({ length: 14 }, (_, i) =>
    `<text x="380" y="${900 + i * 92}" font-family="monospace" font-size="46" fill="#111">` +
    `FIELD-${i} 0123456789 ABCDEFGHIJ ${"x".repeat(18)}</text>`).join("");
  const card = await sharp(Buffer.from(
    `<svg width="4032" height="3024" xmlns="http://www.w3.org/2000/svg">
       <rect width="100%" height="100%" fill="#22303f"/>
       <rect x="300" y="600" width="3432" height="1824" rx="40" fill="#f4f2ec"/>${lines}</svg>`))
    .jpeg({ quality: 92 }).toBuffer();
  // Sensor grain — this is what makes a real document photo compress badly.
  const grain = await sharp({ create: { width: 4032, height: 3024, channels: 3,
    noise: { type: "gaussian", mean: 128, sigma: 42 } } }).png().toBuffer();
  ORIGINAL = await sharp(card).composite([{ input: grain, blend: "overlay" }])
    .jpeg({ quality: 92 }).toBuffer();

  // BEFORE: expo-image-picker quality 0.4, base64: true, no resize.
  TODAY = await sharp(ORIGINAL).jpeg({ quality: 40 }).toBuffer();
  // AFTER: the "document" profile — 1400px longest edge, WebP q82.
  PREPARED = await sharp(ORIGINAL).rotate()
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 }).toBuffer();
});

const b64 = (buf) => buf.toString("base64");
const bodyBytes = (buf, mime, count) => {
  const uri = `data:${mime};base64,${b64(buf)}`;
  const body = { phoneNumber: "07700000000", fullName: "اسم رباعي", firstName: "أ",
    secondName: "ب", thirdName: "ج", fourthName: "د", motorcycleNumber: "1",
    nationalIdImage: uri };
  if (count > 1) body.residenceCardImage = uri;
  if (count > 2) body.driverLicenseImage = uri;
  return Buffer.byteLength(JSON.stringify(body), "utf8");
};

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · the measured problem", () => {
  test("base64 costs exactly +33.3% — the report's figure is right", () => {
    for (const buf of [TODAY, PREPARED]) {
      const overhead = (b64(buf).length / buf.length - 1) * 100;
      assert.ok(overhead > 33.2 && overhead < 33.5, `got +${overhead.toFixed(2)}%`);
    }
  });

  test("the old flow sent the photo at FULL resolution", async () => {
    const m = await sharp(TODAY).metadata();
    assert.equal(m.width, 4032);
    assert.equal(m.height, 3024);
  });

  test("three documents were megabytes of JSON on mobile data", () => {
    const three = bodyBytes(TODAY, "image/jpeg", 3);
    assert.ok(three > 2 * 1024 * 1024, `${(three / 1048576).toFixed(2)} MB`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · the payload after the fix", () => {
  test("one document shrinks by more than 80%", () => {
    const before = bodyBytes(TODAY, "image/jpeg", 1);
    const after = bodyBytes(PREPARED, "image/webp", 1);
    const saved = 100 - (after / before) * 100;
    assert.ok(saved > 80, `only ${saved.toFixed(1)}% smaller`);
  });

  test("three documents fit well under a megabyte", () => {
    const after = bodyBytes(PREPARED, "image/webp", 3);
    assert.ok(after < 1024 * 1024, `${(after / 1048576).toFixed(2)} MB`);
  });

  test("the saving holds for 1, 2 and 3 documents", () => {
    for (const n of [1, 2, 3]) {
      assert.ok(bodyBytes(PREPARED, "image/webp", n) < bodyBytes(TODAY, "image/jpeg", n) * 0.25);
    }
  });

  test("everything still fits the server's 10 MB body limit, with room", () => {
    const m = ROUTES && read("server/index.ts").match(/limit: "(\d+)mb"/);
    assert.ok(m, "the express.json limit moved");
    assert.ok(bodyBytes(PREPARED, "image/webp", 3) < Number(m[1]) * 1024 * 1024);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · the document stays readable", () => {
  test("the resize keeps the long edge at 1400 and does not distort", async () => {
    const m = await sharp(PREPARED).metadata();
    assert.equal(Math.max(m.width, m.height), 1400);
    const src = await sharp(ORIGINAL).metadata();
    const ratioBefore = src.width / src.height;
    const ratioAfter = m.width / m.height;
    assert.ok(Math.abs(ratioBefore - ratioAfter) < 0.01, "the aspect ratio changed");
  });

  test("the client's target matches the server's own, so nothing extra is lost", () => {
    const server = ROUTES.slice(ROUTES.indexOf("async function storeDriverDocument"));
    assert.match(server, /\.resize\(1400, 1400, \{ fit: "inside", withoutEnlargement: true \}\)/);
    assert.match(server, /\.webp\(\{ quality: 82 \}\)/);
    assert.match(IMAGE_UTILS, /document: \{ width: 1400, quality: 0\.82 \}/);
  });

  test("small print survives — glyphs stay well above the legibility floor", async () => {
    const src = await sharp(ORIGINAL).metadata();
    const out = await sharp(PREPARED).metadata();
    const glyphPx = 46 * (out.width / src.width);
    assert.ok(glyphPx >= 12, `smallest glyph would be ${glyphPx.toFixed(1)}px`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · the screen no longer ships raw base64", () => {
  const code = SCREEN.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  test("the picker is not asked for base64 any more", () => {
    assert.doesNotMatch(code, /base64:\s*true/,
      "the picker still materialises the whole image as a string");
  });

  test("asset.base64 is never read", () => {
    assert.doesNotMatch(code, /asset\.base64/);
  });

  test("the raw picked uri is never stored as the document", () => {
    // The old fallback did `setter(asset.uri)` — a local file path that the server
    // would then reject as "expected a base64 image data URI".
    assert.doesNotMatch(code, /setter\(asset\.uri\)/);
  });

  test("every document goes through the shared pipeline", () => {
    assert.match(code, /compressAndConvertToBase64\(asset\.uri, "document"\)/);
    assert.match(SCREEN, /from "@\/lib\/imageUtils"/);
  });

  test("a prepared document is what reaches state", async () => {
    const { handler, seen } = runPicked(picked());
    await handler(picked(), "nationalId");
    assert.deepEqual(seen.prepared, [["file:///tmp/doc.jpg", "document"]]);
    assert.match(seen.stored, /^data:image\/webp;base64,/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · validation before anything is uploaded", () => {
  test("an unsupported type is refused with a message", async () => {
    const { handler, seen } = runPicked(picked());
    await handler(picked({ mimeType: "application/pdf" }), "nationalId");
    assert.equal(seen.stored, null, "a non-image was accepted as a document");
    assert.deepEqual(seen.errors, [DOCUMENT_REJECTION_TEXT["unsupported-type"]]);
    assert.deepEqual(seen.prepared, [], "processing started before validation");
  });

  test("an absurdly large original is refused", async () => {
    const { handler, seen } = runPicked(picked());
    await handler(picked({ fileSize: MAX_DOCUMENT_INPUT_BYTES + 1 }), "nationalId");
    assert.equal(seen.stored, null);
    assert.deepEqual(seen.errors, [DOCUMENT_REJECTION_TEXT["too-large"]]);
  });

  test("every type the pickers can produce is accepted", () => {
    for (const mime of DOCUMENT_MIME_TYPES) {
      assert.equal(checkDocumentAsset({ mimeType: mime, fileSize: 1000 }), null, mime);
    }
  });

  test("missing metadata is not treated as a rejection", () => {
    assert.equal(checkDocumentAsset({}), null);
    assert.equal(checkDocumentAsset({ mimeType: null, fileSize: null }), null);
  });

  test("cancelling the picker changes nothing", async () => {
    const { handler, seen } = runPicked(picked());
    await handler({ canceled: true, assets: null }, "nationalId");
    assert.equal(seen.stored, null);
    assert.deepEqual(seen.errors, []);
    assert.deepEqual(seen.processing, []);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · failures and retries", () => {
  test("a processing failure does NOT fall back to the raw photo", async () => {
    const { handler, seen } = runPicked(picked(), {
      prepare: async () => { throw new Error("manipulator unavailable"); },
    });
    await handler(picked(), "nationalId");
    assert.equal(seen.stored, null, "the untouched image was stored as a fallback");
    assert.equal(seen.errors.length, 1);
  });

  test("the processing flag is always cleared, success or failure", async () => {
    const ok = runPicked(picked());
    await ok.handler(picked(), "nationalId");
    assert.deepEqual(ok.seen.processing, [true, false]);

    const bad = runPicked(picked(), { prepare: async () => { throw new Error("x"); } });
    await bad.handler(picked(), "nationalId");
    assert.deepEqual(bad.seen.processing, [true, false], "the form would stay disabled forever");
  });

  test("submitting is blocked while a document is being prepared", () => {
    assert.match(SCREEN, /disabled=\{!isFormValid \|\| isLoading \|\| isProcessingImage\}/,
      "a half-prepared registration could be submitted");
  });

  test("re-picking replaces the document instead of accumulating", async () => {
    const { handler, seen } = runPicked(picked());
    await handler(picked(), "nationalId");
    await handler(picked(), "nationalId");
    assert.equal(seen.prepared.length, 2);
    assert.match(seen.stored, /^data:image\/webp;base64,/);
  });

  test("the server is idempotent for an already-stored path — a retry adds no duplicate", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function storeDriverDocument"));
    assert.match(fn, /if \(value\.startsWith\("driver-documents\/"\)\) return value;/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · privacy and authorisation", () => {
  const code = SCREEN.replace(/\/\*[\s\S]*?\*\//g, "");

  test("no document ever reaches a log", () => {
    for (const bad of [/console\.(log|warn|error)\([^)]*nationalIdImage/,
                       /console\.(log|warn|error)\([^)]*base64/i,
                       /console\.(log|warn|error)\([^)]*residenceCard/]) {
      assert.doesNotMatch(code, bad, "an identity document is being logged");
    }
  });

  test("the server logs only a failure message, never the payload", () => {
    const at = ROUTES.indexOf('app.post("/api/drivers"');
    const handler = braceBlock(ROUTES, at);
    assert.match(handler, /console\.error\("\[DRIVER\] document upload FAILED:", docErr\?\.message\)/);
    assert.doesNotMatch(handler, /console\.[a-z]+\([^)]*(nationalIdImage|residenceCardImage|driverLicenseImage|base64)/,
      "an identity document reaches a server log");
  });

  test("documents are not persisted anywhere on the device", () => {
    assert.doesNotMatch(code, /AsyncStorage[\s\S]{0,80}(nationalId|residenceCard|driverLicense)/);
    assert.doesNotMatch(code, /navigation\.navigate\([^)]*(nationalId|residenceCard|driverLicense)/);
  });

  test("documents travel in the request BODY, never in a URL", () => {
    assert.doesNotMatch(code, /\?\s*nationalIdImage=|searchParams\.set\([^)]*Image/);
  });

  test("a driver cannot upload into another driver's folder", () => {
    const handler = ROUTES.slice(ROUTES.indexOf('app.post("/api/drivers"'));
    // The phone in the path comes from the body, but the body phone must equal the
    // OTP-verified phone on the JWT, checked before any upload happens.
    const ownership = handler.indexOf('(req as any).customerPhone !== phoneNumber');
    const upload = handler.indexOf("storeDriverDocument(");
    assert.ok(ownership !== -1 && ownership < upload,
      "the ownership check does not precede the upload");
    assert.match(ROUTES, /app\.post\("\/api\/drivers", requireCustomerAuth/);
  });

  test("the storage path is encoded, so a crafted phone cannot traverse", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function storeDriverDocument"));
    assert.match(fn, /driver-documents\/\$\{encodeURIComponent\(phoneNumber\)\}/);
  });

  test("the server keeps a private path, not a public URL", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function storeDriverDocument"));
    assert.match(fn, /uploadPrivateToFirebaseStorage/);
  });

  test("no generated fixture in this suite is a real document", () => {
    // Every image here comes from sharp's SVG/noise generators above.
    assert.doesNotMatch(read("tests/unit/h56-driver-document-upload.test.mjs"),
      /data:image\/[a-z]+;base64,[A-Za-z0-9+/]{200,}/,
      "a large embedded image literal appeared in the test file");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-56 · registration itself is unchanged", () => {
  test("the API contract is untouched — same fields, same endpoint", () => {
    assert.match(SCREEN, /new URL\("\/api\/drivers", getApiUrl\(\)\)/);
    for (const f of ["nationalIdImage", "residenceCardImage", "driverLicenseImage"]) {
      assert.match(SCREEN, new RegExp(f));
      assert.match(ROUTES, new RegExp(f));
    }
  });

  test("the licence is still optional, the other two still required", () => {
    assert.match(SCREEN, /nationalIdImage !== null &&\s*residenceCardImage !== null/);
    assert.match(SCREEN, /if \(driverLicenseImage\) \{/);
  });

  test("the server still accepts the same data-URI shape the client sends", () => {
    const fn = ROUTES.slice(ROUTES.indexOf("async function storeDriverDocument"));
    const m = fn.match(/value\.match\((\/\^data:.*?\/i)\)/);
    assert.ok(m, "the server's data-URI pattern moved");
    // eslint-disable-next-line no-new-func
    const re = new Function(`return ${m[1]};`)();
    assert.ok(re.test("data:image/webp;base64,UFJFUEFSRUQ="),
      "the server would reject what the client now produces");
    assert.ok(re.test("data:image/jpeg;base64,UFJFUEFSRUQ="),
      "older clients sending JPEG would break — the change must stay backward compatible");
  });
});
