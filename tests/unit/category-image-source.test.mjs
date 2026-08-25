/**
 * M-3A — which image a category card actually asks for.
 *
 * The two screens that render a category icon disagreed about priority, and one of
 * them preferred a path that cannot resolve:
 *
 *   HomeScreen.get3DImage(id, image)  — the admin-uploaded image first, the
 *                                       bundled /uploads/ asset only as a fallback.
 *   CategoriesScreen.get3DImage(id)   — /uploads/ FIRST and unconditionally; the
 *                                       uploaded image was reached only for a
 *                                       category id absent from the map.
 *
 * `uploads/` does not exist in the repository. server/index.ts keeps the mount as a
 * documented "legacy read-only" path for documents written before the migration to
 * Firebase Storage, and notes that the directory lived on a VM disk "wiped on every
 * redeploy". So on "عرض جميع الأقسام" all fourteen mapped categories requested a
 * dead URL and the picture the admin had uploaded was never even tried.
 *
 * The functions below are lifted out of the shipped screens and executed. The
 * /uploads entries are deliberately NOT deleted — requirement 3 — they are demoted
 * to last resort.
 *
 * Run:  node --test tests/unit/category-image-source.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = createRequire(import.meta.url)("typescript");
const read = (p) => readFileSync(join(root, p), "utf8");

const HOME = read("client/screens/HomeScreen.tsx");
const CATS = read("client/screens/CategoriesScreen.tsx");
const SHARED_PATH = "client/constants/categoryImages.ts";

const API = "https://api.onway.iq";
const STORAGE =
  "https://firebasestorage.googleapis.com/v0/b/onway-74c20.firebasestorage.app/o/admin-images%2Fcategory%2Fabc.webp?alt=media&token=t";

/** The real resolveImageUrl, lifted, with a stubbed API host. */
const resolveImageUrl = (() => {
  const src = read("client/utils/imageUtils.ts");
  const at = src.indexOf("export function resolveImageUrl");
  let i = src.indexOf("{", src.indexOf(")", at));
  let d = 0,
    end = i;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}" && --d === 0) {
      end = j + 1;
      break;
    }
  }
  const js = ts.transpileModule(
    `function resolveImageUrl(image, quality = 80) ${src.slice(i, end)}\nreturn resolveImageUrl;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } },
  ).outputText;
  return new Function("getApiUrlSafe", js)(() => API);
})();

/** Lift `const <name> = (...) => { ... }` and run it with injected bindings. */
function liftArrow(src, name, deps) {
  const at = src.search(new RegExp(`const ${name} = \\(`));
  assert.notEqual(at, -1, `${name} not found`);
  const open = src.indexOf("{", src.indexOf("=>", at));
  let d = 0,
    end = open;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}" && --d === 0) {
      end = j + 1;
      break;
    }
  }
  const params = src.slice(src.indexOf("(", at), src.indexOf("=>", at)).trim().replace(/^\(|\)$/g, "");
  const js = ts.transpileModule(`function fn(${params}) ${src.slice(open, end)}\nreturn fn;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
  }).outputText;
  const names = Object.keys(deps);
  return new Function(...names, js)(...names.map((n) => deps[n]));
}

/** The CATEGORY_3D_IMAGES literal out of a file. */
function liftMap(src) {
  const at = src.indexOf("const CATEGORY_3D_IMAGES");
  const open = src.indexOf("{", at);
  return new Function(`return ${src.slice(open, src.indexOf("};", at) + 1)}`)();
}

// ── the legacy path is genuinely dead ───────────────────────────────────────

