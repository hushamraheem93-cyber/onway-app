/**
 * Driver GPS heartbeat cost tests (audit finding H-39).
 *
 * The "driver:location" socket handler re-read the driver from Firestore on every
 * heartbeat for one field: the display name that rides along on the live-map
 * broadcast. getDriverByPhone() walks each Iraqi phone-format variant in turn, so
 * one heartbeat cost up to four where().limit(1).get() queries — measured at three
 * for a driver whose stored number differs in format from their token.
 *
 * Nothing rate-limited the socket event either, which is the sharper half: the
 * client's 5s timer bounds an honest app, not an attacker. A driver token emitting
 * in a loop turned one socket message into several billable queries with no ceiling.
 * The live harness measured 500 heartbeats in 254ms costing 1,000 Firestore queries
 * before the fix and 0 after.
 *
 * The behavioural proof lives in the live harness, which boots the real
 * registerRoutes() against a query-counting Firestore double. These tests pin the
 * invariants that harness cannot express as cheaply, and guard the ordering that
 * makes the fix work at all: the rate limit has to run BEFORE the read, or it
 * bounds nothing that costs money.
 *
 * Run:  node --test tests/unit/driver-heartbeat-cost.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ts = createRequire(import.meta.url)("typescript");
const SRC = readFileSync(join(root, "server/routes.ts"), "utf8");
const CLEAN = stripComments(SRC);

/**
 * The value of a numeric `const` in the shipped source, in milliseconds.
 *
 * Reads the whole right-hand side up to the semicolon and evaluates it, rather
 * than capturing the first run of digits: `5 * 60_000` would otherwise read as 5
 * and every bound below would pass no matter how far the constant was widened.
 */
function constMs(name) {
  const m = CLEAN.match(new RegExp(`${name} = ([^;\\n]+);`));
  assert.ok(m, `${name} not found`);
  // eslint-disable-next-line no-new-func
  const value = new Function(`return (${m[1]});`)();
  assert.ok(Number.isFinite(value), `${name} is not a number: ${m[1]}`);
  return value;
}

