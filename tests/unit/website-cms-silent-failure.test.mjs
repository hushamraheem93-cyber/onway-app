/**
 * Website CMS silent-failure tests (audit finding H-31).
 *
 * WebsiteCmsTab.tsx had 12 `try` blocks and ZERO `catch`, plus three more network
 * handlers with no `try` at all — fifteen handlers in total, not the eight the
 * audit named. Four distinct defects lived in there:
 *
 *   1. No catch anywhere. Each handler is called from onPress without await, so a
 *      dropped connection rejected a promise nobody was listening to: `finally`
 *      stopped the spinner and the admin was told nothing at all.
 *   2. The three upload handlers called `res.json()` BEFORE checking `res.ok`, so
 *      a non-JSON error body — a 502 page from the reverse proxy — threw before
 *      any message could be produced.
 *   3. The three delete handlers had no error handling whatsoever and updated the
 *      UI unconditionally. A refused delete removed the image from the admin's
 *      screen while it kept serving on the public site: a guaranteed false success.
 *      ScreenshotsForm removed it from the grid BEFORE sending the request.
 *   4. `Alert.alert("خطأ", "فشل في الحفظ")` swallowed the server's own reason —
 *      including the `fields` list PUT returns with 400, which names the field the
 *      schema rejected, so the admin could not tell what to correct.
 *
 * And the consequence the audit does not mention at all: `fetchAll` was silent too.
 * A failed load left cmsData empty, every form rendered blank (each field is
 * `initial?.x ?? ""`), and the admin read that as "nothing configured yet". Saving
 * then sent an all-empty payload, which the server ACCEPTS — the schema is
 * `.partial()` and the write is `{ merge: true }` — wiping the live marketing site.
 * Verified against the real parser: parseWebsiteContent('hero', {all empty}) → ok.
 * Loading now fails visibly and the forms are not rendered until content is in hand.
 *
 * Measured on the pre-fix source: 77 assertions failed across the fifteen handlers.
 *
 * Handler bodies are lifted straight out of the shipped .tsx by brace matching,
 * transpiled with the project's own TypeScript, and executed with injected
 * dependencies — so what runs here is the real code path. A handler that REJECTS is
 * recorded as "nothing reached the admin", which is exactly what an unhandled
 * rejection means on a device.
 *
 * Run:  node --test tests/unit/website-cms-silent-failure.test.mjs
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
const SRC = readFileSync(join(here, "../../client/screens/WebsiteCmsTab.tsx"), "utf8");

// ── lifting ──────────────────────────────────────────────────────────────────
function braceBody(src, at) {
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open + 1, i); }
  }
  throw new Error("unbalanced brace scan");
}
/** One component's source, so `const save` resolves inside the right form. */
function component(name) {
  const at = SRC.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`component not found: ${name}`);
  let i = at + `function ${name}`.length, depth = 0;
  for (; i < SRC.length; i += 1) {
    if (SRC[i] === "(") depth += 1;
    else if (SRC[i] === ")") { depth -= 1; if (depth === 0) { i += 1; break; } }
  }
  return braceBody(SRC, i);
}
function handlerBody(componentSrc, decl) {
  const at = componentSrc.indexOf(decl);
  if (at < 0) throw new Error(`handler not found: ${decl}`);
  return braceBody(componentSrc, at + decl.length - 1);
}
function compile(body, params, deps) {
  const js = ts.transpileModule(
    `return async function lifted(${params.join(", ")}) {\n${body}\n};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  // eslint-disable-next-line no-new-func
  return new Function(...deps, js);
}

/** Strip comments so assertions never match prose about the code. */
const stripComments = sharedStripComments;
const CLEAN = stripComments(SRC);

/** The two error helpers, lifted too, so the messages under test are the real ones. */
const liftedServerError = (() => {
  try {
    return compile(
      braceBody(SRC, SRC.indexOf("async function serverError(")), ["res"], ["Array"],
    )(Array);
  } catch { return async () => "(الدالة المساعدة مفقودة)"; }
})();
const LIFTED_CONNECTION_ERROR =
  CLEAN.match(/const CONNECTION_ERROR\s*=\s*\n?\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? null;

const SAVE_FORMS = ["HeroForm", "FeaturesForm", "StatsForm", "FaqForm",
  "DownloadLinksForm", "ScreenshotsForm", "ContactForm", "SeoForm"];

// ── harness ──────────────────────────────────────────────────────────────────
const DEPS = ["serverError", "CONNECTION_ERROR", "Array", "adminFetch", "Alert",
  "JSON", "FormData", "String", "Object", "onSaved",
  "setSaving", "setUploading", "setLoading", "setLoadError",
  "setData", "setImages", "setCmsData", "setItems",
  "data", "images", "items", "ImagePicker"];

const ADMIN_TEXT = "عنوان كتبه المشرف";

function ctxFor(fetchImpl, over = {}) {
  const ctx = {
    saving: false, uploading: false, loading: true, loadError: null,
    data: {
      title_ar: ADMIN_TEXT,
      heroImageUrl: "https://cdn/x.webp",
      ogImageUrl: "https://cdn/og.webp",
    },
    images: ["https://cdn/a.webp", "https://cdn/b.webp"],
    items: [{ id: "i1", title_ar: "بند", desc_ar: "وصف", order: 1 }],
    cmsData: {}, alerts: [], saved: 0, requests: [], rejected: null, ...over,
  };
  const setter = (k) => (v) => { ctx[k] = typeof v === "function" ? v(ctx[k]) : v; };
  ctx.deps = {
    serverError: liftedServerError,
    CONNECTION_ERROR: LIFTED_CONNECTION_ERROR,
    Array,
    adminFetch: async (path, opts) => {
      ctx.requests.push({ path, method: opts?.method ?? "GET", body: opts?.body });
      return fetchImpl(path, opts);
    },
    Alert: { alert: (title, msg) => ctx.alerts.push({ title, msg }) },
    JSON, FormData: class { append() {} }, String, Object,
    onSaved: () => { ctx.saved += 1; },
    setSaving: (v) => { ctx.saving = v; },
    setUploading: (v) => { ctx.uploading = v; },
    setLoading: (v) => { ctx.loading = v; },
    setLoadError: setter("loadError"),
    setData: setter("data"), setImages: setter("images"),
    setCmsData: setter("cmsData"), setItems: setter("items"),
    get data() { return ctx.data; },
    get images() { return ctx.images; },
    get items() { return ctx.items; },
    ImagePicker: {
      launchImageLibraryAsync: async () => ({
        canceled: false, assets: [{ uri: "file:///tmp/a.jpg" }],
      }),
    },
  };
  return ctx;
}

async function run(fn, fetchImpl, args = [], over) {
  const ctx = ctxFor(fetchImpl, over);
  try {
    await fn(...DEPS.map((n) => ctx.deps[n]))(...args);
    ctx.rejected = false;
  } catch (e) {
    ctx.rejected = true;               // an unhandled rejection on a device
    ctx.rejectionMessage = String(e?.message ?? e);
  }
  return ctx;
}

/** Real server responses — taken from server/routes.ts:8331-8464 and the guards. */
const R = {
  400: { ok: false, status: 400, body: { error: "بيانات غير صالحة", fields: ["title_ar"] } },
  401: { ok: false, status: 401, body: { error: "غير مصرح" } },
  403: { ok: false, status: 403, body: { error: "طلب غير موثوق المصدر" } },
  404: { ok: false, status: 404, body: { error: "القسم غير موجود" } },
  429: { ok: false, status: 429, body: { error: "طلبات كثيرة، حاول لاحقاً" } },
  500: { ok: false, status: 500, body: { error: "حدث خطأ في الحفظ" } },
};
const http = (code) => async () => ({
  ok: R[code].ok, status: R[code].status, json: async () => R[code].body,
});
const okWith = (body = { success: true }) => async () => ({
  ok: true, status: 200, json: async () => body,
});
// A reverse-proxy error page: a real response whose body is not JSON.
const html502 = () => async () => ({
  ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token <"); },
});
const netFail = () => { throw new TypeError("Network request failed"); };

const FAIL_CODES = [400, 401, 403, 404, 429, 500];
const told = (c) => c.alerts.length > 0;
const claimsSaved = (c) => c.alerts.some((a) => /تم الحفظ/.test(a.title));
const messages = (c) => c.alerts.map((a) => String(a.msg)).join(" | ");

// ─────────────────────────────────────────────────────────────────────────────
describe("H-31 · every try block now has a catch", () => {
  test("the file has no unguarded try left", () => {
    const tries = (CLEAN.match(/\btry\s*\{/g) || []).length;
    const catches = (CLEAN.match(/\bcatch\s*(\([^)]*\))?\s*\{/g) || []).length;
    assert.ok(tries > 0, "the scan found no try blocks at all — check the pattern");
    assert.ok(catches >= tries, `${tries} try blocks but only ${catches} catch blocks`);
  });

  test("no catch block is empty", () => {
    assert.doesNotMatch(CLEAN, /catch\s*(\([^)]*\))?\s*\{\s*\}/);
  });

  test("no automatic retry was introduced anywhere in the screen", () => {
    assert.doesNotMatch(CLEAN, /setTimeout|setInterval|\bretry\s*\(|autoRetry/);
  });

  test("the connection message exists and is Arabic prose", () => {
    assert.equal(typeof LIFTED_CONNECTION_ERROR, "string");
    assert.match(LIFTED_CONNECTION_ERROR, /[؀-ۿ]/);
  });
});

describe("H-31 · the eight save handlers", () => {
  for (const name of SAVE_FORMS) {
    const fn = compile(handlerBody(component(name), "const save = async () =>"), [], DEPS);

    for (const code of FAIL_CODES) {
      test(`${name} · HTTP ${code}: the admin is told, with the server's own reason`, async () => {
        const c = await run(fn, http(code));
        assert.equal(c.rejected, false, "rejected — nothing would reach the admin");
        assert.equal(c.alerts.length, 1, "said nothing at all");
        assert.ok(
          messages(c).includes(R[code].body.error),
          `generic message instead of the server's: ${messages(c)}`,
        );
        assert.equal(claimsSaved(c), false, "claimed a save that did not happen");
        assert.equal(c.saved, 0, "reloaded as if the save had landed");
        assert.equal(c.saving, false, "left the spinner running");
      });
    }

    test(`${name} · HTTP 400: the rejected field names reach the admin`, async () => {
      const c = await run(fn, http(400));
      assert.match(messages(c), /title_ar/,
        "the fields list from the schema was swallowed — the admin cannot tell what to fix");
    });

    test(`${name} · a dropped connection is reported, not swallowed`, async () => {
      const c = await run(fn, netFail);
      assert.equal(c.rejected, false, "unhandled rejection: the admin sees nothing");
      assert.equal(c.alerts.length, 1);
      assert.equal(c.alerts[0].msg, LIFTED_CONNECTION_ERROR);
      assert.equal(claimsSaved(c), false);
      assert.equal(c.saving, false);
    });

    test(`${name} · a 502 with an HTML body does not crash the handler`, async () => {
      const c = await run(fn, html502());
      assert.equal(c.rejected, false);
      assert.equal(c.alerts.length, 1);
      assert.match(messages(c), /\S/);
      assert.equal(c.saving, false);
    });

    test(`${name} · success still confirms and reloads`, async () => {
      const c = await run(fn, okWith());
      assert.equal(claimsSaved(c), true);
      assert.equal(c.saved, 1);
      assert.equal(c.saving, false);
      assert.equal(c.requests.length, 1);
      assert.equal(c.requests[0].method, "PUT");
    });
  }
});

