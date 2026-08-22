import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { timestampMillis } from "../../server/time.ts";
import { promoSettlementAmounts, completeSettlement, ledgerId } from "../../server/settlement.ts";

const routes = fs.readFileSync(new URL("../../server/routes.ts", import.meta.url), "utf8");
const vendor = fs.readFileSync(new URL("../../server/vendor.ts", import.meta.url), "utf8");
const firebase = fs.readFileSync(new URL("../../server/firebase.ts", import.meta.url), "utf8");

function makeFakeDb() {
  const store = new Map();
  let chain = Promise.resolve();

  const makeRef = (path) => ({
    path,
    id: path.split("/").slice(1).join("/"),
    async set(data, opts) {
      const previous = opts?.merge ? (store.get(path) ?? {}) : {};
      store.set(path, { ...previous, ...data });
    },
  });

  const db = {
    collection(name) {
      return {
        doc: (id) => makeRef(`${name}/${id}`),
        where() { return this; },
        orderBy() { return this; },
        limit() { return this; },
        async get() { return { empty: true, docs: [] }; },
      };
    },
    runTransaction(fn) {
      const run = async () => {
        const pending = [];
        const tx = {
          async get(ref) {
            const data = store.get(ref.path);
            return { exists: data !== undefined, data: () => data };
          },
          set(ref, data, opts) { pending.push({ ref, data, merge: !!opts?.merge }); },
          update(ref, data) { pending.push({ ref, data, merge: true }); },
        };
        const result = await fn(tx);
        for (const write of pending) {
          const previous = write.merge ? (store.get(write.ref.path) ?? {}) : {};
          store.set(write.ref.path, { ...previous, ...write.data });
        }
        return result;
      };
      const queued = chain.then(run, run);
      chain = queued.then(() => {}, () => {});
      return queued;
    },
    batch() {
      const writes = [];
      return {
        update(ref, data) { writes.push({ ref, data, merge: true }); },
        set(ref, data) { writes.push({ ref, data, merge: false }); },
        async commit() {
          for (const write of writes) {
            const previous = write.merge ? (store.get(write.ref.path) ?? {}) : {};
            store.set(write.ref.path, { ...previous, ...write.data });
          }
        },
      };
    },
    _get(path) { return store.get(path); },
    _keys() { return [...store.keys()]; },
  };
  return db;
}

function seedLedger(db, outstanding = 50000) {
  const accountType = "driver";
  const accountId = "07700000001";
  db.collection("settlementLedger").doc(ledgerId(accountType, accountId)).set({
    accountType,
    accountId,
    accountName: "سائق تجريبي",
    outstandingTotal: outstanding,
    totalSettled: 0,
    pendingCount: 1,
  });
  return { accountType, accountId };
}

describe("M-02 — report bounds use Firestore-compatible timestamps", () => {
  test("analytics and operations use Timestamp bounds and safe date conversion", () => {
    assert.match(routes, /Timestamp\.fromMillis\(now\.getTime\(\) - 24 \* 3600000\)/);
    assert.match(routes, /Timestamp\.fromMillis\(Date\.now\(\) - days \* 86400000\)/);
    assert.match(routes, /timestampMillis\(o\.createdAt\)/);
    assert.equal(timestampMillis("2026-08-22T00:00:00.000Z"), Date.parse("2026-08-22T00:00:00.000Z"));
  });
});

describe("M-04/M-05 — cancellation uses acceptance time and safe timestamp parsing", () => {
  test("confirmed cancellation reads confirmedAt/vendorStatusAt_confirmed before createdAt", () => {
    assert.match(routes, /data\.confirmedAt \?\? data\.vendorStatusAt_confirmed \?\? data\.createdAt/);
    assert.match(routes, /تعذّر تحديد وقت قبول الطلب/);
    assert.match(firebase, /status === "confirmed" \? \{ confirmedAt: updatedAt \}/);
    assert.match(vendor, /vendorStatusAt_\$\{status\}/);
  });

  test("ISO, Date and Firestore-like values are all safe", () => {
    const date = new Date("2026-08-22T00:00:00.000Z");
    assert.equal(timestampMillis(date), date.getTime());
    assert.equal(timestampMillis({ toMillis: () => 1234 }), 1234);
    assert.equal(timestampMillis("not-a-date"), null);
  });
});

describe("M-06 — stored updatedAt is Timestamp-based", () => {
  test("vendor writes and route order/rating writes use Timestamp.now", () => {
    assert.match(vendor, /updatedAt: Timestamp\.now\(\)/);
    assert.doesNotMatch(vendor, /updatedAt:\s*new Date\(\)/);
    assert.match(routes, /updatedAt: Timestamp\.now\(\)/);
    assert.match(firebase, /timestampMillis\(a\.updatedAt\)/);
  });
});

describe("M-08 — settlement overpayment is preserved", () => {
  test("requested 60,000 against 50,000 records 10,000 overpayment", async () => {
    const db = makeFakeDb();
    const { accountType, accountId } = seedLedger(db, 50000);
    const result = await completeSettlement({
      accountType,
      accountId,
      amount: 60000,
      adminName: "admin",
      method: "cash",
    }, db);

    assert.equal(result.ok, true);
    assert.equal(result.applied, 50000);
    assert.equal(result.requestedAmount, 60000);
    assert.equal(result.overpaymentAmount, 10000);
    assert.equal(result.outstandingAfter, 0);
    const paymentPath = db._keys().find((path) => path.startsWith("settlementPayments/"));
    assert.ok(paymentPath, "settlement payment must be persisted");
    const payment = db._get(paymentPath);
    assert.equal(payment.requestedAmount, 60000);
    assert.equal(payment.overpaymentAmount, 10000);
  });
});

function settlementSource() {
  return fs.readFileSync(new URL("../../server/settlement.ts", import.meta.url), "utf8");
}

describe("M-09 — promo discount funding is explicit", () => {
  test("marketplace discount is funded by platform while vendor gross remains pre-discount", () => {
    const result = promoSettlementAmounts({ total: 850, deliveryFee: 100, serviceFee: 50, promoDiscount: 200 });
    assert.equal(result.orderValue, 700);
    assert.equal(result.grossBeforeDiscount, 900);
    assert.equal(result.promoFundingAmount, 200);
  });

  test("restaurant vendor gross remains restaurantSubtotal and does not double-fund", () => {
    const result = promoSettlementAmounts({ restaurantSubtotal: 900, total: 850, deliveryFee: 100, serviceFee: 50, promoDiscount: 200 });
    assert.equal(result.grossBeforeDiscount, 900);
    assert.equal(result.promoFundingAmount, 0);
  });
});

describe("M-10 — tracked stock is decremented atomically with order creation", () => {
  test("order path aggregates stock and delegates to transactional creator", () => {
    assert.match(routes, /const stockRequirements = new Map/);
    assert.match(routes, /stockRequirements\.set\(it\.productId, current\)/);
    assert.match(routes, /Object\.defineProperty\(orderData, "__stockDeltas"/);
    assert.match(firebase, /createOrderWithInventory\(data, requestedStockDeltas\)/);
    assert.match(firebase, /await firestore\.runTransaction\(async \(tx: any\)/);
    assert.match(firebase, /stock: Math\.max\(0, Math\.floor\(current - quantity\)\)/);
    assert.match(firebase, /insufficient_stock/);
  });
});
