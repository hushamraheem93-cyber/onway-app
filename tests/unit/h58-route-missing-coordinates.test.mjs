/**
 * H-58 — a missing map pin must never become the coordinate (0,0).
 *
 * DriverOrdersScreen's nearest-neighbour optimiser read every coordinate as
 * `order.latitude ?? 0`. `??` only guards null and undefined, so an order without a
 * pin was routed as if it sat at (0,0) — measured below at 5,928 km from the
 * hardcoded Baghdad start — and once such an order was visited the running position
 * itself became (0,0), so every later leg was measured from the Gulf of Guinea.
 * `??` also passes NaN straight through, and a NaN first element makes every
 * `d < shortest` comparison false, which pins the optimiser to input order.
 *
 * Nothing here matches text. Every assertion runs the SHIPPED calcDist,
 * optimizeRoute and hasPin, lifted out of client/screens/DriverOrdersScreen.tsx and
 * executed — including a brute-force sweep over randomised Iraqi batches.
 *
 * The order shapes used are exactly what /api/driver/status delivers: that endpoint
 * sends `order.latitude || null` (routes.ts:4332), so a missing field, an explicit
 * null and a stored 0 all arrive as null.
 *
 * Run:  node --test tests/unit/h58-route-missing-coordinates.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const SCREEN = read("client/screens/DriverOrdersScreen.tsx");
const ROUTES = read("server/routes.ts");

// ── lifting ─────────────────────────────────────────────────────────────────

function blockEnd(src, from) {
  const start = src.indexOf("{", from);
  if (start === -1) throw new Error("no block");
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("unbalanced block");
}

/**
 * The `{` that opens a body rather than a type annotation. `hasPin` is declared
 * `order is BatchOrder & { latitude: number; longitude: number }`, whose braces sit
 * inline; a body brace is always last on its line under this repo's formatting.
 */
function bodyBrace(src, from) {
  for (let i = src.indexOf("{", from); i !== -1; i = src.indexOf("{", i + 1)) {
    if (/^[^\S\n]*\n/.test(src.slice(i + 1))) return i;
  }
  throw new Error("no body brace");
}

function lift(marker) {
  const at = SCREEN.indexOf(marker);
  assert.notEqual(at, -1, `source moved: ${marker}`);
  return SCREEN.slice(at, blockEnd(SCREEN, bodyBrace(SCREEN, at)));
}

/**
 * Like lift, but yields "" when the declaration is absent.
 *
 * hasPin does not exist before the fix. Throwing here would fail the whole file at
 * import time for the wrong reason; returning "" lets every optimizeRoute test run
 * against the old code and fail on its own merits instead.
 */
function liftOptional(marker) {
  return SCREEN.includes(marker) ? lift(marker) : "";
}

const SRC_CALC = lift("function calcDist");
const SRC_OPT = lift("function optimizeRoute");
const SRC_HAS_PIN = liftOptional("function hasPin");

