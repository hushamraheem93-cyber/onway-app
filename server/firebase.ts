import admin from "firebase-admin";
import { orderEvents } from "./orderEvents";
import { isDevMode } from "./env";

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
        storageBucket: `onway-media-${serviceAccount.project_id.replace(/[^a-z0-9]/g, "")}`,
      });
    }
    
    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
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

/**
 * All Iraqi phone variants for a raw number — lets us find users stored with
 * any historical format (009647…, 9647…, 07…, 7…) regardless of which one the
 * caller passes in.  Deduplicated and always starts with the raw value so the
 * first hit is the cheapest match.
 */
function phoneVariants(raw: string): string[] {
  const digits = (raw || "").replace(/\D/g, "");
  const set = new Set<string>();
  set.add(raw); // exact match first

  let local = ""; // 07XXXXXXXXX
  if (digits.startsWith("00964")) local = "0" + digits.slice(5);
  else if (digits.startsWith("964")) local = "0" + digits.slice(3);
  else if (digits.startsWith("07")) local = digits;
  else if (digits.startsWith("7")) local = "0" + digits;

  if (local) {
    set.add(local);                    // 07XXXXXXXXX
    set.add("00964" + local.slice(1)); // 009647XXXXXXXXX
    set.add("964" + local.slice(1));   // 9647XXXXXXXXX
    set.add(local.slice(1));           // 7XXXXXXXXX (no leading zero)
  }
  return [...set];
}

export async function getUserByPhone(phoneNumber: string): Promise<(FirestoreUserProfile & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const usersRef = db.collection("users");
    // Try every format variant so legacy documents (stored with 009647…) are found
    // even when the caller passes the modern 07… form and vice-versa.
    for (const phone of phoneVariants(phoneNumber)) {
      const snapshot = await usersRef.where("phoneNumber", "==", phone).limit(1).get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() as FirestoreUserProfile };
      }
    }
    return null;
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
  latitude?: number;
  longitude?: number;
}): Promise<(FirestoreUserProfile & { id: string }) | null> {
  if (!db) {
    console.error("Firestore db is null in createUser");
    return null;
  }
  
  try {
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
    if (userData.latitude !== undefined) userDoc.latitude = userData.latitude;
    if (userData.longitude !== undefined) userDoc.longitude = userData.longitude;
    
    const docRef = await db.collection("users").add(userDoc);
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
    latitude: number;
    longitude: number;
  }>
): Promise<(FirestoreUserProfile & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const usersRef = db.collection("users");
    let doc: admin.firestore.QueryDocumentSnapshot | null = null;
    for (const phone of phoneVariants(phoneNumber)) {
      const snapshot = await usersRef.where("phoneNumber", "==", phone).limit(1).get();
      if (!snapshot.empty) { doc = snapshot.docs[0]; break; }
    }
    if (!doc) return null;

    const updateData: any = {
      updatedAt: admin.firestore.Timestamp.now(),
    };
    
    if (updates.fullName !== undefined) updateData.fullName = updates.fullName;
    if (updates.gender !== undefined) updateData.gender = updates.gender;
    if (updates.region !== undefined) updateData.region = updates.region;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.profileImage !== undefined) updateData.profileImage = updates.profileImage;
    if (updates.pushToken !== undefined) updateData.pushToken = updates.pushToken;
    if (updates.latitude !== undefined) updateData.latitude = updates.latitude;
    if (updates.longitude !== undefined) updateData.longitude = updates.longitude;
    
    await doc.ref.update(updateData);
    
    const updatedDoc = await doc.ref.get();
    return { id: updatedDoc.id, ...updatedDoc.data() as FirestoreUserProfile };
  } catch (error) {
    console.error("Error updating user in Firestore:", error);
    return null;
  }
}

// ── Address book (server-synced) ──────────────────────────────────────────────
// Stored as an `addresses` array on the user doc so it follows the account across
// devices and can be selected at checkout (replaces the old AsyncStorage-only list).
export interface SavedAddress {
  id: string;
  title: string;
  region: string;
  address: string;
  isDefault: boolean;
  latitude?: number;
  longitude?: number;
}

export async function getUserAddresses(phoneNumber: string): Promise<SavedAddress[]> {
  if (!db) return [];
  try {
    for (const phone of phoneVariants(phoneNumber)) {
      const snap = await db.collection("users").where("phoneNumber", "==", phone).limit(1).get();
      if (!snap.empty) {
        const data = snap.docs[0].data() as any;
        return Array.isArray(data.addresses) ? (data.addresses as SavedAddress[]) : [];
      }
    }
    return [];
  } catch (error) {
    console.error("Error reading user addresses:", error);
    return [];
  }
}

export async function setUserAddresses(
  phoneNumber: string,
  addresses: SavedAddress[],
): Promise<SavedAddress[] | null> {
  if (!db) return null;
  try {
    let snap: admin.firestore.QuerySnapshot | null = null;
    for (const phone of phoneVariants(phoneNumber)) {
      const s = await db.collection("users").where("phoneNumber", "==", phone).limit(1).get();
      if (!s.empty) { snap = s; break; }
    }
    if (!snap) return null;
    // Only one address may be the default.
    let seenDefault = false;
    const clean = addresses.slice(0, 30).map((a) => {
      const isDefault = !!a.isDefault && !seenDefault;
      if (isDefault) seenDefault = true;
      return {
        id: String(a.id),
        title: String(a.title || "").slice(0, 60),
        region: String(a.region || "").slice(0, 120),
        address: String(a.address || "").slice(0, 400),
        isDefault,
        ...(typeof a.latitude === "number" ? { latitude: a.latitude } : {}),
        ...(typeof a.longitude === "number" ? { longitude: a.longitude } : {}),
      } as SavedAddress;
    });
    await (snap as admin.firestore.QuerySnapshot).docs[0].ref.update({ addresses: clean, updatedAt: admin.firestore.Timestamp.now() });
    return clean;
  } catch (error) {
    console.error("Error writing user addresses:", error);
    return null;
  }
}

export async function updateUserPushToken(phoneNumber: string, pushToken: string): Promise<boolean> {
  if (!db) return false;

  try {
    // Always save to dedicated pushTokens collection (phoneNumber as doc ID)
    const safeId = phoneNumber.replace(/[^a-zA-Z0-9]/g, "_");
    await db.collection("pushTokens").doc(safeId).set(
      { phoneNumber, pushToken, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true }
    );

    // Also update the user document if it exists (try all phone variants)
    const usersRef = db.collection("users");
    for (const phone of phoneVariants(phoneNumber)) {
      const snapshot = await usersRef.where("phoneNumber", "==", phone).limit(1).get();
      if (!snapshot.empty) {
        await snapshot.docs[0].ref.update({ pushToken, updatedAt: admin.firestore.Timestamp.now() });
        break;
      }
    }

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
    for (const phone of phoneVariants(phoneNumber)) {
      const snapshot = await usersRef.where("phoneNumber", "==", phone).limit(1).get();
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data() as FirestoreUserProfile;
        return userData.pushToken || null;
      }
    }
    return null;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

export async function saveAdminPushToken(pushToken: string): Promise<boolean> {
  if (!db) return false;
  try {
    await db.collection("app_settings").doc("admin_push").set(
      { pushToken, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error("Error saving admin push token:", error);
    return false;
  }
}

export async function getAdminPushToken(): Promise<string | null> {
  if (!db) return null;
  try {
    const doc = await db.collection("app_settings").doc("admin_push").get();
    return doc.exists ? (doc.data()?.pushToken || null) : null;
  } catch (error) {
    console.error("Error getting admin push token:", error);
    return null;
  }
}

export async function getAllUsers(): Promise<(FirestoreUserProfile & { id: string })[]> {
  if (!db) return [];
  
  try {
    const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as FirestoreUserProfile),
    }));
  } catch (error) {
    console.error("Error getting all users:", error);
    return [];
  }
}

