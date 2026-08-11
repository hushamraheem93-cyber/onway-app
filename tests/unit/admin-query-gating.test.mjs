/**
 * Admin panel query-gating tests (audit finding H-43).
 *
 * The finding: "12 unconditional queries + a 6-second poll. Opening the panel to
 * review one order downloads the whole catalogue, every user, every vendor product
 * and every promo code — regardless of the open tab. Then 10 requests a minute
 * forever, each re-rendering a 4,403-line component with no useMemo."
 *
 * Checked against HEAD, the counts were worse and one conclusion was wrong:
 *
 *   CONFIRMED  the ungated fetches — 13 of 15 queries, not 12.
 *   CONFIRMED  the 6s poll on /api/admin/orders, and the ~10 req/min it implies.
 *   CONFIRMED  zero useMemo in the file.
 *   CORRECTED  the file is 8,620 lines, not 4,403 — it nearly doubled since.
 *   CORRECTED  the poll rate is higher than reported: /api/admin/settlement-requests
 *              also polls, every 15s, ungated. Real steady state is ~14 req/min on
 *              any tab, not 10.
 *   FALSE      that the 6s poll is pure waste. It feeds the new-order sound alert
 *              (playRepeatingAlert), which has to fire whatever tab is open. Gating
 *              it by tab would silence new-order alerts — a business regression, so
 *              it is deliberately untouched.
 *
 * The fix gates only the queries whose data no other tab reads. Three consumers
 * block gating and were found by tracing rather than assumed: the tab bar renders
 * badges from `drivers`, `vendorPartners` and `settlementRequests` on EVERY tab, so
 * those must keep loading.
 *
 * These tests re-derive the consumer map from the shipped source on every run, so
 * they fail if a future edit reads a gated dataset from a tab that does not fetch
 * it — the exact way this change could break.
 *
 * Run:  node --test tests/unit/admin-query-gating.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const SRC = readFileSync(join(root, "client/screens/AdminScreen.tsx"), "utf8");

/**
 * Mask comments and string/template contents with spaces, character for character,
 * so offsets computed on the raw source stay valid on the masked copy.
 *
 * Comments must be skipped BEFORE strings, not after: this file is full of Arabic
 * prose, and a single apostrophe inside a comment would otherwise open a "string"
 * that swallows hundreds of lines of real code — the same trap documented in
 * tests/unit/_source.mjs. Blanking rather than deleting keeps every index aligned.
 */
function maskNonCode(s) {
  const out = Array.from(s);
  const blank = (from, to) => {
    for (let k = from; k < to && k < s.length; k += 1) {
      if (s[k] !== "\n") out[k] = " ";
    }
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (c === "/" && next === "/") {
      const end = s.indexOf("\n", i);
      blank(i, end === -1 ? s.length : end);
      i = end === -1 ? s.length : end;
    } else if (c === "/" && next === "*") {
      const end = s.indexOf("*/", i + 2);
      const stop = end === -1 ? s.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === c) break;
        if (s[j] === "\n" && c !== "`") break; // unterminated: not a string
        j += 1;
      }
      blank(i, Math.min(j + 1, s.length));
      i = j + 1;
    } else i += 1;
  }
  return out.join("");
}
const CODE = maskNonCode(SRC);

/** The balanced body that follows an arrow at `pos` — handles `=> (` and `=> {`. */
function arrowBody(s, pos) {
  let i = pos;
  while (/\s/.test(s[i])) i += 1;
  const open = s[i];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === open) depth += 1;
    else if (s[j] === close) {
      depth -= 1;
      if (depth === 0) return [i, j + 1];
    }
  }
  throw new Error("unbalanced arrow body");
}

/** Every `renderXxxTab` and the span it occupies. */
const TAB_SPANS = (() => {
  const spans = {};
  for (const m of SRC.matchAll(/const (render\w+Tab) = \(\) =>/g)) {
    spans[m[1]] = arrowBody(SRC, m.index + m[0].length);
  }
  return spans;
})();

/** Every useQuery call: its key, its `enabled` expression, its refetchInterval. */
const QUERIES = (() => {
  const out = [];
  for (const m of SRC.matchAll(/useQuery</g)) {
    const i = SRC.indexOf("({", m.index);
    let depth = 0;
    let end = i;
    for (let j = i + 1; j < SRC.length; j += 1) {
      if (SRC[j] === "{") depth += 1;
      else if (SRC[j] === "}") { depth -= 1; if (depth === 0) { end = j + 1; break; } }
    }
    const body = SRC.slice(i, end);
    out.push({
      key: body.match(/queryKey:\s*\[([^\]]*)\]/)?.[1]?.trim() ?? "?",
      enabled: body.match(/enabled:\s*([^,\n]+)/)?.[1]?.trim() ?? null,
      interval: body.match(/refetchInterval:\s*([^,\n]+)/)?.[1]?.trim() ?? null,
    });
  }
  return out;
})();

