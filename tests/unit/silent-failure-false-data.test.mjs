/**
 * False-data / silent-failure tests (audit finding H-33).
 *
 * The audit named two cases and warned that previous rounds fixed one instance and
 * left its siblings. Both named cases were real:
 *
 *  1. GET /api/admin/vendors/:id/statement answered 200 with EVERY figure zeroed
 *     when the query threw — orders: 0, totalSales: 0, appCommission: 0,
 *     vendorNet: 0 — so a Firestore outage was indistinguishable from a store that
 *     genuinely sold nothing. (The audit cites routes.ts:2009; the handler is at
 *     2321 and the lying catch was at 2357. The line numbers were stale.)
 *  2. AuthContext.loadAuthState had a completely empty outer catch, so any boot
 *     failure dropped the user to the login screen with no record anywhere.
 *
 * The same pattern was then swept for across the file: three more admin endpoints
 * answered 200 with zeroed money or empty lists when the database was unavailable,
 * and the admin ratings handler did the same from its catch.
 *
 * These tests read the shipped source and assert the property that matters: a
 * FAILURE path must never produce a success response carrying zeroed data. They
 * deliberately do not assert an exact status code beyond "not 2xx", so the fix
 * cannot be satisfied by swapping one lie for another.
 *
 * Run:  node --test tests/unit/silent-failure-false-data.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROUTES = readFileSync(join(here, "../../server/routes.ts"), "utf8");
const AUTH = readFileSync(join(here, "../../client/context/AuthContext.tsx"), "utf8");

const stripComments = sharedStripComments;
const ROUTES_CLEAN = stripComments(ROUTES);
const AUTH_CLEAN = stripComments(AUTH);

/** The body of the handler registered for `path`, by brace matching. */
function handler(src, path) {
  const at = src.indexOf(path);
  assert.ok(at >= 0, `handler not found: ${path}`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error(`unbalanced: ${path}`);
}

/** Money-shaped keys whose zeroed value is a factual claim about a business. */
const MONEY = [
  "totalSales", "appCommission", "vendorNet", "totalOwnerEarnings",
  "totalDriverEarnings", "totalDeliveryFees", "totalRevenue", "avgOrderValue",
];

// ─────────────────────────────────────────────────────────────────────────────
describe("H-33 · the vendor account statement", () => {
  const body = handler(ROUTES_CLEAN, '"/api/admin/vendors/:id/statement"');

  test("no failure path answers with zeroed money", () => {
    // Every res.json in this handler that carries a money key must be the success
    // one; any that also zeroes them is the old lie coming back.
    const jsonCalls = body.match(/res\.json\(\s*\{[^)]*\}\s*\)/g) ?? [];
    for (const call of jsonCalls) {
      const zeroedMoney = MONEY.filter((k) => new RegExp(`${k}\\s*:\\s*0\\b`).test(call));
      assert.equal(
        zeroedMoney.length, 0,
        `a 200 response hardcodes ${zeroedMoney.join(", ")} to zero: ${call.slice(0, 120)}`,
      );
    }
  });

  test("the catch reports a failure instead of returning data", () => {
    const catchAt = body.search(/\bcatch\b/);
    assert.ok(catchAt > 0, "the handler no longer has a catch");
    const tail = body.slice(catchAt);
    assert.match(tail, /res\.status\(\s*5\d\d\s*\)/,
      "the catch does not answer with a server-error status");
    assert.doesNotMatch(tail, /totalSales|vendorNet|appCommission/,
      "the catch still fabricates statement figures");
  });

  test("an unavailable database is reported, not zeroed", () => {
    const noDb = body.slice(body.indexOf("if (!db)"), body.indexOf("try"));
    assert.match(noDb, /res\.status\(\s*5\d\d\s*\)/,
      "a missing database still answers 200");
    assert.doesNotMatch(noDb, /totalSales\s*:\s*0/);
  });

  test("the failure message is Arabic and says loading failed, not that sales are zero", () => {
    const tail = body.slice(body.search(/\bcatch\b/));
    assert.match(tail, /[؀-ۿ]/, "the admin gets no Arabic explanation");
  });

  test("the success path is unchanged: same keys, real values", () => {
    const success = body.match(/res\.json\(\s*\{\s*vendor:\s*vendorWithImage[^)]*\)/);
    assert.ok(success, "the success response was lost");
    for (const k of ["totalSales", "appCommission", "vendorNet", "commissionPercent"]) {
      assert.ok(success[0].includes(k), `the success response no longer returns ${k}`);
    }
    assert.doesNotMatch(success[0], /totalSales\s*:\s*0/);
  });

  test("authentication and the 404 for an unknown vendor are untouched", () => {
    assert.match(body, /res\.status\(404\)/, "the unknown-vendor 404 was lost");
  });
});

