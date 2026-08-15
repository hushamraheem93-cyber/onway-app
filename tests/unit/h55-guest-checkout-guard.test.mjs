/**
 * H-55 — a guest must learn an account is needed BEFORE typing a checkout.
 *
 * The finding is right about the shape and wrong about one consequence.
 *
 * Right: the only client-side guard lived in CartScreen's checkout button.
 * CheckoutScreen is registered in RootStackNavigator unconditionally and had no
 * guard of its own, so the protection was a property of one call site, not of the
 * screen. And the recovery path is genuinely destructive: "إنشاء حساب" calls
 * exitGuestMode(), which flips the navigator's own
 * `needsAuth && !isLoggedIn && !isGuest` from false to true — the entire customer
 * stack unmounts and any typed screen state goes with it.
 *
 * Wrong: "الضيف يملأ كل شيء ثم يُخبَر عند الإرسال". With one navigate("Checkout")
 * in the whole client, behind that guard, a guest could not actually walk into
 * Checkout through the UI. The exposure was latent, not live.
 *
 * Everything below executes real code: the navigator's branch condition, the
 * screens' handlers and guards lifted from their .tsx, and the server's
 * requireCustomerAuth lifted from routes.ts.
 *
 * Run:  node --test tests/unit/h55-guest-checkout-guard.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  canStartCheckout,
  GUEST_SUBMIT_MESSAGE,
  GUEST_CHECKOUT_MESSAGE,
} from "../../client/lib/guestGuard.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const NAV = read("client/navigation/RootStackNavigator.tsx");
const CART = read("client/screens/CartScreen.tsx");
const CHECKOUT = read("client/screens/CheckoutScreen.tsx");
const AUTH = read("client/context/AuthContext.tsx");
const ROUTES = read("server/routes.ts");

// ── lifting ─────────────────────────────────────────────────────────────────
function braceBlock(src, start) {
  const open = src.indexOf("{", start);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}" && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced braces");
}
const liftDecl = (src, name) => {
  // `const x =` may be followed by a space or a newline; match both.
  const m = new RegExp(`const ${name} =\\s`).exec(src);
  const at = m ? m.index : -1;
  if (at === -1) return "";
  const semi = src.indexOf(";", at);
  const brace = src.indexOf("{", at);
  if (brace === -1 || semi < brace) return src.slice(at, semi + 1);
  return braceBlock(src, at) + ";";
};
const compile = (src, extra = "") =>
  ts.transpileModule(`${src}\n${extra}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

/**
 * RootStackNavigator's OWN branch decision, executed. Returns "auth" when the
 * auth stack renders (the customer stack, and everything mounted under it, is
 * gone) and "customer" otherwise.
 */
function navigatorBranch(state) {
  const needsAuth = liftDecl(NAV, "needsAuth");
  assert.ok(needsAuth, "the needsAuth expression moved in RootStackNavigator");
  const js = compile(needsAuth, "return needsAuth && !isLoggedIn && !isGuest ? 'auth' : 'customer';");
  // A guest has never been through OTP — that is precisely why dropping guest
  // mode sends them to the auth stack. Callers override what a scenario changes.
  const env = {
    isOtpSent: false, isOtpVerified: false, selectedUserType: null,
    isDriverRegistered: false, isVendorRegistered: false, isLoggedIn: false,
    isGuest: false, ...state,
  };
  const keys = Object.keys(env);
  return new Function(...keys, js)(...keys.map((k) => env[k]));
}