/** Which render*Tab bodies genuinely reference `name` (strings excluded)? */
function tabsUsing(name) {
  const re = new RegExp(`(?<![\\w.])${name}\\b`);
  return Object.entries(TAB_SPANS)
    .filter(([, [a, b]]) => re.test(CODE.slice(a, b)))
    .map(([fn]) => fn.replace("render", "").replace("Tab", ""));
}

/** Does anything OUTSIDE every tab body reference `name`, beyond its declaration? */
function usedOutsideTabs(name) {
  const re = new RegExp(`(?<![\\w.])${name}\\b`, "g");
  const spans = Object.values(TAB_SPANS);
  const hits = [];
  for (const m of CODE.matchAll(re)) {
    if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const lineStart = SRC.lastIndexOf("\n", m.index) + 1;
    const line = SRC.slice(lineStart, SRC.indexOf("\n", m.index));
    // Skip declarations and type annotations — neither reads the data at runtime:
    //   `const { data: adminUsers = [], …`  destructuring with a default
    //   `data: adminUsers = [],`            the same, wrapped across lines
    //   `products: number;`                 a type inside a useQuery<{…}> generic
    if (/useQuery|const \{|const \w+(:|\s*=)|\w+:\s*\w+(\[\])?;|\w+:\s*\w+\s*=/.test(line)) continue;
    hits.push({ line: SRC.slice(0, m.index).split("\n").length, text: line.trim() });
  }
  return hits;
}

/** Variable name → tab keys whose render function reads it. */
const TAB_KEY = {
  Dashboard: "dashboard", Users: "users", Banners: "banners",
  Categories: "categories", Products: "products", Areas: "areas",
  Orders: "orders", Drivers: "drivers", PromoCodes: "promoCodes",
  Vendors: "vendors", Settings: "settings", Settlements: "settlements",
  Notifications: "notifications", Storage: "storage",
};

// ─────────────────────────────────────────────────────────────────────────────
describe("H-43 · the shape of the problem, re-measured each run", () => {
  test("the screen still has the queries this analysis was built on", () => {
    assert.equal(QUERIES.length, 16,
      `${QUERIES.length} queries now — the gating analysis needs redoing`);
  });

  test("only four queries stay ungated, and each feeds the tab bar", () => {
    // These four are the irreducible set: three tab-bar badges plus the orders
    // poll that drives the audible new-order alert. Everything else is tab-gated.
    const ungated = QUERIES.filter((q) => !q.enabled).map((q) => q.key);
    assert.deepEqual(ungated.sort(), [
      '"/api/admin/drivers"',
      '"/api/admin/orders"',
      '"/api/admin/settlement-requests"',
      '"/api/admin/vendor-partners"',
    ].sort(), "the ungated set changed — re-justify every entry");
  });

  test("every other query is tab-gated", () => {
    assert.equal(QUERIES.filter((q) => q.enabled).length, 12,
      "a gate was removed");
  });
});

describe("H-43 · gating is correct: every gated query covers all its readers", () => {
  // This is the test that matters. For each gated query, the tabs allowed by its
  // `enabled` expression must be a superset of the tabs that actually read its data.
  const GATED = [
    ["banners", '"/api/admin/banners"'],
    ["categories", '"/api/categories"'],
    ["products", '"/api/admin/products"'],
    ["deliveryAreas", '"/api/admin/delivery-areas"'],
    ["promoCodes", '"/api/admin/promo-codes"'],
    ["allVendorProducts", '"/api/admin/vendor-products"'],
    ["feesSettings", '"/api/settings/fees"'],
    ["adminUsers", '"/api/admin/users"'],
    ["ownerEarnings", '"/api/admin/owner-earnings"'],
  ];

  for (const [variable, key] of GATED) {
    test(`${variable}: every tab that reads it also fetches it`, () => {
      const q = QUERIES.find((x) => x.key === key);
      assert.ok(q, `${key} disappeared`);
      assert.ok(q.enabled, `${key} is no longer gated`);
      const allowed = [...q.enabled.matchAll(/activeTab === "(\w+)"/g)].map((m) => m[1]);
      assert.ok(allowed.length > 0, `${key}'s enabled expression has no tab test`);

      const readers = tabsUsing(variable)
        .map((t) => TAB_KEY[t])
        .filter(Boolean);
      const uncovered = readers.filter((t) => !allowed.includes(t));
      assert.deepEqual(uncovered, [],
        `${variable} is read by [${uncovered}] but only fetched on [${allowed}] — ` +
        "that tab would render empty data");
    });
  }

  test("no gated dataset is read outside the tab bodies", () => {
    // A badge, a header or an effect reading gated data would break on other tabs.
    const offenders = [];
    for (const [variable] of GATED) {
      for (const hit of usedOutsideTabs(variable)) {
        offenders.push(`${variable} @${hit.line}: ${hit.text}`);
      }
    }
    assert.deepEqual(offenders, [],
      `gated data is read outside a tab body:\n${offenders.join("\n")}`);
  });
});

describe("H-43 · the queries that stayed ungated had to", () => {
  for (const [variable, why] of [
    ["drivers", "tab-bar badge"],
    ["vendorPartners", "tab-bar badge"],
    ["settlementRequests", "tab-bar badge"],
  ]) {
    test(`${variable} feeds a ${why}, so it must load on every tab`, () => {
      const outside = usedOutsideTabs(variable);
      assert.ok(outside.length > 0,
        `${variable} is no longer read outside a tab — it could now be gated`);
      assert.ok(outside.some((h) => /badge:/.test(h.text)),
        `${variable}'s cross-tab use is no longer a badge — re-check the reason`);
    });
  }

  test("adminOrders stays ungated because the alert needs it everywhere", () => {
    assert.ok(tabsUsing("adminOrders").includes("Dashboard"));
    assert.equal(QUERIES.find((q) => q.key === '"/api/admin/orders"')?.enabled, null,
      "gating the orders query would silence the new-order alert on other tabs");
  });
});

describe("H-43 · the 6s poll is a feature, not waste", () => {
  test("it still polls every 6 seconds", () => {
    const q = QUERIES.find((x) => x.key === '"/api/admin/orders"');
    assert.equal(q?.interval, "6000",
      "the orders poll interval changed — the new-order alert depends on it");
  });

  test("its data drives the audible new-order alert", () => {
    // Gating this by tab would stop an admin on any other tab from hearing a new
    // order arrive. That is why it is not gated.
    const at = CODE.indexOf("playRepeatingAlert(");
    assert.ok(at > 0, "the new-order alert disappeared");
    const effectStart = CODE.lastIndexOf("useEffect(", at);
    const effect = CODE.slice(effectStart, CODE.indexOf("}, [adminOrders]);", effectStart) + 18);
    assert.match(effect, /adminOrders\.filter/,
      "the alert no longer derives from the polled orders");
    assert.match(effect, /\}, \[adminOrders\]\);/,
      "the alert effect no longer re-runs when the polled orders change");
  });

  test("the alert still skips the first load", () => {
    assert.match(CODE, /isFirstAdminOrderLoad\.current\s*=\s*false/,
      "the first-load guard went away — the panel would beep on every open");
  });
});