/** The body of the socket handler for `event`, by brace matching. */
function handlerBody(event) {
  const at = CLEAN.indexOf(`socket.on("${event}"`);
  assert.ok(at > 0, `${event} handler not found`);
  const open = CLEAN.indexOf("{", CLEAN.indexOf("=>", at));
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") {
      depth -= 1;
      if (depth === 0) return CLEAN.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced ${event}`);
}

describe("H-39 · the heartbeat no longer reads the database", () => {
  const body = handlerBody("driver:location");

  test("the handler does not call getDriverByPhone directly", () => {
    assert.doesNotMatch(body, /getDriverByPhone\(/,
      "the per-heartbeat Firestore read is back");
  });

  test("it reads the name through the cache instead", () => {
    assert.match(body, /await cachedDriverName\(phoneNumber\)/,
      "the name is no longer resolved through the cached helper");
  });

  test("an unresolvable driver is still rejected", () => {
    assert.match(body, /if \(fullName === null\) return;/,
      "a heartbeat from a deleted driver would now be accepted");
  });

  test("the name still reaches the live-map broadcast", () => {
    assert.match(body, /emit\("order:driverLocation", \{[\s\S]*?fullName/,
      "the customer's tracking map lost the driver's name");
  });
});

describe("H-39 · the rate limit runs before the expensive work", () => {
  const body = handlerBody("driver:location");

  test("a per-driver floor exists", () => {
    assert.match(body, /locationRateLimit\.get\(phoneNumber\)/, "no rate limit");
    assert.match(body, /< LOCATION_MIN_INTERVAL\) return;/,
      "the rate limit does not actually drop the excess heartbeat");
  });

  test("it is checked BEFORE the name lookup, not after", () => {
    const gate = body.indexOf("LOCATION_MIN_INTERVAL");
    const read = body.indexOf("cachedDriverName");
    assert.ok(gate > 0 && read > 0, "one of the two is missing");
    assert.ok(gate < read,
      "the read happens before the rate limit — the limit bounds nothing that costs money");
  });

  test("it is checked before the broadcast fan-out too", () => {
    const gate = body.indexOf("LOCATION_MIN_INTERVAL");
    const fanout = body.indexOf("driverAssignments.entries()");
    assert.ok(fanout > 0 && gate < fanout,
      "a tight loop would still drive the per-order broadcast");
  });

  test("the floor leaves the real client a wide margin", () => {
    // The app sends every 5s mid-delivery and every 30s idle (DriverHomeScreen).
    const floor = constMs("LOCATION_MIN_INTERVAL");
    assert.ok(floor > 0 && floor <= 2000,
      `a ${floor}ms floor would drop the legitimate 5s heartbeat`);
  });
});

describe("H-39 · the cache cannot outlive the driver", () => {
  test("a failed lookup is never cached", () => {
    const fn = CLEAN.slice(CLEAN.indexOf("const cachedDriverName"));
    const body = fn.slice(0, fn.indexOf("\n  };"));
    assert.match(body, /if \(!driver\) return null;/,
      "a negative result is cached, so a deleted driver stays publishable");
    const nullReturn = body.indexOf("if (!driver) return null;");
    const write = body.indexOf("driverNameCache.set");
    assert.ok(nullReturn < write, "the cache is written before the null check");
  });

  test("the TTL is short enough to bound an out-of-band deletion", () => {
    const ttl = constMs("DRIVER_NAME_TTL");
    assert.ok(ttl <= 60_000,
      `a ${ttl}ms TTL lets a driver deleted straight in Firestore keep publishing that long`);
  });

  test("deleting a driver purges the heartbeat state", () => {
    const at = CLEAN.indexOf('app.delete("/api/admin/drivers/:id"');
    assert.ok(at > 0, "the delete route disappeared");
    const route = CLEAN.slice(at, at + 2500);
    assert.match(route, /purgeHeartbeatState\(phoneNumber\)/,
      "a deleted driver keeps their cached name until the TTL expires");
  });
});

describe("H-39 · purging matches every phone format", () => {
  // The delete path knows the driver by the phone in their Firestore document
  // ("009647..."); the heartbeat keys its maps by the phone inside the driver's
  // token ("0770..."). An exact-string delete silently misses — which is exactly
  // what the live harness caught. Run the REAL function here.
  // purgeHeartbeatState is built on the shared phone comparison, so lift that too —
  // testing the purge against a hand-written copy of the matcher would prove nothing
  // about the matcher the server actually uses.
  const lift = (decl) => {
    const at = CLEAN.indexOf(decl);
    assert.ok(at > 0, `${decl} not found — the phone matching was renamed`);
    const arrow = CLEAN.indexOf("=>", at);
    assert.ok(arrow > 0, `${decl} is no longer an arrow function`);
    let i = arrow + 2;
    while (/\s/.test(CLEAN[i])) i += 1;
    if (CLEAN[i] !== "{") {
      // One-line arrow: runs to the semicolon that ends the statement.
      const end = CLEAN.indexOf(";", i);
      return CLEAN.slice(at, end + 1);
    }
    let depth = 0;
    for (let j = i; j < CLEAN.length; j += 1) {
      if (CLEAN[j] === "{") depth += 1;
      else if (CLEAN[j] === "}") {
        depth -= 1;
        if (depth === 0) return `${CLEAN.slice(at, j + 1)};`;
      }
    }
    throw new Error(`unbalanced ${decl}`);
  };
  const body = [
    lift("const phoneTail ="),
    lift("const samePhone ="),
    lift("const purgeHeartbeatState ="),
  ].join("\n");

  // Strip the TypeScript through the real compiler rather than by hand, so the
  // functions under test stay byte-identical to the shipped ones apart from types.
  const js = ts.transpileModule(
    `${body}\nexport { purgeHeartbeatState, samePhone };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText;

  /** Execute the shipped purge against three maps we control. */
  function runPurge(keys, deletedPhone) {
    const driverNameCache = new Map(keys.map((k) => [k, { fullName: "x", at: 0 }]));
    const locationRateLimit = new Map(keys.map((k) => [k, 0]));
    const locationFirestoreThrottle = new Map(keys.map((k) => [k, 0]));
    const exports = {};
    // eslint-disable-next-line no-new-func
    new Function(
      "exports", "driverNameCache", "locationRateLimit", "locationFirestoreThrottle", js,
    )(exports, driverNameCache, locationRateLimit, locationFirestoreThrottle);
    exports.purgeHeartbeatState(deletedPhone);
    return { driverNameCache, locationRateLimit, locationFirestoreThrottle };
  }

  const VARIANTS = ["07701234567", "009647701234567", "9647701234567", "7701234567"];

  test("the stored 00964 format purges the token's 07 key", () => {
    const out = runPurge(["07701234567"], "009647701234567");
    assert.equal(out.driverNameCache.size, 0,
      "the cached name survived — this is the bug the live harness caught");
    assert.equal(out.locationRateLimit.size, 0);
    assert.equal(out.locationFirestoreThrottle.size, 0);
  });

  test("every Iraqi variant purges every other variant", () => {
    for (const deleted of VARIANTS) {
      const out = runPurge(VARIANTS, deleted);
      assert.equal(out.driverNameCache.size, 0,
        `deleting as ${deleted} left ${[...out.driverNameCache.keys()]}`);
    }
  });

  test("a different driver is left alone", () => {
    const out = runPurge(["07701234567", "07709999999"], "009647701234567");
    assert.deepEqual([...out.driverNameCache.keys()], ["07709999999"],
      "the purge removed an unrelated driver");
  });

  test("a blank phone purges nothing", () => {
    const out = runPurge(["07701234567"], "");
    assert.equal(out.driverNameCache.size, 1,
      "an empty phone wiped the whole cache");
  });
});

