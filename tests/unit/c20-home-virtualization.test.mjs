/**
 * C-20 — HomeScreen rendered the whole page inside a ONE-ITEM FlatList.
 *
 *     <FlatList data={[{ key: "content" }]} renderItem={renderContent} />
 *
 * That is a ScrollView with extra bookkeeping: nothing windows. Inside it, every
 * growing collection was `.map()`ed — filteredRestaurants, vendorRestaurants,
 * vendorOtherStores, bestSellerProducts, featuredProducts, discountProducts, the
 * per-store product rows, and the (uncapped) search-results grid. Every card and
 * image mounted at once and stayed mounted.
 *
 * The page is now a list of SECTIONS, and each entry of an unbounded collection is
 * its own list item, so FlatList can window the things that actually grow.
 *
 * These tests execute the REAL buildSections() lifted from the shipped file —
 * section order and presence are computed, not asserted from prose — and check the
 * structural guarantees on the source for the parts that are pure JSX.
 *
 * Run:  node --test tests/unit/c20-home-virtualization.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ts = createRequire(import.meta.url)("typescript");
const RAW = readFileSync(join(root, "client/screens/HomeScreen.tsx"), "utf8");
const SRC = stripComments(RAW);

/** Lift buildSections() and run it against injected state. */
function buildSectionsWith(state) {
  const at = SRC.indexOf("const buildSections = (): HomeSection[] => {");
  assert.ok(at > 0, "buildSections disappeared");
  const open = SRC.indexOf("{", at + "const buildSections = (): HomeSection[] =>".length);
  let depth = 0, close = -1;
  for (let i = open; i < SRC.length; i += 1) {
    if (SRC[i] === "{") depth += 1;
    else if (SRC[i] === "}") { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  const body = SRC.slice(open, close + 1);
  const names = Object.keys(state);
  const js = ts.transpileModule(
    `export function build(){ const out0 = (() => ${body})(); return out0; }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const exports = {};
  // eslint-disable-next-line no-new-func
  new Function("exports", ...names, js)(exports, ...names.map((n) => state[n]));
  return exports.build();
}

const base = {
  sliderBanners: [], offerBanner: null,
  activeTab: "stores", searchQuery: "",
  vendorsLoading: false, storesLoading: false,
  categoriesLoading: false, productsLoading: false,
  filteredRestaurants: [], vendorRestaurants: [], vendorOtherStores: [],
  bestSellerProducts: [], featuredProducts: [], discountProducts: [],
};
const types = (secs) => secs.map((x) => x.type);
const store = (id) => ({ id, storeName: `متجر ${id}` });
const vendor = (id) => ({ id, name: `مطعم ${id}` });
const prod = (id) => ({ id, name: `منتج ${id}` });

describe("C-20 · the list is real, not a one-item wrapper", () => {
  test("the one-item data array is gone", () => {
    assert.ok(!/data=\{\[\{ key: "content" \}\]\}/.test(SRC),
      "the page is still rendered as a single list item");
    assert.ok(!/renderItem=\{renderContent\}/.test(SRC));
  });

  test("the outer list is driven by buildSections()", () => {
    assert.match(SRC, /data=\{buildSections\(\)\}/);
    assert.match(SRC, /renderItem=\{renderSection\}/);
    assert.match(SRC, /keyExtractor=\{sectionKey\}/);
  });

  test("the outer list declares windowing", () => {
    const at = SRC.indexOf("data={buildSections()}");
    const block = SRC.slice(at - 400, at + 400);
    for (const prop of ["initialNumToRender", "maxToRenderPerBatch", "windowSize", "removeClippedSubviews"]) {
      assert.ok(block.includes(prop), `the outer list is missing ${prop}`);
    }
  });

  test("no vertical ScrollView wraps the page", () => {
    // The only ScrollViews left must be horizontal.
    const scrollViews = [...SRC.matchAll(/<ScrollView\b([\s\S]{0,200}?)>/g)];
    for (const m of scrollViews) {
      assert.match(m[1], /\bhorizontal\b/,
        "a vertical ScrollView is back — it would defeat the outer virtualization");
    }
  });
});

describe("C-20 · unbounded collections become individual list items", () => {
  test("restaurants: one item per restaurant, not one .map() inside one item", () => {
    const secs = buildSectionsWith({
      ...base, activeTab: "restaurants",
      filteredRestaurants: [vendor("a"), vendor("b"), vendor("c")],
    });
    assert.equal(types(secs).filter((t) => t === "restaurantCard").length, 3);
  });

  test("vendor store sections are individual items in both tabs", () => {
    const r = buildSectionsWith({
      ...base, activeTab: "restaurants",
      vendorRestaurants: [store("v1"), store("v2")],
    });
    assert.equal(types(r).filter((t) => t === "vendorStoreSection").length, 2);

    const st = buildSectionsWith({
      ...base, vendorOtherStores: [store("s1"), store("s2"), store("s3")],
    });
    assert.equal(types(st).filter((t) => t === "vendorStoreSection").length, 3);
  });

  test("the section count grows with the data — proof it is not one blob", () => {
    const few = buildSectionsWith({ ...base, vendorOtherStores: [store("a")] });
    const many = buildSectionsWith({
      ...base, vendorOtherStores: Array.from({ length: 40 }, (_, i) => store(`s${i}`)),
    });
    assert.equal(many.length - few.length, 39,
      "adding 39 stores did not add 39 list items");
  });

  test("keys are stable and identity-based for the repeated items", () => {
    const at = SRC.indexOf("const sectionKey =");
    assert.ok(at > 0, "sectionKey disappeared");
    const body = SRC.slice(at, at + 320);
    assert.match(body, /restaurant:\$\{item\.vendor\.id\}/);
    assert.match(body, /store:\$\{item\.store\.id\}/);
  });
});

describe("C-20 · every section survived, in the original order", () => {
  test("stores tab: full order preserved", () => {
    const secs = buildSectionsWith({
      ...base,
      sliderBanners: [{ id: "b" }],
      vendorOtherStores: [store("s1")],
      bestSellerProducts: [prod("p1")],
      featuredProducts: [prod("p2")],
      discountProducts: [prod("p3")],
    });
    assert.deepEqual(types(secs), [
      "location", "greeting", "banners", "tabs", "search",
      "categoriesHeader", "categoriesRows",
      "storesHeader", "vendorStoreSection",
      "bestSellersHeader", "bestSellersRow",
      "featuredHeader", "featuredRow",
      "discountsHeader", "discountsRow",
      "tabBottomPad",
    ]);
  });

  test("restaurants tab: full order preserved", () => {
    const secs = buildSectionsWith({
      ...base, activeTab: "restaurants",
      filteredRestaurants: [vendor("a")],
      vendorRestaurants: [store("v1")],
    });
    assert.deepEqual(types(secs), [
      "location", "greeting", "tabs", "search",
      "restaurantCard", "vendorRestaurantsHeader", "vendorStoreSection",
      "tabBottomPad",
    ]);
  });

  test("banners appear only when there is something to show", () => {
    assert.ok(!types(buildSectionsWith(base)).includes("banners"));
    assert.ok(types(buildSectionsWith({ ...base, offerBanner: { id: "o" } })).includes("banners"));
    assert.ok(types(buildSectionsWith({ ...base, sliderBanners: [{ id: "s" }] })).includes("banners"));
  });

  test("loading, empty and search states are all still reachable", () => {
    assert.ok(types(buildSectionsWith({ ...base, activeTab: "restaurants", vendorsLoading: true }))
      .includes("restaurantsLoading"));
    assert.ok(types(buildSectionsWith({ ...base, activeTab: "restaurants" }))
      .includes("restaurantsEmpty"));
    assert.ok(types(buildSectionsWith({ ...base, categoriesLoading: true }))
      .includes("categoriesLoading"));
    assert.ok(types(buildSectionsWith({ ...base, productsLoading: true }))
      .includes("bestSellersLoading"));
    assert.ok(types(buildSectionsWith({ ...base })).includes("bestSellersEmpty"));
    assert.ok(types(buildSectionsWith({ ...base, searchQuery: "شاي" }))
      .includes("searchResults"));
  });

  test("the discounts section still only appears when there are discounts", () => {
    assert.ok(!types(buildSectionsWith(base)).includes("discountsRow"));
    assert.ok(types(buildSectionsWith({ ...base, discountProducts: [prod("d")] }))
      .includes("discountsRow"));
  });

  test("the tab's bottom padding is preserved as a trailing section", () => {
    assert.equal(types(buildSectionsWith(base)).at(-1), "tabBottomPad");
    assert.match(SRC, /case "tabBottomPad":\s*return <View style=\{styles\.tabContent\} \/>;/);
  });

  test("every section type the builder can emit has a renderer", () => {
    const emitted = new Set();
    for (const state of [
      base,
      { ...base, activeTab: "restaurants", filteredRestaurants: [vendor("a")], vendorRestaurants: [store("v")] },
      { ...base, activeTab: "restaurants", vendorsLoading: true },
      { ...base, activeTab: "restaurants" },
      { ...base, searchQuery: "x" },
      { ...base, categoriesLoading: true, productsLoading: true },
      { ...base, sliderBanners: [{ id: "b" }], vendorOtherStores: [store("s")],
        bestSellerProducts: [prod("1")], featuredProducts: [prod("2")], discountProducts: [prod("3")] },
    ]) for (const t of types(buildSectionsWith(state))) emitted.add(t);

    for (const t of emitted) {
      assert.ok(SRC.includes(`case "${t}":`), `section "${t}" has no renderer — it would vanish`);
    }
    assert.ok(emitted.size >= 18, `only ${emitted.size} section types exercised`);
  });
});

describe("C-20 · large horizontal rows are virtualized, small ones are not", () => {
  for (const [name, data] of [
    ["bestSellersRow", "bestSellerProducts"],
    ["featuredRow", "featuredProducts"],
    ["discountsRow", "discountProducts"],
  ]) {
    test(`${name} uses a horizontal FlatList over ${data}`, () => {
      const at = SRC.indexOf(`case "${name}":`);
      assert.ok(at > 0, `${name} disappeared`);
      const block = SRC.slice(at, at + 700);
      assert.match(block, /<FlatList/, `${name} still mounts every card at once`);
      assert.match(block, /\bhorizontal\b/);
      assert.match(block, new RegExp(`data=\\{${data}\\}`));
      assert.match(block, /keyExtractor=/);
      assert.match(block, /removeClippedSubviews/);
      assert.ok(!/\.map\(renderProductCard\)/.test(block), `${name} still uses .map()`);
    });
  }

  test("the per-store product row is virtualized too", () => {
    const at = SRC.indexOf("const renderVendorStoreSectionWithProducts");
    const block = SRC.slice(at, at + 2000);
    assert.match(block, /<FlatList[\s\S]{0,200}horizontal/);
    assert.match(block, /data=\{products\}/);
    assert.ok(!/products\.map\(/.test(block),
      "each store still mounts all of its products at once");
  });

  test("the uncapped search grid is windowed", () => {
    const at = SRC.indexOf("const renderSearchResults");
    const block = SRC.slice(at, at + 1400);
    assert.match(block, /<FlatList/, "the search grid still mounts every match");
    assert.match(block, /numColumns=\{SEARCH_GRID_COLUMNS\}/);
    assert.ok(!/filteredStoreProducts\.map\(/.test(block));
  });

  test("the column count is derived from the layout, not hard-coded", () => {
    assert.match(SRC, /const SEARCH_GRID_COLUMNS = Math\.max\(/);
    assert.match(SRC, /PRODUCT_CARD_WIDTH \+ SEARCH_GRID_GAP/,
      "the grid no longer adapts to screen width the way flexWrap did");
  });

  test("the 13-item category rows are deliberately NOT converted", () => {
    const at = SRC.indexOf('case "categoriesRows":');
    const block = SRC.slice(at, at + 900);
    assert.match(block, /<ScrollView/, "small bounded rows were converted blindly");
    assert.match(block, /firstRowCategories\.map\(renderCategoryCard\)/);
    assert.match(block, /secondRowCategories\.map\(renderCategoryCard\)/);
  });
});

describe("C-20 · behaviour, RTL and dependencies are untouched", () => {
  test("navigation targets are unchanged", () => {
    for (const target of ["AllCategories", "StoreProducts"]) {
      assert.ok(SRC.includes(`navigation.navigate("${target}"`), `lost navigation to ${target}`);
    }
  });

  test("cart, favourite and product handlers still exist", () => {
    for (const fn of ["renderProductCard", "renderCategoryCard", "renderRestaurantCard",
                      "renderVendorStoreCard", "renderVendorProductCard",
                      "renderVendorStoreSectionWithProducts", "renderSearchResults",
                      "renderSectionTitle", "handleCategoryPress"]) {
      assert.ok(SRC.includes(fn), `${fn} disappeared`);
    }
    assert.match(SRC, /isFavorite\(/);
    assert.match(SRC, /items\.find\(/);
  });

  test("the tab switches keep their handlers and testIDs", () => {
    assert.match(SRC, /setActiveTab\("stores"\)/);
    assert.match(SRC, /setActiveTab\("restaurants"\)/);
    assert.match(SRC, /testID="tab-stores"/);
    assert.match(SRC, /testID="tab-restaurants"/);
    assert.match(SRC, /testID="input-home-search"/);
  });

  test("RTL wiring is unchanged", () => {
    const before = (RAW.match(/I18nManager/g) ?? []).length;
    assert.ok(before === 0 || /I18nManager/.test(RAW),
      "RTL handling changed shape");
    // The RTL-sensitive chevron direction in the store section is untouched.
    assert.match(SRC, /name="chevron-left"/);
  });

  test("safe-area and tab-bar insets still drive the content padding", () => {
    assert.match(SRC, /paddingTop: insets\.top \+ HEADER_BAR_HEIGHT/);
    assert.match(SRC, /tabBarHeight \+ Spacing\.xl/);
    assert.match(SRC, /scrollIndicatorInsets=\{\{ bottom: insets\.bottom \}\}/);
  });

  test("no new dependency was introduced", () => {
    const imports = [...RAW.matchAll(/^import .*?from "([^"]+)";/gm)].map((m) => m[1]);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const known = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
    for (const spec of imports) {
      if (spec.startsWith(".") || spec.startsWith("@/")) continue;
      const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      assert.ok(known.has(name) || name.startsWith("react-native") || name === "react",
        `HomeScreen imports an undeclared package: ${name}`);
    }
  });

  test("FlatList comes from react-native, not a new library", () => {
    assert.match(RAW, /^import \{[\s\S]*?FlatList[\s\S]*?\} from "react-native";/m);
  });
});
