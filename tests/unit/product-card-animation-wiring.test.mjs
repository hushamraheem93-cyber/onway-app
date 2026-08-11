/**
 * ProductCard animation wiring, executed (audit finding H-41, closing proof).
 *
 * The split moved four Reanimated shared values, four animated styles and the
 * cardRef that measureInWindow() drives across a component boundary. Asserting
 * that they still APPEAR in the right file proves very little — what matters is
 * whether the ref is attached to the View that gets measured, whether the
 * fly-to-cart coordinates come out right (including the RTL mirror), and whether
 * adding to the cart still happens when the ref is not ready.
 *
 * This repository has no React Native renderer and none was added. Instead the
 * REAL ProductCardViewComponent is lifted from the shipped file, compiled with
 * JSX turned into createElement calls, and executed against stand-ins for React,
 * Reanimated, Haptics and expo-image. That runs the actual component body: its
 * hooks, its handlers, its ref wiring and the element tree it returns.
 *
 * What this CANNOT prove is stated plainly in the report: nothing here rasterises
 * a frame, so it cannot show that a spring animation looks right on a phone. It
 * proves the wiring those animations depend on.
 *
 * Run:  node --test tests/unit/product-card-animation-wiring.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";
import { getCartKey } from "../../client/context/cartKey.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const ts = createRequire(import.meta.url)("typescript");
const SRC = readFileSync(join(root, "client/components/ProductCard.tsx"), "utf8");
const CLEAN = stripComments(SRC);

/** The presentational component, lifted whole. */
const VIEW_SOURCE = (() => {
  const at = CLEAN.indexOf("function ProductCardViewComponent(");
  assert.ok(at > 0, "the presentational component disappeared");
  const open = CLEAN.indexOf("{", CLEAN.indexOf(")", CLEAN.indexOf("}:", at)));
  let depth = 0;
  for (let i = open; i < CLEAN.length; i += 1) {
    if (CLEAN[i] === "{") depth += 1;
    else if (CLEAN[i] === "}") {
      depth -= 1;
      if (depth === 0) return CLEAN.slice(at, i + 1);
    }
  }
  throw new Error("unbalanced presentational component");
})();

/**
 * Build a runnable copy of the component with every import stubbed.
 * `world` collects what the component did: springs fired, styles registered, the
 * element tree, and any measureInWindow request.
 */
function mount(props, { rtl = false, refAttached = true, measurement } = {}) {
  const world = {
    springs: [], sequences: [], timings: [], haptics: [],
    sharedValues: [], animatedStyles: 0, refs: [],
    measured: null,
  };

  const makeShared = (initial) => {
    const sv = { value: initial };
    world.sharedValues.push(sv);
    return sv;
  };

  const createElement = (type, props = {}, ...children) => ({
    type, props: props ?? {}, children: children.flat(),
  });

  const scope = {
    React: {
      createElement,
      useRef: (init) => {
        // The card's ref: hand back an object whose measureInWindow records the call.
        const ref = { current: null };
        if (init === null && world.refs.length === 0 && refAttached) {
          ref.current = {
            measureInWindow: (cb) => {
              world.measured = true;
              const m = measurement ?? { x: 100, y: 200, width: 160, height: 240 };
              cb(m.x, m.y, m.width, m.height);
            },
          };
        }
        world.refs.push(ref);
        return ref;
      },
      memo: (c) => c,
    },
    useRef: undefined, // set below to the same function
    useSharedValue: makeShared,
    useAnimatedStyle: (fn) => { world.animatedStyles += 1; return { __style: fn }; },
    withSpring: (to, cfg) => { world.springs.push({ to, cfg }); return to; },
    withSequence: (...steps) => { world.sequences.push(steps); return steps[steps.length - 1]; },
    withTiming: (to, cfg) => { world.timings.push({ to, cfg }); return to; },
    Animated: { createAnimatedComponent: (c) => ({ __animated: c }) },
    Pressable: "Pressable",
    View: "View",
    StyleSheet: { create: (o) => o },
    Dimensions: { get: () => ({ width: 400 }) },
    I18nManager: { isRTL: rtl },
    Image: "Image",
    Feather: "Feather",
    FontAwesome: "FontAwesome",
    Haptics: {
      notificationAsync: (t) => world.haptics.push(["notification", t]),
      impactAsync: (t) => world.haptics.push(["impact", t]),
      NotificationFeedbackType: { Success: "success" },
      ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
    },
    ThemedText: "ThemedText",
    useTheme: () => ({ theme: { backgroundDefault: "#fff" } }),
    Spacing: { md: 8, sm: 4 },
    AppColors: { primary: "#p", error: "#e", white: "#w", gray400: "#g", black: "#b" },
    Anim: { duration: { instant: 80 } },
    FontWeight: { bold: "700" },
    formatPrice: (n) => `${n}`,
    resolveImageUrl: (u) => `resolved:${u}`,
    // Module-level constants the component closes over.
    AnimatedPressable: "AnimatedPressable",
    SCREEN_WIDTH: 400,
    styles: new Proxy({}, { get: (_t, k) => ({ __style: String(k) }) }),
    setTimeout: (fn) => { fn(); return 0; }, // run the spring-release immediately
  };
  scope.useRef = scope.React.useRef;

  const js = ts.transpileModule(
    `${VIEW_SOURCE}\nexports.run = (p) => ProductCardViewComponent(p);`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
      },
    },
  ).outputText;

  const exports = {};
  // C-18: getCartKey is supplied centrally so every lift gets it.
  const full = { getCartKey, ...scope };
  const names = Object.keys(full);
  // eslint-disable-next-line no-new-func
  new Function("exports", ...names, js)(exports, ...names.map((n) => full[n]));
  const tree = exports.run(props);
  return { world, tree };
}

