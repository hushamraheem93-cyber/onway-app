/**
 * Driver action failure-handling tests (audit finding H-28).
 *
 * The driver's pickup / arrived-at-store / deliver / report-issue handlers only ever
 * acted on `if (res.ok)`, with an empty `catch`. An HTTP failure is not an exception:
 * a 409 or a 503 sets `res.ok = false` and never reaches the catch, so the handler did
 * nothing at all — no message, no resync, no retry. The spinner stopped and the driver
 * assumed the action had worked.
 *
 * That is worst on delivery. The driver has already taken the cash; if the report is
 * lost the order stays "picked_up", no settlement accrual is recorded (H-21/H-24 never
 * get a chance to run), the batch never closes, and the driver stays "busy" in the
 * dispatch engine (H-19) so no further work arrives. No server sweep recovers it.
 *
 * The sharpest part: the SERVER already writes actionable Arabic messages for exactly
 * these cases — pickup-order's 409 says "حدّث الصفحة وحاول مجدداً", complete-order's 503
 * says "حاول مرة أخرى" — and the client threw every one of them away.
 *
 * These tests do not re-implement the handlers. They lift each handler's body straight
 * out of the shipped .tsx and execute it with stubbed fetch / Alert / state setters, so
 * what is asserted is the real code path.
 *
 * Run:  node --test tests/unit/driver-action-failures.test.mjs
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const BATCH = read("client/screens/DriverBatchScreen.tsx");
const ORDERS = read("client/screens/DriverOrdersScreen.tsx");
const ROUTES = read("server/routes.ts");

/** Drops comment lines so an assertion never matches a pattern quoted in prose. */
function stripComments(src) {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
    })
    .join("\n");
}

