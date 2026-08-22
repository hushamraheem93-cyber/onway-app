/**
 * R-03 — a financial movement must not commit while its record is thrown away.
 *
 * The three admin-initiated money paths all end the same way: the transaction that
 * moves the balance commits, and THEN the immutable ledger entry and the audit
 * record are fired without `await` and with their errors discarded —
 *
 *     recordLedgerEntry({ … }).catch(() => {});
 *     recordAudit({ … }).catch(() => {});
 *
 * — under a comment that calls it "best-effort, never blocks". Two things follow.
 *
 * The handler answers 200 while those writes are still in flight, so a restart
 * between the response and the write loses them; `max_memory_restart: 512M`
 * guarantees restarts happen. And when a write simply fails, nothing anywhere
 * observes it: `recordAudit` swallows its own error and returns void, and the
 * ledger outcome is discarded by the caller. The outstanding balance has moved,
 * with no ledger entry to reconcile against and no record of who moved it.
 *
 * This suite pins two properties: `recordAudit` must REPORT whether it wrote, and
 * an adjustment whose trail could not be written must say so instead of answering
 * a clean success.
 *
 * It also pins what is already correct, so a later edit cannot quietly drop it:
 * every financial audit here carries before/after balances.
 *
 * Run:  node --test tests/unit/r03-financial-trail-durability.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

const SETTLEMENT = stripComments(readFileSync(join(root, "server/settlement.ts"), "utf8"));

const { recordAudit } = await import(join(root, "server/financialLedger.ts"));
const { adminAdjustLedger } = await import(join(root, "server/settlement.ts"));

// ── a Firestore double for the balance transaction only ──────────────────────
//
// adminAdjustLedger takes a dbOverride; recordLedgerEntry and recordAudit do not
// receive it, so they fall through to the real getFirestore() — which is null with
// no credentials. That is precisely the condition under test: the balance commits
// and the trail cannot be written.

function makeDb({ outstanding = 50_000 } = {}) {
  const docs = new Map();
  docs.set("ledger", {
    exists: true,
    data: () => ({ outstandingTotal: outstanding }),
  });
  const written = [];
  const refFor = (key) => ({ __key: key });
  const tx = {
    get: async (ref) => docs.get(ref.__key) ?? { exists: false, data: () => ({}) },
    set: (ref, value) => { written.push([ref.__key, value]); },
  };
  return {
    written,
    collection: (name) => ({
      doc: (id) => refFor(id ? `${name}/${id}` : name),
    }),
    runTransaction: async (fn) => fn(tx),
  };
}

/** adminAdjustLedger builds its refs from ledgerId()/marker ids we do not control,
 *  so the double answers by suffix rather than by exact key. */
function makeForgivingDb({ outstanding = 50_000 } = {}) {
  const written = [];
  const tx = {
    get: async (ref) =>
      String(ref.__key).includes("/") && String(ref.__key).startsWith("settlementLedger")
        ? { exists: true, data: () => ({ outstandingTotal: outstanding }) }
        : { exists: false, data: () => ({}) },
    set: (ref, value) => { written.push([String(ref.__key), value]); },
  };
  return {
    written,
    collection: (name) => ({ doc: (id) => ({ __key: `${name}/${id ?? "auto"}` }) }),
    runTransaction: async (fn) => fn(tx),
  };
}

const ACTOR = {
  adminId: "adm_finance_1",
  username: "finance1",
  displayName: "مدير المالية",
  role: "finance_admin",
  permissions: ["wallet_adjustments.create"],
};

// ─────────────────────────────────────────────────────────────────────────────
describe("R-03 · recordAudit reports whether it actually wrote", () => {
  test("a successful write reports success", async () => {
    const added = [];
    const db = { collection: () => ({ add: async (doc) => { added.push(doc); return { id: "a1" }; } }) };
    const wrote = await recordAudit(
      { action: "ledger.adjust", actorId: ACTOR.adminId, actorUsername: ACTOR.username },
      db,
    );
    assert.equal(wrote, true, "a written audit must report success");
    assert.equal(added.length, 1);
  });

  test("a failed write reports failure instead of resolving silently", async () => {
    const db = { collection: () => ({ add: async () => { throw new Error("quota exceeded"); } }) };
    const wrote = await recordAudit({ action: "ledger.adjust" }, db);
    assert.equal(wrote, false, "a failed audit still looks like a success to the caller");
  });

  test("no database at all also reports failure, not success", async () => {
    const wrote = await recordAudit({ action: "ledger.adjust" }, null);
    assert.equal(wrote, false, "an unwritten audit must never report success");
  });
});

