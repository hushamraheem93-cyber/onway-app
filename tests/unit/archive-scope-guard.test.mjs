/**
 * C-01 — DELETE /api/admin/archive-old-orders must not be able to wipe the platform.
 *
 * The route was named "archive old completed/cancelled orders (older than 1 month)"
 * while its own comment read `// 1. Delete ALL orders regardless of status`. An
 * unqualified DELETE with no body erased every order, every walletHistory entry,
 * every driverActivityLog and driverCompletedOrders row, every adminAlert, and
 * reset EVERY driver wallet balance to zero. The only thing preventing that was a
 * browser confirm() in templates/admin.html.
 *
 * Behaviour is proved end-to-end over real HTTP by scratchpad/c01-live.mjs (43
 * assertions, 33 of which fail on HEAD) and its guards are mutation-tested by
 * scratchpad/c01-mutations.mjs (7/7 caught). This file locks the structure into
 * `npm run test:unit` so the guards cannot quietly disappear.
 *
 * Run:  node --test tests/unit/archive-scope-guard.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ROUTES = readFileSync(join(root, "server/routes.ts"), "utf8");
const CLEAN = stripComments(ROUTES);
const ADMIN_HTML = readFileSync(join(root, "server/templates/admin.html"), "utf8");

/** The archive route handler, brace-matched from its app.delete(...) call. */
function handler() {
  const at = CLEAN.indexOf('app.delete("/api/admin/archive-old-orders"');
  assert.ok(at > 0, "the archive route disappeared");
  const open = CLEAN.indexOf("{", CLEAN.indexOf("async (", at));
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") { depth -= 1; if (depth === 0) return CLEAN.slice(open, i + 1); }
  }
  throw new Error("unbalanced handler");
}
const H = handler();

describe("C-01 · the destructive path cannot be reached by an unqualified call", () => {
  test("dry run is the DEFAULT — only an explicit false opts into writing", () => {
    assert.match(H, /const dryRun = body\.dryRun !== false;/,
      "a missing or malformed body must not delete anything");
    assert.doesNotMatch(H, /const dryRun = body\.dryRun === true;/);
  });

  test("scope defaults to the SAFE mode, not the full reset", () => {
    assert.match(H, /const scope = body\.scope === "all" \? "all" : "archive";/,
      "an unrecognised scope must fall back to archive, never to a full wipe");
  });

  test("the full reset demands its own confirmation string", () => {
    assert.match(CLEAN, /const RESET_CONFIRM = "DELETE-ALL-DATA";/);
    assert.match(H, /if \(confirm !== RESET_CONFIRM\) \{/,
      "the full platform reset is reachable without confirmation");
  });

  test("the archive confirmation string is separate — one cannot escalate to the other", () => {
    assert.match(CLEAN, /const ARCHIVE_CONFIRM = "ARCHIVE";/);
    const archiveTok = (CLEAN.match(/ARCHIVE_CONFIRM = "ARCHIVE"/) ?? [])[0];
    const resetTok = (CLEAN.match(/RESET_CONFIRM = "DELETE-ALL-DATA"/) ?? [])[0];
    assert.ok(archiveTok && resetTok && archiveTok !== resetTok,
      "the two confirmations must be distinct strings");
  });
});

describe("C-01 · the archive scope is genuinely scoped", () => {
  test("only terminal statuses are archivable", () => {
    assert.match(CLEAN, /const ARCHIVE_TERMINAL_STATUSES = \["delivered", "cancelled"\];/);
    assert.match(H, /ARCHIVE_TERMINAL_STATUSES\.includes\(String\(\(d\.data\(\) as any\)\?\.status\)\)/,
      "an in-flight order could be archived");
  });

  test("a minimum age is enforced, so today's orders are unreachable", () => {
    assert.match(CLEAN, /const ARCHIVE_MIN_AGE_DAYS = 30;/);
    assert.match(H, /rawDays < ARCHIVE_MIN_AGE_DAYS/,
      "olderThanDays: 0 would delete everything");
    assert.match(H, /!Number\.isFinite\(rawDays\)/,
      "a non-numeric olderThanDays would slip through");
  });

  test("the selection is bounded by a date cutoff, not the whole collection", () => {
    assert.match(H, /\.where\("createdAt", "<", cutoff\)/,
      "the archive query lost its date filter");
  });

  test("the blast radius is capped, and exceeding it REFUSES rather than truncates", () => {
    assert.match(H, /archivable\.length > maxDeletes \|\| candidates\.size > maxDeletes/,
      "a saturated candidate window would be silently truncated");
    assert.match(H, /res\.status\(409\)/, "the cap no longer refuses");
  });

  test("money-bearing collections are never touched by the archive scope", () => {
    // The archive branch runs from its `if (scope === "archive")` to the full-reset
    // branch. Nothing in it may touch a financial collection.
    const from = H.indexOf('if (scope === "archive")');
    const to = H.indexOf("if (confirm !== RESET_CONFIRM)");
    assert.ok(from > 0 && to > from, "the two scopes are no longer separated");
    const archiveBranch = H.slice(from, to);
    for (const forbidden of ["walletHistory", "driverCompletedOrders", "driverWallets"]) {
      assert.ok(!new RegExp(`collection\\("${forbidden}"\\)`).test(archiveBranch),
        `the archive scope reads or writes ${forbidden}`);
    }
    assert.ok(!/balance: 0/.test(archiveBranch),
      "the archive scope zeroes a wallet balance");
  });
});

describe("C-01 · the monthly reset still works, deliberately", () => {
  test("the full reset behaviour is retained under its own scope", () => {
    const from = H.indexOf("if (confirm !== RESET_CONFIRM)");
    const resetBranch = H.slice(from);
    assert.match(resetBranch, /const allOrders = await getOrders\(\);/,
      "the monthly reset lost its order wipe");
    assert.match(resetBranch, /balance: 0/,
      "the monthly reset lost the wallet zeroing the admin button promises");
  });

  test("the admin panel sends the qualified body, so its button still works", () => {
    const at = ADMIN_HTML.indexOf("archive-old-orders");
    assert.ok(at > 0, "the admin panel no longer calls the route");
    const call = ADMIN_HTML.slice(at, at + 400);
    assert.match(call, /scope: 'all'/, "the panel would now only trigger a dry run");
    assert.match(call, /confirm: 'DELETE-ALL-DATA'/);
    assert.match(call, /dryRun: false/);
  });

  test("a destructive run is written to the log with the acting admin", () => {
    assert.match(H, /\[ARCHIVE\] admin=\$\{adminUser\}/,
      "there is no audit trail for a destructive call");
    assert.match(H, /getSessionUsername\(req\)/);
  });
});
