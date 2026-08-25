/**
 * M-3B — the fourteen category icons must stay uniform.
 *
 * They were all 1024x1024 transparent PNGs, so they looked consistent as files.
 * What differed was the DRAWING inside each canvas: it occupied between 54% and
 * 92% of the frame, so `contentFit: "contain"` — which fits the canvas, not the
 * drawing — rendered icons at anywhere from 38px to 64px inside the same 70px box.
 * "coffee" was worse than small: 544px of empty space above the drawing and 161px
 * below it, so it sat 383px low in its own canvas.
 *
 * The assets were re-exported: each drawing cropped to its bounding box, scaled
 * UNIFORMLY so its longer side reaches 85% of the canvas, and composited back
 * centred onto a fresh transparent 1024x1024. Nothing was stretched, recoloured or
 * redrawn.
 *
 * These are file-shape rules, not taste. They fail if someone drops in an icon that
 * would reintroduce the inconsistency — including a JPEG-flattened one with a baked
 * white or black background, which is what C-2 was about.
 *
 * Run:  node --test tests/unit/category-asset-rules.test.mjs
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(root, "assets/seed");
const CANVAS = 1024;
const TARGET_FILL = 0.85;
const FILL_TOLERANCE = 0.03; // ±3 percentage points
const CENTRE_TOLERANCE = 6; // px of asymmetry between opposing margins
const ALPHA_THRESHOLD = 8;

const files = readdirSync(DIR).filter((f) => /^category-.*\.png$/.test(f)).sort();

/** Alpha-derived geometry of the drawing inside a canvas. */
async function geometry(file) {
  const path = join(DIR, file);
  const meta = await sharp(path).metadata();
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * C + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const alphaAt = (x, y) => data[(y * W + x) * C + 3];
  return {
    meta, W, H, bw, bh,
    fill: Math.max(bw, bh) / W,
    offX: Math.abs(minX - (W - 1 - maxX)),
    offY: Math.abs(minY - (H - 1 - maxY)),
    corners: [alphaAt(1, 1), alphaAt(W - 2, 1), alphaAt(1, H - 2), alphaAt(W - 2, H - 2)],
  };
}

const geo = new Map();
before(async () => {
  for (const f of files) geo.set(f, await geometry(f));
});

describe("M-3B · the category icon set is complete", () => {
  test("all fourteen icons are present", () => {
    assert.equal(files.length, 14, `found ${files.length}: ${files.join(", ")}`);
  });

  test("every icon a category references exists on disk", () => {
    const routes = readFileSync(join(root, "server/routes.ts"), "utf8");
    const referenced = [...routes.matchAll(/\/assets\/seed\/(category-[\w-]+\.png)/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, "no category images referenced from routes.ts");
    for (const r of new Set(referenced)) {
      assert.ok(files.includes(r), `${r} is referenced but missing from assets/seed/`);
    }
  });
});

describe("M-3B · file shape", () => {
  for (const f of files) {
    test(`${f} is a 1024x1024 PNG with an alpha channel`, () => {
      const g = geo.get(f);
      assert.equal(g.meta.format, "png");
      assert.equal(g.W, CANVAS);
      assert.equal(g.H, CANVAS);
      assert.equal(g.meta.hasAlpha, true);
      assert.equal(g.meta.channels, 4);
    });

    test(`${f} has no baked background — every corner is fully transparent`, () => {
      const g = geo.get(f);
      assert.deepEqual(
        g.corners,
        [0, 0, 0, 0],
        "a corner is opaque: this is the JPEG-flattening C-2 fixed, or a white plate",
      );
    });
  }
});

describe("M-3B · the drawing is uniform and centred", () => {
  for (const f of files) {
    test(`${f} fills ${(TARGET_FILL * 100).toFixed(0)}% of the canvas on its longer side`, () => {
      const g = geo.get(f);
      assert.ok(
        Math.abs(g.fill - TARGET_FILL) <= FILL_TOLERANCE,
        `fill is ${(g.fill * 100).toFixed(1)}%, outside ${((TARGET_FILL - FILL_TOLERANCE) * 100).toFixed(0)}–${((TARGET_FILL + FILL_TOLERANCE) * 100).toFixed(0)}%`,
      );
    });

    test(`${f} is centred on both axes`, () => {
      const g = geo.get(f);
      assert.ok(g.offX <= CENTRE_TOLERANCE, `horizontal margins differ by ${g.offX}px`);
      assert.ok(g.offY <= CENTRE_TOLERANCE, `vertical margins differ by ${g.offY}px`);
    });
  }

  test("the whole set renders within a narrow size band", () => {
    const fills = files.map((f) => geo.get(f).fill);
    const spread = Math.max(...fills) / Math.min(...fills);
    assert.ok(spread <= 1.1, `icons still vary by ${spread.toFixed(2)}x — they varied 1.71x before M-3B`);
  });

  test("no icon sits low or high in its canvas the way coffee did", () => {
    // coffee had 544px above the drawing and 161px below: a 383px offset.
    const worst = Math.max(...files.map((f) => geo.get(f).offY));
    assert.ok(worst <= CENTRE_TOLERANCE, `worst vertical offset is ${worst}px`);
  });
});

describe("M-3B · shapes that scaling cannot equalise are recorded, not distorted", () => {
  // Three drawings are inherently non-square. They are normalised to the same
  // longer-side extent as the rest and left otherwise untouched — forcing them
  // square would mean stretching the artwork, which M-3B explicitly refuses.
  const EXPECTED_NON_SQUARE = { "category-snacks.png": "tall", "category-coffee.png": "wide", "category-delivery.png": "wide" };

  test("the known non-square icons are exactly the ones documented", () => {
    const found = {};
    for (const f of files) {
      const g = geo.get(f);
      const ar = g.bw / g.bh;
      if (ar > 1.3) found[f] = "wide";
      else if (ar < 0.77) found[f] = "tall";
    }
    assert.deepEqual(found, EXPECTED_NON_SQUARE);
  });

  test("even the non-square icons match the set on their longer side", () => {
    for (const f of Object.keys(EXPECTED_NON_SQUARE)) {
      const g = geo.get(f);
      assert.ok(Math.abs(g.fill - TARGET_FILL) <= FILL_TOLERANCE, `${f} fill ${(g.fill * 100).toFixed(1)}%`);
    }
  });
});
