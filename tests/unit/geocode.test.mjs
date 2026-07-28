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

const OK = (results) => ({ status: "OK", results });

describe("reverse geocode — Arabic address selection", () => {
  test("prefers a nearby named place (placeName) combined with the best address", () => {
    const geocode = OK([
      { types: ["neighborhood"], formatted_address: "حي العسكري، الضلوعية، العراق" },
    ]);
    const places = OK([{ name: "أسواق دزني", types: ["store"] }]);
    const r = pickBestAddress(geocode, places);
    assert.equal(r.placeName, "أسواق دزني");
    assert.equal(r.address, "أسواق دزني، حي العسكري، الضلوعية");
    assert.ok(!r.address.includes("العراق"), "country suffix must be stripped");
  });

  test("falls back to a useful geocode level when no named place exists", () => {
    const geocode = OK([
      { types: ["route"], formatted_address: "شارع الكورنيش، الضلوعية، العراق" },
    ]);
    const r = pickBestAddress(geocode, { status: "ZERO_RESULTS", results: [] });
    assert.equal(r.placeName, null);
    assert.equal(r.address, "شارع الكورنيش، الضلوعية");
  });

  test("skips administrative-only place names (locality/political)", () => {
    const geocode = OK([{ types: ["locality"], formatted_address: "قضاء الضلوعية، العراق" }]);
    const places = OK([{ name: "الضلوعية", types: ["locality", "political"] }]);
    const r = pickBestAddress(geocode, places);
    assert.equal(r.placeName, null, "a locality/political name is not a user-friendly place");
    assert.equal(r.address, "قضاء الضلوعية");
  });

  test("ignores 'unnamed road' results", () => {
    const geocode = OK([
      { types: ["route"], formatted_address: "طريق بدون اسم، العراق" },
      { types: ["locality"], formatted_address: "قضاء الضلوعية، العراق" },
    ]);
    const r = pickBestAddress(geocode, { status: "ZERO_RESULTS", results: [] });
    assert.equal(r.address, "قضاء الضلوعية");
  });
});

describe("reverse geocode — failure and fallback", () => {
  test("returns null when Google has no usable result (caller falls back to coords)", () => {
    assert.equal(pickBestAddress({ status: "ZERO_RESULTS", results: [] }, null), null);
    assert.equal(pickBestAddress(null, null), null);
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