describe("R-03 · an adjustment whose trail is lost does not answer a clean success", () => {
  test("the balance moves, and the result says the record failed", async () => {
    const db = makeForgivingDb({ outstanding: 50_000 });
    const result = await adminAdjustLedger(
      "driver", "drv_1", 10_000, "deduct", "تسوية نقدية", "finance1", db, ACTOR,
    );
    assert.equal(result.ok, true, "the adjustment itself must still be applied");
    assert.equal(result.outstandingBefore, 50_000);
    assert.equal(result.outstandingAfter, 40_000);
    assert.equal(
      result.recordFailed,
      true,
      "the ledger entry and audit could not be written, and the caller was told nothing",
    );
  });

  test("the flag is absent — not true — when there is nothing to report", async () => {
    const db = makeForgivingDb({ outstanding: 50_000 });
    const first = await adminAdjustLedger(
      "driver", "drv_2", 5_000, "add", "قيد", "finance1", db, ACTOR,
    );
    assert.equal(first.ok, true);
    // A duplicate replay writes no trail because it moved no money, so it must not
    // be reported as a failed record either.
    assert.notEqual(first.recordFailed, undefined);
  });
});

/**
 * The full body of a top-level function, by brace matching from its declaration.
 *
 * The opening brace is the one that ENDS its line: these signatures return
 * `Promise<{ ok: boolean; … }>`, so the first `{` after the parameter list belongs
 * to the return type, not the body.
 */
function functionBody(src, declaration) {
  const at = src.indexOf(declaration);
  assert.notEqual(at, -1, `moved or renamed: ${declaration}`);
  let open = src.indexOf("{", at);
  for (;;) {
    assert.notEqual(open, -1, `no body brace for ${declaration}`);
    let j = open + 1;
    while (j < src.length && src[j] !== "\n" && /\s/.test(src[j])) j++;
    if (j >= src.length || src[j] === "\n") break;
    open = src.indexOf("{", open + 1);
  }
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces in ${declaration}`);
}

const BODIES = {
  transitionSettlementRequest: functionBody(SETTLEMENT, "export async function transitionSettlementRequest("),
  completeSettlement: functionBody(SETTLEMENT, "export async function completeSettlement("),
  adminAdjustLedger: functionBody(SETTLEMENT, "export async function adminAdjustLedger("),
};

describe("R-03 · the trail writes are awaited, not fired and forgotten", () => {
  for (const [name, body] of Object.entries(BODIES)) {
    test(`${name} does not discard a trail write`, () => {
      // The whole defect in one pattern: a promise whose rejection is thrown away.
      const discarded = body.match(/record(?:Audit|LedgerEntry)\([\s\S]*?\)\s*\.catch\(\(\)\s*=>\s*\{\s*\}\)/g);
      assert.equal(
        discarded,
        null,
        `${name} still fires a trail write and discards its failure`,
      );
    });

    test(`${name} routes its trail through the awaited helper`, () => {
      assert.match(
        body,
        /await recordFinancialTrail\(/,
        `${name} does not await its paper trail`,
      );
    });
  }

  test("the helper reports a failed ledger entry as well as a failed audit", () => {
    const helper = functionBody(SETTLEMENT, "async function recordFinancialTrail(");
    assert.match(helper, /outcome === "failed"/, "a failed ledger entry is not detected");
    assert.match(helper, /if \(!audited\)/, "a failed audit is not detected");
    assert.match(helper, /return complete/);
  });
});

describe("R-03 · what was already right stays right", () => {
  // Three financial mutations already record the balance on both sides. The audit
  // that raised R-03 also raised R-02 claiming these were missing — that was wrong,
  // the search had skipped this file. Pinned so a later edit cannot lose it.
  test("settlement approve/reject records the status on both sides", () => {
    assert.match(BODIES.transitionSettlementRequest, /before: \{ status:/);
    assert.match(BODIES.transitionSettlementRequest, /after: \{ status:/);
  });

  test("both balance-moving paths record outstandingTotal before AND after", () => {
    for (const name of ["completeSettlement", "adminAdjustLedger"]) {
      assert.match(BODIES[name], /before: \{ outstandingTotal:/, `${name} lost its before`);
      assert.match(BODIES[name], /after: \{ outstandingTotal:/, `${name} lost its after`);
    }
  });

  test("the immutable ledger entry is still written for a real adjustment", () => {
    const body = BODIES.adminAdjustLedger;
    assert.match(body, /recordLedgerEntry\(/, "the adjustment no longer writes a ledger entry");
    assert.match(body, /type: "adjustment"/);
    assert.match(body, /entryId:/, "the ledger entry lost its idempotency key");
  });

  test("the adjustment still carries the acting admin's identity", () => {
    const body = BODIES.adminAdjustLedger;
    assert.match(body, /actorId: adminActor\?\.adminId/);
    assert.match(body, /actorRole: adminActor\?\.role/);
  });
});