describe("H-39 · the HTTP fallback pays the same costs once", () => {
  const at = CLEAN.indexOf('app.post("/api/driver/location"');
  const route = CLEAN.slice(at, at + 1800);

  test("the route exists and is under the driver-auth mount", () => {
    assert.ok(at > 0, "the fallback route disappeared");
    assert.match(CLEAN, /app\.use\("\/api\/driver", requireDriverAuth\)/,
      "the fallback is no longer authenticated, so req.driver would be absent");
  });

  test("it reuses the driver requireDriverAuth already loaded", () => {
    assert.doesNotMatch(route, /getDriverByPhone\(/,
      "the same driver is read twice per fallback heartbeat");
    assert.match(route, /\(req as any\)\.driver/,
      "the driver loaded by the auth middleware is not reused");
  });

  test("requireDriverAuth really does attach it", () => {
    const guard = CLEAN.slice(CLEAN.indexOf("async function requireDriverAuth"));
    assert.match(guard.slice(0, 2000), /\(req as any\)\.driver = driver;/,
      "req.driver is not set, so the fallback would lose the name");
  });

  test("its Firestore write is throttled like the socket path", () => {
    assert.match(route, /locationFirestoreThrottle\.get\(phoneNumber\)/,
      "the fallback still writes to Firestore on every request");
    assert.match(route, /FIRESTORE_WRITE_INTERVAL/);
  });

  test("both transports share one throttle", () => {
    // Two maps would let a client alternating transports write twice as often.
    assert.equal((CLEAN.match(/const locationFirestoreThrottle = new Map/g) ?? []).length, 1,
      "there is more than one write throttle");
  });
});

describe("H-39 · deleting a driver evicts them from EVERY live map", () => {
  // The live harness caught this: the admin delete path knows the driver by the
  // phone in their Firestore document ("009647…"), while driverQueue,
  // driverLocations and driverAssignments are keyed by the phone in the driver's
  // token ("0770…"). Exact-string deletes missed all three, so a deleted driver
  // kept receiving batch offers, kept showing on the admin's live map, and kept
  // resolving a customer's tracking request.
  const deleteRoute = (() => {
    const at = CLEAN.indexOf('app.delete("/api/admin/drivers/:id"');
    assert.ok(at > 0, "the delete route disappeared");
    // Bound to THIS handler: a fixed-size window spills into neighbouring routes
    // that legitimately compare phone numbers by string.
    const next = CLEAN.indexOf("\n  app.", at + 10);
    return CLEAN.slice(at, next === -1 ? at + 3000 : next);
  })();

  for (const [what, marker] of [
    ["driverQueue", /samePhone\(driverQueue\[i\]\.phoneNumber, phoneNumber\)/],
    ["driverLocations", /samePhone\(key, phoneNumber\)\) driverLocations\.delete\(key\)/],
    ["driverAssignments", /samePhone\(drv, phoneNumber\)\) driverAssignments\.delete\(oid\)/],
    ["the heartbeat maps", /purgeHeartbeatState\(phoneNumber\)/],
  ]) {
    test(`${what} is purged by phone identity, not by string`, () => {
      assert.match(deleteRoute, marker,
        `${what} is evicted with an exact-string match again — a deleted driver ` +
        "whose stored number is in a different format would survive there");
    });
  }

  test("no exact-string eviction is left in the delete path", () => {
    assert.doesNotMatch(deleteRoute, /d\.phoneNumber === phoneNumber/,
      "driverQueue is filtered by string equality again");
    assert.doesNotMatch(deleteRoute, /driverLocations\.delete\(phoneNumber\)/,
      "driverLocations is deleted by string again");
    assert.doesNotMatch(deleteRoute, /drv === phoneNumber/,
      "driverAssignments is compared by string again");
  });

  test("the queue eviction iterates backwards, so it cannot skip an entry", () => {
    // Splicing forwards while iterating forwards skips the element after each
    // removal — a driver listed twice would leave one copy behind.
    assert.match(deleteRoute, /for \(let i = driverQueue\.length - 1; i >= 0; i -= 1\)/,
      "the queue eviction can skip entries when a driver appears more than once");
  });
});

