/**
 * H-64 — Admin → API → Firestore → App, with one source of truth per fact.
 *
 * The completion audit found values the admin could edit that nothing read, values
 * the app used that the admin could not touch, and one number shown to customers
 * that was never the number charged. Each of those is a pair of fields where there
 * should have been one:
 *
 *   • opening hours: the admin wrote `openTime`/`closeTime`; the app reads
 *     `workingHours`. Nothing bridged them, so admin edits changed nothing visible.
 *   • availability: `isVacation`/`isBusy` blocked orders server-side but were
 *     vendor-only — the dashboard could not see or clear them.
 *   • stock: the order guard tested `inStock === false`; vendors maintain `stock`.
 *     All 31 live products carry `stock`, none carries `inStock`, and four are on
 *     sale with `stock: 0`.
 *   • order status: `delivering` is written by nothing. It gated the dashboard's
 *     "جاري التوصيل" tab (permanently empty), the driver-tracking button (never
 *     rendered) and the store's revenue set (in-flight orders vanished).
 *
 * Run:  node --test tests/unit/h64-admin-dashboard-sync.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";
import {
  DEFAULT_OPEN_DAYS,
  normalizeWorkingHours,
  isStoreOpenNow,
} from "../../shared/storeHours.ts";
import {
  isProductAvailable,
  isProductOutOfStock,
} from "../../shared/productAvailability.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = read("server/routes.ts");
const INDEX = read("server/index.ts");
const VENDOR = read("server/vendor.ts");
const ADMIN = read("server/templates/admin.html");
/**
 * The mobile admin surface. H-65 split five tabs out of AdminScreen into
 * client/screens/admin/*.tsx, the way WebsiteCmsTab was already split, so the
 * panel is now several files. Nothing about what it calls changed — only where
 * the call sites live — and these checks are about the surface, not the file.
 */
