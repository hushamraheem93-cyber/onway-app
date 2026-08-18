/**
 * H-73 — "four driver functions match the phone number exactly while the main
 * lookup matches every format, so a driver stored in a different format can log
 * in, but their push token is never saved, their online status never set, their
 * location never stored, and they are assigned batches they are never told about."
 *
 * The five affected paths — the four from the report plus the driver-rating
 * route, which had the same defect and was not listed — now share one matching
 * rule: `findDriverDocByPhone`.
 *
 * These tests EXECUTE the shipped functions. Each one is lifted out of
 * server/firebase.ts with the TypeScript AST, transpiled, and run against an
 * in-memory Firestore double. Nothing touches a real project: no emulator, no
 * credentials, no network. A reimplementation of the lookup in this file would
 * prove nothing, so the real declarations are used verbatim — including the
 * private `phoneVariants` helper they depend on.
 *
 * Every number here is synthetic (07 70 000 00xx).
 *
 * The financial boundary matters as much as the fix. H-72 moved a driver's money
 * onto an opaque `walletId`; H-73 makes the PHONE better at finding the PERSON.
 * Those must not be confused, so the last block asserts that no money path was
 * re-pointed at a phone number.
 *
 * Run:  node --test tests/unit/h73-driver-phone-identity.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const FIREBASE = read("server/firebase.ts");
const ROUTES = read("server/routes.ts");

// ─── lifting ─────────────────────────────────────────────────────────────────

function liftFn(src, name) {
  const sf = ts.createSourceFile("lift.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let out = null;
  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(out, `could not lift ${name} — renamed or removed`);
  return out.replace(/^export\s+/, "");
}

/** The five driver functions plus the two helpers they share, in one scope. */
const LIFTED = [
  "phoneVariants",
  "findDriverDocByPhone",
  "getDriverByPhone",
  "updateDriverOnlineStatus",
  "saveDriverPushToken",
  "getDriverPushToken",
  "updateDriverLastLocation",
];

