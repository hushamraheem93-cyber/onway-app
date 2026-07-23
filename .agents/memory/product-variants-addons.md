---
name: Product Variants & Addons
description: How variants (size/price adjustment) and addons (optional extras) are stored, sent to server, and verified at order time.
---

## Data model

`ProductVariant` and `ProductAddon` are defined in `client/constants/categories.ts` and attached to the `Product` interface.

```typescript
interface ProductVariant { id: string; name: string; priceAdjustment: number; }
interface ProductAddon   { id: string; name: string; price: number; }
interface Product { ...; variants?: ProductVariant[]; addons?: ProductAddon[]; }
```

Saved in Firestore `vendorProducts` document as `variants` and `addons` arrays (JSON-parsed from FormData in `server/vendor.ts` POST /api/vendor/products).

## Cart

CartItem has `selectedVariant?: ProductVariant` and `selectedAddons?: ProductAddon[]`.

Cart key = `productId + '__' + (variantId || 'base')`. The `getCartKey()` helper is exported from CartContext.

`removeFromCart` and `updateQuantity` accept either a cartKey (contains `__`) or a plain productId for backward compatibility.

## Order item fields

Order items include `selectedVariantId`, `variantName`, `variantPriceAdjustment`, and `selectedAddons` (id/name/price). The `price` field in the order item = base + variant adj + addons.

## Server-side price verification

In `server/routes.ts` POST /api/orders: for vendorProducts lookup, the server re-fetches variants and addons from Firestore and recomputes the expected price. A price mismatch rejects the order.

**Why:** Prevents price manipulation — client can't fake a cheaper variant or missing addon.
