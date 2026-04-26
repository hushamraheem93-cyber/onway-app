import express from "express";
import type { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import sharp from "sharp";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { getFirestore } from "./firebase";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "onway-vendor-secret-2024";
const VENDOR_COOKIE = "onway_vendor_session";

// ── Multer: temp storage ────────────────────────────────────────────────────
const upload = multer({
  dest: path.resolve(process.cwd(), "uploads", "temp"),
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
  return jwt.sign({ vendorId, role: "vendor" }, JWT_SECRET, { expiresIn: "30d" });
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
  } catch {
    return res.status(401).json({ error: "توكن غير صالح" });
  }
}

async function generateImageHash(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash("md5").update(buf).digest("hex");
}

async function processAndSaveImage(tempPath: string, hash: string): Promise<string> {
  const dir = path.resolve(process.cwd(), "uploads", "products");
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}_${hash}.webp`;
  const outPath = path.join(dir, fileName);
  await sharp(tempPath)
    .resize(800, 800, { fit: "cover", position: "center" })
    .webp({ quality: 80 })
    .toFile(outPath);
  return `/uploads/products/${fileName}`;
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

async function cleanTemp(filePath?: string | null) {
  if (filePath) await fs.unlink(filePath).catch(() => {});
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

// ── POST /api/vendor/products ───────────────────────────────────────────────
router.post(
  "/api/vendor/products",
  requireVendor,
  upload.single("image"),
  async (req, res) => {
    let tempPath: string | null = req.file?.path || null;
    try {
      const { name, description, price, category, stock, unit } = req.body;
      const vid = (req as any).vendorId;

      if (!name || !price || !category || !req.file) {
        await cleanTemp(tempPath);
        return res.status(400).json({ error: "الاسم، السعر، الفئة، والصورة مطلوبة" });
      }

      const db = getFirestore();
      if (!db) { await cleanTemp(tempPath); return res.status(500).json({ error: "قاعدة البيانات غير متاحة" }); }

      // Check vendor exists (pending vendors can add products; they queue until approved)
      const vDoc = await db.collection("vendors").doc(vid).get();
      if (!vDoc.exists) {
        await cleanTemp(tempPath);
        return res.status(403).json({ error: "حسابك غير موجود" });
      }
      if ((vDoc.data() as any).status === "rejected" || (vDoc.data() as any).status === "suspended") {
        await cleanTemp(tempPath);
        return res.status(403).json({ error: "حسابك غير مفعل" });
      }

      // 1. Generate hash from original file
      const imageHash = await generateImageHash(tempPath!);

      // 2. Check dedup
      let imageUrl = await findDuplicateImage(imageHash);
      let isDuplicate = !!imageUrl;

      if (!imageUrl) {
        // 3. Process image: WebP 800×800
        imageUrl = await processAndSaveImage(tempPath!, imageHash);
        // 4. Save hash → URL mapping
        await saveImageHash(imageHash, imageUrl);
        console.log(`✅ صورة جديدة معالجة ومحفوظة: ${imageUrl}`);
      } else {
        console.log(`♻️ صورة مكررة — استخدام الرابط الموجود: ${imageUrl}`);
      }

      // 5. Delete temp file
      await cleanTemp(tempPath);
      tempPath = null;

      // 6. Save product
      const pid = productId();
      const now = new Date().toISOString();

      const vData = vDoc.data() as any;
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
        imageHash,
        isDuplicateImage: isDuplicate,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });

      // 7. Admin notification
      await db.collection("adminNotifications").add({
        type: "new_product",
        title: "منتج جديد يحتاج مراجعة",
        message: `${(vDoc.data() as any).storeName} أضاف منتج: ${name}`,
        vendorId: vid,
        productId: pid,
        status: "unread",
        createdAt: now,
      });

      res.status(201).json({
        success: true,
        message: "تم إضافة المنتج! سيظهر للعملاء بعد مراجعة الإدارة.",
        product: { id: pid, name, price: parseFloat(price), imageUrl, status: "pending" },
      });
    } catch (err: any) {
      await cleanTemp(tempPath);
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
      .map((d) => d.data())
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    res.json({ products, total: products.length });
  } catch (err) {
    console.error("get products:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── PUT /api/vendor/products/:id ────────────────────────────────────────────
router.put("/api/vendor/products/:pid", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const { pid } = req.params;
    const doc = await db.collection("vendorProducts").doc(pid).get();

    if (!doc.exists || (doc.data() as any).vendorId !== vid) {
      return res.status(404).json({ error: "المنتج غير موجود" });
    }

    const { name, description, price, stock, unit } = req.body;
    await db.collection("vendorProducts").doc(pid).update({
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(price && { price: parseFloat(price) }),
      ...(stock !== undefined && { stock: parseInt(stock) }),
      ...(unit && { unit }),
      status: "pending",
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: "تم تحديث المنتج وأُعيد لقائمة المراجعة" });
  } catch (err) {
    console.error("update product:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ── DELETE /api/vendor/products/:id ─────────────────────────────────────────
router.delete("/api/vendor/products/:pid", requireVendor, async (req, res) => {
  try {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

    const vid = (req as any).vendorId;
    const { pid } = req.params;
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

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN endpoints for vendor partner management
// ═══════════════════════════════════════════════════════════════════════════

function isAdminSession(req: Request): boolean {
  const cookies = (req as any).cookies || parseCookies(req);
  return !!cookies["onway_admin_session"];
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
    const { id } = req.params;
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
    const { pid } = req.params;
    const now = new Date().toISOString();

    const doc = await db.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
    const product = doc.data() as any;

    await db.collection("vendorProducts").doc(pid).update({
      status: "approved",
      approvedAt: now,
    });

    await db.collection("vendors").doc(product.vendorId).update({
      totalProducts: (product.totalProducts || 0) + 1,
    }).catch(() => {});

    await db.collection("vendorNotifications").add({
      vendorId: product.vendorId,
      type: "product_approved",
      title: "تمت الموافقة على منتجك",
      message: `منتج "${product.name}" تمت الموافقة عليه وهو متاح للعملاء الآن`,
      status: "unread",
      createdAt: now,
    });

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
    const { pid } = req.params;
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

export default router;
