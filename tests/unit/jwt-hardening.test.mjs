/**
 * JWT verification hardening tests (audit finding H-09).
 *
 * "One signing secret for four token audiences": admin, customer, driver and
 * vendor tokens are all signed with JWT_SECRET, carry no `aud`/`iss`, and were
 * verified with the algorithm left open. Role separation therefore rests entirely
 * on each verifier remembering to check its own discriminator.
 *
 * These tests enforce the invariant the finding is really about — that no verify
 * site can quietly stop checking — plus the algorithm pin, which is the one part
 * that does not depend on anyone remembering.
 *
 * Run:  node --test tests/unit/jwt-hardening.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { JWT_ALGORITHMS, JWT_VERIFY_OPTS } from "../../server/orderValidation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const FILES = {
  "server/adminAuth.ts": read("server/adminAuth.ts"),
  "server/routes.ts": read("server/routes.ts"),
  "server/vendor.ts": read("server/vendor.ts"),
};

/** Every jwt.verify() call in the server, with the code that immediately follows it. */
function verifySites() {
  const out = [];
  for (const [file, src] of Object.entries(FILES)) {
    for (const m of src.matchAll(/jwt\.verify\(([^;]*?)\)\s*as any;/g)) {
      out.push({
        file,
        line: src.slice(0, m.index).split("\n").length,
        call: m[1],
        after: src.slice(m.index, m.index + 400),
      });
    }
  }
  return out;
}

const SITES = verifySites();

describe("H-09 — the algorithm is pinned everywhere", () => {
  test("HS256 is the only algorithm the project accepts", () => {
    assert.deepEqual([...JWT_ALGORITHMS], ["HS256"]);
    assert.deepEqual(JWT_VERIFY_OPTS.algorithms, ["HS256"]);
  });

  test("every verify site was found by the scan", () => {
    assert.ok(SITES.length >= 14, `only ${SITES.length} verify sites found — did the scan break?`);
  });

  for (const site of SITES) {
    test(`${site.file}:${site.line} pins the algorithm`, () => {
      assert.match(
        site.call,
        /JWT_VERIFY_OPTS/,
        `REGRESSION: this verify call lets the token's own header choose the algorithm`,
      );
    });
  }

  test("no verify call is left with only two arguments", () => {
    for (const [file, src] of Object.entries(FILES)) {
      assert.doesNotMatch(
        src,
        /jwt\.verify\([^,)]+,\s*[A-Za-z_$][\w$]*(?:\(\))?\)/,
        `REGRESSION: an unpinned jwt.verify() reappeared in ${file}`,
      );
    }
  });
});

describe("H-09 — every verifier checks its own audience discriminator", () => {
  // This is the invariant the shared secret makes load-bearing: with one key, a
  // customer token verifies against the driver secret too, so the ONLY thing
  // separating the roles is this check. A verifier that forgets it grants
  // cross-role access.
  const DISCRIMINATORS = [
    /decoded\??\.type !== "admin"/,
    /decoded\.role !== "vendor"/,
    /decoded\.role !== "customer"/,
    /decoded\.role !== "driver"/,
    /decoded\.role === "vendor"/,
    /decoded\.role === "customer"/,
    /decoded\.role === "driver"/,
    /\(socket\.data as any\)\.role = decoded\.role/,
  ];

  for (const site of SITES) {
    test(`${site.file}:${site.line} checks role or type`, () => {
      const ok = DISCRIMINATORS.some((re) => re.test(site.after));
      assert.ok(
        ok,
        `REGRESSION: this verifier accepts ANY valid token — a customer token would pass as ${site.file}\n${site.after.slice(0, 200)}`,
      );
    });
  }
});

describe("H-09 — every token carries a discriminator to check", () => {
  test("admin tokens are typed", () => {
    assert.match(FILES["server/adminAuth.ts"], /jwt\.sign\(\s*\n?\s*\{ username, type: "admin", jti \}/);
  });

  test("driver, customer and vendor tokens carry a role", () => {
    assert.match(FILES["server/routes.ts"], /jwt\.sign\(\{ phoneNumber, role: "driver" \}/);
    assert.match(FILES["server/routes.ts"], /\{ phoneNumber, role: "customer" \}/);
    assert.match(FILES["server/vendor.ts"], /jwt\.sign\(\{ vendorId, role: "vendor" \}/);
  });

  test("the admin discriminator is `type`, not `role` — they must not be confused", () => {
    // An admin token has no `role`, so a `role`-checking verifier rejects it, and a
    // `type`-checking verifier rejects every non-admin token. The asymmetry is what
    // keeps the admin audience separate; documented here so it is not "tidied up".
    assert.doesNotMatch(FILES["server/adminAuth.ts"], /jwt\.sign\([^)]*role:/s);
  });
});

describe("H-09 — the secret is still a single required env var", () => {
  test("no hardcoded fallback secret exists", () => {
    for (const [file, src] of Object.entries(FILES)) {
      assert.doesNotMatch(
        src,
        /JWT_SECRET\s*\|\|\s*["'][^"']+["']/,
        `REGRESSION: ${file} has a hardcoded fallback signing key`,
      );
    }
  });

  test("adminAuth refuses to sign without it", () => {
    assert.match(
      FILES["server/adminAuth.ts"],
      /throw new Error\("JWT_SECRET environment variable is required but not set\."\)/,
    );
  });

  test("the remaining gap is documented, not silently ignored", () => {
    // `aud` per audience and per-audience secrets both invalidate every token in
    // circulation, so they are a release decision. The reasoning lives in the source.
    const notes = read("server/orderValidation.ts");
    assert.match(notes, /NOT done here, deliberately: adding `aud` per audience/);
  });
});