/** Walk the element tree looking for a node satisfying `pred`. */
function find(node, pred) {
  if (!node || typeof node !== "object") return null;
  if (pred(node)) return node;
  for (const c of node.children ?? []) {
    const hit = find(c, pred);
    if (hit) return hit;
  }
  return null;
}
function collect(node, pred, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (pred(node)) acc.push(node);
  for (const c of node.children ?? []) collect(c, pred, acc);
  return acc;
}

const PRODUCT = { id: "p-1", name: "منتج", image: "img", price: 5000, discount: 0 };
const baseProps = (over = {}) => ({
  product: PRODUCT,
  onPress: () => {},
  width: 160,
  isInCart: false,
  cartQuantity: 0,
  isFav: false,
  onAdd: () => {},
  onRemove: () => {},
  onToggleFavorite: () => {},
  onFlyToCart: () => {},
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-41 · the component actually runs, with its animation layer intact", () => {
  test("it renders and registers exactly four shared values and four animated styles", () => {
    const { world, tree } = mount(baseProps());
    assert.ok(tree, "the component returned nothing");
    assert.equal(world.sharedValues.length, 4,
      `${world.sharedValues.length} shared values — the Reanimated layer changed`);
    assert.equal(world.animatedStyles, 4,
      `${world.animatedStyles} animated styles — one was lost or added`);
    assert.ok(world.sharedValues.every((s) => s.value === 1),
      "a shared value no longer starts at 1, which changes the resting transform");
  });

  test("the ref is attached to the measured image container", () => {
    const { tree } = mount(baseProps());
    const withRef = collect(tree, (n) => n.props && "ref" in n.props);
    assert.equal(withRef.length, 1, "more or fewer than one node carries a ref");
    assert.ok(withRef[0].props.style, "the ref node lost its style — is it still the image container?");
    // The image lives inside it; that is what makes it the right node to measure.
    assert.ok(find(withRef[0], (n) => n.type === "Image"),
      "the ref is no longer on the container that holds the product image");
  });
});

describe("H-41 · pressing + drives the animation, the measurement and the cart", () => {
  function pressAdd(opts = {}, props = {}) {
    const flights = [];
    const adds = [];
    const { world, tree } = mount(
      baseProps({ onFlyToCart: (x, y) => flights.push([x, y]), onAdd: () => adds.push(1), ...props }),
      opts,
    );
    // The add button is the INNERMOST pressable holding the "plus" icon — the root
    // card also has an onPress and also contains that icon, so take the deepest.
    const btn = collect(tree, (n) => n.props?.onPress && find(n, (c) => c.props?.name === "plus")).at(-1);
    assert.ok(btn, "the add button disappeared");
    btn.props.onPress();
    return { world, flights, adds };
  }

  test("the button springs down and back", () => {
    const { world } = pressAdd();
    assert.ok(world.springs.length >= 2,
      "the press no longer produces the shrink-and-release spring pair");
    assert.equal(world.springs[0].to, 0.9, "the shrink target changed");
    assert.equal(world.springs[1].to, 1, "the button does not return to its resting scale");
  });

  test("it fires success haptics", () => {
    const { world } = pressAdd();
    assert.deepEqual(world.haptics[0], ["notification", "success"],
      "the add no longer gives success feedback");
  });

  test("the card is measured and the fly-to-cart gets the centre point", () => {
    const { world, flights } = pressAdd({}, {});
    assert.equal(world.measured, true, "measureInWindow was never called");
    assert.equal(flights.length, 1, "the fly-to-cart animation was not triggered");
    // x=100 width=160 → centre 180 ; y=200 height=240 → centre 320
    assert.deepEqual(flights[0], [180, 320],
      "the fly-to-cart origin is no longer the centre of the measured card");
  });

  test("RTL mirrors the origin across the screen", () => {
    const { flights } = pressAdd({ rtl: true });
    // SCREEN_WIDTH 400 − x 100 − width/2 80 = 220
    assert.deepEqual(flights[0], [220, 320],
      "the RTL mirror formula changed — the animation would start on the wrong side");
  });

  test("the item is still added when the ref is NOT attached", () => {
    // The whole point of keeping onAdd outside the measure callback.
    const { world, flights, adds } = pressAdd({ refAttached: false });
    assert.equal(world.measured, null, "the ref was somehow measured");
    assert.deepEqual(flights, [], "a flight animation fired without a measurement");
    assert.equal(adds.length, 1,
      "the product was NOT added to the cart because the ref was not ready — " +
      "onAdd has moved inside the measurement callback");
  });

  test("the item is added exactly once when the ref IS attached", () => {
    const { adds } = pressAdd();
    assert.equal(adds.length, 1, "the add fired zero times or twice");
  });
});

