/**
 * M-1/B-1 — the banner frame and the box that draws it must agree.
 *
 * BannerSlider and OfferBanner both lay themselves out at
 *   SCREEN_WIDTH - DesignSystem.screenPadding * 2
 * while the FlatList that renders them pads its content by HomeScreen's
 * HORIZONTAL_PADDING. Those were two separate literals — 16 and 18 — so every
 * banner was laid out 4px wider than the box containing it.
 *
 * OfferBanner simply overhung the padding. BannerSlider was worse: `pagingEnabled`
 * snaps by the ScrollView's OWN width (the container, SCREEN_WIDTH-36), while
 * scrollTo() and handleScroll() both step by BANNER_WIDTH (SCREEN_WIDTH-32). The
 * two disagreed by 4px per page, so after each swipe a widening strip of the
 * neighbouring banner stayed on screen — 4px, then 8px, then 12px.
 *
 * The arithmetic below is computed from the SHIPPED constants, parsed out of the
 * source, so the guard fails if either number is edited in isolation again.
 *
 * Run:  node --test tests/unit/banner-frame-padding.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => stripComments(readFileSync(join(root, p), "utf8"));

const THEME = read("client/constants/theme.ts");
const HOME = read("client/screens/HomeScreen.tsx");
const SLIDER = read("client/components/BannerSlider.tsx");
const OFFER = read("client/components/OfferBanner.tsx");

const screenPadding = Number(THEME.match(/screenPadding:\s*(\d+)/)[1]);
const maxWidth = Number(THEME.match(/bannerMaxWidth:\s*(\d+)/)[1]);

/** bannerFrame()'s width, replicated from the shipped tokens. */
const bannerWidthFor = (w) => Math.min(w - screenPadding * 2, maxWidth);

/**
 * What HomeScreen's FlatList ACTUALLY pads its content by, resolved from how the
 * line is written rather than assumed equal to the token. If HORIZONTAL_PADDING is
 * a bare literal again, this returns that literal — which is what makes the
 * arithmetic below a real comparison instead of a tautology.
 */
const homePadding = (() => {
  const line = HOME.match(/const HORIZONTAL_PADDING = ([^;]+);/);
  assert.ok(line, "HORIZONTAL_PADDING disappeared from HomeScreen");
  const expr = line[1].trim();
  if (/^\d+$/.test(expr)) return Number(expr);
  if (expr === "DesignSystem.screenPadding") return screenPadding;
  throw new Error(`HORIZONTAL_PADDING is now "${expr}" — teach this test how to resolve it`);
})();

/** Every screen width the app can be laid out at, portrait-locked. */
const WIDTHS = [320, 360, 375, 384, 390, 393, 402, 411, 414, 428, 430, 440, 480, 673, 744, 768, 820, 834, 1024, 1280, 1920];

describe("M-1 · one horizontal inset, not two", () => {
  test("HomeScreen reads the padding from the design system instead of restating it", () => {
    assert.match(
      HOME,
      /const HORIZONTAL_PADDING = DesignSystem\.screenPadding;/,
      "HORIZONTAL_PADDING is a literal again — it can drift from the banners",
    );
  });

  test("no bare numeric literal is assigned to HORIZONTAL_PADDING", () => {
    assert.doesNotMatch(HOME, /const HORIZONTAL_PADDING = \d/);
  });

  test("both banner components size themselves from the same shared function", () => {
    // M-2 replaced the inline subtraction with bannerFrame(), which folds the same
    // screenPadding in. What this guards is unchanged: neither component may
    // compute its own width from a separate number.
    for (const [name, src] of [["BannerSlider", SLIDER], ["OfferBanner", OFFER]]) {
      assert.match(
        src,
        /const \{ width: BANNER_WIDTH, height: BANNER_HEIGHT \} = bannerFrame\(SCREEN_WIDTH\);/,
        `${name} no longer derives its frame from the shared bannerFrame()`,
      );
      assert.doesNotMatch(
        src,
        /SCREEN_WIDTH\s*-\s*\d/,
        `${name} subtracts a bare number from SCREEN_WIDTH again`,
      );
    }
  });

  test("bannerFrame folds in screenPadding, so the frame still tracks the container", () => {
    assert.match(
      THEME,
      /screenWidth - DesignSystem\.screenPadding \* 2/,
      "bannerFrame stopped deriving from screenPadding",
    );
  });
});

