/**
 * H-72 — "deleting a store or a driver orphans its whole financial record; and
 * the driver's balance is keyed by phone number, so a new driver on the same
 * number inherits the old driver's debt."
 *
 * Both halves are fixed and both are checked here by RUNNING the shipped code,
 * not by matching it. Firestore is a recording in-memory double; no emulator,
 * no project credentials, nothing writes anywhere real.
 *
 * The functions under test are lifted out of server/*.ts with the TypeScript
 * AST, transpiled, and executed with their dependencies injected. Lifting keeps
 * the test honest: if `createDriver` stops minting a walletId, or `deleteDriver`
 * starts deleting ledgers, these fail — a reimplementation in the test file
 * would not notice either.
 *
 * Covered, in the order the task listed them:
 *   A. deleting a driver does not delete the financial history
 *   B. a new driver on the same phone does not inherit the balance
 *   C. the old debt does not gate the new driver's threshold checks
 *   D. the old history stays attached to the old identity
 *   E. changing the phone does not move the wallet
 *   F. a deleted vendor's history stays attributable
 *   G. no path is left that keys a driver's money on a phone number
 *
 * Every phone here is synthetic.
 *
 * Run:  node --test tests/unit/h72-wallet-identity-and-orphaning.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  mintDriverWalletId,
  driverWalletIdOf,
  resolveDriverAccountId,
  isMintedDriverWalletId,
  DRIVER_WALLET_ID_RE,
} from "../../server/walletIdentity.ts";
import { ledgerId, accountKey } from "../../server/settlement.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = read("server/routes.ts");
const FIREBASE = read("server/firebase.ts");

// ─── lifting shipped functions ───────────────────────────────────────────────

/** One function declaration, taken from the AST so multi-line signatures and
 *  object return types cannot truncate the body. */
