/**
 * OnWay — Seed Data Script
 * Run: npx ts-node server/seed-data.ts
 *
 * - Skips records that already exist (no duplicates, no deletes).
 * - Reports totals at the end.
 */

import admin from "firebase-admin";
import * as dotenv from "dotenv";
dotenv.config();

// ── Firebase init ──────────────────────────────────────────────────────────────
function initDB(): admin.firestore.Firestore {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is missing");
  const sa = JSON.parse(json);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

const db = initDB();
const now = admin.firestore.Timestamp.now();
const IMG = (id: string) => `https://images.unsplash.com/${id}?w=400&q=80`;

// ── Counters ───────────────────────────────────────────────────────────────────
let addedVendors = 0, addedProducts = 0, addedCategories = 0;
let addedBanners = 0, addedPromoCodes = 0, addedSections = 0;

// ── Helpers ────────────────────────────────────────────────────────────────────
async function upsertDoc(
  col: string, id: string, data: Record<string, unknown>, counter: () => void
) {
  const ref = db.collection(col).doc(id);
  const snap = await ref.get();
  if (snap.exists) return;
  await ref.set(data);
  counter();
}

async function addDocIfNew(
  col: string,
  uniqueField: string,
  uniqueValue: string,
  data: Record<string, unknown>,
  counter: () => void
): Promise<string> {
  const snap = await db.collection(col).where(uniqueField, "==", uniqueValue).limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  const ref = await db.collection(col).add(data);
  counter();
  return ref.id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════
const CATEGORIES: Record<string, { name: string; image: string; order: number; color: string; iconColor: string }> = {
  restaurants:       { name: "المطاعم",           image: IMG("photo-1555396273-367ea4eb4db5"), order: 1,  color: "#FFF3E0", iconColor: "#E86520" },
  burgers:           { name: "برغر",               image: IMG("photo-1568901346375-23c9450c58cd"), order: 2,  color: "#FFF3E0", iconColor: "#D84315" },
  pizza:             { name: "بيتزا",              image: IMG("photo-1574071318508-1cdbab80d002"), order: 3,  color: "#FCE4EC", iconColor: "#C62828" },
  grills:            { name: "مشويات",             image: IMG("photo-1544025162-d76694265947"), order: 4,  color: "#F3E5F5", iconColor: "#6A1B9A" },
  chicken:           { name: "دجاج",              image: IMG("photo-1598103442097-8b74394b95c6"), order: 5,  color: "#FFF8E1", iconColor: "#F57F17" },
  shawarma:          { name: "شاورما",             image: IMG("photo-1529006557810-274b9b2fc783"), order: 6,  color: "#E8F5E9", iconColor: "#2E7D32" },
  sweets:            { name: "حلويات",             image: IMG("photo-1551024601-bec78aea704b"), order: 7,  color: "#FCE4EC", iconColor: "#AD1457" },
  bakery:            { name: "مخابز",              image: IMG("photo-1509440159596-0249088772ff"), order: 8,  color: "#FFF3E0", iconColor: "#BF360C" },
  cafe:              { name: "كافيهات",            image: IMG("photo-1501339847302-ac426a4a7cbb"), order: 9,  color: "#EFEBE9", iconColor: "#4E342E" },
  juices:            { name: "عصائر ومشروبات",     image: IMG("photo-1534353473418-4cfa6c56fd38"), order: 10, color: "#E3F2FD", iconColor: "#1565C0" },
  supermarket:       { name: "سوبرماركت",          image: IMG("photo-1542838132-92c53300491e"), order: 11, color: "#E8F5E9", iconColor: "#1B5E20" },
  grocery:           { name: "بقالة",              image: IMG("photo-1488459716781-31db52582fe9"), order: 12, color: "#F9FBE7", iconColor: "#558B2F" },
  "fruits-vegetables": { name: "فواكه وخضروات",   image: IMG("photo-1490885578174-acda8905c2c6"), order: 13, color: "#E8F5E9", iconColor: "#388E3C" },
  "meat-fish":       { name: "ملحمة وأسماك",       image: IMG("photo-1559847844-5315695dadae"), order: 14, color: "#FCE4EC", iconColor: "#B71C1C" },
  pharmacy:          { name: "صيدلية",             image: IMG("photo-1584308666744-24d5c474f2ae"), order: 15, color: "#E3F2FD", iconColor: "#0D47A1" },
  cosmetics:         { name: "مستحضرات تجميل",     image: IMG("photo-1596462502278-27bfdc403348"), order: 16, color: "#FCE4EC", iconColor: "#880E4F" },
  household:         { name: "مواد منزلية",        image: IMG("photo-1583947215259-38e31be8751f"), order: 17, color: "#E8EAF6", iconColor: "#283593" },
  gifts:             { name: "هدايا",              image: IMG("photo-1513201099705-a9746e1e201f"), order: 18, color: "#FCE4EC", iconColor: "#C2185B" },
  "food-supplies":   { name: "مواد غذائية",        image: IMG("photo-1586201375761-83865001e31c"), order: 19, color: "#F9FBE7", iconColor: "#33691E" },
  "dairy-eggs":      { name: "ألبان وبيض",         image: IMG("photo-1563636619-e9143da7973b"), order: 20, color: "#E3F2FD", iconColor: "#0277BD" },
};

async function seedCategories() {
  console.log("\n📂 الفئات...");
  for (const [id, cat] of Object.entries(CATEGORIES)) {
    await upsertDoc("categories", id, {
      name: cat.name, image: cat.image,
      productCount: 0, order: cat.order,
      color: cat.color, iconColor: cat.iconColor,
    }, () => { addedCategories++; console.log(`  ✓ ${cat.name}`); });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VENDORS + PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════

interface Product {
  name: string; categoryId: string; price: number;
  originalPrice?: number; discount?: number;
  image: string; description: string; inStock: boolean;
}

interface VendorSeed {
  name: string; location: string; whatsappNumber: string;
  commissionPercent: number; image: string; rating: number | null;
  ratingCount: number; deliveryTime: string; isOpen: boolean;
  categoryType: "restaurant" | "store" | "grocery" | "cafe" | "pharmacy";
  cuisine?: string; hasDelivery: boolean; minOrder: number;
  openTime: string; closeTime: string; description: string;
  sortOrder: number; products: Product[];
}

// GPS helper for الضلوعية area (base: 33.8500, 44.2100)
function gps(latOff: number, lngOff: number) {
  return { lat: 33.8500 + latOff, lng: 44.2100 + lngOff };
}

const VENDORS: VendorSeed[] = [

  // ── RESTAURANTS ──────────────────────────────────────────────────────────────
  {
    name: "مطعم أبو قيس", location: "الضلوعية - شارع المستشفى",
    whatsappNumber: "07801234501", commissionPercent: 10,
    image: IMG("photo-1555396273-367ea4eb4db5"),
    rating: 4.7, ratingCount: 134, deliveryTime: "25-35",
    isOpen: true, categoryType: "restaurant", cuisine: "مشاوي عراقية",
    hasDelivery: true, minOrder: 10000, openTime: "10:00", closeTime: "23:00",
    description: "أشهى المشاوي العراقية على الفحم الطبيعي بأجود المواد",
    sortOrder: 1,
    products: [
      { name: "كباب لحم", categoryId: "grills", price: 15000, image: IMG("photo-1603360946369-dc9bb6258143"), description: "كباب لحم مشوي على الفحم - 6 أسياخ", inStock: true },
      { name: "كباب دجاج", categoryId: "grills", price: 12000, image: IMG("photo-1599487488170-d11ec9c172f0"), description: "كباب دجاج متبل بالتوابل - 6 أسياخ", inStock: true },
      { name: "تكة دجاج", categoryId: "grills", price: 13000, image: IMG("photo-1599487488170-d11ec9c172f0"), description: "تكة دجاج مشوية - 6 أسياخ", inStock: true },
      { name: "ريش غنم", categoryId: "grills", price: 22000, image: IMG("photo-1558030006-450675393462"), description: "ريش غنم مشوية طازجة - 4 قطع", inStock: true },
      { name: "مشاوي مشكلة وسط", categoryId: "grills", price: 28000, image: IMG("photo-1544025162-d76694265947"), description: "طبق مشاوي مشكلة مع رز وسلطة", inStock: true },
      { name: "مشاوي مشكلة كبير", categoryId: "grills", price: 45000, image: IMG("photo-1544025162-d76694265947"), description: "طبق كبير مشاوي مشكلة مع رز وسلطة وشوربة", inStock: true },
      { name: "دجاج مشوي كامل", categoryId: "chicken", price: 16000, image: IMG("photo-1598103442097-8b74394b95c6"), description: "دجاج كامل مشوي على الفحم", inStock: true },
      { name: "نصف دجاج مشوي", categoryId: "chicken", price: 9000, image: IMG("photo-1598103442097-8b74394b95c6"), description: "نصف دجاج مشوي على الفحم", inStock: true },
      { name: "شيش لحم", categoryId: "grills", price: 14000, image: IMG("photo-1544025162-d76694265947"), description: "شيش لحم طازج مشوي - 4 أسياخ", inStock: true },
      { name: "شيش دجاج", categoryId: "grills", price: 11000, image: IMG("photo-1599487488170-d11ec9c172f0"), description: "شيش دجاج مشوي ومتبل - 4 أسياخ", inStock: true },
      { name: "رز حمراء", categoryId: "restaurants", price: 5000, image: IMG("photo-1536304929831-ee1ca9d44906"), description: "رز مطبوخ بالطريقة العراقية", inStock: true },
      { name: "سلطة خضراء", categoryId: "restaurants", price: 3000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "سلطة خضراء طازجة", inStock: true },
      { name: "شوربة عدس", categoryId: "restaurants", price: 4000, image: IMG("photo-1547592166-23ac45744acd"), description: "شوربة عدس عراقية تقليدية", inStock: true },
      { name: "خبز تنور", categoryId: "bakery", price: 2000, image: IMG("photo-1509440159596-0249088772ff"), description: "خبز تنور طازج", inStock: true },
      { name: "بيبسي", categoryId: "juices", price: 2000, image: IMG("photo-1629203432180-71cf4cccc898"), description: "بيبسي باردة 330 مل", inStock: true },
      { name: "ماء معدني", categoryId: "juices", price: 1000, image: IMG("photo-1548839140-29a749e1cf4d"), description: "ماء معدني 500 مل", inStock: true },
      { name: "عصير طماطم", categoryId: "juices", price: 3000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير طماطم طبيعي", inStock: true },
      { name: "دولمة عراقية", categoryId: "restaurants", price: 16000, image: IMG("photo-1555939594-58d7cb561ad1"), description: "دولمة عراقية بالرز واللحم المفروم", inStock: true },
      { name: "باقلاء بالدهن", categoryId: "restaurants", price: 8000, image: IMG("photo-1609167830220-7164aa360951"), description: "باقلاء مطبوخة بالدهن العراقي", inStock: true },
      { name: "تمن بالقيمة", categoryId: "restaurants", price: 20000, image: IMG("photo-1504674900247-0877df9cc836"), description: "تمن بالقيمة العراقية التقليدية", inStock: true },
    ],
  },

  {
    name: "مطعم أم علي", location: "الضلوعية - حي الرسالة",
    whatsappNumber: "07801234502", commissionPercent: 10,
    image: IMG("photo-1414235077428-338989a2e8c0"),
    rating: 4.5, ratingCount: 98, deliveryTime: "20-30",
    isOpen: true, categoryType: "restaurant", cuisine: "أكل بيتي عراقي",
    hasDelivery: true, minOrder: 8000, openTime: "09:00", closeTime: "22:00",
    description: "أكل بيتي عراقي أصيل تمامًا كما تطبخه الأمهات",
    sortOrder: 2,
    products: [
      { name: "تمن لحم", categoryId: "restaurants", price: 18000, image: IMG("photo-1504674900247-0877df9cc836"), description: "تمن لحم عراقي أصيل مع مرق", inStock: true },
      { name: "مرق دجاج بالرز", categoryId: "restaurants", price: 14000, image: IMG("photo-1603894584373-5ac82b2ae398"), description: "مرق دجاج دافئ مع الرز والخضروات", inStock: true },
      { name: "قيمة", categoryId: "restaurants", price: 20000, image: IMG("photo-1504674900247-0877df9cc836"), description: "قيمة لحم عراقية بالبهارات المميزة", inStock: true },
      { name: "تشريب دجاج", categoryId: "restaurants", price: 15000, image: IMG("photo-1603894584373-5ac82b2ae398"), description: "تشريب دجاج على خبز الصاج", inStock: true },
      { name: "دولمة", categoryId: "restaurants", price: 16000, image: IMG("photo-1555939594-58d7cb561ad1"), description: "دولمة عراقية ورق العنب واللحم", inStock: true },
      { name: "فاصولياء باللحم", categoryId: "restaurants", price: 14000, image: IMG("photo-1547592166-23ac45744acd"), description: "فاصولياء طازجة مطبوخة باللحم", inStock: true },
      { name: "بامية باللحم", categoryId: "restaurants", price: 15000, image: IMG("photo-1547592166-23ac45744acd"), description: "بامية مطبوخة بمرق اللحم", inStock: true },
      { name: "شوربة شعيرية", categoryId: "restaurants", price: 5000, image: IMG("photo-1547592166-23ac45744acd"), description: "شوربة شعيرية بيتية دافئة", inStock: true },
      { name: "رز ابيض", categoryId: "restaurants", price: 4000, image: IMG("photo-1536304929831-ee1ca9d44906"), description: "رز أبيض مطبوخ بالزيت والملح", inStock: true },
      { name: "خبز طنور", categoryId: "bakery", price: 2000, image: IMG("photo-1509440159596-0249088772ff"), description: "خبز طنور طازج يومي", inStock: true },
      { name: "سلطة حمراء", categoryId: "restaurants", price: 3000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "سلطة طماطم وبصل بالليمون", inStock: true },
      { name: "مقلوبة دجاج", categoryId: "restaurants", price: 16000, image: IMG("photo-1603894584373-5ac82b2ae398"), description: "مقلوبة دجاج بالخضار والتوابل", inStock: true },
      { name: "شيرة زبدة", categoryId: "sweets", price: 6000, image: IMG("photo-1551024601-bec78aea704b"), description: "شيرة بالزبدة والعسل", inStock: true },
      { name: "حليب بالعسل", categoryId: "juices", price: 3000, image: IMG("photo-1563636619-e9143da7973b"), description: "حليب دافئ مع العسل والقرفة", inStock: true },
      { name: "عصير رمان", categoryId: "juices", price: 4000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير رمان طبيعي طازج", inStock: true },
    ],
  },

  {
    name: "مطعم النيل للأسماك", location: "الضلوعية - كورنيش النهر",
    whatsappNumber: "07801234503", commissionPercent: 12,
    image: IMG("photo-1519708227418-c8fd9a32b7a2"),
    rating: 4.8, ratingCount: 211, deliveryTime: "30-45",
    isOpen: true, categoryType: "restaurant", cuisine: "أسماك وروبيان",
    hasDelivery: true, minOrder: 20000, openTime: "11:00", closeTime: "22:00",
    description: "أطازج أسماك دجلة مشوية ومقلية يومياً بدون مواد حافظة",
    sortOrder: 3,
    products: [
      { name: "سمك شبوط مشوي", categoryId: "meat-fish", price: 25000, image: IMG("photo-1534604973900-c43ab4c2e0ab"), description: "سمك شبوط دجلة مشوي على الفحم 1 كيلو", inStock: true },
      { name: "سمك بني مشوي", categoryId: "meat-fish", price: 20000, image: IMG("photo-1534604973900-c43ab4c2e0ab"), description: "سمك بني مشوي طازج 1 كيلو", inStock: true },
      { name: "سمك مسكوف", categoryId: "meat-fish", price: 35000, image: IMG("photo-1519708227418-c8fd9a32b7a2"), description: "سمك مسكوف عراقي أصيل على الجمر", inStock: true },
      { name: "سمك مقلي مشكل", categoryId: "meat-fish", price: 18000, image: IMG("photo-1580476262798-bddd9f4b7369"), description: "أسماك مقلية مشكلة مقرمشة", inStock: true },
      { name: "روبيان مشوي", categoryId: "meat-fish", price: 30000, image: IMG("photo-1565680018434-b513d5e5fd47"), description: "روبيان مشوي بالثوم والزبدة 500 جرام", inStock: true },
      { name: "روبيان مقلي", categoryId: "meat-fish", price: 28000, image: IMG("photo-1565680018434-b513d5e5fd47"), description: "روبيان مقلي مقرمش 500 جرام", inStock: true },
      { name: "كيمبري مشوي", categoryId: "meat-fish", price: 22000, image: IMG("photo-1519708227418-c8fd9a32b7a2"), description: "كيمبري مشوي بالتوابل اللذيذة", inStock: true },
      { name: "طبق أسماك مشكل", categoryId: "meat-fish", price: 45000, image: IMG("photo-1534604973900-c43ab4c2e0ab"), description: "طبق مشكل أسماك ومأكولات بحرية", inStock: true },
      { name: "رز متبل", categoryId: "restaurants", price: 5000, image: IMG("photo-1536304929831-ee1ca9d44906"), description: "رز متبل بالتوابل والزعفران", inStock: true },
      { name: "سلطة طازجة", categoryId: "restaurants", price: 3000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "سلطة خضروات طازجة", inStock: true },
      { name: "صوص طرطار", categoryId: "restaurants", price: 2000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "صوص طرطار بيتي", inStock: true },
      { name: "عصير ليمون", categoryId: "juices", price: 3000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير ليمون طازج مع النعناع", inStock: true },
      { name: "بيبسي", categoryId: "juices", price: 2000, image: IMG("photo-1629203432180-71cf4cccc898"), description: "بيبسي باردة 330 مل", inStock: true },
    ],
  },

  {
    name: "مطعم الكوفة للشاورما", location: "الضلوعية - السوق المركزي",
    whatsappNumber: "07801234504", commissionPercent: 10,
    image: IMG("photo-1529006557810-274b9b2fc783"),
    rating: 4.6, ratingCount: 175, deliveryTime: "15-25",
    isOpen: true, categoryType: "restaurant", cuisine: "شاورما وسندويشات",
    hasDelivery: true, minOrder: 7000, openTime: "10:00", closeTime: "24:00",
    description: "شاورما لحم ودجاج بالطريقة السورية الأصيلة منذ 2010",
    sortOrder: 4,
    products: [
      { name: "شاورما لحم صغير", categoryId: "shawarma", price: 5000, image: IMG("photo-1529006557810-274b9b2fc783"), description: "شاورما لحم بالخضار والثوم", inStock: true },
      { name: "شاورما لحم وسط", categoryId: "shawarma", price: 7000, image: IMG("photo-1529006557810-274b9b2fc783"), description: "شاورما لحم كبيرة بالخضار والطحينة", inStock: true },
      { name: "شاورما دجاج صغير", categoryId: "shawarma", price: 4500, image: IMG("photo-1561651188-d207bbec4ec3"), description: "شاورما دجاج بالثوم والليمون", inStock: true },
      { name: "شاورما دجاج وسط", categoryId: "shawarma", price: 6500, image: IMG("photo-1561651188-d207bbec4ec3"), description: "شاورما دجاج كبيرة مع طحينة وخضار", inStock: true },
      { name: "ساندوتش فلافل", categoryId: "restaurants", price: 3000, image: IMG("photo-1601050690597-df0568f70950"), description: "ساندوتش فلافل بالخضار والطحينة", inStock: true },
      { name: "ساندوتش كفتة", categoryId: "restaurants", price: 5500, image: IMG("photo-1529042410759-befb1204b468"), description: "ساندوتش كفتة مشوية مع سلطة", inStock: true },
      { name: "حمص بالطحينة", categoryId: "restaurants", price: 4000, image: IMG("photo-1572441173573-1eb2ba3523c5"), description: "حمص ناعم بالطحينة وزيت الزيتون", inStock: true },
      { name: "متبل", categoryId: "restaurants", price: 4000, image: IMG("photo-1572441173573-1eb2ba3523c5"), description: "متبل باذنجان محروق بالطحينة", inStock: true },
      { name: "صحن مشكل", categoryId: "shawarma", price: 18000, originalPrice: 22000, discount: 18, image: IMG("photo-1529006557810-274b9b2fc783"), description: "صحن مشكل شاورما لحم ودجاج مع حمص ومتبل", inStock: true },
      { name: "بطاطا مقلية", categoryId: "restaurants", price: 4000, image: IMG("photo-1573080496219-bb080dd4f877"), description: "بطاطا مقلية مقرمشة مع كاتشب", inStock: true },
      { name: "كليجة تمر", categoryId: "sweets", price: 8000, image: IMG("photo-1551024601-bec78aea704b"), description: "كليجة تمر عراقية 6 حبات", inStock: false },
      { name: "تمر عجوة", categoryId: "sweets", price: 12000, image: IMG("photo-1601050690597-df0568f70950"), description: "تمر عجوة فاخر 500 جرام", inStock: true },
      { name: "عصير تفاح", categoryId: "juices", price: 3500, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير تفاح طبيعي بارد", inStock: true },
      { name: "عصير مانجو", categoryId: "juices", price: 4000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير مانجو طبيعي بارد", inStock: true },
    ],
  },

  {
    name: "مطعم السلطان للمشاوي", location: "الضلوعية - حي المعلمين",
    whatsappNumber: "07801234505", commissionPercent: 10,
    image: IMG("photo-1544025162-d76694265947"),
    rating: 4.4, ratingCount: 89, deliveryTime: "25-40",
    isOpen: true, categoryType: "restaurant", cuisine: "لحوم ومشاوي",
    hasDelivery: true, minOrder: 15000, openTime: "12:00", closeTime: "23:00",
    description: "أجود اللحوم الطازجة مشوية على الفحم الطبيعي",
    sortOrder: 5,
    products: [
      { name: "ستيك لحم", categoryId: "grills", price: 30000, image: IMG("photo-1558030006-450675393462"), description: "ستيك لحم بقري مشوي 300 جرام", inStock: true },
      { name: "ريش عجل مشوية", categoryId: "grills", price: 25000, image: IMG("photo-1558030006-450675393462"), description: "ريش عجل مشوية على الفحم", inStock: true },
      { name: "كباب مشكل", categoryId: "grills", price: 22000, image: IMG("photo-1603360946369-dc9bb6258143"), description: "كباب مشكل لحم ودجاج 8 أسياخ", inStock: true },
      { name: "ضلوع مشوية", categoryId: "grills", price: 35000, image: IMG("photo-1558030006-450675393462"), description: "ضلوع غنم مشوية بالتوابل الخاصة", inStock: true },
      { name: "كفتة مشوية", categoryId: "grills", price: 16000, image: IMG("photo-1529042410759-befb1204b468"), description: "كفتة لحم مشوية 6 قطع", inStock: true },
      { name: "فيليه دجاج مشوي", categoryId: "chicken", price: 18000, image: IMG("photo-1598103442097-8b74394b95c6"), description: "فيليه دجاج مشوي 4 قطع", inStock: true },
      { name: "جناح دجاج مشوي", categoryId: "chicken", price: 14000, image: IMG("photo-1562967914-608f82629710"), description: "أجنحة دجاج مشوية 8 قطع", inStock: true },
      { name: "خبز عربي", categoryId: "bakery", price: 2000, image: IMG("photo-1509440159596-0249088772ff"), description: "خبز عربي طازج", inStock: true },
      { name: "سلطة فتوش", categoryId: "restaurants", price: 4000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "سلطة فتوش بالخضار الطازجة", inStock: true },
      { name: "شاي عراقي", categoryId: "cafe", price: 2000, image: IMG("photo-1513006035354-71e9a8a3a70a"), description: "شاي عراقي أسود بالهيل", inStock: true },
    ],
  },

  {
    name: "مطعم ريف بغداد", location: "الضلوعية - شارع الجمهورية",
    whatsappNumber: "07801234506", commissionPercent: 10,
    image: IMG("photo-1504674900247-0877df9cc836"),
    rating: 4.3, ratingCount: 67, deliveryTime: "20-35",
    isOpen: true, categoryType: "restaurant", cuisine: "مأكولات عراقية",
    hasDelivery: true, minOrder: 10000, openTime: "09:00", closeTime: "22:00",
    description: "نكهات بغدادية أصيلة في قلب الضلوعية",
    sortOrder: 6,
    products: [
      { name: "تبسي باذنجان", categoryId: "restaurants", price: 14000, image: IMG("photo-1547592166-23ac45744acd"), description: "تبسي باذنجان باللحم والبندورة", inStock: true },
      { name: "مرق حامض", categoryId: "restaurants", price: 16000, image: IMG("photo-1547592166-23ac45744acd"), description: "مرق حامض بالليمون واللحم", inStock: true },
      { name: "طاجن لحم", categoryId: "restaurants", price: 18000, image: IMG("photo-1504674900247-0877df9cc836"), description: "طاجن لحم بالخضروات والتوابل", inStock: true },
      { name: "كبة مقلية", categoryId: "restaurants", price: 10000, image: IMG("photo-1529042410759-befb1204b468"), description: "كبة لحم مقلية 6 حبات", inStock: true },
      { name: "باجة عراقية", categoryId: "restaurants", price: 15000, image: IMG("photo-1504674900247-0877df9cc836"), description: "باجة عراقية تقليدية مع الخبز", inStock: true },
      { name: "قوزي", categoryId: "restaurants", price: 55000, image: IMG("photo-1504674900247-0877df9cc836"), description: "قوزي كامل للمناسبات", inStock: false },
      { name: "رز برياني", categoryId: "restaurants", price: 20000, image: IMG("photo-1536304929831-ee1ca9d44906"), description: "رز برياني بالمكسرات والزعفران", inStock: true },
      { name: "حلوى زردة", categoryId: "sweets", price: 8000, image: IMG("photo-1551024601-bec78aea704b"), description: "حلوى الزردة العراقية بالزعفران", inStock: true },
      { name: "لقيمات بالعسل", categoryId: "sweets", price: 7000, image: IMG("photo-1551024601-bec78aea704b"), description: "لقيمات مقلية بالعسل والسمسم", inStock: true },
    ],
  },

  // ── STORES (fast food) ───────────────────────────────────────────────────────
  {
    name: "برغر هاوس", location: "الضلوعية - شارع المدارس",
    whatsappNumber: "07801234507", commissionPercent: 10,
    image: IMG("photo-1568901346375-23c9450c58cd"),
    rating: 4.5, ratingCount: 143, deliveryTime: "20-30",
    isOpen: true, categoryType: "store", cuisine: "برغر وفاست فود",
    hasDelivery: true, minOrder: 8000, openTime: "11:00", closeTime: "01:00",
    description: "أفخم البرغر الطازج بلحوم مختارة يومياً",
    sortOrder: 7,
    products: [
      { name: "برغر كلاسيك", categoryId: "burgers", price: 8000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر لحم كلاسيك مع خس وطماطم وصوص خاص", inStock: true },
      { name: "برغر دبل", categoryId: "burgers", price: 12000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر لحم دبل مع جبن شيدر وبيكون", inStock: true },
      { name: "برغر دجاج كرسبي", categoryId: "burgers", price: 9000, image: IMG("photo-1606755962773-d324e0a13086"), description: "برغر دجاج مقرمش مع مايونيز وخس", inStock: true },
      { name: "برغر سبايسي", categoryId: "burgers", price: 10000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر حار مع صوص التشيلي والجالابينيو", inStock: true },
      { name: "برغر تشيز", categoryId: "burgers", price: 10000, originalPrice: 12000, discount: 17, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر مع ثلاث طبقات جبن شيدر", inStock: true },
      { name: "برغر مشروم", categoryId: "burgers", price: 11000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر مع صوص الفطر الكريمي", inStock: true },
      { name: "برغر BBQ", categoryId: "burgers", price: 11000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر بصوص BBQ المدخن", inStock: true },
      { name: "برغر برايم", categoryId: "burgers", price: 16000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر لحم برايم فاخر مع جبن مذوّب", inStock: true },
      { name: "وجبة برغر كلاسيك", categoryId: "burgers", price: 13000, image: IMG("photo-1568901346375-23c9450c58cd"), description: "برغر كلاسيك + بطاطا + مشروب", inStock: true },
      { name: "وجبة برغر دجاج", categoryId: "burgers", price: 14000, image: IMG("photo-1606755962773-d324e0a13086"), description: "برغر دجاج + بطاطا + مشروب", inStock: true },
      { name: "بطاطا مقلية", categoryId: "restaurants", price: 4000, image: IMG("photo-1573080496219-bb080dd4f877"), description: "بطاطا مقلية مقرمشة وسط", inStock: true },
      { name: "بطاطا حلوة", categoryId: "restaurants", price: 5000, image: IMG("photo-1573080496219-bb080dd4f877"), description: "بطاطا حلوة مقلية مع صوص البانانا", inStock: true },
      { name: "حلقات البصل", categoryId: "restaurants", price: 5000, image: IMG("photo-1573080496219-bb080dd4f877"), description: "حلقات بصل مقرمشة", inStock: true },
      { name: "ناجتس دجاج 6 قطع", categoryId: "chicken", price: 7000, image: IMG("photo-1562967914-608f82629710"), description: "ناجتس دجاج مقرمش 6 قطع", inStock: true },
      { name: "ناجتس دجاج 12 قطع", categoryId: "chicken", price: 13000, originalPrice: 15000, discount: 13, image: IMG("photo-1562967914-608f82629710"), description: "ناجتس دجاج مقرمش 12 قطع", inStock: true },
      { name: "ملك شيك شوكولاتة", categoryId: "juices", price: 6000, image: IMG("photo-1572490122747-3e9c1e8b3a7d"), description: "ملك شيك شوكولاتة بارد كثيف", inStock: true },
      { name: "ملك شيك فراولة", categoryId: "juices", price: 6000, image: IMG("photo-1572490122747-3e9c1e8b3a7d"), description: "ملك شيك فراولة بارد كثيف", inStock: true },
      { name: "كوكاكولا", categoryId: "juices", price: 2000, image: IMG("photo-1629203432180-71cf4cccc898"), description: "كوكاكولا باردة 330 مل", inStock: true },
      { name: "موهيتو ليمون", categoryId: "juices", price: 5000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "موهيتو ليمون بالنعناع الطازج", inStock: true },
    ],
  },

  {
    name: "بيتزا رويال", location: "الضلوعية - شارع الوحدة",
    whatsappNumber: "07801234508", commissionPercent: 12,
    image: IMG("photo-1574071318508-1cdbab80d002"),
    rating: 4.6, ratingCount: 118, deliveryTime: "30-45",
    isOpen: true, categoryType: "store", cuisine: "بيتزا إيطالية",
    hasDelivery: true, minOrder: 12000, openTime: "11:00", closeTime: "01:00",
    description: "بيتزا إيطالية أصيلة بعجينة محضّرة يومياً وجبن موزاريلا اصلي",
    sortOrder: 8,
    products: [
      { name: "بيتزا مارغريتا وسط", categoryId: "pizza", price: 12000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا مارغريتا بالجبن والريحان وسط 30 سم", inStock: true },
      { name: "بيتزا مارغريتا كبير", categoryId: "pizza", price: 18000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا مارغريتا بالجبن والريحان كبير 40 سم", inStock: true },
      { name: "بيتزا ببروني وسط", categoryId: "pizza", price: 15000, image: IMG("photo-1565299624946-b28f40a0ae38"), description: "بيتزا ببروني كلاسيك وسط", inStock: true },
      { name: "بيتزا ببروني كبير", categoryId: "pizza", price: 22000, image: IMG("photo-1565299624946-b28f40a0ae38"), description: "بيتزا ببروني كلاسيك كبير", inStock: true },
      { name: "بيتزا دجاج وسط", categoryId: "pizza", price: 14000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا دجاج مشوي مع فليفلة وزيتون وسط", inStock: true },
      { name: "بيتزا خضار وسط", categoryId: "pizza", price: 11000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا خضار بالفطر والفليفلة وسط", inStock: true },
      { name: "بيتزا لحم وسط", categoryId: "pizza", price: 16000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا لحم مفروم وبصل وسط", inStock: true },
      { name: "بيتزا 4 أجبان وسط", categoryId: "pizza", price: 16000, originalPrice: 20000, discount: 20, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا 4 أجبان ممزوجة وسط", inStock: true },
      { name: "بيتزا سبايسي دجاج", categoryId: "pizza", price: 15000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا دجاج حارة بصوص البفالو وسط", inStock: true },
      { name: "بيتزا مشكل كبير", categoryId: "pizza", price: 25000, image: IMG("photo-1574071318508-1cdbab80d002"), description: "بيتزا مشكل بكل المكونات كبير", inStock: true },
      { name: "باستا بولونيز", categoryId: "restaurants", price: 10000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "باستا بوصلصة البوولونيز اللحم", inStock: true },
      { name: "باستا كربونارا", categoryId: "restaurants", price: 11000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "باستا كربونارا كريمية بالبيضة", inStock: true },
      { name: "باستا أرابياتا", categoryId: "restaurants", price: 9000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "باستا بالصوص الحار أرابياتا", inStock: true },
      { name: "ستيك لاسانيا", categoryId: "restaurants", price: 14000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "لاسانيا باللحم والجبن والصوص", inStock: true },
      { name: "عصير ليمون نعناع", categoryId: "juices", price: 4000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير ليمون طازج بالنعناع", inStock: true },
      { name: "سبرايت", categoryId: "juices", price: 2000, image: IMG("photo-1629203432180-71cf4cccc898"), description: "سبرايت باردة 330 مل", inStock: true },
    ],
  },

  {
    name: "دجاج الكريسبي", location: "الضلوعية - دوار المركز",
    whatsappNumber: "07801234509", commissionPercent: 10,
    image: IMG("photo-1562967914-608f82629710"),
    rating: 4.4, ratingCount: 96, deliveryTime: "20-30",
    isOpen: true, categoryType: "store", cuisine: "دجاج مقلي وسريع",
    hasDelivery: true, minOrder: 8000, openTime: "11:00", closeTime: "00:00",
    description: "أشهى الدجاج المقلي المقرمش بتتبيلة خاصة من 11 توابل",
    sortOrder: 9,
    products: [
      { name: "1 قطعة دجاج", categoryId: "chicken", price: 5000, image: IMG("photo-1562967914-608f82629710"), description: "قطعة دجاج مقلية مقرمشة واحدة", inStock: true },
      { name: "2 قطعة دجاج", categoryId: "chicken", price: 9000, image: IMG("photo-1562967914-608f82629710"), description: "قطعتا دجاج مقليتان", inStock: true },
      { name: "4 قطع دجاج", categoryId: "chicken", price: 17000, image: IMG("photo-1562967914-608f82629710"), description: "4 قطع دجاج مقلية", inStock: true },
      { name: "8 قطع دجاج", categoryId: "chicken", price: 32000, originalPrice: 36000, discount: 11, image: IMG("photo-1562967914-608f82629710"), description: "8 قطع دجاج مقلية للعائلة", inStock: true },
      { name: "وجبة الفاميلي 12 قطعة", categoryId: "chicken", price: 45000, image: IMG("photo-1562967914-608f82629710"), description: "12 قطعة + 2 بطاطا كبيرة + 2 كول سلو", inStock: true },
      { name: "ناجتس 6 قطع", categoryId: "chicken", price: 6000, image: IMG("photo-1562967914-608f82629710"), description: "ناجتس دجاج مقرمش 6 قطع", inStock: true },
      { name: "ناجتس 12 قطع", categoryId: "chicken", price: 11000, image: IMG("photo-1562967914-608f82629710"), description: "ناجتس دجاج مقرمش 12 قطع", inStock: true },
      { name: "تندر دجاج 4 قطع", categoryId: "chicken", price: 9000, image: IMG("photo-1562967914-608f82629710"), description: "شرائح دجاج تندر مقرمشة", inStock: true },
      { name: "كول سلو", categoryId: "restaurants", price: 3000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "سلطة كول سلو كريمية", inStock: true },
      { name: "بطاطا كريسبي", categoryId: "restaurants", price: 4000, image: IMG("photo-1573080496219-bb080dd4f877"), description: "بطاطا مقلية كريسبي مقرمشة", inStock: true },
      { name: "برغر دجاج كريسبي", categoryId: "burgers", price: 8500, image: IMG("photo-1606755962773-d324e0a13086"), description: "برغر دجاج مقرمش مع صوص خاص", inStock: true },
      { name: "بيبسي", categoryId: "juices", price: 2000, image: IMG("photo-1629203432180-71cf4cccc898"), description: "بيبسي باردة 330 مل", inStock: true },
    ],
  },

  // ── GROCERY / SUPERMARKET ────────────────────────────────────────────────────
  {
    name: "سوبرماركت الأمل", location: "الضلوعية - حي الأمل",
    whatsappNumber: "07801234510", commissionPercent: 8,
    image: IMG("photo-1542838132-92c53300491e"),
    rating: 4.2, ratingCount: 72, deliveryTime: "20-35",
    isOpen: true, categoryType: "grocery",
    hasDelivery: true, minOrder: 5000, openTime: "07:00", closeTime: "23:00",
    description: "كل احتياجاتك اليومية تحت سقف واحد بأسعار منافسة",
    sortOrder: 10,
    products: [
      { name: "رز بسمتي 5 كيلو", categoryId: "food-supplies", price: 45000, image: IMG("photo-1586201375761-83865001e31c"), description: "رز بسمتي طويل الحبة 5 كيلو", inStock: true },
      { name: "رز عنبر 5 كيلو", categoryId: "food-supplies", price: 40000, image: IMG("photo-1586201375761-83865001e31c"), description: "رز عنبر عراقي 5 كيلو", inStock: true },
      { name: "سكر ابيض 5 كيلو", categoryId: "food-supplies", price: 30000, image: IMG("photo-1558618666-fcd25c85cd64"), description: "سكر أبيض ناعم 5 كيلو", inStock: true },
      { name: "طحين 5 كيلو", categoryId: "food-supplies", price: 25000, image: IMG("photo-1586201375761-83865001e31c"), description: "طحين أبيض متعدد الاستخدامات 5 كيلو", inStock: true },
      { name: "زيت نباتي 5 لتر", categoryId: "food-supplies", price: 55000, image: IMG("photo-1474979266404-7eaacbcd87c5"), description: "زيت نباتي صافي 5 لتر", inStock: true },
      { name: "زيت زيتون 1 لتر", categoryId: "food-supplies", price: 65000, originalPrice: 75000, discount: 13, image: IMG("photo-1474979266404-7eaacbcd87c5"), description: "زيت زيتون بكر ممتاز 1 لتر", inStock: true },
      { name: "معجون طماطم 400 جرام", categoryId: "food-supplies", price: 8000, image: IMG("photo-1586201375761-83865001e31c"), description: "معجون طماطم مركّز 400 جرام", inStock: true },
      { name: "ملح 1 كيلو", categoryId: "food-supplies", price: 5000, image: IMG("photo-1586201375761-83865001e31c"), description: "ملح طعام نقي 1 كيلو", inStock: true },
      { name: "شاي ليبتون 100 كيس", categoryId: "food-supplies", price: 22000, image: IMG("photo-1544787219-7f47ccb76574"), description: "شاي ليبتون أسود 100 كيس", inStock: true },
      { name: "قهوة نسكافيه 200 جرام", categoryId: "food-supplies", price: 28000, image: IMG("photo-1501339847302-ac426a4a7cbb"), description: "نسكافيه سريع التحضير 200 جرام", inStock: true },
      { name: "حليب كامل الدسم 1 لتر", categoryId: "dairy-eggs", price: 12000, image: IMG("photo-1563636619-e9143da7973b"), description: "حليب طازج كامل الدسم 1 لتر", inStock: true },
      { name: "حليب خالي الدسم 1 لتر", categoryId: "dairy-eggs", price: 11000, image: IMG("photo-1563636619-e9143da7973b"), description: "حليب خالي الدسم 1 لتر", inStock: true },
      { name: "بيض 30 حبة", categoryId: "dairy-eggs", price: 20000, image: IMG("photo-1582722872445-44dc5f7e3c8f"), description: "بيض دجاج طازج 30 حبة", inStock: true },
      { name: "بيض 15 حبة", categoryId: "dairy-eggs", price: 11000, image: IMG("photo-1582722872445-44dc5f7e3c8f"), description: "بيض دجاج طازج 15 حبة", inStock: true },
      { name: "جبنة بيضاء 400 جرام", categoryId: "dairy-eggs", price: 22000, image: IMG("photo-1486297678162-eb2a19b0a32d"), description: "جبنة بيضاء طازجة 400 جرام", inStock: true },
      { name: "لبنة 500 جرام", categoryId: "dairy-eggs", price: 15000, image: IMG("photo-1486297678162-eb2a19b0a32d"), description: "لبنة طازجة كريمية 500 جرام", inStock: true },
      { name: "زبدة 200 جرام", categoryId: "dairy-eggs", price: 14000, image: IMG("photo-1486297678162-eb2a19b0a32d"), description: "زبدة طبيعية 200 جرام", inStock: true },
      { name: "مكرونة سباغيتي 500 جرام", categoryId: "food-supplies", price: 7000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "مكرونة سباغيتي 500 جرام", inStock: true },
      { name: "عدس أحمر 1 كيلو", categoryId: "food-supplies", price: 15000, image: IMG("photo-1586201375761-83865001e31c"), description: "عدس أحمر مجروش 1 كيلو", inStock: true },
      { name: "حمص حب 1 كيلو", categoryId: "food-supplies", price: 12000, image: IMG("photo-1586201375761-83865001e31c"), description: "حمص حب جاف 1 كيلو", inStock: true },
      { name: "صابون غسيل 3 كيلو", categoryId: "household", price: 15000, image: IMG("photo-1583947215259-38e31be8751f"), description: "صابون غسيل معطر 3 كيلو", inStock: true },
      { name: "سائل جلي 750 مل", categoryId: "household", price: 8000, image: IMG("photo-1583947215259-38e31be8751f"), description: "سائل جلي للأطباق برائحة الليمون", inStock: true },
      { name: "مناديل ورقية 4 رول", categoryId: "household", price: 6000, image: IMG("photo-1583947215259-38e31be8751f"), description: "مناديل ورقية ثلاثية الطبقات", inStock: true },
      { name: "شامبو هيد آند شولدرز 400 مل", categoryId: "cosmetics", price: 18000, originalPrice: 22000, discount: 18, image: IMG("photo-1596462502278-27bfdc403348"), description: "شامبو هيد آند شولدرز ضد القشرة 400 مل", inStock: true },
      { name: "معجون أسنان كولجيت 150 جرام", categoryId: "household", price: 7000, image: IMG("photo-1583947215259-38e31be8751f"), description: "معجون أسنان كولجيت بالفلورايد 150 جرام", inStock: true },
    ],
  },

  {
    name: "بقالة الرشيد", location: "الضلوعية - حي الرشيد",
    whatsappNumber: "07801234511", commissionPercent: 8,
    image: IMG("photo-1488459716781-31db52582fe9"),
    rating: 4.0, ratingCount: 45, deliveryTime: "15-25",
    isOpen: true, categoryType: "grocery",
    hasDelivery: true, minOrder: 3000, openTime: "06:00", closeTime: "24:00",
    description: "بقالة الحي لكل احتياجاتك اليومية بأسرع توصيل",
    sortOrder: 11,
    products: [
      { name: "خبز عربي 6 أرغفة", categoryId: "bakery", price: 5000, image: IMG("photo-1509440159596-0249088772ff"), description: "خبز عربي طازج يومي 6 أرغفة", inStock: true },
      { name: "اندومي نودلز دجاج", categoryId: "food-supplies", price: 3000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "اندومي نودلز بنكهة الدجاج", inStock: true },
      { name: "اندومي نودلز لحم", categoryId: "food-supplies", price: 3000, image: IMG("photo-1621996346565-e3dbc646d9a9"), description: "اندومي نودلز بنكهة اللحم", inStock: true },
      { name: "معلبات تونة 185 جرام", categoryId: "food-supplies", price: 9000, image: IMG("photo-1586201375761-83865001e31c"), description: "تونة معلبة في زيت الزيتون 185 جرام", inStock: true },
      { name: "معلبات ذرة 400 جرام", categoryId: "food-supplies", price: 7000, image: IMG("photo-1586201375761-83865001e31c"), description: "ذرة حلوة معلبة 400 جرام", inStock: true },
      { name: "معلبات لوبياء 400 جرام", categoryId: "food-supplies", price: 7000, image: IMG("photo-1586201375761-83865001e31c"), description: "لوبياء حمراء معلبة 400 جرام", inStock: true },
      { name: "شيبس تايم 100 جرام", categoryId: "sweets", price: 5000, image: IMG("photo-1566478989037-eec170784d0b"), description: "شيبس مشكل بنكهات متعددة 100 جرام", inStock: true },
      { name: "بسكويت أوريو", categoryId: "sweets", price: 6000, image: IMG("photo-1558961363-fa8fdf82db35"), description: "بسكويت أوريو بالشوكولاتة الداكنة", inStock: true },
      { name: "شوكولاتة كيت كات", categoryId: "sweets", price: 5000, image: IMG("photo-1606312619070-d48b4c652a52"), description: "كيت كات شوكولاتة 4 أصابع", inStock: true },
      { name: "حليب نيدو 400 جرام", categoryId: "dairy-eggs", price: 25000, image: IMG("photo-1563636619-e9143da7973b"), description: "حليب نيدو كامل الدسم 400 جرام", inStock: true },
      { name: "بيبسي 1.5 لتر", categoryId: "juices", price: 4500, image: IMG("photo-1629203432180-71cf4cccc898"), description: "بيبسي زجاجة 1.5 لتر", inStock: true },
      { name: "بيبسي دايت 330 مل", categoryId: "juices", price: 2500, image: IMG("photo-1629203432180-71cf4cccc898"), description: "بيبسي دايت علبة 330 مل", inStock: true },
      { name: "ماء حياة 1.5 لتر", categoryId: "juices", price: 2000, image: IMG("photo-1548839140-29a749e1cf4d"), description: "ماء معدني 1.5 لتر", inStock: true },
    ],
  },

  {
    name: "ميني ماركت الفرات", location: "الضلوعية - شارع الفرات",
    whatsappNumber: "07801234512", commissionPercent: 8,
    image: IMG("photo-1604719312566-8912e9667d61"),
    rating: 4.1, ratingCount: 38, deliveryTime: "15-20",
    isOpen: true, categoryType: "grocery",
    hasDelivery: true, minOrder: 5000, openTime: "07:00", closeTime: "22:00",
    description: "سوبر ماركت عائلي بأسعار مناسبة وتوصيل سريع",
    sortOrder: 12,
    products: [
      { name: "خضروات مشكلة كيلو", categoryId: "fruits-vegetables", price: 8000, image: IMG("photo-1490885578174-acda8905c2c6"), description: "خضروات طازجة مشكلة 1 كيلو", inStock: true },
      { name: "طماطم 1 كيلو", categoryId: "fruits-vegetables", price: 5000, image: IMG("photo-1524593166156-312f362cada0"), description: "طماطم طازجة 1 كيلو", inStock: true },
      { name: "بصل 1 كيلو", categoryId: "fruits-vegetables", price: 3000, image: IMG("photo-1508747703725-719777637510"), description: "بصل أبيض 1 كيلو", inStock: true },
      { name: "ثوم 500 جرام", categoryId: "fruits-vegetables", price: 6000, image: IMG("photo-1481450894489-cad4c49ec8dc"), description: "ثوم طازج 500 جرام", inStock: true },
      { name: "فليفلة حمراء وخضراء", categoryId: "fruits-vegetables", price: 6000, image: IMG("photo-1518977676601-b53f82aba655"), description: "فليفلة ملونة طازجة 500 جرام", inStock: true },
      { name: "تفاح أحمر 1 كيلو", categoryId: "fruits-vegetables", price: 12000, image: IMG("photo-1584568694244-14fbdf83bd30"), description: "تفاح أحمر طازج 1 كيلو", inStock: true },
      { name: "موز 1 كيلو", categoryId: "fruits-vegetables", price: 8000, image: IMG("photo-1566979279-b408f39dab96"), description: "موز طازج 1 كيلو", inStock: true },
      { name: "رمان كيلو", categoryId: "fruits-vegetables", price: 12000, image: IMG("photo-1490474504059-bf2db5ab2348"), description: "رمان طازج 1 كيلو", inStock: true },
      { name: "برتقال 1 كيلو", categoryId: "fruits-vegetables", price: 8000, image: IMG("photo-1580052614034-c55d20bfee3b"), description: "برتقال طازج عصيري 1 كيلو", inStock: true },
      { name: "عنب أخضر 1 كيلو", categoryId: "fruits-vegetables", price: 10000, image: IMG("photo-1537640538966-79f369143f8f"), description: "عنب أخضر طازج حبة متوسطة", inStock: true },
      { name: "مانجو 1 كيلو", categoryId: "fruits-vegetables", price: 15000, originalPrice: 18000, discount: 17, image: IMG("photo-1553279768-865429fa0078"), description: "مانجو استوائية حلوة 1 كيلو", inStock: true },
      { name: "بطيخ نص", categoryId: "fruits-vegetables", price: 8000, image: IMG("photo-1587049352846-4a222e784d38"), description: "نصف بطيخ أحمر طازج", inStock: true },
    ],
  },

  {
    name: "سوبرماركت النيل", location: "الضلوعية - حي النيل",
    whatsappNumber: "07801234513", commissionPercent: 8,
    image: IMG("photo-1607082349566-187342175e2f"),
    rating: 4.3, ratingCount: 57, deliveryTime: "20-30",
    isOpen: true, categoryType: "grocery",
    hasDelivery: true, minOrder: 10000, openTime: "08:00", closeTime: "22:00",
    description: "أجود المنتجات من مختلف الماركات العالمية والمحلية",
    sortOrder: 13,
    products: [
      { name: "دجاج كامل طازج", categoryId: "meat-fish", price: 45000, image: IMG("photo-1604503468506-a8da13d82791"), description: "دجاج طازج كامل 1.5 كيلو", inStock: true },
      { name: "فخذ دجاج 1 كيلو", categoryId: "meat-fish", price: 22000, image: IMG("photo-1604503468506-a8da13d82791"), description: "فخذ دجاج طازج 1 كيلو", inStock: true },
      { name: "صدر دجاج 1 كيلو", categoryId: "meat-fish", price: 25000, image: IMG("photo-1604503468506-a8da13d82791"), description: "صدر دجاج طازج 1 كيلو", inStock: true },
      { name: "لحم بقري مفروم 1 كيلو", categoryId: "meat-fish", price: 55000, image: IMG("photo-1607623814075-e51df1bdc82f"), description: "لحم بقري مفروم طازج 1 كيلو", inStock: true },
      { name: "لحم بقري قطع 1 كيلو", categoryId: "meat-fish", price: 65000, image: IMG("photo-1607623814075-e51df1bdc82f"), description: "لحم بقري قطع طازج 1 كيلو", inStock: true },
      { name: "كفتة لحم جاهزة 500 جرام", categoryId: "meat-fish", price: 30000, image: IMG("photo-1607623814075-e51df1bdc82f"), description: "كفتة لحم جاهزة للشوي 500 جرام", inStock: true },
      { name: "سمك مجمد 1 كيلو", categoryId: "meat-fish", price: 30000, image: IMG("photo-1534604973900-c43ab4c2e0ab"), description: "سمك مجمد طازج 1 كيلو", inStock: true },
      { name: "جبن شيدر شرائح", categoryId: "dairy-eggs", price: 20000, image: IMG("photo-1486297678162-eb2a19b0a32d"), description: "جبن شيدر شرائح 200 جرام", inStock: true },
      { name: "كريمة طازجة 200 مل", categoryId: "dairy-eggs", price: 12000, image: IMG("photo-1563636619-e9143da7973b"), description: "كريمة طازجة للطبخ والتزيين 200 مل", inStock: true },
      { name: "لبن زبادي 500 جرام", categoryId: "dairy-eggs", price: 10000, image: IMG("photo-1563636619-e9143da7973b"), description: "لبن زبادي طبيعي 500 جرام", inStock: true },
      { name: "حفاضات باميرز مقاس M", categoryId: "household", price: 35000, originalPrice: 40000, discount: 13, image: IMG("photo-1515488042361-ee00e0ddd4e4"), description: "حفاضات باميرز مقاس M عبوة 40 حبة", inStock: true },
      { name: "مناديل فلوة 200 ورقة", categoryId: "household", price: 5000, image: IMG("photo-1583947215259-38e31be8751f"), description: "مناديل فلوة ناعمة 200 ورقة", inStock: true },
    ],
  },

  // ── CAFES ─────────────────────────────────────────────────────────────────────
  {
    name: "كافيه اللؤلؤة", location: "الضلوعية - شارع المتنزه",
    whatsappNumber: "07801234514", commissionPercent: 10,
    image: IMG("photo-1501339847302-ac426a4a7cbb"),
    rating: 4.7, ratingCount: 188, deliveryTime: "20-30",
    isOpen: true, categoryType: "cafe",
    hasDelivery: true, minOrder: 8000, openTime: "08:00", closeTime: "00:00",
    description: "أجواء هادئة وقهوة مميزة بأفضل حبوب البن العربي والكولومبي",
    sortOrder: 14,
    products: [
      { name: "قهوة تركية", categoryId: "cafe", price: 4000, image: IMG("photo-1535905557558-afc4877a26fc"), description: "قهوة تركية مضبوطة مع الهيل", inStock: true },
      { name: "قهوة سادة", categoryId: "cafe", price: 3000, image: IMG("photo-1559056199-641a0ac8b55e"), description: "قهوة عربية سادة بالزعفران والهيل", inStock: true },
      { name: "إسبريسو دبل", categoryId: "cafe", price: 5000, image: IMG("photo-1510591509098-f4fdc6d0ff04"), description: "إسبريسو دبل شوت قوي", inStock: true },
      { name: "لاتيه", categoryId: "cafe", price: 7000, image: IMG("photo-1461023058943-07fcbe16d735"), description: "لاتيه بالحليب المبخر الطازج", inStock: true },
      { name: "كابتشينو", categoryId: "cafe", price: 7000, image: IMG("photo-1534778101976-62847782c213"), description: "كابتشينو بالرغوة الناعمة والقرفة", inStock: true },
      { name: "كولد برو", categoryId: "cafe", price: 8000, image: IMG("photo-1509042239860-f550ce710b93"), description: "كولد برو قهوة باردة 24 ساعة", inStock: true },
      { name: "ماتشا لاتيه", categoryId: "cafe", price: 8000, originalPrice: 10000, discount: 20, image: IMG("photo-1536256263959-770b48d82b0a"), description: "ماتشا لاتيه باليابانية الأصيلة", inStock: true },
      { name: "كراميل ماكياتو", categoryId: "cafe", price: 9000, image: IMG("photo-1461023058943-07fcbe16d735"), description: "كراميل ماكياتو بالفانيلا والكراميل", inStock: true },
      { name: "قهوة نقية V60", categoryId: "cafe", price: 10000, image: IMG("photo-1510591509098-f4fdc6d0ff04"), description: "قهوة مقطرة يدوياً V60 ذات نكهات خاصة", inStock: true },
      { name: "شاي أخضر", categoryId: "cafe", price: 4000, image: IMG("photo-1544787219-7f47ccb76574"), description: "شاي أخضر ياباني ممتاز", inStock: true },
      { name: "شاي ليمون بارد", categoryId: "cafe", price: 5000, image: IMG("photo-1544787219-7f47ccb76574"), description: "شاي ليمون مثلج بارد", inStock: true },
      { name: "موهيتو توت", categoryId: "juices", price: 7000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "موهيتو توت طازج بالنعناع", inStock: true },
      { name: "موهيتو مانجو", categoryId: "juices", price: 7000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "موهيتو مانجو طازج", inStock: true },
      { name: "كيك شوكولاتة", categoryId: "sweets", price: 9000, image: IMG("photo-1578985545062-69928b1d9587"), description: "كيك شوكولاتة رطب بالغاناش", inStock: true },
      { name: "تشيز كيك", categoryId: "sweets", price: 10000, image: IMG("photo-1533134242443-d4fd215305ad"), description: "تشيز كيك نيويورك كلاسيك", inStock: true },
      { name: "بان كيك بالعسل", categoryId: "sweets", price: 10000, image: IMG("photo-1551504734-5ee1c4a1479b"), description: "بان كيك طازج بالعسل والزبدة", inStock: true },
      { name: "كرواسان زبدة", categoryId: "bakery", price: 6000, image: IMG("photo-1555507036-ab1f4038808a"), description: "كرواسان زبدة فرنسي طازج", inStock: true },
      { name: "سندوتش كلوب", categoryId: "cafe", price: 12000, image: IMG("photo-1528735602780-2552fd46c7af"), description: "سندوتش كلوب بالدجاج والخضار", inStock: true },
      { name: "سلطة سيزر", categoryId: "cafe", price: 9000, image: IMG("photo-1512621776951-a57141f2eefd"), description: "سلطة سيزر بالدجاج والخس والبارميزان", inStock: true },
    ],
  },

  {
    name: "مقهى بغداد", location: "الضلوعية - ساحة المدينة",
    whatsappNumber: "07801234515", commissionPercent: 10,
    image: IMG("photo-1513006035354-71e9a8a3a70a"),
    rating: 4.3, ratingCount: 74, deliveryTime: "15-25",
    isOpen: true, categoryType: "cafe",
    hasDelivery: true, minOrder: 5000, openTime: "07:00", closeTime: "23:00",
    description: "تراث القهوة العراقية الأصيلة مع لمسة عصرية",
    sortOrder: 15,
    products: [
      { name: "قهوة عراقية هال", categoryId: "cafe", price: 3000, image: IMG("photo-1559056199-641a0ac8b55e"), description: "قهوة عراقية بالهيل المطحون", inStock: true },
      { name: "شاي عراقي", categoryId: "cafe", price: 2000, image: IMG("photo-1544787219-7f47ccb76574"), description: "شاي عراقي أسود قوي بالسكر", inStock: true },
      { name: "شاي بالحليب", categoryId: "cafe", price: 3000, image: IMG("photo-1544787219-7f47ccb76574"), description: "شاي بالحليب الدافئ", inStock: true },
      { name: "عصير برتقال طازج", categoryId: "juices", price: 5000, image: IMG("photo-1580052614034-c55d20bfee3b"), description: "عصير برتقال طبيعي طازج", inStock: true },
      { name: "عصير ليمون بالنعناع", categoryId: "juices", price: 5000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير ليمون بالنعناع الطازج", inStock: true },
      { name: "عصير جزر زنجبيل", categoryId: "juices", price: 6000, image: IMG("photo-1534353473418-4cfa6c56fd38"), description: "عصير جزر بالزنجبيل والليمون", inStock: true },
      { name: "سموذي فراولة مانجو", categoryId: "juices", price: 8000, originalPrice: 10000, discount: 20, image: IMG("photo-1572490122747-3e9c1e8b3a7d"), description: "سموذي فراولة ومانجو بالحليب", inStock: true },
      { name: "قشطة مع عسل", categoryId: "sweets", price: 7000, image: IMG("photo-1551024601-bec78aea704b"), description: "قشطة طازجة مع عسل طبيعي وخبز", inStock: true },
      { name: "كيك كراميل", categoryId: "sweets", price: 8000, image: IMG("photo-1578985545062-69928b1d9587"), description: "كيك الكراميل المحروق اللذيذ", inStock: true },
      { name: "بسكويت بالشوكولاتة", categoryId: "sweets", price: 5000, image: IMG("photo-1558961363-fa8fdf82db35"), description: "بسكويت شوكولاتة بيتي 6 قطع", inStock: true },
    ],
  },

  {
    name: "كافيه الورد", location: "الضلوعية - حي العروبة",
    whatsappNumber: "07801234516", commissionPercent: 10,
    image: IMG("photo-1509042239860-f550ce710b93"),
    rating: 4.5, ratingCount: 93, deliveryTime: "20-35",
    isOpen: true, categoryType: "cafe",
    hasDelivery: true, minOrder: 7000, openTime: "09:00", closeTime: "23:00",
    description: "كافيه مميز بأجواء رومانسية ومشروبات باردة وساخنة فاخرة",
    sortOrder: 16,
    products: [
      { name: "فرابتشينو شوكولاتة", categoryId: "cafe", price: 9000, image: IMG("photo-1461023058943-07fcbe16d735"), description: "فرابتشينو شوكولاتة مع كريمة", inStock: true },
      { name: "فرابتشينو كراميل", categoryId: "cafe", price: 9000, image: IMG("photo-1461023058943-07fcbe16d735"), description: "فرابتشينو كراميل مع كريمة وصوص", inStock: true },
      { name: "أيس كريم قهوة", categoryId: "cafe", price: 8000, image: IMG("photo-1572490122747-3e9c1e8b3a7d"), description: "أيس كريم فانيلا مع شوت إسبريسو", inStock: true },
      { name: "وافل بالشوكولاتة", categoryId: "sweets", price: 11000, image: IMG("photo-1551024601-bec78aea704b"), description: "وافل ذهبية بصوص الشوكولاتة والكريمة", inStock: true },
      { name: "وافل بالفراولة", categoryId: "sweets", price: 11000, image: IMG("photo-1551024601-bec78aea704b"), description: "وافل مع الفراولة الطازجة والكريمة", inStock: true },
      { name: "كريب نوتيلا", categoryId: "sweets", price: 9000, image: IMG("photo-1551504734-5ee1c4a1479b"), description: "كريب رفيع بالنوتيلا والموز", inStock: true },
      { name: "كوكتيل مشكل", categoryId: "juices", price: 10000, originalPrice: 12000, discount: 17, image: IMG("photo-1572490122747-3e9c1e8b3a7d"), description: "كوكتيل فواكه مشكل بالكريمة", inStock: true },
      { name: "ميلك شيك فانيلا", categoryId: "juices", price: 8000, image: IMG("photo-1572490122747-3e9c1e8b3a7d"), description: "ميلك شيك فانيلا كثيف ومبرد", inStock: true },
    ],
  },

  // ── PHARMACIES ───────────────────────────────────────────────────────────────
  {
    name: "صيدلية الشفاء", location: "الضلوعية - قرب المستشفى",
    whatsappNumber: "07801234517", commissionPercent: 8,
    image: IMG("photo-1584308666744-24d5c474f2ae"),
    rating: 4.6, ratingCount: 112, deliveryTime: "15-25",
    isOpen: true, categoryType: "pharmacy",
    hasDelivery: true, minOrder: 5000, openTime: "08:00", closeTime: "22:00",
    description: "صيدلية معتمدة بكادر صيدلاني متخصص وجميع الأدوية متوفرة",
    sortOrder: 17,
    products: [
      { name: "باراسيتامول 500 مجم", categoryId: "pharmacy", price: 3000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "مسكن للألم وخافض للحرارة 20 قرص", inStock: true },
      { name: "فيتامين C 1000 مجم", categoryId: "pharmacy", price: 12000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "فيتامين C تقوية المناعة 30 قرص", inStock: true },
      { name: "فيتامين D3", categoryId: "pharmacy", price: 18000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "فيتامين D3 لصحة العظام 30 كبسولة", inStock: true },
      { name: "مضاد حيوي أموكسيسيلين", categoryId: "pharmacy", price: 15000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "أموكسيسيلين 500 مجم - بوصفة طبية", inStock: true },
      { name: "شراب سعال للأطفال", categoryId: "pharmacy", price: 8000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "شراب سعال آمن للأطفال 120 مل", inStock: true },
      { name: "قطرة عيون", categoryId: "pharmacy", price: 10000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "قطرة عيون مرطبة 10 مل", inStock: true },
      { name: "كريم مرطب للبشرة", categoryId: "cosmetics", price: 15000, image: IMG("photo-1596462502278-27bfdc403348"), description: "كريم مرطب للبشرة الجافة 100 مل", inStock: true },
      { name: "واقي شمس SPF 50", categoryId: "cosmetics", price: 25000, originalPrice: 30000, discount: 17, image: IMG("photo-1596462502278-27bfdc403348"), description: "كريم واقي من الشمس SPF 50 مقاس 75 مل", inStock: true },
      { name: "مقياس ضغط دم", categoryId: "pharmacy", price: 75000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "جهاز مقياس ضغط الدم الرقمي", inStock: true },
      { name: "شاش طبي 10×10", categoryId: "pharmacy", price: 4000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "شاش طبي معقم 10×10 سم عبوة 10 قطع", inStock: true },
      { name: "ألكوهول إيثيل 70%", categoryId: "pharmacy", price: 6000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "ألكوهول للتعقيم 100 مل", inStock: true },
      { name: "دواء حموضة", categoryId: "pharmacy", price: 9000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "علاج حموضة المعدة 20 قرص", inStock: true },
    ],
  },

  {
    name: "صيدلية النهضة", location: "الضلوعية - حي النهضة",
    whatsappNumber: "07801234518", commissionPercent: 8,
    image: IMG("photo-1587854692152-cbe660dbde88"),
    rating: 4.4, ratingCount: 68, deliveryTime: "15-30",
    isOpen: true, categoryType: "pharmacy",
    hasDelivery: true, minOrder: 5000, openTime: "08:00", closeTime: "21:00",
    description: "صيدلية متخصصة بالمستحضرات الصيدلانية ومستلزمات الجمال والعناية",
    sortOrder: 18,
    products: [
      { name: "مسكن ألم إيبوبروفين", categoryId: "pharmacy", price: 5000, image: IMG("photo-1587854692152-cbe660dbde88"), description: "إيبوبروفين 400 مجم 20 قرص", inStock: true },
      { name: "حبوب حديد وحمض فوليك", categoryId: "pharmacy", price: 14000, image: IMG("photo-1587854692152-cbe660dbde88"), description: "مكمل حديد وحمض فوليك 30 قرص", inStock: true },
      { name: "فيتامينات متعددة", categoryId: "pharmacy", price: 20000, image: IMG("photo-1587854692152-cbe660dbde88"), description: "مولتي فيتامين يومي للبالغين 30 قرص", inStock: true },
      { name: "شامبو لوريال", categoryId: "cosmetics", price: 22000, image: IMG("photo-1596462502278-27bfdc403348"), description: "شامبو لوريال للشعر التالف 400 مل", inStock: true },
      { name: "كريم نيفيا للجسم", categoryId: "cosmetics", price: 18000, originalPrice: 22000, discount: 18, image: IMG("photo-1596462502278-27bfdc403348"), description: "كريم نيفيا مرطب للجسم 400 مل", inStock: true },
      { name: "معجون أسنان سيغنال", categoryId: "household", price: 8000, image: IMG("photo-1583947215259-38e31be8751f"), description: "معجون أسنان سيغنال للتبييض 150 جرام", inStock: true },
      { name: "صابون طبي ديتول", categoryId: "household", price: 7000, image: IMG("photo-1583947215259-38e31be8751f"), description: "صابون ديتول مضاد للجراثيم 125 جرام", inStock: true },
      { name: "عطر رجالي ميني", categoryId: "cosmetics", price: 35000, image: IMG("photo-1596462502278-27bfdc403348"), description: "عطر رجالي ميني 30 مل", inStock: true },
    ],
  },

  {
    name: "صيدلية الحياة", location: "الضلوعية - شارع الصحة",
    whatsappNumber: "07801234519", commissionPercent: 8,
    image: IMG("photo-1585435557343-3b092031a831"),
    rating: 4.2, ratingCount: 41, deliveryTime: "20-30",
    isOpen: true, categoryType: "pharmacy",
    hasDelivery: true, minOrder: 5000, openTime: "08:00", closeTime: "22:00",
    description: "خدمة صيدلانية متكاملة مع توصيل سريع للأدوية والمستحضرات",
    sortOrder: 19,
    products: [
      { name: "حقنة أنسولين قلم", categoryId: "pharmacy", price: 45000, image: IMG("photo-1585435557343-3b092031a831"), description: "قلم أنسولين للمرضى السكريين", inStock: true },
      { name: "جهاز قياس السكر", categoryId: "pharmacy", price: 85000, image: IMG("photo-1585435557343-3b092031a831"), description: "جهاز قياس سكر الدم المنزلي", inStock: true },
      { name: "شرائط قياس سكر 50 شريط", categoryId: "pharmacy", price: 30000, image: IMG("photo-1585435557343-3b092031a831"), description: "شرائط قياس سكر الدم 50 شريط", inStock: true },
      { name: "بروبيوتيك للأطفال", categoryId: "pharmacy", price: 20000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "مكمل بروبيوتيك للأطفال قطرات 10 مل", inStock: true },
      { name: "كالسيوم وفيتامين D", categoryId: "pharmacy", price: 22000, image: IMG("photo-1584308666744-24d5c474f2ae"), description: "مكمل كالسيوم مع فيتامين D 30 قرص", inStock: true },
      { name: "مرهم للحروق", categoryId: "pharmacy", price: 12000, image: IMG("photo-1585435557343-3b092031a831"), description: "مرهم متخصص لعلاج الحروق 30 جرام", inStock: true },
      { name: "غسول فم", categoryId: "household", price: 10000, image: IMG("photo-1583947215259-38e31be8751f"), description: "غسول فم مضاد للبكتيريا 250 مل", inStock: true },
      { name: "كريم مضاد للتجاعيد", categoryId: "cosmetics", price: 35000, originalPrice: 42000, discount: 17, image: IMG("photo-1596462502278-27bfdc403348"), description: "كريم مضاد للتجاعيد 50 مل", inStock: true },
    ],
  },

  // ── SWEETS / BAKERY ──────────────────────────────────────────────────────────
  {
    name: "حلويات أم سعد", location: "الضلوعية - شارع النور",
    whatsappNumber: "07801234520", commissionPercent: 10,
    image: IMG("photo-1551024601-bec78aea704b"),
    rating: 4.8, ratingCount: 156, deliveryTime: "20-35",
    isOpen: true, categoryType: "store", cuisine: "حلويات شرقية وغربية",
    hasDelivery: true, minOrder: 8000, openTime: "09:00", closeTime: "22:00",
    description: "أشهى الحلويات العراقية والشرقية بمكونات طبيعية وبدون مواد حافظة",
    sortOrder: 20,
    products: [
      { name: "بقلاوة مشكلة 500 جرام", categoryId: "sweets", price: 30000, image: IMG("photo-1551024601-bec78aea704b"), description: "بقلاوة مشكلة بالفستق والكاجو 500 جرام", inStock: true },
      { name: "كنافة نابلسية", categoryId: "sweets", price: 20000, image: IMG("photo-1551024601-bec78aea704b"), description: "كنافة نابلسية بالجبن والعسل", inStock: true },
      { name: "مدلوقة", categoryId: "sweets", price: 15000, image: IMG("photo-1551024601-bec78aea704b"), description: "مدلوقة عراقية بالتمر والجوز", inStock: true },
      { name: "حلوى الراحة 500 جرام", categoryId: "sweets", price: 18000, image: IMG("photo-1551024601-bec78aea704b"), description: "حلوى الراحة المشكلة بالورد والفستق", inStock: true },
      { name: "غريبة بالسمسم", categoryId: "sweets", price: 12000, image: IMG("photo-1558961363-fa8fdf82db35"), description: "غريبة بالسمسم المحمص 500 جرام", inStock: true },
      { name: "كليجة تمر 12 حبة", categoryId: "sweets", price: 15000, image: IMG("photo-1558961363-fa8fdf82db35"), description: "كليجة تمر عراقية فاخرة 12 حبة", inStock: true },
      { name: "لقيمات بالعسل", categoryId: "sweets", price: 8000, image: IMG("photo-1551024601-bec78aea704b"), description: "لقيمات مقلية بالعسل والسمسم", inStock: true },
      { name: "شيرة عراقية", categoryId: "sweets", price: 10000, image: IMG("photo-1551024601-bec78aea704b"), description: "شيرة عراقية بالزعفران والماء", inStock: true },
      { name: "زردة بالمكسرات", categoryId: "sweets", price: 12000, image: IMG("photo-1551024601-bec78aea704b"), description: "حلوى الزردة العراقية بالزعفران والمكسرات", inStock: true },
      { name: "تمر مجدول 500 جرام", categoryId: "sweets", price: 25000, originalPrice: 30000, discount: 17, image: IMG("photo-1601050690597-df0568f70950"), description: "تمر مجدول سعودي فاخر 500 جرام", inStock: true },
      { name: "تمر سعودي مشكل 1 كيلو", categoryId: "sweets", price: 40000, image: IMG("photo-1601050690597-df0568f70950"), description: "تمر مشكل فاخر 1 كيلو", inStock: true },
      { name: "كيك بالشوكولاتة", categoryId: "sweets", price: 35000, image: IMG("photo-1578985545062-69928b1d9587"), description: "كيك شوكولاتة كامل مزيّن", inStock: true },
      { name: "كيك توليب", categoryId: "sweets", price: 45000, image: IMG("photo-1578985545062-69928b1d9587"), description: "كيك بالكريمة والفواكه للمناسبات", inStock: true },
    ],
  },

  {
    name: "مخبز الفجر", location: "الضلوعية - حي الفجر",
    whatsappNumber: "07801234521", commissionPercent: 8,
    image: IMG("photo-1509440159596-0249088772ff"),
    rating: 4.5, ratingCount: 83, deliveryTime: "15-25",
    isOpen: true, categoryType: "store", cuisine: "مخبوزات وحلويات",
    hasDelivery: true, minOrder: 5000, openTime: "05:00", closeTime: "22:00",
    description: "خبز طازج يومياً من التنور الحجري مع حلويات بيتية أصيلة",
    sortOrder: 21,
    products: [
      { name: "خبز طنور 10 أرغفة", categoryId: "bakery", price: 8000, image: IMG("photo-1509440159596-0249088772ff"), description: "خبز طنور طازج يومي 10 أرغفة", inStock: true },
      { name: "خبز صاج 10 قطع", categoryId: "bakery", price: 7000, image: IMG("photo-1509440159596-0249088772ff"), description: "خبز صاج رفيع طازج 10 قطع", inStock: true },
      { name: "سمون 6 حبات", categoryId: "bakery", price: 6000, image: IMG("photo-1509440159596-0249088772ff"), description: "سمون عراقي طازج 6 حبات", inStock: true },
      { name: "كروسان زبدة 6 حبات", categoryId: "bakery", price: 10000, image: IMG("photo-1555507036-ab1f4038808a"), description: "كرواسان زبدة طازج 6 حبات", inStock: true },
      { name: "كيك إسفنجي بالتمر", categoryId: "sweets", price: 15000, image: IMG("photo-1578985545062-69928b1d9587"), description: "كيك إسفنجي بحشوة التمر العراقي", inStock: true },
      { name: "معمول بالجوز", categoryId: "sweets", price: 18000, image: IMG("photo-1558961363-fa8fdf82db35"), description: "معمول عراقي بالجوز 6 حبات", inStock: true },
      { name: "معمول بالتمر", categoryId: "sweets", price: 18000, image: IMG("photo-1558961363-fa8fdf82db35"), description: "معمول عراقي بالتمر 6 حبات", inStock: true },
      { name: "قرص عقيلي", categoryId: "sweets", price: 12000, originalPrice: 15000, discount: 20, image: IMG("photo-1558961363-fa8fdf82db35"), description: "قرص عقيلي عراقي أصيل 6 قطع", inStock: true },
      { name: "سنكاري بالجبن", categoryId: "bakery", price: 8000, image: IMG("photo-1509440159596-0249088772ff"), description: "سنكاري بالجبن والزعتر 4 قطع", inStock: true },
      { name: "سنكاري بالسكر", categoryId: "bakery", price: 6000, image: IMG("photo-1509440159596-0249088772ff"), description: "سنكاري حلو بالسمسم 4 قطع", inStock: true },
    ],
  },
];

async function seedVendors() {
  console.log("\n🏪 المتاجر والمنتجات...");

  for (const v of VENDORS) {
    const { products, ...vendorData } = v;

    // Vendor
    const vendorId = await addDocIfNew(
      "vendors", "name", v.name,
      { ...vendorData, createdAt: new Date().toISOString() },
      () => { addedVendors++; }
    );
    console.log(`  ${addedVendors > 0 ? "✓" : "↩"} ${v.name} (${vendorId})`);

    // Products
    for (const p of products) {
      const snap = await db.collection("products")
        .where("name", "==", p.name)
        .where("vendorId", "==", vendorId)
        .limit(1).get();
      if (!snap.empty) continue;

      const doc: Record<string, unknown> = {
        ...p,
        vendorId,
        restaurant: v.name,
        createdAt: now,
        updatedAt: now,
      };
      if (p.originalPrice !== undefined) doc.originalPrice = p.originalPrice;
      if (p.discount !== undefined) doc.discount = p.discount;
      await db.collection("products").add(doc);
      addedProducts++;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. BANNERS
// ═══════════════════════════════════════════════════════════════════════════════
const BANNERS = [
  { title: "توصيل سريع لباب بيتك في الضلوعية", image: IMG("photo-1526367790999-0150786686a2"), type: "slider" as const, order: 1, linkType: "screen",    linkTarget: "AllCategories" },
  { title: "أشهى المشاوي العراقية",             image: IMG("photo-1544025162-d76694265947"), type: "slider" as const, order: 2, linkType: "category",  linkTarget: "grills" },
  { title: "أطازج أسماك دجلة مشوية",            image: IMG("photo-1519708227418-c8fd9a32b7a2"), type: "slider" as const, order: 3, linkType: "category",  linkTarget: "meat-fish" },
  { title: "بيتزا إيطالية بعجينة طازجة",        image: IMG("photo-1574071318508-1cdbab80d002"), type: "slider" as const, order: 4, linkType: "category",  linkTarget: "pizza" },
  { title: "عروض وخصومات اليوم",                image: IMG("photo-1607082349566-187342175e2f"), type: "slider" as const, order: 5, linkType: "screen",    linkTarget: "AllCategories" },
  { title: "طلباتك اليومية بضغطة زر",           image: IMG("photo-1542838132-92c53300491e"), type: "offer"  as const, order: 6, linkType: "category",  linkTarget: "grocery" },
  { title: "مقهاك المفضل بدون خروج",            image: IMG("photo-1501339847302-ac426a4a7cbb"), type: "offer"  as const, order: 7, linkType: "category",  linkTarget: "cafe" },
  { title: "صيدلية في يدك ٢٤/٧",               image: IMG("photo-1584308666744-24d5c474f2ae"), type: "offer"  as const, order: 8, linkType: "category",  linkTarget: "pharmacy" },
];

async function seedBanners() {
  console.log("\n🖼  البانرات...");
  const existing = await db.collection("banners").get();
  if (existing.size >= BANNERS.length) {
    console.log("  ↩ البانرات موجودة مسبقاً");
    return;
  }
  for (const b of BANNERS) {
    const snap = await db.collection("banners").where("title", "==", b.title).limit(1).get();
    if (!snap.empty) continue;
    await db.collection("banners").add({ ...b, isActive: true });
    addedBanners++;
    console.log(`  ✓ ${b.title}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PROMO CODES
// ═══════════════════════════════════════════════════════════════════════════════
const PROMO_CODES = [
  { code: "ONWAY10",   type: "percentage" as const, value: 10, expiryDate: "2027-12-31" },
  { code: "ONWAY20",   type: "percentage" as const, value: 20, expiryDate: "2027-06-30" },
  { code: "WELCOME5",  type: "percentage" as const, value: 5,  expiryDate: "2027-12-31" },
  { code: "SAVE5000",  type: "fixed"      as const, value: 5000,  expiryDate: "2027-12-31" },
  { code: "SAVE10000", type: "fixed"      as const, value: 10000, expiryDate: "2027-06-30" },
  { code: "EID25",     type: "percentage" as const, value: 25, expiryDate: "2025-04-30" },
  { code: "SUMMER15",  type: "percentage" as const, value: 15, expiryDate: "2025-09-30" },
];

async function seedPromoCodes() {
  console.log("\n🎟  أكواد الخصم...");
  for (const p of PROMO_CODES) {
    const snap = await db.collection("promoCodes").where("code", "==", p.code).limit(1).get();
    if (!snap.empty) { console.log(`  ↩ ${p.code}`); continue; }
    await db.collection("promoCodes").add({ ...p, isActive: true, createdAt: now, updatedAt: now });
    addedPromoCodes++;
    console.log(`  ✓ ${p.code}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PROMOTIONAL SECTIONS (bestSellers / featured / discounts)
// ═══════════════════════════════════════════════════════════════════════════════
async function seedPromotionalSections() {
  console.log("\n⭐ الأقسام الترويجية...");

  // Gather product IDs with discount
  const discountSnap = await db.collection("products").where("discount", ">", 0).limit(10).get();
  const discountIds = discountSnap.docs.map(d => d.id);

  // Gather featured products (cafes + sweets)
  const featuredSnap = await db.collection("products")
    .where("categoryId", "in", ["cafe", "sweets"]).limit(10).get();
  const featuredIds = featuredSnap.docs.map(d => d.id);

  // Best sellers (restaurants + burgers + grills)
  const bsSnap = await db.collection("products")
    .where("categoryId", "in", ["restaurants", "burgers", "grills"]).limit(10).get();
  const bsIds = bsSnap.docs.map(d => d.id);

  const sections = [
    { type: "bestSellers", productIds: bsIds,       label: "الأكثر مبيعاً" },
    { type: "featured",    productIds: featuredIds,  label: "منتجات مميزة" },
    { type: "discounts",   productIds: discountIds,  label: "عروض وخصومات" },
  ];

  for (const s of sections) {
    const snap = await db.collection("promotionalSections").where("type", "==", s.type).limit(1).get();
    if (!snap.empty) { console.log(`  ↩ ${s.label}`); continue; }
    await db.collection("promotionalSections").add({
      type: s.type, productIds: s.productIds, isActive: true,
      createdAt: now, updatedAt: now,
    });
    addedSections++;
    console.log(`  ✓ ${s.label} (${s.productIds.length} منتج)`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🚀 OnWay — بدء إضافة البيانات التجريبية");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  await seedCategories();
  await seedVendors();
  await seedBanners();
  await seedPromoCodes();
  await seedPromotionalSections();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ اكتمل بنجاح! التقرير:");
  console.log(`  📂 فئات أُضيفت:        ${addedCategories}`);
  console.log(`  🏪 متاجر أُضيفت:       ${addedVendors}`);
  console.log(`  🛍  منتجات أُضيفت:     ${addedProducts}`);
  console.log(`  🖼  بانرات أُضيفت:      ${addedBanners}`);
  console.log(`  🎟  أكواد خصم أُضيفت:  ${addedPromoCodes}`);
  console.log(`  ⭐ أقسام ترويجية:      ${addedSections}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  process.exit(0);
}

main().catch(err => {
  console.error("❌ خطأ:", err.message);
  process.exit(1);
});