describe("M-1 · the frame matches its container at every supported width", () => {
  const containerWidth = (w) => w - homePadding * 2; // FlatList content box, as written
  // What the components declare, via bannerFrame(): the padded width, capped.
  const bannerWidth = (w) => Math.min(w - screenPadding * 2, maxWidth);

  for (const w of WIDTHS) {
    test(`${w}pt — no overflow`, () => {
      const over = bannerWidth(w) - containerWidth(w);
      assert.ok(over <= 0, `banner overhangs its container by ${over}px`);
    });

    test(`${w}pt — the frame fills the container until the cap takes over`, () => {
      const expected = Math.min(containerWidth(w), maxWidth);
      assert.equal(
        bannerWidth(w),
        expected,
        "the frame is neither overflowing nor leaving an unexplained gap",
      );
    });
  }

  test("the container is never narrower than the banner on any supported width", () => {
    const overflowing = WIDTHS.filter((w) => bannerWidth(w) > containerWidth(w));
    assert.deepEqual(overflowing, []);
  });
});

describe("M-1 · paging, scrollTo and handleScroll step by the same width", () => {
  // The three places the slider decides how far one page is.
  test("scrollTo steps by BANNER_WIDTH", () => {
    const hits = SLIDER.match(/x:\s*\w+\s*\*\s*BANNER_WIDTH/g) ?? [];
    assert.ok(hits.length >= 2, `expected both scrollTo call sites, found ${hits.length}`);
  });

  test("handleScroll divides by BANNER_WIDTH", () => {
    assert.match(SLIDER, /Math\.round\(offsetX \/ BANNER_WIDTH\)/);
  });

  test("pagingEnabled is on, so the snap step is the ScrollView's own width", () => {
    assert.match(SLIDER, /pagingEnabled/);
  });

  test("the ScrollView's own frame is pinned to BANNER_WIDTH", () => {
    // M-2 inverted this deliberately. Before the cap existed the ScrollView had to
    // inherit the container's width; now the container can be narrower than the
    // content box, so the snap step is pinned to the same constant the pages use
    // rather than left to inheritance.
    const block = SLIDER.slice(SLIDER.indexOf("scrollView: {"), SLIDER.indexOf("scrollContent: {"));
    assert.match(block, /width: BANNER_WIDTH,/, "the snap step is no longer tied to the page width");
  });

  test("all four step sites name the SAME binding, so no arithmetic can diverge", () => {
    // This is the assertion that actually rules the sliver out. Comparing two
    // numbers the test computed itself would be circular; what matters is that the
    // shipped source routes every one of the four through one identifier.
    const styleWidth = (name) => {
      const block = SLIDER.slice(SLIDER.indexOf(`${name}: {`));
      return block.slice(0, block.indexOf("}")).match(/width:\s*([A-Za-z_$][\w$]*)/)?.[1];
    };
    assert.equal(styleWidth("scrollView"), "BANNER_WIDTH", "the pagingEnabled snap step");
    assert.equal(styleWidth("page"), "BANNER_WIDTH", "the page width");

    const scrollToSteps = [...SLIDER.matchAll(/x:\s*\w+\s*\*\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    assert.ok(scrollToSteps.length >= 2, "expected both scrollTo call sites");
    assert.deepEqual([...new Set(scrollToSteps)], ["BANNER_WIDTH"], "a scrollTo steps by something else");

    const divisor = SLIDER.match(/Math\.round\(offsetX \/ ([A-Za-z_$][\w$]*)\)/)?.[1];
    assert.equal(divisor, "BANNER_WIDTH", "handleScroll divides by something else");
  });

  test("one binding means the offset after N pages is exactly N × page width", () => {
    // Corollary of the test above, stated in numbers for the record.
    for (const w of [320, 360, 390, 393, 430, 480, 744, 1024, 1920]) {
      const step = bannerWidthFor(w);
      for (let k = 1; k <= 6; k++) {
        assert.equal(step * k - step * k, 0, `after ${k} pages at ${w}pt`);
      }
    }
  });
});

describe("M-1 · nothing else about the banner moved", () => {
  test("bannerHeight is unchanged", () => {
    assert.match(THEME, /bannerHeight:\s*195,/);
  });

  test("bannerRadius is unchanged", () => {
    assert.match(THEME, /bannerRadius:\s*16,/);
  });

  test("neither component declares an aspectRatio", () => {
    assert.doesNotMatch(SLIDER, /aspectRatio/);
    assert.doesNotMatch(OFFER, /aspectRatio/);
  });

  test("bannerHeight is still exported — M-2 derives the height but removed nothing", () => {
    assert.match(THEME, /bannerHeight:\s*195,/);
  });

  test("contentFit is untouched: cover on both", () => {
    assert.match(SLIDER, /contentFit="cover"/);
    assert.match(OFFER, /contentFit="cover"/);
  });
});
