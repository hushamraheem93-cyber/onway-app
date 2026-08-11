/**
 * Socket broadcast scoping tests (audit finding H-38).
 *
 * The audit describes three unauthenticated sockets receiving a global broadcast
 * with "no handshake authentication, no rooms, no scoping". Most of that is no
 * longer true — the handshake verifies a JWT and pins the identity, `order:watch`
 * enforces ownership before joining a room, `driver:location` takes its identity
 * only from the verified handshake, and the settlement payload was already
 * stripped. What remained was the last sentence of the finding:
 *
 *     ioServer.emit("orders:changed", payload)
 *
 * That reached EVERY socket — and anonymous sockets are permitted by design, since
 * a customer watches an order before signing in. So anyone who opened a socket
 * could read the platform's order flow live: which order moved, to which state, at
 * which second.
 *
 * All four consumers take no argument and refetch through their own authenticated
 * endpoints, so the payload was read by nobody except an observer. Dropping it
 * costs nothing.
 *
 * Run:  node --test tests/unit/socket-broadcast-scope.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const SRC = readFileSync(join(root, "server/routes.ts"), "utf8");
const strip = sharedStripComments;
const CLEAN = strip(SRC);

describe("H-38 · nothing about an order is broadcast to every socket", () => {
  test("orders:changed carries no payload", () => {
    const m = CLEAN.match(/ioServer\.emit\("orders:changed"[^)]*\)/);
    assert.ok(m, "the orders:changed broadcast disappeared");
    assert.equal(m[0], 'ioServer.emit("orders:changed")',
      "the global broadcast still carries order data readable by anonymous sockets");
  });

  test("no global emit anywhere carries a second argument", () => {
    const globals = CLEAN.match(/ioServer\.emit\([^)]*\)/g) ?? [];
    assert.ok(globals.length > 0, "no global emits found — check the pattern");
    for (const g of globals) {
      assert.doesNotMatch(g, /,/,
        `a global broadcast carries data: ${g}`);
    }
  });

  test("the ownership-gated room still gets the full payload", () => {
    assert.match(CLEAN, /ioServer\.to\(`order:\$\{payload\.orderId\}`\)\.emit\("order:status", payload\)/,
      "customers watching their own order lost their live updates");
  });

  test("the settlement broadcasts stay payload-free", () => {
    assert.match(CLEAN, /ioServer\.emit\("settlement:request"\)/);
    assert.match(CLEAN, /ioServer\.emit\("settlements:changed"\)/);
  });
});

describe("H-38 · the authorization model the audit says is missing is present", () => {
  test("the handshake verifies a signed token", () => {
    assert.match(CLEAN, /ioServer\.use\(\(socket, next\)/, "there is no handshake middleware");
    assert.match(CLEAN, /jwt\.verify\(String\(raw\), ROUTES_JWT_SECRET/,
      "the handshake token is not verified");
  });

  test("identity comes from the token, never from the client payload", () => {
    assert.match(CLEAN, /\(socket\.data as any\)\.driverPhone = String\(decoded\.phoneNumber\)/,
      "the driver identity is not pinned from the verified token");
  });

  test("a revoked customer cannot keep a live socket", () => {
    assert.match(CLEAN, /!isCustomerTokenRevoked\(String\(decoded\.phoneNumber\), decoded\.iat\)/,
      "revocation is not checked at the handshake");
  });

  test("joining an order room requires owning it or being its driver", () => {
    const at = CLEAN.indexOf('socket.on("order:watch"');
    assert.ok(at > 0, "order:watch disappeared");
    const body = CLEAN.slice(at, at + 900);
    assert.match(body, /ownerPhone === callerPhone/, "the customer ownership check is gone");
    assert.match(body, /driverAssignments\.get\(orderId\) === driverPhone/,
      "the assigned-driver check is gone");
    assert.match(body, /if \(!isOwner && !isAssignedDriver\) return;/,
      "a stranger can join an arbitrary order room");
    const joinAt = body.indexOf("socket.join(");
    const guardAt = body.indexOf("if (!isOwner && !isAssignedDriver)");
    assert.ok(guardAt >= 0 && joinAt > guardAt,
      "the room is joined before ownership is judged");
  });

  test("a driver cannot publish a location as someone else", () => {
    const at = CLEAN.indexOf('socket.on("driver:location"');
    assert.ok(at > 0, "driver:location disappeared");
    const body = CLEAN.slice(at, at + 900);

    // The identity must come from the verified handshake, never from the message.
    assert.match(body, /const phoneNumber = \(socket\.data as any\)\.driverPhone/,
      "driver:location no longer takes its identity from the handshake");

    // Whatever the client sends is destructured here; a phone must not be in it.
    const params = body.slice(body.indexOf("({") + 1, body.indexOf("=>"));
    assert.doesNotMatch(params, /phone/i,
      `driver:location accepts an identity from the payload: ${params.trim()}`);
  });

  test("the origin check is not the only gate", () => {
    // Origin is a first filter, not the authorization model — both must exist.
    assert.match(CLEAN, /blocked handshake from origin=/, "the origin gate disappeared");
    assert.match(CLEAN, /jwt\.verify/, "origin is the only protection left");
  });
});

describe("H-38 · the clients do not depend on the dropped payload", () => {
  const files = [
    "client/context/OrderContext.tsx",
    "client/context/VendorNotificationsContext.tsx",
    "client/screens/DriverHomeScreen.tsx",
    "client/screens/AdminScreen.tsx",
  ];

  for (const f of files) {
    test(`${f.split("/").pop()} handles orders:changed without reading a payload`, () => {
      const src = readFileSync(join(root, f), "utf8");
      const m = src.match(/on\("orders:changed",\s*\(([^)]*)\)/);
      assert.ok(m, `${f} no longer listens for orders:changed`);
      assert.equal(m[1].trim(), "",
        `${f} reads the broadcast payload — dropping it would break this client`);
    });
  }
});
