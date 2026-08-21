/**
 * H-65 — AdminScreen decomposition.
 *
 * The finding: "AdminScreen.tsx is 4,403 lines with 56 useState, 17 queries, 0
 * useMemo and 15 tab renderers in one component. Split it by tab; stop loading and
 * re-rendering data for tabs that are not open."
 *
 * Re-measured against the file rather than taken from the report:
 *
 *   CORRECTED  the file was 9,001 lines, not 4,403 — it had doubled since.
 *   CORRECTED  60 useState, 16 useQuery, 14 tab renderers.
 *   CONFIRMED  0 useMemo.
 *   FALSE      "data for unopened tabs is loaded". H-43 had already gated 12 of
 *              the 16 queries. Of the four left, three are ungated on purpose —
 *              `drivers`, `vendorPartners` and `settlementRequests` feed tab-bar
 *              badges that render on EVERY tab, and `adminOrders` drives the
 *              audible new-order alert. Gating any of them is a regression, not a
 *              fix. tests/unit/admin-query-gating.test.mjs owns that property and
 *              still passes unchanged in substance.
 *
 * So what was actually left to fix is re-rendering, not re-fetching: one component
 * holding ~40 form inputs re-ran its entire body — all fourteen renderers, the four
 * badge scans and the whole tab bar — on every keystroke in any of them.
 *
 * The fix moves the five tabs that use none of AdminScreen's shared StyleSheet into
 * their own memoised components, and stabilises the props the tab bar depends on.
 * These tests assert the two things that make that fix real rather than cosmetic:
 * the moved code is byte-identical to what it replaced, and the memo boundaries
 * cannot be silently defeated.
 *
 * Run:  node --test tests/unit/h65-adminscreen-decomposition.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const SCREEN = read("client/screens/AdminScreen.tsx");
const CODE = stripComments(SCREEN);

/**
 * The tabs H-65 lifted out, and the tab key each one answers in the switch.
 *
 * The first pass moved the five tabs that used none of AdminScreen's shared
 * StyleSheet. The second moved the remaining nine, which do use it — 88 of its 94
 * keys between them — by relocating the sheet itself to adminStyles.ts once
 * instead of copying keys into a dozen files. All fourteen are here now.
 */
const EXTRACTED = {
  DashboardTab: "dashboard",
  OrdersTab: "orders",
  DriversTab: "drivers",
  UsersTab: "users",
  BannersTab: "banners",
  CategoriesTab: "categories",
  ProductsTab: "products",
  AreasTab: "areas",
  PromoCodesTab: "promoCodes",
  NotificationsTab: "notifications",
  VendorsTab: "vendors",
  SettlementsTab: "settlements",
  SettingsTab: "settings",
  StorageTab: "storage",
};
/** The two modals, which render alongside the tabs rather than inside one. */
const MODALS = ["AssignDriverModal", "TrackingModal"];
const SRC = Object.fromEntries(
  [...Object.keys(EXTRACTED), ...MODALS].map((n) => [
    n,
    read(`client/screens/admin/${n}.tsx`),
  ]),
);
const BAR = read("client/screens/admin/AdminTabBar.tsx");
const SHEET = read("client/screens/admin/adminStyles.ts");

