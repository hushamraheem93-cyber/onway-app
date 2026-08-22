import express from "express";
import type { Express, Request, Response } from "express";
import type { IncomingMessage } from "http";
import { createServer, type Server } from "node:http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { AggregateField, Filter, Timestamp } from "firebase-admin/firestore";
import multer from "multer";
import sharp from "sharp";
import { randomUUID, createHash } from "crypto";
import { orderEvents } from "./orderEvents";
import { isValidSession, getSessionUsername } from "./adminAuth";
import { adminIdentityFromRequest } from "./adminAuthorization";
import { isCustomerTokenRevoked, revokeCustomerTokens } from "./customerRevocation";
import { DEFAULT_NOTIFICATION_PREFS, normalizeNotificationPrefs } from "../shared/notificationPrefs";
import {
  CMS_IMAGE_FIELDS,
  CMS_IMAGE_NO_PERSIST,
  isCmsSection,
  parseWebsiteContent,
  type CmsSection,
} from "./websiteContentSchema";
import {
  buildOriginPolicyFromEnv,
  isOriginAllowed,
  selfOriginFromHeaders,
} from "./originGuard";
import { 
  getFirestore, getUserByPhone, createUser, updateUser,
  getUserAddresses, setUserAddresses, uploadToFirebaseStorage,
  getProducts as getFirestoreProducts, createProduct as createFirestoreProduct, 
  updateProduct as updateFirestoreProduct, deleteProduct as deleteFirestoreProduct,
  getOrders, getOrderById, getOrdersByIds, getOrdersByStatus, getOrdersByPhone, createOrder, createOrderWithInventory, updateOrderStatus,
  updateUserPushToken, getUserPushToken, getAllUserPushTokens, getAllUsers,
  getMarketingPushTokens, getUserNotificationPrefs, setUserNotificationPrefs,
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
  getDrivers, getDriverByPhone, findDriverDocByPhone, getVendorByPhone, createDriver, updateDriverStatus as updateDriverStatusFn, deleteDriver as deleteDriverFn,
  updateOrderDriverInfo,
  getPromoCodes, getPromoCodeByCode, createPromoCode, updatePromoCode, deletePromoCode as deletePromoCodeFn,
  checkPromoUsage, recordPromoUsage,
  claimPromoUsage, releasePromoUsage, countPromoUsage,
  saveDriverCompletedOrder, getDriverCompletedOrdersFromDB,
  saveDriverActivity, getDriverActivityLog, updateDriverLastLocation,
  getOrdersByDriverPhone, getDriverPerformanceOrders, getDriverDeliveryLogs,
  getVendors as getFirestoreVendors, createVendor as createFirestoreVendor,
  updateVendor as updateFirestoreVendor, deleteVendor as deleteFirestoreVendor,
  initializeDefaultVendors,
  updateDriverOnlineStatus, saveDriverPushToken, getDriverPushToken,
  getSupportChat, sendSupportMessage, getAllSupportChats, markSupportChatRead, clearSupportChat,
  createDeliveryBatch, getDeliveryBatch, updateDeliveryBatch, cancelDeliveryBatch, addDeliveryLog, DeliveryBatch,
  claimBatchForDriver, cancelBatchIfPending,
  saveAdminPushToken, getAdminPushToken,
  addDriverToActiveQueue, removeDriverFromActiveQueue, updateDriverQueueEntry, getActiveDriverQueue,
  deleteFromFirebaseStorage,
  uploadPrivateToFirebaseStorage, getSignedDriverDocUrl
} from "./firebase";
import { pickBestAddress, geocodeDiagnostics } from "./geocode";
import { timestampMillis } from "./time";
import { buildDriverPerformance } from "./driverPerformance";

// Reverse-geocode result cache. Google charges per request and enforces a quota, and
// the same coordinates are looked up repeatedly (a saved address, a store pin). Keyed
// by coordinates rounded to ~11 m; entries expire after 24 h. Bounded so it can never
// grow without limit. This is a cost/latency optimisation only — a miss just calls Google.
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEOCODE_CACHE_MAX = 5000;
const geocodeCache = new Map<string, { value: { address: string; placeName?: string | null; resolved: boolean }; expires: number }>();

/** fetch JSON with a hard timeout so a slow Google call can never hang the request. */
async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return await res.json();
  } catch {
    return null;
  }
}
import {
  recordOrderSettlement, createSettlementRequest, getAccountSettlementView,
  getSettlementHistory, listSettlementRequests, completeSettlement,
  getSettlementConfig, updateSettlementConfig, isOverSettlementThreshold,
  listSettlementAccounts, getSettlementPayments, getSettlementLedger,
  adminAdjustLedger, retryOrderSettlements, vendorCommissionBase, promoSettlementAmounts,
  transitionSettlementRequest, markLedgerOwnerDeleted,
} from "./settlement";
import type { OrderSettlementInput } from "./settlement";
// H-72: a driver's money is keyed by their walletId, never by their phone.
import { driverWalletIdOf, resolveDriverAccountId } from "./walletIdentity";
import {
  recordLedgerEntries, recordAudit, orderEntryId, getAccountStatement, listAuditLog, getLedgerBalance,
} from "./financialLedger";
import type { LedgerInput } from "./financialLedger";
import {
  sanitizeQuantity,
  capOrderItemImages,
  buildStoredOrderItem,
  parseLatitude,
  parseLongitude,
  validateOrderFields,
  checkDocumentImageLimits,
  documentRejectionStatus,
  documentRejectionMessage,
  MAX_DOCUMENT_PIXELS,
  type DocumentImageRejection,
  safeImageExtension,
  safeImageContentType,
  sniffImageMime,
  GENERIC_SERVER_ERROR,
  isValidProductPrice,
  isValidCommissionPercent,
  commissionPercentOf,
  DEFAULT_COMMISSION_PERCENT,
  JWT_VERIFY_OPTS,
  csvCell,
  csvNumber,
  type ResolvedOrderLine,
} from "./orderValidation";
import { isServiceOrderType, resolveServiceOrder } from "./serviceOrders";
import {
  DEFAULT_DELIVERY_PRICING,
  normalizeDeliveryPricing,
  splitDeliveryFee,
  orderKindForVendor,
  type DeliveryPricing,
  type OrderKind,
} from "../shared/deliveryPricing";
import { normalizeWorkingHours } from "../shared/storeHours";
import { isProductAvailable } from "../shared/productAvailability";
import { sendPushNotification, sendBroadcastNotification, sendDriverBatchNotification, sendAdminNewOrderNotification, sendVendorNewOrderNotification, sendAdminSettlementRequestNotification, sendVendorOrderCancelledNotification, sendDriverOrderCancelledNotification } from "./pushNotifications";
import { deliverOtp } from "./otpDelivery";
import { isDevMode, isDemoSeedAllowed, demoSeedDenialReason } from "./env";

// (The disk-storage multer engine and its `uploads/` directory were removed here.
//  Their only consumer was POST /api/upload, which had no callers. Every upload in
//  the app now goes through memory storage straight to Firebase Storage, so nothing
//  is ever written to the VM's local disk — which was ephemeral and wiped on every
//  redeploy, silently invalidating any URL that pointed at it.)

// uploadWebP uses memory storage — admin images go directly to Firebase Storage
const uploadWebP = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/webp", "image/jpeg", "image/png", "image/gif", "application/octet-stream"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".webp"));
  },
});

function detectedUploadImageMime(file: Express.Multer.File): string | null {
  const detected = sniffImageMime(file.buffer);
  return detected && ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(detected)
    ? detected
    : null;
}

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
  { id: "restaurants", name: "المطاعم", image: "/assets/seed/category-restaurants.png", productCount: 30, order: 1, color: "#FFF3E0", iconColor: "#FB5B21" },
  { id: "fruits-vegetables", name: "الخضروات والفواكه", image: "/assets/seed/category-vegetables.png", productCount: 50, order: 2, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "اللحوم والطازج", image: "/assets/seed/category-meat.png", productCount: 55, order: 3, color: "#FFEBEE", iconColor: "#EF5350" },
  { id: "dairy-eggs", name: "الألبان والأجبان", image: "/assets/seed/category-dairy.png", productCount: 70, order: 4, color: "#F3E5F5", iconColor: "#AB47BC" },
  { id: "cleaning-care", name: "المنظفات", image: "/assets/seed/category-cleaning.png", productCount: 95, order: 5, color: "#E3F2FD", iconColor: "#42A5F5" },
  { id: "beverages", name: "المشروبات", image: "/assets/seed/category-beverages.png", productCount: 90, order: 6, color: "#E0F7FA", iconColor: "#26C6DA" },
  { id: "snacks-sweets", name: "سناكس ومقرمشات", image: "/assets/seed/category-snacks.png", productCount: 110, order: 7, color: "#FFF3E0", iconColor: "#FFA726" },
  { id: "tea-coffee", name: "شاي وقهوة", image: "/assets/seed/category-coffee.png", productCount: 35, order: 8, color: "#EFEBE9", iconColor: "#8D6E63" },
  { id: "baby", name: "مستلزمات أطفال", image: "/assets/seed/category-baby.png", productCount: 60, order: 9, color: "#FCE4EC", iconColor: "#EC407A" },
  { id: "flowers", name: "هدايا وورود", image: "/assets/seed/category-flowers.png", productCount: 25, order: 10, color: "#FDF2F2", iconColor: "#EF5350" },
  { id: "delivery", name: "خدمات المندوب", image: "/assets/seed/category-delivery.png", productCount: 0, order: 11, color: "#FFF9C4", iconColor: "#FBC02D" },
  { id: "women-bags", name: "الحقائب النسائية", image: "/assets/seed/category-bags.png", productCount: 12, order: 12, color: "#FCE4EC", iconColor: "#E91E63" },
  { id: "international-shopping", name: "الشراء من المواقع العالمية", image: "/assets/seed/category-international.png", productCount: 0, order: 13, color: "#E8EAF6", iconColor: "#5C6BC0" },
  { id: "food-supplies", name: "المواد الغذائية", image: "/assets/seed/category-food-supplies.png", productCount: 9, order: 14, color: "#FFF8E1", iconColor: "#F9A825" },
];

let banners: Banner[] = [
  { id: "slider-1", image: "/assets/seed/banners/banner-1.png", title: "توصيل سريع لباب بيتك", isActive: true, type: "slider", order: 1, linkType: "screen", linkTarget: "CourierPickup" },
  { id: "slider-2", image: "/assets/seed/banners/banner-2.png", title: "أشهى المأكولات العراقية", isActive: true, type: "slider", order: 2, linkType: "category", linkTarget: "restaurants" },
  { id: "slider-3", image: "/assets/seed/banners/banner-3.png", title: "طلباتك اليومية بضغطة زر", isActive: true, type: "slider", order: 3, linkType: "category", linkTarget: "fruits-vegetables" },
  { id: "slider-4", image: "/assets/seed/banners/banner-4.png", title: "عروض وخصومات حصرية", isActive: true, type: "slider", order: 4, linkType: "screen", linkTarget: "AllCategories" },
  { id: "slider-5", image: "/assets/seed/banners/banner-5.png", title: "مساحة إعلانية لأصحاب المطاعم والماركت", isActive: true, type: "slider", order: 5, linkType: "screen", linkTarget: "AllCategories" },
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
  { id: "fs1", categoryId: "food-supplies", name: "رز", price: 45000, image: "/assets/seed/product-3d-rice.png", description: "رز بسمتي فاخر 5 كيلو", inStock: true, weight: "5 كيلو" },
  { id: "fs2", categoryId: "food-supplies", name: "سكر", price: 30000, image: "/assets/seed/product-3d-sugar.png", description: "سكر أبيض ناعم 5 كيلو", inStock: true, weight: "5 كيلو" },
  { id: "fs3", categoryId: "food-supplies", name: "ملح", price: 5000, image: "/assets/seed/product-3d-salt.png", description: "ملح طعام نقي 1 كيلو", inStock: true, weight: "1 كيلو" },
  { id: "fs4", categoryId: "food-supplies", name: "طحين", price: 25000, image: "/assets/seed/product-3d-flour.png", description: "طحين أبيض متعدد الاستخدامات 5 كيلو", inStock: true, weight: "5 كيلو" },
  { id: "fs5", categoryId: "food-supplies", name: "معجون طماطم", price: 8000, image: "/assets/seed/product-3d-tomato-paste.png", description: "معجون طماطم مركّز 400 جرام", inStock: true, weight: "400 جرام" },
  { id: "fs6", categoryId: "food-supplies", name: "مكرونة", price: 7000, image: "/assets/seed/product-3d-pasta.png", description: "مكرونة سباغيتي 500 جرام", inStock: true, weight: "500 جرام" },
  { id: "fs7", categoryId: "food-supplies", name: "اندومي", price: 3000, image: "/assets/seed/product-3d-indomie.png", description: "اندومي نودلز بنكهة الدجاج", inStock: true },
  { id: "fs8", categoryId: "food-supplies", name: "عدس", price: 15000, image: "/assets/seed/product-3d-lentils.png", description: "عدس أحمر مجروش 1 كيلو", inStock: true, weight: "1 كيلو" },
  { id: "fs9", categoryId: "food-supplies", name: "حمص", price: 12000, image: "/assets/seed/product-3d-chickpeas.png", description: "حمص حب جاف 1 كيلو", inStock: true, weight: "1 كيلو" },
];

// Fallback when appSettings/fees has no value — matches GET /api/settings/fees.
/** H-35: upper bound on distinct cart lines in a single order. */
const MAX_ORDER_ITEM_LINES = 100;

/** H-37: hard bound on the public ratings read (base64 images make it costly). */
const RATINGS_SCAN_CAP = 1000;

const DEFAULT_SERVICE_FEE = 500;

const ROUTES_JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required but not set. Add it to Replit Secrets before starting the server.");
  }
  return secret;
})();

// Signed driver session token. Identity for all /api/driver/* routes comes from
// this token, never from a client-supplied phone number.
function makeDriverToken(phoneNumber: string): string {
  return jwt.sign({ phoneNumber, role: "driver" }, ROUTES_JWT_SECRET, { expiresIn: "30d" });
}

function extractVendorId(req: Request): string | null {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return null;
    const decoded = jwt.verify(token, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
    if (decoded.role !== "vendor") return null;
    return decoded.vendorId as string;
  } catch {
    return null;
  }
}

function requireAdminAuth(req: Request, res: Response, next: express.NextFunction) {
  if (!isValidSession(req)) return res.status(401).json({ error: "غير مصرح" });
  next();
}

