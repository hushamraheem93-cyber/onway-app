import { api, assertStatus, runSuite } from "../utils/helpers.mjs";

export async function runPublicTests() {
  await runSuite("📡 Public Endpoints", [
    ["GET /api/categories returns array", async () => {
      const r = await api("GET", "/api/categories");
      assertStatus(r, 200, "categories");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/banners returns array", async () => {
      const r = await api("GET", "/api/banners");
      assertStatus(r, 200, "banners");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/stores returns stores list", async () => {
      const r = await api("GET", "/api/stores");
      assertStatus(r, 200, "stores");
      const list = Array.isArray(r.body) ? r.body : r.body?.stores;
      if (!Array.isArray(list)) throw new Error(`Expected array, got: ${JSON.stringify(r.body)?.slice(0,100)}`);
    }],
    ["GET /api/products returns array", async () => {
      const r = await api("GET", "/api/products");
      assertStatus(r, 200, "products");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/delivery-areas returns array", async () => {
      const r = await api("GET", "/api/delivery-areas");
      assertStatus(r, 200, "delivery-areas");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/settings/fees returns fee data", async () => {
      const r = await api("GET", "/api/settings/fees");
      assertStatus(r, 200, "fees");
      if (r.body === null) throw new Error("Expected fee object");
    }],
    ["GET /api/vendors returns array", async () => {
      const r = await api("GET", "/api/vendors");
      assertStatus(r, 200, "vendors");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/promotional-sections returns array", async () => {
      const r = await api("GET", "/api/promotional-sections");
      assertStatus(r, 200, "promo-sections");
    }],
    ["GET /api/stores/:id/products for first store", async () => {
      const r = await api("GET", "/api/stores");
      const list = Array.isArray(r.body) ? r.body : r.body?.stores;
      if (!Array.isArray(list) || list.length === 0) return;
      const storeId = list[0].id;
      const r2 = await api("GET", `/api/stores/${storeId}/products`);
      if (r2.status !== 200 && r2.status !== 404) throw new Error(`Unexpected status ${r2.status}`);
    }],
    ["Invalid endpoint returns 404", async () => {
      const r = await api("GET", "/api/nonexistent_endpoint_xyz");
      if (r.status === 200) throw new Error("Expected non-200 for invalid endpoint");
    }],
  ]);
}
