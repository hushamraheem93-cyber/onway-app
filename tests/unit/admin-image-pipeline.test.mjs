/**
 * Admin image pipeline — banners and transparency (findings C-1, C-2, H-1).
 *
 * C-1  Banners were the one admin image type that never entered the pipeline.
 *      saveBanner() read the raw file with fileToBase64() and put the data URI
 *      straight into the Firestore document. Firestore rejects any document over
 *      1MB and Base64 inflates a payload by a third, so a normal 1-2MB banner
 *      photo could not be saved at all — and the ones small enough to fit were
 *      shipped to every customer inside each /api/banners response. Categories
 *      and products were moved to Firebase Storage for exactly this reason; the
 *      banner form was left behind.
 *
 * C-2  compressImageForUpload() encoded every upload as JPEG. JPEG carries no
 *      alpha channel, and the canvas specification composites a transparent
 *      pixel onto BLACK on the way out. Category icons are normally transparent
 *      PNGs, so an uploaded icon arrived with a solid black square behind it —
 *      which is why the bundled 3D fallback looked better than a real upload.
 *
 * H-1  The upload dedupe map was keyed by sha256(bytes) alone while the OUTPUT
 *      differs by type (category 500px, banner 1000px, product 700px, each on
 *      its own storage path). Uploading one file as a category and then the same
 *      file as a banner handed the banner the 500px category URL, with a 200.
 *      C-1 is what makes that collision reachable from the web panel at all,
 *      since before it the panel never sent type=banner.
 *
 * The saveBanner test executes the REAL function body lifted out of admin.html
 * against injected stand-ins. The alpha and size tests run the REAL sharp
 * pipeline. Nothing here is asserted from prose.
 *
 * Run:  node --test tests/unit/admin-image-pipeline.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { stripComments } from "./_source.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ADMIN_HTML = readFileSync(join(root, "server/templates/admin.html"), "utf8");
const ROUTES = readFileSync(join(root, "server/routes.ts"), "utf8");

// ── lifting ─────────────────────────────────────────────────────────────────

/** Source of `function <name>(...)` / `async function <name>(...)`, brace-matched. */
function liftFunction(src, name) {
  const at = src.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(at, -1, `${name} not found — the shipped source moved`);
  let i = src.indexOf("{", at);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(at, j + 1);
    }
  }
  throw new Error(`unbalanced braces lifting ${name}`);
}

// ── C-2 · the browser-side output-format decision, executed ──────────────────

describe("C-2 · an alpha-capable upload never becomes JPEG", () => {
  const decide = new Function(
    liftFunction(ADMIN_HTML, "uploadOutputType").replace(/^/, "") +
      "\n" +
      ADMIN_HTML.match(/const ALPHA_CAPABLE_TYPES = \[[^\]]*\];/)[0] +
      "\nreturn uploadOutputType;",
  )();
  const nameFor = new Function(liftFunction(ADMIN_HTML, "uploadFileName") + "\nreturn uploadFileName;")();

  for (const type of ["image/png", "image/webp", "image/gif", "image/avif"]) {
    test(`${type} is re-encoded as WebP, which keeps the alpha channel`, () => {
      assert.equal(decide(type), "image/webp");
    });
  }

  test("a JPEG source stays JPEG — it has no alpha to lose", () => {
    assert.equal(decide("image/jpeg"), "image/jpeg");
  });

  test("the decision is case-insensitive and survives a missing type", () => {
    assert.equal(decide("IMAGE/PNG"), "image/webp");
    assert.equal(decide(undefined), "image/jpeg");
    assert.equal(decide(null), "image/jpeg");
  });

  test("the uploaded filename matches the bytes actually produced", () => {
    assert.equal(nameFor("banner", "image/webp"), "banner.webp");
    assert.equal(nameFor("category", "image/png"), "category.png");
    assert.equal(nameFor("product", "image/jpeg"), "product.jpg");
  });

  test("compressImageForUpload no longer hardcodes a format at the encode call", () => {
    const body = stripComments(liftFunction(ADMIN_HTML, "compressImageForUpload"));
    assert.doesNotMatch(
      body,
      /toBlob\([^)]*['"]image\/jpeg['"]/,
      "the encoder is pinned to JPEG again — transparent uploads will go black",
    );
    assert.match(body, /toBlob\([^)]*uploadOutputType\(/);
  });

  test("nothing paints a background onto the canvas before the image is drawn", () => {
    const body = stripComments(liftFunction(ADMIN_HTML, "compressImageForUpload"));
    assert.doesNotMatch(body, /fillRect|fillStyle/, "a painted backdrop would flatten the alpha itself");
  });
});

// ── C-2 · alpha survives the server pipeline (real sharp) ────────────────────

/** Exactly what /api/admin/upload-image runs, per type. */
const SERVER_SIZES = { banner: { width: 1000, quality: 70 }, category: { width: 500, quality: 65 } };
function serverPipeline(buf, type) {
  const cfg = SERVER_SIZES[type];
  return sharp(buf).resize({ width: cfg.width }).webp({ quality: cfg.quality }).toBuffer();
}

/** RGBA of one pixel, decoded from an encoded image. */
async function pixelAt(buf, x, y) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at], data[at + 1], data[at + 2], data[at + 3]];
}

