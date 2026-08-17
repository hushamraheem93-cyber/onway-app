/**
 * H-67 — order fields stored without validation.
 *
 * Original finding (audit report, HIGH section):
 *   "حقول الطلب بلا تحقق: العنوان والملاحظات والإحداثيات ونوع الطلب — إحداثية
 *    نصية تُنتج مسافات NaN تُحفظ على الطلب كقيم معتمدة" — routes.ts
 *   "…بلا Number.isFinite وبلا حصر مدى — بينما مسار تحديث المتجر في نفس الملف
 *    يستخدم clampCoord. الدالة موجودة وغير مستخدمة هنا."
 *
 * Verified in the code before changing anything, and the mechanism turned out to
 * be slightly different from the report's wording — recorded here rather than
 * repeated uncritically:
 *
 *   CONFIRMED  `address`, `notes`, `orderType`, `latitude`, `longitude` were
 *              written onto the order document straight from the request body.
 *   CONFIRMED  a private `clampCoord` existed in the admin vendor UPDATE route and
 *              was not used by the order route. (A second private copy, `parseCoord`,
 *              existed in the vendor CREATE route — the same logic a third time.)
 *   REFINED    a STRING coordinate does not itself produce a NaN distance: both
 *              haversine call sites gate on `typeof … === "number"`, so "abc" is
 *              skipped. It is still stored and shown as the customer's location.
 *              The NaN comes from a value that IS a number and is not a place:
 *              JSON.parse turns `1e309` into `Infinity`, which passes that gate and
 *              collapses the haversine to NaN — which then makes
 *              `cands.sort((a, b) => a.dist - b.dist)` an undefined ordering, so the
 *              "nearest" driver chosen for a batch top-up is arbitrary.
 *              A finite out-of-range value like 999 is quieter and also wrong: it
 *              yields a confident 14,239 km.
 *
 * These tests run the real shipped helpers — lifted out of server/orderValidation.ts
 * and transpiled, never reimplemented — and reproduce the haversine from routes.ts
 * to show the NaN it used to produce and that the accepted values cannot.
 *
 * Run:  node --test tests/unit/h67-order-field-validation.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = read("server/routes.ts");
const CODE = stripComments(ROUTES);
const VALIDATION_SRC = read("server/orderValidation.ts");

const V = await (async () => {
  const js = ts.transpileModule(VALIDATION_SRC, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
})();

/**
 * The haversine exactly as routes.ts defines it, so "this input produced NaN" is a
 * statement about the shipped distance function and not about a stand-in.
 */
