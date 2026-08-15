/**
 * Store availability (H-54).
 *
 * A vendor can be unavailable in three ways, and the server rejects an order for
 * two of them at /api/orders:
 *
 *     isVacation → "المتجر في وضع الإجازة حالياً، يرجى المحاولة لاحقاً"
 *     isBusy     → "المتجر مشغول حالياً — يرجى المحاولة بعد قليل"
 *     isOpen === false → (no server rule; the vendor has closed the shopfront)
 *
 * StoreProductsScreen already contained a banner for all three — but the store
 * object it renders comes from /api/stores/:id/products, which did not return any
 * of the three fields, so `store.isVacation` was permanently `undefined`, the
 * banner never rendered, and nothing stopped the add button. A customer filled a
 * cart and a whole checkout form and only met the closure as a 400 on submit.
 *
 * Precedence follows the banner and the server: vacation, then busy, then closed.
 * A store with none of the flags set is available — the fields are optional and a
 * missing one must never read as "closed".
 *
 * The server stays the final authority; this only stops the client leading someone
 * into a checkout that cannot succeed.
 */
export interface StoreAvailability {
  isOpen?: boolean;
  isVacation?: boolean;
  isBusy?: boolean;
}

export type ClosureReason = "vacation" | "busy" | "closed";

/** Which closure applies, or null when the store can take orders. */
export function getStoreClosure(
  store: StoreAvailability | null | undefined,
): ClosureReason | null {
  if (!store) return null;
  if (store.isVacation) return "vacation";
  if (store.isBusy) return "busy";
  if (store.isOpen === false) return "closed";
  return null;
}

export function isStoreClosed(
  store: StoreAvailability | null | undefined,
): boolean {
  return getStoreClosure(store) !== null;
}

/** Short banner text — the wording already shipped in StoreProductsScreen. */
export const CLOSURE_BANNER: Record<ClosureReason, string> = {
  vacation: "المتجر في وضع الإجازة — يعود قريباً",
  busy: "المتجر مشغول حالياً — لا يمكن استقبال طلبات جديدة",
  closed: "المتجر مغلق الآن — لا يمكن قبول طلبات",
};

/** Dialog title shown when someone tries to add or check out anyway. */
export const CLOSURE_TITLE: Record<ClosureReason, string> = {
  vacation: "المتجر في إجازة",
  busy: "المتجر مشغول",
  closed: "المتجر مغلق",
};

/**
 * Dialog body. The vacation and busy wordings match what the server would answer
 * on submit, so the customer is told the same thing at both ends.
 */
export const CLOSURE_MESSAGE: Record<ClosureReason, string> = {
  vacation: "المتجر في وضع الإجازة حالياً، يرجى المحاولة لاحقاً.",
  busy: "المتجر مشغول حالياً — يرجى المحاولة بعد قليل.",
  closed: "المتجر مغلق الآن ولا يمكنه قبول طلبات.",
};
