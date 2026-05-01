import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import jwt from "jsonwebtoken";
import multer, { StorageEngine, FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { 
  getFirestore, getUserByPhone, createUser, updateUser, FirestoreUserProfile,
  getProducts as getFirestoreProducts, createProduct as createFirestoreProduct, 
  updateProduct as updateFirestoreProduct, deleteProduct as deleteFirestoreProduct,
  getOrders, getOrdersByPhone, createOrder, updateOrderStatus,
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
  getDriverWalletBalance, updateDriverWalletBalance, addWalletTransaction, getWalletHistory,
  saveDriverCompletedOrder, getDriverCompletedOrdersFromDB,
  saveDriverActivity, getDriverActivityLog, updateDriverLastLocation,
  getOrdersByDriverPhone,
  getVendors as getFirestoreVendors, createVendor as createFirestoreVendor,
  updateVendor as updateFirestoreVendor, deleteVendor as deleteFirestoreVendor,
  initializeDefaultVendors,
  updateDriverOnlineStatus, getOnlineDrivers, saveDriverPushToken, getDriverPushToken,
  getSupportChat, sendSupportMessage, getAllSupportChats, markSupportChatRead,
  createDeliveryBatch, getDeliveryBatch, updateDeliveryBatch, cancelDeliveryBatch, addDeliveryLog, DeliveryBatch,
  saveAdminPushToken, getAdminPushToken
} from "./firebase";
import { sendPushNotification, sendBroadcastNotification, sendDriverBatchNotification, sendAdminNewOrderNotification } from "./pushNotifications";

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

const webpStorage: StorageEngine = multer.diskStorage({
  destination: (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    cb(null, `${randomUUID()}.webp`);
  },
});
const uploadWebP = multer({
  storage: webpStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/webp", "image/jpeg", "image/png", "image/gif", "application/octet-stream"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".webp"));
  },
});

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