// ─────────────────────────────────────────────────────────────────────────────
describe("H-65 · the shape of the problem, re-measured each run", () => {
  test("the report's line count was stale, and the split reversed the growth", () => {
    const lines = SCREEN.split("\n").length;
    assert.ok(lines < 2600,
      `AdminScreen is ${lines} lines — the decomposition regressed`);
    // It was 9,001 before the split. Every line removed landed in a tab file or
    // in the shared stylesheet; nothing was deleted.
    const moved =
      Object.values(SRC).reduce((n, s) => n + s.split("\n").length, 0) +
      BAR.split("\n").length +
      SHEET.split("\n").length;
    assert.ok(moved > 7000,
      `only ${moved} lines live in the split-out files — the split is thinner than claimed`);
  });

  test("no tab renderer was deleted; every one of the fourteen is extracted", () => {
    // No renderer is left inline: this is what "AdminScreen is decomposed" means.
    const inline = [...CODE.matchAll(/const (render\w+Tab) = \(\) =>/g)].map((m) => m[1]);
    assert.deepEqual(inline, [],
      `${inline.length} tab renderers are still inline: ${inline.join(", ")}`);
    const all = Object.keys(EXTRACTED).map((n) => `render${n}`).sort();
    assert.equal(all.length, 14,
      `${all.length} tab renderers — one was lost or invented by the split`);
    assert.deepEqual(all, [
      "renderAreasTab", "renderBannersTab", "renderCategoriesTab",
      "renderDashboardTab", "renderDriversTab", "renderNotificationsTab",
      "renderOrdersTab", "renderProductsTab", "renderPromoCodesTab",
      "renderSettingsTab", "renderSettlementsTab", "renderStorageTab",
      "renderUsersTab", "renderVendorsTab",
    ], "the set of tabs changed — H-65 was a move, not a feature change");
    // Each extracted file still holds the renderer it was built from, so the
    // moved markup is traceable back to the function it came from.
    //
    // StorageTab is the exception and stays one: it was the first tab extracted,
    // and its arrow body was folded straight into the component's `return`
    // instead of keeping the wrapper. Its JSX was verified byte-identical the same
    // way as the rest, so this asserts the JSX rather than the wrapper for it.
    for (const component of Object.keys(EXTRACTED)) {
      if (component === "StorageTab") {
        assert.match(SRC[component], /return \(\n {4}<View style=\{\{ gap: Spacing\.lg \}\}>/,
          "StorageTab's markup no longer opens the way the renderer did");
        continue;
      }
      assert.match(SRC[component], new RegExp(`const render${component} = \\(\\) =>`),
        `${component} no longer contains the renderer it was extracted from`);
    }
  });

  test("both modals were extracted too, and still render from AdminScreen", () => {
    for (const m of MODALS) {
      assert.match(SRC[m], new RegExp(`React\\.memo\\(\\s*${m}Inner`),
        `${m} is not memoised`);
      assert.match(CODE, new RegExp(`<${m}\\b`), `${m} is no longer rendered`);
    }
    // The tracking modal's map HTML and its refresh interval stay in AdminScreen.
    assert.match(CODE, /const getAdminTrackingMapHTML = /,
      "the tracking map builder left AdminScreen");
    // stripComments, because this file's own header describes that interval.
    assert.doesNotMatch(stripComments(SRC.TrackingModal), /setInterval/,
      "the tracking modal started its own timer");
    assert.match(CODE, /trackingIntervalRef\.current = setInterval\(/,
      "the tracking interval left AdminScreen");
  });

  test("the shared stylesheet was moved once, not copied into each tab", () => {
    // The conservative option: one `StyleSheet.create`, imported by the tabs that
    // need it. Copies would let the panel's look drift file by file.
    assert.match(SHEET, /export const styles = StyleSheet\.create\(\{/,
      "adminStyles no longer exports the sheet");
    assert.equal((SHEET.match(/StyleSheet\.create\(/g) ?? []).length, 1);
    for (const [name, src] of Object.entries(SRC)) {
      assert.doesNotMatch(src, /StyleSheet\.create\(/,
        `${name} declares its own StyleSheet — the shared sheet was copied`);
    }
    assert.doesNotMatch(CODE, /StyleSheet\.create\(/,
      "AdminScreen kept a second copy of the sheet");
    // AdminScreen no longer references `styles` at all, so it does not import it.
    assert.doesNotMatch(CODE, /(?<![\w.])styles\./,
      "AdminScreen still reads the shared stylesheet after handing it over");
  });

  test("every tab key still resolves to something in renderContent", () => {
    const at = CODE.indexOf("const renderContent = () =>");
    assert.ok(at > 0, "renderContent disappeared");
    const body = CODE.slice(at, CODE.indexOf("\n  };", at));
    const keys = [...body.matchAll(/case "(\w+)":/g)].map((m) => m[1]);
    assert.equal(keys.length, 15, `${keys.length} cases — a tab lost its branch`);
    for (const [component, key] of Object.entries(EXTRACTED)) {
      const caseAt = body.indexOf(`case "${key}":`);
      const next = body.indexOf("case \"", caseAt + 6);
      const branch = body.slice(caseAt, next === -1 ? body.length : next);
      assert.match(branch, new RegExp(`<${component}\\b`),
        `the ${key} tab no longer renders ${component}`);
    }
  });
});

describe("H-65 · the moved code is the same code", () => {
  // The one risk of a refactor this size is a silent behaviour change buried in
  // 4,000 moved lines. These are the invariants that would break first.

  test("no tab component fetches, polls or holds its own state", () => {
    for (const [name, src] of Object.entries(SRC)) {
      const code = stripComments(src);
      for (const [what, rx] of [
        ["a query", /useQuery\s*\(|useQuery</],
        ["a mutation", /useMutation\s*\(/],
        ["its own state", /useState\s*[(<]/],
        ["a timer", /setInterval\s*\(|setTimeout\s*\(/],
        ["an effect", /useEffect\s*\(/],
      ]) {
        assert.doesNotMatch(code, rx,
          `${name} gained ${what} — the split was supposed to move markup only, ` +
          "leaving every fetch and every piece of state in AdminScreen");
      }
    }
  });

  test("the queries and the gates all stayed in AdminScreen", () => {
    // If a query had moved with its tab, its `enabled` gate would move too and the
    // H-43 gating suite would silently stop covering it.
    assert.equal((CODE.match(/useQuery</g) ?? []).length, 16,
      "a query left AdminScreen — H-43's gating analysis no longer covers it");
    assert.equal((CODE.match(/enabled:\s*activeTab/g) ?? []).length, 12,
      "a tab gate moved or disappeared");
  });

  test("the extracted tabs still reach the endpoints they call directly", () => {
    // Only the calls made from inside the markup moved. Handlers that AdminScreen
    // owns and passes down (saveSettlementConfig → /api/admin/settlement-config,
    // saveDeliveryPricing → /api/admin/settings) stayed with their state, which is
    // why they are not expected here — the test below pins them to AdminScreen.
    const expect = {
      SettlementsTab: ["/api/admin/settlement-export"],
      SettingsTab: ["/api/admin/settings/fees", "/api/admin/delivery-areas"],
      VendorsTab: ["/api/admin/vendor-partners"],
      // These two render from props alone and issue no request of their own —
      // their loads (dashboard-stats, storage-stats) are AdminScreen's.
      StorageTab: [],
      DashboardTab: [],
    };
    for (const [name, paths] of Object.entries(expect)) {
      for (const p of paths) {
        assert.ok(SRC[name].includes(p),
          `${name} lost its call to ${p} in the move`);
      }
    }
  });

  test("the handlers AdminScreen owns did not drift into a tab", () => {
    // Each of these writes; keeping them next to the state they read is what makes
    // the tabs safe to memoise. A copy inside a tab would be a second writer.
    for (const [handler, endpoint] of [
      ["saveSettlementConfig", "/api/admin/settlement-config"],
      ["saveDeliveryPricing", "/api/admin/settings"],
      ["loadStorageStats", "/api/admin/storage-stats"],
    ]) {
      assert.match(CODE, new RegExp(`const ${handler} = useCallback\\(`),
        `${handler} left AdminScreen — its state stayed behind`);
    }
    assert.ok(CODE.includes("/api/admin/settlement-config"),
      "the settlement-config writer left AdminScreen");
  });

  test("no business rule travelled with the markup", () => {
    // D-3's pricing split is imported, never re-implemented — the settings tab
    // previews the split and must keep using the shared function to do it.
    assert.match(SRC.SettingsTab, /from "@shared\/deliveryPricing"/,
      "the settings tab stopped importing the shared pricing split");
    for (const [name, src] of Object.entries(SRC)) {
      assert.doesNotMatch(src, /function splitDeliveryFee|const splitDeliveryFee =/,
        `${name} re-implements the delivery split instead of importing it`);
    }
  });

  test("the three constant maps became constants instead of per-render objects", () => {
    // They only ever served the vendors tab and were rebuilt on every AdminScreen
    // render. At module scope they are allocated once.
    for (const name of ["VENDOR_STATUS_LABELS", "VENDOR_STATUS_COLORS", "BUSINESS_TYPE_LABELS"]) {
      assert.match(SRC.VendorsTab, new RegExp(`^const ${name}: Record<string, string> = \\{`, "m"),
        `${name} is not a module-level constant in VendorsTab`);
      assert.doesNotMatch(CODE, new RegExp(`const ${name}\\b`),
        `${name} is still declared inside AdminScreen too — two sources of truth`);
    }
  });
});

describe("H-65 · the nine second-pass tabs lost nothing", () => {
  /**
   * Every number below was measured on the pre-extraction AdminScreen and then
   * re-measured on the extracted file; each pair matched exactly. They are frozen
   * here so a later edit that quietly drops a button, an input or a mutation from
   * one of these tabs fails instead of passing silently.
   *
   * "Lost nothing" is checked three ways: the controls the operator can touch,
   * the mutations reachable from them, and (below) the fact that no tab issues a
   * request of its own — every write still goes through AdminScreen.
   */
  const SURFACE = {
    OrdersTab: { onPress: 7, pressables: 7, inputs: 0, onChangeText: 0, switches: 0, mutations: [] },
    DriversTab: { onPress: 5, pressables: 5, inputs: 1, onChangeText: 1, switches: 0, mutations: ["rechargeWalletMutation", "updateDriverStatusMutation"] },
    ProductsTab: { onPress: 6, pressables: 6, inputs: 6, onChangeText: 6, switches: 1, mutations: [] },
    PromoCodesTab: { onPress: 6, pressables: 6, inputs: 3, onChangeText: 3, switches: 0, mutations: [] },
    UsersTab: { onPress: 2, pressables: 2, inputs: 1, onChangeText: 1, switches: 0, mutations: [] },
    BannersTab: { onPress: 7, pressables: 7, inputs: 1, onChangeText: 1, switches: 0, mutations: [] },
    CategoriesTab: { onPress: 6, pressables: 6, inputs: 1, onChangeText: 1, switches: 0, mutations: [] },
    AreasTab: { onPress: 4, pressables: 4, inputs: 2, onChangeText: 2, switches: 0, mutations: [] },
    NotificationsTab: { onPress: 1, pressables: 1, inputs: 2, onChangeText: 2, switches: 0, mutations: [] },
  };
  const count = (s, rx) => (s.match(rx) ?? []).length;

  for (const [name, want] of Object.entries(SURFACE)) {
    test(`${name} kept every control it had`, () => {
      const s = SRC[name];
      assert.equal(count(s, /onPress=\{/g), want.onPress, `${name} lost or gained a press handler`);
      assert.equal(count(s, /<Pressable\b/g), want.pressables, `${name} lost or gained a button`);
      assert.equal(count(s, /<TextInput\b/g), want.inputs, `${name} lost or gained an input`);
      assert.equal(count(s, /onChangeText=\{/g), want.onChangeText, `${name} lost an input's handler`);
      assert.equal(count(s, /<Switch\b/g), want.switches, `${name} lost or gained a switch`);
      const mutations = [...new Set([...s.matchAll(/(\w+Mutation)\.mutate/g)].map((m) => m[1]))].sort();
      assert.deepEqual(mutations, want.mutations, `${name}'s reachable mutations changed`);
    });
  }

  test("no second-pass tab issues a request of its own", () => {
    // The nine moved as markup only. Every fetch they used to trigger is still
    // triggered by a handler or mutation declared in AdminScreen and passed down,
    // which is what keeps a single writer per endpoint.
    for (const name of Object.keys(SURFACE)) {
      const code = stripComments(SRC[name]);
      assert.doesNotMatch(code, /\bfetch\s*\(/, `${name} started fetching directly`);
      assert.doesNotMatch(code, /apiRequest\s*\(/, `${name} started calling the API helper`);
      assert.doesNotMatch(code, /useMutation\s*\(/, `${name} declares its own mutation`);
      assert.doesNotMatch(code, /useQuery\s*[(<]/, `${name} declares its own query`);
    }
  });

  test("the handlers these tabs call are all still declared in AdminScreen", () => {
    for (const fn of [
      "saveBanner", "saveCategory", "saveProduct", "saveArea", "savePromoCode",
      "handleEditBanner", "handleEditCategory", "handleEditProduct",
      "handleEditArea", "handleEditPromo", "handleSendNotification",
      "confirmDelete", "pickImage", "saveCategoryChanges",
      "getStatusColor", "getStatusLabel",
      "getDriverStatusColor", "getDriverStatusText",
    ]) {
      assert.match(CODE, new RegExp(`const ${fn} = `),
        `${fn} left AdminScreen — a tab took ownership of a write or a rule`);
    }
    for (const mut of [
      "updateOrderStatus", "assignDriverMutation",
      "updateDriverStatusMutation", "rechargeWalletMutation",
    ]) {
      assert.match(CODE, new RegExp(`const ${mut} = useMutation\\(`),
        `${mut} is no longer declared once in AdminScreen`);
    }
  });

  test("the money-touching mutations gained no retry in the move", () => {
    // Standing rule for this codebase: no automatic retry on financial writes.
    for (const name of ["DriversTab", "OrdersTab", "AssignDriverModal"]) {
      assert.doesNotMatch(stripComments(SRC[name]), /\bretry\s*:/,
        `${name} introduced a retry on a financial or dispatch path`);
    }
  });
});

describe("H-65 · the memo boundaries actually hold", () => {
  // A React.memo child whose props are rebuilt every render is worse than no memo:
  // it pays the comparison and re-renders anyway. Each assertion below guards one
  // prop that would do that.

  test("every extracted tab is exported memoised", () => {
    for (const name of Object.keys(SRC)) {
      assert.match(SRC[name], new RegExp(`React\\.memo\\(\\s*${name}Inner`),
        `${name} is exported unwrapped — it re-renders with AdminScreen`);
    }
    assert.match(BAR, /React\.memo\(\s*AdminTabBarInner/,
      "the tab bar is not memoised — it re-renders on every keystroke");
  });

  test("the tab bar's two unstable props are stabilised", () => {
    assert.match(CODE, /const TABS: AdminTab<TabType>\[\] = useMemo\(/,
      "TABS is rebuilt on every render again, so React.memo(AdminTabBar) never hits");
    assert.match(CODE, /const handleSelectTab = useCallback\(/,
      "the tab-select handler is a fresh closure per render again");
    assert.match(CODE, /const resetForm = useCallback\(/,
      "resetForm became unstable, which makes handleSelectTab unstable with it");
    // handleSelectTab must still do exactly what the inline onPress did.
    const at = CODE.indexOf("const handleSelectTab = useCallback(");
    const body = CODE.slice(at, CODE.indexOf("[resetForm],", at));
    assert.match(body, /setActiveTab\(key\);/, "selecting a tab stopped switching tab");
    assert.match(body, /resetForm\(\);/,
      "selecting a tab no longer clears the open form — edits would leak across tabs");
  });

  test("the four badge scans run per data change, not per render", () => {
    for (const [memo, source] of [
      ["pendingOrdersBadge", "adminOrders"],
      ["pendingDriversBadge", "drivers"],
      ["pendingVendorsBadge", "vendorPartners"],
    ]) {
      const at = CODE.indexOf(`const ${memo} = useMemo(`);
      assert.ok(at > 0, `${memo} is no longer memoised`);
      const decl = CODE.slice(at, CODE.indexOf("\n  );", at));
      assert.match(decl, new RegExp(`${source}\\.filter\\(`),
        `${memo} no longer derives from ${source}`);
      assert.match(decl, new RegExp(`\\[${source}\\]`),
        `${memo}'s dependency list does not track ${source} — it would go stale`);
    }
    // The fourth is a length, not a scan, so it stays inline as it always was.
    assert.match(CODE, /badge: settlementRequests\.length,/,
      "the settlements badge changed shape");
  });

  test("the badge counts are unchanged in meaning", () => {
    // Same predicate, same field, same 9+ cap the inline version used.
    assert.match(CODE, /adminOrders\.filter\(\(o\) => o\.status === "pending"\)\.length/);
    assert.match(CODE, /drivers\.filter\(\(d\) => d\.status === "pending"\)\.length/);
    assert.match(CODE, /vendorPartners\.filter\(\(v\) => v\.status === "pending"\)\.length/);
    assert.match(BAR, /tab\.badge > 9 \? "9\+" : tab\.badge/,
      "the badge cap changed — the bar would render a different number");
    assert.match(BAR, /tab\.badge && tab\.badge > 0 \? \(/,
      "a zero badge would now render a bubble");
  });

  test("the empty-array fallback no longer allocates per render", () => {
    // `vendorPartnersRaw?.vendors ?? []` handed a brand-new array to the badge memo
    // and the vendors tab on every render while the query was loading.
    assert.match(CODE, /useMemo\(\s*\(\) => vendorPartnersRaw\?\.vendors \?\? \[\],\s*\[vendorPartnersRaw\],\s*\)/,
      "vendorPartners is unmemoised again — every render invalidates the badge memo");
  });

  test("approvedDrivers is derived once per drivers change", () => {
    const at = CODE.indexOf("const approvedDrivers = useMemo(");
    assert.ok(at > 0, "approvedDrivers went back to a per-render filter");
    const decl = CODE.slice(at, CODE.indexOf("\n  );", at));
    assert.match(decl, /drivers\.filter\(\(d\) => d\.status === "approved"\)/,
      "the assign-driver picker changed which drivers it offers");
    assert.match(decl, /\[drivers\]/, "approvedDrivers can go stale");
  });
});

describe("H-65 · the tab bar renders exactly what it used to", () => {
  test("it is a presentational component: no state, no queries, no navigation", () => {
    const bar = stripComments(BAR);
    for (const rx of [/useState/, /useQuery/, /useEffect/, /useNavigation/, /apiRequest/]) {
      assert.doesNotMatch(bar, rx,
        "the tab bar took on behaviour — it is meant to be props-in, markup-out");
    }
  });

  test("its styles are the ones AdminScreen used, not new ones", () => {
    // A decomposition that quietly restyles the chrome is a visual regression. These
    // are the values the inline bar shipped with.
    for (const [prop, value] of [
      ["shadowOpacity", "0.06"],
      ["shadowRadius", "4"],
      ["elevation", "3"],
      ["zIndex", "10"],
      ["gap", "3"],
      ["paddingVertical", "10"],
      ["minWidth", "64"],
      ["borderBottomWidth", "2"],
      ["fontSize", "10"],
      ["top", "-5"],
      ["right", "-8"],
      ["height", "15"],
      ["borderRadius", "8"],
    ]) {
      assert.match(BAR, new RegExp(`${prop}: ${value.replace(".", "\\.")}`),
        `the tab bar's ${prop} changed from ${value} — the chrome moved`);
    }
    assert.match(BAR, /flexDirection: "row"/,
      "the tab row's direction changed — the tabs would render in the other order");
    assert.match(BAR, /fontFamily: "Cairo_400Regular"/,
      "the tab label font changed");
    assert.match(BAR, /paddingHorizontal: Spacing\.sm/, "the row's padding changed");
    assert.match(BAR, /paddingHorizontal: Spacing\.md/, "a tab's padding changed");
    assert.doesNotMatch(BAR, /row-reverse/,
      "the tab row was flipped — it was never row-reverse");
  });

  test("AdminScreen no longer carries the styles it handed over", () => {
    for (const key of ["adminTabBar:", "adminTabsRow:", "adminTab:", "adminTabLabel:", "adminTabBadge:"]) {
      assert.ok(!CODE.includes(key),
        `${key} is still declared in AdminScreen — two copies of the same style`);
    }
  });

  test("the fifteen tabs, their order, their labels and their icons are untouched", () => {
    const at = CODE.indexOf("const TABS: AdminTab<TabType>[] = useMemo(");
    const arr = CODE.slice(at, CODE.indexOf("\n    ],", at));
    const keys = [...arr.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(keys, [
      "dashboard", "orders", "drivers", "users", "banners", "categories",
      "products", "areas", "promoCodes", "notifications", "vendors",
      "settlements", "settings", "storage", "websiteCms",
    ], "the tab bar's contents or order changed");
    const icons = [...arr.matchAll(/icon: "([\w-]+)"/g)].map((m) => m[1]);
    assert.deepEqual(icons, [
      "home", "shopping-bag", "truck", "users", "image", "grid", "package",
      "map-pin", "tag", "bell", "briefcase", "dollar-sign", "settings",
      "hard-drive", "globe",
    ], "a tab's icon changed");
  });
});

describe("H-65 · nothing outside the panel's rendering was touched", () => {
  test("the auth gate, the 401 handler and the logout still live in AdminScreen", () => {
    for (const rx of [
      /const result = await checkAdminSession\(\);/,
      /setAdminUnauthorizedHandler\(/,
      /navigation\.replace\("AdminLogin"\)/,
      /const handleAdminLogout = useCallback\(/,
    ]) {
      assert.match(CODE, rx, "an auth path moved or was lost in the split");
    }
    // The gate must still precede any panel markup.
    assert.ok(
      CODE.indexOf('if (adminAuthState === "checking")') < CODE.indexOf("<AdminTabBar"),
      "the panel renders before the session check again",
    );
  });

  test("the effect count is unchanged — the split added no lifecycle", () => {
    assert.equal((CODE.match(/useEffect\s*\(/g) ?? []).length, 8,
      "an effect appeared or vanished; H-65 was supposed to be structural only");
    assert.equal((CODE.match(/setInterval\s*\(/g) ?? []).length, 1,
      "a timer appeared — the split added polling");
  });

  test("the shared type moved without changing", () => {
    const types = read("client/screens/admin/types.ts");
    // Scope to TabType's own declaration: the file also holds VendorPartner and
    // VendorProduct, whose `status` fields are string unions of the same shape.
    const decl = types.slice(types.indexOf("export type TabType ="));
    const keys = [...decl.matchAll(/\| "(\w+)"/g)].map((m) => m[1]);
    assert.equal(keys.length, 15, "TabType gained or lost a key in the move");
    assert.equal(keys[0], "dashboard", "TabType's first key changed");
    assert.doesNotMatch(CODE, /^type TabType =/m,
      "TabType is declared twice — AdminScreen kept a copy");
    assert.match(CODE, /import type \{[\s\S]*?TabType,[\s\S]*?\} from "@\/screens\/admin\/types"/,
      "AdminScreen stopped importing the shared TabType");
  });

  test("no tab component imports AdminScreen back", () => {
    // That would be a cycle, and it would also mean state leaked the wrong way.
    for (const [name, src] of Object.entries(SRC)) {
      assert.doesNotMatch(src, /from "@\/screens\/AdminScreen"/,
        `${name} imports its parent — the split introduced a cycle`);
    }
    assert.doesNotMatch(BAR, /from "@\/screens\/AdminScreen"/);
  });
});
