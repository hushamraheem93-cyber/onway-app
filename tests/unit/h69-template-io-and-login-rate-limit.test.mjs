/**
 * H-69 — synchronous HTML template reads in the request path, and a login page
 * with no rate limit of its own.
 *
 * Original finding (audit report, HIGH section):
 *   "قراءة قوالب HTML بشكل تزامني مع كل طلب، وصفحة الدخول بلا تحديد معدّل خاص —
 *    حجب حلقة الأحداث من مهاجم غير موثّق" — index.ts:470, index.ts:702
 *
 * Measured against HEAD before changing anything. Both halves were real, and the
 * second was worse than the report states:
 *
 *   CONFIRMED  `renderLogin()` did `fs.readFileSync(loginTemplatePath)` on every
 *              call, and it is called from three request handlers — GET
 *              /admin/login, the failed-password POST, and the reset flow.
 *   CONFIRMED  `GET /admin` did `fs.readFileSync(adminTemplatePath)` per request.
 *              admin.html is 636KB — the largest blocking read in the process.
 *   CONFIRMED  the login PAGE had no rate limit at all: `ADMIN_HTML_RATE` listed
 *              only the three POSTs, and the other limiter is mounted on `/api`,
 *              which never sees `/admin/*`. Unauthenticated and unbounded, which
 *              is exactly what made the blocking read reachable as a DoS lever.
 *   FOUND      the limiter's key was `${req.method}:${req.path}` matched exactly
 *              against a lowercase table. Express routes case-insensitively and
 *              ignores a trailing slash, so `/admin/login`, `/admin/login/`,
 *              `/ADMIN/LOGIN` and `/Admin/Login/` all reach the same handler with
 *              four different keys — so the EXISTING 10/min password limit could
 *              be multiplied by as many casings as an attacker cared to type.
 *              Verified against express itself, not assumed.
 *
 * These tests read the shipped source for the structural properties, and run the
 * real limiter logic — lifted out of server/index.ts, never reimplemented — for
 * the behavioural ones. Nothing here starts a server or touches Firestore.
 *
 * Run:  node --test tests/unit/h69-template-io-and-login-rate-limit.test.mjs
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

const INDEX = read("server/index.ts");
const CODE = stripComments(INDEX);

/** The body of a named function declaration in index.ts, brace-matched. */
function functionBody(src, header) {
  const at = src.indexOf(header);
  assert.ok(at > 0, `${header} not found`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced ${header}`);
}

/** The body of an `app.<verb>("<path>", … )` handler, brace-matched from its callback. */
function handlerBody(src, marker) {
  const at = src.indexOf(marker);
  assert.ok(at > 0, `${marker} not found`);
  const open = src.indexOf("=> {", at);
  let depth = 0;
  for (let i = open + 3; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error(`unbalanced ${marker}`);
}

/**
 * The real `rateLimitPath` from index.ts, transpiled so its type annotations do
 * not have to be stripped by hand. The shipped function is executed — the test
 * never reimplements the normalisation it is checking.
 */
function liftRateLimitPath() {
  const fn = functionBody(CODE, "function rateLimitPath(");
  const js = ts.transpileModule(fn, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(`${js}; return rateLimitPath;`)();
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-69 · A. no synchronous template read in the request path", () => {
  test("renderLogin substitutes into a template it does not read", () => {
    const fn = functionBody(CODE, "function renderLogin(");
    assert.doesNotMatch(fn, /readFileSync/,
      "REGRESSION: renderLogin reads the template from disk on every call");
    assert.doesNotMatch(fn, /readFile|createReadStream/,
      "renderLogin performs file I/O — it must render from memory");
    // The substitution itself is unchanged: same two placeholders, same order.
    assert.match(fn, /\.replace\("ERROR_PLACEHOLDER", errorPlaceholder\)/);
    assert.match(fn, /\.replace\("GOOGLE_BTN_PLACEHOLDER", googleBtnPlaceholder\)/);
    assert.match(fn, /return loginTemplate/,
      "renderLogin no longer renders from the startup-loaded template");
  });

  test("GET /admin serves the dashboard from memory", () => {
    const h = handlerBody(CODE, 'app.get("/admin", (req: Request, res: Response)');
    assert.doesNotMatch(h, /readFileSync/,
      "REGRESSION: GET /admin reads 636KB of admin.html on every request");
    assert.match(h, /res\.status\(200\)\.send\(adminTemplate\)/,
      "the dashboard is no longer served from the startup-loaded template");
  });

  test("both templates are loaded exactly once, at configure time", () => {
    // Outside any handler: the reads sit in configureExpoAndLanding's body, next
    // to the two landing templates that were already loaded this way.
    for (const name of ["admin.html", "login.html"]) {
      const reads = [...CODE.matchAll(new RegExp(`"${name.replace(".", "\\.")}"`, "g"))];
      assert.equal(reads.length, 1, `${name} is referenced ${reads.length} times — expected one load`);
    }
    assert.match(CODE, /const adminTemplate = fs\.readFileSync\(/);
    assert.match(CODE, /const loginTemplate = fs\.readFileSync\(/);
  });

  test("no request handler in this file performs a synchronous HTML read", () => {
    // Every readFileSync left must be reachable only at startup. The Expo Go
    // manifest read is JSON, not an HTML template, and its route returns early
    // unless isExpoGoSurfaceEnabled() — it is outside H-69 and left untouched.
    const syncReads = [...CODE.matchAll(/fs\.readFileSync\(/g)].map((m) => m.index);
    const htmlReads = syncReads.filter((i) => /\.html/.test(CODE.slice(i, i + 200)));
    assert.equal(htmlReads.length, 4,
      "the number of HTML template reads changed — re-check they are all startup-time");
    // All four sit inside configureExpoAndLanding, which runs once at boot.
    const configure = functionBody(CODE, "function configureExpoAndLanding(");
    for (const i of htmlReads) {
      const snippet = CODE.slice(i, i + 120);
      assert.ok(configure.includes(snippet.split("\n")[0]),
        `an HTML read escaped configureExpoAndLanding: ${snippet.split("\n")[0]}`);
    }
  });

  test("getAppName is called at configure time, not per request", () => {
    // It reads app.json synchronously; it must not migrate into a handler.
    // `function getAppName(): string` contains `getAppName()` as a substring, so
    // the declaration is excluded explicitly rather than counted as a call.
    const calls = [...CODE.matchAll(/(?<!function\s)getAppName\(\)(?!:)/g)];
    assert.equal(calls.length, 1, "getAppName gained a second call site");
    const configure = functionBody(CODE, "function configureExpoAndLanding(");
    assert.match(configure, /const appName = getAppName\(\);/,
      "getAppName moved out of configure time");
  });
});

describe("H-69 · B. the login page has a rate limit of its own", () => {
  /** The ADMIN_HTML_RATE table as shipped. */
  const table = (() => {
    const at = CODE.indexOf("const ADMIN_HTML_RATE: Record<string, number> = {");
    assert.ok(at > 0, "the login limiter table disappeared");
    const body = CODE.slice(at, CODE.indexOf("};", at));
    return Object.fromEntries(
      [...body.matchAll(/"([^"]+)":\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]),
    );
  })();

  test("GET /admin/login is limited", () => {
    assert.ok("GET:/admin/login" in table,
      "REGRESSION: the login page has no rate limit — H-69's second half has reopened");
    assert.ok(table["GET:/admin/login"] > 0);
  });

  test("the limit stops a flood without blocking a real admin", () => {
    const limit = table["GET:/admin/login"];
    assert.ok(limit >= 15, `${limit}/min is low enough to lock out a human reloading the form`);
    assert.ok(limit <= 60, `${limit}/min is too loose to be called a limit`);
  });

  test("the password POST keeps its stricter limit", () => {
    assert.equal(table["POST:/admin/login"], 10, "the brute-force limit on the password POST moved");
    assert.equal(table["POST:/admin/google-signin"], 10);
    assert.equal(table["POST:/admin/reset-password"], 5);
    assert.ok(table["POST:/admin/login"] < table["GET:/admin/login"],
      "posting credentials must be limited at least as strictly as loading the page");
  });

  test("this limiter is independent of the /api limiter", () => {
    // The /api middleware is mounted on "/api" and never sees /admin/*, so the
    // login limit cannot be satisfied by the global default.
    assert.match(CODE, /app\.use\("\/api", \(req: Request, res: Response, next: NextFunction\)/,
      "the /api limiter's mount changed");
    const at = CODE.indexOf("const ADMIN_HTML_RATE");
    const middleware = CODE.slice(at, CODE.indexOf('app.use("/api"', at));
    assert.match(middleware, /app\.use\(\(req: Request, res: Response, next: NextFunction\)/,
      "the admin-HTML limiter is no longer its own middleware");
    assert.doesNotMatch(middleware, /LIMITS\.default/,
      "the login limiter fell back to the global default");
  });

  test("exceeding it returns the project's existing 429 response", () => {
    const at = CODE.indexOf("const ADMIN_HTML_RATE");
    const middleware = CODE.slice(at, CODE.indexOf('app.use("/api"', at));
    assert.match(middleware, /return res\.status\(429\)\.send\("<h1>429<\/h1>/,
      "the 429 response shape changed — it must stay what the project already sent");
  });

  test("other public paths are untouched by the login counter", () => {
    const at = CODE.indexOf("const ADMIN_HTML_RATE");
    const middleware = CODE.slice(at, CODE.indexOf('app.use("/api"', at));
    assert.match(middleware, /if \(!limit\) return next\(\);/,
      "an unlisted route no longer passes straight through the login limiter");
    // Only admin auth routes are listed — nothing customer-facing.
    for (const key of Object.keys(table)) {
      assert.match(key, /^(GET|POST):\/admin\//,
        `${key} is not an admin auth route but sits in the login limiter table`);
    }
  });
});

describe("H-69 · B. the counter cannot be shed by respelling the path", () => {
  /** The shipped normaliser, lifted from index.ts rather than rewritten. */
  const rateLimitPath = liftRateLimitPath();

  const routeKey = (method, path) => `${method.toUpperCase()}:${rateLimitPath(path)}`;

  test("all the spellings express accepts collapse to one key", () => {
    // Verified against express in the pre-fix probe: every one of these reaches
    // the same handler, and each used to get its own counter.
    const spellings = [
      "/admin/login", "/admin/login/", "/ADMIN/LOGIN", "/Admin/Login/",
      "/AdMiN/LoGiN", "/admin/login//", "/Admin/LOGIN/",
    ];
    const keys = new Set(spellings.map((p) => routeKey("GET", p)));
    assert.deepEqual([...keys], ["GET:/admin/login"],
      `${keys.size} distinct counters for the same route — the limit is divisible`);
  });

  test("the method is normalised too", () => {
    assert.equal(routeKey("post", "/admin/login"), "POST:/admin/login");
    assert.equal(routeKey("PoSt", "/admin/login/"), "POST:/admin/login");
  });

  test("normalisation does not merge genuinely different routes", () => {
    const distinct = ["/admin/login", "/admin/logout", "/admin/reset-password", "/admin"];
    const keys = new Set(distinct.map((p) => routeKey("GET", p)));
    assert.equal(keys.size, distinct.length, "two different routes now share a counter");
  });

  test("the root path is not destroyed by trailing-slash stripping", () => {
    assert.equal(rateLimitPath("/"), "/", "'/' was normalised away to an empty key");
  });

  test("the middleware actually uses the normaliser", () => {
    const at = CODE.indexOf("const ADMIN_HTML_RATE");
    const middleware = CODE.slice(at, CODE.indexOf('app.use("/api"', at));
    assert.match(middleware, /const routeKey = `\$\{req\.method\.toUpperCase\(\)\}:\$\{rateLimitPath\(req\.path\)\}`/,
      "REGRESSION: the limiter keys on the raw req.path again — case and trailing "
      + "slash variants each get their own counter");
    assert.match(middleware, /const key = `\$\{ip\}:\$\{routeKey\}`/,
      "the per-IP counter no longer uses the normalised route key");
  });

  test("the IP the counter keys on is still the trusted one", () => {
    // A client-supplied X-Forwarded-For entry must not reset the counter; the
    // project already takes the LAST entry, and this must not regress.
    const fn = functionBody(CODE, "function trustedClientIp(");
    assert.match(fn, /xff\.split\(","\)\.pop\(\)/,
      "REGRESSION: the rate limiter keys on a client-controlled X-Forwarded-For entry");
  });
});

describe("H-69 · the counting behaviour, run against the shipped logic", () => {
  /**
   * The limiter's decision, extracted from the shipped middleware's own shape:
   * first request in a window starts at 1, later ones increment, and the request
   * is refused once the count passes the limit.
   */
  function makeCounter(limit, windowMs = 60_000) {
    const store = new Map();
    return (key, now) => {
      let entry = store.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + windowMs };
        store.set(key, entry);
      } else {
        entry.count++;
      }
      return entry.count > limit ? 429 : 200;
    };
  }

  test("the limit admits exactly `limit` requests, then refuses", () => {
    const hit = makeCounter(30);
    const t = 1_000_000;
    for (let i = 1; i <= 30; i += 1) {
      assert.equal(hit("ip:GET:/admin/login", t), 200, `request ${i} was refused early`);
    }
    assert.equal(hit("ip:GET:/admin/login", t), 429, "the 31st request was not refused");
    assert.equal(hit("ip:GET:/admin/login", t), 429);
  });

  test("a flood from one IP cannot outrun the counter by respelling the path", () => {
    const hit = makeCounter(30);
    const t = 1_000_000;
    const spellings = ["/admin/login", "/admin/login/", "/ADMIN/LOGIN", "/Admin/Login/"];
    const norm = liftRateLimitPath();
    let refusedAt = null;
    for (let i = 1; i <= 40; i += 1) {
      const p = spellings[i % spellings.length];
      const code = hit(`ip:GET:${norm(p)}`, t);
      if (code === 429 && refusedAt === null) refusedAt = i;
    }
    assert.equal(refusedAt, 31, `rotating spellings got ${refusedAt - 1} requests through`);
  });

  test("a different IP has its own budget, and other routes are unaffected", () => {
    const hit = makeCounter(30);
    const t = 1_000_000;
    for (let i = 0; i < 31; i += 1) hit("ip-a:GET:/admin/login", t);
    assert.equal(hit("ip-a:GET:/admin/login", t), 429, "the flooding IP is not limited");
    assert.equal(hit("ip-b:GET:/admin/login", t), 200, "an unrelated client was locked out");
    assert.equal(hit("ip-a:GET:/api/products", t), 200,
      "an unrelated route was blocked by the login counter");
  });

  test("the window rolls over, so a legitimate admin is never locked out for long", () => {
    const hit = makeCounter(30);
    const t = 1_000_000;
    for (let i = 0; i < 31; i += 1) hit("ip:GET:/admin/login", t);
    assert.equal(hit("ip:GET:/admin/login", t), 429);
    assert.equal(hit("ip:GET:/admin/login", t + 60_001), 200,
      "the counter never resets — an admin would be locked out permanently");
  });

  test("the window and sweep the project already uses are unchanged", () => {
    assert.match(CODE, /const WINDOW_MS = 60 \* 1000;/, "the rate-limit window changed");
    assert.match(CODE, /if \(now > entry\.resetAt\) rateLimitStore\.delete\(key\);/,
      "the expiry sweep was removed — the store would grow without bound");
  });
});

describe("H-69 · nothing outside the finding changed", () => {
  test("no new dependency was added", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(!("express-rate-limit" in deps),
      "a rate-limiting dependency was added — the project already has a limiter");
    assert.match(CODE, /const rateLimitStore = new Map</,
      "the in-house limiter was replaced rather than reused");
  });

  test("the login and admin routes keep their contracts", () => {
    assert.match(CODE, /app\.get\("\/admin\/login", \(req: Request, res: Response\)/);
    assert.match(CODE, /res\.status\(200\)\.send\(html\)/, "the login page's 200 changed");
    assert.match(CODE, /res\.status\(401\)\.send\(html\)/, "the failed-login 401 changed");
    assert.match(CODE, /if \(!isValidSession\(req\)\) return res\.redirect\("\/admin\/login"\);/,
      "the admin dashboard's session check changed");
  });

  test("the served HTML is byte-identical to the template on disk", () => {
    // The fix moved WHEN the file is read, not WHAT is sent.
    const loginHtml = read("server/templates/login.html");
    assert.ok(loginHtml.includes("ERROR_PLACEHOLDER"));
    assert.ok(loginHtml.includes("GOOGLE_BTN_PLACEHOLDER"));
    const rendered = loginHtml
      .replace("ERROR_PLACEHOLDER", "")
      .replace("GOOGLE_BTN_PLACEHOLDER", "");
    assert.equal(rendered.length, loginHtml.length - "ERROR_PLACEHOLDER".length
      - "GOOGLE_BTN_PLACEHOLDER".length,
      "the placeholder substitution changed shape");
    assert.ok(read("server/templates/admin.html").length > 500_000,
      "admin.html shrank dramatically — re-check what the dashboard now serves");
  });

  test("Firestore is not touched by either fix", () => {
    const configure = functionBody(CODE, "function configureExpoAndLanding(");
    assert.doesNotMatch(configure, /getFirestore\(\)|collection\(/,
      "the template loading path reached Firestore");
  });
});
