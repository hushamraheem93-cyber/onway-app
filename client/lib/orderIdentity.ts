/**
 * H-82 — keep an unchanged order the SAME object across polls.
 *
 * OrderContext refreshes every 10 seconds and did `setOrders(data)` with the raw
 * fetch payload. `response.json()` builds fresh objects every time, so every order
 * in the list got a new identity twice a minute even when not one field had moved.
 *
 * That alone defeats `React.memo(OrderCard)`: its default comparison is `Object.is`
 * per prop, and `order` is a prop. However stable the callbacks are made, a card
 * whose `order` is a new object re-renders — and OrderCard is a 644-line component
 * with a modal, a reanimated style and seven state hooks, times every row on
 * screen, every ten seconds, for the whole time the screen is open.
 *
 * Reconciling here means the memo boundary can actually do its job: an order that
 * did not change keeps its object, so the card skips the render entirely; an order
 * that DID change gets the new object and re-renders, which is the point.
 *
 * This is identity only. The values handed to the app are always the server's —
 * a previous object is reused solely when it is deeply equal to the incoming one,
 * so no consumer can observe a difference between this and the raw payload.
 */

/**
 * Deep value equality for JSON payloads.
 *
 * Orders come straight from `response.json()`, so the only things reachable are
 * objects, arrays, strings, numbers, booleans and null — no dates, maps, cycles or
 * class instances. Confining this to that shape is what keeps it exact.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;

  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;

  if (aArr) {
    const x = a as unknown[];
    const y = b as unknown[];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (!jsonEqual(x[i], y[i])) return false;
    }
    return true;
  }

  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const xKeys = Object.keys(x);
  const yKeys = Object.keys(y);
  if (xKeys.length !== yKeys.length) return false;
  for (const k of xKeys) {
    // `undefined` under a present key and an absent key are different lengths
    // above, so this is a genuine key check, not just a value check.
    if (!Object.prototype.hasOwnProperty.call(y, k)) return false;
    if (!jsonEqual(x[k], y[k])) return false;
  }
  return true;
}

/**
 * Merge a freshly fetched list over the previous one, reusing every element that
 * did not change.
 *
 * Returns `prev` itself when the whole list is unchanged — so a quiet poll does
 * not even change the array identity, and nothing downstream of `orders` re-runs.
 *
 * Order, length and content always follow `next`: this never keeps an order the
 * server dropped, never reorders, and never merges fields between the two sides.
 */
export function reconcileOrders<T extends { id: string }>(
  prev: readonly T[],
  next: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const o of prev) byId.set(o.id, o);

  let identical = prev.length === next.length;
  const merged = next.map((incoming, i) => {
    const previous = byId.get(incoming.id);
    if (previous !== undefined && jsonEqual(previous, incoming)) {
      if (prev[i] !== previous) identical = false;
      return previous;
    }
    identical = false;
    return incoming;
  });

  return identical ? (prev as T[]) : merged;
}
