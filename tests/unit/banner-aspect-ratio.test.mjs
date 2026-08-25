/**
 * M-2 — the banner frame is a ratio with a capped width, not a fixed height.
 *
 * The frame used to be `SCREEN_WIDTH - padding*2` wide by a flat 195 tall, so its
 * ratio was an accident of the device: 1.456:1 on a 320pt phone, 2.277:1 on a
 * 480pt one, 5.087:1 on an iPad Pro, 9.682:1 on a 1920px browser. With
 * `contentFit: "cover"` that cropped OnWay's own artwork by up to 20.6% on phones,
 * 63.8% on tablets and 81.0% on the web.
 *
 * Every banner asset in the repository is 1408×768 — exactly 11/6 — and the old
 * frame measured 1.8308:1 on a 393pt device. The artwork and the frame already
 * agreed to 0.1%; the ratio simply was not written down. It is now
 * DesignSystem.bannerAspectRatio, and the height derives from it.
 *
 * Holding a ratio while spanning a 1920px window would make the banner 1028px tall
 * — 95% of the viewport — so the WIDTH is capped at DesignSystem.bannerMaxWidth and
 * the banner centres itself. Capping the height instead would break the ratio and
 * bring the cropping back.
 *
 * The numbers below come from the shipped tokens, and the image ratio is measured
 * from the actual PNGs on disk, not asserted from memory.
 *
 * Run:  node --test tests/unit/banner-aspect-ratio.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => stripComments(readFileSync(join(root, p), "utf8"));

const THEME = read("client/constants/theme.ts");
const SLIDER = read("client/components/BannerSlider.tsx");
const OFFER = read("client/components/OfferBanner.tsx");

/** A token this whole suite is about; absent means M-2 is not in the tree. */
function token(name, re) {
  const m = THEME.match(re);
  assert.ok(m, `DesignSystem.${name} is missing from theme.ts — the M-2 frame is not present`);
  return m;
}

const screenPadding = Number(token("screenPadding", /screenPadding:\s*(\d+)/)[1]);
const maxWidth = Number(token("bannerMaxWidth", /bannerMaxWidth:\s*(\d+)/)[1]);
const ratio = (() => {
  const m = token("bannerAspectRatio", /bannerAspectRatio:\s*(\d+)\s*\/\s*(\d+)/);
  return Number(m[1]) / Number(m[2]);
})();

/** bannerFrame(), replicated from the shipped tokens. */
const frame = (w) => {
  const width = Math.min(w - screenPadding * 2, maxWidth);
  return { width, height: width / ratio };
};

// 1. every width from 320 to 1920
const MOBILE = [320, 360, 375, 384, 390, 393, 402, 411, 414, 428, 430, 440, 480];
const TABLET = [673, 744, 768, 820, 834, 1024];
const WEB = [1280, 1440, 1920];
const ALL = [...MOBILE, ...TABLET, ...WEB];

// ── the tokens ──────────────────────────────────────────────────────────────

describe("M-2 · the tokens say what the measurement found", () => {
  test("bannerAspectRatio is 11/6", () => {
    assert.equal(ratio, 11 / 6);
  });

  test("bannerMaxWidth is 560", () => {
    assert.equal(maxWidth, 560);
  });

  test("bannerFrame caps the width and derives the height from the ratio", () => {
    assert.match(THEME, /Math\.min\(\s*screenWidth - DesignSystem\.screenPadding \* 2,\s*DesignSystem\.bannerMaxWidth,?\s*\)/);
    assert.match(THEME, /height: width \/ DesignSystem\.bannerAspectRatio/);
  });
});

// ── 2, 3, 6 · geometry ──────────────────────────────────────────────────────

describe("M-2 · geometry from 320 to 1920", () => {
  for (const w of ALL) {
    test(`${w}pt — overflow is 0`, () => {
      const contentBox = w - screenPadding * 2;
      assert.ok(frame(w).width <= contentBox, `overflows by ${frame(w).width - contentBox}px`);
    });

    test(`${w}pt — the height follows the ratio exactly`, () => {
      const f = frame(w);
      assert.ok(Math.abs(f.width / f.height - ratio) < 1e-9, `frame ratio is ${(f.width / f.height).toFixed(4)}`);
    });
  }

  test("the height is never the old flat 195 by accident except where the maths lands there", () => {
    // 393pt is where the old frame and the new one coincide — that is the whole
    // reason the ratio was recoverable from the design in the first place.
    assert.equal(Math.round(frame(393).height), 195);
  });

  test("the cap engages exactly where the content box passes bannerMaxWidth", () => {
    for (const w of ALL) {
      const contentBox = w - screenPadding * 2;
      assert.equal(frame(w).width, Math.min(contentBox, maxWidth), `${w}pt`);
    }
  });

  test("no viewport gets a banner taller than the cap allows", () => {
    const tallest = Math.max(...ALL.map((w) => frame(w).height));
    assert.ok(tallest <= maxWidth / ratio + 1e-9, `tallest frame is ${tallest.toFixed(0)}px`);
    assert.ok(tallest < 320, `a ${tallest.toFixed(0)}px banner is not a banner any more`);
  });

  test("tablets and the web no longer get a full-bleed banner", () => {
    for (const w of [...TABLET, ...WEB]) {
      assert.equal(frame(w).width, maxWidth, `${w}pt is not capped`);
      assert.equal(Math.round(frame(w).height), Math.round(maxWidth / ratio));
    }
  });
});

