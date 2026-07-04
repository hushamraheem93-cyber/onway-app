---
name: Order price integrity (server-side recompute)
description: How POST /api/orders verifies prices/fees server-side instead of trusting client input; what's exempt and why.
---

`POST /api/orders` never trusts client-supplied `items[].price`, `total`, or `deliveryFee` for catalog orders. It recomputes from source of truth:
- Item prices: looked up by `productId` in `getCachedProducts()` (the real `products` collection). Unknown productId → reject.
- Delivery fee: 1000 fixed IQD if every item's product has `categoryId === "restaurants"`; otherwise matched by `region` name against `getDeliveryAreas(true)`.
- Service fee: read from `appSettings/fees` Firestore doc (default 500).
- Promo discount: recalculated from the real `FirestorePromoCode` (percentage/fixed), never from client-sent `promoDiscount`.
- Final total = recomputed values; if the client's submitted `total` deviates by more than 1 IQD from the server-computed total, the order is rejected (with a `[SUSPICIOUS ORDER]` console.warn for monitoring) rather than silently corrected.

**Why:** client payloads are fully attacker-controlled; trusting them allowed arbitrary price/commission/earnings tampering.

**How to apply:** Order types `courier-pickup` and `international-shopping` are intentionally exempt — they use synthetic non-catalog productIds (e.g. `courier-pickup`, `international-<site>`) with user/admin-negotiated custom pricing, not real product prices. Any new order flow that references real catalog products must go through this same verification path.
