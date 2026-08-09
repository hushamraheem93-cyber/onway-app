/**
 * Financial record ordering tests (audit finding H-23).
 *
 * Six queries fetched financial history with a .limit() and no .orderBy(). Firestore
 * answers an unordered limit in DOCUMENT ID order, and each of these handlers then
 * sorted the result in memory — so a wrong SET arrived looking perfectly ordered.
 *
 * Measured on the pre-fix code: an account with 340 settlement payments answered a
 * 100-row request with p-339 … p-1 in scattered order and the newest payment, p-340,
 * simply absent. A store with 400 notifications got n-389 … n-7 and never saw n-400.
 *
 * The ledger case was worse than random. Ledger ids are `${accountType}:${accountId}`,
 * so document-id order is phone-number order: the 500-row admin list always returned
 * the same lowest-numbered accounts and every account above that line was invisible on
 * every load, permanently, while its balance stayed owed in the database.
 *
 * Run:  node --test tests/unit/financial-record-ordering.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const SETTLEMENT = read("server/settlement.ts");
const VENDOR = read("server/vendor.ts");
const MIGRATION = read("scripts/migrate-settlement.mjs");
const INDEXES = JSON.parse(read("firestore.indexes.json"));

function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

const S = code(SETTLEMENT);
const V = code(VENDOR);

/** Does firestore.indexes.json declare col(fields...) in this exact order? */
const hasIndex = (col, fields) =>
  (INDEXES.indexes ?? []).some(
    (i) =>
      i.collectionGroup === col &&
      (i.fields ?? []).length === fields.length &&
      fields.every(([path, order], n) => i.fields[n].fieldPath === path && i.fields[n].order === order),
  );