export async function getAllUserPushTokens(): Promise<string[]> {
  if (!db) return [];

  const tokenSet = new Set<string>();

  try {
    // Primary: read from dedicated pushTokens collection
    const ptSnapshot = await db.collection("pushTokens").get();
    ptSnapshot.forEach((doc) => {
      const data = doc.data() as { pushToken?: string };
      if (data.pushToken && data.pushToken.startsWith("ExponentPushToken")) {
        tokenSet.add(data.pushToken);
      }
    });
  } catch (error) {
    console.error("Error reading pushTokens collection:", error);
  }

  try {
    // Fallback: also read from users collection (legacy)
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("pushToken", "!=", null).get();
    snapshot.forEach((doc) => {
      const data = doc.data() as FirestoreUserProfile;
      if (data.pushToken && data.pushToken.startsWith("ExponentPushToken")) {
        tokenSet.add(data.pushToken);
      }
    });
  } catch (error) {
    console.error("Error reading users push tokens:", error);
  }

  const tokens = Array.from(tokenSet);
  return tokens;
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
    const doc = await db.collection("products").doc(id).get();
    const imageUrl: string = doc.exists ? (doc.data() as any)?.image ?? "" : "";
    await db.collection("products").doc(id).delete();
    if (imageUrl) deleteFromFirebaseStorage(imageUrl).catch(() => {});
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
  customerPhone?: string;
  notes?: string;
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  total: number;
  deliveryFee: number;
  address: string;
  region: string;
  latitude?: number;
  longitude?: number;
  status: "pending" | "confirmed" | "preparing" | "ready" | "picked_up" | "in_delivery" | "delivered" | "cancelled" | "issue";
  issueType?: string;
  issuedAt?: admin.firestore.Timestamp;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  // Vendor / restaurant fields
  vendorId?: string;
  vendorName?: string;
  vendorWhatsapp?: string;
  orderType?: string;
  restaurantSubtotal?: number;
  vendorCommissionPercent?: number;
  vendorCommissionAmount?: number;
  promoCode?: string;
  promoDiscount?: number;
  driverPhone?: string;
  driverName?: string;
  driverEarning?: number;
  ownerEarning?: number;
  internationalDetails?: any;
  courierDetails?: any;
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

export async function getOrderById(orderId: string): Promise<(FirestoreOrder & { id: string }) | null> {
  if (!db) return null;
  try {
    const doc = await db.collection("orders").doc(orderId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() as FirestoreOrder };
  } catch {
    return null;
  }
}

// Targeted reads that replace full-collection getOrders() scans on hot paths
// (each scan read EVERY order ever created — cost and latency grow forever).

/** Fetch a specific set of orders by id in parallel; missing ids are skipped. */
export async function getOrdersByIds(orderIds: string[]): Promise<(FirestoreOrder & { id: string })[]> {
  const unique = [...new Set(orderIds.filter(Boolean))];
  const results = await Promise.all(unique.map((id) => getOrderById(id)));
  return results.filter((o): o is FirestoreOrder & { id: string } => o !== null);
}

/** Fetch only the orders in a given status (single-field query — no composite index needed). */
export async function getOrdersByStatus(status: string): Promise<(FirestoreOrder & { id: string })[]> {
  if (!db) return [];
  try {
    const snap = await db.collection("orders").where("status", "==", status).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() as FirestoreOrder }));
  } catch (error) {
    console.error("Error getting orders by status:", error);
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

// Get all delivered orders handled by a specific driver (by phone or name)
export async function getOrdersByDriverPhone(driverPhone: string, driverName?: string): Promise<any[]> {
  if (!db) return [];
  try {
    const seen = new Set<string>();
    const allOrders: any[] = [];

    // Query by driverPhone
    const byPhone = await db.collection("orders")
      .where("driverPhone", "==", driverPhone)
      .get();
    for (const doc of byPhone.docs) {
      const o = { id: doc.id, ...doc.data() as any };
      if (o.status === "delivered" && !seen.has(doc.id)) {
        seen.add(doc.id);
        allOrders.push(o);
      }
    }

    // Also query by driverName (for historical orders before driverPhone was saved)
    if (driverName) {
      const byName = await db.collection("orders")
        .where("driverName", "==", driverName)
        .get();
      for (const doc of byName.docs) {
        const o = { id: doc.id, ...doc.data() as any };
        if (o.status === "delivered" && !seen.has(doc.id)) {
          seen.add(doc.id);
          allOrders.push(o);
        }
      }
    }

    return allOrders.sort((a: any, b: any) => {
      const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  } catch (error) {
    console.error("Error getting orders by driver phone:", error);
    return [];
  }
}

export async function createOrder(data: Omit<FirestoreOrder, "createdAt" | "updatedAt">): Promise<(FirestoreOrder & { id: string }) | null> {
  if (!db) return null;
  
  try {
    const now = admin.firestore.Timestamp.now();
    const orderDoc: FirestoreOrder = { ...data, createdAt: now, updatedAt: now };
    const docRef = await db.collection("orders").add(orderDoc);
    // Real-time: broadcast the new order so vendor/admin lists refresh instantly
    // (reuses the same orders:changed ping path). Additive only.
    orderEvents.emit("order:status", { orderId: docRef.id, status: orderDoc.status });
    return { id: docRef.id, ...orderDoc };
  } catch (error) {
    console.error("Error creating order:", error);
    return null;
  }
}

// ── Order State Machine ────────────────────────────────────────────────────────
// Each key is the CURRENT status; the value lists every status it may transition TO.
// Terminal states (delivered, cancelled) have empty arrays — no further transitions.
// Callers pass { force: true } to bypass (admin-only overrides such as force-cancel
// a delivered order for a refund, or bulk status corrections).
const ORDER_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending:     ["confirmed", "cancelled"],
  confirmed:   ["preparing", "cancelled"],
  preparing:   ["in_delivery", "delivered", "cancelled", "issue"],
  in_delivery: ["delivered", "issue", "cancelled"],
  delivered:   [],   // terminal
  cancelled:   [],   // terminal
  issue:       ["preparing", "cancelled"],
};

export async function updateOrderStatus(
  id: string,
  status: FirestoreOrder["status"],
  opts?: { force?: boolean },
): Promise<boolean> {
  if (!db) return false;
  const force = opts?.force ?? false;

  try {
    let changed = false;

    if (!force) {
      // Validate the transition atomically: read current status, check the state
      // machine, then write — all in one transaction so no concurrent writer can
      // slip an illegal transition through.
      const orderRef = db.collection("orders").doc(id);
      changed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) return false;
        const current = (snap.data() as any)?.status as string | undefined;
        const allowed = ORDER_TRANSITIONS[current ?? ""] ?? [];
        if (!allowed.includes(status)) {
          console.warn(`[StateMachine] Blocked: ${current ?? "?"} → ${status} (order ${id})`);
          return false;
        }
        tx.update(orderRef, { status, updatedAt: admin.firestore.Timestamp.now() });
        return true;
      });
    } else {
      // Force mode: direct update without transition check (admin-only override).
      await db.collection("orders").doc(id).update({ status, updatedAt: admin.firestore.Timestamp.now() });
      changed = true;
    }

    if (changed) {
      // Real-time: notify listeners (routes.ts forwards this to the order's socket
      // room and broadcasts orders:changed). Additive only — HTTP polling is the fallback.
      orderEvents.emit("order:status", { orderId: id, status });
    }
    return changed;
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
    // Read old image URL only if we're replacing it — one targeted read
    const oldImageUrl: string = updates.image
      ? ((await docRef.get()).data() as any)?.image ?? ""
      : "";
    const filteredUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    // Fire-and-forget: delete old category image from Storage after successful update
    if (oldImageUrl && updates.image && oldImageUrl !== updates.image) {
      deleteFromFirebaseStorage(oldImageUrl).catch(() => {});
    }
    return { id: doc.id, ...doc.data() as FirestoreCategory };
  } catch (error) {
    console.error("Error updating category:", error);
    return null;
  }
}

