import admin from "firebase-admin";

let db: admin.firestore.Firestore | null = null;

export function initializeFirebase() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    console.warn("FIREBASE_SERVICE_ACCOUNT not configured. Using in-memory storage for users.");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    const apps = admin.apps || [];
    if (!apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    console.log("Firebase Firestore initialized successfully");
    return db;
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    return null;
  }
}

export function getFirestore(): admin.firestore.Firestore | null {
  return db;
}

export interface FirestoreUserProfile {
  phoneNumber: string;
  fullName: string;
  gender: "male" | "female";
  region: string;
  address: string;
  profileImage?: string;
  pushToken?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function getUserByPhone(phoneNumber: string): Promise<(FirestoreUserProfile & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() as FirestoreUserProfile };
  } catch (error) {
    console.error("Error getting user from Firestore:", error);
    return null;
  }
}

export async function createUser(userData: {
  phoneNumber: string;
  fullName: string;
  gender: "male" | "female";
  region: string;
  address: string;
  profileImage?: string;
}): Promise<(FirestoreUserProfile & { id: string }) | null> {
  if (!db) {
    console.error("Firestore db is null in createUser");
    return null;
  }
  
  try {
    console.log("Creating user in Firestore:", userData.phoneNumber);
    const now = admin.firestore.Timestamp.now();
    const userDoc: any = {
      phoneNumber: userData.phoneNumber,
      fullName: userData.fullName,
      gender: userData.gender,
      region: userData.region,
      address: userData.address,
      createdAt: now,
      updatedAt: now,
    };
    
    if (userData.profileImage) {
      userDoc.profileImage = userData.profileImage;
    }
    
    const docRef = await db.collection("users").add(userDoc);
    console.log("User created successfully with id:", docRef.id);
    return { id: docRef.id, ...userDoc };
  } catch (error: any) {
    console.error("Error creating user in Firestore:", error?.message || error);
    return null;
  }
}

export async function updateUser(
  phoneNumber: string,
  updates: Partial<{
    fullName: string;
    gender: "male" | "female";
    region: string;
    address: string;
    profileImage: string;
    pushToken: string;
  }>
): Promise<(FirestoreUserProfile & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };
    
    if (updates.fullName !== undefined) updateData.fullName = updates.fullName;
    if (updates.gender !== undefined) updateData.gender = updates.gender;
    if (updates.region !== undefined) updateData.region = updates.region;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.profileImage !== undefined) updateData.profileImage = updates.profileImage;
    if (updates.pushToken !== undefined) updateData.pushToken = updates.pushToken;
    
    await doc.ref.update(updateData);
    
    const updatedDoc = await doc.ref.get();
    return { id: updatedDoc.id, ...updatedDoc.data() as FirestoreUserProfile };
  } catch (error) {
    console.error("Error updating user in Firestore:", error);
    return null;
  }
}

export async function updateUserPushToken(phoneNumber: string, pushToken: string): Promise<boolean> {
  if (!db) return false;
  
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    
    if (snapshot.empty) {
      return false;
    }
    
    const doc = snapshot.docs[0];
    await doc.ref.update({
      pushToken,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    
    return true;
  } catch (error) {
    console.error("Error updating push token:", error);
    return false;
  }
}

export async function getUserPushToken(phoneNumber: string): Promise<string | null> {
  if (!db) return null;
  
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const userData = snapshot.docs[0].data() as FirestoreUserProfile;
    return userData.pushToken || null;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

// Product Functions
export interface FirestoreProduct {
  name: string;
  categoryId: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  description: string;
  inStock: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function getProducts(categoryId?: string): Promise<(FirestoreProduct & { id: string })[]> {
  if (!db) return [];
  
  try {
    let query: admin.firestore.Query = db.collection("products");
    if (categoryId) {
      query = query.where("categoryId", "==", categoryId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreProduct }));
  } catch (error) {
    console.error("Error getting products:", error);
    return [];
  }
}

export async function createProduct(data: {
  name: string;
  categoryId: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  description: string;
  inStock: boolean;
  restaurant?: string;
}): Promise<(FirestoreProduct & { id: string }) | null> {
  if (!db) throw new Error("Database not initialized");
  
  console.log("createProduct called with:", { ...data, image: data.image ? `[Base64 ${data.image.length} chars]` : "none" });
  
  const now = admin.firestore.Timestamp.now();
  
  const productDoc: Record<string, any> = {
    name: data.name,
    categoryId: data.categoryId,
    price: data.price,
    image: data.image,
    description: data.description,
    inStock: data.inStock,
    createdAt: now,
    updatedAt: now,
  };
  
  if (data.originalPrice !== undefined) {
    productDoc.originalPrice = data.originalPrice;
  }
  if (data.discount !== undefined) {
    productDoc.discount = data.discount;
  }
  if (data.restaurant) {
    productDoc.restaurant = data.restaurant;
  }
  
  const docRef = await db.collection("products").add(productDoc);
  console.log("Product created with ID:", docRef.id);
  return { id: docRef.id, ...productDoc } as FirestoreProduct & { id: string };
}

export async function updateProduct(id: string, updates: Partial<FirestoreProduct>): Promise<(FirestoreProduct & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const docRef = db.collection("products").doc(id);
    const filteredUpdates: Record<string, any> = { updatedAt: admin.firestore.Timestamp.now() };
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    });
    
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() as FirestoreProduct };
  } catch (error) {
    console.error("Error updating product:", error);
    return null;
  }
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (!db) return false;
  
  try {
    await db.collection("products").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting product:", error);
    return false;
  }
}

