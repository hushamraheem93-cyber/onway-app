/**
 * Cart line identity — deliberately kept in its own dependency-free module.
 *
 * CartContext.tsx pulls in react-native, which cannot be loaded by the Node test
 * runner, so this pure function lives here and is re-exported from CartContext.
 * Every existing `import { getCartKey } from "@/context/CartContext"` keeps working.
 */

/** Structural shape of anything that can be keyed — a CartItem satisfies it. */
export interface CartKeyInput {
  product: { id: string };
  selectedVariant?: { id: string };
  selectedAddons?: { id: string }[];
}

/**
 * Unique key per cart entry — same product with a different variant OR a different
 * set of add-ons is a different entry.
 *
 * The add-on part is a SORTED list of add-on ids, so the key depends only on WHICH
 * add-ons are selected and never on the order they were tapped in. Stability
 * matters: this value is used as a React list key and as the identity for quantity
 * edits. Add-ons were previously excluded, so "pizza + extra cheese" and
 * "pizza + olives" collapsed into one line and the customer was billed for whichever
 * was added first.
 */
export const getCartKey = (item: CartKeyInput): string => {
  const addons = (item.selectedAddons ?? [])
    .map((a) => a.id)
    .sort()
    .join(",");
  return (
    item.product.id +
    "__" +
    (item.selectedVariant?.id || "base") +
    (addons ? "__" + addons : "")
  );
};