const calculateDistance = (() => {
  const body = ROUTES.slice(ROUTES.indexOf("function calculateDistance("));
  const end = body.indexOf("\n  }");
  const src = body.slice(0, end + 4);
  const toRad = ROUTES.slice(ROUTES.indexOf("function toRad("));
  const toRadSrc = toRad.slice(0, toRad.indexOf("\n  }") + 4);
  const js = ts.transpileModule(
    `${toRadSrc}\n${src}\nexport { calculateDistance };`,
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return js;
})();
const { calculateDistance: haversine } = await import(
  `data:text/javascript;base64,${Buffer.from(calculateDistance).toString("base64")}`
);

// A real point in the deployment area, used as the "other end" of every distance.
const HOME = [34.19, 43.87];

// ─────────────────────────────────────────────────────────────────────────────
describe("H-67 · the defect, reproduced against the shipped haversine", () => {
  test("JSON.parse really does hand the route an Infinity that types as a number", () => {
    const body = JSON.parse('{"latitude":1e309,"longitude":-1e309}');
    assert.equal(body.latitude, Infinity);
    assert.equal(typeof body.latitude, "number",
      "if this ever stops being a number the typeof gates would have caught it");
  });

  test("that value collapses the real distance function to NaN", () => {
    assert.ok(Number.isNaN(haversine(...HOME, Infinity, -Infinity)),
      "the haversine no longer produces NaN — re-derive what H-67 was about");
  });

  test("a NaN distance makes the driver-proximity sort order undefined", () => {
    // This is the consequence that mattered: cands.sort((a,b) => a.dist - b.dist).
    const cands = [{ id: "far", dist: 9 }, { id: "nan", dist: NaN }, { id: "near", dist: 1 }];
    const sorted = [...cands].sort((a, b) => a.dist - b.dist);
    assert.notEqual(sorted[0].id, "near",
      "a NaN in the list no longer disturbs the ordering — the premise changed");
  });

  test("a finite out-of-range coordinate is quietly wrong rather than NaN", () => {
    const d = haversine(...HOME, 999, 999);
    assert.ok(Number.isFinite(d) && d > 10_000,
      "999 no longer yields a confident nonsense distance");
  });

  test("a string coordinate was stored but skipped by the distance gate", () => {
    // The report says a string produces NaN. It does not — recorded so the fix is
    // not justified by a mechanism that was never there.
    assert.notEqual(typeof "34.19", "number");
  });
});

describe("H-67 · coordinates are rejected unless they are real points", () => {
  test("NaN, Infinity and non-numeric values are refused", () => {
    for (const bad of [NaN, Infinity, -Infinity, "abc", "12abc", {}, [], true, () => {}]) {
      assert.equal(V.parseLatitude(bad), null, `latitude accepted ${String(bad)}`);
      assert.equal(V.parseLongitude(bad), null, `longitude accepted ${String(bad)}`);
    }
  });

  test("out-of-range values are refused on both axes", () => {
    for (const bad of [90.0001, -90.0001, 999, -999, 1e308]) {
      assert.equal(V.parseLatitude(bad), null, `latitude accepted ${bad}`);
    }
    for (const bad of [180.0001, -180.0001, 999, -1e308]) {
      assert.equal(V.parseLongitude(bad), null, `longitude accepted ${bad}`);
    }
    // …and the exact bounds are inside, not outside.
    assert.equal(V.parseLatitude(90), 90);
    assert.equal(V.parseLatitude(-90), -90);
    assert.equal(V.parseLongitude(180), 180);
    assert.equal(V.parseLongitude(-180), -180);
  });

  test("genuine coordinates pass through unchanged", () => {
    for (const good of [34.19, -34.19, 0, 43.876543, 89.999999]) {
      assert.equal(V.parseLatitude(good), good, `latitude rejected ${good}`);
    }
    // Numeric strings are accepted and normalised to numbers — a stored coordinate
    // must be a number or the typeof gate at the distance sites skips it.
    assert.equal(V.parseLatitude("34.19"), 34.19);
    assert.equal(typeof V.parseLatitude("34.19"), "number");
  });

  test("zero is a real coordinate, not a missing one (H-58's rule, kept)", () => {
    assert.equal(V.parseLatitude(0), 0);
    assert.equal(V.parseLongitude(0), 0);
    assert.equal(V.isProvided(0), true);
    assert.ok(Number.isFinite(haversine(...HOME, 0, 0)));
  });

  test("absent and cleared are distinguished from invalid", () => {
    // undefined ⇒ no pin was dropped, which is allowed and must not 400.
    for (const absent of [undefined, null, ""]) {
      assert.equal(V.isProvided(absent), false, `${String(absent)} read as provided`);
      assert.equal(V.parseLatitude(absent), null);
    }
    for (const provided of [0, 34.19, "abc", NaN, Infinity, 999]) {
      assert.equal(V.isProvided(provided), true,
        `${String(provided)} read as absent — it would skip the check`);
    }
  });

  test("every value the parser accepts is safe for the distance function", () => {
    // The property that actually matters: nothing that can be stored can produce
    // a NaN or a non-finite distance.
    const candidates = [0, 34.19, -89.9, 90, -90, "43.87", 1e-7, 12.000001];
    for (const c of candidates) {
      const lat = V.parseLatitude(c);
      if (lat === null) continue;
      const lng = V.parseLongitude(c) ?? 0;
      const d = haversine(...HOME, lat, lng);
      assert.ok(Number.isFinite(d), `accepted ${c} produced a non-finite distance`);
    }
  });
});

describe("H-67 · address, notes and order type are normalised", () => {
  test("a non-string address cannot reach the driver card as an object", () => {
    for (const bad of [{ a: 1 }, [1, 2], 42, true, null, undefined, () => {}]) {
      assert.equal(V.normalizeOrderText(bad, V.MAX_ORDER_ADDRESS_LENGTH), "");
    }
  });

  test("text is trimmed and bounded", () => {
    assert.equal(V.normalizeOrderText("  الضلوعية - حي المعلمين  ", 500), "الضلوعية - حي المعلمين");
    const long = "أ".repeat(5000);
    assert.equal(V.normalizeOrderText(long, V.MAX_ORDER_ADDRESS_LENGTH).length,
      V.MAX_ORDER_ADDRESS_LENGTH);
    assert.equal(V.normalizeOrderText(long, V.MAX_ORDER_NOTES_LENGTH).length,
      V.MAX_ORDER_NOTES_LENGTH);
  });

  test("the bounds sit far above any genuine address or note", () => {
    // A real composed address is "area - detail (landmark)".
    const realistic = "الضلوعية - حي المعلمين، قرب مدرسة الرشيد، الدار الثانية على اليمين (مقابل الجامع)";
    assert.equal(V.normalizeOrderText(realistic, V.MAX_ORDER_ADDRESS_LENGTH), realistic,
      "a realistic address is being truncated — the bound is too low");
    assert.ok(V.MAX_ORDER_ADDRESS_LENGTH >= 500);
    assert.ok(V.MAX_ORDER_NOTES_LENGTH >= 1000);
  });

  test("only known order types are stored", () => {
    for (const good of V.ORDER_TYPES) {
      assert.equal(V.normalizeOrderType(good), good);
    }
    assert.equal(V.normalizeOrderType("  courier-pickup  "), "courier-pickup");
    for (const bad of ["", "restaurantX", "<script>", 42, {}, null, undefined, true]) {
      assert.equal(V.normalizeOrderType(bad), null, `accepted ${String(bad)}`);
    }
  });

  test("an unrecognised order type fails the request", () => {
    // An absent tag is fine — most orders carry none — but a supplied one that the
    // project does not use is refused rather than silently dropped, so a client
    // sending a tag it believes in is told, instead of quietly losing it.
    for (const bad of ["restaurantX", "<script>", "pickup", 42, {}, [], true]) {
      const r = V.validateOrderFields({
        address: "x", notes: "", orderType: bad, latitude: undefined, longitude: undefined,
      });
      assert.equal(r.ok, false, `orderType ${JSON.stringify(bad)} was accepted`);
      assert.equal(r.error, "نوع الطلب غير معروف");
    }
  });

  test("an absent order type is not an error", () => {
    for (const absent of [undefined, null, ""]) {
      const r = V.validateOrderFields({
        address: "x", notes: "", orderType: absent, latitude: undefined, longitude: undefined,
      });
      assert.equal(r.ok, true, `absent orderType ${JSON.stringify(absent)} was refused`);
      assert.equal(r.value.orderType, null);
    }
  });

  test("every known order type is accepted through the validator", () => {
    for (const good of V.ORDER_TYPES) {
      const r = V.validateOrderFields({
        address: "x", notes: "", orderType: good, latitude: undefined, longitude: undefined,
      });
      assert.equal(r.ok, true, `${good} was refused`);
      assert.equal(r.value.orderType, good);
    }
  });

  test("the allowlist covers every value the shipped clients send and read", () => {
    // Derived from the source rather than trusted: if a screen starts sending a new
    // tag, this fails instead of the tag being silently dropped in production.
    const sources = [
      "client/screens/CourierPickupScreen.tsx",
      "client/screens/InternationalShoppingScreen.tsx",
    ];
    for (const f of sources) {
      for (const m of read(f).matchAll(/orderType:\s*"([^"]+)"/g)) {
        assert.ok(V.ORDER_TYPES.includes(m[1]),
          `${f} sends orderType "${m[1]}" which the allowlist would drop`);
      }
    }
    for (const m of ROUTES.matchAll(/orderType === "([^"]+)"/g)) {
      assert.ok(V.ORDER_TYPES.includes(m[1]),
        `routes.ts branches on orderType "${m[1]}" which can no longer be stored`);
    }
  });
});

