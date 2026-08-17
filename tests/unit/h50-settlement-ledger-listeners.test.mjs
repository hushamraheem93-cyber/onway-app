/**
 * H-50 — no client screen may listen on `settlementLedger`.
 *
 * The rules close that collection (`allow read, write: if false`) and must keep
 * it closed: document ids are enumerable ("driver:07XXXXXXXXX" / "vendor:<id>")
 * and this app authenticates with a custom JWT rather than Firebase Auth, so a
 * readable ledger is every driver's debt and every vendor's revenue, public.
 *
 * Three screens still opened onSnapshot listeners on it anyway. Measured, the
 * finding's stated harms did NOT occur — the SDK treats permission-denied as a
 * permanent error and drops the target, no error handler means no log noise, and
 * every balance already fell through to REST. The real damage was narrower and
 * unreported: `liveSettlement` could never become non-null, so the two StatCards
 * gated on it — "آخر رحلة" and "نقد محصّل (كلي)" — never rendered at all. The
 * driver simply never saw them.
 *
 * The listeners are gone. Both cards now read /api/driver/wallet, which resolves
 * the same ledger document server-side through the Admin SDK.
 *
 * These tests pin two things: the listeners stay gone (so nobody "fixes" the
 * blank cards by re-opening the rule), and the two card values are computed from
 * the REST account — checked by EVALUATING the real JSX expressions, not by
 * matching their text.
 *
 * Run:  node --test tests/unit/h50-settlement-ledger-listeners.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

/**
 * H-64 removed client/screens/VendorWalletScreen.tsx, which this suite used to
 * check as a third screen. No navigator mounted it, so its copy of the listener
 * could never run and asserting on it proved nothing about the app. Both
 * screens that DO render — the driver's and the vendor's — are still checked
 * here, so the guard's reach over live code is unchanged.
 */
const SCREENS = {
  "client/screens/DriverEarningsScreen.tsx": read("client/screens/DriverEarningsScreen.tsx"),
  "client/screens/VendorAnalyticsScreen.tsx": read("client/screens/VendorAnalyticsScreen.tsx"),
};
/** The removal is explained in comments that name the old code — strip them. */
const code = Object.fromEntries(
  Object.entries(SCREENS).map(([f, src]) => [f, stripComments(src)]),
);

