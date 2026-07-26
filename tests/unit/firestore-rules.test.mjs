/**
 * Firestore security-rule assertions.
 *
 * Guards the CRITICAL finding from TECH_STACK_REPORT.md: `settlementLedger` was
 * world-readable (`allow read: if true`), exposing every driver's debt and every
 * vendor's revenue, because this app uses a custom JWT and NOT Firebase Auth —
 * so request.auth is always null and nothing else gated the read.
 *
 * These tests parse firestore.rules directly. That deliberately needs no
 * credentials and no emulator, so they gate CI and fail the moment someone
 * re-opens a sensitive collection to make a client-side listener work again —
 * which is exactly how the original regression happened.
 *
 * Run:  npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(join(here, "../../firestore.rules"), "utf8");

/**
 * Extract the rule body for one collection: everything between
 * `match /<name>/{...} {` and its closing brace.
 */
function ruleBodyFor(collection) {
  const re = new RegExp(`match\\s+/${collection}/\\{[^}]*\\}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m");
  const m = RULES.match(re);
  return m ? m[1] : null;
}

/** True when the collection permits reads from an unauthenticated client. */
function allowsPublicRead(collection) {
  const body = ruleBodyFor(collection);
  if (body === null) return false; // no rule at all → default deny
  // Strip comments so prose mentioning "allow read: if true" cannot fool us.
  const code = body
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
  return /allow[^;]*\bread\b[^;]*:\s*if\s+true/.test(code);
}

// Collections holding money, credentials or personal data. None may be public.
const SENSITIVE = [
  "settlementLedger",
  "settlements",
  "vendors",
  "orders",
  "users",
  "drivers",
  "driverWallets",
  "walletHistory",
  "settlementRequests",
  "settlementPayments",
  "supportChats",
  "pushTokens",
  "promoCodes",
  // Product documents carry `vendorPhone` — the store owner's personal number —
  // and rules cannot filter fields. Browsing is unaffected: the catalog is served
  // by /api/stores/:id/products through the Admin SDK.
  "vendorProducts",
  // Holds app_settings/admin_push, the admin's Expo push token. Expo's send API is
  // unauthenticated, so a readable token means spoofed admin notifications.
  "app_settings",
];

// Catalog data that is intentionally browsable before login.
const PUBLIC_BY_DESIGN = [
  "categories",
  "banners",
  "deliveryAreas",
  "products",
  "promotionalSections",
];

describe("firestore.rules — sensitive collections", () => {
  test("default-deny catch-all is present", () => {
    assert.match(
      RULES,
      /match\s+\/\{document=\*\*\}\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+false/,
      "the recursive wildcard must deny everything not explicitly allowed",
    );
  });

  test("settlementLedger is NOT publicly readable (the CRITICAL regression)", () => {
    assert.equal(
      allowsPublicRead("settlementLedger"),
      false,
      "settlementLedger exposes every driver's debt and vendor's revenue; it must never be world-readable",
    );
  });

  test("vendors is NOT publicly readable (documents contain passwordHash)", () => {
    assert.equal(
      allowsPublicRead("vendors"),
      false,
      "vendor documents carry bcrypt passwordHash; a public read hands them out for offline cracking",
    );
  });

  for (const collection of SENSITIVE) {
    test(`${collection} denies unauthenticated reads`, () => {
      assert.equal(
        allowsPublicRead(collection),
        false,
        `${collection} holds sensitive production data and must not be world-readable`,
      );
    });
  }
});

describe("firestore.rules — no client may write", () => {
  test("no collection grants write access to clients", () => {
    // All mutations go through the Admin SDK, which bypasses rules entirely.
    const offenders = [];
    const re = /match\s+\/([a-zA-Z_]+)\/\{[^}]*\}\s*\{([\s\S]*?)\n\s*\}/g;
    let m;
    while ((m = re.exec(RULES)) !== null) {
      const code = m[2]
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
      if (/allow[^;]*\bwrite\b[^;]*:\s*if\s+true/.test(code)) offenders.push(m[1]);
    }
    assert.deepEqual(offenders, [], `client writes must never be allowed; found: ${offenders.join(", ")}`);
  });
});

describe("firestore.rules — public catalog still browsable", () => {
  // Guards against over-correcting: closing these would break pre-login browsing.
  for (const collection of PUBLIC_BY_DESIGN) {
    test(`${collection} remains publicly readable`, () => {
      assert.equal(
        allowsPublicRead(collection),
        true,
        `${collection} is catalog data the app browses before login; it must stay readable`,
      );
    });
  }
});
