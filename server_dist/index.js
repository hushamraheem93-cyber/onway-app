// server/index.ts
import express2 from "express";

// server/routes.ts
import express from "express";
import { createServer } from "node:http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

// server/firebase.ts
import admin from "firebase-admin";
var db = null;
function initializeFirebase() {
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
        credential: admin.credential.cert(serviceAccount)
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
function getFirestore() {
  return db;
}
async function getUserByPhone(phoneNumber) {
  if (!db) return null;
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error getting user from Firestore:", error);
    return null;
  }
}
async function createUser(userData) {
  if (!db) {
    console.error("Firestore db is null in createUser");
    return null;
  }
  try {
    console.log("Creating user in Firestore:", userData.phoneNumber);
    const now = admin.firestore.Timestamp.now();
    const userDoc = {
      phoneNumber: userData.phoneNumber,
      fullName: userData.fullName,
      gender: userData.gender,
      region: userData.region,
      address: userData.address,
      createdAt: now,
      updatedAt: now
    };
    if (userData.profileImage) {
      userDoc.profileImage = userData.profileImage;
    }
    const docRef = await db.collection("users").add(userDoc);
    console.log("User created successfully with id:", docRef.id);
    return { id: docRef.id, ...userDoc };
  } catch (error) {
    console.error("Error creating user in Firestore:", error?.message || error);
    return null;
  }
}
async function updateUser(phoneNumber, updates) {
  if (!db) return null;
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    const updateData = {
      updatedAt: admin.firestore.Timestamp.now()
    };
    if (updates.fullName !== void 0) updateData.fullName = updates.fullName;
    if (updates.gender !== void 0) updateData.gender = updates.gender;
    if (updates.region !== void 0) updateData.region = updates.region;
    if (updates.address !== void 0) updateData.address = updates.address;
    if (updates.profileImage !== void 0) updateData.profileImage = updates.profileImage;
    if (updates.pushToken !== void 0) updateData.pushToken = updates.pushToken;
    await doc.ref.update(updateData);
    const updatedDoc = await doc.ref.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  } catch (error) {
    console.error("Error updating user in Firestore:", error);
    return null;
  }
}
async function updateUserPushToken(phoneNumber, pushToken) {
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
      updatedAt: admin.firestore.Timestamp.now()
    });
    return true;
  } catch (error) {
    console.error("Error updating push token:", error);
    return false;
  }
}
async function getUserPushToken(phoneNumber) {
  if (!db) return null;
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) {
      return null;
    }
    const userData = snapshot.docs[0].data();
    return userData.pushToken || null;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}
