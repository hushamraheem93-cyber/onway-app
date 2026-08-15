/**
 * Guest access rules (H-55).
 *
 * Browsing is open to guests on purpose — home, stores, products and the CART all
 * work without an account, and that must not change. Ordering is not: the server
 * puts requireCustomerAuth on POST /api/orders, on the address endpoints and on
 * the order list, so a guest has no customer JWT and every one of those calls is
 * a 401.
 *
 * The client only enforced that in ONE place: CartScreen's checkout button. The
 * Checkout screen itself is registered in the navigator unconditionally and had
 * no guard at all, so the protection was a property of a single call site rather
 * than of the screen. And the recovery path made it worse — choosing "إنشاء حساب"
 * calls exitGuestMode(), which flips RootStackNavigator's
 * `needsAuth && !isLoggedIn && !isGuest` from false to true, swapping the whole
 * customer stack for the auth stack. Every screen under it unmounts, so anything
 * typed into Checkout is gone.
 *
 * The rule below is deliberately narrow: it says which screens need an account,
 * and nothing about the cart. The cart lives in AsyncStorage and survives the
 * remount untouched.
 */

/** The auth facts this decision depends on — a subset of AuthContext. */
export interface GuestAccessState {
  isGuest: boolean;
  isLoggedIn?: boolean;
}

/**
 * May this user start a checkout?
 *
 * A guest may not: POST /api/orders would 401, so letting them fill the form only
 * wastes their typing. Anyone who is not in guest mode may — this must never
 * become a second, stricter login check, or it would lock out signed-in customers
 * whose token is briefly still loading.
 */
export function canStartCheckout(auth: GuestAccessState): boolean {
  return !auth.isGuest;
}

/** Screens that require a real account, for the notice shown in their place. */
export const GUEST_BLOCKED_TITLE = "إنشاء حساب مطلوب";

export const GUEST_CHECKOUT_MESSAGE =
  "لإتمام الطلب تحتاج إلى حساب. سلتك محفوظة — أنشئ حسابك ثم أكمل الطلب.";

/** Shown if a submit is somehow reached in guest mode; mirrors the server's 401. */
export const GUEST_SUBMIT_MESSAGE =
  "لإتمام الطلب، الرجاء إنشاء حساب داخل التطبيق. سلتك محفوظة.";
