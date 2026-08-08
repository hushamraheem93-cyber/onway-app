/**
 * API base-URL resolution tests (audit finding C-21).
 *
 * getApiUrl() threw a plain Error when EXPO_PUBLIC_API_BASE_URL was missing, and
 * it is called synchronously from resolveImageUrl() — which runs DURING RENDER of
 * every product card, banner and cart row. One production build shipped without
 * the variable therefore meant a permanent ErrorBoundary screen for all users.
 *
 * The rules verified here:
 *   • a correctly configured build resolves normally;
 *   • a missing or empty value is reported as missing_config — never guessed;
 *   • web may fall back to its own origin (it was served from there);
 *   • no secret or credential is ever part of the resolved URL.
 *
 * Run:  node --test tests/unit/api-base.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveApiBase,
  normaliseBase,
  MISSING_API_CONFIG_MESSAGE,
} from "../../client/lib/apiBase.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");

describe("C-21 — native builds", () => {
  test("1. a valid configured URL resolves unchanged", () => {
    const r = resolveApiBase({ configured: "https://api.onway.iq", isWeb: false });
    assert.equal(r.ok, true);
    assert.equal(r.url, "https://api.onway.iq");
  });

  test("2. a MISSING variable reports missing_config instead of guessing a host", () => {
    const r = resolveApiBase({ configured: undefined, isWeb: false });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "missing_config");
    assert.equal(r.url, undefined, "must not invent a URL");
  });

  test("3. an EMPTY / whitespace value is treated as missing, not as a valid host", () => {
    for (const bad of ["", "   ", null]) {
      const r = resolveApiBase({ configured: bad, isWeb: false });
      assert.equal(r.ok, false, `empty value ${JSON.stringify(bad)} must not resolve`);
      assert.equal(r.reason, "missing_config");
    }
  });

  test("4. production-style host: port stripped, https added, trailing slash removed", () => {
    assert.equal(normaliseBase("api.onway.iq"), "https://api.onway.iq");
    assert.equal(normaliseBase("https://api.onway.iq:5000"), "https://api.onway.iq");
    assert.equal(normaliseBase("https://api.onway.iq/"), "https://api.onway.iq");
  });

  test("5. development http host is preserved (not silently upgraded to a different origin)", () => {
    const r = resolveApiBase({ configured: "http://192.168.1.10", isWeb: false });
    assert.equal(r.ok, true);
    assert.equal(r.url, "http://192.168.1.10");
  });
});

describe("C-21 — web builds", () => {
  test("an explicit config wins over the page origin", () => {
    const r = resolveApiBase({
      configured: "https://api.onway.iq",
      isWeb: true,
      windowOrigin: "https://app.onway.iq",
    });
    assert.equal(r.url, "https://api.onway.iq");
  });

  test("without config, web falls back to its own origin (it was served from there)", () => {
    const r = resolveApiBase({ configured: "", isWeb: true, windowOrigin: "https://app.onway.iq" });
    assert.equal(r.ok, true);
    assert.equal(r.url, "https://app.onway.iq");
  });

  test("the Expo dev server port is mapped to the Express port", () => {
    const r = resolveApiBase({ configured: "", isWeb: true, windowOrigin: "http://localhost:8081" });
    assert.equal(r.url, "http://localhost:5000");
  });

  test("isWeb without a window (SSR) uses the native rule and reports missing config", () => {
    const r = resolveApiBase({ configured: "", isWeb: true, windowOrigin: null });
    assert.equal(r.ok, false);
  });
});

describe("C-21 — the render path degrades instead of crashing", () => {
  test("resolveImageUrl uses the non-throwing accessor", () => {
    const src = read("client/utils/imageUtils.ts");
    assert.match(
      src,
      /getApiUrlSafe/,
      "REGRESSION: resolveImageUrl runs during render and must not use the throwing accessor",
    );
    assert.doesNotMatch(
      src,
      /\$\{getApiUrl\(\)\}/,
      "REGRESSION: a throwing getApiUrl() inside render bricks every screen via the ErrorBoundary",
    );
  });

  test("an unconfigured build yields no image rather than a URL against a guessed host", () => {
    const src = read("client/utils/imageUtils.ts");
    assert.match(
      src,
      /const base = getApiUrlSafe\(\);\s*\n\s*if \(!base\) return "";/,
      "must return an empty string, never build a URL from a fallback host",
    );
  });

  test("the misconfiguration is still surfaced, not swallowed", () => {
    const src = read("client/lib/query-client.ts");
    assert.match(src, /console\.error\(`\[config\]/, "missing config must be logged");
    assert.match(src, /missingConfigReported/, "logged once, not per rendered image");
  });

  test("the diagnostic names the variable and contains no secret", () => {
    assert.match(MISSING_API_CONFIG_MESSAGE, /EXPO_PUBLIC_API_BASE_URL/);
    assert.doesNotMatch(MISSING_API_CONFIG_MESSAGE, /key|secret|token|password/i);
  });
});