const defaultVendors: Vendor[] = [
  { id: "v1", name: "يلا ايت", location: "الضلوعية - شارع التجاري", whatsappNumber: "9647701234001", commissionPercent: 10, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", rating: 4.8, deliveryTime: "25-35", isOpen: true, createdAt: new Date().toISOString() },
  { id: "v2", name: "مطعم المشويات", location: "الضلوعية - السوق المركزي", whatsappNumber: "9647701234002", commissionPercent: 12, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400", rating: 4.6, deliveryTime: "30-45", isOpen: true, createdAt: new Date().toISOString() },
  { id: "v3", name: "مطعم الأسماك", location: "الضلوعية - قرب النهر", whatsappNumber: "9647701234003", commissionPercent: 10, image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400", rating: 4.5, deliveryTime: "35-50", isOpen: false, createdAt: new Date().toISOString() },
  { id: "v4", name: "مطعم الدجاج", location: "الضلوعية - الحي الشمالي", whatsappNumber: "9647701234004", commissionPercent: 10, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400", rating: 4.4, deliveryTime: "20-30", isOpen: true, createdAt: new Date().toISOString() },
  { id: "v5", name: "مطعم اللحوم", location: "الضلوعية - قرب الجامع الكبير", whatsappNumber: "9647701234005", commissionPercent: 12, image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400", rating: 4.7, deliveryTime: "30-40", isOpen: true, createdAt: new Date().toISOString() },
];

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

const ROUTES_JWT_SECRET = process.env.JWT_SECRET || "onway-vendor-secret-2024";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // ── PUBLIC: Stores listing & products ────────────────────────────────────────
  app.get("/api/stores", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const { businessType } = req.query as { businessType?: string };
      const snap = await db.collection("vendors").where("status", "==", "active").get();
      const allDocs = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          id: v.id, storeName: v.storeName, businessType: v.businessType,
          address: v.address || "", bio: v.bio || "",
          totalProducts: v.totalProducts || 0,
          approvedAt: v.approvedAt || v.createdAt || "",
          profileImageUrl: v.profileImageUrl || "",
          coverImageUrl: v.coverImageUrl || "",
          rating: v.rating ?? 4.5,
          deliveryTime: v.deliveryTime || "30-45",
          deliveryPrice: v.deliveryPrice ?? 0,
          workingHours: v.workingHours || null,
        };
      });
      const stores = (businessType
        ? allDocs.filter((s) => s.businessType === businessType)
        : allDocs
      ).sort((a, b) => (b.approvedAt as string).localeCompare(a.approvedAt as string));
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
      const { id } = req.params;
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

      const { pid } = req.params;
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
      const { id } = req.params;
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

  // ── Admin: Get all products for a specific vendor ──────────────────────────
  app.get("/api/admin/vendor-partners/:id/products", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const { id } = req.params;
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
      const { productId } = req.params;
      const doc = await db.collection("vendorProducts").doc(productId).get();
      if (!doc.exists) return res.status(404).json({ error: "المنتج غير موجود" });
      await db.collection("vendorProducts").doc(productId).delete();
      res.json({ success: true });
    } catch (err) {
      console.error("admin delete vendor product:", err);
      res.status(500).json({ error: "فشل حذف المنتج" });
    }
  });

  // Products cache
  let productsCache: any[] | null = null;
  let productsCacheTime = 0;
  const PRODUCTS_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

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
      return productsCache.filter(p => p.categoryId === categoryId);
    }
    return productsCache;
  }

  function invalidateProductsCache() {
    productsCache = null;
    productsCacheTime = 0;
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

  // Rebuild driver queue from Firestore (restores online drivers + active batches after server restart)
  try {
    const onlineDrivers = await getOnlineDrivers();
    for (const d of onlineDrivers) {
      if (!driverQueue.find(q => q.phoneNumber === d.phoneNumber)) {
        driverQueue.push({ phoneNumber: d.phoneNumber, joinedAt: d.onlineAt });
      }
    }
    if (onlineDrivers.length > 0) {
      console.log(`Restored ${onlineDrivers.length} online driver(s) from Firestore`);
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
              console.log(`[RESTART] Stale batch ${bDoc.id} auto-completed (all orders done)`);
              continue;
            }
            const driverPhone = bData.driverId; // driverId = phone number
            const qd = driverQueue.find(d => d.phoneNumber === driverPhone);
            if (qd && !qd.currentBatchId) {
              qd.currentBatchId = bDoc.id;
              qd.lastSeenAt = Date.now();
              bData.orderIds.forEach(id => batchedOrderIds.add(id));
              console.log(`[RESTART] Restored batch ${bDoc.id} → driver ${driverPhone}`);
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
                  console.log(`[RESTART] Created new batch ${batchId} for driver ${qd.phoneNumber}`);
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
      const db = getFirestore();
      if (db) {
        const firestoreCategories = await getFirestoreCategories();
        if (firestoreCategories.length > 0) {
          const lightCategories = firestoreCategories.map(c => ({
            ...c,
            image: limitImageSize(c.image),
          }));
          res.set("Cache-Control", "public, max-age=120");
          return res.json(lightCategories);
        }
      }
      const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
      res.set("Cache-Control", "public, max-age=120");
      res.json(sortedCategories);
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

  app.post("/api/admin/upload-image", uploadWebP.single("image"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "لم يتم رفع أي صورة" });
      }
      const url = `/uploads/${req.file.filename}`;
      res.json({ url, filename: req.file.filename, size: req.file.size });
    } catch (error) {
      console.error("Error uploading image:", error);
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
          return res.json({ success: true });
        }
      }
      
      // Fallback to in-memory
      const index = categories.findIndex(c => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Category not found" });
      }
      categories.splice(index, 1);
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
      let result = await getFirestoreBanners(true);
      if (type) {
        result = result.filter(b => b.type === type);
      }
      const lightResult = result.map(b => {
        const link = bannerLinks[b.id] || {};
        return {
          ...b,
          image: limitImageSize(b.image, 100000),
          linkType: (b as any).linkType || link.linkType || "",
          linkTarget: (b as any).linkTarget || link.linkTarget || "",
        };
      });
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
      
      const banner = await updateFirestoreBanner(req.params.id, updates);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
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
      originalPrice: originalPriceNum !== undefined ? originalPriceNum : products[index].originalPrice,
      discount: discountNum !== undefined ? discountNum : products[index].discount,
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
      
      const area = await updateFirestoreDeliveryArea(req.params.id, updates);
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
    const vendors = await getVendorList();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(vendors);
  });

  app.post("/api/admin/vendors", async (req: Request, res: Response) => {
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المطعم مطلوب" });
    const existingVendors = await getVendorList();
    const maxOrder = existingVendors.reduce((max, v) => Math.max(max, v.sortOrder ?? 0), 0);
    const data = {
      name: String(name),
      location: String(location || ""),
      whatsappNumber: String(whatsappNumber || ""),
      commissionPercent: Number(commissionPercent) || 10,
      image: String(image || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400"),
      rating: Number(rating) || 4.5,
      deliveryTime: String(deliveryTime || "30-45"),
      isOpen: Boolean(isOpen !== false),
      createdAt: new Date().toISOString(),
      categoryType: (categoryType as "restaurant" | "store") || "restaurant",
      cuisine: cuisine ? String(cuisine) : "",
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
    const { id } = req.params;
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine } = req.body;
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
    try {
      await updateFirestoreVendor(id, updates);
      invalidateVendorsCache();
      res.json({ success: true, id, ...updates });
    } catch {
      res.status(500).json({ error: "فشل تحديث المطعم" });
    }
  });

  app.delete("/api/admin/vendors/:id", async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await deleteFirestoreVendor(id);
      invalidateVendorsCache();
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
  app.get("/api/orders", async (req, res) => {
    const phoneNumber = req.query.phoneNumber as string;
    const db = getFirestore();
    
    if (db) {
      const orders = phoneNumber 
        ? await getOrdersByPhone(phoneNumber)
        : await getOrders();
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
    const { userId, phoneNumber, customerName, customerPhone, notes, items, total, deliveryFee, serviceFee, address, region, latitude, longitude, orderType, internationalDetails, courierDetails, promoCode, promoDiscount } = req.body;
    const db = getFirestore();
    
    if (db) {
      if (promoCode) {
        const alreadyUsed = await checkPromoUsage(userId || phoneNumber, promoCode);
        if (alreadyUsed) {
          return res.status(400).json({ error: "لقد استخدمت هذا الكود مسبقاً!" });
        }
      }

      const orderData: any = {
        userId: userId || "",
        phoneNumber,
        items,
        total,
        deliveryFee,
        address,
        region,
        status: "pending",
      };
      if (serviceFee !== undefined) orderData.serviceFee = serviceFee;
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
      if (promoDiscount) orderData.promoDiscount = promoDiscount;

      // Detect vendor for restaurant orders
      let vendorWhatsappUrl: string | null = null;
      try {
        const allProds = await getCachedProducts(); // uses cache with restaurant fallback
        const vendorsList = await getVendorList();

        // Scan ALL items to find restaurant ones (handles mixed orders)
        const restaurantItems: any[] = [];
        let restaurantSubtotal = 0;
        let detectedRestaurantName: string | null = null;

        for (const it of (items as any[])) {
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
            console.log(`Push notification sent for order ${orderId} to ${phoneNumber}`);
          }
        }

        // When order is confirmed, create a batch for the next available driver
        if (status === "confirmed") {
          onOrderConfirmed();
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
      }

      // 5. If driver is not in queue, add them temporarily
      if (!queuedDriver) {
        driverQueue.push({
          phoneNumber: driverPhone,
          joinedAt: Date.now(),
          lastSeenAt: Date.now(),
          currentBatchId: undefined,
        });
      }

      // 6. Create a batch with this specific order for the driver
      const batchId = await createDeliveryBatch({
        driverPhone,
        orderIds: [orderId],
      });

      if (!batchId) return res.status(500).json({ error: "فشل في إنشاء الدُفعة" });

      // 7. Update in-memory queue
      const targetDriver = driverQueue.find(d => d.phoneNumber === driverPhone);
      if (targetDriver) targetDriver.currentBatchId = batchId;
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
        sendDriverBatchNotification(driverPushToken, 1, batchId).catch(() => {});
      }

      console.log(`[ADMIN] Manually assigned order ${orderId} → driver ${driverPhone} (batch ${batchId})`);
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
    const { phoneNumber, fullName, gender, region, address, profileImage } = req.body;
    
    if (!phoneNumber || !fullName || !gender || !region || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const db = getFirestore();
    
    if (db) {
      const existingUser = await getUserByPhone(phoneNumber);
      
      if (existingUser) {
        const updates: any = { fullName, gender, region, address };
        if (profileImage) updates.profileImage = profileImage;
        
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

  // OTP Auth Routes
  app.post("/api/auth/send-otp", (req: Request, res: Response) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    const code = generateOtp(phoneNumber);
    console.log(`[OTP] Sent code ${code} to ${phoneNumber}`);
    res.json({ success: true, message: "OTP sent successfully" });
  });

  app.post("/api/auth/verify-otp", (req: Request, res: Response) => {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: "Phone number and code are required" });
    }
    // OTP verification temporarily disabled - accept any code
    res.json({ success: true, message: "OTP verified" });
  });

  // Driver Routes
  app.get("/api/drivers/check/:phoneNumber", async (req: Request, res: Response) => {
    try {
      const phoneNumber = req.params.phoneNumber;
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
          // Batch no longer exists in Firestore — clear stale reference
          console.log(`[STATUS] Clearing stale batchId ${queuedDriver.currentBatchId} for driver ${phoneNumber} (not found in DB)`);
          queuedDriver.currentBatchId = undefined;
        } else {
          const allOrders = await getOrders();
          const batchOrders = batchDoc.orderIds
            .map(oid => allOrders.find(o => o.id === oid))
            .filter(Boolean)
            .map(async (order: any) => {
              const customerProfile = await getUserByPhone(order.phoneNumber || "");
              return {
                ...order,
                customerName: order.customerName || customerProfile?.fullName || "زبون",
                customerPhone: order.phoneNumber || "",
                latitude: order.latitude || null,
                longitude: order.longitude || null,
                pickedUpAt: order.pickedUpAt || null,
                deliveredAt: order.deliveredAt || null,
                deliverySequence: order.deliverySequence || 1,
                createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt,
                updatedAt: order.updatedAt?.toDate?.() ? order.updatedAt.toDate().toISOString() : order.updatedAt,
              };
            });
          const resolvedOrders = await Promise.all(batchOrders);
          const completedCount = resolvedOrders.filter(o => o.status === "delivered" || o.status === "issue" || o.status === "cancelled").length;
          // If all orders in the batch are done (delivered/issue/cancelled), auto-clear the batch
          if (resolvedOrders.length > 0 && completedCount === resolvedOrders.length) {
            console.log(`[STATUS] All orders delivered in batch ${batchDoc.id} — auto-clearing for driver ${phoneNumber}`);
            queuedDriver.currentBatchId = undefined;
            batchDoc.orderIds.forEach(id => batchedOrderIds.delete(id));
            // Mark batch as completed in Firestore
            const db2 = getFirestore();
            if (db2) db2.collection("delivery_batches").doc(batchDoc.id).update({ status: "completed", updatedAt: new Date() }).catch(() => {});
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

      const walletBalance = await getDriverWalletBalance(phoneNumber);

      const completed = await getCompletedOrders(phoneNumber);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayCompleted = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);

      res.json({
        isOnline,
        queuePosition,
        currentBatch,
        approvalStatus: driver?.status || "pending",
        walletBalance,
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
    // Mark driver as recently seen (active app)
    const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
    if (qd) qd.lastSeenAt = Date.now();
    // Persist last location to Firestore driver document
    updateDriverLastLocation(phoneNumber, Number(lat), Number(lng)).catch(() => {});
    res.json({ success: true });
  });

  // Get driver location for a specific order (customer-facing)
  app.get("/api/orders/:orderId/driver-location", async (req: Request, res: Response) => {
    const { orderId } = req.params;
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
        const walletBalance = await getDriverWalletBalance(phoneNumber);
        if (walletBalance < 250) {
          return res.status(400).json({ error: "رصيد المحفظة غير كافٍ. الحد الأدنى ٢٥٠ د.ع", walletBalance });
        }
        const exists = driverQueue.find(d => d.phoneNumber === phoneNumber);
        if (!exists) {
          driverQueue.push({ phoneNumber, joinedAt: Date.now(), lastSeenAt: Date.now() });
        } else {
          exists.lastSeenAt = Date.now();
        }
        // Save push token for driver notifications (in-memory AND Firestore)
        if (pushToken && pushToken.startsWith("ExponentPushToken")) {
          const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
          if (qd) qd.pushToken = pushToken;
          saveDriverPushToken(phoneNumber, pushToken).catch(() => {});
          console.log(`[PUSH] Saved driver push token for ${phoneNumber}: ...${pushToken.slice(-12)}`);
        } else {
          console.log(`[PUSH] No valid push token provided for ${phoneNumber} on toggle-online`);
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
      console.log(`[PUSH] Refreshed driver push token for ${phoneNumber}: ...${pushToken.slice(-12)}`);
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
        // Move driver to end of queue
        const savedPushToken = qd.pushToken;
        const idx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
          driverQueue.push({ phoneNumber, joinedAt: Date.now(), pushToken: savedPushToken });
        }
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
      console.log(`[REJECT] Driver ${phoneNumber} (${driverName}) rejected batch ${targetBatchId} (${orderCount} orders) — cooldown set`);
      saveDriverActivity({ phoneNumber, type: "rejected", orderId: targetBatchId || orderId }).catch(() => {});
      // Offer waiting orders to another available driver (NOT the one who just rejected)
      // Note: do NOT also call assignWaitingBatchToDriver here — onOrderConfirmed handles it
      onOrderConfirmed();
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
      if (qd) qd.currentBatchId = batchId;
      saveDriverActivity({ phoneNumber, type: "accepted", orderId: batchId }).catch(() => {});
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark one order as picked up (preparing → delivering)
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
        const currentBalance = await getDriverWalletBalance(phoneNumber);
        const newBalance = currentBalance - deductionAmount;
        await updateDriverWalletBalance(phoneNumber, newBalance);
        await addWalletTransaction({ phoneNumber, amount: deductionAmount, type: "deduction", service: isRestaurantOrder ? "توصيل مطعم" : "توصيل تسويق/خدمات", orderId });

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
            // Check wallet before assigning next batch
            if (newBalance >= 250) {
              assignWaitingBatchToDriver(phoneNumber).catch(() => {});
            } else {
              const queueIdx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
              if (queueIdx !== -1) driverQueue.splice(queueIdx, 1);
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

  // Complete order
  app.post("/api/driver/complete-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });

    try {
      const db = getFirestore();
      if (db) {
        await updateOrderStatus(orderId, "delivered");

        const allOrders = await getOrders();
        const order = allOrders.find(o => o.id === orderId);
        if (order) {
          const customerProfile = await getUserByPhone(order.phoneNumber || "");
          const pushToken = await getUserPushToken(order.phoneNumber || "");
          if (pushToken) {
            await sendPushNotification(pushToken, "delivered", orderId);
          }

          const isRestaurantOrder = await checkIsRestaurantOrder(order);
          let deductionAmount = 0;
          let driverEarning = 0;

          if (isRestaurantOrder) {
            deductionAmount = 250;
            driverEarning = 750;
          } else {
            deductionAmount = 1000;
            driverEarning = 2000;
          }

          const ownerEarning = deductionAmount;

          await updateOrderDriverInfo(orderId, {
            driverEarning,
            ownerEarning,
          });

          const currentBalance = await getDriverWalletBalance(phoneNumber);
          const newBalance = currentBalance - deductionAmount;
          await updateDriverWalletBalance(phoneNumber, newBalance);

          await addWalletTransaction({
            phoneNumber,
            amount: deductionAmount,
            type: "deduction",
            service: isRestaurantOrder ? "توصيل مطعم" : "توصيل تسويق/خدمات",
            orderId,
          });

          if (newBalance < 250) {
            const queueIdx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
            if (queueIdx !== -1) {
              driverQueue.splice(queueIdx, 1);
            }
          }

          const completedEntry = {
            orderId,
            deliveryFee: order.deliveryFee || 0,
            driverEarning,
            ownerEarning,
            total: order.total || 0,
            customerName: customerProfile?.fullName || "زبون",
            completedAt: new Date().toISOString(),
            isRestaurant: isRestaurantOrder,
          };
          // Persist to Firestore (permanent storage)
          await saveDriverCompletedOrder(phoneNumber, completedEntry);
          // Log completed activity
          saveDriverActivity({
            phoneNumber,
            type: "completed",
            orderId,
            customerName: completedEntry.customerName,
            driverEarning,
            total: completedEntry.total,
          }).catch(() => {});
          // Also keep in-memory cache
          const completed = driverCompletedOrders.get(phoneNumber) || [];
          completed.push(completedEntry);
          driverCompletedOrders.set(phoneNumber, completed);
        }
      }

      driverAssignments.delete(orderId);
      batchedOrderIds.delete(orderId);
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
      if (qd) {
        qd.currentBatchId = undefined;
        // Assign next waiting batch if driver is still in queue (wallet OK)
        assignWaitingBatchToDriver(phoneNumber).catch(() => {});
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

      const todayOrders = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
      const weekOrders = completed.filter(o => new Date(o.completedAt).getTime() >= weekStart);

      res.json({
        totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        todayEarnings: todayOrders.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        weekEarnings: weekOrders.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        totalOrders: completed.length,
        todayOrders: todayOrders.length,
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
      const balance = await getDriverWalletBalance(phoneNumber);
      const history = await getWalletHistory(phoneNumber);
      res.json({ balance, history });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/driver-wallet/recharge", async (req: Request, res: Response) => {
    const { phoneNumber, amount } = req.body;
    if (!phoneNumber || amount === undefined) return res.status(400).json({ error: "Missing fields" });

    try {
      const currentBalance = await getDriverWalletBalance(phoneNumber);
      const newBalance = currentBalance + Number(amount);
      await updateDriverWalletBalance(phoneNumber, newBalance);

      await addWalletTransaction({
        phoneNumber,
        amount: Number(amount),
        type: "recharge",
        service: "شحن رصيد",
      });

      res.json({ success: true, newBalance });
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

  // Find the best available driver: prefer one with recent GPS (app is open)
  function findBestAvailableDriver(): QueuedDriver | undefined {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const activeDriver = driverQueue.find(d => {
      if (d.currentBatchId) return false;
      const loc = driverLocations.get(d.phoneNumber);
      const recentGps = loc && loc.updatedAt >= fiveMinAgo;
      const recentSeen = d.lastSeenAt && d.lastSeenAt >= fiveMinAgo;
      return recentGps || recentSeen;
    });
    if (activeDriver) return activeDriver;
    return driverQueue.find(d => !d.currentBatchId);
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
    console.log(`[BATCH_ASSIGN] Starting for driver ${phoneNumber}`);
    try {
      const db = getFirestore();
      if (!db) { console.log(`[BATCH_ASSIGN] No DB`); return; }
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber && !d.currentBatchId);
      if (!qd) {
        const inQueue = driverQueue.find(d => d.phoneNumber === phoneNumber);
        console.log(`[BATCH_ASSIGN] Driver not eligible — inQueue=${!!inQueue}, currentBatchId=${inQueue?.currentBatchId}`);
        return;
      }
      const allOrders = await getOrders();
      const confirmedOrders = allOrders.filter(o => o.status === "confirmed");
      // Get active batch IDs from all drivers in queue (in-memory)
      const activeBatchIds = new Set(driverQueue.map(d => d.currentBatchId).filter(Boolean) as string[]);
      console.log(`[BATCH_ASSIGN] Total orders=${allOrders.length}, confirmed=${confirmedOrders.length}, activeBatches=${activeBatchIds.size}, batchedSet-size=${batchedOrderIds.size}`);
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
              console.log(`[BATCH_ASSIGN] Skipping order ${o.id} — in cooldown for driver ${phoneNumber}`);
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
      console.log(`[BATCH_ASSIGN] Waiting orders to assign: ${waitingOrders.length} (${waitingOrders.map(o => o.id).join(",")})`);
      if (waitingOrders.length === 0) return;

      // Nearest-Neighbor route optimization
      const routeInfo = optimizeDeliveryRoute(waitingOrders);
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
        console.log(`[BATCH] Created batch ${batchId} (${optimizedIds.length} orders, ~${totalDistance.toFixed(1)} km) for driver ${phoneNumber}`);
        // Send push notification: use in-memory token first (fast), fallback to Firestore
        const inMemoryToken = qd?.pushToken;
        const driverPushToken = inMemoryToken || await getDriverPushToken(phoneNumber);
        if (driverPushToken) {
          console.log(`[PUSH] Sending batch notification to driver ${phoneNumber} (token: ...${driverPushToken.slice(-12)})`);
          sendDriverBatchNotification(driverPushToken, optimizedIds.length, batchId)
            .then(ok => console.log(`[PUSH] Batch notification ${ok ? "sent OK" : "FAILED"} → ${phoneNumber}`))
            .catch(e => console.error(`[PUSH] Batch notification error → ${phoneNumber}:`, e));
        } else {
          console.warn(`[PUSH] No push token for driver ${phoneNumber} — notification NOT sent`);
        }
      }
    } catch (e) {
      console.error("assignWaitingBatchToDriver error:", e);
    }
  }

  // Assign new batch to best available driver when a confirmed order arrives
  function onOrderConfirmed() {
    console.log(`[ORDER_CONFIRMED] Queue size=${driverQueue.length}, queue=${JSON.stringify(driverQueue.map(d=>({p:d.phoneNumber,batch:d.currentBatchId,lastSeen:d.lastSeenAt})))}`);
    const driver = findBestAvailableDriver();
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

  // Watch for confirmed orders → assign to FIFO queue
  app.post("/api/driver/assign-pending-orders", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ assigned: 0 });

      const allOrders = await getOrders();
      const pendingOrders = allOrders
        .filter(o => o.status === "confirmed" && !driverAssignments.has(o.id))
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
          return aTime - bTime;
        });

      let assigned = 0;
      for (const order of pendingOrders) {
        const availableDriver = driverQueue.find(d => !d.currentBatchId);
        if (availableDriver) {
          availableDriver.currentBatchId = order.id;
          assigned++;
          console.log(`[FIFO] Order ${order.id} assigned to driver ${availableDriver.phoneNumber}`);
        } else {
          break;
        }
      }

      res.json({ assigned });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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

      const stats: Record<string, { todayOrders: number; todayEarnings: number; totalOrders: number; totalEarnings: number; walletBalance: number }> = {};

      for (const driver of drivers) {
        const phone = driver.phoneNumber;
        const completed = await getCompletedOrders(phone);
        const todayCompleted = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
        const walletBalance = await getDriverWalletBalance(phone);

        stats[phone] = {
          todayOrders: todayCompleted.length,
          todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
          totalOrders: completed.length,
          totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
          walletBalance,
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
      await updatePromoCode(req.params.id, {
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
      await deletePromoCodeFn(req.params.id);
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
      const { orderId } = req.params;
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
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
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
        console.log(`Geocode ${lat},${lng} => ${finalAddress}`);
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

  // Admin: get all chats
  app.get("/api/admin/support/chats", async (_req: Request, res: Response) => {
    try {
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
    const { phoneNumber } = req.params;
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

  const httpServer = createServer(app);
  return httpServer;
}
