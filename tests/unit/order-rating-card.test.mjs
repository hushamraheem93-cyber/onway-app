/**
 * Order rating card tests (audit finding H-27).
 *
 * TWO claims, and they do not both hold — this file pins both, so neither is taken on
 * trust again:
 *
 *  (A) The audit says "FlatList reuses instances, so a card shows the PREVIOUS order's
 *      stars and its rate button disappears forever". DISPROVEN for this codebase:
 *      OrdersScreen uses keyExtractor={(item) => item.id}. React reconciles list
 *      children by key, so a stable unique key means an OrderCard instance can never
 *      receive a different order — reordering moves the instance with its key and
 *      filtering unmounts the ones removed. The described symptom is not reproducible.
 *
 *  (B) The real defect: `ratedValue` was `useState(order.customerRating ?? null)` —
 *      state seeded from a prop, read once at mount and never re-synced. The card is
 *      React.memo'd and stays mounted across refreshes, so when the customer rated on
 *      another device and the poll brought `customerRating` back, the card still showed
 *      the rate button and a second submission went out, which the server rejects.
 *      Measured on the pre-fix source: customerRating=4 arriving left ratedValue=null.
 *
 * Severity is Medium-Low, not High: the opening state is always correct at mount, and
 * no card ever shows another order's rating.
 *
 * The fix derives local-first — `localRating ?? order.customerRating ?? null` — rather
 * than syncing the prop into state with an effect. An effect could WIPE an optimistic
 * rating when a poll response predating the write lands, putting the button back and
 * inviting a double rating. Derivation cannot regress.
 *
 * The card cannot be rendered here (react-native, reanimated, expo-image), so the
 * rating state machine runs on a minimal React hooks runtime wired from what the
 * source actually says.
 *
 * Run:  node --test tests/unit/order-rating-card.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CARD = readFileSync(join(here, "../../client/components/OrderCard.tsx"), "utf8");
const SCREEN = readFileSync(join(here, "../../client/screens/OrdersScreen.tsx"), "utf8");
// ── read the real wiring ─────────────────────────────────────────────────────
const wiring = {
  /** "seeded" = the reported defect; "derived" = the fix. */
  ratedKind: /const \[ratedValue, setRatedValue\] = useState<number \| null>\(\s*order\.customerRating/.test(CARD)
    ? "seeded"
    : "derived",
  memo: /export const OrderCard = React\.memo\(OrderCardComponent\);/.test(CARD),
  /** Which side of the ?? chain wins — read from the source, not assumed. */
  derivation: /const ratedValue = localRating \?\? order\.customerRating/.test(CARD)
    ? "local-first"
    : /const ratedValue = order\.customerRating \?\? localRating/.test(CARD)
      ? "server-first"
      : "n/a",
  keyExtractor: (SCREEN.match(/keyExtractor=\{([^}]+)\}/) ?? [, "?"])[1].trim(),
  canRate: (CARD.match(/const canRate =\s*\n?\s*([^;]+);/) ?? [, "?"])[1].replace(/\s+/g, " ").trim(),
};

// ── minimal React hooks runtime ──────────────────────────────────────────────
const sameDeps = (a, b) => !!a && !!b && a.length === b.length && a.every((x, n) => Object.is(x, b[n]));
function createRuntime(component) {
  const hooks = [];
  let cursor = 0, scheduled = false, mounted = false, props = null;
  let out = null;
  function render() {
    cursor = 0;
    const R = {
      useState(initial) {
        const i = cursor++;
        if (!(i in hooks)) hooks[i] = { v: typeof initial === "function" ? initial() : initial };
        const slot = hooks[i];
        return [slot.v, (next) => {
          const v = typeof next === "function" ? next(slot.v) : next;
          if (Object.is(v, slot.v)) return;
          slot.v = v;
          schedule();
        }];
      },
    };
    out = component(R, props);
  }
  function schedule() {
    if (!mounted || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (mounted) render(); });
  }
  return {
    mount(p) { mounted = true; props = p; render(); },
    /** A new props object for the SAME key — React keeps the hook state. */
    rerender(p) { props = p; render(); },
    get view() { return out; },
  };
}

