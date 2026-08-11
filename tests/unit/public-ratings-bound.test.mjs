/**
 * Public ratings read bound (audit finding H-37).
 *
 * GET /api/stores/:id/ratings is public and unauthenticated. It read EVERY rating
 * for a store with no .limit(), then paginated in memory with .slice(). Each rating
 * can carry a base64 image of up to ~400 KB, so anyone could make the server load an
 * unbounded amount of data, repeatedly, without credentials — a memory and
 * Firestore-bill exhaustion vector requiring nothing but a URL.
 *
 * The read is now capped. The aggregates (average, total, breakdown) are computed
 * over the capped set, which for a store that ever exceeds the cap makes them
 * "based on the most recent N ratings" instead of all-time — a deliberate and
 * documented trade.
 *
 * Run:  node --test tests/unit/public-ratings-bound.test.mjs
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

function handler(marker) {
  const at = CLEAN.indexOf(marker);
  assert.ok(at >= 0, `handler not found: ${marker}`);
  const open = CLEAN.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") { depth -= 1; if (depth === 0) return CLEAN.slice(open, i + 1); }
  }
  throw new Error("unbalanced");
}
const BODY = handler('"/api/stores/:id/ratings"');

describe("H-37 · the public ratings read is bounded", () => {
  test("a cap is declared and is sane", () => {
    const m = CLEAN.match(/const RATINGS_SCAN_CAP = (\d+)/);
    assert.ok(m, "no bound on the public ratings read");
    const n = Number(m[1]);
    assert.ok(n >= 100 && n <= 10000, `a cap of ${n} is not sensible`);
  });

  test("the query applies the cap before reading", () => {
    assert.match(BODY, /\.limit\(RATINGS_SCAN_CAP\)\.get\(\)/,
      "the handler still reads every rating for the store");
    assert.doesNotMatch(BODY, /await query\.get\(\)/,
      "an unbounded read is still present");
  });

  test("the caller-supplied page size is still clamped independently", () => {
    assert.match(BODY, /Math\.min\(50, Math\.max\(1, parseInt/,
      "the per-page clamp was lost — a caller could ask for any page size");
  });

  test("the vendor, hidden and deleted filters are unchanged", () => {
    assert.match(BODY, /where\("vendorId", "==", vendorId\)/);
    assert.match(BODY, /where\("hidden",\s+"==", false\)/);
    assert.match(BODY, /where\("deleted",\s+"==", false\)/);
  });

  test("the response shape is unchanged", () => {
    assert.match(BODY, /res\.json\(\{ average, total, breakdown, items: mapped, hasMore \}\)/,
      "the response shape changed");
  });

  test("customer phone numbers are still truncated to four digits", () => {
    assert.match(BODY, /String\(r\.customerPhone\)\.slice\(-4\)/,
      "the phone-number redaction was lost");
  });

  test("pagination still works over the fetched set", () => {
    assert.match(BODY, /items\.slice\(offset, offset \+ limitParam\)/);
    assert.match(BODY, /hasMore\s+= offset \+ limitParam < items\.length/);
  });
});
