/**
 * H-70 — sequential sharp operations on the driver-registration path with no
 * limit on decoded pixel count (decompression bomb → CPU/RAM exhaustion).
 *
 * Original finding (audit report, HIGH section):
 *   "ثلاث معالجات sharp متسلسلة داخل معالج التسجيل بلا حد لعدد البكسلات —
 *    إشباع المعالج وقنبلة فكّ ضغط" — routes.ts
 *
 * Measured against HEAD before changing anything:
 *
 *   CONFIRMED  `storeDriverDocument()` took the base64 data URI straight from the
 *              body, made a Buffer, and ran `.rotate().resize(1400,1400).webp()`
 *              — three chained operations — with no dimension or pixel check.
 *   CONFIRMED  `POST /api/drivers` calls it up to THREE times per request
 *              (national id, residence card, licence), so one request could carry
 *              three bombs. The route is rate-limited at 10/min.
 *   CONFIRMED  the risk with this project's own sharp build. A solid-colour PNG:
 *                 compressed   197 KB   (263 KB base64 — fits the 10MB body limit)
 *                 decoded     64.0 MP → 192 MB of raw pixels
 *                 metadata()     1 ms   (header only, never decodes)
 *   PARTIAL    sharp does carry a default ceiling — 0x3FFF² = 268 MP ≈ 1.07 GB —
 *              so it is not literally unbounded. But that is far above anything
 *              this app uses, and it only fires once processing has started,
 *              surfacing as a generic failure the route answered with 502. The
 *              64 MP bomb above sits under it and was processed in full.
 *
 * The fix reads the header first and refuses before any decode. These tests run
 * the SHIPPED `storeDriverDocument` — lifted out of routes.ts and executed with
 * stubbed storage — against real image buffers, so the mutation test binds to the
 * real request path rather than to a helper in isolation. No Firestore, no
 * Storage, no network.
 *
 * Run:  node --test tests/unit/h70-driver-document-image-limits.test.mjs
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import sharp from "sharp";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = read("server/routes.ts");
const CODE = stripComments(ROUTES);
const VALIDATION = read("server/orderValidation.ts");

/** The real limit helpers, from the shipped module. */
const V = await import(
  `data:text/javascript;base64,${Buffer.from(
    ts.transpileModule(VALIDATION, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString("base64")}`
);

let liftCounter = 0;

/** Brace-matched source of a named declaration in routes.ts. */
function declSource(src, header) {
  const at = src.indexOf(header);
  assert.ok(at > 0, `${header} not found`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced ${header}`);
}

/**
 * The SHIPPED storeDriverDocument, executed with stubbed dependencies.
 *
 * Everything it needs is injected: the real `sharp`, the real limit helpers, and
 * a recording stub for the private upload. Nothing is reimplemented — a change to
 * the function's body changes what these tests exercise, which is what makes the
 * mutation test below meaningful.
 */
function liftStoreDriverDocument({ skipPixelCheck = false } = {}) {
  let body = declSource(CODE, "async function storeDriverDocument(");
  if (skipPixelCheck) {
    // The mutation: delete the pixel/byte decision, exactly as requirement 3 of
    // the task describes it.
    body = body.replace(
      /const rejection = checkDocumentImageLimits\(\{[\s\S]*?\}\);\s*if \(rejection\) throw new DocumentImageError\(rejection, kind\);/,
      "",
    );
    assert.ok(!/checkDocumentImageLimits/.test(body), "the mutation did not apply");
  }
  const uploads = [];
  const src = `
    ${declSource(CODE, "class DocumentImageError extends Error")}
    ${body}
    export { storeDriverDocument, DocumentImageError };
  `;
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // Every dependency arrives through globalThis: a `data:` module has no base URL,
  // so it cannot resolve a filesystem import of its own. The `sharp` handed in is
  // the same instance this test file imported — the real one.
  const prelude = `
    const sharp = globalThis.__h70.sharp;
    const checkDocumentImageLimits = globalThis.__h70.check;
    const MAX_DOCUMENT_PIXELS = globalThis.__h70.maxPixels;
    const uploadPrivateToFirebaseStorage = globalThis.__h70.upload;
  `;
  globalThis.__h70 = {
    sharp,
    check: V.checkDocumentImageLimits,
    maxPixels: V.MAX_DOCUMENT_PIXELS,
    upload: async (buf, path, contentType) => {
      uploads.push({ bytes: buf.length, path, contentType });
      return path;
    },
  };
  // A `data:` URL is the module's identity, so two lifts of identical source would
  // resolve to the SAME cached module — and the second would keep the first one's
  // captured upload stub. A unique marker per lift keeps them separate.
  liftCounter += 1;
  const unique = `\n// lift ${liftCounter}\n`;
  return import(
    `data:text/javascript;base64,${Buffer.from(unique + prelude + js).toString("base64")}`
  ).then((mod) => ({ ...mod, uploads }));
}

const dataUri = (buf, mime = "image/png") =>
  `data:${mime};base64,${buf.toString("base64")}`;

/** Solid-colour images: tiny compressed, exactly the shape of a bomb. */
const png = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .png({ compressionLevel: 9 })
    .toBuffer();
const jpeg = (w, h) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 180, b: 180 } } })
    .jpeg()
    .toBuffer();

