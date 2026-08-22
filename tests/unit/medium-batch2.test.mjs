import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { resolveRateLimit } from "../../server/rateLimitPolicy.ts";
import { sniffImageMime } from "../../server/orderValidation.ts";

const routes = fs.readFileSync(new URL("../../server/routes.ts", import.meta.url), "utf8");
const vendor = fs.readFileSync(new URL("../../server/vendor.ts", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../../server/index.ts", import.meta.url), "utf8");

const limits = {
  "/api/users/:phoneNumber": 30,
  "/api/orders/:orderId/rate": 30,
  "/api/reverse-geocode": 60,
  default: 600,
};

describe("M-12 — promo apply is identity-bound", () => {
  test("requires customer auth and ignores body userId", () => {
    const routeAt = routes.indexOf('app.post("/api/promo-codes/apply"');
    assert.ok(routeAt >= 0);
    const body = routes.slice(routeAt, routeAt + 1900);
    assert.match(body, /app\.post\("\/api\/promo-codes\/apply", requireCustomerAuth,/);
    assert.match(body, /const userId = \(req as any\)\.customerPhone/);
    assert.doesNotMatch(body, /const \{ code, userId, cartTotal \} = req\.body/);
    assert.match(body, /checkPromoUsage\(userId, code\.toUpperCase\(\)\)/);
  });
});

describe("M-13 — reverse geocode remains public but cost-bounded", () => {
  test("public route is explicitly covered by its 60/min limiter", () => {
    assert.match(index, /"\/api\/reverse-geocode": 60/);
    assert.match(routes, /app\.get\("\/api\/reverse-geocode", async/);
    assert.doesNotMatch(routes, /app\.get\("\/api\/reverse-geocode", requireCustomerAuth/);
  });
});

describe("M-14 — parameterized rate limits", () => {
  test("dynamic path resolves to its policy instead of default", () => {
    assert.equal(resolveRateLimit("/api/users/07700000001", limits), 30);
    assert.equal(resolveRateLimit("/api/orders/abc/rate", limits), 30);
    assert.equal(resolveRateLimit("/api/reverse-geocode", limits), 60);
    assert.equal(resolveRateLimit("/api/unknown/path", limits), 600);
  });

  test("production middleware uses the shared resolver", () => {
    assert.match(index, /resolveRateLimit\(fullPath, LIMITS\)/);
    assert.match(index, /"\/api\/users\/:phoneNumber": 30/);
  });
});

describe("M-16 — request bodies are bounded by route", () => {
  test("default JSON is 1MB, with 10MB only for driver registration", () => {
    assert.match(index, /isLargeJsonPath = req\.method === "POST" && req\.path === "\/api\/drivers"/);
    assert.match(index, /const largeJsonParser = express\.json\(\{ limit: "10mb" \}\)/);
    assert.match(index, /const defaultJsonParser = express\.json\(\{ limit: "1mb" \}\)/);
    assert.match(index, /express\.urlencoded\(\{ extended: false, limit: "100kb" \}\)/);
  });
});

describe("M-17 — uploads validate actual bytes", () => {
  test("fake image content is rejected by magic-byte detector", () => {
    assert.equal(sniffImageMime(Buffer.from("<html><script>alert(1)</script></html>")), null);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    assert.equal(sniffImageMime(png), "image/png");
  });

  test("all server image paths call content validation before processing", () => {
    assert.match(routes, /function detectedUploadImageMime/);
    assert.match(routes, /const detected = detectedUploadImageMime\(req\.file\)/);
    assert.match(routes, /const webpBuffer = await sharp\(req\.file\.buffer\)/);
    assert.match(vendor, /function assertImageMagicBytes/);
    assert.match(vendor, /assertImageMagicBytes\(file\)/);
    assert.match(vendor, /assertImageMagicBytes\(files\.profileImage\[0\]\)/);
    assert.match(vendor, /assertImageMagicBytes\(files\.coverImage\[0\]\)/);
  });
});

describe("M-19 — settlement mutations have dedicated limits", () => {
  test("settlement request and admin mutation paths are not on default 600/min", () => {
    assert.match(index, /"\/api\/driver\/settlement\/request": 10/);
    assert.match(index, /"\/api\/vendor\/settlement\/request": 10/);
    assert.match(index, /"\/api\/admin\/settlements\/approve": 20/);
    assert.match(index, /"\/api\/admin\/settlements\/reject": 20/);
    assert.match(index, /"\/api\/admin\/settlements\/complete": 20/);
    assert.equal(resolveRateLimit("/api/driver/settlement/request", { ...limits, "/api/driver/settlement/request": 10 }), 10);
  });
});
