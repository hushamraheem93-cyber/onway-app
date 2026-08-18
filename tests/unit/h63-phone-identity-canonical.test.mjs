/**
 * H-63 / K-1 — one human, one phone identity, whatever format the string is in.
 *
 * H-52 fixed the door: PhoneLoginScreen and /api/auth/* both canonicalise to
 * `07XXXXXXXXX` before an identity is minted. It did not fix what happens AFTER
 * the door, and a read-only pass over production found the residue: 27 user
 * documents for 23 people, 15 of them not stored in the canonical form, and 20
 * `pushTokens` documents of which 9 are keyed by a pre-H-52 raw phone.
 *
 * Three mechanisms let that keep happening:
 *
 *   1. `pushTokens` is an exact-key collection. `pushTokenDocId` derived the key
 *      from whatever string the caller held, so `00964…` and `07…` were two
 *      documents for one person — one holding the device token, the other holding
 *      the notification consent (H-57).
 *   2. `phoneVariants` generated four spellings, none of them the sixteen-digit
 *      `00964` + `07XXXXXXXXX` the old client wrote when someone typed the ordinary
 *      local form. Ten live documents are in that state, every one invisible to its
 *      own owner — which is how four people ended up with two documents each.
 *   3. Every phone search in the admin dashboard was a raw substring test against
 *      the STORED string, and "07701234567" is not a substring of
 *      "009647701234567": the local form's leading zero has no counterpart in the
 *      country-code form. A real customer searched by their real number returned
 *      "لا توجد نتائج".
 *
 * Nothing here matches text. Every behavioural assertion executes the SHIPPED
 * function — lifted out of server/firebase.ts and out of the admin template, run
 * against an in-memory Firestore double that records every read and write.
 *
 * No real number appears anywhere in this file. The corpus is built from
 * deliberately synthetic numbers (see FAKE), and a test asserts they are synthetic.
 *
 * Run:  node --test tests/unit/h63-phone-identity-canonical.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";
import {
  canonicalIraqiPhone,
  isCanonicalIraqiPhone,
  isValidIraqiPhone,
  maskPhone,
  IRAQ_CANONICAL_PHONE_RE,
} from "../../shared/phone.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const FIREBASE = read("server/firebase.ts");
const ROUTES = read("server/routes.ts");
const ADMIN = read("server/templates/admin.html");
const CLIENT_PHONE = read("client/lib/phone.ts");
const DRYRUN = read("server/scripts/phone-identity-dryrun.ts");

const ts = (
  await import(join(root, "node_modules/typescript/lib/typescript.js"))
).default;

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic numbers only. `1234567` / `7654321` / `0000000` are sequences no
// operator issues; the test below asserts that, so a future edit cannot quietly
// paste a subscriber's real number into the corpus.
const FAKE = {
  local: "07701234567",
  intl00: "009647701234567",
  intl: "9647701234567",
  plus: "+9647701234567",
  bare: "7701234567",
  other: "07807654321",
};

// ─────────────────────────────────────────────────────────────────────────────
// Lifting the shipped implementation out of server/firebase.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `{` that opens a function BODY, not one inside a type annotation.
 *
 * `Promise<(FirestoreUserProfile & { id: string }) | null> {` has two braces on
 * one line and only the last one opens the body. A body brace is always the last
 * non-whitespace character on its line in this file, which is the property used.
 */
function bodyBrace(src, from) {
  let i = src.indexOf("{", from);
  while (i !== -1) {
    let j = i + 1;
    while (j < src.length && src[j] !== "\n" && /\s/.test(src[j])) j++;
    if (j >= src.length || src[j] === "\n") return i;
    i = src.indexOf("{", i + 1);
  }
  throw new Error("no body brace found");
}