describe("H-39 · samePhone, executed", () => {
  const { samePhone } = (() => {
    const lift = (decl) => {
      const at = CLEAN.indexOf(decl);
      const arrow = CLEAN.indexOf("=>", at);
      let i = arrow + 2;
      while (/\s/.test(CLEAN[i])) i += 1;
      if (CLEAN[i] !== "{") return CLEAN.slice(at, CLEAN.indexOf(";", i) + 1);
      let d = 0;
      for (let j = i; j < CLEAN.length; j += 1) {
        if (CLEAN[j] === "{") d += 1;
        else if (CLEAN[j] === "}") { d -= 1; if (!d) return `${CLEAN.slice(at, j + 1)};`; }
      }
      throw new Error("unbalanced");
    };
    const js = ts.transpileModule(
      `${lift("const phoneTail =")}\n${lift("const samePhone =")}\nexport { samePhone };`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
    ).outputText;
    const exports = {};
    // eslint-disable-next-line no-new-func
    new Function("exports", js)(exports);
    return exports;
  })();

  const VARIANTS = ["07701234567", "009647701234567", "9647701234567", "7701234567"];

  test("every Iraqi format matches every other", () => {
    for (const a of VARIANTS) {
      for (const b of VARIANTS) {
        assert.equal(samePhone(a, b), true, `${a} should match ${b}`);
      }
    }
  });

  test("a different driver never matches", () => {
    for (const a of VARIANTS) {
      assert.equal(samePhone(a, "07709999999"), false, `${a} matched another driver`);
    }
  });

  test("blank, short and junk values never match anything", () => {
    for (const bad of ["", null, undefined, "  ", "123", "abc", 0, {}]) {
      assert.equal(samePhone(bad, "07701234567"), false, `${JSON.stringify(bad)} matched`);
      assert.equal(samePhone("07701234567", bad), false, `${JSON.stringify(bad)} matched`);
      assert.equal(samePhone(bad, bad), false, `${JSON.stringify(bad)} matched itself`);
    }
  });

  test("formatting noise does not defeat it", () => {
    assert.equal(samePhone("+964 770 123 4567", "07701234567"), true);
    assert.equal(samePhone("0770-123-4567", "7701234567"), true);
  });
});
