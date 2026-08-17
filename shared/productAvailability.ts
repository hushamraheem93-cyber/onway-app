/**
 * Can this product be bought right now — the one definition (H-64 / G-1).
 *
 * `vendorProducts` carried two fields for one fact and the order guard consulted
 * only one of them:
 *
 *   • `stock` — a NUMBER, written by every vendor create/update path. This is the
 *     field vendors actually maintain: all 31 live products have it.
 *   • `inStock` — a BOOLEAN, written only by the vendor availability toggle. Not a
 *     single live product has it set.
 *
 * `POST /api/orders` blocked a line only on `inStock === false`, so a product the
 * vendor had marked down to zero stayed on sale. Four live products are in exactly
 * that state today: `stock: 0` and orderable.
 *
 * The rule below keeps both fields meaningful without inventing a third: an
 * explicit `inStock === false` still blocks (that is what the toggle is for), and a
 * tracked stock of zero or less blocks too. A product with neither field set stays
 * available, which is the existing behaviour for the legacy catalogue.
 */

export interface StockFields {
  inStock?: unknown;
  stock?: unknown;
}

/** Is the quantity field a real tracked count? */
function trackedStock(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * True when the product may be added to an order.
 *
 * Deliberately conservative in one direction only: anything that is not a clear
 * "unavailable" signal leaves the product on sale, so this can never take a
 * working product off the shelf because of a missing or malformed field.
 */
export function isProductAvailable(
  product: StockFields | null | undefined,
): boolean {
  if (!product) return false;
  // The explicit toggle wins when it has been used.
  if (product.inStock === false) return false;
  const stock = trackedStock(product.stock);
  if (stock !== null && stock <= 0) return false;
  return true;
}

/** The negation, for the call sites that read more clearly that way. */
export function isProductOutOfStock(
  product: StockFields | null | undefined,
): boolean {
  return !isProductAvailable(product);
}
