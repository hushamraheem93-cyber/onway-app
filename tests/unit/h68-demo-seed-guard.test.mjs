/**
 * H-68 — the demo/catalogue seed guard fails open.
 *
 * Original finding (audit report, HIGH section):
 *   "بذر متاجر تجريبية محمي بنفس سلسلة NODE_ENV — متغيّر مفقود يسمح بحقن كتالوج
 *    وهمي في الإنتاج بطلب إداري واحد" — routes.ts
 *
 * Verified against HEAD before changing anything:
 *
 *   CONFIRMED  `POST /api/admin/seed-demo-stores` denied only when NODE_ENV was
 *              the exact string "production" OR REPLIT_DEPLOYMENT was exactly "1".
 *              Anything else — unset, "Production", "prod", a trailing space —
 *              fell through and the seed ran.
 *   CONFIRMED  the endpoint IS behind auth (`app.use("/api/admin", requireAdminAuth)`),
 *              so the report's "one admin request" is accurate: admin rights plus a
 *              fail-open environment check were the whole protection.
 *   CONFIRMED  the risk is live. `.replit` publishes with
 *              `run = ["sh", "-c", "node server_dist/index.js"]` and sets no
 *              NODE_ENV, so everything rested on REPLIT_DEPLOYMENT being "1".
 *   FOUND      two more paths to demo data: server/seed-data.ts had the same
 *              fail-open shape, and scripts/seed-test-data.mjs had no guard at all.
 *   FOUND      testing REPLIT_DEPLOYMENT for the exact string "1" is the same
 *              mistake one level down — "true"/"yes"/" 1" would not have denied.
 *              Presence is now the signal.
 *
 * The guard is one plain-JavaScript module, `shared/seedGuard.mjs`, imported by all
 * three seed paths — the server (via server/env.ts), the tsx-run CLI seeder, and
 * the bare-node script. These tests import that same module directly; nothing here
 * reimplements the rule, and nothing here touches Firestore.
 *
 * Run:  node --test tests/unit/h68-demo-seed-guard.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

import {
  DEMO_SEED_OPT_IN,
  DEMO_SEED_OPT_IN_VALUE,
  NON_PRODUCTION_NODE_ENVS,
  demoSeedDenialReason,
  isDemoSeedAllowed,
} from "../../shared/seedGuard.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = stripComments(read("server/routes.ts"));
const ENV_TS = read("server/env.ts");
const SEED_TS = stripComments(read("server/seed-data.ts"));
const SEED_MJS = read("scripts/seed-test-data.mjs");
const GUARD = read("shared/seedGuard.mjs");
const REPLIT = read(".replit");
const PM2 = read("ecosystem.config.js");

/**
 * The guard takes its environment as an argument, so every case below is a pure
 * call — `process.env` is never mutated and no test can leak into another.
 */
const allowed = (env) => isDemoSeedAllowed(env);
const reason = (env) => demoSeedDenialReason(env);

/** The one combination that should be able to seed. */
const DEV_OK = { NODE_ENV: "development", [DEMO_SEED_OPT_IN]: DEMO_SEED_OPT_IN_VALUE };

// ─────────────────────────────────────────────────────────────────────────────
describe("H-68 · 11.1 NODE_ENV absent ⇒ DENY", () => {
  test("a completely empty environment denies", () => {
    assert.equal(allowed({}), false);
    assert.notEqual(reason({}), null);
  });

  test("NODE_ENV absent even with the opt-in denies", () => {
    // This is the exact state `.replit` publishes in, and the whole finding.
    assert.equal(allowed({ [DEMO_SEED_OPT_IN]: "true" }), false,
      "an unset NODE_ENV permits seeding again — H-68 has reopened");
    assert.match(reason({ [DEMO_SEED_OPT_IN]: "true" }), /NODE_ENV/);
  });

  test("the pre-fix guard would have permitted exactly that case", () => {
    // A record of the defect, so this file still explains it if the code comment
    // is ever lost. Not a test of our code.
    const env = {};
    const oldGuardDenies =
      env.NODE_ENV === "production" || env.REPLIT_DEPLOYMENT === "1";
    assert.equal(oldGuardDenies, false, "the pre-fix guard no longer fails open");
    assert.equal(allowed(env), false, "the new guard must deny it");
  });
});

