/**
 * H-52 — one human must be one identity, however they type their number.
 *
 * The app's canonical phone format is the local 11-digit `07XXXXXXXXX`. The
 * server establishes it in routes.ts (`toLocalPhone`), validates it with
 * /^07\d{9}$/ at /api/auth/send-otp, mints the customer JWT from it, and echoes
 * it back from /api/auth/verify-otp so the client stores the same string every
 * ownership check compares against.
 *
 * PhoneLoginScreen built the number it sent as `00964${phone}` — country code
 * prepended, local leading zero never removed, an existing country code never
 * noticed. Only the bare `7…` form survived that; every other realistic way of
 * typing the same number produced a different string, and the one most people
 * type (07…) produced 0096407701234567.
 *
 * Nothing here matches text. Every assertion:
 *   • runs the SCREEN's own phone-preparation path, lifted out of the .tsx, and
 *   • feeds the result through the SERVER's own toLocalPhone + send-otp regex,
 *     lifted out of routes.ts,
 * so "same identity" means the server would key them the same, not that two
 * strings look alike.
 *
 * Run:  node --test tests/unit/h52-phone-canonical-identity.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { toLocalIraqiPhone, isValidIraqiPhone, IRAQ_LOCAL_PHONE_RE } from "../../client/lib/phone.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const SCREEN = read("client/screens/PhoneLoginScreen.tsx");
const ROUTES = read("server/routes.ts");

// ── the server side, lifted and executed ─────────────────────────────────────
function braceBlock(src, start) {
  const open = src.indexOf("{", start);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces");
}

/** The REAL toLocalPhone from server/routes.ts. */
const serverToLocalPhone = (() => {
  const at = ROUTES.indexOf("function toLocalPhone(raw: string): string {");
  assert.notEqual(at, -1, "toLocalPhone moved in server/routes.ts");
  const js = braceBlock(ROUTES, at).replace(/: string/g, "");
  return new Function(`${js} return toLocalPhone;`)();
})();

/** The REAL validation regex from /api/auth/send-otp. */
const SERVER_PHONE_RE = (() => {
  const m = ROUTES.match(/const IRAQ_PHONE_RE = (\/\^07.*?\/);/);
  assert.ok(m, "the send-otp validation regex moved");
  // eslint-disable-next-line no-new-func
  return new Function(`return ${m[1]};`)();
})();

/** What the server would store as this caller's identity, or null if it 400s. */
function serverIdentity(sentByClient) {
  const local = serverToLocalPhone(String(sentByClient));
  return SERVER_PHONE_RE.test(local) ? local : null;
}

// ── the screen side, lifted and executed ─────────────────────────────────────
/** Lift `const NAME = (…) => {…};` if the screen still defines it (pre-fix). */
function liftArrow(name) {
  const at = SCREEN.indexOf(`const ${name} = (`);
  if (at === -1) return "";
  return braceBlock(SCREEN, at).replace(/: string/g, "") + ";";
}

/**
 * Run PhoneLoginScreen's actual handleContinue logic for one typed value:
 * its validation call and the expression it hands to sendOtp().
 */
