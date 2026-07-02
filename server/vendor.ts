import express from "express";
import type { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import sharp from "sharp";
import * as crypto from "crypto";
import * as path from "path";
import { getFirestore, getUserPushToken, getAdminPushToken, deleteFromFirebaseStorage } from "./firebase";
import { sendVendorStatusNotification, sendVendorProductNotification, sendPushNotification, sendAdminOrderReadyNotification } from "./pushNotifications";

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
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مدعوم. استخدم PNG أو JPEG فقط."));
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeVendorToken(vendorId: string): string {
  return jwt.sign({ vendorId, role: "vendor" }, JWT_SECRET, { expiresIn: "7d" });
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
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded.role === "vendor" ? decoded.vendorId : null;
  } catch {
    return null;
  }
}

function requireVendor(req: Request, res: Response, next: express.NextFunction) {
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
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== "vendor") return res.status(403).json({ error: "غير مصرح" });
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

async function processAndSaveImage(buffer: Buffer, _hash: string): Promise<string> {
  // Firebase Storage bucket is not provisioned for this project, so product
  // images are compressed and embedded directly as Base64 data URIs in
  // Firestore (same strategy used for banners/categories elsewhere in the app).
  const webpBuffer = await sharp(buffer)
    .resize(700, 700, { fit: "cover", position: "center" })
    .webp({ quality: 70 })
    .toBuffer();
  return `data:image/webp;base64,${webpBuffer.toString("base64")}`;
}

async function findDuplicateImage(hash: string): Promise<string | null> {
  const db = getFirestore();
  if (!db) return null;
  const snap = await db.collection("productImageHashes").doc(hash).get();
  if (snap.exists) return (snap.data() as any).imageUrl;
  return null;
}

async function saveImageHash(hash: string, imageUrl: string): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  await db.collection("productImageHashes").doc(hash).set({
    imageUrl,
    createdAt: new Date().toISOString(),
  });
}