/** Extracts a handler's body text by brace matching, so the real code can be run. */
function handlerBody(src, declaration) {
  const at = src.indexOf(declaration);
  assert.ok(at > -1, `handler not found: ${declaration}`);
  const open = src.indexOf("{", at + declaration.length - 1);
  assert.ok(open > -1, `no body for ${declaration}`);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces in ${declaration}`);
}

/** Compiles a lifted body into a callable async function with injected dependencies. */
function compile(body, depNames) {
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    ...depNames,
    `return async function handler(order, issueType) {\n${body}\n};`,
  );
  return (deps) => factory(...depNames.map((n) => deps[n]));
}

// ── the harness ──────────────────────────────────────────────────────────────
const CONNECTION_ERROR = "تعذّر الاتصال بالخادم، تحقّق من الإنترنت وحاول مجدداً";

function makeCtx(fetchImpl) {
  const ctx = {
    alerts: [],
    fetches: [],
    refreshes: 0,
    loadingSet: [],
    arrived: new Set(),
    navBacks: 0,
    issueSent: false,
    issueSending: [],
    timers: [],
  };
  ctx.deps = {
    Alert: { alert: (title, message) => ctx.alerts.push({ title, message }) },
    fetch: async (url, init) => {
      ctx.fetches.push({ url: String(url), init });
      return fetchImpl(String(url), init);
    },
    URL,
    getApiUrl: () => "http://test.local",
    phoneNumber: "07901110001",
    batch: { id: "batch-1" },
    status: { currentBatch: { id: "batch-1" } },
    Haptics: {
      impactAsync: () => {},
      ImpactFeedbackStyle: { Medium: 1, Heavy: 2, Light: 0 },
      notificationAsync: () => {},
      NotificationFeedbackType: { Warning: 1 },
    },
    getCurrentLocation: async () => ({ lat: 34.4, lng: 43.8 }),
    refreshBatch: async () => { ctx.refreshes += 1; },
    fetchStatus: async () => { ctx.refreshes += 1; },
    hideConfirm: () => {},
    setLoadingOrderId: (v) => ctx.loadingSet.push(v),
    setActionLoading: (v) => ctx.loadingSet.push(v),
    setArrivedOrders: (fn) => { ctx.arrived = fn(ctx.arrived); },
    setIssueSent: (v) => { ctx.issueSent = v; },
    setIssueSending: (v) => ctx.issueSending.push(v),
    setIssueModalVisible: () => {},
    setIssueOrderId: () => {},
    issueOrderId: "order-1",
    navigation: { goBack: () => { ctx.navBacks += 1; } },
    isRejecting: false,
    setIsRejecting: (v) => ctx.loadingSet.push(v),
    setTimeout: (fn) => { ctx.timers.push(fn); return 0; },
    serverError: async (res) => {
      const data = await res.json().catch(() => null);
      return typeof data?.error === "string" && data.error.trim() ? data.error : "حاول مرة أخرى";
    },
    CONNECTION_ERROR,
    console,
  };
  return ctx;
}

const DEP_NAMES = [
  "Alert", "fetch", "URL", "getApiUrl", "phoneNumber", "batch", "status", "Haptics",
  "getCurrentLocation", "refreshBatch", "fetchStatus", "hideConfirm", "setLoadingOrderId",
  "setActionLoading", "setArrivedOrders", "setIssueSent", "setIssueSending",
  "setIssueModalVisible", "setIssueOrderId", "issueOrderId", "navigation", "setTimeout",
  "serverError", "CONNECTION_ERROR", "console", "isRejecting", "setIsRejecting",
];

const HANDLERS = {
  pickup: compile(handlerBody(BATCH, "const handlePickup = async (order: BatchOrder) =>"), DEP_NAMES),
  arrived: compile(handlerBody(BATCH, "const handleArrivedAtStore = async (order: BatchOrder) =>"), DEP_NAMES),
  deliver: compile(handlerBody(BATCH, "const handleDeliver = async (order: BatchOrder) =>"), DEP_NAMES),
  issue: compile(handlerBody(BATCH, "const handleSelectIssue = async (issueType: string) =>"), DEP_NAMES),
  reject: compile(handlerBody(BATCH, "const handleRejectBatch = async () =>"), DEP_NAMES),
  ordersPickup: compile(handlerBody(ORDERS, "const doPickup = async (order: BatchOrder) =>"), DEP_NAMES),
  ordersDeliver: compile(handlerBody(ORDERS, "const doDeliver = async (order: BatchOrder) =>"), DEP_NAMES),
};

const ORDER = { id: "order-1" };
const httpFail = (status, error) => async () => ({
  ok: false, status, json: async () => (error === undefined ? {} : { error }),
});
const httpOk = (body = { success: true }) => async () => ({
  ok: true, status: 200, json: async () => body,
});
const netFail = () => { throw new TypeError("Network request failed"); };

async function run(name, fetchImpl, arg = ORDER) {
  const ctx = makeCtx(fetchImpl);
  await HANDLERS[name](ctx.deps)(arg, "late");
  for (const t of ctx.timers) t();
  return ctx;
}

// The real messages the server sends, read out of routes.ts so the test cannot drift.
const SERVER_MESSAGES = {
  pickup409: "تعذّر تحديث حالة الطلب — حدّث الصفحة وحاول مجدداً",
  forbidden: "غير مصرح — هذه الدفعة ليست لك",
  deliver503: "تعذّر قراءة الطلب، حاول مرة أخرى",
};

describe("H-28 — the server's own messages are real and reachable", () => {
  test("routes.ts really sends these strings", () => {
    assert.ok(ROUTES.includes(SERVER_MESSAGES.pickup409), "the 409 message changed");
    assert.ok(ROUTES.includes(SERVER_MESSAGES.forbidden), "the 403 message changed");
    assert.ok(ROUTES.includes(SERVER_MESSAGES.deliver503), "the 503 message changed");
  });

  test("every driver endpoint reports failures under the key `error`", () => {
    for (const route of ["pickup-order", "complete-order", "arrived-at-store", "report-issue"]) {
      const at = ROUTES.indexOf(`"/api/driver/${route.startsWith("report") ? "" : "batch/"}${route}"`);
      assert.ok(at > -1, `route ${route} not found`);
      const body = ROUTES.slice(at, at + 3000);
      assert.match(body, /res\.status\(\d{3}\)\.json\(\{ error:/,
        `${route} does not use the { error } shape the client reads`);
    }
  });
});

describe("H-28 — DriverBatchScreen: pickup", () => {
  test("409 shows the server's message and resyncs", async () => {
    const ctx = await run("pickup", httpFail(409, SERVER_MESSAGES.pickup409));
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر استلام الطلب");
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.pickup409);
    assert.equal(ctx.refreshes, 1, "a stale-state rejection must resync the screen");
  });

  test("403 shows the authorisation message", async () => {
    const ctx = await run("pickup", httpFail(403, SERVER_MESSAGES.forbidden));
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.forbidden);
  });

  test("400 and 500 fall back to a usable message", async () => {
    for (const status of [400, 500]) {
      const ctx = await run("pickup", httpFail(status, undefined));
      assert.equal(ctx.alerts.length, 1, `${status} produced no alert`);
      assert.equal(ctx.alerts[0].message, "حاول مرة أخرى");
    }
  });

  test("a network failure shows a connection message", async () => {
    const ctx = await run("pickup", netFail);
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "خطأ");
    assert.equal(ctx.alerts[0].message, CONNECTION_ERROR);
  });

  test("success resyncs and shows nothing", async () => {
    const ctx = await run("pickup", httpOk());
    assert.equal(ctx.alerts.length, 0, "a successful pickup must not alert");
    assert.equal(ctx.refreshes, 1);
  });

  test("the spinner is cleared on every path", async () => {
    for (const impl of [httpFail(409, "x"), httpFail(500, undefined), netFail, httpOk()]) {
      const ctx = await run("pickup", impl);
      assert.equal(ctx.loadingSet.at(-1), null, "loadingOrderId was left set");
    }
  });
});

describe("H-28 — DriverBatchScreen: deliver", () => {
  test("503 shows the server's message and resyncs", async () => {
    const ctx = await run("deliver", httpFail(503, SERVER_MESSAGES.deliver503));
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر تسليم الطلب");
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.deliver503);
    assert.equal(ctx.refreshes, 1);
  });

  test("403 shows the authorisation message", async () => {
    const ctx = await run("deliver", httpFail(403, SERVER_MESSAGES.forbidden));
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.forbidden);
  });

  test("a network failure shows a connection message", async () => {
    const ctx = await run("deliver", netFail);
    assert.equal(ctx.alerts[0].message, CONNECTION_ERROR);
  });

  test("alreadyCompleted: true is a success, not an error", async () => {
    // The server answers a repeated delivery with 200 { success, alreadyCompleted }.
    // Treating it as a failure would tell a driver their delivery failed when it did not.
    const ctx = await run("deliver", async (url) =>
      url.includes("complete-order")
        ? { ok: true, status: 200, json: async () => ({ success: true, alreadyCompleted: true }) }
        : { ok: true, status: 200, json: async () => ({ currentBatch: { id: "batch-1", status: "in_progress" } }) },
    );
    assert.equal(ctx.alerts.length, 0, "alreadyCompleted must not alert");
    assert.equal(ctx.refreshes, 1);
  });

  test("the completed-batch navigation still works on success", async () => {
    const ctx = await run("deliver", async (url) =>
      url.includes("complete-order")
        ? { ok: true, status: 200, json: async () => ({ success: true }) }
        : { ok: true, status: 200, json: async () => ({ currentBatch: null }) },
    );
    assert.equal(ctx.navBacks, 1, "the screen no longer closes when the batch finishes");
    assert.equal(ctx.alerts.length, 0);
  });

  test("a failed delivery does not navigate away", async () => {
    const ctx = await run("deliver", httpFail(503, SERVER_MESSAGES.deliver503));
    assert.equal(ctx.navBacks, 0, "the driver was sent back as if the delivery had worked");
  });

  test("the spinner is cleared on every path", async () => {
    for (const impl of [httpFail(503, "x"), netFail, httpOk()]) {
      const ctx = await run("deliver", impl);
      assert.equal(ctx.loadingSet.at(-1), null);
    }
  });
});

describe("H-28 — DriverBatchScreen: arrived-at-store", () => {
  test("the optimistic flag is rolled back when the server refuses", async () => {
    // The old code added the order to arrivedOrders BEFORE the request and never
    // checked res.ok, so the UI claimed arrival even on a 403.
    const ctx = await run("arrived", httpFail(403, SERVER_MESSAGES.forbidden));
    assert.equal(ctx.arrived.has(ORDER.id), false, "the screen still claims the driver arrived");
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر تسجيل الوصول");
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.forbidden);
    assert.equal(ctx.refreshes, 1);
  });

  test("it is rolled back on a network failure too", async () => {
    const ctx = await run("arrived", netFail);
    assert.equal(ctx.arrived.has(ORDER.id), false);
    assert.equal(ctx.alerts[0].message, CONNECTION_ERROR);
  });

  test("on success the flag stays set and nothing is shown", async () => {
    const ctx = await run("arrived", httpOk());
    assert.equal(ctx.arrived.has(ORDER.id), true, "the arrival was lost on success");
    assert.equal(ctx.alerts.length, 0);
    assert.equal(ctx.refreshes, 0, "success needs no extra resync here");
  });

  test("res.ok is actually consulted", async () => {
    const body = handlerBody(BATCH, "const handleArrivedAtStore = async (order: BatchOrder) =>");
    assert.match(body, /if \(!res\.ok\)/, "REGRESSION: the response status is ignored again");
  });
});

describe("H-28 — DriverBatchScreen: report an issue", () => {
  test("a rejected report is reported to the driver", async () => {
    const ctx = await run("issue", httpFail(400, undefined), "late");
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر إرسال البلاغ");
    assert.equal(ctx.issueSent, false, "the modal claimed the report was sent");
  });

  test("a network failure is reported", async () => {
    const ctx = await run("issue", netFail, "late");
    assert.equal(ctx.alerts[0].message, CONNECTION_ERROR);
    assert.equal(ctx.issueSent, false);
  });

  test("success still confirms and resyncs", async () => {
    const ctx = await run("issue", httpOk(), "late");
    assert.equal(ctx.alerts.length, 0);
    assert.equal(ctx.issueSent, false, "the confirmation is cleared by its own timer");
    assert.equal(ctx.refreshes, 1);
  });

  test("the sending flag is cleared on every path", async () => {
    for (const impl of [httpFail(400, undefined), netFail, httpOk()]) {
      const ctx = await run("issue", impl, "late");
      assert.equal(ctx.issueSending.at(-1), false);
    }
  });
});

describe("H-28 — DriverBatchScreen: reject the batch", () => {
  // The worst shape of the whole finding: the response was never even captured into a
  // variable, and navigation.goBack() lived in `finally` so it fired on every path.
  // A failed reject sent the driver away believing the batch was gone while the server
  // still had it assigned — they stop working it, dispatch still counts them as busy,
  // and the orders sit unassigned until an admin notices.
  // /api/driver/reject-order answers 400, 403 and 500 with { error }, and 200 with
  // { success: true }. It does not currently emit 409; that case is covered anyway so
  // the handler stays correct if the route ever gains one.

  test("200 leaves the screen, exactly as before", async () => {
    const ctx = await run("reject", httpOk({ success: true }));
    assert.equal(ctx.navBacks, 1, "a successful reject must still close the screen");
    assert.equal(ctx.alerts.length, 0);
  });

  test("403 shows the server's message and does NOT navigate", async () => {
    const ctx = await run("reject", httpFail(403, SERVER_MESSAGES.forbidden));
    assert.equal(ctx.navBacks, 0, "the driver was sent away from a batch still assigned to them");
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر رفض الدفعة");
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.forbidden);
    assert.equal(ctx.refreshes, 1, "the screen must resync to the real state");
  });

  test("409 is handled the same way", async () => {
    const ctx = await run("reject", httpFail(409, "تعذّر تنفيذ العملية"));
    assert.equal(ctx.navBacks, 0);
    assert.equal(ctx.alerts[0].message, "تعذّر تنفيذ العملية");
    assert.equal(ctx.refreshes, 1);
  });

  test("400 and 500 alert with a usable fallback and do NOT navigate", async () => {
    for (const status of [400, 500]) {
      const ctx = await run("reject", httpFail(status, undefined));
      assert.equal(ctx.navBacks, 0, `${status} still navigated away`);
      assert.equal(ctx.alerts.length, 1);
      assert.equal(ctx.alerts[0].message, "حاول مرة أخرى");
      assert.equal(ctx.refreshes, 1);
    }
  });

  test("a network failure alerts, resyncs and does NOT navigate", async () => {
    const ctx = await run("reject", netFail);
    assert.equal(ctx.navBacks, 0, "a dropped connection used to send the driver away");
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "خطأ");
    assert.equal(ctx.alerts[0].message, CONNECTION_ERROR);
    assert.equal(ctx.refreshes, 1);
  });

  test("the rejecting flag is cleared on every path", async () => {
    for (const impl of [httpOk(), httpFail(403, "x"), httpFail(500, undefined), netFail]) {
      const ctx = await run("reject", impl);
      assert.equal(ctx.loadingSet.at(-1), false, "isRejecting was left set");
    }
  });

  test("navigation can only be reached from the success path", () => {
    // Comments are stripped first: the explanatory comment above the fix names
    // navigation.goBack() itself, and counting it would be counting prose.
    const body = stripComments(handlerBody(BATCH, "const handleRejectBatch = async () =>"));
    const finallyAt = body.lastIndexOf("} finally {");
    assert.ok(finallyAt > -1, "the finally block is gone");
    const finallyBlock = body.slice(finallyAt);
    assert.doesNotMatch(
      finallyBlock,
      /navigation\.goBack\(\)/,
      "REGRESSION: goBack() is back in finally — it will fire on failures again",
    );
    const catchAt = body.lastIndexOf("} catch");
    assert.doesNotMatch(
      body.slice(catchAt, finallyAt),
      /navigation\.goBack\(\)/,
      "REGRESSION: goBack() runs on a network failure",
    );
    assert.equal(
      [...body.matchAll(/navigation\.goBack\(\)/g)].length,
      1,
      "there must be exactly one exit, on the success path",
    );
  });

  test("the response is actually captured and checked", () => {
    const body = handlerBody(BATCH, "const handleRejectBatch = async () =>");
    assert.match(body, /const res = await fetch\(/, "the response is discarded again");
    assert.match(body, /if \(!res\.ok\)/);
  });

  test("the request itself is unchanged", () => {
    const body = handlerBody(BATCH, "const handleRejectBatch = async () =>");
    assert.match(body, /"\/api\/driver\/reject-order"/);
    assert.match(body, /method: "POST"/);
    assert.match(body, /JSON\.stringify\(\{ phoneNumber, batchId: batch\.id \}\)/);
    assert.match(body, /if \(!phoneNumber \|\| isRejecting\) return;/, "the re-entry guard is gone");
  });
});

describe("H-28 — DriverOrdersScreen has the same treatment", () => {
  test("pickup: 409 shows the server's message and resyncs", async () => {
    const ctx = await run("ordersPickup", httpFail(409, SERVER_MESSAGES.pickup409));
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر استلام الطلب");
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.pickup409);
    assert.equal(ctx.refreshes, 1);
  });

  test("deliver: 503 shows the server's message and resyncs", async () => {
    const ctx = await run("ordersDeliver", httpFail(503, SERVER_MESSAGES.deliver503));
    assert.equal(ctx.alerts.length, 1);
    assert.equal(ctx.alerts[0].title, "تعذّر تسليم الطلب");
    assert.equal(ctx.alerts[0].message, SERVER_MESSAGES.deliver503);
    assert.equal(ctx.refreshes, 1);
  });

  test("network failures are reported on both", async () => {
    for (const name of ["ordersPickup", "ordersDeliver"]) {
      const ctx = await run(name, netFail);
      assert.equal(ctx.alerts.length, 1, `${name} stayed silent`);
      assert.equal(ctx.alerts[0].message, CONNECTION_ERROR);
    }
  });

  test("success is silent and resyncs", async () => {
    for (const name of ["ordersPickup", "ordersDeliver"]) {
      const ctx = await run(name, httpOk());
      assert.equal(ctx.alerts.length, 0);
      assert.equal(ctx.refreshes, 1);
    }
  });

  test("alreadyCompleted is a success here too", async () => {
    const ctx = await run("ordersDeliver", httpOk({ success: true, alreadyCompleted: true }));
    assert.equal(ctx.alerts.length, 0);
  });

  test("the action spinner is cleared on every path", async () => {
    for (const name of ["ordersPickup", "ordersDeliver"]) {
      for (const impl of [httpFail(409, "x"), netFail, httpOk()]) {
        const ctx = await run(name, impl);
        assert.equal(ctx.loadingSet.at(-1), false, `${name} left the spinner running`);
      }
    }
  });
});

describe("H-28 — the shape cannot silently regress", () => {
  const bodies = {
    "DriverBatchScreen.handlePickup": handlerBody(BATCH, "const handlePickup = async (order: BatchOrder) =>"),
    "DriverBatchScreen.handleArrivedAtStore": handlerBody(BATCH, "const handleArrivedAtStore = async (order: BatchOrder) =>"),
    "DriverBatchScreen.handleDeliver": handlerBody(BATCH, "const handleDeliver = async (order: BatchOrder) =>"),
    "DriverBatchScreen.handleSelectIssue": handlerBody(BATCH, "const handleSelectIssue = async (issueType: string) =>"),
    "DriverBatchScreen.handleRejectBatch": handlerBody(BATCH, "const handleRejectBatch = async () =>"),
    "DriverOrdersScreen.doPickup": handlerBody(ORDERS, "const doPickup = async (order: BatchOrder) =>"),
    "DriverOrdersScreen.doDeliver": handlerBody(ORDERS, "const doDeliver = async (order: BatchOrder) =>"),
  };

  test("every handler checks res.ok explicitly", () => {
    for (const [name, body] of Object.entries(bodies)) {
      assert.match(body, /if \(!res\.ok\)/, `${name} does not handle a failed response`);
    }
  });

  test("no handler has an empty catch any more", () => {
    for (const [name, body] of Object.entries(bodies)) {
      assert.doesNotMatch(body, /catch\s*(\([^)]*\))?\s*\{\s*\}/,
        `${name} still swallows exceptions silently`);
      assert.match(body, /Alert\.alert\("خطأ", CONNECTION_ERROR\)/,
        `${name} does not report a connection failure`);
    }
  });

  test("no handler retries automatically", () => {
    // These are non-idempotent money actions; an automatic retry could double-apply.
    for (const [name, body] of Object.entries(bodies)) {
      assert.doesNotMatch(body, /\bretry\b|for \(let attempt|while \(attempt/i,
        `${name} appears to retry automatically`);
    }
  });

  test("both screens read the error via the shared helper", () => {
    for (const [name, src] of [["DriverBatchScreen", BATCH], ["DriverOrdersScreen", ORDERS]]) {
      assert.match(src, /async function serverError\(res: Response\): Promise<string>/, `${name}`);
      assert.match(src, /typeof data\?\.error === "string"/, `${name}`);
      assert.match(src, /const CONNECTION_ERROR =/, `${name}`);
    }
  });

  test("Alert is imported in both screens", () => {
    for (const [name, src] of [["DriverBatchScreen", BATCH], ["DriverOrdersScreen", ORDERS]]) {
      assert.match(src, /^import \{\n  Alert,/m, `${name} does not import Alert`);
    }
  });

  test("no request URL or method changed", () => {
    for (const path of ["/api/driver/batch/pickup-order", "/api/driver/batch/complete-order",
      "/api/driver/batch/arrived-at-store", "/api/driver/report-issue"]) {
      assert.ok(BATCH.includes(path), `${path} disappeared from DriverBatchScreen`);
    }
    assert.ok(ORDERS.includes("/api/driver/batch/pickup-order"));
    assert.ok(ORDERS.includes("/api/driver/batch/complete-order"));
  });
});
