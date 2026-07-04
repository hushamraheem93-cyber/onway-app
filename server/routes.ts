import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import multer, { StorageEngine, FileFilterCallback } from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { randomUUID, createHmac, createHash } from "crypto";
import { 
  getFirestore, getUserByPhone, createUser, updateUser, FirestoreUserProfile,
  getProducts as getFirestoreProducts, createProduct as createFirestoreProduct, 
  updateProduct as updateFirestoreProduct, deleteProduct as deleteFirestoreProduct,
  getOrders, getOrderById, getOrdersByPhone, createOrder, updateOrderStatus,
  updateUserPushToken, getUserPushToken, getAllUserPushTokens, getAllUsers,
  getPromotionalSections, getPromotionalSection, savePromotionalSection,
  getCategories as getFirestoreCategories, createCategory as createFirestoreCategory,
  updateCategory as updateFirestoreCategory, deleteCategory as deleteFirestoreCategory,
  initializeDefaultCategories,
  getBanners as getFirestoreBanners, createBanner as createFirestoreBanner,
  updateBanner as updateFirestoreBanner, deleteBanner as deleteFirestoreBanner,
  initializeDefaultBanners,
  getDeliveryAreas as getFirestoreDeliveryAreas, createDeliveryArea as createFirestoreDeliveryArea,
  updateDeliveryArea as updateFirestoreDeliveryArea, deleteDeliveryArea as deleteFirestoreDeliveryArea,
  initializeDefaultDeliveryAreas,
  generateOtp, verifyOtp as verifyOtpCode,
  getDrivers, getDriverByPhone, createDriver, updateDriverStatus as updateDriverStatusFn, deleteDriver as deleteDriverFn,
  updateOrderDriverInfo,
  getPromoCodes, getPromoCodeByCode, createPromoCode, updatePromoCode, deletePromoCode as deletePromoCodeFn,
  checkPromoUsage, recordPromoUsage,
  getDriverFinancialAccount, updateDriverEarningsOnOrder, recordDriverPayment, recordDriverAdjustment, getDriverTransactions,
  saveDriverCompletedOrder, getDriverCompletedOrdersFromDB,
  saveDriverActivity, getDriverActivityLog, updateDriverLastLocation,
  getOrdersByDriverPhone,
  getVendors as getFirestoreVendors, createVendor as createFirestoreVendor,
  updateVendor as updateFirestoreVendor, deleteVendor as deleteFirestoreVendor,
  initializeDefaultVendors,
  updateDriverOnlineStatus, getOnlineDrivers, saveDriverPushToken, getDriverPushToken,
  getSupportChat, sendSupportMessage, getAllSupportChats, markSupportChatRead,
  createDeliveryBatch, getDeliveryBatch, updateDeliveryBatch, cancelDeliveryBatch, addDeliveryLog, DeliveryBatch,
  saveAdminPushToken, getAdminPushToken,
  addDriverToActiveQueue, removeDriverFromActiveQueue, updateDriverQueueEntry, getActiveDriverQueue,
  deleteFromFirebaseStorage
} from "./firebase";
import { sendPushNotification, sendBroadcastNotification, sendDriverBatchNotification, sendAdminNewOrderNotification, sendVendorNewOrderNotification } from "./pushNotifications";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage: StorageEngine = multer.diskStorage({
  destination: (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// uploadWebP uses memory storage — admin images go directly to Firebase Storage
const uploadWebP = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/webp", "image/jpeg", "image/png", "image/gif", "application/octet-stream"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".webp"));
  },
});

// ── Image content-hash deduplication map ─────────────────────────────────────
// sha256(fileBuffer) → Firebase Storage URL; prevents storing duplicate images.
// In-memory only (per process lifetime); old /uploads/ files are still served
// via the static middleware for backward compatibility.
const imageHashMap = new Map<string, string>();

interface Category {
  id: string;
  name: string;
  image: string;
  productCount: number;
  order: number;
  color?: string;
  iconColor?: string;
}

interface Banner {
  id: string;
  image: string;
  title?: string;
  isActive: boolean;
  type: "offer" | "slider";
  order: number;
  linkType?: string;
  linkTarget?: string;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  description: string;
  inStock: boolean;
  restaurant?: string;
  vendorId?: string;
  weight?: string;
  unit?: string;
}

interface Vendor {
  id: string;
  name: string;
  location: string;
  whatsappNumber: string;
  commissionPercent: number;
  image: string;
  rating: number;
  deliveryTime: string;
  isOpen: boolean;
  createdAt: string;
  sortOrder?: number;
}

const defaultVendors: Vendor[] = [];

let vendorsCache: Vendor[] | null = null;

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
  lat?: number;
  lng?: number;
}

interface UserProfile {
  id: string;
  phoneNumber: string;
  fullName: string;
  gender: "male" | "female";
  region: string;
  address: string;
  profileImage?: string;
  createdAt: string;
  updatedAt: string;
}

let userProfiles: UserProfile[] = [];

let deliveryAreas: DeliveryArea[] = [
  { id: "daloaiya", name: "الضلوعية المركز", fee: 3000, isActive: true },
  { id: "hawija", name: "الحويجة البحرية", fee: 3500, isActive: true },
  { id: "jbour", name: "منطقة الجبور", fee: 3000, isActive: true },
  { id: "bishikan", name: "بيشيكان", fee: 3500, isActive: true },
];

let categories: Category[] = [
  { id: "restaurants", name: "المطاعم", image: "/uploads/category-restaurants.png", productCount: 30, order: 1, color: "#FFF3E0", iconColor: "#E86520" },
  { id: "fruits-vegetables", name: "الخضروات والفواكه", image: "/uploads/category-vegetables.png", productCount: 50, order: 2, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "اللحوم والطازج", image: "/uploads/category-meat.png", productCount: 55, order: 3, color: "#FFEBEE", iconColor: "#EF5350" },
  { id: "dairy-eggs", name: "الألبان والأجبان", image: "/uploads/category-dairy.png", productCount: 70, order: 4, color: "#F3E5F5", iconColor: "#AB47BC" },
  { id: "cleaning-care", name: "المنظفات", image: "/uploads/category-cleaning.png", productCount: 95, order: 5, color: "#E3F2FD", iconColor: "#42A5F5" },
  { id: "beverages", name: "المشروبات", image: "/uploads/category-beverages.png", productCount: 90, order: 6, color: "#E0F7FA", iconColor: "#26C6DA" },
  { id: "snacks-sweets", name: "سناكس ومقرمشات", image: "/uploads/category-snacks.png", productCount: 110, order: 7, color: "#FFF3E0", iconColor: "#FFA726" },
  { id: "tea-coffee", name: "شاي وقهوة", image: "/uploads/category-coffee.png", productCount: 35, order: 8, color: "#EFEBE9", iconColor: "#8D6E63" },
  { id: "baby", name: "مستلزمات أطفال", image: "/uploads/category-baby.png", productCount: 60, order: 9, color: "#FCE4EC", iconColor: "#EC407A" },
  { id: "flowers", name: "هدايا وورود", image: "/uploads/category-flowers.png", productCount: 25, order: 10, color: "#FDF2F2", iconColor: "#EF5350" },
  { id: "delivery", name: "خدمات المندوب", image: "/uploads/category-delivery.png", productCount: 0, order: 11, color: "#FFF9C4", iconColor: "#FBC02D" },
  { id: "women-bags", name: "الحقائب النسائية", image: "/uploads/category-bags.png", productCount: 12, order: 12, color: "#FCE4EC", iconColor: "#E91E63" },
  { id: "international-shopping", name: "الشراء من المواقع العالمية", image: "/uploads/category-international.png", productCount: 0, order: 13, color: "#E8EAF6", iconColor: "#5C6BC0" },
  { id: "food-supplies", name: "المواد الغذائية", image: "/uploads/category-food-supplies.png", productCount: 9, order: 14, color: "#FFF8E1", iconColor: "#F9A825" },
];

let banners: Banner[] = [
  { id: "slider-1", image: "/uploads/banners/banner-1.png", title: "توصيل سريع لباب بيتك", isActive: true, type: "slider", order: 1, linkType: "screen", linkTarget: "CourierPickup" },
  { id: "slider-2", image: "/uploads/banners/banner-2.png", title: "أشهى المأكولات العراقية", isActive: true, type: "slider", order: 2, linkType: "category", linkTarget: "restaurants" },
  { id: "slider-3", image: "/uploads/banners/banner-3.png", title: "طلباتك اليومية بضغطة زر", isActive: true, type: "slider", order: 3, linkType: "category", linkTarget: "fruits-vegetables" },
  { id: "slider-4", image: "/uploads/banners/banner-4.png", title: "عروض وخصومات حصرية", isActive: true, type: "slider", order: 4, linkType: "screen", linkTarget: "AllCategories" },
  { id: "slider-5", image: "/uploads/banners/banner-5.png", title: "مساحة إعلانية لأصحاب المطاعم والماركت", isActive: true, type: "slider", order: 5, linkType: "screen", linkTarget: "AllCategories" },
];

