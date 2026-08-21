/**
 * Compute vendorIds for an order — the exact rule the JS filter uses today.
 *
 * Extracted from backfill-order-vendor-ids.mjs so tests can import it without
 * triggering the migration's service-account check.
 */

/** productId → vendorId, read once. vendorProducts' document ID is the product ID. */
export function computeVendorIds(order, productOwners) {
  const out = new Set();
  if (typeof order?.vendorId === "string" && order.vendorId.trim()) {
    out.add(order.vendorId.trim());
  }
  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const pid = item?.productId;
    if (typeof pid === "string" && pid.trim()) {
      const vid = productOwners.get(pid.trim());
      if (typeof vid === "string" && vid.trim()) out.add(vid.trim());
    }
  }
  return [...out].sort();
}
