/**
 * Reorder planning (H-53).
 *
 * OrdersScreen rebuilt the cart straight out of the historical order document:
 *
 *     product: { id, name, price: item.price, inStock: true, … }
 *
 * — the price the customer paid last time, availability asserted rather than
 * checked, and `selectedVariantId` / `selectedAddons` dropped even though the
 * order carries them. The server re-prices every line against the live product
 * (routes.ts) and refuses the order when the client's figure disagrees by more
 * than 1 IQD, so a reorder of anything whose price had moved died on
 * "أسعار بعض المنتجات تغيّرت" — from the cart, with nothing on screen explaining
 * which product or what to do about it. An item that had been delisted or marked
 * out of stock reached the cart the same way and failed the same way.
 *
 * planReorder() is the whole decision, kept pure so it can be tested against the
 * real order and product shapes:
 *   • every line is rebuilt from the CURRENT product — current price, current
 *     name, image and availability;
 *   • a product that no longer exists, or is out of stock, is left out and named;
 *   • a line that carried a variant or addons is left out and named, because no
 *     customer-facing endpoint exposes the store's current variants/addons, so
 *     replaying the historical ids would send the server values it cannot verify;
 *   • price movements are reported, never silently applied and never overridden
 *     with the old figure.
 *
 * The caller decides what to do with the report; this module never guesses on the
 * customer's behalf.
 */
import type { CartItem } from "@/context/CartContext";
import type { Product } from "@/constants/categories";

/** One historical line as stored on the order document. */
export interface HistoricalOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  restaurant?: string;
  variantName?: string;
  variantPriceAdjustment?: number;
  selectedVariantId?: string;
  selectedAddons?: { id: string; name: string; price: number }[];
}

/**
 * A product as the live endpoints return it. `/api/stores/:id/products` uses
 * `stock` + `imageUrl`; the legacy `/api/products` catalog uses `inStock` +
 * `image`. Both are accepted so the caller can pass whichever it fetched.
 */
export interface LiveProduct {
  id: string;
  name?: string;
  price?: number;
  image?: string;
  imageUrl?: string;
  description?: string;
  inStock?: boolean;
  stock?: number;
  vendorId?: string;
  storeName?: string;
  restaurant?: string;
  categoryId?: string;
}

export type ExclusionReason = "missing" | "out_of_stock" | "needs_options";

export interface ExcludedLine {
  productId: string;
  name: string;
  reason: ExclusionReason;
}

export interface PriceChange {
  productId: string;
  name: string;
  was: number;
  now: number;
}

export interface ReorderPlan {
  /** Lines that can go into the cart, priced from the live product. */
  items: CartItem[];
  /** Lines deliberately left out, with the reason to show the customer. */
  excluded: ExcludedLine[];
  /** Included lines whose price moved since the original order. */
  priceChanges: PriceChange[];
}

/** Arabic text for a reason, for the confirmation dialog. */
export const EXCLUSION_TEXT: Record<ExclusionReason, string> = {
  missing: "لم يعد متوفراً في المتجر",
  out_of_stock: "نفدت الكمية حالياً",
  needs_options: "يحتوي خيارات أو إضافات — أضِفه من صفحة المنتج",
};

/**
 * Is this live product orderable?
 *
 * `inStock === false` is the legacy catalog's explicit flag and always wins.
 * Otherwise a numeric `stock` decides, matching how every store screen maps a
 * vendor product (`inStock: p.stock > 0`). A product carrying neither field is
 * treated as available — the server still re-checks before the order is accepted.
 */
export function isProductAvailable(p: LiveProduct): boolean {
  if (p.inStock === false) return false;
  if (typeof p.stock === "number") return p.stock > 0;
  return true;
}

/** Did this historical line depend on options the client cannot re-verify? */
function carriesOptions(item: HistoricalOrderItem): boolean {
  return Boolean(
    item.selectedVariantId ||
      item.variantName ||
      (item.selectedAddons && item.selectedAddons.length > 0),
  );
}

function toCartProduct(live: LiveProduct, fallbackVendorId?: string): Product {
  return {
    id: live.id,
    categoryId: (live.categoryId as Product["categoryId"]) ?? "vendor-market",
    name: live.name ?? "",
    price: Number(live.price) || 0,
    image: live.image ?? live.imageUrl ?? "",
    description: live.description ?? "",
    inStock: true, // only available products reach here — checked, not assumed
    restaurant: live.restaurant ?? live.storeName,
    vendorId: live.vendorId ?? fallbackVendorId,
  };
}

/**
 * Decide what a reorder of `order` should put in the cart, given the store's
 * current products. Pure: no fetching, no navigation, no cart mutation.
 */
export function planReorder(
  order: { items: HistoricalOrderItem[]; vendorId?: string },
  currentProducts: LiveProduct[],
): ReorderPlan {
  const byId = new Map<string, LiveProduct>();
  for (const p of currentProducts || []) {
    if (p && typeof p.id === "string") byId.set(p.id, p);
  }

  const items: CartItem[] = [];
  const excluded: ExcludedLine[] = [];
  const priceChanges: PriceChange[] = [];

  for (const item of order.items || []) {
    const label = item.name || item.productId;
    const live = byId.get(item.productId);

    if (!live) {
      excluded.push({
        productId: item.productId,
        name: label,
        reason: "missing",
      });
      continue;
    }
    if (!isProductAvailable(live)) {
      excluded.push({
        productId: item.productId,
        name: label,
        reason: "out_of_stock",
      });
      continue;
    }
    if (carriesOptions(item)) {
      // Replaying stale variant/addon ids is exactly what the server cannot trust,
      // and no endpoint gives the client the current ones to check against.
      excluded.push({
        productId: item.productId,
        name: label,
        reason: "needs_options",
      });
      continue;
    }

    const currentPrice = Number(live.price) || 0;
    const previousPrice = Number(item.price) || 0;
    if (currentPrice !== previousPrice) {
      priceChanges.push({
        productId: item.productId,
        name: live.name ?? label,
        was: previousPrice,
        now: currentPrice,
      });
    }

    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    items.push({ product: toCartProduct(live, order.vendorId), quantity });
  }

  return { items, excluded, priceChanges };
}
