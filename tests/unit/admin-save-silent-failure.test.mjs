/**
 * Admin save paths that failed silently (audit finding H-33, residual review).
 *
 * Two writers in AdminScreen ended in an empty catch:
 *
 *   saveArea()       never looked at response.ok at all, and swallowed every
 *                    throw. A 4xx/5xx or a dropped connection closed the form
 *                    and invalidated the query — the admin saw the area
 *                    "saved" and only the delivery fee was never stored.
 *                    deliveryAreas is the server's source of truth for the
 *                    delivery fee (H-02), so a silently-lost write here is a
 *                    pricing bug, not a cosmetic one.
 *
 *   savePromoCode()  did check response.ok and built a precise Error from the
 *                    server's message — then discarded it in `catch {}`.
 *
 * Both now surface the failure through Alert, the idiom this screen already
 * uses everywhere else, and both leave the form open on failure so the admin's
 * input is not lost.
 *
 * These tests lift the two REAL function bodies out of the shipped .tsx and
 * execute them against injected fetch/Alert/queryClient stand-ins. Nothing is
 * asserted from source text.
 *
 * Run:  node --test tests/unit/admin-save-silent-failure.test.mjs
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
const SCREEN = readFileSync(join(root, "client/screens/AdminScreen.tsx"), "utf8");
const CLEAN = stripComments(SCREEN);

/**
 * The body of `const <name> = async () => { ... }`, brace-matched from the
 * opening `{` of the arrow function.
 */
function arrowBody(src, name) {
  const decl = `const ${name} = async () => {`;
  const at = src.indexOf(decl);
  assert.ok(at > 0, `declaration not found: ${name}`);
  const open = at + decl.length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced body for ${name}`);
}

/** Compile a lifted body into a callable with the given names injected. */
function compile(body, names) {
  const js = ts.transpileModule(`async function __fn() {${body}\n}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  // eslint-disable-next-line no-new-func
  const make = new Function(...names, `${js}; return __fn;`);
  return (scope) => make(...names.map((n) => scope[n]))();
}

const NAMES = ["editItem", "getApiUrl", "fetch", "queryClient", "resetForm", "Alert", "areaForm", "promoForm"];

/** A harness that records what the lifted body did. */
function harness({ status = 200, json = {}, networkError = null, editItem = null } = {}) {
  const calls = { fetch: [], invalidated: [], reset: 0, alerts: [] };
  return {
    calls,
    scope: {
      editItem,
      getApiUrl: () => "https://api.test",
      fetch: async (url, init) => {
        calls.fetch.push({ url, method: init?.method, body: init?.body });
        if (networkError) throw new Error(networkError);
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => json,
        };
      },
      queryClient: { invalidateQueries: (arg) => calls.invalidated.push(arg?.queryKey?.[0]) },
      resetForm: () => { calls.reset += 1; },
      Alert: { alert: (title, message) => calls.alerts.push({ title, message }) },
      areaForm: { name: "الضلوعية", fee: 1000 },
      promoForm: { code: "SAVE10", type: "fixed", value: 1000, expiryDate: "2030-01-01" },
    },
  };
}

const saveArea = compile(arrowBody(CLEAN, "saveArea"), NAMES);
const savePromoCode = compile(arrowBody(CLEAN, "savePromoCode"), NAMES);