describe("H-68 · 11.2 NODE_ENV unexpected ⇒ DENY", () => {
  test("every near-miss spelling of production denies", () => {
    for (const v of ["Production", "PRODUCTION", "prod", "production ", " production",
                     "prod-eu", "live", "release", "", "1", "dev", "develop"]) {
      const env = { NODE_ENV: v, [DEMO_SEED_OPT_IN]: "true" };
      assert.equal(allowed(env), false, `NODE_ENV=${JSON.stringify(v)} was treated as safe`);
      assert.match(reason(env), /NODE_ENV/);
    }
  });

  test("staging is not a seeding environment", () => {
    // Deliberate tightening: a staging deployment normally points at the live
    // Firestore project, which is the database this guard exists to protect.
    assert.equal(allowed({ NODE_ENV: "staging", [DEMO_SEED_OPT_IN]: "true" }), false);
    assert.ok(!NON_PRODUCTION_NODE_ENVS.includes("staging"));
  });

  test("the allowlist is exactly the two safe environments", () => {
    assert.deepEqual([...NON_PRODUCTION_NODE_ENVS], ["development", "test"]);
  });
});

describe("H-68 · 11.3 + 11.4 REPLIT_DEPLOYMENT", () => {
  test("absent REPLIT_DEPLOYMENT does not by itself grant anything", () => {
    // Requirement 11.3. Absence is the normal local state, so it must not be the
    // thing that permits — the other two conditions still decide.
    assert.equal(allowed({}), false);
    assert.equal(allowed({ REPLIT_DEPLOYMENT: undefined }), false);
    assert.equal(allowed({ NODE_ENV: "production", REPLIT_DEPLOYMENT: undefined }), false);
  });

  test("any REPLIT_DEPLOYMENT value denies — not just the exact string \"1\"", () => {
    // Requirement 11.4, and the residual fail-open found in HEAD: the guard tested
    // `=== "1"`, so a future "true"/"yes"/" 1" would have sailed past it.
    for (const v of ["1", "true", "TRUE", "yes", "0", " 1", "1 ", "deployed", "x"]) {
      const env = { ...DEV_OK, REPLIT_DEPLOYMENT: v };
      assert.equal(allowed(env), false,
        `REPLIT_DEPLOYMENT=${JSON.stringify(v)} did not deny`);
      assert.match(reason(env), /REPLIT_DEPLOYMENT/);
    }
  });

  test("an empty REPLIT_DEPLOYMENT is treated as absent", () => {
    // Some shells export an empty string rather than unsetting; that is not a
    // deployment, and treating it as one would break local development.
    assert.equal(allowed({ ...DEV_OK, REPLIT_DEPLOYMENT: "" }), true);
    assert.equal(allowed({ ...DEV_OK, REPLIT_DEPLOYMENT: "   " }), true);
  });
});

describe("H-68 · 11.5 production ⇒ DENY", () => {
  test("production denies with and without the opt-in", () => {
    assert.equal(allowed({ NODE_ENV: "production" }), false);
    assert.equal(allowed({ NODE_ENV: "production", [DEMO_SEED_OPT_IN]: "true" }), false,
      "an env var can now enable demo seeding in production");
  });

  test("the opt-in cannot unlock a published deployment either", () => {
    assert.equal(allowed({ ...DEV_OK, REPLIT_DEPLOYMENT: "1" }), false);
  });

  test("each condition alone denies", () => {
    for (const drop of ["NODE_ENV", DEMO_SEED_OPT_IN]) {
      const env = { ...DEV_OK };
      delete env[drop];
      assert.equal(allowed(env), false, `dropping ${drop} still permitted the seed`);
    }
    assert.equal(allowed({ ...DEV_OK, REPLIT_DEPLOYMENT: "1" }), false);
  });
});

describe("H-68 · 11.6 + 11.7 the explicitly-authorised environment ⇒ ALLOW", () => {
  test("development and test with the opt-in are permitted", () => {
    assert.equal(allowed(DEV_OK), true);
    assert.equal(reason(DEV_OK), null);
    assert.equal(allowed({ NODE_ENV: "test", [DEMO_SEED_OPT_IN]: "true" }), true);
  });

  test("case and surrounding whitespace in NODE_ENV are tolerated", () => {
    for (const v of ["Development", "DEVELOPMENT", " development ", "Test", "TEST"]) {
      assert.equal(allowed({ NODE_ENV: v, [DEMO_SEED_OPT_IN]: "true" }), true,
        `NODE_ENV=${JSON.stringify(v)} was refused`);
    }
  });

  test("the opt-in must be exactly its authorised value", () => {
    // Requirement 11.7: opt-in ⇒ ALLOW only when the contract is actually met.
    for (const v of ["", "false", "TRUE", "True", "1", "yes", "true ", " true", "0", "y"]) {
      assert.equal(allowed({ NODE_ENV: "development", [DEMO_SEED_OPT_IN]: v }), false,
        `${DEMO_SEED_OPT_IN}=${JSON.stringify(v)} was accepted`);
    }
    assert.equal(DEMO_SEED_OPT_IN_VALUE, "true");
  });

  test("a developer who has not opted in is refused, and told what to set", () => {
    const env = { NODE_ENV: "development" };
    assert.equal(allowed(env), false);
    assert.match(reason(env), /ALLOW_DEMO_SEED/,
      "the refusal does not name the variable to set");
  });

  test("the decision is re-read on every call, never cached", () => {
    assert.equal(allowed({ NODE_ENV: "production", [DEMO_SEED_OPT_IN]: "true" }), false);
    assert.equal(allowed(DEV_OK), true, "the answer was memoised");
    assert.equal(allowed({ NODE_ENV: "production", [DEMO_SEED_OPT_IN]: "true" }), false);
  });
});

