import express from "express";
import type { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import sharp from "sharp";
import * as crypto from "crypto";
import * as path from "path";
import { getFirestore, getUserPushToken, getAdminPushToken, deleteFromFirebaseStorage, uploadToFirebaseStorage } from "./firebase";
import {
  GENERIC_SERVER_ERROR,
  commissionPercentOf,
  isUsableCachedImage,
  normaliseStock,
  parseProductPrice,
  JWT_VERIFY_OPTS,
} from "./orderValidation";
import { sendVendorStatusNotification, sendVendorProductNotification, sendPushNotification, sendAdminOrderReadyNotification, sendAdminSettlementRequestNotification } from "./pushNotifications";
import { createSettlementRequest, getAccountSettlementView, getSettlementHistory } from "./settlement";
import { getAccountStatement } from "./financialLedger";
import { orderEvents } from "./orderEvents";
import { isValidSession } from "./adminAuth";
import { isCustomerTokenRevoked } from "./customerRevocation";
import { isRequestSecure } from "./originGuard";

const router = express.Router();

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required but not set. Add it to Replit Secrets before starting the server.");
  }
  return secret;
})();
const VENDOR_COOKIE = "onway_vendor_session";

// ── Multer: memory storage (files go straight to Firebase Storage, no disk) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مدعوم. استخدم PNG أو JPEG فقط."));
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * How long a vendor session lasts. ONE constant for both the JWT and the cookie
 * (H-18): the cookie used to live 30 days while the token expired after 7, so from
 * day 8 the browser kept sending a cookie the server rejected — the dashboard just
 * failed, with no automatic re-authentication.
 */
const VENDOR_SESSION_TTL_SECS = 7 * 24 * 60 * 60;

function makeVendorToken(vendorId: string): string {
  return jwt.sign({ vendorId, role: "vendor" }, JWT_SECRET, { expiresIn: VENDOR_SESSION_TTL_SECS });
}

/**
 * Attributes for the vendor session cookie (H-18).
 *
 * It previously carried only httpOnly + sameSite:"lax" — no Secure, no Path — even
 * though isRequestSecure() already existed and guarded all three admin cookies. A
 * store owner opening the dashboard over http:// on café Wi-Fi handed their session
 * to anyone on the network for a week: edit prices, cancel orders, request payouts.
 *
 * Secure is conditional on the request actually being HTTPS, exactly like the admin
 * cookie — a hardcoded `true` would stop the cookie being set at all over plain HTTP
 * in local development.
 */
function vendorCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: isRequestSecure(req),
    sameSite: "strict" as const,
    path: "/",
    maxAge: VENDOR_SESSION_TTL_SECS * 1000,
  };
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || "";
  const cookies: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  return cookies;
}

function getVendorSession(req: Request): string | null {
  const cookies = (req as any).cookies || parseCookies(req);
  const token = cookies[VENDOR_COOKIE];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS) as any;
    return decoded.role === "vendor" ? decoded.vendorId : null;
  } catch {
    return null;
  }
}

// Statuses that must not be able to act. Deliberately a BLOCKLIST, mirroring the
// checks POST /api/vendor/login already performs, so legacy vendor documents with
// an unexpected status value keep working exactly as they do today.
const VENDOR_BLOCKED_STATUSES = ["pending", "suspended", "rejected"];

// Routes a blocked vendor may still call, so the app can render its own
// "قيد المراجعة" / suspension state and notice when an admin approves.
const VENDOR_PREAPPROVAL_ROUTES = ["/api/vendor/profile", "/api/vendor/push-token"];

const VENDOR_BLOCKED_MESSAGES: Record<string, string> = {
  pending: "حسابك قيد المراجعة. سيتم إخبارك عند الموافقة.",
  suspended: "حسابك معلق. تواصل مع الإدارة.",
  rejected: "تم رفض طلبك. تواصل مع الإدارة.",
};

function isPreApprovalVendorRoute(req: Request): boolean {
  const path = (req.originalUrl || req.path || "").split("?")[0];
  // GET is read-only (render the pending screen); PATCH /profile is a write.
  if (req.method !== "GET" && !path.endsWith("/api/vendor/push-token")) return false;
  return VENDOR_PREAPPROVAL_ROUTES.some((r) => path.endsWith(r));
}

/**
 * C-16: POST /api/vendor/register had NO authentication and took phoneNumber
 * straight from the body, then returned a vendor session token. Anyone who knew
 * the API URL could script a store account for every commercial number in the
 * city; the duplicate check ("رقم الهاتف مسجل مسبقاً") would then lock the real
 * owners out permanently and flood the admin queue.
 *
 * Driver registration already does this correctly — it carries the customer token
 * issued after OTP verification — so registration now demands the same proof.
 * Verifying the token is not enough on its own: the number being registered must
 * be the number that was verified, or an attacker with one real OTP could still
 * register every other number.
 */
const phoneTail = (phone: unknown) => String(phone ?? "").replace(/\D/g, "").slice(-10);
const samePhone = (a: unknown, b: unknown) => {
  const ta = phoneTail(a);
  return ta.length === 10 && ta === phoneTail(b);
};

function requireVerifiedCustomer(req: Request, res: Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) {
    return res.status(401).json({ error: "يجب التحقق من رقم هاتفك أولاً" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS) as any;
    if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid role");
    if (isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) throw new Error("revoked");
    (req as any).verifiedPhone = String(decoded.phoneNumber);
    next();
  } catch {
    return res.status(401).json({ error: "يجب التحقق من رقم هاتفك أولاً" });
  }
}

async function requireVendor(req: Request, res: Response, next: express.NextFunction) {
  // 1. Try Authorization: Bearer <jwt> (mobile app)
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // 2. Fall back to cookie (web dashboard)
  if (!token) {
    const cookies = (req as any).cookies || parseCookies(req);
    token = cookies[VENDOR_COOKIE] || null;
  }

  if (!token) return res.status(401).json({ error: "غير مصرح - سجل دخولك أولاً" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS) as any;
    if (decoded.role !== "vendor") return res.status(403).json({ error: "غير مصرح" });

    // Re-check the vendor's status on every request. The token is valid for 7 days
    // and mobile-auth mints fresh ones, so suspending a vendor for fraud did not
    // actually cut them off — only the password-login path looked at status, and
    // the mobile app never uses it.
    const db = getFirestore();
    if (db) {
      const vDoc = await db.collection("vendors").doc(String(decoded.vendorId)).get();
      if (!vDoc.exists) return res.status(403).json({ error: "المتجر غير موجود" });
      const status = String((vDoc.data() as any)?.status || "");
      if (VENDOR_BLOCKED_STATUSES.includes(status) && !isPreApprovalVendorRoute(req)) {
        return res.status(403).json({ error: VENDOR_BLOCKED_MESSAGES[status], vendorStatus: status });
      }
    }

    (req as any).vendorId = decoded.vendorId;
    next();
  } catch (err: any) {
    const isExpired = err?.name === "TokenExpiredError";
    return res.status(401).json({
      error: isExpired
        ? "جلستك انتهت، الرجاء تسجيل الدخول مجدداً"
        : "توكن غير صالح",
      expired: isExpired,
    });
  }
}

function generateImageHash(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

async function processAndSaveImage(buffer: Buffer, hash: string): Promise<{ full: string; thumb: string }> {
  // Upload to Firebase Storage and store only the URL. This mirrors what
  // POST /api/admin/upload-image does.
  //
  // The old comment here said "Firebase Storage is not provisioned for this
  // project" — that was true when written and is not any more (the bucket is
  // provisioned). Base64-only meant a product with 5 images carried roughly
  // 5 × 60KB inline, and Firestore rejects any document over 1MB: the vendor
  // simply could not save the product, and every catalog response shipped the
  // full blobs.
  const [webpBuffer, thumbBuffer] = await Promise.all([
    sharp(buffer).resize(700, 700, { fit: "cover", position: "center" }).webp({ quality: 70 }).toBuffer(),
    sharp(buffer).resize(200, 200, { fit: "cover", position: "center" }).webp({ quality: 75 }).toBuffer(),
  ]);
  // Storage is provisioned, so there is no Base64 fallback: falling back would
  // reintroduce the exact 1MB-document failure described above, silently, and the
  // vendor would see "saved" for a product that cannot be saved.
  const [full, thumb] = await Promise.all([
    uploadToFirebaseStorage(webpBuffer, `vendor-products/${hash}.webp`),
    uploadToFirebaseStorage(thumbBuffer, `vendor-products/${hash}_thumb.webp`),
  ]);
  console.info(`[Image] ✓ product image uploaded to Storage (${Math.round(webpBuffer.length / 1024)}KB full, ${Math.round(thumbBuffer.length / 1024)}KB thumb)`);
  return { full, thumb };
}

async function findDuplicateImage(hash: string): Promise<{ full: string; thumb: string | null } | null> {
  const db = getFirestore();
  if (!db) return null;
  const snap = await db.collection("productImageHashes").doc(hash).get();
  if (!snap.exists) return null;

  const data = snap.data() as any;
  const full: string = data?.imageUrl ?? "";

  // This test used to be INVERTED. It read:
  //
  //     if (full.startsWith("https://firebasestorage.googleapis.com/")) return null;
  //
  // i.e. it discarded Storage URLs and happily returned `/uploads/...` and Base64.
  // That was written while the bucket did not exist, when re-encoding as Base64 was
  // the only thing that rendered. Once the bucket was provisioned the logic became
  // exactly backwards, and it is why NEW products kept coming out with OLD image
  // values: the upload never ran at all — a matching md5 short-circuited straight to
  // the poisoned cache entry. It is the single reason the app still behaved as if
  // the old local-image logic were live.
  //
  // A cache entry is now reusable ONLY if it points at Storage. Anything else
  // (legacy /uploads path, Base64 blob, empty, malformed) is treated as a miss, so
  // the caller re-uploads and saveImageHash overwrites the poisoned entry — the
  // cache heals itself on next use with no migration required for this collection.
  //
  // An allowlist, not a denylist. Rejecting only `/uploads/` still lets Base64
  // data URIs through, and those are the bulk of the poisoned entries: they are
  // what the inverted test wrote back on every hit while the bucket was missing.
  if (!isUsableCachedImage(full)) return null;

  const thumb: string | null = isUsableCachedImage(data?.thumbUrl) ? data.thumbUrl : null;
  return { full, thumb };
}

async function saveImageHash(hash: string, full: string, thumb: string): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  await db.collection("productImageHashes").doc(hash).set({
    imageUrl: full,
    thumbUrl: thumb,
    createdAt: new Date().toISOString(),
  });
}