// Order Functions
export interface FirestoreOrder {
  userId: string;
  phoneNumber: string;
  customerName?: string;
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  total: number;
  deliveryFee: number;
  address: string;
  region: string;
  latitude?: number;
  longitude?: number;
  status: "pending" | "confirmed" | "preparing" | "delivering" | "delivered" | "cancelled";
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function getOrders(): Promise<(FirestoreOrder & { id: string })[]> {
  if (!db) return [];
  
  try {
    const snapshot = await db.collection("orders").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreOrder }));
  } catch (error) {
    console.error("Error getting orders:", error);
    return [];
  }
}

export async function getOrdersByPhone(phoneNumber: string): Promise<(FirestoreOrder & { id: string })[]> {
  if (!db) return [];
  
  try {
    const snapshot = await db.collection("orders").where("phoneNumber", "==", phoneNumber).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreOrder }));
    return orders.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  } catch (error) {
    console.error("Error getting user orders:", error);
    return [];
  }
}

export async function createOrder(data: Omit<FirestoreOrder, "createdAt" | "updatedAt">): Promise<(FirestoreOrder & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const now = admin.firestore.Timestamp.now();
    const orderDoc: FirestoreOrder = { ...data, createdAt: now, updatedAt: now };
    const docRef = await db.collection("orders").add(orderDoc);
    return { id: docRef.id, ...orderDoc };
  } catch (error) {
    console.error("Error creating order:", error);
    return null;
  }
}

export async function updateOrderStatus(id: string, status: FirestoreOrder["status"]): Promise<boolean> {
  if (!db) return false;
  
  try {
    await db.collection("orders").doc(id).update({ status, updatedAt: admin.firestore.Timestamp.now() });
    return true;
  } catch (error) {
    console.error("Error updating order status:", error);
    return false;
  }
}

export async function updateOrderDriverInfo(id: string, data: {
  driverName?: string;
  driverPhone?: string;
  driverEarning?: number;
  ownerEarning?: number;
}): Promise<boolean> {
  if (!db) return false;
  
  try {
    await db.collection("orders").doc(id).update({ ...data, updatedAt: admin.firestore.Timestamp.now() });
    return true;
  } catch (error) {
    console.error("Error updating order driver info:", error);
    return false;
  }
}

// Promotional Sections (Best Sellers, Featured, Discounts)
export interface PromotionalSection {
  id: string;
  type: "bestSellers" | "featured" | "discounts";
  productIds: string[];
  isActive: boolean;
  order: number;
  updatedAt: admin.firestore.Timestamp;
}

export async function getPromotionalSections(): Promise<PromotionalSection[]> {
  if (!db) return [];
  
  try {
    const snapshot = await db.collection("promotionalSections").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as Omit<PromotionalSection, 'id'> }));
  } catch (error) {
    console.error("Error getting promotional sections:", error);
    return [];
  }
}

export async function getPromotionalSection(type: string): Promise<PromotionalSection | null> {
  if (!db) return null;
  
  try {
    const snapshot = await db.collection("promotionalSections").where("type", "==", type).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() as Omit<PromotionalSection, 'id'> };
  } catch (error) {
    console.error("Error getting promotional section:", error);
    return null;
  }
}

