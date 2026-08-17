/**
 * H-60 — "my location" must move the map, not just the saved coordinate.
 *
 * IMPORTANT, and contrary to the audit: the screen users actually reach is
 * MapPickerScreen.tsx, which renders Leaflet inside a react-native-webview.
 * client/components/MapPicker.native.tsx (react-native-maps, unused mapRef) is
 * imported by nothing — it is dead code — and `postMessage` has NOT been removed
 * from react-native-webview 13.15.0. Those parts of the audit are false; the tests
 * below assert that state rather than pretending otherwise.
 *
 * The real defect: getMyLocation() runs from the mount effect while the Leaflet
 * page is still fetching its library from a CDN. `ref.postMessage` dispatches a
 * native command immediately and react-native-webview does not queue it, so the
 * "moveTo" is dropped and nothing retries. selectedCoord still advanced to the GPS
 * fix, so the map showed the district centre while confirm saved a point ~7 km
 * away — the user sees one pin and saves another.
 *
 * Everything here executes the SHIPPED handlers, lifted out of the .tsx.
 *
 * Run:  node --test tests/unit/h60-map-picker-current-location.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const SCREEN = read("client/screens/MapPickerScreen.tsx");
const WEB_SCREEN = read("client/screens/MapPickerScreen.web.tsx");
const NAVIGATOR = read("client/navigation/RootStackNavigator.tsx");

// ── lifting ─────────────────────────────────────────────────────────────────

function blockEnd(src, from) {
  const start = src.indexOf("{", from);
  if (start === -1) throw new Error("no block");
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error("unbalanced block");
}

function bodyBrace(src, from) {
  for (let i = src.indexOf("{", from); i !== -1; i = src.indexOf("{", i + 1)) {
    if (/^[^\S\n]*\n/.test(src.slice(i + 1))) return i;
  }
  throw new Error("no body brace");
}

function lift(marker, { optional = false } = {}) {
  const at = SCREEN.indexOf(marker);
  if (at === -1) {
    if (optional) return "";
    assert.fail(`source moved: ${marker}`);
  }
  return SCREEN.slice(at, blockEnd(SCREEN, bodyBrace(SCREEN, at)));
}

function evaluate(code, deps, exports) {
  const js = ts
    .transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "");
  const names = Object.keys(deps);
  return new Function(...names, `${js}\nreturn { ${exports.join(",")} };`)(
    ...names.map((n) => deps[n]),
  );
}

// ── fixtures ────────────────────────────────────────────────────────────────

/** A real house in Dhuluiyah — what the GPS returns. */
const GPS = { latitude: 34.0771, longitude: 44.2589 };
/** DHULUIYAH_CENTER — what the Leaflet HTML is centred on before any move. */
const CENTER = { latitude: 34.018, longitude: 44.219 };

/**
 * A WebView double modelling the real contract: postMessage fires a native command
 * at once, and the page can only receive it after it has loaded and registered its
 * listener. react-native-webview does not buffer — its implementation is a bare
 * `Commands.postMessage(...)` call — so anything sent earlier is lost.
 */
function makeWebView({ loadedAtStart = true } = {}) {
  const state = { loaded: loadedAtStart };
  const delivered = [];
  return {
    state,
    delivered,
    ref: {
      current: {
        postMessage: (data) => {
          if (state.loaded) delivered.push(JSON.parse(data));
        },
      },
    },
    finishLoading() {
      state.loaded = true;
    },
  };
}

/**
 * Build the screen's real current-location path with injected dependencies.
 *
 * moveMapTo / mapReadyRef / pendingMoveRef only exist after the fix; when they are
 * absent the lifted getMyLocation still runs against its own inline postMessage, so
 * the tests fail on their merits rather than exploding at import time.
 */
function buildScreen({
  webView,
  permission = "granted",
  position,
  positionError,
}) {
  // The gate mirrors reality: if the page has already loaded, onLoadEnd has fired.
  const mapReadyRef = { current: webView.state.loaded };
  const pendingMoveRef = { current: null };
  const alerts = [];
  const addressCalls = [];
  let selectedCoord = { ...CENTER };

  const shared = {
    Location: {
      requestForegroundPermissionsAsync: async () => ({ status: permission }),
      getCurrentPositionAsync: async () => {
        if (positionError) throw new Error(positionError);
        return { coords: position ?? { ...GPS, accuracy: 12 } };
      },
      Accuracy: { Highest: 6 },
    },
    Alert: { alert: (title, message) => alerts.push({ title, message }) },
    setSelectedCoord: (c) => {
      selectedCoord = c;
    },
    fetchAddress: async (lat, lng) => {
      addressCalls.push({ lat, lng });
    },
    webViewRef: webView.ref,
    mapReadyRef,
    pendingMoveRef,
  };

  const moveSrc = lift("const moveMapTo =", { optional: true });
  const { moveMapTo } = moveSrc
    ? evaluate(moveSrc, shared, ["moveMapTo"])
    : { moveMapTo: undefined };

  const { getMyLocation } = evaluate(
    lift("const getMyLocation = async"),
    { ...shared, moveMapTo },
    ["getMyLocation"],
  );

  /** Replays the onLoadEnd handler the WebView now carries. */
  const finishLoading = () => {
    webView.finishLoading();
    mapReadyRef.current = true;
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending && moveMapTo) moveMapTo(pending);
  };

  return {
    getMyLocation,
    moveMapTo,
    finishLoading,
    alerts,
    addressCalls,
    get selectedCoord() {
      return selectedCoord;
    },
    mapReadyRef,
    pendingMoveRef,
  };
}