const MOBILE_FILES = [
  "client/screens/AdminScreen.tsx",
  "client/screens/admin/DashboardTab.tsx",
  "client/screens/admin/VendorsTab.tsx",
  "client/screens/admin/SettingsTab.tsx",
  "client/screens/admin/SettlementsTab.tsx",
  "client/screens/admin/StorageTab.tsx",
];
const MOBILE = MOBILE_FILES.map(read).join("\n");
const ADMIN_AUTH = read("client/lib/adminAuth.ts");

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 3. opening hours: one field, admin → app", () => {
  test("the admin's two strings are folded into the field the app reads", () => {
    const wh = normalizeWorkingHours(null, {
      openTime: "09:00",
      closeTime: "22:00",
    });
    assert.deepEqual(wh, {
      openTime: "09:00",
      closeTime: "22:00",
      openDays: DEFAULT_OPEN_DAYS,
    });
  });

  test("a store's own hours are never overwritten by the legacy pair", () => {
    const wh = normalizeWorkingHours(
      { openTime: "08:00", closeTime: "16:00", openDays: [1, 2, 3] },
      { openTime: "09:00", closeTime: "22:00" },
    );
    assert.equal(wh.openTime, "08:00");
    assert.deepEqual(wh.openDays, [1, 2, 3]);
  });

  test("a workingHours object with no openDays does not close the store", () => {
    // isStoreOpenNow treats a missing openDays as "open on no day" — building the
    // object without one would silently shut the store on every day of the week.
    const wh = normalizeWorkingHours({ openTime: "09:00", closeTime: "22:00" });
    assert.deepEqual(wh.openDays, DEFAULT_OPEN_DAYS);
    assert.equal(isStoreOpenNow(wh, new Date("2026-08-16T12:00:00")), true);
  });

  test("junk hours resolve to null, which means 'always open' — not 'always shut'", () => {
    for (const bad of [
      null,
      undefined,
      {},
      { openTime: "25:00", closeTime: "22:00" },
      { openTime: "9", closeTime: "22" },
    ]) {
      assert.equal(normalizeWorkingHours(bad), null);
    }
    assert.equal(isStoreOpenNow(null), true);
  });

  test("the open/closed predicate is honoured for real windows", () => {
    const wh = {
      openTime: "09:00",
      closeTime: "17:00",
      openDays: [0, 1, 2, 3, 4, 5, 6],
    };
    assert.equal(isStoreOpenNow(wh, new Date("2026-08-16T10:30:00")), true);
    assert.equal(isStoreOpenNow(wh, new Date("2026-08-16T08:59:00")), false);
    assert.equal(isStoreOpenNow(wh, new Date("2026-08-16T17:00:00")), false);
    // A day the store is closed.
    const weekdays = { ...wh, openDays: [1, 2, 3, 4, 5] };
    assert.equal(
      isStoreOpenNow(weekdays, new Date("2026-08-16T10:30:00")),
      false,
    ); // Sunday
  });

  test("the admin write path rebuilds workingHours from the same edit", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /vendorUpdates\.workingHours = merged;/,
      "an admin hours edit no longer reaches the field the app reads",
    );
    assert.match(
      code,
      /if \(body\.openTime !== undefined \|\| body\.closeTime !== undefined\)/,
    );
  });

  test("GET /api/stores serves the normalised object", () => {
    assert.match(
      stripComments(ROUTES),
      /workingHours: normalizeWorkingHours\(v\.workingHours, \{ openTime: v\.openTime, closeTime: v\.closeTime \}\)/,
      "a store edited before this fix would still read as always open",
    );
  });

  test("both customer screens use the shared predicate, not their own copy", () => {
    for (const f of [
      "client/screens/StoresListScreen.tsx",
      "client/screens/HomeScreen.tsx",
    ]) {
      const code = stripComments(read(f));
      assert.match(
        code,
        /isStoreOpenNow\(/,
        `${f} must use the shared predicate`,
      );
      assert.doesNotMatch(
        code,
        /wh\.openDays\?\.includes\(day\)/,
        `${f} still carries its own copy of the open/closed arithmetic`,
      );
    }
  });

  test("the dashboard loads the hours the app actually uses", () => {
    const code = stripComments(ADMIN);
    assert.match(
      code,
      /v\.workingHours\?\.openTime \|\| v\.openTime/,
      "the modal still shows only the admin-only strings",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 5+6. store availability is visible and controllable", () => {
  test("the server accepts both flags from the admin", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /if \(body\.isVacation !== undefined\) vendorUpdates\.isVacation = Boolean\(body\.isVacation\);/,
    );
    assert.match(
      code,
      /if \(body\.isBusy !== undefined\) vendorUpdates\.isBusy = Boolean\(body\.isBusy\);/,
    );
  });

  test("the same flags still block orders — no new behaviour was invented", () => {
    const code = stripComments(ROUTES);
    assert.match(code, /if \(vAvail\.isVacation\)/);
    assert.match(code, /if \(vAvail\.isBusy\)/);
  });

  test("the dashboard shows and sends them", () => {
    const code = stripComments(ADMIN);
    assert.match(code, /id="medit-isVacation"/);
    assert.match(code, /id="medit-isBusy"/);
    assert.match(
      code,
      /isVacation:\s+document\.getElementById\('medit-isVacation'\)\.checked/,
    );
    assert.match(
      code,
      /isBusy:\s+document\.getElementById\('medit-isBusy'\)\.checked/,
    );
    assert.match(
      code,
      /'medit-isVacation'\)\.checked = v\.isVacation === true/,
      "the current value must be loaded, not left blank",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 8. stock and inStock resolve to one answer", () => {
  test("an explicit availability toggle still wins", () => {
    assert.equal(isProductAvailable({ inStock: false, stock: 99 }), false);
    assert.equal(isProductAvailable({ inStock: true, stock: 5 }), true);
  });

  test("the live shape — stock tracked, inStock never set — is honoured", () => {
    // 31 live products: all carry `stock`, none carries `inStock`, four are at zero.
    assert.equal(isProductAvailable({ stock: 27 }), true);
    assert.equal(
      isProductAvailable({ stock: 0 }),
      false,
      "a zero-stock product is still on sale",
    );
    assert.equal(isProductAvailable({ stock: -3 }), false);
    assert.equal(isProductOutOfStock({ stock: 0 }), true);
  });

  test("a product with neither field stays available", () => {
    assert.equal(isProductAvailable({}), true);
    assert.equal(isProductAvailable({ stock: null }), true);
    assert.equal(isProductAvailable({ stock: "" }), true);
  });

  test("a malformed stock value never removes a working product", () => {
    for (const junk of ["abc", NaN, Infinity, {}]) {
      assert.equal(
        isProductAvailable({ stock: junk }),
        true,
        `stock ${String(junk)} took a product off sale`,
      );
    }
  });

  test("the order guard uses the unified rule", () => {
    const code = stripComments(ROUTES);
    assert.match(code, /if \(!isProductAvailable\(vp\)\) available = false;/);
    assert.doesNotMatch(
      code,
      /if \(vp\?\.inStock === false\) available = false;/,
      "the order guard still ignores the stock count",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 9+10. the phantom 'delivering' status is gone", () => {
  test("no server path names it any more", () => {
    for (const [name, src] of [
      ["routes.ts", ROUTES],
      ["vendor.ts", VENDOR],
    ]) {
      assert.doesNotMatch(
        stripComments(src),
        /"delivering"/,
        `${name} still treats "delivering" as an operational status`,
      );
    }
  });

  test("10. the store's in-flight orders are still accounted for (C-2)", () => {
    const code = stripComments(VENDOR);

    // C-2's harm was that orders OUT FOR DELIVERY dropped out of the vendor's
    // wallet entirely and reappeared on delivery — revenue that fell and rose
    // with no explanation. C-2 fixed it by folding picked_up/in_delivery into
    // one `completedStatuses` set that fed totalRevenue.
    //
    // H-74 kept the visibility and removed the claim: an order on a motorbike is
    // reported, but it is not money the store has earned. The settlement engine
    // accrues on delivery only, so counting it as revenue made the wallet
    // disagree with the ledger the store is actually paid from.
    //
    // So this now pins the INTENT — in-flight orders are still tracked and
    // surfaced — rather than the single set literal C-2 happened to use.
    assert.match(code, /const IN_FLIGHT_STATUSES = new Set\(\["picked_up", "in_delivery"\]\)/,
      "orders out for delivery still drop out of the vendor's wallet");
    assert.match(code, /const countedStatuses = new Set\(\[\.\.\.EARNED_STATUSES, \.\.\.IN_FLIGHT_STATUSES\]\)/,
      "in-flight orders are no longer collected at all");
    assert.match(code, /inFlightRevenue/,
      "the in-flight total is not reported to the store");

    // …and the other half of H-74: earned means delivered.
    assert.match(code, /const EARNED_STATUSES = new Set\(\["delivered"\]\)/,
      "an undelivered order is counted as earned revenue again");
  });

  test("the dashboard's orders tabs filter on statuses the server writes", () => {
    const code = stripComments(ADMIN);
    assert.doesNotMatch(
      code,
      /data-status="delivering"/,
      "the dead filter tab is back",
    );
    assert.match(code, /data-status="in_delivery"/);
    assert.match(code, /data-status="picked_up"/);
  });

  test("the driver-tracking button can actually render", () => {
    const code = stripComments(ADMIN);
    assert.match(
      code,
      /\['picked_up', 'in_delivery'\]\.includes\(order\.status\) && order\.driverPhone/,
      "the tracking button is gated on a status that never occurs",
    );
    assert.doesNotMatch(code, /order\.status === 'delivering'/);
  });

  test("the vendor app lists in-flight orders under a real status", () => {
    const code = stripComments(read("client/screens/VendorOrdersScreen.tsx"));
    assert.doesNotMatch(
      code,
      /"delivering"/,
      "the vendor app still filters on the phantom status",
    );
    assert.match(code, /statuses: \["delivered", "in_delivery", "cancelled"\]/);
  });

  test("the canonical status set is unchanged — nothing was invented", () => {
    const fb = stripComments(read("server/firebase.ts"));
    assert.match(
      fb,
      /"in_delivery"/,
      "in_delivery must remain the canonical status",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 12-14. admin session: logout, expiry, 401", () => {
  test("12. a JSON logout exists that serves both surfaces", () => {
    const code = stripComments(INDEX);
    assert.match(code, /app\.post\("\/api\/admin\/logout"/);
    assert.match(
      code,
      /invalidateSession\(getSessionToken\(req\)\)/,
      "logout must invalidate the session on the SERVER, not only forget it locally",
    );
  });

  test("the mobile client invalidates server-side before clearing locally", () => {
    const code = stripComments(ADMIN_AUTH);
    const post = code.indexOf('"/api/admin/logout"');
    const clear = code.indexOf("await clearAdminToken();", post);
    assert.ok(
      post > -1 && clear > post,
      "the local token is dropped before the session is killed",
    );
  });

  test("13. session VALIDITY is checked, not merely token presence", () => {
    assert.match(stripComments(INDEX), /app\.get\("\/api\/admin\/session"/);
    assert.match(
      stripComments(ADMIN_AUTH),
      /export async function isAdminSessionValid/,
    );
    const screen = stripComments(MOBILE);
    assert.match(screen, /const result = await checkAdminSession\(\);/);
    assert.doesNotMatch(
      screen,
      /if \(token\) setAdminAuthState\("ok"\);/,
      "the panel opens on the presence of a token again",
    );
  });

  test("an unreachable server does not sign the admin out", () => {
    const screen = stripComments(MOBILE);
    assert.match(
      screen,
      /if \(!result\.info && result\.reachable\) navigation\.replace\("AdminLogin"\)/,
      "a dropped connection must not be treated as a dead session",
    );
  });

  test("14. 401 is handled centrally on both surfaces", () => {
    const mobileLib = stripComments(ADMIN_AUTH);
    assert.match(mobileLib, /res\?\.status === 401/);
    assert.match(mobileLib, /onUnauthorized\?\.\(\)/);
    assert.match(stripComments(MOBILE), /setAdminUnauthorizedHandler\(/);

    const web = stripComments(ADMIN);
    assert.match(
      web,
      /res\.status === 401/,
      "the web dashboard still ignores 401 entirely",
    );
    assert.match(web, /window\.location\.href = '\/admin\/login'/);
  });

  test("the expiry message no longer asks for a control that exists now", () => {
    const screen = stripComments(MOBILE);
    assert.doesNotMatch(
      screen,
      /سجّل الخروج ثم أعد الدخول/,
      "the message still tells the admin to use a sign-out that did not exist",
    );
    assert.match(screen, /handleAdminLogout/, "a sign-out control must exist");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 19. the admin orders read is bounded", () => {
  test("getOrders takes a limit and applies it", () => {
    const fb = stripComments(read("server/firebase.ts"));
    assert.match(fb, /export async function getOrders\(limit = \d+\)/);
    assert.match(
      fb,
      /\.limit\(capped\)\.get\(\)/,
      "the collection scan is still unbounded",
    );
  });

  test("the endpoint bounds and clamps the caller's limit", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /const limit = Math\.min\(2000, Math\.max\(1, parseInt\(String\(req\.query\.limit \?\? ""\), 10\) \|\| 500\)\);/,
    );
    assert.match(code, /const rawOrders = await getOrders\(limit\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · D-3 stays closed", () => {
  test("the fee still comes only from an override or the delivery area", () => {
    const code = stripComments(ROUTES);
    assert.doesNotMatch(code, /verifiedDeliveryFee = sysSettings\./);
    const i1 = code.indexOf("verifiedDeliveryFee = vendorDeliveryFeeOverride");
    const i2 = code.indexOf("verifiedDeliveryFee = Math.round(areaFee);");
    assert.ok(i1 > -1 && i2 > -1 && i1 < i2);
  });

  test("1. an untouched commission field still cannot zero the rate", () => {
    const code = stripComments(ADMIN);
    assert.doesNotMatch(
      code,
      /commissionPercent: parseFloat\(document\.getElementById\('medit-commission'\)\.value\) \|\| 0/,
    );
    assert.match(
      code,
      /if \(raw === ''\) return \{\};/,
      "a blank commission must send no field at all",
    );
  });

  test("11. settlement still reads the values frozen on the order", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /computeDriverPayout\(isRestaurantOrder, order\.deliveryFee \|\| 0, \(order as any\)\.appSharePercent\)/,
    );
    assert.match(code, /totalOwnerEarnings \+= o\.ownerEarning \|\| 0;/);
    assert.doesNotMatch(code, /isRestaurant \? 750 : 2000/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * H-64 · B + E — the admin API surface is accounted for, endpoint by endpoint.
 *
 * The audit counted endpoints with no UI and left it at a number. A number is not
 * a decision: it cannot tell a deliberate API-only route from one that was simply
 * forgotten. This encodes the classification instead, so the list is a contract —
 * add an admin endpoint without wiring or classifying it and this fails.
 */
describe("H-64 · B+E. every admin endpoint is classified", () => {
  const norm = (p) =>
    p
      .replace(/:[a-zA-Z]+/g, ":x")
      .replace(/\$\{[^}]*\}/g, ":x")
      .replace(/[?`'"].*$/, "")
      .replace(/\/$/, "");

  const defined = (() => {
    const out = new Set();
    for (const f of [
      "server/routes.ts",
      "server/vendor.ts",
      "server/index.ts",
    ]) {
      const src = read(f);
      for (const m of src.matchAll(
        /app\.(get|post|put|patch|delete)\(\s*[`'"]([^`'"]+)/g,
      )) {
        if (m[2].startsWith("/api/admin")) out.add(norm(m[2]));
      }
    }
    return out;
  })();

  /**
   * Paths a surface actually calls, kept RAW.
   *
   * Not normalised: a call site may build the path by concatenation
   * (`API_BASE + '/admin/vendor-products/' + id`) or spell a literal segment where
   * the route has a parameter (`/website-cms/hero/image`). Collapsing those to a
   * canonical form loses exactly the information needed to match them, so the
   * comparison below turns the ROUTE into a pattern instead.
   */
  const usedBy = (file) => {
    const src = read(file);
    const out = new Set();
    for (const m of src.matchAll(/API_BASE\s*\+\s*['`](\/admin[^'`]*)/g))
      out.add("/api" + m[1]);
    for (const m of src.matchAll(/\{API_BASE\}(\/admin[^`]*)/g))
      out.add("/api" + m[1]);
    for (const m of src.matchAll(/(\/api\/admin\/[A-Za-z0-9_:${}().\/-]*)/g))
      out.add(m[1]);
    return out;
  };

  /** Does any call site reach this route? `:x` matches a literal, a template hole or a concatenation boundary. */
  const isWired = (route, calls) => {
    const rx = new RegExp(
      "^" +
        route
          .split("/")
          .map((seg) =>
            seg === ":x" ? "[^/]*" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join("/") +
        "($|[/?`'\"])",
    );
    for (const call of calls) {
      if (rx.test(call.replace(/\$\{[^}]*\}/g, "X"))) return true;
    }
    return false;
  };

  const web = usedBy("server/templates/admin.html");
  const mobile = new Set([
    ...MOBILE_FILES.flatMap((f) => [...usedBy(f)]),
    ...usedBy("client/screens/WebsiteCmsTab.tsx"),
    ...usedBy("client/lib/adminAuth.ts"),
  ]);

  /**
   * Endpoints that deliberately have no dashboard control.
   *
   * Category (3) in the brief: API/internal. Each is either an auth mechanism the
   * user never "clicks", a feed consumed by another endpoint, or a read-only alias
   * of data that already has a screen. None of them is an operator action.
   */
  const INTENTIONALLY_NO_UI = new Map([
    [
      "/api/admin/login",
      "auth: the login form posts it; it is not a dashboard control",
    ],
    [
      "/api/admin/logout",
      "auth: reached from the sign-out button and /admin/logout",
    ],
    [
      "/api/admin/session",
      "auth: the validity probe added by H-64, never user-facing",
    ],
    [
      "/api/admin/picker-products",
      "feed consumed by other admin screens, not a page",
    ],
    [
      "/api/admin/batches/:x/add-order",
      "dispatch internals — batches are built by the engine; the operator's control is remove-order + redistribute",
    ],
    [
      "/api/admin/analytics",
      "superseded by the merged analytics/LiveOps dashboards",
    ],
    [
      "/api/admin/operations",
      "superseded by the merged analytics/LiveOps dashboards",
    ],
    [
      "/api/admin/wallet-transactions",
      "read-only alias of the settlements collection, which has a full screen",
    ],
    [
      "/api/admin/categories/cleanup",
      "one-off maintenance; deliberately not a button — it deletes categories in bulk",
    ],
    [
      "/api/admin/vendor-partners/:x/products",
      "duplicate of /api/admin/vendor-products?vendorId, which the merchant modal uses",
    ],
    [
      "/api/admin/vendor-partners/:x/rating",
      "duplicate of the ratings screen's own PUT/DELETE",
    ],
    [
      "/api/admin/vendors/:x/statement",
      "duplicate of /api/admin/vendors/:id/settlement-history, which the registry uses",
    ],
  ]);

  test("every admin endpoint is either wired to a surface or classified", () => {
    const unaccounted = [...defined]
      .filter(
        (p) =>
          !isWired(p, web) &&
          !isWired(p, mobile) &&
          !INTENTIONALLY_NO_UI.has(p),
      )
      .sort();
    assert.deepEqual(
      unaccounted,
      [],
      "an admin endpoint has no UI and no documented reason:\n" +
        unaccounted.join("\n"),
    );
  });

  test("the classification does not name endpoints that no longer exist", () => {
    const stale = [...INTENTIONALLY_NO_UI.keys()]
      .filter((p) => !defined.has(p))
      .sort();
    assert.deepEqual(
      stale,
      [],
      `classified endpoints that were deleted:\n${stale.join("\n")}`,
    );
  });

  test("every classification carries a reason, not just a name", () => {
    for (const [path, why] of INTENTIONALLY_NO_UI) {
      assert.ok(why && why.length > 20, `${path} has no real justification`);
    }
  });

  test("the operator-facing surface did not shrink", () => {
    // A floor, not an exact count: wiring more is fine, quietly losing a screen is not.
    const reachable = [...defined].filter(
      (p) => isWired(p, web) || isWired(p, mobile),
    );
    assert.ok(
      reachable.length >= 70,
      `only ${reachable.length} admin endpoints are reachable from a surface`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · 1+2+3. store info, security and regions", () => {
  test("7. the admin writes the same fields the app reads", () => {
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /vendorUpdates\.address = String\(body\.location\);/,
      "the admin's location edit never reaches the app's `address`",
    );
    assert.match(
      code,
      /vendorUpdates\.bio = String\(body\.description\);/,
      "the admin's blurb edit never reaches the app's `bio`",
    );
    assert.match(code, /address: v\.address \|\| v\.location \|\| ""/);
    assert.match(code, /bio: v\.bio \|\| v\.description \|\| ""/);
  });

  test("7. deliveryTime is editable from the dashboard and is the vendor's own field", () => {
    const admin = stripComments(ADMIN);
    assert.match(admin, /id="medit-deliveryTime"/);
    assert.match(
      admin,
      /deliveryTime:\s+document\.getElementById\('medit-deliveryTime'\)\.value\.trim\(\)/,
    );
    assert.match(
      stripComments(ROUTES),
      /if \(body\.deliveryTime !== undefined\) vendorUpdates\.deliveryTime = String\(body\.deliveryTime\);/,
    );
    assert.match(
      stripComments(VENDOR),
      /if \(deliveryTime !== undefined\) updates\.deliveryTime = deliveryTime;/,
      "the vendor app must still write the same field",
    );
  });

  test("15. the security card uses the existing endpoint and no second auth system", () => {
    const admin = stripComments(ADMIN);
    assert.match(admin, /id="sec-current-password"/);
    assert.match(admin, /id="sec-new-password"/);
    assert.match(admin, /id="sec-confirm-password"/);
    assert.match(admin, /\/admin\/change-credentials/);
    // The server keeps every guard: session, current password, and full invalidation.
    const index = stripComments(INDEX);
    assert.match(
      index,
      /if \(!isValidSession\(req\)\) return res\.status\(401\)/,
    );
    assert.match(index, /كلمة المرور الحالية غير صحيحة/);
    assert.match(index, /invalidateAllSessions\(\);/);
    // …and the page signs itself out afterwards, because its own session is dead.
    assert.match(admin, /window\.location\.href = '\/admin\/login'/);
  });

  test("3. zones is gone — deliveryAreas is the only region source", () => {
    const routes = stripComments(ROUTES);
    for (const verb of ["get", "post", "put", "delete", "patch"]) {
      assert.doesNotMatch(
        routes,
        new RegExp(`app\\.${verb}\\("/api/admin/zones`),
        "a second region CRUD is back",
      );
    }
    assert.doesNotMatch(
      routes,
      /collection\("zones"\)/,
      "the zones collection is read again",
    );
    const admin = stripComments(ADMIN);
    assert.doesNotMatch(
      admin,
      /id="zones-table-body"/,
      "the zones tab is back",
    );
    assert.doesNotMatch(admin, /zoneManagement/, "the zones nav entry is back");
    // …and the real source is still fully wired on both surfaces.
    assert.match(admin, /\/admin\/delivery-areas/);
    assert.match(stripComments(MOBILE), /\/api\/admin\/delivery-areas/);
    assert.match(routes, /app\.put\("\/api\/admin\/delivery-areas\/:id"/);
  });

  test("D. the dashboard fetches the orders collection once, not four times", () => {
    const admin = stripComments(ADMIN);
    const direct =
      [...admin.matchAll(/fetch\(API_BASE \+ '\/admin\/orders'\)/g)].length +
      [...admin.matchAll(/fetch\(`\$\{API_BASE\}\/admin\/orders`\)/g)].length;
    assert.equal(
      direct,
      1,
      `${direct} direct /admin/orders fetches — they must share one`,
    );
    assert.match(admin, /async function fetchOrdersShared\(/);
    assert.match(
      admin,
      /_ordersInFlight/,
      "concurrent callers must share one request",
    );
  });

  test("C. the settings revenue figure comes from the server aggregate", () => {
    const admin = stripComments(ADMIN);
    assert.doesNotMatch(
      admin,
      /allOrds\.reduce\(\(s, o\) => s \+ \(o\.total \|\| 0\) \+ \(o\.deliveryFee \|\| 0\), 0\)/,
      "money is recomputed in the browser from a bounded page again",
    );
    assert.match(admin, /data\.totalDeliveryFees \|\| 0/);
    assert.match(admin, /data\.totalDeliveredOrders \|\| 0/);
  });

  test("A. every admin route sits behind the one guard, and there are no fake permissions", () => {
    const routes = read("server/routes.ts");
    const guardAt = routes.indexOf('app.use("/api/admin", requireAdminAuth)');
    assert.ok(guardAt > -1, "the blanket admin guard is gone");
    const firstAdminRoute = routes.search(
      /app\.(get|post|put|patch|delete)\("\/api\/admin\//,
    );
    assert.ok(
      guardAt < firstAdminRoute,
      "an admin route is registered before the guard",
    );
    // The system has exactly one privilege level. The UI must not imply otherwise.
    const admin = stripComments(ADMIN);
    assert.doesNotMatch(
      admin,
      /\brole\s*===\s*['"]/,
      "the dashboard branches on a role that does not exist",
    );
  });
});
