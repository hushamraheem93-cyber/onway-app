/**
 * H-76 — "the storage verification script does not initialise Firebase before
 * using it: it always fails, even with a perfectly correct configuration, so the
 * operator skips the pre-launch check."
 *
 * The script called `getFirestore()` and treated that as initialisation. It is a
 * plain getter over a module-level handle that stays null until
 * `initializeFirebase()` has run, and importing `../firebase` runs nothing —
 * only `server/index.ts` ever called the initialiser. So step 1 read null and
 * exited 1 on every machine, with every configuration, and the comment above it
 * asserted the opposite of what the code did.
 *
 * Measured on the pre-fix tree with a well-formed synthetic service account:
 *   getFirestore()                      → null   (script exits 1 here)
 *   initializeFirebase(); getFirestore() → Firestore
 *   admin.storage().bucket()             → onway-74c20.firebasestorage.app
 *
 * These tests EXECUTE the shipped `main()`. It is lifted out of
 * server/scripts/verify-storage.ts with the TypeScript AST and run against
 * recording mocks, so the ORDER of real calls is observed rather than inferred
 * from the source text. Nothing here contacts Firebase, and no credential is
 * real: the service account is generated per test.
 *
 * Run:  node --test tests/unit/h76-verify-storage-init.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const SCRIPT_PATH = "server/scripts/verify-storage.ts";
const SRC = readFileSync(join(root, SCRIPT_PATH), "utf8");

// ─── lifting ─────────────────────────────────────────────────────────────────

function liftFn(src, name) {
  const sf = ts.createSourceFile("s.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let out = null;
  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(out, `could not lift ${name} — it was renamed or removed`);
  return out.replace(/^export\s+/, "");
}

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

/**
 * Run the real main() against mocks, recording every significant call in order.
 *
 * `opts.env`        — what process.env holds
 * `opts.initReturns`— what initializeFirebase() hands back
 * `opts.dbReturns`  — what getFirestore() hands back afterwards
 * `opts.bucketExists`, `opts.uploadUrl`, `opts.fetchOk`
 */