function screenSubmits(typed) {
  const locals = ["validatePhone", "formatPhoneForLogin"].map(liftArrow).join("\n");
  const validateCall = SCREEN.match(/if \(!(\w+\(phoneNumber\))\) \{/);
  assert.ok(validateCall, "the validation branch moved in PhoneLoginScreen");
  const sendExpr = SCREEN.match(/const fullPhone = ([^;]+);/);
  assert.ok(sendExpr, "the sendOtp argument moved in PhoneLoginScreen");

  const body = `
    ${locals}
    if (!phoneNumber.trim()) return { blocked: "empty" };
    if (!${validateCall[1]}) return { blocked: "invalid" };
    return { sent: ${sendExpr[1]} };
  `;
  return new Function("phoneNumber", "toLocalIraqiPhone", "isValidIraqiPhone", body)(
    typed, toLocalIraqiPhone, isValidIraqiPhone,
  );
}

/** End to end: someone types `typed`; which identity does the server end up with? */
function identityFor(typed) {
  const r = screenSubmits(typed);
  if (r.blocked) return { blocked: r.blocked };
  return { sent: r.sent, identity: serverIdentity(r.sent) };
}

const CANONICAL = "07701234567";
const EQUIVALENT_INPUTS = [
  "07701234567",
  "7701234567",
  "+9647701234567",
  "009647701234567",
  "9647701234567",
  "0770 123 4567",
  "0770-123-4567",
  "+964 770 123 4567",
  "00964 770 123 4567",
  "(0770) 123 4567",
];

// ─────────────────────────────────────────────────────────────────────────────
describe("H-52 · every way of typing one number reaches one identity", () => {
  for (const typed of EQUIVALENT_INPUTS) {
    test(`${JSON.stringify(typed)} → ${CANONICAL}`, () => {
      const r = identityFor(typed);
      assert.equal(r.blocked, undefined,
        `the screen refused a valid number (${r.blocked})`);
      assert.equal(r.identity, CANONICAL,
        `the server would key this as ${JSON.stringify(r.identity)} (client sent ${JSON.stringify(r.sent)})`);
    });
  }

  test("all of them collapse to exactly ONE identity", () => {
    const identities = new Set(EQUIVALENT_INPUTS.map((t) => identityFor(t).identity));
    assert.equal(identities.size, 1,
      `one person got ${identities.size} identities: ${[...identities].join(", ")}`);
    assert.deepEqual([...identities], [CANONICAL]);
  });

  test("the three forms named in the finding are interchangeable", () => {
    const a = identityFor("07701234567").identity;
    const b = identityFor("+9647701234567").identity;
    const c = identityFor("009647701234567").identity;
    assert.equal(a, b);
    assert.equal(b, c);
    assert.equal(a, CANONICAL);
  });

  test("the specific string the finding reported is never produced", () => {
    assert.notEqual(identityFor("07701234567").sent, "0096407701234567");
    assert.doesNotMatch(String(identityFor("07701234567").sent), /^00964/,
      "the screen is prefixing the country code again");
  });

  test("distinct numbers stay distinct — the fix does not over-merge", () => {
    const ids = ["07701234567", "07801234567", "07511234567", "07901234568"]
      .map((t) => identityFor(t).identity);
    assert.equal(new Set(ids).size, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-52 · malformed input is refused, never turned into an identity", () => {
  const BAD = [
    ["", "empty"],
    ["   ", "whitespace only"],
    ["abc", "letters"],
    ["770123456", "one digit short"],
    ["077012345678", "one digit too long"],
    ["06701234567", "not a mobile prefix (06)"],
    ["01701234567", "not a mobile prefix (01)"],
    ["1234567890", "not an Iraqi mobile"],
    ["00000000000", "all zeros"],
    ["+9639701234567", "wrong country code (Syria)"],
    ["0096407701234567", "double country code + local zero"],
    ["009640096407701234567", "country code twice"],
    ["0096407701234567890", "far too long"],
    ["+964", "country code only"],
    ["00964", "country code only, 00 form"],
    ["0", "single zero"],
    ["07", "prefix only"],
  ];

  for (const [typed, why] of BAD) {
    test(`${JSON.stringify(typed)} (${why}) never becomes an identity`, () => {
      const r = identityFor(typed);
      const rejected = r.blocked !== undefined || r.identity === null;
      assert.ok(rejected,
        `it produced the identity ${JSON.stringify(r.identity)} from ${JSON.stringify(r.sent)}`);
    });
  }

  test("a malformed number never collides with a valid one", () => {
    const good = identityFor(CANONICAL).identity;
    for (const [typed] of BAD) {
      const r = identityFor(typed);
      assert.notEqual(r.identity, good,
        `${JSON.stringify(typed)} resolved to a real user's identity`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-52 · the client helper cannot drift from the server", () => {
  const CORPUS = [
    ...EQUIVALENT_INPUTS,
    ...BAD_CORPUS(),
  ];
  function BAD_CORPUS() {
    return ["", "0", "7", "07", "964", "00964", "+964", "abc", "07701234567 ",
            "0096407701234567", "9647701234567", "7701234567", "07801234567",
            "00964 770 123 4567", "٠٧٧٠١٢٣٤٥٦٧"];
  }

  test("toLocalIraqiPhone agrees with the server's toLocalPhone on every input", () => {
    for (const raw of CORPUS) {
      assert.equal(toLocalIraqiPhone(raw), serverToLocalPhone(raw),
        `client and server disagree on ${JSON.stringify(raw)} — two identities are possible again`);
    }
  });

  test("isValidIraqiPhone agrees with the server's send-otp gate", () => {
    for (const raw of CORPUS) {
      assert.equal(isValidIraqiPhone(raw), SERVER_PHONE_RE.test(serverToLocalPhone(raw)),
        `client would let ${JSON.stringify(raw)} through a gate the server closes (or vice versa)`);
    }
  });

  test("the canonical regex is the server's", () => {
    assert.equal(IRAQ_LOCAL_PHONE_RE.source, SERVER_PHONE_RE.source);
  });

  test("normalisation is idempotent — re-normalising never shifts the identity", () => {
    for (const raw of CORPUS) {
      const once = toLocalIraqiPhone(raw);
      assert.equal(toLocalIraqiPhone(once), once, `not idempotent for ${JSON.stringify(raw)}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-52 · no second normaliser is left in the login path", () => {
  test("PhoneLoginScreen has no phone helper of its own", () => {
    const code = SCREEN.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /const formatPhoneForLogin\s*=/,
      "the screen defines its own formatter again");
    assert.doesNotMatch(code, /`00964\$\{/,
      "the blind country-code prefix is back");
  });

  test("it uses the shared helper", () => {
    assert.match(SCREEN, /from "@\/lib\/phone"/);
    assert.match(SCREEN, /toLocalIraqiPhone\(phoneNumber\)/);
    assert.match(SCREEN, /isValidIraqiPhone\(phoneNumber\)/);
  });

  test("no other client screen builds an identity phone number", () => {
    // CheckoutScreen's field is a per-order CONTACT number: the order's identity is
    // order.phoneNumber, taken from the customer JWT (routes.ts:2477), not from it.
    for (const f of ["client/context/AuthContext.tsx"]) {
      const src = read(f).replace(/\/\/[^\n]*/g, "");
      assert.doesNotMatch(src, /`00964\$\{|"00964"\s*\+/,
        `${f} builds its own country-coded phone`);
    }
  });

  test("the server still owns the final say", () => {
    assert.match(ROUTES, /const phoneNumber = toLocalPhone\(String\(req\.body\.phoneNumber\)\);/,
      "send-otp stopped normalising — the client would become the only guard");
    assert.match(ROUTES, /const IRAQ_PHONE_RE = \/\^07\\d\{9\}\$\/;/,
      "the server-side format gate changed");
  });
});