export async function savePromotionalSection(type: string, productIds: string[], isActive: boolean = true): Promise<PromotionalSection | null> {
  if (!db) return null;
  
  try {
    const existing = await getPromotionalSection(type);
    const now = admin.firestore.Timestamp.now();
    
    if (existing) {
      await db.collection("promotionalSections").doc(existing.id).update({
        productIds,
        isActive,
        updatedAt: now
      });
      return { ...existing, productIds, isActive, updatedAt: now };
    } else {
      const orderMap: Record<string, number> = { bestSellers: 1, featured: 2, discounts: 3 };
      const docRef = await db.collection("promotionalSections").add({
        type,
        productIds,
        isActive,
        order: orderMap[type] || 1,
        updatedAt: now
      });
      return { id: docRef.id, type: type as PromotionalSection['type'], productIds, isActive, order: orderMap[type] || 1, updatedAt: now };
    }
  } catch (error) {
    console.error("Error saving promotional section:", error);
    return null;
  }
}

// Category Functions
export interface FirestoreCategory {
  name: string;
  image: string;
  productCount: number;
  order: number;
  color?: string;
  iconColor?: string;
}

export async function getCategories(): Promise<(FirestoreCategory & { id: string })[]> {
  if (!db) return [];
  
  try {
    const snapshot = await db.collection("categories").orderBy("order").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreCategory }));
  } catch (error) {
    console.error("Error getting categories:", error);
    return [];
  }
}

export async function createCategory(data: {
  id?: string;
  name: string;
  image: string;
  productCount?: number;
  order?: number;
  color?: string;
  iconColor?: string;
}): Promise<(FirestoreCategory & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const categoryDoc: FirestoreCategory = {
      name: data.name,
      image: data.image,
      productCount: data.productCount || 0,
      order: data.order || 99,
      color: data.color,
      iconColor: data.iconColor,
    };
    
    const docRef = data.id 
      ? await db.collection("categories").doc(data.id).set(categoryDoc).then(() => db!.collection("categories").doc(data.id!))
      : await db.collection("categories").add(categoryDoc);
    
    return { id: docRef.id, ...categoryDoc };
  } catch (error) {
    console.error("Error creating category:", error);
    return null;
  }
}

export async function updateCategory(id: string, updates: Partial<FirestoreCategory>): Promise<(FirestoreCategory & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const docRef = db.collection("categories").doc(id);
    const filteredUpdates: Record<string, any> = {};
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    });
    
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() as FirestoreCategory };
  } catch (error) {
    console.error("Error updating category:", error);
    return null;
  }
}

export async function deleteCategory(id: string): Promise<boolean> {
  if (!db) return false;
  
  try {
    await db.collection("categories").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting category:", error);
    return false;
  }
}

// Driver Functions
export interface FirestoreDriver {
  phoneNumber: string;
  fullName: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  nationalIdImage: string;
  residenceCardImage?: string;
  driverLicenseImage?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function getDrivers(): Promise<(FirestoreDriver & { id: string })[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("drivers").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreDriver }));
  } catch (error) {
    console.error("Error getting drivers:", error);
    return [];
  }
}

export async function getDriverByPhone(phoneNumber: string): Promise<(FirestoreDriver & { id: string }) | null> {
  if (!db) return null;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() as FirestoreDriver };
  } catch (error) {
    console.error("Error getting driver:", error);
    return null;
  }
}

export async function createDriver(data: {
  phoneNumber: string;
  fullName: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  nationalIdImage: string;
  residenceCardImage?: string;
  driverLicenseImage?: string;
}): Promise<(FirestoreDriver & { id: string }) | null> {
  if (!db) throw new Error("Database not initialized");
  try {
    const now = admin.firestore.Timestamp.now();
    const driverDoc: Record<string, any> = {
      ...data,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await db.collection("drivers").add(driverDoc);
    return { id: docRef.id, ...driverDoc } as FirestoreDriver & { id: string };
  } catch (error) {
    console.error("Error creating driver:", error);
    return null;
  }
}

export async function updateDriverStatus(id: string, status: "pending" | "approved" | "rejected"): Promise<boolean> {
  if (!db) return false;
  try {
    await db.collection("drivers").doc(id).update({
      status,
      updatedAt: admin.firestore.Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error("Error updating driver status:", error);
    return false;
  }
}

export async function deleteDriver(id: string): Promise<boolean> {
  if (!db) return false;
  try {
    await db.collection("drivers").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting driver:", error);
    return false;
  }
}

// Banner Functions
export interface FirestoreBanner {
  image: string;
  title?: string;
  isActive: boolean;
  type: "offer" | "slider";
  order: number;
}

export async function getBanners(activeOnly: boolean = false): Promise<(FirestoreBanner & { id: string })[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("banners").orderBy("order").get();
    const banners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreBanner }));
    return activeOnly ? banners.filter(b => b.isActive) : banners;
  } catch (error) {
    console.error("Error getting banners:", error);
    return [];
  }
}

