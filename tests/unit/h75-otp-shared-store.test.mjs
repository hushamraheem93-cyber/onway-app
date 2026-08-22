/**
 * H-75 — "OTP state lives in process memory: lost on every restart, prevents
 * horizontal scaling, and grows without limit (no sweeper)."
 *
 * The store was `const otpStore = new Map()` in firebase.ts. It is now Firestore
 * (server/otpStore.ts), which every instance shares and which survives a
 * restart, with hashed codes, a transactional single-use consume, and a bounded
 * sweep behind a native TTL policy.
 *
 * These tests EXECUTE the shipped functions. They are lifted out of
 * server/otpStore.ts with the TypeScript AST and run against an in-memory
 * Firestore double that models the two behaviours this fix depends on:
 * transactions are serialised, and a delete inside a transaction is visible to
 * the next one. No emulator, no credentials, no production data.
 *
 * "Restart" is modelled by building a fresh set of functions over the SAME
 * store — a new process against the same database. "Two instances" is two
 * function sets over one store. That is exactly what the defect was about: the
 * state must live in the store, not in the closure.
 *
 * Every phone number is synthetic.
 *
 * Run:  node --test tests/unit/h75-otp-shared-store.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import crypto from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const OTP_STORE = read("server/otpStore.ts");
const FIREBASE = read("server/firebase.ts");
const ROUTES = read("server/routes.ts");
const RULES = read("firestore.rules");

// ─── lifting ─────────────────────────────────────────────────────────────────

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

const LIFTED = [
  "hashOtp", "digestsMatch", "otpTimestamp", "otpMillis", "normalizeOtpPhone",
  "resendCooldownMs", "freshAbuseState", "otpRateLimitError", "newOtpCode",
  "issueOtp", "expiresAtMillis", "consumeOtp", "sweepExpiredOtpAbuse", "sweepExpiredOtps",
];

/** One "process": its own function objects, pointed at a given database. */
function bootInstance(db) {
  const consts = `
    const OTP_COLLECTION = "otpCodes";
    const OTP_ABUSE_COLLECTION = "otpAbuse";
    const OTP_TTL_MS = ${OTP_STORE.match(/OTP_TTL_MS = ([^;]+);/)[1]};
    const OTP_ABUSE_WINDOW_MS = ${OTP_STORE.match(/OTP_ABUSE_WINDOW_MS = ([^;]+);/)[1]};
    const OTP_MAX_ATTEMPTS = ${OTP_STORE.match(/OTP_MAX_ATTEMPTS = (\d+)/)[1]};
    const OTP_MAX_ISSUES_PER_WINDOW = OTP_MAX_ATTEMPTS;
    const OTP_RESEND_COOLDOWNS_MS = [0, 30 * 1000, 60 * 1000, 300 * 1000];
    const OTP_SWEEP_LIMIT = ${OTP_STORE.match(/OTP_SWEEP_LIMIT = (\d+)/)[1]};
  `;
  const decls = consts + LIFTED.map((n) => liftFn(OTP_STORE, n)).join("\n");
  const js = ts.transpileModule(`${decls}\nreturn { ${LIFTED.join(", ")} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const deps = {
    crypto,
    admin: {
      firestore: {
        Timestamp: {
          fromMillis: (ms) => ({ __ts: true, toMillis: () => ms }),
        },
      },
    },
    getFirestore: () => db,
    console: { error() {}, warn() {}, log() {} },
    Buffer,
  };
  return new Function(...Object.keys(deps), js)(...Object.values(deps));
}

// ─── Firestore double ────────────────────────────────────────────────────────

/**
 * Models the parts consumeOtp relies on: serialised transactions, and writes
 * that land atomically at commit.
 */
function makeDb() {
  const store = new Map();
  let chain = Promise.resolve();
  const stats = { transactions: 0, commits: 0 };

  const docRef = (col, id) => ({
    __col: col,
    __id: id,
    id,
    get: async () => {
      const v = store.get(`${col}/${id}`);
      return { exists: v !== undefined, id, data: () => v, ref: docRef(col, id) };
    },
    set: async (v) => { store.set(`${col}/${id}`, v); },
    update: async (p) => {
      const cur = store.get(`${col}/${id}`);
      if (cur === undefined) throw new Error("NOT_FOUND");
      store.set(`${col}/${id}`, { ...cur, ...p });
    },
    delete: async () => { store.delete(`${col}/${id}`); },
  });

  const collection = (col) => {
    const q = (pred, lim) => ({
      where: (field, op, val) =>
        q((v) => {
          if (!pred(v)) return false;
          const ms = v?.[field]?.toMillis?.() ?? v?.[field];
          const target = val?.toMillis?.() ?? val;
          return op === "<=" ? ms <= target : ms === target;
        }, lim),
      limit: (n) => q(pred, n),
      get: async () => {
        const all = [...store.entries()]
          .filter(([k]) => k.startsWith(`${col}/`))
          .filter(([, v]) => pred(v))
          .slice(0, lim ?? Infinity)
          .map(([k, v]) => {
            const id = k.slice(col.length + 1);
            return { id, data: () => v, ref: docRef(col, id) };
          });
        return { docs: all, empty: all.length === 0, size: all.length };
      },
    });
    return { ...q(() => true, undefined), doc: (id) => docRef(col, id) };
  };

  const db = {
    collection,
    batch: () => {
      const ops = [];
      return {
        delete: (ref) => ops.push(() => store.delete(`${ref.__col}/${ref.__id}`)),
        commit: async () => { ops.forEach((f) => f()); },
      };
    },
    /** Serialised, like Firestore's contention handling. */
    runTransaction: (fn) => {
      stats.transactions += 1;
      const run = chain.then(async () => {
        const writes = [];
        const tx = {
          get: async (ref) => {
            const v = store.get(`${ref.__col}/${ref.__id}`);
            return { exists: v !== undefined, id: ref.__id, data: () => v };
          },
          set: (ref, v) => writes.push(() => store.set(`${ref.__col}/${ref.__id}`, v)),
          update: (ref, p) => writes.push(() => {
            const cur = store.get(`${ref.__col}/${ref.__id}`);
            store.set(`${ref.__col}/${ref.__id}`, { ...cur, ...p });
          }),
          delete: (ref) => writes.push(() => store.delete(`${ref.__col}/${ref.__id}`)),
        };
        const result = await fn(tx);
        writes.forEach((w) => w());   // atomic commit
        stats.commits += 1;
        return result;
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
  return { db, store, stats };
}

const PHONE = "07700000071"; // synthetic
const OTHER = "07700000072"; // synthetic
const key = (p) => `otpCodes/${p}`;
const abuseKey = (p) => `otpAbuse/${p}`;

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · A+B. a code works until it expires, and not after", () => {
  test("A. a fresh code verifies", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    assert.equal(await otp.consumeOtp(PHONE, code), "verified");
  });

  test("A. it still verifies just before the deadline", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    const code = await otp.issueOtp(PHONE, t0);
    assert.equal(await otp.consumeOtp(PHONE, code, t0 + 5 * 60 * 1000 - 1), "verified");
  });

  test("B. an expired code is refused", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    const code = await otp.issueOtp(PHONE, t0);
    assert.equal(await otp.consumeOtp(PHONE, code, t0 + 5 * 60 * 1000 + 1), "expired");
    assert.equal(store.has(key(PHONE)), false, "the expired record was left behind");
  });

  test("B. a record with an unreadable expiry is treated as expired", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    store.set(key(PHONE), { ...store.get(key(PHONE)), expiresAt: undefined });
    assert.equal(await otp.consumeOtp(PHONE, code), "expired");
  });

  test("a wrong code is refused and counted", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    await otp.issueOtp(PHONE);
    assert.equal(await otp.consumeOtp(PHONE, "000000"), "wrong_code");
    assert.equal(store.get(key(PHONE)).attempts, 1);
  });

  test("the code is destroyed after too many wrong tries", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    for (let i = 0; i < 5; i++) await otp.consumeOtp(PHONE, "000000");
    assert.equal(store.has(key(PHONE)), false, "a brute-forced code survived");
    assert.equal(await otp.consumeOtp(PHONE, code), "not_found",
      "the real code still worked after the guess limit");
  });

  test("a code for one number does not verify another", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    assert.equal(await otp.consumeOtp(OTHER, code), "not_found");
  });

  test("verifying a number with no code outstanding is refused", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    assert.equal(await otp.consumeOtp(PHONE, "123456"), "not_found");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · C+D+H. one code, once", () => {
  test("C. a verified code cannot be used again", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    assert.equal(await otp.consumeOtp(PHONE, code), "verified");
    assert.equal(store.has(key(PHONE)), false, "the code was not consumed");
    assert.equal(await otp.consumeOtp(PHONE, code), "not_found", "a code was replayable");
  });

  test("D. a resend invalidates the previous code", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    const first = await otp.issueOtp(PHONE, t0);
    const second = await otp.issueOtp(PHONE, t0 + 30 * 1000);
    assert.notEqual(first, second);
    assert.equal(await otp.consumeOtp(PHONE, first, t0 + 30 * 1000 + 1), "wrong_code",
      "the superseded code still verified");
    assert.equal(await otp.consumeOtp(PHONE, second, t0 + 30 * 1000 + 2), "verified");
  });

  test("D. a resend leaves exactly one record", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) await otp.issueOtp(PHONE, t0 + i * 10 * 60 * 1000);
    const mine = [...store.keys()].filter((k) => k.startsWith("otpCodes/"));
    assert.deepEqual(mine, [key(PHONE)], "resending accumulated usable records");
  });

  test("D. a resend resets only the per-code counter, not phone abuse history", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    await otp.issueOtp(PHONE, t0);
    await otp.consumeOtp(PHONE, "000000", t0 + 1);
    await otp.consumeOtp(PHONE, "000000", t0 + 2);
    await otp.issueOtp(PHONE, t0 + 30 * 1000);
    assert.equal(store.get(key(PHONE)).attempts, 0);
    assert.equal(store.get(abuseKey(PHONE)).failedAttempts, 2);
  });

  test("H. only the newest of several codes is accepted", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const codes = [];
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) codes.push(await otp.issueOtp(PHONE, t0 + [0, 30, 90][i] * 1000));
    assert.equal(await otp.consumeOtp(PHONE, codes[0], t0 + 90 * 1000 + 1), "wrong_code");
    assert.equal(await otp.consumeOtp(PHONE, codes[1], t0 + 90 * 1000 + 2), "wrong_code");
    assert.equal(await otp.consumeOtp(PHONE, codes[2], t0 + 90 * 1000 + 3), "verified");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · E+F. the state is not in the process", () => {
  test("E. a code issued before a restart still verifies after it", async () => {
    const { db } = makeDb();
    const before = bootInstance(db);
    const code = await before.issueOtp(PHONE);

    // The process dies and comes back: brand new closures, same database.
    const after = bootInstance(db);
    assert.equal(await after.consumeOtp(PHONE, code), "verified",
      "the code did not survive a restart — it is still process-local");
  });

  test("F. instance A issues, instance B verifies", async () => {
    const { db } = makeDb();
    const instanceA = bootInstance(db);
    const instanceB = bootInstance(db);

    const code = await instanceA.issueOtp(PHONE);
    assert.equal(await instanceB.consumeOtp(PHONE, code), "verified",
      "a second instance could not see the code — horizontal scaling is still broken");
  });

  test("F. consuming on one instance invalidates it on every other", async () => {
    const { db } = makeDb();
    const a = bootInstance(db);
    const b = bootInstance(db);
    const c = bootInstance(db);
    const code = await a.issueOtp(PHONE);
    assert.equal(await b.consumeOtp(PHONE, code), "verified");
    assert.equal(await c.consumeOtp(PHONE, code), "not_found",
      "a third instance still accepted a spent code");
  });

  test("F. a resend on one instance invalidates the code on another", async () => {
    const { db } = makeDb();
    const a = bootInstance(db);
    const b = bootInstance(db);
    const t0 = 1_000_000;
    const first = await a.issueOtp(PHONE, t0);
    await b.issueOtp(PHONE, t0 + 30 * 1000);
    assert.equal(await a.consumeOtp(PHONE, first, t0 + 30 * 1000 + 1), "wrong_code");
  });

  test("nothing is kept in module scope between instances", async () => {
    // A closure-level cache would make this pass on instance A and fail on B.
    const { db, store } = makeDb();
    const a = bootInstance(db);
    await a.issueOtp(PHONE);
    store.clear();                       // the database, and only the database
    const b = bootInstance(db);
    assert.equal(await b.consumeOtp(PHONE, "123456"), "not_found",
      "state survived the database being emptied — something is cached in the process");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · G. the store does not grow without limit", () => {
  test("G. expired records are swept", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    for (let i = 0; i < 30; i++) await otp.issueOtp(`0770000${String(i).padStart(4, "0")}`, t0);
    assert.equal([...store.keys()].filter((k) => k.startsWith("otpCodes/")).length, 30);
    assert.equal([...store.keys()].filter((k) => k.startsWith("otpAbuse/")).length, 30);

    const removed = await otp.sweepExpiredOtps(t0 + 5 * 60 * 1000 + 1);
    assert.equal(removed, 30);
    assert.equal([...store.keys()].filter((k) => k.startsWith("otpCodes/")).length, 0,
      "expired OTP records were not swept");
    assert.equal([...store.keys()].filter((k) => k.startsWith("otpAbuse/")).length, 30,
      "live hourly abuse state was swept too early");
  });

  test("G. live records are never swept", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    await otp.issueOtp(PHONE, t0);                       // expires at t0+5m
    await otp.issueOtp(OTHER, t0 + 4 * 60 * 1000);       // expires later
    const removed = await otp.sweepExpiredOtps(t0 + 5 * 60 * 1000 + 1);
    assert.equal(removed, 1);
    assert.ok(store.has(key(OTHER)), "a code still inside its window was deleted");
  });

  test("G. a sweep is bounded, so one pass cannot run away", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    for (let i = 0; i < 250; i++) await otp.issueOtp(`0771000${String(i).padStart(4, "0")}`, t0);
    const removed = await otp.sweepExpiredOtps(t0 + 10 * 60 * 1000, 200);
    assert.equal(removed, 200, "the sweep is not honouring its cap");
  });

  test("G. sweeping twice is harmless (several instances may do it)", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    await otp.issueOtp(PHONE, t0);
    const after = t0 + 10 * 60 * 1000;
    assert.equal(await otp.sweepExpiredOtps(after), 1);
    assert.equal(await otp.sweepExpiredOtps(after), 0);
    assert.equal(store.has(key(PHONE)), false);
    assert.equal(store.has(abuseKey(PHONE)), true);
  });

  test("G. an abandoned code is removed even though nobody ever verified it", async () => {
    // This is the leak the finding named: the old Map only deleted on success,
    // on read-after-expiry, or after five wrong guesses.
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const t0 = 1_000_000;
    await otp.issueOtp(PHONE, t0);
    await otp.sweepExpiredOtps(t0 + 6 * 60 * 1000);
    assert.equal(store.has(key(PHONE)), false);
    assert.equal(store.has(abuseKey(PHONE)), true);
    assert.equal(await otp.sweepExpiredOtpAbuse(t0 + 60 * 60 * 1000 + 1), 1);
    assert.equal(store.has(abuseKey(PHONE)), false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · J. concurrent verification cannot spend a code twice", () => {
  test("J. two simultaneous verifications, exactly one wins", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);

    const results = await Promise.all([
      otp.consumeOtp(PHONE, code),
      otp.consumeOtp(PHONE, code),
    ]);
    assert.equal(results.filter((r) => r === "verified").length, 1,
      `both requests were accepted: ${JSON.stringify(results)}`);
  });

  test("J. ten simultaneous verifications, still exactly one", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => otp.consumeOtp(PHONE, code)),
    );
    assert.equal(results.filter((r) => r === "verified").length, 1,
      `a code was spent ${results.filter((r) => r === "verified").length} times`);
  });

  test("J. two instances racing on the same code — still one winner", async () => {
    const { db } = makeDb();
    const a = bootInstance(db);
    const b = bootInstance(db);
    const code = await a.issueOtp(PHONE);
    const results = await Promise.all([
      a.consumeOtp(PHONE, code),
      b.consumeOtp(PHONE, code),
    ]);
    assert.equal(results.filter((r) => r === "verified").length, 1);
  });

  test("J. the consume really is transactional, not read-then-write", async () => {
    const { db, stats } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    await otp.consumeOtp(PHONE, code);
    assert.ok(stats.transactions >= 1, "verification does not use a transaction");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · failure never becomes a way in", () => {
  test("no datastore → not verified", async () => {
    const otp = bootInstance(null);
    assert.equal(await otp.consumeOtp(PHONE, "123456"), "unavailable");
  });

  test("a throwing datastore → not verified", async () => {
    const otp = bootInstance({
      collection: () => ({ doc: () => ({}) }),
      runTransaction: async () => { throw new Error("firestore down"); },
    });
    assert.equal(await otp.consumeOtp(PHONE, "123456"), "unavailable");
  });

  test("issuing refuses to claim success when it cannot store", async () => {
    const otp = bootInstance(null);
    await assert.rejects(() => otp.issueOtp(PHONE), /unavailable/);
  });

  test("a corrupt record does not verify", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    await otp.issueOtp(PHONE);
    store.set(key(PHONE), { ...store.get(key(PHONE)), codeHash: "", salt: "" });
    assert.equal(await otp.consumeOtp(PHONE, "123456"), "wrong_code");
  });

  test("only the six documented outcomes exist", async () => {
    const { db } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    const seen = new Set([
      await otp.consumeOtp(OTHER, code),
      await otp.consumeOtp(PHONE, "000000"),
      await otp.consumeOtp(PHONE, code),
    ]);
    for (const r of seen) {
      assert.ok(
        ["verified", "not_found", "expired", "wrong_code", "too_many_attempts", "unavailable"].includes(r),
        `undocumented result: ${r}`,
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · I. the code itself never leaks", () => {
  test("it is stored hashed and salted, never in the clear", async () => {
    const { db, store } = makeDb();
    const otp = bootInstance(db);
    const code = await otp.issueOtp(PHONE);
    const rec = store.get(key(PHONE));
    assert.ok(rec.codeHash && rec.salt, "no hash/salt was written");
    assert.equal(rec.code, undefined, "the plaintext code is stored");
    assert.ok(!JSON.stringify(rec).includes(code), "the code is recoverable from the record");
    assert.notEqual(rec.codeHash, code);
  });

  test("two records for the same code hash differently", async () => {
    // Per-record salt: identical codes must not produce identical digests.
    const { db } = makeDb();
    const otp = bootInstance(db);
    const a = otp.hashOtp("123456", "salt-a");
    const b = otp.hashOtp("123456", "salt-b");
    assert.notEqual(a, b);
  });

  test("the comparison is constant-time", () => {
    assert.match(OTP_STORE, /crypto\.timingSafeEqual\(/,
      "the code digest is compared with a short-circuiting ===");
    assert.doesNotMatch(
      liftFn(OTP_STORE, "consumeOtp"),
      /data\.codeHash\s*===\s*/,
      "a direct string comparison of the digest is back",
    );
  });

  test("the store never logs the code", () => {
    const consume = liftFn(OTP_STORE, "consumeOtp");
    const issue = liftFn(OTP_STORE, "issueOtp");
    for (const [name, src] of [["consumeOtp", consume], ["issueOtp", issue]]) {
      for (const m of src.match(/console\.\w+\([^)]*\)/g) ?? []) {
        assert.ok(!/\bcode\b/.test(m), `${name} logs the code: ${m}`);
      }
    }
  });

  test("the verify endpoint never returns the code", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/verify-otp"');
    const body = ROUTES.slice(at, at + 2500);
    const jsonCalls = body.match(/res\.json\([^;]*\)/g) ?? [];
    assert.ok(jsonCalls.length > 0);
    for (const c of jsonCalls) {
      assert.ok(!/\bcode\b/.test(c), `the response carries the code: ${c}`);
    }
  });

  test("the send endpoint never returns the code", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/send-otp"');
    const body = ROUTES.slice(at, ROUTES.indexOf('app.post("/api/auth/verify-otp"'));
    for (const c of body.match(/res\.json\([^;]*\)/g) ?? []) {
      assert.ok(!/\bcode\b/.test(c), `the response carries the code: ${c}`);
    }
  });

  test("the collection is closed to every client", () => {
    assert.match(
      RULES,
      /match \/otpCodes\/\{docId\} \{\s*allow read, write: if false;/,
      "otpCodes is not locked down — document ids are phone numbers",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-75 · the in-memory store is gone for good", () => {
  test("firebase.ts keeps no OTP map", () => {
    const sf = ts.createSourceFile("firebase.ts", FIREBASE, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const offenders = [];
    const walk = (n) => {
      if (
        ts.isVariableDeclaration(n) &&
        /otp/i.test(n.name.getText(sf)) &&
        n.initializer &&
        /new Map|new Set|\{\}/.test(n.initializer.getText(sf))
      ) {
        offenders.push(n.getText(sf).slice(0, 80));
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    assert.deepEqual(offenders, [], `OTP state is back in process memory: ${offenders}`);
  });

  test("both call sites await the shared store", () => {
    assert.match(ROUTES, /code = await generateOtp\(phoneNumber\)/,
      "send-otp no longer awaits the store — a fire-and-forget write can be lost");
    assert.match(ROUTES, /await verifyOtpCode\(phoneNumber, code\)/,
      "verify-otp is not awaiting the shared store");
  });

  test("send-otp refuses to claim delivery when the code was not stored", () => {
    const at = ROUTES.indexOf('app.post("/api/auth/send-otp"');
    const body = ROUTES.slice(at, ROUTES.indexOf('app.post("/api/auth/verify-otp"'));
    assert.match(body, /catch(?:\s*\([^)]*\))?\s*\{[\s\S]{0,900}?res\.status\(503\)/,
      "a failed store write still tells the user the code was sent");
  });

  test("the wrappers delegate rather than re-implement", () => {
    assert.match(liftFn(FIREBASE, "generateOtp"), /issueOtp\(phoneNumber(?:, now)?\)/);
    assert.match(liftFn(FIREBASE, "verifyOtp"), /consumeOtp\(phoneNumber, code(?:, now)?\)/);
  });

  test("the development bypass is still gated on dev mode", () => {
    // Existing behaviour; it must not have become unconditional.
    assert.match(liftFn(FIREBASE, "verifyOtp"), /code === "0000" && isDevMode\(\)/);
  });

  test("H-72/H-73 identity work is untouched by this change", () => {
    assert.match(FIREBASE, /walletId: mintDriverWalletId\(\)/);
    assert.match(FIREBASE, /export async function findDriverDocByPhone\(/);
    assert.match(liftFn(FIREBASE, "getDriverByPhone"), /findDriverDocByPhone\(/);
  });
});