const cameraMoves = (webView) =>
  webView.delivered.filter((m) => m.type === "moveTo");

// ════════════════════════════════════════════════════════════════════════════
describe("H-60 · what the audit got wrong (documented, not fixed)", () => {
  test("client/components/MapPicker.native.tsx is imported by nothing", () => {
    const importers = [
      "client/navigation/RootStackNavigator.tsx",
      "client/screens/MapPickerScreen.tsx",
      "client/screens/ProfileCompletionScreen.tsx",
      "client/screens/VendorRegistrationScreen.tsx",
      "client/screens/VendorProfileScreen.tsx",
      "client/components/LocationBar.tsx",
    ].filter((f) => /from ["']@\/components\/MapPicker["']/.test(read(f)));
    assert.deepEqual(importers, [], "MapPicker component is dead code");
  });

  test('the "MapPicker" route renders MapPickerScreen', () => {
    assert.match(stripComments(NAVIGATOR), /component=\{MapPickerScreen\}/);
  });

  test("the live screen does not use react-native-maps", () => {
    assert.ok(!/react-native-maps/.test(SCREEN));
    assert.match(stripComments(SCREEN), /react-native-webview/);
  });

  test("postMessage is NOT removed from react-native-webview 13.15.0", () => {
    const pkg = JSON.parse(
      read("node_modules/react-native-webview/package.json"),
    );
    assert.equal(pkg.version, "13.15.0");
    for (const platform of ["android", "ios"]) {
      assert.match(
        read(`node_modules/react-native-webview/lib/WebView.${platform}.js`),
        /postMessage:function postMessage/,
        `ref.postMessage should exist on ${platform}`,
      );
    }
  });

  test("no map dependency was added or changed", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.dependencies["react-native-webview"], "13.15.0");
    assert.equal(pkg.dependencies["react-native-maps"], "1.20.1");
  });
});

// ── A. the current-location path ────────────────────────────────────────────
describe("H-60 · A · pressing 'my location'", () => {
  test("updates the coordinate to the GPS fix", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView });
    await screen.getMyLocation();
    assert.deepEqual(screen.selectedCoord, GPS);
  });

  test("moves the camera to the SAME coordinate", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView });
    await screen.getMyLocation();

    const moves = cameraMoves(webView);
    assert.equal(moves.length, 1, "the camera was not moved exactly once");
    assert.equal(moves[0].lat, GPS.latitude);
    assert.equal(moves[0].lng, GPS.longitude);
    // marker and camera are the same message: moveToLocation() does setView + setLatLng.
    assert.equal(moves[0].lat, screen.selectedCoord.latitude);
    assert.equal(moves[0].lng, screen.selectedCoord.longitude);
  });

  test("the page moves BOTH the map and the marker for that message", () => {
    // The handler inside the injected HTML — the marker cannot drift from the camera.
    const at = SCREEN.indexOf("function moveToLocation(lat, lng)");
    assert.notEqual(at, -1, "moveToLocation moved");
    const body = SCREEN.slice(at, blockEnd(SCREEN, at));
    assert.match(body, /map\.setView\(\[lat, lng\]/, "no camera move");
    assert.match(body, /marker\.setLatLng\(\[lat, lng\]\)/, "no marker move");
  });

  test("the address is resolved for the same coordinate", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView });
    await screen.getMyLocation();
    assert.deepEqual(screen.addressCalls, [
      { lat: GPS.latitude, lng: GPS.longitude },
    ]);
  });
});