const js = ts
  .transpileModule([SRC_CALC, SRC_HAS_PIN, SRC_OPT].join("\n\n"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "");

const { calcDist, optimizeRoute, hasPin } = new Function(
  `${js}
   return {
     calcDist,
     optimizeRoute,
     hasPin: typeof hasPin === "function" ? hasPin : undefined,
   };`,
)();

/** Fails with a readable message when the guard has not been introduced yet. */
function pin(order) {
  assert.ok(hasPin, "DriverOrdersScreen has no hasPin coordinate guard");
  return hasPin(order);
}

// ── fixtures ────────────────────────────────────────────────────────────────

/** The hardcoded start point at DriverOrdersScreen.tsx:335. */
const START = [33.3152, 44.3661];
const route = (orders) => optimizeRoute(orders, START[0], START[1]);
const ids = (rs) => rs.map((o) => o.id).join(" → ");

// Real pins, increasing distance from the start.
const NEAR = { id: "near", latitude: 33.4, longitude: 44.4 };
const MID = { id: "mid", latitude: 33.6, longitude: 44.5 };
const FAR = { id: "far", latitude: 34.0, longitude: 44.7 };

/** Every shape a pin-less order can actually take on this payload. */
const MISSING_SHAPES = [
  ["explicit null", { latitude: null, longitude: null }],
  ["undefined", { latitude: undefined, longitude: undefined }],
  ["field absent", {}],
];

// ════════════════════════════════════════════════════════════════════════════
describe("H-58 · the phantom coordinate", () => {
  test("(0,0) really is thousands of km from the start point", () => {
    const d = calcDist(START[0], START[1], 0, 0);
    assert.ok(d > 5000, `expected a huge phantom distance, got ${d}`);
    // The report says ~4900 km; the real figure from the shipped calcDist is 5928.
    assert.equal(Math.round(d), 5928);
  });

  test("it is farther than any point inside Iraq — which is why it sorted last", () => {
    // Iraq's bounding box, roughly.
    const corners = [
      [29.0, 38.8],
      [29.0, 48.6],
      [37.4, 38.8],
      [37.4, 48.6],
    ];
    for (const [lat, lng] of corners) {
      const real = calcDist(START[0], START[1], lat, lng);
      assert.ok(
        real < calcDist(START[0], START[1], 0, 0),
        `a real Iraqi corner (${lat},${lng}) should be nearer than (0,0)`,
      );
    }
  });
});

describe("H-58 · what counts as a usable pin", () => {
  test("real coordinates are accepted", () => {
    assert.equal(pin(NEAR), true);
    assert.equal(pin({ latitude: 0, longitude: 0 }), true);
    assert.equal(pin({ latitude: -33.9, longitude: -70.6 }), true);
  });

  test("null, undefined and absent fields are not pins", () => {
    for (const [label, shape] of MISSING_SHAPES) {
      assert.equal(pin(shape), false, `${label} should not be a pin`);
    }
  });

  test("NaN and Infinity are not pins — `??` used to let both through", () => {
    assert.equal(pin({ latitude: NaN, longitude: NaN }), false);
    assert.equal(pin({ latitude: Infinity, longitude: 44 }), false);
    assert.equal(pin({ latitude: 33.4, longitude: -Infinity }), false);
  });

  test("out-of-range values are not pins", () => {
    assert.equal(pin({ latitude: 91, longitude: 44 }), false);
    assert.equal(pin({ latitude: -91, longitude: 44 }), false);
    assert.equal(pin({ latitude: 33, longitude: 181 }), false);
    assert.equal(pin({ latitude: 33, longitude: -181 }), false);
  });

  test("a half-missing pin is not a pin", () => {
    // `order.latitude || null` is applied to each axis independently, so one axis
    // can survive while the other is nulled. Treating that as (lat, 0) would place
    // the order ~4,088 km away in the Atlantic.
    assert.equal(pin({ latitude: 33.4, longitude: null }), false);
    assert.equal(pin({ latitude: null, longitude: 44.4 }), false);
  });

  test("a string coordinate is not silently coerced", () => {
    assert.equal(pin({ latitude: "33.4", longitude: "44.4" }), false);
  });

  test("the validity rule matches the one the server already uses", () => {
    // server/vendor.ts:371 — the app's existing contract, not a new invention.
    const server = stripComments(read("server/vendor.ts"));
    assert.match(
      server,
      /lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180/,
      "the server's coordinate range check moved",
    );
    assert.match(stripComments(SRC_HAS_PIN), /lat >= -90/);
    assert.match(stripComments(SRC_HAS_PIN), /Number\.isFinite/);
  });
});

describe("H-58 · orders with real coordinates route normally", () => {
  test("nearest-neighbour order is produced from the start point", () => {
    assert.equal(ids(route([FAR, NEAR, MID])), "near → mid → far");
  });

  test("deliverySequence is renumbered 1..N", () => {
    const out = route([FAR, NEAR, MID]);
    assert.deepEqual(
      out.map((o) => o.deliverySequence),
      [1, 2, 3],
    );
  });

  test("a single order is returned untouched", () => {
    const one = [{ id: "solo", latitude: null, longitude: null }];
    assert.equal(
      route(one),
      one,
      "the length<=1 short-circuit must be preserved",
    );
  });

  test("no order is lost or duplicated", () => {
    const input = [FAR, { id: "ghost" }, NEAR, MID];
    const out = route(input);
    assert.equal(out.length, input.length);
    assert.deepEqual(
      out.map((o) => o.id).sort(),
      input.map((o) => o.id).sort(),
    );
  });
});

describe("H-58 · a missing pin never becomes (0,0)", () => {
  for (const [label, shape] of MISSING_SHAPES) {
    test(`${label}: the order is kept but never given coordinates`, () => {
      const ghost = { id: "ghost", ...shape };
      const out = route([NEAR, ghost, FAR]);
      const kept = out.find((o) => o.id === "ghost");

      assert.ok(kept, "the pin-less order must stay in the batch");
      assert.notEqual(kept.latitude, 0, "latitude was defaulted to 0");
      assert.notEqual(kept.longitude, 0, "longitude was defaulted to 0");
      // Whatever it arrived as, it leaves as — no fabricated location.
      assert.equal(kept.latitude, shape.latitude);
      assert.equal(kept.longitude, shape.longitude);
    });
  }

  test("calcDist is never called with a fabricated (0,0)", () => {
    // Re-run the optimiser with an instrumented calcDist and record every call.
    const calls = [];
    const spied = new Function(
      "record",
      `${js}
       const __orig = calcDist;
       calcDist = function (a, b, c, d) { record([a, b, c, d]); return __orig(a, b, c, d); };
       return { optimizeRoute };`,
    )((args) => calls.push(args));

    spied.optimizeRoute(
      [NEAR, { id: "g1", latitude: null, longitude: null }, FAR, { id: "g2" }],
      START[0],
      START[1],
    );

    assert.ok(
      calls.length > 0,
      "the optimiser should still measure real orders",
    );
    for (const [aLat, aLng, bLat, bLng] of calls) {
      assert.ok(
        !(bLat === 0 && bLng === 0),
        `calcDist was asked to measure to (0,0): ${JSON.stringify([aLat, aLng, bLat, bLng])}`,
      );
      assert.ok(
        !(aLat === 0 && aLng === 0),
        `calcDist was measured FROM (0,0): ${JSON.stringify([aLat, aLng, bLat, bLng])}`,
      );
      for (const v of [aLat, aLng, bLat, bLng]) {
        assert.ok(
          Number.isFinite(v),
          `calcDist received a non-finite value: ${v}`,
        );
      }
    }
  });

  test("no `?? 0` coordinate fallback remains in the optimiser", () => {
    const code = stripComments(SRC_OPT);
    assert.ok(
      !/latitude \?\? 0/.test(code),
      "the latitude fallback to 0 is still there",
    );
    assert.ok(
      !/longitude \?\? 0/.test(code),
      "the longitude fallback to 0 is still there",
    );
  });
});

describe("H-58 · a pin-less order does not disturb the others", () => {
  test("the routed orders come out identically with and without ghosts", () => {
    const real = [FAR, NEAR, MID];
    const withGhosts = route([
      FAR,
      { id: "g1", latitude: null, longitude: null },
      NEAR,
      { id: "g2" },
      MID,
      { id: "g3", latitude: undefined, longitude: undefined },
    ]);
    const realSubsequence = withGhosts
      .filter((o) => !o.id.startsWith("g"))
      .map((o) => o.id)
      .join(" → ");

    assert.equal(realSubsequence, ids(route(real)));
    assert.equal(realSubsequence, "near → mid → far");
  });

  /** Deterministic PRNG so any failure is reproducible. */
  function makeRandom(seed) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }

  /**
   * Route `runs` random Iraqi batches salted with pin-less orders of the given
   * shapes, and assert the real orders' sequence is what it would be if those
   * orders were not in the batch at all.
   */
  function sweep(shapes, runs, seed) {
    const rnd = makeRandom(seed);
    const between = (lo, hi) => lo + rnd() * (hi - lo);
    let diverged = 0;

    for (let t = 0; t < runs; t++) {
      const n = 2 + Math.floor(rnd() * 5);
      const real = Array.from({ length: n }, (_, i) => ({
        id: `R${i}`,
        latitude: between(29.0, 37.4),
        longitude: between(38.8, 48.6),
      }));
      const ghosts = Array.from(
        { length: 1 + Math.floor(rnd() * 3) },
        (_, i) => ({
          id: `G${i}`,
          ...shapes[Math.floor(rnd() * shapes.length)],
        }),
      );
      const mixed = [...real, ...ghosts].sort(() => rnd() - 0.5);

      const withGhosts = route(mixed)
        .filter((o) => o.id.startsWith("R"))
        .map((o) => o.id)
        .join(",");
      const withoutGhosts = route(real)
        .map((o) => o.id)
        .join(",");
      if (withGhosts !== withoutGhosts) diverged++;
    }
    return diverged;
  }

  /** The shapes /api/driver/status can actually deliver today. */
  const REACHABLE_SHAPES = [
    { latitude: null, longitude: null },
    {},
    { latitude: undefined, longitude: undefined },
    { latitude: 33.4, longitude: null },
  ];

  /** Plus the shapes `?? 0` also failed to guard, reachable or not. */
  const ALL_SHAPES = [...REACHABLE_SHAPES, { latitude: NaN, longitude: NaN }];

  test("brute force, production-reachable shapes: 5000 batches, zero divergence", () => {
    // This one passed BEFORE the fix too, and that is the honest finding: (0,0) is
    // 5,928 km away, farther than anywhere in Iraq, so a pin-less order was always
    // picked last and the poisoned running position only ever affected other
    // pin-less orders. The audit's "later distances become wrong" consequence was
    // therefore not reachable with real data — it was correct by accident, resting
    // on an invariant nothing in the code enforces. Now it holds by construction.
    assert.equal(sweep(REACHABLE_SHAPES, 5000, 20250815), 0);
  });

  test("brute force, including NaN: 5000 batches, zero divergence", () => {
    // This one FAILED before the fix. `??` passes NaN through, and a NaN first
    // element makes every `d < shortest` false, so it is picked first and the
    // optimiser degenerates to input order from there on.
    assert.equal(sweep(ALL_SHAPES, 5000, 776), 0);
  });

  test("pin-less orders keep their original relative order", () => {
    const out = route([
      { id: "g1", latitude: null, longitude: null },
      FAR,
      { id: "g2" },
      NEAR,
      { id: "g3", latitude: NaN, longitude: NaN },
    ]);
    const ghostOrder = out.filter((o) => o.id.startsWith("g")).map((o) => o.id);
    assert.deepEqual(ghostOrder, ["g1", "g2", "g3"]);
  });

  test("a batch of only pin-less orders is returned intact and in order", () => {
    const input = [
      { id: "g1", latitude: null, longitude: null },
      { id: "g2" },
      { id: "g3", latitude: undefined, longitude: undefined },
    ];
    const out = route(input);
    assert.deepEqual(
      out.map((o) => o.id),
      ["g1", "g2", "g3"],
    );
    assert.deepEqual(
      out.map((o) => o.deliverySequence),
      [1, 2, 3],
    );
  });
});