function liftFn(src, name) {
  const sf = ts.createSourceFile("lift.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let out = null;
  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(out, `could not lift ${name} — it was renamed or removed`);
  return out.replace(/^export\s+/, "");
}

function build(decls, names, deps) {
  const js = ts.transpileModule(`${decls}\nreturn { ${names.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const k = Object.keys(deps);
  return new Function(...k, js)(...k.map((n) => deps[n]));
}

// ─── recording Firestore double ──────────────────────────────────────────────

function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const deletes = [];
  const docRef = (col, id) => ({
    id,
    get: async () => {
      const d = store.get(`${col}/${id}`);
      return { exists: d !== undefined, id, data: () => d, ref: docRef(col, id) };
    },
    delete: async () => { deletes.push(`${col}/${id}`); store.delete(`${col}/${id}`); },
    update: async (p) => {
      if (!store.has(`${col}/${id}`)) throw new Error("NOT_FOUND");
      store.set(`${col}/${id}`, { ...store.get(`${col}/${id}`), ...p });
    },
    set: async (p) => store.set(`${col}/${id}`, p),
  });
  const query = (col, field, val) => {
    const docs = [...store.entries()]
      .filter(([k]) => k.startsWith(`${col}/`))
      .filter(([, v]) => field === null || v?.[field] === val)
      .map(([k, v]) => ({ id: k.slice(col.length + 1), data: () => v, ref: docRef(col, k.slice(col.length + 1)) }));
    return { empty: docs.length === 0, docs, size: docs.length };
  };
  const collection = (col) => ({
    doc: (id) => docRef(col, id),
    add: async (d) => {
      const id = `auto_${store.size}_${Math.random().toString(36).slice(2, 8)}`;
      store.set(`${col}/${id}`, d);
      return docRef(col, id);
    },
    where: (f, _op, v) => ({
      limit: () => ({ get: async () => query(col, f, v) }),
      get: async () => query(col, f, v),
      orderBy: () => ({ limit: () => ({ get: async () => query(col, f, v) }) }),
    }),
    get: async () => query(col, null, null),
  });
  const db = {
    collection,
    batch: () => {
      const ops = [];
      return { delete: (r) => ops.push(r), commit: async () => { for (const r of ops) await r.delete(); } };
    },
  };
  return { db, store, deletes };
}

const TS_NOW = { now: () => ({ __ts: true }) };
const ADMIN = { firestore: { Timestamp: TS_NOW } };
const QUIET = { error() {}, warn() {}, log() {} };

// Synthetic throughout.
const PHONE = "07700000042";
const OTHER_PHONE = "07700000043";

// ─── the shipped functions under test ────────────────────────────────────────

function loadFirebaseFns(db) {
  return build(
    [liftFn(FIREBASE, "createDriver"), liftFn(FIREBASE, "deleteDriver"), liftFn(FIREBASE, "deleteVendor")].join("\n"),
    ["createDriver", "deleteDriver", "deleteVendor"],
    {
      db,
      getFirestore: () => db,
      admin: ADMIN,
      console: QUIET,
      mintDriverWalletId,
      deleteFromFirebaseStorage: async () => {},
    },
  );
}

/** The real markLedgerOwnerDeleted, running against the double. */
function loadMarkOwnerDeleted(db) {
  return build(
    liftFn(read("server/settlement.ts"), "markLedgerOwnerDeleted"),
    ["markLedgerOwnerDeleted"],
    { getFirestore: () => db, admin: ADMIN, console: QUIET, ledgerId, LEDGER: "settlementLedger" },
  ).markLedgerOwnerDeleted;
}

const newDriverArgs = (phoneNumber, fullName) => ({
  phoneNumber, fullName, firstName: "", secondName: "", thirdName: "",
  fourthName: "", nationalIdImage: "x",
});

/** A ledger plus the records filed under the same accountKey. */
const seedLedger = (accountType, accountId, outstanding) => ({
  [`settlementLedger/${ledgerId(accountType, accountId)}`]: {
    accountType, accountId, accountKey: accountKey(accountType, accountId),
    accountName: "OLD", outstandingTotal: outstanding, totalGross: outstanding * 4,
    totalCommission: 0, totalSettled: 0,
  },
  [`settlements/ord_1__${accountType}`]: {
    accountKey: accountKey(accountType, accountId), outstandingAmount: outstanding, orderId: "ord_1",
  },
  [`settlementRequests/req_1`]: { accountKey: accountKey(accountType, accountId), status: "pending" },
  [`settlementPayments/pay_1`]: { accountKey: accountKey(accountType, accountId), amount: 1000 },
  [`settlementAdjustments/adj_1`]: { accountKey: accountKey(accountType, accountId), amount: 500 },
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-72 · the wallet identity itself", () => {
  test("a minted id is opaque and contains no phone digits", () => {
    const id = mintDriverWalletId();
    assert.match(id, DRIVER_WALLET_ID_RE);
    assert.ok(!id.includes(PHONE.slice(-4)), "the wallet id embeds part of a phone number");
  });

  test("two drivers never share an id", () => {
    const ids = new Set(Array.from({ length: 500 }, () => mintDriverWalletId()));
    assert.equal(ids.size, 500);
  });

  test("a driver with a minted id resolves to it, whatever phone is passed", () => {
    const d = { walletId: "drv_0123456789abcdef01234567" };
    assert.equal(driverWalletIdOf(d, PHONE), d.walletId);
    assert.equal(driverWalletIdOf(d, OTHER_PHONE), d.walletId);
    assert.equal(driverWalletIdOf(d, ""), d.walletId);
  });

  test("a pre-H-72 driver keeps resolving to the caller's phone", () => {
    // Their ledger is at driver:<phone> and must not be moved by this change.
    assert.equal(driverWalletIdOf({ phoneNumber: OTHER_PHONE }, PHONE), PHONE);
    assert.equal(driverWalletIdOf(null, PHONE), PHONE);
  });

  test("it fails closed rather than keying a shared ledger", () => {
    // "driver:undefined" would collect unrelated drivers into one account.
    assert.throws(() => driverWalletIdOf(null, undefined), /refusing to key a ledger/);
    assert.throws(() => driverWalletIdOf({}, "   "), /refusing to key a ledger/);
    assert.equal(isMintedDriverWalletId("07700000042"), false);
    assert.equal(isMintedDriverWalletId("drv_nothex"), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-72 · A. deleting a driver preserves the financial history", () => {
  test("the ledger, settlements, requests, payments and adjustments all survive", async () => {
    const walletId = mintDriverWalletId();
    const { db, store, deletes } = makeDb({
      "drivers/drv_old": { phoneNumber: PHONE, fullName: "OLD", walletId },
      ...seedLedger("driver", walletId, 250000),
    });
    const { deleteDriver } = loadFirebaseFns(db);

    assert.equal(await deleteDriver("drv_old"), true);

    assert.deepEqual(deletes, ["drivers/drv_old"], "something other than the driver document was deleted");
    for (const key of [
      `settlementLedger/${ledgerId("driver", walletId)}`,
      "settlements/ord_1__driver",
      "settlementRequests/req_1",
      "settlementPayments/pay_1",
      "settlementAdjustments/adj_1",
    ]) {
      assert.ok(store.has(key), `${key} was destroyed — the audit trail is gone`);
    }
  });

  test("the ledger is stamped with a deleted owner instead of being orphaned", async () => {
    const walletId = mintDriverWalletId();
    const { db, store } = makeDb({
      "drivers/drv_old": { phoneNumber: PHONE, fullName: "OLD NAME", walletId },
      ...seedLedger("driver", walletId, 250000),
    });
    const markLedgerOwnerDeleted = loadMarkOwnerDeleted(db);

    const stamped = await markLedgerOwnerDeleted("driver", walletId, {
      name: "OLD NAME", phoneNumber: PHONE, ownerDocId: "drv_old",
    });
    assert.equal(stamped, true);

    const led = store.get(`settlementLedger/${ledgerId("driver", walletId)}`);
    assert.equal(led.ownerStatus, "deleted");
    assert.ok(led.ownerDeletedAt, "no deletion timestamp was recorded");
    assert.equal(led.ownerSnapshot.name, "OLD NAME", "the balance is left with no name attached");
    assert.equal(led.outstandingTotal, 250000, "stamping the owner changed the money");
    assert.equal(led.accountKey, accountKey("driver", walletId), "the account key moved — existing queries would miss it");
  });

  test("a driver with no financial history stamps nothing and reports so", async () => {
    const { db } = makeDb({ "drivers/drv_new": { phoneNumber: PHONE, walletId: mintDriverWalletId() } });
    assert.equal(await loadMarkOwnerDeleted(db)("driver", mintDriverWalletId(), {}), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-72 · B+C+D. a recycled phone number does not carry the debt", () => {
  /** Delete the old driver, register a new one on the same number. */
  async function recycle(oldDriver) {
    const { db, store } = makeDb({
      "drivers/drv_old": oldDriver,
      ...seedLedger("driver", driverWalletIdOf(oldDriver, PHONE), 250000),
    });
    const { createDriver, deleteDriver } = loadFirebaseFns(db);
    const oldAccount = driverWalletIdOf(oldDriver, PHONE);

    await loadMarkOwnerDeleted(db)("driver", oldAccount, { name: oldDriver.fullName, phoneNumber: PHONE });
    await deleteDriver("drv_old");
    const fresh = await createDriver(newDriverArgs(PHONE, "NEW DRIVER"));
    return { db, store, oldAccount, fresh, newAccount: driverWalletIdOf(fresh, PHONE) };
  }

  test("B. the new driver's wallet is a different account and reads zero", async () => {
    const { store, oldAccount, fresh, newAccount } = await recycle({
      phoneNumber: PHONE, fullName: "OLD", walletId: mintDriverWalletId(),
    });

    assert.match(fresh.walletId, DRIVER_WALLET_ID_RE, "the new driver was created without a wallet id");
    assert.notEqual(newAccount, oldAccount, "the new driver landed on the old account");

    // This is what GET /api/driver/wallet resolves for them.
    const theirLedger = store.get(`settlementLedger/${ledgerId("driver", newAccount)}`);
    assert.equal(theirLedger, undefined, "the new driver inherited a ledger");
    assert.equal(theirLedger?.outstandingTotal ?? 0, 0, "the new driver inherited a balance");
  });

  test("B. the same holds for a pre-H-72 driver, whose account was the phone", async () => {
    // The legacy driver has no walletId, so their ledger is literally driver:<phone>.
    const { store, oldAccount, newAccount } = await recycle({ phoneNumber: PHONE, fullName: "LEGACY" });

    assert.equal(oldAccount, PHONE, "the legacy account should have been the phone itself");
    assert.match(newAccount, DRIVER_WALLET_ID_RE, "the replacement did not get a minted id");
    assert.equal(store.get(`settlementLedger/${ledgerId("driver", newAccount)}`), undefined);
    assert.equal(
      store.get(`settlementLedger/${ledgerId("driver", oldAccount)}`).outstandingTotal,
      250000,
      "the legacy driver's balance was moved or lost",
    );
  });

  test("C. the inherited debt no longer gates the new driver", async () => {
    const { store, oldAccount, newAccount } = await recycle({
      phoneNumber: PHONE, fullName: "OLD", walletId: mintDriverWalletId(),
    });
    // isOverSettlementThreshold reads outstandingTotal off the account's ledger.
    const outstandingOf = (acct) =>
      store.get(`settlementLedger/${ledgerId("driver", acct)}`)?.outstandingTotal ?? 0;
    const DEFAULT_THRESHOLD = 50000;

    assert.ok(outstandingOf(oldAccount) >= DEFAULT_THRESHOLD, "the fixture must exceed the threshold to be meaningful");
    assert.equal(outstandingOf(newAccount), 0);
    assert.equal(
      outstandingOf(newAccount) >= DEFAULT_THRESHOLD,
      false,
      "the new driver is blocked from going online by someone else's debt",
    );
  });

  test("D. every old record stays filed under the old identity", async () => {
    const { store, oldAccount, newAccount } = await recycle({
      phoneNumber: PHONE, fullName: "OLD", walletId: mintDriverWalletId(),
    });
    const oldKey = accountKey("driver", oldAccount);
    const newKey = accountKey("driver", newAccount);

    for (const doc of ["settlements/ord_1__driver", "settlementRequests/req_1",
                       "settlementPayments/pay_1", "settlementAdjustments/adj_1"]) {
      assert.equal(store.get(doc).accountKey, oldKey, `${doc} was re-pointed`);
      assert.notEqual(store.get(doc).accountKey, newKey, `${doc} followed the phone to the new driver`);
    }
    assert.equal(
      store.get(`settlementLedger/${ledgerId("driver", oldAccount)}`).ownerStatus,
      "deleted",
      "the old account is not marked as having lost its owner",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-72 · E. the wallet does not follow the phone number", () => {
  test("a driver keeps their account id after a phone change", () => {
    const driver = { walletId: mintDriverWalletId(), phoneNumber: PHONE };
    const before = driverWalletIdOf(driver, PHONE);
    const moved = { ...driver, phoneNumber: OTHER_PHONE };
    assert.equal(driverWalletIdOf(moved, OTHER_PHONE), before,
      "changing the phone moved the driver to a different wallet");
    assert.equal(ledgerId("driver", driverWalletIdOf(moved, OTHER_PHONE)), ledgerId("driver", before));
  });

  test("taking over someone's old number does not take over their wallet", () => {
    const a = { walletId: mintDriverWalletId(), phoneNumber: PHONE };
    const b = { walletId: mintDriverWalletId(), phoneNumber: PHONE }; // same number, later
    assert.notEqual(driverWalletIdOf(a, PHONE), driverWalletIdOf(b, PHONE));
  });

  test("an admin can address an account by phone or by account id", async () => {
    const driver = { walletId: mintDriverWalletId(), phoneNumber: PHONE };
    const lookup = async (p) => (p === PHONE ? driver : null);

    assert.equal(await resolveDriverAccountId(PHONE, lookup), driver.walletId);
    // The settlement accounts list hands the admin an accountId; passing it back
    // must reach the same ledger without the driver document existing.
    assert.equal(await resolveDriverAccountId(driver.walletId, async () => null), driver.walletId);
    // A legacy account, whose id IS the phone, still resolves for a deleted driver.
    assert.equal(await resolveDriverAccountId(PHONE, async () => null), PHONE);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-72 · F. a deleted store's history stays attributable", () => {
  test("deleteVendor removes the store and its products, never the money", async () => {
    const { db, store, deletes } = makeDb({
      "vendors/vnd_1": { storeName: "STORE", profileImageUrl: "" },
      "vendorProducts/p1": { vendorId: "vnd_1" },
      ...seedLedger("vendor", "vnd_1", 480000),
    });
    const { deleteVendor } = loadFirebaseFns(db);

    assert.equal(await deleteVendor("vnd_1"), true);
    assert.ok(deletes.includes("vendors/vnd_1"));
    assert.ok(deletes.includes("vendorProducts/p1"));
    for (const key of [`settlementLedger/${ledgerId("vendor", "vnd_1")}`, "settlements/ord_1__vendor",
                       "settlementPayments/pay_1", "settlementAdjustments/adj_1"]) {
      assert.ok(store.has(key), `${key} was destroyed`);
    }
  });

  test("the archived ledger still names the store it belonged to", async () => {
    const { db, store } = makeDb({
      "vendors/vnd_1": { storeName: "مطعم الاختبار" },
      ...seedLedger("vendor", "vnd_1", 480000),
    });
    const stamped = await loadMarkOwnerDeleted(db)("vendor", "vnd_1", {
      name: "مطعم الاختبار", ownerDocId: "vnd_1",
    });
    assert.equal(stamped, true);
    const led = store.get(`settlementLedger/${ledgerId("vendor", "vnd_1")}`);
    assert.equal(led.ownerStatus, "deleted");
    assert.equal(led.ownerSnapshot.name, "مطعم الاختبار");
    assert.equal(led.outstandingTotal, 480000);
  });

  test("a vendor account id is a document id, so no new store can inherit it", () => {
    // The driver side needed a minted id because phones are reissued; vendor
    // document ids are not, which is why this side is orphaning only.
    assert.notEqual(ledgerId("vendor", "vnd_1"), ledgerId("vendor", "vnd_2"));
    assert.equal(ledgerId("vendor", "vnd_1"), "vendor:vnd_1");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-72 · G. no driver money path is keyed by a phone any more", () => {
  /** Call expressions in routes.ts, as `name(argText, argText, …)`. */
  function calls(name) {
    const sf = ts.createSourceFile("routes.ts", ROUTES, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out = [];
    const walk = (n) => {
      if (
        ts.isCallExpression(n) &&
        ((ts.isIdentifier(n.expression) && n.expression.text === name) ||
          (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name))
      ) {
        out.push(n.arguments.map((a) => a.getText(sf)));
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return out;
  }

  const MONEY_READS = [
    "getSettlementLedger", "getSettlementHistory", "getSettlementPayments",
    "getAccountSettlementView", "getAccountStatement", "createSettlementRequest",
    "isOverSettlementThreshold", "adminAdjustLedger",
  ];
  /** Anything that is, or obviously derives from, a phone number. */
  const PHONEISH = /^(phoneNumber|phone|driverPhone|d\.phoneNumber|driver\.phoneNumber|String\(phoneNumber\))$/;

  for (const fn of MONEY_READS) {
    test(`${fn} is never called with a phone as the driver account`, () => {
      const offenders = calls(fn)
        .filter((args) => args[0] === '"driver"')
        .filter((args) => PHONEISH.test((args[1] ?? "").trim()));
      assert.deepEqual(offenders, [], `${fn} still keys a driver's money on a phone: ${JSON.stringify(offenders)}`);
    });
  }

  test("the money reads are actually present — the scan is not vacuous", () => {
    const found = MONEY_READS.filter((fn) => calls(fn).some((a) => a[0] === '"driver"'));
    assert.ok(found.length >= 6, `only found driver calls for: ${found.join(", ")}`);
  });

  test("settlement accruals and payments carry a resolved account id", () => {
    // recordOrderSettlement / completeSettlement take an object, so check the
    // property text rather than a positional argument.
    const bad = ROUTES.match(/accountType: *"driver", *accountId: *(phoneNumber|driverPhone|phone)\b/g) ?? [];
    assert.deepEqual(bad, [], `an accrual or payment is still keyed by phone: ${bad.join(" | ")}`);
    assert.match(ROUTES, /accountId: driverAccountId/, "the delivery accrual no longer resolves an account id");
  });

  test("requireDriverAuth publishes the wallet id for the driver routes", () => {
    assert.match(
      ROUTES,
      /\(req as any\)\.driverWalletId = driverWalletIdOf\(driver, driverPhone\)/,
      "the driver routes have no resolved wallet id to use",
    );
  });

  test("both delete routes stamp the ledger owner before removing them", () => {
    const driverStamp = ROUTES.indexOf('markLedgerOwnerDeleted(\n          "driver"');
    const driverDelete = ROUTES.indexOf("await deleteDriverFn(driverId)");
    assert.ok(driverStamp > 0 && driverDelete > driverStamp,
      "the driver's ledger is stamped after the document is gone, or not at all");

    const vendorStamp = ROUTES.indexOf('markLedgerOwnerDeleted("vendor"');
    const vendorDelete = ROUTES.indexOf("await deleteFirestoreVendor(id)");
    assert.ok(vendorStamp > 0 && vendorDelete > vendorStamp,
      "the store's ledger is stamped after the document is gone, or not at all");
  });
});