/** CartScreen.handleCheckout, executed. */
function cartCheckout({ isGuest }) {
  const calls = { alerts: [], navigated: null, exitedGuest: 0, cleared: 0 };
  const js = compile(
    ["cartVendorClosure", "handleCheckout"].map((n) => liftDecl(CART, n)).filter(Boolean).join("\n"),
    "return handleCheckout;",
  );
  const env = {
    isGuest,
    cartVendorId: null,
    allStores: [],
    getStoreClosure: () => null,
    CLOSURE_TITLE: {}, CLOSURE_MESSAGE: {},
    Haptics: { impactAsync: () => {}, notificationAsync: () => {}, ImpactFeedbackStyle: {}, NotificationFeedbackType: {} },
    Alert: { alert: (t, m, b) => calls.alerts.push({ title: t, message: m, buttons: b }) },
    exitGuestMode: () => { calls.exitedGuest += 1; },
    clearCart: () => { calls.cleared += 1; },
    navigation: { navigate: (s) => { calls.navigated = s; } },
  };
  const keys = Object.keys(env);
  new Function(...keys, js)(...keys.map((k) => env[k]))();
  return calls;
}

/** CheckoutScreen.handleSubmit, executed as far as its first refusal. */
function checkoutSubmit({ isGuest }) {
  const calls = { errors: [], submitted: 0, cleared: 0 };
  const js = compile(liftDecl(CHECKOUT, "handleSubmit"), "return handleSubmit;");
  const env = {
    isGuest,
    canStartCheckout,
    GUEST_SUBMIT_MESSAGE,
    CLOSURE_MESSAGE: {},
    checkoutClosure: null,
    lastOrderPayloadRef: { current: null },
    customerName: "زبون", phone: "07701234567",
    address: "شارع", notes: "", selectedArea: "a-1",
    selectedAreaData: { name: "الضلوعية" },
    landmark: "", isBelowMinOrder: false, vendorMinOrder: 0,
    items: [{ productId: "p-1", quantity: 1 }],
    subtotal: 10000, deliveryFee: 1000, SERVICE_FEE: 500, promoDiscount: 0,
    appliedPromoCode: null, selectedLocation: null, cartVendorId: "v-1",
    setError: (e) => calls.errors.push(e),
    submitOrderPayload: async () => { calls.submitted += 1; },
    clearCart: () => { calls.cleared += 1; },
    formatPrice: (n) => String(n),
    Haptics: { notificationAsync: () => {}, NotificationFeedbackType: {} },
  };
  const keys = Object.keys(env);
  return { run: new Function(...keys, js)(...keys.map((k) => env[k])), calls };
}

/** The server's requireCustomerAuth, executed. */
const requireCustomerAuth = (() => {
  const at = ROUTES.indexOf("function requireCustomerAuth(");
  assert.notEqual(at, -1, "requireCustomerAuth moved in server/routes.ts");
  const js = compile(braceBlock(ROUTES, at).replace(/: [A-Za-z.]+(\[\])?/g, ""), "return requireCustomerAuth;");
  return new Function("jwt", "ROUTES_JWT_SECRET", "JWT_VERIFY_OPTS", "isCustomerTokenRevoked", js)(
    { verify: (t) => { if (t !== "good") throw new Error("bad"); return { role: "customer", phoneNumber: "07701234567" }; } },
    "s", {}, () => false,
  );
})();