// No-op: memoryStorage multer creates no temp files on disk.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function cleanTemp(_filePath?: string | null) {}

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
router.post("/api/vendor/register", async (req, res) => {
  try {
    const { storeName, businessType, phoneNumber, password, ownerName, address, email } = req.body;
    if (!storeName || !businessType || !phoneNumber || !ownerName) {
      return res.status(400).json({ error: "جميع الحقول المطلوبة غير مكتملة" });
    }
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
      .cookie(VENDOR_COOKIE, token, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      })
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
router.get("/api/vendor/logout", (_req, res) => {
  res.clearCookie(VENDOR_COOKIE).redirect("/vendor/login");
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

// ── PATCH /api/vendor/profile ── update bio/address ─────────────────────────
router.patch("/api/vendor/profile", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    const vid = (req as any).vendorId;
    const { bio, address, deliveryTime, deliveryPrice, workingHours, rating } = req.body;
    const updates: any = { updatedAt: new Date().toISOString() };
    if (bio !== undefined) updates.bio = bio;
    if (address !== undefined) updates.address = address;
    if (deliveryTime !== undefined) updates.deliveryTime = deliveryTime;
    if (deliveryPrice !== undefined) updates.deliveryPrice = Number(deliveryPrice);
    if (workingHours !== undefined) updates.workingHours = workingHours;
    if (rating !== undefined) updates.rating = Number(rating);
    await db.collection("vendors").doc(vid).update(updates);
    const doc = await db.collection("vendors").doc(vid).get();
    const { passwordHash: _pw, ...safe } = doc.data() as any;
    res.json(safe);
  } catch (err) {
    console.error("patch vendor profile:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── POST /api/vendor/profile/images ── upload avatar or cover ────────────────
const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
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
  _vendorId: string
): Promise<string> {
  // Firebase Storage bucket is not provisioned for this project, so vendor
  // profile/cover images are compressed and embedded as Base64 data URIs.
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
  return `data:image/webp;base64,${webpBuffer.toString("base64")}`;
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
async function processUploadedImages(files: Express.Multer.File[]): Promise<{ imageUrls: string[]; tempPaths: string[] }> {
  const imageUrls = await Promise.all(
    files.map(async (file) => {
      const hash = generateImageHash(file.buffer);
      let imageUrl = await findDuplicateImage(hash);
      if (!imageUrl) {
        imageUrl = await processAndSaveImage(file.buffer, hash);
        await saveImageHash(hash, imageUrl);
      }
      return imageUrl;
    })
  );
  return { imageUrls, tempPaths: [] };
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
      const vid = (req as any).vendorId;

      if (!name || !price || !category || uploadedFiles.length === 0) {
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(400).json({ error: "الاسم، السعر، الفئة، والصورة مطلوبة" });
      }

      if (uploadedFiles.length > 5) {
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(400).json({ error: "الحد الأقصى للصور هو 5 صور" });
      }

      const db = getFirestore();
      if (!db) {
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      }

      const vDoc = await db.collection("vendors").doc(vid).get();
      if (!vDoc.exists) {
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(403).json({ error: "حسابك غير موجود" });
      }
      if ((vDoc.data() as any).status === "rejected" || (vDoc.data() as any).status === "suspended") {
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(403).json({ error: "حسابك غير مفعل" });
      }

      const { imageUrls } = await processUploadedImages(uploadedFiles);
      const imageUrl = imageUrls[0];

      const pid = productId();
      const now = new Date().toISOString();
      const vData = vDoc.data() as any;

      const extraDataRaw = req.body.extraData;
      let extraData: Record<string, string> | undefined;
      if (extraDataRaw) {
        try { extraData = JSON.parse(extraDataRaw); } catch {}
      }

      await db.collection("vendorProducts").doc(pid).set({
        id: pid,
        vendorId: vid,
        vendorName: vData.storeName,
        storeName: vData.storeName,
        vendorPhone: vData.phoneNumber,
        name,
        description: description || "",
        price: parseFloat(price),
        category,
        stock: parseInt(stock) || 0,
        unit: unit || "قطعة",
        imageUrl,
        imageUrls,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        ...(extraData ? { extraData } : {}),
      });

      res.status(201).json({
        success: true,
        message: "تم إضافة المنتج بنجاح! سيظهر للعملاء بعد مراجعة الأدمن.",
        product: { id: pid, name, price: parseFloat(price), imageUrl, imageUrls, status: "pending" },
      });
    } catch (err: any) {
      for (const f of uploadedFiles) await cleanTemp(f.path);
      console.error("add product:", err);
      res.status(500).json({ error: err.message || "حدث خطأ في إضافة المنتج" });
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
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      }

      const vid = (req as any).vendorId;
      const pid = req.params.pid as string;
      const doc = await db.collection("vendorProducts").doc(pid).get();

      if (!doc.exists || (doc.data() as any).vendorId !== vid) {
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(404).json({ error: "المنتج غير موجود" });
      }

      const { name, description, price, category, stock, unit, existingImages } = req.body;
      const now = new Date().toISOString();
      const updates: Record<string, any> = { updatedAt: now };

      if (name) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (price) updates.price = parseFloat(price);
      if (category) updates.category = category;
      if (stock !== undefined) updates.stock = parseInt(stock);
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
        for (const f of uploadedFiles) await cleanTemp(f.path);
        return res.status(400).json({ error: "الحد الأقصى للصور هو 5 صور" });
      }

      // Compute URLs that will be removed from the product (Storage cleanup candidates)
      let removedUrls: string[] = [];
      if (uploadedFiles.length > 0 || existingImages !== undefined) {
        const { imageUrls: newUrls } = await processUploadedImages(uploadedFiles);
        const allUrls = [...keptImages, ...newUrls];
        if (allUrls.length > 0) {
          updates.imageUrls = allUrls;
          updates.imageUrl = allUrls[0];
        }
        // URLs that existed before but won't be in the new list
        removedUrls = storedUrls.filter((url) => !allUrls.includes(url));
      }

      await db.collection("vendorProducts").doc(pid).update(updates);

      res.json({ success: true, message: "تم حفظ التعديلات بنجاح" });

      // Fire-and-forget: clean up Storage files that are no longer used by this product.
      // Only delete a URL if no other vendorProduct still references it (hash deduplication
      // means two products may share the same Storage file).
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
              }
            } catch { /* log nothing — best-effort only */ }
          }
        })().catch(() => {});
      }
    } catch (err) {
      for (const f of uploadedFiles) await cleanTemp(f.path);
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

    const results = await Promise.allSettled(
      uniqueIds.map(async (pid: string) => {
        const doc = await db.collection("vendorProducts").doc(pid).get();
        if (!doc.exists || (doc.data() as any).vendorId !== vid) {
          throw new Error(`المنتج ${pid} غير موجود`);
        }
        await db.collection("vendorProducts").doc(pid).update({
          status: "deleted",
          deletedAt: new Date().toISOString(),
        });
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({ success: true, succeeded, failed, total: ids.length });
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

    await db.collection("vendorProducts").doc(pid).update({
      status: "deleted",
      deletedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: "تم حذف المنتج" });
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
    const snap = await db.collection("vendorNotifications")
      .where("vendorId", "==", vid)
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

    // 2. Fetch orders by top-level vendorId (restaurant detection flow)
    const byVendorIdSnap = await db.collection("orders")
      .where("vendorId", "==", vid)
      .limit(200)
      .get();

    // 3. Fetch the 300 most-recent orders (by createdAt desc) to check for item-level ownership.
    //    This deterministic window covers vendor products not caught by the restaurant detection flow.
    const recentOrdersSnap = await db.collection("orders")
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

    // Fetch ALL orders to check for item-level product ownership.
    // This is an unbounded scan so that no orders are missed in aggregate counts.
    // For vendors who only use the restaurant (top-level vendorId) flow and have no
    // marketplace products, vendorProductIds will be empty and this scan is skipped.
    const allOrdersSnap = vendorProductIds.size > 0
      ? await db.collection("orders").get()
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

    const updatedAt = new Date().toISOString();
    const updateData: Record<string, any> = { status, updatedAt, [`vendorStatusAt_${status}`]: updatedAt };
    if (validatedEta) {
      updateData.estimatedMinutes = validatedEta;
    }
    await orderRef.update(updateData);

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

function isAdminSession(req: Request): boolean {
  const cookies = (req as any).cookies || parseCookies(req);
  const raw = cookies["onway_admin_session"];
  if (!raw) return false;
  const secret = `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`;
  const expected = crypto.createHmac("sha256", secret).update("onway_admin").digest("hex");
  return raw === expected;
}

function requireAdmin(req: Request, res: Response, next: express.NextFunction) {
  if (!isAdminSession(req)) return res.status(401).json({ error: "غير مصرح" });
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

    // 3. Fetch recent orders (limit to last 1000)
    const snap = await db.collection("orders")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .get();

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

    // Recent 20 sales
    const recentSales = vendorOrders.slice(0, 20);

    res.json({ totalRevenue, totalOrders, avgOrderValue, dailySales, recentSales, period });
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


export default router;