// ── the card's rating state machine, wired from the source ───────────────────
function makeCard(env, over = {}) {
  const w = { ...wiring, ...over };
  return function OrderCardModel(R, order) {
    let ratedValue, setLocal;
    if (w.ratedKind === "seeded") {
      const [v, set] = R.useState(order.customerRating ?? null);
      ratedValue = v;
      setLocal = set;
    } else {
      const [local, set] = R.useState(null);
      ratedValue = w.derivation === "server-first"
        ? (order.customerRating ?? local ?? null)
        : (local ?? order.customerRating ?? null);
      setLocal = set;
    }
    const canRate = order.status === "delivered" && !!order.vendorId && !ratedValue;
    env.submit = async (stars) => {
      if (!canRate) { env.blocked += 1; return; }
      env.submissions.push({ orderId: order.id, stars });
      setLocal(stars);
    };
    return { orderId: order.id, ratedValue, canRate };
  };
}

const newEnv = () => ({ submissions: [], blocked: 0 });
const tick = () => new Promise((r) => setTimeout(r, 0));
const mkOrder = (id, extra = {}) => ({
  id, status: "delivered", vendorId: "v-1", customerRating: undefined, ...extra,
});


describe("H-27 (A) — the reported FlatList-reuse mechanism does not exist here", () => {
  test("OrdersScreen keys every row by its order id", () => {
    assert.match(wiring.keyExtractor, /^\(item\)\s*=>\s*item\.id$/,
      "a non-stable key would make instance reuse across orders possible");
  });

  test("independent cards never take on each other's rating", () => {
    // Each row is its own instance, keyed; reordering re-renders it with ITS order.
    const mk = (o) => { const env = newEnv(); const rt = createRuntime(makeCard(env)); rt.mount(o); return rt; };
    const a = mk(mkOrder("a", { customerRating: 5 }));
    const b = mk(mkOrder("b"));
    const c = mk(mkOrder("c", { customerRating: 2 }));
    a.rerender(mkOrder("a", { customerRating: 5 }));
    b.rerender(mkOrder("b"));
    c.rerender(mkOrder("c", { customerRating: 2 }));
    assert.equal(a.view.ratedValue, 5);
    assert.equal(b.view.ratedValue, null);
    assert.equal(c.view.ratedValue, 2);
    assert.deepEqual([a.view.orderId, b.view.orderId, c.view.orderId], ["a", "b", "c"]);
  });

  test("searching does not change what a surviving card shows", () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("kept", { customerRating: 3 }));
    rt.rerender(mkOrder("kept", { customerRating: 3 }));   // filtered list, same key
    assert.equal(rt.view.ratedValue, 3);
    assert.equal(rt.view.orderId, "kept");
  });
});

describe("H-27 (B) — the card reflects a rating that arrives from the server", () => {
  test("customerRating arriving on a mounted card hides the rate button", async () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-1"));
    assert.equal(rt.view.canRate, true);

    rt.rerender(mkOrder("o-1", { customerRating: 4 }));
    assert.equal(rt.view.ratedValue, 4, "the card ignored the server's rating");
    assert.equal(rt.view.canRate, false, "the rate button is still offered");
  });

  test("the pre-fix wiring provably fails the same scenario", async () => {
    // Guards the guard: if this passes, the model stopped reproducing the defect.
    const env = newEnv();
    const rt = createRuntime(makeCard(env, { ratedKind: "seeded" }));
    rt.mount(mkOrder("o-1"));
    rt.rerender(mkOrder("o-1", { customerRating: 4 }));
    assert.equal(rt.view.ratedValue, null, "seeded state should NOT pick the prop up");
    assert.equal(rt.view.canRate, true);
  });

  test("an already-rated order opens with its stars and no button", async () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-3", { customerRating: 3 }));
    assert.equal(rt.view.ratedValue, 3);
    assert.equal(rt.view.canRate, false);
    await env.submit(5);
    assert.deepEqual(env.submissions, [], "an already-rated order was submitted again");
  });

  test("an unrated delivered order offers the button", () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-new"));
    assert.equal(rt.view.ratedValue, null);
    assert.equal(rt.view.canRate, true);
  });
});

