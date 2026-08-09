/**
 * Vendor order status transition tests (audit finding H-20).
 *
 * PATCH /api/vendor/orders/:id/status read the order, checked a local transition table,
 * did two more awaited Firestore lookups to verify ownership, and only then wrote — with
 * nothing atomic anywhere in that sequence. Two dashboards of the same store (a phone
 * and a laptop, or two staff) both passed the check against the same stale snapshot and
 * both wrote. Last write won, arbitrarily: an order could end up "preparing" after it
 * had been cancelled, or confirmed twice — firing the dispatch engine twice and sending
 * two drivers' worth of notifications for one order.
 *
 * The fix re-reads the status and re-applies the SAME table inside one transaction.
 *
 * The table is deliberately NOT replaced by updateOrderStatus(): the vendor's table is
 * narrower than the canonical ORDER_TRANSITIONS on purpose, and routing through the
 * canonical one would hand a store the right to mark orders delivered. The subset test
 * below is the guard that keeps that true.
 *
 * Run:  node --test tests/unit/vendor-order-transition.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { ORDER_TRANSITIONS } from "../../server/firebase.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const VENDOR = read("server/vendor.ts");

function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** The PATCH /api/vendor/orders/:id/status handler, source text. */
const ROUTE = (() => {
  const from = VENDOR.indexOf('router.patch("/api/vendor/orders/:id/status"');
  assert.ok(from > -1, "the vendor status route is gone");
  const to = VENDOR.indexOf("\n// ═", from);
  assert.ok(to > from, "could not find the end of the route");
  return VENDOR.slice(from, to);
})();

/** The vendor's local transition table, parsed from the route source. */
const VENDOR_ALLOWED = (() => {
  const from = ROUTE.indexOf("const ALLOWED: Record<string, string[]> = {");
  assert.ok(from > -1, "the vendor ALLOWED table is gone");
  const body = ROUTE.slice(from, ROUTE.indexOf("};", from));
  const table = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*\[([^\]]*)\],/gm)) {
    table[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
  assert.ok(Object.keys(table).length > 0, "could not parse the ALLOWED table");
  return table;
})();

