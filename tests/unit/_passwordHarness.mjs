/**
 * Harness for password authentication.
 *
 * Lifts the SHIPPED functions out of server/authCredentials.ts and runs them
 * against an in-memory Firestore double, the same way _otpHarness.mjs does for
 * the OTP store. Reimplementing them here would test the harness rather than the
 * app, and a credential check is the last place that trade is worth making.
 *
 * bcrypt is the real bcryptjs, not a stub: the cost factor and the truncation
 * behaviour are part of what these tests are checking.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require_ = createRequire(join(root, "package.json"));
const ts = require_("typescript");

const SRC = readFileSync(join(root, "server/authCredentials.ts"), "utf8");

/** Pull one top-level function out of the source, types and all. */
function liftFn(name) {
  const sf = ts.createSourceFile("x.ts", SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let out = null;
  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(out, `could not lift ${name} from authCredentials.ts`);
  return out.replace(/^export\s+/, "");
}

/** A constant's value, read from the source so the tests cannot pin a stale one. */
export function constant(name) {
  const m = SRC.match(new RegExp(`${name} = ([^;]+);`));
  assert.ok(m, `could not read ${name}`);
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

/** In-memory Firestore with serialised transactions. */
function makeDb() {
  const store = new Map();
  let chain = Promise.resolve();
  const docRef = (col, id) => ({
    __col: col, __id: id, id,
    get: async () => {
      const v = store.get(`${col}/${id}`);
      return { exists: v !== undefined, id, data: () => v };
    },
    set: async (v, opts) => {
      const prev = opts?.merge ? store.get(`${col}/${id}`) ?? {} : {};
      store.set(`${col}/${id}`, { ...prev, ...v });
    },
  });
  return {
    store,
    db: {
      collection: (col) => ({ doc: (id) => docRef(col, id) }),
      runTransaction: (fn) => {
        const run = chain.then(async () => {
          const writes = [];
          const tx = {
            get: async (r) => {
              const v = store.get(`${r.__col}/${r.__id}`);
              return { exists: v !== undefined, id: r.__id, data: () => v };
            },
            set: (r, v, opts) => writes.push(() => {
              const prev = opts?.merge ? store.get(`${r.__col}/${r.__id}`) ?? {} : {};
              store.set(`${r.__col}/${r.__id}`, { ...prev, ...v });
            }),
          };
          const out = await fn(tx);
          writes.forEach((w) => w());
          return out;
        });
        chain = run.then(() => undefined, () => undefined);
        return run;
      },
    },
  };
}

const FNS = [
  "passwordPolicyError", "hashPassword", "hasPassword",
  "setPassword", "passwordLockoutRemainingMs", "checkPassword",
];

/**
 * A fresh "process": the real credential functions over a private in-memory db.
 * `dbOverride` lets a test inject a datastore that fails, to check the fail-closed
 * paths.
 */
export function bootPasswords(dbOverride = null) {
  const own = dbOverride ? null : makeDb();
  const db = dbOverride || own.db;

  const consts = `
    const AUTH_CREDENTIALS_COLLECTION = "authCredentials";
    const PASSWORD_MIN_LENGTH = ${constant("PASSWORD_MIN_LENGTH")};
    const PASSWORD_MAX_BYTES = ${constant("PASSWORD_MAX_BYTES")};
    const PASSWORD_MAX_ATTEMPTS = ${constant("PASSWORD_MAX_ATTEMPTS")};
    const PASSWORD_LOCKOUT_MS = ${constant("PASSWORD_LOCKOUT_MS")};
    const BCRYPT_COST = ${constant("BCRYPT_COST")};
  `;
  const js = ts.transpileModule(
    `${consts}\n${FNS.map(liftFn).join("\n")}\nreturn { ${FNS.join(", ")} };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;

  const deps = {
    bcrypt,
    Buffer,
    // The real canonicaliser, lifted from otpStore so the harness cannot disagree
    // with the app about what "the same phone" means.
    normalizeOtpPhone: (() => {
      const otp = readFileSync(join(root, "server/otpStore.ts"), "utf8");
      const sf = ts.createSourceFile("o.ts", otp, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      let src = null;
      const walk = (n) => {
        if (ts.isFunctionDeclaration(n) && n.name?.text === "normalizeOtpPhone") src = n.getText(sf);
        else ts.forEachChild(n, walk);
      };
      walk(sf);
      assert.ok(src, "could not lift normalizeOtpPhone");
      const fn = ts.transpileModule(`${src.replace(/^export\s+/, "")}\nreturn normalizeOtpPhone;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText;
      // eslint-disable-next-line no-new-func
      return new Function(fn)();
    })(),
    getFirestore: () => db,
    console: { error() {}, warn() {}, log() {} },
  };
  // eslint-disable-next-line no-new-func
  const api = new Function(...Object.keys(deps), js)(...Object.values(deps));
  return { ...api, store: own?.store ?? null, db };
}