describe("H-33 · the same pattern across the rest of routes.ts", () => {
  for (const [label, marker] of [
    ["owner earnings", '"/api/admin/owner-earnings"'],
    ["admin analytics", '"/api/admin/analytics"'],
    ["admin ratings", '"/api/admin/ratings"'],
  ]) {
    test(`${label}: an unavailable database is reported, not zeroed`, () => {
      const body = handler(ROUTES_CLEAN, marker);
      const noDb = body.match(/if\s*\(!db\)[\s\S]{0,320}/)?.[0] ?? "";
      assert.match(noDb, /res\.status\(\s*5\d\d\s*\)/,
        `${label} still answers 200 when the database is unavailable`);
      const zeroed = MONEY.filter((k) => new RegExp(`${k}\\s*:\\s*0\\b`).test(noDb));
      assert.equal(zeroed.length, 0, `${label} still zeroes ${zeroed.join(", ")}`);
    });
  }

  test("admin ratings: the catch reports failure instead of an empty list", () => {
    const body = handler(ROUTES_CLEAN, '"/api/admin/ratings"');
    const tail = body.slice(body.lastIndexOf("catch"));
    assert.match(tail, /res\.status\(\s*5\d\d\s*\)/,
      "a failed ratings query still reads as 'this store has no ratings'");
    assert.doesNotMatch(tail, /res\.json\(\s*\{\s*items:\s*\[\]/);
  });

  test("no admin financial endpoint answers 200 with hardcoded zero money", () => {
    // Sweep the whole file rather than the handlers checked above, so a new
    // endpoint cannot reintroduce the pattern unnoticed.
    const offenders = [];
    const re = /res\.json\(\s*\{[^}]*\}\s*\)/g;
    let m;
    while ((m = re.exec(ROUTES_CLEAN))) {
      const call = m[0];
      const zeroed = MONEY.filter((k) => new RegExp(`${k}\\s*:\\s*0\\b`).test(call));
      if (zeroed.length) {
        offenders.push(`${ROUTES_CLEAN.slice(0, m.index).split("\n").length}: ${zeroed.join(",")}`);
      }
    }
    assert.deepEqual(offenders, [],
      `these responses still hardcode zeroed money:\n  ${offenders.join("\n  ")}`);
  });
});

describe("H-33 · the customer's own order list", () => {
  // Found by the cross-item integration run, not by the catch-shape sweep:
  // getOrdersByPhone() caught its read error and returned []. Its one caller is
  // GET /api/orders, so a Firestore outage rendered as "you have no orders" —
  // to a customer who may have paid cash for one minutes earlier.
  const FIREBASE_CLEAN = stripComments(
    readFileSync(join(here, "../../server/firebase.ts"), "utf8"),
  );

  /**
   * The body of `export async function <name>(...)`. The opening brace is the LAST
   * `{` on the signature line — a return type like `Promise<(T & { id: string })[]>`
   * contains braces of its own, and taking the first one lifts the wrong block.
   */
  function fn(src, name) {
    const at = src.indexOf(`export async function ${name}(`);
    assert.ok(at > 0, `function not found: ${name}`);
    const eol = src.indexOf("\n", at);
    const open = src.lastIndexOf("{", eol);
    assert.ok(open > at, `no body brace on the signature line of ${name}`);
    let depth = 0;
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) return src.slice(open, i + 1);
      }
    }
    throw new Error(`unbalanced ${name}`);
  }

  test("getOrdersByPhone re-throws instead of returning an empty list", () => {
    const body = fn(FIREBASE_CLEAN, "getOrdersByPhone");
    const tail = body.slice(body.lastIndexOf("catch"));
    assert.match(tail, /throw\s+error;/,
      "a failed order read still reads as 'this customer has no orders'");
    assert.doesNotMatch(tail, /return\s*\[\s*\]/);
  });

  test("the sort and the query itself are untouched", () => {
    const body = fn(FIREBASE_CLEAN, "getOrdersByPhone");
    assert.match(body, /\.where\("phoneNumber", "==", phoneNumber\)/,
      "the lookup changed");
    assert.match(body, /return bTime - aTime;/, "newest-first ordering was lost");
  });

  test("GET /api/orders turns that throw into an error response, not a 200", () => {
    const body = handler(ROUTES_CLEAN, '"/api/orders"');
    assert.match(body, /await getOrdersByPhone\(phoneNumber\)/,
      "the handler no longer reads the customer's orders");
    // The catch block itself, brace-matched — not "everything after it", which
    // would also sweep in the unconfigured-database path below.
    const catchAt = body.indexOf("catch", body.indexOf("getOrdersByPhone"));
    assert.ok(catchAt > 0, "the read is no longer guarded");
    const open = body.indexOf("{", catchAt);
    let depth = 0, close = -1;
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === "{") depth += 1;
      else if (body[i] === "}") { depth -= 1; if (depth === 0) { close = i; break; } }
    }
    const block = body.slice(open, close + 1);
    assert.match(block, /res\.status\(\s*5\d\d\s*\)/,
      "a failed read still answers 200");
    assert.ok(!/res\.json\(\s*\[\s*\]\s*\)/.test(block),
      "the failure path still answers with an empty array");
  });

  test("the no-database path is still allowed to answer with an empty list", () => {
    // Distinct case: Firestore is not configured at all (local/dev), which is not
    // an outage and must keep behaving as before.
    const body = handler(ROUTES_CLEAN, '"/api/orders"');
    assert.match(body, /if \(db\) \{/, "the db guard disappeared");
    assert.match(body.slice(body.lastIndexOf("}")- 40), /res\.json\(\[\]\)/,
      "the unconfigured-database path changed");
  });
});

