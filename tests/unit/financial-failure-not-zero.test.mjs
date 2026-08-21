/**
 * Financial false-zero tests (audit finding H-33, financial batch).
 *
 * The ledger read helpers answered a database failure with zeroed money:
 *
 *   getLedgerBalance    catch → return 0
 *   getAccountStatement catch → return { balance: 0, entries: [] }
 *   listAuditLog        catch → return []
 *
 * Every one of those values is a factual claim. A driver opening their statement
 * during a Firestore blip was told their balance was zero and they had no
 * movements — while still carrying the platform's cash. An admin investigating a
 * settlement dispute was shown an empty audit log, which reads as "nothing was
 * ever recorded" rather than "the log could not be read".
 *
 * Tracing the callers showed the fix was smaller than it looked: all four consumers
 * — GET /api/driver/statement, /api/vendor/statement, /api/admin/ledger-statement,
 * /api/admin/audit-log and the financial summary — ALREADY wrap these calls in a
 * try/catch that answers 500. The data layer was swallowing the error before the
 * route could ever see it. So the helpers now throw and the existing handling does
 * the rest; no route contract changed on the success path.
 *
 * These tests execute the real functions against a Firestore double that fails, so
 * they test behaviour rather than the presence of a keyword.
 *
 * Run:  node --test tests/unit/financial-failure-not-zero.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");
const SRC = readFileSync(join(here, "../../server/financialLedger.ts"), "utf8");

/** Load the module with getFirestore() swapped for a controllable double. */
function load(dbFactory) {
  const js = ts.transpileModule(SRC, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  const fakeRequire = (id) => {
    if (id === "./firebase" || id.endsWith("/firebase")) {
      return { getFirestore: dbFactory };
    }
    return require(id);
  };
  // eslint-disable-next-line no-new-func
  new Function("exports", "require", "module", js)(exports, fakeRequire, { exports });
  return exports;
}

/** A Firestore whose reads always fail — an outage, a bad index, a timeout. */
const failingDb = () => ({
  collection: () => ({
    doc: () => ({ get: async () => { throw new Error("FIRESTORE UNAVAILABLE"); } }),
    where: function () { return this; },
    limit: function () { return this; },
    get: async () => { throw new Error("FIRESTORE UNAVAILABLE"); },
  }),
});
/** A healthy Firestore holding a real balance and one movement. */
const workingDb = () => ({
  collection: (name) => ({
    doc: () => ({
      get: async () => ({ exists: true, data: () => ({ balance: 47500 }) }),
    }),
    where: function () { return this; },
    limit: function () { return this; },
    get: async () => ({
      docs: [{ id: "e1", data: () => ({ amount: 47500, balanceAfter: 47500, createdAt: { toMillis: () => 1 } }) }],
    }),
  }),
});
/** Healthy, but this account genuinely has nothing yet. */
const emptyDb = () => ({
  collection: () => ({
    doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }),
    where: function () { return this; },
    limit: function () { return this; },
    get: async () => ({ docs: [] }),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-33 · a failed ledger read must not read as zero money", () => {
  test("getLedgerBalance rejects instead of answering 0", async () => {
    const { getLedgerBalance } = load(failingDb);
    await assert.rejects(
      () => getLedgerBalance("driver", "07901110001"),
      /FIRESTORE UNAVAILABLE/,
      "a database failure was reported to the caller as a zero balance",
    );
  });

  test("getLedgerBalance rejects when there is no database at all", async () => {
    const { getLedgerBalance } = load(() => null);
    await assert.rejects(() => getLedgerBalance("driver", "07901110001"));
  });

  test("getAccountStatement rejects instead of answering an empty account", async () => {
    const { getAccountStatement } = load(failingDb);
    await assert.rejects(
      () => getAccountStatement("driver", "07901110001"),
      /FIRESTORE UNAVAILABLE/,
      "a driver was shown balance 0 with no movements while carrying real cash",
    );
  });

  test("getAccountStatement rejects when there is no database at all", async () => {
    const { getAccountStatement } = load(() => null);
    await assert.rejects(() => getAccountStatement("vendor", "v-1"));
  });

  test("listAuditLog rejects instead of answering an empty log", async () => {
    const { listAuditLog } = load(failingDb);
    await assert.rejects(
      () => listAuditLog({ targetType: "vendor", targetId: "v-1" }),
      /FIRESTORE UNAVAILABLE/,
      "an admin in a settlement dispute was shown 'nothing was ever recorded'",
    );
  });

  test("listAuditLog rejects when there is no database at all", async () => {
    const { listAuditLog } = load(() => null);
    await assert.rejects(() => listAuditLog());
  });
});

describe("H-33 · a genuinely empty account still reads as empty, not as an error", () => {
  test("no ledger head yet means a real zero balance", async () => {
    const { getLedgerBalance } = load(emptyDb);
    assert.equal(await getLedgerBalance("driver", "new-driver"), 0);
  });

  test("a new account returns an empty statement without throwing", async () => {
    const { getAccountStatement } = load(emptyDb);
    const st = await getAccountStatement("driver", "new-driver");
    assert.equal(st.balance, 0);
    assert.deepEqual(st.entries, []);
  });

  test("an empty audit log returns an empty array without throwing", async () => {
    const { listAuditLog } = load(emptyDb);
    assert.deepEqual(await listAuditLog(), []);
  });
});

describe("H-33 · the success path is unchanged", () => {
  test("a real balance is still returned", async () => {
    const { getLedgerBalance } = load(workingDb);
    assert.equal(await getLedgerBalance("driver", "07901110001"), 47500);
  });

  test("a real statement still carries balance and entries", async () => {
    const { getAccountStatement } = load(workingDb);
    const st = await getAccountStatement("driver", "07901110001");
    assert.equal(st.balance, 47500);
    assert.equal(st.entries.length, 1);
    assert.equal(st.entries[0].id, "e1");
    assert.deepEqual(Object.keys(st).sort(), ["balance", "entries"],
      "the statement shape changed");
  });

  test("a real audit log is still returned newest-first", async () => {
    const { listAuditLog } = load(workingDb);
    const entries = await listAuditLog();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, "e1");
  });
});