// ── Customer JWT middleware ────────────────────────────────────────────────────
function requireCustomerAuth(req: Request, res: Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
  try {
    const decoded = jwt.verify(token, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
    if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid role");
    // H-10: customer tokens live 30 days and had no revocation path at all, so a
    // deleted account — or a stolen phone — kept full access for up to a month.
    // The check is a synchronous in-memory lookup; see customerRevocation.ts.
    if (isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) throw new Error("revoked");
    (req as any).customerPhone = decoded.phoneNumber as string;
    next();
  } catch {
    return res.status(401).json({ error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً" });
  }
}

// ── Driver JWT middleware (token-based) ───────────────────────────────────────
// Identity is taken ONLY from the signed driver token, never from a client-supplied
// phone. Any phoneNumber in the body is overwritten with the authenticated one so
// downstream handlers cannot be tricked into acting for another driver (fixes the
// IDOR where every /api/driver/* route trusted body/query phoneNumber). Mounted on
// /api/driver; the public token-issuing endpoint /api/driver/mobile-auth is skipped.
// Routes a not-yet-approved driver may still call: the ones the app needs to show
// its own approval state and keep its push token fresh. Everything else requires
// an approved driver.
const DRIVER_PREAPPROVAL_ROUTES = ["/api/driver/status", "/api/driver/profile", "/api/driver/refresh-push-token"];

function isPreApprovalDriverRoute(req: Request): boolean {
  const path = (req.originalUrl || req.path || "").split("?")[0];
  return DRIVER_PREAPPROVAL_ROUTES.some((r) => path.endsWith(r));
}

async function requireDriverAuth(req: Request, res: Response, next: express.NextFunction) {
  // Exempt the public token issuer (works whether req.path is mount-relative or not).
  if ((req.originalUrl || req.path || "").split("?")[0].endsWith("/api/driver/mobile-auth")) return next();
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "يرجى تسجيل الدخول كسائق أولاً" });
  let driverPhone: string;
  try {
    const decoded = jwt.verify(token, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
    if (decoded.role !== "driver" || !decoded.phoneNumber) throw new Error("invalid role");
    driverPhone = String(decoded.phoneNumber);
  } catch {
    return res.status(401).json({ error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً" });
  }
  try {
    const driver = await getDriverByPhone(driverPhone);
    if (!driver) return res.status(403).json({ error: "غير مصرح — السائق غير موجود" });

    // Approval is enforced here, at the single choke point, and NOT per-route:
    // the driver token is minted at registration time and stays valid for 7 days,
    // so without this a `pending` — or admin-`rejected` — driver could go online,
    // receive real batches with customer PII, and collect cash. Rejecting a driver
    // in the dashboard has to actually lock them out.
    //
    // DRIVER_PREAPPROVAL_ROUTES stay open so the app can still render the
    // "قيد المراجعة" screen and notice the moment an admin approves.
    if (driver.status !== "approved" && !isPreApprovalDriverRoute(req)) {
      return res.status(403).json({
        error:
          driver.status === "rejected"
            ? "تم رفض حسابك كسائق — تواصل مع الإدارة"
            : "حسابك قيد المراجعة — لا يمكنك استلام الطلبات بعد",
        approvalStatus: driver.status || "pending",
      });
    }

    (req as any).driverPhone = driverPhone;
    (req as any).driver = driver;
    // H-72: resolved once, here, from the driver document this middleware has
    // already loaded — so every /api/driver route keys money by walletId at no
    // extra read. The token's phone is the fallback for pre-H-72 drivers, and it
    // must be the TOKEN's, not the document's: legacy ledgers were created from
    // the token phone and the two spellings differ in production.
    (req as any).driverWalletId = driverWalletIdOf(driver, driverPhone);
    // Authoritative identity — override anything the client sent in the body.
    if (req.body && typeof req.body === "object") (req.body as any).phoneNumber = driverPhone;
    next();
  } catch {
    return res.status(500).json({ error: "خطأ في قاعدة البيانات" });
  }
}

// Ownership guard: a batch action may only be performed by the driver the batch is
// assigned to. Prevents an authenticated driver from mutating/among another driver's
// batch (e.g. crediting themselves by completing someone else's delivery).
async function batchBelongsToDriver(batchId: string, driverPhone: string): Promise<boolean> {
  try {
    const batch = (await getDeliveryBatch(batchId)) as any;
    return !!batch && (batch.driverId === driverPhone || batch.driverPhone === driverPhone);
  } catch {
    return false;
  }
}

/**
 * Compress a driver identity document and put it in Storage, returning the URL.
 *
 * Accepts the Base64 data URI the app sends. A value that is already a Storage URL
 * is passed straight back, so re-submitting an existing driver is a no-op rather
 * than a re-upload.
 *
 * Documents are resized to 1400px on the long edge — enough for an admin to read a
 * national ID, far below the multi-megabyte original — and stored as webp.
 *
 * NOTE ON ACCESS (H3): identity documents are stored as PRIVATE objects (no permanent
 * download token) and only the bare object PATH is returned/persisted — never a public
 * URL. The admin API turns that path into a short-lived V4 signed URL at read time
 * (getSignedDriverDocUrl), so access to a government ID always expires and can be cut
 * off by rotating/deleting the object, instead of living behind an unrevocable token.
 */
/**
 * H-70: a document the caller sent that this server will not process.
 *
 * Distinguished from every other failure in `storeDriverDocument` so the route can
 * answer 4xx — the client sent something unusable — instead of the blanket 502 it
 * returns when Storage itself fails. `kind` names which of the three documents it
 * was, for the log line; the image and the reason string never reach the log.
 */
class DocumentImageError extends Error {
  constructor(
    readonly rejection: DocumentImageRejection,
    readonly kind: string,
  ) {
    super(`${kind}: ${rejection}`);
    this.name = "DocumentImageError";
  }
}

async function storeDriverDocument(
  value: string,
  phoneNumber: string,
  kind: "national-id" | "residence-card" | "license",
): Promise<string> {
  if (typeof value !== "string" || !value) throw new Error(`${kind}: empty document`);
  // Already stored — nothing to do. A bare "driver-documents/…" path is the new private
  // format; a firebasestorage token URL is a pre-H3 record left as-is for compatibility.
  if (value.startsWith("driver-documents/")) return value;
  if (value.startsWith("https://firebasestorage.googleapis.com/")) return value;

  const m = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) throw new Error(`${kind}: expected a base64 image data URI`);

  // H-70: refuse before anything heavy runs.
  //
  // The declared `image/…` type in the data URI is NOT used as a guard — a caller
  // writes it. What follows trusts only what sharp can actually read out of the
  // bytes. `.metadata()` parses the header alone (about a millisecond even for an
  // 8000×8000 file) and never decodes, so the check costs nothing on real uploads
  // while a decompression bomb is rejected before a single pixel is materialised.
  const raw = Buffer.from(m[2], "base64");

  // Step 1 — read the header only. Deliberately WITHOUT limitInputPixels: parsing
  // a header allocates no pixel buffer whatever the dimensions claim, so this is
  // safe on a bomb, and letting it succeed is what lets the size be reported
  // accurately instead of collapsing into a generic "unreadable".
  let meta: sharp.Metadata;
  try {
    meta = await sharp(raw).metadata();
  } catch {
    // Unsupported, truncated or deliberately malformed — never continue on a file
    // whose dimensions could not be established. The reason is not echoed: this is
    // a government identity document.
    throw new DocumentImageError("unreadable", kind);
  }

  // Step 2 — decide. This is the check that closes H-70, and it runs before any
  // pixel is decoded.
  const rejection = checkDocumentImageLimits({
    bytes: raw.length,
    width: meta.width,
    height: meta.height,
  });
  if (rejection) throw new DocumentImageError(rejection, kind);

  // Step 3 — only now the heavy work. `limitInputPixels` repeats the bound inside
  // libvips so that if the check above were ever removed or bypassed, the decode
  // still refuses rather than running to completion.
  const webp = await sharp(raw, { limitInputPixels: MAX_DOCUMENT_PIXELS })
    .rotate() // honour EXIF orientation — phone photos are routinely sideways
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  // Private upload → returns the bare object path (NOT a public token URL). H3.
  return await uploadPrivateToFirebaseStorage(
    webp,
    `driver-documents/${encodeURIComponent(phoneNumber)}/${kind}-${Date.now()}.webp`,
    "image/webp",
  );
}

// Ownership guard at the ORDER level. `batchBelongsToDriver` was only ever applied
// as `if (batchId && …)`, so omitting batchId skipped it entirely, and two driver
// routes (start-delivery, report-issue) had no ownership check at all — any
// authenticated driver could flip ANY order to in_delivery or issue.
//
// An order belongs to a driver when the order document names them (accept-order
// writes driverPhone) or when it sits in a batch assigned to them (createDeliveryBatch
// stamps batchId on every order). Both are persisted, so this survives a restart —
// unlike the in-memory driverAssignments map.
async function orderBelongsToDriver(orderId: string, driverPhone: string): Promise<boolean> {
  if (!orderId || !driverPhone) return false;
  try {
    const order = (await getOrderById(orderId)) as any;
    if (!order) return false;
    if (order.driverPhone && String(order.driverPhone) === driverPhone) return true;
    if (order.batchId) return await batchBelongsToDriver(String(order.batchId), driverPhone);
    return false;
  } catch {
    return false;
  }
}

// Express guard wrapper: rejects with 403 unless the order belongs to the caller.
// Returns true when the request may proceed (the response is already sent otherwise).
async function assertOrderOwnership(res: Response, orderId: string, driverPhone: string): Promise<boolean> {
  if (await orderBelongsToDriver(orderId, driverPhone)) return true;
  res.status(403).json({ error: "غير مصرح — هذا الطلب ليس لك" });
  return false;
}

// Notify the customer of an order status change via push (best-effort, non-blocking).
// Used by driver-driven transitions that change status through updateOrderStatus but
// previously sent no customer push (e.g. "in_delivery"). Uses a single getOrderById
// read (not a full-collection scan). Additive — does not replace existing push sends.
async function notifyCustomerStatus(orderId: string, status: string, estimatedMinutes?: number): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const phone = (order as any)?.phoneNumber;
    if (!phone) return;
    const pushToken = await getUserPushToken(phone);
    if (pushToken) await sendPushNotification(pushToken, status, orderId, estimatedMinutes);
  } catch {}
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Guard ALL /api/admin/* routes with admin session check
  // NOTE: the /api/admin CSRF guard is mounted in index.ts BEFORE the admin routes
  // in configureExpoAndLanding and vendorRouter are registered (H-79). Mounting it
  // here would run too late for those and duplicate it for these.
  app.use("/api/admin", requireAdminAuth);

  // Guard ALL /api/driver/* routes with the signed-driver-token check. The public
  // token issuer /api/driver/mobile-auth is exempted inside the middleware. Note
  // this does NOT match /api/drivers/* (registration/existence check), which is
  // the plural mount and stays public.
  app.use("/api/driver", requireDriverAuth);

  // NOTE: GET /api/stores, /api/stores/products-preview, /api/stores/:id/products
  // and /api/vendor/wallet used to be defined here as well. index.ts mounts
  // vendorRouter BEFORE registerRoutes(), so Express always matched the copies in
  // vendor.ts and these were dead code — edits made here (e.g. vendor commission /
  // netEarning) silently had no effect. They now live ONLY in server/vendor.ts.
  // Do not re-add them here.

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
        updatedAt: Timestamp.now(),
      });
      res.json({ success: true, inStock });
    } catch (err) {
      console.error("product availability:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
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
        commissionPercent: commissionPercentOf(v.commissionPercent),
        profileImageUrl: v.profileImageUrl || "",
        status: v.status || "",
      };
      const products = productsSnap.docs.map((d) => {
        const p = d.data() as any;
        const imgVal = limitImageSize(p.imageUrl || (p.imageUrls?.[0] ?? ""), 80000);
        return {
          id: d.id,
          name: p.name || "",
          description: p.description || "",
          price: p.price || 0,
          image: imgVal,
          imageUrl: imgVal,
          status: p.status || "",
          category: p.category || "",
          stock: p.stock ?? 0,
          isActive: p.isActive !== false,
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
        // Seeded vendors store the display name in `name`; registered vendors use `storeName`.
        const storeName = v.storeName || v.name || "";
        // Seeded vendors have no `id` field inside the doc — fall back to Firestore doc.id.
        const id = v.id || d.id;
        return {
          id, storeName, businessType: v.businessType,
          // H-64 / 7: the admin used to write `location`/`description` and the app
          // reads `address`/`bio`. Both directions now resolve to one value.
          address: v.address || v.location || "", bio: v.bio || v.description || "",
          totalProducts: v.totalProducts || 0,
          approvedAt: v.approvedAt || v.createdAt || "",
          profileImageUrl: limitImageSize(v.profileImageUrl || "", 80000),
          coverImageUrl: limitImageSize(v.coverImageUrl || v.image || "", 80000),
          rating: v.rating ?? null,
          ratingCount: v.ratingCount ?? 0,
          deliveryTime: v.deliveryTime || "30-45",
          deliveryPrice: v.deliveryPrice ?? 0,
          // D-6: fold the legacy admin-only openTime/closeTime into the shape the
          // app actually reads, so a store edited before this fix is not shown as
          // permanently open while the dashboard displays real hours.
          workingHours: normalizeWorkingHours(v.workingHours, { openTime: v.openTime, closeTime: v.closeTime }),
          hasDelivery: v.hasDelivery ?? true,
          minOrder: v.minOrder ?? 0,
          // #9: store-specific delivery fee override (null ⇒ use default). Lets the
          // checkout screen show the same fee the server will charge.
          deliveryFee: (typeof v.deliveryFee === "number") ? v.deliveryFee : null,
          openTime: v.openTime || "",
          closeTime: v.closeTime || "",
          description: v.description || "",
          categoryType: v.categoryType || v.cuisine || "",
          sortOrder: v.sortOrder ?? 999,
          isOpen: v.isOpen ?? true,
          supportedCategories: Array.isArray(v.supportedCategories) ? v.supportedCategories : [],
          isPinned: v.isPinned ?? false,
          isFeatured: v.isFeatured ?? false,
        };
      }).sort((a: any, b: any) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
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
    rating?: number; // cached driver rating (avg), used as a dispatch tie-breaker
  }
  const driverQueue: QueuedDriver[] = [];
  const driverAssignments: Map<string, string> = new Map(); // orderId → driverPhone
  const batchedOrderIds = new Set<string>(); // orderIds currently in active batches
  // (A `driverCompletedOrders` in-memory mirror used to live here. It was appended to
  //  AFTER `await saveDriverCompletedOrder(...)` had already persisted the same record,
  //  and getCompletedOrders() de-duplicated it against Firestore on every read — so it
  //  never held anything Firestore lacked. It only retained roughly 180k objects a year
  //  at 500 deliveries/day, pushing the process toward max_memory_restart.)
  const driverLocations: Map<string, { lat: number; lng: number; updatedAt: number; fullName?: string }> = new Map();

  // ── GPS heartbeat cost controls (H-39) ─────────────────────────────────────
  // A heartbeat needs exactly one piece of stored data: the driver's display
  // name, which rides along on the live-map broadcast. That name was re-read
  // from Firestore on EVERY heartbeat, and getDriverByPhone() walks each Iraqi
  // phone-format variant in turn — so a single heartbeat cost up to four
  // where().limit(1).get() queries. At the active-delivery rate of one heartbeat
  // every 5s, 50 drivers on shift burned up to 2,400 queries a minute fetching a
  // name that cannot change mid-shift.
  //
  // Nothing is cached negatively: an unknown phone still re-reads every time, so
  // a deleted driver is rejected on the very next heartbeat rather than lingering
  // for a TTL. The admin delete path purges this map for the same reason.
  //
  // The TTL is a minute rather than a shift, and deliberately: it still collapses
  // the per-heartbeat read to one read per driver per minute (a 12x cut at the
  // 5s active rate), while bounding how long a driver removed OUTSIDE the app —
  // straight in the Firestore console — could keep publishing. Before this cache
  // that window was one heartbeat; a minute is the price of the fix, and a
  // shift-long TTL would not have been.
  const driverNameCache = new Map<string, { fullName: string; at: number }>();
  const DRIVER_NAME_TTL = 60_000;

  /** The driver's display name, re-read from Firestore at most once per TTL. */
  const cachedDriverName = async (phoneNumber: string): Promise<string | null> => {
    const hit = driverNameCache.get(phoneNumber);
    if (hit && Date.now() - hit.at < DRIVER_NAME_TTL) return hit.fullName;
    const driver = await getDriverByPhone(phoneNumber).catch(() => null);
    if (!driver) return null; // never cached — see above
    const fullName = driver.fullName || "";
    driverNameCache.set(phoneNumber, { fullName, at: Date.now() });
    return fullName;
  };

  // Firestore persistence of the last position, throttled per driver. Shared by
  // the socket path and the HTTP fallback so a client switching transports
  // cannot write twice as often as one staying on either.
  const locationFirestoreThrottle = new Map<string, number>();
  const FIRESTORE_WRITE_INTERVAL = 10_000; // write to Firestore at most every 10s

  // Nothing bounded how fast a socket could emit "driver:location", so a driver
  // token looping tightly multiplied the work above without limit — a billing
  // drain and an event-loop stall, not merely waste. The legitimate client sends
  // one heartbeat every 5s mid-delivery and every 30s otherwise, so a one-second
  // floor leaves five times the margin a real driver needs.
  const locationRateLimit = new Map<string, number>();
  const LOCATION_MIN_INTERVAL = 1_000;

  /**
   * Do these two strings name the same Iraqi phone, whatever format each is in?
   *
   * Production stores driver numbers in more than one shape — "009647702891104"
   * alongside "07837527840" — and the in-memory maps are keyed by whichever shape
   * the writer happened to hold: the token's for anything driven by a driver
   * request, the Firestore document's for anything driven by the admin panel.
   * Comparing the strings therefore silently fails to match. Every variant
   * (0…, 7…, 964…, 00964…) ends in the same ten digits, so that is the comparison.
   */
  const phoneTail = (phone: unknown) => String(phone ?? "").replace(/\D/g, "").slice(-10);
  const samePhone = (a: unknown, b: unknown) => {
    const ta = phoneTail(a);
    return ta.length === 10 && ta === phoneTail(b);
  };

  /**
   * Forget every heartbeat-scoped entry for a driver, whatever phone format the
   * entry was keyed under. See samePhone above for why this cannot be an
   * exact-string delete.
   */
  const purgeHeartbeatState = (phone: string) => {
    if (phoneTail(phone).length !== 10) return;
    for (const map of [driverNameCache, locationRateLimit, locationFirestoreThrottle] as Map<string, unknown>[]) {
      for (const key of [...map.keys()]) {
        if (samePhone(key, phone)) map.delete(key);
      }
    }
  };

  // Rejection cooldown: track which orders each driver has recently rejected
  // Prevents immediate re-assignment of the same order to the same driver
  const driverRejectionCooldowns: Map<string, Map<string, number>> = new Map();
  const REJECTION_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes before re-offering same order

  // The cooldown timestamp was only ever READ, never used to prune, so this nested
  // Map grew by one entry per rejection for the life of the process — crossing
  // `max_memory_restart: 512M` and triggering a PM2 restart that wipes the driver
  // queue mid-shift. An entry older than the window can never match again, so it is
  // dead weight: drop it whenever we touch the driver's map.
  function pruneDriverCooldowns(phoneNumber: string): Map<string, number> | undefined {
    const cooldowns = driverRejectionCooldowns.get(phoneNumber);
    if (!cooldowns) return undefined;
    const cutoff = Date.now() - REJECTION_COOLDOWN_MS;
    for (const [orderId, rejectedAt] of cooldowns) {
      if (rejectedAt < cutoff) cooldowns.delete(orderId);
    }
    if (cooldowns.size === 0) {
      driverRejectionCooldowns.delete(phoneNumber);
      return undefined;
    }
    return cooldowns;
  }

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

  // Completed orders come from Firestore, which is the source of truth. The record is
  // written (and awaited) before this can ever be read, so there is nothing to merge.
  async function getCompletedOrders(phoneNumber: string) {
    return await getDriverCompletedOrdersFromDB(phoneNumber);
  }

  async function checkIsRestaurantOrder(order: any): Promise<boolean> {
    try {
      // D-3: the classification frozen at checkout wins. Everything below it is the
      // pre-D-3 guesswork kept only for orders placed before that field existed —
      // and `order.vendorId` in particular answered TRUE for every marketplace
      // order, which is how shopping deliveries were being priced as restaurants.
      if (order.orderKind === "restaurant") return true;
      if (order.orderKind === "shopping") return false;
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
          // Only orders referenced by active batches are checked below —
          // fetch just those instead of the entire orders collection.
          const restoreIds = batchSnap.docs.flatMap(d => ((d.data() as DeliveryBatch).orderIds || []));
          const allOrdersForRestore = await getOrdersByIds(restoreIds);
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
                .update({ status: "completed", updatedAt: Timestamp.now() })
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
          // (targeted status query — not a full-collection scan)
          const confirmedAtBoot = await getOrdersByStatus("confirmed");
          for (const qd of driverQueue) {
            if (!qd.currentBatchId) {
              const waitingOrders = confirmedAtBoot
                .filter(o => !batchedOrderIds.has(o.id))
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

  // Restore driver→order assignments after a restart. driverAssignments is in-memory
  // and is what /api/orders/:id/driver-location uses to find the driver whose live GPS
  // to return. Without this, a PM2 restart (the process is memory-capped) left every
  // in-flight order with no assignment, so the customer's live tracking map never
  // appeared even though "المندوب في الطريق إليك". Orders persist driverPhone
  // (updateOrderDriverInfo), so rebuild the map from orders still out for delivery.
  try {
    const inFlight = [
      ...(await getOrdersByStatus("preparing")),
      ...(await getOrdersByStatus("in_delivery")),
    ];
    let restored = 0;
    for (const o of inFlight) {
      const driverPhone = (o as any).driverPhone;
      if (driverPhone && !driverAssignments.has(o.id)) {
        driverAssignments.set(o.id, String(driverPhone));
        restored++;
      }
    }
    if (restored > 0) console.log(`[ASSIGN_RESTORE] Restored ${restored} driver→order assignment(s)`);
  } catch (e) {
    console.error("Failed to restore driver assignments:", e);
  }

  // (The second /uploads static mount lived here. index.ts registers its own mount
  //  earlier in the middleware chain, so this one was unreachable and the
  //  X-Content-Type-Options header it set never actually applied to a response.
  //  index.ts is now the single mount and carries that header itself.)


  // Caps the size of an image value in a LIST response. Every branch used to
  // `return img`, so the whole function was a no-op that only looked like a guard.
  function limitImageSize(img: string | undefined, maxLen = 50000): string {
    if (!img) return "";
    // Data URIs are self-contained and render without a network request; truncating
    // one corrupts the image, so they pass through by design. The real fix for
    // oversized inline images is not to create them — see processAndSaveImage
    // (Storage-first) and capOrderItemImages.
    if (img.startsWith("data:")) return img;
    // A non-data URL longer than the cap is not a usable URL. Truncating it would
    // produce a broken request; dropping it renders the client's placeholder.
    return img.length <= maxLen ? img : "";
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
      const detected = detectedUploadImageMime(req.file);
      if (!detected) {
        return res.status(400).json({ error: "نوع الملف غير مدعوم — محتوى الصورة غير صالح" });
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
      // Storage is provisioned (gs://onway-74c20.firebasestorage.app), so this is
      // the only path — no Base64 fallback. The fallback existed because the bucket
      // name was wrong and every upload threw; it turned a hard configuration fault
      // into silent Base64 blobs inside Firestore documents, which is what pushed
      // those documents toward the 1MB limit with no error anywhere. A failure here
      // is now a real failure and says so.
      const url = await uploadToFirebaseStorage(webpBuffer, `admin-images/${type}/${contentHash}.webp`);
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

      // Guard against the junk categories reported in the app: a blank name, or a
      // duplicate of one that already exists, must never create a new document.
      // Without this an accidental double-submit (or a retry) spawned a fresh random
      // -id category every time. Names are compared trimmed + case-insensitive.
      const cleanName = typeof name === "string" ? name.trim() : "";
      if (!cleanName) {
        return res.status(400).json({ error: "اسم الفئة مطلوب" });
      }

      const db = getFirestore();
      if (db) {
        if (!id) {
          const existingCats = await getFirestoreCategories();
          const dup = existingCats.find(
            (c) => (c.name || "").trim().toLowerCase() === cleanName.toLowerCase(),
          );
          if (dup) {
            return res.status(409).json({ error: "توجد فئة بنفس الاسم", category: dup });
          }
        }
        const newCategory = await createFirestoreCategory({
          id: id || undefined,
          name: cleanName,
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
      
      // Fallback to in-memory (also dedup by name)
      if (!id && categories.some((c) => (c.name || "").trim().toLowerCase() === cleanName.toLowerCase())) {
        return res.status(409).json({ error: "توجد فئة بنفس الاسم" });
      }
      const newCategory: Category = {
        id: id || randomUUID(),
        name: cleanName,
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

  // One-time cleanup for the junk categories reported in the app — the blank cards
  // with no name/image. A real category (official seed OR an owner-created one like
  // "افران صمون و مخابز" / "قرطاسية") always has a name; the junk ones were spawned by
  // accidental empty POSTs (now blocked above). So the safe, precise criterion is
  // "name is empty/whitespace" — this never deletes a named category. Owner-triggered,
  // so it never runs on its own. Products keep their categoryId regardless.
  app.post("/api/admin/categories/cleanup", async (_req: Request, res: Response) => {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "Database not configured" });
    try {
      const snapshot = await db.collection("categories").get();
      const toDelete = snapshot.docs.filter((d) => {
        const name = (d.data() as any)?.name;
        return typeof name !== "string" || name.trim() === "";
      });
      const removed = toDelete.map((d) => ({ id: d.id }));
      // Firestore batches cap at 500 ops; chunk to stay safe.
      for (let i = 0; i < toDelete.length; i += 400) {
        const batch = db.batch();
        toDelete.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      invalidateCategoriesCache();
      const keptCount = snapshot.size - toDelete.length;
      console.log(`[CATEGORIES_CLEANUP] removed ${removed.length} unnamed (junk) categories, kept ${keptCount}`);
      return res.json({ removed: removed.length, keptCount, deleted: removed });
    } catch (error) {
      console.error("Error cleaning categories:", error);
      return res.status(500).json({ error: "Failed to clean categories" });
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

  app.get("/api/banners", async (req, res) => {
    try {
      const type = req.query.type as string;
      // getCachedBanners(true) already filters by isActive + date range
      let result = await getCachedBanners(true);
      if (type) result = result.filter(b => b.type === type);

      // If a banner is linked to a store, verify the store is still approved & active.
      // We do a single stores fetch (cached) and filter in-memory.
      const storeLinkedBanners = result.filter(b => (b as any).storeId);
      if (storeLinkedBanners.length > 0) {
        const allStores = await getCachedStores();
        const activeStoreIds = new Set(allStores.filter(s => s.approved !== false).map(s => s.id));
        result = result.filter(b => {
          const storeId = (b as any).storeId;
          // Non-store banners always pass; store banners only pass if store is active
          return !storeId || activeStoreIds.has(storeId);
        });
      }

      res.set("Cache-Control", "public, max-age=60");
      res.set("Vary", "Accept-Encoding");
      res.json(result);
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
      const { title, description, type, order, isActive, image,
              storeId, storeName, storeType, linkType, linkTarget,
              startDate, endDate } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Banner image is required" });
      }
      if (!storeId && !linkType) {
        return res.status(400).json({ error: "يجب ربط البنر بمتجر أو وجهة" });
      }
      const banner = await createFirestoreBanner({
        image,
        title,
        description,
        type: type || "slider",
        order: order ? parseInt(order) : undefined,
        isActive: isActive !== false,
        storeId: storeId || "",
        storeName: storeName || "",
        storeType: storeType || "",
        linkType: linkType || "",
        linkTarget: linkTarget || "",
        startDate: startDate || "",
        endDate: endDate || "",
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
      const { title, description, type, order, isActive, image,
              storeId, storeName, storeType, linkType, linkTarget,
              startDate, endDate } = req.body;
      const updates: Record<string, any> = {};
      if (image) updates.image = image;
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (type) updates.type = type;
      if (order !== undefined) updates.order = parseInt(order);
      if (isActive !== undefined) updates.isActive = isActive;
      if (storeId !== undefined) updates.storeId = storeId;
      if (storeName !== undefined) updates.storeName = storeName;
      if (storeType !== undefined) updates.storeType = storeType;
      if (linkType !== undefined) updates.linkType = linkType;
      if (linkTarget !== undefined) updates.linkTarget = linkTarget;
      if (startDate !== undefined) updates.startDate = startDate;
      if (endDate !== undefined) updates.endDate = endDate;

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
      // Optional pagination: only applied when the caller passes `limit`, so
      // existing consumers that expect the full array are unaffected.
      const limit = parseInt(req.query.limit as string, 10);
      const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
      if (Number.isFinite(limit) && limit > 0) {
        return res.json(result.slice(offset, offset + limit));
      }
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

  // Combined product picker for promotional sections:
  // returns approved vendor products (real published products) + admin products,
  // enriched with storeName so the admin can identify where each product belongs.
  app.get("/api/admin/picker-products", async (req, res) => {
    try {
      const db = getFirestore();
      const [adminProducts, storesAll] = await Promise.all([
        getCachedProducts(),
        getCachedStores(),
      ]);

      const storeMap: Record<string, string> = {};
      storesAll.forEach((s: any) => { storeMap[s.id] = s.storeName || s.id; });

      let vendorProducts: any[] = [];
      if (db) {
        const snap = await db.collection("vendorProducts")
          .where("status", "==", "approved")
          .get();
        vendorProducts = snap.docs
          .filter(d => (d.data() as any).isActive !== false) // skip admin-disabled products
          .map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            name: data.name || "",
            price: Number(data.price) || 0,
            originalPrice: data.originalPrice ? Number(data.originalPrice) : undefined,
            discount: data.discount ? Number(data.discount) : undefined,
            image: limitImageSize(data.imageUrl || data.image || "", 80000),
            categoryId: data.categoryId || "",
            vendorId: data.vendorId || "",
            storeName: storeMap[data.vendorId] || data.vendorName || "",
            inStock: data.inStock !== false,
            description: data.description || "",
            source: "vendor",
          };
        });
      }

      // Vendor products first (real/published), then admin-created
      const combined = [...vendorProducts, ...adminProducts.map((p: any) => ({ ...p, source: "admin", storeName: p.storeName || "" }))];
      res.json(combined);
    } catch (error) {
      console.error("Error fetching picker products:", error);
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

  app.get("/api/delivery-areas", async (req, res) => {
    try {
      const areas = await getFirestoreDeliveryAreas(true);
      res.set("Cache-Control", "no-store");
      res.json(areas);
    } catch (error) {
      console.error("Error getting delivery areas:", error);
      res.set("Cache-Control", "no-store");
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
  // Single source of truth for the service fee, shared by GET /api/settings/fees
  // and order pricing so the two can never disagree.
  // H-33: "never configured" and "could not be read" are different facts, and only
  // the first one has a default.
  //
  // This value flows straight into verifiedTotal, which becomes the stored order
  // total and from there into the settlement ledger, the vendor payable and the
  // commission. Falling back to DEFAULT_SERVICE_FEE on a READ FAILURE meant a
  // Firestore blip silently priced an order at 500 instead of whatever the admin
  // had configured — a wrong number that then looks exactly like a right one for
  // the rest of its life.
  //
  // The fallback costs nothing to give up: every other step of order creation
  // needs Firestore too (the product reads, the order write), so a failure here
  // was never the difference between an order being placed and not. An absent
  // document or an unusable value still means "not configured", and still
  // defaults — that is a real answer, not a masked failure.
  async function getConfiguredServiceFee(): Promise<number> {
    const db = getFirestore();
    if (!db) throw new Error("service fee unavailable: no database");
    const snap = await db.collection("appSettings").doc("fees").get();
    const value = Number((snap.exists ? snap.data() : {})?.serviceFee);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULT_SERVICE_FEE;
  }

  app.get("/api/settings/fees", async (req, res) => {
    try {
      const db = getFirestore();
      if (!db) return res.json({ serviceFee: DEFAULT_SERVICE_FEE });
      const snap = await db.collection("appSettings").doc("fees").get();
      const data = snap.exists ? snap.data() : {};
      res.json({ serviceFee: data?.serviceFee ?? DEFAULT_SERVICE_FEE });
    } catch (error) {
      console.error("Error getting app fees:", error);
      res.json({ serviceFee: DEFAULT_SERVICE_FEE });
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

  // ── System Settings (online payment, driver payout rule, auto-suspend) ────────

  /**
   * In-process cache for system_settings/global to avoid hitting Firestore on
   * every order completion.  Invalidated every 60 seconds.
   */
  let _sysSettingsCache: Record<string, any> | null = null;
  let _sysSettingsCacheAt = 0;
  const SYS_CACHE_TTL = 60 * 1000; // 1 minute

  async function getSystemSettings(): Promise<{
    onlinePaymentEnabled: boolean;
    driverPayoutRule: { type: string; flatRestaurant: number; flatDefault: number; percent: number };
    autoSuspendThreshold: number;
    deliveryPricing: DeliveryPricing;
    maxBatchSize: number;
  }> {
    const defaults = {
      onlinePaymentEnabled: false,
      driverPayoutRule: { type: "flat", flatRestaurant: 750, flatDefault: 2000, percent: 15 },
      autoSuspendThreshold: 100000,
      deliveryPricing: DEFAULT_DELIVERY_PRICING,
      // Max orders a driver can carry in one batch (dispatch A3). Admin-configurable
      // 1–4; clamped on read so a bad stored value can never break dispatch.
      maxBatchSize: 3,
    };
    if (_sysSettingsCache && Date.now() - _sysSettingsCacheAt < SYS_CACHE_TTL) {
      return _sysSettingsCache as any;
    }
    const db = getFirestore();
    if (!db) return defaults;
    try {
      const snap = await db.collection("system_settings").doc("global").get();
      const d = snap.exists ? (snap.data() as any) : {};
      // D-3: `deliveryPricing` holds ONLY the split percentages. The delivery fee
      // itself is never a system setting — it comes from the delivery area, or from
      // a store's explicit override. A pre-D-3 `restaurantDeliveryFee` is therefore
      // deliberately not read: it was a per-kind flat fee behind a condition that
      // could never be true, and honouring it now would reintroduce exactly the
      // kind-dependent pricing this removes.
      const result = {
        onlinePaymentEnabled: d.onlinePaymentEnabled ?? defaults.onlinePaymentEnabled,
        driverPayoutRule: d.driverPayoutRule ?? defaults.driverPayoutRule,
        autoSuspendThreshold: d.autoSuspendThreshold ?? defaults.autoSuspendThreshold,
        deliveryPricing: normalizeDeliveryPricing(d.deliveryPricing),
        // Clamp to 1–4 so a corrupt value can never make dispatch build huge/empty batches.
        maxBatchSize: Math.min(4, Math.max(1, Number(d.maxBatchSize) || defaults.maxBatchSize)),
      };
      _sysSettingsCache = result;
      _sysSettingsCacheAt = Date.now();
      return result;
    } catch {
      return defaults;
    }
  }

  function invalidateSysSettingsCache() {
    _sysSettingsCache = null;
    _sysSettingsCacheAt = 0;
  }

  /**
   * Split one order's delivery fee between the driver and the platform (D-3).
   *
   * `storedAppSharePercent` is the percentage FROZEN onto the order when it was
   * created, exactly as `vendorCommissionAmount` freezes the store's commission.
   * Passing it means a settlement that runs days later pays what the order was
   * sold at, not what the settings happen to say now — and it is what keeps this
   * change away from historical orders entirely.
   *
   * Orders created before D-3 carry no frozen percentage. They fall through to the
   * table for their kind rather than to the old flat rule: the flat rule is what
   * produced `driverEarning > deliveryFee` (a 200-dinar fee paying 1000), and
   * reproducing that on a replayed settlement would re-create the loss. The old
   * `driverPayoutRule` is still read and still editable, but it can no longer
   * decide money — see the note on the settings route.
   */
  async function computeDriverPayout(
    isRestaurant: boolean,
    deliveryFee: number,
    storedAppSharePercent?: unknown,
  ): Promise<{ driverEarning: number; deductionAmount: number }> {
    const settings = await getSystemSettings();
    const kind: OrderKind = isRestaurant ? "restaurant" : "shopping";
    const percent =
      storedAppSharePercent == null
        ? settings.deliveryPricing[kind].appSharePercent
        : storedAppSharePercent;
    const { appShare, driverEarning } = splitDeliveryFee(deliveryFee, percent);
    // `deductionAmount` is the platform's share. The name is what the settlement
    // ledger and every caller already use, so it stays.
    return { driverEarning, deductionAmount: appShare };
  }

  /**
   * Credit the driver + vendor settlement accruals for ONE delivered order.
   *
   * This is the single source of truth for "what happens to the money when an
   * order becomes delivered" (#14), shared by BOTH the driver batch-complete flow
   * and the admin "mark delivered" transition so the two can never diverge.
   *
   * Idempotent: every accrual is keyed by `${orderId}__${accountType}`, so calling
   * this twice for the same order is a safe no-op. It deliberately does NOT own the
   * order's one-time `earningsCredited` flag — the caller claims that (the driver
   * flow also gates its non-idempotent bookkeeping on the same flag).
   *
   * On any failed accrual it parks the exact retry inputs on the order document
   * (settlementPending) so the recovery sweep can replay them. Never throws for a
   * settlement problem — the money block must never break order completion.
   */
  async function accrueDeliveredOrderSettlements(
    db: FirebaseFirestore.Firestore,
    orderId: string,
    order: any,
    driverPhone: string | null,
  ): Promise<{ driverEarning: number; deductionAmount: number; isRestaurantOrder: boolean; driverOutstanding: number }> {
    const isRestaurantOrder = await checkIsRestaurantOrder(order);
    const { driverEarning, deductionAmount } = await computeDriverPayout(isRestaurantOrder, order.deliveryFee || 0, (order as any).appSharePercent);
    if (driverPhone) {
      // H-33: the result was discarded. The settlement accrual below still ran, so
      // the ledger recorded the money while the ORDER document kept no earnings —
      // the two sources of truth silently disagreed and per-order reconciliation
      // failed. Throwing keeps the accrual and the order record together; both
      // callers already recover by releasing their claim for a clean retry.
      const wrote = await updateOrderDriverInfo(orderId, { driverEarning, ownerEarning: deductionAmount });
      if (!wrote) {
        throw new Error(`order ${orderId} earnings could not be written to the order`);
      }
    }

    let driverOutstanding = 0;
    try {
      // Build every accrual up front so the exact same inputs can be replayed by
      // the recovery sweep if a write fails.
      const settlementInputs: OrderSettlementInput[] = [];
      const promoDiscount = Math.max(0, Math.round(Number((order as any).promoDiscount) || 0));
      const customerChargedAmount = Math.max(0, Math.round(Number((order as any).total) || 0));

      // Driver — cash-collection settlement (only when a driver delivered it).
      if (driverPhone) {
        // H-72: the accrual has to land on the SAME account the driver's own
        // wallet reads, so it resolves through the driver document exactly as
        // requireDriverAuth does. For a driver registered before walletId
        // existed this returns `driverPhone` unchanged, which is the id their
        // existing ledger already uses — legacy accruals are untouched.
        const driverAccountId = await resolveDriverAccountId(driverPhone, getDriverByPhone);
        const cashCollected = order.total || 0;
        settlementInputs.push({
          accountType: "driver",
          accountId: driverAccountId,
          accountName: (order as any).driverName || driverPhone,
          orderId,
          storeId: order.vendorId ?? null,
          storeName: (order as any).vendorName ?? (order as any).storeName ?? null,
          grossAmount: cashCollected,
          commission: driverEarning,
          outstandingAmount: Math.max(0, cashCollected - driverEarning),
          promoDiscount,
          customerChargedAmount,
        });
      }

      // Vendor — revenue settlement: company owes vendor orderValue − platformCommission.
      // Never fall back to order.total — it includes deliveryFee and serviceFee, which
      // OnWay keeps. vendorCommissionBase strips them for marketplace orders (which
      // never set restaurantSubtotal) and matches the admin statement's formula.
      if (order.vendorId) {
        const vendorSnap = await db.collection("vendors").doc(order.vendorId).get();
        const v = vendorSnap.exists ? (vendorSnap.data() as any) : {};
        const discountedOrderValue = vendorCommissionBase(order as any);
        const promoAmounts = promoSettlementAmounts(order as any);
        const promoFundingAmount = promoAmounts.promoFundingAmount;
        const orderValue = discountedOrderValue + promoFundingAmount;
        const grossBeforeDiscount = orderValue;
        const settlementPromoDiscount = promoAmounts.promoDiscount;
        // Marketplace vendor settlement is owed on the pre-promo goods value. The
        // customer pays the discounted total, so the platform explicitly carries the
        // promo funding instead of silently reducing the vendor's sale or commission.
        const platformCommission =
          (order as any).vendorCommissionAmount ??
          Math.round((orderValue * commissionPercentOf(v.commissionPercent)) / 100);
        settlementInputs.push({
          accountType: "vendor",
          accountId: order.vendorId,
          accountName: v.storeName || v.name || order.vendorId,
          orderId,
          storeId: order.vendorId,
          storeName: v.storeName || v.name || null,
          grossAmount: grossBeforeDiscount,
          commission: platformCommission,
          outstandingAmount: Math.max(0, grossBeforeDiscount - platformCommission),
          promoDiscount: settlementPromoDiscount,
          grossBeforeDiscount,
          customerChargedAmount,
          promoFundingAmount,
        });
      }

      // Record each accrual and INSPECT the outcome — a failed write must not look
      // identical to a successful one (that silently loses money).
      const failed: OrderSettlementInput[] = [];
      for (const input of settlementInputs) {
        const outcome = await recordOrderSettlement(input);
        if (outcome === "failed") failed.push(input);
        else {
          console.log(
            `[SETTLEMENT] ${outcome} order=${orderId} type=${input.accountType} account=${input.accountId}`,
          );
        }
      }

      if (failed.length > 0) {
        await db
          .collection("orders")
          .doc(orderId)
          .update({
            settlementPending: true,
            settlementFailedTypes: failed.map((f) => f.accountType),
            settlementRetryInputs: failed,
            settlementLastError: new Date().toISOString(),
            updatedAt: Timestamp.now(),
          })
          .catch((markErr: any) =>
            console.error(
              `[SETTLEMENT] CRITICAL order=${orderId} settlement failed AND the retry marker ` +
                `could not be saved — manual reconciliation required. ` +
                `inputs=${JSON.stringify(failed)} markerError=${markErr?.message}`,
            ),
          );
        console.error(
          `[SETTLEMENT] order=${orderId} marked for recovery; failed types=` +
            failed.map((f) => f.accountType).join(","),
        );
      }

      if (driverPhone) {
        // H-72: read back the account the accrual was just written to, taken from
        // the accrual itself rather than resolved a second time, so the balance
        // returned here can never address a different ledger than the one credited.
        const driverInput = settlementInputs.find((i) => i.accountType === "driver");
        if (driverInput) {
          const ledger = await getSettlementLedger("driver", driverInput.accountId).catch(() => null);
          driverOutstanding = ledger?.outstandingTotal ?? 0;
        }
      }

      // ── Financial ledger (append-only, auditable) — best-effort, never blocks ──
      // Mirror each settlement accrual as typed movements so the bank-style
      // statement reconciles with settlementLedger.outstandingTotal. Idempotent by
      // deterministic entryId, so replays produce the same entries (no double count).
      try {
        const ledgerEntries: LedgerInput[] = [];
        let platformCommissionTotal = 0;
        for (const inp of settlementInputs) {
          if (inp.accountType === "driver") {
            // Driver took the customer's cash (owes it) then keeps their trip fee.
            ledgerEntries.push(
              { accountType: "driver", accountId: inp.accountId, accountName: inp.accountName,
                type: "cash_collected", credit: inp.grossAmount, orderId,
                entryId: orderEntryId(orderId, "driver", "cash_collected"), description: "استلام نقد الطلب" },
              { accountType: "driver", accountId: inp.accountId, accountName: inp.accountName,
                type: "delivery_fee", debit: inp.commission, orderId,
                entryId: orderEntryId(orderId, "driver", "delivery_fee"), description: "أجرة التوصيل" },
            );
          } else if (inp.accountType === "vendor") {
            platformCommissionTotal += inp.commission;
            // Company owes vendor the sale value minus the platform commission.
            ledgerEntries.push(
              { accountType: "vendor", accountId: inp.accountId, accountName: inp.accountName,
                type: "order_sale", credit: inp.grossAmount, orderId,
                entryId: orderEntryId(orderId, "vendor", "order_sale"), description: "بيع طلب" },
              { accountType: "vendor", accountId: inp.accountId, accountName: inp.accountName,
                type: "platform_commission", debit: inp.commission, orderId,
                entryId: orderEntryId(orderId, "vendor", "platform_commission"), description: "عمولة التطبيق" },
            );
            if ((inp.promoFundingAmount || 0) > 0) {
              ledgerEntries.push({
                accountType: "platform", accountId: "onway", accountName: "OnWay",
                type: "adjustment", debit: inp.promoFundingAmount, orderId,
                entryId: orderEntryId(orderId, "platform", "adjustment"),
                description: "تمويل خصم ترويجي للمتجر",
                metadata: {
                  promoDiscount: inp.promoDiscount || 0,
                  grossBeforeDiscount: inp.grossBeforeDiscount || inp.grossAmount,
                  customerChargedAmount: inp.customerChargedAmount || 0,
                },
              });
            }
          }
        }
        // Platform revenue for this order: vendor commission + owner's delivery cut +
        // the service fee (نسبة الخدمة), which OnWay always keeps. Without the service
        // fee the app showed zero profit whenever the store commission was set to 0,
        // even though a service fee had been collected from the customer.
        const serviceFeeAmount = Math.max(0, Number((order as any).serviceFee) || 0);
        const platformRevenue = platformCommissionTotal + (driverPhone ? deductionAmount : 0) + serviceFeeAmount;
        if (platformRevenue > 0) {
          ledgerEntries.push({
            accountType: "platform", accountId: "onway", accountName: "OnWay",
            type: "platform_commission", credit: platformRevenue, orderId,
            entryId: orderEntryId(orderId, "platform", "platform_commission"),
            description: "إيراد التطبيق (عمولة + حصة توصيل + نسبة الخدمة)",
          });
        }
        if (ledgerEntries.length > 0) await recordLedgerEntries(ledgerEntries);
      } catch (ledgerErr) {
        console.error("[LEDGER] order accrual recording error (non-blocking):", ledgerErr);
      }
    } catch (settlementErr) {
      console.error("[SETTLEMENT] accrual error (non-blocking):", settlementErr);
    }

    return { driverEarning, deductionAmount, isRestaurantOrder, driverOutstanding };
  }

  // GET /api/settings/public — unauthenticated; returns safe subset for the mobile app
  app.get("/api/settings/public", async (_req: Request, res: Response) => {
    try {
      const settings = await getSystemSettings();
      res.json({
        onlinePaymentEnabled: settings.onlinePaymentEnabled,
        driverPayoutRule: settings.driverPayoutRule,
        autoSuspendThreshold: settings.autoSuspendThreshold,
        // D-3: the checkout screen used to hold its own hardcoded 1000 for the
        // restaurant fee, so a change here moved what the customer was CHARGED
        // without moving what they were SHOWN. Both now come from this response.
        // D-3: the split percentages only. The delivery FEE is not here and is no
        // longer a system setting — the app reads it from /api/delivery-areas, the
        // same collection the server prices from.
        deliveryPricing: settings.deliveryPricing,
        maxBatchSize: settings.maxBatchSize,
      });
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // PUT /api/admin/settings — admin-only; updates system_settings/global
  app.put("/api/admin/settings", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const { onlinePaymentEnabled, driverPayoutRule, autoSuspendThreshold, restaurantDeliveryFee, maxBatchSize, deliveryPricing } = req.body;
      const update: Record<string, any> = {};
      if (typeof onlinePaymentEnabled === "boolean") update.onlinePaymentEnabled = onlinePaymentEnabled;
      if (maxBatchSize !== undefined) {
        const n = Math.min(4, Math.max(1, Math.round(Number(maxBatchSize) || 0)));
        if (n >= 1) update.maxBatchSize = n;
      }
      if (driverPayoutRule && typeof driverPayoutRule === "object") {
        const r = driverPayoutRule as any;
        if (r.type === "flat" || r.type === "percent") {
          // D-3: `Number(x) || fallback` stored 750 when the admin typed 0 — the
          // same class of bug as H-06's `|| 10` on the store commission. A rate of
          // zero is a legitimate commercial choice and must survive being saved.
          // This rule no longer decides any payout (see computeDriverPayout); it is
          // kept editable so an existing configuration is not silently discarded.
          const num = (value: unknown, fallback: number) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : fallback;
          };
          update.driverPayoutRule = {
            type: r.type,
            flatRestaurant: Math.max(0, num(r.flatRestaurant, 750)),
            flatDefault: Math.max(0, num(r.flatDefault, 2000)),
            percent: Math.min(100, Math.max(0, num(r.percent, 15))),
          };
        }
      }
      // D-3: the platform's cut of the delivery fee, per order kind. No fee lives
      // here — fees are per delivery AREA. Validated strictly (rejected, not
      // clamped) so a bad admin payload is reported instead of silently rewritten;
      // the READ path clamps instead, because there a bad stored value must degrade
      // rather than break every order.
      if (deliveryPricing !== undefined) {
        const dp = deliveryPricing as any;
        if (!dp || typeof dp !== "object") {
          return res.status(400).json({ error: "صيغة تقسيم أجرة التوصيل غير صحيحة" });
        }
        const cleaned: Record<string, { appSharePercent: number }> = {};
        for (const kind of ["restaurant", "shopping"] as const) {
          const k = dp[kind];
          if (!k || typeof k !== "object") {
            return res.status(400).json({ error: "صيغة تقسيم أجرة التوصيل غير صحيحة" });
          }
          const share = Number(k.appSharePercent);
          if (!Number.isFinite(share) || share < 0 || share > 100) {
            return res.status(400).json({ error: "حصة التطبيق يجب أن تكون بين 0 و100" });
          }
          cleaned[kind] = { appSharePercent: Math.round(share) };
        }
        update.deliveryPricing = cleaned;
      }
      if (typeof autoSuspendThreshold === "number" && autoSuspendThreshold >= 0) {
        update.autoSuspendThreshold = Math.round(autoSuspendThreshold);
      }
      // `restaurantDeliveryFee` is deliberately NOT accepted any more. It was a
      // per-kind flat fee, and D-3 removed per-kind fees entirely; continuing to
      // store it would leave a value in the database that nothing reads and that a
      // future reader could mistake for the real fee. Delivery fees are edited
      // through /api/admin/delivery-areas.
      void restaurantDeliveryFee;
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      await db.collection("system_settings").doc("global").set(update, { merge: true });
      invalidateSysSettingsCache();
      res.json({ success: true, ...update });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // GET /api/admin/wallet-transactions — alias for settlements collection (read-only)
  app.get("/api/admin/wallet-transactions", async (req: Request, res: Response) => {
    const accountType = (req.query.accountType as "driver" | "vendor") || "driver";
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    try {
      const db = getFirestore();
      if (!db) return res.json({ transactions: [] });
      const snap = await db.collection("settlements")
        .where("accountType", "==", accountType)
        .limit(limit)
        .get();
      const transactions = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      }).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      res.json({ transactions });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
    // Normalize image field: admin-created vendors use `image`; registered vendors use `profileImageUrl`
    const normalized = vendors.map((v: any) => ({
      ...v,
      image: limitImageSize(v.image || v.profileImageUrl || v.coverImageUrl || "", 80000),
    }));
    res.json(normalized);
  });

  app.post("/api/admin/vendors", async (req: Request, res: Response) => {
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine, hasDelivery, minOrder, deliveryFee, openTime, closeTime, description, latitude, longitude } = req.body;
    if (!name) return res.status(400).json({ error: "اسم المطعم مطلوب" });
    // H-06: reject an unusable rate instead of quietly billing 10%.
    if (commissionPercent !== undefined && commissionPercent !== null && commissionPercent !== ""
        && !isValidCommissionPercent(commissionPercent)) {
      return res.status(400).json({ error: "نسبة العمولة غير صالحة — يجب أن تكون رقماً بين 0 و100" });
    }
    // H-67: this was the file's second private copy of the same coordinate check.
    // Both now call the shared one; the semantics are unchanged (unusable ⇒ null).
    const existingVendors = await getVendorList();
    const maxOrder = existingVendors.reduce((max, v) => Math.max(max, v.sortOrder ?? 0), 0);
    const data = {
      name: String(name),
      location: String(location || ""),
      whatsappNumber: String(whatsappNumber || ""),
      // H-06: `Number(x) || 10` turned a contracted 0% into 10%. An omitted rate
      // still defaults to the platform rate; a supplied one must be valid (checked above).
      commissionPercent: commissionPercent === undefined || commissionPercent === null || commissionPercent === ""
        ? DEFAULT_COMMISSION_PERCENT
        : Number(commissionPercent),
      image: String(image || "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400"),
      rating: (rating !== undefined && rating !== "" && rating !== null) ? Number(rating) : null,
      ratingCount: 0,
      deliveryTime: String(deliveryTime || "30-45"),
      isOpen: Boolean(isOpen !== false),
      // Admin-created stores are live immediately. GET /api/stores (the customer
      // list) filters status == "active", so without this an admin-created store
      // would never appear to customers (#7).
      status: "active",
      createdAt: new Date().toISOString(),
      categoryType: (categoryType as any) || "restaurant",
      cuisine: cuisine ? String(cuisine) : "",
      hasDelivery: hasDelivery !== undefined ? Boolean(hasDelivery) : true,
      minOrder: minOrder !== undefined ? Number(minOrder) : 0,
      // #9: store-specific delivery fee. Empty/blank ⇒ null ("use default").
      deliveryFee: (deliveryFee === undefined || deliveryFee === null || deliveryFee === "")
        ? null
        : Math.max(0, Math.round(Number(deliveryFee) || 0)),
      openTime: openTime ? String(openTime) : "",
      closeTime: closeTime ? String(closeTime) : "",
      // D-6: the customer app reads `workingHours`, never the loose pair above.
      workingHours: normalizeWorkingHours(null, { openTime, closeTime }),
      description: description ? String(description) : "",
      sortOrder: maxOrder + 1,
      latitude: parseLatitude(latitude),
      longitude: parseLongitude(longitude),
    };
    try {
      const id = await createFirestoreVendor(data);
      invalidateVendorsCache();
      res.json({ id, ...data });
    } catch (e) {
      res.status(500).json({ error: "فشل إنشاء المطعم" });
    }
  });

  app.put("/api/admin/vendors/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = req.body as Record<string, any>;
    const vendorUpdates: Record<string, any> = {};
    if (body.name !== undefined) vendorUpdates.name = String(body.name);
    // H-64 / 7: the admin's "الموقع" and the vendor's `address` are the same fact,
    // and the customer app reads `address` (StoresListScreen / HomeScreen). Writing
    // only `location` meant an admin edit never reached a customer. Both are written
    // so nothing that still reads the legacy name breaks; `address` is the one the
    // app uses, so the two can no longer disagree.
    if (body.location !== undefined) {
      vendorUpdates.location = String(body.location);
      vendorUpdates.address = String(body.location);
    }
    if (body.whatsappNumber !== undefined) vendorUpdates.whatsappNumber = String(body.whatsappNumber);
    // H-06: an unvalidated Number() here stored NaN / negatives / >100 straight
    // into the rate every later settlement is computed from.
    if (body.commissionPercent !== undefined) {
      if (!isValidCommissionPercent(body.commissionPercent)) {
        return res.status(400).json({ error: "نسبة العمولة غير صالحة — يجب أن تكون رقماً بين 0 و100" });
      }
      vendorUpdates.commissionPercent = Number(body.commissionPercent);
    }
    if (body.image !== undefined) vendorUpdates.image = String(body.image);
    if (body.rating !== undefined) vendorUpdates.rating = Number(body.rating);
    if (body.deliveryTime !== undefined) vendorUpdates.deliveryTime = String(body.deliveryTime);
    if (body.isOpen !== undefined) vendorUpdates.isOpen = Boolean(body.isOpen);
    if (body.categoryType !== undefined) vendorUpdates.categoryType = body.categoryType;
    if (body.cuisine !== undefined) vendorUpdates.cuisine = String(body.cuisine);
    if (body.hasDelivery !== undefined) vendorUpdates.hasDelivery = Boolean(body.hasDelivery);
    if (body.minOrder !== undefined) vendorUpdates.minOrder = Number(body.minOrder);
    // #9: store-specific delivery fee. Blank/null clears the override (back to default).
    if (body.deliveryFee !== undefined) {
      vendorUpdates.deliveryFee = (body.deliveryFee === null || body.deliveryFee === "")
        ? null
        : Math.max(0, Math.round(Number(body.deliveryFee) || 0));
    }
    // D-6: opening hours must land where the CUSTOMER app reads them.
    //
    // These two strings were stored on their own and nothing ever read them — the
    // app decides "مفتوح"/"مغلق" from `workingHours` only. An admin changing a
    // store's hours therefore changed nothing a customer could see. They are still
    // written (the dashboard and some reports show them) but the same edit now
    // rebuilds `workingHours`, preserving whatever open DAYS the store owner chose.
    if (body.openTime !== undefined) vendorUpdates.openTime = String(body.openTime);
    if (body.closeTime !== undefined) vendorUpdates.closeTime = String(body.closeTime);
    if (body.openTime !== undefined || body.closeTime !== undefined) {
      const db = getFirestore();
      const snap = db ? await db.collection("vendors").doc(id).get() : null;
      const existing = (snap?.exists ? snap.data() : {}) as any;
      const merged = normalizeWorkingHours(
        {
          ...(existing?.workingHours ?? {}),
          ...(body.openTime !== undefined ? { openTime: body.openTime } : {}),
          ...(body.closeTime !== undefined ? { closeTime: body.closeTime } : {}),
        },
        { openTime: existing?.openTime, closeTime: existing?.closeTime },
      );
      // null means the pair no longer forms a usable window — clearing the hours is
      // a legitimate edit ("open whenever"), so it is stored as such rather than
      // leaving a half-updated object behind.
      vendorUpdates.workingHours = merged;
    }
    // Store availability, previously vendor-only (PATCH /api/vendor/availability).
    // The server already refuses orders on either flag (POST /api/orders), so a
    // store could stop taking orders with the admin seeing "مفتوح" and having no
    // way to clear it. Same fields, same meaning — no new behaviour.
    if (body.isVacation !== undefined) vendorUpdates.isVacation = Boolean(body.isVacation);
    if (body.isBusy !== undefined) vendorUpdates.isBusy = Boolean(body.isBusy);
    // Same pairing for the store blurb: the admin wrote `description`, the vendor
    // writes `bio`, and the app shows `bio` (StoreProductsScreen).
    if (body.description !== undefined) {
      vendorUpdates.description = String(body.description);
      vendorUpdates.bio = String(body.description);
    }
    if (Array.isArray(body.supportedCategories)) vendorUpdates.supportedCategories = body.supportedCategories;
    if (body.sortOrder !== undefined) vendorUpdates.sortOrder = Number(body.sortOrder);
    if (body.isPinned !== undefined) vendorUpdates.isPinned = Boolean(body.isPinned);
    if (body.isFeatured !== undefined) vendorUpdates.isFeatured = Boolean(body.isFeatured);
    if (body.isVerified !== undefined) vendorUpdates.isVerified = Boolean(body.isVerified);
    // Store geo-location set on the map. A blank value clears it (null).
    // H-67: this route's local `clampCoord` was the only coordinate validation in
    // the file, and the customer-facing order route had none. The logic moved to
    // orderValidation.ts unchanged — same bounds, same null-for-unusable result —
    // so both routes now share one definition instead of one having a copy.
    if (body.latitude !== undefined) vendorUpdates.latitude = parseLatitude(body.latitude);
    if (body.longitude !== undefined) vendorUpdates.longitude = parseLongitude(body.longitude);
    try {
      await updateFirestoreVendor(id, vendorUpdates);
      invalidateVendorsCache();
      invalidateStoresCache();
      res.json({ success: true, id, ...vendorUpdates });
    } catch {
      res.status(500).json({ error: "فشل تحديث المطعم" });
    }
  });

  app.delete("/api/admin/vendors/:id", async (req: Request, res: Response) => {
    const id = req.params.id as string;
    try {
      // H-72: same rule as the driver delete — the store's financial history is
      // preserved and stamped with a deleted owner, never orphaned and never
      // erased. A vendor's account id is the Firestore document id, which is
      // never reissued, so a new store cannot inherit this ledger; the problem
      // on this side is purely that the balance stopped being attributable.
      const vendorSnap = await getFirestore()?.collection("vendors").doc(id).get();
      const vendorData = vendorSnap?.exists ? (vendorSnap.data() as any) : null;
      if (vendorData) {
        await markLedgerOwnerDeleted("vendor", id, {
          name: vendorData.storeName ?? vendorData.name ?? null,
          phoneNumber: vendorData.phoneNumber ?? null,
          ownerDocId: id,
        }).catch(() => false);
      }

      await deleteFirestoreVendor(id);
      invalidateVendorsCache();
      invalidateStoresCache();
      invalidateProductsCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "فشل حذف المطعم" });
    }
  });

  app.get("/api/admin/vendors/:id/statement", async (req: Request, res: Response) => {
    const { id } = req.params;
    const db = getFirestore();
    const vendors = await getVendorList();
    const liveVendor = vendors.find(v => v.id === id);

    // H-33: an unavailable database used to answer 200 with zeroed money, which the
    // admin reads as "this store sold nothing". "No sales" and "the statement could
    // not be loaded" are different facts and must not share a response.
    if (!db) {
      console.error("[statement] vendor statement unavailable: no database");
      return res.status(503).json({ error: "قاعدة البيانات غير متاحة، تعذّر تحميل كشف الحساب" });
    }
    try {
      // H-72: a deleted store used to answer 404 here while its settlements, its
      // ledger and its delivered orders all remained in Firestore — the money was
      // still owed and no longer inspectable. If the store is gone but its ledger
      // is not, the statement is served from the archived owner instead, flagged
      // `deleted` so the panel can label it. A store that never had a ledger has
      // no financial history to show and still answers 404.
      //
      // This sits inside the try on purpose. The read must not swallow its own
      // errors: answering "store not found" because Firestore was briefly
      // unreachable would be the H-33 lie in a new place, so a failure falls
      // through to the catch below and answers 500 like every other read here.
      let vendor = liveVendor as any;
      if (!vendor) {
        const archived = await getSettlementLedger("vendor", String(id));
        if (!archived) return res.status(404).json({ error: "المطعم غير موجود" });
        vendor = {
          id,
          deleted: true,
          deletedAt: archived.ownerDeletedAt ?? null,
          storeName: archived.ownerSnapshot?.name ?? archived.accountName ?? id,
          name: archived.ownerSnapshot?.name ?? archived.accountName ?? id,
          // Never set on the archived record. commissionPercentOf falls back to the
          // project default, exactly as it does for a live store that has no rate.
          commissionPercent: undefined,
        };
      }
      const ordersSnap = await db.collection("orders").where("vendorId", "==", id).get();
      // Financial totals must count ONLY delivered orders — the same rule the
      // settlement ledger uses. Previously this summed EVERY order (pending,
      // cancelled, …), so the admin showed a vendor "net" (e.g. 19,400) before any
      // order was delivered, while the vendor's own earnings page (ledger-based)
      // showed nothing — an inconsistency. Undelivered/cancelled orders never enter
      // earnings, commission, or settlements.
      const orders = ordersSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((o: any) => o.status === "delivered") as any[];
      // Commission base: restaurant orders use restaurantSubtotal; marketplace
      // orders (vendorProducts) use total minus fees so delivery/service fees
      // are excluded from the vendor commission base.
      const orderBase = (o: any): number =>
        o.restaurantSubtotal != null
          ? o.restaurantSubtotal
          : Math.max(0, (o.total || 0) - (o.deliveryFee || 0) - (o.serviceFee || 0));
      const totalSales = orders.reduce((s, o) => s + orderBase(o), 0);
      // Use stored commission amount if available, otherwise calculate from vendor %
      const appCommission = orders.reduce((s, o) => {
        if (o.vendorCommissionAmount != null) return s + o.vendorCommissionAmount;
        return s + Math.round(orderBase(o) * commissionPercentOf(vendor.commissionPercent) / 100);
      }, 0);
      const vendorNet = totalSales - appCommission;
      const vendorWithImage = { ...vendor, image: limitImageSize((vendor as any).image || (vendor as any).profileImageUrl || (vendor as any).coverImageUrl || "", 80000) };
      res.json({ vendor: vendorWithImage, orders: orders.length, totalSales, appCommission, vendorNet, commissionPercent: vendor.commissionPercent });
    } catch (err) {
      // H-33: this swallowed the error and answered 200 with every figure zeroed —
      // orders, totalSales, appCommission, vendorNet. A Firestore outage or a bad
      // document was therefore indistinguishable from a store that genuinely sold
      // nothing, and the admin had no way to tell. The success shape above is
      // unchanged; only this failure path stops lying.
      console.error(`[statement] vendor=${id} statement failed:`, err);
      res.status(500).json({ error: "تعذّر تحميل كشف الحساب، حاول مرة أخرى" });
    }
  });

  // ─── Order Routes ────────────────────────────────────────────────────────────
  // Requires a valid customer JWT — returns only that customer's orders
  app.get("/api/orders", requireCustomerAuth, async (req, res) => {
    const phoneNumber = (req as any).customerPhone as string;
    const db = getFirestore();
    if (db) {
      // H-33: a failed read must not reach the customer as an empty order list.
      try {
        const orders = await getOrdersByPhone(phoneNumber);
        return res.json(orders.map(o => ({
          ...o,
          createdAt: o.createdAt?.toDate?.() ? o.createdAt.toDate().toISOString() : o.createdAt,
          updatedAt: o.updatedAt?.toDate?.() ? o.updatedAt.toDate().toISOString() : o.updatedAt,
        })));
      } catch (error: any) {
        console.error("[API]", error?.message);
        return res.status(500).json({ error: GENERIC_SERVER_ERROR });
      }
    }
    res.json([]);
  });

  app.get("/api/admin/orders", async (req, res) => {
    const db = getFirestore();
    if (db) {
      // #19: bounded. The dashboard fetches this endpoint several times per page
      // load and used to receive every order ever placed each time.
      const limit = Math.min(2000, Math.max(1, parseInt(String(req.query.limit ?? ""), 10) || 500));
      const rawOrders = await getOrders(limit);
      const ordersWithDates = rawOrders.map(o => ({
        ...o,
        createdAt: o.createdAt?.toDate?.() ? o.createdAt.toDate().toISOString() : o.createdAt,
        updatedAt: o.updatedAt?.toDate?.() ? o.updatedAt.toDate().toISOString() : o.updatedAt,
      })) as any[];

      // Enrich orders that are missing a vendor display name
      const missingOrders = ordersWithDates.filter(
        o => !o.vendorName && !o.storeName && !o.restaurantName
      );

      if (missingOrders.length > 0) {
        // Collect unique vendorIds and unique first-item productIds in one pass
        const uniqueVendorIds = [...new Set(missingOrders.map(o => o.vendorId).filter(Boolean))] as string[];
        const uniqueProductIds = [
          ...new Set(
            missingOrders
              .map(o => (o.items as any[])?.[0]?.productId)
              .filter(Boolean)
          ),
        ] as string[];

        // Fetch vendor docs and product docs in parallel
        const [vendorDocs, productDocs] = await Promise.all([
          Promise.all(
            uniqueVendorIds.map(vid =>
              db.collection("vendors").doc(vid).get().then(d => ({ vid, d })).catch(() => null)
            )
          ),
          Promise.all(
            uniqueProductIds.map(pid =>
              db.collection("vendorProducts").doc(pid).get().then(d => ({ pid, d })).catch(() => null)
            )
          ),
        ]);

        // Build lookup maps
        const vendorNameMap: Record<string, string> = {};
        for (const r of vendorDocs) {
          if (r?.d.exists) {
            const vd = r.d.data() as any;
            const name = vd.storeName || vd.name || "";
            if (name) vendorNameMap[r.vid] = name;
          }
        }
        const productNameMap: Record<string, string> = {};
        for (const r of productDocs) {
          if (r?.d.exists) {
            const pd = r.d.data() as any;
            const name = pd.storeName || pd.vendorName || "";
            if (name) productNameMap[r.pid] = name;
          }
        }

        // Apply enrichment
        return res.json(
          ordersWithDates.map(o => {
            if (o.vendorName || o.storeName || o.restaurantName) return o;
            const fromVendor  = o.vendorId ? vendorNameMap[o.vendorId] || "" : "";
            const firstPid    = (o.items as any[])?.[0]?.productId || "";
            const fromProduct = firstPid ? productNameMap[firstPid] || "" : "";
            const resolved    = fromVendor || fromProduct;
            return resolved ? { ...o, vendorName: resolved } : o;
          })
        );
      }

      return res.json(ordersWithDates);
    }
    res.json([]);
  });

  app.post("/api/orders", requireCustomerAuth, async (req: Request, res: Response) => {
    // H-02: `deliveryFee` is deliberately NOT destructured from the body any more —
    // the fee is derived entirely server-side below. H-01: `serviceFee` likewise.
    const { userId, phoneNumber, customerName, customerPhone, notes, items, total, address, region, latitude, longitude, orderType, internationalDetails, courierDetails, promoCode, vendorId: bodyVendorId } = req.body;
    const db = getFirestore();
    
    // H-03: ONE canonical spelling of the coupon for the whole request.
    // The pre-check below looked the code up verbatim while the pricing block used
    // `.toUpperCase()`. Posting "welcome10" therefore made getPromoCodeByCode()
    // return null here — silently skipping the isActive, expiry AND maxUsage checks
    // — while the pricing block still found "WELCOME10" and applied the discount.
    // The per-user check missed for the same reason, because promoUsageHistory rows
    // were written with whatever casing the client last used. A 100-use launch code
    // could be spent thousands of times just by varying the letters.
    const promoCodeCanonical = promoCode ? String(promoCode).trim().toUpperCase() : "";
    // The identity a coupon is charged against must not be client-supplied.
    const promoClaimant = ((req as any).customerPhone as string) || "";
    let promoMaxUsage = 0;

    if (db) {
      if (promoCodeCanonical) {
        // Both keys are consulted so that usage recorded before this change — keyed
        // on the client-sent userId (the users/ document id) — is still honoured.
        // Checking an extra key can only ever add a rejection, never grant one.
        const legacyKey = userId ? String(userId) : "";
        const alreadyUsed =
          (await checkPromoUsage(promoClaimant, promoCodeCanonical)) ||
          (!!legacyKey && legacyKey !== promoClaimant && (await checkPromoUsage(legacyKey, promoCodeCanonical)));
        if (alreadyUsed) {
          return res.status(400).json({ error: "لقد استخدمت هذا الكود مسبقاً!" });
        }
        // Global usage limit: check promo active, expiry, and maxUsage cap
        const promoDoc = await getPromoCodeByCode(promoCodeCanonical);
        if (promoDoc) {
          promoMaxUsage = Number(promoDoc.maxUsage) > 0 ? Number(promoDoc.maxUsage) : 0;
          if (!promoDoc.isActive) {
            return res.status(400).json({ error: "هذا الكوبون غير مفعّل" });
          }
          if (promoDoc.expiryDate) {
            const expiry = (promoDoc.expiryDate as any)?.toDate
              ? (promoDoc.expiryDate as any).toDate()
              : new Date(promoDoc.expiryDate as any);
            if (expiry < new Date()) {
              return res.status(400).json({ error: "انتهت صلاحية هذا الكوبون" });
            }
          }
          if (promoMaxUsage > 0) {
            // Cheap early rejection. The authoritative cap check happens after the
            // claim below, where our own row is already counted.
            if ((await countPromoUsage(promoCodeCanonical)) >= promoMaxUsage) {
              return res.status(400).json({ error: "لقد وصل هذا الكوبون لحد الاستخدام الأقصى" });
            }
          }
        }
      }

      // ── Vendor availability check ─────────────────────────────────────────────
      // #9: capture the store's optional flat delivery-fee override here (the vendor
      // doc is already read for the availability check — no extra Firestore read).
      let vendorDeliveryFeeOverride: number | null = null;
      let pricingVendorData: any = null; // D-3: classifies the order, see below
      if (bodyVendorId) {
        const vAvailDoc = await db.collection("vendors").doc(String(bodyVendorId)).get();
        if (vAvailDoc.exists) {
          const vAvail = vAvailDoc.data() as any;
          pricingVendorData = vAvail;
          if (vAvail.isVacation) {
            return res.status(400).json({ error: "المتجر في وضع الإجازة حالياً، يرجى المحاولة لاحقاً" });
          }
          if (vAvail.isBusy) {
            return res.status(400).json({ error: "المتجر مشغول حالياً — يرجى المحاولة بعد قليل" });
          }
          if (typeof vAvail.deliveryFee === "number" && vAvail.deliveryFee >= 0) {
            vendorDeliveryFeeOverride = Math.round(vAvail.deliveryFee);
          }
        }
      }

      // ── Server-side price verification (never trust client-submitted prices) ──
      // Recompute item prices, delivery fee, promo discount, and total from the
      // authoritative Firestore data before anything is saved.
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "الطلب لا يحتوي على أي عناصر" });
      }
      // H-35: the quantity per line was capped at 99 but the NUMBER OF LINES was
      // not, and each line costs one sequential Firestore read in the addon pass
      // above. A 5,000-line cart still fits inside the 10 MB body limit, so one
      // request could hold the connection open for thousands of round trips —
      // and the rate limiter allows 600 requests a minute. A real order in
      // Dhuluiyah is a handful of lines; this bound sits far above any genuine
      // basket and simply stops the request from being unbounded.
      if (items.length > MAX_ORDER_ITEM_LINES) {
        return res.status(400).json({
          error: `الطلب يحتوي على عدد كبير جداً من العناصر (الحد ${MAX_ORDER_ITEM_LINES})`,
        });
      }

      // ── H-67: the order's own fields, validated before anything is stored ──
      //
      // One call, one place. These five arrived from the body unvalidated and were
      // written onto the document as they were: an address that need not be text, a
      // note of any length, an unrecognised tag, and coordinates that need not be
      // points on Earth. `1e309` arrives from JSON.parse as `Infinity`, passes the
      // `typeof … === "number"` gate at both distance call sites, and turns every
      // haversine result into NaN — which makes the driver-proximity sort order
      // undefined. Refusing the request is the only point at which that is cheap.
      //
      // The raw `address`/`notes`/`orderType`/`latitude`/`longitude` are not read
      // again below; everything the write needs comes out of `fields.value`.
      const fields = validateOrderFields({ address, notes, orderType, latitude, longitude });
      if (!fields.ok) {
        return res.status(400).json({ error: fields.error });
      }
      const {
        address: normalizedAddress,
        notes: normalizedNotes,
        orderType: normalizedOrderType,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
      } = fields.value;

      // C-06 / C-07: a service request is resolved BEFORE the catalogue loop and
      // never enters it. Its lines name no product, so the loop could only ever
      // reject them. `isServiceOrderType` is the sole gate — an order not tagged as
      // one of the two services takes the product path exactly as before, and a
      // service id appearing in a product order still falls through to
      // unknownProductIds below.
      const serviceOrder = isServiceOrderType(normalizedOrderType)
        ? resolveServiceOrder({ orderType: normalizedOrderType, items, courierDetails, internationalDetails })
        : null;
      if (serviceOrder && !serviceOrder.ok) {
        return res.status(400).json({ error: serviceOrder.error });
      }
      const service = serviceOrder?.ok ? serviceOrder.value : null;

      const allProductsForPricing = await getCachedProducts();
      const verifiedPriceByProductId = new Map<string, number>();
      let verifiedSubtotal = 0;
      const unknownProductIds: string[] = [];
      const priceMismatchProductIds: string[] = [];
      const outOfStockNames: string[] = [];
      const stockRequirements = new Map<string, { productId: string; quantity: number }>();

      let allItemsAreRestaurant = items.length > 0;

      // H-35: pre-load every vendorProduct this basket needs in ONE round trip.
      //
      // The loop below used to `await db.collection("vendorProducts").doc(id).get()`
      // per item, sequentially — one network round trip each, for every line that
      // is not in the legacy product cache. MAX_ORDER_ITEM_LINES bounds how many
      // that can be, but bounded is not the same as batched: a 100-line basket
      // still meant 100 serial reads with the request held open for all of them.
      //
      // getAll() fetches them together, de-duplicated, since a basket may list one
      // product twice. Nothing about pricing changes: the same documents, read the
      // same way — the loop below still prefers the legacy cache and only consults
      // this map when the legacy price is unusable.
      //
      // Every distinct item id is fetched, not just the ones the pricing loop will
      // need, because two later steps in this same handler read the same documents:
      //   • the marketplace vendor fallback, which used to walk the basket with one
      //     sequential doc.get() per line (H-35's own N+1, in a second place);
      //   • orderData.vendorIds (H-34), which is the union of the order's vendorId
      //     and the owner of every item — an order created without it would be
      //     invisible to the vendor query the backfill exists to enable.
      // One round trip now serves all three, and it is bounded by
      // MAX_ORDER_ITEM_LINES.
      const vendorProductById = new Map<string, any>();
      {
        const needed = new Set<string>();
        for (const it of items as any[]) {
          const pid = it?.productId;
          if (typeof pid === "string" && pid) needed.add(pid);
        }
        if (needed.size > 0) {
          const refs = [...needed].map((id) => db.collection("vendorProducts").doc(id));
          const snaps = await db.getAll(...refs);
          for (const snap of snaps) {
            if (snap.exists) vendorProductById.set(snap.id, snap.data());
          }
        }
      }

      // H-66: what the order will actually be stored with, resolved line by line
      // from the catalogue rather than copied from the request. Kept parallel to
      // `items` — every path that fails to resolve a line returns 400 below, so by
      // the time this is read it holds exactly one entry per submitted item.
      //
      // Per LINE, not per productId: the same product can appear twice in one cart
      // with different add-ons, and those two lines have different verified prices.
      const resolvedLines: ResolvedOrderLine[] = [];

      if (service) {
        // The one validated service line, rebuilt from the resolver's output — not
        // copied from the request. `declaredValue` is the only client-originated
        // number that survives, and it arrived here parsed, floored and capped.
        allItemsAreRestaurant = false;
        verifiedSubtotal = service.declaredValue;
        verifiedPriceByProductId.set(service.line.productId, service.declaredValue);
        resolvedLines.push({
          productId: service.line.productId,
          name: service.line.name,
          unitPrice: service.declaredValue,
          quantity: service.line.quantity,
          variant: null,
          addons: [],
        });
      }

      for (const it of service ? [] : (items as any[])) {
        let realPrice: number | undefined;
        let available = true; // only an explicit inStock === false blocks the order
        // Catalogue-resolved presentation for this line. Populated alongside the
        // price so the two can never come from different products.
        let resolvedName: unknown;
        let resolvedImage: unknown;
        let resolvedRestaurant: unknown;
        let resolvedVariant: { id?: unknown; name?: unknown; priceAdjustment?: unknown } | null = null;
        const resolvedAddons: { id?: unknown; name?: unknown; price?: unknown }[] = [];
        const legacyProduct = allProductsForPricing.find((p: any) => p.id === it.productId);
        // H-05 (defence in depth): only a FINITE, STRICTLY POSITIVE stored price may
        // be used. `!Number.isNaN(...)` alone let a negative or Infinity price that
        // is already in the database flow into verifiedSubtotal, which has no lower
        // bound — a hidden product priced -500000 dragged a real basket to a total
        // of 0. An unusable price leaves realPrice undefined, so the item lands in
        // unknownProductIds and the order is rejected instead of silently discounted.
        if (legacyProduct && isValidProductPrice(legacyProduct.price)) {
          realPrice = Number(legacyProduct.price);
          resolvedName = legacyProduct.name;
          resolvedImage = legacyProduct.image;
          resolvedRestaurant = legacyProduct.restaurant;
          if (legacyProduct.inStock === false) available = false;
          if (legacyProduct.categoryId !== "restaurants") allItemsAreRestaurant = false;
        } else {
          // Fall back to vendorProducts collection (vendor-added items aren't in the
          // legacy cache). Read from the batch fetched above — same document, no
          // per-item round trip.
          const vp = vendorProductById.get(it.productId) as any;
          if (vp) {
            const vpPrice = Number(vp?.price);
            if (isValidProductPrice(vpPrice)) {
              realPrice = vpPrice;
              resolvedName = vp.name;
              // H-66: the picture is taken from the same document as the price.
              // `imageUrl` is the field vendors write; `imageUrls[0]` covers the
              // multi-image products, matching what the storefront shows first.
              resolvedImage =
                vp.imageUrl ?? (Array.isArray(vp.imageUrls) ? vp.imageUrls[0] : undefined);
              // Add verified variant price adjustment
              if (it.selectedVariantId && Array.isArray(vp.variants)) {
                const variant = vp.variants.find((v: any) => v.id === it.selectedVariantId);
                if (variant) {
                  realPrice += Number(variant.priceAdjustment) || 0;
                  // H-66: store the catalogue's own label and adjustment, so the
                  // line the store reads describes the variant it was priced for.
                  resolvedVariant = {
                    id: variant.id,
                    name: variant.name,
                    priceAdjustment: Number(variant.priceAdjustment) || 0,
                  };
                }
              }
              // Add verified addon prices
              if (Array.isArray(it.selectedAddons) && Array.isArray(vp.addons)) {
                for (const orderAddon of it.selectedAddons as any[]) {
                  const dbAddon = vp.addons.find((a: any) => a.id === orderAddon.id);
                  if (dbAddon) {
                    realPrice += Number(dbAddon.price) || 0;
                    // Only add-ons the product actually defines are stored — an id
                    // the catalogue does not know added nothing to the price, so
                    // persisting its client-supplied name and cost would describe
                    // something the customer was never charged for.
                    resolvedAddons.push({
                      id: dbAddon.id,
                      name: dbAddon.name,
                      price: Number(dbAddon.price) || 0,
                    });
                  }
                }
              }
            }
            // G-1: this used to test `inStock === false` only. `stock` is the field
            // vendors actually maintain — every live product has it and none has
            // `inStock` — so a product marked down to zero stayed on sale. Four live
            // products are in that state right now.
            if (!isProductAvailable(vp)) available = false;
          }
          // Vendor-added items are never legacy "restaurants" category products
          allItemsAreRestaurant = false;
        }

        if (realPrice === undefined) {
          unknownProductIds.push(it.productId);
          continue;
        }
        if (!available) {
          outOfStockNames.push(it.name || it.productId);
          continue;
        }

        const quantity = sanitizeQuantity(it.quantity);
        const trackedProduct = !legacyProduct || !isValidProductPrice(legacyProduct.price)
          ? vendorProductById.get(it.productId)
          : null;
        if (trackedProduct && Number.isFinite(Number(trackedProduct.stock))) {
          const current = stockRequirements.get(it.productId) ?? { productId: it.productId, quantity: 0 };
          current.quantity += quantity;
          stockRequirements.set(it.productId, current);
        }
        if (Math.abs((Number(it.price) || 0) - realPrice) > 1) {
          priceMismatchProductIds.push(it.productId);
        }
        verifiedPriceByProductId.set(it.productId, realPrice);
        verifiedSubtotal += realPrice * quantity;
        // H-66: the same numbers that were just charged for, kept per line.
        resolvedLines.push({
          productId: it.productId,
          name: resolvedName,
          unitPrice: realPrice,
          quantity: it.quantity,
          image: resolvedImage,
          restaurant: resolvedRestaurant,
          variant: resolvedVariant,
          addons: resolvedAddons,
        });
      }

      if (unknownProductIds.length > 0) {
        return res.status(400).json({ error: `منتج غير موجود أو غير متاح: ${unknownProductIds.join(", ")}` });
      }
      // Reject orders that contain an item the vendor has marked out of stock.
      if (outOfStockNames.length > 0) {
        return res.status(400).json({ error: `بعض المنتجات غير متوفّرة حالياً: ${outOfStockNames.join("، ")} — يرجى تحديث السلة` });
      }
      if (priceMismatchProductIds.length > 0) {
        console.warn(`[FRAUD_CHECK] Price mismatch on order from ${phoneNumber} — productIds: ${priceMismatchProductIds.join(", ")}, client total: ${total}`);
        return res.status(400).json({ error: "أسعار بعض المنتجات تغيّرت، الرجاء تحديث السلة والمحاولة مجدداً" });
      }

      // Recompute delivery fee. Precedence (#9):
      //   1. the store's own flat delivery fee, when set — independent per store;
      //   2. otherwise the authoritative deliveryAreas collection fee for the region.
      //
      // D-3: there is no longer a per-kind step between them. A restaurant delivery
      // and a shopping delivery to the same address cost the same, because getting
      // there costs the same; what differs is only how the fee is SPLIT (below).
      // The step that used to sit here read a flat `restaurantDeliveryFee` behind
      // `allItemsAreRestaurant`, a condition that required every basket line to be
      // in the legacy `products` collection — which holds no documents — so it was
      // unreachable code that made the admin's restaurant fee setting inert.
      //
      // H-02: this used to SEED the fee with `Number(deliveryFee) || 0` taken from
      // the request body and only overwrite it when the region matched an active
      // delivery area. `{"region":"x","deliveryFee":0}` therefore bought permanent
      // free delivery on every non-restaurant order — and because the driver's share
      // is computed from `order.deliveryFee` (computeDriverPayout), the driver earned
      // nothing on that order while the cash they owed the company still grew.
      // The body value is no longer read at all: the fee now comes only from a store
      // override or a matching active delivery area, and an order whose region
      // resolves to neither is refused instead of shipped free.
      const sysSettings = await getSystemSettings();

      // D-3: ONE classification. It no longer changes what the customer PAYS — only
      // which split percentage applies to it. It reads the STORE, not the basket.
      // `allItemsAreRestaurant` survives solely as the fallback for a legacy order
      // that has no store at all.
      if (!pricingVendorData) {
        const itemVendorId = [...vendorProductById.values()]
          .map((vp: any) => vp?.vendorId)
          .find((id: any) => typeof id === "string" && id);
        if (itemVendorId) {
          const vDoc = await db.collection("vendors").doc(String(itemVendorId)).get();
          if (vDoc.exists) pricingVendorData = vDoc.data();
        }
      }
      const orderKind: OrderKind = orderKindForVendor(pricingVendorData, allItemsAreRestaurant);
      const appSharePercent = sysSettings.deliveryPricing[orderKind].appSharePercent;

      let verifiedDeliveryFee: number | null = null;
      if (service) {
        // C-06/C-07 third gate: a service request has no delivery area to price
        // against — the screens collect a pickup address, not one of the configured
        // regions — so the lookup below could only ever return null and H-02 would
        // refuse the order. The fee is the server's own constant; the request's
        // `deliveryFee` is still never read, which is what H-02 exists to guarantee.
        verifiedDeliveryFee = service.deliveryFee;
      } else if (vendorDeliveryFeeOverride != null) {
        verifiedDeliveryFee = vendorDeliveryFeeOverride;
      } else {
        const areas = await getFirestoreDeliveryAreas(true);
        // Trim both sides: the client posts back the very name this collection served
        // it, so only stray whitespace can ever separate the two.
        const wanted = String(region ?? "").trim();
        const matchedArea = wanted
          ? areas.find(a => String(a.name ?? "").trim() === wanted)
          : undefined;
        // A corrupt stored fee must not silently become free delivery either. Same
        // shape as the vendor override above (`typeof … === "number" && … >= 0`) —
        // Number(null) is 0, so coercing first would turn a null fee into free.
        const areaFee = matchedArea?.fee;
        if (matchedArea && typeof areaFee === "number" && Number.isFinite(areaFee) && areaFee >= 0) {
          verifiedDeliveryFee = Math.round(areaFee);
        }
      }
      if (verifiedDeliveryFee === null) {
        return res.status(400).json({ error: "منطقة التوصيل غير مدعومة — يرجى اختيار منطقة من القائمة" });
      }

      // Recompute promo discount from the authoritative promoCodes collection
      let verifiedDiscount = 0;
      if (promoCodeCanonical) {
        const promo = await getPromoCodeByCode(promoCodeCanonical);
        const notExpired = promo ? new Date(promo.expiryDate) >= new Date() : false;
        // H-04: the stored coupon amount was used without ever being checked as a
        // number. `value: Number(value)` at creation accepts "abc" (NaN), a negative
        // and Infinity alike; NaN then flowed through Math.max(0, NaN) === NaN and
        // was stored as `total: NaN`, while a negative value INCREASED the bill.
        // isValidProductPrice is reused here rather than duplicating the check — it
        // is the project's existing "finite and strictly positive amount" predicate,
        // not something specific to product rows.
        const promoValue = Number(promo?.value);
        if (promo && promo.isActive && notExpired && isValidProductPrice(promoValue)) {
          if (promo.type === "percentage") {
            verifiedDiscount = Math.round(verifiedSubtotal * (promoValue / 100));
            // Apply maximum discount cap if configured (percentage coupons only)
            if (promo.maximumDiscountAmount && promo.maximumDiscountAmount > 0) {
              verifiedDiscount = Math.min(verifiedDiscount, promo.maximumDiscountAmount);
            }
          } else {
            verifiedDiscount = promoValue;
          }
          // H-04: never let a coupon exceed the goods it is discounting.
          // The preview route (POST /api/promo-codes/apply) already clamps with
          // `Math.min(discount, cartTotal)` where cartTotal is the cart SUBTOTAL, so
          // the client is quoted a total that never drops below delivery + service.
          // This path did not clamp, so a 10,000 fixed coupon on a 3,000 cart drove
          // the order to Math.max(0, ...) === 0: the coupon swallowed the goods AND
          // the delivery fee, the driver collected nothing, and the settlement was
          // booked at grossAmount 0 while the store was still owed its stock.
          // Clamping to verifiedSubtotal makes the two paths agree and keeps the
          // delivery/service fees — which are not part of the promotion — payable.
          verifiedDiscount = Math.min(verifiedDiscount, verifiedSubtotal);
        } else {
          return res.status(400).json({ error: "كود الخصم غير صالح أو منتهي الصلاحية" });
        }
      }

      // Service fee is server-authoritative, exactly like the delivery fee above.
      // It used to be `Number(serviceFee) || 0` straight from the request body, so
      // `{"serviceFee": -50000}` produced a near-zero — or negative — cash order.
      // The client only ever echoes back what GET /api/settings/fees told it, so
      // reading the same document here changes nothing for an honest client.
      //
      // H-01: the VALUE was server-authoritative but the FIELD's presence was not —
      // `serviceFee === undefined ? 0 : ...` meant a patched client that simply omits
      // the key pays no service fee at all, and `orderData.serviceFee` was then left
      // off the document entirely, so no reconciliation report could ever spot it.
      // The fee is now always computed and always stored, whatever the client sent.
      const verifiedServiceFee = await getConfiguredServiceFee();

      // Floor at zero. A promo larger than the cart must never produce a negative
      // total that would flow into the ledger as money OnWay owes the customer.
      const verifiedTotal = Math.max(
        0,
        verifiedSubtotal + verifiedDeliveryFee + verifiedServiceFee - verifiedDiscount,
      );

      // Log mismatches (e.g. stale delivery fee on client) but never reject —
      // the server's computed values are always used for the stored order.
      // Item-price fraud is already caught above; rejecting here only hurts
      // customers whose app had a cached fee when the admin updated it.
      if (Math.abs((Number(total) || 0) - verifiedTotal) > 1) {
        console.warn(`[PRICE_DRIFT] Total drift on order from ${phoneNumber} — client sent ${total}, server computed ${verifiedTotal} (delivery: ${verifiedDeliveryFee})`);
      }

      // H-66: the lines to persist, rebuilt from the catalogue. Nothing the client
      // sent about a product's name, price, quantity, variant or add-ons survives
      // into the document — the store, the driver, the admin panel and the printed
      // receipt now read back exactly what the server verified and charged for.
      const verifiedItems = resolvedLines.map(buildStoredOrderItem);

      const orderData: any = {
        userId: userId || "",
        phoneNumber,
        // Inline Base64 item images are what pushed large carts past Firestore's
        // 1MB document limit and made checkout fail outright. See capOrderItemImages.
        items: capOrderItemImages(verifiedItems),
        total: verifiedTotal,
        deliveryFee: verifiedDeliveryFee,
        // H-67: the normalised text, never the raw body value.
        address: normalizedAddress,
        region,
        status: "pending",
      };
      // H-01: stored unconditionally — an omitted field must never erase the fee.
      orderData.serviceFee = verifiedServiceFee;
      // D-3: freeze the pricing decision onto the order, exactly as
      // vendorCommissionAmount freezes the store's commission. Settlement runs when
      // the order is delivered — possibly days later, possibly after an admin has
      // changed the split — and it must pay what this order was sold at. It also
      // means changing the settings can never move money on an order already placed.
      orderData.orderKind = orderKind;
      orderData.appSharePercent = appSharePercent;
      if (customerName) orderData.customerName = customerName;
      if (customerPhone) orderData.customerPhone = customerPhone;
      if (normalizedNotes) orderData.notes = normalizedNotes;
      // H-67: the stored pair is the PARSED pair. Every later distance calculation
      // reads these fields back off the order document, so storing the validated
      // numbers is what makes "what was computed with" and "what was stored" the
      // same values by construction. Both are non-null together or absent together.
      if (parsedLatitude !== null && parsedLongitude !== null) {
        orderData.latitude = parsedLatitude;
        orderData.longitude = parsedLongitude;
      }
      if (normalizedOrderType) orderData.orderType = normalizedOrderType;
      // C-06/C-07: these two used to be written straight from the request body —
      // whatever shape and size the caller sent, unvalidated, into the order
      // document. What is stored now is the resolver's own object: known keys,
      // trimmed, length-bounded, with the declared value already capped.
      if (service?.type === "international-shopping") {
        orderData.internationalDetails = service.details;
      }
      if (service?.type === "courier-pickup") {
        orderData.courierDetails = service.details;
      }
      // H-03: store the canonical spelling, so the order and promoUsageHistory agree.
      if (promoCodeCanonical) orderData.promoCode = promoCodeCanonical;
      if (verifiedDiscount) orderData.promoDiscount = verifiedDiscount;
      // Preserve explicit vendorId from request body (vendor partner orders).
      // restaurantSubtotal is NOT trusted from the client — it's recomputed below from verified prices.
      if (bodyVendorId) orderData.vendorId = bodyVendorId;

      // Detect vendor for restaurant orders
      let vendorWhatsappUrl: string | null = null;
      try {
        const allProds = allProductsForPricing; // reuse already-fetched cache
        const vendorsList = await getVendorList();

        // Scan ALL items to find restaurant ones (handles mixed orders)
        const restaurantItems: any[] = [];
        let restaurantSubtotal = 0;
        let detectedRestaurantName: string | null = null;

        // H-66: walk the verified lines, not the request. Two consequences, both
        // deliberate:
        //   • the price is this LINE's verified price. `verifiedPriceByProductId`
        //     is keyed by product, so when one basket held the same product twice
        //     with different add-ons both lines were valued at whichever price was
        //     computed last — making restaurantSubtotal disagree with the
        //     verifiedSubtotal the customer was actually charged. The payout base
        //     and the charge now come from the same per-line numbers.
        //   • `restaurantItems` carries the stored line, so the vendor-name keyword
        //     fallback below matches on the catalogue's product name rather than on
        //     a name the caller chose.
        for (const it of verifiedItems) {
          const prod = allProds.find((p: any) => p.id === it.productId);
          if (prod && prod.categoryId === "restaurants") {
            restaurantItems.push({ ...it, restaurantName: prod.restaurant });
            // `it.quantity` is already sanitised by buildStoredOrderItem. This value
            // becomes orderData.restaurantSubtotal, which vendorCommissionBase()
            // uses as the vendor payout base — an unvalidated quantity here is money.
            restaurantSubtotal += it.price * it.quantity;
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
            // H-06: `|| 10` billed a 0% store at 10%, and vendorCommissionAmount is the
            // value accrueDeliveredOrderSettlements prefers over recomputing.
            const vendorRate = commissionPercentOf(vendor.commissionPercent);
            orderData.vendorCommissionPercent = vendorRate;
            orderData.vendorCommissionAmount = Math.round(restaurantSubtotal * (vendorRate / 100));
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

      // Fallback vendor detection for marketplace (vendorProducts) orders — the
      // restaurant-detection block above only matches the legacy product cache
      // (categoryId === "restaurants"). Real vendor-marketplace orders (products
      // created via the vendor dashboard, stored in the `vendorProducts` collection)
      // never populate orderData.vendorId there, leaving the top-level field
      // undefined even though GET /api/vendor/orders can still locate them via
      // item-level productId lookups. Setting it here keeps admin filtering,
      // driver batch pickup-address resolution, and analytics consistent.
      //
      // The documents are already in hand from the single getAll() above, so this
      // reads the basket in order and stops at the first owned product — the same
      // first-match rule as before, without the per-line round trip.
      if (!orderData.vendorId) {
        try {
          for (const it of (items as any[])) {
            if (!it?.productId) continue;
            const pData = vendorProductById.get(it.productId);
            if (pData?.vendorId) {
              orderData.vendorId   = pData.vendorId;
              // vendorProducts already stores storeName/vendorName at product-creation time
              orderData.vendorName = pData.storeName || pData.vendorName || "";
              break;
            }
          }
        } catch (e) { console.error("Vendor marketplace detection error:", e); }
      }

      // H-34: every vendor with a stake in this order, denormalised so a vendor can
      // query `orders where vendorIds array-contains <id>` instead of reading the
      // newest 300/1000/2000 orders platform-wide and filtering in JavaScript.
      //
      // The value is computed by exactly the rule the backfill script uses — the
      // union of orderData.vendorId and the owner of each item, deduplicated and
      // sorted — so a backfilled order and a freshly created one are identical.
      // Without this, the backfill goes stale on the very next order.
      //
      // The field is additive: nothing reads it until the vendor queries are
      // switched over, which needs the orders/vendorIds index deployed first.
      {
        const owners = new Set<string>();
        if (orderData.vendorId) owners.add(String(orderData.vendorId));
        for (const it of (items as any[])) {
          const owner = vendorProductById.get(it?.productId)?.vendorId;
          if (owner) owners.add(String(owner));
        }
        orderData.vendorIds = [...owners].sort();
      }

      // ── H-03: claim the coupon BEFORE the order exists ────────────────────────
      // Consumption used to be recorded AFTER createOrder() with .add() and a
      // swallowed .catch(), so the write could not refuse a duplicate and a failed
      // write silently granted the code again. The claim is now an atomic .create()
      // on a deterministic (code, user) document id: the second request loses, and
      // it loses before any order is written.
      if (promoCodeCanonical) {
        let claimed = false;
        try {
          claimed = await claimPromoUsage(promoClaimant, promoCodeCanonical);
        } catch (err) {
          console.error("Failed to claim promo usage:", err);
          return res.status(500).json({ error: GENERIC_SERVER_ERROR });
        }
        if (!claimed) {
          return res.status(400).json({ error: "لقد استخدمت هذا الكود مسبقاً!" });
        }
        // Authoritative global cap: our own row is now part of the count, so the
        // comparison is `>`. Racing requests that overshoot hand their claim back.
        if (promoMaxUsage > 0 && (await countPromoUsage(promoCodeCanonical)) > promoMaxUsage) {
          await releasePromoUsage(promoClaimant, promoCodeCanonical);
          return res.status(400).json({ error: "لقد وصل هذا الكوبون لحد الاستخدام الأقصى" });
        }
      }

      const stockDeltas = [...stockRequirements.values()];
      Object.defineProperty(orderData, "__stockDeltas", {
        value: stockDeltas,
        enumerable: false,
        configurable: true,
      });
      const newOrder = await createOrder(orderData);
      if (!newOrder && promoCodeCanonical) {
        // The order never came into existence — do not burn the customer's coupon.
        await releasePromoUsage(promoClaimant, promoCodeCanonical);
      }
      if (newOrder) {
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
      return res.status(stockDeltas.length > 0 ? 409 : 500).json({
        error: stockDeltas.length > 0 ? "الكمية المطلوبة لم تعد متاحة" : "Failed to create order",
      });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  app.put("/api/admin/orders/:id/status", async (req: Request, res: Response) => {
    const orderId = req.params.id as string;
    const { status, phoneNumber } = req.body;

    // Validate against the allowed status enum — reject arbitrary strings
    const ALLOWED_STATUSES = ["pending", "confirmed", "preparing", "in_delivery", "delivered", "cancelled", "issue"];
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ error: `حالة غير مسموحة. الحالات المقبولة: ${ALLOWED_STATUSES.join(", ")}` });
    }

    const db = getFirestore();
    
    if (db) {
      // M-26: admin status changes use the same server-side state machine as every
      // other caller. The admin boundary authorizes the actor; it must not bypass
      // order transition rules merely because the request came from the dashboard.
      const existingOrder = await getOrderById(orderId);
      if (!existingOrder) {
        return res.status(404).json({ error: "Order not found" });
      }
      const success = await updateOrderStatus(orderId, status);
      if (success) {
        // Real-time: push status change to all connected clients so vendor,
        // driver, and customer screens refresh without polling delay.
        orderEvents.emit("order:status", { orderId, status });

        // Customer push notification (if phone provided in request body)
        if (phoneNumber) {
          const pushToken = await getUserPushToken(phoneNumber);
          if (pushToken) {
            await sendPushNotification(pushToken, status, orderId);
          }
        }

        // When order is confirmed, create a batch for the next available driver
        if (status === "confirmed") {
          onOrderConfirmed();
        }

        // #14: delivering from the admin panel must credit driver + vendor
        // earnings with the SAME logic as the driver flow. Claim the one-time
        // earningsCredited flag, then run the shared accrual. Idempotent: if the
        // driver flow already credited this order, the flag is set and we skip —
        // no double credit. Best-effort: a settlement hiccup never fails the
        // status update the admin just performed.
        if (status === "delivered") {
          const orderRef = db.collection("orders").doc(orderId);
          try {
            const firstCredit = await db.runTransaction(async (tx) => {
              const snap = await tx.get(orderRef);
              if (!snap.exists) return false;
              if ((snap.data() as any)?.earningsCredited === true) return false;
              tx.update(orderRef, { earningsCredited: true });
              return true;
            });
            if (firstCredit) {
              const order = await getOrderById(orderId);
              if (order) {
                await accrueDeliveredOrderSettlements(
                  db,
                  orderId,
                  order,
                  (order as any).driverPhone || null,
                );
                await orderRef.update({ deliveredAt: Timestamp.now(), updatedAt: Timestamp.now() }).catch(() => {});
              } else {
                // Couldn't read the order — release the claim so a retry can credit.
                await orderRef.update({ earningsCredited: false }).catch(() => {});
              }
            }
          } catch (creditErr: any) {
            console.error(`[ADMIN-DELIVERED] earnings accrual failed order=${orderId}:`, creditErr?.message);
          }
        }

        // Cancellation: notify all affected parties and clean up driver state
        if (status === "cancelled") {
          // Read the order to get vendorId / driverPhone (best-effort, async)
          getOrderById(orderId).then(async cancelledOrder => {
            if (!cancelledOrder) return;

            // Customer push: if not already sent above, notify via order doc phone
            if (!phoneNumber) {
              const cPhone = cancelledOrder.customerPhone || cancelledOrder.phoneNumber;
              if (cPhone) {
                getUserPushToken(cPhone)
                  .then(cToken => {
                    if (cToken) sendPushNotification(cToken, "cancelled", orderId).catch(() => {});
                  }).catch(() => {});
              }
            }

            // Vendor push: vendor-specific cancellation message
            if (cancelledOrder.vendorId) {
              db.collection("vendors").doc(String(cancelledOrder.vendorId)).get()
                .then(vDoc => {
                  const vToken = vDoc.exists ? (vDoc.data() as any)?.pushToken as string | undefined : undefined;
                  if (vToken) sendVendorOrderCancelledNotification(vToken, orderId, cancelledOrder.customerName).catch(() => {});
                }).catch(() => {});
            }

            // Driver push + in-memory cleanup (check map first, fall back to order doc)
            const assignedDriver = driverAssignments.get(orderId) || cancelledOrder.driverPhone || null;
            if (assignedDriver) {
              driverAssignments.delete(orderId);
              getDriverPushToken(String(assignedDriver))
                .then(dToken => {
                  if (dToken) sendDriverOrderCancelledNotification(dToken, orderId).catch(() => {});
                }).catch(() => {});
            }

            // Admin push (inform other admin sessions / devices)
            getAdminPushToken()
              .then(adminToken => {
                if (adminToken) sendPushNotification(adminToken, "cancelled", orderId).catch(() => {});
              }).catch(() => {});

            console.log(`[CANCEL] Admin cancelled ${orderId.slice(-6).toUpperCase()} — driver: ${assignedDriver || "none"}, vendor: ${cancelledOrder.vendorId || "none"}`);
          }).catch(() => {});
        }

        return res.json({ success: true, id: orderId, status });
      }
      return res.status(409).json({ error: "انتقال حالة الطلب غير مسموح" });
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
      // 1. Verify order exists and is assignable (single-doc read, not a full scan)
      const order = await getOrderById(orderId);
      if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
      if (["delivered", "cancelled"].includes(order.status)) {
        return res.status(400).json({ error: "لا يمكن تعيين سائق لطلب مكتمل أو ملغى" });
      }

      // 2. Verify driver is approved
      const driver = await getDriverByPhone(driverPhone);
      if (!driver) return res.status(404).json({ error: "السائق غير موجود" });
      if (driver.status !== "approved") return res.status(400).json({ error: "السائق غير مفعّل" });

      // 3. Clean up a PREVIOUS driver still holding this order (a real reassignment).
      //    Without this the old driver's app kept showing the order and the live map
      //    followed them. Remove it from their batch and tell them it was moved.
      const previousDriver = driverAssignments.get(orderId) || (order as any).driverPhone || null;
      if (previousDriver && previousDriver !== driverPhone) {
        driverAssignments.delete(orderId);
        const prevQd = driverQueue.find(d => d.phoneNumber === previousDriver);
        if (prevQd?.currentBatchId) {
          const prevBatch = await getDeliveryBatch(prevQd.currentBatchId);
          if (prevBatch && prevBatch.orderIds.includes(orderId)) {
            const remaining = prevBatch.orderIds.filter(id => id !== orderId);
            if (remaining.length === 0) {
              await updateDeliveryBatch(prevQd.currentBatchId, { status: "cancelled" }).catch(() => {});
              prevQd.currentBatchId = undefined;
              updateDriverQueueEntry(previousDriver, { hasActiveBatch: false }).catch(() => {});
            } else {
              await updateDeliveryBatch(prevQd.currentBatchId, { orderIds: remaining, totalOrders: remaining.length }).catch(() => {});
            }
          }
        }
        getDriverPushToken(String(previousDriver))
          .then(t => { if (t) sendDriverOrderCancelledNotification(t, orderId).catch(() => {}); })
          .catch(() => {});
      }

      // 4. Free the order + clear the NEW driver's stale finished batch if any.
      batchedOrderIds.delete(orderId);
      const queuedDriver = driverQueue.find(d => d.phoneNumber === driverPhone);
      if (queuedDriver?.currentBatchId) {
        const oldBatch = await getDeliveryBatch(queuedDriver.currentBatchId);
        if (oldBatch) {
          const oldBatchOrders = await getOrdersByIds(oldBatch.orderIds);
          const oldNonActive = oldBatch.orderIds.filter(id => {
            const o = oldBatchOrders.find(x => x.id === id);
            return !o || ["delivered", "cancelled"].includes(o.status);
          });
          if (oldNonActive.length === oldBatch.orderIds.length) {
            await updateDeliveryBatch(queuedDriver.currentBatchId, { status: "completed" }).catch(() => {});
            queuedDriver.currentBatchId = undefined;
          }
          oldBatch.orderIds.forEach(id => batchedOrderIds.delete(id));
        }
      }

      // 5. Ensure the driver is in the queue.
      if (!queuedDriver) {
        driverQueue.push({ phoneNumber: driverPhone, joinedAt: Date.now(), lastSeenAt: Date.now(), currentBatchId: undefined });
        addDriverToActiveQueue(driverPhone, Date.now()).catch(() => {});
      }

      // 6. Create the batch and FORCE it active. A manual admin transfer is immediate —
      //    not a 'pending' offer the driver can ignore — which is what "تحديث الحالة فوراً"
      //    requires. The driver finds it directly in their active batch.
      const batchId = await createDeliveryBatch({ driverPhone, orderIds: [orderId] });
      if (!batchId) return res.status(500).json({ error: "فشل في إنشاء الدُفعة" });
      await updateDeliveryBatch(batchId, { status: "in_progress", startTime: new Date().toISOString() }).catch(() => {});

      // 7. Update in-memory queue + the assignment map that drives the live tracking map.
      const targetDriver = driverQueue.find(d => d.phoneNumber === driverPhone);
      if (targetDriver) {
        targetDriver.currentBatchId = batchId;
        updateDriverQueueEntry(driverPhone, { hasActiveBatch: true }).catch(() => {});
      }
      batchedOrderIds.add(orderId);
      driverAssignments.set(orderId, driverPhone);

      // 8. Persist driver info on the order + move it forward, clearing reject flags.
      const driverName = [driver.firstName, driver.secondName].filter(Boolean).join(" ") || driver.fullName || driverPhone;
      const { FieldValue } = await import("firebase-admin/firestore");
      const newStatus = ["pending", "confirmed"].includes(order.status) ? "preparing" : order.status;
      await db.collection("orders").doc(orderId).update({
        driverPhone,
        driverName,
        batchId,
        status: newStatus,
        rejectedAt: FieldValue.delete(),
        rejectedByDriver: FieldValue.delete(),
        rejectedByPhone: FieldValue.delete(),
      }).catch(() => {});

      // 9. Real-time + push updates for everyone affected: the order stream (customer
      //    tracking + admin), the customer, and the new driver.
      orderEvents.emit("order:status", { orderId, status: newStatus });
      notifyCustomerStatus(orderId, newStatus).catch(() => {});
      const driverPushToken = await getDriverPushToken(driverPhone);
      if (driverPushToken) sendDriverBatchNotification(driverPushToken, 1, batchId, 0).catch(() => {});

      res.json({ success: true, batchId, driverPhone, driverName, status: newStatus });
    } catch (error: any) {
      console.error("assign-driver error:", error);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── Dispatch admin tools (A4) ───────────────────────────────────────────────

  // Release an order from whatever batch/driver holds it and send it back to the
  // dispatch pool as a plain "confirmed" order. Shared by remove-from-batch and the
  // emergency redistribute below. Best-effort; never throws.
  async function releaseOrderToPool(db: FirebaseFirestore.Firestore, orderId: string, notifyOldDriver = true) {
    const holder = driverAssignments.get(orderId) || null;
    driverAssignments.delete(orderId);
    batchedOrderIds.delete(orderId);
    const { FieldValue } = await import("firebase-admin/firestore");
    await db.collection("orders").doc(orderId).update({
      status: "confirmed",
      driverPhone: FieldValue.delete(),
      driverName: FieldValue.delete(),
      batchId: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    }).catch(() => {});
    if (notifyOldDriver && holder) {
      getDriverPushToken(String(holder))
        .then(t => { if (t) sendDriverOrderCancelledNotification(t, orderId).catch(() => {}); })
        .catch(() => {});
    }
    return holder;
  }

  // GET all active batches with their resolved orders (view + delivery order + per-driver count).
  app.get("/api/admin/active-batches", async (_req: Request, res: Response) => {
    const db = getFirestore();
    if (!db) return res.json({ batches: [] });
    try {
      const snap = await db.collection("delivery_batches").where("status", "in", ["pending", "in_progress"]).get();
      const batchDocs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const orders = await getOrdersByIds(batchDocs.flatMap(b => (b.orderIds as string[]) || []));
      const batches = await Promise.all(batchDocs.map(async b => {
        const driver = await getDriverByPhone(b.driverId).catch(() => null);
        const driverName = driver
          ? ([driver.firstName, driver.secondName].filter(Boolean).join(" ") || driver.fullName || b.driverId)
          : b.driverId;
        const bos = ((b.orderIds as string[]) || [])
          .map(oid => {
            const o = orders.find(x => x.id === oid) as any;
            return o
              ? { id: o.id, customerName: o.customerName || "", region: o.region || "", status: o.status, deliverySequence: o.deliverySequence || 0 }
              : { id: oid, customerName: "", region: "", status: "missing", deliverySequence: 0 };
          })
          .sort((x, y) => (x.deliverySequence || 0) - (y.deliverySequence || 0));
        return { batchId: b.id, driverPhone: b.driverId, driverName, status: b.status, orderCount: bos.length, orders: bos };
      }));
      res.json({ batches });
    } catch (error: any) {
      console.error("[API] active-batches", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Remove ONE order from a batch → it returns to the pool and is re-dispatched.
  app.post("/api/admin/batches/:batchId/remove-order", async (req: Request, res: Response) => {
    const batchId = req.params.batchId as string;
    const { orderId } = req.body || {};
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "Database not configured" });
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    try {
      const batch = await getDeliveryBatch(batchId);
      if (!batch) return res.status(404).json({ error: "الدُفعة غير موجودة" });
      if (!batch.orderIds.includes(orderId)) return res.status(400).json({ error: "الطلب ليس ضمن هذه الدُفعة" });

      const remaining = batch.orderIds.filter(id => id !== orderId);
      if (remaining.length === 0) {
        await updateDeliveryBatch(batchId, { status: "cancelled" }).catch(() => {});
        const qd = driverQueue.find(d => d.currentBatchId === batchId);
        if (qd) { qd.currentBatchId = undefined; updateDriverQueueEntry(qd.phoneNumber, { hasActiveBatch: false }).catch(() => {}); }
      } else {
        await updateDeliveryBatch(batchId, { orderIds: remaining, totalOrders: remaining.length }).catch(() => {});
      }
      await releaseOrderToPool(db, orderId);
      orderEvents.emit("order:status", { orderId, status: "confirmed" });
      onOrderConfirmed(); // re-dispatch the freed order via the smart engine
      res.json({ success: true, remaining: remaining.length });
    } catch (error: any) {
      console.error("[API] remove-order", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Add an existing order to an existing batch (assign it to that batch's driver).
  app.post("/api/admin/batches/:batchId/add-order", async (req: Request, res: Response) => {
    const batchId = req.params.batchId as string;
    const { orderId } = req.body || {};
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "Database not configured" });
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    try {
      const batch = await getDeliveryBatch(batchId);
      if (!batch) return res.status(404).json({ error: "الدُفعة غير موجودة" });
      if (["completed", "cancelled"].includes(batch.status)) return res.status(400).json({ error: "الدُفعة مغلقة" });
      if (batch.orderIds.includes(orderId)) return res.status(400).json({ error: "الطلب موجود بالفعل في الدُفعة" });
      const order = await getOrderById(orderId);
      if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
      if (["delivered", "cancelled"].includes(order.status)) return res.status(400).json({ error: "لا يمكن إضافة طلب مكتمل أو ملغى" });

      const driverPhone = batch.driverId;
      const driver = await getDriverByPhone(driverPhone).catch(() => null);
      const driverName = driver ? ([driver.firstName, driver.secondName].filter(Boolean).join(" ") || driver.fullName || driverPhone) : driverPhone;
      const newOrderIds = [...batch.orderIds, orderId];
      await updateDeliveryBatch(batchId, { orderIds: newOrderIds, totalOrders: newOrderIds.length }).catch(() => {});
      const { FieldValue } = await import("firebase-admin/firestore");
      const newStatus = ["pending", "confirmed"].includes(order.status) ? "preparing" : order.status;
      await db.collection("orders").doc(orderId).update({
        driverPhone, driverName, batchId,
        status: newStatus,
        rejectedAt: FieldValue.delete(), rejectedByDriver: FieldValue.delete(), rejectedByPhone: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      }).catch(() => {});
      batchedOrderIds.add(orderId);
      driverAssignments.set(orderId, driverPhone);
      orderEvents.emit("order:status", { orderId, status: newStatus });
      notifyCustomerStatus(orderId, newStatus).catch(() => {});
      res.json({ success: true, orderCount: newOrderIds.length });
    } catch (error: any) {
      console.error("[API] add-order", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Emergency redistribute: cancel still-pending (unaccepted) batches — optionally for
  // one driver — free their orders and let the smart engine reassign them. In-progress
  // (accepted) batches are left alone so a driver mid-delivery is never disrupted.
  app.post("/api/admin/redistribute", async (req: Request, res: Response) => {
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "Database not configured" });
    const targetDriver: string | undefined = req.body?.driverPhone;
    try {
      let q = db.collection("delivery_batches").where("status", "==", "pending");
      if (targetDriver) q = q.where("driverId", "==", targetDriver) as any;
      const snap = await q.get();
      let freedOrders = 0;
      for (const doc of snap.docs) {
        const b = doc.data() as any;
        await updateDeliveryBatch(doc.id, { status: "cancelled" }).catch(() => {});
        const qd = driverQueue.find(d => d.currentBatchId === doc.id);
        if (qd) { qd.currentBatchId = undefined; updateDriverQueueEntry(qd.phoneNumber, { hasActiveBatch: false }).catch(() => {}); }
        for (const oid of (b.orderIds as string[]) || []) {
          await releaseOrderToPool(db, oid, false);
          orderEvents.emit("order:status", { orderId: oid, status: "confirmed" });
          freedOrders++;
        }
      }
      onOrderConfirmed(); // kick the smart engine to reassign the freed orders
      res.json({ success: true, batchesReleased: snap.size, freedOrders });
    } catch (error: any) {
      console.error("[API] redistribute", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Customer rates the driver after delivery (1–5). Owner-gated, one rating per order,
  // updates the driver's rating aggregate atomically. Feeds the dispatch ranking.
  app.post("/api/orders/:orderId/rate-driver", requireCustomerAuth, async (req: Request, res: Response) => {
    const orderId = req.params.orderId as string;
    const callerPhone = (req as any).customerPhone as string;
    const rating = Math.round(Number(req.body?.rating));
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و5" });
    const db = getFirestore();
    if (!db) return res.status(500).json({ error: "Database not configured" });
    try {
      const order = (await getOrderById(orderId)) as any;
      if (!order) return res.status(404).json({ error: "الطلب غير موجود" });
      if (!sameLocalPhone(order.phoneNumber || order.customerPhone, callerPhone)) return res.status(403).json({ error: "غير مصرح" });
      if (order.status !== "delivered") return res.status(400).json({ error: "يمكن التقييم بعد التسليم فقط" });
      if (order.driverRated) return res.status(409).json({ error: "تم التقييم مسبقاً" });
      const driverPhone = order.driverPhone;
      if (!driverPhone) return res.status(400).json({ error: "لا يوجد سائق لهذا الطلب" });
      // H-73: this matched the order's stored driverPhone against the driver
      // document exactly. The two are written by different paths and production
      // holds several spellings of the same number, so rating a real, delivered
      // order could answer "السائق غير موجود" and the rating was simply lost.
      const driverDoc = await findDriverDocByPhone(String(driverPhone));
      if (!driverDoc) return res.status(404).json({ error: "السائق غير موجود" });
      const driverRef = driverDoc.ref;
      const orderRef = db.collection("orders").doc(orderId);
      await db.runTransaction(async (tx) => {
        const [dSnap, oSnap] = await Promise.all([tx.get(driverRef), tx.get(orderRef)]);
        if ((oSnap.data() as any)?.driverRated) throw new Error("already_rated");
        const d = dSnap.data() as any;
        const sum = (Number(d?.ratingSum) || 0) + rating;
        const count = (Number(d?.ratingCount) || 0) + 1;
        tx.update(driverRef, { ratingSum: sum, ratingCount: count, rating: Math.round((sum / count) * 100) / 100, updatedAt: Timestamp.now() });
        tx.update(orderRef, { driverRated: true, driverRating: rating, updatedAt: Timestamp.now() });
      });
      return res.json({ success: true });
    } catch (error: any) {
      if (error?.message === "already_rated") return res.status(409).json({ error: "تم التقييم مسبقاً" });
      console.error("[API] rate-driver", error?.message);
      return res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── Address book (server-synced, owner-only) ────────────────────────────────
  app.get("/api/users/:phoneNumber/addresses", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phoneNumber as string);
    if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    try {
      const addresses = await getUserAddresses(phoneNumber);
      res.json({ addresses });
    } catch {
      res.status(500).json({ error: "تعذّر تحميل العناوين" });
    }
  });

  app.put("/api/users/:phoneNumber/addresses", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phoneNumber as string);
    if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
    const list = Array.isArray(req.body?.addresses) ? req.body.addresses : null;
    if (!list) return res.status(400).json({ error: "قائمة العناوين مطلوبة" });
    try {
      const saved = await setUserAddresses(phoneNumber, list);
      if (!saved) return res.status(404).json({ error: "المستخدم غير موجود" });
      res.json({ addresses: saved });
    } catch {
      res.status(500).json({ error: "تعذّر حفظ العناوين" });
    }
  });

  app.post("/api/users/push-token", requireCustomerAuth, async (req: Request, res: Response) => {
    const { phoneNumber, pushToken } = req.body;

    if (!phoneNumber || !pushToken) {
      return res.status(400).json({ error: "Phone number and push token are required" });
    }
    // Ownership (H2): only the authenticated user may set their own push token,
    // otherwise anyone could hijack another phone's notifications.
    if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
      return res.status(403).json({ error: "غير مصرح" });
    }

    const db = getFirestore();
    if (db) {
      // H-33: the result was discarded and the route answered success either way.
      // updateUserPushToken returns false when the write fails, so a customer whose
      // token never landed was told notifications were registered — and then simply
      // never received one, with nothing to explain it. The app can retry a 500.
      const saved = await updateUserPushToken(phoneNumber, pushToken);
      if (!saved) {
        console.error("[push-token] failed to store push token");
        return res.status(500).json({ error: GENERIC_SERVER_ERROR });
      }
      return res.json({ success: true });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  // ── Notification preferences (H-57) ───────────────────────────────────────
  // NotificationsScreen kept these four switches in AsyncStorage only. Nothing
  // carried them to the server, so a customer who turned "العروض والخصومات" off
  // stayed in the broadcast list and kept receiving promotions — while the screen
  // told them the setting was saved. These two routes give that choice somewhere
  // to live; getMarketingPushTokens() is what then honours it.
  //
  // Identity comes from the JWT only (requireCustomerAuth sets customerPhone), so
  // there is no phone number in the path or the query string and no way to read or
  // write somebody else's preferences.
  app.get("/api/users/notification-preferences", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = (req as any).customerPhone as string;
    try {
      const stored = await getUserNotificationPrefs(phoneNumber);
      // `stored: false` marks a customer who has never chosen, so the app can show
      // the defaults without claiming the server is holding a decision it isn't.
      res.json({ preferences: stored ?? DEFAULT_NOTIFICATION_PREFS, stored: stored !== null });
    } catch (error: any) {
      console.error("[notification-prefs] read failed:", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.put("/api/users/notification-preferences", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = (req as any).customerPhone as string;
    const preferences = normalizeNotificationPrefs(req.body?.preferences);
    try {
      await setUserNotificationPrefs(phoneNumber, preferences);
      // Echo what was actually stored so the app renders the server's state rather
      // than its own optimistic guess.
      res.json({ success: true, preferences });
    } catch (error: any) {
      console.error("[notification-prefs] write failed:", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
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

  // (POST /api/upload was removed here. It uploaded a profile image via the disk
  //  multer instance and had ZERO callers anywhere in the client tree — verified
  //  across client/**. The live profile-photo path is POST /api/users, which takes
  //  the Base64 data URI the app actually sends and puts it in Storage. Keeping an
  //  unused authenticated upload endpoint is pure attack surface.)


  app.get("/api/users/:phoneNumber", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    // Ownership (C3): compare normalised phones — both the JWT claim and the URL
    // param are normalised to 07XXXXXXXXX so old cached tokens still work.
    const normParam = toLocalPhone(phoneNumber);
    const normCaller = toLocalPhone((req as any).customerPhone || "");
    if (normCaller !== normParam) {
      return res.status(403).json({ error: "غير مصرح" });
    }
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
    
    const user = userProfiles.find(u => sameLocalPhone(u.phoneNumber, phoneNumber));
    if (!user) {
      return res.status(404).json({ error: "User not found", profileComplete: false });
    }
    res.json({ ...user, profileComplete: true });
  });

  app.post("/api/users", requireCustomerAuth, async (req: Request, res: Response) => {
    const { phoneNumber, fullName, gender, region, address, latitude, longitude } = req.body;
    let { profileImage } = req.body;

    if (!phoneNumber || !fullName || !gender || !region || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }
    // Ownership (C3): the profile being written must be the authenticated user's own.
    if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
      return res.status(403).json({ error: "غير مصرح" });
    }

    // The app sends the profile photo as a Base64 data URI. Storing that blob
    // inside the user document bloats every read (~33%) and pushes the doc toward
    // Firestore's 1MB limit — convert it to a durable Storage URL here,
    // transparently to the client.
    //
    // Storage is provisioned, so a failure is no longer silently swallowed into
    // "keep the Base64": that is exactly the degraded path this migration exists to
    // remove, and it left no trace that anything had gone wrong.
    if (typeof profileImage === "string" && profileImage.startsWith("data:image")) {
      const m = profileImage.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (m) {
        try {
          const buf = Buffer.from(m[2], "base64");
          const ext = (m[1].split("/")[1] || "webp").replace("jpeg", "jpg");
          profileImage = await uploadToFirebaseStorage(
            buf,
            `profile-images/${encodeURIComponent(phoneNumber)}-${Date.now()}.${ext}`,
            m[1],
          );
        } catch (storageErr: any) {
          console.error("[Storage] profile photo upload FAILED:", storageErr?.message);
          return res.status(502).json({ error: "تعذّر رفع الصورة الشخصية، حاول مجدداً" });
        }
      }
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

    const existingIndex = userProfiles.findIndex(u => sameLocalPhone(u.phoneNumber, phoneNumber));
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

  app.put("/api/users/:phoneNumber", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    // Ownership (C3): a customer may only update their OWN profile.
    if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
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
    
    const index = userProfiles.findIndex(u => sameLocalPhone(u.phoneNumber, phoneNumber));
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
  app.delete("/api/users/:phoneNumber", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phoneNumber as string);
    // Ownership: a user may only delete their OWN account. Without this, anyone could
    // delete any account by phone number (unauthenticated account destruction).
    if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
      return res.status(403).json({ error: "غير مصرح" });
    }
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

      // H-10: the account is gone but its 30-day token is not. Revoke every token
      // issued for this phone so the deleted account cannot keep reading orders,
      // addresses and support chat until the token happens to expire.
      revokeCustomerTokens(phoneNumber);

      return res.json({ success: true });
    } catch (err: any) {
      console.error("[DELETE USER]", err);
      return res.status(500).json({ error: "فشل حذف الحساب" });
    }
  });

  // OTP Auth Routes
  /**
   * Normalise any Iraqi phone variant → "07XXXXXXXXX" (11 digits, local format).
   * Accepts: 07XXXXXXXXX, 7XXXXXXXXX, 009647XXXXXXXXX, 9647XXXXXXXXX, +9647XXXXXXXXX
   */
  function toLocalPhone(raw: string): string {
    const d = String(raw || "").replace(/\D/g, ""); // digits only
    if (d.startsWith("00964")) return "0" + d.slice(5); // 009647... → 07...
    if (d.startsWith("964"))   return "0" + d.slice(3); // 9647...   → 07...
    if (d.startsWith("07"))    return d;                 // already local
    if (d.startsWith("7"))     return "0" + d;           // 7...      → 07...
    return d;
  }

  // M-23: ownership compares must use the same canonical identity on both sides.
  // Invalid/empty values never compare equal, even if both are empty strings.
  function sameLocalPhone(a: unknown, b: unknown): boolean {
    const left = toLocalPhone(String(a ?? ""));
    const right = toLocalPhone(String(b ?? ""));
    return /^07\d{9}$/.test(left) && left === right;
  }

  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    const { channel } = req.body;
    if (!req.body.phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    // Normalise any Iraqi format → 07XXXXXXXXX before validation
    const phoneNumber = toLocalPhone(String(req.body.phoneNumber));
    const IRAQ_PHONE_RE = /^07\d{9}$/;
    if (!IRAQ_PHONE_RE.test(phoneNumber)) {
      return res.status(400).json({ error: "رقم الهاتف غير صحيح — يجب أن يبدأ بـ 07 ويتكون من 11 رقماً" });
    }
    // H-75: the code is now stored in Firestore, so this can fail. A code that
    // was never persisted can never be verified — telling the user "sent" would
    // strand them on the verification screen with a code that cannot work.
    let code: string;
    try {
      code = await generateOtp(phoneNumber);
    } catch (err: any) {
      if (err?.code === "otp_rate_limited") {
        const retryAfterSeconds = Math.max(1, Number(err.retryAfterSeconds) || 1);
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          error: "تم تجاوز حد طلبات رمز التحقق لهذا الرقم، حاول لاحقاً",
          retryAfterSeconds,
        });
      }
      console.error("[OTP] could not store the code — not sending");
      return res.status(503).json({ error: "تعذّر إرسال رمز التحقق، حاول لاحقاً" });
    }

    // Development mode: no SMS is ever sent; the tester signs in with the 0000 code.
    if (isDevMode()) {
      return res.json({ success: true, delivered: false, devMode: true, message: "وضع التطوير: استخدم الرمز 0000" });
    }

    // Production mode: OTPIQ is required. Fail clearly if it is not configured.
    if (!process.env.OTP_IQ_API_KEY) {
      console.error("[OTP] OTP_IQ_API_KEY missing in production — cannot send OTP");
      return res.status(503).json({ error: "خدمة إرسال رمز التحقق غير مهيّأة. يرجى المحاولة لاحقاً." });
    }

    const result = await deliverOtp(phoneNumber, code, channel === "whatsapp" ? "whatsapp" : "sms");
    res.json({
      success: true,
      delivered: result.delivered,
      channel: result.channel,
      message: result.delivered ? "OTP sent successfully" : "تعذّر إرسال رمز التحقق، حاول مرة أخرى",
    });
  });

  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    const { code } = req.body;
    if (!req.body.phoneNumber || !code) {
      return res.status(400).json({ error: "Phone number and code are required" });
    }
    // Normalise to match the key used by generateOtp in send-otp
    const phoneNumber = toLocalPhone(String(req.body.phoneNumber));

    if (!(await verifyOtpCode(phoneNumber, code))) {
      return res.status(400).json({ error: "رمز التحقق غير صحيح أو انتهت صلاحيته" });
    }

    const customerToken = jwt.sign(
      { phoneNumber, role: "customer" },
      ROUTES_JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Detect whether this is a returning user and what role they had.
    // Priority: driver > vendor > customer (most specific first).
    // New users get null and are shown the role-selection screen.
    let existingRole: "driver" | "vendor" | "customer" | null = null;
    try {
      const [driver, vendorId, userProfile] = await Promise.all([
        getDriverByPhone(phoneNumber),
        getVendorByPhone(phoneNumber),
        getUserByPhone(phoneNumber),
      ]);
      if (driver) existingRole = "driver";
      else if (vendorId) existingRole = "vendor";
      else if (userProfile) existingRole = "customer";
    } catch { /* best-effort: if detection fails, show role selection screen */ }

    // Return the normalized phone so the client stores the canonical form
    // that matches what the JWT contains — preventing ownership-check mismatches.
    res.json({ success: true, message: "OTP verified", customerToken, phoneNumber, existingRole });
  });

  // Driver Routes

  // Issue a signed driver session token. Requires OTP proof: a valid customer JWT
  // (from /api/auth/verify-otp) whose phone matches the requested driver phone.
  // This is the driver equivalent of /api/vendor/mobile-auth and is exempt from the
  // /api/driver mount guard (see requireDriverAuth). Without this proof no driver
  // token can be minted, so /api/driver/* cannot be reached by an attacker.
  app.post("/api/driver/mobile-auth", async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body || {};
      if (!phoneNumber) return res.status(400).json({ error: "رقم الهاتف مطلوب" });

      const authHeader = req.headers.authorization || "";
      const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      let verifiedPhone: string | null = null;
      try {
        const decoded = jwt.verify(bearer, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
        if (decoded.role === "customer" && decoded.phoneNumber
            && !isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) {
          verifiedPhone = String(decoded.phoneNumber);
        }
      } catch { /* invalid/expired → verifiedPhone stays null */ }

      // A valid, phone-matching customer JWT is the ONLY way to obtain a driver
      // token. It is the proof that this caller actually passed OTP for this number.
      //
      // DO NOT add a fallback that issues a token merely because a driver record
      // exists for the phone. That was tried (to avoid lockout when the 30-day
      // customer JWT expires) and it is an account takeover: driver phone numbers
      // are visible to customers in-app and appear in order documents, so anyone
      // knowing a number could mint a driver token and read that driver's wallet,
      // go online, accept batches, see customer addresses and GPS, and mark orders
      // delivered against the real driver's ledger.
      //
      // Expiry is handled correctly on the client instead: driverAuth.ts re-exchanges
      // the stored customer JWT automatically on a 401. If that JWT has also expired,
      // re-running OTP is the intended and correct recovery.
      if (!verifiedPhone || !sameLocalPhone(verifiedPhone, String(phoneNumber))) {
        return res.status(401).json({ error: "غير مصرح — يرجى التحقق من رقم الهاتف أولاً" });
      }

      const driver = await getDriverByPhone(phoneNumber);
      if (!driver) return res.json({ driver: null, token: null }); // not registered yet
      const token = makeDriverToken(String(phoneNumber));
      return res.json({
        token,
        driver: { id: driver.id, phoneNumber: driver.phoneNumber, fullName: driver.fullName, status: driver.status },
      });
    } catch (err) {
      console.error("driver mobile-auth:", err);
      return res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // Owner-only: this used to be fully public, so anyone could enumerate phone
  // numbers and harvest each driver's full four-part name, status and timestamps
  // (PII disclosure + phone enumeration). It now requires the customer JWT and
  // only answers about the caller's OWN number.
  app.get("/api/drivers/check/:phoneNumber", requireCustomerAuth, async (req: Request, res: Response) => {
    try {
      const phoneNumber = req.params.phoneNumber as string;
      if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
        return res.status(403).json({ error: "غير مصرح" });
      }
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
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // Owner-only: registration was fully open, so anyone could create a driver record
  // for someone else's phone (identity squatting) and flood Firestore with Base64
  // ID/licence images. The caller must now prove ownership of the phone via the
  // OTP-issued customer JWT.
  app.post("/api/drivers", requireCustomerAuth, async (req: Request, res: Response) => {
    try {
      const { phoneNumber, fullName, firstName, secondName, thirdName, fourthName, motorcycleNumber, nationalIdImage, residenceCardImage, driverLicenseImage } = req.body;

      if (!phoneNumber || !fullName || !nationalIdImage) {
        return res.status(400).json({ error: "All fields are required" });
      }
      if (!sameLocalPhone((req as any).customerPhone, phoneNumber)) {
        return res.status(403).json({ error: "غير مصرح — رقم الهاتف لا يطابق حسابك" });
      }

      // Identity documents arrive from the app as Base64 data URIs
      // (DriverRegistrationScreen sends `data:${mime};base64,${asset.base64}`) and used
      // to be written into the driver document verbatim — no compression, no size
      // limit, no Storage. Three camera-resolution photos comfortably exceed
      // Firestore's 1MB document cap, so registration failed outright for exactly the
      // people with good phone cameras; and the dashboard reads the whole document,
      // so it shipped the blobs on every driver list.
      //
      // Compress and move them to Storage, keeping only the URL. If ANY document
      // fails to store, the registration is refused rather than half-recorded: a
      // driver row without a readable national ID cannot be approved anyway.
      let storedNationalId: string;
      let storedResidenceCard: string | undefined;
      let storedLicense: string | undefined;
      try {
        storedNationalId = await storeDriverDocument(nationalIdImage, phoneNumber, "national-id");
        storedResidenceCard = residenceCardImage
          ? await storeDriverDocument(residenceCardImage, phoneNumber, "residence-card")
          : undefined;
        storedLicense = driverLicenseImage
          ? await storeDriverDocument(driverLicenseImage, phoneNumber, "license")
          : undefined;
      } catch (docErr: any) {
        // H-70: a document this server refused to process is the caller's problem,
        // not an upstream failure — answering 502 for it told the driver to "try
        // again", which for an oversized photo is advice that can never work.
        // Nothing about the image itself is logged: these are identity documents.
        if (docErr instanceof DocumentImageError) {
          console.warn(`[DRIVER] document rejected (${docErr.kind}): ${docErr.rejection}`);
          return res
            .status(documentRejectionStatus(docErr.rejection))
            .json({ error: documentRejectionMessage(docErr.rejection) });
        }
        console.error("[DRIVER] document upload FAILED:", docErr?.message);
        return res.status(502).json({ error: "تعذّر رفع صور الوثائق، حاول مجدداً" });
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
        nationalIdImage: storedNationalId,
        ...(storedResidenceCard && { residenceCardImage: storedResidenceCard }),
        ...(storedLicense && { driverLicenseImage: storedLicense }),
      });

      if (!driver) {
        return res.status(500).json({ error: "Failed to create driver" });
      }

      res.json(driver);
    } catch (error: any) {
      console.error("Error creating driver:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/admin/drivers", async (_req: Request, res: Response) => {
    try {
      const drivers = await getDrivers();
      // H3: identity documents are stored as private object paths. Resolve each to a
      // short-lived signed URL so the admin client can render it; legacy base64/token
      // values pass through unchanged. Done here (behind requireAdminAuth) only.
      const formatted = await Promise.all(drivers.map(async d => ({
        ...d,
        nationalIdImage: await getSignedDriverDocUrl((d as any).nationalIdImage),
        residenceCardImage: await getSignedDriverDocUrl((d as any).residenceCardImage),
        driverLicenseImage: await getSignedDriverDocUrl((d as any).driverLicenseImage),
        createdAt: d.createdAt?.toDate?.() ? d.createdAt.toDate().toISOString() : d.createdAt,
        updatedAt: d.updatedAt?.toDate?.() ? d.updatedAt.toDate().toISOString() : d.updatedAt,
      })));
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
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/admin/drivers/:id", async (req: Request, res: Response) => {
    try {
      const driverId = req.params.id as string;
      // Capture the phone BEFORE deleting so we can evict the driver from live state.
      const dbForDriver = getFirestore();
      let phoneNumber: string | undefined;
      let deletedDriver: any = null;
      if (dbForDriver) {
        const doc = await dbForDriver.collection("drivers").doc(driverId).get();
        if (doc.exists) {
          deletedDriver = doc.data();
          phoneNumber = deletedDriver.phoneNumber;
        }
      }

      // H-72: stamp the financial record BEFORE the owner document disappears —
      // afterwards there is nothing left to read a name or a walletId from. The
      // ledger, its settlements, requests, payments and adjustments are all kept:
      // this is money that was really collected, and deleting the trail would
      // make an outstanding balance impossible to reconcile or dispute. The
      // account stays listed and settleable in the admin panel, now marked as
      // having no owner. Best-effort — a failed stamp must not block the delete.
      if (deletedDriver) {
        await markLedgerOwnerDeleted(
          "driver",
          driverWalletIdOf(deletedDriver, phoneNumber),
          { name: deletedDriver.fullName ?? null, phoneNumber: phoneNumber ?? null, ownerDocId: driverId },
        ).catch(() => false);
      }

      const success = await deleteDriverFn(driverId);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete driver" });
      }

      // Data consistency: purge the deleted driver from all in-memory and persisted
      // live state so they can never receive new batches or appear online afterwards.
      if (phoneNumber) {
        // Every eviction below matches on the last ten digits, NOT on the string.
        //
        // `phoneNumber` here comes from the driver's STORED document, which
        // production holds as "009647702891104", while the live maps are keyed by
        // the phone inside the driver's TOKEN, "07837527840". An exact-string
        // delete therefore missed every one of them: the deleted driver stayed in
        // driverQueue (so dispatch kept offering them batches), stayed in
        // driverLocations (so they stayed on the admin's live map), and kept their
        // driverAssignments entries (so a customer's tracking still resolved to
        // them). Every Iraqi variant — 0…, 7…, 964…, 00964… — shares the same
        // trailing ten digits, which is what samePhone compares.
        for (let i = driverQueue.length - 1; i >= 0; i -= 1) {
          if (samePhone(driverQueue[i].phoneNumber, phoneNumber)) driverQueue.splice(i, 1);
        }
        for (const key of [...driverLocations.keys()]) {
          if (samePhone(key, phoneNumber)) driverLocations.delete(key);
        }
        for (const [oid, drv] of driverAssignments.entries()) {
          if (samePhone(drv, phoneNumber)) driverAssignments.delete(oid);
        }
        for (const key of [...driverRejectionCooldowns.keys()]) {
          if (samePhone(key, phoneNumber)) driverRejectionCooldowns.delete(key);
        }
        // The heartbeat-scoped maps (cached name, rate limit, write throttle).
        purgeHeartbeatState(phoneNumber);
        removeDriverFromActiveQueue(phoneNumber).catch(() => {});
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting driver:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ========== DRIVER FIFO QUEUE SYSTEM ==========

  // Get driver status (online, queue position, current batch)
  app.get("/api/driver/status", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
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
            if (db2) db2.collection("delivery_batches").doc(batchDoc.id).update({ status: "completed", updatedAt: Timestamp.now() }).catch(() => {});
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

      // Run ledger and completed orders in parallel.
      // H-72: the ledger is addressed by walletId; getCompletedOrders is a
      // delivery-history lookup keyed by phone and is not a money account.
      const [ledger, completed] = await Promise.all([
        getSettlementLedger("driver", (req as any).driverWalletId as string),
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
        amountOwed: ledger?.outstandingTotal ?? 0,
        todayOrders: todayCompleted.length,
        todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
      });
    } catch (error: any) {
      console.error("Error getting driver status:", error);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Update driver GPS location
  app.post("/api/driver/location", async (req: Request, res: Response) => {
    const { phoneNumber, lat, lng } = req.body;
    if (!phoneNumber || lat === undefined || lng === undefined) return res.status(400).json({ error: "Missing fields" });
    // H-39: requireDriverAuth already loaded this driver to guard the /api/driver
    // mount, and it overrides body.phoneNumber with the token identity — so the
    // second getDriverByPhone() here re-ran the same variant-walking lookup on
    // every fallback heartbeat for a name the request already had.
    const driver = (req as any).driver as { fullName?: string } | undefined;
    driverLocations.set(phoneNumber, { lat: Number(lat), lng: Number(lng), updatedAt: Date.now(), fullName: driver?.fullName });
    // Mark driver as recently seen (active app) — in-memory AND Firestore
    const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
    if (qd) {
      qd.lastSeenAt = Date.now();
      // Sync lastSeenAt to Firestore so ghost-driver cleanup has accurate data
      updateDriverQueueEntry(phoneNumber, { lastSeenAt: Date.now() } as any).catch(() => {});
    }
    // Persist last location to Firestore driver document. H-39: the socket path
    // has always throttled this to once per 10s per driver; this one wrote on
    // every request. Sharing the same throttle map also stops a client that
    // alternates transports from writing twice as often as one that does not.
    const lastWrite = locationFirestoreThrottle.get(phoneNumber) || 0;
    if (Date.now() - lastWrite >= FIRESTORE_WRITE_INTERVAL) {
      locationFirestoreThrottle.set(phoneNumber, Date.now());
      updateDriverLastLocation(phoneNumber, Number(lat), Number(lng)).catch(() => {});
    }
    res.json({ success: true });
  });

  // Get driver location for a specific order (customer-facing)
  // Owner-gated: returns the assigned driver's live GPS and name, so only the
  // customer who placed the order may read it (was previously public to anyone
  // holding an order id).
  app.get("/api/orders/:orderId/driver-location", async (req: Request, res: Response) => {
    const orderId = req.params.orderId as string;
    // Admins legitimately track any order from the dashboard; customers may only
    // track their own.
    if (!isValidSession(req)) {
      const authHeader = req.headers.authorization || "";
      const raw = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      let callerPhone: string | null = null;
      try {
        const decoded = jwt.verify(raw, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
        if (decoded.role === "customer" && decoded.phoneNumber
            && !isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) {
          callerPhone = String(decoded.phoneNumber);
        }
      } catch { /* unauthenticated */ }
      if (!callerPhone) return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
      try {
        const order = (await getOrderById(orderId)) as any;
        const ownerPhone = order?.phoneNumber || order?.customerPhone;
        if (!order || !sameLocalPhone(ownerPhone, callerPhone)) {
          return res.status(403).json({ error: "غير مصرح" });
        }
      } catch {
        return res.status(500).json({ error: "حدث خطأ في الخادم" });
      }
    }
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
        // Block on the settlement threshold — settlementLedger is the single source of truth.
        // H-72: by walletId, so a driver is never held back by a debt that
        // belongs to whoever used this phone number before them.
        const threshold = await isOverSettlementThreshold("driver", (req as any).driverWalletId as string);
        if (threshold.thresholdEnabled && threshold.outstanding >= threshold.thresholdAmount) {
          return res.status(400).json({
            error: `المبلغ المستحق (${threshold.outstanding.toLocaleString("ar-IQ")} د.ع) يتجاوز الحد المسموح (${threshold.thresholdAmount.toLocaleString("ar-IQ")} د.ع). يرجى تسوية الحساب مع المسؤول.`,
            amountOwed: threshold.outstanding,
          });
        }
        const exists = driverQueue.find(d => d.phoneNumber === phoneNumber);
        if (!exists) {
          const joinedAt = Date.now();
          driverQueue.push({ phoneNumber, joinedAt, lastSeenAt: Date.now() });
          // Persist new queue entry to Firestore
          addDriverToActiveQueue(phoneNumber, joinedAt, pushToken?.startsWith("ExponentPushToken") ? pushToken : undefined).catch(() => {});
          // Cache the driver's rating on the queue entry (non-blocking) for the
          // dispatch tie-breaker. One read on go-online, never per dispatch decision.
          getDriverByPhone(phoneNumber).then(d => {
            const qd = driverQueue.find(x => x.phoneNumber === phoneNumber);
            if (qd && d && typeof (d as any).rating === "number") qd.rating = (d as any).rating;
          }).catch(() => {});
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Step 2: driver is now on the way (preparing → delivering)
  app.post("/api/driver/start-delivery", async (req: Request, res: Response) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    if (!(await assertOrderOwnership(res, orderId, phoneNumber))) return;

    try {
      const db = getFirestore();
      if (db) {
        // H-33: the result was discarded, so a refused transition or a failed write
        // still notified the customer "on the way" and answered success — while
        // Firestore never left the previous status. The customer watched a delivery
        // that had not started. updateOrderStatus logs the state-machine block
        // distinctly, so the server log tells the two causes apart.
        const moved = await updateOrderStatus(orderId, "in_delivery");
        if (!moved) {
          console.error(`[start-delivery] order=${orderId} not moved to in_delivery`);
          return res.status(409).json({ error: "تعذّر بدء التوصيل، حدّث الشاشة وحاول مجدداً" });
        }
        // Notify the customer their order is on the way (was previously missing here).
        notifyCustomerStatus(orderId, "in_delivery").catch(() => {});
        saveDriverActivity({ phoneNumber, type: "in_delivery", orderId }).catch(() => {});
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Report issue with an order
  app.post("/api/driver/report-issue", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, issueType } = req.body;
    if (!phoneNumber || !orderId || !issueType) return res.status(400).json({ error: "Missing fields" });
    if (!(await assertOrderOwnership(res, orderId, phoneNumber))) return;

    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "Database not configured" });

      // Update order in Firestore: status="issue" + issueType + issuedAt
      const now = Timestamp.now();
      await db.collection("orders").doc(orderId).update({
        status: "issue",
        issueType,
        issuedAt: now,
        updatedAt: now,
      });

      // Notify customer via push (single-doc read, not a full scan)
      const order = await getOrderById(orderId);
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Reject batch (legacy orderId param kept for backward compat)
  app.post("/api/driver/reject-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Missing fields" });

    // Ownership guard: batchId is caller-supplied. Without this check an
    // authenticated driver could cancel ANOTHER driver's batch by passing its id.
    if (batchId && !(await batchBelongsToDriver(batchId, phoneNumber))) {
      return res.status(403).json({ error: "غير مصرح — هذه الدفعة ليست لك" });
    }

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
        pruneDriverCooldowns(phoneNumber);
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
      onOrderConfirmed();
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
      // Atomically claim the batch (pending → in_progress) if it is still pending and
      // was offered to THIS driver. This compare-and-set is the sole authority for
      // acceptance: it can never be clobbered by the offer-timeout sweep, and a
      // double-tap or two-driver race resolves to exactly one winner.
      const claim = await claimBatchForDriver(batchId, phoneNumber);
      if (!claim.ok) {
        if (claim.reason === "not_found") return res.status(404).json({ error: "Batch not found" });
        if (claim.reason === "not_offered") return res.status(403).json({ error: "هذه الدفعة غير معروضة لك" });
        return res.status(409).json({ error: "لم تعد هذه الدفعة متاحة" });
      }
      const driver = await getDriverByPhone(phoneNumber);
      const driverName = driver?.fullName || phoneNumber;
      // Set all orders in batch to "preparing" and tag with driver info.
      // claimBatchForDriver already validated the batch state atomically,
      // so pass force:true to avoid a redundant per-order transition check.
      // H-33: every result here was discarded. A failed status write still told the
      // customer "being prepared", still linked the order to the driver in memory,
      // and still answered success — while Firestore kept the order unassigned.
      // Batch composition, order and size are untouched; only failures are handled.
      const notAccepted: string[] = [];
      for (const orderId of claim.orderIds) {
        const moved = await updateOrderStatus(orderId, "preparing", { force: true });
        if (!moved) {
          notAccepted.push(orderId);
          continue; // no customer notice, no assignment, no log for an order that did not move
        }
        notifyCustomerStatus(orderId, "preparing").catch(() => {}); // ← Fix: notify customer
        const linked = await updateOrderDriverInfo(orderId, { driverName, driverPhone: phoneNumber });
        if (!linked) {
          console.error(`[accept-batch] order=${orderId} moved but driver link failed`);
          notAccepted.push(orderId);
          continue;
        }
        driverAssignments.set(orderId, phoneNumber);
        addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "accepted" }).catch(() => {});
      }
      if (notAccepted.length > 0) {
        // Every step above is idempotent (force:true + a keyed driver link), so the
        // driver retrying the same accept replays it safely.
        console.error(
          `[accept-batch] batch=${batchId} driver-side accept incomplete for ${notAccepted.length} order(s): ${notAccepted.join(",")}`,
        );
        return res.status(500).json({ error: "تعذّر إكمال استلام الدفعة، حاول مجدداً" });
      }
      // Batch was already moved to in_progress (with startTime) inside claimBatchForDriver.
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
      if (qd) {
        qd.currentBatchId = batchId;
        updateDriverQueueEntry(phoneNumber, { hasActiveBatch: true }).catch(() => {});
      }
      saveDriverActivity({ phoneNumber, type: "accepted", orderId: batchId }).catch(() => {});
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Mark one order as picked up (preparing → delivering)
  // Driver arrived at store — notifies vendor and logs arrival
  app.post("/api/driver/batch/arrived-at-store", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    // `if (batchId && …)` made the guard skippable by simply omitting batchId, so the
    // order-level check below is the authoritative one and always runs.
    if (batchId && !(await batchBelongsToDriver(batchId, phoneNumber))) {
      return res.status(403).json({ error: "غير مصرح — هذه الدفعة ليست لك" });
    }
    if (!(await assertOrderOwnership(res, orderId, phoneNumber))) return;
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const now = Timestamp.now();
      await db.collection("orders").doc(orderId).update({
        arrivedAtStoreAt: now.toDate().toISOString(),
        updatedAt: now,
      });
      // Notify vendor (single-doc read, not a full scan)
      const order = await getOrderById(orderId);
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
    // `if (batchId && …)` made the guard skippable by simply omitting batchId, so the
    // order-level check below is the authoritative one and always runs.
    if (batchId && !(await batchBelongsToDriver(batchId, phoneNumber))) {
      return res.status(403).json({ error: "غير مصرح — هذه الدفعة ليست لك" });
    }
    if (!(await assertOrderOwnership(res, orderId, phoneNumber))) return;
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const now = Timestamp.now();
      // The return value MUST be honoured. updateOrderStatus returns false when the
      // state machine blocks the transition; ignoring it wrote pickedUpAt, pushed
      // "on the way" to the customer and returned success while the order stayed
      // put — the tracking screen then contradicted reality with no error anywhere.
      const moved = await updateOrderStatus(orderId, "in_delivery");
      if (!moved) {
        const current = (await getOrderById(orderId).catch(() => null)) as any;
        if (current?.status !== "in_delivery") {
          console.warn(`[PICKUP] order=${orderId} could not move to in_delivery (status=${current?.status ?? "?"})`);
          return res.status(409).json({ error: "تعذّر تحديث حالة الطلب — حدّث الصفحة وحاول مجدداً" });
        }
      }
      // Notify the customer their order is on the way (was previously missing here).
      notifyCustomerStatus(orderId, "in_delivery").catch(() => {});
      await db.collection("orders").doc(orderId).update({ pickedUpAt: now, updatedAt: now });
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "in_delivery", lat, lng }).catch(() => {});
      saveDriverActivity({ phoneNumber, type: "in_delivery", orderId }).catch(() => {});
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Complete one order in the batch
  app.post("/api/driver/batch/complete-order", async (req: Request, res: Response) => {
    const { phoneNumber, orderId, batchId, lat, lng } = req.body;
    if (!phoneNumber || !orderId || !batchId) return res.status(400).json({ error: "Missing fields" });
    if (!(await batchBelongsToDriver(batchId, phoneNumber))) {
      return res.status(403).json({ error: "غير مصرح — هذه الدفعة ليست لك" });
    }
    if (!(await assertOrderOwnership(res, orderId, phoneNumber))) return;
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "DB not configured" });
      const now = Timestamp.now();

      // Read the order BEFORE claiming the flag.

      //
      // getOrderById swallows every error and returns null. When the read was done
      // AFTER the claim, a transient Firestore failure left earningsCredited
      // committed while the entire money block (which sat behind `if (order)`) was
      // skipped — and the settlementPending marker lived inside that block, so the
      // recovery sweep never saw it. The money was lost permanently and any retry
      // short-circuited to alreadyCompleted. Claiming only once we can actually act
      // removes that window.
      const order = await getOrderById(orderId);
      if (!order) {
        console.error(`[COMPLETE] order=${orderId} unreadable — refusing to claim earningsCredited`);
        return res.status(503).json({ error: "تعذّر قراءة الطلب، حاول مرة أخرى" });
      }

      // IDEMPOTENCY (C4): atomically claim the one-time "earnings credited" flag on
      // the order. If it was already set, this is a replay — return success without
      // crediting again, so the legacy driverFinancialAccounts balance can't be
      // inflated by re-POSTing complete-order for the same orderId.
      const orderRef = db.collection("orders").doc(orderId);
      const firstCompletion = await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) return false;
        if ((snap.data() as any)?.earningsCredited === true) return false;
        tx.update(orderRef, { earningsCredited: true });
        return true;
      });
      if (!firstCompletion) {
        return res.json({ success: true, alreadyCompleted: true });
      }

      // Tracks the ONE non-idempotent step below (saveDriverCompletedOrder appends
      // to the driver's completed list). Everything else — the status write, the
      // settlement accruals (keyed `${orderId}__${accountType}`), the batch
      // bookkeeping — is safe to repeat. So if we fail BEFORE that step we can
      // release the claim and let a retry redo the whole thing with no risk of
      // double-crediting; releasing after it could double-append.
      let legacyCreditApplied = false;
      try {
      // earningsCredited transaction already guards double-completion; force:true
      // avoids a redundant state-machine read inside the same atomic flow.
      // H-33: the result was discarded, so a failed status write let the flow carry
      // on to credit the driver and accrue settlements for an order Firestore still
      // showed as undelivered. Throwing here lands in the recovery below, which —
      // because nothing non-idempotent has run yet — releases the claim so a retry
      // redoes the whole completion cleanly.
      const markedDelivered = await updateOrderStatus(orderId, "delivered", { force: true });
      if (!markedDelivered) throw new Error(`order ${orderId} could not be marked delivered`);
      await db.collection("orders").doc(orderId).update({ deliveredAt: now, updatedAt: now });
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "delivered", lat, lng }).catch(() => {});

      {
        const pushToken = await getUserPushToken(order.phoneNumber || "");
        if (pushToken) await sendPushNotification(pushToken, "delivered", orderId);

        // ── Settlement accrual (single source of truth) ────────────────────────
        // settlementLedger is the only financial system. Idempotent per (orderId,
        // accountType). This is the SAME shared accrual the admin "mark delivered"
        // transition uses (#14), so the two flows can never diverge.
        const { driverEarning, deductionAmount, isRestaurantOrder, driverOutstanding } =
          await accrueDeliveredOrderSettlements(db, orderId, order, phoneNumber);
        const newSettlementBalance = driverOutstanding;

        const customerProfile = await getUserByPhone(order.phoneNumber || "");
        const completedEntry = {
          orderId, deliveryFee: order.deliveryFee || 0, driverEarning, ownerEarning: deductionAmount,
          total: order.total || 0, customerName: customerProfile?.fullName || "زبون",
          completedAt: now.toDate().toISOString(), isRestaurant: isRestaurantOrder,
        };
        // ── The one non-idempotent step. Past this point the claim must NOT be
        //    released, or a retry would append this entry a second time. ──────────
        await saveDriverCompletedOrder(phoneNumber, completedEntry);
        legacyCreditApplied = true;
        saveDriverActivity({ phoneNumber, type: "completed", orderId, customerName: completedEntry.customerName, driverEarning, total: completedEntry.total }).catch(() => {});
        driverAssignments.delete(orderId);
        batchedOrderIds.delete(orderId);

        // Check if all orders in batch are delivered
        const batchDoc = await getDeliveryBatch(batchId);
        if (batchDoc) {
          // Only the batch's own orders are needed — fetch them by id in
          // parallel instead of scanning the whole orders collection.
          const freshOrders = await getOrdersByIds(batchDoc.orderIds);
          const allDelivered = batchDoc.orderIds.every(oid => {
            const o = freshOrders.find(x => x.id === oid);
            return o?.status === "delivered" || o?.status === "issue" || o?.status === "cancelled";
          });
          const completedCount = batchDoc.orderIds.filter(oid => {
            const o = freshOrders.find(x => x.id === oid);
            return o?.status === "delivered" || o?.status === "issue" || o?.status === "cancelled";
          }).length;
          if (allDelivered) {
            // Sum total earnings from all delivered orders in batch.
            // Prefer the per-order stored driverEarning (set at completion time via the
            // configurable payout rule) so the batch summary stays consistent with what
            // was actually paid. Fall back to the legacy hardcoded values only for orders
            // that predate the configurable rule (no driverEarning field).
            const batchEarnings = batchDoc.orderIds.reduce((sum, oid) => {
              const o = freshOrders.find(x => x.id === oid);
              if (!o) return sum;
              if ((o as any).driverEarning !== undefined) return sum + ((o as any).driverEarning || 0);
              const isRest = (o as any).orderType === "restaurant" || !!(o as any).vendorId;
              return sum + (isRest ? 750 : 2000);
            }, 0);
            await updateDeliveryBatch(batchId, {
              status: "completed",
              completedOrders: completedCount,
              totalEarnings: batchEarnings,
              endTime: now.toDate().toISOString(),
            });
            const qd = driverQueue.find(d => d.phoneNumber === phoneNumber);
            if (qd) qd.currentBatchId = undefined;
            // Check settlementLedger outstanding balance before assigning next batch.
            // Block the driver only once debt exceeds the configured threshold.
            // H-72: by walletId — see the toggle-online gate.
            const settlementThreshold = await isOverSettlementThreshold("driver", (req as any).driverWalletId as string);
            const exceedsThreshold = settlementThreshold.thresholdEnabled &&
              newSettlementBalance >= settlementThreshold.thresholdAmount;
            if (!exceedsThreshold) {
              // Debt within allowed range — move to end of queue (joinedAt reset) and mark available
              updateDriverQueueEntry(phoneNumber, { hasActiveBatch: false, joinedAt: Date.now() }).catch(() => {});
              assignWaitingBatchToDriver(phoneNumber).catch(() => {});
            } else {
              // Debt threshold exceeded — remove from queue entirely until settled
              const queueIdx = driverQueue.findIndex(d => d.phoneNumber === phoneNumber);
              if (queueIdx !== -1) driverQueue.splice(queueIdx, 1);
              removeDriverFromActiveQueue(phoneNumber).catch(() => {});
            }
          } else {
            // Accumulate partial earnings (prefer stored driverEarning, fallback to legacy)
            const partialEarnings = batchDoc.orderIds.reduce((sum, oid) => {
              const o = freshOrders.find(x => x.id === oid);
              if (!o || o.status !== "delivered") return sum;
              if ((o as any).driverEarning !== undefined) return sum + ((o as any).driverEarning || 0);
              const isRest = (o as any).orderType === "restaurant" || !!(o as any).vendorId;
              return sum + (isRest ? 750 : 2000);
            }, 0);
            await updateDeliveryBatch(batchId, { completedOrders: completedCount, totalEarnings: partialEarnings });
          }
        }
      }
      } catch (completionErr: any) {
        // The claim is already committed. Without this, any throw here stranded the
        // order forever: it stayed un-delivered, the driver was never credited, the
        // batch never closed (blocking them from new batches), and every retry
        // short-circuited to alreadyCompleted.
        if (!legacyCreditApplied) {
          // Nothing non-idempotent ran yet — release the claim so a retry can redo
          // the whole completion. Settlement accruals that did land are keyed by
          // `${orderId}__${accountType}`, so replaying them is a no-op.
          await orderRef.update({ earningsCredited: false }).catch((relErr: any) =>
            console.error(
              `[COMPLETE] CRITICAL order=${orderId} failed AND the claim could not be released — ` +
                `manual intervention required. error=${completionErr?.message} releaseError=${relErr?.message}`,
            ),
          );
          console.error(
            `[COMPLETE] order=${orderId} failed before the legacy credit; claim released for retry. ` +
              `error=${completionErr?.message}`,
          );
        } else {
          // The non-idempotent step already ran, so the claim must stay. Flag the
          // order instead so the settlement recovery sweep can finish the job.
          await orderRef
            .update({ settlementPending: true, settlementLastError: new Date().toISOString() })
            .catch(() => {});
          console.error(
            `[COMPLETE] order=${orderId} failed AFTER the legacy credit; claim kept, ` +
              `order flagged for recovery. error=${completionErr?.message}`,
          );
        }
        throw completionErr;
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Get driver earnings
  app.get("/api/driver/earnings", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Driver performance metrics. The driver identity comes from requireDriverAuth;
  // query/body phone numbers are never used as authority here.
  app.get("/api/driver/performance", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      const driver = (req as any).driver as { fullName?: string; rating?: number | null; ratingCount?: number } | undefined;
      const [activities, completedOrders, orders, deliveryLogs] = await Promise.all([
        getDriverActivityLog(phoneNumber, 500),
        getCompletedOrders(phoneNumber),
        getDriverPerformanceOrders(phoneNumber),
        getDriverDeliveryLogs(phoneNumber),
      ]);
      return res.json(buildDriverPerformance({
        activities,
        completedOrders,
        orders,
        deliveryLogs,
        driver,
      }));
    } catch (error: any) {
      console.error("[API] GET /api/driver/performance", error?.message);
      return res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Get driver orders history
  app.get("/api/driver/orders", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });

    try {
      const completed = await getCompletedOrders(phoneNumber);
      const db = getFirestore();
      const result: any[] = [];

      if (db) {
        // Get currently delivering orders (few ids from memory — fetch only those)
        const deliveringOrderIds = Array.from(driverAssignments.entries())
          .filter(([_, driverPhone]) => driverPhone === phoneNumber)
          .map(([orderId]) => orderId);
        const allOrders = await getOrdersByIds(deliveringOrderIds);

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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Driver Wallet Routes
  app.get("/api/driver/wallet", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      // H-72: every one of these is money, so all three take the walletId.
      const walletId = (req as any).driverWalletId as string;
      const [ledger, payments, history] = await Promise.all([
        getSettlementLedger("driver", walletId),
        getSettlementPayments("driver", walletId, 50),
        getSettlementHistory("driver", walletId, 50),
      ]);
      // Return in a shape compatible with the legacy wallet response
      const account = {
        phoneNumber,
        totalEarnings: ledger?.totalCommission ?? 0,
        totalOnwayCommission: (ledger?.totalGross ?? 0) - (ledger?.totalCommission ?? 0),
        totalPaid: ledger?.totalSettled ?? 0,
        amountOwed: ledger?.outstandingTotal ?? 0,
        lastPaymentAmount: ledger?.lastSettlementAmount ?? 0,
        lastPaymentDate: ledger?.lastSettlementAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: ledger?.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      };
      // Combine settlement records (per-order) and payments as transactions
      const transactions = [
        ...history.settlements.map((s: any) => ({
          id: s.id, type: "earning", orderId: s.orderId,
          driverEarning: s.commission ?? 0,
          onwayCommission: s.outstandingAmount ?? 0,
          timestamp: s.createdAt?.toDate?.()?.toISOString?.() ?? s.createdAt,
        })),
        ...payments.map((p: any) => ({
          id: p.id, type: "payment", amount: p.amount,
          notes: p.notes, method: p.method, adminName: p.adminName,
          timestamp: p.createdAt?.toDate?.()?.toISOString?.() ?? p.createdAt,
        })),
      ].sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
       .slice(0, 50);
      res.json({ account, transactions });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── Settlement (generic engine) — driver read + request ─────────────────────
  app.get("/api/driver/settlement", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      res.json(await getAccountSettlementView("driver", (req as any).driverWalletId as string));
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.get("/api/driver/settlement/history", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      res.json(await getSettlementHistory("driver", (req as any).driverWalletId as string));
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Bank-style statement (ledger movements + running balance) for the driver.
  app.get("/api/driver/statement", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      res.json(await getAccountStatement("driver", (req as any).driverWalletId as string));
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.post("/api/driver/settlement/request", async (req: Request, res: Response) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const driver = await getDriverByPhone(phoneNumber).catch(() => null);
      const name = driver?.fullName || phoneNumber;
      // H-72: the request is filed against the wallet account, so it lands in the
      // same accountKey bucket as the accruals it is asking to settle.
      const walletId = (req as any).driverWalletId as string;
      const result = await createSettlementRequest("driver", walletId, name);
      if (!result.ok) {
        if (result.reason === "already_requested")
          return res.status(409).json({ error: "لديك طلب تسوية قيد المراجعة بالفعل" });
        return res.status(400).json({ error: "لا توجد مبالغ مستحقة للتسوية" });
      }
      // Real-time to admin panel + push (reuses the orderEvents → socket forwarder).
      orderEvents.emit("settlement:request", {
        requestId: result.requestId, accountType: "driver", accountId: walletId,
        accountName: name, outstanding: result.outstanding, pendingOrderCount: result.pendingOrderCount,
      });
      const adminToken = await getAdminPushToken().catch(() => null);
      if (adminToken) sendAdminSettlementRequestNotification(adminToken, "driver", name, result.outstanding ?? 0).catch(() => {});
      res.json({ success: true, requestId: result.requestId });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── Settlement — admin request inbox ────────────────────────────────────────
  app.get("/api/admin/settlement-requests", async (req: Request, res: Response) => {
    const status = (req.query.status as string) || "pending";
    const accountType = req.query.accountType as ("driver" | "vendor" | undefined);
    try {
      res.json({ requests: await listSettlementRequests(status, accountType) });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Auto-registry of every store owner (vendor) with order activity per period.
  // Vendors appear automatically — it reads the live vendor list, so anyone who
  // registers is listed with no manual step. Feeds "سجل أصحاب المتاجر" in the
  // settlements section (today / week / month orders + this-month delivered sales +
  // outstanding). Orders are read only from the last 30 days (bounded query).
  app.get("/api/admin/vendor-registry", async (_req: Request, res: Response) => {
    const db = getFirestore();
    if (!db) return res.json({ vendors: [] });
    try {
      const [vendors, accounts] = await Promise.all([
        getVendorList(),
        listSettlementAccounts("vendor").catch(() => [] as any[]),
      ]);
      const outMap = new Map<string, number>((accounts as any[]).map((a) => [String(a.accountId), Number(a.outstanding) || 0]));
      const nowMs = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(nowMs - 7 * dayMs);
      const monthStart = new Date(nowMs - 30 * dayMs);
      const snap = await db.collection("orders").where("createdAt", ">=", monthStart).get();
      const stats = new Map<string, { oToday: number; oWeek: number; oMonth: number; sMonth: number }>();
      snap.docs.forEach((doc) => {
        const o = doc.data() as any;
        const vId = o.vendorId;
        if (!vId) return;
        const created = o.createdAt?.toDate?.() ? o.createdAt.toDate() : null;
        if (!created) return;
        let s = stats.get(vId);
        if (!s) { s = { oToday: 0, oWeek: 0, oMonth: 0, sMonth: 0 }; stats.set(vId, s); }
        s.oMonth++;
        if (created >= weekStart) s.oWeek++;
        if (created >= todayStart) s.oToday++;
        if (o.status === "delivered") s.sMonth += Number(o.restaurantSubtotal ?? o.total ?? 0) || 0;
      });
      const list = (vendors as any[]).map((v) => {
        const s = stats.get(v.id) || { oToday: 0, oWeek: 0, oMonth: 0, sMonth: 0 };
        return {
          id: v.id,
          name: v.name || v.storeName || "—",
          businessType: v.businessType || v.categoryType || "",
          phone: v.whatsappNumber || v.phoneNumber || "",
          ordersToday: s.oToday, ordersWeek: s.oWeek, ordersMonth: s.oMonth,
          salesMonth: s.sMonth,
          outstanding: outMap.get(String(v.id)) || 0,
        };
      });
      res.json({ vendors: list });
    } catch (error: any) {
      console.error("[API] vendor-registry", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Per-vendor settlement history for the Excel export: reference, amount, request date,
  // approval date, status — one row per settlement request the vendor ever raised.
  app.get("/api/admin/vendors/:id/settlement-history", async (req: Request, res: Response) => {
    const db = getFirestore();
    if (!db) return res.json({ history: [] });
    const id = req.params.id as string;
    try {
      // Single-field query on the denormalized accountKey — no composite index needed.
      const snap = await db.collection("settlementRequests").where("accountKey", "==", `vendor:${id}`).get();
      const history = snap.docs.map((d) => {
        const r = d.data() as any;
        return {
          reference: r.reference || d.id,
          amount: Number(r.outstandingSnapshot) || 0,
          requestedAt: r.createdAt?.toDate?.() ? r.createdAt.toDate().toISOString() : null,
          approvedAt: r.approvedAt?.toDate?.() ? r.approvedAt.toDate().toISOString() : null,
          status: r.status || "",
        };
      }).sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));
      res.json({ history });
    } catch (error: any) {
      console.error("[API] settlement-history", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Bank-style ledger statement for any account (admin view).
  app.get("/api/admin/ledger-statement", async (req: Request, res: Response) => {
    const accountType = (req.query.accountType as "driver" | "vendor" | "platform") || "driver";
    const accountId = req.query.accountId as string;
    if (!accountId) return res.status(400).json({ error: "accountId required" });
    try {
      res.json(await getAccountStatement(accountType, accountId));
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Consolidated financial dashboard totals: what the platform is owed, what it
  // owes, its recorded revenue, and settlement-request counts.
  app.get("/api/admin/financial-summary", async (req: Request, res: Response) => {
    try {
      const [vendors, drivers, pending, approved, completed, platformNet] = await Promise.all([
        listSettlementAccounts("vendor"),
        listSettlementAccounts("driver"),
        listSettlementRequests("pending"),
        listSettlementRequests("approved"),
        listSettlementRequests("completed"),
        getLedgerBalance("platform", "onway"),
      ]);
      const sumOutstanding = (arr: any[]) => arr.reduce((s, a) => s + (a.outstanding || 0), 0);
      res.json({
        vendorReceivables: sumOutstanding(vendors),  // OnWay owes vendors (payout)
        driverCashOwed: sumOutstanding(drivers),      // drivers owe OnWay (collect)
        platformNet,                                  // recorded platform revenue (ledger)
        vendorAccounts: vendors.length,
        driverAccounts: drivers.length,
        pendingRequests: pending.length,
        approvedRequests: approved.length,
        completedRequests: completed.length,
      });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Immutable admin audit log with identity/resource/date filters and pagination.
  app.get("/api/admin/audit-log", async (req: Request, res: Response) => {
    const filter = {
      targetType: req.query.targetType as string | undefined,
      targetId: req.query.targetId as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      resourceId: req.query.resourceId as string | undefined,
      actorId: req.query.actorId as string | undefined,
      actorUsername: req.query.actorUsername as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    };
    const page = Math.max(1, Math.min(100, Number(req.query.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 50));
    try {
      const all = await listAuditLog(filter, Math.min(1000, page * pageSize + 1));
      const start = (page - 1) * pageSize;
      res.json({ entries: all.slice(start, start + pageSize), page, pageSize, hasMore: all.length > start + pageSize });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Per-account cards for the settlement dashboard (driver or vendor).
  app.get("/api/admin/settlement-accounts", async (req: Request, res: Response) => {
    const accountType = (req.query.accountType as "driver" | "vendor") || "driver";
    try {
      res.json({ accounts: await listSettlementAccounts(accountType) });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Full account view (ledger + active request + history + payments) for the detail sheet.
  app.get("/api/admin/settlement-account", async (req: Request, res: Response) => {
    const accountType = (req.query.accountType as "driver" | "vendor") || "driver";
    const accountId = req.query.accountId as string;
    if (!accountId) return res.status(400).json({ error: "accountId required" });
    try {
      const [view, history, payments] = await Promise.all([
        getAccountSettlementView(accountType, accountId),
        getSettlementHistory(accountType, accountId),
        getSettlementPayments(accountType, accountId),
      ]);
      res.json({ view, history, payments });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Approve / reject a settlement request (lifecycle: pending → approved → paid → completed / rejected).
  app.post("/api/admin/settlements/approve", async (req: Request, res: Response) => {
    const { requestId } = req.body;
    // H-14: the financial audit trail must name the admin from the SIGNED SESSION.
    // Taking it from the body let anyone with panel access file a large payment
    // under a colleague's name, with no independent record to contradict it.
    const actor = adminIdentityFromRequest(req);
    const adminName = actor?.username || getSessionUsername(req) || "admin";
    if (!requestId) return res.status(400).json({ error: "requestId required" });
    try {
      const result = await transitionSettlementRequest(String(requestId), "approve", adminName, undefined, actor || undefined);
      if (!result.ok) {
        if (result.reason === "invalid_transition")
          return res.status(409).json({ error: `لا يمكن اعتماد طلب حالته: ${result.status}` });
        if (result.reason === "not_found") return res.status(404).json({ error: "الطلب غير موجود" });
        console.error(`[API] ${req.method} ${req.path} settlement transition failed reason=${result.reason}`);
        return res.status(500).json({ error: GENERIC_SERVER_ERROR });
      }
      orderEvents.emit("settlement:updated", { requestId, status: "approved" });
      res.json({ success: true, status: result.status });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.post("/api/admin/settlements/reject", async (req: Request, res: Response) => {
    const { requestId, reason } = req.body;
    // H-14: the financial audit trail must name the admin from the SIGNED SESSION.
    // Taking it from the body let anyone with panel access file a large payment
    // under a colleague's name, with no independent record to contradict it.
    const actor = adminIdentityFromRequest(req);
    const adminName = actor?.username || getSessionUsername(req) || "admin";
    if (!requestId) return res.status(400).json({ error: "requestId required" });
    try {
      const result = await transitionSettlementRequest(String(requestId), "reject", adminName, reason, actor || undefined);
      if (!result.ok) {
        if (result.reason === "invalid_transition")
          return res.status(409).json({ error: `لا يمكن رفض طلب حالته: ${result.status}` });
        if (result.reason === "not_found") return res.status(404).json({ error: "الطلب غير موجود" });
        console.error(`[API] ${req.method} ${req.path} settlement transition failed reason=${result.reason}`);
        return res.status(500).json({ error: GENERIC_SERVER_ERROR });
      }
      orderEvents.emit("settlement:updated", { requestId, status: "rejected" });
      res.json({ success: true, status: result.status });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Complete a settlement (full or partial; from a request or manual).
  app.post("/api/admin/settlements/complete", async (req: Request, res: Response) => {
    const { accountType, accountId, amount, method, notes, requestId, idempotencyKey } = req.body;
    // H-14: the financial audit trail must name the admin from the SIGNED SESSION.
    // Taking it from the body let anyone with panel access file a large payment
    // under a colleague's name, with no independent record to contradict it.
    const actor = adminIdentityFromRequest(req);
    const adminName = actor?.username || getSessionUsername(req) || "admin";
    if (!accountType || !accountId || amount === undefined) {
      return res.status(400).json({ error: "accountType, accountId, amount required" });
    }
    if (accountType !== "driver" && accountType !== "vendor") {
      return res.status(400).json({ error: "accountType must be driver or vendor" });
    }
    try {
      // requestId already makes request-driven settlements idempotent on its own;
      // idempotencyKey lets a manual payment opt in the same way.
      const result = await completeSettlement({
        accountType, accountId, amount: Number(amount), adminName, adminActor: actor || undefined, method, notes, requestId,
        idempotencyKey: typeof idempotencyKey === "string" ? idempotencyKey : undefined,
      });
      if (!result.ok) {
        const msg = result.reason === "nothing_due" ? "لا توجد مبالغ مستحقة"
          : result.reason === "invalid_amount" ? "قيمة غير صحيحة"
          : "تعذّر إتمام التسوية";
        return res.status(400).json({ error: msg });
      }
      // Real-time: driver/vendor status bars + admin inbox refresh after completion.
      orderEvents.emit("settlement:changed", { accountType, accountId, applied: result.applied });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Threshold configuration (per account type).
  app.get("/api/admin/settlement-config", async (_req: Request, res: Response) => {
    try {
      res.json(await getSettlementConfig());
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.put("/api/admin/settlement-config", async (req: Request, res: Response) => {
    const { accountType, thresholdEnabled, thresholdAmount } = req.body;
    if (accountType !== "driver" && accountType !== "vendor") {
      return res.status(400).json({ error: "accountType must be driver or vendor" });
    }
    try {
      res.json(await updateSettlementConfig(accountType, !!thresholdEnabled, Number(thresholdAmount) || 0));
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // CSV export of the settlement accounts overview (opens in Excel).
  app.get("/api/admin/settlement-export", async (req: Request, res: Response) => {
    const accountType = (req.query.accountType as "driver" | "vendor") || "driver";
    try {
      const accounts = await listSettlementAccounts(accountType);
      const header = "AccountId,Name,Orders,Outstanding,TotalSettled,Status,LastSettlement";
      const rows = accounts.map((a) => {
        const last = a.lastSettlementAt?.toDate?.() ? a.lastSettlementAt.toDate().toISOString().slice(0, 10) : "";
        // H-15: every text cell goes through csvCell — the name was the only one being
        // escaped, and even that only handled quotes, not formula triggers.
        return [
          csvCell(a.accountId),
          csvCell(a.accountName),
          csvNumber(a.totalOrders),
          csvNumber(a.outstanding),
          csvNumber(a.totalSettled),
          csvCell(a.status),
          csvCell(last),
        ].join(",");
      });
      const csv = "﻿" + [header, ...rows].join("\n"); // BOM for Excel Arabic
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="settlements-${accountType}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Legacy recharge endpoint kept for backward compat — records as settlement payment
  app.post("/api/admin/driver-wallet/recharge", async (req: Request, res: Response) => {
    const { phoneNumber, amount, notes } = req.body;
    // H-14: the financial audit trail must name the admin from the SIGNED SESSION.
    // Taking it from the body let anyone with panel access file a large payment
    // under a colleague's name, with no independent record to contradict it.
    const actor = adminIdentityFromRequest(req);
    const adminName = actor?.username || getSessionUsername(req) || "admin";
    if (!phoneNumber || amount === undefined) return res.status(400).json({ error: "Missing fields" });
    try {
      // H-72: the panel sends a phone; the money lives under a walletId. Passing an
      // account id straight through also works, which is how a deleted driver's
      // outstanding balance can still be settled from the accounts list.
      const accountId = await resolveDriverAccountId(String(phoneNumber), getDriverByPhone);
      const result = await completeSettlement({
        accountType: "driver", accountId, amount: Number(amount),
        notes: notes || "دفعة من الإدارة", method: "cash", adminName, adminActor: actor || undefined,
      });
      if (!result.ok) return res.status(400).json({ error: result.reason || "لا توجد مبالغ مستحقة" });
      res.json({ success: true, outstandingAfter: result.outstandingAfter, paymentId: result.paymentId });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Explicit payment endpoint — records a cash collection from driver against outstanding balance
  app.post("/api/admin/driver-wallet/payment", async (req: Request, res: Response) => {
    const { phoneNumber, amount, notes, paymentMethod } = req.body;
    // H-14: the financial audit trail must name the admin from the SIGNED SESSION.
    // Taking it from the body let anyone with panel access file a large payment
    // under a colleague's name, with no independent record to contradict it.
    const actor = adminIdentityFromRequest(req);
    const adminName = actor?.username || getSessionUsername(req) || "admin";
    if (!phoneNumber || amount === undefined) return res.status(400).json({ error: "Missing fields" });
    try {
      // H-72: see the recharge endpoint — resolve the phone to the wallet account.
      const accountId = await resolveDriverAccountId(String(phoneNumber), getDriverByPhone);
      const result = await completeSettlement({
        accountType: "driver", accountId, amount: Number(amount),
        notes: notes || "", method: paymentMethod || "cash", adminName, adminActor: actor || undefined,
      });
      if (!result.ok) return res.status(400).json({ error: result.reason || "لا توجد مبالغ مستحقة" });
      res.json({ success: true, outstandingAfter: result.outstandingAfter, receiptNumber: result.receiptNumber, paymentId: result.paymentId });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Adjustment endpoint (add/deduct from outstandingTotal in settlementLedger)
  app.post("/api/admin/driver-wallet/adjustment", async (req: Request, res: Response) => {
    const { phoneNumber, amount, type, notes } = req.body;
    if (!phoneNumber || amount === undefined || !type) return res.status(400).json({ error: "Missing fields" });
    if (type !== "add" && type !== "deduct") return res.status(400).json({ error: "type must be add or deduct" });
    // H-07: an adjustment moves money, so the audit record must name who moved it.
    // `adminName` used to come from req.body — and the admin panel never sent it at
    // all, so every manual adjustment was filed against "". The signed session is
    // the only trustworthy source; the body value is now ignored entirely.
    const actor = adminIdentityFromRequest(req);
    const adminName = actor?.username || getSessionUsername(req) || "admin";
    // H-07: `Number("abc")` reached Math.abs(Math.round(NaN)) === NaN, and NaN <= 0
    // is false — so the guard inside adminAdjustLedger let it through and wrote
    // `outstandingTotal: NaN`, destroying the very balance this audit trail records.
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: "المبلغ غير صالح" });
    }
    try {
      // H-72: adjustments are ledger writes, so they resolve to the wallet account too.
      const accountId = await resolveDriverAccountId(String(phoneNumber), getDriverByPhone);
      const result = await adminAdjustLedger("driver", accountId, amountNum, type as "add" | "deduct", notes || "", adminName, undefined, actor || undefined);
      if (!result.ok) return res.status(400).json({ error: result.reason || "فشل التعديل" });
      res.json({ success: true, outstandingBefore: result.outstandingBefore, outstandingAfter: result.outstandingAfter });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Yearly chart — last 12 months breakdown for a single driver (from settlementLedger)
  app.get("/api/admin/driver-financial/:phone/yearly-chart", async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phone as string);
    try {
      // completedOrders has driverEarning and ownerEarning (OnWay's commission per order)
      // settlementPayments has the admin-recorded payments
      // H-72: payments come from the wallet account; completedOrders is delivery
      // history keyed by phone and is not a money account.
      const accountId = await resolveDriverAccountId(phoneNumber, getDriverByPhone);
      const [payments, completed] = await Promise.all([
        getSettlementPayments("driver", accountId, 2000),
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
        const monthPayments = payments.filter((p: any) => {
          const ts = p.createdAt?.toMillis?.() ?? (p.createdAt ? new Date(p.createdAt).getTime() : 0);
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
          // ownerEarning = OnWay's commission per order (what driver owes per order)
          commission: monthOrders.reduce((s: number, o: any) => s + (o.ownerEarning || 0), 0),
          payments:   monthPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0),
          orders:     monthOrders.length,
        });
      }
      res.json({ months });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Full financial statement for a single driver (admin) — reads from settlementLedger
  app.get("/api/admin/driver-financial/:phone/statement", async (req: Request, res: Response) => {
    const phoneNumber = decodeURIComponent(req.params.phone as string);
    try {
      // H-72: the driver document is fetched first because it carries the walletId
      // the three financial reads are addressed by. A deleted driver resolves to
      // the id the caller passed, so the accounts list can still open their
      // statement and the balance stays auditable after the owner is gone.
      const driver = await getDriverByPhone(phoneNumber).catch(() => null);
      const accountId = driver
        ? driverWalletIdOf(driver, phoneNumber)
        : await resolveDriverAccountId(phoneNumber, async () => null);
      const [ledger, history, payments] = await Promise.all([
        getSettlementLedger("driver", accountId),
        getSettlementHistory("driver", accountId, 200),
        getSettlementPayments("driver", accountId, 200),
      ]);
      // Map ledger to a shape compatible with legacy account format
      const account = {
        phoneNumber,
        totalEarnings: ledger?.totalCommission ?? 0,
        totalOnwayCommission: (ledger?.totalGross ?? 0) - (ledger?.totalCommission ?? 0),
        totalPaid: ledger?.totalSettled ?? 0,
        amountOwed: ledger?.outstandingTotal ?? 0,
        lastPaymentAmount: ledger?.lastSettlementAmount ?? 0,
        lastPaymentDate: ledger?.lastSettlementAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: ledger?.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      };
      const transactions = [
        ...history.settlements.map((s: any) => ({
          id: s.id, type: "earning", orderId: s.orderId,
          driverEarning: s.commission ?? 0,
          onwayCommission: s.outstandingAmount ?? 0,
          timestamp: s.createdAt?.toDate?.()?.toISOString?.() ?? s.createdAt,
        })),
        ...payments.map((p: any) => ({
          id: p.id, type: "payment", amount: p.amount,
          notes: p.notes, method: p.method, adminName: p.adminName,
          timestamp: p.createdAt?.toDate?.()?.toISOString?.() ?? p.createdAt,
        })),
      ].sort((a: any, b: any) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      res.json({ driver: { fullName: driver?.fullName || "", phoneNumber }, account, transactions });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // All driver financial accounts (admin overview) — reads from settlementLedger
  app.get("/api/admin/driver-financial", async (_req: Request, res: Response) => {
    try {
      const drivers = await getDrivers();
      const accounts = await Promise.all(
        drivers.filter(d => d.status === "approved").map(async d => {
          // H-72: the driver document is already in hand, so the walletId costs
          // nothing to read here.
          const [ledger, completed] = await Promise.all([
            getSettlementLedger("driver", driverWalletIdOf(d, d.phoneNumber)),
            getCompletedOrders(d.phoneNumber),
          ]);
          const now = new Date();
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const todayList = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
          const monthList = completed.filter(o => new Date(o.completedAt).getTime() >= monthStart);
          const account = {
            phoneNumber: d.phoneNumber,
            totalEarnings: ledger?.totalCommission ?? 0,
            totalOnwayCommission: (ledger?.totalGross ?? 0) - (ledger?.totalCommission ?? 0),
            totalPaid: ledger?.totalSettled ?? 0,
            amountOwed: ledger?.outstandingTotal ?? 0,
            lastPaymentAmount: ledger?.lastSettlementAmount ?? 0,
            lastPaymentDate: ledger?.lastSettlementAt?.toDate?.()?.toISOString?.() ?? null,
            updatedAt: ledger?.updatedAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
          };
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
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Get driver profile
  app.get("/api/driver/profile", async (req: Request, res: Response) => {
    const phoneNumber = (req as any).driverPhone as string;
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Find the best available driver: prefer one with recent GPS (app is open)
  // Smart driver ranking (dispatch A2). Busy drivers are excluded (batch merging is
  // handled separately in assignWaitingBatchToDriver). Among free, recently-active
  // drivers the winner is scored by:
  //   1. proximity — distance from the driver's live GPS to the anchor order's delivery
  //      area (store coordinates don't exist yet; the delivery point is the best signal
  //      we have and a driver already in that area picks up + delivers faster), then
  //   2. fairness — when no meaningful distance gap (or no GPS/anchor), the driver idle
  //      the longest wins, so work rotates evenly instead of always hitting driver #1.
  function findBestAvailableDriver(anchor?: { latitude?: number; longitude?: number } | null): QueuedDriver | undefined {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const active = driverQueue.filter(d => {
      if (d.currentBatchId) return false;
      const loc = driverLocations.get(d.phoneNumber);
      const recentGps = loc && loc.updatedAt >= fiveMinAgo;
      const recentSeen = d.lastSeenAt && d.lastSeenAt >= fiveMinAgo;
      return recentGps || recentSeen;
    });
    const pool = active.length > 0 ? active : driverQueue.filter(d => !d.currentBatchId);
    if (pool.length <= 1) return pool[0];

    const aLat = anchor?.latitude;
    const aLng = anchor?.longitude;
    const hasAnchor = typeof aLat === "number" && typeof aLng === "number";
    const nowMs = Date.now();

    return pool
      .map(d => {
        const loc = driverLocations.get(d.phoneNumber);
        const dist = hasAnchor && loc ? calculateDistance(loc.lat, loc.lng, aLat as number, aLng as number) : Number.POSITIVE_INFINITY;
        const idleMs = nowMs - (d.joinedAt || 0);
        return { d, dist, idleMs };
      })
      .sort((x, y) => {
        // Closer wins only when the gap is meaningful (>300 m); otherwise reward the
        // driver who has waited longest (fair rotation / "last order received").
        if (Number.isFinite(x.dist) || Number.isFinite(y.dist)) {
          if (Math.abs(x.dist - y.dist) > 0.3) return x.dist - y.dist;
        }
        // Fairness dominates; but when two drivers are about equally idle (within 30s —
        // the common case in a small area where everyone is close), the higher-rated
        // driver wins the tie. Rating never overrides a clearly longer wait.
        if (Math.abs(x.idleMs - y.idleMs) > 30000) return y.idleMs - x.idleMs;
        const xr = x.d.rating ?? 0, yr = y.d.rating ?? 0;
        if (xr !== yr) return yr - xr;
        return y.idleMs - x.idleMs;
      })[0]?.d;
  }

  // Create a batch for a specific driver with waiting confirmed orders
  // ─── Distance / Route Utilities ──────────────────────────────────────────
  // Radius under which two orders are treated as one combinable trip. The app serves
  // one small district, so a generous 3 km keeps a driver's run compact without
  // splitting nearby drops across separate trips.
  const MERGE_RADIUS_KM = 3;

  // Whether order `o` can join the same trip as `anchor`: same region, OR customers
  // within MERGE_RADIUS_KM, OR we simply cannot tell it is far away (no coordinates to
  // compare and no differing region). Shared by the initial batch merge and the
  // busy-driver top-up so both group orders identically.
  function ordersCombinable(anchor: any, o: any): boolean {
    const sameRegion = !!o.region && !!anchor.region && o.region === anchor.region;
    const bothCoords =
      typeof o.latitude === "number" && typeof o.longitude === "number" &&
      typeof anchor.latitude === "number" && typeof anchor.longitude === "number";
    const near = bothCoords && calculateDistance(anchor.latitude, anchor.longitude, o.latitude, o.longitude) <= MERGE_RADIUS_KM;
    const cantTellFar = !bothCoords && (!o.region || !anchor.region || sameRegion);
    return sameRegion || near || cantTellFar;
  }

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

  // ── Dispatch serialisation (H-19) ──────────────────────────────────────────
  //
  // Every dispatch run is read → filter → write: it reads the confirmed orders,
  // filters out the ones already spoken for, and only sets its in-memory guards
  // (`batchedOrderIds`, `qd.currentBatchId`) on the LAST line, after a Firestore
  // query, N sequential order updates and the batch creation. That leaves a window
  // of several hundred milliseconds in which a second run reads the same orders and
  // sees them as unclaimed.
  //
  // Ten entry points can start a run — three fire-and-forget
  // assignWaitingBatchToDriver() calls, five onOrderConfirmed() calls, the
  // vendor "confirmed" event and the 30s watchdog — and NONE of them is awaited by
  // its caller. Two drivers pressing "go online" in the same second was enough to
  // put one order into two batches, for two different drivers, deterministically.
  //
  // The fix is a promise chain rather than a boolean in-flight flag: a flag would
  // DROP the overlapping attempt, leaving that order unassigned until the next
  // watchdog tick 30 seconds later. Queuing runs them all, in order, each seeing the
  // previous one's writes.
  //
  // `.then(work, work)` runs the next job whether the previous settled or threw, and
  // the chain is re-armed with a caught promise, so one failure can never wedge
  // dispatch permanently. This is sound because the server runs as a single process
  // (ecosystem.config.js: instances 1, exec_mode "fork") and all dispatch state is
  // in that process's memory. A second process would need the atomic reservation in
  // createDeliveryBatch instead — deliberately out of scope here.
  let dispatchChain: Promise<unknown> = Promise.resolve();

  /** Queue one dispatch run. Never rejects, and never leaves the chain rejected. */
  function runDispatch<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    const result = dispatchChain.then(
      () => work(),
      () => work(),
    ).catch((err) => {
      // The bodies below already try/catch; this is the backstop that keeps a future
      // refactor from wedging the queue or emitting an unhandled rejection.
      console.error(`[DISPATCH] ${label} failed:`, err);
      return undefined;
    });
    dispatchChain = result;
    return result;
  }

  /**
   * The dispatch bodies, unserialised. Never call these from an entry point — they
   * assume the caller already holds the dispatch chain. onOrderConfirmed calls them
   * directly precisely BECAUSE it already holds it; going through runDispatch here
   * would deadlock (a queued job waiting on a job queued behind itself).
   */
  async function assignWaitingBatchToDriverUnsafe(phoneNumber: string) {
    try {
      const db = getFirestore();
      if (!db) return;
      const qd = driverQueue.find(d => d.phoneNumber === phoneNumber && !d.currentBatchId);
      if (!qd) return;
      // Admin-configurable cap on how many orders one driver carries (dispatch A3).
      const maxOrders = (await getSystemSettings()).maxBatchSize;
      // Only confirmed (waiting) orders matter here — targeted query, not a full scan.
      const confirmedOrders = await getOrdersByStatus("confirmed");
      // Get active batch IDs from all drivers in queue (in-memory)
      const activeBatchIds = new Set(driverQueue.map(d => d.currentBatchId).filter(Boolean) as string[]);
      // FIFO: take earliest confirmed orders not in any ACTIVE batch
      // An order is truly available if:
      //   - It has no batchId field in Firestore, OR
      //   - Its batchId doesn't belong to an active (in-progress) batch
      //   - It hasn't been recently rejected by THIS driver (within cooldown window)
      const now = Date.now();
      const driverCooldowns = pruneDriverCooldowns(phoneNumber);
      const eligible = confirmedOrders
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
        });
      if (eligible.length === 0) return;

      // Batch merge conditions (dispatch A3): start from the oldest waiting order (the
      // anchor) and add more orders that are combinable into one trip (see
      // ordersCombinable), up to the configured maxOrders. No time window: every waiting
      // order is "now", regardless of when it was placed.
      const anchor = eligible[0];
      const waitingOrders = [anchor];
      for (const o of eligible.slice(1)) {
        if (waitingOrders.length >= maxOrders) break;
        if (ordersCombinable(anchor, o)) waitingOrders.push(o);
      }
      if (waitingOrders.length === 0) return;

      // Nearest-Neighbor route optimization — starts from the driver's real GPS position
      const driverLoc = driverLocations.get(phoneNumber);
      if (!driverLoc) {
        console.warn(`[ROUTE] No GPS location cached for driver ${phoneNumber} — falling back to (0,0), route order may be inaccurate`);
      }
      const routeInfo = optimizeDeliveryRoute(waitingOrders, driverLoc?.lat ?? 0, driverLoc?.lng ?? 0);
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
          updatedAt: Timestamp.now(),
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

  // When there is no FREE driver, a confirmed order would otherwise sit waiting until a
  // driver finishes — the exact "orders pile up and a driver can't take more than one"
  // complaint. This tops up a BUSY driver's still-open batch (pending or in_progress)
  // with the anchor order when that batch still has room (< maxBatchSize) and the anchor
  // is combinable with what the driver is already carrying. The nearest such driver wins.
  // Returns true if the anchor was added to a batch.
  async function topUpBusyDriverBatchUnsafe(anchor: any): Promise<boolean> {
    try {
      const db = getFirestore();
      if (!db || !anchor || batchedOrderIds.has(anchor.id)) return false;
      const maxOrders = (await getSystemSettings()).maxBatchSize;
      const busy = driverQueue.filter(d => d.currentBatchId);
      if (busy.length === 0) return false;

      const cands: { qd: QueuedDriver; batchId: string; orderIds: string[]; dist: number }[] = [];
      for (const qd of busy) {
        const batch = await getDeliveryBatch(qd.currentBatchId!);
        if (!batch) continue;
        if (!["pending", "in_progress"].includes(batch.status)) continue;
        if ((batch.orderIds?.length || 0) >= maxOrders) continue;
        if (batch.orderIds.includes(anchor.id)) continue;
        // Only merge into a run whose orders are near/compatible with the anchor.
        const batchOrders = await Promise.all(batch.orderIds.map(id => getOrderById(id).catch(() => null)));
        const combinable = batchOrders.some(bo => bo && ordersCombinable(anchor, bo));
        if (!combinable) continue;
        const loc = driverLocations.get(qd.phoneNumber);
        const dist = loc && typeof anchor.latitude === "number" && typeof anchor.longitude === "number"
          ? calculateDistance(loc.lat, loc.lng, anchor.latitude, anchor.longitude)
          : Number.POSITIVE_INFINITY;
        cands.push({ qd, batchId: batch.id, orderIds: batch.orderIds, dist });
      }
      if (cands.length === 0) return false;
      cands.sort((a, b) => a.dist - b.dist);
      const best = cands[0];
      const driverPhone = best.qd.phoneNumber;
      const orderId = anchor.id;
      const newOrderIds = [...best.orderIds, orderId];
      const seq = newOrderIds.length;

      const driver = await getDriverByPhone(driverPhone).catch(() => null);
      const driverName = driver
        ? ([driver.firstName, driver.secondName].filter(Boolean).join(" ") || driver.fullName || driverPhone)
        : driverPhone;
      await updateDeliveryBatch(best.batchId, { orderIds: newOrderIds, totalOrders: newOrderIds.length }).catch(() => {});
      const { FieldValue } = await import("firebase-admin/firestore");
      await db.collection("orders").doc(orderId).update({
        driverPhone, driverName, batchId: best.batchId, batch_id: best.batchId,
        status: "preparing",
        deliverySequence: seq, delivery_sequence: seq,
        rejectedAt: FieldValue.delete(), rejectedByDriver: FieldValue.delete(), rejectedByPhone: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      }).catch(() => {});
      batchedOrderIds.add(orderId);
      driverAssignments.set(orderId, driverPhone);
      orderEvents.emit("order:status", { orderId, status: "preparing" });
      notifyCustomerStatus(orderId, "preparing").catch(() => {});
      const pushToken = best.qd.pushToken || await getDriverPushToken(driverPhone);
      if (pushToken) sendDriverBatchNotification(pushToken, newOrderIds.length, best.batchId, 0).catch(() => {});
      console.log(`[ORDER_CONFIRMED] Topped up busy driver ${driverPhone} batch ${best.batchId} with order ${orderId} (${newOrderIds.length}/${maxOrders})`);
      return true;
    } catch (e) {
      console.error("topUpBusyDriverBatch error:", e);
      return false;
    }
  }

  // Assign a new batch to the best available driver when a confirmed order arrives.
  // The oldest still-unbatched confirmed order is the "anchor": drivers are ranked by
  // proximity to ITS delivery area, and it also seeds the merge in assignWaitingBatchToDriver.
  async function onOrderConfirmedUnsafe() {
    try {
      const confirmed = await getOrdersByStatus("confirmed");
      const anchor = confirmed
        .filter(o => !batchedOrderIds.has(o.id))
        .sort((a, b) => {
          const at = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
          const bt = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
          return at - bt;
        })[0] as any;
      // Rank drivers against the STORE location (the pickup point) when the admin has
      // set it on the map; fall back to the customer's delivery coordinates otherwise.
      let anchorPoint: { latitude?: number; longitude?: number } | null =
        anchor ? { latitude: anchor.latitude, longitude: anchor.longitude } : null;
      if (anchor?.vendorId) {
        const v = (await getVendorList()).find(x => x.id === anchor.vendorId) as any;
        if (v && typeof v.latitude === "number" && typeof v.longitude === "number") {
          anchorPoint = { latitude: v.latitude, longitude: v.longitude };
        }
      }
      const driver = findBestAvailableDriver(anchorPoint);
      console.log(`[ORDER_CONFIRMED] Best driver: ${driver?.phoneNumber ?? "NONE"}`);
      if (driver) {
        await assignWaitingBatchToDriverUnsafe(driver.phoneNumber);
      } else if (anchor) {
        // No free driver — hand the waiting order to a busy driver whose current run
        // still has room, so a single active driver keeps taking orders instead of them
        // piling up until the run finishes.
        await topUpBusyDriverBatchUnsafe(anchor);
      }
    } catch (e) {
      console.error("onOrderConfirmed error:", e);
    }
  }

  // ── Public dispatch entry points (H-19) ────────────────────────────────────
  // Same names and signatures as before, so no call site changed; every one of them
  // now runs through the single dispatch chain.

  function assignWaitingBatchToDriver(phoneNumber: string): Promise<unknown> {
    return runDispatch(`assignWaitingBatchToDriver(${phoneNumber})`, () =>
      assignWaitingBatchToDriverUnsafe(phoneNumber),
    );
  }

  function onOrderConfirmed(): Promise<unknown> {
    return runDispatch("onOrderConfirmed", () => onOrderConfirmedUnsafe());
  }

  // Vendor-confirmed orders (server/vendor.ts) emit this same event so they get an
  // immediate assignment attempt too, instead of waiting for the 30s watchdog below.
  orderEvents.on("confirmed", onOrderConfirmed);

  // ── Settlement recovery sweep ──────────────────────────────────────────────
  // Guarantees settlement is never permanently skipped. complete-order marks an
  // order `settlementPending` when an accrual write fails; this replays the exact
  // stored inputs until they land.
  //
  // Safe by construction: each accrual is keyed `${orderId}__${accountType}`, so a
  // replay of an accrual that already succeeded returns "duplicate" and writes
  // nothing. Only the settlement step is retried — never the rest of completion,
  // which stays guarded by the order's earningsCredited flag.
  // H-45: every background job is registered here so shutdown can stop it. They
  // used to be fire-and-forget setInterval calls: nothing held a handle, so
  // nothing could ever clear them, and the process could not exit on its own.
  const backgroundTimers: ReturnType<typeof setInterval>[] = [];
  const everyMs = (ms: number, fn: () => void | Promise<void>) => {
    backgroundTimers.push(setInterval(fn, ms));
  };

  const SETTLEMENT_SWEEP_MS = 2 * 60 * 1000;
  everyMs(SETTLEMENT_SWEEP_MS, async () => {
    const db = getFirestore();
    if (!db) return;
    try {
      const { FieldValue } = await import("firebase-admin/firestore");
      const stuck = await db
        .collection("orders")
        .where("settlementPending", "==", true)
        .limit(25)
        .get();
      if (stuck.empty) return;
      console.log(`[SETTLEMENT] recovery sweep: ${stuck.size} order(s) awaiting settlement`);

      for (const doc of stuck.docs) {
        const data = doc.data() as any;
        const inputs = Array.isArray(data.settlementRetryInputs) ? data.settlementRetryInputs : [];
        if (inputs.length === 0) {
          // Nothing to replay — clear the flag so the sweep does not spin forever.
          await doc.ref.update({ settlementPending: false }).catch(() => {});
          console.warn(`[SETTLEMENT] order=${doc.id} flagged pending but had no stored inputs; cleared`);
          continue;
        }
        const allSettled = await retryOrderSettlements(inputs);
        if (allSettled) {
          await doc.ref
            .update({
              settlementPending: false,
              settlementRetryInputs: FieldValue.delete(),
              settlementFailedTypes: FieldValue.delete(),
              settlementRecoveredAt: new Date().toISOString(),
            })
            .catch(() => {});
          console.log(`[SETTLEMENT] recovered order=${doc.id}`);
        }
        // Not settled → leave the flag set; the next sweep retries again.
      }
    } catch (err: any) {
      console.error("[SETTLEMENT] recovery sweep error:", err?.message ?? err);
    }
  });

  // Watchdog: every 30s, scan for unassigned confirmed orders and assign to free drivers
  everyMs(30_000, async () => {
    try {
      const freeDrivers = driverQueue.filter(d => !d.currentBatchId);
      if (freeDrivers.length === 0) return;
      for (const driver of freeDrivers) {
        await assignWaitingBatchToDriver(driver.phoneNumber);
      }
    } catch (e) {
      console.error("[WATCHDOG] error:", e);
    }
  });

  // Ghost-driver cleanup: every 10 minutes, evict drivers whose app crashed/closed
  // without pressing "go offline". Threshold: no GPS ping for 20 minutes.
  const GHOST_TIMEOUT_MS = 20 * 60 * 1000;
  everyMs(10 * 60 * 1000, async () => {
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
  });

  // Offer-timeout sweep: a batch that was OFFERED to a driver but never accepted
  // (e.g. the driver's app closed before the client-side 30s countdown could
  // auto-reject) would otherwise stay "pending" forever — the ghost-cleanup above
  // intentionally skips drivers holding a batch, so the order got stuck with a
  // driver who will never respond. Every 20s, release any still-pending batch older
  // than the threshold and reassign its orders, mirroring a manual reject-order.
  const OFFER_TIMEOUT_MS = 90 * 1000; // well beyond the 30s client accept countdown
  everyMs(20 * 1000, async () => {
    try {
      const now = Date.now();
      // Snapshot holders first so we don't mutate driverQueue while iterating it.
      const holders = driverQueue.filter(d => d.currentBatchId);
      for (const qd of holders) {
        const batchId = qd.currentBatchId!;
        const batchDoc = await getDeliveryBatch(batchId);
        if (!batchDoc) { qd.currentBatchId = undefined; continue; }
        if (batchDoc.status !== "pending") continue; // accepted/in-progress → leave it
        const createdMs = batchDoc.createdAt?.toDate?.() ? batchDoc.createdAt.toDate().getTime() : 0;
        if (createdMs === 0 || (now - createdMs) < OFFER_TIMEOUT_MS) continue;

        // Atomically cancel ONLY if still pending. If the driver accepted a moment
        // ago (→ in_progress), or another overlapping sweep / server instance already
        // released it, this returns false and we touch nothing — acceptance always
        // wins and the release runs at most once (idempotent).
        const released = await cancelBatchIfPending(batchId);
        if (!released) continue;

        // Release like reject-order: free the orders, requeue the driver at the end,
        // apply a rejection cooldown, then reassign.
        batchDoc.orderIds.forEach(id => batchedOrderIds.delete(id));
        qd.currentBatchId = undefined;
        const idx = driverQueue.findIndex(d => d.phoneNumber === qd.phoneNumber);
        if (idx !== -1) {
          const savedPushToken = qd.pushToken;
          driverQueue.splice(idx, 1);
          driverQueue.push({ phoneNumber: qd.phoneNumber, joinedAt: Date.now(), pushToken: savedPushToken });
        }
        updateDriverQueueEntry(qd.phoneNumber, { hasActiveBatch: false, joinedAt: Date.now() }).catch(() => {});
        if (!driverRejectionCooldowns.has(qd.phoneNumber)) driverRejectionCooldowns.set(qd.phoneNumber, new Map());
        const cd = driverRejectionCooldowns.get(qd.phoneNumber)!;
        batchDoc.orderIds.forEach(id => cd.set(id, Date.now()));
        pruneDriverCooldowns(qd.phoneNumber);
        console.warn(`[OFFER_TIMEOUT] Released stale pending batch ${batchId} from ${qd.phoneNumber} (>${OFFER_TIMEOUT_MS / 1000}s), reassigning`);
        onOrderConfirmed();
      }
    } catch (e) {
      console.error("[OFFER_TIMEOUT] error:", e);
    }
  });

  // Get queue info for admin
  app.get("/api/admin/driver-queue", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      let allOrders: any[] = [];
      if (db) {
        // Only the ids referenced by queued drivers are ever looked up below.
        const referencedIds = driverQueue.map(d => d.currentBatchId).filter(Boolean) as string[];
        allOrders = await getOrdersByIds(referencedIds);
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
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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

      // H-36: the inner Promise.all only paired the two reads for ONE driver — the
      // loop itself was sequential, so 200 drivers meant 200 round trips one after
      // another on the single event loop, and every other request on the platform
      // queued behind them. Drivers are now processed in bounded batches: the same
      // reads, the same arithmetic, the same output, roughly an order of magnitude
      // fewer sequential rounds. The bound matters — firing 200 drivers at once
      // would open 400 simultaneous Firestore reads.
      const DRIVER_STATS_CONCURRENCY = 10;
      for (let i = 0; i < drivers.length; i += DRIVER_STATS_CONCURRENCY) {
        const batch = drivers.slice(i, i + DRIVER_STATS_CONCURRENCY);
        const rows = await Promise.all(batch.map(async (driver) => {
          const phone = driver.phoneNumber;
          // H-72: driver document in hand — address the ledger by walletId.
          const [completed, ledger] = await Promise.all([
            getCompletedOrders(phone),
            getSettlementLedger("driver", driverWalletIdOf(driver, phone)),
          ]);
          const todayCompleted = completed.filter(o => new Date(o.completedAt).getTime() >= todayStart);
          return [phone, {
            todayOrders: todayCompleted.length,
            todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
            totalOrders: completed.length,
            totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
            amountOwed: ledger?.outstandingTotal ?? 0,
          }] as const;
        }));
        for (const [phone, row] of rows) stats[phone] = row;
      }

      res.json({ stats });
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Get owner earnings from all delivered orders
  app.get("/api/admin/owner-earnings", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      // H-33: zeroed earnings on an unavailable database read as "the platform
      // earned nothing". Report the outage instead.
      if (!db) {
        console.error("[owner-earnings] unavailable: no database");
        return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
      }

      // C-13: owner-earnings only returns aggregates. The previous helper loaded
      // every delivered order, including items and images, into Node before summing
      // four numbers. Firestore aggregation keeps the same financial source of
      // truth while returning only scalar totals.
      const deliveredQuery = db.collection("orders").where("status", "==", "delivered");
      const [aggregateSnap, withEarningsCountSnap] = await Promise.all([
        deliveredQuery.aggregate({
          totalDeliveredOrders: AggregateField.count(),
          totalDeliveryFees: AggregateField.sum("deliveryFee"),
          totalDriverEarnings: AggregateField.sum("driverEarning"),
          totalOwnerEarnings: AggregateField.sum("ownerEarning"),
        }).get(),
        // The old code classified an order as having earnings by field presence.
        // `!= null` preserves that for the numeric earnings written by settlement,
        // including zero, without materialising the order documents.
        deliveredQuery.where("driverEarning", "!=", null).count().get(),
      ]);
      const aggregate = aggregateSnap.data() as any;
      const totalDeliveredOrders = Number(aggregate.totalDeliveredOrders) || 0;
      const ordersWithEarnings = Number(withEarningsCountSnap.data().count) || 0;
      const totalDriverEarnings = Number(aggregate.totalDriverEarnings) || 0;
      const totalOwnerEarnings = Number(aggregate.totalOwnerEarnings) || 0;
      const totalDeliveryFees = Number(aggregate.totalDeliveryFees) || 0;

      res.json({
        totalOwnerEarnings,
        totalDriverEarnings,
        totalDeliveryFees,
        ordersWithEarnings,
        // Surfaced rather than hidden: a non-zero value means these totals cover
        // fewer orders than were delivered, and the gap is real, not a rounding.
        ordersMissingEarnings: Math.max(0, totalDeliveredOrders - ordersWithEarnings),
        totalDeliveredOrders,
      });
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Promo Code Routes
  app.get("/api/admin/promo-codes", async (_req: Request, res: Response) => {
    try {
      const codes = await getPromoCodes();
      res.json(codes);
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.delete("/api/admin/promo-codes/:id", async (req: Request, res: Response) => {
    try {
      await deletePromoCodeFn(req.params.id as string);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
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

      // H-57: this is the promotional channel behind the customer's "العروض والخصومات"
      // switch, so it must read the consent-filtered list. getAllUserPushTokens()
      // returns every registered device and is still what the stats endpoint reports.
      const tokens = await getMarketingPushTokens();
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
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── Notification Stats ────────────────────────────────────────────────────
  app.get("/api/admin/notification-stats", async (_req: Request, res: Response) => {
    try {
      const tokens = await getAllUserPushTokens();
      const allUsers = await getAllUsers();
      res.json({ totalUsers: allUsers.length, tokensCount: tokens.length });
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── Cancel Order (authenticated, state-based timing) ─────────────────────
  app.post("/api/orders/:orderId/cancel", async (req: Request, res: Response) => {
    // Auth: customer JWT required — prevents unauthenticated cancellation attempts
    const authHeader = req.headers.authorization || "";
    const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!rawToken) return res.status(401).json({ error: "يرجى تسجيل الدخول أولاً" });
    let callerPhone: string;
    try {
      const decoded = jwt.verify(rawToken, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
      if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid");
      if (isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) throw new Error("revoked");
      callerPhone = decoded.phoneNumber;
    } catch {
      return res.status(401).json({ error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً" });
    }

    try {
      const orderId = req.params.orderId as string;
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });

      const doc = await db.collection("orders").doc(orderId).get();
      if (!doc.exists) return res.status(404).json({ error: "الطلب غير موجود" });

      const data = doc.data() as any;

      // Ownership: only the order's customer can cancel it
      const orderPhone = data.customerPhone || data.phoneNumber;
      if (orderPhone && !sameLocalPhone(orderPhone, callerPhone)) {
        return res.status(403).json({ error: "غير مصرح — هذا الطلب ليس لك" });
      }

      if (data.status === "cancelled") {
        return res.status(400).json({ error: "الطلب ملغي مسبقاً" });
      }

      // Smart state-based cancellation
      const LATE_STATUSES = ["preparing", "ready", "picked_up", "in_delivery", "delivered"];
      if (LATE_STATUSES.includes(data.status)) {
        return res.status(400).json({ error: "لا يمكن إلغاء الطلب بعد أن بدأ التاجر التجهيز — تواصل مع الدعم" });
      }

      const nowMs = Date.now();

      if (data.status === "confirmed") {
        // M-04/M-05: the grace window starts when the merchant accepted, not when
        // the customer placed the order. Legacy orders fall back to createdAt.
        const confirmationMs = timestampMillis(data.confirmedAt ?? data.vendorStatusAt_confirmed ?? data.createdAt);
        if (confirmationMs === null) {
          return res.status(400).json({ error: "تعذّر تحديد وقت قبول الطلب" });
        }
        const CONFIRM_GRACE_MS = 5 * 60 * 1000;
        if (nowMs - confirmationMs > CONFIRM_GRACE_MS) {
          return res.status(400).json({ error: "انتهت مهلة الإلغاء (5 دقائق بعد قبول التاجر)" });
        }
      }
      // status === "pending": always allow

      const { Timestamp } = await import("firebase-admin/firestore");
      await db.collection("orders").doc(orderId).update({
        status: "cancelled",
        updatedAt: Timestamp.now(),
      });

      // Real-time: broadcast cancellation to all connected clients.
      // Forwarded to: order:${orderId} room (customer tracking screen) +
      // global orders:changed ping (vendor, driver, admin list screens).
      orderEvents.emit("order:status", { orderId, status: "cancelled" });

      // Clean up in-memory driver assignment so the driver's active queue stays
      // accurate. Fall back to the order document's driverPhone in case the
      // server restarted and the in-memory map was cleared.
      const assignedDriverPhone = driverAssignments.get(orderId) || data.driverPhone || null;
      if (assignedDriverPhone) {
        driverAssignments.delete(orderId);
        // Push: notify the assigned driver immediately (best-effort)
        getDriverPushToken(String(assignedDriverPhone))
          .then(dToken => {
            if (dToken) sendDriverOrderCancelledNotification(dToken, orderId).catch(() => {});
          }).catch(() => {});
      }

      // Push: notify vendor with a vendor-specific cancellation message (best-effort)
      if (data.vendorId) {
        db.collection("vendors").doc(String(data.vendorId)).get()
          .then(vDoc => {
            const vToken = vDoc.exists ? (vDoc.data() as any)?.pushToken as string | undefined : undefined;
            if (vToken) sendVendorOrderCancelledNotification(vToken, orderId, data.customerName).catch(() => {});
          }).catch(() => {});
      }

      // Push: notify admin (best-effort)
      getAdminPushToken()
        .then(adminToken => {
          if (adminToken) sendPushNotification(adminToken, "cancelled", orderId).catch(() => {});
        }).catch(() => {});

      console.log(`[CANCEL] Customer cancelled ${orderId.slice(-6).toUpperCase()} — driver: ${assignedDriverPhone || "none"}, vendor: ${data.vendorId || "none"}`);
      return res.json({ success: true });
    } catch (error: any) {
      console.error("Error cancelling order:", error);
      return res.status(500).json({ error: GENERIC_SERVER_ERROR });
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
      const decoded = jwt.verify(rawToken, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
      if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid");
      if (isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) throw new Error("revoked");
      callerPhone = decoded.phoneNumber;
    } catch {
      return res.status(401).json({ error: "انتهت صلاحية الجلسة — يرجى تسجيل الدخول مجدداً" });
    }

    // 2. Validate rating values before touching the database
    const numRating = Number(req.body.rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و 5" });
    }
    const numDriverRating: number | null = req.body.driverRating !== undefined && req.body.driverRating !== null
      ? Number(req.body.driverRating) : null;
    if (numDriverRating !== null && (isNaN(numDriverRating) || numDriverRating < 1 || numDriverRating > 5)) {
      return res.status(400).json({ error: "تقييم السائق يجب أن يكون بين 1 و 5" });
    }
    const ratingComment = typeof req.body.comment === "string" ? req.body.comment.trim().slice(0, 500) : "";
    const ratingImage = typeof req.body.image === "string" ? req.body.image.slice(0, 400000) : "";

    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });

      const orderRef = db.collection("orders").doc(req.params.orderId as string);
      const capturedOrderId: string = req.params.orderId as string;
      const ratedAt = Timestamp.now();
      let didUpdateVendor = false;
      let capturedVendorId: string | undefined;

      // 3. Single Firestore transaction — ALL reads first, then ALL writes.
      await db.runTransaction(async (tx) => {
        // ── reads ──────────────────────────────────────────────────────────
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) throw Object.assign(new Error("الطلب غير موجود"), { status: 404 });
        const order = orderSnap.data() as any;

        if (!sameLocalPhone(order.phoneNumber, callerPhone)) {
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

        // Read driver doc if driver rating provided
        const driverRef = (numDriverRating !== null && order.driverId)
          ? db.collection("drivers").doc(String(order.driverId)) : null;
        const dSnap = driverRef ? await tx.get(driverRef) : null;

        // ── writes ─────────────────────────────────────────────────────────
        const orderUpdate: any = { customerRating: numRating, ratedAt };
        if (numDriverRating !== null) {
          orderUpdate.driverRating = numDriverRating;
          orderUpdate.driverRatedAt = ratedAt;
        }
        tx.update(orderRef, orderUpdate);

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

        if (driverRef && dSnap && dSnap.exists && numDriverRating !== null) {
          const d = dSnap.data() as any;
          const oldCount: number = d.ratingCount ?? 0;
          const oldRating: number | null = d.rating ?? null;
          const newCount = oldCount + 1;
          const newDriverRating = (oldRating === null || oldCount === 0)
            ? numDriverRating
            : Math.round(((oldRating * oldCount + numDriverRating) / newCount) * 10) / 10;
          tx.update(driverRef, { rating: newDriverRating, ratingCount: newCount });
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
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  app.post("/api/promo-codes/apply", requireCustomerAuth, async (req: Request, res: Response) => {
    try {
      const { code, cartTotal } = req.body;
      const userId = (req as any).customerPhone as string;
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
        // Apply maximum discount cap if configured (percentage coupons only)
        if (promo.maximumDiscountAmount && promo.maximumDiscountAmount > 0) {
          discount = Math.min(discount, promo.maximumDiscountAmount);
        }
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
        maximumDiscountAmount: promo.maximumDiscountAmount ?? null,
      });
    } catch (error: any) {
      console.error("[API]", req.method, req.path, error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // Owner-only: this was unauthenticated and took userId from the body, so anyone
  // could record a promo as "used" on behalf of any other user and burn their
  // discount (griefing) or poison campaign analytics. The identity now comes from
  // the verified token and the client-supplied userId is ignored.
  app.post("/api/promo-codes/record-usage", requireCustomerAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).customerPhone as string;
      const { promoCode } = req.body;
      if (!promoCode) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await recordPromoUsage(userId, String(promoCode).toUpperCase());
      res.json({ success: true });
    } catch (error: any) {
      console.error("record promo usage:", error);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // Auth-gated: this proxies Google Geocoding + Places using OUR billable API key.
  // Left open, anyone could drive unlimited paid Google calls on our account.
  app.get("/api/reverse-geocode", async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }
    // The raw-coordinate string is the last-resort fallback the client turns into a
    // friendly label; it is never the intended answer when Google can be reached.
    const coordFallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleApiKey) {
      // Loud, key-free log so a missing production key is diagnosed from the request
      // path too (not only at boot) — the silent failure behind "addresses turned
      // into coordinates".
      console.warn(`[geocode] GOOGLE_MAPS_API_KEY not set — returning coordinates for ${coordFallback}`);
      return res.json({ address: coordFallback });
    }

    // Cache lookup (coordinates rounded to ~11 m).
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const hit = geocodeCache.get(cacheKey);
    if (hit && hit.expires > Date.now()) {
      return res.json(hit.value);
    }

    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=ar&key=${googleApiKey}`;
      const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=100&language=ar&key=${googleApiKey}`;

      // 5 s hard timeout each; a slow/unreachable Google returns null, not a hang.
      const [geocodeRes, placesRes] = await Promise.all([
        fetchJsonWithTimeout(geocodeUrl, 5000),
        fetchJsonWithTimeout(placesUrl, 5000),
      ]);

      const picked = pickBestAddress(geocodeRes, placesRes);
      if (picked) {
        const result = { ...picked, resolved: true };
        if (geocodeCache.size >= GEOCODE_CACHE_MAX) geocodeCache.clear(); // simple bound
        geocodeCache.set(cacheKey, { value: result, expires: Date.now() + GEOCODE_CACHE_TTL_MS });
        return res.json(result);
      }

      // Nothing usable — log WHY (never the URL/key), classifying key/quota problems so
      // "key set but wrong/blocked/over quota" is distinguishable from "no result".
      const diag = geocodeDiagnostics(geocodeRes, placesRes);
      if (diag.keyProblem) {
        console.error(
          `[geocode] Google rejected the request for ${coordFallback} — ` +
            `geocode=${diag.geocodeStatus} places=${diag.placesStatus} error="${diag.googleError ?? ""}". ` +
            `Check GOOGLE_MAPS_API_KEY: Geocoding API enabled, billing active, no IP restriction blocking the server.`,
        );
      } else {
        console.warn(
          `[geocode] no usable address for ${coordFallback} — geocode=${diag.geocodeStatus} places=${diag.placesStatus}`,
        );
      }
      res.json({ address: coordFallback, resolved: false });
    } catch (error: any) {
      console.error(`[geocode] request failed for ${coordFallback}: ${error?.message}`);
      res.json({ address: coordFallback, resolved: false });
    }
  });

  // ─── Support Chat ─────────────────────────────────────────────────────────

  // User: get own messages — requires customer JWT; phone comes from token, never from query
  app.get("/api/support/messages", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = (req as any).customerPhone as string;
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
  app.post("/api/support/upload-image", requireCustomerAuth, uploadWebP.single("image"), async (req: Request & { file?: Express.Multer.File }, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image uploaded" });
      // The multer filter here allows application/octet-stream because React Native
      // sends it for real photos, which also let text/html through. Decide on the
      // actual bytes instead, and derive both the extension and the stored
      // Content-Type from that — never from anything the client sent.
      const detected = sniffImageMime(req.file.buffer);
      if (!detected) {
        return res.status(400).json({ error: "نوع الملف غير مدعوم — الصور فقط" });
      }
      const imageUrl = await uploadToFirebaseStorage(
        req.file.buffer,
        `support-images/${randomUUID()}${safeImageExtension(detected)}`,
        safeImageContentType(detected),
      );
      return res.json({ imageUrl });
    } catch (e: any) {
      console.error("[Storage] support image upload failed:", e?.message);
      return res.status(500).json({ error: "فشل في رفع الصورة. حاول مجدداً." });
    }
  });

  // User: send message — requires customer JWT; phone comes from token to prevent impersonation
  app.post("/api/support/messages", requireCustomerAuth, async (req: Request, res: Response) => {
    const phoneNumber = (req as any).customerPhone as string;
    const { text, userName, userRegion, userGender, type, imageUrl, productData } = req.body;
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

  // Admin: permanently clear/delete a support conversation (added 2026-07-06)
  app.delete("/api/admin/support/messages/:phoneNumber", async (req: Request, res: Response) => {
    const phoneNumber = req.params.phoneNumber as string;
    try {
      const ok = await clearSupportChat(decodeURIComponent(phoneNumber));
      if (!ok) return res.status(500).json({ error: "فشل مسح المحادثة" });
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: "فشل مسح المحادثة" });
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

      // C-13: keep the historical 2,000-order response ceiling, but make every
      // Firestore read deterministic, date-aware and page-bounded. The previous
      // query had no orderBy (so the selected 2,000 were arbitrary), ignored the
      // requested period in Firestore, and then loaded all vendors/vendorProducts.
      const FINANCIAL_REPORT_PAGE_SIZE = 500;
      const FINANCIAL_REPORT_MAX_ORDERS = 2000;
      let financialQuery = db.collection("orders")
        .where("status", "==", "delivered")
        .orderBy("createdAt", "desc")
        .select(
          "total", "deliveryFee", "serviceFee", "vendorCommissionAmount",
          "driverEarning", "vendorId", "vendorIds", "createdAt",
        );
      if (startDate) financialQuery = financialQuery.where("createdAt", ">=", startDate);

      const orderDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      let orderCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (orderDocs.length < FINANCIAL_REPORT_MAX_ORDERS) {
        let pageQuery = financialQuery.limit(
          Math.min(FINANCIAL_REPORT_PAGE_SIZE, FINANCIAL_REPORT_MAX_ORDERS - orderDocs.length),
        );
        if (orderCursor) pageQuery = pageQuery.startAfter(orderCursor);
        const page = await pageQuery.get();
        if (page.empty) break;
        orderDocs.push(...page.docs);
        orderCursor = page.docs[page.docs.length - 1];
        if (page.size < FINANCIAL_REPORT_PAGE_SIZE) break;
      }

      const orderRows = orderDocs.map(d => ({ id: d.id, ...(d.data() as any) }));
      // Modern orders carry vendorId/vendorIds. Only legacy rows without those
      // fields need a document read for item-level vendor recovery, so large item
      // arrays and embedded images are not loaded for the normal path.
      const legacyOrderIds = orderRows
        .filter(o => !o.vendorId)
        .map(o => o.id);
      if (legacyOrderIds.length > 0) {
        const legacyDocs = await db.getAll(
          ...legacyOrderIds.map(id => db.collection("orders").doc(id)),
        );
        const legacyById = new Map(
          legacyDocs.filter(d => d.exists).map(d => [d.id, d.data() as any]),
        );
        for (const row of orderRows) {
          const legacy = legacyById.get(row.id);
          if (legacy) row.items = legacy.items;
        }
      }

      const legacyProductIds = [
        ...new Set(
          orderRows
            .filter(o => !o.vendorId)
            .flatMap(o => (Array.isArray(o.items) ? o.items : []).map((i: any) => i?.productId))
            .filter(Boolean),
        ),
      ] as string[];
      const productVendorMap: Record<string, string> = {};
      if (legacyProductIds.length > 0) {
        const productDocs = await db.getAll(
          ...legacyProductIds.map(id => db.collection("vendorProducts").doc(id)),
        );
        for (const d of productDocs) {
          if (d.exists) productVendorMap[d.id] = (d.data() as any).vendorId || "";
        }
      }

      const vendorIdsUsedSet = new Set<string>(orderRows.map(o => o.vendorId).filter(Boolean));
      for (const row of orderRows) {
        if (row.vendorId) continue;
        for (const item of (Array.isArray(row.items) ? row.items : [])) {
          const legacyVendorId = item?.productId ? productVendorMap[item.productId] : "";
          if (legacyVendorId) {
            vendorIdsUsedSet.add(legacyVendorId);
            break;
          }
        }
      }
      const vendorIdsUsed = [...vendorIdsUsedSet];
      const vendorNames: Record<string, string> = {};
      if (vendorIdsUsed.length > 0) {
        const vendorDocs = await db.getAll(
          ...vendorIdsUsed.map(id => db.collection("vendors").doc(id)),
        );
        for (const d of vendorDocs) {
          if (d.exists) vendorNames[d.id] = (d.data() as any).storeName || (d.data() as any).name || "–";
        }
      }
      let totalRevenue = 0;
      let totalCommission = 0;
      let totalOrders = 0;
      let totalDriverEarnings = 0;

      const vendorStats: Record<string, { vendorId: string; vendorName: string; revenue: number; commission: number; netEarning: number; orders: number }> = {};
      const dailyMap: Record<string, { date: string; revenue: number; commission: number; orders: number }> = {};

      for (const data of orderRows) {
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

      // C-13: `users` and `products` are only ever reported as a COUNT, so they use
      // the server-side aggregation instead of streaming every document into the
      // process. Same numbers, a fraction of the memory and of the billed reads.
      //
      // `orders` was the dangerous one: `.orderBy(createdAt).get()` with no limit
      // materialised EVERY order ever placed — full documents, items[] arrays and
      // all — inside a process capped at 512MB, and every number below was derived
      // by filtering that array seven times. It grows without bound, so the endpoint
      // was guaranteed to OOM the server eventually.
      //
      // The scan is now streamed in pages, and .select() fetches ONLY the four
      // fields these numbers need — never items[], which is the bulk of an order.
      // Peak memory is one page, not the whole collection. Every reported figure is
      // accumulated exactly as the array filters computed it, so the output is
      // identical; only the memory profile changes.
      const restaurantFilter = Filter.or(
        Filter.where("categoryType", "==", "restaurant"),
        Filter.where("businessType", "==", "restaurant"),
      );
      const [usersCount, driversTotal, driversOnline, vendorsTotal, restaurantsCount, productsCount] = await Promise.all([
        db.collection("users").count().get(),
        db.collection("drivers").count().get(),
        db.collection("drivers").where("isOnline", "==", true).count().get(),
        db.collection("vendors").count().get(),
        db.collection("vendors").where(restaurantFilter).count().get(),
        db.collection("products").count().get(),
      ]);

      const ORDER_PAGE_SIZE = 1000;
      let totalOrders = 0, todayCount = 0, weekCount = 0, monthCount = 0;
      let deliveredCount = 0, activeCount = 0, cancelledCount = 0;
      let totalRevenue = 0, todayRevenue = 0;
      const vendorOrderCount: Record<string, number> = {};
      {
        let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
        for (;;) {
          let q = db.collection("orders")
            .orderBy("createdAt", "desc")
            .select("status", "total", "createdAt", "vendorId")
            .limit(ORDER_PAGE_SIZE);
          if (cursor) q = q.startAfter(cursor);
          const page = await q.get();
          if (page.empty) break;

          for (const doc of page.docs) {
            const o = doc.data() as any;
            totalOrders += 1;
            const created = o.createdAt || "";
            const isDelivered = o.status === "delivered";
            if (created >= todayStart) {
              todayCount += 1;
              if (isDelivered) todayRevenue += o.total || 0;
            }
            if (created >= weekStart) weekCount += 1;
            if (created >= monthStart) monthCount += 1;
            if (isDelivered) { deliveredCount += 1; totalRevenue += o.total || 0; }
            else if (o.status === "cancelled") cancelledCount += 1;
            else activeCount += 1;
            if (o.vendorId) vendorOrderCount[o.vendorId] = (vendorOrderCount[o.vendorId] || 0) + 1;
          }

          if (page.size < ORDER_PAGE_SIZE) break;
          cursor = page.docs[page.docs.length - 1];
        }
      }

      // Counts stay server-side; only the five vendor documents needed for the
      // top-vendors labels are fetched after the paged order scan.
      const vendorTotal = vendorsTotal.data().count;
      const restaurantTotal = restaurantsCount.data().count;
      const onlineDrivers = driversOnline.data().count;
      const topVendorEntries = Object.entries(vendorOrderCount)
        .sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topVendorDocs = topVendorEntries.length > 0
        ? await db.getAll(
          ...topVendorEntries.map(([id]) => db.collection("vendors").doc(id)),
        )
        : [];
      const topVendorNames = new Map(
        topVendorDocs.filter(d => d.exists).map(d => [
          d.id,
          (d.data() as any).name || (d.data() as any).storeName || d.id,
        ]),
      );
      const topVendors = topVendorEntries.map(([id, count]) => ({
        id,
        name: topVendorNames.get(id) || id,
        orders: count,
      }));

      res.json({
        orders: { total: totalOrders, today: todayCount, week: weekCount, month: monthCount, active: activeCount, delivered: deliveredCount, cancelled: cancelledCount },
        revenue: { total: totalRevenue, today: todayRevenue },
        users: usersCount.data().count,
        drivers: { total: driversTotal.data().count, online: onlineDrivers },
        vendors: { total: vendorTotal, restaurants: restaurantTotal, stores: Math.max(0, vendorTotal - restaurantTotal) },
        products: productsCount.data().count,
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
      const since = Timestamp.fromMillis(now.getTime() - 24 * 3600000);

      const [ordersSnap, driversSnap, batchesSnap] = await Promise.all([
        db.collection("orders").where("createdAt", ">=", since).orderBy("createdAt", "desc").limit(100).get(),
        db.collection("drivers").where("isOnline", "==", true).get(),
        db.collection("delivery_batches").where("status", "==", "in_progress").get(),
      ]);

      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      const newOrders = orders.filter((o: any) => o.status === "pending").length;
      const preparingOrders = orders.filter((o: any) => ["confirmed","preparing","ready"].includes(o.status)).length;
      const inDelivery = orders.filter((o: any) => ["picked_up","in_delivery"].includes(o.status)).length;

      // Late orders: pending > 30 min
      const lateOrders = orders.filter((o: any) => {
        if (o.status !== "pending" && o.status !== "confirmed") return false;
        const createdMs = timestampMillis(o.createdAt);
        if (createdMs === null) return false;
        const age = now.getTime() - createdMs;
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
      // H-33: a zeroed dashboard is indistinguishable from a quiet day.
      if (!db) {
        console.error("[analytics] unavailable: no database");
        return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
      }
      const days = parseInt((req.query.days as string) || "30", 10);
      const since = Timestamp.fromMillis(Date.now() - days * 86400000);

      // C-13: every page is bounded and only the fields used by this endpoint are
      // projected. Aggregation happens as pages arrive, so the process never holds
      // the entire period (or the embedded item images) in memory at once.
      const ANALYTICS_PAGE_SIZE = 500;
      const dailyMap: Record<string, { date: string; orders: number; revenue: number; newUsers: number }> = {};
      const catCount: Record<string, number> = {};
      let totalOrders = 0;
      let totalRevenue = 0;
      let deliveredCount = 0;
      let orderCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      for (;;) {
        let orderQuery = db.collection("orders")
          .where("createdAt", ">=", since)
          .orderBy("createdAt", "desc")
          .select("status", "total", "createdAt", "items")
          .limit(ANALYTICS_PAGE_SIZE);
        if (orderCursor) orderQuery = orderQuery.startAfter(orderCursor);
        const page = await orderQuery.get();
        if (page.empty) break;
        for (const doc of page.docs) {
          const o = doc.data() as any;
          const createdAt = o.createdAt?.toDate?.()?.toISOString?.() ?? String(o.createdAt || "");
          const day = createdAt.substring(0, 10);
          if (!dailyMap[day]) dailyMap[day] = { date: day, orders: 0, revenue: 0, newUsers: 0 };
          dailyMap[day].orders++;
          totalOrders++;
          if (o.status === "delivered") {
            deliveredCount++;
            const orderTotal = Number(o.total) || 0;
            dailyMap[day].revenue += orderTotal;
            totalRevenue += orderTotal;
          }
          for (const item of (Array.isArray(o.items) ? o.items : [])) {
            const cat = item.categoryId || "أخرى";
            catCount[cat] = (catCount[cat] || 0) + (Number(item.quantity) || 0);
          }
        }
        if (page.size < ANALYTICS_PAGE_SIZE) break;
        orderCursor = page.docs[page.docs.length - 1];
      }

      let newUsers = 0;
      let userCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      for (;;) {
        let userQuery = db.collection("users")
          .where("createdAt", ">=", since)
          .orderBy("createdAt", "desc")
          .select("createdAt")
          .limit(ANALYTICS_PAGE_SIZE);
        if (userCursor) userQuery = userQuery.startAfter(userCursor);
        const page = await userQuery.get();
        if (page.empty) break;
        for (const doc of page.docs) {
          newUsers++;
          const createdAt = (doc.data() as any).createdAt;
          const iso = createdAt?.toDate?.()?.toISOString?.() ?? String(createdAt || "");
          const day = iso.substring(0, 10);
          if (dailyMap[day]) dailyMap[day].newUsers++;
        }
        if (page.size < ANALYTICS_PAGE_SIZE) break;
        userCursor = page.docs[page.docs.length - 1];
      }

      const dailyData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      const topCategories = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Conversion: orders / total users (rough).
      // `total` already includes deliveryFee + serviceFee − discount.
      const avgOrderValue = deliveredCount ? Math.round(totalRevenue / deliveredCount) : 0;

      res.json({
        period: days,
        totalOrders,
        totalRevenue,
        avgOrderValue,
        deliveredRate: totalOrders ? Math.round((deliveredCount / totalOrders) * 100) : 0,
        newUsers,
        dailyData,
        topCategories,
      });
    } catch (err) {
      res.status(500).json({ error: "حدث خطأ" });
    }
  });

  // ── Zones Management — REMOVED (H-64 / 3) ─────────────────────────────────
  //
  // `zones` was a second region system living beside `deliveryAreas`: its own
  // collection, its own admin CRUD (GET/POST/PUT/DELETE/toggle) and its own tab,
  // including its own "delivery fee" column. Nothing read it — not the order
  // pricing path, not the app, not any report — and it held zero documents.
  //
  // Two editable region lists, one of which silently does nothing, is exactly the
  // "more than one source of truth" this round exists to remove. `deliveryAreas`
  // is the single source: name, fee, active state, and it is what POST /api/orders
  // prices from and what the app reads from GET /api/delivery-areas.
  //
  // Manage regions through /api/admin/delivery-areas.

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

      // H-37: this had no .limit() at all. A PUBLIC, unauthenticated route read
      // EVERY rating for a store — each of which can carry a base64 image of up to
      // ~400 KB — and only then paginated in memory with .slice(). Anyone could
      // make the server load an unbounded amount of data, repeatedly, with no
      // credentials: a memory and Firestore-bill exhaustion vector.
      //
      // The read is now bounded. The cap sits far above any real store's rating
      // count, and the aggregates below (average, total, breakdown) are computed
      // over the capped set — for a store that ever exceeds it they become
      // "based on the most recent RATINGS_SCAN_CAP ratings" rather than all-time.
      // That is a deliberate trade: a slightly narrower statistic beats an
      // endpoint a stranger can use to exhaust the server.
      const snap = await query.limit(RATINGS_SCAN_CAP).get();
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
        // This endpoint is unauthenticated, so the full number was a bulk harvest of
        // reviewer phone numbers correlated to the stores they buy from. Every
        // consumer (StoreRatingsScreen, VendorAnalyticsScreen) renders only
        // `*****${phone.slice(-4)}`, so sending just those 4 digits is pixel-identical
        // while the number itself never leaves the server.
        customerPhone:   r.customerPhone ? String(r.customerPhone).slice(-4) : "",
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
      const decoded = jwt.verify(rawToken, ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
      if (decoded.role !== "customer" || !decoded.phoneNumber) throw new Error("invalid");
      if (isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) throw new Error("revoked");
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
      if (!sameLocalPhone(data.customerPhone, callerPhone)) return res.status(403).json({ error: "غير مصرح" });

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

      const updatedAt = Timestamp.now();
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
    // Auth: a valid vendor JWT is required, and the vendor may only reply to ratings
    // of THEIR OWN store. Previously this endpoint was unauthenticated, so anyone could
    // write a "vendor reply" on any store's rating (impersonation / spam).
    const vendorId = extractVendorId(req);
    if (!vendorId) return res.status(401).json({ error: "يرجى تسجيل الدخول كتاجر" });
    try {
      const db = getFirestore();
      if (!db) return res.status(503).json({ error: "DB unavailable" });

      const ratingId = req.params["id"] as string;
      const reply = typeof req.body.reply === "string" ? req.body.reply.trim().slice(0, 1000) : "";
      if (!reply) return res.status(400).json({ error: "الرد فارغ" });

      const ratingRef = db.collection("ratings").doc(ratingId);
      const ratingSnap = await ratingRef.get();
      if (!ratingSnap.exists) return res.status(404).json({ error: "التقييم غير موجود" });
      if ((ratingSnap.data() as any).vendorId !== vendorId) {
        return res.status(403).json({ error: "لا يمكنك الرد على تقييم متجر آخر" });
      }

      await ratingRef.update({
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
      // H-33: an empty list on an outage reads as "no ratings exist".
      if (!db) {
        console.error("[admin-ratings] unavailable: no database");
        return res.status(503).json({ error: "قاعدة البيانات غير متاحة" });
      }

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
      // H-33: this answered 200 with an empty list, so a query failure looked
      // exactly like "this store has no ratings".
      console.error("GET admin/ratings:", err);
      res.status(500).json({ error: "تعذّر تحميل التقييمات" });
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

      const now = Timestamp.now();
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
      const updates: any = { updatedAt: Timestamp.now() };

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

      const updates: any = { vendorId, updatedAt: Timestamp.now() };
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
  // The heartbeat cost controls this uses (locationFirestoreThrottle, the name
  // cache and the rate limiter) live beside driverLocations, since the HTTP
  // fallback at /api/driver/location shares them.

  // Socket.io uses the SAME origin policy as the REST API — isOriginAllowed()
  // and buildOriginPolicyFromEnv(), no second implementation.
  //
  // It previously had its own rule: `if (isProd && configured.length) return
  // configured; return "*"`. That is the very pattern removed from REST CORS in
  // C-12 — any NODE_ENV other than the exact string "production" (or a missing
  // ALLOWED_ORIGINS) opened the realtime channel to every website. Wildcard is
  // gone; nothing here consults NODE_ENV.
  //
  // A request with NO Origin header is allowed on purpose: that is a non-browser
  // client — every one of this app's socket consumers is React Native
  // (DriverHomeScreen, OrderTrackingScreen, AdminScreen, useSettlement) — and it
  // mirrors the REST middleware, which only evaluates the policy `if (origin)`.
  const socketOriginDecision = (origin: string | undefined, req?: IncomingMessage): boolean => {
    if (!origin) return true; // non-browser client (React Native)
    const fwd = req?.headers["x-forwarded-proto"];
    return isOriginAllowed(origin, {
      ...buildOriginPolicyFromEnv(),
      // Same-origin (Expo Web served from this server) needs no configuration,
      // exactly as in the REST layer.
      selfOrigin: req
        ? selfOriginFromHeaders(req.headers.host, Array.isArray(fwd) ? fwd[0] : fwd)
        : null,
    });
  };

  const ioServer = new SocketServer(httpServer, {
    cors: {
      // Emits Access-Control-Allow-Origin for allowed cross-origin polling only.
      // Same-origin requests need no CORS header, so no self-origin is required here.
      origin: (requestOrigin, callback) =>
        callback(null, !requestOrigin ? true : socketOriginDecision(requestOrigin) && requestOrigin),
      methods: ["GET", "POST"],
    },
    // The actual gate. Runs on every handshake (polling AND websocket, including
    // every reconnect) and, unlike the cors option, receives the request — so the
    // same-origin check has the Host header it needs.
    allowRequest: (req, done) => {
      const origin = req.headers.origin;
      if (socketOriginDecision(origin, req)) return done(null, true);
      console.warn(`[SOCKET] blocked handshake from origin=${origin}`);
      return done("origin_not_allowed", false);
    },
    transports: ["websocket", "polling"],
  });

  // SECURITY: authenticate the socket at handshake time.
  //
  // Every /api/driver/* HTTP route takes the driver identity ONLY from a signed
  // token (requireDriverAuth). The socket channel used to accept a plain
  // `phoneNumber` in the "driver:location" payload, which meant an anonymous
  // client could publish GPS coordinates as ANY driver — spoofing the live map
  // shown to customers AND persisting the forged position to Firestore. That
  // bypassed the entire driver-auth model over WebSocket.
  //
  // The handshake now verifies an optional Bearer/auth token and pins the
  // resulting identity onto the socket. Anonymous sockets are still allowed
  // (customers watch orders without a driver token) but they carry no driver
  // identity, so they cannot publish locations.
  ioServer.use((socket, next) => {
    const raw =
      (socket.handshake.auth as any)?.token ||
      (socket.handshake.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (raw) {
      try {
        const decoded = jwt.verify(String(raw), ROUTES_JWT_SECRET, JWT_VERIFY_OPTS) as any;
        (socket.data as any).role = decoded.role;
        if (decoded.role === "driver" && decoded.phoneNumber) {
          (socket.data as any).driverPhone = String(decoded.phoneNumber);
        }
        // H-10: the socket handshake is an authentication point too — without this
        // a revoked customer could still open a live connection and keep receiving
        // order events for as long as the socket stayed up.
        if (decoded.role === "customer" && decoded.phoneNumber
            && !isCustomerTokenRevoked(String(decoded.phoneNumber), decoded.iat)) {
          (socket.data as any).customerPhone = String(decoded.phoneNumber);
        }
      } catch {
        /* invalid/expired token → stay anonymous rather than dropping the socket */
      }
    }
    next();
  });

  // ── Real-time order STATUS updates ─────────────────────────────────────────
  // Any status change (admin/driver via updateOrderStatus, vendor via vendor.ts,
  // customer cancel) emits "order:status" on the orderEvents bus. We forward it to
  // the specific order's room (so a customer watching that order updates instantly)
  // and broadcast a lightweight "orders:changed" ping so list screens (vendor,
  // driver, admin, customer orders) can refetch immediately instead of waiting for
  // their next poll. Polling remains active as a fallback and is not removed.
  orderEvents.on("order:status", (payload: { orderId: string; status: string }) => {
    if (!payload?.orderId) return;
    // The room is ownership-gated by "order:watch", so the full payload is safe here.
    ioServer.to(`order:${payload.orderId}`).emit("order:status", payload);
    // H-38: this carried { orderId, status } to EVERY socket, and anonymous sockets
    // are permitted by design (a customer watches an order before signing in). That
    // let anyone who opened a socket read the platform's order flow live — which
    // order moved, to which state, at which second. It is a refresh PING: all four
    // consumers (OrderContext, VendorNotificationsContext, DriverHomeScreen,
    // AdminScreen) take no argument and simply refetch through their own
    // authenticated endpoints, so the payload was never read by anyone but an
    // observer. Same treatment as settlement:request below.
    //
    // DO NOT attach fields here. Anything added becomes world-readable.
    ioServer.emit("orders:changed");
  });

  // Real-time settlement events are a REFRESH PING ONLY — never a data channel.
  //
  // Anonymous sockets are permitted by design (customers watch orders without a
  // token), and `ioServer.emit` reaches every one of them. Forwarding the raw
  // payload therefore streamed each driver's phone number, full name and
  // outstanding balance to anybody who opened a socket. Both consumers
  // (client/hooks/useSettlement.ts, client/screens/AdminScreen.tsx) ignore the
  // payload and simply refetch through their authenticated HTTP endpoints, so
  // dropping it costs nothing and closes the channel.
  //
  // DO NOT add fields here. Anything attached becomes world-readable.
  orderEvents.on("settlement:request", () => {
    ioServer.emit("settlement:request");
    ioServer.emit("settlements:changed");
  });

  // Real-time settlement completion → driver/vendor status bars + admin refresh.
  orderEvents.on("settlement:changed", () => {
    ioServer.emit("settlements:changed");
  });

  ioServer.on("connection", (socket) => {
    // Customer joins a room to watch a specific order. Ownership is enforced:
    // the room streams live order status AND the driver's GPS position, so an
    // unauthenticated client must not be able to join an arbitrary order id.
    socket.on("order:watch", async ({ orderId }: { orderId: string }) => {
      if (!orderId) return;
      const callerPhone = (socket.data as any).customerPhone as string | undefined;
      const driverPhone = (socket.data as any).driverPhone as string | undefined;
      try {
        const order = (await getOrderById(orderId)) as any;
        if (!order) return;
        const ownerPhone = order.phoneNumber || order.customerPhone;
        // Allowed: the customer who placed it, or the driver assigned to it.
        const isOwner = !!callerPhone && ownerPhone === callerPhone;
        const isAssignedDriver = !!driverPhone && driverAssignments.get(orderId) === driverPhone;
        if (!isOwner && !isAssignedDriver) return;
        socket.join(`order:${orderId}`);
      } catch {
        /* lookup failure → do not join */
      }
    });

    // Driver publishes location. Identity comes ONLY from the verified handshake
    // token — never from the payload — so a client cannot publish as another driver.
    socket.on("driver:location", async ({
      lat, lng,
    }: { lat: number; lng: number }) => {
      const phoneNumber = (socket.data as any).driverPhone as string | undefined;
      if (!phoneNumber || lat === undefined || lng === undefined) return;

      // H-39: bound the event BEFORE any database work, or the limit protects
      // nothing — the read is the expensive part. A real client never reaches
      // this floor; only a loop does.
      const lastHeartbeat = locationRateLimit.get(phoneNumber) || 0;
      if (Date.now() - lastHeartbeat < LOCATION_MIN_INTERVAL) return;
      locationRateLimit.set(phoneNumber, Date.now());

      const fullName = await cachedDriverName(phoneNumber);
      if (fullName === null) return; // unknown or deleted driver — same as before

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



  // ── Admin: Seed demo stores and products (dev/staging only) ────────────────
  app.post("/api/admin/seed-demo-stores", async (_req: Request, res: Response) => {
    // H-68: this used to deny only when NODE_ENV was the exact string "production"
    // or REPLIT_DEPLOYMENT was exactly "1" — so an unset or differently-spelled
    // NODE_ENV fell straight through and the seed ran. `.replit` publishes without
    // setting NODE_ENV at all, which left the live catalogue one admin request away
    // from demo stores if REPLIT_DEPLOYMENT was not exactly "1".
    //
    // isDemoSeedAllowed() denies by default and requires an explicit opt-in plus a
    // positively-recognised development environment. Being an authenticated admin
    // is deliberately NOT part of it: this route already sits behind the global
    // requireAdminAuth, and the whole point is that admin rights must not be enough
    // to write demo data into production.
    if (!isDemoSeedAllowed()) {
      console.warn(`[SEED_BLOCKED] /api/admin/seed-demo-stores refused: ${demoSeedDenialReason()}`);
      return res.status(403).json({ error: "هذا الإجراء غير متاح في بيئة الإنتاج" });
    }
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const now = Timestamp.now();
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
          profileImageUrl: "https://picsum.photos/seed/onway-supermarket/400/400",
          coverImageUrl: "https://picsum.photos/seed/onway-supermarket-cover/800/400",
          bio: "سوبرماركت متكامل يوفر كل احتياجاتك اليومية بجودة عالية وأسعار مناسبة",
          products: [
            // خضروات وفواكه
            { name: "طماطم طازجة", description: "طماطم طازجة 1 كيلو مباشرة من المزرعة", price: 3000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 100, unit: "كيلو", imageUrl: "https://picsum.photos/seed/1546470427-e/400/400" },
            { name: "خيار", description: "خيار طازج 1 كيلو", price: 2500, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 80, unit: "كيلو", imageUrl: "https://picsum.photos/seed/144930007932/400/400" },
            { name: "فراولة طازجة", description: "فراولة طازجة 500 جرام موسمية", price: 6000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 40, unit: "علبة", imageUrl: "https://picsum.photos/seed/146496591186/400/400" },
            { name: "موز", description: "موز طازج 1 كيلو", price: 4000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 60, unit: "كيلو", imageUrl: "https://picsum.photos/seed/157177189482/400/400" },
            { name: "تفاح أحمر", description: "تفاح أحمر 1 كيلو", price: 5000, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 70, unit: "كيلو", imageUrl: "https://picsum.photos/seed/156730622641/400/400" },
            { name: "بطاطا", description: "بطاطا طازجة 1 كيلو", price: 2500, category: "الخضروات والفواكه", categoryId: "fruits-vegetables", stock: 90, unit: "كيلو", imageUrl: "https://picsum.photos/seed/151897767660/400/400" },
            // ألبان وأجبان
            { name: "حليب طازج", description: "حليب طازج كامل الدسم 1 لتر", price: 3500, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 50, unit: "لتر", imageUrl: "https://picsum.photos/seed/1550583724-b/400/400" },
            { name: "جبن أبيض", description: "جبن أبيض طازج 500 جرام", price: 5000, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 35, unit: "علبة", imageUrl: "https://picsum.photos/seed/148629767816/400/400" },
            { name: "بيض دجاج", description: "بيض دجاج بلدي 12 حبة", price: 6000, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 45, unit: "كرتونة", imageUrl: "https://picsum.photos/seed/158272287244/400/400" },
            { name: "لبن رائب", description: "لبن رائب كامل الدسم 500 جرام", price: 2500, category: "الألبان والأجبان", categoryId: "dairy-eggs", stock: 60, unit: "علبة", imageUrl: "https://picsum.photos/seed/1563636619-e/400/400" },
            // مشروبات
            { name: "ماء معدني", description: "ماء معدني نقي 1.5 لتر", price: 1000, category: "المشروبات", categoryId: "beverages", stock: 200, unit: "قارورة", imageUrl: "https://picsum.photos/seed/1548839140-2/400/400" },
            { name: "عصير برتقال طبيعي", description: "عصير برتقال طبيعي 1 لتر", price: 4000, category: "المشروبات", categoryId: "beverages", stock: 30, unit: "قارورة", imageUrl: "https://picsum.photos/seed/162150628993/400/400" },
            { name: "مشروب غازي", description: "مشروب غازي كولا 355 مل", price: 1500, category: "المشروبات", categoryId: "beverages", stock: 120, unit: "علبة", imageUrl: "https://picsum.photos/seed/162248376702/400/400" },
            { name: "عصير مانجا", description: "عصير مانجا طبيعي 1 لتر", price: 4500, category: "المشروبات", categoryId: "beverages", stock: 25, unit: "قارورة", imageUrl: "https://picsum.photos/seed/1546173159-3/400/400" },
            // سناكس
            { name: "شيبس مملح", description: "شيبس مقرمش بالملح 150 جرام", price: 2000, category: "سناكس ومقرمشات", categoryId: "snacks-sweets", stock: 80, unit: "كيس", imageUrl: "https://picsum.photos/seed/156647898903/400/400" },
            { name: "شوكولاتة حليب", description: "شوكولاتة بالحليب 100 جرام", price: 3000, category: "سناكس ومقرمشات", categoryId: "snacks-sweets", stock: 60, unit: "قطعة", imageUrl: "https://picsum.photos/seed/1548907040-4/400/400" },
            { name: "بسكويت شاي", description: "بسكويت للشاي 400 جرام", price: 2500, category: "سناكس ومقرمشات", categoryId: "snacks-sweets", stock: 70, unit: "علبة", imageUrl: "https://picsum.photos/seed/1558961363-f/400/400" },
            // شاي وقهوة
            { name: "شاي أسود", description: "شاي أسود فاخر 200 جرام", price: 5000, category: "شاي وقهوة", categoryId: "tea-coffee", stock: 40, unit: "علبة", imageUrl: "https://picsum.photos/seed/1556679343-c/400/400" },
            { name: "قهوة عربية", description: "قهوة عربية أصيلة بالهيل 250 جرام", price: 8000, category: "شاي وقهوة", categoryId: "tea-coffee", stock: 25, unit: "علبة", imageUrl: "https://picsum.photos/seed/150904223986/400/400" },
            { name: "نسكافيه", description: "نسكافيه كلاسيك 200 جرام", price: 9000, category: "شاي وقهوة", categoryId: "tea-coffee", stock: 30, unit: "علبة", imageUrl: "https://picsum.photos/seed/149880410307/400/400" },
            // منظفات
            { name: "سائل غسيل ملابس", description: "سائل غسيل قوي 3 لتر", price: 7000, category: "المنظفات", categoryId: "cleaning-care", stock: 35, unit: "قارورة", imageUrl: "https://picsum.photos/seed/158542151473/400/400" },
            { name: "صابون يدين", description: "صابون سائل لليدين 500 مل", price: 3000, category: "المنظفات", categoryId: "cleaning-care", stock: 50, unit: "قارورة", imageUrl: "https://picsum.photos/seed/158451593348/400/400" },
            { name: "منظف للأرضيات", description: "منظف أرضيات بعطر الليمون 2 لتر", price: 5000, category: "المنظفات", categoryId: "cleaning-care", stock: 28, unit: "قارورة", imageUrl: "https://picsum.photos/seed/1558618666-f/400/400" },
            // مواد غذائية
            { name: "أرز بسمتي", description: "أرز بسمتي فاخر 5 كيلو", price: 12000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 40, unit: "كيس", imageUrl: "https://picsum.photos/seed/158620137576/400/400" },
            { name: "زيت نباتي", description: "زيت نباتي صافي 1.5 لتر", price: 8000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 45, unit: "قارورة", imageUrl: "https://picsum.photos/seed/147497926640/400/400" },
            { name: "دقيق قمح", description: "دقيق قمح أبيض 2 كيلو", price: 6000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 55, unit: "كيس", imageUrl: "https://picsum.photos/seed/157432334740/400/400" },
            { name: "سكر أبيض", description: "سكر أبيض ناعم 2 كيلو", price: 5000, category: "المواد الغذائية", categoryId: "food-supplies", stock: 60, unit: "كيس", imageUrl: "https://picsum.photos/seed/1558618666-f/400/400" },
          ],
        },
        // ── مطعم الرائد ────────────────────────────────────────────────────────
        {
          storeName: "مطعم الرائد العراقي",
          businessType: "restaurant",
          ownerName: "محمد الرائد",
          phoneNumber: "07700000002",
          address: "شارع المتنبي، بغداد",
          profileImageUrl: "https://picsum.photos/seed/iraqi-restaurant/400/400",
          coverImageUrl: "https://picsum.photos/seed/iraqi-restaurant-cover/800/400",
          bio: "مطعم عراقي أصيل يقدم أشهى الأكلات التراثية بنكهات عراقية حقيقية",
          products: [
            { name: "كباب عراقي", description: "كباب لحم مشوي مع الخبز العراقي وصحن السلطة", price: 12000, category: "المشويات", categoryId: "restaurants", stock: 50, unit: "وجبة", imageUrl: "https://picsum.photos/seed/152969223667/400/400" },
            { name: "تكا مشوية", description: "تكا لحم بقري مشوي على الجمر 4 قطع", price: 15000, category: "المشويات", categoryId: "restaurants", stock: 40, unit: "وجبة", imageUrl: "https://picsum.photos/seed/1544025162-d/400/400" },
            { name: "قوزي عراقي", description: "قوزي لحم ضأن مع الأرز والزبيب", price: 25000, category: "الأكلات العراقية", categoryId: "restaurants", stock: 20, unit: "وجبة", imageUrl: "https://picsum.photos/seed/157448428400/400/400" },
            { name: "دولمة عراقية", description: "دولمة محشية بالأرز واللحم المفروم", price: 14000, category: "الأكلات العراقية", categoryId: "restaurants", stock: 30, unit: "طبق", imageUrl: "https://picsum.photos/seed/151200386769/400/400" },
            { name: "مسقوف", description: "سمك مسقوف طازج مشوي على الجمر", price: 22000, category: "الأسماك", categoryId: "restaurants", stock: 15, unit: "وجبة", imageUrl: "https://picsum.photos/seed/146700390958/400/400" },
            { name: "شوربة عراقية", description: "شوربة لحم مع الخضروات الطازجة", price: 7000, category: "الشوربات", categoryId: "restaurants", stock: 35, unit: "طبق", imageUrl: "https://picsum.photos/seed/1547592180-8/400/400" },
            { name: "برياني دجاج", description: "برياني دجاج بالبهارات الهندية مع الزبيب", price: 13000, category: "الأرز", categoryId: "restaurants", stock: 25, unit: "وجبة", imageUrl: "https://picsum.photos/seed/156337909133/400/400" },
            { name: "فلافل وحمص", description: "فلافل مقرمش مع حمص وخبز عربي", price: 5000, category: "المقبلات", categoryId: "restaurants", stock: 60, unit: "طبق", imageUrl: "https://picsum.photos/seed/159300187411/400/400" },
            { name: "جوزة مشوية", description: "جوزة دجاج كاملة مع البهارات والليمون", price: 18000, category: "الدجاج", categoryId: "restaurants", stock: 20, unit: "وجبة", imageUrl: "https://picsum.photos/seed/159810344209/400/400" },
            { name: "لقيمات بالعسل", description: "لقيمات عراقية أصيلة مع العسل والسمسم", price: 6000, category: "الحلويات", categoryId: "restaurants", stock: 40, unit: "طبق", imageUrl: "https://picsum.photos/seed/1551024506-0/400/400" },
          ],
        },
        // ── مطعم الشاورما الذهبي ────────────────────────────────────────────────
        {
          storeName: "مطعم الشاورما الذهبي",
          businessType: "restaurant",
          ownerName: "كريم الشاورماجي",
          phoneNumber: "07700000004",
          address: "شارع الكرادة، بغداد",
          profileImageUrl: "https://picsum.photos/seed/shawarma-restaurant/400/400",
          coverImageUrl: "https://picsum.photos/seed/shawarma-restaurant-cover/800/400",
          bio: "أشهى شاورما وبرغر في بغداد — مكونات طازجة، نكهات لا تُنسى",
          products: [
            // شاورما
            { name: "شاورما دجاج", description: "شاورما دجاج مشوي بالخبز العربي مع صوص الثوم والخضار الطازجة", price: 7000, category: "شاورما", categoryId: "restaurants", stock: 80, unit: "ساندويتش", imageUrl: "https://picsum.photos/seed/1561050501-a/400/400" },
            { name: "شاورما لحم", description: "شاورما لحم غنم مشوي بالبهارات والليمون وصوص الطحينة", price: 9000, category: "شاورما", categoryId: "restaurants", stock: 60, unit: "ساندويتش", imageUrl: "https://picsum.photos/seed/152969223667/400/400" },
            { name: "شاورما مشكل", description: "شاورما دجاج ولحم معاً مع صوص الثوم والحار", price: 10000, category: "شاورما", categoryId: "restaurants", stock: 50, unit: "ساندويتش", imageUrl: "https://picsum.photos/seed/151736098139/400/400" },
            { name: "صحن شاورما", description: "شاورما دجاج مقطعة مع خبز وبطاطا مقلية وسلطة", price: 14000, category: "شاورما", categoryId: "restaurants", stock: 40, unit: "صحن", imageUrl: "https://picsum.photos/seed/1556269923-e/400/400" },
            // برغر
            { name: "برغر كلاسيك", description: "برغر لحم بقري 180 جرام مع جبن، خس، طماطم، وصوص خاص", price: 11000, category: "برغر", categoryId: "restaurants", stock: 55, unit: "ساندويتش", imageUrl: "https://picsum.photos/seed/156890134637/400/400" },
            { name: "برغر دبل", description: "دبل برغر لحم مع دبل جبن وبيضة مقلية وصوص BBQ", price: 15000, category: "برغر", categoryId: "restaurants", stock: 40, unit: "ساندويتش", imageUrl: "https://picsum.photos/seed/160701325137/400/400" },
            { name: "برغر دجاج كريسبي", description: "فيليه دجاج مقرمش مقلي مع صوص الحار والخس", price: 10000, category: "برغر", categoryId: "restaurants", stock: 50, unit: "ساندويتش", imageUrl: "https://picsum.photos/seed/158732931068/400/400" },
            // وجبات
            { name: "وجبة برغر + بطاطا + مشروب", description: "برغر كلاسيك مع بطاطا مقلية كبيرة ومشروب غازي 500 مل", price: 16000, category: "وجبات", categoryId: "restaurants", stock: 45, unit: "وجبة", imageUrl: "https://picsum.photos/seed/159421269990/400/400" },
            { name: "وجبة شاورما + بطاطا + مشروب", description: "شاورما دجاج مع بطاطا مقلية ومشروب غازي", price: 13000, category: "وجبات", categoryId: "restaurants", stock: 50, unit: "وجبة", imageUrl: "https://picsum.photos/seed/151344254225/400/400" },
            { name: "عائلي شاورما (4 أشخاص)", description: "4 ساندويتشات شاورما مشكل + 4 بطاطا + 4 مشروبات", price: 45000, category: "وجبات عائلية", categoryId: "restaurants", stock: 20, unit: "طلبية", imageUrl: "https://picsum.photos/seed/1555396273-3/400/400" },
            // إضافات وسلطات
            { name: "بطاطا مقلية كبيرة", description: "بطاطا مقلية مقرمشة مع صوص الكيتشب والمايونيز", price: 4000, category: "إضافات", categoryId: "restaurants", stock: 100, unit: "طبق", imageUrl: "https://picsum.photos/seed/157610723268/400/400" },
            { name: "سلطة عربية", description: "طماطم، خيار، بصل، بقدونس مع زيت زيتون وليمون", price: 3500, category: "سلطات", categoryId: "restaurants", stock: 60, unit: "طبق", imageUrl: "https://picsum.photos/seed/151262177695/400/400" },
            { name: "صوص ثوم كبير", description: "صوص ثوم كريمي منزلي الصنع 200 مل", price: 2500, category: "إضافات", categoryId: "restaurants", stock: 80, unit: "علبة", imageUrl: "https://picsum.photos/seed/147247644350/400/400" },
            // مشروبات
            { name: "عصير ليمون بالنعناع", description: "عصير ليمون طازج بالنعناع والثلج 500 مل", price: 3500, category: "مشروبات", categoryId: "restaurants", stock: 70, unit: "كوب", imageUrl: "https://picsum.photos/seed/162150628993/400/400" },
            { name: "ميلك شيك شوكولاتة", description: "ميلك شيك شوكولاتة بالآيس كريم والكريمة", price: 5000, category: "مشروبات", categoryId: "restaurants", stock: 35, unit: "كوب", imageUrl: "https://picsum.photos/seed/157249012274/400/400" },
          ],
        },
        // ── صيدلية الشفاء ──────────────────────────────────────────────────────
        {
          storeName: "صيدلية الشفاء",
          businessType: "pharmacy",
          ownerName: "د. علي الشفاء",
          phoneNumber: "07700000003",
          address: "شارع حيفا، بغداد",
          profileImageUrl: "https://picsum.photos/seed/pharmacy-store/400/400",
          coverImageUrl: "https://picsum.photos/seed/pharmacy-store-cover/800/400",
          bio: "صيدلية متكاملة توفر الأدوية ومستلزمات العناية الصحية بأسعار مناسبة",
          products: [
            { name: "باراسيتامول 500 مغ", description: "أقراص مسكن للألم وخافض للحرارة 20 قرص", price: 3500, category: "مسكنات الألم", categoryId: "pharmacy", stock: 100, unit: "علبة", imageUrl: "https://picsum.photos/seed/158430866674/400/400" },
            { name: "فيتامين سي 1000", description: "فيتامين سي أقراص فوارة لتعزيز المناعة", price: 8000, category: "الفيتامينات", categoryId: "pharmacy", stock: 60, unit: "علبة", imageUrl: "https://picsum.photos/seed/1550572017-e/400/400" },
            { name: "بانادول اكسترا", description: "مسكن قوي للصداع وآلام الجسم", price: 4500, category: "مسكنات الألم", categoryId: "pharmacy", stock: 80, unit: "علبة", imageUrl: "https://picsum.photos/seed/1559757175-0/400/400" },
            { name: "كريم ترطيب يومي", description: "كريم مرطب للبشرة الجافة 100 مل", price: 12000, category: "العناية بالبشرة", categoryId: "pharmacy", stock: 35, unit: "قارورة", imageUrl: "https://picsum.photos/seed/1556228720-1/400/400" },
            { name: "شامبو للشعر الجاف", description: "شامبو مرطب للشعر الجاف والتالف 400 مل", price: 9000, category: "العناية بالشعر", categoryId: "pharmacy", stock: 40, unit: "قارورة", imageUrl: "https://picsum.photos/seed/157178244257/400/400" },
            { name: "كمامات طبية", description: "كمامات طبية ثلاثية الطبقات 50 قطعة", price: 7000, category: "مستلزمات طبية", categoryId: "pharmacy", stock: 55, unit: "علبة", imageUrl: "https://picsum.photos/seed/158455681295/400/400" },
            { name: "جل مطهر لليدين", description: "جل كحولي مطهر لليدين 300 مل", price: 5000, category: "مستلزمات طبية", categoryId: "pharmacy", stock: 70, unit: "قارورة", imageUrl: "https://picsum.photos/seed/158436291716/400/400" },
            { name: "ضمادات طبية", description: "ضمادات لاصقة معقمة مختلفة الأحجام 20 قطعة", price: 3000, category: "مستلزمات طبية", categoryId: "pharmacy", stock: 90, unit: "علبة", imageUrl: "https://picsum.photos/seed/163154991676/400/400" },
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
            categoryId: store.businessType,
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
            approvedAt: now,
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
      res.status(500).json({ error: "فشل إنشاء البيانات التجريبية" });
    }
  });


  // ── C-01: archive / monthly reset ──────────────────────────────────────────
  //
  // This route was named "archive old completed/cancelled orders (older than 1
  // month)" and the comment inside it read `// 1. Delete ALL orders regardless of
  // status`. There was no date filter, no status filter, no confirmation token, no
  // dry run and no backup: an unqualified `DELETE` with no body erased every order,
  // every walletHistory entry, every driverActivityLog and driverCompletedOrders
  // row, every adminAlert, and reset EVERY driver wallet balance to zero.
  //
  // The capability is intended — templates/admin.html has a "تصفير ومسح بيانات
  // الشهر" button — but the only thing standing between a live platform and total,
  // irreversible loss was a browser confirm(). Anything reaching the route without
  // it (a retry, a cached page, a script, a stolen session) wiped everything.
  //
  // The route now refuses to destroy anything unless the caller says exactly what
  // it wants:
  //   • DRY RUN IS THE DEFAULT. No body, or dryRun !== false → counts only, zero
  //     writes. This alone removes the accidental-wipe path.
  //   • scope "archive" (default) deletes ONLY orders that are BOTH older than
  //     olderThanDays AND in a terminal status. Money-bearing collections
  //     (walletHistory, driverCompletedOrders, driverWallets) are never touched.
  //   • scope "all" is the monthly reset and still does what the button promises,
  //     but demands its own confirmation string, so an "archive" call can never
  //     escalate into a full wipe.
  //   • olderThanDays is validated and floored, so today's orders are unreachable.
  //   • maxDeletes caps one call's blast radius; exceeding it is refused, not
  //     truncated, so the operator narrows the window deliberately.
  const ARCHIVE_TERMINAL_STATUSES = ["delivered", "cancelled"];
  const ARCHIVE_MIN_AGE_DAYS = 30;
  const ARCHIVE_DEFAULT_MAX_DELETES = 5000;
  const ARCHIVE_CONFIRM = "ARCHIVE";

  app.delete("/api/admin/archive-old-orders", async (req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "Firestore not initialized" });

      const body = (req.body ?? {}) as Record<string, unknown>;
      const scope = body.scope === "all" ? "all" : "archive";
      // Destructive by opt-in only: anything other than an explicit `false` is a
      // dry run, so a malformed or truncated body can never delete.
      const dryRun = body.dryRun !== false;
      const confirm = typeof body.confirm === "string" ? body.confirm : "";
      const adminUser = getSessionUsername(req) || "unknown";

      const maxDeletes = (() => {
        const n = Number(body.maxDeletes);
        if (!Number.isFinite(n) || n <= 0) return ARCHIVE_DEFAULT_MAX_DELETES;
        return Math.min(Math.floor(n), ARCHIVE_DEFAULT_MAX_DELETES);
      })();

      const batchSize = 500;

      // ── scope "archive": old AND terminal only ────────────────────────────
      if (scope === "archive") {
        const rawDays = body.olderThanDays === undefined ? ARCHIVE_MIN_AGE_DAYS : Number(body.olderThanDays);
        if (!Number.isFinite(rawDays) || rawDays < ARCHIVE_MIN_AGE_DAYS) {
          return res.status(400).json({
            error: `olderThanDays يجب أن يكون رقماً لا يقل عن ${ARCHIVE_MIN_AGE_DAYS} يوماً`,
          });
        }
        const olderThanDays = Math.floor(rawDays);
        const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);

        // createdAt-only inequality: served by the automatic single-field index, so
        // this needs no new composite index. Status is filtered in memory, which is
        // safe because the read is capped at maxDeletes + 1.
        const candidates = await db.collection("orders")
          .where("createdAt", "<", cutoff)
          .orderBy("createdAt", "asc")
          .limit(maxDeletes + 1)
          .get();

        const archivable = candidates.docs.filter((d) =>
          ARCHIVE_TERMINAL_STATUSES.includes(String((d.data() as any)?.status)));

        // Refuse, never truncate. Two ways the selection can be too large:
        //   • more archivable rows than the cap — unambiguous;
        //   • the candidate window came back saturated (maxDeletes + 1 rows), in
        //     which case archivable is only a LOWER BOUND — non-terminal orders
        //     consumed slots, so more archivable rows may lie beyond the window.
        // Deleting in that state would silently do part of the job and report a
        // number the operator would read as "all of it".
        if (archivable.length > maxDeletes || candidates.size > maxDeletes) {
          return res.status(409).json({
            error: `المحدَّد يتجاوز السقف (${maxDeletes}). ضيّق النطاق الزمني أو ارفع maxDeletes.`,
            wouldDelete: { orders: `${archivable.length}+` },
            scanned: candidates.size,
          });
        }

        const staleAlerts = await db.collection("adminAlerts")
          .where("createdAt", "<", cutoff)
          .limit(maxDeletes)
          .get();

        if (dryRun || confirm !== ARCHIVE_CONFIRM) {
          if (!dryRun && confirm !== ARCHIVE_CONFIRM) {
            return res.status(400).json({
              error: `للتنفيذ الفعلي أرسل confirm: "${ARCHIVE_CONFIRM}"`,
              dryRun: true,
              wouldDelete: { orders: archivable.length, adminAlerts: staleAlerts.size },
            });
          }
          return res.json({
            dryRun: true,
            scope,
            olderThanDays,
            cutoff: cutoff.toISOString(),
            statuses: ARCHIVE_TERMINAL_STATUSES,
            wouldDelete: { orders: archivable.length, adminAlerts: staleAlerts.size },
            preserved: ["walletHistory", "driverCompletedOrders", "driverWallets", "driverActivityLog"],
            message: `تشغيل تجريبي — لم يُحذف شيء. سيُحذف ${archivable.length} طلب منتهٍ أقدم من ${olderThanDays} يوماً.`,
          });
        }

        const deleteDocs = async (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
          let n = 0;
          for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db!.batch();
            for (const d of docs.slice(i, i + batchSize)) batch.delete(d.ref);
            await batch.commit();
            n += Math.min(batchSize, docs.length - i);
          }
          return n;
        };

        console.warn(
          `[ARCHIVE] admin=${adminUser} scope=archive olderThanDays=${olderThanDays} ` +
          `orders=${archivable.length} adminAlerts=${staleAlerts.size}`,
        );
        const deletedOrders = await deleteDocs(archivable);
        const deletedAlerts = await deleteDocs(staleAlerts.docs as any);
        await recordAudit({
          action: "admin.archive_old_orders",
          actorType: "admin",
          actorUsername: adminUser,
          targetType: "orders",
          metadata: {
            scope: "archive",
            olderThanDays,
            deletedOrders,
            deletedAlerts,
          },
          notes: "bounded archive of terminal orders; financial collections preserved",
        });

        return res.json({
          dryRun: false,
          scope,
          olderThanDays,
          cutoff: cutoff.toISOString(),
          deleted: { orders: deletedOrders, adminAlerts: deletedAlerts },
          preserved: ["walletHistory", "driverCompletedOrders", "driverWallets", "driverActivityLog"],
          message: `تمت أرشفة ${deletedOrders} طلب منتهٍ أقدم من ${olderThanDays} يوماً. السجلات المالية لم تُمسّ.`,
        });
      }

      // C-01: full-platform reset is permanently disabled. There is no safe,
      // production-grade backup/export-and-restore workflow in this application,
      // so retaining a destructive branch behind a magic string would still be a
      // release blocker. The supported archive scope above is bounded, terminal-only,
      // dry-run-by-default, capped, and never touches financial collections.
      return res.status(410).json({
        error: "التصفير الشامل معطّل نهائياً؛ استخدم الأرشفة المحدودة بعد تشغيل تجريبي",
      });
    } catch (error: any) {
      console.error("[API]", error?.message);
      res.status(500).json({ error: GENERIC_SERVER_ERROR });
    }
  });

  // ── GET /api/admin/storage-stats ──────────────────────────────────────────
  app.get("/api/admin/storage-stats", async (_req: Request, res: Response) => {
    try {
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });

      const snap = await db.collection("vendorProducts").get();
      let totalImages = 0;
      let totalThumbs = 0;
      let activeProducts = 0;
      const vendorImageCount: Record<string, { storeName: string; imageCount: number }> = {};

      for (const doc of snap.docs) {
        const data = doc.data() as any;
        if (data.status === "deleted") continue;
        activeProducts++;
        const fullCount: number = data.imageUrls?.length ?? (data.imageUrl ? 1 : 0);
        const thumbCount: number = data.imageThumbs?.length ?? 0;
        totalImages += fullCount;
        totalThumbs += thumbCount;
        const vid: string | undefined = data.vendorId;
        if (vid) {
          if (!vendorImageCount[vid]) {
            vendorImageCount[vid] = { storeName: data.storeName ?? data.vendorName ?? vid, imageCount: 0 };
          }
          vendorImageCount[vid].imageCount += fullCount;
        }
      }

      const topStores = Object.entries(vendorImageCount)
        .map(([id, v]) => ({ vendorId: id, storeName: v.storeName, imageCount: v.imageCount }))
        .sort((a, b) => b.imageCount - a.imageCount)
        .slice(0, 10);

      console.info(`[Storage] stats computed: ${activeProducts} products, ${totalImages} images, ${totalThumbs} thumbs`);
      res.json({ totalProducts: activeProducts, totalImages, totalThumbs, topStores, computedAt: new Date().toISOString() });
    } catch (err) {
      console.error("storage-stats:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── Website CMS ─────────────────────────────────────────────────────────────
  // Public collection: websiteContent/{section}
  // Admin routes are protected automatically by the global requireAdminAuth middleware
  // applied to /api/admin/* above.

  const CMS_SECTIONS = [
    "hero", "features", "stats", "faq",
    "downloadLinks", "screenshots", "contact", "seo", "footer",
  ] as const;
  type CmsSection = typeof CMS_SECTIONS[number];

  // In-memory cache — invalidated on every admin write
  let cmsPublicCache: { data: Record<string, any>; expiresAt: number } | null = null;

  async function getAllCmsContent(): Promise<Record<string, any>> {
    const db = getFirestore();
    if (!db) return {};
    const result: Record<string, any> = {};
    await Promise.all(
      CMS_SECTIONS.map(async (section) => {
        const doc = await db.collection("websiteContent").doc(section).get();
        result[section] = doc.exists ? { id: doc.id, ...doc.data() } : null;
      })
    );
    return result;
  }

  // ── Public endpoints (no auth) ─────────────────────────────────────────────

  // GET /api/website-content — all sections, 60-second cache
  app.get("/api/website-content", async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      if (cmsPublicCache && cmsPublicCache.expiresAt > now) {
        res.set("Cache-Control", "public, max-age=60");
        return res.json(cmsPublicCache.data);
      }
      const data = await getAllCmsContent();
      cmsPublicCache = { data, expiresAt: now + 60_000 };
      res.set("Cache-Control", "public, max-age=60");
      return res.json(data);
    } catch (err) {
      console.error("GET /api/website-content:", err);
      return res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // GET /api/website-content/:section
  app.get("/api/website-content/:section", async (req: Request, res: Response) => {
    try {
      const section = String(req.params.section);
      if (!CMS_SECTIONS.includes(section as CmsSection)) {
        return res.status(404).json({ error: "القسم غير موجود" });
      }
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const doc = await db.collection("websiteContent").doc(section).get();
      if (!doc.exists) return res.json(null);
      res.set("Cache-Control", "public, max-age=60");
      return res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
      console.error("GET /api/website-content/:section:", err);
      return res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // ── Admin endpoints (protected by requireAdminAuth applied to /api/admin/*) ─

  // GET /api/admin/website-cms — all sections (no cache for admin)
  app.get("/api/admin/website-cms", async (_req: Request, res: Response) => {
    try {
      const data = await getAllCmsContent();
      return res.json(data);
    } catch (err) {
      console.error("GET /api/admin/website-cms:", err);
      return res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // GET /api/admin/website-cms/:section
  app.get("/api/admin/website-cms/:section", async (req: Request, res: Response) => {
    try {
      const section = String(req.params.section);
      if (!CMS_SECTIONS.includes(section as CmsSection)) {
        return res.status(404).json({ error: "القسم غير موجود" });
      }
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      const doc = await db.collection("websiteContent").doc(section).get();
      if (!doc.exists) return res.json(null);
      return res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
      console.error("GET /api/admin/website-cms/:section:", err);
      return res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  });

  // PUT /api/admin/website-cms/:section — update text content
  app.put("/api/admin/website-cms/:section", async (req: Request, res: Response) => {
    try {
      const section = String(req.params.section);
      if (!CMS_SECTIONS.includes(section as CmsSection)) {
        return res.status(404).json({ error: "القسم غير موجود" });
      }
      const db = getFirestore();
      if (!db) return res.status(500).json({ error: "قاعدة البيانات غير متاحة" });
      // H-17: this used to be `{ ...req.body, updatedAt }` — an unvalidated admin
      // payload written straight into a PUBLICLY served document. Only the fields
      // each section actually has are accepted now, with lengths, array caps and a
      // markup guard; anything else fails the parse. `parsed.data` is the schema's
      // own output object, never the caller's.
      const parsed = parseWebsiteContent(section as CmsSection, req.body);
      if (!parsed.ok) {
        return res.status(400).json({ error: "بيانات غير صالحة", fields: parsed.fields });
      }
      const payload = { ...parsed.data, updatedAt: Timestamp.now() };
      await db.collection("websiteContent").doc(section).set(payload, { merge: true });
      cmsPublicCache = null; // invalidate public cache
      return res.json({ success: true });
    } catch (err) {
      console.error("PUT /api/admin/website-cms/:section:", err);
      return res.status(500).json({ error: "حدث خطأ في الحفظ" });
    }
  });

  // POST /api/admin/website-cms/:section/image — upload to Firebase Storage
  app.post(
    "/api/admin/website-cms/:section/image",
    uploadWebP.single("image"),
    async (req: Request, res: Response) => {
      try {
        const section = String(req.params.section);
        if (!CMS_SECTIONS.includes(section as CmsSection)) {
          return res.status(404).json({ error: "القسم غير موجود" });
        }
        if (!req.file) return res.status(400).json({ error: "لم يتم رفع أي صورة" });

        const detected = detectedUploadImageMime(req.file);
        if (!detected) {
          return res.status(400).json({ error: "نوع الملف غير مدعوم — محتوى الصورة غير صالح" });
        }

        // H-17: `field` came straight from the request body, so any key at all could
        // be created in the public document — including one that overwrites text
        // content with an image URL. Only this section's own image fields are
        // allowed; the UIs' no-persist sentinels are accepted and skip the write.
        const field = typeof req.body?.field === "string" ? req.body.field : "imageUrl";
        const persistField =
          (CMS_IMAGE_FIELDS[section as CmsSection] as readonly string[]).includes(field);
        if (!persistField && !(CMS_IMAGE_NO_PERSIST as readonly string[]).includes(field)) {
          return res.status(400).json({ error: "حقل الصورة غير مسموح لهذا القسم" });
        }
        const webpBuffer = await sharp(req.file.buffer).webp({ quality: 85 }).toBuffer();
        const hash = createHash("sha256").update(webpBuffer).digest("hex");

        // Storage is provisioned — no Base64 fallback. A CMS image stored as a data
        // URI is written straight into the websiteContent document and ships with
        // every read of it.
        const url = await uploadToFirebaseStorage(webpBuffer, `website-cms/${section}/${hash}.webp`);

        // Persist URL to Firestore only for named fields (not screenshots "temp")
        const db = getFirestore();
        if (db && persistField) {
          await db.collection("websiteContent").doc(section).set(
            { [field]: url, updatedAt: Timestamp.now() },
            { merge: true }
          );
        }
        cmsPublicCache = null;
        return res.json({ url });
      } catch (err) {
        console.error("POST /api/admin/website-cms/:section/image:", err);
        return res.status(500).json({ error: "فشل في رفع الصورة" });
      }
    }
  );

  // DELETE /api/admin/website-cms/image — remove from Storage + clear Firestore field
  app.delete("/api/admin/website-cms/image", async (req: Request, res: Response) => {
    try {
      const { url, section, field } = req.body as { url?: string; section?: string; field?: string };
      if (!url) return res.status(400).json({ error: "الرابط مطلوب" });
      await deleteFromFirebaseStorage(url);
      // H-17: same allowlist as the upload route. `field: "__array__"` — which the
      // admin panel sends when removing a screenshot — used to be written into the
      // document as a junk key; it is a no-persist sentinel and is now skipped.
      const allowedField =
        !!section &&
        isCmsSection(section) &&
        !!field &&
        (CMS_IMAGE_FIELDS[section] as readonly string[]).includes(field);
      if (allowedField) {
        const db = getFirestore();
        if (db) {
          await db.collection("websiteContent").doc(section as CmsSection).set(
            { [field as string]: "", updatedAt: Timestamp.now() },
            { merge: true }
          );
        }
      }
      cmsPublicCache = null;
      return res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/admin/website-cms/image:", err);
      return res.status(500).json({ error: "فشل في حذف الصورة" });
    }
  });

  // ── End Website CMS ──────────────────────────────────────────────────────────

  // H-45: gracefulShutdown closed only the HTTP server. Socket.IO kept every
  // client connected, so httpServer.close() could never drain and the 10s
  // force-exit timer was what actually ended the process — killing in-flight
  // requests. The background jobs were never stopped either. Both are released
  // here, in order: stop scheduling new work, then disconnect clients, so no job
  // can fire against a half-closed server.
  (httpServer as any).onwayShutdown = async (): Promise<void> => {
    for (const t of backgroundTimers) clearInterval(t);
    backgroundTimers.length = 0;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      // close() disconnects every socket and closes the underlying engine.
      ioServer.close(done);
      // Never let a stuck client hold the shutdown open.
      setTimeout(done, 3_000).unref();
    });
  };

  return httpServer;

}