// ── the race this fix exists for ────────────────────────────────────────────
describe("H-60 · a move sent before the page is up is not lost", () => {
  test("it is held, then delivered on load", async () => {
    const webView = makeWebView({ loadedAtStart: false });
    const screen = buildScreen({ webView });

    await screen.getMyLocation();
    assert.equal(
      cameraMoves(webView).length,
      0,
      "the page cannot receive anything yet",
    );
    assert.deepEqual(
      screen.pendingMoveRef.current,
      GPS,
      "the move must be queued rather than dropped",
    );

    screen.finishLoading();

    const moves = cameraMoves(webView);
    assert.equal(moves.length, 1, "the queued move was never delivered");
    assert.equal(moves[0].lat, GPS.latitude);
    assert.equal(moves[0].lng, GPS.longitude);
  });

  test("the visible pin ends up where the saved coordinate is", async () => {
    const webView = makeWebView({ loadedAtStart: false });
    const screen = buildScreen({ webView });
    await screen.getMyLocation();
    screen.finishLoading();

    const shown = cameraMoves(webView).at(-1);
    assert.equal(shown.lat, screen.selectedCoord.latitude);
    assert.equal(shown.lng, screen.selectedCoord.longitude);
    assert.notEqual(
      shown.lat,
      CENTER.latitude,
      "still showing the district centre",
    );
  });

  test("the queue holds only the newest position", async () => {
    const webView = makeWebView({ loadedAtStart: false });
    const second = { latitude: 34.09, longitude: 44.27 };
    const screen = buildScreen({ webView });

    await screen.getMyLocation();
    screen.moveMapTo(second);
    screen.finishLoading();

    const moves = cameraMoves(webView);
    assert.equal(moves.length, 1);
    assert.equal(moves[0].lat, second.latitude);
  });

  test("once loaded, later moves go straight through", async () => {
    const webView = makeWebView({ loadedAtStart: false });
    const screen = buildScreen({ webView });
    screen.finishLoading();

    await screen.getMyLocation();
    assert.equal(cameraMoves(webView).length, 1);
    assert.equal(
      screen.pendingMoveRef.current,
      null,
      "nothing should be queued",
    );
  });
});

// ── B & C. the API actually used ────────────────────────────────────────────
describe("H-60 · B/C · the camera API and the ref", () => {
  test("the screen moves the camera through the WebView ref", () => {
    const code = stripComments(SCREEN);
    assert.match(code, /webViewRef\.current\.postMessage\(/);
    assert.match(code, /type: "moveTo"/);
  });

  test("the ref is genuinely used, not merely declared", async () => {
    // Executed, not read: a ref whose postMessage is never called delivers nothing.
    const webView = makeWebView();
    const screen = buildScreen({ webView });
    await screen.getMyLocation();
    assert.ok(
      webView.delivered.length > 0,
      "the WebView ref was never exercised",
    );
  });

  test("no react-native-maps camera API is used anywhere in the client", () => {
    for (const f of [
      "client/screens/MapPickerScreen.tsx",
      "client/screens/MapPickerScreen.web.tsx",
    ]) {
      const code = stripComments(read(f));
      assert.ok(!/animateToRegion|animateCamera|setCamera/.test(code), `${f}`);
    }
  });

  test("the readiness gate exists on the WebView", () => {
    assert.match(stripComments(SCREEN), /onLoadEnd=\{/);
  });
});

// ── D. manual selection is untouched ────────────────────────────────────────
describe("H-60 · D · manual map selection still works", () => {
  function messageHandler() {
    const calls = [];
    let selectedCoord = { ...CENTER };
    const { handleWebViewMessage } = evaluate(
      lift("const handleWebViewMessage = (event"),
      {
        setSelectedCoord: (c) => {
          selectedCoord = c;
        },
        fetchAddress: async (lat, lng) => calls.push({ lat, lng }),
      },
      ["handleWebViewMessage"],
    );
    return {
      handleWebViewMessage,
      calls,
      get selectedCoord() {
        return selectedCoord;
      },
    };
  }

  test("a tap reported by the page updates the coordinate and address", () => {
    const h = messageHandler();
    h.handleWebViewMessage({
      nativeEvent: {
        data: JSON.stringify({ type: "location", lat: 34.05, lng: 44.24 }),
      },
    });
    assert.deepEqual(h.selectedCoord, { latitude: 34.05, longitude: 44.24 });
    assert.deepEqual(h.calls, [{ lat: 34.05, lng: 44.24 }]);
  });

  test("a manual tap does NOT push the camera back", async () => {
    // The page already moved itself on tap; re-posting would fight the user.
    const webView = makeWebView();
    const h = messageHandler();
    h.handleWebViewMessage({
      nativeEvent: {
        data: JSON.stringify({ type: "location", lat: 34.05, lng: 44.24 }),
      },
    });
    assert.equal(cameraMoves(webView).length, 0);
  });

  test("the page still reports taps and drags", () => {
    const code = stripComments(SCREEN);
    assert.match(code, /map\.on\('click'/);
    assert.match(code, /marker\.on\('dragend'/);
    assert.match(code, /window\.ReactNativeWebView\.postMessage/);
  });

  test("malformed page messages are ignored, not crashed on", () => {
    const h = messageHandler();
    h.handleWebViewMessage({ nativeEvent: { data: "not json" } });
    assert.deepEqual(h.selectedCoord, CENTER, "state must be untouched");
  });
});

// ── E. failure paths ────────────────────────────────────────────────────────
describe("H-60 · E · a failed location fix changes nothing", () => {
  test("a denied permission does not move the pin or the camera", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView, permission: "denied" });
    await screen.getMyLocation();

    assert.deepEqual(
      screen.selectedCoord,
      CENTER,
      "the pin moved without a fix",
    );
    assert.equal(
      cameraMoves(webView).length,
      0,
      "the camera moved without a fix",
    );
    assert.equal(screen.alerts.length, 1, "the user must be told");
    assert.deepEqual(
      screen.pendingMoveRef.current,
      null,
      "nothing may be queued",
    );
  });

  test("a thrown position request leaves everything as it was", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView, positionError: "no fix" });
    await screen.getMyLocation();

    assert.deepEqual(screen.selectedCoord, CENTER);
    assert.equal(cameraMoves(webView).length, 0);
    assert.deepEqual(screen.pendingMoveRef.current, null);
  });

  test("no (0,0) or other placeholder is ever substituted", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView, positionError: "no fix" });
    await screen.getMyLocation();
    assert.notEqual(screen.selectedCoord.latitude, 0);
    assert.notEqual(screen.selectedCoord.longitude, 0);
  });

  test("a coarse fix still pins, but warns the user", async () => {
    const webView = makeWebView();
    const screen = buildScreen({
      webView,
      position: { ...GPS, accuracy: 3000 },
    });
    await screen.getMyLocation();

    assert.equal(screen.alerts.length, 1, "the accuracy warning is gone");
    assert.deepEqual(screen.selectedCoord, GPS);
    assert.equal(cameraMoves(webView).length, 1);
  });
});