describe("H-31 · the three upload handlers", () => {
  const UPLOADS = [
    ["HeroForm", "const pickAndUpload = async () =>"],
    ["SeoForm", "const pickAndUpload = async () =>"],
    ["ScreenshotsForm", "const pickAndUpload = async () =>"],
  ];
  for (const [name, decl] of UPLOADS) {
    const fn = compile(handlerBody(component(name), decl), [], DEPS);

    for (const code of [400, 401, 403, 500]) {
      test(`${name}/upload · HTTP ${code}: the admin is told`, async () => {
        const c = await run(fn, http(code));
        assert.equal(c.rejected, false);
        assert.equal(c.alerts.length, 1, "the upload failed in complete silence");
        assert.ok(messages(c).includes(R[code].body.error), messages(c));
        assert.equal(c.uploading, false);
      });
    }

    test(`${name}/upload · a dropped connection is reported`, async () => {
      const c = await run(fn, netFail);
      assert.equal(c.rejected, false);
      assert.equal(c.alerts[0].msg, LIFTED_CONNECTION_ERROR);
      assert.equal(c.uploading, false);
    });

    test(`${name}/upload · a non-JSON error body is handled before it is parsed`, async () => {
      const c = await run(fn, html502());
      assert.equal(c.rejected, false, "res.json() ran before res.ok and threw");
      assert.equal(c.alerts.length, 1);
      assert.equal(c.uploading, false);
      // The response DID arrive — this is a server failure, not a lost
      // connection. Telling the admin to check their internet sends them after
      // the wrong problem, and is what happens if res.json() is parsed before
      // res.ok is judged and the resulting throw lands in the catch.
      assert.notEqual(
        c.alerts[0].msg, LIFTED_CONNECTION_ERROR,
        "a 502 was reported as a connection failure — res.ok is being judged too late",
      );
    });

    test(`${name}/upload · success still stores the returned url`, async () => {
      const c = await run(fn, okWith({ url: "https://cdn/new.webp" }));
      assert.deepEqual(c.alerts, []);
      assert.equal(c.uploading, false);
      const stored = name === "ScreenshotsForm"
        ? c.images.includes("https://cdn/new.webp")
        : Object.values(c.data).includes("https://cdn/new.webp");
      assert.ok(stored, `the uploaded url was not kept: ${JSON.stringify(c.data ?? c.images)}`);
    });
  }
});

