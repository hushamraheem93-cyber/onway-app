---
name: Order lifecycle verification findings
description: Facts learned from a full live E2E test of the order pipeline (customer → vendor → driver batch), useful when debugging "order stuck" or "no driver assigned" reports.
---

## Driver batch assignment timing
Immediate batch assignment (via the `orderEvents.emit("confirmed")` path) only fires
`assignWaitingBatchToDriver` for drivers **already present in the in-memory `driverQueue`**
at the moment the vendor/admin marks an order `confirmed`. If the driver comes online
*after* the order was confirmed, the order sits with no batch until either:
- the driver goes online (toggle-online also calls `assignWaitingBatchToDriver`), or
- the 30s background watchdog scans for unassigned confirmed orders.

**Why:** `driverQueue` is a plain in-memory array populated only by `/api/driver/toggle-online`,
not derived from Firestore's `isOnline` flag on the `drivers` collection. A driver marked
`isOnline: true` in Firestore but not actively connected this server process lifetime will
NOT receive batches until they call toggle-online again.

**How to apply:** When debugging "driver never got an order" reports, check whether the driver's
app was open/connected (in `driverQueue`) at confirmation time, not just their Firestore
`isOnline` field.

## Vendor marketplace orders need vendorId fallback detection
`POST /api/orders` vendor-detection only matched the legacy product cache
(`categoryId === "restaurants"`). Real vendor-marketplace orders (products created via the
vendor dashboard, living in the `vendorProducts` collection) never got a top-level
`orderData.vendorId`, even though `GET /api/vendor/orders` could still locate them via
item-level `productId` lookups. Fixed by adding a `vendorProducts` lookup fallback in the
order-creation route so `vendorId` is always populated when possible — this matters for
admin filtering, driver batch pickup-address resolution, and vendor analytics.

## Collection name consistency
Delivery batches live in Firestore collection `delivery_batches` (snake_case) everywhere,
except one admin "Operations Center" query that used `deliveryBatches` (camelCase) and
therefore always returned 0 active batches. Watch for this snake_case/camelCase split when
adding new batch queries.
