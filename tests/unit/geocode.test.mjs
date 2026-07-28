/**
 * Reverse-geocoding parser tests. These exercise the pure address-selection and
 * diagnostics logic (no network, no API key) that the /api/reverse-geocode route uses.
 *
 * Run:  npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  cleanAddr,
  isUsefulAddress,
  pickBestAddress,
  geocodeDiagnostics,
} from "../../server/geocode.ts";

// Google response builders.
const comp = (long_name, types) => ({ long_name, short_name: long_name, types });
const geo = (components, formatted = "") => ({
  status: "OK",
  results: [{ address_components: components, formatted_address: formatted, types: [] }],
});
const places = (results) => ({ status: "OK", results });

describe("reverse geocode — shortest useful address (priority order)", () => {
  test("1. a nearby named place wins over everything (shortest useful)", () => {
    const g = geo([comp("حي العسكري", ["neighborhood"]), comp("قضاء الضلوعية", ["administrative_area_level_2"])]);
    const p = places([{ name: "أسواق دزني", types: ["store", "point_of_interest"] }]);
    const r = pickBestAddress(g, p);
    assert.equal(r.address, "أسواق دزني", "place name is the shortest useful label");
    assert.equal(r.placeName, "أسواق دزني");
  });

  test("2. neighbourhood when no named place exists", () => {
    const g = geo([comp("حي العسكري", ["neighborhood"]), comp("قضاء الضلوعية", ["administrative_area_level_2"])]);
    const r = pickBestAddress(g, { status: "ZERO_RESULTS", results: [] });
    assert.equal(r.address, "حي العسكري");
    assert.equal(r.placeName, null);
  });

  test("3. city/قضاء when no place and no neighbourhood", () => {
    const g = geo([comp("قضاء الضلوعية", ["administrative_area_level_2"]), comp("صلاح الدين", ["administrative_area_level_1"])]);
    const r = pickBestAddress(g, null);
    assert.equal(r.address, "قضاء الضلوعية");
  });

  test("4. governorate only as a last resort", () => {
    const g = geo([comp("صلاح الدين", ["administrative_area_level_1"]), comp("العراق", ["country"])]);
    const r = pickBestAddress(g, null);
    assert.equal(r.address, "صلاح الدين");
  });

  test("5. an 'unnamed road' route is skipped in favour of the city", () => {
    const g = geo([
      comp("طريق بدون اسم", ["route"]),
      comp("قضاء الضلوعية", ["administrative_area_level_2"]),
    ], "طريق بدون اسم، قضاء الضلوعية، العراق");
    const r = pickBestAddress(g, null);
    assert.equal(r.address, "قضاء الضلوعية", "never surface 'Unnamed Road' when a real level exists");
  });

  test("6. administrative place names are not treated as a landmark", () => {
    const g = geo([comp("قضاء الضلوعية", ["administrative_area_level_2"])]);
    const p = places([{ name: "الضلوعية", types: ["locality", "political"] }]);
    const r = pickBestAddress(g, p);
    assert.equal(r.placeName, null);
    assert.equal(r.address, "قضاء الضلوعية");
  });
});

describe("reverse geocode — failure and fallback", () => {
  test("returns null when Google has no usable result (caller falls back to coords)", () => {
    assert.equal(pickBestAddress({ status: "ZERO_RESULTS", results: [] }, null), null);
    assert.equal(pickBestAddress(null, null), null);
  });

  test("last resort: a useful formatted_address is used when no components match", () => {
    const g = { status: "OK", results: [{ formatted_address: "حي الزهور، الضلوعية، العراق", address_components: [] }] };
    const r = pickBestAddress(g, null);
    assert.equal(r.address, "حي الزهور، الضلوعية");
  });

  test("REQUEST_DENIED (invalid/blocked key) is flagged as a key problem", () => {
    const d = geocodeDiagnostics(
      { status: "REQUEST_DENIED", error_message: "The provided API key is invalid." },
      null,
    );
    assert.equal(d.keyProblem, true);
    assert.equal(d.geocodeStatus, "REQUEST_DENIED");
    assert.match(d.googleError, /invalid/);
  });

  test("OVER_QUERY_LIMIT (quota exceeded) is flagged as a key problem", () => {
    const d = geocodeDiagnostics({ status: "OVER_QUERY_LIMIT" }, { status: "OK", results: [] });
    assert.equal(d.keyProblem, true);
  });

  test("ZERO_RESULTS is NOT a key problem (just no address here)", () => {
    const d = geocodeDiagnostics({ status: "ZERO_RESULTS" }, { status: "ZERO_RESULTS" });
    assert.equal(d.keyProblem, false);
  });

  test("a missing response is reported, never crashes", () => {
    const d = geocodeDiagnostics(null, null);
    assert.equal(d.geocodeStatus, "NO_RESPONSE");
    assert.equal(d.placesStatus, "NO_RESPONSE");
    assert.equal(d.keyProblem, false);
  });
});

describe("reverse geocode — address cleaning", () => {
  test("cleanAddr strips country, plus-codes and leading separators", () => {
    assert.equal(cleanAddr("XVFH+2R حي العسكري، العراق"), "حي العسكري");
    assert.equal(cleanAddr("، الضلوعية"), "الضلوعية");
  });
  test("isUsefulAddress rejects empty and unnamed-road placeholders", () => {
    assert.equal(isUsefulAddress(""), false);
    assert.equal(isUsefulAddress("طريق بدون اسم"), false);
    assert.equal(isUsefulAddress("حي العسكري"), true);
  });
});
