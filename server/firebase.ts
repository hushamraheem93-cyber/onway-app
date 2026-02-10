import * as admin from "firebase-admin";

let db: admin.firestore.Firestore | null = null;

export function initializeFirebase() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!serviceAccountJson) {
    console.warn("FIREBASE_SERVICE_ACCOUNT not configured. Using in-memory storage for users.");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    if (!admin.apps.length) {
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

// OTP Functions
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export function generateOtp(phoneNumber: string): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phoneNumber, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return code;
}

export async function sendOtpViaOtpIq(phoneNumber: string, code: string): Promise<boolean> {
  const apiKey = process.env.OTPIQ_APl_key;
  if (!apiKey) {
    console.warn("OTPIQ_APl_key not configured, OTP logged to console only");
    console.log(`[OTP] Code for ${phoneNumber}: ${code}`);
    return true;
  }

  try {
    const cleanPhone = phoneNumber.replace(/^00/, "");
    
    const response = await fetch("https://api.otpiq.com/api/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        phoneNumber: cleanPhone,
        smsType: "verification",
        verificationCode: code,
        provider: "whatsapp-sms",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[OTPIQ] Error sending OTP:", response.status, errorData);
      return false;
    }

    const data = await response.json();
    console.log(`[OTPIQ] OTP sent to ${cleanPhone}, smsId: ${data.smsId}, remaining credit: ${data.remainingCredit}`);
    return true;
  } catch (error) {
    console.error("[OTPIQ] Failed to send OTP:", error);
    return false;
  }
}

export function verifyOtp(phoneNumber: string, code: string): boolean {
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
    }
  } catch (error) {
    console.error("Error initializing default categories:", error);
  }
}