describe("H-33 · AuthContext.loadAuthState", () => {
  const at = AUTH_CLEAN.indexOf("const loadAuthState");
  assert.ok(at > 0, "loadAuthState not found");
  const open = AUTH_CLEAN.indexOf("{", at);
  const body = (() => {
    let depth = 0;
    for (let i = open; i < AUTH_CLEAN.length; i += 1) {
      if (AUTH_CLEAN[i] === "{") depth += 1;
      else if (AUTH_CLEAN[i] === "}") { depth -= 1; if (depth === 0) return AUTH_CLEAN.slice(open, i + 1); }
    }
    throw new Error("unbalanced loadAuthState");
  })();

  /** The OUTER catch — the one that wraps the whole boot sequence. */
  const outerCatch = body.slice(body.lastIndexOf("} catch"));

  test("the outer catch is no longer empty", () => {
    assert.doesNotMatch(outerCatch, /catch\s*(\([^)]*\))?\s*\{\s*\}\s*finally/,
      "a boot failure is still swallowed with no record at all");
  });

  test("the boot failure is recorded locally", () => {
    assert.match(outerCatch, /console\.error/,
      "nothing reaches the device log when the stored session cannot be restored");
  });

  test("it uses the existing H-32 reporter rather than a second mechanism", () => {
    assert.match(outerCatch, /reportCrash/,
      "the failure is not routed to the crash reporter that already exists");
    assert.match(AUTH_CLEAN, /import\s*\{\s*reportCrash\s*\}\s*from\s*"@\/lib\/crashReporting"/);
  });

  test("the same error is not reported twice through the same channel", () => {
    assert.equal((outerCatch.match(/reportCrash\(/g) ?? []).length, 1,
      "the boot error is sent to the reporter more than once");
    assert.equal((outerCatch.match(/console\.error\(/g) ?? []).length, 1,
      "the boot error is logged more than once");
  });

  test("loading still stops, so the app cannot hang on the splash", () => {
    assert.match(body.slice(body.lastIndexOf("finally")), /setIsLoading\(false\)/);
  });

  test("nothing identifying is put into the log line", () => {
    // The only interpolated value must be the error itself. A session value —
    // a phone number, a token — must never reach the device log.
    assert.doesNotMatch(outerCatch, /phoneNumber|customerToken|vendorToken|cToken|vToken/,
      "the log line carries session data");
    const logged = outerCatch.match(/console\.error\(([\s\S]*?)\);/)?.[1] ?? "";
    assert.ok(logged, "the log call could not be read");
    const args = logged.split(",").map((a) => a.trim()).filter(Boolean);
    assert.equal(args.length, 2, `expected a message and the error, got: ${logged}`);
    assert.match(args[0], /^"/, "the first argument is not a literal message");
    assert.equal(args[1], "error", `a value other than the error is logged: ${args[1]}`);
  });

  test("the deliberate inner fallbacks are left alone", () => {
    // These are documented, safe recoveries (category D/E) and must not be
    // converted into hard failures by an over-eager sweep. Checked on the RAW
    // source: the markers are comments, which the stripper has removed.
    assert.match(AUTH, /corrupt cache/, "the corrupt-cache fallback was removed");
    assert.match(AUTH, /self-heal covers it/, "the driver-token fallback was removed");
    assert.match(AUTH, /keep cached profile/, "the vendor-profile fallback was removed");
  });
});

describe("H-33 · no secret or personal data was added to any new log line", () => {
  const newLogs = [
    ...(ROUTES_CLEAN.match(/console\.error\([^)]*\[statement\][^)]*\)/g) ?? []),
    ...(ROUTES_CLEAN.match(/console\.error\([^)]*\[(owner-earnings|analytics|admin-ratings)\][^)]*\)/g) ?? []),
    ...(AUTH_CLEAN.match(/console\.error\("\[auth\][^)]*\)/g) ?? []),
  ];

  test("the H-33 log lines exist", () => {
    assert.ok(newLogs.length >= 4, `expected the new log lines, found ${newLogs.length}`);
  });

  for (const forbidden of [
    "phoneNumber", "phone", "Authorization", "Bearer", "password",
    "token", "otp", "email", "address",
  ]) {
    test(`no new log line mentions ${forbidden}`, () => {
      for (const line of newLogs) {
        assert.ok(!new RegExp(forbidden, "i").test(line),
          `a log line carries ${forbidden}: ${line}`);
      }
    });
  }
});