describe("H-31 · the three delete handlers must not fake a success", () => {
  const REMOVES = [
    ["HeroForm", "const removeImage = async () =>", [],
      (c) => c.data.heroImageUrl === "https://cdn/x.webp"],
    ["SeoForm", "const removeOg = async () =>", [],
      (c) => c.data.ogImageUrl === "https://cdn/og.webp"],
    ["ScreenshotsForm", "const removeImage = async (url: string) =>", ["https://cdn/a.webp"],
      (c) => c.images.includes("https://cdn/a.webp")],
  ];
  for (const [name, decl, args, stillShown] of REMOVES) {
    const fn = compile(handlerBody(component(name), decl), decl.includes("url") ? ["url"] : [], DEPS);

    for (const code of [400, 401, 403, 500]) {
      test(`${name}/remove · HTTP ${code}: told, and the image stays on screen`, async () => {
        const c = await run(fn, http(code), args);
        assert.equal(c.rejected, false);
        assert.equal(c.alerts.length, 1, "the refused delete was silent");
        assert.ok(messages(c).includes(R[code].body.error), messages(c));
        assert.ok(
          stillShown(c),
          "the image vanished from the admin's screen while the server kept serving it",
        );
      });
    }

    test(`${name}/remove · a dropped connection is reported and rolled back`, async () => {
      const c = await run(fn, netFail, args);
      assert.equal(c.rejected, false);
      assert.equal(c.alerts[0].msg, LIFTED_CONNECTION_ERROR);
      assert.ok(stillShown(c), "left the image hidden after a failed delete");
    });

    test(`${name}/remove · a successful delete does clear it`, async () => {
      const c = await run(fn, okWith(), args);
      assert.deepEqual(c.alerts, []);
      assert.equal(stillShown(c), false, "a successful delete must clear the image");
      assert.equal(c.requests[0].method, "DELETE");
    });
  }
});

