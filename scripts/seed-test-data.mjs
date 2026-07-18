/**
 * Seed realistic TEST data into Firestore for demoing the app.
 *
 * EVERY document written here carries `__seed: true` and a `seed_`-prefixed id,
 * so `scripts/clean-test-data.mjs` can remove ALL of it in one command before
 * launch. Safe to re-run: it uses fixed ids with .set(), so it overwrites rather
 * than duplicating.
 *
 * Run:  node scripts/seed-test-data.mjs        (needs FIREBASE_SERVICE_ACCOUNT)
 */
import admin from "firebase-admin";

const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svc) {
  console.error("✗ FIREBASE_SERVICE_ACCOUNT غير مضبوط — أضِفه في Secrets ثم أعد المحاولة.");
  process.exit(1);
}
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svc)) });
}
const db = admin.firestore();
const now = new Date().toISOString();
const SEED = { __seed: true };

// Real photos (load over the internet) so the demo looks complete.
const IMG = {
  grill: "https://images.unsplash.com/photo-1544025162-d76694265947?w=600",
  shawarma: "https://images.unsplash.com/photo-1633321702518-7feccafb94d5?w=600",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600",
  market: "https://images.unsplash.com/photo-1580913428023-02c695666d61?w=600",
  pharmacy: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600",
  bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600",
  apple: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=600",
  banana: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600",
  bread: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600",
  milk: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600",
  chicken: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600",
  water: "https://images.unsplash.com/photo-1560023907-5f339617ea30?w=600",
  medicine: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600",
};

// ── Restaurants (vendors collection, "restaurant listing" shape → /api/vendors) ──
const restaurants = [
  { id: "seed_r1", name: "مطعم الضلوعية للمشاوي", location: "الضلوعية - الشارع العام", image: IMG.grill, rating: 4.8, cuisine: "مشاوي", deliveryTime: "25-35" },
  { id: "seed_r2", name: "شاورما البركة", location: "حي البجواري", image: IMG.shawarma, rating: 4.6, cuisine: "شاورما", deliveryTime: "20-30" },
  { id: "seed_r3", name: "بيتزا الرافدين", location: "قرب الجسر", image: IMG.pizza, rating: 4.5, cuisine: "بيتزا وفاست فود", deliveryTime: "30-40" },
  { id: "seed_r4", name: "برجر هاوس", location: "شارع المدارس", image: IMG.burger, rating: 4.3, cuisine: "برجر", deliveryTime: "25-35" },
];

// ── Stores (vendors collection, "store" shape, status active → /api/stores) ──
const stores = [
  { id: "seed_s1", storeName: "سوبرماركت البركة", businessType: "supermarket", cover: IMG.market, avatar: IMG.market, rating: 4.7, bio: "كل احتياجاتك اليومية بأسعار مناسبة." },
  { id: "seed_s2", storeName: "صيدلية النور", businessType: "pharmacy", cover: IMG.pharmacy, avatar: IMG.pharmacy, rating: 4.9, bio: "أدوية ومستلزمات صحية على مدار اليوم." },
  { id: "seed_s3", storeName: "مخبز الطازج", businessType: "bakery", cover: IMG.bakery, avatar: IMG.bakery, rating: 4.6, bio: "خبز وحلويات طازجة يومياً." },
];

// products per store id
const productsByStore = {
  seed_s1: [
    { name: "تفاح أحمر", price: 2000, category: "fruits-vegetables", unit: "كغم", image: IMG.apple },
    { name: "موز", price: 1500, category: "fruits-vegetables", unit: "كغم", image: IMG.banana },
    { name: "حليب طازج 1 لتر", price: 1250, category: "dairy-eggs", unit: "علبة", image: IMG.milk },
    { name: "دجاج طازج", price: 8000, category: "meat-poultry", unit: "كغم", image: IMG.chicken },
    { name: "ماء معدني 12 قنينة", price: 3000, category: "beverages", unit: "كرتون", image: IMG.water },
  ],
  seed_s2: [
    { name: "بنادول اكسترا", price: 2500, category: "pharmacy", unit: "علبة", image: IMG.medicine },
    { name: "فيتامين سي", price: 4000, category: "pharmacy", unit: "علبة", image: IMG.medicine },
    { name: "معقم يدين", price: 1500, category: "cleaning-care", unit: "قنينة", image: IMG.medicine },
  ],
  seed_s3: [
    { name: "صمون طازج", price: 500, category: "bakery", unit: "كيس", image: IMG.bread },
    { name: "كيك اسفنجي", price: 3500, category: "snacks-sweets", unit: "قطعة", image: IMG.bread },
    { name: "معجنات جبن", price: 750, category: "bakery", unit: "قطعة", image: IMG.bread },
  ],
};

// ── Banners ──
const banners = [
  { id: "seed_b1", image: IMG.grill, title: "خصم 20% على أول طلب", isActive: true, type: "slider", order: 1, linkType: "category", linkTarget: "restaurants" },
  { id: "seed_b2", image: IMG.market, title: "توصيل مجاني من سوبرماركت البركة", isActive: true, type: "slider", order: 2, linkType: "screen", linkTarget: "AllCategories" },
];

async function run() {
  let count = 0;
  const batch = db.batch();

  for (const r of restaurants) {
    batch.set(db.collection("vendors").doc(r.id), {
      id: r.id, name: r.name, location: r.location, whatsappNumber: "",
      commissionPercent: 10, image: r.image, rating: r.rating, ratingCount: 24,
      deliveryTime: r.deliveryTime, isOpen: true, categoryType: "restaurant",
      cuisine: r.cuisine, hasDelivery: true, minOrder: 0, createdAt: now, sortOrder: 1,
      ...SEED,
    });
    count++;
  }

  for (const s of stores) {
    batch.set(db.collection("vendors").doc(s.id), {
      id: s.id, storeName: s.storeName, businessType: s.businessType,
      phoneNumber: "0000000000", ownerName: "حساب تجريبي", address: "قضاء الضلوعية",
      status: "active", totalProducts: (productsByStore[s.id] || []).length,
      totalOrders: 0, rating: s.rating, ratingCount: 18,
      deliveryTime: "30-45", deliveryPrice: 1000, workingHours: null,
      profileImageUrl: s.avatar, coverImageUrl: s.cover, bio: s.bio,
      categoryType: "store", createdAt: now, ...SEED,
    });
    count++;
    for (const [i, p] of (productsByStore[s.id] || []).entries()) {
      const pid = `${s.id}_p${i + 1}`;
      batch.set(db.collection("vendorProducts").doc(pid), {
        id: pid, vendorId: s.id, vendorName: s.storeName, storeName: s.storeName,
        vendorPhone: "0000000000", name: p.name, description: `${p.name} — منتج تجريبي`,
        price: p.price, category: p.category, stock: 25, unit: p.unit,
        imageUrl: p.image, imageUrls: [p.image], status: "approved",
        createdAt: now, updatedAt: now, ...SEED,
      });
      count++;
    }
  }

  for (const b of banners) {
    batch.set(db.collection("banners").doc(b.id), { ...b, createdAt: now, ...SEED });
    count++;
  }

  await batch.commit();
  console.log(`✓ تمت إضافة ${count} مستنداً تجريبياً (${restaurants.length} مطاعم، ${stores.length} متاجر + منتجاتها، ${banners.length} بانرات).`);
  console.log("  كلها موسومة __seed:true — احذفها لاحقاً بـ: node scripts/clean-test-data.mjs");
  process.exit(0);
}

run().catch((e) => { console.error("✗ فشل:", e.message); process.exit(1); });
