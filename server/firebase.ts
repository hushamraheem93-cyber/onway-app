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
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  total: number;
  deliveryFee: number;
  address: string;
  region: string;
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