/** The source of one function declaration, signature included. */
function lift(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  const open = bodyBrace(src, at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) {
      return src.slice(at, i + 1).replace(/^export /, "");
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

const LIFTED = [
  "function phoneVariants(raw: string): string[] {",
  "export async function getUserByPhone(phoneNumber: string):",
  "export function pushTokenDocId(phoneNumber: string): string {",
  "export function legacyPushTokenDocIds(phoneNumber: string): string[] {",
  "async function pushTokenDocRef(phoneNumber: string) {",
  "export async function updateUserPushToken(phoneNumber: string, pushToken: string):",
  "export async function getAllUserPushTokens(): Promise<string[]> {",
  "export async function getUserNotificationPrefs(phoneNumber: string):",
  "export async function setUserNotificationPrefs(",
];

const EXPORTED = [
  "phoneVariants",
  "getUserByPhone",
  "pushTokenDocId",
  "legacyPushTokenDocIds",
  "pushTokenDocRef",
  "updateUserPushToken",
  "getAllUserPushTokens",
  "getUserNotificationPrefs",
  "setUserNotificationPrefs",
];

/**
 * Build the shipped accessors against an injected Firestore.
 *
 * `db`, `admin`, `canonicalIraqiPhone` and `normalizeNotificationPrefs` are
 * module-level bindings in server/firebase.ts; here they arrive as parameters, so
 * the function bodies themselves are byte-for-byte what production runs.
 */
function buildFirebase(db) {
  const source = LIFTED.map((m) => lift(FIREBASE, m)).join("\n\n");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;

  const adminDouble = {
    firestore: { Timestamp: { now: () => ({ __ts: true }) } },
  };
  const quiet = { error: () => {}, log: () => {}, warn: () => {} };

  const factory = new Function(
    "db",
    "admin",
    "canonicalIraqiPhone",
    "IRAQ_CANONICAL_PHONE_RE",
    "normalizeNotificationPrefs",
    "console",
    `${js}\nreturn { ${EXPORTED.join(", ")} };`,
  );
  return factory(
    db,
    adminDouble,
    canonicalIraqiPhone,
    IRAQ_CANONICAL_PHONE_RE,
    (v) => v,
    quiet,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// An in-memory Firestore that records everything
// ─────────────────────────────────────────────────────────────────────────────
function makeDb(seed = {}) {
  const store = new Map();
  const writes = [];
  const reads = [];

  for (const [coll, docs] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(docs))
      store.set(`${coll}/${id}`, { ...data });
  }

  const snap = (coll, id) => {
    const data = store.get(`${coll}/${id}`);
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
      get ref() {
        return docRef(coll, id);
      },
    };
  };

  function docRef(coll, id) {
    const path = `${coll}/${id}`;
    return {
      id,
      async get() {
        reads.push(path);
        return snap(coll, id);
      },
      async set(data, opts) {
        writes.push({ path, op: "set", merge: !!opts?.merge, data });
        const prev = opts?.merge ? (store.get(path) ?? {}) : {};
        store.set(path, { ...prev, ...data });
      },
      async update(data) {
        writes.push({ path, op: "update", data });
        store.set(path, { ...(store.get(path) ?? {}), ...data });
      },
    };
  }

  function query(coll, filters, lim) {
    return {
      where: (field, op, value) =>
        query(coll, [...filters, { field, op, value }], lim),
      limit: (n) => query(coll, filters, n),
      orderBy: () => query(coll, filters, lim),
      async get() {
        reads.push(
          `${coll}?${filters.map((f) => `${f.field}${f.op}${f.value}`).join("&")}`,
        );
        let docs = [...store.keys()]
          .filter((k) => k.startsWith(`${coll}/`))
          .map((k) => snap(coll, k.slice(coll.length + 1)));
        for (const f of filters) {
          docs = docs.filter((d) => {
            const v = d.data()[f.field];
            if (f.op === "==") return v === f.value;
            if (f.op === "!=") return v !== f.value && v !== undefined;
            throw new Error(
              `the double does not implement the "${f.op}" operator`,
            );
          });
        }
        if (lim !== undefined) docs = docs.slice(0, lim);
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
          forEach: (fn) => docs.forEach(fn),
        };
      },
    };
  }

  return {
    collection: (name) => ({
      doc: (id) => docRef(name, id),
      ...query(name, [], undefined),
    }),
    /** Document ids currently present in a collection. */
    idsIn: (coll) =>
      [...store.keys()]
        .filter((k) => k.startsWith(`${coll}/`))
        .map((k) => k.slice(coll.length + 1))
        .sort(),
    docIn: (coll, id) => store.get(`${coll}/${id}`),
    writes,
    reads,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · the corpus contains no real subscriber number", () => {
  test("every fake number's subscriber digits are a synthetic sequence", () => {
    const SYNTHETIC = new Set(["1234567", "7654321", "0000000"]);
    for (const [name, value] of Object.entries(FAKE)) {
      const canonical = canonicalIraqiPhone(value);
      const tail = canonical.slice(4);
      assert.ok(
        SYNTHETIC.has(tail),
        `FAKE.${name} ends in ${JSON.stringify(tail)}, which is not one of the declared synthetic sequences`,
      );
    }
  });

  test("maskPhone never emits the middle of a number", () => {
    for (const value of Object.values(FAKE)) {
      const canonical = canonicalIraqiPhone(value);
      const masked = maskPhone(value);
      assert.equal(masked.length, canonical.length);
      assert.ok(
        !masked.includes(canonical.slice(2, -3)),
        "the masked form still contains the subscriber digits",
      );
      assert.equal(
        masked.replace(/\*/g, "").length,
        5,
        "more than 5 digits survive masking",
      );
    }
  });

  test("a too-short input masks to *** rather than leaking what it had", () => {
    assert.equal(maskPhone("077"), "***");
    assert.equal(maskPhone(""), "***");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · canonicalisation — the required mappings", () => {
  test("1. 07XXXXXXXXX is already canonical and is returned unchanged", () => {
    assert.equal(canonicalIraqiPhone(FAKE.local), FAKE.local);
    assert.ok(isCanonicalIraqiPhone(FAKE.local));
  });

  test("2. 00964XXXXXXXXXX → 07XXXXXXXXX", () => {
    assert.equal(canonicalIraqiPhone(FAKE.intl00), FAKE.local);
  });

  test("3. 964XXXXXXXXXX → 07XXXXXXXXX", () => {
    assert.equal(canonicalIraqiPhone(FAKE.intl), FAKE.local);
  });

  test("4. +964XXXXXXXXXX → 07XXXXXXXXX", () => {
    assert.equal(canonicalIraqiPhone(FAKE.plus), FAKE.local);
  });

  test("the bare 7XXXXXXXXX form reaches the same identity", () => {
    assert.equal(canonicalIraqiPhone(FAKE.bare), FAKE.local);
  });

  test("separators do not create a second identity", () => {
    for (const typed of [
      "0770 123 4567",
      "0770-123-4567",
      "(0770) 123 4567",
      "+964 770 123 4567",
    ]) {
      assert.equal(
        canonicalIraqiPhone(typed),
        FAKE.local,
        `${JSON.stringify(typed)} split off`,
      );
    }
  });

  test("every form of one number collapses to exactly ONE identity", () => {
    const ids = new Set(
      [FAKE.local, FAKE.intl00, FAKE.intl, FAKE.plus, FAKE.bare].map(
        canonicalIraqiPhone,
      ),
    );
    assert.equal(ids.size, 1, `one person got ${ids.size} identities`);
  });

  test("normalisation is idempotent", () => {
    for (const value of Object.values(FAKE)) {
      const once = canonicalIraqiPhone(value);
      assert.equal(
        canonicalIraqiPhone(once),
        once,
        `not idempotent for ${maskPhone(value)}`,
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · 5. invalid input is rejected, never turned into an identity", () => {
  const BAD = [
    ["", "empty"],
    ["   ", "whitespace"],
    ["abc", "letters"],
    ["0770123456", "one digit short"],
    ["077012345678", "one digit too long"],
    ["06701234567", "not a mobile prefix"],
    ["1234567890", "not Iraqi"],
    ["+9639701234567", "wrong country code"],
    ["00964", "country code only"],
    ["07", "prefix only"],
    ["٠٧٧٠١٢٣٤٥٦٧", "Arabic-Indic digits"],
  ];

  for (const [value, why] of BAD) {
    test(`${JSON.stringify(value)} (${why}) is not a valid identity`, () => {
      assert.equal(isValidIraqiPhone(value), false);
      assert.equal(isCanonicalIraqiPhone(canonicalIraqiPhone(value)), false);
    });
  }

  test("no invalid input collides with a valid identity", () => {
    for (const [value] of BAD) {
      assert.notEqual(canonicalIraqiPhone(value), FAKE.local);
      assert.notEqual(
        canonicalIraqiPhone(value),
        canonicalIraqiPhone(FAKE.other),
      );
    }
  });

  test("6. a valid number is never converted into a DIFFERENT valid number", () => {
    const seen = new Map();
    for (const base of [
      FAKE.local,
      FAKE.other,
      "07511234567",
      "07901234567",
      "07331234567",
    ]) {
      for (const form of [
        base,
        "0" + "0964" + base.slice(1),
        "964" + base.slice(1),
        base.slice(1),
      ]) {
        const id = canonicalIraqiPhone(form);
        assert.equal(
          id,
          base,
          `${maskPhone(form)} resolved to a different subscriber`,
        );
        const prev = seen.get(id);
        assert.ok(
          prev === undefined || prev === base,
          "two subscribers merged onto one identity",
        );
        seen.set(id, base);
      }
    }
    assert.equal(
      seen.size,
      5,
      "five distinct numbers must stay five distinct identities",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · 7+8. a legacy account is found by either format", () => {
  /** A user whose document was written before H-52 and still stores 00964…. */
  const legacyUser = () => ({
    users: { u1: { phoneNumber: FAKE.intl00, fullName: "مستخدم تجريبي" } },
  });

  test("7. the legacy 00964… holder is found when the JWT carries 07…", async () => {
    const db = makeDb(legacyUser());
    const { getUserByPhone } = buildFirebase(db);
    const found = await getUserByPhone(FAKE.local);
    assert.ok(
      found,
      "the account stored as 00964… was invisible to its own owner",
    );
    assert.equal(found.id, "u1");
  });

  test("8. the same account is reached from every other format too", async () => {
    for (const form of [
      FAKE.local,
      FAKE.intl00,
      FAKE.intl,
      FAKE.plus,
      FAKE.bare,
    ]) {
      const db = makeDb(legacyUser());
      const { getUserByPhone } = buildFirebase(db);
      const found = await getUserByPhone(form);
      assert.ok(found, `${maskPhone(form)} could not reach the account`);
      assert.equal(found.id, "u1");
    }
  });

  test("a canonically-stored account is equally reachable from a legacy-format caller", async () => {
    const db = makeDb({ users: { u2: { phoneNumber: FAKE.local } } });
    const { getUserByPhone } = buildFirebase(db);
    assert.equal((await getUserByPhone(FAKE.intl00)).id, "u2");
  });

  test("lookup does not over-match — a different subscriber is not returned", async () => {
    const db = makeDb({ users: { u1: { phoneNumber: FAKE.intl00 } } });
    const { getUserByPhone } = buildFirebase(db);
    assert.equal(await getUserByPhone(FAKE.other), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * The class the audit report did not describe, found by reading production.
 *
 * The pre-H-52 screen built `00964${typed}`. Somebody who typed the ordinary
 * `07…` form was stored as `00964` + `07XXXXXXXXX` — SIXTEEN digits. That string
 * canonicalises to `007701234567`, which is not a valid Iraqi number at all, and
 * `phoneVariants` could not generate it from any input. Ten live user documents
 * are in this state and every one was invisible to its own owner: the lookup
 * missed, the app offered to create the profile again, and four of those people
 * now hold two documents each.
 */
describe("H-63 · the 00964+07… documents the old client wrote", () => {
  const BROKEN = "00964" + FAKE.local; // exactly what `00964${typed}` produced

  test("premise: the broken form does not canonicalise to a valid number", () => {
    assert.equal(canonicalIraqiPhone(BROKEN), "0" + FAKE.local);
    assert.equal(isCanonicalIraqiPhone(canonicalIraqiPhone(BROKEN)), false);
  });

  test("the owner now finds the account their own login created", async () => {
    const db = makeDb({
      users: { u1: { phoneNumber: BROKEN, fullName: "مستخدم تجريبي" } },
    });
    const { getUserByPhone } = buildFirebase(db);
    const found = await getUserByPhone(FAKE.local);
    assert.ok(
      found,
      "the account is still orphaned — its owner is offered registration again",
    );
    assert.equal(found.id, "u1");
  });

  test("the 964-prefixed variant of the same mistake is found too", async () => {
    const db = makeDb({ users: { u1: { phoneNumber: "964" + FAKE.local } } });
    const { getUserByPhone } = buildFirebase(db);
    assert.equal((await getUserByPhone(FAKE.local))?.id, "u1");
  });

  test("a correctly-formed document still wins when both exist", async () => {
    const db = makeDb({
      users: {
        broken: { phoneNumber: BROKEN, fullName: "قديم" },
        canonical: { phoneNumber: FAKE.local, fullName: "حالي" },
      },
    });
    const { getUserByPhone } = buildFirebase(db);
    const found = await getUserByPhone(FAKE.local);
    assert.equal(
      found.id,
      "canonical",
      "the account the customer has been using must keep winning — this fix must not silently switch them back",
    );
  });

  test("and the 00964… document still wins over the broken one", async () => {
    const db = makeDb({
      users: {
        broken: { phoneNumber: BROKEN },
        legacy: { phoneNumber: FAKE.intl00 },
      },
    });
    const { getUserByPhone } = buildFirebase(db);
    assert.equal((await getUserByPhone(FAKE.local)).id, "legacy");
  });

  test("it does not reach a different subscriber's broken document", async () => {
    const db = makeDb({ users: { u1: { phoneNumber: "00964" + FAKE.other } } });
    const { getUserByPhone } = buildFirebase(db);
    assert.equal(await getUserByPhone(FAKE.local), null);
  });

  test("the widened search is still bounded", async () => {
    const db = makeDb();
    const { getUserByPhone } = buildFirebase(db);
    await getUserByPhone(FAKE.local);
    // Was 6. H-73 added exactly one variant — the E.164 "+9647…" form, which no
    // other spelling could reach — after finding that a driver stored that way
    // was invisible to every lookup. The point of this bound is that the miss
    // path stays a small fixed number rather than growing per format anyone can
    // imagine; raising it by one for a format the task requires, and refusing
    // the speculative "+9640 7…" companion, keeps that intact.
    assert.ok(
      db.reads.length <= 7,
      `${db.reads.length} queries for one lookup`,
    );
  });

  test("nothing is written while reaching the orphaned document", async () => {
    const db = makeDb({ users: { u1: { phoneNumber: BROKEN } } });
    const { getUserByPhone } = buildFirebase(db);
    await getUserByPhone(FAKE.local);
    assert.deepEqual(
      db.writes,
      [],
      "the lookup repaired the stored value — that is a migration",
    );
    assert.equal(db.docIn("users", "u1").phoneNumber, BROKEN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · push-token document keys are derived from the identity", () => {
  test("the key is the same whichever format the caller holds", () => {
    const { pushTokenDocId } = buildFirebase(makeDb());
    const keys = new Set(
      [FAKE.local, FAKE.intl00, FAKE.intl, FAKE.plus, FAKE.bare].map(
        pushTokenDocId,
      ),
    );
    assert.equal(
      keys.size,
      1,
      `one person would own ${keys.size} push-token documents`,
    );
    assert.equal([...keys][0], FAKE.local);
  });

  test("distinct subscribers still get distinct keys", () => {
    const { pushTokenDocId } = buildFirebase(makeDb());
    assert.notEqual(pushTokenDocId(FAKE.local), pushTokenDocId(FAKE.other));
  });

  test("the legacy candidates cover every id the pre-H-52 code could have produced", () => {
    const { legacyPushTokenDocIds } = buildFirebase(makeDb());
    // Derived from the IDENTITY, so a caller holding the canonical form still names
    // the legacy documents — the whole reason the first attempt at this missed them.
    const ids = legacyPushTokenDocIds(FAKE.local);
    for (const expected of [
      FAKE.intl00,
      FAKE.intl,
      FAKE.bare,
      "_9647701234567",
    ]) {
      assert.ok(ids.includes(expected), `${expected} is not probed`);
    }
    assert.ok(
      !ids.includes(FAKE.local),
      "the canonical id must not be probed twice",
    );
  });

  test("the candidate list is the same whichever format the caller holds", () => {
    const { legacyPushTokenDocIds } = buildFirebase(makeDb());
    const base = [...legacyPushTokenDocIds(FAKE.local)].sort();
    for (const form of [FAKE.intl00, FAKE.intl, FAKE.bare]) {
      assert.deepEqual(
        [...legacyPushTokenDocIds(form)].sort(),
        base,
        `${maskPhone(form)} probes elsewhere`,
      );
    }
  });

  test("an invalid phone yields no speculative candidates", () => {
    const { legacyPushTokenDocIds } = buildFirebase(makeDb());
    assert.deepEqual(legacyPushTokenDocIds("abc"), ["abc"]);
    assert.deepEqual(legacyPushTokenDocIds(""), []);
  });

  test("10. registering from two formats creates ONE document, not two", async () => {
    const db = makeDb();
    const { updateUserPushToken } = buildFirebase(db);
    await updateUserPushToken(FAKE.local, "ExponentPushToken[aaa]");
    await updateUserPushToken(FAKE.intl00, "ExponentPushToken[bbb]");
    assert.deepEqual(
      db.idsIn("pushTokens"),
      [FAKE.local],
      "a second identity was created",
    );
  });

  test("11. and the broadcast list therefore holds one token for one person", async () => {
    const db = makeDb();
    const { updateUserPushToken, getAllUserPushTokens } = buildFirebase(db);
    await updateUserPushToken(FAKE.intl00, "ExponentPushToken[aaa]");
    await updateUserPushToken(FAKE.local, "ExponentPushToken[bbb]");
    const tokens = await getAllUserPushTokens();
    assert.equal(
      tokens.length,
      1,
      `one person would receive ${tokens.length} copies of every broadcast`,
    );
    assert.deepEqual(
      tokens,
      ["ExponentPushToken[bbb]"],
      "the newest registration must win",
    );
  });

  test("two different people still get two tokens", async () => {
    const db = makeDb();
    const { updateUserPushToken, getAllUserPushTokens } = buildFirebase(db);
    await updateUserPushToken(FAKE.local, "ExponentPushToken[aaa]");
    await updateUserPushToken(FAKE.other, "ExponentPushToken[bbb]");
    assert.equal((await getAllUserPushTokens()).length, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · an existing legacy-keyed document is not orphaned", () => {
  /** What production actually holds: 9 documents keyed by a raw pre-H-52 phone. */
  const legacyToken = () => ({
    pushTokens: {
      [FAKE.intl00]: {
        phoneNumber: FAKE.intl00,
        pushToken: "ExponentPushToken[legacy]",
        notificationPrefs: {
          orders: true,
          offers: false,
          driver: true,
          chat: true,
        },
      },
    },
  });

  test("the consent stored on the legacy document is still read", async () => {
    const db = makeDb(legacyToken());
    const { getUserNotificationPrefs } = buildFirebase(db);
    const prefs = await getUserNotificationPrefs(FAKE.local);
    assert.ok(
      prefs,
      "the customer's saved choice was invisible and would have been shown as the default",
    );
    assert.equal(prefs.offers, false, "an opt-out silently became an opt-in");
  });

  test("writing consent lands on that same document, not a second one", async () => {
    const db = makeDb(legacyToken());
    const { setUserNotificationPrefs } = buildFirebase(db);
    await setUserNotificationPrefs(FAKE.local, {
      orders: true,
      offers: true,
      driver: true,
      chat: true,
    });
    assert.deepEqual(
      db.idsIn("pushTokens"),
      [FAKE.intl00],
      "consent was split across two documents",
    );
  });

  test("a new token also lands there — token and consent stay on ONE document", async () => {
    const db = makeDb(legacyToken());
    const {
      updateUserPushToken,
      getUserNotificationPrefs,
      getAllUserPushTokens,
    } = buildFirebase(db);
    await updateUserPushToken(FAKE.local, "ExponentPushToken[fresh]");

    assert.deepEqual(
      db.idsIn("pushTokens"),
      [FAKE.intl00],
      "the token was split off onto a second document",
    );
    assert.deepEqual(
      await getAllUserPushTokens(),
      ["ExponentPushToken[fresh]"],
      "the stale token still broadcasts",
    );

    const prefs = await getUserNotificationPrefs(FAKE.local);
    assert.equal(
      prefs.offers,
      false,
      "registering a token wiped the customer's opt-out",
    );
  });

  test("a customer with no document at all gets a CANONICAL one", async () => {
    const db = makeDb();
    const { updateUserPushToken } = buildFirebase(db);
    await updateUserPushToken(FAKE.intl00, "ExponentPushToken[new]");
    assert.deepEqual(
      db.idsIn("pushTokens"),
      [FAKE.local],
      "a new non-canonical key was created",
    );
  });

  test("the fallback never invents a legacy document", async () => {
    const db = makeDb();
    const { setUserNotificationPrefs } = buildFirebase(db);
    await setUserNotificationPrefs(FAKE.plus, {
      orders: true,
      offers: true,
      driver: true,
      chat: true,
    });
    assert.deepEqual(db.idsIn("pushTokens"), [FAKE.local]);
  });

  test("when both documents exist the canonical one wins", async () => {
    const db = makeDb({
      pushTokens: {
        [FAKE.intl00]: {
          phoneNumber: FAKE.intl00,
          pushToken: "ExponentPushToken[old]",
        },
        [FAKE.local]: {
          phoneNumber: FAKE.local,
          pushToken: "ExponentPushToken[new]",
        },
      },
    });
    const { updateUserPushToken } = buildFirebase(db);
    await updateUserPushToken(FAKE.local, "ExponentPushToken[newest]");
    assert.equal(
      db.docIn("pushTokens", FAKE.local).pushToken,
      "ExponentPushToken[newest]",
    );
    assert.equal(
      db.docIn("pushTokens", FAKE.intl00).pushToken,
      "ExponentPushToken[old]",
      "the legacy document must be left exactly as found — merging it is a migration decision",
    );
  });

  test("the common path costs exactly one probe", async () => {
    const db = makeDb({
      pushTokens: {
        [FAKE.local]: {
          phoneNumber: FAKE.local,
          pushToken: "ExponentPushToken[x]",
        },
      },
    });
    const { pushTokenDocRef } = buildFirebase(db);
    await pushTokenDocRef(FAKE.local);
    assert.deepEqual(
      db.reads,
      [`pushTokens/${FAKE.local}`],
      "an existing canonical document must stop the search immediately",
    );
  });

  test("the legacy search is bounded and stops at the first hit", async () => {
    const db = makeDb({
      pushTokens: {
        [FAKE.intl00]: {
          phoneNumber: FAKE.intl00,
          pushToken: "ExponentPushToken[x]",
        },
      },
    });
    const { pushTokenDocRef } = buildFirebase(db);
    await pushTokenDocRef(FAKE.local);
    assert.ok(
      db.reads.length <= 5,
      `${db.reads.length} reads — the probe list grew unbounded`,
    );
    assert.equal(
      db.reads.at(-1),
      `pushTokens/${FAKE.intl00}`,
      "it kept probing after finding the document",
    );
  });

  test("a customer with no document anywhere is probed at most five times", async () => {
    const db = makeDb();
    const { pushTokenDocRef } = buildFirebase(db);
    await pushTokenDocRef(FAKE.local);
    assert.ok(
      db.reads.length <= 5,
      `${db.reads.length} reads for a brand-new customer`,
    );
    assert.equal(
      new Set(db.reads).size,
      db.reads.length,
      "the same document is read twice",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · 9. admin search is no longer raw-format dependent", () => {
  /** The dashboard is a plain template; lift its helpers and run them. */
  const adminHelpers = (() => {
    const src = ADMIN;
    function grab(marker) {
      const at = src.indexOf(marker);
      assert.notEqual(
        at,
        -1,
        `${JSON.stringify(marker)} is missing from admin.html`,
      );
      let depth = 0;
      for (let i = src.indexOf("{", at); i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
      }
      throw new Error("unbalanced");
    }
    const code =
      grab("function canonicalPhone(raw) {") +
      "\n" +
      grab("function phoneMatches(stored, query) {");
    return new Function(`${code}\nreturn { canonicalPhone, phoneMatches };`)();
  })();

  test("the dashboard's canonicaliser agrees with shared/phone.ts on every input", () => {
    const corpus = [
      ...Object.values(FAKE),
      "",
      " ",
      "abc",
      "0",
      "7",
      "07",
      "964",
      "00964",
      "+964",
      "0770 123 4567",
      "٠٧٧٠١٢٣٤٥٦٧",
      "07807654321",
      "0096407701234567",
    ];
    for (const raw of corpus) {
      assert.equal(
        adminHelpers.canonicalPhone(raw),
        canonicalIraqiPhone(raw),
        `the dashboard and the server disagree on ${JSON.stringify(raw)} — an account can hide again`,
      );
    }
  });

  test("the finding's exact case: a 00964… record is found by its 07… number", () => {
    assert.equal(
      FAKE.intl00.includes(FAKE.local),
      false,
      "premise check — the raw substring test really cannot match these two",
    );
    assert.ok(adminHelpers.phoneMatches(FAKE.intl00, FAKE.local));
  });

  test("and the reverse: a 07… record found by a 00964… query", () => {
    assert.ok(adminHelpers.phoneMatches(FAKE.local, FAKE.intl00));
  });

  test("a partial number still matches across formats", () => {
    for (const q of ["7701234567", "770123", "0770123"]) {
      assert.ok(
        adminHelpers.phoneMatches(FAKE.intl00, q),
        `partial ${JSON.stringify(q)} missed`,
      );
    }
  });

  test("searches that used to work still work", () => {
    assert.ok(adminHelpers.phoneMatches(FAKE.local, "0770"));
    assert.ok(adminHelpers.phoneMatches(FAKE.intl00, "00964"));
  });

  test("it does not match a different subscriber", () => {
    assert.equal(adminHelpers.phoneMatches(FAKE.other, FAKE.local), false);
    assert.equal(adminHelpers.phoneMatches(FAKE.intl00, FAKE.other), false);
  });

  test("a non-numeric query does not match every record", () => {
    for (const q of ["أحمد", "abc", "-", " "]) {
      assert.equal(
        adminHelpers.phoneMatches(FAKE.intl00, q),
        false,
        `${JSON.stringify(q)} matched a phone — the name filter would return everyone`,
      );
    }
  });

  test("an empty query matches, so clearing the box restores the full list", () => {
    assert.ok(adminHelpers.phoneMatches(FAKE.local, ""));
  });

  test("a missing phone field does not throw", () => {
    assert.equal(adminHelpers.phoneMatches(undefined, FAKE.local), false);
    assert.equal(adminHelpers.phoneMatches(null, "0770"), false);
  });

  test("no phone search in the dashboard still tests the raw string", () => {
    const code = stripComments(ADMIN);
    const raw = [
      ...code.matchAll(
        /\(\s*\w+\.phoneNumber\s*\|\|\s*''\s*\)\s*\.(?:toLowerCase\(\)\.)?includes\(/g,
      ),
    ];
    assert.deepEqual(
      raw.map((m) => m[0]),
      [],
      "a phone search is still comparing the stored string literally",
    );
  });

  test("every phone search goes through the shared matcher", () => {
    const code = stripComments(ADMIN);
    const uses = [...code.matchAll(/phoneMatches\(/g)].length;
    assert.ok(
      uses >= 6,
      `only ${uses} references to phoneMatches — a search was left behind`,
    );
  });

  test("the matcher is declared exactly once", () => {
    const code = stripComments(ADMIN);
    assert.equal([...code.matchAll(/function phoneMatches\s*\(/g)].length, 1);
    assert.equal([...code.matchAll(/function canonicalPhone\s*\(/g)].length, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · one definition of the rules, and no way to drift from it", () => {
  test("the client helper no longer carries its own copy", () => {
    const code = stripComments(CLIENT_PHONE);
    assert.doesNotMatch(
      code,
      /startsWith\("00964"\)/,
      "client/lib/phone.ts re-implements the rules",
    );
    assert.match(
      code,
      /from "@shared\/phone"/,
      "it must take them from the shared module",
    );
  });

  test("the client helper still exports the same three names", async () => {
    const mod = await import("../../client/lib/phone.ts");
    assert.equal(typeof mod.toLocalIraqiPhone, "function");
    assert.equal(typeof mod.isValidIraqiPhone, "function");
    assert.ok(mod.IRAQ_LOCAL_PHONE_RE instanceof RegExp);
  });

  test("and they behave identically to the shared ones", async () => {
    const mod = await import("../../client/lib/phone.ts");
    for (const raw of [
      ...Object.values(FAKE),
      "",
      "abc",
      "0770123456",
      "٠٧٧٠",
    ]) {
      assert.equal(mod.toLocalIraqiPhone(raw), canonicalIraqiPhone(raw));
      assert.equal(mod.isValidIraqiPhone(raw), isValidIraqiPhone(raw));
    }
    assert.equal(
      mod.IRAQ_LOCAL_PHONE_RE.source,
      IRAQ_CANONICAL_PHONE_RE.source,
    );
  });

  test("server/firebase.ts derives its keys from the shared module", () => {
    const code = stripComments(FIREBASE);
    assert.match(
      code,
      /import \{[^}]*\bcanonicalIraqiPhone\b[^}]*\} from "\.\.\/shared\/phone"/,
    );
    assert.match(
      code,
      /canonicalIraqiPhone\(phoneNumber\)\.replace\(/,
      "pushTokenDocId stopped canonicalising before deriving the key",
    );
  });

  /**
   * routes.ts keeps its own toLocalPhone — it is the auth path, and a data-identity
   * fix has no business rewriting it. That is only safe while the two agree, so this
   * executes the shipped copy against the shared one instead of trusting them to.
   */
  test("the auth path's toLocalPhone agrees with the shared canonicaliser", () => {
    const at = ROUTES.indexOf("function toLocalPhone(raw: string): string {");
    assert.notEqual(at, -1, "toLocalPhone moved in server/routes.ts");
    const open = ROUTES.indexOf("{", at);
    let depth = 0;
    let src = "";
    for (let i = open; i < ROUTES.length; i++) {
      if (ROUTES[i] === "{") depth++;
      else if (ROUTES[i] === "}" && --depth === 0) {
        src = ROUTES.slice(at, i + 1);
        break;
      }
    }
    const serverToLocalPhone = new Function(
      `${src.replace(/: string/g, "")}\nreturn toLocalPhone;`,
    )();

    const corpus = [
      ...Object.values(FAKE),
      "",
      " ",
      "abc",
      "0",
      "7",
      "07",
      "964",
      "00964",
      "+964",
      "0770 123 4567",
      "0096407701234567",
      "٠٧٧٠١٢٣٤٥٦٧",
      "07807654321",
      "+9639701234567",
    ];
    for (const raw of corpus) {
      assert.equal(
        serverToLocalPhone(raw),
        canonicalIraqiPhone(raw),
        `the auth path and the key derivation disagree on ${JSON.stringify(raw)} — one human, two identities`,
      );
    }
  });

  test("the auth gate's regex is the canonical one", () => {
    const m = ROUTES.match(/const IRAQ_PHONE_RE = (\/\^07.*?\/);/);
    assert.ok(m, "the send-otp validation regex moved");
    assert.equal(
      new Function(`return ${m[1]};`)().source,
      IRAQ_CANONICAL_PHONE_RE.source,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · 12. the migration dry run cannot write", () => {
  /** The script's own read-only wrapper, lifted and executed. */
  const readOnly = (() => {
    const src = lift(
      DRYRUN,
      "function readOnly<T extends object>(target: T): T {",
    );
    const js = ts.transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    return new Function(`${js}\nreturn readOnly;`)();
  })();

  const MUTATORS = [
    "set",
    "update",
    "delete",
    "add",
    "create",
    "commit",
    "batch",
    "runTransaction",
    "bulkWriter",
    "recursiveDelete",
  ];

  for (const method of MUTATORS) {
    test(`Firestore.${method}() throws instead of running`, () => {
      const guarded = readOnly({ [method]: () => "WROTE" });
      assert.throws(() => guarded[method], /must never write/);
    });
  }

  test("the guard survives traversal — collection().doc().set() still throws", () => {
    const fake = {
      collection: () => ({
        doc: () => ({
          set: () => "WROTE",
          get: async () => ({ exists: true }),
        }),
      }),
    };
    const guarded = readOnly(fake);
    assert.throws(
      () => guarded.collection("users").doc("x").set({}),
      /must never write/,
    );
  });

  test("reads pass through untouched", async () => {
    const fake = {
      collection: () => ({
        select: () => ({
          get: async () => ({
            docs: [{ id: "a", data: () => ({ phoneNumber: FAKE.intl00 }) }],
          }),
        }),
      }),
    };
    const guarded = readOnly(fake);
    const snapshot = await guarded
      .collection("users")
      .select("phoneNumber")
      .get();
    assert.equal(snapshot.docs.length, 1);
    assert.equal(snapshot.docs[0].data().phoneNumber, FAKE.intl00);
  });

  test("nothing derived from the Firestore handle is ever mutated", () => {
    const code = stripComments(DRYRUN);
    const body = code.slice(code.indexOf("async function main()"));
    // The script does call Map.set and Set.add on its own local tallies, which is
    // why this looks at the receiver: only chains rooted at `db` matter.
    const chains = [...body.matchAll(/\bdb\b[\w.$()"'`\[\], -]*/g)].map(
      (m) => m[0],
    );
    assert.ok(
      chains.length > 0,
      "the dry run stopped reading Firestore altogether",
    );
    for (const chain of chains) {
      assert.doesNotMatch(
        chain,
        /\.(?:set|update|delete|add|create|commit|batch|runTransaction|bulkWriter|recursiveDelete)\s*\(/,
        `the dry run mutates Firestore: ${chain}`,
      );
    }
  });

  test("it never prints an unmasked number", () => {
    const code = stripComments(DRYRUN);
    assert.doesNotMatch(
      code,
      /\b(?:00964|964)?0?7\d{8,}\b/,
      "a literal phone number is embedded in the script",
    );
    // Every interpolation that carries a phone-bearing value must go through the
    // masker. `${byCanonical.size}` and friends are counts, not numbers, so the
    // identifier match is case-sensitive and word-bounded on purpose.
    for (const m of code.matchAll(/\$\{([^}]*)\}/g)) {
      const expr = m[1];
      if (!/\b(?:raw|canonical|wantedId|phoneNumber)\b/.test(expr)) continue;
      if (/\.(?:size|length)\b/.test(expr)) continue;
      assert.match(
        expr,
        /maskPhone\(/,
        `an unmasked phone reaches the output: \${${expr}}`,
      );
    }
  });

  test("it refuses to run without credentials rather than guessing", () => {
    const code = stripComments(DRYRUN);
    assert.match(code, /FIREBASE_SERVICE_ACCOUNT/);
    assert.match(code, /process\.exit\(1\)/);
  });

  test("the service-account value is never printed", () => {
    const code = stripComments(DRYRUN);
    assert.doesNotMatch(
      code,
      /console\.(?:log|error)\([^)]*(?:raw|serviceAccount|credential)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-63 · nothing in the fix touches production data", () => {
  test("reading preferences performs no write", async () => {
    const db = makeDb({
      pushTokens: {
        [FAKE.intl00]: {
          phoneNumber: FAKE.intl00,
          pushToken: "ExponentPushToken[x]",
        },
      },
    });
    const { getUserNotificationPrefs } = buildFirebase(db);
    await getUserNotificationPrefs(FAKE.local);
    assert.deepEqual(db.writes, [], "a read wrote to Firestore");
  });

  test("looking a user up performs no write", async () => {
    const db = makeDb({ users: { u1: { phoneNumber: FAKE.intl00 } } });
    const { getUserByPhone } = buildFirebase(db);
    await getUserByPhone(FAKE.local);
    assert.deepEqual(db.writes, []);
  });

  test("the fallback never renames or deletes a document", async () => {
    const db = makeDb({
      pushTokens: {
        [FAKE.intl00]: {
          phoneNumber: FAKE.intl00,
          pushToken: "ExponentPushToken[x]",
        },
      },
    });
    const { updateUserPushToken } = buildFirebase(db);
    await updateUserPushToken(FAKE.local, "ExponentPushToken[y]");
    assert.deepEqual(
      db.idsIn("pushTokens"),
      [FAKE.intl00],
      "the document was moved",
    );
    for (const w of db.writes) {
      assert.notEqual(w.op, "delete");
      if (w.path.startsWith("pushTokens/"))
        assert.equal(w.merge, true, "a push-token write replaced the document");
    }
  });

  test("no user document's phoneNumber is rewritten by the fix", async () => {
    const db = makeDb({
      users: {
        u1: { phoneNumber: FAKE.intl00, pushToken: "ExponentPushToken[a]" },
      },
    });
    const { updateUserPushToken } = buildFirebase(db);
    await updateUserPushToken(FAKE.local, "ExponentPushToken[b]");
    assert.equal(
      db.docIn("users", "u1").phoneNumber,
      FAKE.intl00,
      "the historical value was migrated in place",
    );
  });
});