describe("M-3A · the /uploads mount is legacy and empty", () => {
  test("the repository ships no uploads/ directory", () => {
    assert.equal(existsSync(join(root, "uploads")), false);
  });

  test("the server still serves it read-only, so nothing is deleted", () => {
    const index = read("server/index.ts");
    assert.match(index, /app\.use\("\/uploads", express\.static\(/);
  });

  test("the fallback map still names every legacy asset — none removed", () => {
    const map = liftMap(read(SHARED_PATH));
    assert.equal(Object.keys(map).length, 14);
    for (const v of Object.values(map)) assert.match(v, /^\/uploads\//);
  });
});

// ── one map, not two ────────────────────────────────────────────────────────

describe("M-3A · the fallback map lives in one place", () => {
  test("a shared module owns it", () => {
    assert.ok(existsSync(join(root, SHARED_PATH)), `${SHARED_PATH} is missing`);
  });

  test("neither screen declares its own copy any more", () => {
    for (const [name, src] of [["HomeScreen", HOME], ["CategoriesScreen", CATS]]) {
      assert.doesNotMatch(
        stripComments(src),
        /const CATEGORY_3D_IMAGES/,
        `${name} still declares a private copy — the two had already drifted on "restaurants"`,
      );
    }
  });

  test("both screens read the shared source", () => {
    for (const src of [HOME, CATS]) {
      assert.match(src, /from "@\/constants\/categoryImages"/);
    }
  });
});

// ── priority, executed ──────────────────────────────────────────────────────

describe("M-3A · the uploaded image wins on every screen", () => {
  const pick = (() => {
    const src = read(SHARED_PATH);
    const at = src.indexOf("export function categoryImageSource");
    const open = src.indexOf("{", src.indexOf(")", at));
    let d = 0,
      end = open;
    for (let j = open; j < src.length; j++) {
      if (src[j] === "{") d++;
      else if (src[j] === "}" && --d === 0) {
        end = j + 1;
        break;
      }
    }
    const js = ts.transpileModule(
      `function pick(categoryId, image) ${src.slice(open, end)}\nreturn pick;`,
      { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } },
    ).outputText;
    return new Function("CATEGORY_3D_IMAGES", "resolveImageUrl", js)(liftMap(src), resolveImageUrl);
  })();

  // A · a Storage URL is used
  test("A · a Firebase Storage URL is used as-is", () => {
    assert.equal(pick("restaurants", STORAGE), STORAGE);
  });

  test("A · a Storage URL wins even for a category that has a legacy asset", () => {
    for (const id of Object.keys(liftMap(read(SHARED_PATH)))) {
      assert.equal(pick(id, STORAGE), STORAGE, `${id} preferred its /uploads asset`);
    }
  });

  // B · a relative seed path resolves against the API host
  test("B · a /assets/seed/... path resolves against the API host", () => {
    assert.equal(
      pick("restaurants", "/assets/seed/category-restaurants.png"),
      `${API}/assets/seed/category-restaurants.png`,
    );
  });

  test("B · a data: URI is passed through untouched", () => {
    const uri = "data:image/png;base64,AAAA";
    assert.equal(pick("baby", uri), uri);
  });

  // C · empty image falls back
  test("C · an empty image falls back to the legacy asset, resolved", () => {
    assert.equal(pick("baby", ""), `${API}/uploads/category-3d-baby.png`);
  });

  test("C · an empty image with no legacy asset yields an empty source", () => {
    assert.equal(pick("no-such-category", ""), "");
  });

  // D · the legacy path is never preferred over a real image
  test("D · /uploads is never chosen while a usable image exists", () => {
    const map = liftMap(read(SHARED_PATH));
    for (const [id, legacy] of Object.entries(map)) {
      for (const img of [STORAGE, "/assets/seed/category-x.png", "data:image/png;base64,AA"]) {
        const got = pick(id, img);
        assert.ok(!got.includes(legacy), `${id} fell back to ${legacy} despite having an image`);
      }
    }
  });

  // E · nothing throws, and the caller always gets a string
  test("E · missing, null and undefined images never throw", () => {
    for (const bad of [undefined, null, "", "   "]) {
      const got = pick("baby", bad);
      assert.equal(typeof got, "string");
    }
    assert.equal(typeof pick(undefined, undefined), "string");
  });
});

// ── the screens actually call it ────────────────────────────────────────────

describe("M-3A · both screens route through the shared picker", () => {
  test("CategoriesScreen passes item.image, not just the id", () => {
    const clean = stripComments(CATS);
    assert.match(clean, /categoryImageSource\(\s*item\.id\s*,\s*item\.image\s*\)/);
    assert.doesNotMatch(
      clean,
      /const image3D = get3DImage\(item\.id\);/,
      "the id-only lookup that skipped the uploaded image is back",
    );
  });

  test("HomeScreen passes category.image too", () => {
    assert.match(stripComments(HOME), /categoryImageSource\(\s*category\.id\s*,\s*category\.image\s*\)/);
  });

  test("CategoriesScreen renders a fallback when no source resolves", () => {
    const clean = stripComments(CATS);
    assert.match(clean, /onError/, "a failed load is still silent");
  });
});

// ── nothing else moved ──────────────────────────────────────────────────────

describe("M-3A · layout and contract untouched", () => {
  test("the icon boxes keep their sizes: 70 on Home, 100 on Categories", () => {
    assert.match(HOME, /catImage: \{\s*width: 70,\s*height: 70,/);
    assert.match(CATS, /image: \{\s*width: 100,\s*height: 100,/);
  });

  test("contentFit stays contain on both", () => {
    assert.match(HOME, /contentFit="contain"/);
    assert.match(CATS, /contentFit="contain"/);
  });

  test("category ids are unchanged in the shared map", () => {
    const map = liftMap(read(SHARED_PATH));
    const expected = [
      "restaurants", "fruits-vegetables", "meat-poultry", "dairy-eggs", "cleaning-care",
      "beverages", "snacks-sweets", "tea-coffee", "baby", "flowers", "delivery",
      "pharmacy", "women-bags", "international-shopping",
    ];
    assert.deepEqual(Object.keys(map).sort(), expected.sort());
  });
});
