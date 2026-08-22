/**
 * Website CMS validation tests (audit finding H-17).
 *
 * PUT /api/admin/website-cms/:section wrote `{ ...req.body, updatedAt }` straight
 * into websiteContent/{section}, and that document is served verbatim by the PUBLIC
 * GET /api/website-content. The two image routes wrote `{ [field]: url }` with
 * `field` taken from the request body, so any key at all could be created in a
 * public document.
 *
 * Run:  node --test tests/unit/website-content-schema.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CMS_SECTIONS,
  CMS_IMAGE_FIELDS,
  CMS_IMAGE_NO_PERSIST,
  isCmsSection,
  parseWebsiteContent,
} from "../../server/websiteContentSchema.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");

/** Source with comments removed — the fixes describe the old pattern in prose. */
function code(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}
const ROUTES_CODE = code(ROUTES);

/** A realistic, fully valid payload for every section — what the admin UIs send. */
const VALID = {
  hero: {
    title_ar: "OnWay — توصيل سريع في الضلوعية",
    subtitle_ar: "اطلب من متاجرك المفضلة ووصلك خلال دقائق",
    ctaPrimary_ar: "حمّل التطبيق",
    ctaSecondary_ar: "اعرف المزيد",
    heroImageUrl: "https://storage.googleapis.com/onway/hero.webp",
  },
  features: {
    items: [
      { id: "f1", icon: "zap", title_ar: "سرعة", desc_ar: "توصيل خلال 30 دقيقة", order: 0 },
      { id: "f2", icon: "shield", title_ar: "أمان", desc_ar: "دفع عند الاستلام", order: 1 },
    ],
  },
  stats: { downloads: "50,000+", vendors: "200+", cities: "5", rating: "4.8" },
  faq: {
    items: [{ id: "q1", question_ar: "كم يستغرق التوصيل؟", answer_ar: "بين 20 و45 دقيقة", order: 0 }],
  },
  downloadLinks: {
    appStoreUrl: "https://apps.apple.com/app/onway",
    playStoreUrl: "https://play.google.com/store/apps/details?id=iq.onway",
    appStoreEnabled: true,
    playStoreEnabled: false,
  },
  screenshots: { images: ["https://storage.googleapis.com/onway/s1.webp"] },
  contact: {
    email: "info@onway.iq",
    phone: "07701234567",
    whatsapp: "9647701234567",
    instagram: "onway.iq",
    twitter: "onway_iq",
    facebook: "https://facebook.com/onway.iq",
    address_ar: "الضلوعية - الشارع العام",
  },
  seo: {
    title_ar: "OnWay — توصيل",
    description_ar: "منصة توصيل عراقية",
    keywords: "توصيل, الضلوعية, طلبات",
    ogImageUrl: "https://storage.googleapis.com/onway/og.webp",
  },
  footer: { tagline_ar: "نوصل لك كل شيء", tagline_en: "We deliver everything" },
};

describe("H-17 — 1. a valid payload for every section is accepted", () => {
  for (const section of CMS_SECTIONS) {
    test(`${section} accepts its real payload`, () => {
      const r = parseWebsiteContent(section, VALID[section]);
      assert.ok(r.ok, `rejected: ${JSON.stringify(r.ok ? "" : r.fields)}`);
      assert.deepEqual(Object.keys(r.data).sort(), Object.keys(VALID[section]).sort());
    });

    test(`${section} accepts a PARTIAL payload — the UIs save subsets with merge:true`, () => {
      const [first] = Object.keys(VALID[section]);
      const r = parseWebsiteContent(section, { [first]: VALID[section][first] });
      assert.ok(r.ok, `partial save broke for ${section}`);
    });
  }

  test("every section listed in routes.ts has a schema", () => {
    const inRoutes = ROUTES.slice(ROUTES.indexOf("const CMS_SECTIONS = ["))
      .slice(0, 220)
      .match(/"([a-zA-Z]+)"/g)
      .map((s) => s.replaceAll('"', ""));
    assert.deepEqual([...CMS_SECTIONS].sort(), inRoutes.sort(), "the two section lists drifted apart");
  });
});

describe("H-17 — 2. unknown fields are rejected", () => {
  for (const section of CMS_SECTIONS) {
    test(`${section} rejects an unknown key`, () => {
      const r = parseWebsiteContent(section, { ...VALID[section], evilField: "x" });
      assert.equal(r.ok, false, "an arbitrary key was accepted");
    });
  }

  test("a key that only LOOKS like another section's field is rejected", () => {
    assert.equal(parseWebsiteContent("stats", { title_ar: "x" }).ok, false);
    assert.equal(parseWebsiteContent("hero", { downloads: "x" }).ok, false);
  });

  test("prototype-polluting keys are rejected", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const r = parseWebsiteContent("hero", { [key]: { polluted: true } });
      assert.equal(r.ok, false, `${key} was accepted`);
    }
  });

  test("the returned object is the schema's own, not the caller's", () => {
    const input = { title_ar: "عنوان" };
    const r = parseWebsiteContent("hero", input);
    assert.ok(r.ok);
    assert.notEqual(r.data, input, "the caller's object was passed through by reference");
  });
});

