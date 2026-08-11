/**
 * Crash-reporting privacy tests (H-32, second half).
 *
 * OnWay's API puts customer and driver PHONE NUMBERS in query strings —
 * /api/orders?phone=…, /api/notifications?phone=…, /api/settlement?phoneNumber=…,
 * /api/driver/earnings?phoneNumber=… — and Sentry records every HTTP request as a
 * breadcrumb with the full URL by default. Enabling the SDK as it ships would send
 * the phone numbers of a small Iraqi town's customers and drivers to a third party.
 *
 * These tests run the REAL scrubbers from client/lib/crashReporting.ts against
 * realistic event payloads built from this codebase's actual URL shapes, and assert
 * both directions: nothing identifying survives, and everything a developer needs
 * to fix a crash does survive. They need no network, no device and no Sentry
 * account, which is the point — the privacy guarantee is provable here.
 *
 * Run:  node --test tests/unit/crash-reporting-privacy.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require("typescript");

const SRC_PATH = join(here, "../../client/lib/crashReporting.ts");
const SRC = readFileSync(SRC_PATH, "utf8");

/**
 * Load the real module with the Sentry import stubbed out — the scrubbers are pure
 * and must not need the native SDK to be exercised.
 */
const mod = (() => {
  const js = ts.transpileModule(SRC, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exports = {};
  const fakeRequire = (id) => {
    if (id === "@sentry/react-native") {
      return { init: () => {}, captureException: () => {} };
    }
    return require(id);
  };
  // eslint-disable-next-line no-new-func
  new Function("exports", "require", "module", "__DEV__", js)(
    exports, fakeRequire, { exports }, false,
  );
  return exports;
})();

const { scrubText, scrubDeep, sanitizeEvent, filterBreadcrumb, isCrashReportingConfigured } = mod;

/** Every identifying shape this codebase actually produces. */
const SECRETS = [
  "07901110001",
  "+9647901110001",
  "009647901110001",
  "0790 111 0001",
  "0790-111-0001",
];
const TOKENS = [
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123",
  "eyJhbGciOiJIUzI1NiJ9.eyJwaG9uZSI6IjA3OSJ9.sig",
];

/** Real URL shapes, copied from the client. */
const REAL_URLS = [
  "https://onwayiq.com/api/orders?phone=07901110001",
  "https://onwayiq.com/api/notifications?phone=%2B9647901110001",
  "https://onwayiq.com/api/settlement/summary?phoneNumber=07901110001",
  "https://onwayiq.com/api/driver/earnings?phoneNumber=07901110001",
  "https://onwayiq.com/api/driver/wallet?phoneNumber=07901110001",
];

const contains = (haystack, needle) => JSON.stringify(haystack).includes(needle);

// ─────────────────────────────────────────────────────────────────────────────
describe("H-32 · phone numbers never leave the device", () => {
  for (const url of REAL_URLS) {
    test(`the real URL ${url.split("?")[0].replace("https://onwayiq.com", "")} is scrubbed`, () => {
      const out = scrubText(url);
      assert.doesNotMatch(out, /07901110001/, `phone survived: ${out}`);
      assert.doesNotMatch(out, /9647901110001/, `international phone survived: ${out}`);
      assert.match(out, /redacted/, `nothing was redacted at all: ${out}`);
      // The path is still useful for debugging.
      assert.match(out, /\/api\//, `the whole URL was destroyed: ${out}`);
    });
  }

  for (const phone of SECRETS) {
    test(`a bare ${phone} in a message is scrubbed`, () => {
      const out = scrubText(`failed to load orders for ${phone} after retry`);
      assert.ok(!out.includes(phone), `phone survived: ${out}`);
      assert.match(out, /failed to load orders/, "the message text was destroyed");
    });
  }

  test("a phone nested deep inside an event object is scrubbed", () => {
    const event = {
      exception: { values: [{ value: "no order for 07901110001" }] },
      extra: { params: { phoneNumber: "07901110001" } },
      tags: { route: "/api/orders?phone=07901110001" },
    };
    const out = scrubDeep(event);
    assert.ok(!contains(out, "07901110001"), JSON.stringify(out));
  });
});

describe("H-32 · credentials never leave the device", () => {
  for (const token of TOKENS) {
    test(`${token.slice(0, 18)}… is scrubbed`, () => {
      const out = scrubText(`request failed with ${token}`);
      assert.ok(!out.includes(token.replace(/^Bearer /, "")), `token survived: ${out}`);
    });
  }

  test("an Authorization header value is scrubbed", () => {
    const out = scrubText('{"Authorization":"Bearer sk_live_abcdefghijklmnop"}');
    assert.ok(!out.includes("sk_live_abcdefghijklmnop"), out);
  });

  for (const param of ["token", "access_token", "refresh_token", "password", "apiKey", "secret", "otp"]) {
    test(`a ${param}= query parameter is scrubbed`, () => {
      const out = scrubText(`https://onwayiq.com/x?${param}=SUPERSECRETVALUE123`);
      assert.ok(!out.includes("SUPERSECRETVALUE123"), out);
      assert.ok(out.includes(param), `the parameter name should stay for context: ${out}`);
    });
  }

  test("an email address is scrubbed", () => {
    const out = scrubText("https://onwayiq.com/x?email=husham@example.com");
    assert.ok(!out.includes("husham@example.com"), out);
  });

  test("an address parameter is scrubbed", () => {
    const out = scrubText("https://onwayiq.com/x?address=Dhuluiyah%20main%20street");
    assert.ok(!out.includes("Dhuluiyah%20main%20street"), out);
  });
});

describe("H-32 · what a developer needs still survives", () => {
  const event = {
    exception: {
      values: [{
        type: "TypeError",
        value: "Cannot read property 'origin' of undefined",
        stacktrace: {
          frames: [
            { filename: "client/lib/query-client.ts", lineno: 25, function: "currentResolution" },
            { filename: "client/screens/PhoneLoginScreen.tsx", lineno: 67, function: "handleContinue" },
          ],
        },
      }],
    },
    release: "com.husham.onway@1.0.0+42",
    dist: "42",
    contexts: {
      device: { model: "iPhone14,3", family: "iPhone" },
      os: { name: "iOS", version: "18.2" },
      app: { app_version: "1.0.0", build_type: "release" },
    },
    user: { id: "07901110001", ip_address: "37.236.1.2" },
  };

  const out = sanitizeEvent(structuredClone(event));

  test("the error type and message survive", () => {
    assert.equal(out.exception.values[0].type, "TypeError");
    assert.match(out.exception.values[0].value, /Cannot read property 'origin' of undefined/);
  });

  test("the stack frames survive with file and line", () => {
    const frames = out.exception.values[0].stacktrace.frames;
    assert.equal(frames.length, 2);
    assert.equal(frames[0].filename, "client/lib/query-client.ts");
    assert.equal(frames[0].lineno, 25);
    assert.equal(frames[1].function, "handleContinue");
  });

  test("app version, build and device information survive", () => {
    assert.equal(out.release, "com.husham.onway@1.0.0+42");
    assert.equal(out.dist, "42");
    assert.equal(out.contexts.device.model, "iPhone14,3");
    assert.equal(out.contexts.os.version, "18.2");
    assert.equal(out.contexts.app.app_version, "1.0.0");
  });

  test("the identity block is removed outright", () => {
    assert.equal(out.user, undefined, "user identity was sent");
    assert.ok(!contains(out, "07901110001"), "the user id was a phone number");
    assert.ok(!contains(out, "37.236.1.2"), "the user IP was sent");
  });
});

describe("H-32 · the last gate drops everything that carries request data", () => {
  test("breadcrumbs are stripped from the event", () => {
    const out = sanitizeEvent({
      breadcrumbs: [{ category: "fetch", data: { url: REAL_URLS[0] } }],
      message: "x",
    });
    assert.equal(out.breadcrumbs, undefined);
    assert.ok(!contains(out, "07901110001"));
  });

  test("request headers, cookies, query string and body are stripped", () => {
    const out = sanitizeEvent({
      request: {
        url: REAL_URLS[0],
        query_string: "phone=07901110001",
        cookies: { session: "abc" },
        headers: { Authorization: "Bearer eyJhbGciOi.x.y" },
        data: { phoneNumber: "07901110001", address: "Dhuluiyah" },
      },
    });
    assert.equal(out.request.query_string, undefined);
    assert.equal(out.request.cookies, undefined);
    assert.equal(out.request.headers, undefined);
    assert.equal(out.request.data, undefined);
    assert.ok(!contains(out, "07901110001"), JSON.stringify(out));
  });

  test("no breadcrumb is ever recorded in the first place", () => {
    // Pass the breadcrumbs Sentry would really hand over — an HTTP one carrying a
    // phone number in its URL, and a console one carrying the boundary's own log.
    const real = [
      { category: "fetch", type: "http", data: { url: REAL_URLS[0], method: "GET" } },
      { category: "xhr", data: { url: REAL_URLS[3], status_code: 500 } },
      { category: "console", level: "error", message: "[crash] failed for 07901110001" },
      { category: "navigation", data: { from: "Home", to: "OrderTracking" } },
    ];
    for (const b of real) {
      assert.equal(filterBreadcrumb(b, { event: b }), null,
        `a breadcrumb was let through: ${JSON.stringify(b)}`);
    }
    assert.equal(filterBreadcrumb(), null, "the no-argument call must also drop");
  });

  test("a null event stays null", () => {
    assert.equal(sanitizeEvent(null), null);
  });

  test("a cyclic event does not hang the scrubber", () => {
    const e = { message: "phone 07901110001" };
    e.self = e;
    const out = sanitizeEvent(e);
    assert.ok(!out.message.includes("07901110001"));
  });

  test("numbers, booleans and nulls pass through untouched", () => {
    const out = scrubDeep({ n: 42, b: true, z: null, arr: [1, "07901110001"] });
    assert.equal(out.n, 42);
    assert.equal(out.b, true);
    assert.equal(out.z, null);
    assert.equal(out.arr[0], 1);
    assert.ok(!out.arr[1].includes("07901110001"));
  });
});

describe("H-32 · the reporter is inert until a DSN is deliberately supplied", () => {
  test("no DSN means not configured", () => {
    const before = process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    try { assert.equal(isCrashReportingConfigured(), false); }
    finally { if (before !== undefined) process.env.EXPO_PUBLIC_SENTRY_DSN = before; }
  });

  test("a blank DSN counts as unset", () => {
    const before = process.env.EXPO_PUBLIC_SENTRY_DSN;
    process.env.EXPO_PUBLIC_SENTRY_DSN = "   ";
    try { assert.equal(isCrashReportingConfigured(), false); }
    finally {
      if (before === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      else process.env.EXPO_PUBLIC_SENTRY_DSN = before;
    }
  });

  test("a real DSN counts as configured", () => {
    const before = process.env.EXPO_PUBLIC_SENTRY_DSN;
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.de.sentry.io/2";
    try { assert.equal(isCrashReportingConfigured(), true); }
    finally {
      if (before === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      else process.env.EXPO_PUBLIC_SENTRY_DSN = before;
    }
  });
});

describe("H-32 · the configuration itself, read from source", () => {
  const CLEAN = sharedStripComments(SRC);

  for (const [label, pattern] of [
    ["PII collection is off", /sendDefaultPii:\s*false/],
    ["performance tracing is off", /tracesSampleRate:\s*0\b/],
    ["session tracking is off", /enableAutoSessionTracking:\s*false/],
    ["screenshots are off", /attachScreenshot:\s*false/],
    ["view hierarchies are off", /attachViewHierarchy:\s*false/],
    ["breadcrumbs are capped at zero", /maxBreadcrumbs:\s*0/],
    ["the breadcrumb filter is wired", /beforeBreadcrumb:\s*filterBreadcrumb/],
    ["the event sanitiser is wired", /beforeSend:\s*sanitizeEvent/],
    ["development builds are disabled", /enabled:\s*!__DEV__/],
  ]) {
    test(label, () => assert.match(CLEAN, pattern));
  }

  test("the URL-carrying integrations are filtered out", () => {
    for (const name of ["Breadcrumbs", "Http", "Console", "DeviceContext"]) {
      assert.match(CLEAN, new RegExp(`"${name}"`), `${name} integration is not filtered`);
    }
  });

  test("the DSN comes from the environment, never hardcoded", () => {
    assert.match(CLEAN, /dsn:\s*process\.env\.EXPO_PUBLIC_SENTRY_DSN/);
    assert.doesNotMatch(CLEAN, /https:\/\/[0-9a-f]{16,}@/i,
      "a literal DSN was committed into the source");
  });

  test("no auth token appears anywhere in the module", () => {
    assert.doesNotMatch(CLEAN, /SENTRY_AUTH_TOKEN|authToken/i);
  });

  test("no automatic retry was introduced", () => {
    assert.doesNotMatch(CLEAN, /setTimeout|setInterval|\bretry\b/i);
  });

  test("init and capture can never throw into the app", () => {
    // Both entry points must be wrapped: a reporting tool must not be able to
    // break the app it exists to watch. Each slice is bounded to its own function
    // — slicing to end-of-file would let one function's try satisfy the other.
    const bodyOf = (decl) => {
      const at = CLEAN.indexOf(decl);
      assert.ok(at >= 0, `${decl} not found`);
      const open = CLEAN.indexOf("{", at);
      let depth = 0;
      for (let i = open; i < CLEAN.length; i += 1) {
        if (CLEAN[i] === "{") depth += 1;
        else if (CLEAN[i] === "}") {
          depth -= 1;
          if (depth === 0) return CLEAN.slice(open, i + 1);
        }
      }
      throw new Error(`unbalanced: ${decl}`);
    };
    assert.match(bodyOf("export function initCrashReporting"), /\btry\s*\{[\s\S]*\}\s*catch\b/,
      "initCrashReporting is not isolated — a failed init would crash startup");
    assert.match(bodyOf("export function reportCrash"), /\btry\s*\{[\s\S]*\}\s*catch\b/,
      "reportCrash is not isolated — a reporting failure would crash the boundary");
  });
});