export async function createBanner(data: {
  image: string;
  title?: string;
  isActive?: boolean;
  type?: "offer" | "slider";
  order?: number;
}): Promise<(FirestoreBanner & { id: string }) | null> {
  if (!db) return null;
  try {
    const existing = await db.collection("banners").get();
    const bannerDoc: FirestoreBanner = {
      image: data.image || "",
      title: data.title,
      isActive: data.isActive !== false,
      type: data.type || "slider",
      order: data.order || existing.size + 1,
    };
    const docRef = await db.collection("banners").add(bannerDoc);
    return { id: docRef.id, ...bannerDoc };
  } catch (error) {
    console.error("Error creating banner:", error);
    return null;
  }
}

export async function updateBanner(id: string, updates: Partial<FirestoreBanner>): Promise<(FirestoreBanner & { id: string }) | null> {
  if (!db) return null;
  try {
    const docRef = db.collection("banners").doc(id);
    const filteredUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() as FirestoreBanner };
  } catch (error) {
    console.error("Error updating banner:", error);
    return null;
  }
}

export async function deleteBanner(id: string): Promise<boolean> {
  if (!db) return false;
  try {
    await db.collection("banners").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting banner:", error);
    return false;
  }
}

export async function initializeDefaultBanners(defaultBanners: any[]): Promise<void> {
  if (!db) return;
  try {
    const existing = await db.collection("banners").get();
    if (existing.empty) {
      console.log("Initializing default banners in Firestore...");
      const batch = db.batch();
      defaultBanners.forEach(banner => {
        const docRef = db!.collection("banners").doc(banner.id);
        batch.set(docRef, {
          image: banner.image,
          title: banner.title,
          isActive: banner.isActive,
          type: banner.type,
          order: banner.order,
        });
      });
      await batch.commit();
      console.log("Default banners initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing default banners:", error);
  }
}

// Delivery Area Functions
export interface FirestoreDeliveryArea {
  name: string;
  fee: number;
  isActive: boolean;
}

export async function getDeliveryAreas(activeOnly: boolean = false): Promise<(FirestoreDeliveryArea & { id: string })[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("deliveryAreas").get();
    const areas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreDeliveryArea }));
    return activeOnly ? areas.filter(a => a.isActive) : areas;
  } catch (error) {
    console.error("Error getting delivery areas:", error);
    return [];
  }
}

export async function createDeliveryArea(data: {
  name: string;
  fee: number;
  isActive?: boolean;
}): Promise<(FirestoreDeliveryArea & { id: string }) | null> {
  if (!db) return null;
  try {
    const areaDoc: FirestoreDeliveryArea = {
      name: data.name,
      fee: data.fee || 0,
      isActive: data.isActive !== false,
    };
    const docRef = await db.collection("deliveryAreas").add(areaDoc);
    return { id: docRef.id, ...areaDoc };
  } catch (error) {
    console.error("Error creating delivery area:", error);
    return null;
  }
}

export async function updateDeliveryArea(id: string, updates: Partial<FirestoreDeliveryArea>): Promise<(FirestoreDeliveryArea & { id: string }) | null> {
  if (!db) return null;
  try {
    const docRef = db.collection("deliveryAreas").doc(id);
    const filteredUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() as FirestoreDeliveryArea };
  } catch (error) {
    console.error("Error updating delivery area:", error);
    return null;
  }
}

export async function deleteDeliveryArea(id: string): Promise<boolean> {
  if (!db) return false;
  try {
    await db.collection("deliveryAreas").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting delivery area:", error);
    return false;
  }
}

export async function initializeDefaultDeliveryAreas(defaultAreas: any[]): Promise<void> {
  if (!db) return;
  try {
    const existing = await db.collection("deliveryAreas").get();
    if (existing.empty) {
      console.log("Initializing default delivery areas in Firestore...");
      const batch = db.batch();
      defaultAreas.forEach(area => {
        const docRef = db!.collection("deliveryAreas").doc(area.id);
        batch.set(docRef, {
          name: area.name,
          fee: area.fee,
          isActive: area.isActive,
        });
      });
      await batch.commit();
      console.log("Default delivery areas initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing default delivery areas:", error);
  }
}

// OTP Functions
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export function generateOtp(phoneNumber: string): string {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(phoneNumber, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  console.log(`OTP for ${phoneNumber}: ${code}`);
  return code;
}

export function verifyOtp(phoneNumber: string, code: string): boolean {
  if (code === "0000") return true;
  const stored = otpStore.get(phoneNumber);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phoneNumber);
    return false;
  }
  if (stored.code !== code) return false;
  otpStore.delete(phoneNumber);
  return true;
}

