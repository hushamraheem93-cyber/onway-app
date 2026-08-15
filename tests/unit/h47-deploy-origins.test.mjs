/**
 * H-47 — the SSL script must not destroy ALLOWED_ORIGINS, and must not write a
 * build-time variable it has no authority over.
 *
 * The finding claimed the rewrite takes the admin panel down. Re-verification
 * against the real topology showed that half is a FALSE POSITIVE: the panel is
 * served at https://onwayiq.com/admin and admin.html uses `API_BASE = '/api'`, so
 * it is always SAME-ORIGIN with the API and originGuard's selfOrigin branch allows
 * it with ALLOWED_ORIGINS completely empty. Section 1 pins that, so nobody
 * "fixes" H-47 by making the panel depend on ALLOWED_ORIGINS again.
 *
 * What was genuinely wrong, and is fixed here:
 *   • `sed -i "s|^ALLOWED_ORIGINS=.*|...|"` replaced the operator's whole list
 *     with one entry. Silent, unrecoverable, and destructive by construction.
 *   • The same scripts rewrote EXPO_PUBLIC_API_BASE_URL in the server's .env.
 *     Nothing on the server reads it — Expo bakes it into the binary from
 *     eas.json — so it produced a config that looked right and disagreed with
 *     what shipped.
 *
 * Section 3 does not grep for the fix: it EXECUTES the real merge_allowed_origins
 * lifted out of the shipped scripts.
 *
 * Run:  node --test tests/unit/h47-deploy-origins.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripShellComments } from "./_source.mjs";

import {
  isOriginAllowed,
  isAdminCsrfAllowed,
  buildOriginPolicyFromEnv,
  selfOriginFromHeaders,
} from "../../server/originGuard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

const SSL = read("deployment/ssl-setup.sh");
const SETUP = read("deployment/server-setup.sh");
const ENVSETUP = read("deployment/env-setup.sh");
/** Comments explain the OLD sed on purpose — they must never satisfy an assertion. */
const sslCode = stripShellComments(SSL);
const setupCode = stripShellComments(SETUP);

