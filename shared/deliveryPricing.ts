/**
 * The revenue split on a delivery fee — the one definition (D-3).
 *
 * Two things were tangled together and are now separated for good:
 *
 *   • WHAT the customer pays for delivery. That is the delivery AREA's fee, and
 *     nothing else. There is no per-kind flat fee: a restaurant order and a
 *     shopping order to the same address cost the same, because the cost of
 *     getting there is the same. Only a store's own explicit override can differ.
 *
 *   • HOW that fee is divided. This is the only thing that varies by kind, and it
 *     is a PERCENTAGE — so it scales with the fee instead of ignoring it.
 *
 * The old model had both wrong. `restaurantDeliveryFee` was a flat fee for a kind,
 * behind a condition that could never be true (it required every basket line to be
 * in the legacy `products` collection, which holds no documents), so it was
 * unreachable code. And the driver's earning was a flat amount that ignored the
 * fee entirely, with the platform taking `max(0, fee − flat)` — which, with the
 * live configuration, paid a driver 1000 on a delivery the customer paid 200 for
 * and floored the platform's share at zero in three of seven areas.
 *
 * This module holds no operational amounts. Fees live in `deliveryAreas`, and the
 * percentages live in `system_settings/global.deliveryPricing`, both edited by the
 * admin. The only constant here is the neutral 0 — see DEFAULT_APP_SHARE_PERCENT.
 */

/** The two kinds of order. They differ ONLY in how the delivery fee is split. */
export type OrderKind = "restaurant" | "shopping";

export interface KindPricing {
  /** The platform's cut of the delivery fee, 0–100. The driver gets the rest. */
  appSharePercent: number;
}

export interface DeliveryPricing {
  restaurant: KindPricing;
  shopping: KindPricing;
}

/**
 * The share taken when the admin has not configured one.
 *
 * Zero, deliberately, and it is not a commercial guess: it is the only value that
 * cannot take money the operator never agreed to take. An unconfigured platform
 * keeps nothing and the driver receives the whole fee, which is visible and
 * correctable, rather than a plausible-looking default that quietly bills stores
 * and drivers at a rate nobody chose.
 *
 * The dashboard shows the effective percentages and a per-area preview of the
 * resulting amounts, so an unset split is obvious the first time the page is
 * opened.
 */
export const DEFAULT_APP_SHARE_PERCENT = 0;

export const DEFAULT_DELIVERY_PRICING: DeliveryPricing = {
  restaurant: { appSharePercent: DEFAULT_APP_SHARE_PERCENT },
  shopping: { appSharePercent: DEFAULT_APP_SHARE_PERCENT },
};

const clampPercent = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
};

const clampFee = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
};

/**
 * Coerce whatever is stored into a usable split table.
 *
 * Every field is clamped rather than rejected: this runs on the read path for
 * every order, and a corrupt stored value must degrade to the default, never
 * throw. The WRITE path validates strictly instead, so a bad admin payload is
 * reported rather than silently rewritten.
 */
export function normalizeDeliveryPricing(raw: unknown): DeliveryPricing {
  const source = (raw ?? {}) as Partial<
    Record<OrderKind, Partial<KindPricing>>
  >;
  return {
    restaurant: {
      appSharePercent: clampPercent(
        source.restaurant?.appSharePercent,
        DEFAULT_APP_SHARE_PERCENT,
      ),
    },
    shopping: {
      appSharePercent: clampPercent(
        source.shopping?.appSharePercent,
        DEFAULT_APP_SHARE_PERCENT,
      ),
    },
  };
}

/** The driver's percentage is never stored — it is whatever the platform does not take. */
export function driverSharePercent(appSharePercent: unknown): number {
  return 100 - clampPercent(appSharePercent, DEFAULT_APP_SHARE_PERCENT);
}

/**
 * Split a delivery fee into the platform's share and the driver's earning.
 *
 * The driver's half is the EXACT COMPLEMENT of the platform's, not a second
 * rounding of `100 - percent`. That is the whole point: two independent roundings
 * of the same fee can differ by a dinar, and the pre-D-3 code went further and
 * took the driver's side from a flat table, so `driverEarning > deliveryFee` was
 * reachable and the platform's share silently floored at zero. Here the two always
 * sum to exactly the fee, and neither can exceed it or go negative.
 */
export function splitDeliveryFee(
  deliveryFee: unknown,
  appSharePercent: unknown,
): { appShare: number; driverEarning: number } {
  const fee = clampFee(deliveryFee);
  const percent = clampPercent(appSharePercent, DEFAULT_APP_SHARE_PERCENT);
  const appShare = Math.min(
    fee,
    Math.max(0, Math.round((fee * percent) / 100)),
  );
  return { appShare, driverEarning: fee - appShare };
}

/**
 * Is this store a restaurant?
 *
 * This is the project's existing rule, lifted from the admin store-ranking split
 * (`routes.ts`: `categoryType === "restaurant" || businessType === "restaurant"`)
 * rather than invented here. Both fields matter: stores created from the admin
 * dashboard carry `categoryType`, stores registered from the vendor app carry
 * `businessType`, and two of the three live vendors have only the latter.
 *
 * Everything that is not a restaurant is shopping — grocery, supermarket,
 * pharmacy, bakery and the rest all deliver goods, not meals.
 */
export function isRestaurantVendor(
  vendor: { categoryType?: unknown; businessType?: unknown } | null | undefined,
): boolean {
  if (!vendor) return false;
  return (
    vendor.categoryType === "restaurant" || vendor.businessType === "restaurant"
  );
}

/**
 * The order kind for a store.
 *
 * `legacyAllItemsAreRestaurant` is consulted ONLY when there is no store at all —
 * a legacy `products` order. It never overrides a real store, which is what the
 * pre-D-3 code got backwards in both directions at once.
 */
export function orderKindForVendor(
  vendor: { categoryType?: unknown; businessType?: unknown } | null | undefined,
  legacyAllItemsAreRestaurant = false,
): OrderKind {
  if (vendor) return isRestaurantVendor(vendor) ? "restaurant" : "shopping";
  return legacyAllItemsAreRestaurant ? "restaurant" : "shopping";
}