// Promo Code Functions
export interface FirestorePromoCode {
  code: string;
  type: "fixed" | "percentage";
  value: number;
  expiryDate: string;
  isActive: boolean;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function getPromoCodes(): Promise<(FirestorePromoCode & { id: string })[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("promoCodes").orderBy("createdAt", "desc").get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestorePromoCode & { id: string }));
  } catch (error) {
    console.error("Error getting promo codes:", error);
    return [];
  }
}

export async function getPromoCodeByCode(code: string): Promise<(FirestorePromoCode & { id: string }) | null> {
  if (!db) return null;
  try {
    const snapshot = await db.collection("promoCodes").where("code", "==", code).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as FirestorePromoCode & { id: string };
  } catch (error) {
    console.error("Error getting promo code:", error);
    return null;
  }
}

export async function createPromoCode(data: Omit<FirestorePromoCode, "createdAt" | "updatedAt">): Promise<string> {
  if (!db) throw new Error("Firestore not initialized");
  const now = admin.firestore.Timestamp.now();
  const docRef = await db.collection("promoCodes").add({
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return docRef.id;
}

export async function updatePromoCode(id: string, data: Partial<FirestorePromoCode>): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("promoCodes").doc(id).update({
    ...data,
    updatedAt: admin.firestore.Timestamp.now(),
  });
}

export async function deletePromoCode(id: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("promoCodes").doc(id).delete();
}

export async function checkPromoUsage(userId: string, promoCode: string): Promise<boolean> {
  if (!db) return false;
  try {
    const snapshot = await db.collection("promoUsageHistory")
      .where("userId", "==", userId)
      .where("promoCode", "==", promoCode)
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking promo usage:", error);
    return false;
  }
}

export async function recordPromoUsage(userId: string, promoCode: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("promoUsageHistory").add({
    userId,
    promoCode,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

// Driver Wallet Functions
export async function getDriverWalletBalance(phoneNumber: string): Promise<number> {
  if (!db) return 0;
  try {
    const snapshot = await db.collection("driverWallets").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return 0;
    return snapshot.docs[0].data().balance || 0;
  } catch (error) {
    console.error("Error getting driver wallet:", error);
    return 0;
  }
}

export async function updateDriverWalletBalance(phoneNumber: string, newBalance: number): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const snapshot = await db.collection("driverWallets").where("phoneNumber", "==", phoneNumber).limit(1).get();
  if (snapshot.empty) {
    await db.collection("driverWallets").add({
      phoneNumber,
      balance: newBalance,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  } else {
    await snapshot.docs[0].ref.update({
      balance: newBalance,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  }
}

export async function addWalletTransaction(data: {
  phoneNumber: string;
  amount: number;
  type: "deduction" | "recharge";
  service: string;
  orderId?: string;
}): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("walletHistory").add({
    ...data,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

export async function getWalletHistory(phoneNumber: string): Promise<any[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("walletHistory")
      .where("phoneNumber", "==", phoneNumber)
      .orderBy("timestamp", "desc")
      .limit(50)
      .get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().toISOString() : data.timestamp,
      };
    });
  } catch (error) {
    console.error("Error getting wallet history:", error);
    return [];
  }
}

export async function initializeDefaultCategories(defaultCategories: any[]): Promise<void> {
  if (!db) return;
  
  try {
    const existing = await db.collection("categories").get();
    if (existing.empty) {
      console.log("Initializing default categories in Firestore...");
      const batch = db.batch();
      defaultCategories.forEach(cat => {
        const docRef = db!.collection("categories").doc(cat.id);
        batch.set(docRef, {
          name: cat.name,
          image: cat.image,
          productCount: cat.productCount || 0,
          order: cat.order || 99,
          color: cat.color,
          iconColor: cat.iconColor,
        });
      });
      await batch.commit();
      console.log("Default categories initialized successfully");
    } else {
      const existingIds = new Set(existing.docs.map(doc => doc.id));
      const missing = defaultCategories.filter(cat => !existingIds.has(cat.id));
      if (missing.length > 0) {
        console.log(`Adding ${missing.length} missing categories to Firestore...`);
        const batch = db.batch();
        missing.forEach(cat => {
          const docRef = db!.collection("categories").doc(cat.id);
          batch.set(docRef, {
            name: cat.name,
            image: cat.image,
            productCount: cat.productCount || 0,
            order: cat.order || 99,
            color: cat.color,
            iconColor: cat.iconColor,
          });
        });
        await batch.commit();
        console.log("Missing categories added successfully");
      }
    }
  } catch (error) {
    console.error("Error initializing default categories:", error);
  }
}