const products: Product[] = [
  // مطعم يلا ايت
  { id: "r1", categoryId: "restaurants", restaurant: "يلا ايت", name: "برجر كلاسيك", price: 8000, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300", description: "برجر لحم كلاسيكي مع خس وطماطم وصوص خاص", inStock: true },
  { id: "r2", categoryId: "restaurants", restaurant: "يلا ايت", name: "برجر دجاج مقرمش", price: 7500, image: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=300", description: "برجر دجاج مقرمش مع صوص مايونيز", inStock: true },
  { id: "r3", categoryId: "restaurants", restaurant: "يلا ايت", name: "شاورما لحم", price: 5000, image: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300", description: "شاورما لحم عربية مع خضار وطحينة", inStock: true },
  { id: "r4", categoryId: "restaurants", restaurant: "يلا ايت", name: "شاورما دجاج", price: 4500, image: "https://images.unsplash.com/photo-1561651188-d207bbec4ec3?w=300", description: "شاورما دجاج مع ثومية وبطاطا", inStock: true },
  { id: "r5", categoryId: "restaurants", restaurant: "يلا ايت", name: "بيتزا مارغريتا", price: 12000, image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=300", description: "بيتزا مارغريتا بالجبن والريحان", inStock: true },
  // مطعم المشويات
  { id: "r6", categoryId: "restaurants", restaurant: "مطعم المشويات", name: "كباب لحم", price: 15000, image: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300", description: "كباب لحم مشوي على الفحم 6 أسياخ", inStock: true },
  { id: "r7", categoryId: "restaurants", restaurant: "مطعم المشويات", name: "تكة دجاج", price: 12000, image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=300", description: "تكة دجاج مشوية متبلة 6 أسياخ", inStock: true },
  { id: "r8", categoryId: "restaurants", restaurant: "مطعم المشويات", name: "مشاوي مشكلة", price: 25000, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=300", description: "طبق مشاوي مشكلة مع رز وسلطة", inStock: true },
  { id: "r9", categoryId: "restaurants", restaurant: "مطعم المشويات", name: "ريش غنم", price: 20000, image: "https://images.unsplash.com/photo-1558030006-450675393462?w=300", description: "ريش غنم مشوية 4 قطع", inStock: true },
  // مطعم الأسماك
  { id: "r10", categoryId: "restaurants", restaurant: "مطعم الأسماك", name: "سمك مشوي", price: 18000, image: "https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?w=300", description: "سمك شبوط مشوي على الفحم", inStock: true },
  { id: "r11", categoryId: "restaurants", restaurant: "مطعم الأسماك", name: "سمك مقلي", price: 15000, image: "https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=300", description: "سمك مقلي مقرمش مع صوص ترتار", inStock: true },
  { id: "r12", categoryId: "restaurants", restaurant: "مطعم الأسماك", name: "روبيان مشوي", price: 22000, image: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=300", description: "روبيان مشوي بالثوم والزبدة", inStock: true },
  { id: "r13", categoryId: "restaurants", restaurant: "مطعم الأسماك", name: "سمك الهامور", price: 25000, image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300", description: "فيليه هامور مشوي مع خضار", inStock: true },
  // مطعم الدجاج
  { id: "r14", categoryId: "restaurants", restaurant: "مطعم الدجاج", name: "دجاج مشوي كامل", price: 15000, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=300", description: "دجاج كامل مشوي على الفحم", inStock: true },
  { id: "r15", categoryId: "restaurants", restaurant: "مطعم الدجاج", name: "قطع دجاج مقلية", price: 10000, image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=300", description: "قطع دجاج مقلية مقرمشة 8 قطع", inStock: true },
  { id: "r16", categoryId: "restaurants", restaurant: "مطعم الدجاج", name: "دجاج بالكاري", price: 12000, image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300", description: "دجاج بصلصة الكاري مع الرز", inStock: true },
  { id: "r17", categoryId: "restaurants", restaurant: "مطعم الدجاج", name: "أجنحة دجاج حارة", price: 9000, image: "https://images.unsplash.com/photo-1608039829572-9b0175ffb205?w=300", description: "أجنحة دجاج حارة 10 قطع", inStock: true },
  // مطعم اللحوم
  { id: "r18", categoryId: "restaurants", restaurant: "مطعم اللحوم", name: "ستيك لحم", price: 28000, image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=300", description: "ستيك لحم بقري مشوي مع بطاطا", inStock: true },
  { id: "r19", categoryId: "restaurants", restaurant: "مطعم اللحوم", name: "كفتة بالفرن", price: 14000, image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=300", description: "كفتة لحم بالفرن مع صلصة طماطم", inStock: true },
  { id: "r20", categoryId: "restaurants", restaurant: "مطعم اللحوم", name: "طبق لحم عراقي", price: 20000, image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300", description: "طبق لحم عراقي تقليدي مع رز وسلطة", inStock: true },
  { id: "r21", categoryId: "restaurants", restaurant: "مطعم اللحوم", name: "دولمة عراقية", price: 16000, image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=300", description: "دولمة عراقية بالرز واللحم المفروم", inStock: true },
  // باقي المنتجات
  { id: "p1", categoryId: "groceries", name: "أرز بسمتي", price: 35000, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300", description: "أرز بسمتي عالي الجودة 5 كيلو", inStock: true },
  { id: "p2", categoryId: "groceries", name: "زيت زيتون", price: 65000, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300", description: "زيت زيتون بكر ممتاز 1 لتر", inStock: true },
  { id: "p3", categoryId: "groceries", name: "عسل طبيعي", price: 85000, image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300", description: "عسل طبيعي صافي 500 جرام", inStock: true },
  { id: "p4", categoryId: "dairy-eggs", name: "حليب طازج", price: 12000, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300", description: "حليب طازج كامل الدسم 1 لتر", inStock: true },
  { id: "p5", categoryId: "bakery", name: "خبز عربي", price: 5000, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300", description: "خبز عربي طازج 6 قطع", inStock: true },
  { id: "p6", categoryId: "dairy-eggs", name: "جبنة بيضاء", price: 22000, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300", description: "جبنة بيضاء طازجة 400 جرام", inStock: true },
  { id: "p7", categoryId: "cleaning-care", name: "صابون غسيل", price: 15000, image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300", description: "صابون غسيل معطر 3 كيلو", inStock: true },
  { id: "p10", categoryId: "meat-poultry", name: "دجاج كامل", price: 45000, image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300", description: "دجاج طازج كامل 1.5 كيلو", inStock: true },
  { id: "p11", categoryId: "beverages", name: "عصير برتقال", price: 12000, image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300", description: "عصير برتقال طبيعي 1 لتر", inStock: true },
  { id: "p12", categoryId: "snacks-sweets", name: "شوكولاتة داكنة", price: 18000, image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=300", description: "شوكولاتة داكنة فاخرة 100 جرام", inStock: true },
  { id: "p13", categoryId: "baby", name: "حفاضات أطفال", price: 35000, image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300", description: "حفاضات أطفال مقاس M عبوة 40", inStock: true },
  { id: "p14", categoryId: "electronics-services", name: "شاحن سريع", price: 65000, image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300", description: "شاحن سريع 20 واط", inStock: true },
  // حقائب نسائية
  { id: "wb1", categoryId: "women-bags", name: "حقيبة يد جلدية", price: 85000, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300", description: "حقيبة يد جلدية أنيقة بتصميم عصري", inStock: true },
  { id: "wb2", categoryId: "women-bags", name: "حقيبة كتف سوداء", price: 65000, image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=300", description: "حقيبة كتف سوداء كلاسيكية", inStock: true },
  { id: "wb3", categoryId: "women-bags", name: "حقيبة ظهر نسائية", price: 55000, image: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=300", description: "حقيبة ظهر نسائية عملية وأنيقة", inStock: true },
  { id: "wb4", categoryId: "women-bags", name: "حقيبة سهرة ذهبية", price: 120000, image: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=300", description: "حقيبة سهرة ذهبية فاخرة للمناسبات", inStock: true, discount: 15 },
  { id: "wb5", categoryId: "women-bags", name: "حقيبة كروس بودي", price: 45000, image: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=300", description: "حقيبة كروس بودي صغيرة وعملية", inStock: true },
  { id: "wb6", categoryId: "women-bags", name: "حقيبة تسوق كبيرة", price: 75000, image: "https://images.unsplash.com/photo-1614179689702-355944cd0918?w=300", description: "حقيبة تسوق كبيرة بألوان زاهية", inStock: true },
  { id: "wb7", categoryId: "women-bags", name: "محفظة نسائية", price: 35000, image: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=300", description: "محفظة نسائية جلدية متعددة الجيوب", inStock: true },
  { id: "wb8", categoryId: "women-bags", name: "حقيبة يد بيج", price: 95000, image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=300", description: "حقيبة يد بيج أنيقة للاستخدام اليومي", inStock: true },
  { id: "wb9", categoryId: "women-bags", name: "حقيبة سفر نسائية", price: 150000, image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300", description: "حقيبة سفر نسائية واسعة ومتينة", inStock: true, discount: 10 },
  { id: "wb10", categoryId: "women-bags", name: "حقيبة كلتش", price: 40000, image: "https://images.unsplash.com/photo-1601924921557-45e6dea0f7e0?w=300", description: "حقيبة كلتش أنيقة للسهرات", inStock: true },
  { id: "wb11", categoryId: "women-bags", name: "حقيبة قماش مطرزة", price: 30000, image: "https://images.unsplash.com/photo-1598532163257-ae3c6b2524dd?w=300", description: "حقيبة قماش مطرزة بتصاميم شرقية", inStock: true },
  { id: "wb12", categoryId: "women-bags", name: "حقيبة ماركة فاخرة", price: 250000, image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300", description: "حقيبة ماركة فاخرة بتصميم حصري", inStock: true, discount: 20 },
  // المواد الغذائية
  { id: "fs1", categoryId: "food-supplies", name: "رز", price: 45000, image: "/uploads/product-3d-rice.png", description: "رز بسمتي فاخر 5 كيلو", inStock: true, weight: "5 كيلو" },
  { id: "fs2", categoryId: "food-supplies", name: "سكر", price: 30000, image: "/uploads/product-3d-sugar.png", description: "سكر أبيض ناعم 5 كيلو", inStock: true, weight: "5 كيلو" },
  { id: "fs3", categoryId: "food-supplies", name: "ملح", price: 5000, image: "/uploads/product-3d-salt.png", description: "ملح طعام نقي 1 كيلو", inStock: true, weight: "1 كيلو" },
  { id: "fs4", categoryId: "food-supplies", name: "طحين", price: 25000, image: "/uploads/product-3d-flour.png", description: "طحين أبيض متعدد الاستخدامات 5 كيلو", inStock: true, weight: "5 كيلو" },
  { id: "fs5", categoryId: "food-supplies", name: "معجون طماطم", price: 8000, image: "/uploads/product-3d-tomato-paste.png", description: "معجون طماطم مركّز 400 جرام", inStock: true, weight: "400 جرام" },
  { id: "fs6", categoryId: "food-supplies", name: "مكرونة", price: 7000, image: "/uploads/product-3d-pasta.png", description: "مكرونة سباغيتي 500 جرام", inStock: true, weight: "500 جرام" },
  { id: "fs7", categoryId: "food-supplies", name: "اندومي", price: 3000, image: "/uploads/product-3d-indomie.png", description: "اندومي نودلز بنكهة الدجاج", inStock: true },
  { id: "fs8", categoryId: "food-supplies", name: "عدس", price: 15000, image: "/uploads/product-3d-lentils.png", description: "عدس أحمر مجروش 1 كيلو", inStock: true, weight: "1 كيلو" },
  { id: "fs9", categoryId: "food-supplies", name: "حمص", price: 12000, image: "/uploads/product-3d-chickpeas.png", description: "حمص حب جاف 1 كيلو", inStock: true, weight: "1 كيلو" },
];

const ROUTES_JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required but not set. Add it to Replit Secrets before starting the server.");
  }
  return secret;
})();

function extractVendorId(req: Request): string | null {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return null;
    const decoded = jwt.verify(token, ROUTES_JWT_SECRET) as any;
    if (decoded.role !== "vendor") return null;
    return decoded.vendorId as string;
  } catch {
    return null;
  }
}

function isAdminSessionValid(req: Request): boolean {
  const parsedCookies: Record<string, string> = {};
  (req.headers.cookie || "").split(";").forEach(part => {
    const [k, ...v] = part.trim().split("=");
    if (k) parsedCookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  const raw = (req as any).cookies?.["onway_admin_session"] ?? parsedCookies["onway_admin_session"];
  if (!raw) return false;
  const secret = `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`;
  const expected = createHmac("sha256", secret).update("onway_admin").digest("hex");
  return raw === expected;
}

function requireAdminAuth(req: Request, res: Response, next: express.NextFunction) {
  if (!isAdminSessionValid(req)) return res.status(401).json({ error: "غير مصرح" });
  next();
}

// ── Customer JWT middleware ────────────────────────────────────────────────────
function requireCustomerAuth(req: Request, res: Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
  try {
    const decoded = jwt.verify(token, ROUTES_JWT_SECRET) as any;
    if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid role");
    (req as any).customerPhone = decoded.phoneNumber as string;
    next();
  } catch {
    return res.status(401).json({ error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً" });
  }
}

// ── Driver validation middleware (phone-based, validates approved driver) ─────
async function requireDriverAuth(req: Request, res: Response, next: express.NextFunction) {
  const phoneNumber = ((req.body?.phoneNumber) || (req.query?.phoneNumber)) as string | undefined;
  if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
  try {
    const driver = await getDriverByPhone(phoneNumber);
    if (!driver) return res.status(403).json({ error: "غير مصرح — السائق غير موجود" });
    if (driver.status !== "approved") return res.status(403).json({ error: "غير مصرح — لم تتم الموافقة على حسابك بعد" });
    next();
  } catch {
    return res.status(500).json({ error: "خطأ في قاعدة البيانات" });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Guard ALL /api/admin/* routes with admin session check
  app.use("/api/admin", requireAdminAuth);

  // ── PUBLIC: Stores listing & products ────────────────────────────────────────
  app.get("/api/stores", async (req: Request, res: Response) => {
    try {
      const { businessType, name } = req.query as { businessType?: string; name?: string };
      const allDocs = await getCachedStores();
      const nameQuery = name ? name.trim().toLowerCase() : "";
      const stores = allDocs
        .filter((s) => (businessType ? s.businessType === businessType : true))
        .filter((s) => (nameQuery ? (s.storeName || "").toLowerCase().includes(nameQuery) : true))
        .sort((a, b) => (b.approvedAt as string).localeCompare(a.approvedAt as string));
      res.set("Cache-Control", "public, max-age=30");
      res.set("Vary", "Accept-Encoding");
      res.json({ stores, total: stores.length });
    } catch (err) {
      console.error("public stores:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  app.get("/api/stores/products-preview", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const snap = await db.collection("vendorProducts").where("status", "==", "approved").get();
      const grouped: Record<string, any[]> = {};
      snap.docs.forEach((d) => {
        const p = d.data() as any;
        const vid: string = p.vendorId;
        if (!vid) return;
        if (!grouped[vid]) grouped[vid] = [];
        if (grouped[vid].length < 8) {
          const primaryUrl = p.imageUrl || "";
          const allUrls: string[] = (p.imageUrls && p.imageUrls.length > 0) ? p.imageUrls : (primaryUrl ? [primaryUrl] : []);
          grouped[vid].push({
            id: d.id, name: p.name, price: p.price,
            imageUrl: primaryUrl, imageUrls: allUrls,
            unit: p.unit || "قطعة", stock: p.stock ?? 0,
            vendorId: vid, storeName: p.storeName || "",
            description: p.description || "", category: p.category || "",
          });
        }
      });
      res.json({ preview: grouped });
    } catch (err) {
      console.error("products-preview:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  app.get("/api/stores/:id/products", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const id = req.params.id as string;
      const [storeDoc, productsSnap] = await Promise.all([
        db.collection("vendors").doc(id).get(),
        db.collection("vendorProducts").where("vendorId", "==", id).get(),
      ]);
      if (!storeDoc.exists || (storeDoc.data() as any).status !== "active") {
        return res.status(404).json({ error: "المتجر غير موجود أو غير نشط" });
      }
      const sv = storeDoc.data() as any;
      const store = {
        id: sv.id, storeName: sv.storeName, businessType: sv.businessType,
        address: sv.address || "", bio: sv.bio || "",
        profileImageUrl: sv.profileImageUrl || "", coverImageUrl: sv.coverImageUrl || "",
      };
      const products = productsSnap.docs.map((d) => {
        const p = d.data() as any;
        const primaryUrl = p.imageUrl || "";
        const allUrls: string[] = (p.imageUrls && p.imageUrls.length > 0) ? p.imageUrls : (primaryUrl ? [primaryUrl] : []);
        return {
          id: d.id, vendorId: p.vendorId, storeName: p.storeName,
          name: p.name, description: p.description || "",
          price: p.price, category: p.category, stock: p.stock || 0,
          unit: p.unit || "", imageUrl: primaryUrl, imageUrls: allUrls,
          status: p.status, approvedAt: p.approvedAt || p.createdAt || "",
        };
      }).filter((p: any) => p.status === "approved")
        .sort((a: any, b: any) => b.approvedAt.localeCompare(a.approvedAt));
      res.json({ store, products, total: products.length });
    } catch (err) {
      console.error("public store products:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── VENDOR: Wallet / earnings summary ─────────────────────────────────────────
  app.get("/api/vendor/wallet", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const vid = extractVendorId(req);
      if (!vid) return res.status(401).json({ error: "غير مصرح" });

      const period = (req.query.period as string) || "month";

      const productsSnap = await db.collection("vendorProducts")
        .where("vendorId", "==", vid).get();
      const vendorProductIds = new Set<string>(productsSnap.docs.map((d) => d.id));

      const now = new Date();
      let startDate: Date | null = null;
      if (period === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "week") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const snap = await db.collection("orders")
        .orderBy("createdAt", "desc").limit(1000).get();

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
          (sum: number, i: any) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0
        );
        vendorOrders.push({
          id: doc.id, date: createdAt.toISOString(), subtotal,
          status: data.status, customerPhone: data.phoneNumber || "",
          itemCount: vendorItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0),
        });
      }

      const totalRevenue = vendorOrders.reduce((s, o) => s + o.subtotal, 0);
      const totalOrders = vendorOrders.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const dailyMap: Record<string, number> = {};
      vendorOrders.forEach((o) => {
        const day = o.date.substring(0, 10);
        dailyMap[day] = (dailyMap[day] || 0) + o.subtotal;
      });
      const dailySales = Object.entries(dailyMap)
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14);

      res.json({ totalRevenue, totalOrders, avgOrderValue, dailySales, recentSales: vendorOrders.slice(0, 20), period });
    } catch (err) {
      console.error("vendor wallet:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── VENDOR: Product availability toggle ───────────────────────────────────────
  app.patch("/api/vendor/products/:pid/availability", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const vendorId = extractVendorId(req);
      if (!vendorId) return res.status(401).json({ error: "غير مصرح" });

      const pid = req.params.pid as string;
      const doc = await db.collection("vendorProducts").doc(pid).get();
      if (!doc.exists || (doc.data() as any).vendorId !== vendorId) {
        return res.status(404).json({ error: "المنتج غير موجود" });
      }
      const inStock = req.body.inStock === true || req.body.inStock === "true";
      await db.collection("vendorProducts").doc(pid).update({
        inStock,
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true, inStock });
    } catch (err) {
      console.error("product availability:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── ADMIN: Vendor Partner Commission ─────────────────────────────────────────
  app.put("/api/admin/vendor-partners/:id/commission", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const id = req.params.id as string;
      const rate = Number(req.body.commissionPercent);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ error: "نسبة العمولة يجب أن تكون بين 0 و 100" });
      }
      const doc = await db.collection("vendors").doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: "المتجر غير موجود" });
      await db.collection("vendors").doc(id).update({
        commissionPercent: rate,
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true, commissionPercent: rate });
    } catch (err) {
      console.error("vendor commission update:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── Admin: Seed demo stores and products (dev/staging only) ────────────────
  app.post("/api/admin/seed-demo-stores", async (_req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "هذا الإجراء غير متاح في بيئة الإنتاج" });
    }
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const now = new Date().toISOString();
      const uid = () => `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      interface DemoProduct { name: string; description: string; price: number; category: string; categoryId: string; stock: number; unit: string; imageUrl: string; }
      interface DemoStore { storeName: string; businessType: string; ownerName: string; phoneNumber: string; address: string; profileImageUrl: string; coverImageUrl: string; bio: string; products: DemoProduct[]; }

      const demoStores: DemoStore[] = [
        // ── سوبرماركت اون واي ──────────────────────────────────────────────────
        {
          storeName: "سوبرماركت اون واي",
          businessType: "supermarket",
          ownerName: "أحمد السوبرماركت",
          phoneNumber: "07700000001",
          address: "شارع الرشيد، بغداد",
          profileImageUrl: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=400&q=80",
          coverImageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80",
          bio: "سوبرماركت متكامل يوفر كل احتياجاتك اليومية بجودة عالية وأسعار مناسبة",
          products: [
            // خضروات وفواكه
            { name: "طماطم طازجة", description: "طماطم طازجة 1 كيلو مباشرة من المزرعة", price: 3000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 100, unit: "كيلو", imageUrl: "https://images.unsplash.com/photo-1546470427-e26264be0b11?w=400&q=80" },
            { name: "خيار", description: "خيار طازج 1 كيلو", price: 2500, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 80, unit: "كيلو", imageUrl: "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&q=80" },
            { name: "فراولة طازجة", description: "فراولة طازجة 500 جرام موسمية", price: 6000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 40, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&q=80" },
            { name: "موز", description: "موز طازج 1 كيلو", price: 4000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 60, unit: "كيلو", imageUrl: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&q=80" },
            { name: "تفاح أحمر", description: "تفاح أحمر 1 كيلو", price: 5000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 70, unit: "كيلو", imageUrl: "https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?w=400&q=80" },
            { name: "بطاطا", description: "بطاطا طازجة 1 كيلو", price: 2500, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 90, unit: "كيلو", imageUrl: "https://images.unsplash.com/photo-1518977676601-b53f82ber8a3?w=400&q=80" },
            // ألبان وأجبان
            { name: "حليب طازج", description: "حليب طازج كامل الدسم 1 لتر", price: 3500, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 50, unit: "لتر", imageUrl: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80" },
            { name: "جبن أبيض", description: "جبن أبيض طازج 500 جرام", price: 5000, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 35, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400&q=80" },
            { name: "بيض دجاج", description: "بيض دجاج بلدي 12 حبة", price: 6000, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 45, unit: "كرتونة", imageUrl: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=80" },
            { name: "لبن رائب", description: "لبن رائب كامل الدسم 500 جرام", price: 2500, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 60, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&q=80" },
            // مشروبات
            { name: "ماء معدني", description: "ماء معدني نقي 1.5 لتر", price: 1000, category: "المشروبات", categoryId: "beverages", stock: 200, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&q=80" },
            { name: "عصير برتقال طبيعي", description: "عصير برتقال طبيعي 1 لتر", price: 4000, category: "المشروبات", categoryId: "beverages", stock: 30, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80" },
            { name: "مشروب غازي", description: "مشروب غازي كولا 355 مل", price: 1500, category: "المشروبات", categoryId: "beverages", stock: 120, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&q=80" },
            { name: "عصير مانجا", description: "عصير مانجا طبيعي 1 لتر", price: 4500, category: "المشروبات", categoryId: "beverages", stock: 25, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&q=80" },
            // سناكس
            { name: "شيبس مملح", description: "شيبس مقرمش بالملح 150 جرام", price: 2000, category: "سناكس ومقرمشات", categoryId: "snacks-sweets", stock: 80, unit: "كيس", imageUrl: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&q=80" },
            { name: "شوكولاتة حليب", description: "شوكولاتة بالحليب 100 جرام", price: 3000, category: "سناكس ومقرمشات", categoryId: "snacks-sweets", stock: 60, unit: "قطعة", imageUrl: "https://images.unsplash.com/photo-1548907040-4baa42d10919?w=400&q=80" },
            { name: "بسكويت شاي", description: "بسكويت للشاي 400 جرام", price: 2500, category: "سناكس ومقرمشات", categoryId: "snacks-sweets", stock: 70, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80" },
            // شاي وقهوة
            { name: "شاي أسود", description: "شاي أسود فاخر 200 جرام", price: 5000, category: "شاي وقهوة", categoryId: "tea-coffee", stock: 40, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80" },
            { name: "قهوة عربية", description: "قهوة عربية أصيلة بالهيل 250 جرام", price: 8000, category: "شاي وقهوة", categoryId: "tea-coffee", stock: 25, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80" },
            { name: "نسكافيه", description: "نسكافيه كلاسيك 200 جرام", price: 9000, category: "شاي وقهوة", categoryId: "tea-coffee", stock: 30, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1498804103079-a6351b050096?w=400&q=80" },
            // منظفات
            { name: "سائل غسيل ملابس", description: "سائل غسيل قوي 3 لتر", price: 7000, category: "المنظفات", categoryId: "cleaning-care", stock: 35, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1585421514738-01798e348b17?w=400&q=80" },
            { name: "صابون يدين", description: "صابون سائل لليدين 500 مل", price: 3000, category: "المنظفات", categoryId: "cleaning-care", stock: 50, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1584515933487-779824d29309?w=400&q=80" },
            { name: "منظف للأرضيات", description: "منظف أرضيات بعطر الليمون 2 لتر", price: 5000, category: "المنظفات", categoryId: "cleaning-care", stock: 28, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80" },
            // مواد غذائية
            { name: "أرز بسمتي", description: "أرز بسمتي فاخر 5 كيلو", price: 12000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 40, unit: "كيس", imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80" },
            { name: "زيت نباتي", description: "زيت نباتي صافي 1.5 لتر", price: 8000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 45, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&q=80" },
            { name: "دقيق قمح", description: "دقيق قمح أبيض 2 كيلو", price: 6000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 55, unit: "كيس", imageUrl: "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80" },
            { name: "سكر أبيض", description: "سكر أبيض ناعم 2 كيلو", price: 5000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 60, unit: "كيس", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80" },
          ],
        },
        // ── مطعم الرائد ────────────────────────────────────────────────────────
        {
          storeName: "مطعم الرائد العراقي",
          businessType: "restaurant",
          ownerName: "محمد الرائد",
          phoneNumber: "07700000002",
          address: "شارع المتنبي، بغداد",
          profileImageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&q=80",
          coverImageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80",
          bio: "مطعم عراقي أصيل يقدم أشهى الأكلات التراثية بنكهات عراقية حقيقية",
          products: [
            { name: "كباب عراقي", description: "كباب لحم مشوي مع الخبز العراقي وصحن السلطة", price: 12000, category: "المشويات", categoryId: "restaurants", stock: 50, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&q=80" },
            { name: "تكا مشوية", description: "تكا لحم بقري مشوي على الجمر 4 قطع", price: 15000, category: "المشويات", categoryId: "restaurants", stock: 40, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1544025162-d76538775176?w=400&q=80" },
            { name: "قوزي عراقي", description: "قوزي لحم ضأن مع الأرز والزبيب", price: 25000, category: "الأكلات العراقية", categoryId: "restaurants", stock: 20, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&q=80" },
            { name: "دولمة عراقية", description: "دولمة محشية بالأرز واللحم المفروم", price: 14000, category: "الأكلات العراقية", categoryId: "restaurants", stock: 30, unit: "طبق", imageUrl: "https://images.unsplash.com/photo-1512003867696-6d5ce6835040?w=400&q=80" },
            { name: "مسقوف", description: "سمك مسقوف طازج مشوي على الجمر", price: 22000, category: "الأسماك", categoryId: "restaurants", stock: 15, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&q=80" },
            { name: "شوربة عراقية", description: "شوربة لحم مع الخضروات الطازجة", price: 7000, category: "الشوربات", categoryId: "restaurants", stock: 35, unit: "طبق", imageUrl: "https://images.unsplash.com/photo-1547592180-85f173990554?w=400&q=80" },
            { name: "برياني دجاج", description: "برياني دجاج بالبهارات الهندية مع الزبيب", price: 13000, category: "الأرز", categoryId: "restaurants", stock: 25, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400&q=80" },
            { name: "فلافل وحمص", description: "فلافل مقرمش مع حمص وخبز عربي", price: 5000, category: "المقبلات", categoryId: "restaurants", stock: 60, unit: "طبق", imageUrl: "https://images.unsplash.com/photo-1593001874117-c99c800e3eb6?w=400&q=80" },
            { name: "جوزة مشوية", description: "جوزة دجاج كاملة مع البهارات والليمون", price: 18000, category: "الدجاج", categoryId: "restaurants", stock: 20, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1598103442097-8b74394b95c3?w=400&q=80" },
            { name: "لقيمات بالعسل", description: "لقيمات عراقية أصيلة مع العسل والسمسم", price: 6000, category: "الحلويات", categoryId: "restaurants", stock: 40, unit: "طبق", imageUrl: "https://images.unsplash.com/photo-1551024506-0bccd828d307?w=400&q=80" },
          ],
        },
        // ── مطعم الشاورما الذهبي ────────────────────────────────────────────────
        {
          storeName: "مطعم الشاورما الذهبي",
          businessType: "restaurant",
          ownerName: "كريم الشاورماجي",
          phoneNumber: "07700000004",
          address: "شارع الكرادة، بغداد",
          profileImageUrl: "https://images.unsplash.com/photo-1561050501-a45f7268ce8c?w=400&q=80",
          coverImageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80",
          bio: "أشهى شاورما وبرغر في بغداد — مكونات طازجة، نكهات لا تُنسى",
          products: [
            // شاورما
            { name: "شاورما دجاج", description: "شاورما دجاج مشوي بالخبز العربي مع صوص الثوم والخضار الطازجة", price: 7000, category: "شاورما", categoryId: "restaurants", stock: 80, unit: "ساندويتش", imageUrl: "https://images.unsplash.com/photo-1561050501-a45f7268ce8c?w=400&q=80" },
            { name: "شاورما لحم", description: "شاورما لحم غنم مشوي بالبهارات والليمون وصوص الطحينة", price: 9000, category: "شاورما", categoryId: "restaurants", stock: 60, unit: "ساندويتش", imageUrl: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&q=80" },
            { name: "شاورما مشكل", description: "شاورما دجاج ولحم معاً مع صوص الثوم والحار", price: 10000, category: "شاورما", categoryId: "restaurants", stock: 50, unit: "ساندويتش", imageUrl: "https://images.unsplash.com/photo-1517360981392-25bc36f51d78?w=400&q=80" },
            { name: "صحن شاورما", description: "شاورما دجاج مقطعة مع خبز وبطاطا مقلية وسلطة", price: 14000, category: "شاورما", categoryId: "restaurants", stock: 40, unit: "صحن", imageUrl: "https://images.unsplash.com/photo-1556269923-e4ef51d69638?w=400&q=80" },
            // برغر
            { name: "برغر كلاسيك", description: "برغر لحم بقري 180 جرام مع جبن، خس، طماطم، وصوص خاص", price: 11000, category: "برغر", categoryId: "restaurants", stock: 55, unit: "ساندويتش", imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&q=80" },
            { name: "برغر دبل", description: "دبل برغر لحم مع دبل جبن وبيضة مقلية وصوص BBQ", price: 15000, category: "برغر", categoryId: "restaurants", stock: 40, unit: "ساندويتش", imageUrl: "https://images.unsplash.com/photo-1607013251379-e6eecfffe234?w=400&q=80" },
            { name: "برغر دجاج كريسبي", description: "فيليه دجاج مقرمش مقلي مع صوص الحار والخس", price: 10000, category: "برغر", categoryId: "restaurants", stock: 50, unit: "ساندويتش", imageUrl: "https://images.unsplash.com/photo-1587329310686-91414b8e3cb7?w=400&q=80" },
            // وجبات
            { name: "وجبة برغر + بطاطا + مشروب", description: "برغر كلاسيك مع بطاطا مقلية كبيرة ومشروب غازي 500 مل", price: 16000, category: "وجبات", categoryId: "restaurants", stock: 45, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=400&q=80" },
            { name: "وجبة شاورما + بطاطا + مشروب", description: "شاورما دجاج مع بطاطا مقلية ومشروب غازي", price: 13000, category: "وجبات", categoryId: "restaurants", stock: 50, unit: "وجبة", imageUrl: "https://images.unsplash.com/photo-1513442542250-854d436a73f2?w=400&q=80" },
            { name: "عائلي شاورما (4 أشخاص)", description: "4 ساندويتشات شاورما مشكل + 4 بطاطا + 4 مشروبات", price: 45000, category: "وجبات عائلية", categoryId: "restaurants", stock: 20, unit: "طلبية", imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&q=80" },
            // إضافات وسلطات
            { name: "بطاطا مقلية كبيرة", description: "بطاطا مقلية مقرمشة مع صوص الكيتشب والمايونيز", price: 4000, category: "إضافات", categoryId: "restaurants", stock: 100, unit: "طبق", imageUrl: "https://images.unsplash.com/photo-1576107232684-1279f390859f?w=400&q=80" },
            { name: "سلطة عربية", description: "طماطم، خيار، بصل، بقدونس مع زيت زيتون وليمون", price: 3500, category: "سلطات", categoryId: "restaurants", stock: 60, unit: "طبق", imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80" },
            { name: "صوص ثوم كبير", description: "صوص ثوم كريمي منزلي الصنع 200 مل", price: 2500, category: "إضافات", categoryId: "restaurants", stock: 80, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=400&q=80" },
            // مشروبات
            { name: "عصير ليمون بالنعناع", description: "عصير ليمون طازج بالنعناع والثلج 500 مل", price: 3500, category: "مشروبات", categoryId: "restaurants", stock: 70, unit: "كوب", imageUrl: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80" },
            { name: "ميلك شيك شوكولاتة", description: "ميلك شيك شوكولاتة بالآيس كريم والكريمة", price: 5000, category: "مشروبات", categoryId: "restaurants", stock: 35, unit: "كوب", imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&q=80" },
          ],
        },
        // ── صيدلية الشفاء ──────────────────────────────────────────────────────
        {
          storeName: "صيدلية الشفاء",
          businessType: "pharmacy",
          ownerName: "د. علي الشفاء",
          phoneNumber: "07700000003",
          address: "شارع حيفا، بغداد",
          profileImageUrl: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=400&q=80",
          coverImageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800&q=80",
          bio: "صيدلية متكاملة توفر الأدوية ومستلزمات العناية الصحية بأسعار مناسبة",
          products: [
            { name: "باراسيتامول 500 مغ", description: "أقراص مسكن للألم وخافض للحرارة 20 قرص", price: 3500, category: "مسكنات الألم", categoryId: "pharmacy", stock: 100, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80" },
            { name: "فيتامين سي 1000", description: "فيتامين سي أقراص فوارة لتعزيز المناعة", price: 8000, category: "الفيتامينات", categoryId: "pharmacy", stock: 60, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=400&q=80" },
            { name: "بانادول اكسترا", description: "مسكن قوي للصداع وآلام الجسم", price: 4500, category: "مسكنات الألم", categoryId: "pharmacy", stock: 80, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=400&q=80" },
            { name: "كريم ترطيب يومي", description: "كريم مرطب للبشرة الجافة 100 مل", price: 12000, category: "العناية بالبشرة", categoryId: "pharmacy", stock: 35, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&q=80" },
            { name: "شامبو للشعر الجاف", description: "شامبو مرطب للشعر الجاف والتالف 400 مل", price: 9000, category: "العناية بالشعر", categoryId: "pharmacy", stock: 40, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1571782442574-82e0b7aea0da?w=400&q=80" },
            { name: "كمامات طبية", description: "كمامات طبية ثلاثية الطبقات 50 قطعة", price: 7000, category: "مستلزمات طبية", categoryId: "pharmacy", stock: 55, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&q=80" },
            { name: "جل مطهر لليدين", description: "جل كحولي مطهر لليدين 300 مل", price: 5000, category: "مستلزمات طبية", categoryId: "pharmacy", stock: 70, unit: "قارورة", imageUrl: "https://images.unsplash.com/photo-1584362917165-526a968579e8?w=400&q=80" },
            { name: "ضمادات طبية", description: "ضمادات لاصقة معقمة مختلفة الأحجام 20 قطعة", price: 3000, category: "مستلزمات طبية", categoryId: "pharmacy", stock: 90, unit: "علبة", imageUrl: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=400&q=80" },
          ],
        },
      ];

      let totalVendors = 0;
      let totalProducts = 0;
      const createdStores: string[] = [];

      for (const store of demoStores) {
        // Check if demo store already exists
        const existing = await db.collection("vendors").where("phoneNumber", "==", store.phoneNumber).limit(1).get();
        let vendorDocId: string;

        if (!existing.empty) {
          vendorDocId = existing.docs[0].id;
        } else {
          vendorDocId = uid();
          await db.collection("vendors").doc(vendorDocId).set({
            id: vendorDocId,
            storeName: store.storeName,
            businessType: store.businessType,
            phoneNumber: store.phoneNumber,
            email: null,
            passwordHash: "$2b$10$demoHashNotUsedForLogin00000000000000000000000000000",
            ownerName: store.ownerName,
            address: store.address,
            profileImageUrl: store.profileImageUrl,
            coverImageUrl: store.coverImageUrl,
            bio: store.bio,
            status: "active",
            totalProducts: store.products.length,
            totalOrders: 0,
            createdAt: now,
            updatedAt: now,
          });
          totalVendors++;
        }
        createdStores.push(store.storeName);

        // Delete existing products for this vendor and re-seed
        const existingProducts = await db.collection("vendorProducts").where("vendorId", "==", vendorDocId).get();
        if (!existingProducts.empty) {
          const delBatch = db.batch();
          existingProducts.docs.forEach(d => delBatch.delete(d.ref));
          await delBatch.commit();
        }

        // Add all products in batches of 500
        const productBatch = db.batch();
        for (const p of store.products) {
          const pid = uid();
          productBatch.set(db.collection("vendorProducts").doc(pid), {
            id: pid,
            vendorId: vendorDocId,
            vendorName: store.storeName,
            storeName: store.storeName,
            vendorPhone: store.phoneNumber,
            name: p.name,
            description: p.description,
            price: p.price,
            category: p.category,
            categoryId: p.categoryId,
            stock: p.stock,
            unit: p.unit,
            imageUrl: p.imageUrl,
            imageUrls: [p.imageUrl],
            status: "approved",
            approvedAt: now,
            createdAt: now,
            updatedAt: now,
          });
          totalProducts++;
        }
        await productBatch.commit();
      }

      invalidateVendorsCache(); invalidateStoresCache();
      res.json({ success: true, totalVendors, totalProducts, stores: createdStores });
    } catch (err: any) {
      console.error("seed demo stores:", err);
      res.status(500).json({ error: err.message || "فشل إنشاء البيانات التجريبية" });
    }
  });

  // ── Admin: Delete a vendor (store) and all its products ────────────────────
  app.delete("/api/admin/vendor-partners/:id", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const id = req.params.id as string;
      const vendorDoc = await db.collection("vendors").doc(id).get();
      if (!vendorDoc.exists) return res.status(404).json({ error: "المتجر غير موجود" });
      const productsSnap = await db.collection("vendorProducts").where("vendorId", "==", id).get();

      // Collect all image URLs before deleting (vendor logo/cover + all product images)
      const vendorData = vendorDoc.data() as any;
      const storageUrlsToDelete: string[] = [
        vendorData?.profileImageUrl ?? "",
        vendorData?.coverImageUrl ?? "",
        ...productsSnap.docs.flatMap(d => {
          const p = d.data() as any;
          return [...(p?.imageUrls ?? []), p?.imageUrl ?? ""];
        }),
      ].filter(Boolean);

      const batch = db.batch();
      productsSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(db.collection("vendors").doc(id));
      await batch.commit();

      // Fire-and-forget: clean up Storage files (best-effort, non-blocking)
      Promise.allSettled(storageUrlsToDelete.map(u => deleteFromFirebaseStorage(u))).catch(() => {});

      invalidateVendorsCache(); invalidateStoresCache();
      res.json({ success: true, deletedProducts: productsSnap.size });
    } catch (err) {
      console.error("admin delete vendor partner:", err);
      res.status(500).json({ error: "فشل حذف المتجر" });
    }
  });

  // ── Admin: Reset a vendor's rating to null (no rating yet) ────────────────
  app.delete("/api/admin/vendor-partners/:id/rating", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const id = req.params.id as string;
      const vendorRef = db.collection("vendors").doc(id);
      const doc = await vendorRef.get();
      if (!doc.exists) return res.status(404).json({ error: "المتجر غير موجود" });
      await vendorRef.update({ rating: null, ratingCount: 0 });
      invalidateVendorsCache(); invalidateStoresCache();
      res.json({ success: true, message: "تم إعادة تعيين التقييم" });
    } catch (err) {
      console.error("admin reset vendor rating:", err);
      res.status(500).json({ error: "فشل إعادة تعيين التقييم" });
    }
  });

  // ── Admin: Override a vendor's rating ──────────────────────────────────────
  app.put("/api/admin/vendor-partners/:id/rating", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const id = req.params.id as string;
      const { rating } = req.body;
      if (rating === undefined || rating === null || rating === "") {
        return res.status(400).json({ error: "يرجى إدخال قيمة التقييم" });
      }
      const numRating = Number(rating);
      if (isNaN(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
      }
      const vendorRef = db.collection("vendors").doc(id);
      const doc = await vendorRef.get();
      if (!doc.exists) return res.status(404).json({ error: "المتجر غير موجود" });
      await vendorRef.update({ rating: numRating });
      invalidateVendorsCache(); invalidateStoresCache();
      res.json({ success: true, rating: numRating });
    } catch (err) {
      console.error("admin override vendor rating:", err);
      res.status(500).json({ error: "فشل تحديث التقييم" });
    }
  });

  // ── Admin: Get all products for a specific vendor ──────────────────────────
  app.get("/api/admin/vendor-partners/:id/products", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const id = req.params.id as string;
      const [vendorDoc, productsSnap] = await Promise.all([
        db.collection("vendors").doc(id).get(),
        db.collection("vendorProducts").where("vendorId", "==", id).get(),
      ]);
      if (!vendorDoc.exists) return res.status(404).json({ error: "المتجر غير موجود" });
      const v = vendorDoc.data() as any;
      const store = {
        id: vendorDoc.id,
        storeName: v.storeName || "",
        businessType: v.businessType || "",
        address: v.address || "",
        phoneNumber: v.phoneNumber || "",
        commissionPercent: v.commissionPercent ?? 10,
        profileImageUrl: v.profileImageUrl || "",
        status: v.status || "",
      };
      const products = productsSnap.docs.map((d) => {
        const p = d.data() as any;
        return {
          id: d.id,
          name: p.name || "",
          description: p.description || "",
          price: p.price || 0,
          imageUrl: p.imageUrl || (p.imageUrls?.[0] ?? ""),
          status: p.status || "",
          category: p.category || "",
          stock: p.stock ?? 0,
          createdAt: p.createdAt || "",
        };
      }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      res.json({ store, products, total: products.length });
    } catch (err) {
      console.error("admin vendor products:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── Admin: Delete a vendor product ─────────────────────────────────────────
  app.delete("/api/admin/vendor-products/:productId", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const productId = req.params.productId as string;
      const doc = await db.collection("vendorProducts").doc(productId).get();
      if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
      const data = doc.data() as any;
      // Collect all image URLs before deleting
      const imageUrls: string[] = [
        ...(data?.imageUrls ?? []),
        data?.imageUrl ?? "",
      ].filter(Boolean);
      await db.collection("vendorProducts").doc(productId).delete();
      // Fire-and-forget: clean up Storage files (best-effort, non-blocking)
      Promise.allSettled(imageUrls.map(u => deleteFromFirebaseStorage(u))).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error("admin delete vendor product:", err);
      res.status(500).json({ error: "فشل حذف المنتج" });
    }
  });

  // ── Unified TTL Cache Layer ────────────────────────────────────────────────
  const PRODUCTS_CACHE_TTL   = 3  * 60 * 1000; // 3 min
  const CATEGORIES_CACHE_TTL = 2  * 60 * 1000; // 2 min
  const BANNERS_CACHE_TTL    = 2  * 60 * 1000; // 2 min
  const STORES_CACHE_TTL     = 30 * 1000;       // 30 sec (real-time open/close)

  let productsCache: any[] | null = null;
  let productsCacheTime = 0;

  let categoriesCache: any[] | null = null;
  let categoriesCacheTime = 0;

  let bannersCache: any[] | null = null;
  let bannersCacheTime = 0;

  let storesCache: any[] | null = null;
  let storesCacheTime = 0;

  async function getCachedProducts(categoryId?: string): Promise<any[]> {
    const now = Date.now();
    if (!productsCache || now - productsCacheTime > PRODUCTS_CACHE_TTL) {
      const db = getFirestore();
      if (db) {
        const result = await getFirestoreProducts();
        productsCache = result.map(p => {
          const item: any = { ...p, image: limitImageSize(p.image) };
          if (item.categoryId === "restaurants" && !item.restaurant) {
            item.restaurant = "يلا ايت";
          }
          return item;
        });
      } else {
        productsCache = [...products];
      }
      productsCacheTime = now;
    }
    if (categoryId) {
      return productsCache!.filter(p => p.categoryId === categoryId);
    }
    return productsCache!;
  }

  async function getCachedCategories(): Promise<any[]> {
    const now = Date.now();
    if (!categoriesCache || now - categoriesCacheTime > CATEGORIES_CACHE_TTL) {
      const db = getFirestore();
      if (db) {
        const result = await getFirestoreCategories();
        categoriesCache = result.map(c => ({ ...c, image: limitImageSize(c.image) }));
      } else {
        categoriesCache = [...categories].sort((a, b) => a.order - b.order);
      }
      categoriesCacheTime = now;
    }
    return categoriesCache!;
  }

  async function getCachedBanners(activeOnly: boolean): Promise<any[]> {
    const now = Date.now();
    if (!bannersCache || now - bannersCacheTime > BANNERS_CACHE_TTL) {
      const result = await getFirestoreBanners(true);
      bannersCache = result.map(b => ({
        ...b,
        image: limitImageSize(b.image, 100000),
      }));
      bannersCacheTime = now;
    }
    return activeOnly ? bannersCache!.filter(b => (b as any).isActive !== false) : bannersCache!;
  }

  async function getCachedStores(): Promise<any[]> {
    const now = Date.now();
    if (!storesCache || now - storesCacheTime > STORES_CACHE_TTL) {
      const db = getFirestore();
      if (!db) return [];
      const snap = await db.collection("vendors").where("status", "==", "active").get();
      storesCache = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: v.id, storeName: v.storeName, businessType: v.businessType,
          address: v.address || "", bio: v.bio || "",
          totalProducts: v.totalProducts || 0,
          approvedAt: v.approvedAt || v.createdAt || "",
          profileImageUrl: limitImageSize(v.profileImageUrl || "", 80000),
          coverImageUrl: limitImageSize(v.coverImageUrl || "", 80000),
          rating: v.rating ?? null,
          ratingCount: v.ratingCount ?? 0,
          deliveryTime: v.deliveryTime || "30-45",
          deliveryPrice: v.deliveryPrice ?? 0,
          workingHours: v.workingHours || null,
          hasDelivery: v.hasDelivery ?? true,
          minOrder: v.minOrder ?? 0,
          openTime: v.openTime || "",
          closeTime: v.closeTime || "",
          description: v.description || "",
          categoryType: v.categoryType || "",
        };
      });
      storesCacheTime = now;
    }
    return storesCache!;
  }

  function invalidateProductsCache() {
    productsCache = null;
    productsCacheTime = 0;
  }

  function invalidateCategoriesCache() {
    categoriesCache = null;
    categoriesCacheTime = 0;
  }

  function invalidateBannersCache() {
    bannersCache = null;
    bannersCacheTime = 0;
  }

  function invalidateStoresCache() {
    storesCache = null;
    storesCacheTime = 0;
  }

  // FIFO driver queue (in-memory)
  interface QueuedDriver {
    phoneNumber: string;
    joinedAt: number;
    currentBatchId?: string;
    lastSeenAt?: number;
    pushToken?: string; // cached in memory so no Firestore lookup needed on batch assign
  }
  const driverQueue: QueuedDriver[] = [];
  const driverAssignments: Map<string, string> = new Map(); // orderId → driverPhone
  const batchedOrderIds = new Set<string>(); // orderIds currently in active batches
  const driverCompletedOrders: Map<string, { orderId: string; deliveryFee: number; driverEarning: number; ownerEarning: number; total: number; customerName: string; completedAt: string; isRestaurant: boolean }[]> = new Map();
  const driverLocations: Map<string, { lat: number; lng: number; updatedAt: number; fullName?: string }> = new Map();

  // Rejection cooldown: track which orders each driver has recently rejected
  // Prevents immediate re-assignment of the same order to the same driver
  const driverRejectionCooldowns: Map<string, Map<string, number>> = new Map();
  const REJECTION_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes before re-offering same order

  // In-memory log of recent batch rejections for admin real-time awareness
  interface RejectionEvent {
    id: string;
    driverPhone: string;
    driverName: string;
    batchId: string;
    orderCount: number;
    rejectedAt: string;
  }
  const rejectionEvents: RejectionEvent[] = [];

  // Returns completed orders merged from Firestore (persistent) + in-memory cache
  async function getCompletedOrders(phoneNumber: string) {
    const dbOrders = await getDriverCompletedOrdersFromDB(phoneNumber);
    const memOrders = driverCompletedOrders.get(phoneNumber) || [];
    // Merge: Firestore is source of truth, add any in-memory not yet persisted
    const dbIds = new Set(dbOrders.map(o => o.orderId));
    const extra = memOrders.filter(o => !dbIds.has(o.orderId));
    return [...dbOrders, ...extra];
  }

  async function checkIsRestaurantOrder(order: any): Promise<boolean> {
    try {
      // Fast path: already tagged on the order
      if (order.vendorId) return true;
      if (order.orderType === "restaurant") return true;
      // Scan items using cached products (includes restaurant fallback)
      const products = await getCachedProducts();
      if (products.length > 0 && order.items) {
        for (const item of order.items) {
          const product = products.find((p: any) => p.id === item.productId);
          if (product && product.categoryId === "restaurants") return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  // Initialize defaults in Firestore if empty
  await initializeDefaultCategories(categories);
  await initializeDefaultBanners(banners);
  await initializeDefaultDeliveryAreas(deliveryAreas);
  await initializeDefaultVendors(defaultVendors);

  // Rebuild driver queue from Firestore activeDriverQueue collection.
  // This is the source of truth across server restarts — replaces the old
  // getOnlineDrivers() approach that used driver document flags.
  try {
    const queueEntries = await getActiveDriverQueue(); // ordered by joinedAt ASC (FIFO)
    for (const entry of queueEntries) {
      if (!driverQueue.find(q => q.phoneNumber === entry.phoneNumber)) {
        driverQueue.push({
          phoneNumber: entry.phoneNumber,
          joinedAt: entry.joinedAt,
          lastSeenAt: Date.now(),
          pushToken: entry.pushToken ?? undefined,
        });
      }
    }
    console.log(`[QUEUE_RESTORE] Restored ${driverQueue.length} driver(s) from activeDriverQueue`);
    if (driverQueue.length > 0) {
      try {
        const db = getFirestore();
        if (db) {
          // Restore active batches — but ONLY if their orders are still undelivered
          const batchSnap = await db.collection("delivery_batches")
            .where("status", "in", ["pending", "in_progress"])
            .get();
          const allOrdersForRestore = await getOrders();
          for (const bDoc of batchSnap.docs) {
            const bData = bDoc.data() as DeliveryBatch;
            // Check if all orders in this batch are already completed
            const batchOrderStatuses = (bData.orderIds || []).map(oid => {
              const o = allOrdersForRestore.find(x => x.id === oid);
              return o ? o.status : "delivered"; // treat missing orders as delivered
            });
            const allDone = batchOrderStatuses.every(s => s === "delivered" || s === "cancelled" || s === "issue");
            if (allDone) {
              // Mark stale batch as completed so it won't block drivers
              db.collection("delivery_batches").doc(bDoc.id)
                .update({ status: "completed", updatedAt: new Date() })
                .catch(() => {});
              // Clear hasActiveBatch in Firestore for this driver (if they have no other active batch)
              if (bData.driverId) {
                updateDriverQueueEntry(bData.driverId, { hasActiveBatch: false, joinedAt: Date.now() }).catch(() => {});
              }
              continue;
            }
            const driverPhone = bData.driverId; // driverId = phone number
            const qd = driverQueue.find(d => d.phoneNumber === driverPhone);
            if (qd && !qd.currentBatchId) {
              qd.currentBatchId = bDoc.id;
              qd.lastSeenAt = Date.now();
              bData.orderIds.forEach(id => batchedOrderIds.add(id));
            }
          }
          // For drivers without a batch, assign waiting confirmed orders
          const allOrders = await getOrders();
          for (const qd of driverQueue) {
            if (!qd.currentBatchId) {
              const waitingOrders = allOrders
                .filter(o => o.status === "confirmed" && !batchedOrderIds.has(o.id))
                .sort((a, b) => {
                  const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
                  const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
                  return aTime - bTime;
                })
                .slice(0, 3);
              if (waitingOrders.length > 0) {
                const orderIds = waitingOrders.map(o => o.id);
                const batchId = await createDeliveryBatch({ driverPhone: qd.phoneNumber, orderIds });
                if (batchId) {
                  qd.currentBatchId = batchId;
                  qd.lastSeenAt = Date.now();
                  orderIds.forEach(id => batchedOrderIds.add(id));
                  updateDriverQueueEntry(qd.phoneNumber, { hasActiveBatch: true }).catch(() => {});
                }
              }
            }
          }
        }
      } catch (e2) {
        console.error("Failed to restore batches:", e2);
      }
    }
  } catch (e) {
    console.error("Failed to restore driver queue:", e);
  }
  
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  }, express.static(uploadsDir));

  function limitImageSize(img: string | undefined, maxLen = 50000): string {
    if (!img) return "";
    if (img.length <= maxLen) return img;
    if (img.startsWith("data:image")) return "";
    return img;
  }

  app.get("/api/categories", async (req, res) => {
    try {
      const cached = await getCachedCategories();
      res.set("Cache-Control", "public, max-age=120");
      res.set("Vary", "Accept-Encoding");
      return res.json(cached);
    } catch (error) {
      console.error("Error fetching categories:", error);
      const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
      res.json(sortedCategories);
    }
  });

  app.get("/api/categories/:id", async (req, res) => {
    try {
      const db = getFirestore();
      if (db) {
        const firestoreCategories = await getFirestoreCategories();
        const category = firestoreCategories.find(c => c.id === req.params.id);
        if (category) {
          return res.json(category);
        }
      }
      // Fallback to in-memory
      const category = categories.find(c => c.id === req.params.id);
      if (category) {
        res.json(category);
      } else {
        res.status(404).json({ error: "Category not found" });
      }
    } catch (error) {
      const category = categories.find(c => c.id === req.params.id);
      if (category) {
        res.json(category);
      } else {
        res.status(404).json({ error: "Category not found" });
      }
    }
  });

  // Firebase Storage bucket is not provisioned for this project, so admin images
  // (banners/categories/products) are compressed and embedded as Base64 data URIs
  // directly in Firestore — same strategy used for vendor product/profile images.
  const ADMIN_IMAGE_SIZE_CONFIG: Record<string, { width: number; height?: number; quality: number }> = {
    banner: { width: 1000, quality: 70 },
    category: { width: 500, quality: 65 },
    product: { width: 700, quality: 68 },
  };

  app.post("/api/admin/upload-image", uploadWebP.single("image"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "لم يتم رفع أي صورة" });
      }
      const fileBuffer = req.file.buffer;
      // Content-hash deduplication: reuse the Base64 data URI for identical images
      const contentHash = createHash("sha256").update(fileBuffer).digest("hex");
      const existingUrl = imageHashMap.get(contentHash);
      if (existingUrl) {
        return res.json({ url: existingUrl, size: req.file.size, deduped: true });
      }
      const type = typeof req.body?.type === "string" ? req.body.type : "product";
      const config = ADMIN_IMAGE_SIZE_CONFIG[type] || ADMIN_IMAGE_SIZE_CONFIG.product;
      const resizeOptions: { width: number; height?: number; fit: "cover"; position: "center" } = {
        width: config.width,
        fit: "cover",
        position: "center",
      };
      if (config.height) resizeOptions.height = config.height;
      const webpBuffer = await sharp(fileBuffer)
        .resize(resizeOptions)
        .webp({ quality: config.quality })
        .toBuffer();
      const url = `data:image/webp;base64,${webpBuffer.toString("base64")}`;
      imageHashMap.set(contentHash, url);
      res.json({ url, size: webpBuffer.length });
    } catch (error) {
      console.error("Error processing admin image upload:", error);
      res.status(500).json({ error: "فشل في رفع الصورة" });
    }
  });

  app.get("/api/admin/categories", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (db) {
        const firestoreCategories = await getFirestoreCategories();
        res.set("Cache-Control", "no-store");
        return res.json(firestoreCategories);
      }
      res.set("Cache-Control", "no-store");
      res.json([...categories].sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (error) {
      console.error("Error fetching admin categories:", error);
      res.json([...categories].sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
  });

  app.post("/api/admin/categories", async (req: Request, res: Response) => {
    try {
      const { id, name, productCount, order, image, color, iconColor } = req.body;
      
      const db = getFirestore();
      if (db) {
        const newCategory = await createFirestoreCategory({
          id: id || undefined,
          name,
          image: image || "",
          productCount: parseInt(productCount) || 0,
          order: parseInt(order) || 99,
          color,
          iconColor,
        });
        if (newCategory) {
          invalidateCategoriesCache();
          return res.json(newCategory);
        }
      }
      
      // Fallback to in-memory
      const newCategory: Category = {
        id: id || randomUUID(),
        name,
        image: image || "",
        productCount: parseInt(productCount) || 0,
        order: parseInt(order) || categories.length + 1,
        color,
        iconColor,
      };
      categories.push(newCategory);
      invalidateCategoriesCache();
      res.json(newCategory);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.put("/api/admin/categories/:id", async (req: Request, res: Response) => {
    try {
      const { name, productCount, order, image, color, iconColor } = req.body;
      
      const db = getFirestore();
      if (db) {
        const updated = await updateFirestoreCategory(req.params.id as string, {
          name,
          image,
          productCount: productCount ? parseInt(productCount) : undefined,
          order: order ? parseInt(order) : undefined,
          color,
          iconColor,
        });
        if (updated) {
          invalidateCategoriesCache();
          return res.json(updated);
        }
      }
      
      // Fallback to in-memory
      const index = categories.findIndex(c => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      categories[index] = {
        ...categories[index],
        name: name || categories[index].name,
        image: image || categories[index].image,
        productCount: productCount ? parseInt(productCount) : categories[index].productCount,
        order: order ? parseInt(order) : categories[index].order,
      };
      invalidateCategoriesCache();
      res.json(categories[index]);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  app.delete("/api/admin/categories/:id", async (req, res) => {
    try {
      const db = getFirestore();
      if (db) {
        const deleted = await deleteFirestoreCategory(req.params.id);
        if (deleted) {
          invalidateCategoriesCache();
          return res.json({ success: true });
        }
      }
      
      // Fallback to in-memory
      const index = categories.findIndex(c => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Category not found" });
      }
      categories.splice(index, 1);
      invalidateCategoriesCache();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  const bannerLinks: Record<string, { linkType: string; linkTarget: string }> = {
    "slider-1": { linkType: "screen", linkTarget: "CourierPickup" },
    "slider-2": { linkType: "category", linkTarget: "restaurants" },
    "slider-3": { linkType: "category", linkTarget: "fruits-vegetables" },
    "slider-4": { linkType: "screen", linkTarget: "AllCategories" },
  };

  app.get("/api/banners", async (req, res) => {
    try {
      const type = req.query.type as string;
      let result = await getCachedBanners(true);
      if (type) result = result.filter(b => b.type === type);
      const lightResult = result.map(b => {
        const link = bannerLinks[(b as any).id] || {};
        return {
          ...b,
          linkType: (b as any).linkType || link.linkType || "",
          linkTarget: (b as any).linkTarget || link.linkTarget || "",
        };
      });
      res.set("Cache-Control", "public, max-age=120");
      res.set("Vary", "Accept-Encoding");
      res.json(lightResult);
    } catch (error) {
      console.error("Error getting banners:", error);
      res.json([]);
    }
  });

  app.get("/api/admin/banners", async (req, res) => {
    try {
      const result = await getFirestoreBanners(false);
      const lightResult = result.map(b => ({ ...b, image: limitImageSize(b.image, 100000) }));
      res.json(lightResult);
    } catch (error) {
      console.error("Error getting admin banners:", error);
      res.json([]);
    }
  });

  app.post("/api/admin/banners", async (req: Request, res: Response) => {
    try {
      const { title, type, order, isActive, image } = req.body;
      const banner = await createFirestoreBanner({
        image: image || "",
        title,
        type: type || "slider",
        order: order ? parseInt(order) : undefined,
        isActive: isActive !== false,
      });
      if (!banner) {
        return res.status(500).json({ error: "Failed to create banner" });
      }
      invalidateBannersCache();
      res.json(banner);
    } catch (error) {
      console.error("Error creating banner:", error);
      res.status(500).json({ error: "Failed to create banner" });
    }
  });

  app.put("/api/admin/banners/:id", async (req: Request, res: Response) => {
    try {
      const { title, type, order, isActive, image } = req.body;
      const updates: Record<string, any> = {};
      if (image) updates.image = image;
      if (title !== undefined) updates.title = title;
      if (type) updates.type = type;
      if (order !== undefined) updates.order = parseInt(order);
      if (isActive !== undefined) updates.isActive = isActive;
      
      const banner = await updateFirestoreBanner(req.params.id as string, updates);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
      invalidateBannersCache();
      res.json(banner);
    } catch (error) {
      console.error("Error updating banner:", error);
      res.status(500).json({ error: "Failed to update banner" });
    }
  });

  app.delete("/api/admin/banners/:id", async (req, res) => {
    try {
      const success = await deleteFirestoreBanner(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Banner not found" });
      }
      invalidateBannersCache();
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting banner:", error);
      res.status(500).json({ error: "Failed to delete banner" });
    }
  });

  app.get("/api/products", async (req, res) => {
    const categoryId = req.query.categoryId as string;
    const search = req.query.search as string;
    
    try {
      let result = await getCachedProducts(categoryId);
      if (search) {
        const searchLower = search.toLowerCase();
        result = result.filter(p => 
          p.name.toLowerCase().includes(searchLower) || 
          p.description.toLowerCase().includes(searchLower)
        );
      }
      res.set("Cache-Control", "public, max-age=60");
      res.json(result);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.json([]);
    }
  });

  app.get("/api/admin/products", async (req, res) => {
    try {
      const result = await getCachedProducts();
      res.json(result);
    } catch (error) {
      console.error("Error fetching admin products:", error);
      res.json([]);
    }
  });

  app.post("/api/admin/products", async (req: Request, res: Response) => {
    try {
      if (!req.body) {
        return res.status(400).json({ error: "Request body is empty" });
      }
      
      const { name, categoryId, price, originalPrice, discount, description, inStock, image, restaurant } = req.body;
      const db = getFirestore();
      
      const priceNum = Number(price) || 0;
      const originalPriceNum = originalPrice ? Number(originalPrice) : undefined;
      const discountNum = discount ? Number(discount) : undefined;
      const inStockBool = inStock === 'true' || inStock === true;
      
      if (db) {
        const newProduct = await createFirestoreProduct({
          name: String(name || ""),
          categoryId: String(categoryId || ""),
          price: priceNum,
          originalPrice: originalPriceNum,
          discount: discountNum,
          image: String(image || ""),
          description: String(description || ""),
          inStock: inStockBool,
          restaurant: restaurant ? String(restaurant) : undefined,
        });
        if (newProduct) {
          invalidateProductsCache();
          return res.json(newProduct);
        }
        return res.status(500).json({ error: "Failed to create product in Firestore" });
      }
      
      const newProduct: Product = {
        id: randomUUID(),
        name: String(name || ""),
        categoryId: String(categoryId || ""),
        price: priceNum,
        originalPrice: originalPriceNum,
        discount: discountNum,
        image: String(image || ""),
        description: String(description || ""),
        inStock: inStockBool,
        restaurant: restaurant ? String(restaurant) : undefined,
      };
      products.push(newProduct);
      res.json(newProduct);
    } catch (error: any) {
      console.error("Error in POST /api/admin/products:", error);
      res.status(500).json({ 
        error: error?.message || "Unknown error",
        code: error?.code,
        details: error?.details || error?.toString()
      });
    }
  });

  app.put("/api/admin/products/:id", async (req: Request, res: Response) => {
    const { name, categoryId, price, originalPrice, discount, description, inStock, image, restaurant } = req.body;
    const productId = req.params.id as string;
    const db = getFirestore();
    
    const priceNum = price !== undefined ? Number(price) : undefined;
    const originalPriceNum = originalPrice === null ? null : (originalPrice !== undefined ? Number(originalPrice) : undefined);
    const discountNum = discount === null ? null : (discount !== undefined ? Number(discount) : undefined);
    const inStockBool = inStock !== undefined ? (inStock === 'true' || inStock === true) : undefined;
    
    if (db) {
      const updates: any = {
        name: name !== undefined ? String(name) : undefined,
        categoryId: categoryId !== undefined ? String(categoryId) : undefined,
        price: priceNum,
        originalPrice: originalPriceNum,
        discount: discountNum,
        image: image !== undefined ? String(image) : undefined,
        description: description !== undefined ? String(description) : undefined,
        inStock: inStockBool,
      };
      if (restaurant !== undefined) updates.restaurant = restaurant ? String(restaurant) : "";
      const updated = await updateFirestoreProduct(productId, updates);
      if (updated) {
        invalidateProductsCache();
        return res.json(updated);
      }
      return res.status(404).json({ error: "Product not found" });
    }
    
    const index = products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    products[index] = {
      ...products[index],
      name: name !== undefined ? String(name) : products[index].name,
      categoryId: categoryId !== undefined ? String(categoryId) : products[index].categoryId,
      price: priceNum !== undefined ? priceNum : products[index].price,
      originalPrice: (originalPriceNum !== undefined && originalPriceNum !== null) ? originalPriceNum : (products[index].originalPrice ?? undefined),
      discount: (discountNum !== undefined && discountNum !== null) ? discountNum : (products[index].discount ?? undefined),
      image: image !== undefined ? String(image) : products[index].image,
      description: description !== undefined ? String(description) : products[index].description,
      inStock: inStockBool !== undefined ? inStockBool : products[index].inStock,
      restaurant: restaurant !== undefined ? String(restaurant) : products[index].restaurant,
    };
    res.json(products[index]);
  });

  app.delete("/api/admin/products/:id", async (req, res) => {
    const db = getFirestore();
    if (db) {
      const success = await deleteFirestoreProduct(req.params.id);
      if (success) {
        invalidateProductsCache();
        return res.json({ success: true });
      }
      return res.status(404).json({ error: "Product not found" });
    }
    
    const index = products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    products.splice(index, 1);
    res.json({ success: true });
  });

  app.post("/api/admin/cleanup-orphan-products", async (req: Request, res: Response) => {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
    try {
      const col = (req.query.collection as string) || "vendorProducts";
      let docsToDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];

      if (col === "products") {
        const snap = await db.collection("products").get();
        docsToDelete = snap.docs;
      } else {
        const vendorSnap = await db.collection("vendors").get();
        const validVendorIds = new Set(vendorSnap.docs.map((d) => d.id));
        const vpSnap = await db.collection("vendorProducts").get();
        docsToDelete = vpSnap.docs.filter((d) => {
          const vid = (d.data() as Record<string, unknown>).vendorId;
          return !vid || !validVendorIds.has(vid as string);
        });
      }

      if (docsToDelete.length === 0) {
        return res.json({ deleted: 0, message: "لا توجد منتجات للحذف" });
      }

      // Firestore batch max 500 ops
      const chunks: FirebaseFirestore.QueryDocumentSnapshot[][] = [];
      for (let i = 0; i < docsToDelete.length; i += 400) chunks.push(docsToDelete.slice(i, i + 400));
      for (const chunk of chunks) {
        const batch = db.batch();
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      invalidateProductsCache();
      return res.json({ deleted: docsToDelete.length, message: `تم حذف ${docsToDelete.length} منتج بنجاح` });
    } catch (err) {
      console.error("cleanup-orphan-products:", err);
      res.status(500).json({ error: "حدث خطأ أثناء التنظيف" });
    }
  });

  app.get("/api/delivery-areas", async (req, res) => {
    try {
      const areas = await getFirestoreDeliveryAreas(true);
      res.json(areas);
    } catch (error) {
      console.error("Error getting delivery areas:", error);
      res.json([]);
    }
  });

  app.get("/api/admin/delivery-areas", async (req, res) => {
    try {
      const areas = await getFirestoreDeliveryAreas(false);
      res.json(areas);
    } catch (error) {
      console.error("Error getting admin delivery areas:", error);
      res.json([]);
    }
  });

  app.post("/api/admin/delivery-areas", async (req: Request, res: Response) => {
    try {
      const { name, fee, lat, lng } = req.body;
      const area = await createFirestoreDeliveryArea({
        name,
        fee: parseInt(fee) || 0,
        isActive: true,
        ...(lat !== undefined && lat !== null && lat !== "" && { lat: parseFloat(lat) }),
        ...(lng !== undefined && lng !== null && lng !== "" && { lng: parseFloat(lng) }),
      });
      if (!area) {
        return res.status(500).json({ error: "Failed to create delivery area" });
      }
      res.json(area);
    } catch (error) {
      console.error("Error creating delivery area:", error);
      res.status(500).json({ error: "Failed to create delivery area" });
    }
  });

  app.put("/api/admin/delivery-areas/:id", async (req: Request, res: Response) => {
    try {
      const { name, fee, isActive, lat, lng } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (fee !== undefined) updates.fee = parseInt(fee);
      if (isActive !== undefined) updates.isActive = isActive !== "false" && isActive !== false;
      if (lat !== undefined && lat !== null && lat !== "") updates.lat = parseFloat(lat);
      if (lng !== undefined && lng !== null && lng !== "") updates.lng = parseFloat(lng);
      
      const area = await updateFirestoreDeliveryArea(req.params.id as string, updates);
      if (!area) {
        return res.status(404).json({ error: "Delivery area not found" });
      }
      res.json(area);
    } catch (error) {
      console.error("Error updating delivery area:", error);
      res.status(500).json({ error: "Failed to update delivery area" });
    }
  });

  app.delete("/api/admin/delivery-areas/:id", async (req, res) => {
    try {
      const success = await deleteFirestoreDeliveryArea(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Delivery area not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting delivery area:", error);
      res.status(500).json({ error: "Failed to delete delivery area" });
    }
  });

  // ─── App Settings (Service Fee, etc.) ───────────────────────────────────────
  app.get("/api/settings/fees", async (req, res) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ serviceFee: 500 });
      const snap = await db.collection("appSettings").doc("fees").get();
      const data = snap.exists ? snap.data() : {};
      res.json({ serviceFee: data?.serviceFee ?? 500 });
    } catch (error) {
      console.error("Error getting app fees:", error);
      res.json({ serviceFee: 500 });
    }
  });

  app.put("/api/admin/settings/fees", async (req: Request, res: Response) => {
    try {
      const { serviceFee } = req.body;
      if (typeof serviceFee !== "number" || serviceFee < 0) {
        return res.status(400).json({ error: "قيمة نسبة الخدمة غير صالحة" });
      }
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      await db.collection("appSettings").doc("fees").set({ serviceFee }, { merge: true });
      res.json({ success: true, serviceFee });
    } catch (error) {
      console.error("Error updating app fees:", error);
      res.status(500).json({ error: "Failed to update service fee" });
    }
  });

  // ─── Urgency Thresholds ──────────────────────────────────────────────────────
  app.get("/api/settings/urgency-thresholds", async (req, res) => {
    try {
      const db = getFirestore();
      const defaults = { confirmed: 10, preparing: 25, ready: 15 };
      if (!db) return res.json(defaults);
      const snap = await db.collection("appSettings").doc("urgencyThresholds").get();
      const data = snap.exists ? snap.data() : {};
      res.json({
        confirmed: data?.confirmed ?? defaults.confirmed,
        preparing: data?.preparing ?? defaults.preparing,
        ready: data?.ready ?? defaults.ready,
      });
    } catch (error) {
      console.error("Error getting urgency thresholds:", error);
      res.json({ confirmed: 10, preparing: 25, ready: 15 });
    }
  });

  app.put("/api/admin/settings/urgency-thresholds", async (req: Request, res: Response) => {
    try {
      const { confirmed, preparing, ready } = req.body;
      if (!Number.isFinite(confirmed) || !Number.isFinite(preparing) || !Number.isFinite(ready) ||
          confirmed <= 0 || preparing <= 0 || ready <= 0) {
        return res.status(400).json({ error: "قيم الحدود الزمنية غير صالحة" });
      }
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      await db.collection("appSettings").doc("urgencyThresholds").set({ confirmed, preparing, ready });
      res.json({ success: true, confirmed, preparing, ready });
    } catch (error) {
      console.error("Error updating urgency thresholds:", error);
      res.status(500).json({ error: "Failed to update urgency thresholds" });
    }
  });

  // ─── Vendor (Multi-Vendor Restaurant) Routes ────────────────────────────────

  async function getVendorList(): Promise<Vendor[]> {
    if (vendorsCache) return vendorsCache;
    try {
      const list = await getFirestoreVendors();
      if (list.length > 0) {
        const sorted = (list as Vendor[]).sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
        vendorsCache = sorted;
        return vendorsCache;
      }
    } catch {}
    vendorsCache = [...defaultVendors];
    return vendorsCache;
  }

  function invalidateVendorsCache() { vendorsCache = null; }

  app.get("/api/vendors", async (_req, res) => {
    const vendors = await getVendorList();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(vendors);
  });

  app.get("/api/admin/vendors", async (_req, res) => {
    invalidateVendorsCache();
    const vendors = await getVendorList();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(vendors);
  });

  app.post("/api/admin/vendors", async (req: Request, res: Response) => {
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine, hasDelivery, minOrder, openTime, closeTime, description } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المطعم مطلوب" });
    const existingVendors = await getVendorList();
    const maxOrder = existingVendors.reduce((max, v) => Math.max(max, v.sortOrder ?? 0), 0);
    const data = {
      name: String(name),
      location: String(location || ""),
      whatsappNumber: String(whatsappNumber || ""),
      commissionPercent: Number(commissionPercent) || 10,
      image: String(image || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400"),
      rating: (rating !== undefined && rating !== "" && rating !== null) ? Number(rating) : null,
      ratingCount: 0,
      deliveryTime: String(deliveryTime || "30-45"),
      isOpen: Boolean(isOpen !== false),
      createdAt: new Date().toISOString(),
      categoryType: (categoryType as any) || "restaurant",
      cuisine: cuisine ? String(cuisine) : "",
      hasDelivery: hasDelivery !== undefined ? Boolean(hasDelivery) : true,
      minOrder: minOrder !== undefined ? Number(minOrder) : 0,
      openTime: openTime ? String(openTime) : "",
      closeTime: closeTime ? String(closeTime) : "",
      description: description ? String(description) : "",
      sortOrder: maxOrder + 1,
    };
    try {
      const id = await createFirestoreVendor(data);
      invalidateVendorsCache();
      res.json({ id, ...data });
    } catch (e) {
      res.status(500).json({ error: "فشل إنشاء المطعم" });
    }
  });

  // Reorder vendors: save full new order from drag-and-drop
  app.post("/api/admin/vendors/reorder", async (req: Request, res: Response) => {
    const { order } = req.body as { order: string[] };
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: "قائمة الترتيب مطلوبة" });
    }
    try {
      for (let i = 0; i < order.length; i++) {
        await updateFirestoreVendor(order[i], { sortOrder: i + 1 });
      }
      invalidateVendorsCache();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Reorder vendors: swap sortOrder with adjacent vendor (kept for backward compat)
  app.patch("/api/admin/vendors/:id/sort-order", async (req: Request, res: Response) => {
    const { id } = req.params;
    const { direction } = req.body as { direction: "up" | "down" };
    try {
      const vendors = await getVendorList();

      // Sort by current sortOrder (undefined treated as 999)
      const sorted = [...vendors].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));

      // Step 1: Assign sequential sortOrder to ALL vendors that are missing it, save to Firestore
      const missingOrder = sorted.filter(v => v.sortOrder === undefined);
      if (missingOrder.length > 0) {
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].sortOrder === undefined) {
            sorted[i].sortOrder = i + 1;
            await updateFirestoreVendor(sorted[i].id, { sortOrder: i + 1 });
          }
        }
      }

      // Step 2: Find vendor and neighbor to swap
      const idx = sorted.findIndex(v => v.id === id);
      if (idx === -1) return res.status(404).json({ error: "المطعم غير موجود" });
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return res.status(400).json({ error: "لا يمكن الترتيب أكثر" });

      const current = sorted[idx];
      const neighbor = sorted[swapIdx];
      const currentOrder = current.sortOrder!;
      const neighborOrder = neighbor.sortOrder!;

      // Step 3: Swap and persist both
      await updateFirestoreVendor(current.id, { sortOrder: neighborOrder });
      await updateFirestoreVendor(neighbor.id, { sortOrder: currentOrder });

      // Step 4: Invalidate cache so next GET reflects new order
      invalidateVendorsCache();

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/admin/vendors/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine, hasDelivery, minOrder, openTime, closeTime, description } = req.body;
    const updates: any = {};
    if (name !== undefined) updates.name = String(name);
    if (location !== undefined) updates.location = String(location);
    if (whatsappNumber !== undefined) updates.whatsappNumber = String(whatsappNumber);
    if (commissionPercent !== undefined) updates.commissionPercent = Number(commissionPercent);
    if (image !== undefined) updates.image = String(image);
    if (rating !== undefined) updates.rating = Number(rating);
    if (deliveryTime !== undefined) updates.deliveryTime = String(deliveryTime);
    if (isOpen !== undefined) updates.isOpen = Boolean(isOpen);
    if (categoryType !== undefined) updates.categoryType = categoryType;
    if (cuisine !== undefined) updates.cuisine = String(cuisine);
    if (hasDelivery !== undefined) updates.hasDelivery = Boolean(hasDelivery);
    if (minOrder !== undefined) updates.minOrder = Number(minOrder);
    if (openTime !== undefined) updates.openTime = String(openTime);
    if (closeTime !== undefined) updates.closeTime = String(closeTime);
    if (description !== undefined) updates.description = String(description);
    try {
      await updateFirestoreVendor(id, updates);
      invalidateVendorsCache();
      invalidateStoresCache();
      res.json({ success: true, id, ...updates });
    } catch {
      res.status(500).json({ error: "فشل تحديث المطعم" });
    }
  });

  app.delete("/api/admin/vendors/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
      await deleteFirestoreVendor(id);
      invalidateVendorsCache();
      invalidateStoresCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "فشل حذف المطعم" });
    }
  });

  app.get("/api/admin/vendors/:id/statement", async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getFirestore();
    const vendors = await getVendorList();
    const vendor = vendors.find(v => v.id === id);
    if (!vendor) return res.status(404).json({ error: "المطعم غير موجود" });
    if (!db) return res.json({ vendor, orders: [], totalSales: 0, appCommission: 0, vendorNet: 0 });
    try {
      const ordersSnap = await db.collection("orders").where("vendorId", "==", id).get();
      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      // For mixed orders, use restaurantSubtotal (restaurant portion only); fallback to full total
      const totalSales = orders.reduce((s, o) => s + (o.restaurantSubtotal || o.total || 0), 0);
      // Use stored commission amount if available, otherwise calculate from vendor %
      const appCommission = orders.reduce((s, o) => {
        if (o.vendorCommissionAmount != null) return s + o.vendorCommissionAmount;
        const base = o.restaurantSubtotal || o.total || 0;
        return s + Math.round(base * vendor.commissionPercent / 100);
      }, 0);
      const vendorNet = totalSales - appCommission;
      res.json({ vendor, orders: orders.length, totalSales, appCommission, vendorNet, commissionPercent: vendor.commissionPercent });
    } catch {
      res.json({ vendor, orders: 0, totalSales: 0, appCommission: 0, vendorNet: 0, commissionPercent: vendor.commissionPercent });
    }
  });

  // ─── Order Routes ────────────────────────────────────────────────────────────
  // Requires a valid customer JWT — returns only that customer's orders
  app.get("/api/orders", requireCustomerAuth, async (req, res) => {
    const phoneNumber = (req as any).customerPhone as string;
    const db = getFirestore();
    if (db) {
      const orders = await getOrdersByPhone(phoneNumber);
      return res.json(orders.map(o => ({
        ...o,
        createdAt: o.createdAt?.toDate?.() ? o.createdAt.toDate().toISOString() : o.createdAt,
        updatedAt: o.updatedAt?.toDate?.() ? o.updatedAt.toDate().toISOString() : o.updatedAt,
      })));
    }
    res.json([]);
  });

  app.get("/api/admin/orders", async (req, res) => {
    const db = getFirestore();
    if (db) {
      const orders = await getOrders();
      return res.json(orders.map(o => ({
        ...o,
        createdAt: o.createdAt?.toDate?.() ? o.createdAt.toDate().toISOString() : o.createdAt,
        updatedAt: o.updatedAt?.toDate?.() ? o.updatedAt.toDate().toISOString() : o.updatedAt,
      })));
    }
    res.json([]);
  });

  app.post("/api/orders", async (req: Request, res: Response) => {
    const { userId, phoneNumber, customerName, customerPhone, notes, items, total, deliveryFee, serviceFee, address, region, latitude, longitude, orderType, internationalDetails, courierDetails, promoCode, promoDiscount, vendorId: bodyVendorId, restaurantSubtotal: bodyRestaurantSubtotal } = req.body;
    const db = getFirestore();
    
    if (db) {
      // Order types that are not catalog-priced (custom service requests, price is not tied to a real product)
      const isCustomServiceOrder = orderType === "courier-pickup" || orderType === "international-shopping";

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "الطلب لا يحتوي على منتجات" });
      }

      if (promoCode) {
        const alreadyUsed = await checkPromoUsage(userId || phoneNumber, promoCode);
        if (alreadyUsed) {
          return res.status(400).json({ error: "لقد استخدمت هذا الكود مسبقاً!" });
        }
      }

      const allProds = await getCachedProducts(); // uses cache with restaurant fallback
      const vendorsList = await getVendorList();

      let verifiedItems: any[] = items;
      let verifiedSubtotal = 0;
      let realDeliveryFee = Number(deliveryFee) || 0;
      let realServiceFee = 500;
      let realPromoDiscount = 0;

      if (!isCustomServiceOrder) {
        // 1) Verify every item against the real catalog price — never trust client-supplied prices.
        verifiedItems = [];
        for (const it of (items as any[])) {
          const prod = allProds.find((p: any) => p.id === it.productId);
          if (!prod) {
            console.warn(`[SUSPICIOUS ORDER] Unknown productId "${it?.productId}" submitted by phone=${phoneNumber || userId}`);
            return res.status(400).json({ error: "أحد المنتجات في طلبك لم يعد متوفراً، يرجى تحديث السلة" });
          }
          const realPrice = Number(prod.price) || 0;
          const quantity = Math.max(1, Number(it.quantity) || 1);
          if (Number(it.price) !== realPrice) {
            console.warn(`[SUSPICIOUS ORDER] Price mismatch for product "${prod.id}" — client sent ${it.price}, real price is ${realPrice}. phone=${phoneNumber || userId}`);
          }
          verifiedItems.push({ ...it, price: realPrice, quantity });
          verifiedSubtotal += realPrice * quantity;
        }

        // 2) Recompute the real delivery fee (restaurant orders have a fixed fee; others come from delivery areas).
        const isRestaurantOrder = verifiedItems.length > 0 && verifiedItems.every((it: any) => {
          const prod = allProds.find((p: any) => p.id === it.productId);
          return prod?.categoryId === "restaurants";
        });
        if (isRestaurantOrder) {
          realDeliveryFee = 1000;
        } else {
          try {
            const areas = await getFirestoreDeliveryAreas(true);
            const matchedArea = areas.find(a => a.name === region);
            realDeliveryFee = matchedArea ? Number(matchedArea.fee) || 0 : 0;
          } catch (e) {
            console.error("Error verifying delivery fee:", e);
            realDeliveryFee = 0;
          }
        }

        // 3) Recompute the real service fee from app settings.
        try {
          const feesSnap = await db.collection("appSettings").doc("fees").get();
          realServiceFee = feesSnap.exists ? (feesSnap.data()?.serviceFee ?? 500) : 500;
        } catch (e) {
          console.error("Error verifying service fee:", e);
        }

        // 4) Recompute the real promo discount from the promo code definition (never trust client discount amount).
        if (promoCode) {
          try {
            const promo = await getPromoCodeByCode(String(promoCode).toUpperCase());
            const notExpired = !promo?.expiryDate || new Date(promo.expiryDate) >= new Date();
            if (promo && promo.isActive && notExpired) {
              realPromoDiscount = promo.type === "percentage"
                ? Math.round(verifiedSubtotal * (promo.value / 100))
                : promo.value;
              realPromoDiscount = Math.min(realPromoDiscount, verifiedSubtotal);
            }
          } catch (e) {
            console.error("Error verifying promo discount:", e);
          }
        }

        // 5) Compare the authoritative server total against the client-submitted total (allow 1 IQD rounding margin).
        const computedTotal = verifiedSubtotal + realDeliveryFee + realServiceFee - realPromoDiscount;
        const clientTotal = Number(total) || 0;
        if (Math.abs(computedTotal - clientTotal) > 1) {
          console.warn(`[SUSPICIOUS ORDER] Total mismatch — client sent ${clientTotal}, server computed ${computedTotal}. phone=${phoneNumber || userId}, items=${JSON.stringify(items)}`);
          return res.status(400).json({ error: "حدث خطأ في حساب سعر الطلب، يرجى تحديث السلة والمحاولة مرة أخرى" });
        }
      }

      const orderData: any = {
        userId: userId || "",
        phoneNumber,
        items: verifiedItems,
        total: isCustomServiceOrder ? (Number(total) || 0) : (verifiedSubtotal + realDeliveryFee + realServiceFee - realPromoDiscount),
        deliveryFee: isCustomServiceOrder ? (Number(deliveryFee) || 0) : realDeliveryFee,
        address,
        region,
        status: "pending",
      };
      orderData.serviceFee = isCustomServiceOrder ? (serviceFee !== undefined ? serviceFee : undefined) : realServiceFee;
      if (orderData.serviceFee === undefined) delete orderData.serviceFee;
      if (customerName) orderData.customerName = customerName;
      if (customerPhone) orderData.customerPhone = customerPhone;
      if (notes) orderData.notes = notes;
      if (latitude !== undefined && longitude !== undefined) {
        orderData.latitude = latitude;
        orderData.longitude = longitude;
      }
      if (orderType) orderData.orderType = orderType;
      if (internationalDetails) orderData.internationalDetails = internationalDetails;
      if (courierDetails) orderData.courierDetails = courierDetails;
      if (promoCode) orderData.promoCode = promoCode;
      if (!isCustomServiceOrder && realPromoDiscount) orderData.promoDiscount = realPromoDiscount;
      else if (isCustomServiceOrder && promoDiscount) orderData.promoDiscount = promoDiscount;
      // Preserve explicit vendorId/restaurantSubtotal from request body (vendor partner orders)
      if (bodyVendorId) orderData.vendorId = bodyVendorId;
      if (bodyRestaurantSubtotal) orderData.restaurantSubtotal = bodyRestaurantSubtotal;

      // Detect vendor for restaurant orders
      let vendorWhatsappUrl: string | null = null;
      try {
        // Scan ALL items to find restaurant ones (handles mixed orders)
        const restaurantItems: any[] = [];
        let restaurantSubtotal = 0;
        let detectedRestaurantName: string | null = null;

        for (const it of (orderData.items as any[])) {
          const prod = allProds.find((p: any) => p.id === it.productId);
          if (prod && prod.categoryId === "restaurants") {
            restaurantItems.push({ ...it, restaurantName: prod.restaurant });
            restaurantSubtotal += (Number(it.price) || 0) * (Number(it.quantity) || 1);
            if (!detectedRestaurantName && prod.restaurant) {
              detectedRestaurantName = prod.restaurant;
            }
          }
        }

        if (restaurantItems.length > 0) {
          // Match vendor by restaurant name
          let vendor = detectedRestaurantName
            ? vendorsList.find(v => v.name === detectedRestaurantName)
            : null;
          // Fallback: match by item name keywords
          if (!vendor) {
            for (const v of vendorsList) {
              const namePart = v.name.replace(/مطعم\s*/g, "").trim();
              if (namePart && restaurantItems.some((it: any) => it.name?.includes(namePart))) {
                vendor = v; break;
              }
            }
          }
          if (vendor) {
            orderData.vendorId = vendor.id;
            orderData.vendorName = vendor.name;
            orderData.vendorWhatsapp = vendor.whatsappNumber;
            orderData.restaurantSubtotal = restaurantSubtotal;
            orderData.vendorCommissionPercent = vendor.commissionPercent || 10;
            orderData.vendorCommissionAmount = Math.round(restaurantSubtotal * ((vendor.commissionPercent || 10) / 100));
            // Build WhatsApp message with only restaurant items
            const itemsList = restaurantItems.map((it: any) => `• ${it.name} × ${it.quantity}`).join("\n");
            const shortId = Math.random().toString(36).slice(2,8).toUpperCase();
            const waMsg = encodeURIComponent(
              `طلب جديد من OnWay 🛒\nرقم الطلب: #${shortId}\nالوجبات:\n${itemsList}\nالإجمالي: ${restaurantSubtotal.toLocaleString()} د.ع\nالسائق: سيتم التعيين فور الجاهزية`
            );
            vendorWhatsappUrl = `https://wa.me/${vendor.whatsappNumber}?text=${waMsg}`;
          }
        }
      } catch (e) { console.error("Vendor detection error:", e); }

      const newOrder = await createOrder(orderData);
      if (newOrder) {
        if (promoCode) {
          await recordPromoUsage(userId || phoneNumber, promoCode).catch(err => 
            console.error("Failed to record promo usage:", err)
          );
        }
        // Order stays "pending" until admin approves from the admin panel
        // Notify admin about the new order
        getAdminPushToken().then(adminToken => {
          if (adminToken) {
            sendAdminNewOrderNotification(
              adminToken, newOrder.id,
              orderData.region || "",
              (orderData.total || 0) + (orderData.deliveryFee || 0)
            ).catch(() => {});
          }
        }).catch(() => {});

        // Notify the specific vendor (by vendorId) about the new order
        if (orderData.vendorId) {
          const db = getFirestore();
          if (db) {
            db.collection("vendors").doc(orderData.vendorId).get().then(vDoc => {
              const vendorPushToken = vDoc.exists ? (vDoc.data() as any)?.pushToken as string | undefined : undefined;
              if (vendorPushToken) {
                const itemsCount = (orderData.items as any[] || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0);
                sendVendorNewOrderNotification(
                  vendorPushToken,
                  newOrder.id,
                  itemsCount,
                  orderData.restaurantSubtotal || orderData.total || 0,
                  orderData.customerName
                ).catch(() => {});
              }
            }).catch(() => {});
          }
        }
        return res.json({
          ...newOrder,
          status: "pending",
          createdAt: newOrder.createdAt.toDate().toISOString(),
          updatedAt: newOrder.updatedAt.toDate().toISOString(),
          vendorWhatsappUrl,
        });
      }
      return res.status(500).json({ error: "Failed to create order" });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  app.put("/api/admin/orders/:id/status", async (req: Request, res: Response) => {
    const orderId = req.params.id as string;
    const { status, phoneNumber } = req.body;
    const db = getFirestore();
    
    if (db) {
      const success = await updateOrderStatus(orderId, status);
      if (success) {
        if (phoneNumber) {
          const pushToken = await getUserPushToken(phoneNumber);
          if (pushToken) {
            await sendPushNotification(pushToken, status, orderId);
          }
        }

        // When order is confirmed, create a batch for the next available driver
        if (status === "confirmed") {
          const confirmedOrder = await getOrderById(orderId).catch(() => null);
          onOrderConfirmed(confirmedOrder?.latitude, confirmedOrder?.longitude);
        }

        return res.json({ success: true, id: orderId, status });
      }
      return res.status(404).json({ error: "Order not found" });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  // ── Manual Driver Assignment ──────────────────────────────────────────────
  app.post("/api/admin/orders/:id/assign-driver", async (req: Request, res: Response) => {
    const orderId = req.params.id as string;
    const { driverPhone } = req.body;
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "Database not configured" });
    if (!driverPhone) return res.status(400).json({ error: "driverPhone required" });

    try {
      // 1. Verify order exists and is assignable
      const allOrders = await getOrders();
      const order = allOrders.find(o => o.id === orderId);
      if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
      if (["delivered", "cancelled"].includes(order.status)) {
        return res.status(400).json({ error: "لا يمكن تعيين سائق لطلب مكتمل أو ملغى" });
      }

      // 2. Verify driver is approved
      const driver = await getDriverByPhone(driverPhone);
      if (!driver) return res.status(404).json({ error: "السائق غير موجود" });
      if (driver.status !== "approved") return res.status(400).json({ error: "السائق غير مفعّل" });

      // 3. Remove order from batchedOrderIds so it can be re-assigned
      batchedOrderIds.delete(orderId);

      // 4. Clear driver's existing batch in memory if they have one
      const queuedDriver = driverQueue.find(d => d.phoneNumber === driverPhone);
      if (queuedDriver?.currentBatchId) {
        // Move old batch to completed in Firestore
        const oldBatch = await getDeliveryBatch(queuedDriver.currentBatchId);
        if (oldBatch) {
          const oldNonActive = oldBatch.orderIds.filter(id => {
            const o = allOrders.find(x => x.id === id);
            return !o || ["delivered", "cancelled"].includes(o.status);
          });
          if (oldNonActive.length === oldBatch.orderIds.length) {
            await updateDeliveryBatch(queuedDriver.currentBatchId, { status: "completed" }).catch(() => {});
          }
          // Remove old batch orders from batchedOrderIds
          oldBatch.orderIds.forEach(id => batchedOrderIds.delete(id));
        }
        queuedDriver.currentBatchId = undefined;
        updateDriverQueueEntry(driverPhone, { hasActiveBatch: false }).catch(() => {});
      }

      // 5. If driver is not in queue, add them temporarily
      if (!queuedDriver) {
        driverQueue.push({
          phoneNumber: driverPhone,
          joinedAt: Date.now(),
          lastSeenAt: Date.now(),
          currentBatchId: undefined,
        });
        addDriverToActiveQueue(driverPhone, Date.now()).catch(() => {});
      }

      // 6. Create a batch with this specific order for the driver
      const batchId = await createDeliveryBatch({
        driverPhone,
        orderIds: [orderId],
      });

      if (!batchId) return res.status(500).json({ error: "فشل في إنشاء الدُفعة" });

      // 7. Update in-memory queue
      const targetDriver = driverQueue.find(d => d.phoneNumber === driverPhone);
      if (targetDriver) {
        targetDriver.currentBatchId = batchId;
        updateDriverQueueEntry(driverPhone, { hasActiveBatch: true }).catch(() => {});
      }
      batchedOrderIds.add(orderId);

      // 8. Update order with driver info in Firestore (also clear rejection flags)
      const driverName = [driver.firstName, driver.secondName].filter(Boolean).join(" ") || driver.fullName || driverPhone;
      const { FieldValue } = await import("firebase-admin/firestore");
      await db.collection("orders").doc(orderId).update({
        driverPhone,
        driverName,
        batchId,
        status: order.status === "pending" ? "confirmed" : order.status,
        rejectedAt: FieldValue.delete(),
        rejectedByDriver: FieldValue.delete(),
        rejectedByPhone: FieldValue.delete(),
      }).catch(() => {});

      // 9. Notify driver via push
      const driverPushToken = await getDriverPushToken(driverPhone);
      if (driverPushToken) {
        const pendingBatchSnap = await db.collection("delivery_batches")
          .where("driverId", "==", driverPhone)
          .where("status", "==", "pending")
          .count()
          .get();
        const driverBadge = pendingBatchSnap.data().count;
        sendDriverBatchNotification(driverPushToken, 1, batchId, driverBadge).catch(() => {});
      }

      res.json({ success: true, batchId, driverPhone, driverName });
    } catch (error: any) {
      console.error("assign-driver error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/push-token", async (req: Request, res: Response) => {
    const { phoneNumber, pushToken } = req.body;
    
    if (!phoneNumber || !pushToken) {
      return res.status(400).json({ error: "Phone number and push token are required" });
    }

    const db = getFirestore();
    if (db) {
      await updateUserPushToken(phoneNumber, pushToken);
      return res.json({ success: true });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  // Promotional Sections API
  app.get("/api/promotional-sections", async (_req: Request, res: Response) => {
    const db = getFirestore();
    if (db) {
      const sections = await getPromotionalSections();
      return res.json(sections);
    }
    res.json([]);
  });

  app.get("/api/promotional-sections/:type", async (req: Request, res: Response) => {
    const type = req.params.type as string;
    const db = getFirestore();
    if (db) {
      const section = await getPromotionalSection(type);
      if (section) {
        return res.json(section);
      }
      return res.json({ type, productIds: [], isActive: true });
    }
    res.json({ type, productIds: [], isActive: true });
  });

  app.put("/api/admin/promotional-sections/:type", async (req: Request, res: Response) => {
    const type = req.params.type as string;
    const { productIds, isActive } = req.body;
    
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: "productIds must be an array" });
    }

    const db = getFirestore();
    if (db) {
      const section = await savePromotionalSection(type, productIds, isActive !== false);
      if (section) {
        return res.json(section);
      }
      return res.status(500).json({ error: "Failed to save promotional section" });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  app.post("/api/upload", upload.single("profileImage"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });

  app.get("/api/users/:phoneNumber", async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    const db = getFirestore();
    
    if (db) {
      const user = await getUserByPhone(phoneNumber);
      if (!user) {
        return res.status(404).json({ error: "User not found", profileComplete: false });
      }
      return res.json({
        id: user.id,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        gender: user.gender,
        region: user.region,
        address: user.address,
        profileImage: user.profileImage,
        createdAt: user.createdAt.toDate().toISOString(),
        updatedAt: user.updatedAt.toDate().toISOString(),
        profileComplete: true,
      });
    }
    
    const user = userProfiles.find(u => u.phoneNumber === req.params.phoneNumber);
    if (!user) {
      return res.status(404).json({ error: "User not found", profileComplete: false });
    }
    res.json({ ...user, profileComplete: true });
  });

  app.post("/api/users", async (req: Request, res: Response) => {
    const { phoneNumber, fullName, gender, region, address, profileImage, latitude, longitude } = req.body;
    
    if (!phoneNumber || !fullName || !gender || !region || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const db = getFirestore();
    
    if (db) {
      const existingUser = await getUserByPhone(phoneNumber);
      
      if (existingUser) {
        const updates: any = { fullName, gender, region, address };
        if (profileImage) updates.profileImage = profileImage;
        if (latitude !== undefined) updates.latitude = latitude;
        if (longitude !== undefined) updates.longitude = longitude;
        
        const updatedUser = await updateUser(phoneNumber, updates);
        if (updatedUser) {
          return res.json({
            id: updatedUser.id,
            phoneNumber: updatedUser.phoneNumber,
            fullName: updatedUser.fullName,
            gender: updatedUser.gender,
            region: updatedUser.region,
            address: updatedUser.address,
            profileImage: updatedUser.profileImage,
            createdAt: updatedUser.createdAt.toDate().toISOString(),
            updatedAt: updatedUser.updatedAt.toDate().toISOString(),
            profileComplete: true,
          });
        }
      } else {
        const newUser = await createUser({
          phoneNumber,
          fullName,
          gender,
          region,
          address,
          profileImage,
          ...(latitude !== undefined && { latitude }),
          ...(longitude !== undefined && { longitude }),
        });
        
        if (newUser) {
          return res.json({
            id: newUser.id,
            phoneNumber: newUser.phoneNumber,
            fullName: newUser.fullName,
            gender: newUser.gender,
            region: newUser.region,
            address: newUser.address,
            profileImage: newUser.profileImage,
            createdAt: newUser.createdAt.toDate().toISOString(),
            updatedAt: newUser.updatedAt.toDate().toISOString(),
            profileComplete: true,
          });
        }
      }
      
      console.error("Firestore save failed for:", phoneNumber);
      return res.status(500).json({ error: "Failed to save user to Firestore" });
    }

    const existingIndex = userProfiles.findIndex(u => u.phoneNumber === phoneNumber);
    const now = new Date().toISOString();
    
    if (existingIndex !== -1) {
      userProfiles[existingIndex] = {
        ...userProfiles[existingIndex],
        fullName,
        gender,
        region,
        address,
        ...(profileImage && { profileImage }),
        updatedAt: now,
      };
      res.json({ ...userProfiles[existingIndex], profileComplete: true });
    } else {
      const newUser: UserProfile = {
        id: randomUUID(),
        phoneNumber,
        fullName,
        gender,
        region,
        address,
        profileImage,
        createdAt: now,
        updatedAt: now,
      };
      userProfiles.push(newUser);
      res.json({ ...newUser, profileComplete: true });
    }
  });

  app.put("/api/users/:phoneNumber", async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    const { fullName, gender, region, address, profileImage } = req.body;
    const db = getFirestore();
    
    if (db) {
      const updates: any = {};
      if (fullName) updates.fullName = fullName;
      if (gender) updates.gender = gender;
      if (region) updates.region = region;
      if (address) updates.address = address;
      if (profileImage) updates.profileImage = profileImage;
      
      const updatedUser = await updateUser(phoneNumber, updates);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      return res.json({
        id: updatedUser.id,
        phoneNumber: updatedUser.phoneNumber,
        fullName: updatedUser.fullName,
        gender: updatedUser.gender,
        region: updatedUser.region,
        address: updatedUser.address,
        profileImage: updatedUser.profileImage,
        createdAt: updatedUser.createdAt.toDate().toISOString(),
        updatedAt: updatedUser.updatedAt.toDate().toISOString(),
        profileComplete: true,
      });
    }
    
    const index = userProfiles.findIndex(u => u.phoneNumber === phoneNumber);
    if (index === -1) {
      return res.status(404).json({ error: "User not found" });
    }
    
    userProfiles[index] = {
      ...userProfiles[index],
      fullName: fullName || userProfiles[index].fullName,
      gender: gender || userProfiles[index].gender,
      region: region || userProfiles[index].region,
      address: address || userProfiles[index].address,
      ...(profileImage && { profileImage }),
      updatedAt: new Date().toISOString(),
    };
    
    res.json({ ...userProfiles[index], profileComplete: true });
  });

  // DELETE /api/users/:phoneNumber — delete user account and all related data
  app.delete("/api/users/:phoneNumber", async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phoneNumber as string);
    const db = getFirestore();
    if (!db) {
      return res.status(500).json({ error: "Database not available" });
    }
    try {
      // Delete user document
      const usersRef = db.collection("users");
      const snap = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
      if (!snap.empty) {
        await snap.docs[0].ref.delete();
      }
      // Delete user's addresses sub-collection entries if any
      const addressesSnap = await db.collection("addresses").where("phoneNumber", "==", phoneNumber).get();
      const batch = db.batch();
      addressesSnap.docs.forEach(d => batch.delete(d.ref));
      if (!addressesSnap.empty) await batch.commit();

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[DELETE USER]", err);
      return res.status(500).json({ error: "فشل حذف الحساب" });
    }
  });

  // OTP Auth Routes
  app.post("/api/auth/send-otp", (req: Request, res: Response) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    const code = generateOtp(phoneNumber);
    res.json({ success: true, message: "OTP sent successfully" });
  });

  app.post("/api/auth/verify-otp", (req: Request, res: Response) => {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: "Phone number and code are required" });
    }

    if (!verifyOtpCode(phoneNumber, code)) {
      return res.status(400).json({ error: "رمز التحقق غير صحيح أو انتهت صلاحيته" });
    }

    const customerToken = jwt.sign(
      { phoneNumber, role: "customer" },
      ROUTES_JWT_SECRET,
      { expiresIn: "30d" }
    );
    res.json({ success: true, message: "OTP verified", customerToken });
  });

  // Driver Routes
  app.get("/api/drivers/check/:phoneNumber", async (req: Request, res: Response) => {
    try {
      const phoneNumber = req.params.phoneNumber as string;
      const driver = await getDriverByPhone(phoneNumber);
      if (driver) {
        res.json({
          exists: true,
          driver: {
            id: driver.id,
            phoneNumber: driver.phoneNumber,
            fullName: driver.fullName,
            firstName: driver.firstName,
            secondName: driver.secondName,
            thirdName: driver.thirdName,
            fourthName: driver.fourthName,
            status: driver.status,
            createdAt: driver.createdAt?.toDate?.() ? driver.createdAt.toDate().toISOString() : driver.createdAt,
            updatedAt: driver.updatedAt?.toDate?.() ? driver.updatedAt.toDate().toISOString() : driver.updatedAt,
          },
        });
      } else {
        res.json({ exists: false, driver: null });
      }
    } catch (error: any) {
      console.error("Error checking driver:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.post("/api/drivers", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, fullName, firstName, secondName, thirdName, fourthName, motorcycleNumber, nationalIdImage, residenceCardImage, driverLicenseImage } = req.body;

      if (!phoneNumber || !fullName || !nationalIdImage) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const existing = await getDriverByPhone(phoneNumber);
      if (existing) {
        return res.json({
          ...existing,
          createdAt: existing.createdAt?.toDate?.() ? existing.createdAt.toDate().toISOString() : existing.createdAt,
          updatedAt: existing.updatedAt?.toDate?.() ? existing.updatedAt.toDate().toISOString() : existing.updatedAt,
          alreadyRegistered: true,
        });
      }

      const driver = await createDriver({
        phoneNumber,
        fullName,
        firstName: firstName || "",
        secondName: secondName || "",
        thirdName: thirdName || "",
        fourthName: fourthName || "",
        ...(motorcycleNumber && { motorcycleNumber }),
        nationalIdImage,
        ...(residenceCardImage && { residenceCardImage }),
        ...(driverLicenseImage && { driverLicenseImage }),
      });

      if (!driver) {
        return res.status(500).json({ error: "Failed to create driver" });
      }

      res.json(driver);
    } catch (error: any) {
      console.error("Error creating driver:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.get("/api/admin/drivers", async (_req: Request, res: Response) => {
    try {
      const drivers = await getDrivers();
      const formatted = drivers.map(d => ({
        ...d,
        createdAt: d.createdAt?.toDate?.() ? d.createdAt.toDate().toISOString() : d.createdAt,
        updatedAt: d.updatedAt?.toDate?.() ? d.updatedAt.toDate().toISOString() : d.updatedAt,
      }));
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.json([]);
    }
  });

  app.put("/api/admin/drivers/:id/status", async (req: Request, res: Response) => {
    try {
      const driverId = req.params.id as string;
      const { status } = req.body;

      const validStatuses = ["pending", "approved", "rejected"];
      if (!validStatuses.includes(String(status))) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const success = await updateDriverStatusFn(driverId, status as "pending" | "approved" | "rejected");
      if (!success) {
        return res.status(500).json({ error: "Failed to update driver status" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating driver status:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.delete("/api/admin/drivers/:id", async (req: Request, res: Response) => {
    try {
      const driverId = req.params.id as string;
      const success = await deleteDriverFn(driverId);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete driver" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting driver:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // ========== DRIVER FIFO QUEUE SYSTEM ==========

  // Get driver status (online, queue position, current batch)
  app.get("/api/driver/status", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      const driver = await getDriverByPhone(phoneNumber);
      const queueIndex = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
      const isOnline = queueIndex !== -1;
      const queuedDriver = isOnline ? driverQueue[queueIndex] : null;

      let currentBatch = null;
      if (queuedDriver?.currentBatchId) {
        const batchDoc = await getDeliveryBatch(queuedDriver.currentBatchId);
        if (!batchDoc) {
          queuedDriver.currentBatchId = undefined;
        } else {
          // Fetch each order by ID in parallel (replaces expensive getOrders() which fetched ALL orders)
          const resolvedOrders = (await Promise.all(
            batchDoc.orderIds.map(async (oid) => {
              const order = await getOrderById(oid);
              if (!order) return null;
              // Fetch customer profile and vendor info in parallel for each order
              const dbInner = getFirestore();
              const [customerProfile, vDocResult] = await Promise.all([
                getUserByPhone((order as any).phoneNumber || ""),
                order.vendorId && dbInner
                  ? dbInner.collection("vendors").doc(order.vendorId).get().catch(() => null)
                  : Promise.resolve(null),
              ]);
              let storeName = (order as any).vendorName || (order as any).storeName || "";
              let storeAddress = "";
              let storePhone = "";
              if (vDocResult?.exists) {
                const vd = vDocResult.data() as any;
                storeName = vd.storeName || vd.name || storeName;
                storeAddress = vd.address || vd.location || "";
                storePhone = vd.phoneNumber || vd.whatsappNumber || "";
              }
              return {
                ...(order as any),
                customerName: (order as any).customerName || customerProfile?.fullName || "زبون",
                customerPhone: (order as any).phoneNumber || "",
                latitude: (order as any).latitude || null,
                longitude: (order as any).longitude || null,
                pickedUpAt: (order as any).pickedUpAt || null,
                deliveredAt: (order as any).deliveredAt || null,
                deliverySequence: (order as any).deliverySequence || 1,
                createdAt: (order as any).createdAt?.toDate?.() ? (order as any).createdAt.toDate().toISOString() : (order as any).createdAt,
                updatedAt: (order as any).updatedAt?.toDate?.() ? (order as any).updatedAt.toDate().toISOString() : (order as any).updatedAt,
                storeName,
                storeAddress,
                storePhone,
              };
            })
          )).filter(Boolean);
          const completedCount = resolvedOrders.filter(o => o.status === "delivered" || o.status === "issue" || o.status === "cancelled").length;
          // If all orders in the batch are done (delivered/issue/cancelled), auto-clear the batch
          if (resolvedOrders.length > 0 && completedCount === resolvedOrders.length) {
            queuedDriver.currentBatchId = undefined;
            batchDoc.orderIds.forEach(id => batchedOrderIds.delete(id));
            // Mark batch as completed in Firestore
            const db2 = getFirestore();
            if (db2) db2.collection("delivery_batches").doc(batchDoc.id).update({ status: "completed", updatedAt: new Date() }).catch(() => {});
            // Move driver to end of queue (joinedAt reset = lowest priority until next pickup)
            updateDriverQueueEntry(phoneNumber, { hasActiveBatch: false, joinedAt: Date.now() }).catch(() => {});
            // Immediately try to assign new orders to this now-available driver
            assignWaitingBatchToDriver(phoneNumber).catch(() => {});
          } else {
            currentBatch = {
              id: batchDoc.id,
              status: batchDoc.status,
              totalOrders: batchDoc.totalOrders,
              completedOrders: completedCount,
              startTime: batchDoc.startTime,
              orders: resolvedOrders.sort((a, b) => (a.deliverySequence || 0) - (b.deliverySequence || 0)),
            };
          }
        }
      }

      // Count only drivers without current batch for queue position
      let queuePosition = null;
      if (isOnline && !queuedDriver?.currentBatchId) {
        const availableDriversBefore = driverQueue
          .filter((d, i) => i <= queueIndex && !d.currentBatchId);
        queuePosition = availableDriversBefore.length;
      }

      // Run financial account and completed orders in parallel
      const [financialAccount, completed] = await Promise.all([
        getDriverFinancialAccount(phoneNumber),
        getCompletedOrders(phoneNumber),
      ]);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayCompleted = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);

      res.json({
        isOnline,
        queuePosition,
        currentBatch,
        approvalStatus: driver?.status || "pending",
        amountOwed: financialAccount.amountOwed,
        todayOrders: todayCompleted.length,
        todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
      });
    } catch (error: any) {
      console.error("Error getting driver status:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Update driver GPS location
  app.post("/api/driver/location", async (req: Request, res: Response) => {
    const { phoneNumber, lat, lng } = req.body;
    if (!phoneNumber || lat === undefined || lng === undefined) return res.status(400).json({ error: "Missing fields" });
    const driver = await getDriverByPhone(phoneNumber).catch(() => null);
    driverLocations.set(phoneNumber, { lat: Number(lat), lng: Number(lng), updatedAt: Date.now(), fullName: driver?.fullName });
    // Mark driver as recently seen (active app) — in-memory AND Firestore
    const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
    if (qd) {
      qd.lastSeenAt = Date.now();
      // Sync lastSeenAt to Firestore so ghost-driver cleanup has accurate data
      updateDriverQueueEntry(phoneNumber, { lastSeenAt: Date.now() } as any).catch(() => {});
    }
    // Persist last location to Firestore driver document
    updateDriverLastLocation(phoneNumber, Number(lat), Number(lng)).catch(() => {});
    res.json({ success: true });
  });

  // Get driver location for a specific order (customer-facing)
  app.get("/api/orders/:orderId/driver-location", async (req: Request, res: Response) => {
    const orderId = req.params.orderId as string;
    const driverPhone = driverAssignments.get(orderId);
    if (!driverPhone) return res.json({ available: false });
    const location = driverLocations.get(driverPhone);
    if (!location) return res.json({ available: false });
    if (Date.now() - location.updatedAt > 10 * 60 * 1000) return res.json({ available: false });
    return res.json({
      available: true,
      lat: location.lat,
      lng: location.lng,
      fullName: location.fullName || "",
      updatedAt: location.updatedAt,
    });
  });

  // Get all online driver locations (admin)
  app.get("/api/admin/driver-locations", async (_req: Request, res: Response) => {
    const now = Date.now();
    const locations: any[] = [];
    for (const [phone, loc] of driverLocations.entries()) {
      if (now - loc.updatedAt > 5 * 60 * 1000) continue; // skip stale > 5min
      const isOnline = driverQueue.some(d => d.phoneNumber === phone);
      if (!isOnline) continue;
      const queuedDriver = driverQueue.find(d => d.phoneNumber === phone);
      locations.push({
        phoneNumber: phone,
        fullName: loc.fullName || phone,
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: loc.updatedAt,
        status: queuedDriver?.currentBatchId ? "busy" : "available",
        currentBatchId: queuedDriver?.currentBatchId || null,
      });
    }
    res.json({ locations });
  });

  // Toggle driver online/offline
  app.post("/api/driver/toggle-online", async (req: Request, res: Response) => {
    const { phoneNumber, goOnline, pushToken } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      if (goOnline) {
        const financialAccount = await getDriverFinancialAccount(phoneNumber);
        const OWED_THRESHOLD = 50000; // 50,000 IQD
        if (financialAccount.amountOwed >= OWED_THRESHOLD) {
          return res.status(400).json({
            error: `المبلغ المستحق (${financialAccount.amountOwed.toLocaleString("ar-IQ")} د.ع) يتجاوز الحد المسموح (${OWED_THRESHOLD.toLocaleString("ar-IQ")} د.ع). يرجى تسوية الحساب مع المسؤول.`,
            amountOwed: financialAccount.amountOwed,
          });
        }
        const exists = driverQueue.find(d => d.phoneNumber === phoneNumber);
        if (!exists) {
          const joinedAt = Date.now();
          driverQueue.push({ phoneNumber, joinedAt, lastSeenAt: Date.now() });
          // Persist new queue entry to Firestore
          addDriverToActiveQueue(phoneNumber, joinedAt, pushToken?.startsWith("ExponentPushToken") ? pushToken : undefined).catch(() => {});
        } else {
          exists.lastSeenAt = Date.now();
        }
        // Save push token for driver notifications (in-memory AND Firestore)
        if (pushToken && pushToken.startsWith("ExponentPushToken")) {
          const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
          if (qd) qd.pushToken = pushToken;
          saveDriverPushToken(phoneNumber, pushToken).catch(() => {});
          updateDriverQueueEntry(phoneNumber, { pushToken }).catch(() => {});
        }
        // Persist online status to Firestore
        updateDriverOnlineStatus(phoneNumber, true).catch(() => {});
        // Log online event
        saveDriverActivity({ phoneNumber, type: "online" }).catch(() => {});
        // Assign any waiting confirmed orders as a batch for this driver
        assignWaitingBatchToDriver(phoneNumber).catch(() => {});
        const pos = driverQueue.filter(d => !d.currentBatchId).findIndex(d => d.phoneNumber === phoneNumber) + 1;
        res.json({ isOnline: true, queuePosition: pos > 0 ? pos : driverQueue.length });
      } else {
        const idx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
        }
        // Remove from Firestore activeDriverQueue
        removeDriverFromActiveQueue(phoneNumber).catch(() => {});
        // Persist offline status to Firestore
        updateDriverOnlineStatus(phoneNumber, false).catch(() => {});
        // Log offline event
        saveDriverActivity({ phoneNumber, type: "offline" }).catch(() => {});
        res.json({ isOnline: false, queuePosition: null });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update driver push token (called on app launch to keep token fresh)
  app.post("/api/driver/refresh-push-token", async (req: Request, res: Response) => {
    const { phoneNumber, pushToken } = req.body;
    if (!phoneNumber || !pushToken) return res.status(400).json({ error: "Missing fields" });
    if (!pushToken.startsWith("ExponentPushToken")) return res.status(400).json({ error: "Invalid token" });
    try {
      await saveDriverPushToken(phoneNumber, pushToken);
      // Also update in-memory queue entry if driver is online
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
      if (qd) qd.pushToken = pushToken;
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Accept order
  app.post("/api/driver/accept-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });

    try {
      const db = getFirestore();
      if (db) {
        // Step 1: driver accepted → preparing
        await updateOrderStatus(orderId, "preparing");
        driverAssignments.set(orderId, phoneNumber);
        const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
        if (qd && !qd.currentBatchId) qd.currentBatchId = orderId; // legacy single-order support

        const driver = await getDriverByPhone(phoneNumber);
        const driverName = driver?.fullName || phoneNumber;
        await updateOrderDriverInfo(orderId, {
          driverName,
          driverPhone: phoneNumber,
        });
        saveDriverActivity({ phoneNumber, type: "accepted", orderId }).catch(() => {});
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Step 2: driver is now on the way (preparing → delivering)
  app.post("/api/driver/start-delivery", async (req: Request, res: Response) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });

    try {
      const db = getFirestore();
      if (db) {
        await updateOrderStatus(orderId, "in_delivery");
        saveDriverActivity({ phoneNumber, type: "in_delivery", orderId }).catch(() => {});
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Report issue with an order
  app.post("/api/driver/report-issue", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, issueType } = req.body;
    if (!phoneNumber || !orderId || !issueType) return res.status(400).json({ error: "Missing fields" });

    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "Database not configured" });

      // Update order in Firestore: status="issue" + issueType + issuedAt
      const now = new Date();
      await db.collection("orders").doc(orderId).update({
        status: "issue",
        issueType,
        issuedAt: now,
        updatedAt: now,
      });

      // Notify customer via push
      const allOrders = await getOrders();
      const order = allOrders.find(o => o.id === orderId);
      if (order?.phoneNumber) {
        const pushToken = await getUserPushToken(order.phoneNumber);
        if (pushToken) {
          await sendPushNotification(pushToken, "issue", orderId);
        }
      }

      // Save admin alert to Firestore for admin dashboard
      await db.collection("adminAlerts").add({
        type: "driver_issue",
        orderId,
        driverPhone: phoneNumber,
        issueType,
        createdAt: new Date(),
        read: false,
      });

      saveDriverActivity({ phoneNumber, type: "issue", orderId }).catch(() => {});
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reject batch (legacy orderId param kept for backward compat)
  app.post("/api/driver/reject-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Missing fields" });

    try {
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
      const targetBatchId = batchId || qd?.currentBatchId;
      let orderCount = 1;
      let rejectedOrderIds: string[] = [];
      if (qd) {
        // Remove batch order IDs from batchedOrderIds so they can be re-assigned
        if (targetBatchId) {
          const batchDoc = await getDeliveryBatch(targetBatchId);
          if (batchDoc) {
            orderCount = batchDoc.orderIds.length;
            rejectedOrderIds = batchDoc.orderIds;
            batchDoc.orderIds.forEach(id => batchedOrderIds.delete(id));
          }
          await cancelDeliveryBatch(targetBatchId).catch(() => {});
        } else if (orderId) {
          batchedOrderIds.delete(orderId);
          rejectedOrderIds = [orderId];
        }
        qd.currentBatchId = undefined;
        // Move driver to end of queue (reset joinedAt so they get lowest priority)
        const savedPushToken = qd.pushToken;
        const idx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
          driverQueue.push({ phoneNumber, joinedAt: Date.now(), pushToken: savedPushToken });
        }
        // Sync to Firestore: reset joinedAt (end of queue) and clear hasActiveBatch
        updateDriverQueueEntry(phoneNumber, { hasActiveBatch: false, joinedAt: Date.now() }).catch(() => {});
      }
      // Track rejection cooldown so the same order isn't re-offered immediately
      if (rejectedOrderIds.length > 0) {
        if (!driverRejectionCooldowns.has(phoneNumber)) {
          driverRejectionCooldowns.set(phoneNumber, new Map());
        }
        const cooldowns = driverRejectionCooldowns.get(phoneNumber)!;
        rejectedOrderIds.forEach(id => cooldowns.set(id, Date.now()));
      }
      // Record rejection event for admin notification
      const driver = await getDriverByPhone(phoneNumber).catch(() => null);
      const driverName = driver?.fullName || phoneNumber;
      rejectionEvents.push({
        id: `${Date.now()}-${phoneNumber}`,
        driverPhone: phoneNumber,
        driverName,
        batchId: targetBatchId || orderId || "",
        orderCount,
        rejectedAt: new Date().toISOString(),
      });
      if (rejectionEvents.length > 50) rejectionEvents.splice(0, rejectionEvents.length - 50);
      // Mark rejected orders in Firestore so admin can identify them
      const db = getFirestore();
      if (db && rejectedOrderIds.length > 0) {
        for (const oid of rejectedOrderIds) {
          db.collection("orders").doc(oid).update({
            rejectedAt: new Date().toISOString(),
            rejectedByDriver: driverName,
            rejectedByPhone: phoneNumber,
          }).catch(() => {});
        }
      }
      saveDriverActivity({ phoneNumber, type: "rejected", orderId: targetBatchId || orderId }).catch(() => {});
      // Offer waiting orders to another available driver (NOT the one who just rejected)
      // Note: do NOT also call assignWaitingBatchToDriver here — onOrderConfirmed handles it
      let rejectedOrderLat: number | undefined;
      let rejectedOrderLng: number | undefined;
      if (rejectedOrderIds.length > 0) {
        const repOrder = await getOrderById(rejectedOrderIds[0]).catch(() => null);
        rejectedOrderLat = repOrder?.latitude;
        rejectedOrderLng = repOrder?.longitude;
      }
      onOrderConfirmed(rejectedOrderLat, rejectedOrderLng);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ===== BATCH ENDPOINTS =====

  // Accept entire batch → all orders move to "preparing"
  app.post("/api/driver/batch/accept", async (req: Request, res: Response) => {
    const { phoneNumber, batchId } = req.body;
    if (!phoneNumber || !batchId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const batchDoc = await getDeliveryBatch(batchId);
      if (!batchDoc) return res.status(404).json({ error: "Batch not found" });
      const driver = await getDriverByPhone(phoneNumber);
      const driverName = driver?.fullName || phoneNumber;
      // Set all orders in batch to "preparing" and tag with driver info
      for (const orderId of batchDoc.orderIds) {
        await updateOrderStatus(orderId, "preparing");
        await updateOrderDriverInfo(orderId, { driverName, driverPhone: phoneNumber });
        driverAssignments.set(orderId, phoneNumber);
        addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "accepted" }).catch(() => {});
      }
      await updateDeliveryBatch(batchId, { status: "in_progress", startTime: new Date().toISOString() });
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
      if (qd) {
        qd.currentBatchId = batchId;
        updateDriverQueueEntry(phoneNumber, { hasActiveBatch: true }).catch(() => {});
      }
      saveDriverActivity({ phoneNumber, type: "accepted", orderId: batchId }).catch(() => {});
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark one order as picked up (preparing → delivering)
  // Driver arrived at store — notifies vendor and logs arrival
  app.post("/api/driver/batch/arrived-at-store", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const now = new Date();
      await db.collection("orders").doc(orderId).update({
        arrivedAtStoreAt: now.toISOString(),
        updatedAt: now,
      });
      // Notify vendor
      const allOrders = await getOrders();
      const order = allOrders.find(o => o.id === orderId);
      if (order?.vendorId) {
        const vendorDoc = await db.collection("vendors").doc(order.vendorId).get();
        const vendorData = vendorDoc.data() as any;
        const driver = await getDriverByPhone(phoneNumber).catch(() => null);
        const driverName = driver?.fullName || "المندوب";
        if (vendorData?.pushToken) {
          await sendBroadcastNotification(
            [vendorData.pushToken],
            "المندوب وصل",
            `${driverName} وصل للمتجر وينتظر الطلب`,
            { type: "driver_arrived", orderId }
          );
        }
      }
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "arrived_at_store" as any, lat: undefined, lng: undefined }).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      console.error("arrived-at-store:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  app.post("/api/driver/batch/pickup-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId, lat, lng } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const now = new Date();
      await updateOrderStatus(orderId, "in_delivery");
      await db.collection("orders").doc(orderId).update({ pickedUpAt: now, updatedAt: now });
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "in_delivery", lat, lng }).catch(() => {});
      saveDriverActivity({ phoneNumber, type: "in_delivery", orderId }).catch(() => {});
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Complete one order in the batch
  app.post("/api/driver/batch/complete-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId, lat, lng } = req.body;
    if (!phoneNumber || !orderId || !batchId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const now = new Date();
      await updateOrderStatus(orderId, "delivered");
      await db.collection("orders").doc(orderId).update({ deliveredAt: now, updatedAt: now });
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "delivered", lat, lng }).catch(() => {});

      const allOrders = await getOrders();
      const order = allOrders.find(o => o.id === orderId);
      if (order) {
        const pushToken = await getUserPushToken(order.phoneNumber || "");
        if (pushToken) await sendPushNotification(pushToken, "delivered", orderId);

        const isRestaurantOrder = await checkIsRestaurantOrder(order);
        const deductionAmount = isRestaurantOrder ? 250 : 1000;
        const driverEarning = isRestaurantOrder ? 750 : 2000;
        await updateOrderDriverInfo(orderId, { driverEarning, ownerEarning: deductionAmount });
        const updatedBatchFinancial = await updateDriverEarningsOnOrder(phoneNumber, {
          driverEarning,
          onwayCommission: deductionAmount,
          orderId,
          orderType: isRestaurantOrder ? "restaurant" : "market",
        });
        const newBalance = updatedBatchFinancial?.amountOwed ?? 0;

        const customerProfile = await getUserByPhone(order.phoneNumber || "");
        const completedEntry = {
          orderId, deliveryFee: order.deliveryFee || 0, driverEarning, ownerEarning: deductionAmount,
          total: order.total || 0, customerName: customerProfile?.fullName || "زبون",
          completedAt: now.toISOString(), isRestaurant: isRestaurantOrder,
        };
        await saveDriverCompletedOrder(phoneNumber, completedEntry);
        saveDriverActivity({ phoneNumber, type: "completed", orderId, customerName: completedEntry.customerName, driverEarning, total: completedEntry.total }).catch(() => {});
        const mem = driverCompletedOrders.get(phoneNumber) || [];
        mem.push(completedEntry);
        driverCompletedOrders.set(phoneNumber, mem);
        driverAssignments.delete(orderId);
        batchedOrderIds.delete(orderId);

        // Check if all orders in batch are delivered
        const batchDoc = await getDeliveryBatch(batchId);
        if (batchDoc) {
          const freshOrders = await getOrders();
          const allDelivered = batchDoc.orderIds.every(oid => {
            const o = freshOrders.find(x => x.id === oid);
            return o?.status === "delivered" || o?.status === "issue" || o?.status === "cancelled";
          });
          const completedCount = batchDoc.orderIds.filter(oid => {
            const o = freshOrders.find(x => x.id === oid);
            return o?.status === "delivered" || o?.status === "issue" || o?.status === "cancelled";
          }).length;
          if (allDelivered) {
            // Sum total earnings from all delivered orders in batch
            const batchEarnings = batchDoc.orderIds.reduce((sum, oid) => {
              const o = freshOrders.find(x => x.id === oid);
              if (!o) return sum;
              const isRest = (o as any).orderType === "restaurant" || !!(o as any).vendorId;
              return sum + (isRest ? 750 : 2000);
            }, 0);
            await updateDeliveryBatch(batchId, {
              status: "completed",
              completedOrders: completedCount,
              totalEarnings: batchEarnings,
              endTime: now.toISOString(),
            });
            const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
            if (qd) qd.currentBatchId = undefined;
            // Check outstanding balance before assigning next batch
            const OWED_THRESHOLD = 50000;
            if (newBalance < OWED_THRESHOLD) {
              // Debt within allowed limit — move to end of queue (joinedAt reset) and mark available
              updateDriverQueueEntry(phoneNumber, { hasActiveBatch: false, joinedAt: Date.now() }).catch(() => {});
              assignWaitingBatchToDriver(phoneNumber).catch(() => {});
            } else {
              // Debt exceeded the allowed limit — remove from queue until settled
              const queueIdx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
              if (queueIdx !== -1) driverQueue.splice(queueIdx, 1);
              removeDriverFromActiveQueue(phoneNumber).catch(() => {});
            }
          } else {
            // Accumulate partial earnings
            const partialEarnings = batchDoc.orderIds.reduce((sum, oid) => {
              const o = freshOrders.find(x => x.id === oid);
              if (!o || o.status !== "delivered") return sum;
              const isRest = (o as any).orderType === "restaurant" || !!(o as any).vendorId;
              return sum + (isRest ? 750 : 2000);
            }, 0);
            await updateDeliveryBatch(batchId, { completedOrders: completedCount, totalEarnings: partialEarnings });
          }
        }
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get driver earnings
  app.get("/api/driver/earnings", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      const completed = await getCompletedOrders(phoneNumber);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      const todayList = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
      const weekList = completed.filter(o => new Date(o.completedAt).getTime() >= weekStart);
      const monthList = completed.filter(o => new Date(o.completedAt).getTime() >= monthStart);

      res.json({
        totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        todayEarnings: todayList.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        weekEarnings: weekList.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        monthEarnings: monthList.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        totalOrders: completed.length,
        todayOrders: todayList.length,
        weekOrders: weekList.length,
        monthOrders: monthList.length,
        completedOrders: completed.map(o => ({
          id: o.orderId,
          total: o.total,
          deliveryFee: o.deliveryFee,
          driverEarning: o.driverEarning || 0,
          isRestaurant: o.isRestaurant || false,
          completedAt: o.completedAt,
          customerName: o.customerName,
        })).reverse(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get driver orders history
  app.get("/api/driver/orders", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      const completed = await getCompletedOrders(phoneNumber);
      const db = getFirestore();
      const result: any[] = [];

      if (db) {
        const allOrders = await getOrders();
        // Get currently delivering orders
        const deliveringOrderIds = Array.from(driverAssignments.entries())
          .filter(([_, driverPhone]) => driverPhone === phoneNumber)
          .map(([orderId]) => orderId);

        for (const orderId of deliveringOrderIds) {
          const order = allOrders.find(o => o.id === orderId);
          if (order) {
            const customer = await getUserByPhone(order.phoneNumber || "");
            result.push({
              ...order,
              customerName: customer?.fullName || "زبون",
              createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt,
            });
          }
        }

        // Add completed orders
        for (const c of completed) {
          const order = allOrders.find(o => o.id === c.orderId);
          if (order) {
            const customer = await getUserByPhone(order.phoneNumber || "");
            result.push({
              ...order,
              customerName: customer?.fullName || "زبون",
              completedAt: c.completedAt,
              createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt,
            });
          }
        }
      }

      res.json(result.reverse());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Driver Wallet Routes
  app.get("/api/driver/wallet", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const account = await getDriverFinancialAccount(phoneNumber);
      const transactions = await getDriverTransactions(phoneNumber, 50);
      res.json({ account, transactions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Legacy recharge endpoint kept for backward compat — records as payment
  app.post("/api/admin/driver-wallet/recharge", async (req: Request, res: Response) => {
    const { phoneNumber, amount, notes } = req.body;
    if (!phoneNumber || amount === undefined) return res.status(400).json({ error: "Missing fields" });
    try {
      const account = await recordDriverPayment(phoneNumber, Number(amount), notes || "دفعة من الإدارة");
      res.json({ success: true, account });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // New explicit payment endpoint
  app.post("/api/admin/driver-wallet/payment", async (req: Request, res: Response) => {
    const { phoneNumber, amount, notes, paymentMethod, adminName } = req.body;
    if (!phoneNumber || amount === undefined) return res.status(400).json({ error: "Missing fields" });
    try {
      const account = await recordDriverPayment(phoneNumber, Number(amount), notes || "", paymentMethod, adminName);
      res.json({ success: true, account });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Adjustment endpoint (add/deduct from amountOwed)
  app.post("/api/admin/driver-wallet/adjustment", async (req: Request, res: Response) => {
    const { phoneNumber, amount, type, notes } = req.body;
    if (!phoneNumber || amount === undefined || !type) return res.status(400).json({ error: "Missing fields" });
    if (type !== "add" && type !== "deduct") return res.status(400).json({ error: "type must be add or deduct" });
    try {
      const account = await recordDriverAdjustment(phoneNumber, Number(amount), type as "add" | "deduct", notes || "");
      res.json({ success: true, account });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Yearly chart — last 12 months breakdown for a single driver
  app.get("/api/admin/driver-financial/:phone/yearly-chart", async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phone as string);
    try {
      const [transactions, completed] = await Promise.all([
        getDriverTransactions(phoneNumber, 2000),
        getCompletedOrders(phoneNumber),
      ]);
      const now = new Date();
      const months: {
        month: number; year: number; label: string;
        earnings: number; commission: number; orders: number; payments: number;
      }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = d.getTime();
        const monthEnd   = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
        const label = d.toLocaleDateString("ar-IQ", { month: "short", year: "numeric" });
        const monthTx = transactions.filter(t => {
          const ts = t.timestamp ? new Date(t.timestamp).getTime() : 0;
          return ts >= monthStart && ts < monthEnd;
        });
        const monthOrders = completed.filter(o => {
          const ts = o.completedAt ? new Date(o.completedAt).getTime() : 0;
          return ts >= monthStart && ts < monthEnd;
        });
        months.push({
          month: d.getMonth() + 1,
          year:  d.getFullYear(),
          label,
          earnings:   monthOrders.reduce((s, o) => s + (o.driverEarning || 0), 0),
          commission: monthTx.filter(t => t.type === "commission").reduce((s, t) => s + (t.amount || 0), 0),
          payments:   monthTx.filter(t => t.type === "payment").reduce((s, t) => s + (t.amount || 0), 0),
          orders:     monthOrders.length,
        });
      }
      res.json({ months });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Full financial statement for a single driver (admin)
  app.get("/api/admin/driver-financial/:phone/statement", async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phone as string);
    try {
      const [driver, account, transactions] = await Promise.all([
        getDriverByPhone(phoneNumber),
        getDriverFinancialAccount(phoneNumber),
        getDriverTransactions(phoneNumber, 200),
      ]);
      res.json({ driver: { fullName: driver?.fullName || "", phoneNumber }, account, transactions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // All driver financial accounts (admin overview)
  app.get("/api/admin/driver-financial", async (_req: Request, res: Response) => {
    try {
      const drivers = await getDrivers();
      const accounts = await Promise.all(
        drivers.filter(d => d.status === "approved").map(async d => {
          const account = await getDriverFinancialAccount(d.phoneNumber);
          const completed = await getCompletedOrders(d.phoneNumber);
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const todayList = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
          const monthList = completed.filter(o => new Date(o.completedAt).getTime() >= monthStart);
          return {
            driver: { fullName: d.fullName, phoneNumber: d.phoneNumber, status: d.status },
            account,
            stats: {
              totalOrders: completed.length,
              todayOrders: todayList.length,
              monthOrders: monthList.length,
              todayEarnings: todayList.reduce((s, o) => s + (o.driverEarning || 0), 0),
              monthEarnings: monthList.reduce((s, o) => s + (o.driverEarning || 0), 0),
            },
          };
        })
      );
      res.json({ accounts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get driver profile
  app.get("/api/driver/profile", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      const driver = await getDriverByPhone(phoneNumber);
      if (!driver) return res.status(404).json({ error: "Driver not found" });

      res.json({
        fullName: driver.fullName,
        phoneNumber: driver.phoneNumber,
        status: driver.status,
        firstName: driver.firstName,
        secondName: driver.secondName,
        thirdName: driver.thirdName,
        fourthName: driver.fourthName,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Find the best available driver: prefer the nearest one (by real GPS distance
  // to the order) among drivers who are actually online (recent GPS or recent seen).
  function findBestAvailableDriver(targetLat?: number, targetLng?: number): QueuedDriver | undefined {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const eligibleDrivers = driverQueue.filter(d => {
      if (d.currentBatchId) return false;
      const loc = driverLocations.get(d.phoneNumber);
      const recentGps = loc && loc.updatedAt >= fiveMinAgo;
      const recentSeen = d.lastSeenAt && d.lastSeenAt >= fiveMinAgo;
      return recentGps || recentSeen;
    });
    if (eligibleDrivers.length === 0) {
      // No one is currently "active" — fall back to any free driver (FIFO)
      return driverQueue.find(d => !d.currentBatchId);
    }

    if (targetLat === undefined || targetLng === undefined) {
      console.warn("[BEST_DRIVER] No target location provided — falling back to FIFO order among active drivers");
      return eligibleDrivers[0];
    }

    // Among eligible drivers, prefer those with a known GPS location and pick
    // the actual nearest one to the order. Drivers with no GPS fix yet are
    // considered only if no located driver is available.
    let nearest: QueuedDriver | undefined;
    let nearestDist = Infinity;
    for (const d of eligibleDrivers) {
      const loc = driverLocations.get(d.phoneNumber);
      if (!loc) continue;
      const dist = calculateDistance(targetLat, targetLng, loc.lat, loc.lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = d;
      }
    }
    if (nearest) return nearest;

    console.warn("[BEST_DRIVER] No eligible driver has a GPS fix — falling back to FIFO order among active drivers");
    return eligibleDrivers[0];
  }

  // Create a batch for a specific driver with waiting confirmed orders
  // ─── Distance / Route Utilities ──────────────────────────────────────────
  function toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function calculateEstimatedTime(distance: number): string {
    const minutes = Math.ceil((distance / 30) * 60); // avg 30 km/h
    if (minutes < 60) return `${minutes} دقيقة`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} ساعة و ${m} دقيقة`;
  }

  function optimizeDeliveryRoute(
    orders: { id: string; latitude?: number; longitude?: number; [k: string]: any }[],
    startLat: number = 0,
    startLng: number = 0
  ): { id: string; deliverySequence: number; distance: number; estimatedTime: string }[] {
    if (orders.length === 0) return [];
    const remaining = orders.map(o => ({
      ...o,
      lat: o.latitude ?? o.customerLat ?? 0,
      lng: o.longitude ?? o.customerLng ?? 0,
    }));
    const optimized: typeof remaining = [];
    let curLat = startLat;
    let curLng = startLng;
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let shortest = calculateDistance(curLat, curLng, remaining[0].lat, remaining[0].lng);
      for (let i = 1; i < remaining.length; i++) {
        const d = calculateDistance(curLat, curLng, remaining[i].lat, remaining[i].lng);
        if (d < shortest) { shortest = d; nearestIdx = i; }
      }
      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      curLat = nearest.lat;
      curLng = nearest.lng;
    }
    return optimized.map((o, i) => {
      const dist = i === 0
        ? calculateDistance(startLat, startLng, o.lat, o.lng)
        : calculateDistance(optimized[i - 1].lat, optimized[i - 1].lng, o.lat, o.lng);
      return {
        id: o.id,
        deliverySequence: i + 1,
        distance: parseFloat(dist.toFixed(2)),
        estimatedTime: calculateEstimatedTime(dist),
      };
    });
  }
  // ─── End Utilities ────────────────────────────────────────────────────────

  async function assignWaitingBatchToDriver(phoneNumber: string, maxOrders: number = 3) {
    try {
      const db = getFirestore();
      if (!db) return;
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber && !d.currentBatchId);
      if (!qd) return;
      const allOrders = await getOrders();
      const confirmedOrders = allOrders.filter(o => o.status === "confirmed");
      // Get active batch IDs from all drivers in queue (in-memory)
      const activeBatchIds = new Set(driverQueue.map(d => d.currentBatchId).filter(Boolean) as string[]);
      // FIFO: take earliest confirmed orders not in any ACTIVE batch
      // An order is truly available if:
      //   - It has no batchId field in Firestore, OR
      //   - Its batchId doesn't belong to an active (in-progress) batch
      //   - It hasn't been recently rejected by THIS driver (within cooldown window)
      const now = Date.now();
      const driverCooldowns = driverRejectionCooldowns.get(phoneNumber);
      const waitingOrders = confirmedOrders
        .filter(o => {
          const orderBatchId = (o as any).batchId || (o as any).batch_id;
          // Skip orders this driver recently rejected (cooldown protection)
          if (driverCooldowns) {
            const rejectedAt = driverCooldowns.get(o.id);
            if (rejectedAt && (now - rejectedAt) < REJECTION_COOLDOWN_MS) {
              return false;
            }
          }
          // No batch assigned at all → eligible
          if (!orderBatchId) return true;
          // Batch assigned but not in any active driver's batch → eligible
          if (!activeBatchIds.has(orderBatchId)) return true;
          // Still tracked in batchedOrderIds from this session → skip
          if (batchedOrderIds.has(o.id)) return false;
          return true;
        })
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
          return aTime - bTime;
        })
        .slice(0, maxOrders);
      if (waitingOrders.length === 0) return;

      // Nearest-Neighbor route optimization
      const driverLoc = driverLocations.get(phoneNumber);
      if (!driverLoc) {
        console.warn(`[BATCH] No GPS location for driver ${phoneNumber} — falling back to (0,0) for route optimization`);
      }
      const routeInfo = optimizeDeliveryRoute(
        waitingOrders,
        driverLoc?.lat ?? 0,
        driverLoc?.lng ?? 0
      );
      const totalDistance = routeInfo.reduce((sum, r) => sum + r.distance, 0);

      // Build final sorted list with updated sequence + distance + estimatedTime
      const optimizedIds = routeInfo.map(r => r.id);

      // Persist delivery_sequence and distance on each order in Firestore
      for (const r of routeInfo) {
        await db.collection("orders").doc(r.id).update({
          deliverySequence: r.deliverySequence,
          delivery_sequence: r.deliverySequence, // snake_case alias
          distance: r.distance,
          estimatedTime: r.estimatedTime,
          estimated_time: r.estimatedTime,
          updatedAt: new Date(),
        }).catch(() => {});
      }

      const batchId = await createDeliveryBatch({ driverPhone: phoneNumber, orderIds: optimizedIds, totalDistance });
      if (batchId) {
        qd.currentBatchId = batchId;
        optimizedIds.forEach(id => batchedOrderIds.add(id));
        // Send push notification: use in-memory token first (fast), fallback to Firestore
        const inMemoryToken = qd?.pushToken;
        const driverPushToken = inMemoryToken || await getDriverPushToken(phoneNumber);
        if (driverPushToken) {
          const pendingSnap = await db.collection("delivery_batches")
            .where("driverId", "==", phoneNumber)
            .where("status", "==", "pending")
            .count()
            .get();
          const driverBadge = pendingSnap.data().count;
          sendDriverBatchNotification(driverPushToken, optimizedIds.length, batchId, driverBadge)
            .catch(e => console.error("[PUSH] Batch notification error:", e));
        } else {
          console.warn(`[PUSH] No push token for driver ${phoneNumber} — notification NOT sent`);
        }
      }
    } catch (e) {
      console.error("assignWaitingBatchToDriver error:", e);
    }
  }

  // Assign new batch to best available driver when a confirmed order arrives.
  // Pass the order's delivery location so the nearest driver is actually chosen.
  function onOrderConfirmed(orderLat?: number, orderLng?: number) {
    console.log(`[ORDER_CONFIRMED] Queue size=${driverQueue.length}, queue=${JSON.stringify(driverQueue.map(d=>({p:d.phoneNumber,batch:d.currentBatchId,lastSeen:d.lastSeenAt})))}`);
    if (orderLat === undefined || orderLng === undefined) {
      console.warn("[ORDER_CONFIRMED] No order location available — cannot compute nearest driver, falling back to FIFO");
    }
    const driver = findBestAvailableDriver(orderLat, orderLng);
    console.log(`[ORDER_CONFIRMED] Best driver: ${driver?.phoneNumber ?? "NONE"}`);
    if (driver) {
      assignWaitingBatchToDriver(driver.phoneNumber).catch(console.error);
    }
  }

  // Watchdog: every 30s, scan for unassigned confirmed orders and assign to free drivers
  setInterval(async () => {
    try {
      const freeDrivers = driverQueue.filter(d => !d.currentBatchId);
      if (freeDrivers.length === 0) return;
      for (const driver of freeDrivers) {
        await assignWaitingBatchToDriver(driver.phoneNumber);
      }
    } catch (e) {
      console.error("[WATCHDOG] error:", e);
    }
  }, 30_000);

  // Ghost-driver cleanup: every 10 minutes, evict drivers whose app crashed/closed
  // without pressing "go offline". Threshold: no GPS ping for 20 minutes.
  const GHOST_TIMEOUT_MS = 20 * 60 * 1000;
  setInterval(async () => {
    try {
      const now = Date.now();
      const ghosts = driverQueue.filter(d => {
        if (d.currentBatchId) return false; // never evict a driver mid-delivery
        const loc = driverLocations.get(d.phoneNumber);
        const lastGps   = loc?.updatedAt   ?? 0;
        const lastSeen  = d.lastSeenAt     ?? 0;
        const mostRecent = Math.max(lastGps, lastSeen);
        return mostRecent > 0 && (now - mostRecent) > GHOST_TIMEOUT_MS;
      });
      for (const ghost of ghosts) {
        const idx = driverQueue.findIndex(d => d.phoneNumber === ghost.phoneNumber);
        if (idx !== -1) driverQueue.splice(idx, 1);
        removeDriverFromActiveQueue(ghost.phoneNumber).catch(() => {});
        updateDriverOnlineStatus(ghost.phoneNumber, false).catch(() => {});
        console.warn(`[GHOST_CLEANUP] Evicted ${ghost.phoneNumber} — no ping for >20min`);
      }
    } catch (e) {
      console.error("[GHOST_CLEANUP] error:", e);
    }
  }, 10 * 60 * 1000);

  // Get queue info for admin
  app.get("/api/admin/driver-queue", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      let allOrders: any[] = [];
      if (db) {
        allOrders = await getOrders();
      }

      const queueData = await Promise.all(driverQueue.map(async (d, i) => {
        let customerName = null;
        let orderRegion = null;
        if (d.currentBatchId) {
          const order = allOrders.find(o => o.id === d.currentBatchId);
          if (order) {
            if (order.customerName) {
              customerName = order.customerName;
            } else {
              const profile = await getUserByPhone(order.phoneNumber || "");
              customerName = profile?.fullName || null;
            }
            orderRegion = order.region || null;
          }
        }
        return {
          position: i + 1,
          phoneNumber: d.phoneNumber,
          joinedAt: new Date(d.joinedAt).toISOString(),
          currentBatchId: d.currentBatchId || null,
          status: d.currentBatchId ? "busy" : "available",
          customerName,
          orderRegion,
        };
      }));

      res.json({
        onlineDrivers: driverQueue.length,
        availableDrivers: driverQueue.filter(d => !d.currentBatchId).length,
        busyDrivers: driverQueue.filter(d => d.currentBatchId).length,
        queue: queueData,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent batch rejection events for admin real-time notification
  // Pass ?since=<ISO timestamp> to get only events after that timestamp
  app.get("/api/admin/rejection-events", (req: Request, res: Response) => {
    const since = req.query.since ? new Date(req.query.since as string).getTime() : 0;
    const events = since
      ? rejectionEvents.filter(e => new Date(e.rejectedAt).getTime() > since)
      : rejectionEvents.slice(-20);
    res.json({ events });
  });

  app.get("/api/admin/driver-stats", async (_req: Request, res: Response) => {
    try {
      const drivers = await getDrivers();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      const stats: Record<string, { todayOrders: number; todayEarnings: number; totalOrders: number; totalEarnings: number; amountOwed: number }> = {};

      for (const driver of drivers) {
        const phone = driver.phoneNumber;
        const completed = await getCompletedOrders(phone);
        const todayCompleted = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
        const account = await getDriverFinancialAccount(phone);

        stats[phone] = {
          todayOrders: todayCompleted.length,
          todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
          totalOrders: completed.length,
          totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
          amountOwed: account.amountOwed,
        };
      }

      res.json({ stats });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get driver activity log (admin) — merges activity events + completed orders history
  app.get("/api/admin/driver-activity", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      // Get explicit activity events (online/offline/accepted/rejected/completed)
      const activityLog = await getDriverActivityLog(phoneNumber);
      
      // Also get completed orders from driverCompletedOrders collection
      const completedOrders = await getDriverCompletedOrdersFromDB(phoneNumber);
      
      // Look up driver's full name to also search historical orders by name
      const driverProfile = await getDriverByPhone(phoneNumber).catch(() => null);
      const driverFullName = driverProfile?.fullName;
      
      // Also get ALL delivered orders from orders collection (historical data)
      const historicalOrders = await getOrdersByDriverPhone(phoneNumber, driverFullName);
      
      // Build a Set of orderIds already covered by activity log or driverCompletedOrders
      const coveredOrderIds = new Set([
        ...activityLog.filter(e => e.type === "completed" && e.orderId).map(e => e.orderId),
        ...completedOrders.map(o => o.orderId),
      ]);
      
      // Convert completed orders (from driverCompletedOrders) not in activity log
      const fromCompleted = completedOrders
        .filter(o => !activityLog.some((e: any) => e.type === "completed" && e.orderId === o.orderId))
        .map(o => ({
          type: "completed",
          phoneNumber,
          orderId: o.orderId,
          customerName: o.customerName,
          driverEarning: o.driverEarning,
          total: o.total,
          timestamp: { _seconds: Math.floor(new Date(o.completedAt).getTime() / 1000), _nanoseconds: 0 },
          date: o.completedAt.split("T")[0],
        }));
      
      // Convert historical orders (from orders collection) not already covered
      const fromHistorical = historicalOrders
        .filter((o: any) => !coveredOrderIds.has(o.id))
        .map((o: any) => {
          const ts = o.updatedAt?.toMillis?.() || o.createdAt?.toMillis?.() || 0;
          return {
            type: "completed",
            phoneNumber,
            orderId: o.id,
            customerName: o.customerName || "زبون",
            driverEarning: null,
            total: o.total || 0,
            timestamp: { _seconds: Math.floor(ts / 1000), _nanoseconds: 0 },
            date: ts ? new Date(ts).toISOString().split("T")[0] : "",
            fromHistory: true,
          };
        });
      
      // Merge all sources and sort by timestamp descending
      const merged = [...activityLog, ...fromCompleted, ...fromHistorical].sort((a: any, b: any) => {
        const getMs = (e: any) => {
          if (e.timestamp?._seconds !== undefined) return e.timestamp._seconds * 1000;
          if (e.timestamp?.seconds !== undefined) return e.timestamp.seconds * 1000;
          return 0;
        };
        return getMs(b) - getMs(a);
      });
      
      res.json({ log: merged });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get owner earnings from all delivered orders
  app.get("/api/admin/owner-earnings", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ totalOwnerEarnings: 0, totalDriverEarnings: 0, totalDeliveryFees: 0, ordersWithEarnings: 0 });

      const allOrders = await getOrders();
      const deliveredOrders = allOrders.filter(o => o.status === "delivered");

      let totalOwnerEarnings = 0;
      let totalDriverEarnings = 0;
      let totalDeliveryFees = 0;
      let ordersWithEarnings = 0;

      for (const order of deliveredOrders) {
        const o = order as any;
        const deliveryFee = o.deliveryFee || 0;
        totalDeliveryFees += deliveryFee;

        if (o.driverEarning !== undefined) {
          totalDriverEarnings += o.driverEarning || 0;
          totalOwnerEarnings += o.ownerEarning || 0;
          ordersWithEarnings++;
        } else {
          const isRestaurant = await checkIsRestaurantOrder(o);
          const driverEarning = isRestaurant ? 750 : 2000;
          const ownerEarning = isRestaurant ? 250 : 1000;
          totalDriverEarnings += driverEarning;
          totalOwnerEarnings += ownerEarning;
          ordersWithEarnings++;
        }
      }

      res.json({
        totalOwnerEarnings,
        totalDriverEarnings,
        totalDeliveryFees,
        ordersWithEarnings,
        totalDeliveredOrders: deliveredOrders.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Archive old completed/cancelled orders (older than 1 month)
  app.delete("/api/admin/archive-old-orders", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "Firestore not initialized" });

      // Helper: batch-delete all docs in a snapshot
      const batchSize = 500;
      const batchDeleteAll = async (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
        let count = 0;
        for (let i = 0; i < docs.length; i += batchSize) {
          const batch = db!.batch();
          const chunk = docs.slice(i, i + batchSize);
          for (const doc of chunk) batch.delete(doc.ref);
          await batch.commit();
          count += chunk.length;
        }
        return count;
      };

      // 1. Delete ALL orders regardless of status
      const allOrders = await getOrders();
      let deleted = 0;
      for (let i = 0; i < allOrders.length; i += batchSize) {
        const batch = db.batch();
        const chunk = allOrders.slice(i, i + batchSize);
        for (const order of chunk) batch.delete(db.collection("orders").doc(order.id));
        await batch.commit();
        deleted += chunk.length;
      }

      // 2. Delete ALL walletHistory entries
      let walletDeleted = 0;
      try {
        const snap = await db.collection("walletHistory").get();
        walletDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {}

      // 3. Delete ALL driverActivityLog entries
      let activityDeleted = 0;
      try {
        const snap = await db.collection("driverActivityLog").get();
        activityDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {}

      // 4. Delete ALL driverCompletedOrders entries
      let completedDeleted = 0;
      try {
        const snap = await db.collection("driverCompletedOrders").get();
        completedDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {}

      // 5. Delete ALL adminAlerts entries
      let alertsDeleted = 0;
      try {
        const snap = await db.collection("adminAlerts").get();
        alertsDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {}

      // 6. Reset all driverWallet balances to zero
      let walletsReset = 0;
      try {
        const snap = await db.collection("driverWallets").get();
        for (let i = 0; i < snap.docs.length; i += batchSize) {
          const batch = db.batch();
          const chunk = snap.docs.slice(i, i + batchSize);
          for (const doc of chunk) batch.update(doc.ref, { balance: 0 });
          await batch.commit();
          walletsReset += chunk.length;
        }
      } catch (_e) {}

      const total = deleted + walletDeleted + activityDeleted + completedDeleted + alertsDeleted;
      res.json({
        deleted,
        walletDeleted,
        activityDeleted,
        completedDeleted,
        alertsDeleted,
        walletsReset,
        total,
        message: `تم مسح ${deleted} طلب (كل الطلبات)، ${walletDeleted} سجل محفظة، ${activityDeleted} سجل نشاط، ${alertsDeleted} تنبيه، وإعادة تصفير ${walletsReset} محفظة سائق`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Promo Code Routes
  app.get("/api/admin/promo-codes", async (_req: Request, res: Response) => {
    try {
      const codes = await getPromoCodes();
      res.json(codes);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/promo-codes", async (req: Request, res: Response) => {
    try {
      const { code, type, value, expiryDate, isActive } = req.body;
      if (!code || !type || value === undefined) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const id = await createPromoCode({
        code: code.toUpperCase(),
        type,
        value: Number(value),
        expiryDate: expiryDate || "",
        isActive: isActive !== false,
      });
      res.json({ id, success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/admin/promo-codes/:id", async (req: Request, res: Response) => {
    try {
      const { code, type, value, expiryDate, isActive } = req.body;
      await updatePromoCode(req.params.id as string, {
        ...(code && { code: code.toUpperCase() }),
        ...(type && { type }),
        ...(value !== undefined && { value: Number(value) }),
        ...(expiryDate !== undefined && { expiryDate }),
        ...(isActive !== undefined && { isActive }),
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/admin/promo-codes/:id", async (req: Request, res: Response) => {
    try {
      await deletePromoCodeFn(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Save Admin Push Token ─────────────────────────────────────────────────
  app.post("/api/admin/push-token", async (req: Request, res: Response) => {
    const { pushToken } = req.body;
    if (!pushToken) return res.status(400).json({ error: "pushToken required" });
    const success = await saveAdminPushToken(pushToken);
    res.json({ success });
  });

  // ── Send Broadcast Push Notification ─────────────────────────────────────
  app.post("/api/admin/send-notification", async (req: Request, res: Response) => {
    try {
      const { title, body } = req.body;
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ error: "العنوان والمحتوى مطلوبان" });
      }

      const tokens = await getAllUserPushTokens();
      if (tokens.length === 0) {
        return res.json({ success: true, sent: 0, failed: 0, message: "لا يوجد مستخدمون مسجلون للإشعارات" });
      }

      const result = await sendBroadcastNotification(tokens, title.trim(), body.trim(), { type: "broadcast" });
      console.log(`Broadcast notification sent: ${result.sent} success, ${result.failed} failed`);
      
      res.json({
        success: true,
        sent: result.sent,
        failed: result.failed,
        total: tokens.length,
      });
    } catch (error: any) {
      console.error("Error sending broadcast notification:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ── Notification Stats ────────────────────────────────────────────────────
  app.get("/api/admin/notification-stats", async (_req: Request, res: Response) => {
    try {
      const tokens = await getAllUserPushTokens();
      const allUsers = await getAllUsers();
      res.json({ totalUsers: allUsers.length, tokensCount: tokens.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Cancel Order (within 1 minute) ───────────────────────────────────────
  app.post("/api/orders/:orderId/cancel", async (req: Request, res: Response) => {
    try {
      const orderId = req.params.orderId as string;
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });

      const doc = await db.collection("orders").doc(orderId).get();
      if (!doc.exists) return res.status(404).json({ error: "الطلب غير موجود" });

      const data = doc.data() as any;
      if (data.status === "cancelled") {
        return res.status(400).json({ error: "الطلب ملغي مسبقاً" });
      }
      if (data.status !== "pending") {
        return res.status(400).json({ error: "لا يمكن إلغاء الطلب بعد قبوله" });
      }

      const createdAt: FirebaseFirestore.Timestamp = data.createdAt;
      const createdMs = createdAt.toMillis();
      const nowMs     = Date.now();
      const LIMIT_MS  = 30 * 1000; // 30 seconds

      if (nowMs - createdMs > LIMIT_MS) {
        return res.status(400).json({ error: "انتهت مهلة الإلغاء (30 ثانية فقط)" });
      }

      const { Timestamp } = await import("firebase-admin/firestore");
      await db.collection("orders").doc(orderId).update({
        status: "cancelled",
        updatedAt: Timestamp.now(),
      });

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ── Customer: Rate a delivered order (aggregates vendor rating) ───────────
  // Auth: requires a valid customer JWT issued by /api/auth/verify-otp in the
  // Authorization: Bearer <token> header. No body-based identity fallback.
  // All validation (ownership, status, duplicate) and both writes (order +
  // vendor aggregate) execute inside a single Firestore transaction.
  app.post("/api/orders/:orderId/rate", async (req: Request, res: Response) => {
    // 1. Extract and verify customer JWT — mandatory, no body fallback
    const authHeader = req.headers.authorization || "";
    const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!rawToken) return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
    let callerPhone: string;
    try {
      const decoded = jwt.verify(rawToken, ROUTES_JWT_SECRET) as any;
      if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid");
      callerPhone = decoded.phoneNumber;
    } catch {
      return res.status(401).json({ error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً" });
    }

    // 2. Validate rating value before touching the database
    const numRating = Number(req.body.rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
    }
    const ratingComment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 500) : "";
    const ratingImage = typeof req.body.image === "string" ? req.body.image.slice(0, 400000) : "";

    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });

      const orderRef = db.collection("orders").doc(req.params.orderId as string);
      const capturedOrderId: string = req.params.orderId as string;
      const ratedAt = new Date().toISOString();
      let didUpdateVendor = false;
      let capturedVendorId: string | undefined;

      // 3. Single Firestore transaction — ALL reads first, then ALL writes.
      //    Every business-rule check happens inside, so concurrent submissions
      //    cannot sneak past each other.
      await db.runTransaction(async (tx) => {
        // ── reads ──────────────────────────────────────────────────────────
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) throw Object.assign(new Error("الطلب غير موجود"), { status: 404 });
        const order = orderSnap.data() as any;

        // Ownership: JWT phone must match order phone
        if (order.phoneNumber !== callerPhone) {
          throw Object.assign(new Error("غير مصرح"), { status: 403 });
        }
        if (order.status !== "delivered") {
          throw Object.assign(new Error("لا يمكن تقييم طلب لم يُسلَّم بعد"), { status: 400 });
        }
        if (order.customerRating) {
          throw Object.assign(new Error("تم تقييم هذا الطلب مسبقاً"), { status: 409 });
        }

        capturedVendorId = order.vendorId;
        const vendorId: string | undefined = capturedVendorId;
        const vendorRef = vendorId ? db.collection("vendors").doc(vendorId) : null;
        const vSnap = vendorRef ? await tx.get(vendorRef) : null;

        // ── writes ─────────────────────────────────────────────────────────
        tx.update(orderRef, { customerRating: numRating, ratedAt });

        if (vendorRef && vSnap && vSnap.exists) {
          const v = vSnap.data() as any;
          const oldCount: number = v.ratingCount ?? 0;
          const oldRating: number | null = v.rating ?? null;
          const newCount = oldCount + 1;
          const newRating = (oldRating === null || oldCount === 0)
            ? numRating
            : Math.round(((oldRating * oldCount + numRating) / newCount) * 10) / 10;
          tx.update(vendorRef, { rating: newRating, ratingCount: newCount });
          didUpdateVendor = true;
        }
      });

      if (didUpdateVendor) invalidateVendorsCache();

      // Save detailed rating to ratings collection (non-fatal)
      try {
        await db.collection("ratings").add({
          orderId: capturedOrderId,
          vendorId: capturedVendorId ?? null,
          customerPhone: callerPhone,
          stars: numRating,
          comment: ratingComment,
          image: ratingImage,
          ratingType: "customer",
          hidden: false,
          deleted: false,
          adminNote: "",
          vendorReply: "",
          vendorRepliedAt: null,
          createdAt: ratedAt,
          updatedAt: ratedAt,
        });
      } catch (e) {
        console.error("ratings collection write:", e);
      }

      return res.json({ success: true, message: "شكراً على تقييمك!" });
    } catch (error: any) {
      const status: number = error.status ?? 500;
      const msg: string = error.message || "حدث خطأ";
      if (status !== 500) return res.status(status).json({ error: msg });
      console.error("Error rating order:", error);
      return res.status(500).json({ error: "حدث خطأ أثناء حفظ التقييم" });
    }
  });

  // ── Get All Users ─────────────────────────────────────────────────────────
  app.get("/api/admin/users", async (_req: Request, res: Response) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/promo-codes/apply", async (req: Request, res: Response) => {
    try {
      const { code, userId, cartTotal } = req.body;
      if (!code || !userId || cartTotal === undefined) {
        return res.status(400).json({ error: "الرجاء إدخال جميع البيانات المطلوبة" });
      }

      const promo = await getPromoCodeByCode(code.toUpperCase());
      if (!promo || !promo.isActive) {
        return res.status(400).json({ error: "الكود غير صحيح أو غير فعّال" });
      }

      if (promo.expiryDate) {
        const expiry = new Date(promo.expiryDate);
        if (expiry < new Date()) {
          return res.status(400).json({ error: "انتهت صلاحية هذا الكود" });
        }
      }

      const usedBefore = await checkPromoUsage(userId, code.toUpperCase());
      if (usedBefore) {
        return res.status(400).json({ error: "لقد استخدمت هذا الكود مسبقاً!" });
      }

      let discount = 0;
      if (promo.type === "percentage") {
        discount = Math.round(cartTotal * (promo.value / 100));
      } else {
        discount = promo.value;
      }

      discount = Math.min(discount, cartTotal);

      res.json({
        success: true,
        discountAmount: discount,
        newTotal: cartTotal - discount,
        promoType: promo.type,
        promoValue: promo.value,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/promo-codes/record-usage", async (req: Request, res: Response) => {
    try {
      const { userId, promoCode } = req.body;
      if (!userId || !promoCode) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await recordPromoUsage(userId, promoCode.toUpperCase());
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/reverse-geocode", async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    try {
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleApiKey) {
        return res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
      }

      function cleanAddr(raw: string): string {
        return raw
          .replace(/،\s*العراق\s*$/g, "")
          .replace(/,\s*العراق\s*$/g, "")
          .replace(/\b\w{2,6}\+\w+[،,]?\s*/g, "")
          .replace(/^\s*[،,]\s*/, "")
          .trim();
      }

      function isUseful(addr: string): boolean {
        if (!addr) return false;
        if (addr.includes("طريق بدون اسم") || addr.includes("Unnamed Road")) return false;
        return true;
      }

      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ar&key=${googleApiKey}`;
      const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=100&language=ar&key=${googleApiKey}`;

      const [geocodeRes, placesRes] = await Promise.all([
        fetch(geocodeUrl).then(r => r.json()).catch(() => null),
        fetch(placesUrl).then(r => r.json()).catch(() => null),
      ]);

      let placeName = "";
      if (placesRes?.status === "OK" && placesRes.results) {
        const arabicRegex = /[\u0600-\u06FF]/;
        for (const place of placesRes.results) {
          const types: string[] = place.types || [];
          if (types.includes("locality") || types.includes("political") || types.includes("administrative_area_level_2")) continue;
          if (place.name && place.name.length > 1 && arabicRegex.test(place.name)) {
            placeName = place.name;
            break;
          }
        }
      }

      let bestAddress = "";
      if (geocodeRes?.status === "OK" && geocodeRes.results && geocodeRes.results.length > 0) {
        const priorityTypes = [
          ["neighborhood", "sublocality", "sublocality_level_1"],
          ["route", "street_address", "premise"],
          ["locality"],
        ];

        for (const typeGroup of priorityTypes) {
          for (const result of geocodeRes.results) {
            const types: string[] = result.types || [];
            if (typeGroup.some(t => types.includes(t))) {
              const cleaned = cleanAddr(result.formatted_address || "");
              if (isUseful(cleaned)) {
                bestAddress = cleaned;
                break;
              }
            }
          }
          if (bestAddress) break;
        }

        if (!bestAddress) {
          for (const result of geocodeRes.results) {
            const types: string[] = result.types || [];
            if (!types.includes("plus_code") && !types.includes("country") && !types.includes("administrative_area_level_1")) {
              const cleaned = cleanAddr(result.formatted_address || "");
              if (isUseful(cleaned)) {
                bestAddress = cleaned;
                break;
              }
            }
          }
        }

        if (!bestAddress && geocodeRes.results.length > 0) {
          bestAddress = cleanAddr(geocodeRes.results[0].formatted_address);
        }
      }

      if (placeName || bestAddress) {
        const finalAddress = placeName
          ? (bestAddress ? `${placeName}، ${bestAddress}` : placeName)
          : bestAddress;
        return res.json({ address: finalAddress, placeName: placeName || null });
      }

      res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    } catch (error: any) {
      console.error("Geocode error:", error.message);
      res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    }
  });

  // ─── Support Chat ─────────────────────────────────────────────────────────

  // User: get own messages
  app.get("/api/support/messages", async (req: Request, res: Response) => {
    const phoneNumber = req.query.phoneNumber as string;
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });
    try {
      const chat = await getSupportChat(phoneNumber);
      if (!chat) return res.json({ messages: [], unreadByUser: 0 });
      await markSupportChatRead(phoneNumber, "user");
      return res.json({ messages: chat.messages || [], unreadByUser: 0 });
    } catch (e) {
      return res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Support image upload
  app.post("/api/support/upload-image", upload.single("image"), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image uploaded" });
      const imageUrl = `/uploads/${req.file.filename}`;
      return res.json({ imageUrl });
    } catch (e) {
      return res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // User: send message
  app.post("/api/support/messages", async (req: Request, res: Response) => {
    const { phoneNumber, text, userName, userRegion, userGender, type, imageUrl, productData } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });
    if (!text && !imageUrl && !productData) return res.status(400).json({ error: "message content required" });
    try {
      const msgText = text?.trim() || (imageUrl ? "صورة" : productData?.name || "");
      const chat = await sendSupportMessage(phoneNumber, msgText, "user", userName || "", {
        type: type || "text",
        imageUrl,
        productData,
        userRegion,
        userGender,
      });
      if (!chat) return res.status(500).json({ error: "Failed to send message" });
      return res.json({ success: true, messages: chat.messages });
    } catch (e) {
      return res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Admin: get messages for a specific chat (without marking as read by user)
  app.get("/api/admin/support/messages/:phoneNumber", async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    try {
      res.set("Cache-Control", "no-store");
      const chat = await getSupportChat(decodeURIComponent(phoneNumber));
      if (!chat) return res.json({ messages: [] });
      return res.json({ messages: chat.messages || [] });
    } catch (e) {
      return res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Admin: get all chats
  app.get("/api/admin/support/chats", async (_req: Request, res: Response) => {
    try {
      res.set("Cache-Control", "no-store");
      const chats = await getAllSupportChats();
      return res.json(chats);
    } catch (e) {
      return res.status(500).json({ error: "Failed to get chats" });
    }
  });

  // Admin: reply to user
  app.post("/api/admin/support/reply", async (req: Request, res: Response) => {
    const { phoneNumber, text } = req.body;
    if (!phoneNumber || !text) return res.status(400).json({ error: "phoneNumber and text required" });
    try {
      const chat = await sendSupportMessage(phoneNumber, text.trim(), "admin");
      if (!chat) return res.status(500).json({ error: "Failed to send reply" });
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: "Failed to send reply" });
    }
  });

  // Admin: mark chat as read
  app.put("/api/admin/support/read/:phoneNumber", async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    try {
      await markSupportChatRead(phoneNumber, "admin");
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // ── ADMIN: Financial Reports ──────────────────────────────────────────────────
  app.get("/api/admin/financial-reports", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

      const period = (req.query.period as string) || "month";
      const now = new Date();
      let startDate: Date | null = null;
      if (period === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === "week") {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (period === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const snap = await db.collection("orders")
        .where("status", "==", "delivered")
        .limit(2000)
        .get();

      const vendorsSnap = await db.collection("vendors").get();
      const vendorNames: Record<string, string> = {};
      vendorsSnap.docs.forEach(d => { vendorNames[d.id] = (d.data() as any).storeName || "–"; });

      const vpSnap = await db.collection("vendorProducts").get();
      const productVendorMap: Record<string, string> = {};
      vpSnap.docs.forEach(d => { productVendorMap[d.id] = (d.data() as any).vendorId || ""; });

      let totalRevenue = 0;
      let totalCommission = 0;
      let totalOrders = 0;
      let totalDriverEarnings = 0;

      const vendorStats: Record<string, { vendorId: string; vendorName: string; revenue: number; commission: number; netEarning: number; orders: number }> = {};
      const dailyMap: Record<string, { date: string; revenue: number; commission: number; orders: number }> = {};

      for (const doc of snap.docs) {
        const data = doc.data() as any;
        const createdAt: Date = data.createdAt?.toDate?.() ?? new Date(data.createdAt ?? 0);
        if (startDate && createdAt < startDate) continue;

        const orderTotal: number = Number(data.total) || 0;
        const deliveryFee: number = Number(data.deliveryFee) || 0;
        const subtotal: number = orderTotal - deliveryFee;
        const commission: number = Number(data.vendorCommissionAmount) || Math.round(subtotal * 0.1);
        const driverEarning: number = Number(data.driverEarning) || deliveryFee;
        const vendorNet: number = subtotal - commission;

        let vid = data.vendorId || "";
        if (!vid) {
          const items: any[] = Array.isArray(data.items) ? data.items : [];
          for (const item of items) {
            if (item.productId && productVendorMap[item.productId]) {
              vid = productVendorMap[item.productId];
              break;
            }
          }
        }

        totalRevenue += orderTotal;
        totalCommission += commission;
        totalDriverEarnings += driverEarning;
        totalOrders++;

        if (vid) {
          if (!vendorStats[vid]) {
            vendorStats[vid] = { vendorId: vid, vendorName: vendorNames[vid] || "–", revenue: 0, commission: 0, netEarning: 0, orders: 0 };
          }
          vendorStats[vid].revenue += subtotal;
          vendorStats[vid].commission += commission;
          vendorStats[vid].netEarning += vendorNet;
          vendorStats[vid].orders++;
        }

        const day = createdAt.toISOString().substring(0, 10);
        if (!dailyMap[day]) dailyMap[day] = { date: day, revenue: 0, commission: 0, orders: 0 };
        dailyMap[day].revenue += orderTotal;
        dailyMap[day].commission += commission;
        dailyMap[day].orders++;
      }

      const vendorBreakdown = Object.values(vendorStats).sort((a, b) => b.revenue - a.revenue);
      const dailySales = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
      const onwayProfit = totalCommission;

      res.json({
        period, totalRevenue, totalCommission, totalOrders,
        totalDriverEarnings, onwayProfit, vendorBreakdown, dailySales,
      });
    } catch (err) {
      console.error("admin financial-reports:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── Dashboard Stats (comprehensive) ──────────────────────────────────────
  app.get("/api/admin/dashboard-stats", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ orders: {}, revenue: {}, users: 0, drivers: {}, vendors: {}, products: 0, topVendors: [] });
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersSnap, usersSnap, driversSnap, vendorsSnap, productsSnap] = await Promise.all([
        db.collection("orders").orderBy("createdAt", "desc").get(),
        db.collection("users").get(),
        db.collection("drivers").get(),
        db.collection("vendors").get(),
        db.collection("products").get(),
      ]);

      const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const todayOrders = allOrders.filter((o: any) => (o.createdAt || "") >= todayStart);
      const weekOrders  = allOrders.filter((o: any) => (o.createdAt || "") >= weekStart);
      const monthOrders = allOrders.filter((o: any) => (o.createdAt || "") >= monthStart);

      const delivered = allOrders.filter((o: any) => o.status === "delivered");
      const active = allOrders.filter((o: any) => !["delivered","cancelled"].includes(o.status));
      const cancelled = allOrders.filter((o: any) => o.status === "cancelled");

      const totalRevenue = delivered.reduce((s: number, o: any) => s + (o.total || 0) + (o.deliveryFee || 0), 0);
      const todayRevenue = todayOrders.filter((o:any) => o.status === "delivered")
        .reduce((s: number, o: any) => s + (o.total || 0) + (o.deliveryFee || 0), 0);

      const vendors = vendorsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const restaurants = vendors.filter((v: any) => v.categoryType === "restaurant" || v.businessType === "restaurant");
      const stores = vendors.filter((v: any) => v.categoryType !== "restaurant" && v.businessType !== "restaurant");

      const onlineDrivers = driversSnap.docs.filter(d => (d.data() as any).isOnline).length;

      // Top 5 vendors by order count
      const vendorOrderCount: Record<string, number> = {};
      allOrders.forEach((o: any) => {
        if (o.vendorId) vendorOrderCount[o.vendorId] = (vendorOrderCount[o.vendorId] || 0) + 1;
      });
      const topVendors = Object.entries(vendorOrderCount)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, count]) => {
          const v = vendors.find((x: any) => x.id === id);
          return { id, name: v?.name || id, orders: count };
        });

      res.json({
        orders: { total: allOrders.length, today: todayOrders.length, week: weekOrders.length, month: monthOrders.length, active: active.length, delivered: delivered.length, cancelled: cancelled.length },
        revenue: { total: totalRevenue, today: todayRevenue },
        users: usersSnap.size,
        drivers: { total: driversSnap.size, online: onlineDrivers },
        vendors: { total: vendors.length, restaurants: restaurants.length, stores: stores.length },
        products: productsSnap.size,
        topVendors,
      });
    } catch (err) {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── Operations Center ─────────────────────────────────────────────────────
  app.get("/api/admin/operations", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ newOrders: 0, preparingOrders: 0, inDelivery: 0, onlineDrivers: 0, activeBatches: 0, lateOrders: 0, issues: 0, recentOrders: [], lateOrdersList: [] });
      const now = new Date();
      const since = new Date(now.getTime() - 24 * 3600000).toISOString();

      const [ordersSnap, driversSnap, batchesSnap] = await Promise.all([
        db.collection("orders").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(100).get(),
        db.collection("drivers").where("isOnline", "==", true).get(),
        db.collection("deliveryBatches").where("status", "==", "in_progress").get(),
      ]);

      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const newOrders = orders.filter((o: any) => o.status === "pending").length;
      const preparingOrders = orders.filter((o: any) => ["confirmed","preparing","ready"].includes(o.status)).length;
      const inDelivery = orders.filter((o: any) => ["picked_up","in_delivery","delivering"].includes(o.status)).length;

      // Late orders: pending > 30 min
      const lateOrders = orders.filter((o: any) => {
        if (o.status !== "pending" && o.status !== "confirmed") return false;
        const age = now.getTime() - new Date(o.createdAt).getTime();
        return age > 30 * 60000;
      });

      const issues = orders.filter((o: any) => o.status === "issue");

      res.json({
        newOrders,
        preparingOrders,
        inDelivery,
        onlineDrivers: driversSnap.size,
        activeBatches: batchesSnap.size,
        lateOrders: lateOrders.length,
        issues: issues.length,
        recentOrders: orders.slice(0, 20).map((o: any) => ({
          id: o.id, status: o.status, phoneNumber: o.phoneNumber,
          area: o.area || o.region || "", createdAt: o.createdAt,
          total: (o.total || 0) + (o.deliveryFee || 0),
        })),
        lateOrdersList: lateOrders.slice(0, 10).map((o: any) => ({
          id: o.id, phoneNumber: o.phoneNumber, createdAt: o.createdAt,
          area: o.area || o.region || "",
        })),
      });
    } catch (err) {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── Analytics ─────────────────────────────────────────────────────────────
  app.get("/api/admin/analytics", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ totalOrders: 0, totalRevenue: 0, avgOrderValue: 0, deliveredRate: 0, newUsers: 0, dailyData: [], topCategories: [] });
      const days = parseInt((req.query.days as string) || "30", 10);
      const since = new Date(Date.now() - days * 86400000).toISOString();

      const [ordersSnap, usersSnap] = await Promise.all([
        db.collection("orders").where("createdAt", ">=", since).orderBy("createdAt", "desc").get(),
        db.collection("users").where("createdAt", ">=", since).get(),
      ]);

      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const delivered = orders.filter((o: any) => o.status === "delivered");

      // Daily breakdown
      const dailyMap: Record<string, { date: string; orders: number; revenue: number; newUsers: number }> = {};
      orders.forEach((o: any) => {
        const day = (o.createdAt || "").substring(0, 10);
        if (!dailyMap[day]) dailyMap[day] = { date: day, orders: 0, revenue: 0, newUsers: 0 };
        dailyMap[day].orders++;
        if (o.status === "delivered") dailyMap[day].revenue += (o.total || 0) + (o.deliveryFee || 0);
      });
      usersSnap.docs.forEach(d => {
        const day = ((d.data() as any).createdAt || "").substring(0, 10);
        if (dailyMap[day]) dailyMap[day].newUsers++;
      });

      const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      // Top categories
      const catCount: Record<string, number> = {};
      orders.forEach((o: any) => {
        (o.items || []).forEach((item: any) => {
          const cat = item.categoryId || "أخرى";
          catCount[cat] = (catCount[cat] || 0) + item.quantity;
        });
      });
      const topCategories = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Conversion: orders / total users (rough)
      const totalRevenue = delivered.reduce((s: number, o: any) => s + (o.total || 0) + (o.deliveryFee || 0), 0);
      const avgOrderValue = delivered.length ? Math.round(totalRevenue / delivered.length) : 0;

      res.json({
        period: days,
        totalOrders: orders.length,
        totalRevenue,
        avgOrderValue,
        deliveredRate: orders.length ? Math.round((delivered.length / orders.length) * 100) : 0,
        newUsers: usersSnap.size,
        dailyData,
        topCategories,
      });
    } catch (err) {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── Zones Management ──────────────────────────────────────────────────────
  app.get("/api/admin/zones", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json([]);
      const snap = await db.collection("zones").orderBy("order", "asc").get();
      const zones = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(zones);
    } catch {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  app.post("/api/admin/zones", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const { name, nameEn, type, parentId, deliveryFee, isActive, order } = req.body;
      if (!name || !type) return res.status(400).json({ error: "الاسم والنوع مطلوبان" });
      const ref = await db.collection("zones").add({
        name, nameEn: nameEn || "", type, parentId: parentId || null,
        deliveryFee: Number(deliveryFee) || 0,
        isActive: isActive !== false,
        order: Number(order) || 0,
        createdAt: new Date().toISOString(),
      });
      res.json({ id: ref.id, success: true });
    } catch {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  app.put("/api/admin/zones/:id", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const id = req.params["id"] as string;
      const { name, nameEn, type, parentId, deliveryFee, isActive, order } = req.body;
      await db.collection("zones").doc(id).update({
        name, nameEn: nameEn || "", type, parentId: parentId || null,
        deliveryFee: Number(deliveryFee) || 0,
        isActive: isActive !== false,
        order: Number(order) || 0,
        updatedAt: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  app.delete("/api/admin/zones/:id", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const id = req.params["id"] as string;
      await db.collection("zones").doc(id).delete();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  app.patch("/api/admin/zones/:id/toggle", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const id = req.params["id"] as string;
      const doc = await db.collection("zones").doc(id).get();
      if (!doc.exists) return res.status(404).json({ error: "غير موجود" });
      const current = (doc.data() as any).isActive;
      await doc.ref.update({ isActive: !current, updatedAt: new Date().toISOString() });
      res.json({ success: true, isActive: !current });
    } catch {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTERPRISE RATING & STORE RANKING SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/stores/:id/ratings — paginated ratings for a vendor (public) ──
  app.get("/api/stores/:id/ratings", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ average: 0, total: 0, breakdown: [], items: [], hasMore: false });

      const vendorId = req.params["id"] as string;
      const filterParam = (req.query["filter"] as string) ?? "newest";
      const pageParam   = Math.max(1, parseInt((req.query["page"] as string) ?? "1", 10));
      const limitParam  = Math.min(50, Math.max(1, parseInt((req.query["limit"] as string) ?? "20", 10)));
      const qParam      = (req.query["q"] as string)?.trim().toLowerCase() ?? "";

      let query = db.collection("ratings")
        .where("vendorId", "==", vendorId)
        .where("hidden",   "==", false)
        .where("deleted",  "==", false);

      if (filterParam === "with_images") {
        query = (query as any).where("image", "!=", "");
      }

      const snap = await query.get();
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

      // text search
      if (qParam) {
        items = items.filter((r: any) =>
          (r.comment ?? "").toLowerCase().includes(qParam)
        );
      }

      // breakdown
      const breakdown: { stars: number; count: number }[] = [5, 4, 3, 2, 1].map((s) => ({
        stars: s,
        count: items.filter((r: any) => r.stars === s).length,
      }));

      const totalRatings = items.reduce((s: number, r: any) => s + (r.stars ?? 0), 0);
      const average = items.length > 0 ? Math.round((totalRatings / items.length) * 10) / 10 : 0;
      const total   = items.length;

      // sort
      if (filterParam === "highest") items.sort((a: any, b: any) => b.stars - a.stars);
      else if (filterParam === "lowest") items.sort((a: any, b: any) => a.stars - b.stars);
      else items.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const offset   = (pageParam - 1) * limitParam;
      const paginated = items.slice(offset, offset + limitParam);
      const hasMore  = offset + limitParam < items.length;

      const mapped = paginated.map((r: any) => ({
        id:              r.id,
        stars:           r.stars,
        comment:         r.comment ?? "",
        image:           r.image ?? "",
        customerPhone:   r.customerPhone ?? "",
        createdAt:       r.createdAt,
        vendorReply:     r.vendorReply ?? "",
        vendorRepliedAt: r.vendorRepliedAt ?? null,
        ratingType:      r.ratingType ?? "customer",
      }));

      res.json({ average, total, breakdown, items: mapped, hasMore });
    } catch (err) {
      console.error("GET store ratings:", err);
      res.json({ average: 0, total: 0, breakdown: [], items: [], hasMore: false });
    }
  });

  // ── PUT /api/ratings/:id — customer edits rating (7-day window) ────────────
  app.put("/api/ratings/:id", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization || "";
    const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!rawToken) return res.status(401).json({ error: "يرجى تسجيل الدخول" });
    let callerPhone: string;
    try {
      const decoded = jwt.verify(rawToken, ROUTES_JWT_SECRET) as any;
      if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid");
      callerPhone = decoded.phoneNumber;
    } catch {
      return res.status(401).json({ error: "انتهت صلاحية الجلسة" });
    }

    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "DB unavailable" });

      const ratingId = req.params["id"] as string;
      const doc = await db.collection("ratings").doc(ratingId).get();
      if (!doc.exists) return res.status(404).json({ error: "التقييم غير موجود" });

      const data = doc.data() as any;
      if (data.customerPhone !== callerPhone) return res.status(403).json({ error: "غير مصرح" });

      // 7-day edit window
      const createdAt = new Date(data.createdAt).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - createdAt > sevenDays) {
        return res.status(403).json({ error: "انتهت مدة تعديل التقييم (7 أيام)" });
      }

      const stars   = Number(req.body.stars);
      const comment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 500) : data.comment;
      const image   = typeof req.body.image   === "string" ? req.body.image.slice(0, 400000) : data.image;

      if (!isNaN(stars) && (stars < 1 || stars > 5)) {
        return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
      }

      const updatedAt = new Date().toISOString();
      const updates: any = { comment, image, updatedAt };
      if (!isNaN(stars) && stars >= 1) updates.stars = stars;

      await doc.ref.update(updates);
      res.json({ success: true });
    } catch (err) {
      console.error("PUT rating:", err);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── PATCH /api/ratings/:id/vendor-reply — vendor replies to a rating ───────
  app.patch("/api/ratings/:id/vendor-reply", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "DB unavailable" });

      const ratingId = req.params["id"] as string;
      const reply = typeof req.body.reply === "string" ? req.body.reply.trim().slice(0, 1000) : "";
      if (!reply) return res.status(400).json({ error: "الرد فارغ" });

      await db.collection("ratings").doc(ratingId).update({
        vendorReply:     reply,
        vendorRepliedAt: new Date().toISOString(),
      });
      res.json({ success: true });
    } catch (err) {
      console.error("vendor reply:", err);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── GET /api/admin/ratings — all ratings with filters ─────────────────────
  app.get("/api/admin/ratings", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ items: [], total: 0 });

      const vendorId   = (req.query["vendorId"]  as string) ?? "";
      const starsParam = req.query["stars"]   as string;
      const hiddenParam= req.query["hidden"]  as string;
      const qParam     = ((req.query["q"] as string) ?? "").trim().toLowerCase();
      const pageParam  = Math.max(1, parseInt((req.query["page"] as string) ?? "1", 10));
      const limitParam = Math.min(100, parseInt((req.query["limit"] as string) ?? "50", 10));

      let query: any = db.collection("ratings").orderBy("createdAt", "desc");
      if (vendorId) query = query.where("vendorId", "==", vendorId);
      if (starsParam) query = query.where("stars", "==", parseInt(starsParam, 10));

      const snap = await query.limit(500).get();
      let items = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as any[];

      if (hiddenParam === "true")  items = items.filter((r) => r.hidden  === true);
      if (hiddenParam === "false") items = items.filter((r) => r.hidden  !== true);
      if (qParam) {
        items = items.filter((r: any) =>
          (r.comment ?? "").toLowerCase().includes(qParam) ||
          (r.customerPhone ?? "").includes(qParam)
        );
      }

      const total  = items.length;
      const offset = (pageParam - 1) * limitParam;
      const paginated = items.slice(offset, offset + limitParam);

      // Attach vendor names
      const vendorIds = [...new Set(paginated.map((r: any) => r.vendorId).filter(Boolean))] as string[];
      const vendorMap: Record<string, string> = {};
      if (vendorIds.length > 0) {
        await Promise.all(
          vendorIds.map(async (vid) => {
            const vSnap = await db.collection("vendors").doc(vid).get();
            if (vSnap.exists) vendorMap[vid] = (vSnap.data() as any).storeName ?? vid;
          })
        );
      }

      const mapped = paginated.map((r: any) => ({
        ...r,
        storeName: vendorMap[r.vendorId] ?? "",
      }));

      res.json({ items: mapped, total, hasMore: offset + limitParam < total });
    } catch (err) {
      console.error("GET admin/ratings:", err);
      res.json({ items: [], total: 0 });
    }
  });

  // ── POST /api/admin/ratings — admin adds a rating to a store ──────────────
  app.post("/api/admin/ratings", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "DB unavailable" });

      const { vendorId, stars, comment, reason, visible } = req.body;
      if (!vendorId || !stars) return res.status(400).json({ error: "بيانات ناقصة" });

      const numStars = Number(stars);
      if (isNaN(numStars) || numStars < 1 || numStars > 5) {
        return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
      }

      const now = new Date().toISOString();
      const ratingRef = await db.collection("ratings").add({
        orderId:      null,
        vendorId,
        customerPhone: "admin",
        stars:        numStars,
        comment:      comment ?? "",
        image:        "",
        ratingType:   "admin",
        reason:       reason ?? "",
        hidden:       visible === false,
        deleted:      false,
        adminNote:    "",
        vendorReply:  "",
        vendorRepliedAt: null,
        createdAt:    now,
        updatedAt:    now,
      });

      // Update vendor aggregate
      const vendorRef = db.collection("vendors").doc(vendorId);
      await db.runTransaction(async (tx) => {
        const vSnap = await tx.get(vendorRef);
        if (!vSnap.exists) return;
        const v = vSnap.data() as any;
        const oldCount  = v.ratingCount ?? 0;
        const oldRating = v.rating ?? null;
        const newCount  = oldCount + 1;
        const newRating = (oldRating === null || oldCount === 0)
          ? numStars
          : Math.round(((oldRating * oldCount + numStars) / newCount) * 10) / 10;
        tx.update(vendorRef, { rating: newRating, ratingCount: newCount });
      });

      invalidateVendorsCache();
      res.json({ success: true, id: ratingRef.id });
    } catch (err) {
      console.error("POST admin/ratings:", err);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── PATCH /api/admin/ratings/:id — hide/show/delete/note/admin-reply ───────
  app.patch("/api/admin/ratings/:id", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "DB unavailable" });

      const ratingId = req.params["id"] as string;
      const doc = await db.collection("ratings").doc(ratingId).get();
      if (!doc.exists) return res.status(404).json({ error: "التقييم غير موجود" });

      const { action, note, reply } = req.body;
      const updates: any = { updatedAt: new Date().toISOString() };

      if (action === "hide")    updates.hidden  = true;
      if (action === "show")    updates.hidden  = false;
      if (action === "delete")  updates.deleted = true;
      if (action === "restore") updates.deleted = false;
      if (action === "note"  && typeof note  === "string") updates.adminNote  = note.slice(0, 500);
      if (action === "reply" && typeof reply === "string") updates.adminReply = reply.slice(0, 1000);

      await doc.ref.update(updates);
      res.json({ success: true });
    } catch (err) {
      console.error("PATCH admin/ratings/:id:", err);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── PATCH /api/admin/stores/:id/rank — update store ranking fields ─────────
  app.patch("/api/admin/stores/:id/rank", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "DB unavailable" });

      const vendorId = req.params["id"] as string;
      const { featured, pinnedToTop, manualRank, priority, featuredUntil } = req.body;

      const updates: any = { vendorId, updatedAt: new Date().toISOString() };
      if (featured    !== undefined) updates.featured    = Boolean(featured);
      if (pinnedToTop !== undefined) updates.pinnedToTop = Boolean(pinnedToTop);
      if (manualRank  !== undefined) updates.manualRank  = manualRank === null ? null : Number(manualRank);
      if (priority    !== undefined) updates.priority    = Number(priority) || 0;
      if (featuredUntil !== undefined) updates.featuredUntil = featuredUntil || null;

      await db.collection("storeRankings").doc(vendorId).set(updates, { merge: true });
      invalidateVendorsCache();
      res.json({ success: true });
    } catch (err) {
      console.error("PATCH admin/stores/:id/rank:", err);
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── GET /api/admin/store-ranking — get all vendors with ranking data ────────
  app.get("/api/admin/store-ranking", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json([]);

      const [vendorSnap, rankSnap] = await Promise.all([
        db.collection("vendors").get(),
        db.collection("storeRankings").get(),
      ]);

      const rankMap: Record<string, any> = {};
      rankSnap.docs.forEach((d) => { rankMap[d.id] = d.data(); });

      const vendors = vendorSnap.docs.map((d) => {
        const v    = d.data() as any;
        const rank = rankMap[d.id] ?? {};
        return {
          id:            d.id,
          storeName:     v.storeName ?? "",
          categoryType:  v.categoryType ?? "",
          rating:        v.rating ?? null,
          ratingCount:   v.ratingCount ?? 0,
          isOpen:        v.isOpen ?? false,
          featured:      rank.featured    ?? false,
          pinnedToTop:   rank.pinnedToTop ?? false,
          manualRank:    rank.manualRank  ?? null,
          priority:      rank.priority    ?? 0,
          featuredUntil: rank.featuredUntil ?? null,
          createdAt:     v.createdAt ?? "",
        };
      });

      // Sort by: pinned → manualRank → priority → rating → ratingCount → createdAt
      vendors.sort((a, b) => {
        if (a.pinnedToTop !== b.pinnedToTop) return a.pinnedToTop ? -1 : 1;
        if ((a.manualRank ?? 999999) !== (b.manualRank ?? 999999))
          return (a.manualRank ?? 999999) - (b.manualRank ?? 999999);
        if (a.priority !== b.priority) return b.priority - a.priority;
        if ((a.rating ?? 0) !== (b.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
        if (a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      res.json(vendors);
    } catch (err) {
      console.error("GET admin/store-ranking:", err);
      res.json([]);
    }
  });

  // ── Business Categories (vendor types + product categories per type) ────────
  app.get("/api/admin/business-categories", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ config: {} });
      const snap = await db.collection("businessCategoryConfig").get();
      const config: Record<string, any> = {};
      snap.docs.forEach((d) => { config[d.id] = d.data(); });
      res.json({ config });
    } catch (err) {
      console.error("GET business-categories:", err);
      res.json({ config: {} });
    }
  });

  app.put("/api/admin/business-categories/:key", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const { key } = req.params as { key: string };
      const { label, categories } = req.body as { label: string; categories: string[] };
      if (!key || !label || !Array.isArray(categories)) {
        return res.status(400).json({ error: "label and categories are required" });
      }
      await db.collection("businessCategoryConfig").doc(key).set({ label, categories }, { merge: true });
      res.json({ success: true });
    } catch (err) {
      console.error("PUT business-categories:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.patch("/api/admin/business-categories/:key/toggle", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const { key } = req.params as { key: string };
      const { enabled } = req.body as { enabled: boolean };
      await db.collection("businessCategoryConfig").doc(key).set({ enabled }, { merge: true });
      res.json({ success: true });
    } catch (err) {
      console.error("PATCH business-categories toggle:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.delete("/api/admin/business-categories/:key", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB unavailable" });
      const { key } = req.params as { key: string };
      await db.collection("businessCategoryConfig").doc(key).delete();
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE business-categories:", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // ── GET /api/admin/ratings-dashboard — top/worst rated + recent comments ───
  app.get("/api/admin/ratings-dashboard", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ topStores: [], worstStores: [], recentRatings: [] });

      const [vendorSnap, ratingsSnap] = await Promise.all([
        db.collection("vendors").get(),
        db.collection("ratings")
          .where("hidden",  "==", false)
          .where("deleted", "==", false)
          .orderBy("createdAt", "desc")
          .limit(100)
          .get(),
      ]);

      const vendors = vendorSnap.docs.map((d) => ({
        id:          d.id,
        storeName:   (d.data() as any).storeName ?? "",
        rating:      (d.data() as any).rating ?? null,
        ratingCount: (d.data() as any).ratingCount ?? 0,
      }));

      const withRating = vendors.filter((v) => v.rating !== null && v.ratingCount >= 1);
      const topStores    = [...withRating].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 10);
      const worstStores  = [...withRating].sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0)).slice(0, 10);

      const recentRatings = ratingsSnap.docs.slice(0, 20).map((d) => {
        const r = d.data() as any;
        const vendor = vendors.find((v) => v.id === r.vendorId);
        return {
          id:          d.id,
          stars:       r.stars,
          comment:     r.comment ?? "",
          createdAt:   r.createdAt,
          storeName:   vendor?.storeName ?? "",
          customerPhone: r.customerPhone ?? "",
        };
      });

      res.json({ topStores, worstStores, recentRatings });
    } catch (err) {
      console.error("GET admin/ratings-dashboard:", err);
      res.json({ topStores: [], worstStores: [], recentRatings: [] });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════

  const httpServer = createServer(app);

  // ── Socket.io real-time driver location ────────────────────────────────────
  const locationFirestoreThrottle = new Map<string, number>();
  const FIRESTORE_WRITE_INTERVAL = 10_000; // write to Firestore at most every 10s

  const ioServer = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  ioServer.on("connection", (socket) => {
    // Customer joins a room to watch a specific order
    socket.on("order:watch", ({ orderId }: { orderId: string }) => {
      if (orderId) socket.join(`order:${orderId}`);
    });

    // Driver sends location via socket (replaces HTTP polling)
    socket.on("driver:location", async ({
      phoneNumber, lat, lng,
    }: { phoneNumber: string; lat: number; lng: number }) => {
      if (!phoneNumber || lat === undefined || lng === undefined) return;

      const driver = await getDriverByPhone(phoneNumber).catch(() => null);
      const fullName = driver?.fullName || "";

      // 1. Update in-memory store (same as HTTP endpoint)
      driverLocations.set(phoneNumber, {
        lat: Number(lat), lng: Number(lng),
        updatedAt: Date.now(), fullName,
      });

      // 2. Broadcast to every order room assigned to this driver
      for (const [oid, drPhone] of driverAssignments.entries()) {
        if (drPhone === phoneNumber) {
          ioServer.to(`order:${oid}`).emit("order:driverLocation", {
            lat: Number(lat), lng: Number(lng), fullName, orderId: oid,
          });
        }
      }

      // 3. Throttled Firestore write (max once per 10s per driver)
      const lastWrite = locationFirestoreThrottle.get(phoneNumber) || 0;
      if (Date.now() - lastWrite >= FIRESTORE_WRITE_INTERVAL) {
        locationFirestoreThrottle.set(phoneNumber, Date.now());
        updateDriverLastLocation(phoneNumber, Number(lat), Number(lng)).catch(() => {});
      }
    });
  });

  return httpServer;
}