describe("H-31 · a failed load must not offer empty forms to save over live content", () => {
  const fn = compile(
    handlerBody(component("WebsiteCmsTab"), "const fetchAll = useCallback(async () =>"),
    [], DEPS,
  );

  for (const code of [401, 403, 500]) {
    test(`fetchAll · HTTP ${code}: an error is surfaced and no content is faked`, async () => {
      const c = await run(fn, http(code));
      assert.equal(c.rejected, false);
      assert.ok(c.loadError, "the failure was silent — the admin sees blank forms");
      assert.ok(String(c.loadError).includes(R[code].body.error), String(c.loadError));
      assert.deepEqual(c.cmsData, {}, "empty content was handed to the forms anyway");
      assert.equal(c.loading, false, "the spinner never stopped");
    });
  }

  test("fetchAll · a dropped connection surfaces the connection message", async () => {
    const c = await run(fn, netFail);
    assert.equal(c.rejected, false);
    assert.equal(c.loadError, LIFTED_CONNECTION_ERROR);
    assert.equal(c.loading, false);
  });

  test("fetchAll · a 502 with an HTML body still surfaces an error", async () => {
    const c = await run(fn, html502());
    assert.equal(c.rejected, false);
    assert.match(String(c.loadError ?? ""), /\S/);
    assert.equal(c.loading, false);
  });

  test("fetchAll · success loads content and clears any previous error", async () => {
    const c = await run(fn, okWith({ hero: { title_ar: "مرحباً" } }), [],
      { loadError: "خطأ سابق" });
    assert.equal(c.loadError, null);
    assert.deepEqual(c.cmsData, { hero: { title_ar: "مرحباً" } });
    assert.equal(c.loading, false);
  });

  test("the render shows the error state INSTEAD of the forms", () => {
    // The whole point of the fix: renderSection() must sit behind loadError.
    const errorAt = CLEAN.indexOf("renderLoadError()");
    const sectionAt = CLEAN.lastIndexOf("renderSection()");
    assert.ok(errorAt > 0, "there is no load-error view at all");
    assert.ok(
      /loadError\s*\?\s*\(?\s*renderLoadError\(\)/.test(CLEAN),
      "renderLoadError is not the branch taken when loadError is set",
    );
    assert.ok(sectionAt > errorAt, "renderSection is not behind the loadError branch");
  });

  test("retrying is manual, never automatic", () => {
    assert.match(CLEAN, /onPress=\{retryLoad\}|onPress=\{\(\)\s*=>\s*retryLoad\(\)\}/,
      "the error view has no retry the admin can press");
    assert.doesNotMatch(CLEAN, /setTimeout\([^)]*fetchAll/);
  });
});

describe("H-31 · regression guards for behaviour that was already correct", () => {
  const heroSave = compile(handlerBody(component("HeroForm"), "const save = async () =>"), [], DEPS);

  test("the admin's typed text survives every failure", async () => {
    for (const impl of [http(500), http(401), netFail, html502()]) {
      const c = await run(heroSave, impl);
      assert.equal(c.data.title_ar, ADMIN_TEXT, "the entered content was lost on failure");
    }
  });

  test("every indicator stops on success, HTTP failure and network failure", async () => {
    for (const impl of [okWith(), http(500), netFail, html502()]) {
      assert.equal((await run(heroSave, impl)).saving, false);
    }
  });

  test("endpoints, methods and payload keys are unchanged", async () => {
    const c = await run(heroSave, okWith());
    assert.equal(c.requests[0].path, "/api/admin/website-cms/hero");
    assert.equal(c.requests[0].method, "PUT");
    assert.deepEqual(
      Object.keys(JSON.parse(c.requests[0].body)).sort(),
      ["heroImageUrl", "ogImageUrl", "title_ar"],
      "the saved payload shape changed",
    );
  });

  test("success is reached only after the ok check, in every save handler", () => {
    for (const name of SAVE_FORMS) {
      const b = stripComments(handlerBody(component(name), "const save = async () =>"));
      const okAt = b.indexOf("res.ok");
      const confirmAt = b.indexOf("تم الحفظ");
      assert.ok(okAt >= 0, `${name}: no res.ok check`);
      assert.ok(confirmAt > okAt, `${name}: confirms before judging the response`);
    }
  });
});
