import { api, adminApi, assertStatus, runSuite, assert } from "../utils/helpers.mjs";

const CLEANUP = { categoryId: null, bannerId: null, promoId: null, deliveryAreaId: null };

export async function runAdminTests() {
  await runSuite("🔐 Admin — Auth", [
    ["GET /api/admin/categories without auth returns 401", async () => {
      const r = await api("GET", "/api/admin/categories");
      assertStatus(r, 401, "admin without auth");
    }],
    ["GET /api/admin/categories with valid cookie returns array", async () => {
      const r = await adminApi("GET", "/api/admin/categories");
      assertStatus(r, 200, "admin categories");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/vendors returns array", async () => {
      const r = await adminApi("GET", "/api/admin/vendors");
      assertStatus(r, 200, "admin vendors");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/orders returns array", async () => {
      const r = await adminApi("GET", "/api/admin/orders");
      assertStatus(r, 200, "admin orders");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/drivers returns array", async () => {
      const r = await adminApi("GET", "/api/admin/drivers");
      assertStatus(r, 200, "admin drivers");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/users returns array", async () => {
      const r = await adminApi("GET", "/api/admin/users");
      assertStatus(r, 200, "admin users");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/promo-codes returns array", async () => {
      const r = await adminApi("GET", "/api/admin/promo-codes");
      assertStatus(r, 200, "admin promo-codes");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/driver-stats returns stats", async () => {
      const r = await adminApi("GET", "/api/admin/driver-stats");
      assertStatus(r, 200, "admin driver-stats");
    }],
    ["GET /api/admin/financial-reports returns data", async () => {
      const r = await adminApi("GET", "/api/admin/financial-reports");
      assertStatus(r, 200, "admin financial-reports");
    }],
    ["GET /api/admin/owner-earnings returns data", async () => {
      const r = await adminApi("GET", "/api/admin/owner-earnings");
      assertStatus(r, 200, "admin owner-earnings");
    }],
    ["GET /api/admin/notification-stats returns data", async () => {
      const r = await adminApi("GET", "/api/admin/notification-stats");
      assertStatus(r, 200, "admin notification-stats");
    }],
    ["GET /api/admin/delivery-areas returns array", async () => {
      const r = await adminApi("GET", "/api/admin/delivery-areas");
      assertStatus(r, 200, "admin delivery-areas");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/banners returns array", async () => {
      const r = await adminApi("GET", "/api/admin/banners");
      assertStatus(r, 200, "admin banners");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
    ["GET /api/admin/products returns array", async () => {
      const r = await adminApi("GET", "/api/admin/products");
      assertStatus(r, 200, "admin products");
      if (!Array.isArray(r.body)) throw new Error("Expected array");
    }],
  ]);

  await runSuite("🗂 Admin — Categories CRUD", [
    ["POST /api/admin/categories creates category", async () => {
      const r = await adminApi("POST", "/api/admin/categories", {
        name: "[TEST] فئة اختبار",
        description: "وصف تجريبي",
        sortOrder: 999,
      });
      if (r.status !== 200 && r.status !== 201) {
        throw new Error(`Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
      }
      CLEANUP.categoryId = r.body?.id || r.body?.categoryId;
    }],
    ["PUT /api/admin/categories/:id updates category", async () => {
      if (!CLEANUP.categoryId) throw new Error("No category id");
      const r = await adminApi("PUT", `/api/admin/categories/${CLEANUP.categoryId}`, {
        name: "[TEST] فئة اختبار محدّثة",
        description: "وصف محدّث",
        sortOrder: 998,
      });
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["DELETE /api/admin/categories/:id deletes category", async () => {
      if (!CLEANUP.categoryId) throw new Error("No category id");
      const r = await adminApi("DELETE", `/api/admin/categories/${CLEANUP.categoryId}`);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
  ]);

  await runSuite("🎟 Admin — Promo Codes CRUD", [
    ["POST /api/admin/promo-codes creates promo code", async () => {
      const r = await adminApi("POST", "/api/admin/promo-codes", {
        code: "TEST_PROMO_AUTO_99",
        type: "fixed",
        value: 1000,
        expiryDate: "2027-12-31",
        isActive: true,
      });
      if (r.status !== 200 && r.status !== 201 && r.status !== 409) {
        throw new Error(`Expected 200/201/409, got ${r.status}: ${JSON.stringify(r.body)}`);
      }
      CLEANUP.promoId = r.body?.id || r.body?.promoId;
    }],
    ["PUT /api/admin/promo-codes/:id updates promo", async () => {
      if (!CLEANUP.promoId) throw new Error("No promo id");
      const r = await adminApi("PUT", `/api/admin/promo-codes/${CLEANUP.promoId}`, {
        code: "TEST_PROMO_AUTO_99",
        type: "fixed",
        value: 2000,
        isActive: false,
      });
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["DELETE /api/admin/promo-codes/:id deletes promo", async () => {
      if (!CLEANUP.promoId) throw new Error("No promo id");
      const r = await adminApi("DELETE", `/api/admin/promo-codes/${CLEANUP.promoId}`);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
  ]);

  await runSuite("🏢 Admin — Delivery Areas CRUD", [
    ["POST /api/admin/delivery-areas creates area", async () => {
      const r = await adminApi("POST", "/api/admin/delivery-areas", {
        name: "[TEST] منطقة اختبار",
        fee: 2500,
        active: true,
      });
      if (r.status !== 200 && r.status !== 201) {
        throw new Error(`Expected 200/201, got ${r.status}: ${JSON.stringify(r.body)}`);
      }
      CLEANUP.deliveryAreaId = r.body?.id;
    }],
    ["PUT /api/admin/delivery-areas/:id updates area", async () => {
      if (!CLEANUP.deliveryAreaId) throw new Error("No area id");
      const r = await adminApi("PUT", `/api/admin/delivery-areas/${CLEANUP.deliveryAreaId}`, {
        name: "[TEST] منطقة محدّثة",
        fee: 3000,
        active: false,
      });
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
    ["DELETE /api/admin/delivery-areas/:id deletes area", async () => {
      if (!CLEANUP.deliveryAreaId) throw new Error("No area id");
      const r = await adminApi("DELETE", `/api/admin/delivery-areas/${CLEANUP.deliveryAreaId}`);
      if (r.status !== 200 && r.status !== 404) throw new Error(`Unexpected status ${r.status}`);
    }],
  ]);
}