describe("H-43 · nothing else about the screen changed", () => {
  test("the tab list and the default tab are untouched", () => {
    assert.match(SRC, /useState<TabType>\("dashboard"\)/,
      "the landing tab changed, which changes what loads on open");
  });

  test("the two settlement queries keep their own pre-existing gates", () => {
    const acct = QUERIES.find((q) => q.key.includes("settlement-accounts"));
    const cfg = QUERIES.find((q) => q.key.includes("settlement-config"));
    assert.match(acct?.enabled ?? "", /activeTab === "settlements"/);
    assert.match(cfg?.enabled ?? "", /activeTab === "settlements"/);
  });

  test("the settlement polls are unchanged", () => {
    assert.equal(QUERIES.find((q) => q.key.includes("settlement-requests"))?.interval, "15000");
    assert.equal(QUERIES.find((q) => q.key.includes("settlement-accounts"))?.interval, "20000");
  });

  test("no query lost its key", () => {
    for (const q of QUERIES) assert.notEqual(q.key, "?", "a queryKey became unreadable");
  });
});

describe("H-43 · what one open now costs", () => {
  /** Queries that fire for a given tab: ungated ones plus those enabling it. */
  const firesOn = (tab) =>
    QUERIES.filter((q) => !q.enabled || q.enabled.includes(`"${tab}"`)).length;

  test("landing on the dashboard fetches 6, not 13", () => {
    assert.equal(firesOn("dashboard"), 6,
      "the dashboard's fetch count moved — re-measure the finding");
  });

  test("no tab fetches more than it did before H-43", () => {
    // Guards requirement 6: the fix must not trade one cost for a bigger one.
    for (const tab of Object.values(TAB_KEY)) {
      assert.ok(firesOn(tab) <= 6,
        `${tab} fetches ${firesOn(tab)} queries — more than the post-fix ceiling`);
    }
  });

  test("every tab fetches fewer than the old unconditional 15", () => {
    for (const tab of Object.values(TAB_KEY)) {
      assert.ok(firesOn(tab) < 15, `${tab} still fetches ${firesOn(tab)} queries`);
    }
  });

  test("the heaviest payloads no longer load on the dashboard", () => {
    for (const key of ['"/api/admin/products"', '"/api/admin/vendor-products"',
      '"/api/admin/promo-codes"', '"/api/admin/banners"', '"/api/categories"',
      '"/api/admin/delivery-areas"', '"/api/settings/fees"']) {
      const q = QUERIES.find((x) => x.key === key);
      assert.ok(!q.enabled.includes('"dashboard"'),
        `${key} still downloads when the panel merely opens`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The second half of H-43: the user-count fetch, and the "no useMemo" claim.
// ─────────────────────────────────────────────────────────────────────────────
const SERVER = readFileSync(join(root, "server/routes.ts"), "utf8");

describe("H-43 · the dashboard no longer downloads every user for one number", () => {
  test("the full user list is fetched only by the tab that lists users", () => {
    const q = QUERIES.find((x) => x.key === '"/api/admin/users"');
    assert.equal(q?.enabled, 'activeTab === "users"',
      "the dashboard is downloading every user document again");
  });

  test("the dashboard reads its count from the aggregate endpoint", () => {
    const q = QUERIES.find((x) => x.key === '"/api/admin/dashboard-stats"');
    assert.ok(q, "the aggregate query disappeared");
    assert.equal(q.enabled, 'activeTab === "dashboard"',
      "the aggregate is fetched outside the dashboard, or unconditionally");
    assert.match(CODE, /value: dashboardStats\?\.users \?\? 0/,
      "the dashboard tile went back to counting the downloaded array");
  });

  test("that endpoint counts server-side instead of streaming documents", () => {
    // This is what makes the swap a win rather than a shuffle: no user document
    // crosses the wire, and none is streamed into the server process either.
    const at = SERVER.indexOf('app.get("/api/admin/dashboard-stats"');
    assert.ok(at > 0, "the aggregate endpoint disappeared from the server");
    const handler = SERVER.slice(at, SERVER.indexOf("app.get(", at + 10));
    assert.match(handler, /db\.collection\("users"\)\.count\(\)\.get\(\)/,
      "the endpoint stopped using the server-side count aggregation");
    assert.match(handler, /users: usersCount\.data\(\)\.count/,
      "the endpoint no longer reports the user count in that shape");
  });

  test("no API contract changed — the endpoint already existed", () => {
    // Requirement: additive only. /api/admin/users is untouched and still returns
    // the full list for the tab that needs it.
    const at = SERVER.indexOf('app.get("/api/admin/users"');
    assert.ok(at > 0, "the users endpoint was removed");
    assert.match(SERVER.slice(at, at + 400), /const users = await getAllUsers\(\);\s*res\.json\(users\);/,
      "the /api/admin/users contract changed — consumers outside this screen may break");
  });

  test("the users tab still gets the whole list it needs", () => {
    assert.ok(tabsUsing("adminUsers").includes("Users"),
      "the users tab stopped reading the list");
    for (const marker of [/const filtered = adminUsers\.filter\(/,
      /adminUsers\.filter\(\(u\) => !!u\.pushToken\)\.length/]) {
      assert.match(CODE, marker, "a users-tab computation lost its data");
    }
  });
});

describe("H-43 · the 'no useMemo' claim, decided by measurement", () => {
  // The finding treats the absent useMemo as a defect. Measured, it is not one, and
  // this repository's rule is to memoize only where it prevents real work. Two facts
  // decide it, and both are re-checked here rather than asserted once in a report.

  test("react-query's structural sharing is left on, so an unchanged poll re-renders nothing", async () => {
    const { replaceEqualDeep } = await import("@tanstack/query-core");
    const orders = Array.from({ length: 400 }, (_, i) => ({
      id: `o${i}`, status: i % 9 === 0 ? "pending" : "delivered", total: 1000 + i,
    }));
    let prev = orders;
    let renders = 0;
    for (let poll = 0; poll < 10; poll += 1) {
      const refetched = JSON.parse(JSON.stringify(prev)); // same data, new objects
      const next = replaceEqualDeep(prev, refetched);
      if (next !== prev) renders += 1;
      prev = next;
    }
    assert.equal(renders, 0,
      "ten polls with no new order caused re-renders — the useMemo question reopens");

    // And a genuine change still propagates, or the alert would never fire.
    const withNew = [...prev, { id: "new", status: "pending", total: 1 }];
    assert.notEqual(replaceEqualDeep(prev, withNew), prev,
      "a new order did not change the reference — the alert would never fire");
  });

  test("structuralSharing is not disabled in the query client", () => {
    const qc = readFileSync(join(root, "client/lib/query-client.ts"), "utf8");
    assert.doesNotMatch(qc, /structuralSharing:\s*false/,
      "structural sharing was switched off — every poll now re-renders the panel");
  });

  test("the per-render derivations stay far inside one frame", () => {
    // The heaviest is the vendor→products grouping in the vendors tab. At the
    // scale this platform operates at it is a fraction of a 60fps frame, which is
    // why it is left un-memoised.
    const all = [];
    for (let v = 0; v < 60; v += 1) {
      for (let p = 0; p < 50; p += 1) {
        all.push({ vendorId: `v${v}`, id: `p${v}_${p}`, status: p % 3 ? "approved" : "pending" });
      }
    }
    const build = () => {
      const map = {};
      all.forEach((p) => { (map[p.vendorId] ??= []).push(p); });
      return map;
    };
    for (let i = 0; i < 500; i += 1) build();
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 2000; i += 1) build();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 2000;
    assert.ok(ms < 16.7,
      `the grouping costs ${ms.toFixed(3)}ms per render — over a frame, so memoising ` +
      "it would now be justified");
  });

  test("the grouping produces the same result however often it runs", () => {
    // Requirement 10: whatever we do or do not memoise, the values must not move.
    const all = [
      { vendorId: "v1", id: "a", status: "approved" },
      { vendorId: "v2", id: "b", status: "pending" },
      { vendorId: "v1", id: "c", status: "approved" },
    ];
    const build = () => {
      const map = {};
      all.forEach((p) => { (map[p.vendorId] ??= []).push(p); });
      return map;
    };
    const first = build();
    const second = build();
    assert.deepEqual(first, second, "the grouping is not deterministic");
    assert.deepEqual(Object.keys(first).sort(), ["v1", "v2"]);
    assert.equal(first.v1.length, 2);
    assert.equal(first.v1.filter((p) => p.status === "approved").length, 2);
  });

  test("no cosmetic memoisation was added to satisfy the finding", () => {
    // If a future change adds useMemo here it should be because a measurement
    // demanded it — and this test should be updated with that measurement.
    assert.equal((CODE.match(/\buseMemo\s*\(/g) ?? []).length, 0,
      "useMemo appeared without a measurement justifying it; add the numbers here");
  });
});

describe("H-43 · no timers, listeners or staleness introduced", () => {
  test("the screen still has exactly one interval, for driver tracking", () => {
    const intervals = CODE.match(/setInterval\s*\(/g) ?? [];
    assert.equal(intervals.length, 1,
      `${intervals.length} setInterval calls — the fix added a timer`);
    assert.match(CODE, /trackingIntervalRef\.current = setInterval\(/,
      "the one interval is no longer the tracking one");
  });

  test("that interval is cleared before being replaced and on teardown", () => {
    const clears = CODE.match(/clearInterval\s*\(/g) ?? [];
    assert.ok(clears.length >= 2,
      "the tracking interval is not cleared on both paths — it would duplicate");
  });

  test("the gates add no effects or listeners", () => {
    assert.equal((CODE.match(/useEffect\s*\(/g) ?? []).length, 7,
      "the effect count changed — the fix was supposed to be declarative only");
    assert.equal((CODE.match(/addEventListener\s*\(/g) ?? []).length, 0,
      "an event listener appeared");
  });

  test("gating cannot serve stale data: the cache window is unchanged", () => {
    const qc = readFileSync(join(root, "client/lib/query-client.ts"), "utf8");
    assert.match(qc, /staleTime:\s*5 \* 60 \* 1000/,
      "the stale window moved — re-check that a returning tab still refetches when it should");
    assert.match(qc, /refetchOnWindowFocus:\s*false/,
      "focus refetching changed, which alters what a gated tab shows on return");
  });

  test("no gated query disables its own refetch on mount", () => {
    // `enabled` defers; it must not be paired with anything that would keep a tab
    // showing data from before it was last opened.
    for (const q of QUERIES.filter((x) => x.enabled)) {
      assert.ok(!/refetchOnMount:\s*false/.test(q.enabled), `${q.key} pins stale data`);
    }
    assert.doesNotMatch(CODE, /refetchOnMount:\s*false/,
      "a query was set never to refetch on mount — gated tabs could show stale data");
  });
});
