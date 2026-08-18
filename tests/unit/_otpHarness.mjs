/**
 * Shared OTP test harness (H-75).
 *
 * OTP state used to be a module-level `Map` inside firebase.ts, so the suites
 * could call `generateOtp`/`verifyOtp` directly and needed nothing else. H-75
 * moved that state to Firestore — shared across instances and surviving
 * restarts — which means the functions now need a datastore.
 *
 * Rather than reimplement them here (which would test the harness, not the
 * app), this lifts the SHIPPED functions out of server/otpStore.ts and
 * server/firebase.ts, transpiles them, and runs them against an in-memory
 * Firestore double. The wrappers under test are the real source, including the
 * development bypass, so a change to either file is still caught here.
 *
 * `isDevMode` is the real one from server/env.ts and reads process.env at call
 * time, so suites keep driving the bypass through the environment as before.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import crypto from "node:crypto";
import { isDevMode } from "../../server/env.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const OTP_STORE = read("server/otpStore.ts");
const FIREBASE = read("server/firebase.ts");

function liftFn(src, name) {
  const sf = ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let out = null;
  const walk = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) out = n.getText(sf);
    else ts.forEachChild(n, walk);
  };
  walk(sf);
  assert.ok(out, `could not lift ${name}`);
  return out.replace(/^export\s+/, "");
}

/** In-memory Firestore with serialised transactions, as the real store needs. */
function makeDb() {
  const store = new Map();
  let chain = Promise.resolve();

  const docRef = (col, id) => ({
    __col: col, __id: id, id,
    get: async () => {
      const v = store.get(`${col}/${id}`);
      return { exists: v !== undefined, id, data: () => v, ref: docRef(col, id) };
    },
    set: async (v) => { store.set(`${col}/${id}`, v); },
    update: async (p) => { store.set(`${col}/${id}`, { ...store.get(`${col}/${id}`), ...p }); },
    delete: async () => { store.delete(`${col}/${id}`); },
  });

  const collection = (col) => {
    const q = (pred, lim) => ({
      where: (field, op, val) =>
        q((v) => {
          if (!pred(v)) return false;
          const ms = v?.[field]?.toMillis?.() ?? v?.[field];
          const t = val?.toMillis?.() ?? val;
          return op === "<=" ? ms <= t : ms === t;
        }, lim),
      limit: (n) => q(pred, n),
      get: async () => {
        const docs = [...store.entries()]
          .filter(([k]) => k.startsWith(`${col}/`))
          .filter(([, v]) => pred(v))
          .slice(0, lim ?? Infinity)
          .map(([k, v]) => {
            const id = k.slice(col.length + 1);
            return { id, data: () => v, ref: docRef(col, id) };
          });
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    });
    return { ...q(() => true, undefined), doc: (id) => docRef(col, id) };
  };

  return {
    store,
    db: {
      collection,
      batch: () => {
        const ops = [];
        return {
          delete: (r) => ops.push(() => store.delete(`${r.__col}/${r.__id}`)),
          commit: async () => ops.forEach((f) => f()),
        };
      },
      runTransaction: (fn) => {
        const run = chain.then(async () => {
          const writes = [];
          const tx = {
            get: async (r) => {
              const v = store.get(`${r.__col}/${r.__id}`);
              return { exists: v !== undefined, id: r.__id, data: () => v };
            },
            set: (r, v) => writes.push(() => store.set(`${r.__col}/${r.__id}`, v)),
            update: (r, p) => writes.push(() =>
              store.set(`${r.__col}/${r.__id}`, { ...store.get(`${r.__col}/${r.__id}`), ...p })),
            delete: (r) => writes.push(() => store.delete(`${r.__col}/${r.__id}`)),
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

const STORE_FNS = [
  "hashOtp", "digestsMatch", "newOtpCode",
  "issueOtp", "expiresAtMillis", "consumeOtp", "sweepExpiredOtps",
];

/**
 * A fresh "process": the real generateOtp/verifyOtp wrappers over the real OTP
 * store, backed by a private in-memory database.
 */
export function bootOtp() {
  const { db, store } = makeDb();

  const consts = `
    const OTP_COLLECTION = "otpCodes";
    const OTP_TTL_MS = ${OTP_STORE.match(/OTP_TTL_MS = ([^;]+);/)[1]};
    const OTP_MAX_ATTEMPTS = ${OTP_STORE.match(/OTP_MAX_ATTEMPTS = (\d+)/)[1]};
    const OTP_SWEEP_LIMIT = ${OTP_STORE.match(/OTP_SWEEP_LIMIT = (\d+)/)[1]};
  `;
  const decls = [
    consts,
    ...STORE_FNS.map((n) => liftFn(OTP_STORE, n)),
    // The shipped wrappers, verbatim — this is what the suites assert against.
    liftFn(FIREBASE, "generateOtp"),
    liftFn(FIREBASE, "verifyOtp"),
  ].join("\n");

  const names = [...STORE_FNS, "generateOtp", "verifyOtp"];
  const js = ts.transpileModule(`${decls}\nreturn { ${names.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  const deps = {
    crypto,
    Buffer,
    isDevMode,
    getFirestore: () => db,
    admin: {
      firestore: { Timestamp: { fromMillis: (ms) => ({ __ts: true, toMillis: () => ms }) } },
    },
    console: { error() {}, warn() {}, log() {} },
  };
  const api = new Function(...Object.keys(deps), js)(...Object.values(deps));
  return { ...api, store, db };
}