describe("H-17 — 3./4./5. markup and scripts never reach storage", () => {
  const PAYLOADS = [
    ["<script>alert(1)</script>", "script tag"],
    ['<img src=x onerror=alert(1)>', "img/onerror"],
    ['<a href="javascript:alert(1)">x</a>', "javascript: anchor"],
    ["<iframe src=//evil></iframe>", "iframe"],
    ["<!-- comment -->", "html comment"],
    ["</div><b>x", "tag break-out"],
    ["<svg/onload=alert(1)>", "svg onload"],
    ["<STYLE>body{display:none}</STYLE>", "uppercase style"],
    ["< script >alert(1)< /script >", "spaced tag"],
  ];

  for (const [payload, label] of PAYLOADS) {
    test(`${label} is refused in a text field`, () => {
      const r = parseWebsiteContent("hero", { title_ar: payload });
      assert.equal(r.ok, false, `stored: ${JSON.stringify(r.ok ? r.data : null)}`);
    });

    test(`${label} is refused inside an array item too`, () => {
      const r = parseWebsiteContent("faq", {
        items: [{ id: "q1", question_ar: payload, answer_ar: "ok", order: 0 }],
      });
      assert.equal(r.ok, false);
    });
  }

  test("dangerous schemes are refused even without a tag", () => {
    for (const s of ["javascript:alert(1)", "JavaScript:alert(1)", "vbscript:msgbox", "data:text/html,<b>"]) {
      assert.equal(parseWebsiteContent("contact", { instagram: s }).ok, false, s);
    }
  });

  test("a URL field cannot hold javascript: — it must be http(s)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "ftp://x", "  javascript:x"]) {
      assert.equal(parseWebsiteContent("downloadLinks", { appStoreUrl: bad }).ok, false, bad);
    }
    assert.ok(parseWebsiteContent("downloadLinks", { appStoreUrl: "https://ok.example/a" }).ok);
    assert.ok(parseWebsiteContent("downloadLinks", { appStoreUrl: "" }).ok, "clearing must stay possible");
  });

  test("an image URL cannot be a javascript: or data: URL", () => {
    assert.equal(parseWebsiteContent("hero", { heroImageUrl: "javascript:alert(1)" }).ok, false);
    assert.equal(parseWebsiteContent("seo", { ogImageUrl: 'data:text/html,<script>alert(1)</script>' }).ok, false);
    assert.equal(parseWebsiteContent("screenshots", { images: ["javascript:alert(1)"] }).ok, false);
  });

  test("a quote or angle bracket cannot be smuggled inside a URL", () => {
    assert.equal(parseWebsiteContent("hero", { heroImageUrl: 'https://x/"onload="alert(1)' }).ok, false);
    assert.equal(parseWebsiteContent("hero", { heroImageUrl: "https://x/<script>" }).ok, false);
  });

  test("ordinary Arabic copy — including a bare < — still passes", () => {
    assert.ok(parseWebsiteContent("hero", { title_ar: "توصيل في أقل من 30 دقيقة" }).ok);
    assert.ok(parseWebsiteContent("stats", { rating: "4.8" }).ok);
    assert.ok(parseWebsiteContent("faq", {
      items: [{ id: "q1", question_ar: "التوصيل < 30 دقيقة؟", answer_ar: "نعم", order: 0 }],
    }).ok, "a bare less-than sign must not be treated as a tag");
  });

  test("values are trimmed, so leading whitespace cannot hide a payload", () => {
    const r = parseWebsiteContent("hero", { title_ar: "   عنوان   " });
    assert.ok(r.ok);
    assert.equal(r.data.title_ar, "عنوان");
    assert.equal(parseWebsiteContent("hero", { title_ar: "   <script>x</script>" }).ok, false);
  });
});