export async function deleteCategory(id: string): Promise<boolean> {
  if (!db) return false;
  try {
    const doc = await db.collection("categories").doc(id).get();
    const imageUrl: string = doc.exists ? (doc.data() as any)?.image ?? "" : "";
    await db.collection("categories").doc(id).delete();
    if (imageUrl) deleteFromFirebaseStorage(imageUrl).catch(() => {});
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
  isOnline?: boolean;
  onlineAt?: number;
}

export async function getDrivers(): Promise<(FirestoreDriver & { id: string })[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("drivers").get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreDriver }));
    // sort newest-first in memory so docs without createdAt are still included
    docs.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    return docs;
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

/**
 * Look up a vendor by phone number across all phone format variants.
 * Returns the vendor doc id if found, null otherwise.
 */
export async function getVendorByPhone(phoneNumber: string): Promise<string | null> {
  if (!db) return null;
  try {
    for (const phone of phoneVariants(phoneNumber)) {
      const snapshot = await db.collection("vendors").where("phoneNumber", "==", phone).limit(1).get();
      if (!snapshot.empty) return snapshot.docs[0].id;
    }
    return null;
  } catch {
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

export async function updateDriverOnlineStatus(phoneNumber: string, isOnline: boolean): Promise<void> {
  if (!db) return;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return;
    const docRef = snapshot.docs[0].ref;
    await docRef.update({
      isOnline,
      onlineAt: isOnline ? Date.now() : null,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error("Error updating driver online status:", error);
  }
}

export async function saveDriverPushToken(phoneNumber: string, pushToken: string): Promise<void> {
  if (!db) return;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return;
    await snapshot.docs[0].ref.update({
      pushToken,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error("Error saving driver push token:", error);
  }
}

export async function getDriverPushToken(phoneNumber: string): Promise<string | null> {
  if (!db) return null;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data() as FirestoreDriver;
    return (data as any).pushToken || null;
  } catch (error) {
    console.error("Error getting driver push token:", error);
    return null;
  }
}

export async function getOnlineDrivers(): Promise<{ phoneNumber: string; onlineAt: number }[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("drivers")
      .where("isOnline", "==", true)
      .where("status", "==", "approved")
      .get();
    return snapshot.docs
      .map(doc => {
        const data = doc.data() as FirestoreDriver;
        return { phoneNumber: data.phoneNumber, onlineAt: data.onlineAt || Date.now() };
      })
      .sort((a, b) => a.onlineAt - b.onlineAt);
  } catch (error) {
    console.error("Error getting online drivers:", error);
    return [];
  }
}

// Banner Functions
export interface FirestoreBanner {
  image: string;
  title?: string;
  description?: string;
  isActive: boolean;
  type: "offer" | "slider";
  order: number;
  // Store link
  storeId?: string;
  storeName?: string;
  storeType?: string;
  // Deep-link fallback (non-store targets)
  linkType?: string;
  linkTarget?: string;
  // Scheduling
  startDate?: string; // ISO date string YYYY-MM-DD
  endDate?: string;   // ISO date string YYYY-MM-DD
  // Timestamps
  createdAt?: string;
  updatedAt?: string;
}

export async function getBanners(activeOnly: boolean = false): Promise<(FirestoreBanner & { id: string })[]> {
  if (!db) return [];
  try {
    const snapshot = await db.collection("banners").orderBy("order").get();
    let banners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as FirestoreBanner }));
    if (activeOnly) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      banners = banners.filter(b => {
        if (!b.isActive) return false;
        if (b.startDate && b.startDate > today) return false;
        if (b.endDate && b.endDate < today) return false;
        return true;
      });
    }
    return banners;
  } catch (error) {
    console.error("Error getting banners:", error);
    return [];
  }
}

