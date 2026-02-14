import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import multer, { StorageEngine } from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { 
  getFirestore, getUserByPhone, createUser, updateUser,
  getProducts as getFirestoreProducts, createProduct as createFirestoreProduct, 
  updateProduct as updateFirestoreProduct, deleteProduct as deleteFirestoreProduct,
  getOrders, getOrdersByPhone, createOrder, updateOrderStatus,
  updateUserPushToken, getUserPushToken,
  getPromotionalSections, getPromotionalSection, savePromotionalSection,
  getCategories as getFirestoreCategories, createCategory as createFirestoreCategory,
  updateCategory as updateFirestoreCategory, deleteCategory as deleteFirestoreCategory,
  initializeDefaultCategories,
  getDrivers, getDriverByPhone, createDriver, updateDriverStatus as updateDriverStatusFn
} from "./firebase";
import { sendPushNotification } from "./pushNotifications";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage: StorageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// --- واجهات البيانات (Interfaces) ---
interface Category { id: string; name: string; image: string; productCount: number; order: number; color?: string; iconColor?: string; }
interface Banner { id: string; image: string; title?: string; isActive: boolean; type: "offer" | "slider"; order: number; }
interface Product { id: string; categoryId: string; name: string; price: number; originalPrice?: number; discount?: number; image: string; description: string; inStock: boolean; }
interface DeliveryArea { id: string; name: string; fee: number; isActive: boolean; }
interface UserProfile { id: string; phoneNumber: string; fullName: string; gender: "male" | "female"; region: string; address: string; profileImage?: string; createdAt: string; updatedAt: string; }

// بيانات تجريبية (Fallback Data)
let userProfiles: UserProfile[] = [];
let deliveryAreas: DeliveryArea[] = [
  { id: "daloaiya", name: "الضلوعية المركز", fee: 3000, isActive: true },
  { id: "hawija", name: "الحويجة البحرية", fee: 3500, isActive: true },
];

let categories: Category[] = [
  { id: "fruits-vegetables", name: "الخضروات والفواكه", image: "/uploads/category-vegetables.png", productCount: 50, order: 1, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "اللحوم والطازج", image: "/uploads/category-meat.png", productCount: 55, order: 2, color: "#FFEBEE", iconColor: "#EF5350" },
];

let banners: Banner[] = [
  { id: "slider-1", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800", title: "خضروات وفواكه طازجة", isActive: true, type: "slider", order: 1 },
];

const products: Product[] = [
  { id: "p1", categoryId: "fruits-vegetables", name: "تفاح أحمر", price: 15000, image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=300", description: "تفاح أحمر طازج 1 كيلو", inStock: true },
];

export async function registerRoutes(app: Express): Promise<Server> {
  // نظام طابور السائقين (FIFO)
  interface QueuedDriver { phoneNumber: string; joinedAt: number; currentOrderId?: string; }
  const driverQueue: QueuedDriver[] = [];
  const driverAssignments: Map<string, string> = new Map();
  const driverCompletedOrders: Map<string, any[]> = new Map();

  await initializeDefaultCategories(categories);

  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  }, require("express").static(uploadsDir));

  // --- روابط الـ Auth (تعديل التخطي) ---
  app.post("/api/auth/send-otp", (req, res) => {
    const { phoneNumber } = req.body;
    console.log(`Bypass: Sending OTP to ${phoneNumber}`);
    res.json({ success: true, message: "Bypass Mode Active: Enter any 6 digits" });
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    const { phoneNumber, code } = req.body;
    console.log(`Bypass: Verifying code ${code} for ${phoneNumber}`);

    // نقبل أي كود طوله 6 أرقام أو أي كود يتم إدخاله
    let userType: string | null = null;
    let userExists = false;
    let driverExists = false;

    const user = await getUserByPhone(phoneNumber);
    if (user) { userExists = true; userType = "customer"; }

    const driver = await getDriverByPhone(phoneNumber);
    if (driver) { driverExists = true; userType = "driver"; }

    res.json({ success: true, message: "OTP verified", userExists, driverExists, userType });
  });

  // --- روابط الفئات والمنتجات ---
  app.get("/api/categories", async (req, res) => {
    const db = getFirestore();
    if (db) {
      const firestoreCategories = await getFirestoreCategories();
      if (firestoreCategories.length > 0) return res.json(firestoreCategories);
    }
    res.json(categories.sort((a, b) => a.order - b.order));
  });

  app.get("/api/products", async (req, res) => {
    const categoryId = req.query.categoryId as string;
    const db = getFirestore();
    if (db) {
      const result = await getFirestoreProducts(categoryId);
      return res.json(result);
    }
    res.json(categoryId ? products.filter(p => p.categoryId === categoryId) : products);
  });

  // --- روابط المستخدمين ---
  app.get("/api/users/:phoneNumber", async (req, res) => {
    const user = await getUserByPhone(req.params.phoneNumber);
    if (!user) return res.status(404).json({ error: "User not found", profileComplete: false });
    res.json({ ...user, profileComplete: true });
  });

  app.post("/api/users", async (req, res) => {
    const { phoneNumber, fullName, gender, region, address, profileImage } = req.body;
    const db = getFirestore();
    if (db) {
      const user = await createUser({ phoneNumber, fullName, gender, region, address, profileImage });
      return res.json({ ...user, profileComplete: true });
    }
    res.status(500).json({ error: "DB Error" });
  });

  // --- روابط السائقين ---
  app.get("/api/driver/status", async (req, res) => {
    const { phoneNumber } = req.query;
    const driver = await getDriverByPhone(phoneNumber as string);
    const queueIndex = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
    res.json({
      isOnline: queueIndex !== -1,
      queuePosition: queueIndex !== -1 ? queueIndex + 1 : null,
      approvalStatus: driver?.status || "pending",
    });
  });

  app.post("/api/driver/toggle-online", (req, res) => {
    const { phoneNumber, goOnline } = req.body;
    if (goOnline) {
      if (!driverQueue.find(d => d.phoneNumber === phoneNumber)) {
        driverQueue.push({ phoneNumber, joinedAt: Date.now() });
      }
    } else {
      const idx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
      if (idx !== -1) driverQueue.splice(idx, 1);
    }
    res.json({ success: true });
  });

  // --- روابط الطلبات ---
  app.post("/api/orders", async (req, res) => {
    const db = getFirestore();
    if (db) {
      const newOrder = await createOrder({ ...req.body, status: "pending" });
      return res.json(newOrder);
    }
    res.status(500).json({ error: "DB Error" });
  });

  app.get("/api/orders", async (req, res) => {
    const { phoneNumber } = req.query;
    const orders = await getOrdersByPhone(phoneNumber as string);
    res.json(orders);
  });

  const httpServer = createServer(app);
  return httpServer;
}
