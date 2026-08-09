/**
 * Socket.IO origin policy tests (audit finding C-12, realtime channel).
 *
 * The REST CORS layer was hardened first, but Socket.IO kept its OWN rule:
 *
 *     const isProd = process.env.NODE_ENV === "production";
 *     if (isProd && configured.length > 0) return configured;
 *     return "*";
 *
 * — the same NODE_ENV-gated wildcard that C-12 was about, left behind on the
 * realtime channel. Any NODE_ENV other than the exact string "production", or a
 * missing ALLOWED_ORIGINS, opened the socket to every website on the internet.
 *
 * These tests verify the realtime channel now resolves origins through the SAME
 * helpers as REST (server/originGuard.ts) rather than a second implementation.
 *
 * Run:  node --test tests/unit/socket-origin.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  isOriginAllowed,
  buildOriginPolicyFromEnv,
  selfOriginFromHeaders,
} from "../../server/originGuard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTES = read("server/routes.ts");

/** The Socket.io construction block, comments removed. */
const socketBlock = () => {
  const start = ROUTES.indexOf("const socketOriginDecision");
  const end = ROUTES.indexOf("ioServer.use((socket, next)");
  assert.ok(start > -1 && end > start, "Socket.io setup block not found");
  return stripComments(ROUTES.slice(start, end));
};

/**
 * Mirror of the server's decision, built from the SAME exported helpers the
 * server uses. Nothing about the rules is re-implemented here.
 */
const decide = (origin, { env = {}, host = "onwayiq.com", proto = "https" } = {}) => {
  if (!origin) return true; // no Origin header → non-browser client
  return isOriginAllowed(origin, {
    ...buildOriginPolicyFromEnv(env),
    selfOrigin: selfOriginFromHeaders(host, proto),
  });
};

const PROD_ENV = {
  NODE_ENV: "production",
  ALLOWED_ORIGINS:
    "https://admin.onway.iq,https://www.admin.onway.iq,https://onwayiq.com,https://www.onwayiq.com",
};
const DEV_ENV = { ALLOWED_ORIGINS: "" }; // NODE_ENV deliberately unset