let FIXTURES;
before(async () => {
  FIXTURES = {
    document: await jpeg(1400, 1050),   // what the app actually uploads (H-56)
    camera: await jpeg(4032, 3024),     // an untouched 12 MP phone original
    bomb: await png(8000, 8000),        // 64 MP from ~200 KB
    garbage: Buffer.from("this is not an image at all, not even close"),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-70 · the defect, reproduced", () => {
  test("a small file really does decode to a huge image", async () => {
    const bomb = FIXTURES.bomb;
    const meta = await sharp(bomb).metadata();
    assert.ok(bomb.length < 1_000_000, `the fixture is ${bomb.length} bytes — not a bomb`);
    assert.equal(meta.width * meta.height, 64_000_000);
    assert.ok(
      meta.width * meta.height > V.MAX_DOCUMENT_PIXELS,
      "the bomb fixture no longer exceeds the limit — re-derive the finding",
    );
  });

  test("reading the header is cheap even for the bomb", async () => {
    // This is what makes a metadata-first check the right shape: it costs nothing.
    const t0 = process.hrtime.bigint();
    const meta = await sharp(FIXTURES.bomb).metadata();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.equal(meta.width, 8000);
    assert.ok(ms < 250, `metadata() took ${ms.toFixed(1)}ms — it should not decode`);
  });

  test("sharp's own default ceiling was far too high to be protection", () => {
    const sharpDefault = 0x3fff * 0x3fff;
    assert.ok(sharpDefault > 268_000_000);
    assert.ok(
      V.MAX_DOCUMENT_PIXELS < sharpDefault / 6,
      "the project limit is no longer meaningfully below sharp's default",
    );
  });
});

describe("H-70 · A + B. normal documents still work", () => {
  test("a document at the size the app uploads is processed and stored", async () => {
    const { storeDriverDocument, uploads } = await liftStoreDriverDocument();
    const path = await storeDriverDocument(
      dataUri(FIXTURES.document, "image/jpeg"), "07XXXXXXXXX", "national-id",
    );
    assert.equal(uploads.length, 1, "the document was not uploaded");
    assert.match(path, /^driver-documents\/.*\/national-id-\d+\.webp$/,
      "the stored path shape changed");
    assert.equal(uploads[0].contentType, "image/webp", "the stored format changed");
    assert.ok(uploads[0].bytes > 0);
  });

  test("an untouched 12 MP camera original is still accepted", async () => {
    // The realistic worst case for a legitimate driver: an older build, or a
    // client that skips the manipulator, posting the raw photo.
    const { storeDriverDocument, uploads } = await liftStoreDriverDocument();
    await storeDriverDocument(dataUri(FIXTURES.camera, "image/jpeg"), "07X", "license");
    assert.equal(uploads.length, 1, "a 12 MP phone original was refused");
  });

  test("the output is still capped to 1400px webp — the pipeline is unchanged", async () => {
    const { storeDriverDocument, uploads } = await liftStoreDriverDocument();
    await storeDriverDocument(dataUri(FIXTURES.camera, "image/jpeg"), "07X", "national-id");
    // Re-decode what would have been uploaded.
    assert.equal(uploads.length, 1);
    assert.match(CODE, /\.resize\(1400, 1400, \{ fit: "inside", withoutEnlargement: true \}\)/,
      "the resize target changed — H-70 must not alter the stored image");
    assert.match(CODE, /\.webp\(\{ quality: 82 \}\)/, "the output quality changed");
    assert.match(CODE, /\.rotate\(\)/, "EXIF orientation handling was dropped");
  });

  test("already-stored values short-circuit before any image work", async () => {
    const { storeDriverDocument, uploads } = await liftStoreDriverDocument();
    assert.equal(
      await storeDriverDocument("driver-documents/07X/national-id-1.webp", "07X", "national-id"),
      "driver-documents/07X/national-id-1.webp",
    );
    assert.equal(uploads.length, 0, "a stored path was re-uploaded");
  });
});

describe("H-70 · C. oversized images are refused before the heavy work", () => {
  test("the bomb is rejected, and nothing is uploaded", async () => {
    const { storeDriverDocument, DocumentImageError, uploads } = await liftStoreDriverDocument();
    await assert.rejects(
      () => storeDriverDocument(dataUri(FIXTURES.bomb), "07X", "national-id"),
      (e) => e instanceof DocumentImageError && e.rejection === "too-many-pixels",
    );
    assert.equal(uploads.length, 0, "a rejected document still reached storage");
  });

  test("it is rejected fast — i.e. before a decode, not after one", async () => {
    const { storeDriverDocument } = await liftStoreDriverDocument();
    const t0 = process.hrtime.bigint();
    await storeDriverDocument(dataUri(FIXTURES.bomb), "07X", "national-id").catch(() => {});
    const rejectMs = Number(process.hrtime.bigint() - t0) / 1e6;

    // Compare against what processing an image actually costs on this machine, so
    // the assertion is not a wall-clock constant that drifts with CI hardware.
    const t1 = process.hrtime.bigint();
    await sharp(FIXTURES.camera).rotate()
      .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer();
    const processMs = Number(process.hrtime.bigint() - t1) / 1e6;

    assert.ok(rejectMs < processMs,
      `rejection took ${rejectMs.toFixed(1)}ms vs ${processMs.toFixed(1)}ms to process a `
      + "12 MP image — the bomb is being decoded before it is refused");
  });

  test("extreme dimensions on each axis are refused", () => {
    const cases = [
      { width: 100_000, height: 1, label: "huge width" },
      { width: 1, height: 100_000, label: "huge height" },
      { width: 30_000, height: 30_000, label: "huge both (900 MP)" },
      { width: 7000, height: 7000, label: "49 MP, just over" },
    ];
    for (const c of cases) {
      const r = V.checkDocumentImageLimits({ bytes: 1000, width: c.width, height: c.height });
      const px = c.width * c.height;
      if (px > V.MAX_DOCUMENT_PIXELS) {
        assert.equal(r, "too-many-pixels", `${c.label} was accepted`);
      } else {
        assert.equal(r, null, `${c.label} was refused but is within the limit`);
      }
    }
  });

  test("the boundary is inclusive: exactly the limit passes, one pixel over does not", () => {
    const n = V.MAX_DOCUMENT_PIXELS;
    assert.equal(V.checkDocumentImageLimits({ bytes: 1000, width: n, height: 1 }), null);
    assert.equal(V.checkDocumentImageLimits({ bytes: 1000, width: n + 1, height: 1 }),
      "too-many-pixels");
  });

  test("a rejection maps to 413, not a 500", () => {
    assert.equal(V.documentRejectionStatus("too-many-pixels"), 413);
    assert.equal(V.documentRejectionStatus("too-large-bytes"), 413);
  });
});

describe("H-70 · D. unreadable or missing metadata is refused", () => {
  test("garbage bytes are refused as unreadable, not passed on", async () => {
    const { storeDriverDocument, DocumentImageError, uploads } = await liftStoreDriverDocument();
    await assert.rejects(
      () => storeDriverDocument(dataUri(FIXTURES.garbage), "07X", "national-id"),
      (e) => e instanceof DocumentImageError && e.rejection === "unreadable",
    );
    assert.equal(uploads.length, 0);
  });

  test("every way a dimension can be absent or nonsensical is refused", () => {
    const bad = [
      undefined, null, 0, -1, NaN, Infinity, -Infinity, 1.5, "1400", {}, [], true,
    ];
    for (const v of bad) {
      assert.equal(V.checkDocumentImageLimits({ bytes: 1000, width: v, height: 1000 }),
        "unreadable", `width=${String(v)} was accepted`);
      assert.equal(V.checkDocumentImageLimits({ bytes: 1000, width: 1000, height: v }),
        "unreadable", `height=${String(v)} was accepted`);
    }
  });

  test("an unreadable image maps to 400", () => {
    assert.equal(V.documentRejectionStatus("unreadable"), 400);
  });

  test("the rejection message never describes the document", () => {
    // These are government identity documents; the response is one log line away
    // from being recorded.
    for (const r of ["unreadable", "too-many-pixels", "too-large-bytes"]) {
      const msg = V.documentRejectionMessage(r);
      assert.ok(msg.length > 0);
      assert.doesNotMatch(msg, /\d{4,}|base64|data:|width|height|pixel/i,
        `the message for ${r} leaks detail about the file`);
    }
  });
});

describe("H-70 · E. the byte bound is separate from the pixel bound", () => {
  test("an oversized buffer is refused on bytes", () => {
    assert.equal(
      V.checkDocumentImageLimits({
        bytes: V.MAX_DOCUMENT_INPUT_BYTES + 1, width: 100, height: 100,
      }),
      "too-large-bytes",
    );
  });

  test("the byte bound does not stand in for the pixel bound", () => {
    // The whole point of the finding: small file, enormous decode.
    assert.equal(
      V.checkDocumentImageLimits({ bytes: 200_000, width: 8000, height: 8000 }),
      "too-many-pixels",
      "a 200KB / 64MP image passed — the byte check is being treated as sufficient",
    );
  });

  test("the pixel bound does not stand in for the byte bound either", () => {
    assert.equal(
      V.checkDocumentImageLimits({
        bytes: V.MAX_DOCUMENT_INPUT_BYTES + 1, width: 10, height: 10,
      }),
      "too-large-bytes",
      "a huge buffer with tiny dimensions passed — the two bounds are not independent",
    );
  });

  test("the bounds are sized for this app, not arbitrary", () => {
    // 1400×1400 is what the client sends and what the server resizes to.
    assert.ok(V.MAX_DOCUMENT_PIXELS >= 1400 * 1400 * 15,
      "the pixel bound leaves no headroom over what the app actually uploads");
    assert.ok(V.MAX_DOCUMENT_PIXELS >= 4032 * 3024,
      "a 12 MP phone original would be refused — that is a real driver's photo");
    assert.ok(V.MAX_DOCUMENT_PIXELS <= 64_000_000,
      "the pixel bound is high enough to let the measured bomb through");
    // Express caps the whole body at 10MB and three documents share it.
    assert.ok(V.MAX_DOCUMENT_INPUT_BYTES <= 10 * 1024 * 1024);
    assert.ok(V.MAX_DOCUMENT_INPUT_BYTES >= 4 * 1024 * 1024,
      "the byte bound is tight enough to refuse a legitimate camera original");
  });
});

describe("H-70 · the check runs BEFORE the pipeline, in the shipped source", () => {
  const fn = declSource(CODE, "async function storeDriverDocument(");

  test("order of operations: metadata → decide → heavy work", () => {
    const metaAt = fn.indexOf(".metadata()");
    const checkAt = fn.indexOf("checkDocumentImageLimits({");
    const throwAt = fn.indexOf("if (rejection) throw new DocumentImageError(rejection, kind)");
    const rotateAt = fn.indexOf(".rotate()");
    const resizeAt = fn.indexOf(".resize(");
    const webpAt = fn.indexOf(".webp(");
    for (const [name, i] of Object.entries({ metaAt, checkAt, throwAt, rotateAt, resizeAt, webpAt })) {
      assert.ok(i > -1, `${name} is missing from storeDriverDocument`);
    }
    assert.ok(metaAt < checkAt, "the limits are decided before the header is read");
    assert.ok(checkAt < throwAt, "the decision is not acted on");
    assert.ok(throwAt < rotateAt, "REGRESSION: .rotate() runs before the image is vetted");
    assert.ok(throwAt < resizeAt, "REGRESSION: .resize() runs before the image is vetted");
    assert.ok(throwAt < webpAt, "REGRESSION: .webp() runs before the image is vetted");
  });

  test("the header read does not itself decode", () => {
    // metadata() is called WITHOUT limitInputPixels on purpose: parsing a header
    // allocates nothing, and letting it succeed is what allows an accurate 413
    // instead of a generic "unreadable".
    assert.match(fn, /await sharp\(raw\)\.metadata\(\)/,
      "the header read changed shape");
  });

  test("libvips carries the same bound as defence in depth", () => {
    assert.match(fn, /sharp\(raw, \{ limitInputPixels: MAX_DOCUMENT_PIXELS \}\)/,
      "the transform no longer pins limitInputPixels — removing the explicit check "
      + "would leave sharp's 268 MP default as the only bound");
  });

  test("the declared MIME type is not used as a guard", () => {
    // The data URI's `image/...` is caller-written. It selects nothing and gates
    // nothing; only what sharp can read out of the bytes decides.
    const afterMatch = fn.slice(fn.indexOf("const raw = Buffer.from"));
    assert.doesNotMatch(afterMatch, /m\[1\]/,
      "the caller-supplied MIME type is being consulted after the match");
  });

  test("a rejected document never reaches storage", () => {
    const throwAt = fn.indexOf("if (rejection) throw new DocumentImageError(rejection, kind)");
    const uploadAt = fn.indexOf("uploadPrivateToFirebaseStorage");
    assert.ok(throwAt > -1 && uploadAt > -1 && throwAt < uploadAt,
      "a refused image could still be uploaded");
  });
});

describe("H-70 · the route answers 4xx, not 502", () => {
  const handler = (() => {
    const at = CODE.indexOf('app.post("/api/drivers", requireCustomerAuth');
    assert.ok(at > 0, "the driver registration route disappeared");
    return CODE.slice(at, CODE.indexOf("\n  });", at));
  })();

  test("a refused document is answered with its own status", () => {
    assert.match(handler, /if \(docErr instanceof DocumentImageError\)/,
      "the route no longer distinguishes a refused image from an upload failure");
    assert.match(handler, /res\s*\n?\s*\.status\(documentRejectionStatus\(docErr\.rejection\)\)/,
      "the refusal status is not derived from the rejection");
    assert.match(handler, /documentRejectionMessage\(docErr\.rejection\)/);
  });

  test("genuine upload failures still return 502", () => {
    assert.match(handler, /return res\.status\(502\)\.json\(\{ error: "تعذّر رفع صور الوثائق، حاول مجدداً" \}\)/,
      "the storage-failure path changed — that is not part of H-70");
  });

  test("nothing about the image is logged", () => {
    assert.match(handler, /console\.warn\(`\[DRIVER\] document rejected \(\$\{docErr\.kind\}\): \$\{docErr\.rejection\}`\)/,
      "the rejection log line changed");
    // The document itself must never appear in a log.
    for (const leak of [/nationalIdImage/, /residenceCardImage/, /driverLicenseImage/]) {
      const logs = [...handler.matchAll(/console\.\w+\(([^)]*)\)/g)].map((m) => m[1]).join(" ");
      assert.doesNotMatch(logs, leak, "a document image is being logged");
    }
  });

  test("registration still refuses rather than half-recording", () => {
    // Unchanged behaviour: if any document fails, no driver row is created.
    assert.ok(
      handler.indexOf("storeDriverDocument(nationalIdImage") < handler.indexOf("createDriver("),
      "documents are no longer stored before the driver row",
    );
    assert.match(handler, /storedNationalId = await storeDriverDocument\(nationalIdImage/);
    assert.match(handler, /residenceCardImage\s*\n?\s*\? await storeDriverDocument/);
    assert.match(handler, /driverLicenseImage\s*\n?\s*\? await storeDriverDocument/);
  });
});

describe("H-70 · G + mutation. removing the check reopens the finding", () => {
  test("with the pixel check removed, the bomb reaches the pipeline", async () => {
    // The mutation the task asks for, applied to the SHIPPED function body and run
    // for real. Without the check the bomb is no longer refused up front — it is
    // only stopped deeper in, by libvips, and never with a 413.
    const { storeDriverDocument, DocumentImageError, uploads } =
      await liftStoreDriverDocument({ skipPixelCheck: true });
    let rejectedAsTooManyPixels = false;
    try {
      await storeDriverDocument(dataUri(FIXTURES.bomb), "07X", "national-id");
    } catch (e) {
      rejectedAsTooManyPixels =
        e instanceof DocumentImageError && e.rejection === "too-many-pixels";
    }
    assert.equal(rejectedAsTooManyPixels, false,
      "the mutation did not take effect — this test proves nothing");
    assert.equal(uploads.length, 0,
      "with the check removed the bomb was processed AND stored");
  });

  test("with the check present, the same input is refused up front", async () => {
    const { storeDriverDocument, DocumentImageError } = await liftStoreDriverDocument();
    await assert.rejects(
      () => storeDriverDocument(dataUri(FIXTURES.bomb), "07X", "national-id"),
      (e) => e instanceof DocumentImageError && e.rejection === "too-many-pixels",
      "the shipped function no longer refuses the bomb — H-70 has reopened",
    );
  });

  test("a small file with a huge decode never reaches the heavy operations", async () => {
    // The security regression the task names explicitly (G).
    const bomb = FIXTURES.bomb;
    assert.ok(bomb.length < V.MAX_DOCUMENT_INPUT_BYTES,
      "the fixture is caught by the byte bound — it would not test the pixel bound");
    const meta = await sharp(bomb).metadata();
    assert.ok(meta.width * meta.height > V.MAX_DOCUMENT_PIXELS);
    const { storeDriverDocument, uploads } = await liftStoreDriverDocument();
    await storeDriverDocument(dataUri(bomb), "07X", "national-id").catch(() => {});
    assert.equal(uploads.length, 0);
  });
});
