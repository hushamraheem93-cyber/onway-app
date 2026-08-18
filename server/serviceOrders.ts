/**
 * C-06 / C-07 — the two service requests the app advertises but could never place.
 *
 * `POST /api/orders` assumes every line names a product in the catalogue. The
 * courier-pickup and international-shopping screens do not sell a catalogue
 * product: one asks a driver to collect something from a third party, the other
 * asks the company to buy an item from a foreign site and quote it later. They
 * sent synthetic ids — `courier-pickup`, `international-<site>` — that the pricing
 * loop cannot resolve, so every attempt died on
 * «منتج غير موجود أو غير متاح» and the two features produced zero orders.
 *
 * Three separate gates rejected them, and the audit only named the first two:
 *
 *   1. no Authorization header            (fixed earlier; the screens send it now)
 *   2. the synthetic productId            → unknownProductIds → 400
 *   3. the region                         → H-02 refuses any order whose region is
 *                                           not an active delivery area, and these
 *                                           screens send "خدمات المندوب" /
 *                                           "التسوق الدولي", which never are.
 *
 * This module is the narrow, explicit exception the audit asked for — NOT a bypass.
 * Nothing here loosens the product path: a line is treated as a service line only
 * when the order is TAGGED as that service AND carries exactly that service's own
 * id and nothing else. An unknown productId is still rejected; a product order that
 * happens to name `courier-pickup` is still rejected; and a service order carrying a
 * real product alongside is rejected too.
 *
 * Money: the client's `price`/`total` are never trusted. The delivery fee is this
 * module's constant, the service fee stays the configured server value, and the only
 * client number that survives is the courier's declared goods value — which is cash
 * the customer hands the driver for a third party, not platform revenue — and it is
 * parsed, floored, integer-rounded and capped here before it is allowed anywhere
 * near a total.
 */

/** The order tags that mean "this is a service request, not a basket". */
export const SERVICE_ORDER_TYPES = [
  "courier-pickup",
  "international-shopping",
] as const;
export type ServiceOrderType = (typeof SERVICE_ORDER_TYPES)[number];

/**
 * The foreign sites the international screen offers. Kept as an allowlist so a
 * hand-made request cannot invent `international-anything` and have it accepted.
 */
export const INTERNATIONAL_SITES = ["shein", "aliexpress", "alibaba"] as const;

/** The single line id a courier-pickup request must carry. */
export const COURIER_PICKUP_PRODUCT_ID = "courier-pickup";

/**
 * Delivery fee charged for a service request, in IQD.
 *
 * A service request has no delivery area to price against — the screens collect a
 * pickup address, not one of the four configured regions — so H-02's area lookup
 * can never resolve one. This constant is the server-side answer, matching the base
 * area fee. It is deliberately a constant and not a request field: the whole point
 * of H-02 was that a client-supplied delivery fee bought free delivery.
 *
 * Making this admin-configurable is a reasonable follow-up; it is not done here
 * because it would mean touching the settings schema and admin UI, which is outside
 * what C-06/C-07 describe.
 */
export const SERVICE_REQUEST_DELIVERY_FEE = 3000;

/**
 * Ceiling on the goods value a courier request may declare, in IQD.
 *
 * The value is the customer's own statement of what the driver will be handing over
 * at the other end. It cannot be verified, so it is capped: an unbounded number here
 * would flow into the order total, the driver's cash-collected figure and the
 * settlement ledger.
 */
export const MAX_DECLARED_VALUE = 5_000_000;

