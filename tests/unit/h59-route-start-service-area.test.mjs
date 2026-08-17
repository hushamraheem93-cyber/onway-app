/**
 * H-59 — the route optimiser must start from the service area, not Baghdad.
 *
 * DriverOrdersScreen called `optimizeRoute(orders, 33.3152, 44.3661)` — Baghdad
 * city centre — while OnWay serves only قضاء الضلوعية, 79 km north. The first
 * leg of every optimised route was therefore measured from a city the driver is
 * never standing in, which can pick the wrong first stop whenever two orders sit on
 * opposite sides of the district.
 *
 * The project already defines the service-area centre: DHULUIYAH_CENTER in
 * client/lib/geocoding.ts, which both MapPickerScreen variants already fall back to.
 * This suite proves the screen now uses THAT constant, by reading its value out of
 * geocoding.ts and running the shipped optimiser with it — not by trusting a literal
 * copied into the test.
 *
 * geocoding.ts cannot be imported here (it pulls in @/lib/query-client → react-native,
 * which esbuild cannot transform), so the constant is lifted from the real source.
 * That is the stronger check anyway: it asserts against the shipped file.
 *
 * Run:  node --test tests/unit/h59-route-start-service-area.test.mjs
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
const GEOCODING = read("client/lib/geocoding.ts");

// ── the constant, taken from the shipped source ─────────────────────────────

/**
 * DHULUIYAH_CENTER as geocoding.ts actually declares it.
 *
 * Evaluated rather than regex-scraped for its digits, so the test uses the same
 * value the app does even if the literal is reformatted.
 */
const SERVICE_CENTER = (() => {
  const marker = "export const DHULUIYAH_CENTER";
  const at = GEOCODING.indexOf(marker);
  assert.notEqual(
    at,
    -1,
    "DHULUIYAH_CENTER is no longer declared in geocoding.ts",
  );
  const decl = GEOCODING.slice(at, GEOCODING.indexOf("\n", at) + 1);
  return new Function(
    `${decl.replace(/^export\s+/, "")}\nreturn DHULUIYAH_CENTER;`,
  )();
})();

/** The coordinates the screen used before this fix. */
const BAGHDAD = { lat: 33.3152, lng: 44.3661 };

// ── lifting the optimiser ───────────────────────────────────────────────────

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

function bodyBrace(src, from) {
  for (let i = src.indexOf("{", from); i !== -1; i = src.indexOf("{", i + 1)) {
    if (/^[^\S\n]*\n/.test(src.slice(i + 1))) return i;
  }
  throw new Error("no body brace");
}

function lift(marker, { optional = false } = {}) {
  const at = SCREEN.indexOf(marker);
  if (at === -1) {
    if (optional) return "";
    assert.fail(`source moved: ${marker}`);
  }
  return SCREEN.slice(at, blockEnd(SCREEN, bodyBrace(SCREEN, at)));
}

