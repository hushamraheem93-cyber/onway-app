/**
 * Order line-count bound (audit finding H-35).
 *
 * Quantity per line was capped at 99, but the NUMBER OF LINES was not. Each line
 * costs one sequential Firestore read in the addon-verification pass, and a
 * 5,000-line cart still fits inside the 10 MB body limit — so a single request
 * could hold a connection open for thousands of round trips while the rate limiter
 * happily allowed 600 requests a minute.
 *
 * The pricing pass itself is NOT the N+1 the audit describes any more: it reads the
 * product catalogue once through getCachedProducts() and then does in-memory Map
 * lookups. What remained unbounded was the line count, which is what this bounds.
 *
 * Run:  node --test tests/unit/order-item-line-cap.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, "../../server/routes.ts"), "utf8");
const CLEAN = sharedStripComments(SRC);

describe("H-35 · the number of cart lines is bounded", () => {
  test("a maximum is declared and is a sane positive number", () => {
    const m = CLEAN.match(/const MAX_ORDER_ITEM_LINES = (\d+)/);
    assert.ok(m, "no line-count bound exists — a cart can be arbitrarily large");
    const max = Number(m[1]);
    assert.ok(max > 0 && max <= 1000, `the bound ${max} is not a sane basket size`);
    assert.ok(max >= 20, `the bound ${max} would reject a legitimate large order`);
  });

  test("order creation rejects a cart above the bound", () => {
    const at = CLEAN.indexOf('app.post("/api/orders"');
    assert.ok(at > 0);
    const body = CLEAN.slice(at, at + 12000);
    assert.match(body, /items\.length > MAX_ORDER_ITEM_LINES/,
      "the bound is declared but never enforced on order creation");
    const guardAt = body.search(/items\.length > MAX_ORDER_ITEM_LINES/);
    assert.match(body.slice(guardAt, guardAt + 300), /res\.status\(400\)/,
      "an oversized cart is not refused with a client error");
  });

  test("the bound is checked before any per-item Firestore work", () => {
    const at = CLEAN.indexOf('app.post("/api/orders"');
    const body = CLEAN.slice(at, at + 14000);
    const guardAt = body.search(/items\.length > MAX_ORDER_ITEM_LINES/);
    const perItemRead = body.indexOf('collection("vendorProducts").doc(it.productId)');
    assert.ok(guardAt >= 0, "no bound");
    if (perItemRead >= 0) {
      assert.ok(guardAt < perItemRead,
        "the per-line Firestore reads run before the cart size is judged");
    }
  });

  test("an empty cart is still refused, and a normal one still passes", () => {
    const at = CLEAN.indexOf('app.post("/api/orders"');
    const body = CLEAN.slice(at, at + 12000);
    assert.match(body, /items\.length === 0/, "the empty-cart guard was lost");
    // The bound must be an upper limit only — never a lower one beyond "not empty".
    assert.doesNotMatch(body, /items\.length < MAX_ORDER_ITEM_LINES/);
  });

  test("pricing still reads the catalogue once, not per item", () => {
    const at = CLEAN.indexOf('app.post("/api/orders"');
    const body = CLEAN.slice(at, at + 14000);
    assert.match(body, /await getCachedProducts\(\)/,
      "the single cached catalogue read disappeared — the N+1 would be back");
  });
});
