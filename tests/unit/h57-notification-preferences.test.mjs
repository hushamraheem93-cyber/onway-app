/**
 * H-57 — "العروض والخصومات" must be a decision the server obeys, not a local toggle.
 *
 * What the audit described was accurate and I reproduced all of it executably before
 * changing anything: NotificationsScreen had zero network calls, the server had no
 * preference field or endpoint of any kind, and the admin broadcast read
 * getAllUserPushTokens() — every registered device — so a customer who switched
 * offers off kept receiving promotions while the screen displayed
 * "يتم حفظ الإعدادات تلقائياً".
 *
 * Nothing here matches text for behaviour. Every claim about delivery runs:
 *   • the SERVER's real getAllUserPushTokens / getMarketingPushTokens, lifted out of
 *     server/firebase.ts and executed against a Firestore double, and
 *   • the real POST /api/admin/send-notification handler, lifted out of
 *     server/routes.ts, with a broadcast spy recording who was actually reached.
 * The client claims run the screen's own updateSetting, lifted out of the .tsx.
 *
 * Privacy: no real phone numbers, no tokens, no PII. Push tokens here are literal
 * fixtures ("ExponentPushToken[in-1]"), phones are the reserved 07x0000000x form,
 * and nothing in this file prints a payload.
 *
 * Run:  node --test tests/unit/h57-notification-preferences.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";
import {
  canonicalIraqiPhone,
  IRAQ_CANONICAL_PHONE_RE,
} from "../../shared/phone.ts";

import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_KEYS,
  allowsMarketingPush,
  normalizeNotificationPrefs,
} from "../../shared/notificationPrefs.ts";
import {
  NOTIFICATION_PREFS_KEY,
  PREFS_STATE_TEXT,
  PrefsTransportError,
  fetchNotificationPrefs,
  saveNotificationPrefs,
} from "../../client/lib/notificationPrefs.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const FIREBASE = read("server/firebase.ts");
const ROUTES = read("server/routes.ts");
const SCREEN = read("client/screens/NotificationsScreen.tsx");
const CONTEXT = read("client/context/NotificationContext.tsx");
const PUSH = read("server/pushNotifications.ts");

// ── lifting ─────────────────────────────────────────────────────────────────

/** Index just past the balanced `{…}` that opens at or after `from`. */
function blockEnd(src, from) {
  const start = src.indexOf("{", from);
  if (start === -1) throw new Error("no block");
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("unbalanced block");
}

/** The balanced `{…}` block that begins at the first brace at or after `from`. */
function braceBlock(src, from) {
  return src.slice(src.indexOf("{", from), blockEnd(src, from));
}

/**
 * Index of the `{` that opens a BODY rather than a type annotation.
 *
 * `getStatusMessage(status: string): { title: string; body: string } | null {` has
 * two candidate braces and only the second one opens code. Under this repo's
 * formatting a body brace is always the last thing on its line, while an inline
 * object type never is — so that is the discriminator.
 */
function bodyBraceIndex(src, from) {
  for (let i = src.indexOf("{", from); i !== -1; i = src.indexOf("{", i + 1)) {
    if (/^[^\S\n]*\n/.test(src.slice(i + 1))) return i;
  }
  throw new Error("no body brace");
}

/**
 * Everything from `marker` through the end of its balanced body block —
 * signature and parameters included, so the lifted code keeps its own arguments.
 */
function lift(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `source moved: ${marker}`);
  return src
    .slice(at, blockEnd(src, bodyBraceIndex(src, at)))
    .replace(/^export\s+/, "");
}

/** Lift a whole `export async function name(...) {...}` declaration. */
function liftFn(src, name) {
  return lift(src, `export async function ${name}`);
}

/** Transpile and evaluate `code` with `deps` injected, returning `exports`. */
function evaluate(code, deps, exports) {
  const js = ts
    .transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "");
  const names = Object.keys(deps);
  const fn = new Function(...names, `${js}\nreturn { ${exports.join(", ")} };`);
  return fn(...names.map((n) => deps[n]));
}

// ── a Firestore double ──────────────────────────────────────────────────────

