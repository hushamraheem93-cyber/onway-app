/**
 * H-71 — "orders:changed is broadcast globally, WITH the payload, to
 * unauthenticated clients", routes.ts:6747–6751. The finding notes that the
 * settlement events were deliberately designed payload-free and that the same
 * pattern was never applied here.
 *
 * Measured on this tree, the payload is already gone. `git log -L` on the emit
 * line shows it was introduced by be584e1 as
 *
 *     ioServer.emit("orders:changed", payload);
 *
 * and stripped by 53ff8c3 ("close audit findings … H-31 to H-46") down to
 *
 *     ioServer.emit("orders:changed");
 *
 * i.e. H-71 and H-38 are the same defect, and H-38 closed it with exactly the
 * settlement pattern H-71 asks for. Nothing is changed here.
 *
 * What this suite adds is proof of the KIND the existing guard does not give.
 * tests/unit/socket-broadcast-scope.test.mjs pins the fix by matching source
 * text; every assertion there is a regex over routes.ts. That catches a
 * re-added argument, but it never demonstrates what an unauthenticated socket
 * actually receives, and a reader cannot tell from it whether the authorized
 * path still delivers.
 *
 * So this file EXECUTES the shipped code. Three regions are lifted verbatim out
 * of server/routes.ts by paren-matching, transpiled, and run against fakes:
 *
 *   1. the orderEvents → socket forwarder  (what each audience receives)
 *   2. the "order:watch" room gate         (who is allowed into the room)
 *   3. the handshake middleware            (how identity is established)
 *
 * Together they answer the finding directly: the only thing an anonymous socket
 * can observe is a bare event name, and the payload goes solely to a room whose
 * membership is decided by a verified token.
 *
 * No real phone number appears here; the corpus is synthetic.
 *
 * Run:  node --test tests/unit/h71-orders-changed-broadcast-scope.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import jwt from "jsonwebtoken";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const CLEAN = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));

// ─── lifting the real code ───────────────────────────────────────────────────

/** Advance past a quoted string starting at `i`; returns the closing index. */
function skipQuoted(src, i, quote) {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === quote) return j;
  }
  throw new Error("unterminated string");
}

/** Advance past a template literal starting at `i`, including nested ${…}. */
function skipTemplate(src, i) {
  let braces = 0;
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "$" && src[j + 1] === "{") { braces++; j++; continue; }
    if (src[j] === "}" && braces > 0) { braces--; continue; }
    if (src[j] === "`" && braces === 0) return j;
  }
  throw new Error("unterminated template");
}

/**
 * The whole `foo(...)` call that starts at `anchor`, with parens balanced and
 * string/template contents skipped so a `)` inside a literal cannot end it.
 */
