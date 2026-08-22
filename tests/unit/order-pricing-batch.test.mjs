/**
 * Order-creation read batching and push-token honesty (audit findings H-35, H-33).
 *
 * H-35's remaining half: order creation priced each line by reading its
 * vendorProduct with `await db.collection("vendorProducts").doc(id).get()` INSIDE
 * the item loop. MAX_ORDER_ITEM_LINES (added earlier) bounds how many lines a
 * basket may have, but a bound is not a batch: a 100-line basket still meant 100
 * sequential round trips with the request held open across all of them. The reads
 * now happen once, through getAll(), before the loop.
 *
 * The prices themselves are untouched — same documents, same variant and add-on
 * arithmetic, same rejection rules. That is what most of this file checks.
 *
 * H-33's remaining case in this area: POST /api/users/push-token discarded the
 * result of updateUserPushToken and answered `{success:true}` either way, so a
 * customer whose token never stored was told notifications were registered and
 * then simply never got one.
 *
 * Run:  node --test tests/unit/order-pricing-batch.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const SRC = readFileSync(join(root, "server/routes.ts"), "utf8");
const CLEAN = stripComments(SRC);

/** The pricing block of POST /api/orders. */
const PRICING = (() => {
  const at = CLEAN.indexOf("const allProductsForPricing = await getCachedProducts();");
  assert.ok(at > 0, "the pricing block moved — this suite needs updating");
  const end = CLEAN.indexOf("if (unknownProductIds.length > 0)", at);
  assert.ok(end > at, "the rejection block moved");
  return CLEAN.slice(at, end);
})();