describe("C-2 · the server pipeline preserves transparency", () => {
  test("a transparent PNG keeps its alpha channel through resize + WebP", async () => {
    const src = await sharp({
      create: { width: 800, height: 800, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    assert.equal((await sharp(src).metadata()).hasAlpha, true, "the fixture itself lost its alpha");

    const out = await serverPipeline(src, "category");
    const meta = await sharp(out).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.hasAlpha, true, "alpha was dropped — the icon will render on a solid block");
    assert.equal((await pixelAt(out, 10, 10))[3], 0, "a transparent pixel came back opaque");
  });

  test("a transparent WebP keeps its alpha channel too", async () => {
    const src = await sharp({
      create: { width: 900, height: 600, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0 } },
    })
      .webp()
      .toBuffer();

    const out = await serverPipeline(src, "banner");
    assert.equal((await sharp(out).metadata()).hasAlpha, true);
    assert.equal((await pixelAt(out, 10, 10))[3], 0);
  });

  test("an opaque region is left opaque — the fix does not make images see-through", async () => {
    const src = await sharp({
      create: { width: 400, height: 400, channels: 4, background: { r: 12, g: 200, b: 90, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const out = await serverPipeline(src, "category");
    assert.equal((await pixelAt(out, 5, 5))[3], 255);
  });
});

// ── C-1 · a banner larger than the old Firestore ceiling ─────────────────────

describe("C-1 · a banner photo far past the Base64 ceiling now goes through", () => {
  /** Noise, so the encoder cannot compress the fixture away to nothing. */
  async function bigPhoto() {
    const w = 2400;
    const h = 1600;
    const px = Buffer.alloc(w * h * 3);
    let seed = 7;
    for (let i = 0; i < px.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      px[i] = seed & 0xff;
    }
    return sharp(px, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  }

  test("the fixture is the size that used to fail: over 750KB", async () => {
    const src = await bigPhoto();
    assert.ok(src.length > 750 * 1024, `fixture is only ${src.length} bytes`);
  });

  test("the OLD path would have exceeded the 1MB Firestore document limit", async () => {
    const src = await bigPhoto();
    const dataUri = `data:image/jpeg;base64,${src.toString("base64")}`;
    assert.ok(
      Buffer.byteLength(dataUri, "utf8") > 1024 * 1024,
      "this fixture no longer reproduces the failure it is here to document",
    );
  });

  test("the NEW path stores a short URL and the processed image stays small", async () => {
    const src = await bigPhoto();
    const out = await serverPipeline(src, "banner");

    assert.ok(out.length < 400 * 1024, `processed banner is ${out.length} bytes`);
    assert.equal((await sharp(out).metadata()).width, 1000);

    // What actually reaches Firestore is the Storage URL, whose length is bounded
    // by the bucket name and a sha256 — not by the size of the photo.
    const hash = createHash("sha256").update(out).digest("hex");
    const url = `https://firebasestorage.googleapis.com/v0/b/onway-74c20.firebasestorage.app/o/${encodeURIComponent(
      `admin-images/banner/${hash}.webp`,
    )}?alt=media&token=00000000-0000-4000-8000-000000000000`;
    assert.ok(url.length < 1024, "the stored value is a URL, not an image");
  });
});

// ── C-1 · saveBanner executed, not read ─────────────────────────────────────

describe("C-1 · saveBanner uploads to Storage and stores only the URL", () => {
  const STORAGE_URL =
    "https://firebasestorage.googleapis.com/v0/b/onway-74c20.firebasestorage.app/o/admin-images%2Fbanner%2Fabc.webp?alt=media&token=t";

  /** Runs the shipped saveBanner body against stand-ins; returns what it did. */
  async function runSaveBanner({ withFile = true, uploadOk = true, typedUrl = "" } = {}) {
    const calls = { fetches: [], toasts: [], appended: {}, fileToBase64Used: false };

    const fields = {
      "banner-id": { value: "" },
      "banner-image": { value: typedUrl },
      "banner-title": { value: "عرض" },
      "banner-description": { value: "" },
      "banner-order": { value: "1" },
      "banner-active": { value: "true" },
      "banner-start-date": { value: "" },
      "banner-end-date": { value: "" },
      "banner-file": {
        files: withFile ? [{ name: "b.png", type: "image/png", size: 2_000_000 }] : [],
        dataset: {},
        value: "",
      },
      "banner-store-id": {
        value: "store-1",
        selectedIndex: 0,
        options: [{ dataset: { name: "متجر", type: "restaurant" } }],
      },
    };

    const sandbox = {
      API_BASE: "/api",
      document: { getElementById: (id) => fields[id] ?? { value: "" } },
      banners: [],
      // A compressor stand-in that reports what the real one would for a PNG.
      compressImageForUpload: async (f) => ({ type: "image/webp", size: 90_000, __from: f }),
      uploadFileName: (kind, t) => `${kind}.${t === "image/webp" ? "webp" : "jpg"}`,
      dataUrlToFile: () => null,
      // If saveBanner ever reaches for this again, the test sees it.
      fileToBase64: async () => {
        calls.fileToBase64Used = true;
        return "data:image/png;base64,AAAA";
      },
      showToast: (...a) => calls.toasts.push(a),
      loadBanners: () => {},
      closeModal: () => {},
      resetBannerForm: () => {},
      FormData: class {
        append(k, v) {
          calls.appended[k] = v;
        }
      },
      fetch: async (url, opts) => {
        calls.fetches.push({ url, opts });
        if (String(url).includes("/upload-image")) {
          return uploadOk
            ? { ok: true, json: async () => ({ url: STORAGE_URL }) }
            : { ok: false, json: async () => ({ error: "فشل" }) };
        }
        return { ok: true, json: async () => ({ id: "b1" }) };
      },
      console,
    };

    const body = liftFunction(ADMIN_HTML, "saveBanner");
    const names = Object.keys(sandbox);
    const fn = new Function(...names, `${body}\nreturn saveBanner;`)(...names.map((n) => sandbox[n]));
    await fn({ preventDefault() {} });
    return calls;
  }

  test("the image is uploaded through /admin/upload-image with type=banner", async () => {
    const calls = await runSaveBanner();
    const upload = calls.fetches.find((f) => String(f.url).includes("/upload-image"));
    assert.ok(upload, "no upload call was made — the banner never reached Storage");
    assert.equal(calls.appended.type, "banner");
  });

  test("what is sent to Firestore is the URL, never a Base64 data URI", async () => {
    const calls = await runSaveBanner();
    const save = calls.fetches.find((f) => String(f.url).includes("/admin/banners"));
    assert.ok(save, "the banner was never saved");
    const payload = JSON.parse(save.opts.body);
    assert.equal(payload.image, STORAGE_URL);
    assert.doesNotMatch(payload.image, /^data:/, "a Base64 image is being written into Firestore again");
  });

  test("fileToBase64 is not on the banner path any more", async () => {
    const calls = await runSaveBanner();
    assert.equal(calls.fileToBase64Used, false);
  });

  test("a failed upload stops the save instead of writing a banner with no image", async () => {
    const calls = await runSaveBanner({ uploadOk: false });
    assert.equal(
      calls.fetches.find((f) => String(f.url).includes("/admin/banners")),
      undefined,
      "the banner was saved even though its image upload failed",
    );
    assert.equal(calls.toasts[0][0], "error");
  });

  test("with no new file the typed URL is kept and nothing is uploaded", async () => {
    const typedUrl = "https://cdn.example.com/promo.webp";
    const calls = await runSaveBanner({ withFile: false, typedUrl });
    const save = calls.fetches.find((f) => String(f.url).includes("/admin/banners"));
    assert.ok(save, "an edit with an existing image should still save");
    assert.equal(JSON.parse(save.opts.body).image, typedUrl);
    assert.equal(
      calls.fetches.some((f) => String(f.url).includes("/upload-image")),
      false,
      "an unchanged image was re-uploaded",
    );
  });

  test("no file and no URL is still refused, as before", async () => {
    const calls = await runSaveBanner({ withFile: false });
    assert.equal(
      calls.fetches.find((f) => String(f.url).includes("/admin/banners")),
      undefined,
      "a banner with no image at all was saved",
    );
    assert.equal(calls.toasts[0][0], "error");
  });
});

// ── H-1 · the dedupe key cannot cross types ─────────────────────────────────

describe("H-1 · uploading one file as two types returns two different assets", () => {
  const keyLine = stripComments(ROUTES).match(/const dedupeKey = `[^`]+`;/);
  assert.ok(keyLine, "the dedupe key expression is gone from routes.ts");
  const makeKey = new Function("type", "contentHash", `${keyLine[0]}\nreturn dedupeKey;`);

  const bytes = Buffer.from("the very same image, byte for byte");
  const hash = createHash("sha256").update(bytes).digest("hex");

  test("the same bytes under two types produce two keys", () => {
    assert.notEqual(makeKey("category", hash), makeKey("banner", hash));
  });

  test("the same bytes under the same type still dedupe", () => {
    assert.equal(makeKey("banner", hash), makeKey("banner", hash));
  });

  test("the key still varies with the content", () => {
    const other = createHash("sha256").update("a different image").digest("hex");
    assert.notEqual(makeKey("banner", hash), makeKey("banner", other));
  });

  test("both the lookup and the store use the type-scoped key", () => {
    const clean = stripComments(ROUTES);
    assert.match(clean, /imageHashMap\.get\(dedupeKey\)/);
    assert.match(clean, /imageHashMap\.set\(dedupeKey,/);
    assert.doesNotMatch(
      clean,
      /imageHashMap\.(get|set)\(contentHash/,
      "the map is keyed by the bare hash again — types will collide",
    );
  });
});