describe("saveArea — a rejected delivery-area write is reported, not swallowed", () => {
  test("the happy path still saves, invalidates both queries and closes the form", async () => {
    const h = harness({ status: 200 });
    await saveArea(h.scope);
    assert.equal(h.calls.fetch.length, 1);
    assert.equal(h.calls.fetch[0].method, "POST");
    assert.equal(h.calls.fetch[0].url, "https://api.test/api/admin/delivery-areas");
    assert.deepEqual(h.calls.invalidated, ["/api/admin/delivery-areas", "/api/delivery-areas"]);
    assert.equal(h.calls.reset, 1, "the form closes on success");
    assert.equal(h.calls.alerts.length, 0, "nothing is reported on success");
  });

  test("editing an existing area still PUTs to that area's id", async () => {
    const h = harness({ status: 200, editItem: { id: "area-7" } });
    await saveArea(h.scope);
    assert.equal(h.calls.fetch[0].method, "PUT");
    assert.equal(h.calls.fetch[0].url, "https://api.test/api/admin/delivery-areas/area-7");
  });

  test("the fee the admin typed is what gets sent", async () => {
    const h = harness({ status: 200 });
    await saveArea(h.scope);
    assert.deepEqual(JSON.parse(h.calls.fetch[0].body), { name: "الضلوعية", fee: 1000 });
  });

  // The core regression: on HEAD this rejected write closed the form silently.
  test("a 500 raises an alert", async () => {
    const h = harness({ status: 500, json: { error: "خطأ في قاعدة البيانات" } });
    await saveArea(h.scope);
    assert.equal(h.calls.alerts.length, 1, "the admin is told the save failed");
    assert.equal(h.calls.alerts[0].title, "خطأ");
    assert.equal(h.calls.alerts[0].message, "خطأ في قاعدة البيانات",
      "the server's own message is shown, not a generic one");
  });

  test("a 500 does NOT close the form — the admin's input survives", async () => {
    const h = harness({ status: 500, json: { error: "خطأ" } });
    await saveArea(h.scope);
    assert.equal(h.calls.reset, 0);
  });

  test("a 500 does NOT invalidate the caches — nothing was written", async () => {
    const h = harness({ status: 500, json: { error: "خطأ" } });
    await saveArea(h.scope);
    assert.deepEqual(h.calls.invalidated, []);
  });

  test("a 403 is reported too, not just 5xx", async () => {
    const h = harness({ status: 403, json: { error: "غير مصرح" } });
    await saveArea(h.scope);
    assert.equal(h.calls.alerts[0].message, "غير مصرح");
    assert.equal(h.calls.reset, 0);
  });

  test("an error body with no message still produces a readable alert", async () => {
    const h = harness({ status: 500, json: {} });
    await saveArea(h.scope);
    assert.equal(h.calls.alerts.length, 1);
    assert.ok(h.calls.alerts[0].message.length > 0);
    assert.ok(!/undefined/.test(h.calls.alerts[0].message));
  });

  test("an unparseable error body does not throw out of the handler", async () => {
    const h = harness({ status: 500 });
    h.scope.fetch = async () => ({
      ok: false, status: 500,
      json: async () => { throw new SyntaxError("Unexpected token <"); },
    });
    await saveArea(h.scope);
    assert.equal(h.calls.alerts.length, 1, "the parse failure is absorbed, the save failure is not");
    assert.equal(h.calls.reset, 0);
  });

  test("a dropped connection is reported", async () => {
    const h = harness({ networkError: "Network request failed" });
    await saveArea(h.scope);
    assert.equal(h.calls.alerts.length, 1);
    assert.equal(h.calls.reset, 0);
    assert.deepEqual(h.calls.invalidated, []);
  });

  test("the handler never rejects — no unhandled rejection from a UI callback", async () => {
    const h = harness({ networkError: "boom" });
    await assert.doesNotReject(() => saveArea(h.scope));
  });
});

describe("savePromoCode — the error it already built is now shown", () => {
  test("the happy path still saves, invalidates and closes the form", async () => {
    const h = harness({ status: 200 });
    await savePromoCode(h.scope);
    assert.equal(h.calls.fetch[0].url, "https://api.test/api/admin/promo-codes");
    assert.deepEqual(h.calls.invalidated, ["/api/admin/promo-codes"]);
    assert.equal(h.calls.reset, 1);
    assert.equal(h.calls.alerts.length, 0);
  });

  test("editing an existing code still PUTs to that code's id", async () => {
    const h = harness({ status: 200, editItem: { id: "promo-3" } });
    await savePromoCode(h.scope);
    assert.equal(h.calls.fetch[0].method, "PUT");
    assert.equal(h.calls.fetch[0].url, "https://api.test/api/admin/promo-codes/promo-3");
  });

  test("all four promo fields are still sent", async () => {
    const h = harness({ status: 200 });
    await savePromoCode(h.scope);
    assert.deepEqual(JSON.parse(h.calls.fetch[0].body), {
      code: "SAVE10", type: "fixed", value: 1000, expiryDate: "2030-01-01",
    });
  });

  // The core regression: HEAD threw this exact Error and then dropped it.
  test("the server's rejection message reaches the admin", async () => {
    const h = harness({ status: 400, json: { error: "كود الخصم مستخدم مسبقاً" } });
    await savePromoCode(h.scope);
    assert.equal(h.calls.alerts.length, 1);
    assert.equal(h.calls.alerts[0].message, "كود الخصم مستخدم مسبقاً");
  });

  test("a rejected promo save does not close the form or invalidate", async () => {
    const h = harness({ status: 400, json: { error: "كود مكرر" } });
    await savePromoCode(h.scope);
    assert.equal(h.calls.reset, 0);
    assert.deepEqual(h.calls.invalidated, []);
  });

  test("a dropped connection is reported", async () => {
    const h = harness({ networkError: "Network request failed" });
    await savePromoCode(h.scope);
    assert.equal(h.calls.alerts.length, 1);
    assert.equal(h.calls.reset, 0);
  });

  test("the handler never rejects", async () => {
    const h = harness({ networkError: "boom" });
    await assert.doesNotReject(() => savePromoCode(h.scope));
  });
});

describe("no admin write in this screen ends in a bare catch again", () => {
  test("neither lifted body contains an empty catch", () => {
    for (const [name, body] of [
      ["saveArea", arrowBody(CLEAN, "saveArea")],
      ["savePromoCode", arrowBody(CLEAN, "savePromoCode")],
    ]) {
      assert.ok(!/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(body),
        `${name} still has an empty catch`);
    }
  });

  test("both writers check response.ok before treating the write as done", () => {
    for (const [name, body] of [
      ["saveArea", arrowBody(CLEAN, "saveArea")],
      ["savePromoCode", arrowBody(CLEAN, "savePromoCode")],
    ]) {
      assert.ok(/response\.ok/.test(body), `${name} does not check response.ok`);
    }
  });
});