function liftCall(anchor) {
  const at = CLEAN.indexOf(anchor);
  assert.ok(at > 0, `anchor not found in server/routes.ts: ${anchor}`);
  const open = CLEAN.indexOf("(", at);
  assert.ok(open > at, `no call parenthesis after: ${anchor}`);

  let depth = 0;
  for (let i = open; i < CLEAN.length; i++) {
    const c = CLEAN[i];
    if (c === '"' || c === "'") { i = skipQuoted(CLEAN, i, c); continue; }
    if (c === "`") { i = skipTemplate(CLEAN, i); continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return `${CLEAN.slice(at, i + 1)};`;
  }
  throw new Error(`unbalanced parentheses lifting: ${anchor}`);
}

/** Transpile a lifted statement and run it with the named dependencies bound. */
function run(stmt, deps) {
  const js = ts.transpileModule(stmt, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const names = Object.keys(deps);
  return new Function(...names, js)(...names.map((n) => deps[n]));
}

const FORWARDER = liftCall('orderEvents.on("order:status"');
const WATCH_GATE = liftCall('socket.on("order:watch"');
const HANDSHAKE = liftCall("ioServer.use((socket, next)");

// ─── 1. what each audience actually receives ────────────────────────────────

/** Run the shipped forwarder and record every emit, by audience. */
function forward(payload) {
  const globals = []; // reaches EVERY socket, anonymous included
  const rooms = []; // reaches one ownership-gated room
  const ioServer = {
    emit: (...args) => globals.push(args),
    to: (room) => ({ emit: (...args) => rooms.push([room, ...args]) }),
  };
  let handler = null;
  const orderEvents = {
    on: (name, fn) => {
      if (name === "order:status") handler = fn;
    },
  };
  run(FORWARDER, { orderEvents, ioServer });
  assert.ok(handler, "the forwarder no longer registers an order:status handler");
  handler(payload);
  return { globals, rooms };
}

const ORDER = { orderId: "ord_7f31c2", status: "picked_up" };

describe("H-71 · the global broadcast carries nothing", () => {
  test("an anonymous socket receives the event name and no arguments", () => {
    const { globals } = forward(ORDER);
    assert.deepEqual(
      globals,
      [["orders:changed"]],
      "the global broadcast is no longer a bare ping",
    );
    // Stated as the property rather than the shape, so a future emit of any
    // form still has to satisfy it.
    for (const args of globals)
      assert.equal(
        args.length,
        1,
        `a global broadcast carries ${args.length - 1} argument(s): ${JSON.stringify(args)}`,
      );
  });

  test("no order fact leaks into anything sent globally", () => {
    const { globals } = forward(ORDER);
    const wire = JSON.stringify(globals);
    for (const secret of [ORDER.orderId, ORDER.status])
      assert.ok(
        !wire.includes(secret),
        `"${secret}" is observable by any socket: ${wire}`,
      );
  });

  test("the ping still fires — list screens are not silently starved", () => {
    // The fix must not be "stop broadcasting"; the four consumers refetch on it.
    const { globals } = forward(ORDER);
    assert.equal(globals.length, 1, "the refresh ping disappeared");
    assert.equal(globals[0][0], "orders:changed");
  });

  test("the authorized room still receives the full payload", () => {
    const { rooms } = forward(ORDER);
    assert.deepEqual(rooms, [
      [`order:${ORDER.orderId}`, "order:status", ORDER],
    ]);
  });

  test("a payload without an orderId is not broadcast at all", () => {
    const { globals, rooms } = forward({ status: "delivered" });
    assert.deepEqual(globals, [], "a malformed event still pings every socket");
    assert.deepEqual(rooms, []);
  });
});

// ─── 2. who is allowed into the room that does carry data ───────────────────

/** Run the shipped order:watch gate; returns the rooms actually joined. */
async function watch({ socketData = {}, order, assignedDriver = null, orderId }) {
  let handler = null;
  const joined = [];
  const socket = {
    data: socketData,
    on: (name, fn) => {
      if (name === "order:watch") handler = fn;
    },
    join: (room) => joined.push(room),
  };
  const getOrderById = async () => order;
  const driverAssignments = new Map(
    assignedDriver ? [[orderId, assignedDriver]] : [],
  );
  run(WATCH_GATE, { socket, getOrderById, driverAssignments });
  assert.ok(handler, "order:watch no longer registers a handler");
  await handler({ orderId });
  return joined;
}

const OID = "ord_7f31c2";
const OWNER = "07700000001"; // synthetic
const STRANGER = "07700000002"; // synthetic
const DRIVER = "07700000003"; // synthetic
const ORDER_DOC = { id: OID, phoneNumber: OWNER };

describe("H-71 · only the order's own parties reach the payload", () => {
  test("an anonymous socket cannot join", async () => {
    assert.deepEqual(
      await watch({ socketData: {}, order: ORDER_DOC, orderId: OID }),
      [],
      "an unauthenticated client joined the room that streams order status and driver GPS",
    );
  });

  test("a signed-in customer who does not own the order cannot join", async () => {
    assert.deepEqual(
      await watch({
        socketData: { customerPhone: STRANGER },
        order: ORDER_DOC,
        orderId: OID,
      }),
      [],
      "any authenticated customer can watch any order by id",
    );
  });

  test("the owning customer joins", async () => {
    assert.deepEqual(
      await watch({
        socketData: { customerPhone: OWNER },
        order: ORDER_DOC,
        orderId: OID,
      }),
      [`order:${OID}`],
      "the customer lost live updates for their own order",
    );
  });

  test("the assigned driver joins", async () => {
    assert.deepEqual(
      await watch({
        socketData: { driverPhone: DRIVER },
        order: ORDER_DOC,
        assignedDriver: DRIVER,
        orderId: OID,
      }),
      [`order:${OID}`],
      "the assigned driver lost live updates for their own delivery",
    );
  });

  test("a driver who is not assigned to this order cannot join", async () => {
    assert.deepEqual(
      await watch({
        socketData: { driverPhone: DRIVER },
        order: ORDER_DOC,
        assignedDriver: null,
        orderId: OID,
      }),
      [],
      "any driver can watch any order",
    );
  });

  test("an unknown order id joins nothing", async () => {
    assert.deepEqual(
      await watch({
        socketData: { customerPhone: OWNER },
        order: null,
        orderId: "does_not_exist",
      }),
      [],
    );
  });
});

// ─── 3. where the identity in step 2 comes from ─────────────────────────────

const SECRET = "test-only-secret-not-a-real-key";

/** Run the shipped handshake middleware against one token. */
function handshake(token, { revoked = false } = {}) {
  let middleware = null;
  const ioServer = { use: (fn) => { middleware = fn; } };
  run(HANDSHAKE, {
    ioServer,
    jwt,
    ROUTES_JWT_SECRET: SECRET,
    JWT_VERIFY_OPTS: { algorithms: ["HS256"] },
    isCustomerTokenRevoked: () => revoked,
  });
  assert.ok(middleware, "the handshake middleware is gone");
  const socket = {
    handshake: { auth: token ? { token } : {}, headers: {} },
    data: {},
  };
  let passed = false;
  middleware(socket, () => { passed = true; });
  return { data: socket.data, passed };
}

const sign = (claims, secret = SECRET) =>
  jwt.sign(claims, secret, { algorithm: "HS256" });

describe("H-71 · socket identity comes from a verified token", () => {
  test("no token → the socket connects but carries no identity", () => {
    const { data, passed } = handshake(null);
    assert.equal(passed, true, "anonymous sockets are dropped — customers watch before signing in");
    assert.equal(data.customerPhone, undefined);
    assert.equal(data.driverPhone, undefined);
  });

  test("a token signed with the wrong key grants nothing", () => {
    const forged = sign({ role: "driver", phoneNumber: DRIVER }, "attacker-key");
    const { data, passed } = handshake(forged);
    assert.equal(passed, true, "an invalid token drops the socket instead of staying anonymous");
    assert.equal(data.driverPhone, undefined, "a forged token minted a driver identity");
    assert.equal(data.role, undefined);
  });

  test("a valid customer token pins the customer identity", () => {
    const { data } = handshake(sign({ role: "customer", phoneNumber: OWNER }));
    assert.equal(data.customerPhone, OWNER);
    assert.equal(data.driverPhone, undefined, "a customer token granted driver rights");
  });

  test("a revoked customer gets no identity (H-10)", () => {
    const { data } = handshake(sign({ role: "customer", phoneNumber: OWNER }), {
      revoked: true,
    });
    assert.equal(
      data.customerPhone,
      undefined,
      "a revoked customer keeps a live socket and its order events",
    );
  });

  test("a valid driver token pins the driver identity only", () => {
    const { data } = handshake(sign({ role: "driver", phoneNumber: DRIVER }));
    assert.equal(data.driverPhone, DRIVER);
    assert.equal(data.customerPhone, undefined, "a driver token granted customer rights");
  });

  test("the identity is never read from the client-supplied handshake body", () => {
    // A client may put anything in `auth`; only the signed token counts.
    let middleware = null;
    const ioServer = { use: (fn) => { middleware = fn; } };
    run(HANDSHAKE, {
      ioServer,
      jwt,
      ROUTES_JWT_SECRET: SECRET,
      JWT_VERIFY_OPTS: { algorithms: ["HS256"] },
      isCustomerTokenRevoked: () => false,
    });
    const socket = {
      handshake: {
        auth: { phoneNumber: DRIVER, role: "driver", driverPhone: DRIVER },
        headers: {},
      },
      data: {},
    };
    middleware(socket, () => {});
    assert.deepEqual(
      socket.data,
      {},
      "the handshake trusted fields the client sent instead of the signed token",
    );
  });
});

// ─── 4. the pattern H-71 points at is the one in use ────────────────────────

describe("H-71 · the settlement pattern is applied, not reinvented", () => {
  test("every global emit in routes.ts is a bare ping", () => {
    const globals = CLEAN.match(/ioServer\.emit\([^)]*\)/g) ?? [];
    assert.ok(globals.length >= 4, `only ${globals.length} global emits found`);
    for (const g of globals)
      assert.doesNotMatch(g, /,/, `a global broadcast carries data: ${g}`);
  });

  test("orders:changed and the settlement events are emitted the same way", () => {
    for (const evt of ["orders:changed", "settlement:request", "settlements:changed"])
      assert.ok(
        CLEAN.includes(`ioServer.emit("${evt}")`),
        `${evt} is no longer a payload-free broadcast`,
      );
  });
});