// ─────────────────────────────────────────────────────────────────────────────
// 1. The real topology: /admin is same-origin, so it needs no configuration.
// ─────────────────────────────────────────────────────────────────────────────
describe("H-47 · the admin panel is same-origin with the API", () => {
  test("admin.html calls a RELATIVE API base", () => {
    const admin = read("server/templates/admin.html");
    const m = admin.match(/const API_BASE\s*=\s*'([^']*)'/);
    assert.ok(m, "API_BASE disappeared from admin.html");
    assert.equal(m[1], "/api",
      "an absolute API base would make the panel cross-origin and reintroduce H-47");
  });

  /** One browser request, through both guards, exactly as the server wires them. */
  const request = ({ host, origin, allowedOrigins, method = "POST" }) => {
    const selfOrigin = selfOriginFromHeaders(host, "https");
    const policy = { ...buildOriginPolicyFromEnv({ ALLOWED_ORIGINS: allowedOrigins }), selfOrigin };
    const cors = origin ? isOriginAllowed(origin, policy) : true;
    const csrf = isAdminCsrfAllowed({
      method, origin, hasSessionCookie: true, selfOrigin,
      allowedOrigins: policy.allowedOrigins,
    });
    return cors && csrf;
  };

  for (const [label, list] of [
    ["empty", ""],
    ["the single value ssl-setup.sh writes", "https://onwayiq.com"],
    ["a four-entry list", "https://admin.onway.iq,https://www.admin.onway.iq,https://onwayiq.com,https://www.onwayiq.com"],
  ]) {
    test(`a cookie-authenticated admin POST works with ALLOWED_ORIGINS ${label}`, () => {
      assert.equal(
        request({ host: "onwayiq.com", origin: "https://onwayiq.com", allowedOrigins: list }),
        true,
        "the panel must never depend on ALLOWED_ORIGINS — selfOrigin carries it",
      );
    });
  }

  test("https://onwayiq.com is allowed", () => {
    assert.equal(
      request({ host: "onwayiq.com", origin: "https://onwayiq.com", allowedOrigins: "" }), true);
  });

  test("a native client with no Origin header is allowed", () => {
    assert.equal(
      request({ host: "onwayiq.com", origin: null, allowedOrigins: "" }), true);
  });

  for (const evil of [
    "https://evil.com",
    "https://evil-onwayiq.com",
    "https://onwayiq.com.evil.io",
    "http://onwayiq.com.attacker.test",
  ]) {
    test(`${evil} is rejected even with the list emptied`, () => {
      assert.equal(
        request({ host: "onwayiq.com", origin: evil, allowedOrigins: "" }), false,
        "emptying ALLOWED_ORIGINS must not open the door to anyone else");
    });
  }

  test("there is no wildcard bypass anywhere in the origin decision", () => {
    const guard = read("server/originGuard.ts");
    assert.doesNotMatch(guard, /return\s*"\*"/, 'originGuard returns "*" somewhere');
    assert.doesNotMatch(read("server/index.ts"), /Access-Control-Allow-Origin["'`\s,]*[:,]\s*["'`]\*/,
      'index.ts emits Access-Control-Allow-Origin: *');
    assert.doesNotMatch(stripShellComments(read("server/routes.ts").replace(/\/\/[^\n]*/g, "")),
      /origin:\s*"\*"/, 'the socket layer configures origin: "*"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. The deploy scripts no longer overwrite either variable.
// ─────────────────────────────────────────────────────────────────────────────
describe("H-47 · the deploy scripts stopped overwriting", () => {
  const DESTRUCTIVE = /sed[^\n]*s\|\^ALLOWED_ORIGINS=\.\*\|/;

  test("ssl-setup.sh does not sed-replace the whole ALLOWED_ORIGINS value", () => {
    assert.doesNotMatch(sslCode, DESTRUCTIVE,
      "ssl-setup.sh is back to replacing the operator's list with one entry");
  });

  test("server-setup.sh does not sed-replace the whole ALLOWED_ORIGINS value", () => {
    assert.doesNotMatch(setupCode, DESTRUCTIVE,
      "server-setup.sh is back to replacing the operator's list with one entry");
  });

  for (const [name, code] of [["ssl-setup.sh", sslCode], ["server-setup.sh", setupCode]]) {
    test(`${name} does not write EXPO_PUBLIC_API_BASE_URL into .env`, () => {
      assert.doesNotMatch(code, /sed[^\n]*EXPO_PUBLIC_API_BASE_URL/,
        "the value is baked from eas.json at build time; writing it here is a lie");
      assert.doesNotMatch(code, /^\s*(echo|printf)[^\n|]*EXPO_PUBLIC_API_BASE_URL=/m,
        "the value is still being appended to .env");
    });

    test(`${name} tells the operator where EXPO_PUBLIC_API_BASE_URL really comes from`, () => {
      assert.match(code, /EXPO_PUBLIC_API_BASE_URL/,
        "the explanatory notice disappeared entirely");
      assert.match(code, /eas\.json/,
        "the notice must name eas.json as the real source");
    });

    test(`${name} routes ALLOWED_ORIGINS through the additive merge`, () => {
      assert.match(code, /merge_allowed_origins\s+"\$\{APP_DIR\}\/\.env"/,
        "the merge helper is not being used at the call site");
    });
  }

  test("both scripts carry a byte-identical copy of merge_allowed_origins", () => {
    const lift = (src) => {
      const start = src.indexOf("merge_allowed_origins() {");
      assert.notEqual(start, -1, "merge_allowed_origins is missing");
      const end = src.indexOf("\n}\n", start);
      assert.notEqual(end, -1, "merge_allowed_origins is not closed");
      return src.slice(start, end + 3);
    };
    assert.equal(lift(SSL), lift(SETUP),
      "the two copies drifted — server-setup.sh runs via `curl | bash` and cannot source a sibling");
  });

  test("env-setup.sh tells the operator ALLOWED_ORIGINS is a list", () => {
    assert.match(ENVSETUP, /COMMA-SEPARATED LIST/,
      "the prompt still implies a single origin");
    assert.match(ENVSETUP, /https:\/\/[^\s,]+,https:\/\//,
      "no multi-origin example is shown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Execute the REAL merge function out of the shipped script.
// ─────────────────────────────────────────────────────────────────────────────
describe("H-47 · merge_allowed_origins never drops an existing origin", () => {
  const fn = (() => {
    const start = SSL.indexOf("merge_allowed_origins() {");
    return SSL.slice(start, SSL.indexOf("\n}\n", start) + 3);
  })();

  /** Run the shipped function against a real .env file and return the new value. */
  const merge = (initialEnv, ...add) => {
    const dir = mkdtempSync(join(tmpdir(), "h47-"));
    const envPath = join(dir, ".env");
    writeFileSync(envPath, initialEnv);
    const script = join(dir, "run.sh");
    writeFileSync(script,
      `#!/usr/bin/env bash\nset -euo pipefail\n${fn}\nmerge_allowed_origins "$@"\n`);
    execFileSync("bash", [script, envPath, ...add], { encoding: "utf8" });
    const after = readFileSync(envPath, "utf8");
    const line = after.match(/^ALLOWED_ORIGINS=(.*)$/m);
    return { value: line ? line[1] : null, file: after, envPath };
  };

  test("an existing four-entry list survives, with the new domain appended", () => {
    const before = "https://admin.onway.iq,https://www.admin.onway.iq,https://onwayiq.com,https://www.onwayiq.com";
    const { value } = merge(
      `NODE_ENV=production\nALLOWED_ORIGINS=${before}\nPORT=5000\n`,
      "https://new.example.com",
    );
    for (const origin of before.split(",")) {
      assert.ok(value.split(",").includes(origin), `${origin} was dropped`);
    }
    assert.ok(value.split(",").includes("https://new.example.com"), "the new domain was not added");
    assert.equal(value.split(",").length, 5);
  });

  test("re-adding a domain that is already present changes nothing", () => {
    const { value } = merge(
      "ALLOWED_ORIGINS=https://onwayiq.com,https://www.onwayiq.com\n",
      "https://onwayiq.com",
    );
    assert.equal(value, "https://onwayiq.com,https://www.onwayiq.com");
  });

  test("running it twice is idempotent", () => {
    const first = merge("ALLOWED_ORIGINS=https://a.test\n", "https://b.test").value;
    const second = merge(`ALLOWED_ORIGINS=${first}\n`, "https://b.test").value;
    assert.equal(first, second);
    assert.equal(second, "https://a.test,https://b.test");
  });

  test("an empty value simply becomes the new domain", () => {
    const { value } = merge("ALLOWED_ORIGINS=\n", "https://onwayiq.com");
    assert.equal(value, "https://onwayiq.com");
  });

  test("a missing key is appended rather than lost", () => {
    const { value, file } = merge("NODE_ENV=production\n", "https://onwayiq.com");
    assert.equal(value, "https://onwayiq.com");
    assert.match(file, /^NODE_ENV=production$/m, "the rest of .env was not preserved");
  });

  test("surrounding .env lines are untouched", () => {
    const { file } = merge(
      "NODE_ENV=production\nALLOWED_ORIGINS=https://a.test\nPORT=5000\nJWT_SECRET=xxx\n",
      "https://b.test",
    );
    assert.match(file, /^NODE_ENV=production$/m);
    assert.match(file, /^PORT=5000$/m);
    assert.match(file, /^JWT_SECRET=xxx$/m);
  });

  test("duplicates already in the file are collapsed, not multiplied", () => {
    const { value } = merge("ALLOWED_ORIGINS=https://a.test,https://a.test\n", "https://a.test");
    assert.equal(value, "https://a.test");
  });

  test("spaces around entries are tolerated", () => {
    const { value } = merge("ALLOWED_ORIGINS=https://a.test , https://b.test\n", "https://c.test");
    assert.equal(value, "https://a.test,https://b.test,https://c.test");
  });

  test("the .env file keeps its mode — it is not replaced by a temp file", () => {
    const dir = mkdtempSync(join(tmpdir(), "h47-mode-"));
    const envPath = join(dir, ".env");
    writeFileSync(envPath, "ALLOWED_ORIGINS=https://a.test\n", { mode: 0o600 });
    execFileSync("chmod", ["600", envPath]);
    const script = join(dir, "run.sh");
    writeFileSync(script,
      `#!/usr/bin/env bash\nset -euo pipefail\n${fn}\nmerge_allowed_origins "$@"\n`);
    execFileSync("bash", [script, envPath, "https://b.test"], { encoding: "utf8" });
    assert.equal(statSync(envPath).mode & 0o777, 0o600,
      "mv would have replaced .env with the temp file's permissions (breaks H-46)");
  });
});