describe("H-58 · NaN no longer collapses the optimiser", () => {
  test("a NaN order placed first does not get routed first", () => {
    // Before the fix `shortest` started as NaN, every `d < NaN` was false, so index
    // 0 was chosen and the running position became NaN — after which every
    // comparison was false and the result was simply the input order.
    const out = route([
      { id: "nan", latitude: NaN, longitude: NaN },
      FAR,
      NEAR,
    ]);
    assert.notEqual(out[0].id, "nan");
    assert.equal(ids(out), "near → far → nan");
  });

  test("the real orders are still optimised around it", () => {
    const out = route([
      { id: "nan", latitude: NaN, longitude: NaN },
      FAR,
      MID,
      NEAR,
    ]);
    assert.equal(
      out
        .filter((o) => o.id !== "nan")
        .map((o) => o.id)
        .join(" → "),
      "near → mid → far",
    );
  });
});

describe("H-58 · the app's contract for a literal 0", () => {
  test("/api/driver/status collapses a stored 0 to null before the app sees it", () => {
    const src = stripComments(ROUTES);
    assert.match(
      src,
      /latitude:\s*\(order as any\)\.latitude \|\| null/,
      "the driver payload's latitude mapping moved",
    );
    assert.match(src, /longitude:\s*\(order as any\)\.longitude \|\| null/);
  });

  test("orders are stored without coordinates when the customer set no pin", () => {
    // H-67 replaced the raw `latitude !== undefined` guard with one over the
    // PARSED pair, because a supplied-but-unusable coordinate now fails the request
    // instead of being stored. The property this test exists for is unchanged: no
    // pin ⇒ no latitude/longitude keys on the order, and the two are written
    // together or not at all.
    const code = stripComments(ROUTES);
    assert.match(
      code,
      /if \(parsedLatitude !== null && parsedLongitude !== null\) \{/,
      "order creation's coordinate guard moved",
    );
    assert.match(code, /orderData\.latitude = parsedLatitude;/);
    assert.match(code, /orderData\.longitude = parsedLongitude;/);
    // And an absent pin must still not be an error — most orders have no pin.
    // The absent-vs-invalid distinction now lives in validateOrderFields, which
    // the route calls once for all five H-67 fields.
    assert.match(
      code,
      /const fields = validateOrderFields\(\{ address, notes, orderType, latitude, longitude \}\);/,
      "the order route no longer runs the shared field validator",
    );
    const validator = stripComments(read("server/orderValidation.ts"));
    assert.match(
      validator,
      /const latProvided = isProvided\(input\.latitude\);/,
      "the absent-vs-invalid distinction is gone; a missing pin would now 400",
    );
  });

  test("0 is nevertheless a valid pin to hasPin — it is not treated as missing", () => {
    // The screen must not invent a rule the code does not support: 0 is a real
    // coordinate, and hasPin says so. It simply cannot arrive on this payload.
    assert.equal(pin({ latitude: 0, longitude: 0 }), true);
    const out = route([
      FAR,
      { id: "equator", latitude: 0, longitude: 0 },
      NEAR,
    ]);
    const equator = out.find((o) => o.id === "equator");
    assert.equal(equator.latitude, 0);
    // It is routed (last, because it genuinely is farthest) rather than set aside.
    assert.equal(out[out.length - 1].id, "equator");
  });
});