// ── F. saved == shown ───────────────────────────────────────────────────────
describe("H-60 · F · what is saved is what was shown", () => {
  function confirm(selectedCoord, addressText, params) {
    let saved = null;
    let handedBack = null;
    const { handleConfirm } = evaluate(
      lift("const handleConfirm = ()"),
      {
        params,
        selectedCoord,
        addressText,
        setSavedLocation: (v) => {
          saved = v;
        },
        navigation: { goBack() {} },
      },
      ["handleConfirm"],
    );
    handleConfirm();
    return { saved, handedBack };
  }

  test("the saved coordinate equals the last camera position", async () => {
    const webView = makeWebView({ loadedAtStart: false });
    const screen = buildScreen({ webView });
    await screen.getMyLocation();
    screen.finishLoading();

    const shown = cameraMoves(webView).at(-1);
    const { saved } = confirm(screen.selectedCoord, "عنوان", undefined);

    assert.equal(saved.latitude, shown.lat);
    assert.equal(saved.longitude, shown.lng);
  });

  test("the callback form hands back the same coordinate", async () => {
    const webView = makeWebView();
    const screen = buildScreen({ webView });
    await screen.getMyLocation();

    let picked = null;
    const { handleConfirm } = evaluate(
      lift("const handleConfirm = ()"),
      {
        params: { onPicked: (v) => (picked = v) },
        selectedCoord: screen.selectedCoord,
        addressText: "عنوان",
        setSavedLocation: () => assert.fail("must not write LocationContext"),
        navigation: { goBack() {} },
      },
      ["handleConfirm"],
    );
    handleConfirm();

    assert.equal(picked.latitude, cameraMoves(webView).at(-1).lat);
    assert.equal(picked.longitude, cameraMoves(webView).at(-1).lng);
  });

  test("the save payload shape is unchanged", () => {
    const { saved } = confirm(GPS, "عنوان اختباري", undefined);
    assert.deepEqual(Object.keys(saved).sort(), [
      "address",
      "latitude",
      "longitude",
    ]);
  });
});

// ── G. the web variant ──────────────────────────────────────────────────────
describe("H-60 · G · the web screen is deliberately untouched", () => {
  test("its location handler only runs on a button press, never on mount", () => {
    const code = stripComments(WEB_SCREEN);
    const effectAt = code.indexOf("useEffect(");
    const effect = code.slice(effectAt, blockEnd(code, effectAt));
    assert.ok(
      !/handleMyLocation\(\)/.test(effect),
      "the web mount effect must not race the iframe load",
    );
    assert.match(code, /onPress=\{handleMyLocation\}/);
  });

  test("the native screen DOES auto-run on mount — which is why it raced", () => {
    const code = stripComments(SCREEN);
    const effectAt = code.indexOf("useEffect(");
    const effect = code.slice(effectAt, blockEnd(code, effectAt));
    assert.match(effect, /getMyLocation\(\)/);
  });

  test("the web screen still moves its own camera", () => {
    const code = stripComments(WEB_SCREEN);
    assert.match(code, /contentWindow\.postMessage/);
    assert.match(code, /type: "moveTo"/);
  });
});
