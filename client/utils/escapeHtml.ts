/**
 * HTML escaping for values interpolated into printed documents (audit finding H-16).
 *
 * buildReceiptHTML in VendorOrdersScreen assembled the thermal receipt by string
 * interpolation with no escaping at all. Almost every value on that receipt is
 * attacker-controlled: the customer types their own name, phone, address and notes
 * at checkout, and the order's `items` array is stored as the client sent it, so
 * product names and quantities are too.
 *
 * The immediate consequence is not script execution — expo-print renders through a
 * print formatter that does not run JavaScript — but forgery. A customer whose
 * address is
 *
 *   </span></div><div class="total-row grand-total"><span>الإجمالي</span><span>0 د.ع</span></div>
 *
 * gets a printed receipt that shows the store a total it was never paid. Injected
 * markup can equally hide items, insert a fake "PAID" line, or pull a remote image
 * that beacons when the receipt is opened.
 *
 * Escaping the five characters below is sufficient and is what makes a value inert
 * in BOTH text position and quoted-attribute position:
 *   &  first, or it would double-escape the entities produced by the others
 *   <  >  cannot open or close a tag
 *   "  '  cannot terminate an attribute value
 */

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Make a value safe to interpolate into HTML text or a quoted attribute.
 * `null`/`undefined` become an empty string rather than the words "null"/"undefined".
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] as string);
}