function loadDriverFns(db) {
  const decls = LIFTED.map((n) => liftFn(FIREBASE, n)).join("\n");
  const js = ts.transpileModule(`${decls}\nreturn { ${LIFTED.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = {
    db,
    admin: { firestore: { Timestamp: { now: () => ({ __ts: true }) } } },
    console: { error() {}, warn() {}, log() {} },
  };
  const k = Object.keys(deps);
  return new Function(...k, js)(...k.map((n) => deps[n]));
}

// ─── Firestore double ────────────────────────────────────────────────────────

function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  const queries = []; // every phone string the code searched for
  const docRef = (col, id) => ({
    id,
    get: async () => {
      const d = store.get(`${col}/${id}`);
      return { exists: d !== undefined, id, data: () => d, ref: docRef(col, id) };
    },
    update: async (patch) => {
      const cur = store.get(`${col}/${id}`);
      if (cur === undefined) throw new Error("NOT_FOUND");
      store.set(`${col}/${id}`, { ...cur, ...patch });
    },
  });
  const collection = (col) => ({
    doc: (id) => docRef(col, id),
    where: (field, _op, val) => {
      if (col === "drivers" && field === "phoneNumber") queries.push(val);
      const run = () => {
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(`${col}/`))
          .filter(([, v]) => v?.[field] === val)
          .map(([k, v]) => {
            const id = k.slice(col.length + 1);
            return { id, data: () => v, ref: docRef(col, id) };
          });
        return { empty: docs.length === 0, docs, size: docs.length };
      };
      return { limit: () => ({ get: async () => run() }), get: async () => run() };
    },
  });
  return { db: { collection }, store, queries };
}

// ─── the corpus: one driver, four spellings ──────────────────────────────────

const LOCAL = "07700000051";       // 07…
const LOCAL_078 = "07800000052";   // 078…
const INTL_00 = "009647700000051"; // 00964 7…
const INTL_PLUS = "+9647700000051";// +964 7…
const NO_ZERO = "7700000051";      // 7… (no leading zero)
const STRANGER = "07700000099";    // a different person

const driverDoc = (phoneNumber, extra = {}) => ({
  phoneNumber,
  fullName: "TEST DRIVER",
  status: "approved",
  walletId: "drv_0123456789abcdef01234567", // H-72 identity, untouched by H-73
  ...extra,
});

/** Every spelling a caller might hold for the same person. */
const SPELLINGS = [
  ["07…", LOCAL],
  ["00964…", INTL_00],
  ["+964…", INTL_PLUS],
  ["7… (no leading zero)", NO_ZERO],
];

// ═════════════════════════════════════════════════════════════════════════════
describe("H-73 · the central lookup finds one person under any spelling", () => {
  for (const [storedLabel, stored] of SPELLINGS) {
    for (const [askedLabel, asked] of SPELLINGS) {
      test(`stored as ${storedLabel}, asked with ${askedLabel}`, async () => {
        const { db } = makeDb({ "drivers/drv_1": driverDoc(stored) });
        const { findDriverDocByPhone } = loadDriverFns(db);
        const doc = await findDriverDocByPhone(asked);
        assert.ok(doc, `a driver stored as ${stored} was invisible to ${asked}`);
        assert.equal(doc.id, "drv_1");
      });
    }
  }

  test("A. stored in the local Iraqi form, requested with +964", async () => {
    const { db } = makeDb({ "drivers/drv_1": driverDoc(LOCAL) });
    const { getDriverByPhone } = loadDriverFns(db);
    const d = await getDriverByPhone(INTL_PLUS);
    assert.equal(d?.id, "drv_1");
    assert.equal(d?.status, "approved");
  });

  test("B. stored with +964, requested with 07x", async () => {
    const { db } = makeDb({ "drivers/drv_1": driverDoc(INTL_PLUS) });
    const { getDriverByPhone } = loadDriverFns(db);
    assert.equal((await getDriverByPhone(LOCAL))?.id, "drv_1");
  });

  test("it does not collapse two different people", async () => {
    const { db } = makeDb({
      "drivers/drv_1": driverDoc(LOCAL),
      "drivers/drv_2": driverDoc(STRANGER),
    });
    const { findDriverDocByPhone } = loadDriverFns(db);
    assert.equal((await findDriverDocByPhone(LOCAL)).id, "drv_1");
    assert.equal((await findDriverDocByPhone(STRANGER)).id, "drv_2");
    // 078… is a real, different Iraqi number — not a variant of 077…
    assert.equal(await findDriverDocByPhone(LOCAL_078), null);
  });

  test("an unknown number finds nobody rather than the first driver", async () => {
    const { db } = makeDb({ "drivers/drv_1": driverDoc(LOCAL) });
    const { findDriverDocByPhone } = loadDriverFns(db);
    assert.equal(await findDriverDocByPhone("07700000077"), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-73 · C. the push token reaches the right driver", () => {
  for (const [storedLabel, stored] of SPELLINGS) {
    test(`saved and read back for a driver stored as ${storedLabel}`, async () => {
      const { db, store } = makeDb({ "drivers/drv_1": driverDoc(stored) });
      const { saveDriverPushToken, getDriverPushToken } = loadDriverFns(db);

      // The caller always holds the token's canonical form.
      await saveDriverPushToken(LOCAL, "ExponentPushToken[test-synthetic]");
      assert.equal(
        store.get("drivers/drv_1").pushToken,
        "ExponentPushToken[test-synthetic]",
        "the push token was silently dropped — the driver is never notified",
      );
      assert.equal(await getDriverPushToken(LOCAL), "ExponentPushToken[test-synthetic]");
    });
  }

  test("a batch assignment can actually be announced", async () => {
    // Dispatch resolves the driver by variant match, then looks up their token.
    // Before H-73 the first succeeded and the second returned null.
    const { db } = makeDb({ "drivers/drv_1": driverDoc(INTL_00, { pushToken: "tok_synthetic" }) });
    const { getDriverByPhone, getDriverPushToken } = loadDriverFns(db);
    assert.ok(await getDriverByPhone(LOCAL), "dispatch could not find the driver at all");
    assert.equal(
      await getDriverPushToken(LOCAL),
      "tok_synthetic",
      "the driver is assigned batches they are never told about",
    );
  });

  test("no token for an unknown driver, rather than someone else's", async () => {
    const { db } = makeDb({ "drivers/drv_1": driverDoc(LOCAL, { pushToken: "tok_synthetic" }) });
    const { getDriverPushToken } = loadDriverFns(db);
    assert.equal(await getDriverPushToken(LOCAL_078), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-73 · D. online status reaches the right driver", () => {
  for (const [storedLabel, stored] of SPELLINGS) {
    test(`toggled for a driver stored as ${storedLabel}`, async () => {
      const { db, store } = makeDb({ "drivers/drv_1": driverDoc(stored, { isOnline: false }) });
      const { updateDriverOnlineStatus } = loadDriverFns(db);

      await updateDriverOnlineStatus(LOCAL, true);
      assert.equal(store.get("drivers/drv_1").isOnline, true,
        "the driver could never come online");
      assert.equal(typeof store.get("drivers/drv_1").onlineAt, "number");

      await updateDriverOnlineStatus(LOCAL, false);
      assert.equal(store.get("drivers/drv_1").isOnline, false);
      assert.equal(store.get("drivers/drv_1").onlineAt, null);
    });
  }

  test("an unknown number changes nobody's status", async () => {
    const { db, store } = makeDb({ "drivers/drv_1": driverDoc(LOCAL, { isOnline: false }) });
    const { updateDriverOnlineStatus } = loadDriverFns(db);
    await updateDriverOnlineStatus(LOCAL_078, true);
    assert.equal(store.get("drivers/drv_1").isOnline, false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-73 · E. the location reaches the right driver", () => {
  for (const [storedLabel, stored] of SPELLINGS) {
    test(`stored for a driver stored as ${storedLabel}`, async () => {
      const { db, store } = makeDb({ "drivers/drv_1": driverDoc(stored) });
      const { updateDriverLastLocation } = loadDriverFns(db);

      await updateDriverLastLocation(LOCAL, 34.4526, 43.8842); // Dhuluiyah-ish
      const d = store.get("drivers/drv_1");
      assert.equal(d.lastLat, 34.4526, "the driver's GPS was never persisted");
      assert.equal(d.lastLng, 43.8842);
      assert.ok(d.lastLocationAt, "no location timestamp was written");
    });
  }

  test("an unknown number moves nobody", async () => {
    const { db, store } = makeDb({ "drivers/drv_1": driverDoc(LOCAL) });
    const { updateDriverLastLocation } = loadDriverFns(db);
    await updateDriverLastLocation(LOCAL_078, 1, 2);
    assert.equal(store.get("drivers/drv_1").lastLat, undefined);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-73 · every driver-document lookup shares one rule", () => {
  test("no exact-match lookup on the drivers collection survives outside the helper", () => {
    // The one inside findDriverDocByPhone iterates phoneVariants — that IS the rule.
    const sf = ts.createSourceFile("firebase.ts", FIREBASE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const offenders = [];
    const walk = (node, fnName) => {
      const name = ts.isFunctionDeclaration(node) && node.name ? node.name.text : fnName;
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "where" &&
        node.arguments.length === 3 &&
        node.arguments[0].getText(sf) === '"phoneNumber"'
      ) {
        const recv = node.expression.expression.getText(sf);
        if (recv.includes('collection("drivers")') && name !== "findDriverDocByPhone") {
          offenders.push(`${name}: ${node.getText(sf).slice(0, 70)}`);
        }
      }
      ts.forEachChild(node, (c) => walk(c, name));
    };
    walk(sf, "<top>");
    assert.deepEqual(offenders, [],
      `a driver lookup matches the phone exactly again:\n  ${offenders.join("\n  ")}`);
  });

  test("all five callers go through the helper", () => {
    for (const fn of ["updateDriverOnlineStatus", "saveDriverPushToken",
                      "getDriverPushToken", "updateDriverLastLocation", "getDriverByPhone"]) {
      assert.match(liftFn(FIREBASE, fn), /findDriverDocByPhone\(/,
        `${fn} no longer resolves the driver through the shared lookup`);
    }
  });

  test("the driver-rating route uses it too", () => {
    // Not in the report's four; same defect, so it is held to the same rule.
    assert.match(ROUTES, /const driverDoc = await findDriverDocByPhone\(String\(driverPhone\)\)/,
      "the rating route matches the driver's phone exactly again");
    assert.doesNotMatch(ROUTES, /collection\("drivers"\)\.where\("phoneNumber", "==", String\(driverPhone\)\)/,
      "the rating route's exact match is back");
  });

  test("the matching rule is the project's existing one, not a second copy", () => {
    assert.match(liftFn(FIREBASE, "findDriverDocByPhone"), /phoneVariants\(phoneNumber\)/,
      "the lookup grew its own phone-format logic instead of reusing phoneVariants");
    const variantFns = (FIREBASE.match(/function phoneVariants\(/g) ?? []).length;
    assert.equal(variantFns, 1, "there is more than one phoneVariants definition");
  });

  test("the cheapest match is tried first", async () => {
    const { db, queries } = makeDb({ "drivers/drv_1": driverDoc(LOCAL) });
    const { findDriverDocByPhone } = loadDriverFns(db);
    await findDriverDocByPhone(LOCAL);
    assert.equal(queries[0], LOCAL, "the exact spelling is no longer attempted first");
    assert.equal(queries.length, 1, "a hit on the first variant still ran extra queries");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-73 · F+9. the phone is not, and did not become, a financial key", () => {
  const MONEY_FNS = [
    "getSettlementLedger", "getSettlementHistory", "getSettlementPayments",
    "getAccountSettlementView", "getAccountStatement", "createSettlementRequest",
    "isOverSettlementThreshold", "adminAdjustLedger",
  ];
  const PHONEISH = /^(phoneNumber|phone|driverPhone|d\.phoneNumber|driver\.phoneNumber|String\(phoneNumber\))$/;

  function calls(name) {
    const sf = ts.createSourceFile("routes.ts", ROUTES, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const out = [];
    const walk = (n) => {
      if (ts.isCallExpression(n) &&
          ((ts.isIdentifier(n.expression) && n.expression.text === name) ||
           (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === name))) {
        out.push(n.arguments.map((a) => a.getText(sf)));
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return out;
  }

  test("H-72 still holds: no money read takes a phone as the driver account", () => {
    const offenders = [];
    for (const fn of MONEY_FNS) {
      for (const args of calls(fn)) {
        if (args[0] === '"driver"' && PHONEISH.test((args[1] ?? "").trim())) {
          offenders.push(`${fn}(${args.slice(0, 2).join(", ")})`);
        }
      }
    }
    assert.deepEqual(offenders, [],
      `H-73 re-pointed a financial path at a phone number: ${offenders.join(" | ")}`);
  });

  test("H-72 still holds: accruals and payments carry a resolved account id", () => {
    const bad = ROUTES.match(/accountType: *"driver", *accountId: *(phoneNumber|driverPhone|phone)\b/g) ?? [];
    assert.deepEqual(bad, [], `an accrual is keyed by phone again: ${bad.join(" | ")}`);
    assert.match(ROUTES, /accountId: driverAccountId/);
  });

  test("H-72 still holds: the wallet id is minted and published", () => {
    assert.match(liftFn(FIREBASE, "createDriver"), /walletId: mintDriverWalletId\(\)/,
      "new drivers stopped getting a financial identity");
    assert.match(ROUTES, /\(req as any\)\.driverWalletId = driverWalletIdOf\(driver, driverPhone\)/);
  });

  test("the shared lookup builds no account id of its own", () => {
    const src = liftFn(FIREBASE, "findDriverDocByPhone");
    for (const forbidden of ["ledgerId", "accountKey", "settlementLedger", "walletId"]) {
      assert.ok(!src.includes(forbidden),
        `the driver lookup touches ${forbidden} — identity resolution and money must stay separate`);
    }
  });

  test("finding a driver by any spelling does not change their wallet id", async () => {
    const { db } = makeDb({ "drivers/drv_1": driverDoc(INTL_00) });
    const { getDriverByPhone } = loadDriverFns(db);
    const viaLocal = await getDriverByPhone(LOCAL);
    const viaIntl = await getDriverByPhone(INTL_PLUS);
    assert.equal(viaLocal.walletId, "drv_0123456789abcdef01234567");
    assert.equal(viaLocal.walletId, viaIntl.walletId,
      "the same driver resolved to two different financial identities");
  });
});