export async function createBanner(data: {
  image: string;
  title?: string;
  description?: string;
  isActive?: boolean;
  type?: "offer" | "slider";
  order?: number;
  storeId?: string;
  storeName?: string;
  storeType?: string;
  linkType?: string;
  linkTarget?: string;
  startDate?: string;
  endDate?: string;
}): Promise<(FirestoreBanner & { id: string }) | null> {
  if (!db) return null;
  try {
    const existing = await db.collection("banners").get();
    const now = new Date().toISOString();
    const bannerDoc: FirestoreBanner = {
      image: data.image || "",
      title: data.title,
      description: data.description,
      isActive: data.isActive !== false,
      type: data.type || "slider",
      order: data.order || existing.size + 1,
      storeId: data.storeId || "",
      storeName: data.storeName || "",
      storeType: data.storeType || "",
      linkType: data.storeId ? "store" : (data.linkType || ""),
      linkTarget: data.storeId ? data.storeId : (data.linkTarget || ""),
      startDate: data.startDate || "",
      endDate: data.endDate || "",
      createdAt: now,
      updatedAt: now,
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
    // Read old image URL only if we're replacing it — one targeted read
    const oldImageUrl: string = updates.image
      ? ((await docRef.get()).data() as any)?.image ?? ""
      : "";
    // Auto-derive linkType/linkTarget from storeId when store is linked
    if (updates.storeId !== undefined) {
      updates.linkType = updates.storeId ? "store" : (updates.linkType || "");
      updates.linkTarget = updates.storeId ? updates.storeId : (updates.linkTarget || "");
    }
    updates.updatedAt = new Date().toISOString();
    const filteredUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    // Fire-and-forget: delete old banner image from Storage after successful update
    if (oldImageUrl && updates.image && oldImageUrl !== updates.image) {
      deleteFromFirebaseStorage(oldImageUrl).catch(() => {});
    }
    return { id: doc.id, ...doc.data() as FirestoreBanner };
  } catch (error) {
    console.error("Error updating banner:", error);
    return null;
  }
}

export async function deleteBanner(id: string): Promise<boolean> {
  if (!db) return false;
  try {
    const doc = await db.collection("banners").doc(id).get();
    const imageUrl: string = doc.exists ? (doc.data() as any)?.image ?? "" : "";
    await db.collection("banners").doc(id).delete();
    if (imageUrl) deleteFromFirebaseStorage(imageUrl).catch(() => {});
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
    // Only seed when the collection is completely empty.
    // Never overwrite on size mismatch (user may have deleted banners) and
    // never check the image format (base64 data URIs don't start with
    // "/uploads/banners/" which used to incorrectly force a full reset).
    const needsUpdate = existing.empty;
    if (needsUpdate) {
      const deleteBatch = db.batch();
      existing.docs.forEach(doc => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
      const createBatch = db.batch();
      defaultBanners.forEach(banner => {
        const docRef = db!.collection("banners").doc(banner.id);
        createBatch.set(docRef, {
          image: banner.image,
          title: banner.title,
          isActive: banner.isActive,
          type: banner.type,
          order: banner.order,
          linkType: banner.linkType || "",
          linkTarget: banner.linkTarget || "",
        });
      });
      await createBatch.commit();
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
  lat?: number;
  lng?: number;
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
  lat?: number;
  lng?: number;
}): Promise<(FirestoreDeliveryArea & { id: string }) | null> {
  if (!db) return null;
  try {
    const areaDoc: FirestoreDeliveryArea = {
      name: data.name,
      fee: data.fee || 0,
      isActive: data.isActive !== false,
      ...(data.lat !== undefined && { lat: data.lat }),
      ...(data.lng !== undefined && { lng: data.lng }),
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
    }
  } catch (error) {
    console.error("Error initializing default delivery areas:", error);
  }
}

// OTP Functions
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5; // wrong tries before the code is invalidated (brute-force guard)
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

export function generateOtp(phoneNumber: string): string {
  // 4-digit code (1000–9999)
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  otpStore.set(phoneNumber, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  return code;
}

export function verifyOtp(phoneNumber: string, code: string): boolean {
  // Development-only bypass: the fixed code "0000" is always accepted in dev mode.
  // In production this branch is inert, so only a real OTPIQ-delivered code works.
  if (code === "0000" && isDevMode()) {
    return true;
  }
  const stored = otpStore.get(phoneNumber);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phoneNumber);
    return false;
  }
  if (stored.code !== code) {
    // Invalidate the code after too many wrong attempts so it can't be brute-forced
    // within its validity window; the user must request a fresh code.
    stored.attempts += 1;
    if (stored.attempts >= OTP_MAX_ATTEMPTS) otpStore.delete(phoneNumber);
    return false;
  }
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
  maxUsage?: number;                 // optional global cap; 0 or undefined = unlimited
  minOrderAmount?: number;           // optional minimum cart subtotal for the promo to apply
  maximumDiscountAmount?: number;    // optional cap on percentage discount (IQD); 0 or undefined = no cap
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

// ========== Driver Completed Orders Persistence ==========
export interface DriverCompletedOrder {
  orderId: string;
  deliveryFee: number;
  driverEarning: number;
  ownerEarning: number;
  total: number;
  customerName: string;
  completedAt: string;
  isRestaurant: boolean;
}

export async function saveDriverCompletedOrder(
  phoneNumber: string,
  order: DriverCompletedOrder
): Promise<void> {
  if (!db) return;
  try {
    await db.collection("driverCompletedOrders").add({
      phoneNumber,
      ...order,
      savedAt: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error("Error saving driver completed order:", error);
  }
}

export async function getDriverCompletedOrdersFromDB(
  phoneNumber: string
): Promise<DriverCompletedOrder[]> {
  if (!db) return [];
  try {
    const snapshot = await db
      .collection("driverCompletedOrders")
      .where("phoneNumber", "==", phoneNumber)
      .get();
    return snapshot.docs.map(doc => {
      const d = doc.data();
      return {
        orderId: d.orderId,
        deliveryFee: d.deliveryFee || 0,
        driverEarning: d.driverEarning || 0,
        ownerEarning: d.ownerEarning || 0,
        total: d.total || 0,
        customerName: d.customerName || "",
        completedAt: d.completedAt,
        isRestaurant: d.isRestaurant || false,
      };
    });
  } catch (error) {
    console.error("Error getting driver completed orders:", error);
    return [];
  }
}

// ========== Driver Activity Log ==========
// Saves any driver event: online, offline, accepted, rejected, completed
export type DriverActivityType = "online" | "offline" | "accepted" | "rejected" | "completed" | "in_delivery" | "issue";

export async function saveDriverActivity(data: {
  phoneNumber: string;
  type: DriverActivityType;
  orderId?: string;
  customerName?: string;
  driverEarning?: number;
  total?: number;
  note?: string;
}): Promise<void> {
  if (!db) return;
  try {
    await db.collection("driverActivityLog").add({
      ...data,
      timestamp: admin.firestore.Timestamp.now(),
      date: new Date().toISOString().split("T")[0], // YYYY-MM-DD for easy daily filtering
    });
  } catch (error) {
    console.error("Error saving driver activity:", error);
  }
}

export async function getDriverActivityLog(
  phoneNumber: string,
  limitCount = 200
): Promise<any[]> {
  if (!db) return [];
  try {
    const snapshot = await db
      .collection("driverActivityLog")
      .where("phoneNumber", "==", phoneNumber)
      .get();
    // Sort by timestamp desc in memory
    const docs = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => {
        const ta = a.timestamp?.toMillis?.() ?? 0;
        const tb = b.timestamp?.toMillis?.() ?? 0;
        return tb - ta;
      })
      .slice(0, limitCount);
    return docs;
  } catch (error) {
    console.error("Error getting driver activity log:", error);
    return [];
  }
}

// ========== Driver Last Location (persisted) ==========
export async function updateDriverLastLocation(
  phoneNumber: string,
  lat: number,
  lng: number
): Promise<void> {
  if (!db) return;
  try {
    const snapshot = await db
      .collection("drivers")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({
        lastLat: lat,
        lastLng: lng,
        lastLocationAt: admin.firestore.Timestamp.now(),
      });
    }
  } catch (error) {
    console.error("Error updating driver last location:", error);
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
      .limit(100)
      .get();
    const rows = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().toISOString() : data.timestamp,
      };
    });
    // Sort newest-first in memory — avoids needing a composite Firestore index
    rows.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return rows.slice(0, 50);
  } catch (error) {
    console.error("Error getting wallet history:", error);
    return [];
  }
}

export async function initializeDefaultCategories(defaultCategories: any[]): Promise<void> {
  if (!db) return;
  
  try {
    const existing = await db.collection("categories").get();
    // Only initialize when the collection is completely empty (first run).
    // Never re-add deleted categories on subsequent restarts.
    if (existing.empty) {
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
    }
  } catch (error) {
    console.error("Error initializing default categories:", error);
  }
}

export interface FirestoreVendor {
  name: string;
  location: string;
  whatsappNumber: string;
  commissionPercent: number;
  image: string;
  rating: number | null;
  ratingCount?: number;
  deliveryTime: string;
  isOpen: boolean;
  createdAt: string;
  categoryType?: "restaurant" | "store" | "grocery" | "pharmacy" | "cafe";
  cuisine?: string;
  hasDelivery?: boolean;
  minOrder?: number;
  openTime?: string;
  closeTime?: string;
  description?: string;
  sortOrder?: number;
}