describe("H-23 — all six queries are ordered", () => {
  test("getSettlementHistory orders both of its queries", () => {
    assert.match(
      S,
      /db\.collection\(SETTLEMENTS\)\.where\("accountKey", "==", key\)\s*\n\s*\.orderBy\("createdAt", "desc"\)\.limit\(max\)\.get\(\)/,
      "REGRESSION: the account's settlement history is an arbitrary slice again",
    );
    assert.match(
      S,
      /db\.collection\(SETTLEMENT_REQUESTS\)\.where\("accountKey", "==", key\)\s*\n\s*\.orderBy\("createdAt", "desc"\)\.limit\(max\)\.get\(\)/,
      "REGRESSION: the account's request history is an arbitrary slice again",
    );
  });

  test("listSettlementRequests orders by createdAt", () => {
    assert.match(
      S,
      /db\.collection\(SETTLEMENT_REQUESTS\)\.where\("status", "==", status\)\s*\n\s*\.orderBy\("createdAt", "desc"\)\.limit\(300\)\.get\(\)/,
      "REGRESSION: payout requests can silently fall out of the admin inbox again",
    );
  });

  test("listSettlementAccounts orders by updatedAt", () => {
    assert.match(
      S,
      /db\.collection\(LEDGER\)\.where\("accountType", "==", accountType\)\s*\n\s*\.orderBy\("updatedAt", "desc"\)\.limit\(500\)\.get\(\)/,
      "REGRESSION: accounts are excluded by phone-number order again",
    );
  });

  test("getSettlementPayments orders by createdAt", () => {
    assert.match(
      S,
      /db\.collection\(SETTLEMENT_PAYMENTS\)\.where\("accountKey", "==", key\)\s*\n\s*\.orderBy\("createdAt", "desc"\)\.limit\(max\)\.get\(\)/,
      "REGRESSION: a settlement dispute is decided on a random sample of the payments",
    );
  });

  test("the vendor notification list orders by createdAt", () => {
    assert.match(
      V,
      /\.collection\("vendorNotifications"\)\s*\n\s*\.where\("vendorId", "==", vid\)\s*\n\s*\.orderBy\("createdAt", "desc"\)\s*\n\s*\.limit\(50\)/,
      "REGRESSION: a store can stop seeing its newest notifications",
    );
  });

  test("the limits themselves are unchanged", () => {
    assert.match(S, /\.limit\(max\)\.get\(\)/);
    assert.match(S, /\.limit\(300\)\.get\(\)/);
    assert.match(S, /\.limit\(500\)\.get\(\)/);
    assert.match(V, /\.limit\(50\)/);
  });

  test("no bounded query on these collections is left unordered", () => {
    // The generic form: any .limit() in a chain that touches one of the five
    // collections must have an .orderBy() in the same chain.
    const COLS = ["SETTLEMENTS", "SETTLEMENT_REQUESTS", "SETTLEMENT_PAYMENTS", "LEDGER"];
    const offenders = [];
    for (const col of COLS) {
      const re = new RegExp(`db\\.collection\\(${col}\\)([\\s\\S]{0,260}?)\\.get\\(\\)`, "g");
      for (const [, chain] of S.matchAll(re)) {
        if (!/\.limit\(/.test(chain)) continue;
        if (!/\.orderBy\(/.test(chain)) offenders.push(`${col}: ${chain.trim().slice(0, 90)}`);
      }
    }
    for (const [, chain] of V.matchAll(/\.collection\("vendorNotifications"\)([\s\S]{0,260}?)\.get\(\)/g)) {
      if (/\.limit\(/.test(chain) && !/\.orderBy\(/.test(chain)) {
        offenders.push(`vendorNotifications: ${chain.trim().slice(0, 90)}`);
      }
    }
    // The mark-read sweep is a known, recorded exception (bulk update, no display).
    const real = offenders.filter((o) => !/status", "==", "unread/.test(o));
    assert.deepEqual(real, [], "a bounded financial query has no ordering");
  });
});

describe("H-23 — every ordered query has a deployed index", () => {
  const D = "DESCENDING", A = "ASCENDING";

  test("settlements(accountKey, createdAt DESC)", () => {
    assert.ok(hasIndex("settlements", [["accountKey", A], ["createdAt", D]]));
  });
  test("settlementRequests(accountKey, createdAt DESC)", () => {
    assert.ok(hasIndex("settlementRequests", [["accountKey", A], ["createdAt", D]]));
  });
  test("settlementRequests(status, createdAt DESC)", () => {
    assert.ok(hasIndex("settlementRequests", [["status", A], ["createdAt", D]]));
  });
  test("settlementLedger(accountType, updatedAt DESC)", () => {
    assert.ok(hasIndex("settlementLedger", [["accountType", A], ["updatedAt", D]]));
  });
  test("settlementPayments(accountKey, createdAt DESC)", () => {
    assert.ok(hasIndex("settlementPayments", [["accountKey", A], ["createdAt", D]]));
  });
  test("vendorNotifications(vendorId, createdAt DESC)", () => {
    assert.ok(hasIndex("vendorNotifications", [["vendorId", A], ["createdAt", D]]));
  });

  test("the pre-existing indexes were not disturbed", () => {
    assert.ok(hasIndex("settlements", [["accountType", A], ["createdAt", D]]), "H-22-era index");
    assert.ok(hasIndex("settlements", [["accountKey", A], ["status", A], ["createdAt", A]]), "H-24 index");
    assert.ok(hasIndex("settlementPayments", [["accountKey", A], ["fifoApplied", A], ["createdAt", D]]), "FIFO repair index");
    assert.ok(hasIndex("vendorNotifications", [["vendorId", A], ["status", A]]), "mark-read index");
  });

  test("the index file stays structurally valid and duplicate-free", () => {
    assert.ok(Array.isArray(INDEXES.indexes) && Array.isArray(INDEXES.fieldOverrides));
    for (const i of INDEXES.indexes) {
      assert.ok(["COLLECTION", "COLLECTION_GROUP"].includes(i.queryScope));
      for (const f of i.fields) {
        assert.ok(typeof f.fieldPath === "string" && f.fieldPath.length > 0);
        if ("order" in f) assert.ok(["ASCENDING", "DESCENDING"].includes(f.order));
      }
    }
    const sig = INDEXES.indexes.map(
      (i) => `${i.collectionGroup}|${i.fields.map((f) => `${f.fieldPath}:${f.order ?? ""}`).join(",")}`,
    );
    assert.equal(new Set(sig).size, sig.length, "a duplicate index is rejected on deploy");
  });
});

describe("H-23 — no document can be dropped by the new ordering", () => {
  // orderBy silently excludes documents that lack the field. These pin the inventory
  // that made each ordering safe: every writer of every collection stamps it.

  test("settlements — both creators stamp createdAt", () => {
    const at = SETTLEMENT.indexOf("tx.set(settlementRef, {");
    assert.match(SETTLEMENT.slice(at, SETTLEMENT.indexOf("});", at)), /createdAt: now/);
    const mAt = MIGRATION.indexOf("tx.set(settlementRef, {");
    assert.match(MIGRATION.slice(mAt, MIGRATION.indexOf("});", mAt)), /createdAt: ts/);
  });

  test("settlementRequests — the single creator stamps createdAt", () => {
    const at = SETTLEMENT.indexOf("tx.set(newRef, {");
    assert.ok(at > -1, "the request creator is gone");
    const body = SETTLEMENT.slice(at, SETTLEMENT.indexOf("});", at));
    assert.match(body, /createdAt: now,/);
    assert.match(body, /accountKey: accountKey\(accountType, accountId\)/);
    assert.match(body, /status: "pending",/);
    const creators = [...SETTLEMENT.matchAll(/tx\.set\(newRef,/g)];
    assert.equal(creators.length, 1, `${creators.length} places create settlement requests`);
  });

  test("settlementPayments — the single creator stamps createdAt", () => {
    const at = SETTLEMENT.indexOf("tx.set(paymentRef, {");
    assert.ok(at > -1, "the payment creator is gone");
    const body = SETTLEMENT.slice(at, SETTLEMENT.indexOf("});", at));
    assert.match(body, /createdAt: now,/);
    assert.match(body, /accountKey: key,/);
    const creators = [...SETTLEMENT.matchAll(/tx\.set\(paymentRef,/g)];
    assert.equal(creators.length, 1, `${creators.length} places create payments`);
  });

  test("settlementLedger — EVERY writer stamps updatedAt", () => {
    // This is the ordering field for the account list, so a writer that forgets it
    // would make that account vanish from the admin panel.
    const writes = [...SETTLEMENT.matchAll(/tx\.set\(\s*\n?\s*ledgerRef,[\s\S]{0,700}?\n\s*\}/g)]
      .map((m) => m[0]);
    assert.ok(writes.length >= 4, `expected the ledger writers, found ${writes.length}`);
    for (const w of writes) {
      assert.match(w, /updatedAt: now/, `a ledger write has no updatedAt: ${w.slice(0, 110)}`);
    }
    // inline single-line merges
    for (const m of SETTLEMENT.matchAll(/tx\.set\(ledgerRef, \{[^}]*\}, \{ merge: true \}\)/g)) {
      assert.match(m[0], /updatedAt: now/, `inline ledger merge has no updatedAt: ${m[0].slice(0, 110)}`);
    }
    // the legacy migration script
    const mAt = MIGRATION.indexOf("tx.set(\n          ledgerRef,");
    assert.ok(mAt > -1, "the migration ledger writer changed shape");
    assert.match(MIGRATION.slice(mAt, mAt + 900), /updatedAt: ts,/);
  });

  test("vendorNotifications — all three creators stamp createdAt", () => {
    const creators = [...VENDOR.matchAll(/\.collection\("vendorNotifications"\)\.add\(\{[\s\S]{0,420}?\n\s*\}\)/g)]
      .map((m) => m[0]);
    assert.equal(creators.length, 3, `${creators.length} places create vendor notifications`);
    for (const c of creators) assert.match(c, /createdAt: now,/, `a notification writer has no createdAt`);
    // createdAt is an ISO-8601 UTC string here, so lexical order == chronological order.
    const nows = [...VENDOR.matchAll(/const now = new Date\(\)\.toISOString\(\);/g)];
    assert.ok(nows.length >= 3, "the ISO-string timestamp convention changed");
  });
});

describe("H-23 — nothing about the money or the results changed", () => {
  test("the in-memory sorts are still there as a second guard", () => {
    assert.match(S, /const byCreatedDesc = \(a: any, b: any\) =>/);
    assert.match(S, /\.sort\(\(a, b\) => \(b\.createdAt\?\.toMillis\?\.\(\) \?\? 0\) - \(a\.createdAt\?\.toMillis\?\.\(\) \?\? 0\)\)/);
    assert.match(V, /\.sort\(\(a: any, b: any\) => \(b\.createdAt \|\| ""\)\.localeCompare\(a\.createdAt \|\| ""\)\)/);
  });

  test("the accountType filter in listSettlementRequests is still applied in memory", () => {
    assert.match(S, /if \(accountType\) items = items\.filter\(\(i\) => i\.accountType === accountType\);/);
  });

  test("the returned shapes are unchanged", () => {
    assert.match(S, /return \{\s*settlements: sSnap\.docs/);
    assert.match(S, /pendingOrderCount: l\.pendingCount \?\? 0,/);
    assert.match(V, /res\.json\(\{ notifications \}\)/);
  });

  test("H-24's FIFO query is untouched", () => {
    assert.match(
      S,
      /\.where\("accountKey", "==", key\)\s*\n\s*\.where\("status", "==", "pending"\)\s*\n\s*\.orderBy\("createdAt", "asc"\)\s*\n\s*\.limit\(1000\)/,
    );
  });

  test("H-21's pendingCount decrement is untouched", () => {
    assert.match(S, /pendingCount: Math\.max\(0, prev - newlySettled\)/);
  });

  test("the FIFO allocation arithmetic is untouched", () => {
    assert.match(S, /const applied = Math\.min\(remaining, due\);/);
    assert.match(S, /const fully = newSettled >= \(s\.outstandingAmount \?\? 0\);/);
  });

  test("settlement and vendor code never reach into the dispatch batching engine", () => {
    for (const [name, src] of [["settlement.ts", SETTLEMENT], ["vendor.ts", VENDOR]]) {
      assert.doesNotMatch(
        src,
        /optimizedIds|ordersCombinable|maxBatchSize|deliverySequence|MERGE_RADIUS_KM/,
        `${name} reached into the driver batching system`,
      );
    }
  });
});

describe("H-23 — why an unordered limit hides records", () => {
  const byDocId = (docs, n) => [...docs].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, n);
  const byNewest = (docs, n) => [...docs].sort((a, b) => b.createdAt - a.createdAt).slice(0, n);
  const docs = ["m", "b", "z", "a", "q", "f", "t", "c", "y", "d"].map((id, i) => ({ id, createdAt: i }));

  test("the newest record can be missing entirely", () => {
    assert.ok(!byDocId(docs, 3).some((d) => d.createdAt === 9));
    assert.ok(byNewest(docs, 3).some((d) => d.createdAt === 9));
  });

  test("sorting afterwards produces an ordered list of the wrong records", () => {
    const wrong = byDocId(docs, 3).sort((a, b) => b.createdAt - a.createdAt);
    assert.ok(wrong.every((d, i) => i === 0 || wrong[i - 1].createdAt >= d.createdAt), "it is ordered");
    assert.notDeepEqual(wrong.map((d) => d.createdAt), byNewest(docs, 3).map((d) => d.createdAt));
  });

  test("ledger ids make the exclusion deterministic, not random", () => {
    // `${accountType}:${accountId}` → document-id order is phone-number order, so the
    // same accounts are cut on every single load.
    const ledgers = ["driver:07901", "driver:07903", "driver:07902", "driver:07909"]
      .map((id, i) => ({ id, createdAt: i }));
    const first = byDocId(ledgers, 2).map((d) => d.id);
    const again = byDocId(ledgers, 2).map((d) => d.id);
    assert.deepEqual(first, again, "the same accounts are excluded every time");
    assert.ok(!first.includes("driver:07909"), "the highest-numbered account is never shown");
  });

  test("a dispute over 340 payments is decided on 100 of them", () => {
    assert.equal(Math.round((100 / 340) * 100), 29);
  });
});