describe("H-27 — the optimistic rating never regresses", () => {
  test("a stale poll response without the field does not restore the button", async () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-2"));
    await env.submit(5);
    await tick();
    assert.equal(rt.view.ratedValue, 5);

    rt.rerender(mkOrder("o-2"));            // response that predates the write
    assert.equal(rt.view.ratedValue, 5, "the optimistic rating was wiped");
    assert.equal(rt.view.canRate, false, "the rate button came back — a double rating");
  });

  test("the local value wins over a different server value", async () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-7"));
    await env.submit(5); await tick();
    rt.rerender(mkOrder("o-7", { customerRating: 5 }));
    assert.equal(rt.view.ratedValue, 5);
  });

  test("when both values exist and disagree, the local one is shown", async () => {
    // The only case where the two derivation orders differ behaviourally, and the
    // reason `localRating ?? order.customerRating` is the right way round: what the
    // customer just tapped must never be overwritten by whatever the list happens to
    // be carrying.
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-8"));
    await env.submit(5); await tick();
    rt.rerender(mkOrder("o-8", { customerRating: 3 }));
    assert.equal(rt.view.ratedValue, 5,
      "the server value overrode the rating the customer just submitted");
  });

  test("an order can never be rated twice", async () => {
    const env = newEnv();
    const rt = createRuntime(makeCard(env));
    rt.mount(mkOrder("o-4"));
    await env.submit(5); await tick();
    await env.submit(2); await tick();
    rt.rerender(mkOrder("o-4", { customerRating: 5 }));
    await env.submit(1); await tick();
    assert.equal(env.submissions.length, 1, `${env.submissions.length} submissions were sent`);
    assert.equal(env.blocked, 2);
    assert.equal(rt.view.ratedValue, 5);
  });
});

describe("H-27 — the rest of the gating is unchanged", () => {
  test("only delivered orders with a vendor can be rated", () => {
    for (const o of [mkOrder("x", { status: "in_delivery" }), mkOrder("y", { vendorId: undefined })]) {
      const env = newEnv();
      const rt = createRuntime(makeCard(env));
      rt.mount(o);
      assert.equal(rt.view.canRate, false);
    }
  });

  test("the source still derives instead of seeding", () => {
    assert.equal(wiring.ratedKind, "derived",
      "REGRESSION: ratedValue is seeded from the prop again");
    assert.match(CARD, /const \[localRating, setLocalRating\] = useState<number \| null>\(null\);/);
    assert.match(CARD, /const ratedValue = localRating \?\? order\.customerRating \?\? null;/);
  });

  test("no effect copies the prop into state", () => {
    // That is the variant that could wipe an optimistic rating.
    assert.doesNotMatch(CARD, /useEffect\([^)]*setLocalRating/,
      "an effect syncing the prop can regress the optimistic value");
    assert.doesNotMatch(CARD, /setRatedValue/, "the old setter is back");
  });

  test("memo, the guards and the submit path are untouched", () => {
    assert.equal(wiring.memo, true, "React.memo was dropped");
    assert.match(CARD, /if \(!onRate \|\| ratedValue\) return;/);
    assert.match(CARD, /if \(!onRate \|\| submittingRating \|\| ratedValue\) return;/);
    assert.match(CARD, /setLocalRating\(vendorStar\);/);
    assert.match(wiring.canRate, /order\.status === "delivered" && order\.vendorId && !ratedValue && !!onRate/);
  });

  test("OrdersScreen was not touched", () => {
    assert.match(SCREEN, /keyExtractor=\{\(item\) => item\.id\}/);
    assert.match(SCREEN, /onRate=\{handleRate\}/);
  });
});
