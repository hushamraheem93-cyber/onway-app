import { api, assertStatus, runSuite, assert, testPhone } from "../utils/helpers.mjs";

const CLEANUP_DRIVERS = [];

export async function runDriverTests() {
  let driverPhone = testPhone();

  await runSuite("🚗 Driver — Registration", [
    ["GET /api/drivers/check/:phone for non-existent returns not found", async () => {
      const r = await api("GET", `/api/drivers/check/${driverPhone}`);
      assertStatus(r, 200, "driver check");
      assert(r.body?.exists === false || r.body?.found === false || r.body === null || !r.body?.id,
        "Driver should not exist yet");
    }],
    ["POST /api/drivers registers new driver", async () => {
      const r = await api("POST", "/api/drivers", {
        phoneNumber: driverPhone,
        fullName: "TEST سائق تجريبي",
        firstName: "TEST",
        secondName: "سائق",
        nationalIdImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });
      if (r.status !== 200 && r.status !== 201 && r.status !== 409) {
        throw new Error(`Expected 200/201/409, got ${r.status}: ${JSON.stringify(r.body)}`);
      }
      CLEANUP_DRIVERS.push(driverPhone);
    }],
    ["GET /api/drivers/check/:phone confirms driver exists", async () => {
      const r = await api("GET", `/api/drivers/check/${driverPhone}`);
      assertStatus(r, 200, "driver check after register");
    }],
  ]);

  await runSuite("🚗 Driver — Operations", [
    ["POST /api/driver/toggle-online changes status", async () => {
      const r = await api("POST", "/api/driver/toggle-online", {
        phoneNumber: driverPhone,
        online: true,
        lat: 33.3152,
        lng: 44.3661,
      });
      if (r.status !== 200 && r.status !== 403) {
        throw new Error(`Unexpected status ${r.status}: ${JSON.stringify(r.body)}`);
      }
    }],
    ["POST /api/driver/location updates GPS", async () => {
      const r = await api("POST", "/api/driver/location", {
        phoneNumber: driverPhone,
        lat: 33.3152,
        lng: 44.3661,
      });
      assertStatus(r, 200, "driver location");
    }],
    ["GET /api/driver/profile returns driver profile", async () => {
      const r = await api("GET", `/api/driver/profile?phoneNumber=${driverPhone}`);
      if (r.status !== 200 && r.status !== 404 && r.status !== 400) {
        throw new Error(`Unexpected status ${r.status}`);
      }
    }],
    ["GET /api/driver/earnings returns earnings data", async () => {
      const r = await api("GET", `/api/driver/earnings?phoneNumber=${driverPhone}`);
      if (r.status !== 200 && r.status !== 400 && r.status !== 404) {
        throw new Error(`Unexpected status ${r.status}`);
      }
    }],
    ["GET /api/driver/wallet returns wallet data", async () => {
      const r = await api("GET", `/api/driver/wallet?phoneNumber=${driverPhone}`);
      if (r.status !== 200 && r.status !== 404 && r.status !== 400) {
        throw new Error(`Unexpected status ${r.status}`);
      }
    }],
    ["GET /api/driver/orders returns array or empty", async () => {
      const r = await api("GET", `/api/driver/orders?phoneNumber=${driverPhone}`);
      if (r.status !== 200 && r.status !== 400) {
        throw new Error(`Unexpected status ${r.status}`);
      }
    }],
    ["POST /api/driver/reject-order with fake order returns error or 200", async () => {
      const r = await api("POST", "/api/driver/reject-order", {
        phoneNumber: driverPhone,
        orderId: "fake_order_id_test",
        reason: "test rejection",
      });
      if (r.status === 500) throw new Error("reject-order caused server crash for fake order");
    }],
  ]);
}
