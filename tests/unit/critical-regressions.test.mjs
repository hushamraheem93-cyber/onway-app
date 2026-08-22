/**
 * Regression guards for the six VERIFIED Critical findings in FINAL_SADD_AUDIT.md.
 *
 * Two of these (C1 driver auth bypass, C4 support-chat XSS) were REINTRODUCED after
 * previously being fixed, because nothing in CI noticed. These tests exist so that
 * cannot happen a third time.
 *
 * Where a defect lives in code that cannot be imported (routes.ts exports only
 * registerRoutes; admin.html is a template), the test asserts on the source text.
 * That is deliberate: it is the only way to gate these in CI without credentials,
 * and each assertion targets the exact construct that was wrong.
 *
 * Run:  npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { vendorCommissionBase } from "../../server/settlement.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

const ROUTES = read("server/routes.ts");
const INDEX = read("server/index.ts");
const ADMIN = read("server/templates/admin.html");

/**
 * Drops whole-line comments so that a comment *describing* the old bug (e.g. the
 * "this check used to be ..." notes left at each fix site) cannot be mistaken for
 * the bug itself.
 */
function stripComments(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/**
 * Body of a named route handler — from its registration up to the next route
 * registration — so assertions cannot match unrelated code elsewhere in the file.
 */
function handlerBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(/\n\s*app\.(get|post|put|patch|delete)\(/);
  return stripComments(marker + (next === -1 ? rest : rest.slice(0, next)));
}

// ── C1 — Driver authentication bypass ───────────────────────────────────────
describe("C1 — driver mobile-auth must require a phone-matching customer JWT", () => {
  const body = handlerBody(ROUTES, 'app.post("/api/driver/mobile-auth"');

  test("the handler exists and is being checked", () => {
    assert.ok(body.length > 0, "could not locate /api/driver/mobile-auth");
  });

  test("a mismatched or missing JWT returns 401 and does NOT mint a token", () => {
    const guard = body.indexOf(
      "!verifiedPhone || !sameLocalPhone(verifiedPhone, String(phoneNumber))",
    );
    const legacyGuard = body.indexOf("!verifiedPhone || verifiedPhone !== String(phoneNumber)");
    assert.ok(guard !== -1 || legacyGuard !== -1, "the phone-match guard must be present");

    // Everything between the guard and its closing brace must be a rejection —
    // no token minting, no driver lookup used as a substitute for proof.
    const selectedGuard = guard !== -1 ? guard : legacyGuard;
    const afterGuard = body.slice(selectedGuard, selectedGuard + 400);
    const closes = afterGuard.indexOf("}");
    const guardBlock = afterGuard.slice(0, closes);

    assert.match(
      guardBlock,
      /res\.status\(401\)/,
      "the guard must reject with 401",
    );
    assert.doesNotMatch(
      guardBlock,
      /makeDriverToken/,
      "REGRESSION: a driver token is minted on the failed-auth path — this is account takeover",
    );
  });

  test("token minting is never reachable via mere existence of a driver record", () => {
    // The exact shape of the regression: look up the driver, and if one exists,
    // issue a token without any JWT proof.
    assert.doesNotMatch(
      body,
      /if\s*\(!existingDriver\)[\s\S]{0,200}makeDriverToken/,
      "REGRESSION: existence of a driver record must never substitute for OTP proof",
    );
  });
});

// ── C4 — Support chat stored XSS ────────────────────────────────────────────
describe("C4 — admin support chat must escape all user-controlled data", () => {
  // Attacker-controlled fields written by any OTP-verified customer via
  // POST /api/support/messages.
  const sinks = [
    ["m.text", "customer message body"],
    ["c.lastMessage", "chat list preview"],
    ["c.userName", "customer display name"],
    ["p.name", "product name in a message card"],
  ];

  for (const [field, label] of sinks) {
    test(`${field} (${label}) is never interpolated raw`, () => {
      // Match `${ ... field ... }` occurrences that contain no escaping helper.
      const re = new RegExp(
        `\\$\\{[^}]*\\b${field.replace(".", "\\.")}\\b[^}]*\\}`,
        "g",
      );
      const raw = (ADMIN.match(re) || []).filter(
        (m) => !m.includes("escapeHtml") && !m.includes("escapeAttr"),
      );
      assert.deepEqual(
        raw,
        [],
        `REGRESSION: unescaped ${field} reaches innerHTML — stored XSS in the admin session. Found: ${raw.join(" | ")}`,
      );
    });
  }

  test("the support module actually calls the escaping helpers", () => {
    const start = ADMIN.indexOf("function renderSupportMessages");
    assert.ok(start !== -1, "could not locate renderSupportMessages");
    const module = ADMIN.slice(start, start + 4000);
    assert.ok(
      /escapeHtml|escapeAttr/.test(module),
      "the support module must escape output; it previously had zero escaping calls",
    );
  });
});

// ── C5 — Google OAuth audience verification ─────────────────────────────────
describe("C5 — Google admin sign-in must verify the token audience", () => {
  const body = handlerBody(INDEX, 'app.post("/admin/google-signin"');

  test("the handler exists and is being checked", () => {
    assert.ok(body.length > 0, "could not locate /admin/google-signin");
  });

  test("a missing GOOGLE_CLIENT_ID refuses sign-in instead of skipping the check", () => {
    assert.match(
      body,
      /if\s*\(!expectedClientId\)/,
      "must fail closed when GOOGLE_CLIENT_ID is unset",
    );
    assert.doesNotMatch(
      body,
      /if\s*\(expectedClientId\s*&&\s*payload\.aud\s*!==/,
      "REGRESSION: the aud check is gated on the variable existing, so it is skipped when unset — any OAuth client's token would grant admin",
    );
  });

  test("the audience is compared unconditionally", () => {
    assert.match(
      body,
      /payload\.aud\s*!==\s*expectedClientId/,
      "the aud claim must be compared to our client id",
    );
  });
});

// ── C2 — Marketplace settlement over-payment ────────────────────────────────
describe("C2 — vendor payout base must exclude delivery and service fees", () => {
  test("restaurant orders use the explicit subtotal", () => {
    assert.equal(
      vendorCommissionBase({
        restaurantSubtotal: 20000,
        total: 25000,
        deliveryFee: 3000,
        serviceFee: 2000,
      }),
      20000,
    );
  });

  test("marketplace orders (no restaurantSubtotal) strip both fees", () => {
    // This is the exact bug: the old code returned `total` = 25000 here.
    assert.equal(
      vendorCommissionBase({
        total: 25000,
        deliveryFee: 3000,
        serviceFee: 2000,
      }),
      20000,
      "REGRESSION: the payout base includes fees OnWay keeps — vendors are over-credited on every marketplace order",
    );
  });

  test("a promo-discounted marketplace order still excludes fees", () => {
    assert.equal(
      vendorCommissionBase({
        total: 18000,
        deliveryFee: 3000,
        serviceFee: 2000,
      }),
      13000,
    );
  });

  test("never returns a negative base", () => {
    assert.equal(
      vendorCommissionBase({
        total: 1000,
        deliveryFee: 3000,
        serviceFee: 2000,
      }),
      0,
    );
  });

  test("missing fee fields are treated as zero", () => {
    assert.equal(vendorCommissionBase({ total: 20000 }), 20000);
  });

  test("the settlement call site does not fall back to order.total", () => {
    // The driver + vendor accrual now lives in ONE shared helper
    // (accrueDeliveredOrderSettlements) used by BOTH the driver batch-complete
    // flow and the admin "mark delivered" transition (#14). The fee-stripping
    // base assertion therefore targets that helper, and each call site is
    // verified to delegate to it rather than re-deriving the base.
    const helperStart = ROUTES.indexOf("async function accrueDeliveredOrderSettlements");
    assert.ok(helperStart !== -1, "could not locate accrueDeliveredOrderSettlements helper");
    const afterHelper = ROUTES.slice(helperStart);
    const nextApp = afterHelper.search(/\n\s*app\.(get|post|put|patch|delete)\(/);
    const helperBody = stripComments(
      nextApp === -1 ? afterHelper : afterHelper.slice(0, nextApp),
    );

    assert.doesNotMatch(
      helperBody,
      /restaurantSubtotal\s*\?\?\s*order\.total/,
      "REGRESSION: settlement fell back to order.total, which includes deliveryFee and serviceFee",
    );
    assert.match(
      helperBody,
      /vendorCommissionBase\(/,
      "settlement must use the shared fee-stripping base",
    );

    // Both delivery paths must delegate to the shared accrual so they can never diverge.
    const driverFlow = handlerBody(ROUTES, 'app.post("/api/driver/batch/complete-order"');
    assert.match(
      driverFlow,
      /accrueDeliveredOrderSettlements\(/,
      "the driver completion flow must use the shared accrual helper",
    );
    const adminFlow = handlerBody(ROUTES, 'app.put("/api/admin/orders/:id/status"');
    assert.match(
      adminFlow,
      /accrueDeliveredOrderSettlements\(/,
      "the admin delivered transition must use the shared accrual helper (#14)",
    );
  });
});

// ── C3 / C6 — Settlement recovery gap and order stranding ───────────────────
describe("C3/C6 — completion must not strand the order or lose the settlement", () => {
  const body = handlerBody(
    ROUTES,
    'app.post("/api/driver/batch/complete-order"',
  );

  test("the order is read BEFORE the idempotency claim", () => {
    const readAt = body.indexOf("await getOrderById(orderId)");
    const claimAt = body.indexOf("earningsCredited: true");
    assert.ok(
      readAt !== -1 && claimAt !== -1,
      "both the read and the claim must be present",
    );
    assert.ok(
      readAt < claimAt,
      "REGRESSION: the order is read after the claim — a null read skips the entire money block while the flag stays set",
    );
  });

  test("an unreadable order refuses to claim the flag", () => {
    assert.match(
      body,
      /if\s*\(!order\)[\s\S]{0,300}return res\.status\(503\)/,
      "must refuse rather than claim a flag it cannot act on",
    );
  });

  test("post-claim failures are caught rather than left to strand the order", () => {
    assert.match(
      body,
      /catch\s*\(completionErr/,
      "REGRESSION: a throw after the claim strands the order — no delivery, no credit, batch never closes",
    );
  });

  test("the claim is released when nothing non-idempotent has run", () => {
    assert.match(
      body,
      /legacyCreditApplied/,
      "must track whether the non-idempotent step ran",
    );
    assert.match(
      body,
      /if\s*\(!legacyCreditApplied\)[\s\S]{0,400}earningsCredited:\s*false/,
      "a failure before the legacy credit must release the claim so a retry can complete the order",
    );
  });

  test("the claim is NOT released once the non-idempotent step has run", () => {
    const idx = body.indexOf("legacyCreditApplied = true");
    assert.ok(idx !== -1, "the non-idempotent step must set the marker");
    // The else-branch must flag for recovery, not release.
    assert.match(
      body,
      /else\s*\{[\s\S]{0,400}settlementPending:\s*true/,
      "after the legacy credit the claim must stay and the order be flagged for the recovery sweep",
    );
  });
});