/**
 * `docs` is the pushTokens collection: { id, pushToken?, notificationPrefs? }.
 * `legacyUsers` is the users-collection fallback getAllUserPushTokens also reads.
 */
function makeDb(docs, { legacyUsers = [], failPushTokensRead = false } = {}) {
  const written = [];
  const collection = (name) => {
    if (name === "pushTokens") {
      return {
        get: async () => {
          if (failPushTokensRead) throw new Error("firestore unavailable");
          return { forEach: (f) => docs.forEach((d) => f({ data: () => d })) };
        },
        doc: (id) => ({
          get: async () => {
            const found = docs.find((d) => d.id === id);
            return { exists: !!found, data: () => found };
          },
          set: async (value, opts) => {
            written.push({ id, value, opts });
            const found = docs.find((d) => d.id === id);
            if (found) Object.assign(found, value);
            else docs.push({ id, ...value });
          },
        }),
      };
    }
    if (name === "users") {
      return {
        where: () => ({
          get: async () => ({
            forEach: (f) => legacyUsers.forEach((d) => f({ data: () => d })),
          }),
        }),
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  };
  return { db: { collection }, written, docs };
}

const admin = { firestore: { Timestamp: { now: () => "TS" } } };
const quietConsole = { log() {}, error() {}, warn() {} };

/** The server's token readers + preference accessors, executed for real. */
function serverFirebase(db) {
  const code = [
    lift(FIREBASE, "export function pushTokenDocId"),
    // H-63 put the id derivation behind a canonicaliser and gave the accessors a
    // legacy-document fallback. These two are lifted for the same reason the rest
    // are: so the preference accessors below run the real resolution, not a copy.
    lift(FIREBASE, "export function legacyPushTokenDocIds"),
    lift(FIREBASE, "async function pushTokenDocRef"),
    liftFn(FIREBASE, "updateUserPushToken"),
    liftFn(FIREBASE, "getAllUserPushTokens"),
    liftFn(FIREBASE, "getMarketingPushTokens"),
    liftFn(FIREBASE, "getUserNotificationPrefs"),
    liftFn(FIREBASE, "setUserNotificationPrefs"),
  ].join("\n\n");
  return evaluate(
    code,
    {
      db,
      console: quietConsole,
      admin,
      allowsMarketingPush,
      normalizeNotificationPrefs,
      canonicalIraqiPhone,
      IRAQ_CANONICAL_PHONE_RE,
    },
    [
      "pushTokenDocId",
      "legacyPushTokenDocIds",
      "pushTokenDocRef",
      "updateUserPushToken",
      "getAllUserPushTokens",
      "getMarketingPushTokens",
      "getUserNotificationPrefs",
      "setUserNotificationPrefs",
    ],
  );
}

/** The real POST /api/admin/send-notification handler, with a delivery spy. */
function broadcastRoute(fb) {
  const whole = lift(ROUTES, 'app.post("/api/admin/send-notification"');
  const arrow = whole.slice(whole.indexOf("async (req"));
  const body = braceBlock(arrow, arrow.indexOf("=>"));

  const delivered = [];
  const spy = async (tokens, title) => {
    tokens.forEach((t) => delivered.push({ token: t, title }));
    return { sent: tokens.length, failed: 0 };
  };
  const { handler } = evaluate(
    `const handler = async (req, res) => ${body};`,
    {
      getMarketingPushTokens: fb.getMarketingPushTokens,
      sendBroadcastNotification: spy,
      console: quietConsole,
      GENERIC_SERVER_ERROR: "server error",
    },
    ["handler"],
  );

  const call = async (payload) => {
    let status = 200;
    let json = null;
    await handler(
      { body: payload },
      {
        json: (p) => {
          json = p;
        },
        status: (c) => {
          status = c;
          return {
            json: (p) => {
              json = p;
            },
          };
        },
      },
    );
    return { status, json, delivered };
  };
  return { call, delivered };
}

/** The real GET/PUT /api/users/notification-preferences handlers. */
function prefsRoutes(fb) {
  const make = (verb) => {
    const whole = lift(
      ROUTES,
      `app.${verb}("/api/users/notification-preferences"`,
    );
    const arrow = whole.slice(whole.indexOf("async (req"));
    const body = braceBlock(arrow, arrow.indexOf("=>"));
    const { handler } = evaluate(
      `const handler = async (req, res) => ${body};`,
      {
        getUserNotificationPrefs: fb.getUserNotificationPrefs,
        setUserNotificationPrefs: fb.setUserNotificationPrefs,
        normalizeNotificationPrefs,
        DEFAULT_NOTIFICATION_PREFS,
        console: quietConsole,
        GENERIC_SERVER_ERROR: "server error",
      },
      ["handler"],
    );
    return async (req) => {
      let status = 200;
      let json = null;
      await handler(req, {
        json: (p) => {
          json = p;
        },
        status: (c) => {
          status = c;
          return {
            json: (p) => {
              json = p;
            },
          };
        },
      });
      return { status, json };
    };
  };
  return { get: make("get"), put: make("put") };
}

const CUSTOMER = "07700000001";

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · the preference contract", () => {
  test("an absent preference means opted IN — nobody is silently unsubscribed", () => {
    assert.equal(DEFAULT_NOTIFICATION_PREFS.offers, true);
    assert.equal(allowsMarketingPush(undefined), true);
    assert.equal(allowsMarketingPush(null), true);
    assert.equal(allowsMarketingPush({}), true);
  });

  test("only an explicit false withholds marketing", () => {
    assert.equal(allowsMarketingPush({ offers: false }), false);
    assert.equal(allowsMarketingPush({ offers: true }), true);
    // Non-boolean junk must not read as an opt-out nobody expressed.
    assert.equal(allowsMarketingPush({ offers: "false" }), true);
    assert.equal(allowsMarketingPush({ offers: 0 }), true);
  });

  test("the defaults match the screen's previous initial state exactly", () => {
    // The old screen initialised useState with these values; the fix must not
    // change what an untouched account already experiences.
    assert.deepEqual(DEFAULT_NOTIFICATION_PREFS, {
      orderUpdates: true,
      offers: true,
      newProducts: false,
      deliveryAlerts: true,
    });
  });

  test("normalize survives the corrupted legacy value: an ARRAY", () => {
    // @onway_notifications really can hold NotificationContext's history array.
    const out = normalizeNotificationPrefs([{ id: "n1", title: "x" }]);
    assert.deepEqual(out, DEFAULT_NOTIFICATION_PREFS);
    assert.equal(out.offers, true, "corruption must not read as an opt-out");
  });

  test("normalize fills only missing keys and keeps real choices", () => {
    const out = normalizeNotificationPrefs({ offers: false });
    assert.equal(out.offers, false);
    assert.equal(out.orderUpdates, true);
    assert.equal(NOTIFICATION_PREF_KEYS.length, 4);
    for (const k of NOTIFICATION_PREF_KEYS)
      assert.equal(typeof out[k], "boolean");
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · OFF actually stops the marketing push", () => {
  const scenario = () =>
    makeDb([
      {
        id: "07700000001",
        phoneNumber: CUSTOMER,
        pushToken: "ExponentPushToken[in-1]",
      },
      {
        id: "07700000002",
        phoneNumber: "07700000002",
        pushToken: "ExponentPushToken[out-2]",
        notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, offers: false },
      },
    ]);

  test("getMarketingPushTokens drops the opted-out device", async () => {
    const { db } = scenario();
    const fb = serverFirebase(db);
    const tokens = await fb.getMarketingPushTokens();
    assert.deepEqual(tokens, ["ExponentPushToken[in-1]"]);
  });

  test("the real broadcast route does NOT reach the opted-out customer", async () => {
    const { db } = scenario();
    const { call, delivered } = broadcastRoute(serverFirebase(db));
    const { status, json } = await call({ title: "عرض", body: "خصم" });

    assert.equal(status, 200);
    assert.equal(json.sent, 1);
    assert.equal(delivered.length, 1);
    assert.ok(
      !delivered.some((d) => d.token === "ExponentPushToken[out-2]"),
      "a marketing push reached a customer who opted out",
    );
  });

  test("ON still receives it — the switch is reversible", async () => {
    const { db } = scenario();
    const fb = serverFirebase(db);

    // The customer turns offers back on through the real PUT handler.
    const routes = prefsRoutes(fb);
    const put = await routes.put({
      customerPhone: "07700000002",
      body: { preferences: { ...DEFAULT_NOTIFICATION_PREFS, offers: true } },
    });
    assert.equal(put.status, 200);

    const { call, delivered } = broadcastRoute(fb);
    await call({ title: "عرض", body: "خصم" });
    assert.equal(delivered.length, 2, "re-enabling did not restore delivery");
    assert.ok(delivered.some((d) => d.token === "ExponentPushToken[out-2]"));
  });

  test("a legacy customer with no stored preference still receives it", async () => {
    const { db } = makeDb([
      {
        id: "07700000009",
        phoneNumber: "07700000009",
        pushToken: "ExponentPushToken[legacy]",
      },
    ]);
    const tokens = await serverFirebase(db).getMarketingPushTokens();
    assert.deepEqual(tokens, ["ExponentPushToken[legacy]"]);
  });

  test("the legacy users-collection fallback is filtered by the same decision", async () => {
    // getAllUserPushTokens also reads users.pushToken. Filtering by TOKEN rather
    // than by phone is what makes that path obey the opt-out too.
    const { db } = makeDb(
      [
        {
          id: "07700000002",
          phoneNumber: "07700000002",
          pushToken: "ExponentPushToken[out-2]",
          notificationPrefs: { offers: false },
        },
      ],
      { legacyUsers: [{ pushToken: "ExponentPushToken[out-2]" }] },
    );
    const fb = serverFirebase(db);
    assert.deepEqual(await fb.getAllUserPushTokens(), [
      "ExponentPushToken[out-2]",
    ]);
    assert.deepEqual(await fb.getMarketingPushTokens(), []);
  });

  test("if consent cannot be read, NOTHING is sent — it fails closed", async () => {
    const { db } = makeDb(
      [{ id: "07700000001", pushToken: "ExponentPushToken[in-1]" }],
      {
        legacyUsers: [{ pushToken: "ExponentPushToken[in-1]" }],
        failPushTokensRead: true,
      },
    );
    const fb = serverFirebase(db);
    // The token is still discoverable via the legacy path…
    assert.deepEqual(await fb.getAllUserPushTokens(), [
      "ExponentPushToken[in-1]",
    ]);
    // …but preferences are unreadable, so marketing is withheld rather than blasted.
    assert.deepEqual(await fb.getMarketingPushTokens(), []);
  });

  test("the device-count stat still counts every registered device", async () => {
    const { db } = scenario();
    const fb = serverFirebase(db);
    assert.equal(
      (await fb.getAllUserPushTokens()).length,
      2,
      "getAllUserPushTokens must keep meaning 'all devices' for the stats endpoint",
    );
    assert.equal((await fb.getMarketingPushTokens()).length, 1);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · operational order notifications are untouched", () => {
  test("order pushes come from a different function with no preference lookup", () => {
    const sendPush = liftFn(PUSH, "sendPushNotification");
    assert.match(sendPush, /ORDER_STATUS_MESSAGES\[status\]/);
    assert.ok(
      !/marketing|MarketingPushTokens|notificationPrefs|broadcast/i.test(
        stripComments(sendPush),
      ),
      "the order-status sender must not have acquired a marketing gate",
    );
  });

  test("every order status still produces a message", () => {
    const { getStatusMessage } = evaluate(
      `${lift(PUSH, "const ORDER_STATUS_MESSAGES")};\n${lift(PUSH, "export function getStatusMessage")}`,
      {},
      ["getStatusMessage"],
    );
    for (const s of [
      "confirmed",
      "preparing",
      "ready",
      "picked_up",
      "in_delivery",
      "delivered",
      "cancelled",
      "issue",
    ]) {
      assert.ok(getStatusMessage(s), `order status lost its message: ${s}`);
    }
  });

  test("only the marketing broadcast call site was rerouted", () => {
    const src = stripComments(ROUTES);
    const marketing = src.match(/getMarketingPushTokens\(\)/g) || [];
    const all = src.match(/getAllUserPushTokens\(\)/g) || [];
    assert.equal(
      marketing.length,
      1,
      "exactly one call site should be consent-gated",
    );
    assert.equal(all.length, 1, "the stats call site must remain unfiltered");
  });

  test("the send-notification route reads the consent-filtered list", () => {
    const handler = stripComments(
      lift(ROUTES, 'app.post("/api/admin/send-notification"'),
    );
    assert.match(handler, /getMarketingPushTokens\(\)/);
    assert.ok(
      !/getAllUserPushTokens\(\)/.test(handler),
      "the broadcast must not read the unfiltered device list",
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · the preference endpoints", () => {
  test("GET returns defaults and stored:false for a customer who never chose", async () => {
    const { db } = makeDb([]);
    const { get } = prefsRoutes(serverFirebase(db));
    const { status, json } = await get({ customerPhone: CUSTOMER });
    assert.equal(status, 200);
    assert.deepEqual(json.preferences, DEFAULT_NOTIFICATION_PREFS);
    assert.equal(json.stored, false, "must not imply a decision was recorded");
  });

  test("PUT stores the choice and GET reads it back", async () => {
    const { db, written } = makeDb([]);
    const fb = serverFirebase(db);
    const { get, put } = prefsRoutes(fb);

    const saved = await put({
      customerPhone: CUSTOMER,
      body: { preferences: { ...DEFAULT_NOTIFICATION_PREFS, offers: false } },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.success, true);
    assert.equal(saved.json.preferences.offers, false);

    const reread = await get({ customerPhone: CUSTOMER });
    assert.equal(reread.json.stored, true);
    assert.equal(reread.json.preferences.offers, false);
    assert.equal(written.length, 1);
    assert.equal(
      written[0].opts.merge,
      true,
      "must merge, not overwrite the token",
    );
  });

  test("the preference lands on the SAME document as the push token", async () => {
    const { db, docs } = makeDb([
      {
        id: "07700000001",
        phoneNumber: CUSTOMER,
        pushToken: "ExponentPushToken[in-1]",
      },
    ]);
    const fb = serverFirebase(db);
    await prefsRoutes(fb).put({
      customerPhone: CUSTOMER,
      body: { preferences: { offers: false } },
    });
    const doc = docs.find((d) => d.id === fb.pushTokenDocId(CUSTOMER));
    assert.ok(doc.pushToken, "the device token must survive the merge");
    assert.equal(doc.notificationPrefs.offers, false);
    // …and the broadcast now skips it.
    assert.deepEqual(await fb.getMarketingPushTokens(), []);
  });

  test("the doc id matches the one updateUserPushToken writes", async () => {
    // H-57's point is that the token and the consent share one document. It used
    // to be checked by comparing pushTokenDocId against the raw expression that
    // updateUserPushToken had inline. H-63 removed that duplicate expression — both
    // writers now resolve the document through pushTokenDocRef — so the property is
    // checked where it actually lives: write a token, write a preference, and
    // require that exactly one document exists holding both.
    const { db, written } = makeDb([]);
    const fb = serverFirebase(db);

    for (const p of ["07700000001", "+964 770 000 0001", "07-70-000-0001"]) {
      assert.equal(
        fb.pushTokenDocId(p),
        "07700000001",
        "one person's three spellings must not become three documents",
      );
    }

    await fb.updateUserPushToken("07700000001", "ExponentPushToken[shared]");
    await fb.setUserNotificationPrefs("07700000001", {
      orders: true,
      offers: false,
      driver: true,
      chat: true,
    });

    const touched = new Set(written.map((w) => w.id));
    assert.equal(
      touched.size,
      1,
      `the two writers used ${touched.size} documents`,
    );
    assert.equal([...touched][0], fb.pushTokenDocId("07700000001"));

    const stored = await fb.getUserNotificationPrefs("07700000001");
    assert.equal(
      stored.offers,
      false,
      "the preference did not survive beside the token",
    );
  });

  test("a partial or hostile body is normalized, never stored raw", async () => {
    const { db, written } = makeDb([]);
    const { put } = prefsRoutes(serverFirebase(db));
    await put({
      customerPhone: CUSTOMER,
      body: { preferences: { offers: false, evil: "x", orderUpdates: "yes" } },
    });
    const stored = written[0].value.notificationPrefs;
    assert.deepEqual(
      Object.keys(stored).sort(),
      [...NOTIFICATION_PREF_KEYS].sort(),
    );
    assert.equal(
      stored.orderUpdates,
      true,
      "non-boolean falls back to the default",
    );
    assert.equal(stored.evil, undefined);
  });

  test("a write failure answers 500 — never a false success", async () => {
    const { db } = makeDb([]);
    const fb = serverFirebase(db);
    fb.setUserNotificationPrefs = async () => {
      throw new Error("firestore down");
    };
    const { put } = prefsRoutes(fb);
    const { status, json } = await put({
      customerPhone: CUSTOMER,
      body: { preferences: { offers: false } },
    });
    assert.equal(status, 500);
    assert.notEqual(json.success, true);
  });

  test("a read failure answers 500 rather than showing defaults", async () => {
    const { db } = makeDb([]);
    const fb = serverFirebase(db);
    fb.getUserNotificationPrefs = async () => {
      throw new Error("firestore down");
    };
    const { status, json } = await prefsRoutes(fb).get({
      customerPhone: CUSTOMER,
    });
    assert.equal(
      status,
      500,
      "showing defaults would display offers ON to someone who turned it OFF",
    );
    assert.equal(json.preferences, undefined);
  });

  test("identity comes from the JWT only — no phone in the path or body", () => {
    const src = stripComments(ROUTES);
    for (const verb of ["get", "put"]) {
      const route = lift(
        src,
        `app.${verb}("/api/users/notification-preferences"`,
      );
      assert.match(
        route,
        /requireCustomerAuth/,
        "the route must be auth-gated",
      );
      assert.match(route, /\(req as any\)\.customerPhone/);
      assert.ok(
        !/req\.body\?\.phoneNumber|req\.params\.phone/.test(route),
        "a client-supplied phone would allow reading someone else's consent",
      );
    }
    assert.ok(
      !/notification-preferences\/:/.test(src),
      "no phone number may appear in the URL",
    );
  });

  test("neither route logs the phone number or the payload", () => {
    for (const verb of ["get", "put"]) {
      const route = lift(
        ROUTES,
        `app.${verb}("/api/users/notification-preferences"`,
      );
      const logs = route.match(/console\.(log|error|warn)\([^)]*\)/g) || [];
      for (const line of logs) {
        assert.ok(
          !/phoneNumber|preferences|req\.body/.test(line),
          `a log line leaks data: ${line}`,
        );
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · the client transport never fakes success", () => {
  const base = "https://example.invalid";

  test("a non-2xx save throws instead of resolving", async () => {
    const t = {
      fetchImpl: async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }),
      baseUrl: base,
      token: "jwt",
    };
    await assert.rejects(
      () => saveNotificationPrefs(t, DEFAULT_NOTIFICATION_PREFS),
      PrefsTransportError,
    );
  });

  test("a network error propagates — no silent fallback", async () => {
    const t = {
      fetchImpl: async () => {
        throw new Error("offline");
      },
      baseUrl: base,
      token: "jwt",
    };
    await assert.rejects(() =>
      saveNotificationPrefs(t, DEFAULT_NOTIFICATION_PREFS),
    );
    await assert.rejects(() => fetchNotificationPrefs(t));
  });

  test("no customer token throws before any request is attempted", async () => {
    let called = false;
    const t = {
      fetchImpl: async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({}) };
      },
      baseUrl: base,
      token: null,
    };
    await assert.rejects(() =>
      saveNotificationPrefs(t, DEFAULT_NOTIFICATION_PREFS),
    );
    assert.equal(called, false);
  });

  test("save returns what the SERVER stored, not what was sent", async () => {
    const t = {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ preferences: { offers: true } }),
      }),
      baseUrl: base,
      token: "jwt",
    };
    const out = await saveNotificationPrefs(t, {
      ...DEFAULT_NOTIFICATION_PREFS,
      offers: false,
    });
    assert.equal(
      out.offers,
      true,
      "the client must render the server's answer",
    );
  });

  test("the token travels in the Authorization header, never in the URL", async () => {
    let seen = null;
    const t = {
      fetchImpl: async (url, init) => {
        seen = { url, init };
        return {
          ok: true,
          status: 200,
          json: async () => ({ preferences: {} }),
        };
      },
      baseUrl: base,
      token: "jwt-value",
    };
    await fetchNotificationPrefs(t);
    assert.ok(!seen.url.includes("jwt-value"), "token leaked into the URL");
    assert.equal(seen.init.headers.Authorization, "Bearer jwt-value");
  });

  test("only the two success states claim anything was stored", () => {
    assert.match(PREFS_STATE_TEXT.saved, /تم حفظ/);
    assert.match(PREFS_STATE_TEXT.synced, /محفوظة/);
    for (const s of ["loading", "saving", "error", "anonymous"]) {
      assert.ok(
        !/^تم حفظ/.test(PREFS_STATE_TEXT[s]),
        `"${s}" must not claim a completed save`,
      );
    }
    assert.match(PREFS_STATE_TEXT.error, /تعذّر/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · the screen", () => {
  test("it now performs a real network call", () => {
    const src = stripComments(SCREEN);
    assert.match(src, /fetchNotificationPrefs|saveNotificationPrefs/);
    assert.ok(
      !/يتم حفظ الإعدادات تلقائياً/.test(src),
      "the unconditional false confirmation must be gone",
    );
  });

  test("preferences no longer share NotificationContext's storage key", () => {
    const screenKey = /NOTIFICATION_PREFS_KEY/.test(SCREEN);
    const ctxKey = /const NOTIFICATIONS_STORAGE_KEY = "([^"]+)"/.exec(
      CONTEXT,
    )[1];
    assert.ok(screenKey, "the screen must use the dedicated key constant");
    assert.notEqual(
      NOTIFICATION_PREFS_KEY,
      ctxKey,
      "the collision that wiped both values is back",
    );
    assert.ok(
      !/"@onway_notifications"/.test(stripComments(SCREEN)),
      "the screen must not touch the notification-history key",
    );
  });

  /** The screen's real updateSetting, executed with injected state. */
  function screenUpdate({
    canSync = true,
    save,
    initial = DEFAULT_NOTIFICATION_PREFS,
  }) {
    const code = lift(SCREEN, "const updateSetting = async");
    const state = {
      settings: { ...initial },
      syncState: "synced",
      confirmed: { ...initial },
      seq: 0,
      alerts: [],
    };
    // `settings` is read at call time, so rebuild the closure per invocation.
    const invoke = (key, value) =>
      evaluate(
        code,
        {
          canSync,
          settings: state.settings,
          setSettings: (s) => {
            state.settings = s;
          },
          setSyncState: (s) => {
            state.syncState = s;
          },
          confirmedRef: {
            get current() {
              return state.confirmed;
            },
            set current(v) {
              state.confirmed = v;
            },
          },
          requestSeqRef: {
            get current() {
              return state.seq;
            },
            set current(v) {
              state.seq = v;
            },
          },
          transport: () => ({}),
          saveNotificationPrefs: save,
          cachePrefs: async () => {},
          Alert: {
            alert: (title, message) => state.alerts.push({ title, message }),
          },
        },
        ["updateSetting"],
      ).updateSetting(key, value);
    return { state, invoke };
  }

  test("a successful toggle shows saved and keeps the new value", async () => {
    const { state, invoke } = screenUpdate({
      save: async (_t, prefs) => prefs,
    });
    await invoke("offers", false);
    assert.equal(state.settings.offers, false);
    assert.equal(state.syncState, "saved");
    assert.equal(state.confirmed.offers, false);
  });

  test("a FAILED save reverts the switch and shows an error", async () => {
    const { state, invoke } = screenUpdate({
      save: async () => {
        throw new Error("offline");
      },
    });
    await invoke("offers", false);
    assert.equal(
      state.settings.offers,
      true,
      "the switch must not rest in a state the server never received",
    );
    assert.equal(state.syncState, "error");
    assert.notEqual(state.syncState, "saved");
  });

  test("without an account nothing is sent and the switch does not move", async () => {
    let attempted = false;
    const { state, invoke } = screenUpdate({
      canSync: false,
      save: async () => {
        attempted = true;
        return DEFAULT_NOTIFICATION_PREFS;
      },
    });
    await invoke("offers", false);
    assert.equal(attempted, false);
    assert.equal(state.settings.offers, true);
    assert.equal(state.alerts.length, 1);
  });

  test("the screen renders the SERVER's answer, not its own guess", async () => {
    // The server rejects the change and echoes the unchanged set.
    const { state, invoke } = screenUpdate({
      save: async () => ({ ...DEFAULT_NOTIFICATION_PREFS, offers: true }),
    });
    await invoke("offers", false);
    assert.equal(state.settings.offers, true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe("H-57 · races and repeats", () => {
  test("a stale response cannot overwrite a newer choice", async () => {
    const src = stripComments(SCREEN);
    assert.match(
      src,
      /if \(seq !== requestSeqRef\.current\) return;/,
      "the ordering guard is gone",
    );
    // Two guards: one on the success path, one on the failure path.
    assert.equal(
      (src.match(/if \(seq !== requestSeqRef\.current\) return;/g) || [])
        .length,
      2,
    );
  });

  test("the slow FIRST save cannot clobber the fast SECOND one", async () => {
    const code = lift(SCREEN, "const updateSetting = async");
    const state = {
      settings: { ...DEFAULT_NOTIFICATION_PREFS },
      syncState: "synced",
      confirmed: { ...DEFAULT_NOTIFICATION_PREFS },
      seq: 0,
    };
    const refs = {
      confirmedRef: {
        get current() {
          return state.confirmed;
        },
        set current(v) {
          state.confirmed = v;
        },
      },
      requestSeqRef: {
        get current() {
          return state.seq;
        },
        set current(v) {
          state.seq = v;
        },
      },
    };
    const gates = [];
    const save = async (_t, prefs) =>
      new Promise((resolve) => gates.push(() => resolve(prefs)));

    const build = () =>
      evaluate(
        code,
        {
          canSync: true,
          settings: state.settings,
          setSettings: (s) => {
            state.settings = s;
          },
          setSyncState: (s) => {
            state.syncState = s;
          },
          ...refs,
          transport: () => ({}),
          saveNotificationPrefs: save,
          cachePrefs: async () => {},
          Alert: { alert() {} },
        },
        ["updateSetting"],
      ).updateSetting;

    const first = build()("offers", false); // request 1
    const second = build()("newProducts", true); // request 2
    // Resolve them OUT of order: the older one lands last.
    gates[1]();
    gates[0]();
    await Promise.all([first, second]);

    assert.equal(state.seq, 2);
    assert.equal(
      state.settings.newProducts,
      true,
      "the newer choice was overwritten by a late response",
    );
  });

  test("repeating the same value is still confirmed by the server", async () => {
    const { db } = makeDb([
      {
        id: "07700000001",
        phoneNumber: CUSTOMER,
        pushToken: "ExponentPushToken[in-1]",
      },
    ]);
    const fb = serverFirebase(db);
    const { put } = prefsRoutes(fb);
    for (let i = 0; i < 3; i++) {
      const r = await put({
        customerPhone: CUSTOMER,
        body: { preferences: { ...DEFAULT_NOTIFICATION_PREFS, offers: false } },
      });
      assert.equal(r.status, 200);
      assert.equal(r.json.preferences.offers, false);
    }
    // Idempotent: still exactly one opted-out device, still no marketing.
    assert.deepEqual(await fb.getMarketingPushTokens(), []);
    assert.equal((await fb.getAllUserPushTokens()).length, 1);
  });

  test("a duplicate token across both collections is excluded once", async () => {
    const { db } = makeDb(
      [
        {
          id: "07700000002",
          pushToken: "ExponentPushToken[dupe]",
          notificationPrefs: { offers: false },
        },
      ],
      { legacyUsers: [{ pushToken: "ExponentPushToken[dupe]" }] },
    );
    const fb = serverFirebase(db);
    assert.equal((await fb.getAllUserPushTokens()).length, 1, "deduped");
    assert.deepEqual(await fb.getMarketingPushTokens(), []);
  });
});