export async function getVendors(): Promise<(FirestoreVendor & { id: string })[]> {
  const db = getFirestore();
  if (!db) return [];
  try {
    const snap = await db.collection("vendors").get();
    const docs = snap.docs.map(d => {
      const data = d.data() as FirestoreVendor & { storeName?: string; businessType?: string };
      // Vendors registered via mobile app use storeName/businessType — normalize to name/categoryType
      if (!data.name && data.storeName) data.name = data.storeName;
      if (!data.categoryType && data.businessType) data.categoryType = data.businessType as any;
      return { id: d.id, ...data };
    });
    return docs.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
  } catch (err) {
    console.error("[getVendors]", err);
    return [];
  }
}

export async function createVendor(data: FirestoreVendor): Promise<string> {
  const db = getFirestore();
  if (!db) throw new Error("DB not configured");
  const ref = await db.collection("vendors").add(data);
  return ref.id;
}

export async function updateVendor(id: string, data: Partial<FirestoreVendor>): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  try {
    await db.collection("vendors").doc(id).update(data);
    return true;
  } catch { return false; }
}

export async function deleteVendor(id: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  try {
    const doc = await db.collection("vendors").doc(id).get();
    const data = doc.exists ? (doc.data() as any) : null;
    const logoUrl: string = data?.profileImageUrl ?? "";
    const coverUrl: string = data?.coverImageUrl ?? "";

    // FIXED (2026-07-06): deleting a vendor previously left ALL of its products
    // permanently orphaned in Firestore (and their images orphaned in Storage) —
    // "deleting a store" from the admin panel never actually removed the store's
    // menu/inventory, just the vendor record itself. Cascade-delete everything
    // that belongs to this vendor before removing the vendor document.
    const productsSnap = await db.collection("vendorProducts").where("vendorId", "==", id).get();
    const imageUrls = new Set<string>();
    productsSnap.docs.forEach(d => {
      const p = d.data() as any;
      if (p.imageUrl) imageUrls.add(p.imageUrl);
      if (Array.isArray(p.imageUrls)) p.imageUrls.forEach((u: string) => u && imageUrls.add(u));
    });

    // Delete product documents in batches (Firestore batch limit is 500 writes)
    const productDocs = productsSnap.docs;
    for (let i = 0; i < productDocs.length; i += 450) {
      const batch = db.batch();
      productDocs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Best-effort image cleanup — don't let a single failed storage delete block the rest
    await Promise.allSettled([...imageUrls].map(url => deleteFromFirebaseStorage(url)));

    await db.collection("vendors").doc(id).delete();
    if (logoUrl) deleteFromFirebaseStorage(logoUrl).catch(() => {});
    if (coverUrl) deleteFromFirebaseStorage(coverUrl).catch(() => {});
    return true;
  } catch { return false; }
}

export async function initializeDefaultVendors(defaults: any[]): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    const snap = await db.collection("vendors").limit(1).get();
    if (!snap.empty) return;
    const batch = db.batch();
    defaults.forEach(v => {
      const ref = db!.collection("vendors").doc(v.id);
      const { id, ...data } = v;
      batch.set(ref, data);
    });
    await batch.commit();
  } catch (e) { console.error("Error initializing vendors:", e); }
}

// ─── Support Chat ──────────────────────────────────────────────────────────

function sanitizePhone(phone: string): string {
  return phone.replace(/[^a-zA-Z0-9]/g, "_");
}

export interface SupportMessage {
  id: string;
  text: string;
  sender: "user" | "admin";
  timestamp: number;
  type?: "text" | "image" | "product";
  imageUrl?: string;
  productData?: {
    id: string;
    name: string;
    price: number;
    image: string;
    categoryId?: string;
  };
}

export interface SupportChat {
  phoneNumber: string;
  userName: string;
  userRegion?: string;
  userGender?: string;
  lastMessage: string;
  lastMessageAt: number;
  unreadByAdmin: number;
  unreadByUser: number;
  messages: SupportMessage[];
}

export async function getSupportChat(phoneNumber: string): Promise<SupportChat | null> {
  const db = getFirestore();
  if (!db) return null;
  try {
    const docId = sanitizePhone(phoneNumber);
    const snap = await db.collection("supportChats").doc(docId).get();
    if (!snap.exists) return null;
    return snap.data() as SupportChat;
  } catch (e) { console.error("getSupportChat error:", e); return null; }
}

/**
 * Permanently delete a support conversation. Added 2026-07-06 — there was
 * previously no way to clear old/test support chats; they persisted forever
 * and could show up looking broken (referencing since-deleted product images)
 * to real users opening the support screen for the first time.
 */
export async function clearSupportChat(phoneNumber: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  try {
    const docId = sanitizePhone(phoneNumber);
    await db.collection("supportChats").doc(docId).delete();
    return true;
  } catch (e) { console.error("clearSupportChat error:", e); return false; }
}