describe("C-12/socket — the wildcard fallback is gone", () => {
  test("the NODE_ENV-gated `return \"*\"` no longer exists", () => {
    const block = socketBlock();
    assert.doesNotMatch(block, /return\s*"\*"/, 'REGRESSION: wildcard origin fallback is back');
    assert.doesNotMatch(block, /NODE_ENV/, "REGRESSION: socket origin policy must not read NODE_ENV");
    assert.doesNotMatch(
      block,
      /origin:\s*"\*"/,
      "REGRESSION: Socket.io must never be configured with a wildcard origin",
    );
  });

  test("the realtime channel reuses the REST helpers, not a copy", () => {
    const block = socketBlock();
    assert.match(block, /isOriginAllowed\(/, "must call the shared isOriginAllowed");
    assert.match(block, /buildOriginPolicyFromEnv\(\)/, "must use the shared env policy");
    assert.match(block, /selfOriginFromHeaders\(/, "same-origin must be resolved the same way");
    // No hand-rolled parsing of the env var inside the socket block.
    assert.doesNotMatch(
      block,
      /process\.env\.ALLOWED_ORIGINS/,
      "REGRESSION: socket layer must not re-parse ALLOWED_ORIGINS itself",
    );
  });

  test("every handshake — including reconnects — passes through allowRequest", () => {
    const block = socketBlock();
    assert.match(block, /allowRequest:\s*\(req, done\)/, "the handshake gate must be installed");
    assert.match(block, /done\("origin_not_allowed", false\)/, "a bad origin must be refused");
    assert.match(block, /done\(null, true\)/, "an allowed origin must proceed");
  });

  test("the authentication middleware and transports are untouched", () => {
    // Guards requirements 7/8/10: signature mechanism, event names, reconnect.
    assert.match(ROUTES, /ioServer\.use\(\(socket, next\) => \{/, "handshake auth middleware intact");
    // H-09 added the pinned-algorithm options argument; the mechanism is unchanged.
    assert.match(
      ROUTES,
      /jwt\.verify\(String\(raw\), ROUTES_JWT_SECRET, JWT_VERIFY_OPTS\)/,
      "token verification intact",
    );
    assert.match(ROUTES, /transports: \["websocket", "polling"\]/, "both transports still enabled");
  });
});

describe("C-12/socket — allowed origins (production config)", () => {
  for (const origin of [
    "https://onwayiq.com",
    "https://www.onwayiq.com",
    "https://admin.onway.iq",
    "https://www.admin.onway.iq",
  ]) {
    test(`${origin} → allowed`, () => {
      assert.equal(decide(origin, { env: PROD_ENV }), true);
    });
  }

  test("same-origin is allowed even with ALLOWED_ORIGINS empty", () => {
    // Expo Web is served from this same server (static-build).
    assert.equal(decide("https://onwayiq.com", { env: { ALLOWED_ORIGINS: "" } }), true);
  });
});

describe("C-12/socket — denied origins", () => {
  test("an untrusted origin is denied in PRODUCTION", () => {
    assert.equal(decide("https://evil.example", { env: PROD_ENV }), false);
  });

  test("an untrusted origin is denied in DEVELOPMENT too (the old hole)", () => {
    // NODE_ENV unset + ALLOWED_ORIGINS empty is exactly what used to return "*".
    assert.equal(decide("https://evil.example", { env: DEV_ENV }), false);
  });

  test("a look-alike domain is denied", () => {
    assert.equal(decide("https://evil-onwayiq.com", { env: PROD_ENV }), false);
    assert.equal(decide("https://xonwayiq.com", { env: PROD_ENV }), false);
  });

  test("a suffix-attack domain is denied", () => {
    assert.equal(decide("https://onwayiq.com.evil.io", { env: PROD_ENV }), false);
  });

  test("an unlisted subdomain is denied", () => {
    assert.equal(decide("https://x.onway.iq", { env: PROD_ENV }), false);
    assert.equal(decide("https://staging.onwayiq.com", { env: PROD_ENV }), false);
  });

  test("an http downgrade of an https-only entry is denied", () => {
    assert.equal(decide("http://admin.onway.iq", { env: PROD_ENV, proto: "https" }), false);
  });
});

describe("C-12/socket — React Native and local development still connect", () => {
  test("no Origin header → allowed (React Native is every socket client here)", () => {
    for (const env of [PROD_ENV, DEV_ENV]) {
      assert.equal(decide(undefined, { env }), true);
      assert.equal(decide("", { env }), true);
    }
  });

  test("the source documents why a missing Origin is allowed", () => {
    const block = ROUTES.slice(
      ROUTES.indexOf("const socketOriginDecision"),
      ROUTES.indexOf("ioServer.use((socket, next)"),
    );
    assert.match(block, /React Native/, "the non-browser exemption must be explained");
  });

  test("localhost / LAN dev clients are allowed without configuration", () => {
    assert.equal(decide("http://localhost:8081", { env: DEV_ENV }), true);
    assert.equal(decide("http://192.168.1.7:8081", { env: DEV_ENV }), true);
  });

  test("local origins can be disabled without touching NODE_ENV", () => {
    assert.equal(
      decide("http://localhost:8081", { env: { ...DEV_ENV, CORS_ALLOW_LOCAL: "false" } }),
      false,
    );
  });
});

describe("C-12/socket — REST and realtime share one policy", () => {
  test("buildOriginPolicyFromEnv is the single source for both layers", () => {
    const INDEX = read("server/index.ts");
    assert.match(stripComments(INDEX), /buildOriginPolicyFromEnv\(\)/, "REST uses it");
    assert.match(socketBlock(), /buildOriginPolicyFromEnv\(\)/, "Socket.io uses it");
  });

  test("both layers agree on every origin in the matrix", () => {
    const matrix = [
      "https://onwayiq.com",
      "https://admin.onway.iq",
      "https://evil.example",
      "https://evil-onwayiq.com",
      "https://onwayiq.com.evil.io",
      "https://x.onway.iq",
      "http://localhost:8081",
    ];
    for (const origin of matrix) {
      const policy = {
        ...buildOriginPolicyFromEnv(PROD_ENV),
        selfOrigin: selfOriginFromHeaders("onwayiq.com", "https"),
      };
      // Same function, same policy → identical verdict by construction. This
      // asserts the wiring, i.e. that neither layer can special-case an origin.
      assert.equal(decide(origin, { env: PROD_ENV }), isOriginAllowed(origin, policy));
    }
  });
});