describe("H-17 — 6. length limits", () => {
  test("a text field over its maximum is refused", () => {
    assert.equal(parseWebsiteContent("hero", { title_ar: "ا".repeat(121) }).ok, false);
    assert.ok(parseWebsiteContent("hero", { title_ar: "ا".repeat(120) }).ok);
  });

  test("every section has a bounded maximum somewhere", () => {
    const OVERSIZED = "ا".repeat(5000);
    for (const section of CMS_SECTIONS) {
      const [firstText] = Object.entries(VALID[section]).find(([, v]) => typeof v === "string") ?? [];
      if (!firstText) continue;
      assert.equal(
        parseWebsiteContent(section, { [firstText]: OVERSIZED }).ok,
        false,
        `${section}.${firstText} accepted 5000 characters`,
      );
    }
  });

  test("a 1MB blob cannot be stored in any text field", () => {
    const blob = "x".repeat(1024 * 1024);
    assert.equal(parseWebsiteContent("seo", { description_ar: blob }).ok, false);
    assert.equal(parseWebsiteContent("footer", { tagline_ar: blob }).ok, false);
  });
});

describe("H-17 — 7. array limits", () => {
  const mkFeature = (i) => ({ id: `f${i}`, icon: "zap", title_ar: "ع", desc_ar: "و", order: i });
  const mkFaq = (i) => ({ id: `q${i}`, question_ar: "س", answer_ar: "ج", order: i });

  test("features are capped at 12", () => {
    assert.ok(parseWebsiteContent("features", { items: Array.from({ length: 12 }, (_, i) => mkFeature(i)) }).ok);
    assert.equal(
      parseWebsiteContent("features", { items: Array.from({ length: 13 }, (_, i) => mkFeature(i)) }).ok,
      false,
    );
  });

  test("faq is capped at 30", () => {
    assert.ok(parseWebsiteContent("faq", { items: Array.from({ length: 30 }, (_, i) => mkFaq(i)) }).ok);
    assert.equal(parseWebsiteContent("faq", { items: Array.from({ length: 31 }, (_, i) => mkFaq(i)) }).ok, false);
  });

  test("screenshots are capped at 12", () => {
    const url = "https://storage.googleapis.com/onway/s.webp";
    assert.ok(parseWebsiteContent("screenshots", { images: Array(12).fill(url) }).ok);
    assert.equal(parseWebsiteContent("screenshots", { images: Array(13).fill(url) }).ok, false);
  });

  test("an item with an unknown key is refused", () => {
    assert.equal(
      parseWebsiteContent("features", { items: [{ ...mkFeature(0), payload: "<script>" }] }).ok,
      false,
    );
  });

  test("item ids are constrained — no path separators or markup", () => {
    for (const id of ["../../etc", "a/b", "<script>", "id with spaces", "x".repeat(65)]) {
      assert.equal(parseWebsiteContent("features", { items: [{ ...mkFeature(0), id }] }).ok, false, id);
    }
  });

  test("order must be a bounded integer", () => {
    for (const order of [-1, 1000, 1.5, "0", NaN, Infinity]) {
      assert.equal(parseWebsiteContent("features", { items: [{ ...mkFeature(0), order }] }).ok, false, `${order}`);
    }
  });
});

describe("H-17 — 8. unexpected shapes are rejected", () => {
  test("a nested object where a string belongs is refused", () => {
    assert.equal(parseWebsiteContent("hero", { title_ar: { $ne: null } }).ok, false);
    assert.equal(parseWebsiteContent("hero", { title_ar: { nested: { deep: "x" } } }).ok, false);
  });

  test("a non-object body is refused outright", () => {
    for (const body of [null, undefined, "string", 42, true, ["a"], [{ title_ar: "x" }]]) {
      const r = parseWebsiteContent("hero", body);
      assert.equal(r.ok, false, `${JSON.stringify(body)} was accepted`);
    }
  });

  test("wrong primitive types are refused", () => {
    assert.equal(parseWebsiteContent("downloadLinks", { appStoreEnabled: "true" }).ok, false);
    assert.equal(parseWebsiteContent("stats", { downloads: 50000 }).ok, false);
    assert.equal(parseWebsiteContent("screenshots", { images: "not-an-array" }).ok, false);
    assert.equal(parseWebsiteContent("features", { items: { "0": {} } }).ok, false);
  });

  test("the failure report names only the admin's own field paths", () => {
    const r = parseWebsiteContent("hero", { evilField: "x", title_ar: "<b>" });
    assert.equal(r.ok, false);
    assert.ok(Array.isArray(r.fields));
    assert.ok(r.fields.length <= 10, "the field list must stay bounded");
    for (const f of r.fields) {
      assert.match(f, /^[A-Za-z0-9_.\[\]]+$/, `path leaks something else: ${f}`);
    }
  });
});