export function isServiceOrderType(value: unknown): value is ServiceOrderType {
  return (
    typeof value === "string" &&
    (SERVICE_ORDER_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Is this productId one only a service request may use?
 *
 * Used to keep the two id spaces apart in BOTH directions: the product path must
 * never resolve one of these, and a service order must never carry anything else.
 */
export function isServiceProductId(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return (
    value === COURIER_PICKUP_PRODUCT_ID || value.startsWith("international-")
  );
}

/** The exact line id required for a given service type. */
export function serviceProductIdFor(
  type: ServiceOrderType,
  site?: string,
): string {
  return type === "courier-pickup"
    ? COURIER_PICKUP_PRODUCT_ID
    : `international-${site ?? ""}`;
}

/**
 * Parse a declared goods value into something safe to put in a total.
 *
 * Returns null for anything that is not a finite, non-negative number within the
 * cap — including the strings and nulls a hand-made request can send. `Number(null)`
 * is 0, so the type is checked before the coercion.
 */
export function parseDeclaredValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const rounded = Math.round(n);
  if (rounded > MAX_DECLARED_VALUE) return null;
  return rounded;
}

const trimmed = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export interface ServiceOrderInput {
  orderType: unknown;
  items: unknown;
  courierDetails?: unknown;
  internationalDetails?: unknown;
}

export interface ResolvedServiceOrder {
  type: ServiceOrderType;
  /** Server-sanitised subtotal for the single line. Never the client's `price`. */
  declaredValue: number;
  /** Server-decided delivery fee. Never the client's `deliveryFee`. */
  deliveryFee: number;
  /** The one line to store, rebuilt from validated parts. */
  line: { productId: string; name: string; quantity: number };
  /** Sanitised detail object to persist — never the raw client payload. */
  details: Record<string, unknown>;
}

export type ServiceOrderResult =
  | { ok: true; value: ResolvedServiceOrder }
  | { ok: false; error: string };

/**
 * Decide whether this request is a valid service request, and on what terms.
 *
 * Returns `{ok:false}` with a customer-facing message when the order is TAGGED as a
 * service but does not hold together. Callers must treat a non-service tag as "not
 * my business" BEFORE calling — `isServiceOrderType` is the gate.
 */
export function resolveServiceOrder(
  input: ServiceOrderInput,
): ServiceOrderResult {
  const type = input.orderType;
  if (!isServiceOrderType(type)) {
    return { ok: false, error: "نوع الطلب غير مدعوم" };
  }

  if (!Array.isArray(input.items) || input.items.length !== 1) {
    // One line, always. Without this a service tag would be a way to smuggle real
    // products past the catalogue check by hiding them behind the exempt line.
    return { ok: false, error: "طلب الخدمة يجب أن يحتوي على عنصر واحد فقط" };
  }
  const item = input.items[0] as Record<string, unknown>;
  const productId = typeof item?.productId === "string" ? item.productId : "";

  const quantityRaw = Number(item?.quantity);
  const quantity =
    Number.isFinite(quantityRaw) && quantityRaw >= 1
      ? Math.min(99, Math.floor(quantityRaw))
      : 1;

  if (type === "courier-pickup") {
    if (productId !== COURIER_PICKUP_PRODUCT_ID) {
      return { ok: false, error: "بيانات طلب المندوب غير صحيحة" };
    }
    const d = (input.courierDetails ?? {}) as Record<string, unknown>;
    const courierPhone = trimmed(d.courierPhone, 20);
    const pickupLocation = trimmed(d.pickupLocation, 500);
    if (!courierPhone || !pickupLocation) {
      return {
        ok: false,
        error: "يرجى إدخال رقم المندوب وموقع الاستلام",
      };
    }
    // The declared value comes from the detail object, never from item.price —
    // item.price is the field the client would have to be trusted on.
    const declaredValue = parseDeclaredValue(d.declaredValue);
    if (declaredValue === null) {
      return {
        ok: false,
        error: `قيمة الطلب غير صالحة — الحد الأقصى ${MAX_DECLARED_VALUE} دينار`,
      };
    }
    return {
      ok: true,
      value: {
        type,
        declaredValue,
        deliveryFee: SERVICE_REQUEST_DELIVERY_FEE,
        line: {
          productId: COURIER_PICKUP_PRODUCT_ID,
          name: "استلام طلب من المندوب",
          quantity,
        },
        details: {
          courierPhone,
          pickupLocation,
          declaredValue,
          notes: trimmed(d.notes, 1000) || undefined,
        },
      },
    };
  }

  // international-shopping
  const d = (input.internationalDetails ?? {}) as Record<string, unknown>;
  const site = trimmed(d.site, 40);
  if (!(INTERNATIONAL_SITES as readonly string[]).includes(site)) {
    return { ok: false, error: "الموقع المختار غير مدعوم" };
  }
  if (productId !== serviceProductIdFor(type, site)) {
    // The line must name the SAME site the details do; otherwise the stored order
    // and the quoted request would describe two different things.
    return { ok: false, error: "بيانات طلب التسوق الدولي غير صحيحة" };
  }
  const productLink = trimmed(d.productLink, 2000);
  const productDetails = trimmed(d.productDetails, 2000);
  if (!productLink || !productDetails) {
    return { ok: false, error: "يرجى إدخال رابط المنتج وتفاصيله" };
  }
  return {
    ok: true,
    value: {
      type,
      // A quote request: nothing is priced yet, so the goods value is zero until an
      // administrator quotes it. The client's `price: 0` is not what decides this —
      // this line is why it is zero.
      declaredValue: 0,
      deliveryFee: SERVICE_REQUEST_DELIVERY_FEE,
      line: {
        productId: serviceProductIdFor(type, site),
        name: `طلب من ${site}`,
        quantity,
      },
      details: {
        site,
        productLink,
        productDetails,
        quantity,
        notes: trimmed(d.notes, 1000) || undefined,
      },
    },
  };
}
