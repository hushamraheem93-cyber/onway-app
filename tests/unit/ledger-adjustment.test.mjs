/**
 * Manual ledger adjustment audit tests (audit finding H-07).
 *
 * The finding: a manual balance adjustment changed `outstandingTotal` inside a
 * transaction but wrote no payment document, no adjustments collection, nothing —
 * its only trace was two fields overwritten IN PLACE on the ledger document
 * (`adjustmentNotes`, `adjustedBy`). Five corrections over three months left only
 * the fifth note, so a disputed balance had no record of who adjusted it, when, or
 * why.
 *
 * Most of the prescribed remedy is already in the tree from the C-08 round:
 * adminAdjustLedger writes an immutable settlementAdjustments document INSIDE the
 * same transaction carrying before / after / delta / type / notes / admin / date,
 * keyed by an idempotency marker. These tests pin that down so it cannot regress,
 * and cover the two pieces that were still open:
 *
 *   • the admin's name came from req.body — and the admin panel never sent it, so
 *     every real adjustment was filed against "";
 *   • `Number("abc")` produced NaN, and `NaN <= 0` is false, so the amount guard
 *     let it through and wrote `outstandingTotal: NaN`.
 *
 * Run:  node --test tests/unit/ledger-adjustment.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const SETTLEMENT = read("server/settlement.ts");
const ADMIN_AUTH = read("server/adminAuth.ts");
const ADMIN_HTML = read("server/templates/admin.html");

function stripComments(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

function handlerBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(/\n\s*(app|router)\.(get|post|put|patch|delete)\(/);
  return stripComments(marker + (next === -1 ? rest : rest.slice(0, next)));
}

const ADJUST_ROUTE = handlerBody(ROUTES, 'app.post("/api/admin/driver-wallet/adjustment"');
const ADJUST_FN = (() => {
  const i = SETTLEMENT.indexOf("export async function adminAdjustLedger");
  const rest = SETTLEMENT.slice(i + 10);
  const next = rest.search(/\nexport /);
  return rest.slice(0, next === -1 ? rest.length : next);
})();

describe("H-07 — the adjustment leaves an immutable record", () => {
  test("the route and the function were found", () => {
    assert.ok(ADJUST_ROUTE.length > 0, "adjustment route not found");
    assert.ok(ADJUST_FN.length > 0, "adminAdjustLedger not found");
  });

  test("a settlementAdjustments document is written, not just two ledger fields", () => {
    assert.match(
      ADJUST_FN,
      /const stampMarker = \(before: number, after: number\) =>\s*\n\s*tx\.set\(markerRefs\[0\], \{/,
      "REGRESSION: the adjustment leaves no audit document again",
    );
    assert.match(SETTLEMENT, /const SETTLEMENT_ADJUSTMENTS = "settlementAdjustments";/);
    assert.match(ADJUST_FN, /db\.collection\(SETTLEMENT_ADJUSTMENTS\)\.doc\(id\)/);
  });

  test("it is written INSIDE the transaction, so record and balance cannot diverge", () => {
    const txStart = ADJUST_FN.indexOf("db.runTransaction");
    const stamp = ADJUST_FN.indexOf("const stampMarker");
    assert.ok(txStart > -1 && stamp > txStart, "the audit write escaped the transaction");
    // tx.set — a transaction handle — not a bare db write.
    assert.match(ADJUST_FN, /tx\.set\(markerRefs\[0\]/);
  });

  test("every field the finding asked for is on the record", () => {
    const marker = ADJUST_FN.slice(ADJUST_FN.indexOf("const stampMarker"), ADJUST_FN.indexOf("if (!snap.exists)"));
    for (const field of [
      "accountType", "accountId", "adjustType", "amount", "notes", "adminName",
      "outstandingBefore", "outstandingAfter", "createdAt",
    ]) {
      assert.match(marker, new RegExp(`\\b${field}\\b`), `audit record is missing ${field}`);
    }
  });

  test("both the create and the update branch stamp a record", () => {
    assert.match(ADJUST_FN, /const stampMarker = /, "the helper is gone");
    const calls = ADJUST_FN.match(/\n\s*stampMarker\(/g) ?? [];
    assert.equal(calls.length, 2, `both branches must stamp, saw ${calls.length} call sites`);
    assert.match(ADJUST_FN, /stampMarker\(0, delta\)/, "the ledger-creation branch must record too");
    assert.match(ADJUST_FN, /stampMarker\(before, after\)/);
  });

  test("a duplicate submission returns the first record instead of adjusting twice", () => {
    assert.match(ADJUST_FN, /const markerIds = adjustmentIdempotencyIds\(/);
    assert.match(ADJUST_FN, /const seen = await tx\.get\(ref\);\s*\n\s*if \(seen\.exists\)/);
    assert.match(ADJUST_FN, /duplicate: true/);
  });

  test("the movement also lands in the append-only financial ledger", () => {
    // This is what GET /api/driver/statement and /api/admin/ledger-statement read,
    // so the adjustment is visible when a balance is disputed.
    assert.match(ADJUST_FN, /type: "adjustment"/);
    assert.match(ADJUST_FN, /createdBy: adminName \|\| "admin"/);
    assert.match(ROUTES, /getAccountStatement\("driver", phoneNumber\)/);
  });

  test("the in-place fields are a convenience copy, not the audit trail", () => {
    // They still exist (the admin list shows the latest note) — the point is that
    // they are no longer the ONLY trace.
    assert.match(ADJUST_FN, /adjustmentNotes: notes/);
    assert.match(ADJUST_FN, /adjustedBy: adminName/);
  });
});

describe("H-07 — the adjuster is named from the session, never the body", () => {
  test("adminAuth exposes the session username", () => {
    assert.match(ADMIN_AUTH, /export function getSessionUsername\(req: Request\): string/);
    assert.match(ADMIN_AUTH, /if \(decoded\?\.type !== "admin"\) return "";/);
  });

  test("the route no longer destructures adminName from the body", () => {
    assert.doesNotMatch(
      ADJUST_ROUTE,
      /const \{ phoneNumber, amount, type, notes, adminName \} = req\.body;/,
      "REGRESSION: the adjuster's name is client-supplied again",
    );
    assert.match(ADJUST_ROUTE, /const adminName = getSessionUsername\(req\) \|\| "admin";/);
  });

  test("the name that reaches the audit record is the session one", () => {
    assert.match(
      ADJUST_ROUTE,
      /adminAdjustLedger\("driver", phoneNumber, amountNum, type as "add" \| "deduct", notes \|\| "", adminName\)/,
    );
    assert.doesNotMatch(ADJUST_ROUTE, /adminName \|\| ""\)/);
  });

  test("this actually mattered — the admin panel never sent the field", () => {
    const submit = ADMIN_HTML.slice(
      ADMIN_HTML.indexOf("async function submitDriverAdjustment"),
      ADMIN_HTML.indexOf("async function submitDriverAdjustment") + 900,
    );
    assert.ok(submit.length > 0, "admin panel handler not found");
    assert.match(submit, /body: JSON\.stringify\(\{ phoneNumber: phone, amount, type, notes \}\)/);
    assert.doesNotMatch(submit, /adminName/, "the panel sends no adminName — so the body was always empty");
  });
});

describe("H-07 — a corrupt amount can never reach the balance", () => {
  test("the route validates the amount before calling the ledger", () => {
    assert.match(ADJUST_ROUTE, /const amountNum = Number\(amount\);/);
    assert.match(ADJUST_ROUTE, /if \(!Number\.isFinite\(amountNum\) \|\| amountNum <= 0\)/);
    assert.match(ADJUST_ROUTE, /المبلغ غير صالح/);
  });

  test("the guard runs before adminAdjustLedger", () => {
    const guard = ADJUST_ROUTE.indexOf("!Number.isFinite(amountNum)");
    const call = ADJUST_ROUTE.indexOf("await adminAdjustLedger(");
    assert.ok(guard > -1 && call > -1 && guard < call);
  });

  test("this is the exact hole: NaN slips past `delta <= 0`", () => {
    // Documents why the inner guard alone was not enough.
    const delta = Math.abs(Math.round(Number("abc")));
    assert.ok(Number.isNaN(delta));
    assert.equal(delta <= 0, false, "NaN <= 0 is false — the inner guard never fires");
    assert.ok(Number.isNaN(5000 + delta), "and the balance becomes NaN");
    assert.match(ADJUST_FN, /if \(delta <= 0\) return \{ ok: false, reason: "invalid_amount" \};/);
  });

  test("the values the route now accepts and rejects", () => {
    const accepted = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0; };
    for (const bad of ["abc", "", null, NaN, 0, -1, -5000, Infinity, "1e400", "  "]) {
      assert.equal(accepted(bad), false, `${JSON.stringify(bad)} must be refused`);
    }
    for (const good of [1, 5000, "5000", 250000, 0.5]) {
      assert.equal(accepted(good), true, `${JSON.stringify(good)} must be accepted`);
    }
  });
});

describe("H-07 — the five-adjustments scenario from the finding", () => {
  test("five corrections leave five records, not one surviving note", () => {
    // The audit collection is keyed by an idempotency id derived from the inputs,
    // so distinct adjustments land on distinct documents rather than overwriting.
    assert.match(SETTLEMENT, /function adjustmentIdempotencyIds\(/);
    const fn = SETTLEMENT.slice(SETTLEMENT.indexOf("function adjustmentIdempotencyIds("));
    for (const part of ["accountType", "accountId", "delta", "adjustType", "notes"]) {
      assert.match(fn.slice(0, 900), new RegExp(`\\b${part}\\b`), `the id ignores ${part}`);
    }
  });

  test("before/after are recorded per adjustment, so the trail reconciles", () => {
    assert.match(ADJUST_FN, /outstandingBefore: before, outstandingAfter: after/);
    assert.match(ADJUST_FN, /return \{ ok: true, outstandingBefore: before, outstandingAfter: after \}/);
  });
});