describe("H-33 · the routes that consume these already answer 500", () => {
  const ROUTES = readFileSync(join(here, "../../server/routes.ts"), "utf8");
  const VENDOR = readFileSync(join(here, "../../server/vendor.ts"), "utf8");
  const strip = sharedStripComments;

  for (const [label, src, marker] of [
    ["driver statement", ROUTES, "getAccountStatement(\"driver\""],
    ["admin ledger statement", ROUTES, "getAccountStatement(accountType"],
    ["admin audit log", ROUTES, "listAuditLog(filter,"],
    ["vendor statement", VENDOR, "getAccountStatement(\"vendor\""],
  ]) {
    test(`${label}: the call sits inside a handler that returns 500 on a throw`, () => {
      const clean = strip(src);
      const at = clean.indexOf(marker);
      assert.ok(at > 0, `${label}: call site not found`);
      // Look at the surrounding handler text for the error answer.
      const around = clean.slice(Math.max(0, at - 400), at + 400);
      assert.match(around, /catch\s*\(/, `${label}: the call is not wrapped`);
      assert.match(around, /res\.status\(500\)/,
        `${label}: a thrown ledger error would not become a 500`);
    });
  }

  test("no ledger helper is called from a write path", () => {
    // If a settlement or payout write used a swallowed balance, a false zero would
    // corrupt money rather than merely display wrongly. It does not — and this
    // guards that it stays that way.
    const clean = strip(ROUTES) + strip(VENDOR);
    const writeNearBalance = /getLedgerBalance\([^)]*\)[\s\S]{0,200}?\.(set|update|add|create)\(/;
    assert.doesNotMatch(clean, writeNearBalance,
      "a ledger balance now feeds a write — a failed read could corrupt money");
  });
});

describe("H-33 · the settlement read helpers must not answer a failure with emptiness", () => {
  const SETTLEMENT = readFileSync(join(here, "../../server/settlement.ts"), "utf8");
  const strip = sharedStripComments;
  const CLEAN = strip(SETTLEMENT);

  /** The catch block that belongs to `fn`, by brace matching from its declaration. */
  function catchOf(fn) {
    const at = CLEAN.indexOf(`export async function ${fn}`);
    assert.ok(at >= 0, `${fn} not found`);
    const open = CLEAN.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < CLEAN.length; i += 1) {
      if (CLEAN[i] === "{") depth += 1;
      else if (CLEAN[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          const body = CLEAN.slice(open, i + 1);
          return body.slice(body.lastIndexOf("catch"));
        }
      }
    }
    throw new Error(`unbalanced: ${fn}`);
  }

  for (const [fn, lie] of [
    ["getSettlementLedger", /return\s+null/],
    ["listSettlementRequests", /return\s+\[\]/],
    ["listSettlementAccounts", /return\s+\[\]/],
    ["getSettlementPayments", /return\s+\[\]/],
  ]) {
    test(`${fn} rethrows instead of answering emptiness`, () => {
      const c = catchOf(fn);
      assert.doesNotMatch(c, lie,
        `${fn} still turns a database failure into "there is nothing here"`);
      assert.match(c, /throw\b/, `${fn} swallows the error`);
      assert.match(c, /console\.error/, `${fn} reports nothing to the log`);
    });
  }

  test("the driver wallet route no longer defaults a failed ledger read to zero", () => {
    const ROUTES = strip(readFileSync(join(here, "../../server/routes.ts"), "utf8"));
    const at = ROUTES.indexOf('"/api/driver/wallet"');
    assert.ok(at > 0, "the wallet route disappeared");
    const body = ROUTES.slice(at, at + 6000);
    // The `?? 0` defaults stay — they are correct for a driver with no ledger yet.
    // What must be true is that a FAILED read can no longer reach them.
    assert.match(body, /try\s*\{/, "the wallet route is not wrapped");
    assert.match(body, /res\.status\(500\)|GENERIC_SERVER_ERROR/,
      "a thrown ledger error would not become a 500");
  });

  test("the deliberate call-site fallbacks are left alone", () => {
    const ROUTES = strip(readFileSync(join(here, "../../server/routes.ts"), "utf8"));
    // Two call sites opt out on purpose; a sweep must not have removed them.
    // H-72 re-addressed this read to the account the accrual was just written to
    // (taken from the accrual itself, so the two cannot drift). The `.catch(() =>
    // null)` opt-out this test guards is unchanged.
    assert.match(ROUTES, /getSettlementLedger\("driver", driverInput\.accountId\)\.catch\(\(\) => null\)/,
      "the deliberate accrual-path fallback was removed");
    assert.match(ROUTES, /listSettlementAccounts\("vendor"\)\.catch\(\(\) => \[\] as any\[\]\)/,
      "the deliberate dashboard fallback was removed");
  });

  test("the FIFO claim contention fallback is untouched", () => {
    // "someone else holds the claim" is a real outcome, not a failure. Checked on
    // the RAW source: the marker is a comment, which CLEAN has stripped.
    assert.match(SETTLEMENT, /never let claim contention block the caller/,
      "the documented FIFO contention fallback was changed");
  });
});