function vendorId(): string {
  return `vendor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function productId(): string {
  return `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ── POST /api/vendor/mobile-auth ────────────────────────────────────────────
// Called by the app after OTP verification to get vendor token + profile
router.post("/api/vendor/mobile-auth", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "رقم الهاتف مطلوب" });

    // SECURITY: proof of phone ownership is required before issuing a vendor token.
    // The app calls /api/auth/verify-otp first, which returns a customer JWT bound
    // to the verified phone; we require that JWT here and confirm it matches the
    // requested phone. Without this, anyone could mint a 7-day vendor token for any
    // registered vendor phone (account takeover).
    const authHeader = req.headers.authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    let verifiedPhone: string | null = null;
    try {
      const decoded = jwt.verify(bearer, JWT_SECRET, JWT_VERIFY_OPTS) as any;
      if (decoded.role === "customer" && decoded.phoneNumber
          && !isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) {
        verifiedPhone = String(decoded.phoneNumber);
      }
    } catch { /* invalid/expired token → verifiedPhone stays null */ }
    if (!verifiedPhone || verifiedPhone !== String(phoneNumber)) {
      return res.status(401).json({ error: "غير مصرح — يرجى التحقق من رقم الهاتف أولاً" });
    }

    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const snap = await db.collection("vendors")
      .where("phoneNumber", "==", phoneNumber).limit(1).get();

    if (snap.empty) {
      return res.json({ vendor: null, token: null }); // not registered yet
    }

    const vendor = snap.docs[0].data() as any;
    const { passwordHash: _pw, ...safeVendor } = vendor;
    const token = makeVendorToken(vendor.id);
    res.json({ vendor: safeVendor, token });
  } catch (err) {
    console.error("mobile-auth:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── Pages ───────────────────────────────────────────────────────────────────
router.get("/vendor/login", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "server", "templates", "vendor-login.html"));
});

router.get("/vendor", (req, res) => {
  const vendorId = getVendorSession(req);
  if (!vendorId) return res.redirect("/vendor/login");
  res.sendFile(path.resolve(process.cwd(), "server", "templates", "vendor-dashboard.html"));
});

router.get("/vendor/dashboard", (req, res) => {
  const vendorId = getVendorSession(req);
  if (!vendorId) return res.redirect("/vendor/login");
  res.sendFile(path.resolve(process.cwd(), "server", "templates", "vendor-dashboard.html"));
});