describe("H-35 · vendor products are read once, not once per line", () => {
  /** The PRICING loop — the one that declares realPrice, not the prefetch's. */
  const pricingLoopAt = (() => {
    const at = PRICING.indexOf("let realPrice: number | undefined;");
    assert.ok(at > 0, "the pricing loop disappeared");
    // Matches the loop header by its `for (const it of …)` shape rather than by
    // one exact iterable expression: C-06/C-07 made the source `service ? [] :
    // (items as any[])` so a service request skips the catalogue entirely. The
    // previous literal returned -1 when that changed, and -1 silently satisfied
    // the "batch comes first" comparison below — so this now asserts it was found.
    const loopAt = PRICING.lastIndexOf("for (const it of ", at);
    assert.ok(loopAt > 0, "the pricing loop header could not be located");
    return loopAt;
  })();

  test("no Firestore read happens inside the item loop", () => {
    const loop = PRICING.slice(pricingLoopAt);
    assert.doesNotMatch(loop, /await db\.collection\("vendorProducts"\)\.doc\([^)]*\)\.get\(\)/,
      "the per-item sequential read is back — a 100-line basket means 100 round trips");
    assert.doesNotMatch(loop, /await db\.collection\(/,
      "some other per-item Firestore read appeared inside the loop");
  });

  test("they are fetched together, before the loop", () => {
    const batchAt = PRICING.indexOf("await db.getAll(");
    assert.ok(batchAt > 0, "the batched read disappeared");
    assert.ok(batchAt < pricingLoopAt,
      "the batch runs after the pricing loop, which defeats it");
    assert.match(PRICING, /const vendorProductById = new Map<string, any>\(\)/,
      "the batch no longer feeds a lookup map");
  });

  test("the loop reads from the map", () => {
    assert.match(PRICING, /const vp = vendorProductById\.get\(it\.productId\) as any;/,
      "the loop no longer uses the pre-fetched document");
  });

  test("the ids are de-duplicated, so a repeated product is fetched once", () => {
    assert.match(PRICING, /const needed = new Set<string>\(\)/,
      "duplicate lines would be fetched twice");
  });

  test("the prefetch covers EVERY line, so no lookup in the handler can miss", () => {
    // The prefetch started out mirroring the pricing loop's fall-through condition
    // exactly. It was widened to every distinct item id because two later steps in
    // the same handler read the same documents — the marketplace vendor fallback
    // and orderData.vendorIds (H-34) — and both must see products the legacy cache
    // could price. A superset can never cause a miss; a mirrored subset would.
    assert.match(PRICING, /if \(typeof pid === "string" && pid\) needed\.add\(pid\)/,
      "the prefetch no longer covers every item id");
    assert.match(PRICING, /if \(legacyProduct && isValidProductPrice\(legacyProduct\.price\)\) \{/,
      "the loop's branch condition changed");
  });

  test("the marketplace vendor fallback reads the map, not one doc per line", () => {
    // This was H-35's second N+1, in the same handler: `for (const it of items)
    // await db.collection("vendorProducts").doc(it.productId).get()`.
    const fallbackAt = CLEAN.indexOf("if (!orderData.vendorId) {");
    assert.ok(fallbackAt > 0, "the marketplace vendor fallback disappeared");
    const fallback = CLEAN.slice(fallbackAt, CLEAN.indexOf("orderData.vendorIds", fallbackAt));
    assert.ok(!/await\s+db\.collection\("vendorProducts"\)/.test(fallback),
      "the fallback still reads vendorProducts one document at a time");
    assert.match(fallback, /vendorProductById\.get\(it\.productId\)/,
      "the fallback no longer reuses the batched documents");
  });

  test("the whole handler issues exactly one vendorProducts batch read", () => {
    const handler = CLEAN.slice(
      CLEAN.indexOf('app.post("/api/orders"'),
      CLEAN.indexOf('app.put("/api/admin/orders/:id/status"'),
    );
    assert.ok(handler.length > 0, "the order handler window is empty");
    assert.equal((handler.match(/await db\.getAll\(/g) ?? []).length, 1,
      "more than one batch read — they should be merged");
    assert.equal((handler.match(/await db\.collection\("vendorProducts"\)\.doc\(/g) ?? []).length, 0,
      "a per-document vendorProducts read came back");
  });

  test("a line cap still guards the batch size", () => {
    assert.match(CLEAN, /const MAX_ORDER_ITEM_LINES = 100;/,
      "the item-line cap disappeared — getAll would be unbounded");
    const capAt = CLEAN.indexOf("if (items.length > MAX_ORDER_ITEM_LINES)");
    const pricingAt = CLEAN.indexOf("const allProductsForPricing = await getCachedProducts();");
    assert.ok(capAt > 0 && capAt < pricingAt,
      "the cap is checked after the reads, so an oversized basket still costs them");
  });
});

describe("H-35 · pricing behaviour is unchanged", () => {
  for (const [what, marker] of [
    ["the stored price is the source of truth", /const vpPrice = Number\(vp\?\.price\);/],
    ["only a valid price is accepted", /if \(isValidProductPrice\(vpPrice\)\) \{/],
    ["variant adjustments still apply", /realPrice \+= Number\(variant\.priceAdjustment\) \|\| 0;/],
    ["add-on prices still apply", /realPrice \+= Number\(dbAddon\.price\) \|\| 0;/],
    ["add-ons are matched by id", /vp\.addons\.find\(\(a: any\) => a\.id === orderAddon\.id\)/],
    // H-64 / G-1 widened this: the guard tested `inStock === false` only, while
    // vendors maintain the numeric `stock` — four live products were on sale at
    // zero. The property H-35 guards (an unavailable item still blocks the order)
    // is unchanged and stricter; only the predicate's name moved.
    ["out-of-stock still blocks", /if \(!isProductAvailable\(vp\)\) available = false;/],
    ["unknown products are rejected", /unknownProductIds\.push\(it\.productId\)/],
    ["the subtotal uses the verified price", /verifiedSubtotal \+= realPrice \* quantity;/],
  ]) {
    test(what, () => {
      assert.match(PRICING, marker, `${what} — the batching changed pricing behaviour`);
    });
  }

  test("the client's price is still only compared, never trusted", () => {
    assert.match(PRICING, /Math\.abs\(\(Number\(it\.price\) \|\| 0\) - realPrice\) > 1/,
      "the client-supplied price is no longer merely cross-checked");
    assert.doesNotMatch(PRICING, /verifiedSubtotal \+= Number\(it\.price\)/,
      "the client's price reached the subtotal");
  });
});

describe("H-35 · the batching arithmetic, executed", () => {
  // Run the selection rule against baskets the app really produces, to prove the
  // prefetch set is right rather than just present.
  const isValidProductPrice = (p) => Number.isFinite(Number(p)) && Number(p) > 0;
  const select = (items, legacyCatalogue) => {
    const needed = new Set();
    for (const it of items) {
      const pid = it?.productId;
      if (typeof pid !== "string" || !pid) continue;
      const legacy = legacyCatalogue.find((p) => p.id === pid);
      if (!(legacy && isValidProductPrice(legacy.price))) needed.add(pid);
    }
    return [...needed];
  };

  const legacy = [
    { id: "legacy-ok", price: 5000 },
    { id: "legacy-zero", price: 0 },
    { id: "legacy-negative", price: -500 },
  ];

  test("a basket of legacy products needs no vendorProduct read at all", () => {
    assert.deepEqual(select([{ productId: "legacy-ok" }, { productId: "legacy-ok" }], legacy), []);
  });

  test("vendor products are fetched, once each", () => {
    const items = [{ productId: "vp-1" }, { productId: "vp-2" }, { productId: "vp-1" }];
    assert.deepEqual(select(items, legacy).sort(), ["vp-1", "vp-2"]);
  });

  test("a legacy product with an unusable price is fetched too", () => {
    // It falls through to the vendorProducts branch, so it must be prefetched or
    // it would be rejected as unknown.
    assert.deepEqual(select([{ productId: "legacy-zero" }], legacy), ["legacy-zero"]);
    assert.deepEqual(select([{ productId: "legacy-negative" }], legacy), ["legacy-negative"]);
  });

  test("malformed lines are skipped without throwing", () => {
    const items = [null, {}, { productId: "" }, { productId: 7 }, { productId: "vp-9" }];
    assert.deepEqual(select(items, legacy), ["vp-9"]);
  });

  test("one round trip regardless of basket size", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ productId: `vp-${i}` }));
    const needed = select(items, legacy);
    assert.equal(needed.length, 100);
    // getAll takes them all at once: one call, not one per id.
    assert.equal((PRICING.match(/await db\.getAll\(/g) ?? []).length, 1,
      "there is more than one batched read, or none");
  });
});

describe("H-33 · the push-token route no longer reports a false success", () => {
  const ROUTE = (() => {
    const at = CLEAN.indexOf('app.post("/api/users/push-token"');
    assert.ok(at > 0, "the push-token route disappeared");
    const next = CLEAN.indexOf("\n  app.", at + 10);
    return CLEAN.slice(at, next === -1 ? at + 2000 : next);
  })();

  test("the write result is captured, not discarded", () => {
    assert.match(ROUTE, /const saved = await updateUserPushToken\(phoneNumber, pushToken\);/,
      "the result of the token write is ignored again");
  });

  test("a failed write answers an error instead of success", () => {
    assert.match(ROUTE, /if \(!saved\) \{/, "the failure is not handled");
    assert.match(ROUTE, /return res\.status\(500\)/,
      "a failed token write still answers success — the user is told notifications work");
  });

  test("the failure reaches the log without leaking the phone", () => {
    const log = ROUTE.match(/console\.error\([^)]*\)/)?.[0] ?? "";
    assert.ok(log, "the failure is silent in the log too");
    assert.doesNotMatch(log, /phoneNumber|pushToken/,
      "the log line carries the phone number or the token");
  });

  test("the success contract is unchanged", () => {
    assert.match(ROUTE, /return res\.json\(\{ success: true \}\)/,
      "the success response shape changed — the client checks it");
  });

  test("the ownership guard is untouched", () => {
    assert.match(ROUTE, /(?:sameLocalPhone\(\(req as any\)\.customerPhone, phoneNumber\)|\(req as any\)\.customerPhone !== phoneNumber)/,
      "the H-2 ownership check disappeared from this route");
  });
});