export async function sendSupportMessage(
  phoneNumber: string,
  text: string,
  sender: "user" | "admin",
  userName: string = "",
  extra?: {
    type?: "text" | "image" | "product";
    imageUrl?: string;
    productData?: SupportMessage["productData"];
    userRegion?: string;
    userGender?: string;
  }
): Promise<SupportChat | null> {
  const db = getFirestore();
  if (!db) return null;
  try {
    const docId = sanitizePhone(phoneNumber);
    const ref = db.collection("supportChats").doc(docId);
    const snap = await ref.get();
    const now = Date.now();
    const newMsg: SupportMessage = {
      id: `msg_${now}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      sender,
      timestamp: now,
      type: extra?.type || "text",
      ...(extra?.imageUrl ? { imageUrl: extra.imageUrl } : {}),
      ...(extra?.productData ? { productData: extra.productData } : {}),
    };
    const displayText = extra?.type === "image" ? "صورة" : extra?.type === "product" ? `منتج: ${extra?.productData?.name || text}` : text;
    if (!snap.exists) {
      const chat: SupportChat = {
        phoneNumber,
        userName,
        ...(extra?.userRegion ? { userRegion: extra.userRegion } : {}),
        ...(extra?.userGender ? { userGender: extra.userGender } : {}),
        lastMessage: displayText,
        lastMessageAt: now,
        unreadByAdmin: sender === "user" ? 1 : 0,
        unreadByUser: sender === "admin" ? 1 : 0,
        messages: [newMsg],
      };
      await ref.set(chat);
      return chat;
    } else {
      const existing = snap.data() as SupportChat;
      const updatedMessages = [...(existing.messages || []), newMsg];
      const updates: Partial<SupportChat> = {
        lastMessage: displayText,
        lastMessageAt: now,
        messages: updatedMessages,
        unreadByAdmin: sender === "user" ? (existing.unreadByAdmin || 0) + 1 : existing.unreadByAdmin,
        unreadByUser: sender === "admin" ? (existing.unreadByUser || 0) + 1 : existing.unreadByUser,
      };
      if (userName && !existing.userName) updates.userName = userName;
      if (extra?.userRegion && !existing.userRegion) updates.userRegion = extra.userRegion;
      if (extra?.userGender && !existing.userGender) updates.userGender = extra.userGender;
      await ref.update(updates);
      return { ...existing, ...updates } as SupportChat;
    }
  } catch (e) { console.error("sendSupportMessage error:", e); return null; }
}

export async function getAllSupportChats(): Promise<SupportChat[]> {
  const db = getFirestore();
  if (!db) return [];
  try {
    const snap = await db.collection("supportChats").get();
    const chats = snap.docs.map(d => d.data() as SupportChat);
    return chats.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  } catch (e) { console.error("getAllSupportChats error:", e); return []; }
}

export async function markSupportChatRead(phoneNumber: string, by: "user" | "admin"): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    const docId = sanitizePhone(phoneNumber);
    const field = by === "user" ? "unreadByUser" : "unreadByAdmin";
    await db.collection("supportChats").doc(docId).update({ [field]: 0 });
  } catch (e) { console.error("markSupportChatRead error:", e); }
}

// ========== Delivery Batches ==========
export interface DeliveryBatch {
  driverId: string;            // driver phone number used as ID
  status: "pending" | "in_progress" | "completed" | "cancelled";
  orderIds: string[];
  totalOrders: number;
  completedOrders: number;
  totalDistance: number;
  totalEarnings: number;
  startTime?: string;
  endTime?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

export async function createDeliveryBatch(data: {
  driverPhone: string;
  orderIds: string[];
  totalDistance?: number;
}): Promise<string | null> {
  const db = getFirestore();
  if (!db) return null;
  try {
    const now = admin.firestore.Timestamp.now();
    const batchDoc: DeliveryBatch = {
      driverId: data.driverPhone,
      status: "pending",
      orderIds: data.orderIds,
      totalOrders: data.orderIds.length,
      completedOrders: 0,
      totalDistance: data.totalDistance ?? 0,
      totalEarnings: 0,
      createdAt: now,
      updatedAt: now,
    };
    const docRef = await db.collection("delivery_batches").add(batchDoc);
    // Tag each order with batchId and deliverySequence
    const batch = db.batch();
    data.orderIds.forEach((orderId, idx) => {
      batch.update(db.collection("orders").doc(orderId), {
        batchId: docRef.id,
        batch_id: docRef.id,           // snake_case alias
        deliverySequence: idx + 1,
        delivery_sequence: idx + 1,    // snake_case alias
        updatedAt: now,
        updated_at: now,               // snake_case alias
      });
    });
    await batch.commit();
    return docRef.id;
  } catch (error) {
    console.error("Error creating delivery batch:", error);
    return null;
  }
}

export async function getDeliveryBatch(batchId: string): Promise<(DeliveryBatch & { id: string }) | null> {
  const db = getFirestore();
  if (!db) return null;
  try {
    const doc = await db.collection("delivery_batches").doc(batchId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() as DeliveryBatch };
  } catch (error) {
    console.error("Error getting delivery batch:", error);
    return null;
  }
}

export async function updateDeliveryBatch(batchId: string, updates: Partial<DeliveryBatch>): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    await db.collection("delivery_batches").doc(batchId).update({
      ...updates,
      updatedAt: admin.firestore.Timestamp.now(),
    });
  } catch (error) {
    console.error("Error updating delivery batch:", error);
  }
}

export async function cancelDeliveryBatch(batchId: string): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    const batchDoc = await db.collection("delivery_batches").doc(batchId).get();
    if (!batchDoc.exists) return;
    const batchData = batchDoc.data() as DeliveryBatch;
    // Clear batchId from all non-delivered orders in this batch
    const writeBatch = db.batch();
    const now = admin.firestore.Timestamp.now();
    for (const orderId of batchData.orderIds) {
      const orderDoc = await db.collection("orders").doc(orderId).get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data() as any;
        if (["confirmed", "preparing", "ready", "picked_up"].includes(orderData.status)) {
          writeBatch.update(db.collection("orders").doc(orderId), {
            batchId: null,
            deliverySequence: 0,
            updatedAt: now,
          });
        }
      }
    }
    writeBatch.update(db.collection("delivery_batches").doc(batchId), {
      status: "cancelled",
      updatedAt: now,
    });
    await writeBatch.commit();
  } catch (error) {
    console.error("Error cancelling delivery batch:", error);
  }
}

// ── Atomic batch-status transitions (compare-and-set on `status`) ───────────────
// These use a Firestore transaction so that a driver ACCEPTING a batch and the
// server-side offer-timeout CANCELLING it can never both win: whichever transaction
// commits first flips `status` away from "pending", and the other re-reads the new
// value and aborts. They are also idempotent across overlapping sweeps / multiple
// server instances — only the single transaction that flips pending→X succeeds.

/** Atomically claim a still-pending batch for the driver it was offered to,
 *  moving it to "in_progress". Returns the order ids on success. */
export async function claimBatchForDriver(
  batchId: string,
  driverPhone: string,
): Promise<
  | { ok: true; orderIds: string[] }
  | { ok: false; reason: "not_found" | "not_offered" | "not_pending" }
> {
  const db = getFirestore();
  if (!db) return { ok: false, reason: "not_found" };
  const ref = db.collection("delivery_batches").doc(batchId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, reason: "not_found" as const };
      const data = snap.data() as DeliveryBatch;
      if (data.driverId !== driverPhone) return { ok: false, reason: "not_offered" as const };
      if (data.status !== "pending") return { ok: false, reason: "not_pending" as const };
      tx.update(ref, {
        status: "in_progress",
        startTime: new Date().toISOString(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return { ok: true as const, orderIds: data.orderIds };
    });
  } catch (error) {
    console.error("claimBatchForDriver tx error:", error);
    return { ok: false, reason: "not_found" };
  }
}

/** Atomically cancel a batch ONLY if it is still "pending", also clearing the
 *  batch tag from its not-yet-delivered orders. Returns true iff THIS call performed
 *  the cancellation, so exactly one caller proceeds to release & reassign. */
export async function cancelBatchIfPending(batchId: string): Promise<boolean> {
  const db = getFirestore();
  if (!db) return false;
  const batchRef = db.collection("delivery_batches").doc(batchId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(batchRef);
      if (!snap.exists) return false;
      const data = snap.data() as DeliveryBatch;
      if (data.status !== "pending") return false; // accepted or already cancelled → we lost the race
      // All reads must precede writes inside a transaction.
      const orderRefs = data.orderIds.map((id) => db.collection("orders").doc(id));
      const orderSnaps: FirebaseFirestore.DocumentSnapshot[] = [];
      for (const r of orderRefs) orderSnaps.push(await tx.get(r));
      const now = admin.firestore.Timestamp.now();
      orderSnaps.forEach((os, i) => {
        if (!os.exists) return;
        const od = os.data() as any;
        if (["confirmed", "preparing", "ready", "picked_up"].includes(od.status)) {
          tx.update(orderRefs[i], { batchId: null, deliverySequence: 0, updatedAt: now });
        }
      });
      tx.update(batchRef, { status: "cancelled", updatedAt: now });
      return true;
    });
  } catch (error) {
    console.error("cancelBatchIfPending tx error:", error);
    return false;
  }
}

// ========== Driver Financial Account System ==========
// Replaces old wallet-recharge model.
// Each order delivery adds to driver earnings and onway commission.
// amountOwed = cumulative OnWay commission − total payments received.
// When amountOwed >= threshold the driver is blocked from going online.
// Admin reduces amountOwed by recording cash payments.

export interface DriverFinancialAccount {
  phoneNumber: string;
  totalEarnings: number;
  totalOnwayCommission: number;
  totalPaid: number;
  amountOwed: number;
  lastPaymentAmount: number;
  lastPaymentDate: string | null;
  updatedAt: string;
}

export async function getDriverFinancialAccount(
  phoneNumber: string
): Promise<DriverFinancialAccount> {
  const zero: DriverFinancialAccount = {
    phoneNumber,
    totalEarnings: 0,
    totalOnwayCommission: 0,
    totalPaid: 0,
    amountOwed: 0,
    lastPaymentAmount: 0,
    lastPaymentDate: null,
    updatedAt: new Date().toISOString(),
  };
  if (!db) return zero;
  try {
    const snap = await db
      .collection("driverFinancialAccounts")
      .where("phoneNumber", "==", phoneNumber)
      .limit(1)
      .get();
    if (snap.empty) return zero;
    const d = snap.docs[0].data();
    return {
      phoneNumber,
      totalEarnings: d.totalEarnings ?? 0,
      totalOnwayCommission: d.totalOnwayCommission ?? 0,
      totalPaid: d.totalPaid ?? 0,
      amountOwed: d.amountOwed ?? 0,
      lastPaymentAmount: d.lastPaymentAmount ?? 0,
      lastPaymentDate: d.lastPaymentDate ?? null,
      updatedAt: d.updatedAt?.toDate?.()
        ? d.updatedAt.toDate().toISOString()
        : d.updatedAt ?? new Date().toISOString(),
    };
  } catch (err) {
    console.error("Error reading driver financial account:", err);
    return zero;
  }
}

export async function updateDriverEarningsOnOrder(
  phoneNumber: string,
  payload: {
    driverEarning: number;
    onwayCommission: number;
    orderId: string;
    orderType: "restaurant" | "market";
  }
): Promise<DriverFinancialAccount> {
  if (!db) throw new Error("Firestore not initialized");
  const database = db;
  const snap = await database
    .collection("driverFinancialAccounts")
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  const now = admin.firestore.Timestamp.now();
  const docRef = snap.empty
    ? database.collection("driverFinancialAccounts").doc()
    : snap.docs[0].ref;

  // SECURITY/CORRECTNESS: accrue earnings inside a transaction so two orders
  // completing concurrently for the same driver can't lose an update
  // (read-modify-write race). Amounts are derived from the value read inside
  // the transaction, not from a stale pre-read.
  const result = await database.runTransaction(async (tx) => {
    const cur = await tx.get(docRef);
    const prev: Record<string, any> = cur.exists
      ? (cur.data() as Record<string, any>)
      : { totalEarnings: 0, totalOnwayCommission: 0, amountOwed: 0 };

    const newTotalEarnings = (prev.totalEarnings ?? 0) + payload.driverEarning;
    const newTotalCommission = (prev.totalOnwayCommission ?? 0) + payload.onwayCommission;
    const newAmountOwed = (prev.amountOwed ?? 0) + payload.onwayCommission;

    const updated: Record<string, any> = {
      phoneNumber,
      totalEarnings: newTotalEarnings,
      totalOnwayCommission: newTotalCommission,
      amountOwed: newAmountOwed,
      updatedAt: now,
    };
    if (!cur.exists) updated.createdAt = now;
    tx.set(docRef, updated, { merge: true });

    return {
      newTotalEarnings,
      newTotalCommission,
      newAmountOwed,
      totalPaid: prev.totalPaid ?? 0,
      lastPaymentAmount: prev.lastPaymentAmount ?? 0,
      lastPaymentDate: prev.lastPaymentDate ?? null,
    };
  });

  await database.collection("driverTransactions").add({
    phoneNumber,
    type: "earning",
    driverEarning: payload.driverEarning,
    onwayCommission: payload.onwayCommission,
    amountOwedAfter: result.newAmountOwed,
    orderId: payload.orderId,
    orderType: payload.orderType,
    timestamp: now,
  });

  return {
    phoneNumber,
    totalEarnings: result.newTotalEarnings,
    totalOnwayCommission: result.newTotalCommission,
    totalPaid: result.totalPaid,
    amountOwed: result.newAmountOwed,
    lastPaymentAmount: result.lastPaymentAmount,
    lastPaymentDate: result.lastPaymentDate,
    updatedAt: now.toDate().toISOString(),
  };
}

export async function recordDriverPayment(
  phoneNumber: string,
  amount: number,
  notes: string,
  paymentMethod?: string,
  adminName?: string
): Promise<DriverFinancialAccount> {
  if (!db) throw new Error("Firestore not initialized");
  const snap = await db
    .collection("driverFinancialAccounts")
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  const now = admin.firestore.Timestamp.now();
  const nowIso = now.toDate().toISOString();
  let docRef: admin.firestore.DocumentReference;
  let prev: Record<string, any> = {};

  if (snap.empty) {
    docRef = db.collection("driverFinancialAccounts").doc();
    prev = { totalEarnings: 0, totalOnwayCommission: 0, amountOwed: 0 };
  } else {
    docRef = snap.docs[0].ref;
    prev = snap.docs[0].data();
  }

  const newAmountOwed = Math.max(0, (prev.amountOwed ?? 0) - amount);
  const newTotalPaid = (prev.totalPaid ?? 0) + amount;

  // Generate receipt number: PAY-YYYYMMDD-XXXXXX
  const datePart = nowIso.slice(0, 10).replace(/-/g, "");
  const randPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  const receiptNumber = `PAY-${datePart}-${randPart}`;

  await docRef.set(
    {
      phoneNumber,
      totalEarnings: prev.totalEarnings ?? 0,
      totalOnwayCommission: prev.totalOnwayCommission ?? 0,
      totalPaid: newTotalPaid,
      amountOwed: newAmountOwed,
      lastPaymentAmount: amount,
      lastPaymentDate: nowIso,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection("driverTransactions").add({
    phoneNumber,
    type: "payment",
    amount,
    paymentAmount: amount,
    amountOwedAfter: newAmountOwed,
    notes: notes || "",
    description: notes || "دفعة للإدارة",
    paymentMethod: paymentMethod || "cash",
    adminName: adminName || "",
    receiptNumber,
    timestamp: now,
  });

  return {
    phoneNumber,
    totalEarnings: prev.totalEarnings ?? 0,
    totalOnwayCommission: prev.totalOnwayCommission ?? 0,
    totalPaid: newTotalPaid,
    amountOwed: newAmountOwed,
    lastPaymentAmount: amount,
    lastPaymentDate: nowIso,
    updatedAt: nowIso,
  };
}

export async function recordDriverAdjustment(
  phoneNumber: string,
  amount: number,
  type: "add" | "deduct",
  notes: string
): Promise<DriverFinancialAccount> {
  if (!db) throw new Error("Firestore not initialized");
  const snap = await db
    .collection("driverFinancialAccounts")
    .where("phoneNumber", "==", phoneNumber)
    .limit(1)
    .get();

  const now = admin.firestore.Timestamp.now();
  const nowIso = now.toDate().toISOString();
  let docRef: admin.firestore.DocumentReference;
  let prev: Record<string, any> = {};

  if (snap.empty) {
    docRef = db.collection("driverFinancialAccounts").doc();
    prev = { totalEarnings: 0, totalOnwayCommission: 0, totalPaid: 0, amountOwed: 0 };
  } else {
    docRef = snap.docs[0].ref;
    prev = snap.docs[0].data();
  }

  // add: increase amountOwed (debt increases)
  // deduct: decrease amountOwed (credit/forgiveness)
  const delta = type === "add" ? amount : -amount;
  const newAmountOwed = Math.max(0, (prev.amountOwed ?? 0) + delta);

  await docRef.set(
    { phoneNumber, amountOwed: newAmountOwed, updatedAt: now },
    { merge: true }
  );

  await db.collection("driverTransactions").add({
    phoneNumber,
    type: "adjustment",
    amount,
    adjustmentType: type,
    amountOwedAfter: newAmountOwed,
    notes,
    description: notes || (type === "add" ? "تعديل إضافة" : "تعديل خصم"),
    timestamp: now,
  });

  return {
    phoneNumber,
    totalEarnings: prev.totalEarnings ?? 0,
    totalOnwayCommission: prev.totalOnwayCommission ?? 0,
    totalPaid: prev.totalPaid ?? 0,
    amountOwed: newAmountOwed,
    lastPaymentAmount: prev.lastPaymentAmount ?? 0,
    lastPaymentDate: prev.lastPaymentDate ?? null,
    updatedAt: nowIso,
  };
}

export async function getDriverTransactions(
  phoneNumber: string,
  limitCount = 50
): Promise<any[]> {
  if (!db) return [];
  try {
    const snap = await db
      .collection("driverTransactions")
      .where("phoneNumber", "==", phoneNumber)
      .get();
    const rows = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        timestamp: d.timestamp?.toDate?.()
          ? d.timestamp.toDate().toISOString()
          : d.timestamp,
      };
    });
    rows.sort((a: any, b: any) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });
    return rows.slice(0, limitCount);
  } catch (err) {
    console.error("Error getting driver transactions:", err);
    return [];
  }
}

// ========== Delivery Logs ==========
export async function addDeliveryLog(data: {
  orderId: string;
  driverPhone: string;
  action: "accepted" | "picked_up" | "in_delivery" | "delivered" | "cancelled";
  lat?: number;
  lng?: number;
  notes?: string;
}): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    const now = admin.firestore.Timestamp.now();
    await db.collection("delivery_logs").add({
      order_id: data.orderId,
      driver_id: data.driverPhone,
      action: data.action,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      notes: data.notes ?? null,
      created_at: now,
      // camelCase aliases for compatibility
      orderId: data.orderId,
      driverPhone: data.driverPhone,
      createdAt: now,
    });
  } catch (error) {
    console.error("Error adding delivery log:", error);
  }
}

// ── Active Driver Queue (Firestore persistence across restarts) ────────────

export interface ActiveQueueEntry {
  phoneNumber: string;
  joinedAt: number;       // epoch ms — determines FIFO position
  hasActiveBatch: boolean;
  pushToken?: string | null;
  updatedAt: Date;
}

/** Add or overwrite a driver's queue document (called when going online). */
export async function addDriverToActiveQueue(
  phoneNumber: string,
  joinedAt: number,
  pushToken?: string
): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    await db.collection("activeDriverQueue").doc(phoneNumber).set({
      phoneNumber,
      joinedAt,
      hasActiveBatch: false,
      pushToken: pushToken || null,
      updatedAt: new Date(),
    });
  } catch (err) {
    console.error(`[QUEUE_SYNC] Failed to add ${phoneNumber} to activeDriverQueue:`, err);
    throw err;
  }
}

/** Delete a driver's queue document (called when going offline or removed). */
export async function removeDriverFromActiveQueue(phoneNumber: string): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    await db.collection("activeDriverQueue").doc(phoneNumber).delete();
  } catch (err) {
    console.error(`[QUEUE_SYNC] Failed to remove ${phoneNumber} from activeDriverQueue:`, err);
    throw err;
  }
}

/**
 * Patch specific fields on a driver's queue document.
 * Typical use-cases:
 *   - Assign batch:  { hasActiveBatch: true }
 *   - Clear batch:   { hasActiveBatch: false, joinedAt: Date.now() }  ← moves to end
 *   - Reject/end:    { hasActiveBatch: false, joinedAt: Date.now() }
 *   - Token update:  { pushToken: "ExponentPushToken[...]" }
 */
export async function updateDriverQueueEntry(
  phoneNumber: string,
  data: { joinedAt?: number; hasActiveBatch?: boolean; pushToken?: string; lastSeenAt?: number }
): Promise<void> {
  const db = getFirestore();
  if (!db) return;
  try {
    await db.collection("activeDriverQueue").doc(phoneNumber).update({
      ...data,
      updatedAt: new Date(),
    });
  } catch (err) {
    // Most callers do updateDriverQueueEntry(...).catch(() => {}) and move on —
    // log here so an out-of-sync driver record is at least visible, instead of
    // failing completely silently until the next restart reveals stale state.
    console.error(`[QUEUE_SYNC] Failed to update ${phoneNumber} in activeDriverQueue (data: ${JSON.stringify(data)}):`, err);
    throw err;
  }
}

/**
 * Return all queue entries ordered by joinedAt ascending (FIFO order).
 * Used on server startup to rebuild the in-memory driverQueue.
 */
export async function getActiveDriverQueue(): Promise<ActiveQueueEntry[]> {
  const db = getFirestore();
  if (!db) return [];
  try {
    const snap = await db
      .collection("activeDriverQueue")
      .orderBy("joinedAt", "asc")
      .get();
    return snap.docs.map(d => d.data() as ActiveQueueEntry);
  } catch (err) {
    console.error("[QUEUE_SYNC] Failed to read activeDriverQueue — driver queue will start EMPTY:", err);
    throw err;
  }
}

// ── Firebase Storage helpers ──────────────────────────────────────────────────

/**
 * Upload a buffer to Firebase Storage and return a permanent public download URL.
 * Uses a per-file download token so the URL works regardless of bucket-level
 * access settings (uniform or fine-grained).
 *
 * @param buffer      File contents as a Buffer
 * @param storagePath Path inside the bucket, e.g. "products/abc.webp"
 * @param contentType MIME type, defaults to "image/webp"
 * @returns           Permanent Firebase Storage download URL
 */
export async function uploadToFirebaseStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string = "image/webp"
): Promise<string> {
  const { randomUUID } = await import("crypto");
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const token = randomUUID();

  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
    resumable: false,
  });

  const bucketName = bucket.name;
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
}

/**
 * Best-effort delete of a Firebase Storage file given its download URL.
 * Silently ignores 404s (file already gone) and skips non-Storage URLs
 * (legacy /uploads/ paths, Base64 strings, empty strings, etc.).
 */
export async function deleteFromFirebaseStorage(url: string): Promise<void> {
  if (!url || !url.startsWith("https://firebasestorage.googleapis.com/")) return;
  try {
    const urlObj = new URL(url);
    // pathname: /v0/b/{bucket}/o/{encodedPath}
    const match = urlObj.pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)/);
    if (!match) return;
    const storagePath = decodeURIComponent(match[1]);
    await admin.storage().bucket().file(storagePath).delete();
  } catch (err: any) {
    // 404 means already deleted — any other error just gets logged
    if (err?.code !== 404 && err?.code !== "storage/object-not-found") {
      console.warn("[Storage] deleteFromFirebaseStorage failed for:", url, err?.message);
    }
  }
}
