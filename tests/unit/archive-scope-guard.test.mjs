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

  test("the full reset is permanently disabled, not merely confirmation-gated", () => {
    assert.doesNotMatch(CLEAN, /RESET_CONFIRM|DELETE-ALL-DATA/,
      "a reusable full-wipe confirmation still exists");
    assert.match(H, /res\.status\(410\)/,
      "the full platform reset must be rejected before any destructive work");
    assert.doesNotMatch(H, /collection\("walletHistory"\)\.get\(\)/,
      "the disabled path still scans financial data");
  });

  test("only the bounded archive confirmation remains", () => {
    assert.match(CLEAN, /const ARCHIVE_CONFIRM = "ARCHIVE"/);
    assert.doesNotMatch(CLEAN, /DELETE-ALL-DATA|RESET_CONFIRM/,
      "a full-wipe confirmation can still be reused");
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
    const to = H.indexOf("return res.status(410)");
    assert.ok(from > 0 && to > from, "the archive and disabled paths are no longer separated");
    const archiveBranch = H.slice(from, to);
    for (const forbidden of ["walletHistory", "driverCompletedOrders", "driverWallets"]) {
      assert.ok(!new RegExp(`collection\\("${forbidden}"\\)`).test(archiveBranch),
        `the archive scope reads or writes ${forbidden}`);
    }
    assert.ok(!/balance: 0/.test(archiveBranch),
      "the archive scope zeroes a wallet balance");
  });
});

describe("C-01 · the full reset is disabled and the safe archive is the only path", () => {
  test("the route contains no full-collection destructive operations", () => {
    assert.doesNotMatch(H, /getOrders\(\)/,
      "the C-01 handler still materialises every order for deletion");
    for (const forbidden of ["walletHistory", "driverActivityLog", "driverCompletedOrders", "driverWallets"]) {
      assert.doesNotMatch(H, new RegExp(`collection\\(\\"${forbidden}\\"\\)`),
        `the C-01 handler still touches ${forbidden}`);
    }
    assert.doesNotMatch(H, /balance:\s*0/);
  });

  test("scope all is rejected before any write", () => {
    assert.match(H, /return res\.status\(410\)\.json/);
  });

  // The button used to be a stub that only raised a toast, and this test asserted
  // that stub. It now drives the bounded archive the server supports, so what is
  // guarded here is the property that actually matters rather than the absence of
  // a call: the panel may never ask for the full wipe, and may never write without
  // showing the operator a dry-run count first.
  test("the admin panel never asks for the full wipe", () => {
    const at = ADMIN_HTML.indexOf("async function archiveOldOrders(");
    assert.ok(at > 0, "the archive action disappeared");
    const fn = ADMIN_HTML.slice(at, ADMIN_HTML.indexOf("async function loadServiceFee", at));

    assert.doesNotMatch(fn, /scope:\s*'all'/, "the panel can request the disabled full reset");
    assert.doesNotMatch(fn, /DELETE-ALL-DATA/);
    assert.match(fn, /scope:\s*'archive'/, "the panel must name the bounded scope explicitly");
  });

  test("the panel runs a dry run before it is allowed to delete", () => {
    const at = ADMIN_HTML.indexOf("async function archiveOldOrders(");
    const fn = ADMIN_HTML.slice(at, ADMIN_HTML.indexOf("async function loadServiceFee", at));

    const preview = fn.indexOf("dryRun: true");
    const destroy = fn.indexOf("dryRun: false");
    assert.ok(preview > 0, "no dry run — the operator would confirm a number nobody counted");
    assert.ok(destroy > 0, "the archive never actually deletes");
    assert.ok(preview < destroy, "the destructive call comes before the preview");
    assert.match(fn, /confirm:\s*'ARCHIVE'/, "the write is missing the server's confirmation string");
  });

  test("the safe archive keeps an admin identity for the audit log", () => {
    assert.match(H, /\[ARCHIVE\] admin=\$\{adminUser\}/,
      "the bounded archive has no audit trail");
    assert.match(H, /getSessionUsername\(req\)/);
  });
});