// ── POST /api/vendor/register ───────────────────────────────────────────────
router.post("/api/vendor/register", requireVerifiedCustomer, async (req, res) => {
  try {
    const { storeName, businessType, phoneNumber, password, ownerName, address, email, latitude, longitude } = req.body;
    if (!storeName || !businessType || !phoneNumber || !ownerName) {
      return res.status(400).json({ error: "جميع الحقول المطلوبة غير مكتملة" });
    }
    // C-16: you may only register the number you verified. Compared on the last ten
    // digits because production stores Iraqi numbers in several shapes
    // ("07…", "9647…", "009647…") and a string compare silently fails to match.
    if (!samePhone(phoneNumber, (req as any).verifiedPhone)) {
      return res.status(403).json({ error: "لا يمكن التسجيل برقم هاتف غير الذي تم التحقق منه" });
    }
    // Optional store location pinned by the owner on the map (used for dispatch:
    // ranking the nearest driver and shown on the admin panel map).
    const lat = Number(latitude), lng = Number(longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (password && password.length < 6) {
      return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    }

    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const existing = await db.collection("vendors")
      .where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: "رقم الهاتف مسجل مسبقاً" });

    // password is optional for mobile (OTP-based auth); use random if not provided
    const rawPass = password || Math.random().toString(36) + Math.random().toString(36);
    const passwordHash = await bcrypt.hash(rawPass, 10);
    const id = vendorId();
    const now = new Date().toISOString();

    await db.collection("vendors").doc(id).set({
      id,
      storeName,
      businessType,
      phoneNumber,
      email: email || null,
      passwordHash,
      ownerName,
      address: address || "",
      ...(hasCoords ? { latitude: lat, longitude: lng } : {}),
      status: "pending",
      totalProducts: 0,
      totalOrders: 0,
      createdAt: now,
    });

    await db.collection("adminNotifications").add({
      type: "new_vendor",
      title: "متجر جديد يحتاج مراجعة",
      message: `${storeName} (${ownerName}) طلب انضمام كشريك`,
      vendorId: id,
      status: "unread",
      createdAt: now,
    });

    const token = makeVendorToken(id);
    res.status(201).json({
      success: true,
      message: "تم التسجيل بنجاح! سيتم مراجعة طلبك خلال 24 ساعة.",
      token,
      vendor: {
        id,
        storeName,
        businessType,
        phoneNumber,
        ownerName,
        address: address || "",
        ...(hasCoords ? { latitude: lat, longitude: lng } : {}),
        status: "pending",
        totalProducts: 0,
        createdAt: now,
      },
    });
  } catch (err: any) {
    console.error("vendor register:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── POST /api/vendor/login ──────────────────────────────────────────────────
router.post("/api/vendor/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password) {
      return res.status(400).json({ error: "رقم الهاتف وكلمة المرور مطلوبان" });
    }

    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const snap = await db.collection("vendors")
      .where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" });

    const doc = snap.docs[0];
    const vendor = doc.data() as any;

    if (vendor.status === "pending") {
      return res.status(403).json({ error: "حسابك قيد المراجعة. سيتم إخبارك عند الموافقة." });
    }
    if (vendor.status === "suspended") {
      return res.status(403).json({ error: "حسابك معلق. تواصل مع الإدارة." });
    }
    if (vendor.status === "rejected") {
      return res.status(403).json({ error: "تم رفض طلبك. تواصل مع الإدارة." });
    }

    const valid = await bcrypt.compare(password, vendor.passwordHash);
    if (!valid) return res.status(401).json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" });

    const token = makeVendorToken(vendor.id);
    res
      .cookie(VENDOR_COOKIE, token, vendorCookieOptions(req))
      .json({
        success: true,
        vendor: {
          id: vendor.id,
          storeName: vendor.storeName,
          businessType: vendor.businessType,
          status: vendor.status,
        },
      });
  } catch (err) {
    console.error("vendor login:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── GET /api/vendor/logout ──────────────────────────────────────────────────
router.get("/api/vendor/logout", (req, res) => {
  // H-18: a cookie is only removed when the attributes match the ones it was set
  // with. clearCookie() defaults to path "/" but not to Secure/SameSite, so the
  // logout could leave the session cookie in place on some browsers.
  const { maxAge: _maxAge, ...clearOpts } = vendorCookieOptions(req);
  res.clearCookie(VENDOR_COOKIE, clearOpts).redirect("/vendor/login");
});

// ── GET /api/vendor/profile ─────────────────────────────────────────────────
router.get("/api/vendor/profile", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const doc = await db.collection("vendors").doc((req as any).vendorId).get();
    if (!doc.exists) return res.status(404).json({ error: "المتجر غير موجود" });

    const v = doc.data() as any;
    const { passwordHash: _pw, ...safe } = v;
    res.json(safe);
  } catch (err) {
    console.error("vendor profile:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── Settlement (generic engine) — vendor read + request ─────────────────────
router.get("/api/vendor/settlement", requireVendor, async (req, res) => {
  try {
    res.json(await getAccountSettlementView("vendor", (req as any).vendorId));
  } catch (err: any) {
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.get("/api/vendor/settlement/history", requireVendor, async (req, res) => {
  try {
    res.json(await getSettlementHistory("vendor", (req as any).vendorId));
  } catch (err: any) {
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// Bank-style statement (ledger movements + running balance) for the vendor.
router.get("/api/vendor/statement", requireVendor, async (req, res) => {
  try {
    res.json(await getAccountStatement("vendor", (req as any).vendorId));
  } catch (err: any) {
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

router.post("/api/vendor/settlement/request", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    const vid = (req as any).vendorId;
    let storeName = vid;
    if (db) {
      const doc = await db.collection("vendors").doc(vid).get();
      if (doc.exists) storeName = (doc.data() as any).storeName || (doc.data() as any).name || vid;
    }
    const result = await createSettlementRequest("vendor", vid, storeName);
    if (!result.ok) {
      if (result.reason === "already_requested")
        return res.status(409).json({ error: "لديك طلب تسوية قيد المراجعة بالفعل" });
      return res.status(400).json({ error: "لا توجد مبالغ مستحقة للتسوية" });
    }
    orderEvents.emit("settlement:request", {
      requestId: result.requestId, accountType: "vendor", accountId: vid,
      accountName: storeName, outstanding: result.outstanding, pendingOrderCount: result.pendingOrderCount,
    });
    const adminToken = await getAdminPushToken().catch(() => null);
    if (adminToken) sendAdminSettlementRequestNotification(adminToken, "vendor", storeName, result.outstanding ?? 0).catch(() => {});
    res.json({ success: true, requestId: result.requestId });
  } catch (err: any) {
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── PATCH /api/vendor/profile ── update bio/address ─────────────────────────
router.patch("/api/vendor/profile", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const vid = (req as any).vendorId;
    const { storeName, bio, address, deliveryTime, deliveryPrice, workingHours, rating, latitude, longitude } = req.body;
    const updates: any = { updatedAt: new Date().toISOString() };
    if (storeName !== undefined && String(storeName).trim()) updates.storeName = String(storeName).trim();
    if (bio !== undefined) updates.bio = bio;
    if (address !== undefined) updates.address = address;
    if (deliveryTime !== undefined) updates.deliveryTime = deliveryTime;
    if (deliveryPrice !== undefined) updates.deliveryPrice = Number(deliveryPrice);
    if (workingHours !== undefined) updates.workingHours = workingHours;
    if (rating !== undefined) updates.rating = Number(rating);
    // Store location pinned by the owner on the map (dispatch + admin map).
    if (latitude !== undefined && longitude !== undefined) {
      const lat = Number(latitude), lng = Number(longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        updates.latitude = lat;
        updates.longitude = lng;
      }
    }
    await db.collection("vendors").doc(vid).update(updates);
    const doc = await db.collection("vendors").doc(vid).get();
    const { passwordHash: _pw, ...safe } = doc.data() as any;
    res.json(safe);
  } catch (err) {
    console.error("patch vendor profile:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── PATCH /api/vendor/availability ── vacation / busy mode toggle ────────────
router.patch("/api/vendor/availability", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const vid = (req as any).vendorId;
    const { isVacation, isBusy } = req.body;
    const updates: any = { updatedAt: new Date().toISOString() };
    if (typeof isVacation === "boolean") updates.isVacation = isVacation;
    if (typeof isBusy === "boolean") updates.isBusy = isBusy;
    await db.collection("vendors").doc(vid).update(updates);
    const doc = await db.collection("vendors").doc(vid).get();
    const { passwordHash: _pw, ...safe } = doc.data() as any;
    return res.json(safe);
  } catch (err) {
    console.error("patch vendor availability:", err);
    return res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── POST /api/vendor/profile/images ── upload avatar or cover ────────────────
const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مدعوم."));
    }
  },
});

async function saveProfileImage(
  buffer: Buffer,
  type: "avatar" | "cover",
  vendorId: string
): Promise<string> {
  // Upload to Firebase Storage and store only the URL — the same treatment
  // processAndSaveImage gives product images.
  //
  // This was the last Base64-only image path. Its comment still claimed "Firebase
  // Storage is not provisioned", which stopped being true. A logo plus a cover put
  // roughly 60-120KB of inline data URI into the vendor document, and
  // limitImageSize() passes data URIs through untouched — so those blobs shipped
  // with every /api/stores catalog response, for every store, on every load.
  //
  // Existing vendors keep working: their stored value is a data URI, the client's
  // resolveImageUrl() renders both shapes, and deleteFromFirebaseStorage() ignores
  // anything that is not a Storage URL. No migration required.
  let webpBuffer: Buffer;
  if (type === "avatar") {
    webpBuffer = await sharp(buffer)
      .resize(350, 350, { fit: "cover", position: "center" })
      .webp({ quality: 75 })
      .toBuffer();
  } else {
    webpBuffer = await sharp(buffer)
      .resize(1000, 350, { fit: "cover", position: "center" })
      .webp({ quality: 70 })
      .toBuffer();
  }
  const hash = generateImageHash(webpBuffer);
  const url = await uploadToFirebaseStorage(webpBuffer, `vendor-profiles/${vendorId}/${type}-${hash}.webp`);
  console.info(`[Image] ✓ ${type} image uploaded to Storage (${Math.round(webpBuffer.length / 1024)}KB) for vendor ${vendorId}`);
  return url;
}

router.post(
  "/api/vendor/profile/images",
  requireVendor,
  profileUpload.fields([{ name: "profileImage", maxCount: 1 }, { name: "coverImage", maxCount: 1 }]),
  async (req, res) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const vid = (req as any).vendorId;
      const files = req.files as Record<string, Express.Multer.File[]>;

      // Read old URLs BEFORE uploading new images so we can clean up afterwards.
      // This is the only extra Firestore read — reused for the response too.
      const existingDoc = await db.collection("vendors").doc(vid).get();
      const existingData = existingDoc.exists ? (existingDoc.data() as any) : {};
      const oldLogoUrl: string = existingData?.profileImageUrl ?? "";
      const oldCoverUrl: string = existingData?.coverImageUrl ?? "";

      const updates: any = { updatedAt: new Date().toISOString() };

      if (files?.profileImage?.[0]) {
        updates.profileImageUrl = await saveProfileImage(files.profileImage[0].buffer, "avatar", vid);
      }
      if (files?.coverImage?.[0]) {
        updates.coverImageUrl = await saveProfileImage(files.coverImage[0].buffer, "cover", vid);
      }

      if (Object.keys(updates).length === 1) {
        return res.status(400).json({ error: "لم يتم إرسال أي صورة" });
      }

      await db.collection("vendors").doc(vid).update(updates);
      const doc = await db.collection("vendors").doc(vid).get();
      const { passwordHash: _pw, ...safe } = doc.data() as any;
      res.json(safe);

      // Fire-and-forget: delete old images from Storage only after successful Firestore update.
      // Each URL is unique (contains vendorId + type + timestamp) so no cross-reference check needed.
      if (updates.profileImageUrl && oldLogoUrl && oldLogoUrl !== updates.profileImageUrl) {
        deleteFromFirebaseStorage(oldLogoUrl).catch(() => {});
      }
      if (updates.coverImageUrl && oldCoverUrl && oldCoverUrl !== updates.coverImageUrl) {
        deleteFromFirebaseStorage(oldCoverUrl).catch(() => {});
      }
    } catch (err) {
      console.error("profile images:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// ── Helper: process multiple uploaded images ─────────────────────────────────
async function processUploadedImages(files: Express.Multer.File[]): Promise<{ imageUrls: string[]; imageThumbs: string[] }> {
  const results = await Promise.all(
    files.map(async (file) => {
      const hash = generateImageHash(file.buffer);
      const duplicate = await findDuplicateImage(hash);
      if (duplicate) {
        return { full: duplicate.full, thumb: duplicate.thumb ?? duplicate.full };
      }
      const processed = await processAndSaveImage(file.buffer, hash);
      await saveImageHash(hash, processed.full, processed.thumb);
      return processed;
    })
  );
  return {
    imageUrls: results.map(r => r.full),
    imageThumbs: results.map(r => r.thumb),
  };
}

// ── POST /api/vendor/products ───────────────────────────────────────────────
router.post(
  "/api/vendor/products",
  requireVendor,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "images", maxCount: 5 }]),
  async (req, res) => {
    const fields = (req.files as Record<string, Express.Multer.File[]>) || {};
    const uploadedFiles = [...(fields["images"] || []), ...(fields["image"] || [])];
    try {
      const { name, description, price, category, stock, unit } = req.body;
      const libraryImageUrl = req.body.libraryImageUrl as string | undefined;
      const vid = (req as any).vendorId;

      if (!name || !price || !category || (uploadedFiles.length === 0 && !libraryImageUrl)) {
        return res.status(400).json({ error: "الاسم، السعر، الفئة، والصورة مطلوبة" });
      }
      // H-05: the check above is truthiness only — "-50000", "abc" and "1e400" all
      // pass it. Reject anything that is not a finite, strictly-positive number.
      const priceNum = parseProductPrice(price);
      if (priceNum === null) {
        return res.status(400).json({ error: "السعر غير صالح" });
      }

      if (uploadedFiles.length > 5) {
        return res.status(400).json({ error: "الحد الأقصى للصور هو 5 صور" });
      }

      const db = getFirestore();
      if (!db) {
        return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      }

      const vDoc = await db.collection("vendors").doc(vid).get();
      if (!vDoc.exists) {
        return res.status(403).json({ error: "حسابك غير موجود" });
      }
      if ((vDoc.data() as any).status === "rejected" || (vDoc.data() as any).status === "suspended") {
        return res.status(403).json({ error: "حسابك غير مفعل" });
      }

      let imageUrls: string[];
      let imageUrl: string;
      let imageThumbs: string[] = [];
      if (libraryImageUrl && uploadedFiles.length === 0) {
        // Merchant chose a library image — use URL directly, no upload needed
        imageUrl = libraryImageUrl;
        imageUrls = [libraryImageUrl];
      } else {
        const processed = await processUploadedImages(uploadedFiles);
        imageUrls = processed.imageUrls;
        imageThumbs = processed.imageThumbs;
        imageUrl = imageUrls[0];
      }

      const pid = productId();
      const now = new Date().toISOString();
      const vData = vDoc.data() as any;

      const extraDataRaw = req.body.extraData;
      const variantsRaw = req.body.variants;
      const addonsRaw = req.body.addons;
      let extraData: Record<string, string> | undefined;
      let variants: any[] | undefined;
      let addons: any[] | undefined;
      if (extraDataRaw) { try { extraData = JSON.parse(extraDataRaw); } catch {} }
      if (variantsRaw) { try { variants = JSON.parse(variantsRaw); } catch {} }
      if (addonsRaw) { try { addons = JSON.parse(addonsRaw); } catch {} }

      await db.collection("vendorProducts").doc(pid).set({
        id: pid,
        vendorId: vid,
        vendorName: vData.storeName,
        storeName: vData.storeName,
        vendorPhone: vData.phoneNumber,
        name,
        description: description || "",
        price: priceNum,
        category,
        stock: normaliseStock(stock),
        unit: unit || "قطعة",
        imageUrl,
        imageUrls,
        ...(imageThumbs.length > 0 ? { imageThumbs } : {}),
        status: "approved",
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
        ...(extraData ? { extraData } : {}),
        ...(variants ? { variants } : {}),
        ...(addons ? { addons } : {}),
      });

      // Increment vendor's totalProducts counter
      try {
        const { FieldValue: FV } = await import("firebase-admin/firestore");
        await db.collection("vendors").doc(vid).update({ totalProducts: FV.increment(1), updatedAt: now });
      } catch {}

      res.status(201).json({
        success: true,
        message: "تم إضافة المنتج بنجاح! سيظهر للعملاء الآن.",
        product: { id: pid, name, price: priceNum, imageUrl, imageUrls, status: "approved" },
      });
    } catch (err: any) {
      console.error("add product:", err);
      res.status(500).json({ error: "حدث خطأ في إضافة المنتج" });
    }
  }
);

// ── GET /api/vendor/products ────────────────────────────────────────────────
router.get("/api/vendor/products", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const { status } = req.query;

    let query = db.collection("vendorProducts").where("vendorId", "==", vid);
    if (status) query = (query as any).where("status", "==", status);

    const snap = await query.get();

    const products = snap.docs
      .map((d) => ({ ...(d.data() as any) }))
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ products, total: products.length });
  } catch (err) {
    console.error("get products:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── PUT /api/vendor/products/:id ────────────────────────────────────────────
router.put(
  "/api/vendor/products/:pid",
  requireVendor,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "images", maxCount: 5 }]),
  async (req, res) => {
    const fields = (req.files as Record<string, Express.Multer.File[]>) || {};
    const uploadedFiles = [...(fields["images"] || []), ...(fields["image"] || [])];
    try {
      const db = getFirestore();
      if (!db) {
        return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      }

      const vid = (req as any).vendorId;
      const pid = req.params.pid as string;
      const doc = await db.collection("vendorProducts").doc(pid).get();

      if (!doc.exists || (doc.data() as any).vendorId !== vid) {
        return res.status(404).json({ error: "المنتج غير موجود" });
      }

      const { name, description, price, category, stock, unit, existingImages } = req.body;
      const now = new Date().toISOString();
      const updates: Record<string, any> = { updatedAt: now };

      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      // H-05: `if (price)` let "-50000" / "abc" / "1e400" through into storage.
      if (price !== undefined && String(price).trim() !== "") {
        const p = parseProductPrice(price);
        if (p === null) return res.status(400).json({ error: "السعر غير صالح" });
        updates.price = p;
      }
      if (category) updates.category = category;
      if (stock !== undefined) updates.stock = normaliseStock(stock);
      if (unit) updates.unit = unit;
      if (req.body.extraData) {
        try { updates.extraData = JSON.parse(req.body.extraData); } catch {}
      }

      const currentData = doc.data() as any;
      const storedUrls: string[] = currentData.imageUrls && currentData.imageUrls.length > 0
        ? currentData.imageUrls
        : (currentData.imageUrl ? [currentData.imageUrl] : []);

      let keptImages: string[] = [];
      if (existingImages) {
        try {
          const parsed: string[] = JSON.parse(existingImages);
          keptImages = parsed.filter((url) => storedUrls.includes(url));
        } catch {}
      }

      if (keptImages.length + uploadedFiles.length > 5) {
        return res.status(400).json({ error: "الحد الأقصى للصور هو 5 صور" });
      }

      // Compute URLs that will be removed from the product (Storage cleanup candidates)
      let removedUrls: string[] = [];
      let removedThumbs: string[] = [];
      if (uploadedFiles.length > 0 || existingImages !== undefined) {
        const { imageUrls: newUrls, imageThumbs: newThumbs } = await processUploadedImages(uploadedFiles);
        const allUrls = [...keptImages, ...newUrls];
        // Build URL→thumb map upfront — needed for both kept-thumb mapping and cleanup
        const existingThumbs: string[] = currentData.imageThumbs || [];
        const urlToThumb = new Map<string, string>(
          (currentData.imageUrls || []).map((u: string, i: number) => [u, existingThumbs[i]])
        );
        if (allUrls.length > 0) {
          updates.imageUrls = allUrls;
          updates.imageUrl = allUrls[0];
          // Reconstruct imageThumbs: map kept images to their existing thumbs, append new ones
          updates.imageThumbs = [
            ...keptImages.map((u: string) => urlToThumb.get(u) || u),
            ...newThumbs,
          ];
        }
        // URLs that existed before but won't be in the new list
        removedUrls = storedUrls.filter((url) => !allUrls.includes(url));
        // Corresponding thumbnails for removed full images
        removedThumbs = removedUrls
          .map((u) => urlToThumb.get(u))
          .filter((t): t is string => !!t && t.startsWith("https://firebasestorage.googleapis.com/"));
      }

      await db.collection("vendorProducts").doc(pid).update(updates);

      res.json({ success: true, message: "تم حفظ التعديلات بنجاح" });

      // Fire-and-forget: clean up Storage files that are no longer used by this product.
      // Reference-check ensures shared (deduplicated) images are not deleted prematurely.
      if (removedUrls.length > 0) {
        (async () => {
          for (const url of removedUrls) {
            if (!url.startsWith("https://firebasestorage.googleapis.com/")) continue;
            try {
              const refSnap = await db!
                .collection("vendorProducts")
                .where("imageUrls", "array-contains", url)
                .limit(1)
                .get();
              if (refSnap.empty) {
                await deleteFromFirebaseStorage(url);
                console.info("[Storage] ✓ delete success (replaced full image):", pid);
              }
            } catch (err: any) {
              console.warn("[Storage] ✗ delete failure (replaced full image):", err?.message);
            }
          }
          for (const thumbUrl of removedThumbs) {
            if (!thumbUrl.startsWith("https://firebasestorage.googleapis.com/")) continue;
            try {
              const thumbRefSnap = await db!
                .collection("vendorProducts")
                .where("imageThumbs", "array-contains", thumbUrl)
                .limit(1)
                .get();
              if (thumbRefSnap.empty) {
                await deleteFromFirebaseStorage(thumbUrl);
                console.info("[Storage] ✓ delete success (replaced thumbnail):", pid);
              }
            } catch (err: any) {
              console.warn("[Storage] ✗ delete failure (replaced thumbnail):", err?.message);
            }
          }
        })().catch(() => {});
      }
    } catch (err) {
      console.error("update product:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// ── POST /api/vendor/products/bulk-delete ───────────────────────────────────
router.post("/api/vendor/products/bulk-delete", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "لم يتم تحديد أي منتجات" });
    }

    const uniqueIds = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];

    if (uniqueIds.length === 0) {
      return res.status(400).json({ error: "لم يتم تحديد أي منتجات صالحة" });
    }

    // Collect image data before deletion so we can clean Storage afterward
    const imageDataToClean: Array<{ fullUrls: string[]; thumbUrls: string[] }> = [];

    const results = await Promise.allSettled(
      uniqueIds.map(async (pid: string) => {
        const doc = await db.collection("vendorProducts").doc(pid).get();
        if (!doc.exists || (doc.data() as any).vendorId !== vid) {
          throw new Error(`المنتج ${pid} غير موجود`);
        }
        const d = doc.data() as any;
        imageDataToClean.push({
          fullUrls: d.imageUrls?.length ? d.imageUrls : (d.imageUrl ? [d.imageUrl] : []),
          thumbUrls: d.imageThumbs ?? [],
        });
        await db.collection("vendorProducts").doc(pid).update({
          status: "deleted",
          deletedAt: new Date().toISOString(),
        });
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({ success: true, succeeded, failed, total: ids.length });

    // Fire-and-forget: clean up Storage images for deleted products
    (async () => {
      for (const { fullUrls, thumbUrls } of imageDataToClean) {
        for (const url of fullUrls) {
          if (!url.startsWith("https://firebasestorage.googleapis.com/")) continue;
          try {
            const refSnap = await db!
              .collection("vendorProducts")
              .where("imageUrls", "array-contains", url)
              .limit(1)
              .get();
            if (refSnap.empty) {
              await deleteFromFirebaseStorage(url);
              console.info("[Storage] ✓ delete success (bulk delete full)");
            }
          } catch (err: any) {
            console.warn("[Storage] ✗ delete failure (bulk delete full):", err?.message);
          }
        }
        for (const thumbUrl of thumbUrls) {
          if (!thumbUrl.startsWith("https://firebasestorage.googleapis.com/")) continue;
          try {
            const thumbRefSnap = await db!
              .collection("vendorProducts")
              .where("imageThumbs", "array-contains", thumbUrl)
              .limit(1)
              .get();
            if (thumbRefSnap.empty) {
              await deleteFromFirebaseStorage(thumbUrl);
              console.info("[Storage] ✓ delete success (bulk delete thumb)");
            }
          } catch (err: any) {
            console.warn("[Storage] ✗ delete failure (bulk delete thumb):", err?.message);
          }
        }
      }
    })().catch(() => {});
  } catch (err) {
    console.error("bulk delete products:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── DELETE /api/vendor/products/:id ─────────────────────────────────────────
router.delete("/api/vendor/products/:pid", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const pid = req.params.pid as string;
    const doc = await db.collection("vendorProducts").doc(pid).get();

    if (!doc.exists || (doc.data() as any).vendorId !== vid) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    // Collect image URLs before updating Firestore
    const data = doc.data() as any;
    const fullUrls: string[] = data.imageUrls?.length
      ? data.imageUrls
      : data.imageUrl
        ? [data.imageUrl]
        : [];
    const thumbUrls: string[] = data.imageThumbs ?? [];

    await db.collection("vendorProducts").doc(pid).update({
      status: "deleted",
      deletedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: "تم حذف المنتج" });

    // Fire-and-forget: clean up Storage images after successful Firestore update.
    // Reference-check prevents deleting images shared between products (hash dedup).
    if (fullUrls.length > 0 || thumbUrls.length > 0) {
      (async () => {
        for (const url of fullUrls) {
          if (!url.startsWith("https://firebasestorage.googleapis.com/")) continue;
          try {
            const refSnap = await db!
              .collection("vendorProducts")
              .where("imageUrls", "array-contains", url)
              .limit(1)
              .get();
            if (refSnap.empty) {
              await deleteFromFirebaseStorage(url);
              console.info("[Storage] ✓ delete success (product deleted full):", pid);
            }
          } catch (err: any) {
            console.warn("[Storage] ✗ delete failure (product deleted full):", err?.message);
          }
        }
        for (const thumbUrl of thumbUrls) {
          if (!thumbUrl.startsWith("https://firebasestorage.googleapis.com/")) continue;
          try {
            const thumbRefSnap = await db!
              .collection("vendorProducts")
              .where("imageThumbs", "array-contains", thumbUrl)
              .limit(1)
              .get();
            if (thumbRefSnap.empty) {
              await deleteFromFirebaseStorage(thumbUrl);
              console.info("[Storage] ✓ delete success (product deleted thumb):", pid);
            }
          } catch (err: any) {
            console.warn("[Storage] ✗ delete failure (product deleted thumb):", err?.message);
          }
        }
      })().catch(() => {});
    }
  } catch (err) {
    console.error("delete product:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── POST /api/vendor/push-token ─────────────────────────────────────────────
router.post("/api/vendor/push-token", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const { pushToken } = req.body;

    if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
      return res.status(400).json({ error: "رمز إشعار غير صالح" });
    }

    await db.collection("vendors").doc(vid).update({ pushToken, pushTokenUpdatedAt: new Date().toISOString() });
    res.json({ success: true });
  } catch (err) {
    console.error("vendor push-token:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── GET /api/vendor/notifications ───────────────────────────────────────────
router.get("/api/vendor/notifications", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    // H-23: unordered, so past 50 notifications in a store's lifetime this returned an
    // arbitrary fixed 50 — the same ones on every load. "Your store has been approved"
    // could simply never appear. createdAt is an ISO-8601 UTC string on every one of the
    // three writers, so lexical order is chronological order.
    const snap = await db.collection("vendorNotifications")
      .where("vendorId", "==", vid)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const notifications = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    res.json({ notifications });
  } catch (err) {
    console.error("notifications:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── PUT /api/vendor/notifications/mark-read ─────────────────────────────
router.put("/api/vendor/notifications/mark-read", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const { ids } = req.body as { ids?: unknown };

    if (ids !== undefined && (!Array.isArray(ids) || ids.some((x) => typeof x !== "string"))) {
      return res.status(400).json({ error: "ids يجب أن تكون مصفوفة من النصوص" });
    }

    const validIds = ids as string[] | undefined;
    const col = db.collection("vendorNotifications");
    const batch = db.batch();

    if (validIds && validIds.length > 0) {
      const fetches = await Promise.all(validIds.map((id) => col.doc(id).get()));
      fetches.forEach((doc) => {
        if (doc.exists) {
          const data = doc.data() as any;
          if (data.vendorId === vid && data.status === "unread") {
            batch.update(doc.ref, { status: "read" });
          }
        }
      });
    } else {
      const snap = await col
        .where("vendorId", "==", vid)
        .where("status", "==", "unread")
        .limit(500)
        .get();
      snap.docs.forEach((doc) => batch.update(doc.ref, { status: "read" }));
    }

    await batch.commit();
    res.json({ success: true });
  } catch (err) {
    console.error("mark-read:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── GET /api/vendor/orders ───────────────────────────────────────────────────
// Returns orders that contain this vendor's products, identified in two ways:
//  1. Top-level vendorId (set during restaurant order creation)
//  2. Item-level product ownership (productId resolves to a product owned by this vendor)
router.get("/api/vendor/orders", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;

    // 1. Get all product IDs owned by this vendor (includes all statuses)
    const productsSnap = await db.collection("vendorProducts")
      .where("vendorId", "==", vid)
      .get();
    const vendorProductIds = new Set<string>(
      productsSnap.docs.map((d) => d.id)
    );

    // 2. Fetch the most recent orders by top-level vendorId (restaurant detection flow).
    //
    // H-22: this had .limit(200) with no .orderBy(), so Firestore returned the first
    // 200 documents by DOCUMENT ID. Order ids come from .add() and are random, so the
    // window was neither the oldest nor the newest 200 — it was 200 arbitrary orders,
    // and the same 200 on every load. Once a store passed 200 orders in its lifetime,
    // a new order's chance of appearing on its dashboard fell to roughly 200/N, and
    // the store simply never saw it. The in-memory sort at the end of this handler hid
    // the defect by making a wrong SET look perfectly ordered.
    //
    // The composite index this needs (vendorId ASC, createdAt DESC) was already
    // deployed in firestore.indexes.json and unused.
    const byVendorIdSnap = await db.collection("orders")
      .where("vendorId", "==", vid)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    // 3. Orders that carry this vendor only inside items[].productId — the shape no
    //    where() on the old schema could reach.
    //
    // H-34 (SWITCHED): this used to read the newest 300 orders PLATFORM-WIDE and
    // filter them in JS. Past 300 platform orders a store's real orders fell out of
    // the window and its revenue shrank month after month. `vendorIds` is the
    // denormalised union of the top-level vendorId and every item's owner, so the
    // same set is now reachable with a scoped query — and the window is 300 of THIS
    // vendor's orders instead of 300 of everyone's.
    //
    // Prerequisites, both satisfied before this switched: the
    // orders/vendorIds CONTAINS + createdAt DESC index is READY, and
    // scripts/backfill-order-vendor-ids.mjs reports "would change: 0".
    const recentOrdersSnap = await db.collection("orders")
      .where("vendorIds", "array-contains", vid)
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    // Merge into a map keyed by order ID to deduplicate
    const ordersMap = new Map<string, any>();

    for (const doc of byVendorIdSnap.docs) {
      ordersMap.set(doc.id, { id: doc.id, ...doc.data() });
    }

    if (vendorProductIds.size > 0) {
      for (const doc of recentOrdersSnap.docs) {
        if (ordersMap.has(doc.id)) continue; // already included
        const data = doc.data() as any;
        const items: any[] = Array.isArray(data.items) ? data.items : [];
        const hasVendorItem = items.some(
          (item: any) => item.productId && vendorProductIds.has(item.productId)
        );
        if (hasVendorItem) {
          ordersMap.set(doc.id, { id: doc.id, ...data });
        }
      }
    }

    // 4. For each order, filter items to vendor's products and compute vendor subtotal
    const toIso = (val: any): string => {
      if (!val) return "";
      if (typeof val === "string") return val;
      return val.toDate?.()?.toISOString?.() ?? "";
    };

    // Build productId → imageUrl map from this vendor's products
    const productImageMap = new Map<string, string>();
    for (const doc of productsSnap.docs) {
      const d = doc.data() as any;
      const url = d.imageUrl || (Array.isArray(d.imageUrls) && d.imageUrls[0]) || "";
      if (url) productImageMap.set(doc.id, url);
    }

    const serialized = Array.from(ordersMap.values())
      .map((o: any) => {
        const allItems: any[] = Array.isArray(o.items) ? o.items : [];

        // Determine vendor-owned items
        let vendorItems: any[] = [];
        if (vendorProductIds.size > 0) {
          vendorItems = allItems.filter(
            (item: any) => item.productId && vendorProductIds.has(item.productId)
          );
        }
        // For orders matched via top-level vendorId (restaurant flow), all items may be restaurant items;
        // fall back to full item list if none matched by productId
        if (vendorItems.length === 0 && o.vendorId === vid) {
          vendorItems = allItems;
        }

        // Enrich items with product images
        vendorItems = vendorItems.map((item: any) => ({
          ...item,
          imageUrl: item.imageUrl || (item.productId ? (productImageMap.get(item.productId) || "") : ""),
        }));

        const vendorSubtotal = vendorItems.reduce(
          (sum: number, item: any) =>
            sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
          0
        );

        return {
          ...o,
          items: vendorItems,
          vendorSubtotal,
          driverName: o.driverName || "",
          driverPhone: o.driverPhone || "",
          createdAt: toIso(o.createdAt),
          updatedAt: toIso(o.updatedAt),
          vendorStatusAt_confirmed: toIso(o.vendorStatusAt_confirmed),
          vendorStatusAt_preparing: toIso(o.vendorStatusAt_preparing),
          vendorStatusAt_ready: toIso(o.vendorStatusAt_ready),
          vendorStatusAt_cancelled: toIso(o.vendorStatusAt_cancelled),
        };
      })
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100); // cap at 100 results

    res.json({ orders: serialized, total: serialized.length });
  } catch (err) {
    console.error("vendor orders:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── GET /api/vendor/stats ────────────────────────────────────────────────────
// Returns aggregated sales stats for the authenticated vendor:
//  - totalOrders: count of all non-cancelled orders that contain vendor items
//  - totalRevenue: sum of vendorSubtotal for delivered orders
//  - pendingOrders: count of orders with status "pending"
router.get("/api/vendor/stats", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;

    // Get all product IDs owned by this vendor
    const productsSnap = await db.collection("vendorProducts")
      .where("vendorId", "==", vid)
      .get();
    const vendorProductIds = new Set<string>(productsSnap.docs.map((d) => d.id));

    // Fetch ALL orders by top-level vendorId (no limit — needed for accurate totals)
    const byVendorIdSnap = await db.collection("orders")
      .where("vendorId", "==", vid)
      .get();

    // Item-level ownership pass: some legacy orders carry the vendor only inside
    // items[].productId, not as a top-level vendorId, so they cannot be found with a
    // where() query. This used to read the ENTIRE orders collection on every load of
    // the vendor stats screen — O(all orders) Firestore reads per request, which
    // degrades and bills badly as the platform grows. Bounded to the most recent
    // ORDER_SCAN_LIMIT orders (newest first): older orders predate the marketplace
    // flow and are already covered by the vendorId query above.
    // H-34 (SWITCHED): the window is now 2000 of THIS vendor's orders rather than
    // 2000 of the platform's, so a busy platform can no longer push a store's own
    // orders out of its stats.
    const ORDER_SCAN_LIMIT = 2000;
    const allOrdersSnap = vendorProductIds.size > 0
      ? await db.collection("orders")
          .where("vendorIds", "array-contains", vid)
          .orderBy("createdAt", "desc")
          .limit(ORDER_SCAN_LIMIT)
          .get()
      : { docs: [] as any[] };

    const ordersMap = new Map<string, any>();
    for (const doc of byVendorIdSnap.docs) {
      ordersMap.set(doc.id, { id: doc.id, ...doc.data() });
    }
    for (const doc of allOrdersSnap.docs) {
      if (ordersMap.has(doc.id)) continue;
      const data = doc.data() as any;
      const items: any[] = Array.isArray(data.items) ? data.items : [];
      const hasVendorItem = items.some(
        (item: any) => item.productId && vendorProductIds.has(item.productId)
      );
      if (hasVendorItem) ordersMap.set(doc.id, { id: doc.id, ...data });
    }

    let totalOrders = 0;
    let pendingOrders = 0;
    let preparingOrders = 0;
    let readyOrders = 0;
    let totalRevenue = 0;

    for (const o of ordersMap.values()) {
      const status: string = o.status || "";
      if (status === "cancelled") continue;

      const allItems: any[] = Array.isArray(o.items) ? o.items : [];
      let vendorItems: any[] = [];
      if (vendorProductIds.size > 0) {
        vendorItems = allItems.filter(
          (item: any) => item.productId && vendorProductIds.has(item.productId)
        );
      }
      if (vendorItems.length === 0 && o.vendorId === vid) {
        vendorItems = allItems;
      }

      const subtotal = vendorItems.reduce(
        (sum: number, item: any) =>
          sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
        0
      );

      totalOrders += 1;
      if (status === "pending") pendingOrders += 1;
      if (status === "confirmed" || status === "preparing") preparingOrders += 1;
      if (status === "ready") readyOrders += 1;
      if (status === "delivered") totalRevenue += subtotal;
    }

    // Get vendor rating
    const vendorDoc = await db.collection("vendors").doc(vid).get();
    const vendorData = vendorDoc.exists ? (vendorDoc.data() as any) : {};
    const rating: number | null = vendorData.rating ?? null;
    const ratingCount: number = vendorData.ratingCount ?? 0;

    res.json({ totalOrders, pendingOrders, preparingOrders, readyOrders, totalRevenue, rating, ratingCount });
  } catch (err) {
    console.error("vendor stats:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── PATCH /api/vendor/orders/:id/status ─────────────────────────────────────
// Vendor updates their order status (accept, preparing, ready, cancel)
router.patch("/api/vendor/orders/:id/status", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const vid = (req as any).vendorId as string;
    const orderId = req.params.id as string;
    const { status, estimatedMinutes } = req.body as { status: string; estimatedMinutes?: number };

    // Allowed transitions from vendor side
    const ALLOWED: Record<string, string[]> = {
      pending:    ["confirmed", "cancelled"],
      confirmed:  ["preparing", "cancelled"],
      preparing:  ["ready"],
    };

    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ error: "الطلب غير موجود" });

    const order = orderDoc.data() as any;
    const current: string = order.status ?? "pending";

    // Cheap pre-check so an illegal transition is rejected before the vendorProducts
    // lookups below. It is NOT the authority — the transaction further down re-reads
    // the status and re-applies this same table (H-20).
    if (!(ALLOWED[current] ?? []).includes(status)) {
      return res.status(400).json({ error: `لا يمكن الانتقال من "${current}" إلى "${status}"` });
    }

    // Verify this order belongs to this vendor (vendorId field or has vendor products)
    const belongsViaId = order.vendorId === vid;
    let belongsViaProduct = false;
    if (!belongsViaId) {
      const productIds: string[] = (order.items || []).map((i: any) => i.productId).filter(Boolean);
      for (const pid of productIds) {
        const pDoc = await db.collection("vendorProducts").doc(pid).get();
        if (pDoc.exists && (pDoc.data() as any).vendorId === vid) { belongsViaProduct = true; break; }
      }
    }
    if (!belongsViaId && !belongsViaProduct) {
      return res.status(403).json({ error: "ليس لديك صلاحية تعديل هذا الطلب" });
    }

    // Validate estimatedMinutes if provided (must be a positive integer ≤ 180)
    const validatedEta =
      status === "confirmed" &&
      typeof estimatedMinutes === "number" &&
      Number.isInteger(estimatedMinutes) &&
      estimatedMinutes > 0 &&
      estimatedMinutes <= 180
        ? estimatedMinutes
        : undefined;

    // ── Atomic transition (H-20) ────────────────────────────────────────────
    // The check above ran against a snapshot taken before the ownership lookups, so on
    // its own it cannot stop two dashboards of the same store from both passing it and
    // both writing: last write wins, arbitrarily. That produced orders left "cancelled"
    // after "confirmed" had already dispatched a driver to the store, and orders
    // "confirmed" back out of a cancellation the customer was already told about.
    //
    // Re-read the status and re-apply the SAME table inside one transaction, so exactly
    // one concurrent writer observes the pre-state. The vendor's ALLOWED table is kept
    // verbatim on purpose: it is deliberately narrower than the canonical
    // ORDER_TRANSITIONS in firebase.ts (a store may take preparing → ready, but not
    // → delivered or → cancelled). Routing this through updateOrderStatus() instead
    // would hand the store those transitions, and would still need a second,
    // unserialised write for vendorStatusAt_*/estimatedMinutes.
    const updatedAt = new Date().toISOString();
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return { ok: false as const, code: 404 as const, current };
      const live: string = (snap.data() as any)?.status ?? "pending";
      if (!(ALLOWED[live] ?? []).includes(status)) {
        return { ok: false as const, code: 400 as const, current: live };
      }
      const updateData: Record<string, any> = { status, updatedAt, [`vendorStatusAt_${status}`]: updatedAt };
      if (validatedEta) {
        updateData.estimatedMinutes = validatedEta;
      }
      tx.update(orderRef, updateData);
      return { ok: true as const, code: 200 as const, current: live };
    });

    // Same responses as before, so nothing downstream changes shape — the loser of a
    // race now gets the transition error it would have got had it arrived second.
    if (!outcome.ok) {
      if (outcome.code === 404) return res.status(404).json({ error: "الطلب غير موجود" });
      return res.status(400).json({ error: `لا يمكن الانتقال من "${outcome.current}" إلى "${status}"` });
    }

    // Real-time: broadcast the status change so customer/driver/admin update instantly
    // (routes.ts forwards to the order room + broadcasts orders:changed). Additive only.
    orderEvents.emit("order:status", { orderId, status });

    // Trigger immediate driver-assignment attempt when a vendor confirms an order.
    // Without this, vendor-confirmed orders (the primary real-world flow) only got
    // picked up by the 30-second background watchdog in routes.ts — up to 30s of
    // needless delay on every single order. Admin-confirmed orders already fired
    // immediately; this brings the vendor path to parity.
    if (status === "confirmed") {
      orderEvents.emit("confirmed");
    }

    // Send push notification to customer
    const customerPhone: string | undefined = order.phoneNumber;
    if (customerPhone) {
      getUserPushToken(customerPhone)
        .then((pushToken) => {
          if (pushToken) {
            sendPushNotification(pushToken, status, orderId, validatedEta).catch(() => {});
          }
        })
        .catch(() => {});
    }

    // When order is "ready", notify admin to assign a driver
    if (status === "ready") {
      const vendorName: string = order.vendorName || "المتجر";
      getAdminPushToken().then(adminToken => {
        if (adminToken) {
          sendAdminOrderReadyNotification(adminToken, orderId, vendorName).catch(() => {});
        }
      }).catch(() => {});
    }

    res.json({ success: true, status, updatedAt, estimatedMinutes: validatedEta });
  } catch (err) {
    console.error("vendor order status:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN endpoints for vendor partner management
// ═══════════════════════════════════════════════════════════════════════════

function requireAdmin(req: Request, res: Response, next: express.NextFunction) {
  if (!isValidSession(req)) return res.status(401).json({ error: "غير مصرح" });
  next();
}

// GET /api/admin/vendor-partners — list all vendors
router.get("/api/admin/vendor-partners", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const { status } = req.query;
    let q = db.collection("vendors") as any;
    if (status) q = q.where("status", "==", status);
    const snap = await q.get();
    const vendors = snap.docs
      .map((d: any) => {
        const { passwordHash: _pw, ...safe } = d.data() as any;
        return safe;
      })
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ vendors, total: vendors.length });
  } catch (err) {
    console.error("admin vendor-partners:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// PUT /api/admin/vendor-partners/:id/status — approve/reject/suspend
router.put("/api/admin/vendor-partners/:id/status", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const id = req.params.id as string;
    const { status, reason } = req.body;

    if (!["active", "rejected", "suspended"].includes(status)) {
      return res.status(400).json({ error: "حالة غير صالحة" });
    }

    const doc = await db.collection("vendors").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "المتجر غير موجود" });

    const vendor = doc.data() as any;
    const now = new Date().toISOString();

    await db.collection("vendors").doc(id).update({
      status,
      ...(status === "active" && { approvedAt: now }),
      ...(status === "rejected" && { rejectedAt: now, rejectionReason: reason || "" }),
      updatedAt: now,
    });

    const notifMsg =
      status === "active"
        ? `تمت الموافقة على متجرك "${vendor.storeName}" — يمكنك الآن إضافة منتجاتك`
        : status === "rejected"
        ? `تم رفض طلب متجرك "${vendor.storeName}". السبب: ${reason || "غير محدد"}`
        : `تم تعليق متجرك "${vendor.storeName}". تواصل مع الإدارة.`;

    await db.collection("vendorNotifications").add({
      vendorId: id,
      type: `vendor_${status}`,
      title: status === "active" ? "تمت الموافقة على متجرك" : status === "rejected" ? "تم رفض طلبك" : "تم تعليق حسابك",
      message: notifMsg,
      status: "unread",
      createdAt: now,
    });

    const vendorPushToken = vendor.pushToken as string | undefined;
    if (vendorPushToken) {
      const unreadSnap = await db.collection("vendorNotifications")
        .where("vendorId", "==", id)
        .where("status", "==", "unread")
        .count()
        .get();
      const unreadCount: number = unreadSnap.data().count;
      sendVendorStatusNotification(
        vendorPushToken,
        status as "active" | "rejected" | "suspended",
        vendor.storeName,
        reason,
        unreadCount
      ).catch((err) => console.error("[PUSH] vendor status notification failed:", err));
    }

    res.json({ success: true, message: "تم تحديث حالة المتجر" });
  } catch (err) {
    console.error("update vendor status:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /api/admin/vendor-products — list products (pending by default)
router.get("/api/admin/vendor-products", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const { status } = req.query;

    let query: any = db.collection("vendorProducts");
    if (status && status !== "all") {
      query = db.collection("vendorProducts").where("status", "==", status);
    }

    const snap = await query.get();
    const products = snap.docs
      .map((d: any) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ products, total: products.length });
  } catch (err) {
    console.error("admin vendor-products:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// PATCH /api/admin/vendor-products/:pid/toggle-active — enable / disable a product
router.patch("/api/admin/vendor-products/:pid/toggle-active", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const pid = req.params.pid as string;
    const doc = await db.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive يجب أن يكون boolean" });
    }
    await db.collection("vendorProducts").doc(pid).update({
      isActive,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true, isActive });
  } catch (err) {
    console.error("toggle product active:", err);
    res.status(500).json({ error: "فشلت العملية" });
  }
});

// POST /api/admin/vendor-products — admin creates a product for a store (#8).
// JSON body (image is an already-uploaded URL from /admin/upload-image). Admin-
// created products are immediately live (status "approved", isActive true).
router.post("/api/admin/vendor-products", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const { vendorId, name, price, category, description, stock, unit, imageUrl } = req.body;
    if (!vendorId || !name || String(name).trim() === "") {
      return res.status(400).json({ error: "الحقول المطلوبة: المتجر والاسم" });
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: "السعر غير صالح" });
    }
    const vDoc = await db.collection("vendors").doc(String(vendorId)).get();
    if (!vDoc.exists) return res.status(404).json({ error: "المتجر غير موجود" });
    const v = vDoc.data() as any;
    const pid = productId();
    const now = new Date().toISOString();
    const img = String(imageUrl || "");
    await db.collection("vendorProducts").doc(pid).set({
      id: pid,
      vendorId: String(vendorId),
      vendorName: v.storeName || v.name || "",
      storeName: v.storeName || v.name || "",
      vendorPhone: v.phoneNumber || "",
      name: String(name).trim(),
      description: description ? String(description) : "",
      price: priceNum,
      category: category ? String(category) : "",
      stock: normaliseStock(stock),
      unit: unit ? String(unit) : "قطعة",
      imageUrl: img,
      imageUrls: img ? [img] : [],
      status: "approved",
      isActive: true,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
      createdByAdmin: true,
    });
    res.json({ success: true, id: pid });
  } catch (err) {
    console.error("admin create vendor product:", err);
    res.status(500).json({ error: "فشل إنشاء المنتج" });
  }
});

// PUT /api/admin/vendor-products/:pid — admin edits a product's details (#8).
router.put("/api/admin/vendor-products/:pid", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const pid = req.params.pid as string;
    const doc = await db.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
    const b = req.body as Record<string, any>;
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (b.name !== undefined) {
      if (!String(b.name).trim()) return res.status(400).json({ error: "الاسم مطلوب" });
      updates.name = String(b.name).trim();
    }
    if (b.price !== undefined) {
      const p = parseFloat(b.price);
      if (isNaN(p) || p <= 0) return res.status(400).json({ error: "السعر غير صالح" });
      updates.price = p;
    }
    if (b.category !== undefined) updates.category = String(b.category);
    if (b.description !== undefined) updates.description = String(b.description);
    if (b.stock !== undefined) updates.stock = parseInt(b.stock) || 0;
    if (b.unit !== undefined) updates.unit = String(b.unit || "قطعة");
    if (b.imageUrl !== undefined) {
      const img = String(b.imageUrl || "");
      updates.imageUrl = img;
      updates.imageUrls = img ? [img] : [];
    }
    await db.collection("vendorProducts").doc(pid).update(updates);
    res.json({ success: true, id: pid });
  } catch (err) {
    console.error("admin edit vendor product:", err);
    res.status(500).json({ error: "فشل تعديل المنتج" });
  }
});

// POST /api/admin/vendor-products/:id/approve
router.post("/api/admin/vendor-products/:pid/approve", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const pid = req.params.pid as string;
    const now = new Date().toISOString();

    const doc = await db.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
    const product = doc.data() as any;

    await db.collection("vendorProducts").doc(pid).update({
      status: "approved",
      approvedAt: now,
    });

    const { FieldValue: FV } = await import("firebase-admin/firestore");
    await db.collection("vendors").doc(product.vendorId).update({
      totalProducts: FV.increment(1),
      updatedAt: now,
    }).catch(() => {});

    await db.collection("vendorNotifications").add({
      vendorId: product.vendorId,
      type: "product_approved",
      title: "تمت الموافقة على منتجك",
      message: `منتج "${product.name}" تمت الموافقة عليه وهو متاح للعملاء الآن`,
      status: "unread",
      createdAt: now,
    });

    const [vendorDoc, unreadApprovedSnap] = await Promise.all([
      db.collection("vendors").doc(product.vendorId).get(),
      db.collection("vendorNotifications")
        .where("vendorId", "==", product.vendorId)
        .where("status", "==", "unread")
        .count()
        .get(),
    ]);
    const vendorPushToken = vendorDoc.exists ? (vendorDoc.data() as any)?.pushToken as string | undefined : undefined;
    if (vendorPushToken) {
      const unreadCount: number = unreadApprovedSnap.data().count;
      sendVendorProductNotification(vendorPushToken, "approved", product.name, undefined, unreadCount).catch((err) =>
        console.error("[PUSH] vendor product approved notification failed:", err)
      );
    }

    res.json({ success: true, message: "تمت الموافقة على المنتج" });
  } catch (err) {
    console.error("approve product:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// POST /api/admin/vendor-products/:id/reject
router.post("/api/admin/vendor-products/:pid/reject", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const pid = req.params.pid as string;
    const { reason } = req.body;
    const now = new Date().toISOString();

    const doc = await db.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
    const product = doc.data() as any;

    await db.collection("vendorProducts").doc(pid).update({
      status: "rejected",
      rejectedAt: now,
      rejectionReason: reason || "",
    });

    await db.collection("vendorNotifications").add({
      vendorId: product.vendorId,
      type: "product_rejected",
      title: "تم رفض منتجك",
      message: `منتج "${product.name}" تم رفضه. السبب: ${reason || "غير محدد"}`,
      status: "unread",
      createdAt: now,
    });

    const [vendorDocRej, unreadRejectedSnap] = await Promise.all([
      db.collection("vendors").doc(product.vendorId).get(),
      db.collection("vendorNotifications")
        .where("vendorId", "==", product.vendorId)
        .where("status", "==", "unread")
        .count()
        .get(),
    ]);
    const vendorPushToken = vendorDocRej.exists ? (vendorDocRej.data() as any)?.pushToken as string | undefined : undefined;
    if (vendorPushToken) {
      const unreadCount: number = unreadRejectedSnap.data().count;
      sendVendorProductNotification(vendorPushToken, "rejected", product.name, reason, unreadCount).catch((err) =>
        console.error("[PUSH] vendor product rejected notification failed:", err)
      );
    }

    res.json({ success: true, message: "تم رفض المنتج" });
  } catch (err) {
    console.error("reject product:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// POST /api/admin/vendors/:vendorId/products — admin adds a product on behalf of a vendor
router.post("/api/admin/vendors/:vendorId/products", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vendorId = req.params.vendorId as string;
    const { name, price, category, description, stock, unit, imageUrl } = req.body as Record<string, string>;

    if (!name || !price || !category) {
      return res.status(400).json({ error: "الاسم والسعر والفئة مطلوبة" });
    }
    // H-05: same truthiness gap as the vendor paths — validate the number itself.
    const priceNum = parseProductPrice(price);
    if (priceNum === null) {
      return res.status(400).json({ error: "السعر غير صالح" });
    }

    const vendorDoc = await db.collection("vendors").doc(vendorId).get();
    if (!vendorDoc.exists) return res.status(404).json({ error: "التاجر غير موجود" });
    const vendor = vendorDoc.data() as any;

    const pid = productId();
    const now = new Date().toISOString();
    const imageUrls = imageUrl ? [imageUrl] : [];

    await db.collection("vendorProducts").doc(pid).set({
      id: pid,
      vendorId,
      vendorName: vendor.storeName,
      storeName: vendor.storeName,
      vendorPhone: vendor.phoneNumber,
      name: name.trim(),
      description: description?.trim() || "",
      price: priceNum,
      category,
      stock: parseInt(stock) || 0,
      unit: unit || "قطعة",
      imageUrl: imageUrl || null,
      imageUrls,
      status: "approved",
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    try {
      const { FieldValue: FV } = await import("firebase-admin/firestore");
      await db.collection("vendors").doc(vendorId).update({ totalProducts: FV.increment(1), updatedAt: now });
    } catch {}

    res.status(201).json({ success: true, id: pid });
  } catch (err) {
    console.error("admin add vendor product:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// DELETE /api/admin/vendor-products/:pid/image — admin removes one image from a product
router.delete("/api/admin/vendor-products/:pid/image", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const pid = req.params.pid as string;
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl مطلوب" });

    const doc = await db.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
    const product = doc.data() as any;

    const currentUrls: string[] = product.imageUrls?.length
      ? product.imageUrls
      : (product.imageUrl ? [product.imageUrl] : []);
    const currentThumbs: string[] = product.imageThumbs || [];
    const urlToThumb = new Map<string, string>(
      (product.imageUrls || []).map((u: string, i: number) => [u, currentThumbs[i]])
    );

    const newUrls = currentUrls.filter((u: string) => u !== imageUrl);
    const removedThumb = urlToThumb.get(imageUrl);
    const newThumbs = newUrls.map((u: string) => urlToThumb.get(u) || u).filter(Boolean);

    await db.collection("vendorProducts").doc(pid).update({
      imageUrls: newUrls,
      imageUrl: newUrls[0] || null,
      imageThumbs: newThumbs,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true });

    // Fire-and-forget: cleanup Storage
    (async () => {
      if (imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
        try {
          const refSnap = await db!.collection("vendorProducts")
            .where("imageUrls", "array-contains", imageUrl).limit(1).get();
          if (refSnap.empty) await deleteFromFirebaseStorage(imageUrl);
        } catch (err: any) {
          console.warn("[Storage] admin delete image:", err?.message);
        }
      }
      if (removedThumb?.startsWith("https://firebasestorage.googleapis.com/")) {
        try {
          const thumbRefSnap = await db!.collection("vendorProducts")
            .where("imageThumbs", "array-contains", removedThumb).limit(1).get();
          if (thumbRefSnap.empty) await deleteFromFirebaseStorage(removedThumb);
        } catch (err: any) {
          console.warn("[Storage] admin delete thumb:", err?.message);
        }
      }
    })().catch(() => {});
  } catch (err) {
    console.error("admin delete product image:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /api/admin/vendor-stats
router.get("/api/admin/vendor-stats", requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const [pendingVendors, activeVendors, pendingProducts, approvedProducts] = await Promise.all([
      db.collection("vendors").where("status", "==", "pending").count().get(),
      db.collection("vendors").where("status", "==", "active").count().get(),
      db.collection("vendorProducts").where("status", "==", "pending").count().get(),
      db.collection("vendorProducts").where("status", "==", "approved").count().get(),
    ]);

    res.json({
      pendingVendors: pendingVendors.data().count,
      activeVendors: activeVendors.data().count,
      pendingProducts: pendingProducts.data().count,
      approvedProducts: approvedProducts.data().count,
    });
  } catch (err) {
    console.error("vendor stats:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── GET /api/vendor/wallet — earnings summary ────────────────────────────────
router.get("/api/vendor/wallet", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const vid = (req as any).vendorId as string;
    const period = (req.query.period as string) || "month"; // today|week|month|all

    // 1. Get all product IDs owned by this vendor
    const productsSnap = await db.collection("vendorProducts")
      .where("vendorId", "==", vid)
      .get();
    const vendorProductIds = new Set<string>(productsSnap.docs.map((d) => d.id));

    // 2. Date range
    const now = new Date();
    let startDate: Date | null = null;
    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // 3. This vendor's recent orders (limit 1000).
    //
    // H-34 (SWITCHED): a platform-wide scan of the newest 1000 orders, filtered in
    // JS. Unlike /api/vendor/orders and /api/vendor/stats, this endpoint had NO
    // top-level vendorId query beside it — the scan was its only source — so on a
    // busy platform the store's wallet revenue silently shrank. Now scoped.
    //
    // The union with the vendorId query is deliberate belt-and-braces: an order
    // written by a server build that predates the creation-time vendorIds write
    // would be missing from the array-contains result, and a MISSING order here
    // reads as lost revenue. Both queries are indexed and deduplicated below.
    const [containsSnap, byVendorIdSnap] = await Promise.all([
      db.collection("orders")
        .where("vendorIds", "array-contains", vid)
        .orderBy("createdAt", "desc")
        .limit(1000)
        .get(),
      db.collection("orders")
        .where("vendorId", "==", vid)
        .orderBy("createdAt", "desc")
        .limit(1000)
        .get(),
    ]);
    const snap = { docs: [...new Map(
      [...containsSnap.docs, ...byVendorIdSnap.docs].map((d) => [d.id, d]),
    ).values()] };

    const completedStatuses = new Set(["delivered", "picked_up", "delivering"]);

    type SaleRecord = { id: string; date: string; subtotal: number; status: string; customerPhone: string; itemCount: number };
    const vendorOrders: SaleRecord[] = [];

    for (const doc of snap.docs) {
      const data = doc.data() as any;
      if (!completedStatuses.has(data.status)) continue;

      const createdAt: Date = data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? 0);
      if (startDate && createdAt < startDate) continue;

      const items: any[] = Array.isArray(data.items) ? data.items : [];
      let vendorItems = items.filter((i: any) => i.productId && vendorProductIds.has(i.productId));
      if (vendorItems.length === 0 && data.vendorId === vid) vendorItems = items;
      if (vendorItems.length === 0) continue;

      const subtotal = vendorItems.reduce(
        (sum: number, i: any) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1),
        0
      );

      vendorOrders.push({
        id: doc.id,
        date: createdAt.toISOString(),
        subtotal,
        status: data.status,
        customerPhone: data.phoneNumber || "",
        itemCount: vendorItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0),
      });
    }

    const totalRevenue = vendorOrders.reduce((s, o) => s + o.subtotal, 0);
    const totalOrders = vendorOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Daily breakdown (last 14 days)
    const dailyMap: Record<string, number> = {};
    vendorOrders.forEach((o) => {
      const day = o.date.substring(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + o.subtotal;
    });
    const dailySales = Object.entries(dailyMap)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);

    // Recent 20 sales, each annotated with the vendor's net earning after commission.
    //
    // NOTE: this logic previously lived on a DUPLICATE `GET /api/vendor/wallet`
    // handler in routes.ts. Because index.ts mounts this vendorRouter BEFORE
    // registerRoutes(), Express matched this handler first and that copy was dead
    // code — so the client (VendorWalletScreen) rendered `sale.netEarning`, which
    // the live response never contained. Keep the commission logic HERE, on the
    // route that actually serves traffic.
    const vendorDoc = await db.collection("vendors").doc(vid).get();
    // H-06: this defaulted to 0 while the settlement engine defaults to 10, so a
    // store with no rate of its own saw "0% commission" on this screen and was then
    // billed 10% at settlement. Same resolver, same default, both sides.
    const commissionRate = commissionPercentOf(
      vendorDoc.exists ? (vendorDoc.data() as any)?.commissionPercent : undefined,
    );

    const recentSales = vendorOrders.slice(0, 20).map((o) => ({
      ...o,
      commissionRate,
      netEarning: Math.round(o.subtotal * (1 - commissionRate / 100)),
    }));

    res.json({ totalRevenue, totalOrders, avgOrderValue, dailySales, recentSales, period, commissionRate });
  } catch (err) {
    console.error("vendor wallet:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC endpoints for customer-facing store browsing
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/stores — list active vendor stores, supports ?categoryId= and ?businessType= filters
router.get("/api/stores", async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const { businessType, categoryId, name } = req.query as {
      businessType?: string;
      categoryId?: string;
      name?: string;
    };

    // Backward-compat: map category IDs to businessType for stores without supportedCategories
    const BTYPE_FALLBACK: Record<string, string[]> = {
      "restaurants":           ["restaurant"],
      "pharmacy":              ["pharmacy"],
      "snacks-sweets":         ["bakery", "sweets", "supermarket"],
      "tea-coffee":            ["cafe", "bakery"],
      "flowers":               ["flowers"],
      "women-bags":            ["clothing"],
      "fruits-vegetables":     ["supermarket", "grocery"],
      "meat-poultry":          ["supermarket", "butcher"],
      "dairy-eggs":            ["supermarket", "dairy"],
      "cleaning-care":         ["supermarket", "cleaning"],
      "beverages":             ["supermarket", "bakery", "cafe"],
      "baby":                  ["supermarket", "pharmacy"],
    };

    const snap = await db.collection("vendors").where("status", "==", "active").get();

    const allDocs = snap.docs.map((d) => {
      const v = d.data() as any;
      return {
        id: v.id,
        storeName: v.storeName,
        businessType: v.businessType,
        address: v.address || "",
        bio: v.bio || "",
        totalProducts: v.totalProducts || 0,
        approvedAt: v.approvedAt || v.createdAt || "",
        profileImageUrl: v.profileImageUrl || "",
        coverImageUrl: v.coverImageUrl || "",
        rating: v.rating ?? null,
        ratingCount: v.ratingCount ?? 0,
        deliveryTime: v.deliveryTime || "30-45",
        deliveryPrice: v.deliveryPrice ?? 0,
        workingHours: v.workingHours || null,
        supportedCategories: Array.isArray(v.supportedCategories) ? v.supportedCategories : [],
        minOrder: v.minOrder ?? 0,
        hasDelivery: v.hasDelivery !== false,
        isOpen: v.isOpen ?? true,
        isPinned: v.isPinned ?? false,
        isFeatured: v.isFeatured ?? false,
        sortOrder: v.sortOrder ?? 999,
      };
    });

    const nameQuery = name ? name.trim().toLowerCase() : "";

    const stores = allDocs
      .filter((s) => {
        if (categoryId) {
          const sc: string[] = s.supportedCategories;
          if (sc.length > 0) {
            // Use explicit supportedCategories list
            return sc.includes(categoryId);
          }
          // Backward compat: no supportedCategories → check businessType mapping
          const fallbackTypes = BTYPE_FALLBACK[categoryId];
          if (fallbackTypes) return fallbackTypes.includes(s.businessType || "");
          return false; // Not mapped — don't show
        }
        if (businessType) return s.businessType === businessType;
        return true;
      })
      .filter((s) => (nameQuery ? (s.storeName || "").toLowerCase().includes(nameQuery) : true))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (b.approvedAt as string).localeCompare(a.approvedAt as string);
      });

    res.json({ stores, total: stores.length });
  } catch (err) {
    console.error("public stores:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /api/stores/products-preview — first 8 approved products per active store (public)
router.get("/api/stores/products-preview", async (_req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const snap = await db.collection("vendorProducts")
      .where("status", "==", "approved")
      .get();

    const grouped: Record<string, any[]> = {};
    snap.docs.forEach((d) => {
      const p = d.data() as any;
      const vid: string = p.vendorId;
      if (!vid) return;
      if (!grouped[vid]) grouped[vid] = [];
      if (grouped[vid].length < 8) {
        const primaryUrl = p.imageUrl || "";
        const allUrls: string[] = (p.imageUrls && p.imageUrls.length > 0)
          ? p.imageUrls
          : (primaryUrl ? [primaryUrl] : []);
        grouped[vid].push({
          id: d.id,
          name: p.name,
          price: p.price,
          imageUrl: primaryUrl,
          imageUrls: allUrls,
          unit: p.unit || "قطعة",
          stock: p.stock ?? 0,
          vendorId: vid,
          storeName: p.storeName || "",
          description: p.description || "",
          category: p.category || "",
        });
      }
    });

    res.json({ preview: grouped });
  } catch (err) {
    console.error("products-preview:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /api/stores/:id/products — list approved products for a store (public)
router.get("/api/stores/:id/products", async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const { id } = req.params;

    const [storeDoc, productsSnap] = await Promise.all([
      db.collection("vendors").doc(id).get(),
      db.collection("vendorProducts")
        .where("vendorId", "==", id)
        .get(),
    ]);

    if (!storeDoc.exists || (storeDoc.data() as any).status !== "active") {
      return res.status(404).json({ error: "المتجر غير موجود أو غير نشط" });
    }

    const storeData = storeDoc.data() as any;
    const store = {
      id: storeData.id,
      storeName: storeData.storeName,
      businessType: storeData.businessType,
      address: storeData.address || "",
      bio: storeData.bio || "",
      profileImageUrl: storeData.profileImageUrl || "",
      coverImageUrl: storeData.coverImageUrl || "",
    };

    const products = productsSnap.docs
      .map((d) => {
        const p = d.data() as any;
        const primaryUrl = p.imageUrl || "";
        const allUrls: string[] = (p.imageUrls && p.imageUrls.length > 0)
          ? p.imageUrls
          : (primaryUrl ? [primaryUrl] : []);
        return {
          id: d.id,
          vendorId: p.vendorId,
          storeName: p.storeName,
          name: p.name,
          description: p.description || "",
          price: p.price,
          category: p.category,
          stock: p.stock || 0,
          unit: p.unit || "",
          imageUrl: primaryUrl,
          imageUrls: allUrls,
          status: p.status,
          approvedAt: p.approvedAt || p.createdAt || "",
        };
      })
      .filter((p: any) => p.status === "approved")
      .sort((a: any, b: any) => b.approvedAt.localeCompare(a.approvedAt));

    res.json({ store, products, total: products.length });
  } catch (err) {
    console.error("public store products:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});


// ── Vendor Analytics ─────────────────────────────────────────────────────────
router.get("/api/vendor/analytics", requireVendor, async (req, res) => {
  const db = getFirestore();
  if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
  const vid = (req as any).vendorId as string;

  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);

    const snap = await db.collection("orders")
      .where("vendorId", "==", vid)
      .where("status", "==", "delivered")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    let todayOrders = 0, todaySales = 0, weekOrders = 0, weekSales = 0;
    const productCount: Record<string, { name: string; count: number }> = {};

    for (const doc of snap.docs) {
      const order = doc.data();
      const createdAt: Date = order.createdAt?.toDate?.() ?? new Date(0);
      const total = (order.totalPrice ?? order.total ?? 0) as number;

      if (createdAt >= todayStart) { todayOrders++; todaySales += total; }
      if (createdAt >= weekStart) {
        weekOrders++; weekSales += total;
        for (const item of (order.items ?? []) as any[]) {
          const pid = item.productId || item.id;
          if (!pid) continue;
          if (!productCount[pid]) productCount[pid] = { name: item.name || "منتج", count: 0 };
          productCount[pid].count += (item.quantity ?? 1) as number;
        }
      }
    }

    const bestSellers = Object.values(productCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return res.json({ todayOrders, todaySales, weekOrders, weekSales, bestSellers });
  } catch (err: any) {
    console.error("vendor analytics error:", err);
    return res.status(500).json({ error: GENERIC_SERVER_ERROR });
  }
});

export default router;