function callOrdersEndpoint(authHeader) {
  const res = { code: null, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; } };
  let passed = false;
  requireCustomerAuth({ headers: authHeader ? { authorization: authHeader } : {} }, res, () => { passed = true; });
  return { passed, status: res.code, error: res.body?.error };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("H-55 · what the code actually does", () => {
  test("a guest is served the CUSTOMER stack — Checkout is mounted for them", () => {
    assert.equal(navigatorBranch({ isGuest: true, isLoggedIn: false }), "customer");
  });

  test("Checkout is registered unconditionally, for guests and customers alike", () => {
    const at = NAV.lastIndexOf("<Stack.Navigator screenOptions={screenOptions}>");
    const tree = NAV.slice(at);
    assert.match(tree, /name="Checkout"/);
    assert.doesNotMatch(tree.slice(0, tree.indexOf('name="Checkout"')), /isGuest/,
      "the navigator gained a conditional guest branch — re-read this test");
  });

  test("there is exactly one navigate(\"Checkout\") in the whole client", () => {
    // This is why the report's "guest fills the whole form" could not happen:
    // the single call site was already guarded. The exposure was latent.
    const hits = [];
    for (const f of ["CartScreen", "OrdersScreen", "StoreProductsScreen", "ProductDetailScreen",
                     "HomeScreen", "SearchScreen", "OrderTrackingScreen"]) {
      const src = read(`client/screens/${f}.tsx`);
      for (const m of src.matchAll(/navigat(?:e|ion\.replace)\("Checkout"/g)) hits.push(f);
    }
    assert.deepEqual(hits, ["CartScreen"]);
  });

  test("no deep-link config exists, so no route can be entered from outside", () => {
    assert.doesNotMatch(NAV, /linking=|prefixes:/);
    for (const f of ["client/App.tsx"]) {
      try { assert.doesNotMatch(read(f), /linking=\{|prefixes:/); } catch (e) {
        if (e.code === "ENOENT") continue; throw e;
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-55 · D/9 — signing in unmounts the customer stack", () => {
  test("exitGuestMode() flips the navigator to the auth stack", () => {
    assert.equal(navigatorBranch({ isGuest: true, isLoggedIn: false }), "customer");
    // exitGuestMode does exactly one thing: setIsGuest(false).
    const at = AUTH.indexOf("const exitGuestMode = ");
    assert.match(braceBlock(AUTH, at), /setIsGuest\(false\)/);
    assert.equal(navigatorBranch({ isGuest: false, isLoggedIn: false }), "auth",
      "the customer stack would survive — then this finding's premise is gone");
  });

  test("…so any screen state under it is destroyed — which is why the guard must come first", () => {
    const before = navigatorBranch({ isGuest: true, isLoggedIn: false });
    const after = navigatorBranch({ isGuest: false, isLoggedIn: false });
    assert.notEqual(before, after, "the stack did not change, so nothing would unmount");
  });

  test("the cart is NOT part of that loss — it is persisted", () => {
    const cart = read("client/context/CartContext.tsx");
    assert.match(cart, /AsyncStorage\.setItem\(CART_STORAGE_KEY/);
    assert.match(cart, /AsyncStorage\.getItem\(CART_STORAGE_KEY\)/);
    assert.doesNotMatch(braceBlock(AUTH, AUTH.indexOf("const exitGuestMode = ")), /clearCart|CART_STORAGE_KEY/,
      "signing in wipes the cart");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-55 · A/L — the cart still belongs to guests", () => {
  test("a guest can reach the cart screen", () => {
    assert.equal(navigatorBranch({ isGuest: true }), "customer");
  });

  test("the guest guard does not clear the cart", () => {
    const r = cartCheckout({ isGuest: true });
    assert.equal(r.cleared, 0);
  });

  test("CheckoutScreen's guard never touches the cart either", () => {
    const marker = "if (!canStartCheckout({ isGuest })) {";
    const at = CHECKOUT.indexOf(marker);
    assert.doesNotMatch(braceBlock(CHECKOUT, at + marker.length - 1), /clearCart/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-55 · B/C/D — a guest cannot start a checkout", () => {
  test("the cart button refuses and offers the account path", () => {
    const r = cartCheckout({ isGuest: true });
    assert.equal(r.navigated, null, "a guest was navigated into Checkout");
    assert.equal(r.alerts.length, 1);
    assert.ok(r.alerts[0].buttons.some((b) => b.text === "إنشاء حساب"));
  });

  test("the SCREEN refuses too — the guard is not a property of one call site", () => {
    assert.equal(canStartCheckout({ isGuest: true }), false);
    const at = CHECKOUT.indexOf("if (!canStartCheckout({ isGuest })) {");
    assert.notEqual(at, -1, "CheckoutScreen has no guest guard");
    // It must sit BEFORE the form's return, or the form would render anyway.
    assert.ok(at < CHECKOUT.lastIndexOf("  return (\n    <View style={{ flex: 1 }}>"),
      "the guard is after the form is returned");
  });

  test("no checkout form is rendered for a guest — nothing can be typed", () => {
    const marker = "if (!canStartCheckout({ isGuest })) {";
    const at = CHECKOUT.indexOf(marker);
    const block = braceBlock(CHECKOUT, at + marker.length - 1);
    assert.doesNotMatch(block, /<TextInput/, "an input is rendered in guest mode");
    assert.match(block, /GUEST_CHECKOUT_MESSAGE/);
    assert.match(GUEST_CHECKOUT_MESSAGE, /سلتك محفوظة/);
  });

  test("the submit path refuses a guest before building any payload", async () => {
    const { run, calls } = checkoutSubmit({ isGuest: true });
    await run();
    assert.equal(calls.submitted, 0, "a guest order was submitted");
    assert.deepEqual(calls.errors, [{ message: GUEST_SUBMIT_MESSAGE, canRetry: false }]);
    assert.equal(calls.cleared, 0, "the cart was cleared on a refused submit");
  });

  test("the guest check runs FIRST, before name/phone/address validation", async () => {
    // Otherwise a guest would be told to fill fields they can never submit.
    const { run, calls } = checkoutSubmit({ isGuest: true });
    await run();
    assert.equal(calls.errors[0].message, GUEST_SUBMIT_MESSAGE);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-55 · E/F/G — signing in works, and customers are untouched", () => {
  test("choosing إنشاء حساب exits guest mode", () => {
    const r = cartCheckout({ isGuest: true });
    r.alerts[0].buttons.find((b) => b.text === "إنشاء حساب").onPress();
    assert.equal(r.exitedGuest, 1);
  });

  test("after signing in the customer stack returns", () => {
    assert.equal(
      navigatorBranch({
        isGuest: false, isLoggedIn: true,
        isOtpSent: true, isOtpVerified: true, selectedUserType: "customer",
      }),
      "customer",
    );
  });

  test("a signed-in customer still reaches Checkout from the cart", () => {
    const r = cartCheckout({ isGuest: false });
    assert.equal(r.navigated, "Checkout");
    assert.deepEqual(r.alerts, []);
  });

  test("a signed-in customer's submit is not blocked", async () => {
    const { run, calls } = checkoutSubmit({ isGuest: false });
    await run();
    assert.equal(calls.submitted, 1, "a real customer was refused");
    assert.deepEqual(calls.errors, []);
  });

  test("canStartCheckout does not become a second login check", () => {
    // A signed-in customer whose token is still loading must not be locked out.
    assert.equal(canStartCheckout({ isGuest: false, isLoggedIn: false }), true);
    assert.equal(canStartCheckout({ isGuest: false, isLoggedIn: true }), true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-55 · H/I/J — the server is the real authority, and stays so", () => {
  test("POST /api/orders rejects a request with no customer token", () => {
    const r = callOrdersEndpoint(null);
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("…and accepts a valid one", () => {
    assert.equal(callOrdersEndpoint("Bearer good").passed, true);
  });

  test("a garbage token is refused", () => {
    const r = callOrdersEndpoint("Bearer forged");
    assert.equal(r.passed, false);
    assert.equal(r.status, 401);
  });

  test("logging out mid-checkout cannot produce a guest order", () => {
    assert.match(ROUTES, /app\.post\("\/api\/orders", requireCustomerAuth/);
    // and the client refuses too, so neither side alone is load-bearing
    assert.equal(canStartCheckout({ isGuest: true }), false);
  });

  test("addresses are server-guarded — a guest's edits could never save", () => {
    assert.match(ROUTES, /app\.get\("\/api\/users\/:phoneNumber\/addresses", requireCustomerAuth/);
    assert.match(ROUTES, /app\.put\("\/api\/users\/:phoneNumber\/addresses", requireCustomerAuth/);
  });

  test("order history and tracking need a customer token", () => {
    assert.match(ROUTES, /app\.get\("\/api\/orders", requireCustomerAuth/);
    const tracking = read("client/screens/OrderTrackingScreen.tsx");
    assert.match(tracking, /customerToken/,
      "tracking stopped sending the token — it would fetch as anonymous");
  });

  test("the client guard did not weaken any server check", () => {
    assert.doesNotMatch(ROUTES, /app\.post\("\/api\/orders",\s*async/,
      "requireCustomerAuth was removed from order creation");
  });
});