async function getProducts(categoryId) {
  if (!db) return [];
  try {
    let query = db.collection("products");
    if (categoryId) {
      query = query.where("categoryId", "==", categoryId);
    }
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting products:", error);
    return [];
  }
}
async function createProduct(data) {
  if (!db) throw new Error("Database not initialized");
  console.log("createProduct called with:", { ...data, image: data.image ? `[Base64 ${data.image.length} chars]` : "none" });
  const now = admin.firestore.Timestamp.now();
  const productDoc = {
    name: data.name,
    categoryId: data.categoryId,
    price: data.price,
    image: data.image,
    description: data.description,
    inStock: data.inStock,
    createdAt: now,
    updatedAt: now
  };
  if (data.originalPrice !== void 0) {
    productDoc.originalPrice = data.originalPrice;
  }
  if (data.discount !== void 0) {
    productDoc.discount = data.discount;
  }
  const docRef = await db.collection("products").add(productDoc);
  console.log("Product created with ID:", docRef.id);
  return { id: docRef.id, ...productDoc };
}
async function updateProduct(id, updates) {
  if (!db) return null;
  try {
    const docRef = db.collection("products").doc(id);
    const filteredUpdates = { updatedAt: admin.firestore.Timestamp.now() };
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== void 0) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error updating product:", error);
    return null;
  }
}
async function deleteProduct(id) {
  if (!db) return false;
  try {
    await db.collection("products").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting product:", error);
    return false;
  }
}
async function getOrders() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("orders").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting orders:", error);
    return [];
  }
}
async function getOrdersByPhone(phoneNumber) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("orders").where("phoneNumber", "==", phoneNumber).get();
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
async function createOrder(data) {
  if (!db) return null;
  try {
    const now = admin.firestore.Timestamp.now();
    const orderDoc = { ...data, createdAt: now, updatedAt: now };
    const docRef = await db.collection("orders").add(orderDoc);
    return { id: docRef.id, ...orderDoc };
  } catch (error) {
    console.error("Error creating order:", error);
    return null;
  }
}
async function updateOrderStatus(id, status) {
  if (!db) return false;
  try {
    await db.collection("orders").doc(id).update({ status, updatedAt: admin.firestore.Timestamp.now() });
    return true;
  } catch (error) {
    console.error("Error updating order status:", error);
    return false;
  }
}
async function updateOrderDriverInfo(id, data) {
  if (!db) return false;
  try {
    await db.collection("orders").doc(id).update({ ...data, updatedAt: admin.firestore.Timestamp.now() });
    return true;
  } catch (error) {
    console.error("Error updating order driver info:", error);
    return false;
  }
}
async function getPromotionalSections() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("promotionalSections").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting promotional sections:", error);
    return [];
  }
}
async function getPromotionalSection(type) {
  if (!db) return null;
  try {
    const snapshot = await db.collection("promotionalSections").where("type", "==", type).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error getting promotional section:", error);
    return null;
  }
}
async function savePromotionalSection(type, productIds, isActive = true) {
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
      const orderMap = { bestSellers: 1, featured: 2, discounts: 3 };
      const docRef = await db.collection("promotionalSections").add({
        type,
        productIds,
        isActive,
        order: orderMap[type] || 1,
        updatedAt: now
      });
      return { id: docRef.id, type, productIds, isActive, order: orderMap[type] || 1, updatedAt: now };
    }
  } catch (error) {
    console.error("Error saving promotional section:", error);
    return null;
  }
}
async function getCategories() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("categories").orderBy("order").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting categories:", error);
    return [];
  }
}
async function createCategory(data) {
  if (!db) return null;
  try {
    const categoryDoc = {
      name: data.name,
      image: data.image,
      productCount: data.productCount || 0,
      order: data.order || 99,
      color: data.color,
      iconColor: data.iconColor
    };
    const docRef = data.id ? await db.collection("categories").doc(data.id).set(categoryDoc).then(() => db.collection("categories").doc(data.id)) : await db.collection("categories").add(categoryDoc);
    return { id: docRef.id, ...categoryDoc };
  } catch (error) {
    console.error("Error creating category:", error);
    return null;
  }
}
async function updateCategory(id, updates) {
  if (!db) return null;
  try {
    const docRef = db.collection("categories").doc(id);
    const filteredUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== void 0) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error updating category:", error);
    return null;
  }
}
async function deleteCategory(id) {
  if (!db) return false;
  try {
    await db.collection("categories").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting category:", error);
    return false;
  }
}
async function getDrivers() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("drivers").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting drivers:", error);
    return [];
  }
}
async function getDriverByPhone(phoneNumber) {
  if (!db) return null;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error getting driver:", error);
    return null;
  }
}
async function createDriver(data) {
  if (!db) throw new Error("Database not initialized");
  try {
    const now = admin.firestore.Timestamp.now();
    const driverDoc = {
      ...data,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };
    const docRef = await db.collection("drivers").add(driverDoc);
    return { id: docRef.id, ...driverDoc };
  } catch (error) {
    console.error("Error creating driver:", error);
    return null;
  }
}
async function updateDriverStatus(id, status) {
  if (!db) return false;
  try {
    await db.collection("drivers").doc(id).update({
      status,
      updatedAt: admin.firestore.Timestamp.now()
    });
    return true;
  } catch (error) {
    console.error("Error updating driver status:", error);
    return false;
  }
}
async function deleteDriver(id) {
  if (!db) return false;
  try {
    await db.collection("drivers").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting driver:", error);
    return false;
  }
}
async function getBanners(activeOnly = false) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("banners").orderBy("order").get();
    const banners2 = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return activeOnly ? banners2.filter((b) => b.isActive) : banners2;
  } catch (error) {
    console.error("Error getting banners:", error);
    return [];
  }
}
async function createBanner(data) {
  if (!db) return null;
  try {
    const existing = await db.collection("banners").get();
    const bannerDoc = {
      image: data.image || "",
      title: data.title,
      isActive: data.isActive !== false,
      type: data.type || "slider",
      order: data.order || existing.size + 1
    };
    const docRef = await db.collection("banners").add(bannerDoc);
    return { id: docRef.id, ...bannerDoc };
  } catch (error) {
    console.error("Error creating banner:", error);
    return null;
  }
}
async function updateBanner(id, updates) {
  if (!db) return null;
  try {
    const docRef = db.collection("banners").doc(id);
    const filteredUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== void 0) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error updating banner:", error);
    return null;
  }
}
async function deleteBanner(id) {
  if (!db) return false;
  try {
    await db.collection("banners").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting banner:", error);
    return false;
  }
}
async function initializeDefaultBanners(defaultBanners) {
  if (!db) return;
  try {
    const existing = await db.collection("banners").get();
    if (existing.empty) {
      console.log("Initializing default banners in Firestore...");
      const batch = db.batch();
      defaultBanners.forEach((banner) => {
        const docRef = db.collection("banners").doc(banner.id);
        batch.set(docRef, {
          image: banner.image,
          title: banner.title,
          isActive: banner.isActive,
          type: banner.type,
          order: banner.order
        });
      });
      await batch.commit();
      console.log("Default banners initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing default banners:", error);
  }
}
async function getDeliveryAreas(activeOnly = false) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("deliveryAreas").get();
    const areas = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return activeOnly ? areas.filter((a) => a.isActive) : areas;
  } catch (error) {
    console.error("Error getting delivery areas:", error);
    return [];
  }
}
async function createDeliveryArea(data) {
  if (!db) return null;
  try {
    const areaDoc = {
      name: data.name,
      fee: data.fee || 0,
      isActive: data.isActive !== false
    };
    const docRef = await db.collection("deliveryAreas").add(areaDoc);
    return { id: docRef.id, ...areaDoc };
  } catch (error) {
    console.error("Error creating delivery area:", error);
    return null;
  }
}
async function updateDeliveryArea(id, updates) {
  if (!db) return null;
  try {
    const docRef = db.collection("deliveryAreas").doc(id);
    const filteredUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== void 0) {
        filteredUpdates[key] = value;
      }
    });
    await docRef.update(filteredUpdates);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error updating delivery area:", error);
    return null;
  }
}
async function deleteDeliveryArea(id) {
  if (!db) return false;
  try {
    await db.collection("deliveryAreas").doc(id).delete();
    return true;
  } catch (error) {
    console.error("Error deleting delivery area:", error);
    return false;
  }
}
async function initializeDefaultDeliveryAreas(defaultAreas) {
  if (!db) return;
  try {
    const existing = await db.collection("deliveryAreas").get();
    if (existing.empty) {
      console.log("Initializing default delivery areas in Firestore...");
      const batch = db.batch();
      defaultAreas.forEach((area) => {
        const docRef = db.collection("deliveryAreas").doc(area.id);
        batch.set(docRef, {
          name: area.name,
          fee: area.fee,
          isActive: area.isActive
        });
      });
      await batch.commit();
      console.log("Default delivery areas initialized successfully");
    }
  } catch (error) {
    console.error("Error initializing default delivery areas:", error);
  }
}
var otpStore = /* @__PURE__ */ new Map();
function generateOtp(phoneNumber) {
  const code = Math.floor(1e3 + Math.random() * 9e3).toString();
  otpStore.set(phoneNumber, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1e3
  });
  console.log(`OTP for ${phoneNumber}: ${code}`);
  return code;
}
async function getPromoCodes() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("promoCodes").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting promo codes:", error);
    return [];
  }
}
async function getPromoCodeByCode(code) {
  if (!db) return null;
  try {
    const snapshot = await db.collection("promoCodes").where("code", "==", code).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error getting promo code:", error);
    return null;
  }
}
async function createPromoCode(data) {
  if (!db) throw new Error("Firestore not initialized");
  const now = admin.firestore.Timestamp.now();
  const docRef = await db.collection("promoCodes").add({
    ...data,
    createdAt: now,
    updatedAt: now
  });
  return docRef.id;
}
async function updatePromoCode(id, data) {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("promoCodes").doc(id).update({
    ...data,
    updatedAt: admin.firestore.Timestamp.now()
  });
}
async function deletePromoCode(id) {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("promoCodes").doc(id).delete();
}
async function checkPromoUsage(userId, promoCode) {
  if (!db) return false;
  try {
    const snapshot = await db.collection("promoUsageHistory").where("userId", "==", userId).where("promoCode", "==", promoCode).limit(1).get();
    return !snapshot.empty;
  } catch (error) {
    console.error("Error checking promo usage:", error);
    return false;
  }
}
async function recordPromoUsage(userId, promoCode) {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("promoUsageHistory").add({
    userId,
    promoCode,
    timestamp: admin.firestore.Timestamp.now()
  });
}
async function getDriverWalletBalance(phoneNumber) {
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
async function updateDriverWalletBalance(phoneNumber, newBalance) {
  if (!db) throw new Error("Firestore not initialized");
  const snapshot = await db.collection("driverWallets").where("phoneNumber", "==", phoneNumber).limit(1).get();
  if (snapshot.empty) {
    await db.collection("driverWallets").add({
      phoneNumber,
      balance: newBalance,
      createdAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.Timestamp.now()
    });
  } else {
    await snapshot.docs[0].ref.update({
      balance: newBalance,
      updatedAt: admin.firestore.Timestamp.now()
    });
  }
}
async function addWalletTransaction(data) {
  if (!db) throw new Error("Firestore not initialized");
  await db.collection("walletHistory").add({
    ...data,
    timestamp: admin.firestore.Timestamp.now()
  });
}
async function getWalletHistory(phoneNumber) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("walletHistory").where("phoneNumber", "==", phoneNumber).orderBy("timestamp", "desc").limit(50).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().toISOString() : data.timestamp
      };
    });
  } catch (error) {
    console.error("Error getting wallet history:", error);
    return [];
  }
}
async function initializeDefaultCategories(defaultCategories) {
  if (!db) return;
  try {
    const existing = await db.collection("categories").get();
    if (existing.empty) {
      console.log("Initializing default categories in Firestore...");
      const batch = db.batch();
      defaultCategories.forEach((cat) => {
        const docRef = db.collection("categories").doc(cat.id);
        batch.set(docRef, {
          name: cat.name,
          image: cat.image,
          productCount: cat.productCount || 0,
          order: cat.order || 99,
          color: cat.color,
          iconColor: cat.iconColor
        });
      });
      await batch.commit();
      console.log("Default categories initialized successfully");
    } else {
      const existingIds = new Set(existing.docs.map((doc) => doc.id));
      const missing = defaultCategories.filter((cat) => !existingIds.has(cat.id));
      if (missing.length > 0) {
        console.log(`Adding ${missing.length} missing categories to Firestore...`);
        const batch = db.batch();
        missing.forEach((cat) => {
          const docRef = db.collection("categories").doc(cat.id);
          batch.set(docRef, {
            name: cat.name,
            image: cat.image,
            productCount: cat.productCount || 0,
            order: cat.order || 99,
            color: cat.color,
            iconColor: cat.iconColor
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

// server/pushNotifications.ts
var ORDER_STATUS_MESSAGES = {
  confirmed: {
    title: "\u062A\u0645 \u062A\u0623\u0643\u064A\u062F \u0627\u0644\u0637\u0644\u0628",
    body: "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0637\u0644\u0628\u0643 \u0648\u0633\u064A\u062A\u0645 \u062A\u062D\u0636\u064A\u0631\u0647 \u0642\u0631\u064A\u0628\u0627\u064B"
  },
  preparing: {
    title: "\u062C\u0627\u0631\u064A \u062A\u062D\u0636\u064A\u0631 \u0627\u0644\u0637\u0644\u0628",
    body: "\u0637\u0644\u0628\u0643 \u0627\u0644\u0622\u0646 \u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631 \u0641\u064A \u0627\u0644\u0645\u062A\u062C\u0631"
  },
  delivering: {
    title: "\u0627\u0644\u0637\u0644\u0628 \u0641\u064A \u0627\u0644\u0637\u0631\u064A\u0642",
    body: "\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0637\u0644\u0628 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0645\u0646\u062F\u0648\u0628 \u0648\u0647\u0648 \u0641\u064A \u0637\u0631\u064A\u0642\u0647 \u0625\u0644\u064A\u0643"
  },
  delivered: {
    title: "\u062A\u0645 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 \u0628\u0646\u062C\u0627\u062D",
    body: "\u062A\u0645 \u062A\u0648\u0635\u064A\u0644 \u0637\u0644\u0628\u0643 \u0628\u0646\u062C\u0627\u062D. \u0634\u0643\u0631\u0627\u064B \u0644\u062A\u0633\u0648\u0642\u0643 \u0645\u0639\u0646\u0627!"
  },
  cancelled: {
    title: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0637\u0644\u0628",
    body: "\u0646\u0623\u0633\u0641 \u0644\u0625\u0639\u0644\u0627\u0645\u0643 \u0623\u0646\u0647 \u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0637\u0644\u0628\u0643"
  }
};
async function sendPushNotification(pushToken, status, orderId) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) {
    console.log("Invalid push token:", pushToken);
    return false;
  }
  const messageContent = ORDER_STATUS_MESSAGES[status];
  if (!messageContent) {
    console.log("No message template for status:", status);
    return false;
  }
  const message = {
    to: pushToken,
    title: messageContent.title,
    body: messageContent.body,
    sound: "default",
    channelId: "default",
    data: { orderId, status }
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });
    const result = await response.json();
    if (result.data.status === "ok") {
      console.log("Push notification sent successfully to:", pushToken);
      return true;
    } else {
      console.error("Push notification error:", result.data.message);
      return false;
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
}

// server/routes.ts
var uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
var upload = multer({ storage });
var userProfiles = [];
var deliveryAreas = [
  { id: "daloaiya", name: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 \u0627\u0644\u0645\u0631\u0643\u0632", fee: 3e3, isActive: true },
  { id: "hawija", name: "\u0627\u0644\u062D\u0648\u064A\u062C\u0629 \u0627\u0644\u0628\u062D\u0631\u064A\u0629", fee: 3500, isActive: true },
  { id: "jbour", name: "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062C\u0628\u0648\u0631", fee: 3e3, isActive: true },
  { id: "bishikan", name: "\u0628\u064A\u0634\u064A\u0643\u0627\u0646", fee: 3500, isActive: true }
];
var categories = [
  { id: "fruits-vegetables", name: "\u0627\u0644\u062E\u0636\u0631\u0648\u0627\u062A \u0648\u0627\u0644\u0641\u0648\u0627\u0643\u0647", image: "/uploads/category-vegetables.png", productCount: 50, order: 1, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "\u0627\u0644\u0644\u062D\u0648\u0645 \u0648\u0627\u0644\u0637\u0627\u0632\u062C", image: "/uploads/category-meat.png", productCount: 55, order: 2, color: "#FFEBEE", iconColor: "#EF5350" },
  { id: "dairy-eggs", name: "\u0627\u0644\u0623\u0644\u0628\u0627\u0646 \u0648\u0627\u0644\u0623\u062C\u0628\u0627\u0646", image: "/uploads/category-dairy.png", productCount: 70, order: 3, color: "#F3E5F5", iconColor: "#AB47BC" },
  { id: "cleaning-care", name: "\u0627\u0644\u0645\u0646\u0638\u0641\u0627\u062A", image: "/uploads/category-cleaning.png", productCount: 95, order: 4, color: "#E3F2FD", iconColor: "#42A5F5" },
  { id: "beverages", name: "\u0627\u0644\u0645\u0634\u0631\u0648\u0628\u0627\u062A", image: "/uploads/category-beverages.png", productCount: 90, order: 5, color: "#E0F7FA", iconColor: "#26C6DA" },
  { id: "snacks-sweets", name: "\u0633\u0646\u0627\u0643\u0633 \u0648\u0645\u0642\u0631\u0645\u0634\u0627\u062A", image: "/uploads/category-snacks.png", productCount: 110, order: 6, color: "#FFF3E0", iconColor: "#FFA726" },
  { id: "juices", name: "\u0645\u0634\u0631\u0648\u0628\u0627\u062A \u0648\u0639\u0635\u0627\u0626\u0631", image: "/uploads/category-juices.png", productCount: 45, order: 7, color: "#F1F8E9", iconColor: "#9CCC65" },
  { id: "tea-coffee", name: "\u0634\u0627\u064A \u0648\u0642\u0647\u0648\u0629", image: "/uploads/category-coffee.png", productCount: 35, order: 8, color: "#EFEBE9", iconColor: "#8D6E63" },
  { id: "baby", name: "\u0645\u0633\u062A\u0644\u0632\u0645\u0627\u062A \u0623\u0637\u0641\u0627\u0644", image: "/uploads/category-baby.png", productCount: 60, order: 9, color: "#FCE4EC", iconColor: "#EC407A" },
  { id: "flowers", name: "\u0647\u062F\u0627\u064A\u0627 \u0648\u0648\u0631\u0648\u062F", image: "/uploads/category-flowers.png", productCount: 25, order: 10, color: "#FDF2F2", iconColor: "#EF5350" },
  { id: "delivery", name: "\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0646\u062F\u0648\u0628", image: "/uploads/category-delivery.png", productCount: 0, order: 11, color: "#FFF9C4", iconColor: "#FBC02D" },
  { id: "women-bags", name: "\u0627\u0644\u062D\u0642\u0627\u0626\u0628 \u0627\u0644\u0646\u0633\u0627\u0626\u064A\u0629", image: "/uploads/category-bags.png", productCount: 12, order: 12, color: "#FCE4EC", iconColor: "#E91E63" },
  { id: "international-shopping", name: "\u0627\u0644\u0634\u0631\u0627\u0621 \u0645\u0646 \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629", image: "/uploads/category-international.png", productCount: 0, order: 13, color: "#E8EAF6", iconColor: "#5C6BC0" }
];
var banners = [
  { id: "slider-1", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800", title: "\u062E\u0636\u0631\u0648\u0627\u062A \u0648\u0641\u0648\u0627\u0643\u0647 \u0637\u0627\u0632\u062C\u0629", isActive: true, type: "slider", order: 1 },
  { id: "slider-2", image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800", title: "\u0643\u0644 \u0645\u0627 \u062A\u062D\u062A\u0627\u062C\u0647 \u0644\u0644\u0645\u0637\u0628\u062E", isActive: true, type: "slider", order: 2 },
  { id: "slider-3", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800", title: "\u0648\u062C\u0628\u0627\u062A \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0623\u0643\u0644", isActive: true, type: "slider", order: 3 }
];
var products = [
  { id: "p1", categoryId: "groceries", name: "\u0623\u0631\u0632 \u0628\u0633\u0645\u062A\u064A", price: 35e3, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300", description: "\u0623\u0631\u0632 \u0628\u0633\u0645\u062A\u064A \u0639\u0627\u0644\u064A \u0627\u0644\u062C\u0648\u062F\u0629 5 \u0643\u064A\u0644\u0648", inStock: true },
  { id: "p2", categoryId: "groceries", name: "\u0632\u064A\u062A \u0632\u064A\u062A\u0648\u0646", price: 65e3, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300", description: "\u0632\u064A\u062A \u0632\u064A\u062A\u0648\u0646 \u0628\u0643\u0631 \u0645\u0645\u062A\u0627\u0632 1 \u0644\u062A\u0631", inStock: true },
  { id: "p3", categoryId: "groceries", name: "\u0639\u0633\u0644 \u0637\u0628\u064A\u0639\u064A", price: 85e3, image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300", description: "\u0639\u0633\u0644 \u0637\u0628\u064A\u0639\u064A \u0635\u0627\u0641\u064A 500 \u062C\u0631\u0627\u0645", inStock: true },
  { id: "p4", categoryId: "dairy-eggs", name: "\u062D\u0644\u064A\u0628 \u0637\u0627\u0632\u062C", price: 12e3, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300", description: "\u062D\u0644\u064A\u0628 \u0637\u0627\u0632\u062C \u0643\u0627\u0645\u0644 \u0627\u0644\u062F\u0633\u0645 1 \u0644\u062A\u0631", inStock: true },
  { id: "p5", categoryId: "bakery", name: "\u062E\u0628\u0632 \u0639\u0631\u0628\u064A", price: 5e3, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300", description: "\u062E\u0628\u0632 \u0639\u0631\u0628\u064A \u0637\u0627\u0632\u062C 6 \u0642\u0637\u0639", inStock: true },
  { id: "p6", categoryId: "dairy-eggs", name: "\u062C\u0628\u0646\u0629 \u0628\u064A\u0636\u0627\u0621", price: 22e3, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300", description: "\u062C\u0628\u0646\u0629 \u0628\u064A\u0636\u0627\u0621 \u0637\u0627\u0632\u062C\u0629 400 \u062C\u0631\u0627\u0645", inStock: true },
  { id: "p7", categoryId: "cleaning-care", name: "\u0635\u0627\u0628\u0648\u0646 \u063A\u0633\u064A\u0644", price: 15e3, image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300", description: "\u0635\u0627\u0628\u0648\u0646 \u063A\u0633\u064A\u0644 \u0645\u0639\u0637\u0631 3 \u0643\u064A\u0644\u0648", inStock: true },
  { id: "p8", categoryId: "fruits-vegetables", name: "\u062A\u0641\u0627\u062D \u0623\u062D\u0645\u0631", price: 15e3, image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=300", description: "\u062A\u0641\u0627\u062D \u0623\u062D\u0645\u0631 \u0637\u0627\u0632\u062C 1 \u0643\u064A\u0644\u0648", inStock: true },
  { id: "p9", categoryId: "fruits-vegetables", name: "\u0637\u0645\u0627\u0637\u0645 \u0637\u0627\u0632\u062C\u0629", price: 8e3, image: "https://images.unsplash.com/photo-1546470427-e26264be0b11?w=300", description: "\u0637\u0645\u0627\u0637\u0645 \u0637\u0627\u0632\u062C\u0629 1 \u0643\u064A\u0644\u0648", inStock: true },
  { id: "p10", categoryId: "meat-poultry", name: "\u062F\u062C\u0627\u062C \u0643\u0627\u0645\u0644", price: 45e3, image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300", description: "\u062F\u062C\u0627\u062C \u0637\u0627\u0632\u062C \u0643\u0627\u0645\u0644 1.5 \u0643\u064A\u0644\u0648", inStock: true },
  { id: "p11", categoryId: "beverages", name: "\u0639\u0635\u064A\u0631 \u0628\u0631\u062A\u0642\u0627\u0644", price: 12e3, image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300", description: "\u0639\u0635\u064A\u0631 \u0628\u0631\u062A\u0642\u0627\u0644 \u0637\u0628\u064A\u0639\u064A 1 \u0644\u062A\u0631", inStock: true },
  { id: "p12", categoryId: "snacks-sweets", name: "\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629 \u062F\u0627\u0643\u0646\u0629", price: 18e3, image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=300", description: "\u0634\u0648\u0643\u0648\u0644\u0627\u062A\u0629 \u062F\u0627\u0643\u0646\u0629 \u0641\u0627\u062E\u0631\u0629 100 \u062C\u0631\u0627\u0645", inStock: true },
  { id: "p13", categoryId: "baby", name: "\u062D\u0641\u0627\u0636\u0627\u062A \u0623\u0637\u0641\u0627\u0644", price: 35e3, image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300", description: "\u062D\u0641\u0627\u0636\u0627\u062A \u0623\u0637\u0641\u0627\u0644 \u0645\u0642\u0627\u0633 M \u0639\u0628\u0648\u0629 40", inStock: true },
  { id: "p14", categoryId: "electronics-services", name: "\u0634\u0627\u062D\u0646 \u0633\u0631\u064A\u0639", price: 65e3, image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300", description: "\u0634\u0627\u062D\u0646 \u0633\u0631\u064A\u0639 20 \u0648\u0627\u0637", inStock: true },
  // حقائب نسائية
  { id: "wb1", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u064A\u062F \u062C\u0644\u062F\u064A\u0629", price: 85e3, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u064A\u062F \u062C\u0644\u062F\u064A\u0629 \u0623\u0646\u064A\u0642\u0629 \u0628\u062A\u0635\u0645\u064A\u0645 \u0639\u0635\u0631\u064A", inStock: true },
  { id: "wb2", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0643\u062A\u0641 \u0633\u0648\u062F\u0627\u0621", price: 65e3, image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0643\u062A\u0641 \u0633\u0648\u062F\u0627\u0621 \u0643\u0644\u0627\u0633\u064A\u0643\u064A\u0629", inStock: true },
  { id: "wb3", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0638\u0647\u0631 \u0646\u0633\u0627\u0626\u064A\u0629", price: 55e3, image: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0638\u0647\u0631 \u0646\u0633\u0627\u0626\u064A\u0629 \u0639\u0645\u0644\u064A\u0629 \u0648\u0623\u0646\u064A\u0642\u0629", inStock: true },
  { id: "wb4", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0633\u0647\u0631\u0629 \u0630\u0647\u0628\u064A\u0629", price: 12e4, image: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0633\u0647\u0631\u0629 \u0630\u0647\u0628\u064A\u0629 \u0641\u0627\u062E\u0631\u0629 \u0644\u0644\u0645\u0646\u0627\u0633\u0628\u0627\u062A", inStock: true, discount: 15 },
  { id: "wb5", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0643\u0631\u0648\u0633 \u0628\u0648\u062F\u064A", price: 45e3, image: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0643\u0631\u0648\u0633 \u0628\u0648\u062F\u064A \u0635\u063A\u064A\u0631\u0629 \u0648\u0639\u0645\u0644\u064A\u0629", inStock: true },
  { id: "wb6", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u062A\u0633\u0648\u0642 \u0643\u0628\u064A\u0631\u0629", price: 75e3, image: "https://images.unsplash.com/photo-1614179689702-355944cd0918?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u062A\u0633\u0648\u0642 \u0643\u0628\u064A\u0631\u0629 \u0628\u0623\u0644\u0648\u0627\u0646 \u0632\u0627\u0647\u064A\u0629", inStock: true },
  { id: "wb7", categoryId: "women-bags", name: "\u0645\u062D\u0641\u0638\u0629 \u0646\u0633\u0627\u0626\u064A\u0629", price: 35e3, image: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=300", description: "\u0645\u062D\u0641\u0638\u0629 \u0646\u0633\u0627\u0626\u064A\u0629 \u062C\u0644\u062F\u064A\u0629 \u0645\u062A\u0639\u062F\u062F\u0629 \u0627\u0644\u062C\u064A\u0648\u0628", inStock: true },
  { id: "wb8", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u064A\u062F \u0628\u064A\u062C", price: 95e3, image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u064A\u062F \u0628\u064A\u062C \u0623\u0646\u064A\u0642\u0629 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u064A\u0648\u0645\u064A", inStock: true },
  { id: "wb9", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0633\u0641\u0631 \u0646\u0633\u0627\u0626\u064A\u0629", price: 15e4, image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0633\u0641\u0631 \u0646\u0633\u0627\u0626\u064A\u0629 \u0648\u0627\u0633\u0639\u0629 \u0648\u0645\u062A\u064A\u0646\u0629", inStock: true, discount: 10 },
  { id: "wb10", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0643\u0644\u062A\u0634", price: 4e4, image: "https://images.unsplash.com/photo-1601924921557-45e6dea0f7e0?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0643\u0644\u062A\u0634 \u0623\u0646\u064A\u0642\u0629 \u0644\u0644\u0633\u0647\u0631\u0627\u062A", inStock: true },
  { id: "wb11", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0642\u0645\u0627\u0634 \u0645\u0637\u0631\u0632\u0629", price: 3e4, image: "https://images.unsplash.com/photo-1598532163257-ae3c6b2524dd?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0642\u0645\u0627\u0634 \u0645\u0637\u0631\u0632\u0629 \u0628\u062A\u0635\u0627\u0645\u064A\u0645 \u0634\u0631\u0642\u064A\u0629", inStock: true },
  { id: "wb12", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0645\u0627\u0631\u0643\u0629 \u0641\u0627\u062E\u0631\u0629", price: 25e4, image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0645\u0627\u0631\u0643\u0629 \u0641\u0627\u062E\u0631\u0629 \u0628\u062A\u0635\u0645\u064A\u0645 \u062D\u0635\u0631\u064A", inStock: true, discount: 20 }
];
async function registerRoutes(app2) {
  const driverQueue = [];
  const driverAssignments = /* @__PURE__ */ new Map();
  const driverCompletedOrders = /* @__PURE__ */ new Map();
  async function checkIsRestaurantOrder(order) {
    try {
      const products2 = await getProducts();
      if (products2.length > 0 && order.items) {
        for (const item of order.items) {
          const product = products2.find((p) => p.id === item.productId);
          if (product && product.categoryId === "restaurants") {
            return true;
          }
        }
      }
      if (order.orderType === "restaurant") return true;
      return false;
    } catch {
      return false;
    }
  }
  await initializeDefaultCategories(categories);
  await initializeDefaultBanners(banners);
  await initializeDefaultDeliveryAreas(deliveryAreas);
  app2.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  }, express.static(uploadsDir));
  function limitImageSize(img, maxLen = 5e4) {
    if (!img) return "";
    if (img.length <= maxLen) return img;
    if (img.startsWith("data:image")) return "";
    return img;
  }
  app2.get("/api/categories", async (req, res) => {
    try {
      const db2 = getFirestore();
      if (db2) {
        const firestoreCategories = await getCategories();
        if (firestoreCategories.length > 0) {
          const lightCategories = firestoreCategories.map((c) => ({
            ...c,
            image: limitImageSize(c.image)
          }));
          return res.json(lightCategories);
        }
      }
      const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
      res.json(sortedCategories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
      res.json(sortedCategories);
    }
  });
  app2.get("/api/categories/:id", async (req, res) => {
    try {
      const db2 = getFirestore();
      if (db2) {
        const firestoreCategories = await getCategories();
        const category2 = firestoreCategories.find((c) => c.id === req.params.id);
        if (category2) {
          return res.json(category2);
        }
      }
      const category = categories.find((c) => c.id === req.params.id);
      if (category) {
        res.json(category);
      } else {
        res.status(404).json({ error: "Category not found" });
      }
    } catch (error) {
      const category = categories.find((c) => c.id === req.params.id);
      if (category) {
        res.json(category);
      } else {
        res.status(404).json({ error: "Category not found" });
      }
    }
  });
  app2.post("/api/admin/categories", async (req, res) => {
    try {
      const { id, name, productCount, order, image, color, iconColor } = req.body;
      const db2 = getFirestore();
      if (db2) {
        const newCategory2 = await createCategory({
          id: id || void 0,
          name,
          image: image || "",
          productCount: parseInt(productCount) || 0,
          order: parseInt(order) || 99,
          color,
          iconColor
        });
        if (newCategory2) {
          return res.json(newCategory2);
        }
      }
      const newCategory = {
        id: id || randomUUID(),
        name,
        image: image || "",
        productCount: parseInt(productCount) || 0,
        order: parseInt(order) || categories.length + 1,
        color,
        iconColor
      };
      categories.push(newCategory);
      res.json(newCategory);
    } catch (error) {
      console.error("Error creating category:", error);
      res.status(500).json({ error: "Failed to create category" });
    }
  });
  app2.put("/api/admin/categories/:id", async (req, res) => {
    try {
      const { name, productCount, order, image, color, iconColor } = req.body;
      const db2 = getFirestore();
      if (db2) {
        const updated = await updateCategory(req.params.id, {
          name,
          image,
          productCount: productCount ? parseInt(productCount) : void 0,
          order: order ? parseInt(order) : void 0,
          color,
          iconColor
        });
        if (updated) {
          return res.json(updated);
        }
      }
      const index = categories.findIndex((c) => c.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: "Category not found" });
      }
      categories[index] = {
        ...categories[index],
        name: name || categories[index].name,
        image: image || categories[index].image,
        productCount: productCount ? parseInt(productCount) : categories[index].productCount,
        order: order ? parseInt(order) : categories[index].order
      };
      res.json(categories[index]);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });
  app2.delete("/api/admin/categories/:id", async (req, res) => {
    try {
      const db2 = getFirestore();
      if (db2) {
        const deleted = await deleteCategory(req.params.id);
        if (deleted) {
          return res.json({ success: true });
        }
      }
      const index = categories.findIndex((c) => c.id === req.params.id);
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
  app2.get("/api/banners", async (req, res) => {
    try {
      const type = req.query.type;
      let result = await getBanners(true);
      if (type) {
        result = result.filter((b) => b.type === type);
      }
      const lightResult = result.map((b) => ({ ...b, image: limitImageSize(b.image, 1e5) }));
      res.json(lightResult);
    } catch (error) {
      console.error("Error getting banners:", error);
      res.json([]);
    }
  });
  app2.get("/api/admin/banners", async (req, res) => {
    try {
      const result = await getBanners(false);
      const lightResult = result.map((b) => ({ ...b, image: limitImageSize(b.image, 1e5) }));
      res.json(lightResult);
    } catch (error) {
      console.error("Error getting admin banners:", error);
      res.json([]);
    }
  });
  app2.post("/api/admin/banners", async (req, res) => {
    try {
      const { title, type, order, isActive, image } = req.body;
      const banner = await createBanner({
        image: image || "",
        title,
        type: type || "slider",
        order: order ? parseInt(order) : void 0,
        isActive: isActive !== false
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
  app2.put("/api/admin/banners/:id", async (req, res) => {
    try {
      const { title, type, order, isActive, image } = req.body;
      const updates = {};
      if (image) updates.image = image;
      if (title !== void 0) updates.title = title;
      if (type) updates.type = type;
      if (order !== void 0) updates.order = parseInt(order);
      if (isActive !== void 0) updates.isActive = isActive;
      const banner = await updateBanner(req.params.id, updates);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
      res.json(banner);
    } catch (error) {
      console.error("Error updating banner:", error);
      res.status(500).json({ error: "Failed to update banner" });
    }
  });
  app2.delete("/api/admin/banners/:id", async (req, res) => {
    try {
      const success = await deleteBanner(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Banner not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting banner:", error);
      res.status(500).json({ error: "Failed to delete banner" });
    }
  });
  app2.get("/api/products", async (req, res) => {
    const categoryId = req.query.categoryId;
    const search = req.query.search;
    const db2 = getFirestore();
    if (db2) {
      let result2 = await getProducts(categoryId);
      if (search) {
        const searchLower = search.toLowerCase();
        result2 = result2.filter(
          (p) => p.name.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower)
        );
      }
      const lightResult = result2.map((p) => ({ ...p, image: limitImageSize(p.image) }));
      return res.json(lightResult);
    }
    let result = products;
    if (categoryId) {
      result = result.filter((p) => p.categoryId === categoryId);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower)
      );
    }
    res.json(result);
  });
  app2.get("/api/admin/products", async (req, res) => {
    const db2 = getFirestore();
    if (db2) {
      const result = await getProducts();
      const lightResult = result.map((p) => ({ ...p, image: limitImageSize(p.image) }));
      return res.json(lightResult);
    }
    res.json(products);
  });
  app2.post("/api/admin/products", async (req, res) => {
    try {
      if (!req.body) {
        return res.status(400).json({ error: "Request body is empty" });
      }
      const { name, categoryId, price, originalPrice, discount, description, inStock, image } = req.body;
      const db2 = getFirestore();
      const priceNum = Number(price) || 0;
      const originalPriceNum = originalPrice ? Number(originalPrice) : void 0;
      const discountNum = discount ? Number(discount) : void 0;
      const inStockBool = inStock === "true" || inStock === true;
      if (db2) {
        const newProduct2 = await createProduct({
          name: String(name || ""),
          categoryId: String(categoryId || ""),
          price: priceNum,
          originalPrice: originalPriceNum,
          discount: discountNum,
          image: String(image || ""),
          description: String(description || ""),
          inStock: inStockBool
        });
        if (newProduct2) return res.json(newProduct2);
        return res.status(500).json({ error: "Failed to create product in Firestore" });
      }
      const newProduct = {
        id: randomUUID(),
        name: String(name || ""),
        categoryId: String(categoryId || ""),
        price: priceNum,
        originalPrice: originalPriceNum,
        discount: discountNum,
        image: String(image || ""),
        description: String(description || ""),
        inStock: inStockBool
      };
      products.push(newProduct);
      res.json(newProduct);
    } catch (error) {
      console.error("Error in POST /api/admin/products:", error);
      res.status(500).json({
        error: error?.message || "Unknown error",
        code: error?.code,
        details: error?.details || error?.toString()
      });
    }
  });
  app2.put("/api/admin/products/:id", async (req, res) => {
    const { name, categoryId, price, originalPrice, discount, description, inStock, image } = req.body;
    const productId = req.params.id;
    const db2 = getFirestore();
    const priceNum = price !== void 0 ? Number(price) : void 0;
    const originalPriceNum = originalPrice !== void 0 ? Number(originalPrice) : void 0;
    const discountNum = discount !== void 0 ? Number(discount) : void 0;
    const inStockBool = inStock !== void 0 ? inStock === "true" || inStock === true : void 0;
    if (db2) {
      const updated = await updateProduct(productId, {
        name: name !== void 0 ? String(name) : void 0,
        categoryId: categoryId !== void 0 ? String(categoryId) : void 0,
        price: priceNum,
        originalPrice: originalPriceNum,
        discount: discountNum,
        image: image !== void 0 ? String(image) : void 0,
        description: description !== void 0 ? String(description) : void 0,
        inStock: inStockBool
      });
      if (updated) return res.json(updated);
      return res.status(404).json({ error: "Product not found" });
    }
    const index = products.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    products[index] = {
      ...products[index],
      name: name !== void 0 ? String(name) : products[index].name,
      categoryId: categoryId !== void 0 ? String(categoryId) : products[index].categoryId,
      price: priceNum !== void 0 ? priceNum : products[index].price,
      originalPrice: originalPriceNum !== void 0 ? originalPriceNum : products[index].originalPrice,
      discount: discountNum !== void 0 ? discountNum : products[index].discount,
      image: image !== void 0 ? String(image) : products[index].image,
      description: description !== void 0 ? String(description) : products[index].description,
      inStock: inStockBool !== void 0 ? inStockBool : products[index].inStock
    };
    res.json(products[index]);
  });
  app2.delete("/api/admin/products/:id", async (req, res) => {
    const db2 = getFirestore();
    if (db2) {
      const success = await deleteProduct(req.params.id);
      if (success) return res.json({ success: true });
      return res.status(404).json({ error: "Product not found" });
    }
    const index = products.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    products.splice(index, 1);
    res.json({ success: true });
  });
  app2.get("/api/delivery-areas", async (req, res) => {
    try {
      const areas = await getDeliveryAreas(true);
      res.json(areas);
    } catch (error) {
      console.error("Error getting delivery areas:", error);
      res.json([]);
    }
  });
  app2.get("/api/admin/delivery-areas", async (req, res) => {
    try {
      const areas = await getDeliveryAreas(false);
      res.json(areas);
    } catch (error) {
      console.error("Error getting admin delivery areas:", error);
      res.json([]);
    }
  });
  app2.post("/api/admin/delivery-areas", async (req, res) => {
    try {
      const { name, fee } = req.body;
      const area = await createDeliveryArea({
        name,
        fee: parseInt(fee) || 0,
        isActive: true
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
  app2.put("/api/admin/delivery-areas/:id", async (req, res) => {
    try {
      const { name, fee, isActive } = req.body;
      const updates = {};
      if (name !== void 0) updates.name = name;
      if (fee !== void 0) updates.fee = parseInt(fee);
      if (isActive !== void 0) updates.isActive = isActive !== "false" && isActive !== false;
      const area = await updateDeliveryArea(req.params.id, updates);
      if (!area) {
        return res.status(404).json({ error: "Delivery area not found" });
      }
      res.json(area);
    } catch (error) {
      console.error("Error updating delivery area:", error);
      res.status(500).json({ error: "Failed to update delivery area" });
    }
  });
  app2.delete("/api/admin/delivery-areas/:id", async (req, res) => {
    try {
      const success = await deleteDeliveryArea(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Delivery area not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting delivery area:", error);
      res.status(500).json({ error: "Failed to delete delivery area" });
    }
  });
  app2.get("/api/orders", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    const db2 = getFirestore();
    if (db2) {
      const orders = phoneNumber ? await getOrdersByPhone(phoneNumber) : await getOrders();
      return res.json(orders.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toDate?.() ? o.createdAt.toDate().toISOString() : o.createdAt,
        updatedAt: o.updatedAt?.toDate?.() ? o.updatedAt.toDate().toISOString() : o.updatedAt
      })));
    }
    res.json([]);
  });
  app2.get("/api/admin/orders", async (req, res) => {
    const db2 = getFirestore();
    if (db2) {
      const orders = await getOrders();
      return res.json(orders.map((o) => ({
        ...o,
        createdAt: o.createdAt?.toDate?.() ? o.createdAt.toDate().toISOString() : o.createdAt,
        updatedAt: o.updatedAt?.toDate?.() ? o.updatedAt.toDate().toISOString() : o.updatedAt
      })));
    }
    res.json([]);
  });
  app2.post("/api/orders", async (req, res) => {
    const { userId, phoneNumber, customerName, items, total, deliveryFee, address, region, latitude, longitude, orderType, internationalDetails, courierDetails, promoCode, promoDiscount } = req.body;
    const db2 = getFirestore();
    if (db2) {
      if (promoCode) {
        const alreadyUsed = await checkPromoUsage(userId || phoneNumber, promoCode);
        if (alreadyUsed) {
          return res.status(400).json({ error: "\u0644\u0642\u062F \u0627\u0633\u062A\u062E\u062F\u0645\u062A \u0647\u0630\u0627 \u0627\u0644\u0643\u0648\u062F \u0645\u0633\u0628\u0642\u0627\u064B!" });
        }
      }
      const orderData = {
        userId: userId || "",
        phoneNumber,
        items,
        total,
        deliveryFee,
        address,
        region,
        status: "pending"
      };
      if (customerName) orderData.customerName = customerName;
      if (latitude !== void 0 && longitude !== void 0) {
        orderData.latitude = latitude;
        orderData.longitude = longitude;
      }
      if (orderType) orderData.orderType = orderType;
      if (internationalDetails) orderData.internationalDetails = internationalDetails;
      if (courierDetails) orderData.courierDetails = courierDetails;
      if (promoCode) orderData.promoCode = promoCode;
      if (promoDiscount) orderData.promoDiscount = promoDiscount;
      const newOrder = await createOrder(orderData);
      if (newOrder) {
        if (promoCode) {
          await recordPromoUsage(userId || phoneNumber, promoCode).catch(
            (err) => console.error("Failed to record promo usage:", err)
          );
        }
        return res.json({
          ...newOrder,
          createdAt: newOrder.createdAt.toDate().toISOString(),
          updatedAt: newOrder.updatedAt.toDate().toISOString()
        });
      }
      return res.status(500).json({ error: "Failed to create order" });
    }
    res.status(500).json({ error: "Database not configured" });
  });
  app2.put("/api/admin/orders/:id/status", async (req, res) => {
    const orderId = req.params.id;
    const { status, phoneNumber } = req.body;
    const db2 = getFirestore();
    if (db2) {
      const success = await updateOrderStatus(orderId, status);
      if (success) {
        if (phoneNumber) {
          const pushToken = await getUserPushToken(phoneNumber);
          if (pushToken) {
            await sendPushNotification(pushToken, status, orderId);
            console.log(`Push notification sent for order ${orderId} to ${phoneNumber}`);
          }
        }
        if (status === "confirmed") {
          const availableDriver = driverQueue.find((d) => !d.currentOrderId);
          if (availableDriver) {
            availableDriver.currentOrderId = orderId;
            console.log(`[FIFO] Order ${orderId} auto-assigned to driver ${availableDriver.phoneNumber}`);
          }
        }
        return res.json({ success: true, id: orderId, status });
      }
      return res.status(404).json({ error: "Order not found" });
    }
    res.status(500).json({ error: "Database not configured" });
  });
  app2.post("/api/users/push-token", async (req, res) => {
    const { phoneNumber, pushToken } = req.body;
    if (!phoneNumber || !pushToken) {
      return res.status(400).json({ error: "Phone number and push token are required" });
    }
    const db2 = getFirestore();
    if (db2) {
      const success = await updateUserPushToken(phoneNumber, pushToken);
      if (success) {
        return res.json({ success: true });
      }
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Database not configured" });
  });
  app2.get("/api/promotional-sections", async (_req, res) => {
    const db2 = getFirestore();
    if (db2) {
      const sections = await getPromotionalSections();
      return res.json(sections);
    }
    res.json([]);
  });
  app2.get("/api/promotional-sections/:type", async (req, res) => {
    const type = req.params.type;
    const db2 = getFirestore();
    if (db2) {
      const section = await getPromotionalSection(type);
      if (section) {
        return res.json(section);
      }
      return res.json({ type, productIds: [], isActive: true });
    }
    res.json({ type, productIds: [], isActive: true });
  });
  app2.put("/api/admin/promotional-sections/:type", async (req, res) => {
    const type = req.params.type;
    const { productIds, isActive } = req.body;
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ error: "productIds must be an array" });
    }
    const db2 = getFirestore();
    if (db2) {
      const section = await savePromotionalSection(type, productIds, isActive !== false);
      if (section) {
        return res.json(section);
      }
      return res.status(500).json({ error: "Failed to save promotional section" });
    }
    res.status(500).json({ error: "Database not configured" });
  });
  app2.post("/api/upload", upload.single("profileImage"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });
  app2.get("/api/users/:phoneNumber", async (req, res) => {
    const phoneNumber = req.params.phoneNumber;
    const db2 = getFirestore();
    if (db2) {
      const user2 = await getUserByPhone(phoneNumber);
      if (!user2) {
        return res.status(404).json({ error: "User not found", profileComplete: false });
      }
      return res.json({
        id: user2.id,
        phoneNumber: user2.phoneNumber,
        fullName: user2.fullName,
        gender: user2.gender,
        region: user2.region,
        address: user2.address,
        profileImage: user2.profileImage,
        createdAt: user2.createdAt.toDate().toISOString(),
        updatedAt: user2.updatedAt.toDate().toISOString(),
        profileComplete: true
      });
    }
    const user = userProfiles.find((u) => u.phoneNumber === req.params.phoneNumber);
    if (!user) {
      return res.status(404).json({ error: "User not found", profileComplete: false });
    }
    res.json({ ...user, profileComplete: true });
  });
  app2.post("/api/users", async (req, res) => {
    const { phoneNumber, fullName, gender, region, address, profileImage } = req.body;
    if (!phoneNumber || !fullName || !gender || !region || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const db2 = getFirestore();
    if (db2) {
      const existingUser = await getUserByPhone(phoneNumber);
      if (existingUser) {
        const updates = { fullName, gender, region, address };
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
            profileComplete: true
          });
        }
      } else {
        const newUser = await createUser({
          phoneNumber,
          fullName,
          gender,
          region,
          address,
          profileImage
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
            profileComplete: true
          });
        }
      }
      console.error("Firestore save failed for:", phoneNumber);
      return res.status(500).json({ error: "Failed to save user to Firestore" });
    }
    const existingIndex = userProfiles.findIndex((u) => u.phoneNumber === phoneNumber);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existingIndex !== -1) {
      userProfiles[existingIndex] = {
        ...userProfiles[existingIndex],
        fullName,
        gender,
        region,
        address,
        ...profileImage && { profileImage },
        updatedAt: now
      };
      res.json({ ...userProfiles[existingIndex], profileComplete: true });
    } else {
      const newUser = {
        id: randomUUID(),
        phoneNumber,
        fullName,
        gender,
        region,
        address,
        profileImage,
        createdAt: now,
        updatedAt: now
      };
      userProfiles.push(newUser);
      res.json({ ...newUser, profileComplete: true });
    }
  });
  app2.put("/api/users/:phoneNumber", async (req, res) => {
    const phoneNumber = req.params.phoneNumber;
    const { fullName, gender, region, address, profileImage } = req.body;
    const db2 = getFirestore();
    if (db2) {
      const updates = {};
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
        profileComplete: true
      });
    }
    const index = userProfiles.findIndex((u) => u.phoneNumber === phoneNumber);
    if (index === -1) {
      return res.status(404).json({ error: "User not found" });
    }
    userProfiles[index] = {
      ...userProfiles[index],
      fullName: fullName || userProfiles[index].fullName,
      gender: gender || userProfiles[index].gender,
      region: region || userProfiles[index].region,
      address: address || userProfiles[index].address,
      ...profileImage && { profileImage },
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json({ ...userProfiles[index], profileComplete: true });
  });
  app2.post("/api/auth/send-otp", (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }
    const code = generateOtp(phoneNumber);
    console.log(`[OTP] Sent code ${code} to ${phoneNumber}`);
    res.json({ success: true, message: "OTP sent successfully" });
  });
  app2.post("/api/auth/verify-otp", (req, res) => {
    const { phoneNumber, code } = req.body;
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: "Phone number and code are required" });
    }
    res.json({ success: true, message: "OTP verified" });
  });
  app2.get("/api/drivers/check/:phoneNumber", async (req, res) => {
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
            updatedAt: driver.updatedAt?.toDate?.() ? driver.updatedAt.toDate().toISOString() : driver.updatedAt
          }
        });
      } else {
        res.json({ exists: false, driver: null });
      }
    } catch (error) {
      console.error("Error checking driver:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });
  app2.post("/api/drivers", async (req, res) => {
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
          alreadyRegistered: true
        });
      }
      const driver = await createDriver({
        phoneNumber,
        fullName,
        firstName: firstName || "",
        secondName: secondName || "",
        thirdName: thirdName || "",
        fourthName: fourthName || "",
        ...motorcycleNumber && { motorcycleNumber },
        nationalIdImage,
        ...residenceCardImage && { residenceCardImage },
        ...driverLicenseImage && { driverLicenseImage }
      });
      if (!driver) {
        return res.status(500).json({ error: "Failed to create driver" });
      }
      res.json(driver);
    } catch (error) {
      console.error("Error creating driver:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });
  app2.get("/api/admin/drivers", async (_req, res) => {
    try {
      const drivers = await getDrivers();
      const formatted = drivers.map((d) => ({
        ...d,
        createdAt: d.createdAt?.toDate?.() ? d.createdAt.toDate().toISOString() : d.createdAt,
        updatedAt: d.updatedAt?.toDate?.() ? d.updatedAt.toDate().toISOString() : d.updatedAt
      }));
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching drivers:", error);
      res.json([]);
    }
  });
  app2.put("/api/admin/drivers/:id/status", async (req, res) => {
    try {
      const driverId = req.params.id;
      const { status } = req.body;
      const validStatuses = ["pending", "approved", "rejected"];
      if (!validStatuses.includes(String(status))) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const success = await updateDriverStatus(driverId, status);
      if (!success) {
        return res.status(500).json({ error: "Failed to update driver status" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating driver status:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });
  app2.delete("/api/admin/drivers/:id", async (req, res) => {
    try {
      const driverId = req.params.id;
      const success = await deleteDriver(driverId);
      if (!success) {
        return res.status(500).json({ error: "Failed to delete driver" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting driver:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });
  app2.get("/api/driver/status", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const driver = await getDriverByPhone(phoneNumber);
      const queueIndex = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
      const isOnline = queueIndex !== -1;
      const queuedDriver = isOnline ? driverQueue[queueIndex] : null;
      let currentOrder = null;
      if (queuedDriver?.currentOrderId) {
        const db2 = getFirestore();
        if (db2) {
          const allOrders = await getOrders();
          const order = allOrders.find((o) => o.id === queuedDriver.currentOrderId);
          if (order) {
            const customerProfile = await getUserByPhone(order.phoneNumber || "");
            currentOrder = {
              ...order,
              customerName: order.customerName || customerProfile?.fullName || "\u0632\u0628\u0648\u0646",
              customerPhone: order.phoneNumber || "",
              latitude: order.latitude || null,
              longitude: order.longitude || null,
              createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt,
              updatedAt: order.updatedAt?.toDate?.() ? order.updatedAt.toDate().toISOString() : order.updatedAt
            };
          }
        }
      }
      let queuePosition = null;
      if (isOnline && !queuedDriver?.currentOrderId) {
        const availableDriversBefore = driverQueue.filter((d, i) => i <= queueIndex && !d.currentOrderId);
        queuePosition = availableDriversBefore.length;
      }
      const walletBalance = await getDriverWalletBalance(phoneNumber);
      res.json({
        isOnline,
        queuePosition,
        currentOrder,
        approvalStatus: driver?.status || "pending",
        walletBalance
      });
    } catch (error) {
      console.error("Error getting driver status:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/toggle-online", async (req, res) => {
    const { phoneNumber, goOnline } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      if (goOnline) {
        const walletBalance = await getDriverWalletBalance(phoneNumber);
        if (walletBalance < 250) {
          return res.status(400).json({ error: "\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D. \u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0662\u0665\u0660 \u062F.\u0639", walletBalance });
        }
        const exists = driverQueue.find((d) => d.phoneNumber === phoneNumber);
        if (!exists) {
          driverQueue.push({ phoneNumber, joinedAt: Date.now() });
        }
        const pos = driverQueue.filter((d) => !d.currentOrderId).findIndex((d) => d.phoneNumber === phoneNumber) + 1;
        res.json({ isOnline: true, queuePosition: pos > 0 ? pos : driverQueue.length });
      } else {
        const idx = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
        }
        res.json({ isOnline: false, queuePosition: null });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/accept-order", async (req, res) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (db2) {
        await updateOrderStatus(orderId, "delivering");
        driverAssignments.set(orderId, phoneNumber);
        const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
        if (qd) qd.currentOrderId = orderId;
        const driver = await getDriverByPhone(phoneNumber);
        const driverName = driver?.fullName || phoneNumber;
        await updateOrderDriverInfo(orderId, {
          driverName,
          driverPhone: phoneNumber
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/reject-order", async (req, res) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
      if (qd) {
        qd.currentOrderId = void 0;
        const idx = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
          driverQueue.push({ phoneNumber, joinedAt: Date.now() });
        }
      }
      assignOrderToNextDriver(orderId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/complete-order", async (req, res) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (db2) {
        await updateOrderStatus(orderId, "delivered");
        const allOrders = await getOrders();
        const order = allOrders.find((o) => o.id === orderId);
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
            deductionAmount = 1e3;
            driverEarning = (order.deliveryFee || 0) - deductionAmount;
            if (driverEarning < 0) driverEarning = 0;
          }
          const ownerEarning = deductionAmount;
          await updateOrderDriverInfo(orderId, {
            driverEarning,
            ownerEarning
          });
          const currentBalance = await getDriverWalletBalance(phoneNumber);
          const newBalance = currentBalance - deductionAmount;
          await updateDriverWalletBalance(phoneNumber, newBalance);
          await addWalletTransaction({
            phoneNumber,
            amount: deductionAmount,
            type: "deduction",
            service: isRestaurantOrder ? "\u062A\u0648\u0635\u064A\u0644 \u0645\u0637\u0639\u0645" : "\u062A\u0648\u0635\u064A\u0644 \u062A\u0633\u0648\u064A\u0642/\u062E\u062F\u0645\u0627\u062A",
            orderId
          });
          if (newBalance < 250) {
            const queueIdx = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
            if (queueIdx !== -1) {
              driverQueue.splice(queueIdx, 1);
            }
          }
          const completed = driverCompletedOrders.get(phoneNumber) || [];
          completed.push({
            orderId,
            deliveryFee: order.deliveryFee || 0,
            driverEarning,
            ownerEarning,
            total: order.total || 0,
            customerName: customerProfile?.fullName || "\u0632\u0628\u0648\u0646",
            completedAt: (/* @__PURE__ */ new Date()).toISOString(),
            isRestaurant: isRestaurantOrder
          });
          driverCompletedOrders.set(phoneNumber, completed);
        }
      }
      driverAssignments.delete(orderId);
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
      if (qd) qd.currentOrderId = void 0;
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/driver/earnings", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const completed = driverCompletedOrders.get(phoneNumber) || [];
      const now = /* @__PURE__ */ new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const weekStart = todayStart - 7 * 24 * 60 * 60 * 1e3;
      const todayOrders = completed.filter((o) => new Date(o.completedAt).getTime() >= todayStart);
      const weekOrders = completed.filter((o) => new Date(o.completedAt).getTime() >= weekStart);
      res.json({
        totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        todayEarnings: todayOrders.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        weekEarnings: weekOrders.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
        totalOrders: completed.length,
        todayOrders: todayOrders.length,
        completedOrders: completed.map((o) => ({
          id: o.orderId,
          total: o.total,
          deliveryFee: o.deliveryFee,
          driverEarning: o.driverEarning || 0,
          isRestaurant: o.isRestaurant || false,
          completedAt: o.completedAt,
          customerName: o.customerName
        })).reverse()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/driver/orders", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const completed = driverCompletedOrders.get(phoneNumber) || [];
      const db2 = getFirestore();
      const result = [];
      if (db2) {
        const allOrders = await getOrders();
        const deliveringOrderIds = Array.from(driverAssignments.entries()).filter(([_, driverPhone]) => driverPhone === phoneNumber).map(([orderId]) => orderId);
        for (const orderId of deliveringOrderIds) {
          const order = allOrders.find((o) => o.id === orderId);
          if (order) {
            const customer = await getUserByPhone(order.phoneNumber || "");
            result.push({
              ...order,
              customerName: customer?.fullName || "\u0632\u0628\u0648\u0646",
              createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt
            });
          }
        }
        for (const c of completed) {
          const order = allOrders.find((o) => o.id === c.orderId);
          if (order) {
            const customer = await getUserByPhone(order.phoneNumber || "");
            result.push({
              ...order,
              customerName: customer?.fullName || "\u0632\u0628\u0648\u0646",
              completedAt: c.completedAt,
              createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt
            });
          }
        }
      }
      res.json(result.reverse());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/driver/wallet", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const balance = await getDriverWalletBalance(phoneNumber);
      const history = await getWalletHistory(phoneNumber);
      res.json({ balance, history });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/admin/driver-wallet/recharge", async (req, res) => {
    const { phoneNumber, amount } = req.body;
    if (!phoneNumber || amount === void 0) return res.status(400).json({ error: "Missing fields" });
    try {
      const currentBalance = await getDriverWalletBalance(phoneNumber);
      const newBalance = currentBalance + Number(amount);
      await updateDriverWalletBalance(phoneNumber, newBalance);
      await addWalletTransaction({
        phoneNumber,
        amount: Number(amount),
        type: "recharge",
        service: "\u0634\u062D\u0646 \u0631\u0635\u064A\u062F"
      });
      res.json({ success: true, newBalance });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/driver/profile", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
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
        fourthName: driver.fourthName
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  function assignOrderToNextDriver(orderId) {
    const availableDriver = driverQueue.find((d) => !d.currentOrderId);
    if (availableDriver) {
      availableDriver.currentOrderId = orderId;
      console.log(`[FIFO] Order ${orderId} assigned to driver ${availableDriver.phoneNumber}`);
    }
  }
  app2.post("/api/driver/assign-pending-orders", async (_req, res) => {
    try {
      const db2 = getFirestore();
      if (!db2) return res.json({ assigned: 0 });
      const allOrders = await getOrders();
      const pendingOrders = allOrders.filter((o) => o.status === "confirmed" && !driverAssignments.has(o.id)).sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
        return aTime - bTime;
      });
      let assigned = 0;
      for (const order of pendingOrders) {
        const availableDriver = driverQueue.find((d) => !d.currentOrderId);
        if (availableDriver) {
          availableDriver.currentOrderId = order.id;
          assigned++;
          console.log(`[FIFO] Order ${order.id} assigned to driver ${availableDriver.phoneNumber}`);
        } else {
          break;
        }
      }
      res.json({ assigned });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/driver-queue", async (_req, res) => {
    try {
      const db2 = getFirestore();
      let allOrders = [];
      if (db2) {
        allOrders = await getOrders();
      }
      const queueData = await Promise.all(driverQueue.map(async (d, i) => {
        let customerName = null;
        let orderRegion = null;
        if (d.currentOrderId) {
          const order = allOrders.find((o) => o.id === d.currentOrderId);
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
          currentOrderId: d.currentOrderId || null,
          status: d.currentOrderId ? "busy" : "available",
          customerName,
          orderRegion
        };
      }));
      res.json({
        onlineDrivers: driverQueue.length,
        availableDrivers: driverQueue.filter((d) => !d.currentOrderId).length,
        busyDrivers: driverQueue.filter((d) => d.currentOrderId).length,
        queue: queueData
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/owner-earnings", async (_req, res) => {
    try {
      const db2 = getFirestore();
      if (!db2) return res.json({ totalOwnerEarnings: 0, totalDriverEarnings: 0, totalDeliveryFees: 0, ordersWithEarnings: 0 });
      const allOrders = await getOrders();
      const deliveredOrders = allOrders.filter((o) => o.status === "delivered");
      let totalOwnerEarnings = 0;
      let totalDriverEarnings = 0;
      let totalDeliveryFees = 0;
      let ordersWithEarnings = 0;
      for (const order of deliveredOrders) {
        const o = order;
        const deliveryFee = o.deliveryFee || 0;
        totalDeliveryFees += deliveryFee;
        if (o.driverEarning !== void 0) {
          totalDriverEarnings += o.driverEarning || 0;
          totalOwnerEarnings += o.ownerEarning || 0;
          ordersWithEarnings++;
        } else {
          const isRestaurant = await checkIsRestaurantOrder(o);
          const deduction = isRestaurant ? 250 : 1e3;
          const driverEarning = isRestaurant ? 750 : Math.max(deliveryFee - 1e3, 0);
          const ownerEarning = deduction;
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
        totalDeliveredOrders: deliveredOrders.length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/promo-codes", async (_req, res) => {
    try {
      const codes = await getPromoCodes();
      res.json(codes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/admin/promo-codes", async (req, res) => {
    try {
      const { code, type, value, expiryDate, isActive } = req.body;
      if (!code || !type || value === void 0) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const id = await createPromoCode({
        code: code.toUpperCase(),
        type,
        value: Number(value),
        expiryDate: expiryDate || "",
        isActive: isActive !== false
      });
      res.json({ id, success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.put("/api/admin/promo-codes/:id", async (req, res) => {
    try {
      const { code, type, value, expiryDate, isActive } = req.body;
      await updatePromoCode(req.params.id, {
        ...code && { code: code.toUpperCase() },
        ...type && { type },
        ...value !== void 0 && { value: Number(value) },
        ...expiryDate !== void 0 && { expiryDate },
        ...isActive !== void 0 && { isActive }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.delete("/api/admin/promo-codes/:id", async (req, res) => {
    try {
      await deletePromoCode(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/promo-codes/apply", async (req, res) => {
    try {
      const { code, userId, cartTotal } = req.body;
      if (!code || !userId || cartTotal === void 0) {
        return res.status(400).json({ error: "\u0627\u0644\u0631\u062C\u0627\u0621 \u0625\u062F\u062E\u0627\u0644 \u062C\u0645\u064A\u0639 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629" });
      }
      const promo = await getPromoCodeByCode(code.toUpperCase());
      if (!promo || !promo.isActive) {
        return res.status(400).json({ error: "\u0627\u0644\u0643\u0648\u062F \u063A\u064A\u0631 \u0635\u062D\u064A\u062D \u0623\u0648 \u063A\u064A\u0631 \u0641\u0639\u0651\u0627\u0644" });
      }
      if (promo.expiryDate) {
        const expiry = new Date(promo.expiryDate);
        if (expiry < /* @__PURE__ */ new Date()) {
          return res.status(400).json({ error: "\u0627\u0646\u062A\u0647\u062A \u0635\u0644\u0627\u062D\u064A\u0629 \u0647\u0630\u0627 \u0627\u0644\u0643\u0648\u062F" });
        }
      }
      const usedBefore = await checkPromoUsage(userId, code.toUpperCase());
      if (usedBefore) {
        return res.status(400).json({ error: "\u0644\u0642\u062F \u0627\u0633\u062A\u062E\u062F\u0645\u062A \u0647\u0630\u0627 \u0627\u0644\u0643\u0648\u062F \u0645\u0633\u0628\u0642\u0627\u064B!" });
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
        promoValue: promo.value
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/promo-codes/record-usage", async (req, res) => {
    try {
      const { userId, promoCode } = req.body;
      if (!userId || !promoCode) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await recordPromoUsage(userId, promoCode.toUpperCase());
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";
initializeFirebase();
var app = express2();
var log = console.log;
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origin = req.header("origin");
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express2.json({
      limit: "100mb"
    })
  );
  app2.use(express2.urlencoded({ extended: false, limit: "100mb" }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  const adminTemplatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin.html"
  );
  log("Serving static Expo files with dynamic manifest routing");
  app2.get("/admin", (_req, res) => {
    const adminTemplate = fs2.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(adminTemplate);
  });
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express2.static(path2.resolve(process.cwd(), "assets"), {
    maxAge: "7d",
    etag: true
  }));
  app2.use(express2.static(path2.resolve(process.cwd(), "server", "public"), {
    maxAge: "1d",
    etag: true
  }));
  app2.use(express2.static(path2.resolve(process.cwd(), "static-build"), {
    maxAge: "1d",
    etag: true
  }));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("SIGTERM", () => {
  console.error("Received SIGTERM");
});
process.on("SIGINT", () => {
  console.error("Received SIGINT");
});
process.on("exit", (code) => {
  console.error("Process exit with code:", code);
});
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
