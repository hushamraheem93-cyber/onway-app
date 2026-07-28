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
  return typeof url === "string" && url.startsWith("https://firebasestorage.googleapis.com/");
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