describe("H-41 · minus and favourite behave", () => {
  test("minus springs, gives light haptics and calls onRemove once", () => {
    const removes = [];
    const { world, tree } = mount(baseProps({
      isInCart: true, cartQuantity: 3, onRemove: () => removes.push(1),
    }));
    const btn = collect(tree, (n) => n.props?.onPress && find(n, (c) => c.props?.name === "minus")).at(-1);
    assert.ok(btn, "the minus button is missing while the product is in the cart");
    btn.props.onPress();
    assert.equal(removes.length, 1, "onRemove did not fire exactly once");
    assert.ok(world.springs.some((s) => s.to === 0.9), "the minus button lost its press spring");
    assert.deepEqual(world.haptics[0], ["impact", "light"], "the minus haptic changed");
  });

  test("the quantity shown is the prop, not a local count", () => {
    const { tree } = mount(baseProps({ isInCart: true, cartQuantity: 7 }));
    const qty = find(tree, (n) => n.children?.some?.((c) => c === 7 || c === "7"));
    assert.ok(qty, "the displayed quantity no longer comes from cartQuantity");
  });

  test("favourite runs the three-step bounce and calls the handler", () => {
    const toggles = [];
    const { world, tree } = mount(baseProps({ onToggleFavorite: () => toggles.push(1) }));
    const heart = collect(tree, (n) => n.props?.onPress && find(n, (c) => c.props?.name === "heart-o")).at(-1);
    assert.ok(heart, "the favourite button disappeared");
    heart.props.onPress();
    assert.equal(toggles.length, 1, "onToggleFavorite did not fire");
    assert.equal(world.sequences.length, 1, "the bounce sequence is gone");
    assert.equal(world.sequences[0].length, 3, "the bounce is no longer shrink → expand → settle");
    assert.deepEqual(world.haptics[0], ["impact", "light"], "the favourite haptic changed");
  });

  test("a favourited card renders the filled heart", () => {
    const { tree } = mount(baseProps({ isFav: true }));
    assert.ok(find(tree, (n) => n.props?.name === "heart"),
      "isFav no longer switches the icon to the filled heart");
  });
});

describe("H-41 · the card press keeps its own spring", () => {
  test("pressIn shrinks the card and pressOut restores it", () => {
    const { world, tree } = mount(baseProps());
    assert.ok(tree.props.onPressIn && tree.props.onPressOut, "the card lost its press handlers");
    tree.props.onPressIn();
    assert.equal(world.springs.at(-1).to, 0.98, "the card press scale changed");
    tree.props.onPressOut();
    assert.equal(world.springs.at(-1).to, 1, "the card does not spring back");
  });

  test("the onPress prop is forwarded untouched", () => {
    const marker = () => {};
    const { tree } = mount(baseProps({ onPress: marker }));
    assert.equal(tree.props.onPress, marker,
      "onPress is wrapped, which would break the memo for consumers that pass one");
  });

  test("the width prop still reaches the card style", () => {
    const { tree } = mount(baseProps({ width: 173 }));
    const flat = JSON.stringify(tree.props.style);
    assert.match(flat, /173/, "the responsive grid width no longer reaches the card");
  });
});

describe("H-41 · both real consumers render through this component", () => {
  for (const [file, marker] of [
    ["client/screens/ProductsScreen.tsx", /<ProductCard product=\{item\} width=\{GRID_CARD_WIDTH\} \/>/],
    ["client/screens/FavoritesScreen.tsx", /<ProductCard product=\{item\} \/>/],
  ]) {
    test(`${file.split("/").pop()} still mounts it with stable props`, () => {
      const src = stripComments(readFileSync(join(root, file), "utf8"));
      assert.match(src, marker, `${file} changed how it mounts ProductCard`);
      assert.doesNotMatch(src, /<ProductCard[^>]*onPress=\{\(\)/,
        "an inline onPress arrow was added, which changes the memo's props every render");
    });
  }
});