describe("H-68 · 6. every deployment path this project actually uses", () => {
  test("the PM2 production path denies", () => {
    // ecosystem.config.js sets NODE_ENV=production.
    assert.match(PM2, /NODE_ENV:\s*"production"/,
      "the PM2 config stopped setting NODE_ENV — re-check what it deploys with");
    assert.equal(allowed({ NODE_ENV: "production", [DEMO_SEED_OPT_IN]: "true" }), false);
  });

  test("the Replit published path denies — with or without REPLIT_DEPLOYMENT", () => {
    // .replit runs the server with no NODE_ENV at all. That is the case the old
    // guard let through, and it must deny on the NODE_ENV axis alone, so the
    // protection does not depend on Replit setting anything.
    assert.match(REPLIT, /run = \["sh", "-c", "node server_dist\/index\.js"\]/,
      "the .replit run command changed — re-check whether it now sets NODE_ENV");
    assert.doesNotMatch(REPLIT, /NODE_ENV/,
      ".replit now sets NODE_ENV — the premise of this test changed");
    assert.equal(allowed({ [DEMO_SEED_OPT_IN]: "true" }), false,
      "the published Replit deployment can seed again");
    assert.equal(allowed({ [DEMO_SEED_OPT_IN]: "true", REPLIT_DEPLOYMENT: "1" }), false);
  });

  test("the local development path still works, deliberately", () => {
    assert.equal(allowed(DEV_OK), true);
  });
});