// ─────────────────────────────────────────────────────────────────────────────
describe("H-50 · the denied listeners are gone", () => {
  for (const f of Object.keys(SCREENS)) {
    const short = f.split("/").pop();

    test(`${short} does not reference settlementLedger`, () => {
      assert.doesNotMatch(code[f], /settlementLedger/,
        "a client-SDK path to the closed financial ledger is back");
    });

    test(`${short} opens no onSnapshot listener`, () => {
      assert.doesNotMatch(code[f], /onSnapshot\s*\(/,
        "an onSnapshot listener reappeared");
    });

    test(`${short} imports nothing from firebase/firestore`, () => {
      assert.doesNotMatch(code[f], /from\s+["']firebase\/firestore["']/,
        "the Firestore client SDK is being pulled into a screen again");
      assert.doesNotMatch(code[f], /from\s+["']@\/lib\/firebase["']/,
        "the client Firestore instance is being imported again");
    });

    test(`${short} carries no liveSettlement / liveBalance state`, () => {
      assert.doesNotMatch(code[f], /\b(liveSettlement|liveBalance|setLiveSettlement|setLiveBalance)\b/,
        "state fed only by the denied listener is back");
    });
  }

  test("the whole client tree has exactly one firebase/firestore importer left", () => {
    // client/lib/firebase.ts itself is out of scope here: removing it touches the
    // REQUIRED_ENV list in app.config.js (C-14). What matters for H-50 is that no
    // SCREEN imports it any more.
    const offenders = Object.entries(code)
      .filter(([, src]) => /firebase\/firestore|@\/lib\/firebase/.test(src))
      .map(([f]) => f);
    assert.deepEqual(offenders, []);
  });

  test("the rule stays closed — the fix must never be to re-open it", () => {
    const rules = read("firestore.rules");
    const at = rules.indexOf("match /settlementLedger/{docId}");
    assert.notEqual(at, -1, "the settlementLedger rule disappeared");
    const open = rules.indexOf("{", rules.indexOf("}", at));
    const block = rules.slice(at, rules.indexOf("}", open + 1) + 1);
    assert.match(block, /allow read, write: if false;/,
      "settlementLedger was re-opened to the client SDK — this is the CRITICAL leak");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-50 · the two driver cards render from REST", () => {
  const DE = SCREENS["client/screens/DriverEarningsScreen.tsx"];

  /** Pull the `value={...}` expression that belongs to a given StatCard title. */
  function valueExprFor(title) {
    const at = DE.indexOf(`title="${title}"`);
    assert.notEqual(at, -1, `the "${title}" StatCard disappeared`);
    const vAt = DE.indexOf("value={", at);
    assert.notEqual(vAt, -1, `"${title}" has no value prop`);
    const open = vAt + "value=".length;
    let depth = 0;
    for (let i = open; i < DE.length; i++) {
      if (DE[i] === "{") depth++;
      else if (DE[i] === "}" && --depth === 0) return DE.slice(open + 1, i);
    }
    throw new Error("unbalanced braces in the value prop");
  }

  /** Evaluate that expression against a synthetic REST account. */
  function evaluate(expr, account) {
    const js = ts.transpileModule(`return (${expr});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function("account", "formatPrice", js)(account, (n) => n);
  }

  const ACCOUNT = {
    phoneNumber: "07700000001",
    totalEarnings: 40000,          // ledger.totalCommission
    totalOnwayCommission: 160000,  // ledger.totalGross - ledger.totalCommission
    totalPaid: 90000,
    amountOwed: 110000,
    lastPaymentAmount: 25000,      // ledger.lastSettlementAmount
    lastPaymentDate: null,
    updatedAt: "2026-08-14T00:00:00.000Z",
  };

  test('"آخر رحلة" comes from account.lastPaymentAmount', () => {
    const expr = valueExprFor("آخر رحلة");
    assert.match(expr, /account\.lastPaymentAmount/,
      `the card no longer reads the REST field: ${expr}`);
    assert.equal(evaluate(expr, ACCOUNT), 25000);
  });

  test('"نقد محصّل (كلي)" is totalEarnings + totalOnwayCommission', () => {
    const expr = valueExprFor("نقد محصّل (كلي)");
    assert.match(expr, /account\.totalEarnings/);
    assert.match(expr, /account\.totalOnwayCommission/);
    // /api/driver/wallet splits ledger.totalGross into these two, so the sum
    // reconstructs gross exactly.
    assert.equal(evaluate(expr, ACCOUNT), 200000);
  });

  test("both cards survive a sparse account rather than rendering NaN", () => {
    for (const title of ["آخر رحلة", "نقد محصّل (كلي)"]) {
      const v = evaluate(valueExprFor(title), {});
      assert.equal(typeof v, "number", `${title} produced ${typeof v}`);
      assert.ok(Number.isFinite(v), `${title} produced ${v}`);
      assert.equal(v, 0);
    }
  });

  test("neither card is gated on anything but `account`", () => {
    const at = DE.indexOf('title="آخر رحلة"');
    const before = DE.slice(Math.max(0, at - 1200), at);
    assert.doesNotMatch(before, /liveSettlement\s*\?/,
      "the cards are conditional on the removed listener state again");
  });

  test("the driver's amountOwed reads the REST account", () => {
    assert.match(code["client/screens/DriverEarningsScreen.tsx"],
      /const amountOwed = account\?\.amountOwed \?\? 0;/,
      "the debt figure no longer comes from the REST account");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-50 · the vendor screens use the REST settlement view", () => {
  for (const f of ["client/screens/VendorAnalyticsScreen.tsx"]) {
    const short = f.split("/").pop();

    test(`${short} sources the outstanding amount from useSettlement`, () => {
      assert.match(code[f], /useSettlement\("vendor"\)/,
        "the REST settlement hook is gone");
      assert.match(code[f], /settlement\.view\?\.outstanding/,
        "the settlement request dialog no longer reads the REST outstanding value");
    });

    test(`${short} passes settlement.view straight through`, () => {
      assert.match(code[f], /const liveSettlementView = settlement\.view;/,
        "the view is being merged with listener state again");
    });
  }
});