describe("H-17 — the image routes cannot invent fields", () => {
  test("each section's image fields are an explicit allowlist", () => {
    assert.deepEqual(CMS_IMAGE_FIELDS.hero, ["heroImageUrl"]);
    assert.deepEqual(CMS_IMAGE_FIELDS.seo, ["ogImageUrl"]);
    for (const section of CMS_SECTIONS) {
      assert.ok(Array.isArray(CMS_IMAGE_FIELDS[section]), `${section} has no entry`);
    }
  });

  test("sections with no image field allow none", () => {
    for (const section of ["stats", "faq", "contact", "footer", "features", "downloadLinks"]) {
      assert.deepEqual(CMS_IMAGE_FIELDS[section], []);
    }
  });

  test("the no-persist sentinels the UIs send are recognised", () => {
    assert.deepEqual([...CMS_IMAGE_NO_PERSIST], ["temp", "__array__"]);
  });

  test("the upload route checks the allowlist before writing", () => {
    const at = ROUTES.indexOf('"/api/admin/website-cms/:section/image"');
    const body = code(ROUTES.slice(at, at + 3000));
    assert.match(body, /const persistField =\s*\n?\s*\(CMS_IMAGE_FIELDS\[section as CmsSection\] as readonly string\[\]\)\.includes\(field\)/);
    assert.match(body, /حقل الصورة غير مسموح لهذا القسم/);
    assert.match(body, /if \(db && persistField\)/);
    assert.doesNotMatch(body, /if \(db && field !== "temp"\)/, "REGRESSION: the old sentinel-only check is back");
  });

  test("the delete route checks the same allowlist", () => {
    const at = ROUTES.indexOf('app.delete("/api/admin/website-cms/image"');
    const body = code(ROUTES.slice(at, at + 2400));
    assert.match(body, /const allowedField =/);
    assert.match(body, /\(CMS_IMAGE_FIELDS\[section\] as readonly string\[\]\)\.includes\(field\)/);
    assert.doesNotMatch(
      body,
      /if \(section && field && CMS_SECTIONS\.includes\(section as CmsSection\)\) \{/,
      "REGRESSION: any field name can be written again",
    );
  });

  test("isCmsSection refuses anything that is not a known section", () => {
    for (const s of CMS_SECTIONS) assert.equal(isCmsSection(s), true);
    for (const s of ["", "Hero", "../hero", null, undefined, 1, {}]) {
      assert.equal(isCmsSection(s), false, `${JSON.stringify(s)}`);
    }
  });
});

describe("H-17 — the dangerous pattern cannot come back", () => {
  // The single most important guard in this file.
  test("no route spreads req.body into websiteContent", () => {
    const at = ROUTES.indexOf('app.put("/api/admin/website-cms/:section"');
    assert.ok(at > -1, "the CMS write route is gone — did it move?");
    const body = code(ROUTES.slice(at, at + 2600));
    assert.doesNotMatch(
      body,
      /\{\s*\.\.\.req\.body/,
      "REGRESSION: an unvalidated admin payload is written to a public document again",
    );
    assert.match(body, /const parsed = parseWebsiteContent\(section as CmsSection, req\.body\);/);
    assert.match(body, /if \(!parsed\.ok\)/);
    assert.match(body, /const payload = \{ \.\.\.parsed\.data, updatedAt: (?:new Date\(\)\.toISOString\(\)|Timestamp\.now\(\)) \};/);
  });

  test("`...req.body` never reaches ANY Firestore write in routes.ts", () => {
    const offenders = [];
    for (const m of ROUTES_CODE.matchAll(/\{\s*\.\.\.req\.body[\s\S]{0,400}?\.set\(/g)) {
      offenders.push(ROUTES_CODE.slice(m.index, m.index + 80).split("\n")[0]);
    }
    assert.deepEqual(offenders, [], "a raw request body is being written to Firestore");
  });

  test("a failed parse returns 400 with a safe message and no internals", () => {
    const at = ROUTES.indexOf('app.put("/api/admin/website-cms/:section"');
    const body = code(ROUTES.slice(at, at + 2600));
    assert.match(body, /res\.status\(400\)\.json\(\{ error: "بيانات غير صالحة", fields: parsed\.fields \}\)/);
    assert.doesNotMatch(body, /err\.stack|error\.stack|JSON\.stringify\(err/);
  });

  test("9. the public GET is untouched and still caches", () => {
    const at = ROUTES.indexOf('app.get("/api/website-content"');
    const body = ROUTES.slice(at, at + 1200);
    assert.match(body, /cmsPublicCache && cmsPublicCache\.expiresAt > now/);
    assert.match(body, /res\.set\("Cache-Control", "public, max-age=60"\)/);
    assert.match(body, /return res\.json\(data\)/);
  });

  test("the public cache is still invalidated after a successful write", () => {
    const at = ROUTES.indexOf('app.put("/api/admin/website-cms/:section"');
    const body = code(ROUTES.slice(at, at + 2600));
    assert.match(body, /cmsPublicCache = null;/);
  });
});