describe("H-67 · the validation is wired into the order route", () => {
  test("an invalid supplied coordinate fails the request", () => {
    const r = V.validateOrderFields({
      address: "x", notes: "", orderType: undefined, latitude: JSON.parse('{"v":1e309}').v, longitude: 43.87,
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /موقع التوصيل غير صالح/);
    // …and the route turns that into a 400.
    assert.match(CODE, /const fields = validateOrderFields\(\{ address, notes, orderType, latitude, longitude \}\);/,
      "the route no longer runs the shared validator");
    const at = CODE.indexOf("const fields = validateOrderFields(");
    assert.match(CODE.slice(at, at + 200), /if \(!fields\.ok\) \{\s*return res\.status\(400\)\.json\(\{ error: fields\.error \}\);/,
      "a failed validation no longer refuses the request");
  });

  test("half a coordinate pair is refused, and a whole one survives", () => {
    const half = V.validateOrderFields({
      address: "x", notes: "", orderType: undefined, latitude: 34.19, longitude: undefined,
    });
    assert.equal(half.ok, false, "a half-supplied pair was accepted");
    const whole = V.validateOrderFields({
      address: "x", notes: "", orderType: undefined, latitude: 34.19, longitude: 43.87,
    });
    assert.equal(whole.ok, true);
    assert.deepEqual([whole.value.latitude, whole.value.longitude], [34.19, 43.87]);
    const none = V.validateOrderFields({
      address: "x", notes: "", orderType: undefined, latitude: undefined, longitude: undefined,
    });
    assert.equal(none.ok, true, "an order with no pin was refused");
    assert.deepEqual([none.value.latitude, none.value.longitude], [null, null]);
  });

  test("there is ONE validator for the order path, and the route calls it once", () => {
    assert.equal(typeof V.validateOrderFields, "function");
    assert.equal((CODE.match(/validateOrderFields\(/g) ?? []).length, 1,
      "the order path validates in more than one place");
    // The route must not re-derive any of the five itself.
    for (const gone of [
      /const parsedLatitude = parseLatitude\(latitude\)/,
      /const normalizedAddress = normalizeOrderText\(/,
      /const normalizedOrderType = normalizeOrderType\(/,
      /const latProvided = /,
    ]) {
      assert.doesNotMatch(CODE, gone,
        "the order route re-implements part of the shared validator");
    }
  });

  test("calculateDistance cannot receive a non-finite coordinate from a new order", () => {
    // The end-to-end property, checked by exhaustion over the shapes a JSON body
    // can carry: whatever validateOrderFields lets through is safe to hand to the
    // shipped haversine, and everything else never reaches the document at all.
    const bodies = [
      1e309, -1e309, NaN, Infinity, -Infinity, "abc", "", "1e309", [], [34.19],
      {}, true, false, null, undefined, 999, -999, 90.1, -180.1, 0, 34.19, "43.87",
      90, -90, 1e-12,
    ];
    for (const lat of bodies) {
      for (const lng of [43.87, lat]) {
        const r = V.validateOrderFields({
          address: "x", notes: "", orderType: undefined, latitude: lat, longitude: lng,
        });
        if (!r.ok) continue;                       // refused — never stored
        const { latitude, longitude } = r.value;
        if (latitude === null || longitude === null) continue; // no pin — not passed
        assert.ok(Number.isFinite(latitude) && Number.isFinite(longitude),
          `a non-finite coordinate survived validation: ${String(lat)}`);
        const d = haversine(...HOME, latitude, longitude);
        assert.ok(Number.isFinite(d),
          `stored pair (${latitude}, ${longitude}) produced a non-finite distance`);
      }
    }
  });

  test("what is stored is what was parsed — not the request body", () => {
    // This is the "same values for storage and computation" requirement: every
    // distance is computed from the order document, so storing the parsed pair is
    // what makes the two identical by construction.
    assert.match(CODE, /orderData\.latitude = parsedLatitude;/);
    assert.match(CODE, /orderData\.longitude = parsedLongitude;/);
    assert.doesNotMatch(CODE, /orderData\.latitude = latitude;/,
      "REGRESSION: the raw body latitude is stored again");
    assert.doesNotMatch(CODE, /orderData\.longitude = longitude;/);
    // Scoped to the orderData literal: `address,` shorthand appears in several
    // other handlers in this file that are not part of H-67.
    const at = CODE.indexOf("const orderData: any = {");
    const literal = CODE.slice(at, CODE.indexOf("\n      };", at));
    assert.match(literal, /address: normalizedAddress,/);
    assert.doesNotMatch(literal, /^\s+address,$/m,
      "REGRESSION: the raw body address is stored again");
    assert.match(CODE, /if \(normalizedNotes\) orderData\.notes = normalizedNotes;/);
    assert.match(CODE, /if \(normalizedOrderType\) orderData\.orderType = normalizedOrderType;/);
  });

  test("the coordinate pair is stored together or not at all", () => {
    assert.match(CODE, /if \(parsedLatitude !== null && parsedLongitude !== null\) \{/,
      "one half of a pair could now be stored without the other");
  });

  test("there is exactly one coordinate validator in the server", () => {
    // The report's own remedy: use the helper that exists rather than a fourth copy.
    for (const gone of ["const clampCoord =", "const parseCoord ="]) {
      assert.ok(!CODE.includes(gone), `${gone} is back — the logic is duplicated again`);
    }
    // …and one "was it supplied" predicate shared by every optional order field.
    assert.equal(
      (stripComments(VALIDATION_SRC).match(/export function isProvided\(/g) ?? []).length,
      1,
      "isProvided is defined more than once",
    );
    assert.match(CODE, /parseLatitude\(body\.latitude\)/,
      "the admin vendor update route stopped sharing the validator");
    assert.match(CODE, /latitude: parseLatitude\(latitude\)/,
      "the admin vendor create route stopped sharing the validator");
    const defs = (stripComments(VALIDATION_SRC).match(/export function parseCoordinate\(/g) ?? []).length;
    assert.equal(defs, 1, "parseCoordinate is defined more than once");
  });

  test("nothing about pricing, money or H-66 moved", () => {
    for (const marker of [
      /items: capOrderItemImages\(verifiedItems\)/,
      /const verifiedItems = resolvedLines\.map\(buildStoredOrderItem\)/,
      /verifiedSubtotal \+= realPrice \* quantity/,
      /total: verifiedTotal/,
      /deliveryFee: verifiedDeliveryFee/,
      /orderData\.serviceFee = verifiedServiceFee/,
      /orderData\.orderKind = orderKind/,
      /orderData\.appSharePercent = appSharePercent/,
      /restaurantSubtotal \+= it\.price \* it\.quantity/,
    ]) {
      assert.match(CODE, marker, "a pricing or H-66 rule changed with the H-67 fix");
    }
  });

  test("the order tag still cannot influence the app/driver split", () => {
    // checkIsRestaurantOrder must keep reading the frozen orderKind first, or an
    // allowlisted-but-client-chosen orderType would start moving money.
    const at = CODE.indexOf("async function checkIsRestaurantOrder(");
    const fn = CODE.slice(at, CODE.indexOf("\n  }", at));
    const kindAt = fn.indexOf('order.orderKind === "restaurant"');
    const typeAt = fn.indexOf('order.orderType === "restaurant"');
    assert.ok(kindAt > -1 && typeAt > -1);
    assert.ok(kindAt < typeAt,
      "orderType is now consulted before the frozen orderKind — pricing became client-influenced");
  });
});