describe("H-68 · 11.8 every seed path uses the same guard", () => {
  test("one implementation, imported — not three copies", () => {
    // Requirement 5. The guard is plain JS precisely so the bare-node script can
    // import the same module the TypeScript server does.
    assert.match(ENV_TS, /from "\.\.\/shared\/seedGuard\.mjs"/,
      "server/env.ts stopped re-exporting the shared guard");
    assert.match(SEED_MJS, /from "\.\.\/shared\/seedGuard\.mjs"/,
      "the standalone script no longer imports the shared guard");
    assert.match(SEED_TS, /from "\.\/env"/,
      "the CLI seeder no longer imports the guard");
    // Nobody re-spells the conditions.
    for (const [name, src] of [["routes.ts", ROUTES], ["seed-data.ts", SEED_TS],
                               ["seed-test-data.mjs", stripComments(SEED_MJS)]]) {
      assert.doesNotMatch(src, /NON_PRODUCTION_NODE_ENVS\s*=/,
        `${name} declares its own environment allowlist`);
      assert.doesNotMatch(src, /NODE_ENV === "production"/,
        `${name} went back to comparing NODE_ENV directly`);
    }
    assert.equal(
      (stripComments(GUARD).match(/export function demoSeedDenialReason\(/g) ?? []).length,
      1,
      "the guard is defined more than once",
    );
  });

  test("the admin endpoint calls it, before touching Firestore", () => {
    assert.match(ROUTES, /app\.use\("\/api\/admin", requireAdminAuth\);/,
      "the global admin guard moved — the seed route may now be unauthenticated");
    const at = ROUTES.indexOf('app.post("/api/admin/seed-demo-stores"');
    assert.ok(at > 0, "the seed endpoint disappeared");
    const handler = ROUTES.slice(at, at + 1200);
    assert.match(handler, /if \(!isDemoSeedAllowed\(\)\)/);
    assert.match(handler, /return res\.status\(403\)/);
    const guardAt = handler.indexOf("isDemoSeedAllowed()");
    const dbAt = handler.indexOf("getFirestore()");
    assert.ok(guardAt > -1 && dbAt > -1 && guardAt < dbAt,
      "the database is reached before the environment is checked");
  });

  test("the CLI seeder denies by default", () => {
    assert.match(SEED_TS, /if \(!isDemoSeedAllowed\(\) && process\.env\.ALLOW_SEED !== "true"\)/,
      "server/seed-data.ts no longer denies by default");
    assert.match(SEED_TS, /process\.exit\(1\)/);
  });

  test("the standalone script checks before it reads any credential", () => {
    // Ordering is compared on comment-stripped source: the file's own header
    // documents that it needs FIREBASE_SERVICE_ACCOUNT, and prose is not code.
    const code = stripComments(SEED_MJS);
    // The call must EXIST before it can come first: indexOf returns -1 when it is
    // absent, and -1 is less than every real offset, so an ordering comparison
    // alone is satisfied by deleting the call entirely.
    const guardAt = code.indexOf("demoSeedDenialReason()");
    assert.ok(guardAt > -1, "the script no longer calls the guard at all");
    // …and its result must actually gate the run, not just be computed.
    assert.match(code, /const seedDenial = demoSeedDenialReason\(\);/,
      "the guard's result is not bound to the value the script branches on");
    assert.match(code, /if \(seedDenial\) \{/,
      "the script does not branch on the guard's result");
    for (const [what, marker] of [
      ["Firebase credentials", "FIREBASE_SERVICE_ACCOUNT"],
      ["Firestore", "admin.initializeApp"],
    ]) {
      const at = code.indexOf(marker);
      assert.ok(at > -1, `${marker} disappeared — re-check this ordering test`);
      assert.ok(guardAt < at, `the script reaches ${what} before checking the environment`);
    }
    assert.match(code, /process\.exit\(1\)/);
  });
});

describe("H-68 · 11.9 no seed path can write while bypassing the guard", () => {
  test("every demo/seed endpoint is enumerated", () => {
    const seedRoutes = [...ROUTES.matchAll(/app\.\w+\("(\/api\/[^"]*(?:seed|demo)[^"]*)"/g)]
      .map((m) => m[1]);
    assert.deepEqual(seedRoutes, ["/api/admin/seed-demo-stores"],
      "a new seed/demo endpoint appeared — it needs isDemoSeedAllowed()");
  });

  test("every Firestore-writing seed script is guarded", () => {
    // Enumerated from the repository rather than assumed. A script that both
    // mentions demo/test seeding AND writes must import the guard.
    const scripts = {
      "scripts/seed-test-data.mjs": true,   // seeds demo data → must be guarded
      "server/seed-data.ts": true,          // seeds demo data → must be guarded
    };
    for (const [path, mustGuard] of Object.entries(scripts)) {
      const src = read(path);
      const writes = /\.set\(|\.add\(|batch\./.test(src);
      assert.ok(writes, `${path} no longer writes — re-check this inventory`);
      if (mustGuard) {
        assert.match(src, /demoSeedDenialReason|isDemoSeedAllowed/,
          `${path} writes demo data without the shared guard`);
      }
    }
  });

  test("the guard consults no request, session or role", () => {
    // If it ever took the request it could be talked into trusting the caller,
    // and admin rights would become enough.
    const body = stripComments(GUARD);
    for (const forbidden of [/\breq\b/, /session/i, /\badmin\b/i, /token/i, /cookie/i]) {
      assert.doesNotMatch(body, forbidden,
        "the seed guard reads request state — admin rights could unlock it");
    }
  });

  test("there is no default-on branch in the predicate", () => {
    const fn = stripComments(GUARD);
    const at = fn.indexOf("export function demoSeedDenialReason(");
    const body = fn.slice(at, fn.indexOf("\n}", at));
    const permits = [...body.matchAll(/return null;/g)];
    assert.equal(permits.length, 1, "there is more than one way to be permitted");
    assert.doesNotMatch(body.slice(permits[0].index), /if\s*\(/,
      "a condition follows the permit — it is reachable early");
  });
});

describe("H-68 · nothing outside the guard changed", () => {
  test("the endpoint keeps its status code and message", () => {
    const at = ROUTES.indexOf('app.post("/api/admin/seed-demo-stores"');
    const handler = ROUTES.slice(at, at + 900);
    assert.match(handler, /status\(403\)\.json\(\{ error: "هذا الإجراء غير متاح في بيئة الإنتاج" \}\)/,
      "the API response changed — clients may branch on it");
  });

  test("the demo payload itself is untouched", () => {
    assert.match(ROUTES, /const demoStores: DemoStore\[\] = \[/);
    assert.match(ROUTES, /for \(const store of demoStores\)/);
  });

  test("isDevMode and the Expo Go predicate are unaffected", () => {
    // They have their own contracts and are NOT the seed guard.
    assert.match(ENV_TS, /export function isDevMode\(\): boolean \{/);
    assert.match(ENV_TS, /export function isExpoGoSurfaceEnabled\(\): boolean \{/);
    assert.match(ENV_TS, /return process\.env\.NODE_ENV !== "production";/);
  });
});