describe("H-20 — the vendor's transition table is unchanged and stays narrower", () => {
  test("it still holds exactly the three vendor-owned transitions", () => {
    assert.deepEqual(VENDOR_ALLOWED, {
      pending: ["confirmed", "cancelled"],
      confirmed: ["preparing", "cancelled"],
      preparing: ["ready"],
    });
  });

  test("every vendor transition is also legal in the canonical state machine", () => {
    // The vendor may never do something the order state machine forbids.
    for (const [from, targets] of Object.entries(VENDOR_ALLOWED)) {
      const canonical = ORDER_TRANSITIONS[from] ?? [];
      for (const to of targets) {
        assert.ok(canonical.includes(to), `vendor allows ${from} → ${to}, canonical does not`);
      }
    }
  });

  test("and it is strictly narrower — this is the privilege boundary", () => {
    // If these ever became equal, the store would have gained transitions it must not
    // have. preparing → delivered is the one that matters most: a store could mark an
    // undelivered cash order as delivered and trigger settlement.
    assert.ok(ORDER_TRANSITIONS.preparing.includes("delivered"));
    assert.ok(!VENDOR_ALLOWED.preparing.includes("delivered"), "a store must not mark orders delivered");
    assert.ok(!VENDOR_ALLOWED.preparing.includes("cancelled"), "a store must not cancel mid-preparation");
    assert.ok(!VENDOR_ALLOWED.preparing.includes("in_delivery"));
    assert.ok(!("ready" in VENDOR_ALLOWED), "a store has no transitions out of ready");
    assert.ok(!("delivered" in VENDOR_ALLOWED));
    assert.ok(!("cancelled" in VENDOR_ALLOWED), "cancelled is terminal for the vendor path");
  });

  test("the route does not delegate to updateOrderStatus", () => {
    // Delegating would apply the canonical (wider) table and would still need a second,
    // unserialised write for vendorStatusAt_*/estimatedMinutes.
    assert.doesNotMatch(code(ROUTE), /updateOrderStatus\(/,
      "REGRESSION: the vendor path now uses the canonical table, widening store authority");
  });
});

describe("H-20 — the check and the write are one transaction", () => {
  test("the route runs a transaction", () => {
    assert.match(code(ROUTE), /const outcome = await db\.runTransaction\(async \(tx\) => \{/);
  });

  const TX = (() => {
    const from = ROUTE.indexOf("const outcome = await db.runTransaction");
    const to = ROUTE.indexOf("\n    });", from);
    assert.ok(from > -1 && to > from, "the transaction body is gone");
    return ROUTE.slice(from, to);
  })();

  test("it re-reads the live status inside the transaction", () => {
    assert.match(TX, /const snap = await tx\.get\(orderRef\);/);
    assert.match(TX, /const live: string = \(snap\.data\(\) as any\)\?\.status \?\? "pending";/);
  });

  test("it re-applies the vendor table to that live status, not the stale one", () => {
    assert.match(TX, /if \(!\(ALLOWED\[live\] \?\? \[\]\)\.includes\(status\)\)/,
      "REGRESSION: the transaction checks a value read outside it");
    assert.doesNotMatch(TX, /ALLOWED\[current\]/, "REGRESSION: the stale snapshot is authoritative again");
  });

  test("the write happens inside the same transaction", () => {
    assert.match(TX, /tx\.update\(orderRef, updateData\);/);
    assert.match(TX, /const updateData: Record<string, any> = \{ status, updatedAt, \[`vendorStatusAt_\$\{status\}`\]: updatedAt \};/);
    assert.match(TX, /updateData\.estimatedMinutes = validatedEta;/);
  });

  test("no blind write survives anywhere in the route", () => {
    assert.doesNotMatch(code(ROUTE), /await orderRef\.update\(/,
      "REGRESSION: a non-transactional write to the order is back");
    const writes = [...code(ROUTE).matchAll(/orderRef\.update\(|tx\.update\(/g)].length;
    assert.equal(writes, 1, `${writes} writes to the order — there must be exactly one, inside the transaction`);
  });

  test("the pre-check is still there as a cheap filter, but is not the authority", () => {
    // It runs before the vendorProducts lookups; keeping it preserves the existing
    // response ordering for non-racing requests.
    const pre = ROUTE.slice(0, ROUTE.indexOf("const outcome = await db.runTransaction"));
    assert.match(pre, /if \(!\(ALLOWED\[current\] \?\? \[\]\)\.includes\(status\)\) \{/);
  });
});

describe("H-20 — the API contract did not change", () => {
  test("an illegal transition is still 400 with the same message", () => {
    const msg = /res\.status\(400\)\.json\(\{ error: `لا يمكن الانتقال من "\$\{[\w.]+\}" إلى "\$\{status\}"` \}\)/g;
    const hits = [...ROUTE.matchAll(msg)];
    assert.equal(hits.length, 2, "expected the pre-check and the transaction loser to answer identically");
  });

  test("a missing order is still 404 with the same message", () => {
    const hits = [...ROUTE.matchAll(/res\.status\(404\)\.json\(\{ error: "الطلب غير موجود" \}\)/g)];
    assert.ok(hits.length >= 1, "the 404 response changed");
  });

  test("ownership is still 403 and still checked before the write", () => {
    assert.match(ROUTE, /res\.status\(403\)\.json\(\{ error: "ليس لديك صلاحية تعديل هذا الطلب" \}\)/);
    assert.ok(
      ROUTE.indexOf("status(403)") < ROUTE.indexOf("const outcome = await db.runTransaction"),
      "the ownership check must still run before the write",
    );
  });

  test("the success body is unchanged", () => {
    assert.match(ROUTE, /res\.json\(\{ success: true, status, updatedAt, estimatedMinutes: validatedEta \}\)/);
  });

  test("the estimatedMinutes validation is untouched", () => {
    assert.match(ROUTE, /status === "confirmed" &&/);
    assert.match(ROUTE, /Number\.isInteger\(estimatedMinutes\) &&/);
    assert.match(ROUTE, /estimatedMinutes > 0 &&/);
    assert.match(ROUTE, /estimatedMinutes <= 180/);
  });

  test("no new Firestore field is written", () => {
    const TX = ROUTE.slice(ROUTE.indexOf("const outcome = await db.runTransaction"));
    const keys = [...TX.matchAll(/updateData\.(\w+) =/g)].map((m) => m[1]);
    assert.deepEqual(keys, ["estimatedMinutes"], `unexpected fields written: ${keys.join(", ")}`);
  });
});

describe("H-20 — side effects only fire on a real transition", () => {
  test("the route returns before emitting when the transaction refused", () => {
    const guard = ROUTE.indexOf("if (!outcome.ok) {");
    assert.ok(guard > -1, "the failure guard is gone");
    assert.ok(
      guard < ROUTE.indexOf('orderEvents.emit("order:status"'),
      "REGRESSION: order:status can be emitted for a write that never happened",
    );
    assert.ok(
      guard < ROUTE.indexOf('orderEvents.emit("confirmed")'),
      "REGRESSION: a losing request can still trigger the dispatch engine",
    );
  });

  test("the dispatch trigger is still tied to a confirmed transition", () => {
    assert.match(code(ROUTE), /if \(status === "confirmed"\) \{\s*orderEvents\.emit\("confirmed"\);/);
  });

  test("the customer push and the ready-notification are unchanged", () => {
    assert.match(ROUTE, /sendPushNotification\(pushToken, status, orderId, validatedEta\)/);
    assert.match(code(ROUTE), /if \(status === "ready"\) \{/);
    assert.match(ROUTE, /sendAdminOrderReadyNotification\(adminToken, orderId, vendorName\)/);
  });
});

describe("H-20 — the canonical path in firebase.ts is untouched", () => {
  const FIREBASE = read("server/firebase.ts");

  test("updateOrderStatus still validates inside its own transaction", () => {
    const from = FIREBASE.indexOf("export async function updateOrderStatus");
    const body = FIREBASE.slice(from, FIREBASE.indexOf("export async function updateOrderDriverInfo"));
    assert.match(body, /changed = await db\.runTransaction\(async \(tx\) => \{/);
    assert.match(body, /const allowed = ORDER_TRANSITIONS\[\(current \?\? ""\) as FirestoreOrder\["status"\]\] \?\? \[\];/);
  });

  test("ORDER_TRANSITIONS itself is unchanged", () => {
    assert.deepEqual(ORDER_TRANSITIONS.pending, ["confirmed", "cancelled"]);
    assert.deepEqual(ORDER_TRANSITIONS.confirmed, ["preparing", "cancelled"]);
    assert.deepEqual(ORDER_TRANSITIONS.preparing, ["ready", "in_delivery", "delivered", "cancelled", "issue"]);
    assert.deepEqual(ORDER_TRANSITIONS.delivered, []);
    assert.deepEqual(ORDER_TRANSITIONS.cancelled, []);
  });
});