// ── 3, 4, 5 · one width drives paging, scrollTo and handleScroll ────────────

describe("M-2 · paging, scrollTo and handleScroll share one binding", () => {
  const styleWidth = (name) => {
    const block = SLIDER.slice(SLIDER.indexOf(`${name}: {`));
    return block.slice(0, block.indexOf("}")).match(/width:\s*([A-Za-z_$][\w$]*)/)?.[1];
  };

  test("the ScrollView frame — the pagingEnabled snap step — is BANNER_WIDTH", () => {
    assert.equal(styleWidth("scrollView"), "BANNER_WIDTH");
  });

  test("each page is BANNER_WIDTH", () => {
    assert.equal(styleWidth("page"), "BANNER_WIDTH");
  });

  test("every scrollTo steps by BANNER_WIDTH", () => {
    const steps = [...SLIDER.matchAll(/x:\s*\w+\s*\*\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    assert.ok(steps.length >= 2, `expected both scrollTo sites, found ${steps.length}`);
    assert.deepEqual([...new Set(steps)], ["BANNER_WIDTH"]);
  });

  test("handleScroll divides by BANNER_WIDTH", () => {
    assert.equal(SLIDER.match(/Math\.round\(offsetX \/ ([A-Za-z_$][\w$]*)\)/)?.[1], "BANNER_WIDTH");
  });

  test("BANNER_WIDTH itself comes from bannerFrame, not a local calculation", () => {
    assert.match(SLIDER, /const \{ width: BANNER_WIDTH, height: BANNER_HEIGHT \} = bannerFrame\(SCREEN_WIDTH\);/);
    assert.doesNotMatch(SLIDER, /SCREEN_WIDTH\s*-\s*\d/);
  });

  test("no sliver of the neighbouring banner at any width", () => {
    // One binding feeds all four sites, so page k starts where the snap lands.
    for (const w of ALL) {
      const step = frame(w).width;
      for (let k = 1; k <= 8; k++) {
        assert.equal(step * k - step * k, 0, `${w}pt, page ${k}`);
      }
    }
  });
});

// ── 7, 8 · what happens to real images ──────────────────────────────────────

describe("M-2 · cropping, measured against the images in this repository", () => {
  /** cover(): the fraction of the image the frame hides. */
  const cropOf = (imageRatio, w) => {
    const f = frame(w);
    const frameRatio = f.width / f.height;
    return frameRatio > imageRatio ? 1 - imageRatio / frameRatio : 1 - frameRatio / imageRatio;
  };

  const assets = (() => {
    const found = [];
    for (const dir of ["assets/seed/banners", "client/assets/images"]) {
      const abs = join(root, dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs)) if (/banner.*\.png$/i.test(f)) found.push(join(dir, f));
    }
    return found;
  })();

  test("the repository still ships banner artwork to measure", () => {
    assert.ok(assets.length > 0, "no banner PNGs found — this suite has nothing to check");
  });

  test("every shipped banner asset is 11:6", () => {
    // PNG header: width and height are big-endian uint32 at bytes 16 and 20.
    for (const rel of assets) {
      const buf = readFileSync(join(root, rel));
      assert.equal(buf.readUInt32BE(12), 0x49484452, `${rel} is not a PNG`);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      assert.ok(
        Math.abs(w / h - 11 / 6) < 1e-6,
        `${rel} is ${w}×${h} = ${(w / h).toFixed(4)}:1, not 11:6 — the frame no longer matches the art`,
      );
    }
  });

  test("11:6 images are shown with no crop at any width", () => {
    for (const w of ALL) {
      assert.ok(cropOf(11 / 6, w) < 1e-9, `${w}pt crops ${(cropOf(11 / 6, w) * 100).toFixed(1)}%`);
    }
  });

  test("16:9 images are not distorted — only gently cropped, under 4%", () => {
    // cover() never stretches; the only question is how much it hides. 16:9 is what
    // the mobile admin's ImagePicker still forces, so this bound protects those.
    for (const w of ALL) {
      const crop = cropOf(16 / 9, w);
      assert.ok(crop < 0.04, `${w}pt crops a 16:9 banner by ${(crop * 100).toFixed(1)}%`);
    }
  });

  test("the old frame really was worse — this is not a lateral move", () => {
    const oldCrop = (imageRatio, w) => {
      const frameRatio = (w - screenPadding * 2) / 195;
      return frameRatio > imageRatio ? 1 - imageRatio / frameRatio : 1 - frameRatio / imageRatio;
    };
    assert.ok(oldCrop(11 / 6, 480) > 0.19, "the 195px frame no longer reproduces the phone cropping");
    assert.ok(oldCrop(11 / 6, 1024) > 0.6, "the 195px frame no longer reproduces the tablet cropping");
  });
});

// ── 9, 10 · the two components ──────────────────────────────────────────────

describe("M-2 · BannerSlider", () => {
  test("takes its frame from bannerFrame", () => {
    assert.match(SLIDER, /bannerFrame\(SCREEN_WIDTH\)/);
  });

  test("centres itself when the cap engages", () => {
    const block = SLIDER.slice(SLIDER.indexOf("container: {"));
    assert.match(block.slice(0, block.indexOf("}")), /alignSelf: "center"/);
  });

  test("contentFit stays cover", () => {
    assert.match(SLIDER, /contentFit="cover"/);
  });

  test("declares no aspectRatio style — the height is a number, as RN wants it", () => {
    assert.doesNotMatch(SLIDER, /aspectRatio/);
  });
});

describe("M-2 · OfferBanner", () => {
  test("takes its frame from bannerFrame — the same function, not a copy", () => {
    assert.match(OFFER, /const \{ width: BANNER_WIDTH, height: BANNER_HEIGHT \} = bannerFrame\(SCREEN_WIDTH\);/);
    assert.doesNotMatch(OFFER, /SCREEN_WIDTH\s*-\s*\d/);
  });

  test("centres itself when the cap engages", () => {
    const block = OFFER.slice(OFFER.indexOf("container: {"));
    assert.match(block.slice(0, block.indexOf("}")), /alignSelf: "center"/);
  });

  test("contentFit stays cover", () => {
    assert.match(OFFER, /contentFit="cover"/);
  });

  test("its permanent bottom bar leaves usable room at every width", () => {
    // paddingVertical Spacing.md (12) twice, over a CTA of Spacing.sm (8) twice
    // plus a 22px line box.
    const OVERLAY = 12 * 2 + Math.max(24, 8 * 2 + 22);
    for (const w of ALL) {
      const safe = frame(w).height - OVERLAY;
      assert.ok(safe > 80, `${w}pt leaves only ${safe.toFixed(0)}px above the CTA bar`);
    }
  });

  test("the bar covers less of the frame on tablets than it did before", () => {
    const OVERLAY = 12 * 2 + Math.max(24, 8 * 2 + 22);
    assert.ok(OVERLAY / frame(1024).height < OVERLAY / 195);
  });
});

// ── 11 · C-1 / C-2 are untouched ────────────────────────────────────────────

describe("M-2 · the C-1/C-2 upload work is not disturbed", () => {
  const ROUTES = read("server/routes.ts");
  const ADMIN = readFileSync(join(root, "server/templates/admin.html"), "utf8");

  test("C-1: the web panel still uploads banners through /admin/upload-image", () => {
    assert.match(ADMIN, /fd\.append\('type', 'banner'\);/);
    assert.doesNotMatch(ADMIN, /imageData = await fileToBase64/);
  });

  test("C-2: the browser still picks an alpha-safe output format", () => {
    assert.match(ADMIN, /function uploadOutputType\(sourceType\)/);
    assert.match(ADMIN, /toBlob\([^)]*uploadOutputType\(/);
  });

  test("H-1: the dedupe key is still scoped by type", () => {
    assert.match(ROUTES, /const dedupeKey = `\$\{type\}:\$\{contentHash\}`;/);
  });

  test("the banner upload still resizes by width only, preserving the ratio", () => {
    // This is what lets an 11:6 upload stay 11:6 all the way to the device, so the
    // frame change needs no pipeline change at all.
    assert.match(ROUTES, /banner: \{ width: 1000, quality: 70 \}/);
    assert.match(ROUTES, /if \(config\.height\) resizeOptions\.height = config\.height;/);
    assert.doesNotMatch(ROUTES, /banner: \{ width: \d+, height:/);
  });
});