const js = ts
  .transpileModule(
    [
      lift("function calcDist"),
      lift("function hasPin", { optional: true }),
      lift("function optimizeRoute"),
    ].join("\n\n"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  .outputText.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "");

const { calcDist, optimizeRoute } = new Function(
  `${js}\nreturn { calcDist, optimizeRoute };`,
)();

/**
 * The start point handleOptimizeRoute actually passes, executed rather than read.
 *
 * The handler's own call expression is lifted and run with a stub optimizeRoute that
 * records its arguments, so this reports what the shipped code passes — a literal, a
 * constant, anything.
 */
function capturedStartPoint() {
  const at = SCREEN.indexOf("const handleOptimizeRoute");
  assert.notEqual(at, -1, "handleOptimizeRoute moved");
  const body = SCREEN.slice(at, blockEnd(SCREEN, bodyBrace(SCREEN, at)));

  const callAt = body.indexOf("optimizeRoute(");
  assert.notEqual(callAt, -1, "the optimizeRoute call moved");
  // Balance parentheses to capture the whole call, however it is wrapped.
  let depth = 0;
  let end = -1;
  for (let i = body.indexOf("(", callAt); i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  assert.notEqual(end, -1, "unbalanced optimizeRoute call");
  const call = body.slice(callAt, end);

  const captured = [];
  const stub = (...args) => {
    captured.push(args);
    return [];
  };
  const run = new Function(
    "optimizeRoute",
    "status",
    "DHULUIYAH_CENTER",
    `${
      ts.transpileModule(`const __r = ${call};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText
    }\nreturn __r;`,
  );
  run(stub, { currentBatch: { orders: [] } }, SERVICE_CENTER);

  assert.equal(captured.length, 1, "optimizeRoute was not called exactly once");
  const [, lat, lng] = captured[0];
  return { lat, lng };
}

// ════════════════════════════════════════════════════════════════════════════
describe("H-59 · the service-area constant already exists", () => {
  test("DHULUIYAH_CENTER is exported from client/lib/geocoding.ts", () => {
    assert.match(stripComments(GEOCODING), /export const DHULUIYAH_CENTER\s*=/);
    assert.equal(typeof SERVICE_CENTER.lat, "number");
    assert.equal(typeof SERVICE_CENTER.lng, "number");
  });

  test("it holds the Dhuluiyah coordinates the app ships", () => {
    assert.deepEqual(SERVICE_CENTER, { lat: 34.018, lng: 44.219 });
  });

  test("it is genuinely the service area, not Baghdad", () => {
    const away = calcDist(
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
      BAGHDAD.lat,
      BAGHDAD.lng,
    );
    assert.ok(away > 70, `expected Dhuluiyah far from Baghdad, got ${away} km`);
    assert.equal(away.toFixed(1), "79.3");
  });

  test("other screens already fall back to this same constant", () => {
    // Evidence that this is the project's established centre, not a new invention.
    for (const f of [
      "client/screens/MapPickerScreen.tsx",
      "client/screens/MapPickerScreen.web.tsx",
    ]) {
      assert.match(
        stripComments(read(f)),
        /DHULUIYAH_CENTER/,
        `${f} should already use the shared centre`,
      );
    }
  });
});

describe("H-59 · the optimiser is started from the service area", () => {
  test("the screen imports the shared constant", () => {
    assert.match(
      stripComments(SCREEN),
      /import \{ DHULUIYAH_CENTER \} from "@\/lib\/geocoding"/,
      "DriverOrdersScreen does not import the service-area centre",
    );
  });

  test("the captured start point IS DHULUIYAH_CENTER", () => {
    const start = capturedStartPoint();
    assert.deepEqual(start, {
      lat: SERVICE_CENTER.lat,
      lng: SERVICE_CENTER.lng,
    });
  });

  test("the captured start point is NOT Baghdad", () => {
    const start = capturedStartPoint();
    assert.notEqual(
      start.lat,
      BAGHDAD.lat,
      "still starting from Baghdad latitude",
    );
    assert.notEqual(
      start.lng,
      BAGHDAD.lng,
      "still starting from Baghdad longitude",
    );
  });

  test("no hardcoded Baghdad coordinates remain in the screen", () => {
    const code = stripComments(SCREEN);
    assert.ok(
      !code.includes("33.3152"),
      "the Baghdad latitude literal is still there",
    );
    assert.ok(
      !code.includes("44.3661"),
      "the Baghdad longitude literal is still there",
    );
  });

  test("the start point is not a fresh literal invented at the call site", () => {
    const at = SCREEN.indexOf("const handleOptimizeRoute");
    const body = stripComments(
      SCREEN.slice(at, blockEnd(SCREEN, bodyBrace(SCREEN, at))),
    );
    assert.ok(
      !/optimizeRoute\([^)]*\d+\.\d+/s.test(body),
      "coordinates are still passed as numeric literals rather than the constant",
    );
  });
});

describe("H-59 · starting from the right place changes the answer", () => {
  // Two orders on opposite sides of the district: one just north of the centre,
  // one south toward Baghdad. From Baghdad the southern one looks nearest; from
  // the service-area centre the northern one is.
  const NORTH = { id: "north", latitude: 34.12, longitude: 44.22 };
  const SOUTH = { id: "south", latitude: 33.75, longitude: 44.3 };

  test("from Baghdad the optimiser picks the southern order first", () => {
    const out = optimizeRoute([NORTH, SOUTH], BAGHDAD.lat, BAGHDAD.lng);
    assert.equal(out[0].id, "south");
  });

  test("from the service-area centre it picks the northern order first", () => {
    const out = optimizeRoute(
      [NORTH, SOUTH],
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
    );
    assert.equal(out[0].id, "north");
  });

  test("so the fix is observable, not cosmetic", () => {
    const fromBaghdad = optimizeRoute([NORTH, SOUTH], BAGHDAD.lat, BAGHDAD.lng)
      .map((o) => o.id)
      .join(",");
    const fromService = optimizeRoute(
      [NORTH, SOUTH],
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
    )
      .map((o) => o.id)
      .join(",");
    assert.notEqual(fromBaghdad, fromService);
  });
});

describe("H-59 · the ordering algorithm itself is unchanged", () => {
  // Requirement 6: only the source of the start point may change.
  const A = { id: "a", latitude: 34.03, longitude: 44.23 };
  const B = { id: "b", latitude: 34.06, longitude: 44.26 };
  const C = { id: "c", latitude: 34.1, longitude: 44.3 };

  test("nearest-neighbour still produces the nearest-first order", () => {
    const out = optimizeRoute(
      [C, A, B],
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
    );
    assert.deepEqual(
      out.map((o) => o.id),
      ["a", "b", "c"],
    );
  });

  test("deliverySequence is still renumbered 1..N", () => {
    const out = optimizeRoute(
      [C, A, B],
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
    );
    assert.deepEqual(
      out.map((o) => o.deliverySequence),
      [1, 2, 3],
    );
  });

  test("the length<=1 short-circuit still returns the input untouched", () => {
    const one = [A];
    assert.equal(
      optimizeRoute(one, SERVICE_CENTER.lat, SERVICE_CENTER.lng),
      one,
    );
  });
});

describe("H-59 · H-58 is still closed", () => {
  const REAL = { id: "real", latitude: 34.03, longitude: 44.23 };
  const GHOSTS = [
    ["explicit null", { latitude: null, longitude: null }],
    ["undefined", { latitude: undefined, longitude: undefined }],
    ["field absent", {}],
    ["NaN", { latitude: NaN, longitude: NaN }],
  ];

  for (const [label, shape] of GHOSTS) {
    test(`${label}: still kept, still never given (0,0)`, () => {
      const ghost = { id: "ghost", ...shape };
      const out = optimizeRoute(
        [REAL, ghost],
        SERVICE_CENTER.lat,
        SERVICE_CENTER.lng,
      );
      const kept = out.find((o) => o.id === "ghost");
      assert.ok(kept, "the pin-less order was dropped");
      assert.notEqual(kept.latitude, 0);
      assert.notEqual(kept.longitude, 0);
    });
  }

  test("calcDist is still never called with (0,0) from the new start point", () => {
    const calls = [];
    const spied = new Function(
      "record",
      `${js}
       const __orig = calcDist;
       calcDist = function (a, b, c, d) { record([a, b, c, d]); return __orig(a, b, c, d); };
       return { optimizeRoute };`,
    )((args) => calls.push(args));

    spied.optimizeRoute(
      [REAL, { id: "g", latitude: null, longitude: null }, { id: "h" }],
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
    );

    for (const [aLat, aLng, bLat, bLng] of calls) {
      assert.ok(!(bLat === 0 && bLng === 0), "measured TO (0,0)");
      assert.ok(!(aLat === 0 && aLng === 0), "measured FROM (0,0)");
      for (const v of [aLat, aLng, bLat, bLng]) {
        assert.ok(
          Number.isFinite(v),
          `non-finite coordinate reached calcDist: ${v}`,
        );
      }
    }
  });

  test("the first leg is now measured from the service-area centre", () => {
    const calls = [];
    const spied = new Function(
      "record",
      `${js}
       const __orig = calcDist;
       calcDist = function (a, b, c, d) { record([a, b, c, d]); return __orig(a, b, c, d); };
       return { optimizeRoute };`,
    )((args) => calls.push(args));

    spied.optimizeRoute([REAL], SERVICE_CENTER.lat, SERVICE_CENTER.lng);
    // length<=1 short-circuits, so use two orders to force a measurement.
    calls.length = 0;
    spied.optimizeRoute(
      [REAL, { id: "b", latitude: 34.06, longitude: 44.26 }],
      SERVICE_CENTER.lat,
      SERVICE_CENTER.lng,
    );

    assert.ok(calls.length > 0, "no distance was measured");
    const [aLat, aLng] = calls[0];
    assert.equal(aLat, SERVICE_CENTER.lat);
    assert.equal(aLng, SERVICE_CENTER.lng);
    assert.notEqual(aLat, BAGHDAD.lat);
  });
});