async function runMain(opts = {}) {
  const {
    env = { FIREBASE_SERVICE_ACCOUNT: "{}" },
    initReturns = { __firestore: true },
    dbReturns = { __firestore: true },
    bucketExists = true,
    uploadUrl = null,
    fetchOk = true,
    bucketName = "onway-74c20.firebasestorage.app",
  } = opts;

  const calls = [];
  const logs = [];
  const errors = [];

  const PNG = Buffer.from(
    SRC.match(/"([A-Za-z0-9+/=]{40,})"/)[1],
    "base64",
  );
  const url =
    uploadUrl ??
    `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/x?alt=media&token=abc`;

  const bucket = {
    name: bucketName,
    exists: async () => { calls.push("bucket.exists"); return [bucketExists]; },
    file: () => ({ delete: async () => { calls.push("bucket.file.delete"); } }),
  };

  const decls = [
    liftFn(SRC, "step"),
    liftFn(SRC, "fail"),
    liftFn(SRC, "main"),
  ].join("\n");
  const js = ts.transpileModule(`${decls}\nreturn main;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const deps = {
    process: {
      env,
      exit: (code) => { calls.push(`exit:${code}`); throw new ExitError(code); },
    },
    console: {
      log: (...a) => logs.push(a.join(" ")),
      warn: (...a) => logs.push(a.join(" ")),
      error: (...a) => errors.push(a.join(" ")),
    },
    initializeFirebase: () => { calls.push("initializeFirebase"); return initReturns; },
    getFirestore: () => { calls.push("getFirestore"); return dbReturns; },
    admin: { storage: () => { calls.push("admin.storage"); return { bucket: () => bucket }; } },
    uploadToFirebaseStorage: async () => { calls.push("uploadToFirebaseStorage"); return url; },
    deleteFromFirebaseStorage: async () => { calls.push("deleteFromFirebaseStorage"); },
    fetch: async () => {
      calls.push("fetch");
      return {
        ok: fetchOk,
        status: fetchOk ? 200 : 403,
        arrayBuffer: async () => PNG,
        headers: { get: () => "image/png" },
      };
    },
    Buffer,
    EXPECTED_BUCKET: SRC.match(/EXPECTED_BUCKET = "([^"]+)"/)[1],
    PNG_1x1: PNG,
  };

  const main = new Function(...Object.keys(deps), js)(...Object.values(deps));

  let exitCode = null;
  let threw = null;
  try {
    await main();
  } catch (e) {
    if (e instanceof ExitError) exitCode = e.code;
    else threw = e;
  }
  return { calls, logs, errors, exitCode, threw };
}

/** Every call that touches Storage in any way. */
const STORAGE_CALLS = [
  "admin.storage", "bucket.exists", "uploadToFirebaseStorage",
  "deleteFromFirebaseStorage", "bucket.file.delete", "fetch",
];
const firstStorageIndex = (calls) => {
  const i = calls.findIndex((c) => STORAGE_CALLS.includes(c));
  return i === -1 ? Infinity : i;
};

// ═════════════════════════════════════════════════════════════════════════════
describe("H-76 · A+G. Firebase is initialised before Storage is touched", () => {
  test("A. initializeFirebase() runs, and runs first", async () => {
    const { calls } = await runMain();
    const init = calls.indexOf("initializeFirebase");
    assert.notEqual(init, -1,
      "the script never initialises the Admin SDK — this is the H-76 defect");
    assert.ok(init < firstStorageIndex(calls),
      `Storage was touched before initialisation: ${calls.join(" → ")}`);
  });

  test("A. the very first recorded call is the initialisation", async () => {
    const { calls } = await runMain();
    assert.equal(calls[0], "initializeFirebase", `order was: ${calls.join(" → ")}`);
  });

  test("A. getFirestore() alone is not treated as initialisation", async () => {
    // The pre-fix bug in one assertion: if the script only calls the getter,
    // nothing is initialised and Storage is reached uninitialised.
    const { calls } = await runMain();
    const init = calls.indexOf("initializeFirebase");
    const get = calls.indexOf("getFirestore");
    assert.ok(init !== -1 && init < get,
      "getFirestore() is being relied on to initialise, which it never does");
  });

  test("G. running the file directly uses that same path", () => {
    // There is one entry point: main(), invoked at module scope. No alternative
    // branch can skip the initialisation.
    assert.match(SRC, /^main\(\)\.catch\(/m,
      "the script's entry point changed — the init path may be bypassable");
    const mainBody = liftFn(SRC, "main");
    assert.match(mainBody, /initializeFirebase\(\)/,
      "initialisation is not inside main(), so a direct run could skip it");
  });

  test("G. the script reuses the server's initialiser, not its own app", async () => {
    // A second admin.initializeApp() here could resolve a DIFFERENT bucket than
    // uploadToFirebaseStorage() uses, so the check would pass against the wrong one.
    assert.match(SRC, /import \{[\s\S]*?initializeFirebase[\s\S]*?\} from "\.\.\/firebase"/,
      "the script no longer imports the server's initialiser");

    // Checked over the AST, not the text: the comment above the initialisation
    // legitimately names admin.initializeApp to explain why it is NOT used here.
    const sf = ts.createSourceFile("s.ts", SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const own = [];
    const walk = (n) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "initializeApp"
      ) {
        own.push(n.getText(sf).slice(0, 60));
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    assert.deepEqual(own, [],
      `the script rolls its own Firebase app instead of the server's: ${own}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-76 · B. a correct configuration completes", () => {
  test("B. every step runs and it exits 0", async () => {
    const { calls, exitCode, threw } = await runMain();
    assert.equal(threw, null, `it threw: ${threw?.message}`);
    assert.equal(exitCode, 0, `expected a clean exit, got ${exitCode}`);
    for (const c of ["initializeFirebase", "bucket.exists", "uploadToFirebaseStorage", "fetch"]) {
      assert.ok(calls.includes(c), `${c} never ran: ${calls.join(" → ")}`);
    }
  });

  test("B. it reports success only at the end", async () => {
    const { logs, exitCode } = await runMain();
    assert.equal(exitCode, 0);
    assert.ok(logs.some((l) => l.includes("✅")), "no success line was printed");
  });

  test("B. it cleans up the object it uploaded", async () => {
    const { calls } = await runMain();
    assert.ok(calls.includes("deleteFromFirebaseStorage"),
      "the verification leaves its test object behind");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-76 · C+D+E. failure is loud, non-zero, and never silent", () => {
  test("C. a missing service account fails before Storage is touched", async () => {
    const { calls, errors, exitCode } = await runMain({ env: {} });
    assert.equal(exitCode, 1, "a missing configuration did not exit non-zero");
    assert.equal(firstStorageIndex(calls), Infinity,
      `Storage was contacted without a configuration: ${calls.join(" → ")}`);
    assert.ok(errors.some((e) => /FIREBASE_SERVICE_ACCOUNT/.test(e)),
      "the error does not name the missing variable");
  });

  test("D. a failed initialisation fails before Storage is touched", async () => {
    const { calls, errors, exitCode } = await runMain({ initReturns: null });
    assert.equal(exitCode, 1);
    assert.equal(firstStorageIndex(calls), Infinity,
      `Storage was used after initialisation failed: ${calls.join(" → ")}`);
    assert.ok(errors.some((e) => /did not initialise/i.test(e)));
  });

  test("D. an initialised SDK with an unset handle still fails", async () => {
    const { exitCode, errors } = await runMain({ initReturns: {}, dbReturns: null });
    assert.equal(exitCode, 1, "a half-initialised SDK was accepted");
    assert.ok(errors.some((e) => /handle is still unset/i.test(e)));
  });

  test("D. an unreachable bucket fails", async () => {
    const { exitCode, errors } = await runMain({ bucketExists: false });
    assert.equal(exitCode, 1);
    assert.ok(errors.some((e) => /does not exist|cannot see it/i.test(e)));
  });

  test("D. a Base64 fallback URL fails instead of passing", async () => {
    const { exitCode, errors } = await runMain({ uploadUrl: "data:image/png;base64,AAAA" });
    assert.equal(exitCode, 1);
    assert.ok(errors.some((e) => /Base64|did not happen/i.test(e)));
  });

  test("D. a URL for the wrong bucket fails", async () => {
    const { exitCode, errors } = await runMain({
      uploadUrl: "https://firebasestorage.googleapis.com/v0/b/someone-else/o/x?token=a",
    });
    assert.equal(exitCode, 1);
    assert.ok(errors.some((e) => /different bucket/i.test(e)));
  });

  test("D. a failed fetch of the uploaded object fails", async () => {
    const { exitCode, errors } = await runMain({ fetchOk: false });
    assert.equal(exitCode, 1);
    assert.ok(errors.some((e) => /GET on the returned URL failed/i.test(e)));
  });

  test("E. no failure path ever prints the success banner", async () => {
    for (const opts of [
      { env: {} },
      { initReturns: null },
      { dbReturns: null },
      { bucketExists: false },
      { uploadUrl: "data:image/png;base64,AAAA" },
      { fetchOk: false },
    ]) {
      const { logs, exitCode } = await runMain(opts);
      assert.notEqual(exitCode, 0, `${JSON.stringify(opts)} exited 0`);
      assert.ok(!logs.some((l) => l.includes("✅")),
        `${JSON.stringify(opts)} printed success while failing`);
    }
  });

  test("E. fail() always exits non-zero — there is no soft path", () => {
    const failBody = liftFn(SRC, "fail");
    assert.match(failBody, /process\.exit\(1\)/, "fail() no longer exits non-zero");
    assert.match(failBody, /: never/, "fail() is no longer typed as terminating");
    assert.doesNotMatch(failBody, /process\.exit\(0\)/);
  });

  test("E. an unexpected throw is still a non-zero exit", () => {
    assert.match(SRC, /main\(\)\.catch\([\s\S]{0,200}?process\.exit\(1\)/,
      "an unhandled rejection would exit 0 and read as success");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-76 · F. no credentials or secrets in the file", () => {
  test("F. nothing that looks like a key or token is hardcoded", () => {
    const patterns = [
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
      [/"private_key"\s*:/, "a service-account private_key field"],
      [/AIza[0-9A-Za-z_-]{30,}/, "a Google API key"],
      [/"type"\s*:\s*"service_account"/, "an inline service account"],
      [/client_secret/, "a client secret"],
    ];
    for (const [re, what] of patterns) {
      assert.ok(!re.test(SRC), `${SCRIPT_PATH} contains ${what}`);
    }
  });

  test("F. credentials come only from the environment", () => {
    assert.match(SRC, /process\.env\.FIREBASE_SERVICE_ACCOUNT/,
      "the script no longer reads the service account from the environment");
    // The only hardcoded identifier is the bucket NAME, which is not a secret.
    assert.match(SRC, /EXPECTED_BUCKET = "onway-74c20\.firebasestorage\.app"/);
  });

  test("F. the service account is never printed", async () => {
    const { logs, errors } = await runMain({
      env: { FIREBASE_SERVICE_ACCOUNT: '{"private_key":"SUPER-SECRET-VALUE"}' },
    });
    for (const line of [...logs, ...errors]) {
      assert.ok(!line.includes("SUPER-SECRET-VALUE"),
        `the service account leaked into output: ${line}`);
      assert.ok(!line.includes("private_key"), `a credential field was printed: ${line}`);
    }
  });

  test("F. no console call in the script prints the service account", () => {
    for (const m of SRC.match(/console\.\w+\([^;]*\)/g) ?? []) {
      assert.ok(!/FIREBASE_SERVICE_ACCOUNT|serviceAccount|private_key/.test(m),
        `a log statement prints credentials: ${m}`);
    }
  });
});
