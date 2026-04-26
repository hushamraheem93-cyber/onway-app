// server/index.ts
import express3 from "express";

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
    const safeId = phoneNumber.replace(/[^a-zA-Z0-9]/g, "_");
    await db.collection("pushTokens").doc(safeId).set(
      { phoneNumber, pushToken, updatedAt: admin.firestore.Timestamp.now() },
      { merge: true }
    );
    console.log(`Push token saved for ${phoneNumber}`);
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({
        pushToken,
        updatedAt: admin.firestore.Timestamp.now()
      });
    }
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
async function saveAdminPushToken(pushToken) {
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
async function getAdminPushToken() {
  if (!db) return null;
  try {
    const doc = await db.collection("app_settings").doc("admin_push").get();
    return doc.exists ? doc.data()?.pushToken || null : null;
  } catch (error) {
    console.error("Error getting admin push token:", error);
    return null;
  }
}
async function getAllUsers() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("users").orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error getting all users:", error);
    return [];
  }
}
async function getAllUserPushTokens() {
  if (!db) return [];
  const tokenSet = /* @__PURE__ */ new Set();
  try {
    const ptSnapshot = await db.collection("pushTokens").get();
    ptSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.pushToken && data.pushToken.startsWith("ExponentPushToken")) {
        tokenSet.add(data.pushToken);
      }
    });
  } catch (error) {
    console.error("Error reading pushTokens collection:", error);
  }
  try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("pushToken", "!=", null).get();
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.pushToken && data.pushToken.startsWith("ExponentPushToken")) {
        tokenSet.add(data.pushToken);
      }
    });
  } catch (error) {
    console.error("Error reading users push tokens:", error);
  }
  const tokens = Array.from(tokenSet);
  console.log(`getAllUserPushTokens: found ${tokens.length} token(s)`);
  return tokens;
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
  if (data.restaurant) {
    productDoc.restaurant = data.restaurant;
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
async function getOrdersByDriverPhone(driverPhone, driverName) {
  if (!db) return [];
  try {
    const seen = /* @__PURE__ */ new Set();
    const allOrders = [];
    const byPhone = await db.collection("orders").where("driverPhone", "==", driverPhone).get();
    for (const doc of byPhone.docs) {
      const o = { id: doc.id, ...doc.data() };
      if (o.status === "delivered" && !seen.has(doc.id)) {
        seen.add(doc.id);
        allOrders.push(o);
      }
    }
    if (driverName) {
      const byName = await db.collection("orders").where("driverName", "==", driverName).get();
      for (const doc of byName.docs) {
        const o = { id: doc.id, ...doc.data() };
        if (o.status === "delivered" && !seen.has(doc.id)) {
          seen.add(doc.id);
          allOrders.push(o);
        }
      }
    }
    return allOrders.sort((a, b) => {
      const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
      const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  } catch (error) {
    console.error("Error getting orders by driver phone:", error);
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
async function updateDriverOnlineStatus(phoneNumber, isOnline) {
  if (!db) return;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return;
    const docRef = snapshot.docs[0].ref;
    await docRef.update({
      isOnline,
      onlineAt: isOnline ? Date.now() : null,
      updatedAt: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error("Error updating driver online status:", error);
  }
}
async function saveDriverPushToken(phoneNumber, pushToken) {
  if (!db) return;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return;
    await snapshot.docs[0].ref.update({
      pushToken,
      updatedAt: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error("Error saving driver push token:", error);
  }
}
async function getDriverPushToken(phoneNumber) {
  if (!db) return null;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data();
    return data.pushToken || null;
  } catch (error) {
    console.error("Error getting driver push token:", error);
    return null;
  }
}
async function getOnlineDrivers() {
  if (!db) return [];
  try {
    const snapshot = await db.collection("drivers").where("isOnline", "==", true).where("status", "==", "approved").get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return { phoneNumber: data.phoneNumber, onlineAt: data.onlineAt || Date.now() };
    }).sort((a, b) => a.onlineAt - b.onlineAt);
  } catch (error) {
    console.error("Error getting online drivers:", error);
    return [];
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
    const needsUpdate = existing.empty || existing.size !== defaultBanners.length || existing.docs.some((doc) => {
      const data = doc.data();
      return data.image && (data.image.startsWith("http") || !data.image.startsWith("/uploads/banners/"));
    });
    if (needsUpdate) {
      console.log("Updating banners in Firestore...");
      const deleteBatch = db.batch();
      existing.docs.forEach((doc) => deleteBatch.delete(doc.ref));
      await deleteBatch.commit();
      const createBatch = db.batch();
      defaultBanners.forEach((banner) => {
        const docRef = db.collection("banners").doc(banner.id);
        createBatch.set(docRef, {
          image: banner.image,
          title: banner.title,
          isActive: banner.isActive,
          type: banner.type,
          order: banner.order,
          linkType: banner.linkType || "",
          linkTarget: banner.linkTarget || ""
        });
      });
      await createBatch.commit();
      console.log("Banners updated successfully");
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
      isActive: data.isActive !== false,
      ...data.lat !== void 0 && { lat: data.lat },
      ...data.lng !== void 0 && { lng: data.lng }
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
async function saveDriverCompletedOrder(phoneNumber, order) {
  if (!db) return;
  try {
    await db.collection("driverCompletedOrders").add({
      phoneNumber,
      ...order,
      savedAt: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error("Error saving driver completed order:", error);
  }
}
async function getDriverCompletedOrdersFromDB(phoneNumber) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("driverCompletedOrders").where("phoneNumber", "==", phoneNumber).get();
    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        orderId: d.orderId,
        deliveryFee: d.deliveryFee || 0,
        driverEarning: d.driverEarning || 0,
        ownerEarning: d.ownerEarning || 0,
        total: d.total || 0,
        customerName: d.customerName || "",
        completedAt: d.completedAt,
        isRestaurant: d.isRestaurant || false
      };
    });
  } catch (error) {
    console.error("Error getting driver completed orders:", error);
    return [];
  }
}
async function saveDriverActivity(data) {
  if (!db) return;
  try {
    await db.collection("driverActivityLog").add({
      ...data,
      timestamp: admin.firestore.Timestamp.now(),
      date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
      // YYYY-MM-DD for easy daily filtering
    });
  } catch (error) {
    console.error("Error saving driver activity:", error);
  }
}
async function getDriverActivityLog(phoneNumber, limitCount = 200) {
  if (!db) return [];
  try {
    const snapshot = await db.collection("driverActivityLog").where("phoneNumber", "==", phoneNumber).get();
    const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
      const ta = a.timestamp?.toMillis?.() ?? 0;
      const tb = b.timestamp?.toMillis?.() ?? 0;
      return tb - ta;
    }).slice(0, limitCount);
    return docs;
  } catch (error) {
    console.error("Error getting driver activity log:", error);
    return [];
  }
}
async function updateDriverLastLocation(phoneNumber, lat2, lng2) {
  if (!db) return;
  try {
    const snapshot = await db.collection("drivers").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({
        lastLat: lat2,
        lastLng: lng2,
        lastLocationAt: admin.firestore.Timestamp.now()
      });
    }
  } catch (error) {
    console.error("Error updating driver last location:", error);
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
    const snapshot = await db.collection("walletHistory").where("phoneNumber", "==", phoneNumber).limit(100).get();
    const rows = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toDate?.() ? data.timestamp.toDate().toISOString() : data.timestamp
      };
    });
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
async function initializeDefaultCategories(defaultCategories) {
  if (!db) return;
  try {
    const existing = await db.collection("categories").get();
    if (existing.empty) {
      console.log("Initializing default categories in Firestore (first run)...");
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
    }
  } catch (error) {
    console.error("Error initializing default categories:", error);
  }
}
async function getVendors() {
  const db2 = getFirestore();
  if (!db2) return [];
  try {
    const snap = await db2.collection("vendors").orderBy("name").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}
async function createVendor(data) {
  const db2 = getFirestore();
  if (!db2) throw new Error("DB not configured");
  const ref = await db2.collection("vendors").add(data);
  return ref.id;
}
async function updateVendor(id, data) {
  const db2 = getFirestore();
  if (!db2) return false;
  try {
    await db2.collection("vendors").doc(id).update(data);
    return true;
  } catch {
    return false;
  }
}
async function deleteVendor(id) {
  const db2 = getFirestore();
  if (!db2) return false;
  try {
    await db2.collection("vendors").doc(id).delete();
    return true;
  } catch {
    return false;
  }
}
async function initializeDefaultVendors(defaults) {
  const db2 = getFirestore();
  if (!db2) return;
  try {
    const snap = await db2.collection("vendors").limit(1).get();
    if (!snap.empty) return;
    const batch = db2.batch();
    defaults.forEach((v) => {
      const ref = db2.collection("vendors").doc(v.id);
      const { id, ...data } = v;
      batch.set(ref, data);
    });
    await batch.commit();
    console.log("Default vendors initialized");
  } catch (e) {
    console.error("Error initializing vendors:", e);
  }
}
function sanitizePhone(phone) {
  return phone.replace(/[^a-zA-Z0-9]/g, "_");
}
async function getSupportChat(phoneNumber) {
  const db2 = getFirestore();
  if (!db2) return null;
  try {
    const docId = sanitizePhone(phoneNumber);
    const snap = await db2.collection("supportChats").doc(docId).get();
    if (!snap.exists) return null;
    return snap.data();
  } catch (e) {
    console.error("getSupportChat error:", e);
    return null;
  }
}
async function sendSupportMessage(phoneNumber, text, sender, userName = "", extra) {
  const db2 = getFirestore();
  if (!db2) return null;
  try {
    const docId = sanitizePhone(phoneNumber);
    const ref = db2.collection("supportChats").doc(docId);
    const snap = await ref.get();
    const now = Date.now();
    const newMsg = {
      id: `msg_${now}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      sender,
      timestamp: now,
      type: extra?.type || "text",
      ...extra?.imageUrl ? { imageUrl: extra.imageUrl } : {},
      ...extra?.productData ? { productData: extra.productData } : {}
    };
    const displayText = extra?.type === "image" ? "\u0635\u0648\u0631\u0629" : extra?.type === "product" ? `\u0645\u0646\u062A\u062C: ${extra?.productData?.name || text}` : text;
    if (!snap.exists) {
      const chat = {
        phoneNumber,
        userName,
        ...extra?.userRegion ? { userRegion: extra.userRegion } : {},
        ...extra?.userGender ? { userGender: extra.userGender } : {},
        lastMessage: displayText,
        lastMessageAt: now,
        unreadByAdmin: sender === "user" ? 1 : 0,
        unreadByUser: sender === "admin" ? 1 : 0,
        messages: [newMsg]
      };
      await ref.set(chat);
      return chat;
    } else {
      const existing = snap.data();
      const updatedMessages = [...existing.messages || [], newMsg];
      const updates = {
        lastMessage: displayText,
        lastMessageAt: now,
        messages: updatedMessages,
        unreadByAdmin: sender === "user" ? (existing.unreadByAdmin || 0) + 1 : existing.unreadByAdmin,
        unreadByUser: sender === "admin" ? (existing.unreadByUser || 0) + 1 : existing.unreadByUser
      };
      if (userName && !existing.userName) updates.userName = userName;
      if (extra?.userRegion && !existing.userRegion) updates.userRegion = extra.userRegion;
      if (extra?.userGender && !existing.userGender) updates.userGender = extra.userGender;
      await ref.update(updates);
      return { ...existing, ...updates };
    }
  } catch (e) {
    console.error("sendSupportMessage error:", e);
    return null;
  }
}
async function getAllSupportChats() {
  const db2 = getFirestore();
  if (!db2) return [];
  try {
    const snap = await db2.collection("supportChats").get();
    const chats = snap.docs.map((d) => d.data());
    return chats.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
  } catch (e) {
    console.error("getAllSupportChats error:", e);
    return [];
  }
}
async function markSupportChatRead(phoneNumber, by) {
  const db2 = getFirestore();
  if (!db2) return;
  try {
    const docId = sanitizePhone(phoneNumber);
    const field = by === "user" ? "unreadByUser" : "unreadByAdmin";
    await db2.collection("supportChats").doc(docId).update({ [field]: 0 });
  } catch (e) {
    console.error("markSupportChatRead error:", e);
  }
}
async function createDeliveryBatch(data) {
  const db2 = getFirestore();
  if (!db2) return null;
  try {
    const now = admin.firestore.Timestamp.now();
    const batchDoc = {
      driverId: data.driverPhone,
      status: "pending",
      orderIds: data.orderIds,
      totalOrders: data.orderIds.length,
      completedOrders: 0,
      totalDistance: data.totalDistance ?? 0,
      totalEarnings: 0,
      createdAt: now,
      updatedAt: now
    };
    const docRef = await db2.collection("delivery_batches").add(batchDoc);
    const batch = db2.batch();
    data.orderIds.forEach((orderId, idx) => {
      batch.update(db2.collection("orders").doc(orderId), {
        batchId: docRef.id,
        batch_id: docRef.id,
        // snake_case alias
        deliverySequence: idx + 1,
        delivery_sequence: idx + 1,
        // snake_case alias
        updatedAt: now,
        updated_at: now
        // snake_case alias
      });
    });
    await batch.commit();
    return docRef.id;
  } catch (error) {
    console.error("Error creating delivery batch:", error);
    return null;
  }
}
async function getDeliveryBatch(batchId) {
  const db2 = getFirestore();
  if (!db2) return null;
  try {
    const doc = await db2.collection("delivery_batches").doc(batchId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error getting delivery batch:", error);
    return null;
  }
}
async function updateDeliveryBatch(batchId, updates) {
  const db2 = getFirestore();
  if (!db2) return;
  try {
    await db2.collection("delivery_batches").doc(batchId).update({
      ...updates,
      updatedAt: admin.firestore.Timestamp.now()
    });
  } catch (error) {
    console.error("Error updating delivery batch:", error);
  }
}
async function cancelDeliveryBatch(batchId) {
  const db2 = getFirestore();
  if (!db2) return;
  try {
    const batchDoc = await db2.collection("delivery_batches").doc(batchId).get();
    if (!batchDoc.exists) return;
    const batchData = batchDoc.data();
    const writeBatch = db2.batch();
    const now = admin.firestore.Timestamp.now();
    for (const orderId of batchData.orderIds) {
      const orderDoc = await db2.collection("orders").doc(orderId).get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data();
        if (["confirmed", "preparing", "ready", "picked_up"].includes(orderData.status)) {
          writeBatch.update(db2.collection("orders").doc(orderId), {
            batchId: null,
            deliverySequence: 0,
            updatedAt: now
          });
        }
      }
    }
    writeBatch.update(db2.collection("delivery_batches").doc(batchId), {
      status: "cancelled",
      updatedAt: now
    });
    await writeBatch.commit();
  } catch (error) {
    console.error("Error cancelling delivery batch:", error);
  }
}
async function addDeliveryLog(data) {
  const db2 = getFirestore();
  if (!db2) return;
  try {
    const now = admin.firestore.Timestamp.now();
    await db2.collection("delivery_logs").add({
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
      createdAt: now
    });
  } catch (error) {
    console.error("Error adding delivery log:", error);
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
  },
  issue: {
    title: "\u0627\u0644\u0633\u0627\u0626\u0642 \u064A\u062D\u0627\u0648\u0644 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639\u0643",
    body: "\u064A\u0631\u062C\u0649 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0645\u0643\u0627\u0644\u0645\u0629 \u0627\u0644\u0633\u0627\u0626\u0642 \u0623\u0648 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0639\u0646\u0648\u0627\u0646\u0643"
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
    priority: "high",
    ttl: 86400,
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
async function sendDriverBatchNotification(pushToken, totalOrders, batchId) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;
  const message = {
    to: pushToken,
    title: `\u062F\u0641\u0639\u0629 \u062C\u062F\u064A\u062F\u0629 - ${totalOrders} ${totalOrders === 1 ? "\u0637\u0644\u0628" : "\u0637\u0644\u0628\u0627\u062A"}`,
    body: "\u0644\u062F\u064A\u0643 \u062F\u0641\u0639\u0629 \u062A\u0648\u0635\u064A\u0644 \u062C\u062F\u064A\u062F\u0629. \u0627\u0636\u063A\u0637 \u0644\u0639\u0631\u0636 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0648\u0642\u0628\u0648\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A",
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 300,
    data: { type: "new_batch", batchId }
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    const result = await response.json();
    if (result.data.status === "ok") {
      console.log(`[PUSH] Driver batch notification sent \u2192 ${pushToken.slice(-10)}`);
      return true;
    }
    console.error("[PUSH] Driver batch notification error:", result.data.message);
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending driver batch notification:", error);
    return false;
  }
}
async function sendAdminNewOrderNotification(pushToken, orderId, region, total) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;
  const message = {
    to: pushToken,
    title: "\u0637\u0644\u0628 \u062C\u062F\u064A\u062F",
    body: `\u0637\u0644\u0628 \u0645\u0646 ${region} - \u0627\u0644\u0645\u0628\u0644\u063A: ${total.toLocaleString()} \u062F.\u0639`,
    sound: "default",
    channelId: "default",
    priority: "high",
    ttl: 86400,
    data: { type: "new_order", orderId }
  };
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    const result = await response.json();
    if (result.data.status === "ok") {
      console.log(`[PUSH] Admin new-order notification sent`);
      return true;
    }
    return false;
  } catch (error) {
    console.error("[PUSH] Error sending admin notification:", error);
    return false;
  }
}
async function sendBroadcastNotification(tokens, title, body, data) {
  if (!tokens.length) return { sent: 0, failed: 0 };
  const CHUNK_SIZE = 100;
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((token) => ({
      to: token,
      title,
      body,
      sound: "default",
      channelId: "default",
      data: data || {}
    }));
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(messages)
      });
      const result = await response.json();
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      tickets.forEach((ticket) => {
        if (ticket.status === "ok") sent++;
        else failed++;
      });
    } catch (error) {
      console.error("Error sending broadcast chunk:", error);
      failed += chunk.length;
    }
  }
  return { sent, failed };
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
var webpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `${randomUUID()}.webp`);
  }
});
var uploadWebP = multer({
  storage: webpStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/webp", "image/jpeg", "image/png", "image/gif", "application/octet-stream"];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith(".webp"));
  }
});
var defaultVendors = [
  { id: "v1", name: "\u064A\u0644\u0627 \u0627\u064A\u062A", location: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 - \u0634\u0627\u0631\u0639 \u0627\u0644\u062A\u062C\u0627\u0631\u064A", whatsappNumber: "9647701234001", commissionPercent: 10, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", rating: 4.8, deliveryTime: "25-35", isOpen: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "v2", name: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0645\u0634\u0648\u064A\u0627\u062A", location: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 - \u0627\u0644\u0633\u0648\u0642 \u0627\u0644\u0645\u0631\u0643\u0632\u064A", whatsappNumber: "9647701234002", commissionPercent: 12, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400", rating: 4.6, deliveryTime: "30-45", isOpen: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "v3", name: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0623\u0633\u0645\u0627\u0643", location: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 - \u0642\u0631\u0628 \u0627\u0644\u0646\u0647\u0631", whatsappNumber: "9647701234003", commissionPercent: 10, image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400", rating: 4.5, deliveryTime: "35-50", isOpen: false, createdAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "v4", name: "\u0645\u0637\u0639\u0645 \u0627\u0644\u062F\u062C\u0627\u062C", location: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 - \u0627\u0644\u062D\u064A \u0627\u0644\u0634\u0645\u0627\u0644\u064A", whatsappNumber: "9647701234004", commissionPercent: 10, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=400", rating: 4.4, deliveryTime: "20-30", isOpen: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() },
  { id: "v5", name: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0644\u062D\u0648\u0645", location: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 - \u0642\u0631\u0628 \u0627\u0644\u062C\u0627\u0645\u0639 \u0627\u0644\u0643\u0628\u064A\u0631", whatsappNumber: "9647701234005", commissionPercent: 12, image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400", rating: 4.7, deliveryTime: "30-40", isOpen: true, createdAt: (/* @__PURE__ */ new Date()).toISOString() }
];
var vendorsCache = null;
var userProfiles = [];
var deliveryAreas = [
  { id: "daloaiya", name: "\u0627\u0644\u0636\u0644\u0648\u0639\u064A\u0629 \u0627\u0644\u0645\u0631\u0643\u0632", fee: 3e3, isActive: true },
  { id: "hawija", name: "\u0627\u0644\u062D\u0648\u064A\u062C\u0629 \u0627\u0644\u0628\u062D\u0631\u064A\u0629", fee: 3500, isActive: true },
  { id: "jbour", name: "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u062C\u0628\u0648\u0631", fee: 3e3, isActive: true },
  { id: "bishikan", name: "\u0628\u064A\u0634\u064A\u0643\u0627\u0646", fee: 3500, isActive: true }
];
var categories = [
  { id: "restaurants", name: "\u0627\u0644\u0645\u0637\u0627\u0639\u0645", image: "/uploads/category-restaurants.png", productCount: 30, order: 1, color: "#FFF3E0", iconColor: "#E86520" },
  { id: "fruits-vegetables", name: "\u0627\u0644\u062E\u0636\u0631\u0648\u0627\u062A \u0648\u0627\u0644\u0641\u0648\u0627\u0643\u0647", image: "/uploads/category-vegetables.png", productCount: 50, order: 2, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "\u0627\u0644\u0644\u062D\u0648\u0645 \u0648\u0627\u0644\u0637\u0627\u0632\u062C", image: "/uploads/category-meat.png", productCount: 55, order: 3, color: "#FFEBEE", iconColor: "#EF5350" },
  { id: "dairy-eggs", name: "\u0627\u0644\u0623\u0644\u0628\u0627\u0646 \u0648\u0627\u0644\u0623\u062C\u0628\u0627\u0646", image: "/uploads/category-dairy.png", productCount: 70, order: 4, color: "#F3E5F5", iconColor: "#AB47BC" },
  { id: "cleaning-care", name: "\u0627\u0644\u0645\u0646\u0638\u0641\u0627\u062A", image: "/uploads/category-cleaning.png", productCount: 95, order: 5, color: "#E3F2FD", iconColor: "#42A5F5" },
  { id: "beverages", name: "\u0627\u0644\u0645\u0634\u0631\u0648\u0628\u0627\u062A", image: "/uploads/category-beverages.png", productCount: 90, order: 6, color: "#E0F7FA", iconColor: "#26C6DA" },
  { id: "snacks-sweets", name: "\u0633\u0646\u0627\u0643\u0633 \u0648\u0645\u0642\u0631\u0645\u0634\u0627\u062A", image: "/uploads/category-snacks.png", productCount: 110, order: 7, color: "#FFF3E0", iconColor: "#FFA726" },
  { id: "tea-coffee", name: "\u0634\u0627\u064A \u0648\u0642\u0647\u0648\u0629", image: "/uploads/category-coffee.png", productCount: 35, order: 8, color: "#EFEBE9", iconColor: "#8D6E63" },
  { id: "baby", name: "\u0645\u0633\u062A\u0644\u0632\u0645\u0627\u062A \u0623\u0637\u0641\u0627\u0644", image: "/uploads/category-baby.png", productCount: 60, order: 9, color: "#FCE4EC", iconColor: "#EC407A" },
  { id: "flowers", name: "\u0647\u062F\u0627\u064A\u0627 \u0648\u0648\u0631\u0648\u062F", image: "/uploads/category-flowers.png", productCount: 25, order: 10, color: "#FDF2F2", iconColor: "#EF5350" },
  { id: "delivery", name: "\u062E\u062F\u0645\u0627\u062A \u0627\u0644\u0645\u0646\u062F\u0648\u0628", image: "/uploads/category-delivery.png", productCount: 0, order: 11, color: "#FFF9C4", iconColor: "#FBC02D" },
  { id: "women-bags", name: "\u0627\u0644\u062D\u0642\u0627\u0626\u0628 \u0627\u0644\u0646\u0633\u0627\u0626\u064A\u0629", image: "/uploads/category-bags.png", productCount: 12, order: 12, color: "#FCE4EC", iconColor: "#E91E63" },
  { id: "international-shopping", name: "\u0627\u0644\u0634\u0631\u0627\u0621 \u0645\u0646 \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629", image: "/uploads/category-international.png", productCount: 0, order: 13, color: "#E8EAF6", iconColor: "#5C6BC0" },
  { id: "food-supplies", name: "\u0627\u0644\u0645\u0648\u0627\u062F \u0627\u0644\u063A\u0630\u0627\u0626\u064A\u0629", image: "/uploads/category-food-supplies.png", productCount: 9, order: 14, color: "#FFF8E1", iconColor: "#F9A825" }
];
var banners = [
  { id: "slider-1", image: "/uploads/banners/banner-1.png", title: "\u062A\u0648\u0635\u064A\u0644 \u0633\u0631\u064A\u0639 \u0644\u0628\u0627\u0628 \u0628\u064A\u062A\u0643", isActive: true, type: "slider", order: 1, linkType: "screen", linkTarget: "CourierPickup" },
  { id: "slider-2", image: "/uploads/banners/banner-2.png", title: "\u0623\u0634\u0647\u0649 \u0627\u0644\u0645\u0623\u0643\u0648\u0644\u0627\u062A \u0627\u0644\u0639\u0631\u0627\u0642\u064A\u0629", isActive: true, type: "slider", order: 2, linkType: "category", linkTarget: "restaurants" },
  { id: "slider-3", image: "/uploads/banners/banner-3.png", title: "\u0637\u0644\u0628\u0627\u062A\u0643 \u0627\u0644\u064A\u0648\u0645\u064A\u0629 \u0628\u0636\u063A\u0637\u0629 \u0632\u0631", isActive: true, type: "slider", order: 3, linkType: "category", linkTarget: "fruits-vegetables" },
  { id: "slider-4", image: "/uploads/banners/banner-4.png", title: "\u0639\u0631\u0648\u0636 \u0648\u062E\u0635\u0648\u0645\u0627\u062A \u062D\u0635\u0631\u064A\u0629", isActive: true, type: "slider", order: 4, linkType: "screen", linkTarget: "AllCategories" },
  { id: "slider-5", image: "/uploads/banners/banner-5.png", title: "\u0645\u0633\u0627\u062D\u0629 \u0625\u0639\u0644\u0627\u0646\u064A\u0629 \u0644\u0623\u0635\u062D\u0627\u0628 \u0627\u0644\u0645\u0637\u0627\u0639\u0645 \u0648\u0627\u0644\u0645\u0627\u0631\u0643\u062A", isActive: true, type: "slider", order: 5, linkType: "screen", linkTarget: "AllCategories" }
];
var products = [
  // مطعم يلا ايت
  { id: "r1", categoryId: "restaurants", restaurant: "\u064A\u0644\u0627 \u0627\u064A\u062A", name: "\u0628\u0631\u062C\u0631 \u0643\u0644\u0627\u0633\u064A\u0643", price: 8e3, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300", description: "\u0628\u0631\u062C\u0631 \u0644\u062D\u0645 \u0643\u0644\u0627\u0633\u064A\u0643\u064A \u0645\u0639 \u062E\u0633 \u0648\u0637\u0645\u0627\u0637\u0645 \u0648\u0635\u0648\u0635 \u062E\u0627\u0635", inStock: true },
  { id: "r2", categoryId: "restaurants", restaurant: "\u064A\u0644\u0627 \u0627\u064A\u062A", name: "\u0628\u0631\u062C\u0631 \u062F\u062C\u0627\u062C \u0645\u0642\u0631\u0645\u0634", price: 7500, image: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=300", description: "\u0628\u0631\u062C\u0631 \u062F\u062C\u0627\u062C \u0645\u0642\u0631\u0645\u0634 \u0645\u0639 \u0635\u0648\u0635 \u0645\u0627\u064A\u0648\u0646\u064A\u0632", inStock: true },
  { id: "r3", categoryId: "restaurants", restaurant: "\u064A\u0644\u0627 \u0627\u064A\u062A", name: "\u0634\u0627\u0648\u0631\u0645\u0627 \u0644\u062D\u0645", price: 5e3, image: "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300", description: "\u0634\u0627\u0648\u0631\u0645\u0627 \u0644\u062D\u0645 \u0639\u0631\u0628\u064A\u0629 \u0645\u0639 \u062E\u0636\u0627\u0631 \u0648\u0637\u062D\u064A\u0646\u0629", inStock: true },
  { id: "r4", categoryId: "restaurants", restaurant: "\u064A\u0644\u0627 \u0627\u064A\u062A", name: "\u0634\u0627\u0648\u0631\u0645\u0627 \u062F\u062C\u0627\u062C", price: 4500, image: "https://images.unsplash.com/photo-1561651188-d207bbec4ec3?w=300", description: "\u0634\u0627\u0648\u0631\u0645\u0627 \u062F\u062C\u0627\u062C \u0645\u0639 \u062B\u0648\u0645\u064A\u0629 \u0648\u0628\u0637\u0627\u0637\u0627", inStock: true },
  { id: "r5", categoryId: "restaurants", restaurant: "\u064A\u0644\u0627 \u0627\u064A\u062A", name: "\u0628\u064A\u062A\u0632\u0627 \u0645\u0627\u0631\u063A\u0631\u064A\u062A\u0627", price: 12e3, image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=300", description: "\u0628\u064A\u062A\u0632\u0627 \u0645\u0627\u0631\u063A\u0631\u064A\u062A\u0627 \u0628\u0627\u0644\u062C\u0628\u0646 \u0648\u0627\u0644\u0631\u064A\u062D\u0627\u0646", inStock: true },
  // مطعم المشويات
  { id: "r6", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0645\u0634\u0648\u064A\u0627\u062A", name: "\u0643\u0628\u0627\u0628 \u0644\u062D\u0645", price: 15e3, image: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=300", description: "\u0643\u0628\u0627\u0628 \u0644\u062D\u0645 \u0645\u0634\u0648\u064A \u0639\u0644\u0649 \u0627\u0644\u0641\u062D\u0645 6 \u0623\u0633\u064A\u0627\u062E", inStock: true },
  { id: "r7", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0645\u0634\u0648\u064A\u0627\u062A", name: "\u062A\u0643\u0629 \u062F\u062C\u0627\u062C", price: 12e3, image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=300", description: "\u062A\u0643\u0629 \u062F\u062C\u0627\u062C \u0645\u0634\u0648\u064A\u0629 \u0645\u062A\u0628\u0644\u0629 6 \u0623\u0633\u064A\u0627\u062E", inStock: true },
  { id: "r8", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0645\u0634\u0648\u064A\u0627\u062A", name: "\u0645\u0634\u0627\u0648\u064A \u0645\u0634\u0643\u0644\u0629", price: 25e3, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=300", description: "\u0637\u0628\u0642 \u0645\u0634\u0627\u0648\u064A \u0645\u0634\u0643\u0644\u0629 \u0645\u0639 \u0631\u0632 \u0648\u0633\u0644\u0637\u0629", inStock: true },
  { id: "r9", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0645\u0634\u0648\u064A\u0627\u062A", name: "\u0631\u064A\u0634 \u063A\u0646\u0645", price: 2e4, image: "https://images.unsplash.com/photo-1558030006-450675393462?w=300", description: "\u0631\u064A\u0634 \u063A\u0646\u0645 \u0645\u0634\u0648\u064A\u0629 4 \u0642\u0637\u0639", inStock: true },
  // مطعم الأسماك
  { id: "r10", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0623\u0633\u0645\u0627\u0643", name: "\u0633\u0645\u0643 \u0645\u0634\u0648\u064A", price: 18e3, image: "https://images.unsplash.com/photo-1534604973900-c43ab4c2e0ab?w=300", description: "\u0633\u0645\u0643 \u0634\u0628\u0648\u0637 \u0645\u0634\u0648\u064A \u0639\u0644\u0649 \u0627\u0644\u0641\u062D\u0645", inStock: true },
  { id: "r11", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0623\u0633\u0645\u0627\u0643", name: "\u0633\u0645\u0643 \u0645\u0642\u0644\u064A", price: 15e3, image: "https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=300", description: "\u0633\u0645\u0643 \u0645\u0642\u0644\u064A \u0645\u0642\u0631\u0645\u0634 \u0645\u0639 \u0635\u0648\u0635 \u062A\u0631\u062A\u0627\u0631", inStock: true },
  { id: "r12", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0623\u0633\u0645\u0627\u0643", name: "\u0631\u0648\u0628\u064A\u0627\u0646 \u0645\u0634\u0648\u064A", price: 22e3, image: "https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=300", description: "\u0631\u0648\u0628\u064A\u0627\u0646 \u0645\u0634\u0648\u064A \u0628\u0627\u0644\u062B\u0648\u0645 \u0648\u0627\u0644\u0632\u0628\u062F\u0629", inStock: true },
  { id: "r13", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0623\u0633\u0645\u0627\u0643", name: "\u0633\u0645\u0643 \u0627\u0644\u0647\u0627\u0645\u0648\u0631", price: 25e3, image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300", description: "\u0641\u064A\u0644\u064A\u0647 \u0647\u0627\u0645\u0648\u0631 \u0645\u0634\u0648\u064A \u0645\u0639 \u062E\u0636\u0627\u0631", inStock: true },
  // مطعم الدجاج
  { id: "r14", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u062F\u062C\u0627\u062C", name: "\u062F\u062C\u0627\u062C \u0645\u0634\u0648\u064A \u0643\u0627\u0645\u0644", price: 15e3, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?w=300", description: "\u062F\u062C\u0627\u062C \u0643\u0627\u0645\u0644 \u0645\u0634\u0648\u064A \u0639\u0644\u0649 \u0627\u0644\u0641\u062D\u0645", inStock: true },
  { id: "r15", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u062F\u062C\u0627\u062C", name: "\u0642\u0637\u0639 \u062F\u062C\u0627\u062C \u0645\u0642\u0644\u064A\u0629", price: 1e4, image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=300", description: "\u0642\u0637\u0639 \u062F\u062C\u0627\u062C \u0645\u0642\u0644\u064A\u0629 \u0645\u0642\u0631\u0645\u0634\u0629 8 \u0642\u0637\u0639", inStock: true },
  { id: "r16", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u062F\u062C\u0627\u062C", name: "\u062F\u062C\u0627\u062C \u0628\u0627\u0644\u0643\u0627\u0631\u064A", price: 12e3, image: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=300", description: "\u062F\u062C\u0627\u062C \u0628\u0635\u0644\u0635\u0629 \u0627\u0644\u0643\u0627\u0631\u064A \u0645\u0639 \u0627\u0644\u0631\u0632", inStock: true },
  { id: "r17", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u062F\u062C\u0627\u062C", name: "\u0623\u062C\u0646\u062D\u0629 \u062F\u062C\u0627\u062C \u062D\u0627\u0631\u0629", price: 9e3, image: "https://images.unsplash.com/photo-1608039829572-9b0175ffb205?w=300", description: "\u0623\u062C\u0646\u062D\u0629 \u062F\u062C\u0627\u062C \u062D\u0627\u0631\u0629 10 \u0642\u0637\u0639", inStock: true },
  // مطعم اللحوم
  { id: "r18", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0644\u062D\u0648\u0645", name: "\u0633\u062A\u064A\u0643 \u0644\u062D\u0645", price: 28e3, image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=300", description: "\u0633\u062A\u064A\u0643 \u0644\u062D\u0645 \u0628\u0642\u0631\u064A \u0645\u0634\u0648\u064A \u0645\u0639 \u0628\u0637\u0627\u0637\u0627", inStock: true },
  { id: "r19", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0644\u062D\u0648\u0645", name: "\u0643\u0641\u062A\u0629 \u0628\u0627\u0644\u0641\u0631\u0646", price: 14e3, image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=300", description: "\u0643\u0641\u062A\u0629 \u0644\u062D\u0645 \u0628\u0627\u0644\u0641\u0631\u0646 \u0645\u0639 \u0635\u0644\u0635\u0629 \u0637\u0645\u0627\u0637\u0645", inStock: true },
  { id: "r20", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0644\u062D\u0648\u0645", name: "\u0637\u0628\u0642 \u0644\u062D\u0645 \u0639\u0631\u0627\u0642\u064A", price: 2e4, image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300", description: "\u0637\u0628\u0642 \u0644\u062D\u0645 \u0639\u0631\u0627\u0642\u064A \u062A\u0642\u0644\u064A\u062F\u064A \u0645\u0639 \u0631\u0632 \u0648\u0633\u0644\u0637\u0629", inStock: true },
  { id: "r21", categoryId: "restaurants", restaurant: "\u0645\u0637\u0639\u0645 \u0627\u0644\u0644\u062D\u0648\u0645", name: "\u062F\u0648\u0644\u0645\u0629 \u0639\u0631\u0627\u0642\u064A\u0629", price: 16e3, image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=300", description: "\u062F\u0648\u0644\u0645\u0629 \u0639\u0631\u0627\u0642\u064A\u0629 \u0628\u0627\u0644\u0631\u0632 \u0648\u0627\u0644\u0644\u062D\u0645 \u0627\u0644\u0645\u0641\u0631\u0648\u0645", inStock: true },
  // باقي المنتجات
  { id: "p1", categoryId: "groceries", name: "\u0623\u0631\u0632 \u0628\u0633\u0645\u062A\u064A", price: 35e3, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300", description: "\u0623\u0631\u0632 \u0628\u0633\u0645\u062A\u064A \u0639\u0627\u0644\u064A \u0627\u0644\u062C\u0648\u062F\u0629 5 \u0643\u064A\u0644\u0648", inStock: true },
  { id: "p2", categoryId: "groceries", name: "\u0632\u064A\u062A \u0632\u064A\u062A\u0648\u0646", price: 65e3, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300", description: "\u0632\u064A\u062A \u0632\u064A\u062A\u0648\u0646 \u0628\u0643\u0631 \u0645\u0645\u062A\u0627\u0632 1 \u0644\u062A\u0631", inStock: true },
  { id: "p3", categoryId: "groceries", name: "\u0639\u0633\u0644 \u0637\u0628\u064A\u0639\u064A", price: 85e3, image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300", description: "\u0639\u0633\u0644 \u0637\u0628\u064A\u0639\u064A \u0635\u0627\u0641\u064A 500 \u062C\u0631\u0627\u0645", inStock: true },
  { id: "p4", categoryId: "dairy-eggs", name: "\u062D\u0644\u064A\u0628 \u0637\u0627\u0632\u062C", price: 12e3, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300", description: "\u062D\u0644\u064A\u0628 \u0637\u0627\u0632\u062C \u0643\u0627\u0645\u0644 \u0627\u0644\u062F\u0633\u0645 1 \u0644\u062A\u0631", inStock: true },
  { id: "p5", categoryId: "bakery", name: "\u062E\u0628\u0632 \u0639\u0631\u0628\u064A", price: 5e3, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300", description: "\u062E\u0628\u0632 \u0639\u0631\u0628\u064A \u0637\u0627\u0632\u062C 6 \u0642\u0637\u0639", inStock: true },
  { id: "p6", categoryId: "dairy-eggs", name: "\u062C\u0628\u0646\u0629 \u0628\u064A\u0636\u0627\u0621", price: 22e3, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300", description: "\u062C\u0628\u0646\u0629 \u0628\u064A\u0636\u0627\u0621 \u0637\u0627\u0632\u062C\u0629 400 \u062C\u0631\u0627\u0645", inStock: true },
  { id: "p7", categoryId: "cleaning-care", name: "\u0635\u0627\u0628\u0648\u0646 \u063A\u0633\u064A\u0644", price: 15e3, image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300", description: "\u0635\u0627\u0628\u0648\u0646 \u063A\u0633\u064A\u0644 \u0645\u0639\u0637\u0631 3 \u0643\u064A\u0644\u0648", inStock: true },
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
  { id: "wb12", categoryId: "women-bags", name: "\u062D\u0642\u064A\u0628\u0629 \u0645\u0627\u0631\u0643\u0629 \u0641\u0627\u062E\u0631\u0629", price: 25e4, image: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300", description: "\u062D\u0642\u064A\u0628\u0629 \u0645\u0627\u0631\u0643\u0629 \u0641\u0627\u062E\u0631\u0629 \u0628\u062A\u0635\u0645\u064A\u0645 \u062D\u0635\u0631\u064A", inStock: true, discount: 20 },
  // المواد الغذائية
  { id: "fs1", categoryId: "food-supplies", name: "\u0631\u0632", price: 45e3, image: "/uploads/product-3d-rice.png", description: "\u0631\u0632 \u0628\u0633\u0645\u062A\u064A \u0641\u0627\u062E\u0631 5 \u0643\u064A\u0644\u0648", inStock: true, weight: "5 \u0643\u064A\u0644\u0648" },
  { id: "fs2", categoryId: "food-supplies", name: "\u0633\u0643\u0631", price: 3e4, image: "/uploads/product-3d-sugar.png", description: "\u0633\u0643\u0631 \u0623\u0628\u064A\u0636 \u0646\u0627\u0639\u0645 5 \u0643\u064A\u0644\u0648", inStock: true, weight: "5 \u0643\u064A\u0644\u0648" },
  { id: "fs3", categoryId: "food-supplies", name: "\u0645\u0644\u062D", price: 5e3, image: "/uploads/product-3d-salt.png", description: "\u0645\u0644\u062D \u0637\u0639\u0627\u0645 \u0646\u0642\u064A 1 \u0643\u064A\u0644\u0648", inStock: true, weight: "1 \u0643\u064A\u0644\u0648" },
  { id: "fs4", categoryId: "food-supplies", name: "\u0637\u062D\u064A\u0646", price: 25e3, image: "/uploads/product-3d-flour.png", description: "\u0637\u062D\u064A\u0646 \u0623\u0628\u064A\u0636 \u0645\u062A\u0639\u062F\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0627\u062A 5 \u0643\u064A\u0644\u0648", inStock: true, weight: "5 \u0643\u064A\u0644\u0648" },
  { id: "fs5", categoryId: "food-supplies", name: "\u0645\u0639\u062C\u0648\u0646 \u0637\u0645\u0627\u0637\u0645", price: 8e3, image: "/uploads/product-3d-tomato-paste.png", description: "\u0645\u0639\u062C\u0648\u0646 \u0637\u0645\u0627\u0637\u0645 \u0645\u0631\u0643\u0651\u0632 400 \u062C\u0631\u0627\u0645", inStock: true, weight: "400 \u062C\u0631\u0627\u0645" },
  { id: "fs6", categoryId: "food-supplies", name: "\u0645\u0643\u0631\u0648\u0646\u0629", price: 7e3, image: "/uploads/product-3d-pasta.png", description: "\u0645\u0643\u0631\u0648\u0646\u0629 \u0633\u0628\u0627\u063A\u064A\u062A\u064A 500 \u062C\u0631\u0627\u0645", inStock: true, weight: "500 \u062C\u0631\u0627\u0645" },
  { id: "fs7", categoryId: "food-supplies", name: "\u0627\u0646\u062F\u0648\u0645\u064A", price: 3e3, image: "/uploads/product-3d-indomie.png", description: "\u0627\u0646\u062F\u0648\u0645\u064A \u0646\u0648\u062F\u0644\u0632 \u0628\u0646\u0643\u0647\u0629 \u0627\u0644\u062F\u062C\u0627\u062C", inStock: true },
  { id: "fs8", categoryId: "food-supplies", name: "\u0639\u062F\u0633", price: 15e3, image: "/uploads/product-3d-lentils.png", description: "\u0639\u062F\u0633 \u0623\u062D\u0645\u0631 \u0645\u062C\u0631\u0648\u0634 1 \u0643\u064A\u0644\u0648", inStock: true, weight: "1 \u0643\u064A\u0644\u0648" },
  { id: "fs9", categoryId: "food-supplies", name: "\u062D\u0645\u0635", price: 12e3, image: "/uploads/product-3d-chickpeas.png", description: "\u062D\u0645\u0635 \u062D\u0628 \u062C\u0627\u0641 1 \u0643\u064A\u0644\u0648", inStock: true, weight: "1 \u0643\u064A\u0644\u0648" }
];
async function registerRoutes(app2) {
  let productsCache = null;
  let productsCacheTime = 0;
  const PRODUCTS_CACHE_TTL = 3 * 60 * 1e3;
  async function getCachedProducts(categoryId) {
    const now = Date.now();
    if (!productsCache || now - productsCacheTime > PRODUCTS_CACHE_TTL) {
      const db2 = getFirestore();
      if (db2) {
        const result = await getProducts();
        productsCache = result.map((p) => {
          const item = { ...p, image: limitImageSize(p.image) };
          if (item.categoryId === "restaurants" && !item.restaurant) {
            item.restaurant = "\u064A\u0644\u0627 \u0627\u064A\u062A";
          }
          return item;
        });
      } else {
        productsCache = [...products];
      }
      productsCacheTime = now;
    }
    if (categoryId) {
      return productsCache.filter((p) => p.categoryId === categoryId);
    }
    return productsCache;
  }
  function invalidateProductsCache() {
    productsCache = null;
    productsCacheTime = 0;
  }
  const driverQueue = [];
  const driverAssignments = /* @__PURE__ */ new Map();
  const batchedOrderIds = /* @__PURE__ */ new Set();
  const driverCompletedOrders = /* @__PURE__ */ new Map();
  const driverLocations = /* @__PURE__ */ new Map();
  const driverRejectionCooldowns = /* @__PURE__ */ new Map();
  const REJECTION_COOLDOWN_MS = 3 * 60 * 1e3;
  const rejectionEvents = [];
  async function getCompletedOrders(phoneNumber) {
    const dbOrders = await getDriverCompletedOrdersFromDB(phoneNumber);
    const memOrders = driverCompletedOrders.get(phoneNumber) || [];
    const dbIds = new Set(dbOrders.map((o) => o.orderId));
    const extra = memOrders.filter((o) => !dbIds.has(o.orderId));
    return [...dbOrders, ...extra];
  }
  async function checkIsRestaurantOrder(order) {
    try {
      if (order.vendorId) return true;
      if (order.orderType === "restaurant") return true;
      const products2 = await getCachedProducts();
      if (products2.length > 0 && order.items) {
        for (const item of order.items) {
          const product = products2.find((p) => p.id === item.productId);
          if (product && product.categoryId === "restaurants") return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }
  await initializeDefaultCategories(categories);
  await initializeDefaultBanners(banners);
  await initializeDefaultDeliveryAreas(deliveryAreas);
  await initializeDefaultVendors(defaultVendors);
  try {
    const onlineDrivers = await getOnlineDrivers();
    for (const d of onlineDrivers) {
      if (!driverQueue.find((q) => q.phoneNumber === d.phoneNumber)) {
        driverQueue.push({ phoneNumber: d.phoneNumber, joinedAt: d.onlineAt });
      }
    }
    if (onlineDrivers.length > 0) {
      console.log(`Restored ${onlineDrivers.length} online driver(s) from Firestore`);
      try {
        const db2 = getFirestore();
        if (db2) {
          const batchSnap = await db2.collection("delivery_batches").where("status", "in", ["pending", "in_progress"]).get();
          const allOrdersForRestore = await getOrders();
          for (const bDoc of batchSnap.docs) {
            const bData = bDoc.data();
            const batchOrderStatuses = (bData.orderIds || []).map((oid) => {
              const o = allOrdersForRestore.find((x) => x.id === oid);
              return o ? o.status : "delivered";
            });
            const allDone = batchOrderStatuses.every((s) => s === "delivered" || s === "cancelled" || s === "issue");
            if (allDone) {
              db2.collection("delivery_batches").doc(bDoc.id).update({ status: "completed", updatedAt: /* @__PURE__ */ new Date() }).catch(() => {
              });
              console.log(`[RESTART] Stale batch ${bDoc.id} auto-completed (all orders done)`);
              continue;
            }
            const driverPhone = bData.driverId;
            const qd = driverQueue.find((d) => d.phoneNumber === driverPhone);
            if (qd && !qd.currentBatchId) {
              qd.currentBatchId = bDoc.id;
              qd.lastSeenAt = Date.now();
              bData.orderIds.forEach((id) => batchedOrderIds.add(id));
              console.log(`[RESTART] Restored batch ${bDoc.id} \u2192 driver ${driverPhone}`);
            }
          }
          const allOrders = await getOrders();
          for (const qd of driverQueue) {
            if (!qd.currentBatchId) {
              const waitingOrders = allOrders.filter((o) => o.status === "confirmed" && !batchedOrderIds.has(o.id)).sort((a, b) => {
                const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
                const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
                return aTime - bTime;
              }).slice(0, 3);
              if (waitingOrders.length > 0) {
                const orderIds = waitingOrders.map((o) => o.id);
                const batchId = await createDeliveryBatch({ driverPhone: qd.phoneNumber, orderIds });
                if (batchId) {
                  qd.currentBatchId = batchId;
                  qd.lastSeenAt = Date.now();
                  orderIds.forEach((id) => batchedOrderIds.add(id));
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
  app2.post("/api/admin/upload-image", uploadWebP.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "\u0644\u0645 \u064A\u062A\u0645 \u0631\u0641\u0639 \u0623\u064A \u0635\u0648\u0631\u0629" });
      }
      const url = `/uploads/${req.file.filename}`;
      res.json({ url, filename: req.file.filename, size: req.file.size });
    } catch (error) {
      console.error("Error uploading image:", error);
      res.status(500).json({ error: "\u0641\u0634\u0644 \u0641\u064A \u0631\u0641\u0639 \u0627\u0644\u0635\u0648\u0631\u0629" });
    }
  });
  app2.get("/api/admin/categories", async (_req, res) => {
    try {
      const db2 = getFirestore();
      if (db2) {
        const firestoreCategories = await getCategories();
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
  const bannerLinks = {
    "slider-1": { linkType: "screen", linkTarget: "CourierPickup" },
    "slider-2": { linkType: "category", linkTarget: "restaurants" },
    "slider-3": { linkType: "category", linkTarget: "fruits-vegetables" },
    "slider-4": { linkType: "screen", linkTarget: "AllCategories" }
  };
  app2.get("/api/banners", async (req, res) => {
    try {
      const type = req.query.type;
      let result = await getBanners(true);
      if (type) {
        result = result.filter((b) => b.type === type);
      }
      const lightResult = result.map((b) => {
        const link = bannerLinks[b.id] || {};
        return {
          ...b,
          image: limitImageSize(b.image, 1e5),
          linkType: b.linkType || link.linkType || "",
          linkTarget: b.linkTarget || link.linkTarget || ""
        };
      });
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
    try {
      let result = await getCachedProducts(categoryId);
      if (search) {
        const searchLower = search.toLowerCase();
        result = result.filter(
          (p) => p.name.toLowerCase().includes(searchLower) || p.description.toLowerCase().includes(searchLower)
        );
      }
      res.set("Cache-Control", "public, max-age=60");
      res.json(result);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.json([]);
    }
  });
  app2.get("/api/admin/products", async (req, res) => {
    try {
      const result = await getCachedProducts();
      res.json(result);
    } catch (error) {
      console.error("Error fetching admin products:", error);
      res.json([]);
    }
  });
  app2.post("/api/admin/products", async (req, res) => {
    try {
      if (!req.body) {
        return res.status(400).json({ error: "Request body is empty" });
      }
      const { name, categoryId, price, originalPrice, discount, description, inStock, image, restaurant } = req.body;
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
          inStock: inStockBool,
          restaurant: restaurant ? String(restaurant) : void 0
        });
        if (newProduct2) {
          invalidateProductsCache();
          return res.json(newProduct2);
        }
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
        inStock: inStockBool,
        restaurant: restaurant ? String(restaurant) : void 0
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
    const { name, categoryId, price, originalPrice, discount, description, inStock, image, restaurant } = req.body;
    const productId2 = req.params.id;
    const db2 = getFirestore();
    const priceNum = price !== void 0 ? Number(price) : void 0;
    const originalPriceNum = originalPrice === null ? null : originalPrice !== void 0 ? Number(originalPrice) : void 0;
    const discountNum = discount === null ? null : discount !== void 0 ? Number(discount) : void 0;
    const inStockBool = inStock !== void 0 ? inStock === "true" || inStock === true : void 0;
    if (db2) {
      const updates = {
        name: name !== void 0 ? String(name) : void 0,
        categoryId: categoryId !== void 0 ? String(categoryId) : void 0,
        price: priceNum,
        originalPrice: originalPriceNum,
        discount: discountNum,
        image: image !== void 0 ? String(image) : void 0,
        description: description !== void 0 ? String(description) : void 0,
        inStock: inStockBool
      };
      if (restaurant !== void 0) updates.restaurant = restaurant ? String(restaurant) : "";
      const updated = await updateProduct(productId2, updates);
      if (updated) {
        invalidateProductsCache();
        return res.json(updated);
      }
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
      inStock: inStockBool !== void 0 ? inStockBool : products[index].inStock,
      restaurant: restaurant !== void 0 ? String(restaurant) : products[index].restaurant
    };
    res.json(products[index]);
  });
  app2.delete("/api/admin/products/:id", async (req, res) => {
    const db2 = getFirestore();
    if (db2) {
      const success = await deleteProduct(req.params.id);
      if (success) {
        invalidateProductsCache();
        return res.json({ success: true });
      }
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
      const { name, fee, lat: lat2, lng: lng2 } = req.body;
      const area = await createDeliveryArea({
        name,
        fee: parseInt(fee) || 0,
        isActive: true,
        ...lat2 !== void 0 && lat2 !== null && lat2 !== "" && { lat: parseFloat(lat2) },
        ...lng2 !== void 0 && lng2 !== null && lng2 !== "" && { lng: parseFloat(lng2) }
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
      const { name, fee, isActive, lat: lat2, lng: lng2 } = req.body;
      const updates = {};
      if (name !== void 0) updates.name = name;
      if (fee !== void 0) updates.fee = parseInt(fee);
      if (isActive !== void 0) updates.isActive = isActive !== "false" && isActive !== false;
      if (lat2 !== void 0 && lat2 !== null && lat2 !== "") updates.lat = parseFloat(lat2);
      if (lng2 !== void 0 && lng2 !== null && lng2 !== "") updates.lng = parseFloat(lng2);
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
  async function getVendorList() {
    if (vendorsCache) return vendorsCache;
    try {
      const list = await getVendors();
      if (list.length > 0) {
        const sorted = list.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
        vendorsCache = sorted;
        return vendorsCache;
      }
    } catch {
    }
    vendorsCache = [...defaultVendors];
    return vendorsCache;
  }
  function invalidateVendorsCache() {
    vendorsCache = null;
  }
  app2.get("/api/vendors", async (_req, res) => {
    const vendors = await getVendorList();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(vendors);
  });
  app2.get("/api/admin/vendors", async (_req, res) => {
    const vendors = await getVendorList();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(vendors);
  });
  app2.post("/api/admin/vendors", async (req, res) => {
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine } = req.body;
    if (!name) return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0637\u0639\u0645 \u0645\u0637\u0644\u0648\u0628" });
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
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      categoryType: categoryType || "restaurant",
      cuisine: cuisine ? String(cuisine) : "",
      sortOrder: maxOrder + 1
    };
    try {
      const id = await createVendor(data);
      invalidateVendorsCache();
      res.json({ id, ...data });
    } catch (e) {
      res.status(500).json({ error: "\u0641\u0634\u0644 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0637\u0639\u0645" });
    }
  });
  app2.post("/api/admin/vendors/reorder", async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062A\u0631\u062A\u064A\u0628 \u0645\u0637\u0644\u0648\u0628\u0629" });
    }
    try {
      for (let i = 0; i < order.length; i++) {
        await updateVendor(order[i], { sortOrder: i + 1 });
      }
      invalidateVendorsCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app2.patch("/api/admin/vendors/:id/sort-order", async (req, res) => {
    const { id } = req.params;
    const { direction } = req.body;
    try {
      const vendors = await getVendorList();
      const sorted = [...vendors].sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      const missingOrder = sorted.filter((v) => v.sortOrder === void 0);
      if (missingOrder.length > 0) {
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].sortOrder === void 0) {
            sorted[i].sortOrder = i + 1;
            await updateVendor(sorted[i].id, { sortOrder: i + 1 });
          }
        }
      }
      const idx = sorted.findIndex((v) => v.id === id);
      if (idx === -1) return res.status(404).json({ error: "\u0627\u0644\u0645\u0637\u0639\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return res.status(400).json({ error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u062A\u064A\u0628 \u0623\u0643\u062B\u0631" });
      const current = sorted[idx];
      const neighbor = sorted[swapIdx];
      const currentOrder = current.sortOrder;
      const neighborOrder = neighbor.sortOrder;
      await updateVendor(current.id, { sortOrder: neighborOrder });
      await updateVendor(neighbor.id, { sortOrder: currentOrder });
      invalidateVendorsCache();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app2.put("/api/admin/vendors/:id", async (req, res) => {
    const { id } = req.params;
    const { name, location, whatsappNumber, commissionPercent, image, rating, deliveryTime, isOpen, categoryType, cuisine } = req.body;
    const updates = {};
    if (name !== void 0) updates.name = String(name);
    if (location !== void 0) updates.location = String(location);
    if (whatsappNumber !== void 0) updates.whatsappNumber = String(whatsappNumber);
    if (commissionPercent !== void 0) updates.commissionPercent = Number(commissionPercent);
    if (image !== void 0) updates.image = String(image);
    if (rating !== void 0) updates.rating = Number(rating);
    if (deliveryTime !== void 0) updates.deliveryTime = String(deliveryTime);
    if (isOpen !== void 0) updates.isOpen = Boolean(isOpen);
    if (categoryType !== void 0) updates.categoryType = categoryType;
    if (cuisine !== void 0) updates.cuisine = String(cuisine);
    try {
      await updateVendor(id, updates);
      invalidateVendorsCache();
      res.json({ success: true, id, ...updates });
    } catch {
      res.status(500).json({ error: "\u0641\u0634\u0644 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0637\u0639\u0645" });
    }
  });
  app2.delete("/api/admin/vendors/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await deleteVendor(id);
      invalidateVendorsCache();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "\u0641\u0634\u0644 \u062D\u0630\u0641 \u0627\u0644\u0645\u0637\u0639\u0645" });
    }
  });
  app2.get("/api/admin/vendors/:id/statement", async (req, res) => {
    const { id } = req.params;
    const db2 = getFirestore();
    const vendors = await getVendorList();
    const vendor = vendors.find((v) => v.id === id);
    if (!vendor) return res.status(404).json({ error: "\u0627\u0644\u0645\u0637\u0639\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    if (!db2) return res.json({ vendor, orders: [], totalSales: 0, appCommission: 0, vendorNet: 0 });
    try {
      const ordersSnap = await db2.collection("orders").where("vendorId", "==", id).get();
      const orders = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const totalSales = orders.reduce((s, o) => s + (o.restaurantSubtotal || o.total || 0), 0);
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
    const { userId, phoneNumber, customerName, customerPhone, notes, items, total, deliveryFee, address, region, latitude, longitude, orderType, internationalDetails, courierDetails, promoCode, promoDiscount } = req.body;
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
      if (customerPhone) orderData.customerPhone = customerPhone;
      if (notes) orderData.notes = notes;
      if (latitude !== void 0 && longitude !== void 0) {
        orderData.latitude = latitude;
        orderData.longitude = longitude;
      }
      if (orderType) orderData.orderType = orderType;
      if (internationalDetails) orderData.internationalDetails = internationalDetails;
      if (courierDetails) orderData.courierDetails = courierDetails;
      if (promoCode) orderData.promoCode = promoCode;
      if (promoDiscount) orderData.promoDiscount = promoDiscount;
      let vendorWhatsappUrl = null;
      try {
        const allProds = await getCachedProducts();
        const vendorsList = await getVendorList();
        const restaurantItems = [];
        let restaurantSubtotal = 0;
        let detectedRestaurantName = null;
        for (const it of items) {
          const prod = allProds.find((p) => p.id === it.productId);
          if (prod && prod.categoryId === "restaurants") {
            restaurantItems.push({ ...it, restaurantName: prod.restaurant });
            restaurantSubtotal += (Number(it.price) || 0) * (Number(it.quantity) || 1);
            if (!detectedRestaurantName && prod.restaurant) {
              detectedRestaurantName = prod.restaurant;
            }
          }
        }
        if (restaurantItems.length > 0) {
          let vendor = detectedRestaurantName ? vendorsList.find((v) => v.name === detectedRestaurantName) : null;
          if (!vendor) {
            for (const v of vendorsList) {
              const namePart = v.name.replace(/مطعم\s*/g, "").trim();
              if (namePart && restaurantItems.some((it) => it.name?.includes(namePart))) {
                vendor = v;
                break;
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
            const itemsList = restaurantItems.map((it) => `\u2022 ${it.name} \xD7 ${it.quantity}`).join("\n");
            const shortId = Math.random().toString(36).slice(2, 8).toUpperCase();
            const waMsg = encodeURIComponent(
              `\u0637\u0644\u0628 \u062C\u062F\u064A\u062F \u0645\u0646 OnWay \u{1F6D2}
\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: #${shortId}
\u0627\u0644\u0648\u062C\u0628\u0627\u062A:
${itemsList}
\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A: ${restaurantSubtotal.toLocaleString()} \u062F.\u0639
\u0627\u0644\u0633\u0627\u0626\u0642: \u0633\u064A\u062A\u0645 \u0627\u0644\u062A\u0639\u064A\u064A\u0646 \u0641\u0648\u0631 \u0627\u0644\u062C\u0627\u0647\u0632\u064A\u0629`
            );
            vendorWhatsappUrl = `https://wa.me/${vendor.whatsappNumber}?text=${waMsg}`;
          }
        }
      } catch (e) {
        console.error("Vendor detection error:", e);
      }
      const newOrder = await createOrder(orderData);
      if (newOrder) {
        if (promoCode) {
          await recordPromoUsage(userId || phoneNumber, promoCode).catch(
            (err) => console.error("Failed to record promo usage:", err)
          );
        }
        getAdminPushToken().then((adminToken) => {
          if (adminToken) {
            sendAdminNewOrderNotification(
              adminToken,
              newOrder.id,
              orderData.region || "",
              (orderData.total || 0) + (orderData.deliveryFee || 0)
            ).catch(() => {
            });
          }
        }).catch(() => {
        });
        return res.json({
          ...newOrder,
          status: "pending",
          createdAt: newOrder.createdAt.toDate().toISOString(),
          updatedAt: newOrder.updatedAt.toDate().toISOString(),
          vendorWhatsappUrl
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
          onOrderConfirmed();
        }
        return res.json({ success: true, id: orderId, status });
      }
      return res.status(404).json({ error: "Order not found" });
    }
    res.status(500).json({ error: "Database not configured" });
  });
  app2.post("/api/admin/orders/:id/assign-driver", async (req, res) => {
    const orderId = req.params.id;
    const { driverPhone } = req.body;
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "Database not configured" });
    if (!driverPhone) return res.status(400).json({ error: "driverPhone required" });
    try {
      const allOrders = await getOrders();
      const order = allOrders.find((o) => o.id === orderId);
      if (!order) return res.status(404).json({ error: "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      if (["delivered", "cancelled"].includes(order.status)) {
        return res.status(400).json({ error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u064A\u064A\u0646 \u0633\u0627\u0626\u0642 \u0644\u0637\u0644\u0628 \u0645\u0643\u062A\u0645\u0644 \u0623\u0648 \u0645\u0644\u063A\u0649" });
      }
      const driver = await getDriverByPhone(driverPhone);
      if (!driver) return res.status(404).json({ error: "\u0627\u0644\u0633\u0627\u0626\u0642 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      if (driver.status !== "approved") return res.status(400).json({ error: "\u0627\u0644\u0633\u0627\u0626\u0642 \u063A\u064A\u0631 \u0645\u0641\u0639\u0651\u0644" });
      batchedOrderIds.delete(orderId);
      const queuedDriver = driverQueue.find((d) => d.phoneNumber === driverPhone);
      if (queuedDriver?.currentBatchId) {
        const oldBatch = await getDeliveryBatch(queuedDriver.currentBatchId);
        if (oldBatch) {
          const oldNonActive = oldBatch.orderIds.filter((id) => {
            const o = allOrders.find((x) => x.id === id);
            return !o || ["delivered", "cancelled"].includes(o.status);
          });
          if (oldNonActive.length === oldBatch.orderIds.length) {
            await updateDeliveryBatch(queuedDriver.currentBatchId, { status: "completed" }).catch(() => {
            });
          }
          oldBatch.orderIds.forEach((id) => batchedOrderIds.delete(id));
        }
        queuedDriver.currentBatchId = void 0;
      }
      if (!queuedDriver) {
        driverQueue.push({
          phoneNumber: driverPhone,
          joinedAt: Date.now(),
          lastSeenAt: Date.now(),
          currentBatchId: void 0
        });
      }
      const batchId = await createDeliveryBatch({
        driverPhone,
        orderIds: [orderId]
      });
      if (!batchId) return res.status(500).json({ error: "\u0641\u0634\u0644 \u0641\u064A \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062F\u064F\u0641\u0639\u0629" });
      const targetDriver = driverQueue.find((d) => d.phoneNumber === driverPhone);
      if (targetDriver) targetDriver.currentBatchId = batchId;
      batchedOrderIds.add(orderId);
      const driverName = [driver.firstName, driver.secondName].filter(Boolean).join(" ") || driver.fullName || driverPhone;
      const { FieldValue } = await import("firebase-admin/firestore");
      await db2.collection("orders").doc(orderId).update({
        driverPhone,
        driverName,
        batchId,
        status: order.status === "pending" ? "confirmed" : order.status,
        rejectedAt: FieldValue.delete(),
        rejectedByDriver: FieldValue.delete(),
        rejectedByPhone: FieldValue.delete()
      }).catch(() => {
      });
      const driverPushToken = await getDriverPushToken(driverPhone);
      if (driverPushToken) {
        sendDriverBatchNotification(driverPushToken, 1, batchId).catch(() => {
        });
      }
      console.log(`[ADMIN] Manually assigned order ${orderId} \u2192 driver ${driverPhone} (batch ${batchId})`);
      res.json({ success: true, batchId, driverPhone, driverName });
    } catch (error) {
      console.error("assign-driver error:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/users/push-token", async (req, res) => {
    const { phoneNumber, pushToken } = req.body;
    if (!phoneNumber || !pushToken) {
      return res.status(400).json({ error: "Phone number and push token are required" });
    }
    const db2 = getFirestore();
    if (db2) {
      await updateUserPushToken(phoneNumber, pushToken);
      return res.json({ success: true });
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
      let currentBatch = null;
      if (queuedDriver?.currentBatchId) {
        const batchDoc = await getDeliveryBatch(queuedDriver.currentBatchId);
        if (!batchDoc) {
          console.log(`[STATUS] Clearing stale batchId ${queuedDriver.currentBatchId} for driver ${phoneNumber} (not found in DB)`);
          queuedDriver.currentBatchId = void 0;
        } else {
          const allOrders = await getOrders();
          const batchOrders = batchDoc.orderIds.map((oid) => allOrders.find((o) => o.id === oid)).filter(Boolean).map(async (order) => {
            const customerProfile = await getUserByPhone(order.phoneNumber || "");
            return {
              ...order,
              customerName: order.customerName || customerProfile?.fullName || "\u0632\u0628\u0648\u0646",
              customerPhone: order.phoneNumber || "",
              latitude: order.latitude || null,
              longitude: order.longitude || null,
              pickedUpAt: order.pickedUpAt || null,
              deliveredAt: order.deliveredAt || null,
              deliverySequence: order.deliverySequence || 1,
              createdAt: order.createdAt?.toDate?.() ? order.createdAt.toDate().toISOString() : order.createdAt,
              updatedAt: order.updatedAt?.toDate?.() ? order.updatedAt.toDate().toISOString() : order.updatedAt
            };
          });
          const resolvedOrders = await Promise.all(batchOrders);
          const completedCount = resolvedOrders.filter((o) => o.status === "delivered" || o.status === "issue" || o.status === "cancelled").length;
          if (resolvedOrders.length > 0 && completedCount === resolvedOrders.length) {
            console.log(`[STATUS] All orders delivered in batch ${batchDoc.id} \u2014 auto-clearing for driver ${phoneNumber}`);
            queuedDriver.currentBatchId = void 0;
            batchDoc.orderIds.forEach((id) => batchedOrderIds.delete(id));
            const db2 = getFirestore();
            if (db2) db2.collection("delivery_batches").doc(batchDoc.id).update({ status: "completed", updatedAt: /* @__PURE__ */ new Date() }).catch(() => {
            });
            assignWaitingBatchToDriver(phoneNumber).catch(() => {
            });
          } else {
            currentBatch = {
              id: batchDoc.id,
              status: batchDoc.status,
              totalOrders: batchDoc.totalOrders,
              completedOrders: completedCount,
              startTime: batchDoc.startTime,
              orders: resolvedOrders.sort((a, b) => (a.deliverySequence || 0) - (b.deliverySequence || 0))
            };
          }
        }
      }
      let queuePosition = null;
      if (isOnline && !queuedDriver?.currentBatchId) {
        const availableDriversBefore = driverQueue.filter((d, i) => i <= queueIndex && !d.currentBatchId);
        queuePosition = availableDriversBefore.length;
      }
      const walletBalance = await getDriverWalletBalance(phoneNumber);
      const completed = await getCompletedOrders(phoneNumber);
      const now = /* @__PURE__ */ new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayCompleted = completed.filter((o) => new Date(o.completedAt).getTime() >= todayStart);
      res.json({
        isOnline,
        queuePosition,
        currentBatch,
        approvalStatus: driver?.status || "pending",
        walletBalance,
        todayOrders: todayCompleted.length,
        todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0)
      });
    } catch (error) {
      console.error("Error getting driver status:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/location", async (req, res) => {
    const { phoneNumber, lat: lat2, lng: lng2 } = req.body;
    if (!phoneNumber || lat2 === void 0 || lng2 === void 0) return res.status(400).json({ error: "Missing fields" });
    const driver = await getDriverByPhone(phoneNumber).catch(() => null);
    driverLocations.set(phoneNumber, { lat: Number(lat2), lng: Number(lng2), updatedAt: Date.now(), fullName: driver?.fullName });
    const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
    if (qd) qd.lastSeenAt = Date.now();
    updateDriverLastLocation(phoneNumber, Number(lat2), Number(lng2)).catch(() => {
    });
    res.json({ success: true });
  });
  app2.get("/api/orders/:orderId/driver-location", async (req, res) => {
    const { orderId } = req.params;
    const driverPhone = driverAssignments.get(orderId);
    if (!driverPhone) return res.json({ available: false });
    const location = driverLocations.get(driverPhone);
    if (!location) return res.json({ available: false });
    if (Date.now() - location.updatedAt > 10 * 60 * 1e3) return res.json({ available: false });
    return res.json({
      available: true,
      lat: location.lat,
      lng: location.lng,
      fullName: location.fullName || "",
      updatedAt: location.updatedAt
    });
  });
  app2.get("/api/admin/driver-locations", async (_req, res) => {
    const now = Date.now();
    const locations = [];
    for (const [phone, loc] of driverLocations.entries()) {
      if (now - loc.updatedAt > 5 * 60 * 1e3) continue;
      const isOnline = driverQueue.some((d) => d.phoneNumber === phone);
      if (!isOnline) continue;
      const queuedDriver = driverQueue.find((d) => d.phoneNumber === phone);
      locations.push({
        phoneNumber: phone,
        fullName: loc.fullName || phone,
        lat: loc.lat,
        lng: loc.lng,
        updatedAt: loc.updatedAt,
        status: queuedDriver?.currentBatchId ? "busy" : "available",
        currentBatchId: queuedDriver?.currentBatchId || null
      });
    }
    res.json({ locations });
  });
  app2.post("/api/driver/toggle-online", async (req, res) => {
    const { phoneNumber, goOnline, pushToken } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      if (goOnline) {
        const walletBalance = await getDriverWalletBalance(phoneNumber);
        if (walletBalance < 250) {
          return res.status(400).json({ error: "\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u062D\u0641\u0638\u0629 \u063A\u064A\u0631 \u0643\u0627\u0641\u064D. \u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649 \u0662\u0665\u0660 \u062F.\u0639", walletBalance });
        }
        const exists = driverQueue.find((d) => d.phoneNumber === phoneNumber);
        if (!exists) {
          driverQueue.push({ phoneNumber, joinedAt: Date.now(), lastSeenAt: Date.now() });
        } else {
          exists.lastSeenAt = Date.now();
        }
        if (pushToken && pushToken.startsWith("ExponentPushToken")) {
          const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
          if (qd) qd.pushToken = pushToken;
          saveDriverPushToken(phoneNumber, pushToken).catch(() => {
          });
          console.log(`[PUSH] Saved driver push token for ${phoneNumber}: ...${pushToken.slice(-12)}`);
        } else {
          console.log(`[PUSH] No valid push token provided for ${phoneNumber} on toggle-online`);
        }
        updateDriverOnlineStatus(phoneNumber, true).catch(() => {
        });
        saveDriverActivity({ phoneNumber, type: "online" }).catch(() => {
        });
        assignWaitingBatchToDriver(phoneNumber).catch(() => {
        });
        const pos = driverQueue.filter((d) => !d.currentBatchId).findIndex((d) => d.phoneNumber === phoneNumber) + 1;
        res.json({ isOnline: true, queuePosition: pos > 0 ? pos : driverQueue.length });
      } else {
        const idx = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
        }
        updateDriverOnlineStatus(phoneNumber, false).catch(() => {
        });
        saveDriverActivity({ phoneNumber, type: "offline" }).catch(() => {
        });
        res.json({ isOnline: false, queuePosition: null });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/refresh-push-token", async (req, res) => {
    const { phoneNumber, pushToken } = req.body;
    if (!phoneNumber || !pushToken) return res.status(400).json({ error: "Missing fields" });
    if (!pushToken.startsWith("ExponentPushToken")) return res.status(400).json({ error: "Invalid token" });
    try {
      await saveDriverPushToken(phoneNumber, pushToken);
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
      if (qd) qd.pushToken = pushToken;
      console.log(`[PUSH] Refreshed driver push token for ${phoneNumber}: ...${pushToken.slice(-12)}`);
      res.json({ ok: true });
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
        await updateOrderStatus(orderId, "preparing");
        driverAssignments.set(orderId, phoneNumber);
        const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
        if (qd && !qd.currentBatchId) qd.currentBatchId = orderId;
        const driver = await getDriverByPhone(phoneNumber);
        const driverName = driver?.fullName || phoneNumber;
        await updateOrderDriverInfo(orderId, {
          driverName,
          driverPhone: phoneNumber
        });
        saveDriverActivity({ phoneNumber, type: "accepted", orderId }).catch(() => {
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/start-delivery", async (req, res) => {
    const { phoneNumber, orderId } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (db2) {
        await updateOrderStatus(orderId, "in_delivery");
        saveDriverActivity({ phoneNumber, type: "in_delivery", orderId }).catch(() => {
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/report-issue", async (req, res) => {
    const { phoneNumber, orderId, issueType } = req.body;
    if (!phoneNumber || !orderId || !issueType) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (!db2) return res.status(500).json({ error: "Database not configured" });
      const now = /* @__PURE__ */ new Date();
      await db2.collection("orders").doc(orderId).update({
        status: "issue",
        issueType,
        issuedAt: now,
        updatedAt: now
      });
      const allOrders = await getOrders();
      const order = allOrders.find((o) => o.id === orderId);
      if (order?.phoneNumber) {
        const pushToken = await getUserPushToken(order.phoneNumber);
        if (pushToken) {
          await sendPushNotification(pushToken, "issue", orderId);
        }
      }
      await db2.collection("adminAlerts").add({
        type: "driver_issue",
        orderId,
        driverPhone: phoneNumber,
        issueType,
        createdAt: /* @__PURE__ */ new Date(),
        read: false
      });
      saveDriverActivity({ phoneNumber, type: "issue", orderId }).catch(() => {
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/reject-order", async (req, res) => {
    const { phoneNumber, orderId, batchId } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Missing fields" });
    try {
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
      const targetBatchId = batchId || qd?.currentBatchId;
      let orderCount = 1;
      let rejectedOrderIds = [];
      if (qd) {
        if (targetBatchId) {
          const batchDoc = await getDeliveryBatch(targetBatchId);
          if (batchDoc) {
            orderCount = batchDoc.orderIds.length;
            rejectedOrderIds = batchDoc.orderIds;
            batchDoc.orderIds.forEach((id) => batchedOrderIds.delete(id));
          }
          await cancelDeliveryBatch(targetBatchId).catch(() => {
          });
        } else if (orderId) {
          batchedOrderIds.delete(orderId);
          rejectedOrderIds = [orderId];
        }
        qd.currentBatchId = void 0;
        const savedPushToken = qd.pushToken;
        const idx = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
        if (idx !== -1) {
          driverQueue.splice(idx, 1);
          driverQueue.push({ phoneNumber, joinedAt: Date.now(), pushToken: savedPushToken });
        }
      }
      if (rejectedOrderIds.length > 0) {
        if (!driverRejectionCooldowns.has(phoneNumber)) {
          driverRejectionCooldowns.set(phoneNumber, /* @__PURE__ */ new Map());
        }
        const cooldowns = driverRejectionCooldowns.get(phoneNumber);
        rejectedOrderIds.forEach((id) => cooldowns.set(id, Date.now()));
      }
      const driver = await getDriverByPhone(phoneNumber).catch(() => null);
      const driverName = driver?.fullName || phoneNumber;
      rejectionEvents.push({
        id: `${Date.now()}-${phoneNumber}`,
        driverPhone: phoneNumber,
        driverName,
        batchId: targetBatchId || orderId || "",
        orderCount,
        rejectedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (rejectionEvents.length > 50) rejectionEvents.splice(0, rejectionEvents.length - 50);
      const db2 = getFirestore();
      if (db2 && rejectedOrderIds.length > 0) {
        for (const oid of rejectedOrderIds) {
          db2.collection("orders").doc(oid).update({
            rejectedAt: (/* @__PURE__ */ new Date()).toISOString(),
            rejectedByDriver: driverName,
            rejectedByPhone: phoneNumber
          }).catch(() => {
          });
        }
      }
      console.log(`[REJECT] Driver ${phoneNumber} (${driverName}) rejected batch ${targetBatchId} (${orderCount} orders) \u2014 cooldown set`);
      saveDriverActivity({ phoneNumber, type: "rejected", orderId: targetBatchId || orderId }).catch(() => {
      });
      onOrderConfirmed();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/batch/accept", async (req, res) => {
    const { phoneNumber, batchId } = req.body;
    if (!phoneNumber || !batchId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (!db2) return res.status(500).json({ error: "DB not configured" });
      const batchDoc = await getDeliveryBatch(batchId);
      if (!batchDoc) return res.status(404).json({ error: "Batch not found" });
      const driver = await getDriverByPhone(phoneNumber);
      const driverName = driver?.fullName || phoneNumber;
      for (const orderId of batchDoc.orderIds) {
        await updateOrderStatus(orderId, "preparing");
        await updateOrderDriverInfo(orderId, { driverName, driverPhone: phoneNumber });
        driverAssignments.set(orderId, phoneNumber);
        addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "accepted" }).catch(() => {
        });
      }
      await updateDeliveryBatch(batchId, { status: "in_progress", startTime: (/* @__PURE__ */ new Date()).toISOString() });
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
      if (qd) qd.currentBatchId = batchId;
      saveDriverActivity({ phoneNumber, type: "accepted", orderId: batchId }).catch(() => {
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/batch/pickup-order", async (req, res) => {
    const { phoneNumber, orderId, batchId, lat: lat2, lng: lng2 } = req.body;
    if (!phoneNumber || !orderId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (!db2) return res.status(500).json({ error: "DB not configured" });
      const now = /* @__PURE__ */ new Date();
      await updateOrderStatus(orderId, "in_delivery");
      await db2.collection("orders").doc(orderId).update({ pickedUpAt: now, updatedAt: now });
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "in_delivery", lat: lat2, lng: lng2 }).catch(() => {
      });
      saveDriverActivity({ phoneNumber, type: "in_delivery", orderId }).catch(() => {
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/driver/batch/complete-order", async (req, res) => {
    const { phoneNumber, orderId, batchId, lat: lat2, lng: lng2 } = req.body;
    if (!phoneNumber || !orderId || !batchId) return res.status(400).json({ error: "Missing fields" });
    try {
      const db2 = getFirestore();
      if (!db2) return res.status(500).json({ error: "DB not configured" });
      const now = /* @__PURE__ */ new Date();
      await updateOrderStatus(orderId, "delivered");
      await db2.collection("orders").doc(orderId).update({ deliveredAt: now, updatedAt: now });
      addDeliveryLog({ orderId, driverPhone: phoneNumber, action: "delivered", lat: lat2, lng: lng2 }).catch(() => {
      });
      const allOrders = await getOrders();
      const order = allOrders.find((o) => o.id === orderId);
      if (order) {
        const pushToken = await getUserPushToken(order.phoneNumber || "");
        if (pushToken) await sendPushNotification(pushToken, "delivered", orderId);
        const isRestaurantOrder = await checkIsRestaurantOrder(order);
        const deductionAmount = isRestaurantOrder ? 250 : 1e3;
        const driverEarning = isRestaurantOrder ? 750 : 2e3;
        await updateOrderDriverInfo(orderId, { driverEarning, ownerEarning: deductionAmount });
        const currentBalance = await getDriverWalletBalance(phoneNumber);
        const newBalance = currentBalance - deductionAmount;
        await updateDriverWalletBalance(phoneNumber, newBalance);
        await addWalletTransaction({ phoneNumber, amount: deductionAmount, type: "deduction", service: isRestaurantOrder ? "\u062A\u0648\u0635\u064A\u0644 \u0645\u0637\u0639\u0645" : "\u062A\u0648\u0635\u064A\u0644 \u062A\u0633\u0648\u064A\u0642/\u062E\u062F\u0645\u0627\u062A", orderId });
        const customerProfile = await getUserByPhone(order.phoneNumber || "");
        const completedEntry = {
          orderId,
          deliveryFee: order.deliveryFee || 0,
          driverEarning,
          ownerEarning: deductionAmount,
          total: order.total || 0,
          customerName: customerProfile?.fullName || "\u0632\u0628\u0648\u0646",
          completedAt: now.toISOString(),
          isRestaurant: isRestaurantOrder
        };
        await saveDriverCompletedOrder(phoneNumber, completedEntry);
        saveDriverActivity({ phoneNumber, type: "completed", orderId, customerName: completedEntry.customerName, driverEarning, total: completedEntry.total }).catch(() => {
        });
        const mem = driverCompletedOrders.get(phoneNumber) || [];
        mem.push(completedEntry);
        driverCompletedOrders.set(phoneNumber, mem);
        driverAssignments.delete(orderId);
        batchedOrderIds.delete(orderId);
        const batchDoc = await getDeliveryBatch(batchId);
        if (batchDoc) {
          const freshOrders = await getOrders();
          const allDelivered = batchDoc.orderIds.every((oid) => {
            const o = freshOrders.find((x) => x.id === oid);
            return o?.status === "delivered" || o?.status === "issue" || o?.status === "cancelled";
          });
          const completedCount = batchDoc.orderIds.filter((oid) => {
            const o = freshOrders.find((x) => x.id === oid);
            return o?.status === "delivered" || o?.status === "issue" || o?.status === "cancelled";
          }).length;
          if (allDelivered) {
            const batchEarnings = batchDoc.orderIds.reduce((sum, oid) => {
              const o = freshOrders.find((x) => x.id === oid);
              if (!o) return sum;
              const isRest = o.orderType === "restaurant" || !!o.vendorId;
              return sum + (isRest ? 750 : 2e3);
            }, 0);
            await updateDeliveryBatch(batchId, {
              status: "completed",
              completedOrders: completedCount,
              totalEarnings: batchEarnings,
              endTime: now.toISOString()
            });
            const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
            if (qd) qd.currentBatchId = void 0;
            if (newBalance >= 250) {
              assignWaitingBatchToDriver(phoneNumber).catch(() => {
              });
            } else {
              const queueIdx = driverQueue.findIndex((d) => d.phoneNumber === phoneNumber);
              if (queueIdx !== -1) driverQueue.splice(queueIdx, 1);
            }
          } else {
            const partialEarnings = batchDoc.orderIds.reduce((sum, oid) => {
              const o = freshOrders.find((x) => x.id === oid);
              if (!o || o.status !== "delivered") return sum;
              const isRest = o.orderType === "restaurant" || !!o.vendorId;
              return sum + (isRest ? 750 : 2e3);
            }, 0);
            await updateDeliveryBatch(batchId, { completedOrders: completedCount, totalEarnings: partialEarnings });
          }
        }
      }
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
            driverEarning = 2e3;
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
          const completedEntry = {
            orderId,
            deliveryFee: order.deliveryFee || 0,
            driverEarning,
            ownerEarning,
            total: order.total || 0,
            customerName: customerProfile?.fullName || "\u0632\u0628\u0648\u0646",
            completedAt: (/* @__PURE__ */ new Date()).toISOString(),
            isRestaurant: isRestaurantOrder
          };
          await saveDriverCompletedOrder(phoneNumber, completedEntry);
          saveDriverActivity({
            phoneNumber,
            type: "completed",
            orderId,
            customerName: completedEntry.customerName,
            driverEarning,
            total: completedEntry.total
          }).catch(() => {
          });
          const completed = driverCompletedOrders.get(phoneNumber) || [];
          completed.push(completedEntry);
          driverCompletedOrders.set(phoneNumber, completed);
        }
      }
      driverAssignments.delete(orderId);
      batchedOrderIds.delete(orderId);
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber);
      if (qd) {
        qd.currentBatchId = void 0;
        assignWaitingBatchToDriver(phoneNumber).catch(() => {
        });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/driver/earnings", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const completed = await getCompletedOrders(phoneNumber);
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
      const completed = await getCompletedOrders(phoneNumber);
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
  function findBestAvailableDriver() {
    const fiveMinAgo = Date.now() - 5 * 60 * 1e3;
    const activeDriver = driverQueue.find((d) => {
      if (d.currentBatchId) return false;
      const loc = driverLocations.get(d.phoneNumber);
      const recentGps = loc && loc.updatedAt >= fiveMinAgo;
      const recentSeen = d.lastSeenAt && d.lastSeenAt >= fiveMinAgo;
      return recentGps || recentSeen;
    });
    if (activeDriver) return activeDriver;
    return driverQueue.find((d) => !d.currentBatchId);
  }
  function toRad(value) {
    return value * Math.PI / 180;
  }
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function calculateEstimatedTime(distance) {
    const minutes = Math.ceil(distance / 30 * 60);
    if (minutes < 60) return `${minutes} \u062F\u0642\u064A\u0642\u0629`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} \u0633\u0627\u0639\u0629 \u0648 ${m} \u062F\u0642\u064A\u0642\u0629`;
  }
  function optimizeDeliveryRoute(orders, startLat = 0, startLng = 0) {
    if (orders.length === 0) return [];
    const remaining = orders.map((o) => ({
      ...o,
      lat: o.latitude ?? o.customerLat ?? 0,
      lng: o.longitude ?? o.customerLng ?? 0
    }));
    const optimized = [];
    let curLat = startLat;
    let curLng = startLng;
    while (remaining.length > 0) {
      let nearestIdx = 0;
      let shortest = calculateDistance(curLat, curLng, remaining[0].lat, remaining[0].lng);
      for (let i = 1; i < remaining.length; i++) {
        const d = calculateDistance(curLat, curLng, remaining[i].lat, remaining[i].lng);
        if (d < shortest) {
          shortest = d;
          nearestIdx = i;
        }
      }
      const nearest = remaining.splice(nearestIdx, 1)[0];
      optimized.push(nearest);
      curLat = nearest.lat;
      curLng = nearest.lng;
    }
    return optimized.map((o, i) => {
      const dist = i === 0 ? calculateDistance(startLat, startLng, o.lat, o.lng) : calculateDistance(optimized[i - 1].lat, optimized[i - 1].lng, o.lat, o.lng);
      return {
        id: o.id,
        deliverySequence: i + 1,
        distance: parseFloat(dist.toFixed(2)),
        estimatedTime: calculateEstimatedTime(dist)
      };
    });
  }
  async function assignWaitingBatchToDriver(phoneNumber, maxOrders = 3) {
    console.log(`[BATCH_ASSIGN] Starting for driver ${phoneNumber}`);
    try {
      const db2 = getFirestore();
      if (!db2) {
        console.log(`[BATCH_ASSIGN] No DB`);
        return;
      }
      const qd = driverQueue.find((d) => d.phoneNumber === phoneNumber && !d.currentBatchId);
      if (!qd) {
        const inQueue = driverQueue.find((d) => d.phoneNumber === phoneNumber);
        console.log(`[BATCH_ASSIGN] Driver not eligible \u2014 inQueue=${!!inQueue}, currentBatchId=${inQueue?.currentBatchId}`);
        return;
      }
      const allOrders = await getOrders();
      const confirmedOrders = allOrders.filter((o) => o.status === "confirmed");
      const activeBatchIds = new Set(driverQueue.map((d) => d.currentBatchId).filter(Boolean));
      console.log(`[BATCH_ASSIGN] Total orders=${allOrders.length}, confirmed=${confirmedOrders.length}, activeBatches=${activeBatchIds.size}, batchedSet-size=${batchedOrderIds.size}`);
      const now = Date.now();
      const driverCooldowns = driverRejectionCooldowns.get(phoneNumber);
      const waitingOrders = confirmedOrders.filter((o) => {
        const orderBatchId = o.batchId || o.batch_id;
        if (driverCooldowns) {
          const rejectedAt = driverCooldowns.get(o.id);
          if (rejectedAt && now - rejectedAt < REJECTION_COOLDOWN_MS) {
            console.log(`[BATCH_ASSIGN] Skipping order ${o.id} \u2014 in cooldown for driver ${phoneNumber}`);
            return false;
          }
        }
        if (!orderBatchId) return true;
        if (!activeBatchIds.has(orderBatchId)) return true;
        if (batchedOrderIds.has(o.id)) return false;
        return true;
      }).sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0;
        const bTime = b.createdAt?.toDate?.() ? b.createdAt.toDate().getTime() : 0;
        return aTime - bTime;
      }).slice(0, maxOrders);
      console.log(`[BATCH_ASSIGN] Waiting orders to assign: ${waitingOrders.length} (${waitingOrders.map((o) => o.id).join(",")})`);
      if (waitingOrders.length === 0) return;
      const routeInfo = optimizeDeliveryRoute(waitingOrders);
      const totalDistance = routeInfo.reduce((sum, r) => sum + r.distance, 0);
      const optimizedIds = routeInfo.map((r) => r.id);
      for (const r of routeInfo) {
        await db2.collection("orders").doc(r.id).update({
          deliverySequence: r.deliverySequence,
          delivery_sequence: r.deliverySequence,
          // snake_case alias
          distance: r.distance,
          estimatedTime: r.estimatedTime,
          estimated_time: r.estimatedTime,
          updatedAt: /* @__PURE__ */ new Date()
        }).catch(() => {
        });
      }
      const batchId = await createDeliveryBatch({ driverPhone: phoneNumber, orderIds: optimizedIds, totalDistance });
      if (batchId) {
        qd.currentBatchId = batchId;
        optimizedIds.forEach((id) => batchedOrderIds.add(id));
        console.log(`[BATCH] Created batch ${batchId} (${optimizedIds.length} orders, ~${totalDistance.toFixed(1)} km) for driver ${phoneNumber}`);
        const inMemoryToken = qd?.pushToken;
        const driverPushToken = inMemoryToken || await getDriverPushToken(phoneNumber);
        if (driverPushToken) {
          console.log(`[PUSH] Sending batch notification to driver ${phoneNumber} (token: ...${driverPushToken.slice(-12)})`);
          sendDriverBatchNotification(driverPushToken, optimizedIds.length, batchId).then((ok) => console.log(`[PUSH] Batch notification ${ok ? "sent OK" : "FAILED"} \u2192 ${phoneNumber}`)).catch((e) => console.error(`[PUSH] Batch notification error \u2192 ${phoneNumber}:`, e));
        } else {
          console.warn(`[PUSH] No push token for driver ${phoneNumber} \u2014 notification NOT sent`);
        }
      }
    } catch (e) {
      console.error("assignWaitingBatchToDriver error:", e);
    }
  }
  function onOrderConfirmed() {
    console.log(`[ORDER_CONFIRMED] Queue size=${driverQueue.length}, queue=${JSON.stringify(driverQueue.map((d) => ({ p: d.phoneNumber, batch: d.currentBatchId, lastSeen: d.lastSeenAt })))}`);
    const driver = findBestAvailableDriver();
    console.log(`[ORDER_CONFIRMED] Best driver: ${driver?.phoneNumber ?? "NONE"}`);
    if (driver) {
      assignWaitingBatchToDriver(driver.phoneNumber).catch(console.error);
    }
  }
  setInterval(async () => {
    try {
      const freeDrivers = driverQueue.filter((d) => !d.currentBatchId);
      if (freeDrivers.length === 0) return;
      for (const driver of freeDrivers) {
        await assignWaitingBatchToDriver(driver.phoneNumber);
      }
    } catch (e) {
      console.error("[WATCHDOG] error:", e);
    }
  }, 3e4);
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
        const availableDriver = driverQueue.find((d) => !d.currentBatchId);
        if (availableDriver) {
          availableDriver.currentBatchId = order.id;
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
        if (d.currentBatchId) {
          const order = allOrders.find((o) => o.id === d.currentBatchId);
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
          orderRegion
        };
      }));
      res.json({
        onlineDrivers: driverQueue.length,
        availableDrivers: driverQueue.filter((d) => !d.currentBatchId).length,
        busyDrivers: driverQueue.filter((d) => d.currentBatchId).length,
        queue: queueData
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/rejection-events", (req, res) => {
    const since = req.query.since ? new Date(req.query.since).getTime() : 0;
    const events = since ? rejectionEvents.filter((e) => new Date(e.rejectedAt).getTime() > since) : rejectionEvents.slice(-20);
    res.json({ events });
  });
  app2.get("/api/admin/driver-stats", async (_req, res) => {
    try {
      const drivers = await getDrivers();
      const now = /* @__PURE__ */ new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const stats = {};
      for (const driver of drivers) {
        const phone = driver.phoneNumber;
        const completed = await getCompletedOrders(phone);
        const todayCompleted = completed.filter((o) => new Date(o.completedAt).getTime() >= todayStart);
        const walletBalance = await getDriverWalletBalance(phone);
        stats[phone] = {
          todayOrders: todayCompleted.length,
          todayEarnings: todayCompleted.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
          totalOrders: completed.length,
          totalEarnings: completed.reduce((sum, o) => sum + (o.driverEarning || 0), 0),
          walletBalance
        };
      }
      res.json({ stats });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/driver-activity", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
      const activityLog = await getDriverActivityLog(phoneNumber);
      const completedOrders = await getDriverCompletedOrdersFromDB(phoneNumber);
      const driverProfile = await getDriverByPhone(phoneNumber).catch(() => null);
      const driverFullName = driverProfile?.fullName;
      const historicalOrders = await getOrdersByDriverPhone(phoneNumber, driverFullName);
      const coveredOrderIds = /* @__PURE__ */ new Set([
        ...activityLog.filter((e) => e.type === "completed" && e.orderId).map((e) => e.orderId),
        ...completedOrders.map((o) => o.orderId)
      ]);
      const fromCompleted = completedOrders.filter((o) => !activityLog.some((e) => e.type === "completed" && e.orderId === o.orderId)).map((o) => ({
        type: "completed",
        phoneNumber,
        orderId: o.orderId,
        customerName: o.customerName,
        driverEarning: o.driverEarning,
        total: o.total,
        timestamp: { _seconds: Math.floor(new Date(o.completedAt).getTime() / 1e3), _nanoseconds: 0 },
        date: o.completedAt.split("T")[0]
      }));
      const fromHistorical = historicalOrders.filter((o) => !coveredOrderIds.has(o.id)).map((o) => {
        const ts = o.updatedAt?.toMillis?.() || o.createdAt?.toMillis?.() || 0;
        return {
          type: "completed",
          phoneNumber,
          orderId: o.id,
          customerName: o.customerName || "\u0632\u0628\u0648\u0646",
          driverEarning: null,
          total: o.total || 0,
          timestamp: { _seconds: Math.floor(ts / 1e3), _nanoseconds: 0 },
          date: ts ? new Date(ts).toISOString().split("T")[0] : "",
          fromHistory: true
        };
      });
      const merged = [...activityLog, ...fromCompleted, ...fromHistorical].sort((a, b) => {
        const getMs = (e) => {
          if (e.timestamp?._seconds !== void 0) return e.timestamp._seconds * 1e3;
          if (e.timestamp?.seconds !== void 0) return e.timestamp.seconds * 1e3;
          return 0;
        };
        return getMs(b) - getMs(a);
      });
      res.json({ log: merged });
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
          const driverEarning = isRestaurant ? 750 : 2e3;
          const ownerEarning = isRestaurant ? 250 : 1e3;
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
  app2.delete("/api/admin/archive-old-orders", async (_req, res) => {
    try {
      const db2 = getFirestore();
      if (!db2) return res.status(500).json({ error: "Firestore not initialized" });
      const batchSize = 500;
      const batchDeleteAll = async (docs) => {
        let count = 0;
        for (let i = 0; i < docs.length; i += batchSize) {
          const batch = db2.batch();
          const chunk = docs.slice(i, i + batchSize);
          for (const doc of chunk) batch.delete(doc.ref);
          await batch.commit();
          count += chunk.length;
        }
        return count;
      };
      const allOrders = await getOrders();
      let deleted = 0;
      for (let i = 0; i < allOrders.length; i += batchSize) {
        const batch = db2.batch();
        const chunk = allOrders.slice(i, i + batchSize);
        for (const order of chunk) batch.delete(db2.collection("orders").doc(order.id));
        await batch.commit();
        deleted += chunk.length;
      }
      let walletDeleted = 0;
      try {
        const snap = await db2.collection("walletHistory").get();
        walletDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {
      }
      let activityDeleted = 0;
      try {
        const snap = await db2.collection("driverActivityLog").get();
        activityDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {
      }
      let completedDeleted = 0;
      try {
        const snap = await db2.collection("driverCompletedOrders").get();
        completedDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {
      }
      let alertsDeleted = 0;
      try {
        const snap = await db2.collection("adminAlerts").get();
        alertsDeleted = await batchDeleteAll(snap.docs);
      } catch (_e) {
      }
      let walletsReset = 0;
      try {
        const snap = await db2.collection("driverWallets").get();
        for (let i = 0; i < snap.docs.length; i += batchSize) {
          const batch = db2.batch();
          const chunk = snap.docs.slice(i, i + batchSize);
          for (const doc of chunk) batch.update(doc.ref, { balance: 0 });
          await batch.commit();
          walletsReset += chunk.length;
        }
      } catch (_e) {
      }
      const total = deleted + walletDeleted + activityDeleted + completedDeleted + alertsDeleted;
      res.json({
        deleted,
        walletDeleted,
        activityDeleted,
        completedDeleted,
        alertsDeleted,
        walletsReset,
        total,
        message: `\u062A\u0645 \u0645\u0633\u062D ${deleted} \u0637\u0644\u0628 (\u0643\u0644 \u0627\u0644\u0637\u0644\u0628\u0627\u062A)\u060C ${walletDeleted} \u0633\u062C\u0644 \u0645\u062D\u0641\u0638\u0629\u060C ${activityDeleted} \u0633\u062C\u0644 \u0646\u0634\u0627\u0637\u060C ${alertsDeleted} \u062A\u0646\u0628\u064A\u0647\u060C \u0648\u0625\u0639\u0627\u062F\u0629 \u062A\u0635\u0641\u064A\u0631 ${walletsReset} \u0645\u062D\u0641\u0638\u0629 \u0633\u0627\u0626\u0642`
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
  app2.post("/api/admin/push-token", async (req, res) => {
    const { pushToken } = req.body;
    if (!pushToken) return res.status(400).json({ error: "pushToken required" });
    const success = await saveAdminPushToken(pushToken);
    res.json({ success });
  });
  app2.post("/api/admin/send-notification", async (req, res) => {
    try {
      const { title, body } = req.body;
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ error: "\u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0648\u0627\u0644\u0645\u062D\u062A\u0648\u0649 \u0645\u0637\u0644\u0648\u0628\u0627\u0646" });
      }
      const tokens = await getAllUserPushTokens();
      if (tokens.length === 0) {
        return res.json({ success: true, sent: 0, failed: 0, message: "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0633\u062A\u062E\u062F\u0645\u0648\u0646 \u0645\u0633\u062C\u0644\u0648\u0646 \u0644\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A" });
      }
      const result = await sendBroadcastNotification(tokens, title.trim(), body.trim(), { type: "broadcast" });
      console.log(`Broadcast notification sent: ${result.sent} success, ${result.failed} failed`);
      res.json({
        success: true,
        sent: result.sent,
        failed: result.failed,
        total: tokens.length
      });
    } catch (error) {
      console.error("Error sending broadcast notification:", error);
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/notification-stats", async (_req, res) => {
    try {
      const tokens = await getAllUserPushTokens();
      const allUsers = await getAllUsers();
      res.json({ totalUsers: allUsers.length, tokensCount: tokens.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/orders/:orderId/cancel", async (req, res) => {
    try {
      const { orderId } = req.params;
      const db2 = getFirestore();
      if (!db2) return res.status(503).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
      const doc = await db2.collection("orders").doc(orderId).get();
      if (!doc.exists) return res.status(404).json({ error: "\u0627\u0644\u0637\u0644\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
      const data = doc.data();
      if (data.status === "cancelled") {
        return res.status(400).json({ error: "\u0627\u0644\u0637\u0644\u0628 \u0645\u0644\u063A\u064A \u0645\u0633\u0628\u0642\u0627\u064B" });
      }
      if (data.status !== "pending") {
        return res.status(400).json({ error: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u0637\u0644\u0628 \u0628\u0639\u062F \u0642\u0628\u0648\u0644\u0647" });
      }
      const createdAt = data.createdAt;
      const createdMs = createdAt.toMillis();
      const nowMs = Date.now();
      const LIMIT_MS = 30 * 1e3;
      if (nowMs - createdMs > LIMIT_MS) {
        return res.status(400).json({ error: "\u0627\u0646\u062A\u0647\u062A \u0645\u0647\u0644\u0629 \u0627\u0644\u0625\u0644\u063A\u0627\u0621 (30 \u062B\u0627\u0646\u064A\u0629 \u0641\u0642\u0637)" });
      }
      const { Timestamp } = await import("firebase-admin/firestore");
      await db2.collection("orders").doc(orderId).update({
        status: "cancelled",
        updatedAt: Timestamp.now()
      });
      return res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling order:", error);
      return res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/admin/users", async (_req, res) => {
    try {
      const users = await getAllUsers();
      res.json(users);
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
  app2.get("/api/reverse-geocode", async (req, res) => {
    try {
      let cleanAddr2 = function(raw) {
        return raw.replace(/،\s*العراق\s*$/g, "").replace(/,\s*العراق\s*$/g, "").replace(/\b\w{2,6}\+\w+[،,]?\s*/g, "").replace(/^\s*[،,]\s*/, "").trim();
      }, isUseful2 = function(addr) {
        if (!addr) return false;
        if (addr.includes("\u0637\u0631\u064A\u0642 \u0628\u062F\u0648\u0646 \u0627\u0633\u0645") || addr.includes("Unnamed Road")) return false;
        return true;
      };
      var cleanAddr = cleanAddr2, isUseful = isUseful2;
      const lat2 = parseFloat(req.query.lat);
      const lng2 = parseFloat(req.query.lng);
      if (isNaN(lat2) || isNaN(lng2)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!googleApiKey) {
        return res.json({ address: `${lat2.toFixed(5)}, ${lng2.toFixed(5)}` });
      }
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat2},${lng2}&language=ar&key=${googleApiKey}`;
      const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat2},${lng2}&radius=100&language=ar&key=${googleApiKey}`;
      const [geocodeRes, placesRes] = await Promise.all([
        fetch(geocodeUrl).then((r) => r.json()).catch(() => null),
        fetch(placesUrl).then((r) => r.json()).catch(() => null)
      ]);
      let placeName = "";
      if (placesRes?.status === "OK" && placesRes.results) {
        const arabicRegex = /[\u0600-\u06FF]/;
        for (const place of placesRes.results) {
          const types = place.types || [];
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
          ["locality"]
        ];
        for (const typeGroup of priorityTypes) {
          for (const result of geocodeRes.results) {
            const types = result.types || [];
            if (typeGroup.some((t) => types.includes(t))) {
              const cleaned = cleanAddr2(result.formatted_address || "");
              if (isUseful2(cleaned)) {
                bestAddress = cleaned;
                break;
              }
            }
          }
          if (bestAddress) break;
        }
        if (!bestAddress) {
          for (const result of geocodeRes.results) {
            const types = result.types || [];
            if (!types.includes("plus_code") && !types.includes("country") && !types.includes("administrative_area_level_1")) {
              const cleaned = cleanAddr2(result.formatted_address || "");
              if (isUseful2(cleaned)) {
                bestAddress = cleaned;
                break;
              }
            }
          }
        }
        if (!bestAddress && geocodeRes.results.length > 0) {
          bestAddress = cleanAddr2(geocodeRes.results[0].formatted_address);
        }
      }
      if (placeName || bestAddress) {
        const finalAddress = placeName ? bestAddress ? `${placeName}\u060C ${bestAddress}` : placeName : bestAddress;
        console.log(`Geocode ${lat2},${lng2} => ${finalAddress}`);
        return res.json({ address: finalAddress, placeName: placeName || null });
      }
      res.json({ address: `${lat2.toFixed(5)}, ${lng2.toFixed(5)}` });
    } catch (error) {
      console.error("Geocode error:", error.message);
      res.json({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    }
  });
  app2.get("/api/support/messages", async (req, res) => {
    const phoneNumber = req.query.phoneNumber;
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
  app2.post("/api/support/upload-image", upload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image uploaded" });
      const imageUrl = `/uploads/${req.file.filename}`;
      return res.json({ imageUrl });
    } catch (e) {
      return res.status(500).json({ error: "Failed to upload image" });
    }
  });
  app2.post("/api/support/messages", async (req, res) => {
    const { phoneNumber, text, userName, userRegion, userGender, type, imageUrl, productData } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "phoneNumber required" });
    if (!text && !imageUrl && !productData) return res.status(400).json({ error: "message content required" });
    try {
      const msgText = text?.trim() || (imageUrl ? "\u0635\u0648\u0631\u0629" : productData?.name || "");
      const chat = await sendSupportMessage(phoneNumber, msgText, "user", userName || "", {
        type: type || "text",
        imageUrl,
        productData,
        userRegion,
        userGender
      });
      if (!chat) return res.status(500).json({ error: "Failed to send message" });
      return res.json({ success: true, messages: chat.messages });
    } catch (e) {
      return res.status(500).json({ error: "Failed to send message" });
    }
  });
  app2.get("/api/admin/support/chats", async (_req, res) => {
    try {
      const chats = await getAllSupportChats();
      return res.json(chats);
    } catch (e) {
      return res.status(500).json({ error: "Failed to get chats" });
    }
  });
  app2.post("/api/admin/support/reply", async (req, res) => {
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
  app2.put("/api/admin/support/read/:phoneNumber", async (req, res) => {
    const { phoneNumber } = req.params;
    try {
      await markSupportChatRead(phoneNumber, "admin");
      return res.json({ success: true });
    } catch (e) {
      return res.status(500).json({ error: "Failed to mark as read" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vendor.ts
import express2 from "express";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer2 from "multer";
import sharp from "sharp";
import * as crypto from "crypto";
import * as fs2 from "fs/promises";
import * as path2 from "path";
var router = express2.Router();
var JWT_SECRET = process.env.JWT_SECRET || "onway-vendor-secret-2024";
var VENDOR_COOKIE = "onway_vendor_session";
var upload2 = multer2({
  dest: path2.resolve(process.cwd(), "uploads", "temp"),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("\u0646\u0648\u0639 \u0627\u0644\u0645\u0644\u0641 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645. \u0627\u0633\u062A\u062E\u062F\u0645 PNG \u0623\u0648 JPEG \u0641\u0642\u0637."));
    }
  }
});
function makeVendorToken(vendorId2) {
  return jwt.sign({ vendorId: vendorId2, role: "vendor" }, JWT_SECRET, { expiresIn: "30d" });
}
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  return cookies;
}
function getVendorSession(req) {
  const cookies = req.cookies || parseCookies(req);
  const token = cookies[VENDOR_COOKIE];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.role === "vendor" ? decoded.vendorId : null;
  } catch {
    return null;
  }
}
function requireVendor(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    const cookies = req.cookies || parseCookies(req);
    token = cookies[VENDOR_COOKIE] || null;
  }
  if (!token) return res.status(401).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D - \u0633\u062C\u0644 \u062F\u062E\u0648\u0644\u0643 \u0623\u0648\u0644\u0627\u064B" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "vendor") return res.status(403).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
    req.vendorId = decoded.vendorId;
    next();
  } catch {
    return res.status(401).json({ error: "\u062A\u0648\u0643\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
  }
}
async function generateImageHash(filePath) {
  const buf = await fs2.readFile(filePath);
  return crypto.createHash("md5").update(buf).digest("hex");
}
async function processAndSaveImage(tempPath, hash2) {
  const dir = path2.resolve(process.cwd(), "uploads", "products");
  await fs2.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}_${hash2}.webp`;
  const outPath = path2.join(dir, fileName);
  await sharp(tempPath).resize(800, 800, { fit: "cover", position: "center" }).webp({ quality: 80 }).toFile(outPath);
  return `/uploads/products/${fileName}`;
}
async function findDuplicateImage(hash2) {
  const db2 = getFirestore();
  if (!db2) return null;
  const snap = await db2.collection("productImageHashes").doc(hash2).get();
  if (snap.exists) return snap.data().imageUrl;
  return null;
}
async function saveImageHash(hash2, imageUrl) {
  const db2 = getFirestore();
  if (!db2) return;
  await db2.collection("productImageHashes").doc(hash2).set({
    imageUrl,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function cleanTemp(filePath) {
  if (filePath) await fs2.unlink(filePath).catch(() => {
  });
}
function vendorId() {
  return `vendor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
function productId() {
  return `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
router.post("/api/vendor/mobile-auth", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0637\u0644\u0648\u0628" });
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const snap = await db2.collection("vendors").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snap.empty) {
      return res.json({ vendor: null, token: null });
    }
    const vendor = snap.docs[0].data();
    const { passwordHash: _pw, ...safeVendor } = vendor;
    const token = makeVendorToken(vendor.id);
    res.json({ vendor: safeVendor, token });
  } catch (err) {
    console.error("mobile-auth:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.get("/vendor/login", (_req, res) => {
  res.sendFile(path2.resolve(process.cwd(), "server", "templates", "vendor-login.html"));
});
router.get("/vendor", (req, res) => {
  const vendorId2 = getVendorSession(req);
  if (!vendorId2) return res.redirect("/vendor/login");
  res.sendFile(path2.resolve(process.cwd(), "server", "templates", "vendor-dashboard.html"));
});
router.get("/vendor/dashboard", (req, res) => {
  const vendorId2 = getVendorSession(req);
  if (!vendorId2) return res.redirect("/vendor/login");
  res.sendFile(path2.resolve(process.cwd(), "server", "templates", "vendor-dashboard.html"));
});
router.post("/api/vendor/register", async (req, res) => {
  try {
    const { storeName, businessType, phoneNumber, password, ownerName, address, email } = req.body;
    if (!storeName || !businessType || !phoneNumber || !ownerName) {
      return res.status(400).json({ error: "\u062C\u0645\u064A\u0639 \u0627\u0644\u062D\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629" });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" });
    }
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const existing = await db2.collection("vendors").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0645\u0633\u062C\u0644 \u0645\u0633\u0628\u0642\u0627\u064B" });
    const rawPass = password || Math.random().toString(36) + Math.random().toString(36);
    const passwordHash = await bcrypt.hash(rawPass, 10);
    const id = vendorId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await db2.collection("vendors").doc(id).set({
      id,
      storeName,
      businessType,
      phoneNumber,
      email: email || null,
      passwordHash,
      ownerName,
      address: address || "",
      status: "pending",
      totalProducts: 0,
      totalOrders: 0,
      createdAt: now
    });
    await db2.collection("adminNotifications").add({
      type: "new_vendor",
      title: "\u0645\u062A\u062C\u0631 \u062C\u062F\u064A\u062F \u064A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629",
      message: `${storeName} (${ownerName}) \u0637\u0644\u0628 \u0627\u0646\u0636\u0645\u0627\u0645 \u0643\u0634\u0631\u064A\u0643`,
      vendorId: id,
      status: "unread",
      createdAt: now
    });
    const token = makeVendorToken(id);
    res.status(201).json({
      success: true,
      message: "\u062A\u0645 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0628\u0646\u062C\u0627\u062D! \u0633\u064A\u062A\u0645 \u0645\u0631\u0627\u062C\u0639\u0629 \u0637\u0644\u0628\u0643 \u062E\u0644\u0627\u0644 24 \u0633\u0627\u0639\u0629.",
      token,
      vendor: {
        id,
        storeName,
        businessType,
        phoneNumber,
        ownerName,
        address: address || "",
        status: "pending",
        totalProducts: 0,
        createdAt: now
      }
    });
  } catch (err) {
    console.error("vendor register:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.post("/api/vendor/login", async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password) {
      return res.status(400).json({ error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0645\u0637\u0644\u0648\u0628\u0627\u0646" });
    }
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const snap = await db2.collection("vendors").where("phoneNumber", "==", phoneNumber).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
    const doc = snap.docs[0];
    const vendor = doc.data();
    if (vendor.status === "pending") {
      return res.status(403).json({ error: "\u062D\u0633\u0627\u0628\u0643 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629. \u0633\u064A\u062A\u0645 \u0625\u062E\u0628\u0627\u0631\u0643 \u0639\u0646\u062F \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629." });
    }
    if (vendor.status === "suspended") {
      return res.status(403).json({ error: "\u062D\u0633\u0627\u0628\u0643 \u0645\u0639\u0644\u0642. \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629." });
    }
    if (vendor.status === "rejected") {
      return res.status(403).json({ error: "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628\u0643. \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629." });
    }
    const valid = await bcrypt.compare(password, vendor.passwordHash);
    if (!valid) return res.status(401).json({ error: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
    const token = makeVendorToken(vendor.id);
    res.cookie(VENDOR_COOKIE, token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1e3,
      sameSite: "lax"
    }).json({
      success: true,
      vendor: {
        id: vendor.id,
        storeName: vendor.storeName,
        businessType: vendor.businessType,
        status: vendor.status
      }
    });
  } catch (err) {
    console.error("vendor login:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.get("/api/vendor/logout", (_req, res) => {
  res.clearCookie(VENDOR_COOKIE).redirect("/vendor/login");
});
router.get("/api/vendor/profile", requireVendor, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const doc = await db2.collection("vendors").doc(req.vendorId).get();
    if (!doc.exists) return res.status(404).json({ error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    const v = doc.data();
    const { passwordHash: _pw, ...safe } = v;
    res.json(safe);
  } catch (err) {
    console.error("vendor profile:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.post(
  "/api/vendor/products",
  requireVendor,
  upload2.single("image"),
  async (req, res) => {
    let tempPath = req.file?.path || null;
    try {
      const { name, description, price, category, stock, unit } = req.body;
      const vid = req.vendorId;
      if (!name || !price || !category || !req.file) {
        await cleanTemp(tempPath);
        return res.status(400).json({ error: "\u0627\u0644\u0627\u0633\u0645\u060C \u0627\u0644\u0633\u0639\u0631\u060C \u0627\u0644\u0641\u0626\u0629\u060C \u0648\u0627\u0644\u0635\u0648\u0631\u0629 \u0645\u0637\u0644\u0648\u0628\u0629" });
      }
      const db2 = getFirestore();
      if (!db2) {
        await cleanTemp(tempPath);
        return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
      }
      const vDoc = await db2.collection("vendors").doc(vid).get();
      if (!vDoc.exists || vDoc.data().status !== "active") {
        await cleanTemp(tempPath);
        return res.status(403).json({ error: "\u062D\u0633\u0627\u0628\u0643 \u063A\u064A\u0631 \u0645\u0641\u0639\u0644 \u0628\u0639\u062F" });
      }
      const imageHash = await generateImageHash(tempPath);
      let imageUrl = await findDuplicateImage(imageHash);
      let isDuplicate = !!imageUrl;
      if (!imageUrl) {
        imageUrl = await processAndSaveImage(tempPath, imageHash);
        await saveImageHash(imageHash, imageUrl);
        console.log(`\u2705 \u0635\u0648\u0631\u0629 \u062C\u062F\u064A\u062F\u0629 \u0645\u0639\u0627\u0644\u062C\u0629 \u0648\u0645\u062D\u0641\u0648\u0638\u0629: ${imageUrl}`);
      } else {
        console.log(`\u267B\uFE0F \u0635\u0648\u0631\u0629 \u0645\u0643\u0631\u0631\u0629 \u2014 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0648\u062C\u0648\u062F: ${imageUrl}`);
      }
      await cleanTemp(tempPath);
      tempPath = null;
      const pid = productId();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const vData = vDoc.data();
      await db2.collection("vendorProducts").doc(pid).set({
        id: pid,
        vendorId: vid,
        vendorName: vData.storeName,
        storeName: vData.storeName,
        vendorPhone: vData.phoneNumber,
        name,
        description: description || "",
        price: parseFloat(price),
        category,
        stock: parseInt(stock) || 0,
        unit: unit || "\u0642\u0637\u0639\u0629",
        imageUrl,
        imageHash,
        isDuplicateImage: isDuplicate,
        status: "pending",
        createdAt: now,
        updatedAt: now
      });
      await db2.collection("adminNotifications").add({
        type: "new_product",
        title: "\u0645\u0646\u062A\u062C \u062C\u062F\u064A\u062F \u064A\u062D\u062A\u0627\u062C \u0645\u0631\u0627\u062C\u0639\u0629",
        message: `${vDoc.data().storeName} \u0623\u0636\u0627\u0641 \u0645\u0646\u062A\u062C: ${name}`,
        vendorId: vid,
        productId: pid,
        status: "unread",
        createdAt: now
      });
      res.status(201).json({
        success: true,
        message: "\u062A\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0646\u062A\u062C! \u0633\u064A\u0638\u0647\u0631 \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0628\u0639\u062F \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.",
        product: { id: pid, name, price: parseFloat(price), imageUrl, status: "pending" }
      });
    } catch (err) {
      await cleanTemp(tempPath);
      console.error("add product:", err);
      res.status(500).json({ error: err.message || "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0646\u062A\u062C" });
    }
  }
);
router.get("/api/vendor/products", requireVendor, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const vid = req.vendorId;
    const { status } = req.query;
    let query = db2.collection("vendorProducts").where("vendorId", "==", vid);
    if (status) query = query.where("status", "==", status);
    const snap = await query.orderBy("createdAt", "desc").get();
    const products2 = snap.docs.map((d) => d.data());
    res.json({ products: products2, total: products2.length });
  } catch (err) {
    console.error("get products:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.put("/api/vendor/products/:pid", requireVendor, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const vid = req.vendorId;
    const { pid } = req.params;
    const doc = await db2.collection("vendorProducts").doc(pid).get();
    if (!doc.exists || doc.data().vendorId !== vid) {
      return res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    }
    const { name, description, price, stock, unit } = req.body;
    await db2.collection("vendorProducts").doc(pid).update({
      ...name && { name },
      ...description !== void 0 && { description },
      ...price && { price: parseFloat(price) },
      ...stock !== void 0 && { stock: parseInt(stock) },
      ...unit && { unit },
      status: "pending",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0645\u0646\u062A\u062C \u0648\u0623\u064F\u0639\u064A\u062F \u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629" });
  } catch (err) {
    console.error("update product:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.delete("/api/vendor/products/:pid", requireVendor, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const vid = req.vendorId;
    const { pid } = req.params;
    const doc = await db2.collection("vendorProducts").doc(pid).get();
    if (!doc.exists || doc.data().vendorId !== vid) {
      return res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    }
    await db2.collection("vendorProducts").doc(pid).update({
      status: "deleted",
      deletedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    res.json({ success: true, message: "\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0646\u062A\u062C" });
  } catch (err) {
    console.error("delete product:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.get("/api/vendor/notifications", requireVendor, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const vid = req.vendorId;
    const snap = await db2.collection("vendorNotifications").where("vendorId", "==", vid).orderBy("createdAt", "desc").limit(50).get();
    res.json({ notifications: snap.docs.map((d) => d.data()) });
  } catch (err) {
    console.error("notifications:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
function isAdminSession(req) {
  const cookies = req.cookies || parseCookies(req);
  return !!cookies["onway_admin_session"];
}
function requireAdmin(req, res, next) {
  if (!isAdminSession(req)) return res.status(401).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
  next();
}
router.get("/api/admin/vendor-partners", requireAdmin, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const { status } = req.query;
    let q = db2.collection("vendors");
    if (status) q = q.where("status", "==", status);
    const snap = await q.orderBy("createdAt", "desc").get();
    const vendors = snap.docs.map((d) => {
      const { passwordHash: _pw, ...safe } = d.data();
      return safe;
    });
    res.json({ vendors, total: vendors.length });
  } catch (err) {
    console.error("admin vendor-partners:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.put("/api/admin/vendor-partners/:id/status", requireAdmin, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const { id } = req.params;
    const { status, reason } = req.body;
    if (!["active", "rejected", "suspended"].includes(status)) {
      return res.status(400).json({ error: "\u062D\u0627\u0644\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629" });
    }
    const doc = await db2.collection("vendors").doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: "\u0627\u0644\u0645\u062A\u062C\u0631 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    const vendor = doc.data();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await db2.collection("vendors").doc(id).update({
      status,
      ...status === "active" && { approvedAt: now },
      ...status === "rejected" && { rejectedAt: now, rejectionReason: reason || "" },
      updatedAt: now
    });
    const notifMsg = status === "active" ? `\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0645\u062A\u062C\u0631\u0643 "${vendor.storeName}" \u2014 \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u0622\u0646 \u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062A\u062C\u0627\u062A\u0643` : status === "rejected" ? `\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0645\u062A\u062C\u0631\u0643 "${vendor.storeName}". \u0627\u0644\u0633\u0628\u0628: ${reason || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}` : `\u062A\u0645 \u062A\u0639\u0644\u064A\u0642 \u0645\u062A\u062C\u0631\u0643 "${vendor.storeName}". \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.`;
    await db2.collection("vendorNotifications").add({
      vendorId: id,
      type: `vendor_${status}`,
      title: status === "active" ? "\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0645\u062A\u062C\u0631\u0643" : status === "rejected" ? "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628\u0643" : "\u062A\u0645 \u062A\u0639\u0644\u064A\u0642 \u062D\u0633\u0627\u0628\u0643",
      message: notifMsg,
      status: "unread",
      createdAt: now
    });
    res.json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0645\u062A\u062C\u0631" });
  } catch (err) {
    console.error("update vendor status:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.get("/api/admin/vendor-products", requireAdmin, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const { status } = req.query;
    let query = db2.collection("vendorProducts").orderBy("createdAt", "desc");
    if (status && status !== "all") {
      query = db2.collection("vendorProducts").where("status", "==", status).orderBy("createdAt", "desc");
    }
    const snap = await query.get();
    const products2 = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ products: products2, total: snap.size });
  } catch (err) {
    console.error("admin vendor-products:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.post("/api/admin/vendor-products/:pid/approve", requireAdmin, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const { pid } = req.params;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const doc = await db2.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    const product = doc.data();
    await db2.collection("vendorProducts").doc(pid).update({
      status: "approved",
      approvedAt: now
    });
    await db2.collection("vendors").doc(product.vendorId).update({
      totalProducts: (product.totalProducts || 0) + 1
    }).catch(() => {
    });
    await db2.collection("vendorNotifications").add({
      vendorId: product.vendorId,
      type: "product_approved",
      title: "\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0645\u0646\u062A\u062C\u0643",
      message: `\u0645\u0646\u062A\u062C "${product.name}" \u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u064A\u0647 \u0648\u0647\u0648 \u0645\u062A\u0627\u062D \u0644\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0622\u0646`,
      status: "unread",
      createdAt: now
    });
    res.json({ success: true, message: "\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0646\u062A\u062C" });
  } catch (err) {
    console.error("approve product:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.post("/api/admin/vendor-products/:pid/reject", requireAdmin, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const { pid } = req.params;
    const { reason } = req.body;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const doc = await db2.collection("vendorProducts").doc(pid).get();
    if (!doc.exists) return res.status(404).json({ error: "\u0627\u0644\u0645\u0646\u062A\u062C \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F" });
    const product = doc.data();
    await db2.collection("vendorProducts").doc(pid).update({
      status: "rejected",
      rejectedAt: now,
      rejectionReason: reason || ""
    });
    await db2.collection("vendorNotifications").add({
      vendorId: product.vendorId,
      type: "product_rejected",
      title: "\u062A\u0645 \u0631\u0641\u0636 \u0645\u0646\u062A\u062C\u0643",
      message: `\u0645\u0646\u062A\u062C "${product.name}" \u062A\u0645 \u0631\u0641\u0636\u0647. \u0627\u0644\u0633\u0628\u0628: ${reason || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F"}`,
      status: "unread",
      createdAt: now
    });
    res.json({ success: true, message: "\u062A\u0645 \u0631\u0641\u0636 \u0627\u0644\u0645\u0646\u062A\u062C" });
  } catch (err) {
    console.error("reject product:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
router.get("/api/admin/vendor-stats", requireAdmin, async (req, res) => {
  try {
    const db2 = getFirestore();
    if (!db2) return res.status(500).json({ error: "\u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629" });
    const [pendingVendors, activeVendors, pendingProducts, approvedProducts] = await Promise.all([
      db2.collection("vendors").where("status", "==", "pending").count().get(),
      db2.collection("vendors").where("status", "==", "active").count().get(),
      db2.collection("vendorProducts").where("status", "==", "pending").count().get(),
      db2.collection("vendorProducts").where("status", "==", "approved").count().get()
    ]);
    res.json({
      pendingVendors: pendingVendors.data().count,
      activeVendors: activeVendors.data().count,
      pendingProducts: pendingProducts.data().count,
      approvedProducts: approvedProducts.data().count
    });
  } catch (err) {
    console.error("vendor stats:", err);
    res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645" });
  }
});
var vendor_default = router;

// server/index.ts
import * as fs3 from "fs";
import * as path3 from "path";
import * as crypto2 from "crypto";
initializeFirebase();
function hashPassword(pass) {
  return crypto2.createHash("sha256").update(`onway::${pass}`).digest("hex");
}
async function getCustomCredentials() {
  try {
    const db2 = getFirestore();
    if (!db2) return null;
    const doc = await db2.collection("adminConfig").doc("credentials").get();
    if (!doc.exists) return null;
    const data = doc.data();
    return data?.username && data?.passwordHash ? data : null;
  } catch {
    return null;
  }
}
async function setCustomCredentials(username, password) {
  const db2 = getFirestore();
  if (!db2) throw new Error("Database not configured");
  await db2.collection("adminConfig").doc("credentials").set({
    username,
    passwordHash: hashPassword(password),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function validateAdminCredentials(username, password) {
  const custom = await getCustomCredentials();
  if (custom) {
    if (username === custom.username && hashPassword(password) === custom.passwordHash) return true;
  }
  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;
  return username === validUser && password === validPass;
}
var app = express3();
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
    express3.json({
      limit: "100mb"
    })
  );
  app2.use(express3.urlencoded({ extended: false, limit: "100mb" }));
}
function setupRequestLogging(app2) {
  app2.use((req, res, next) => {
    const start = Date.now();
    const path4 = req.path;
    let capturedJsonResponse = void 0;
    const originalResJson = res.json;
    res.json = function(bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
    res.on("finish", () => {
      if (!path4.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
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
    const appJsonPath = path3.resolve(process.cwd(), "app.json");
    const appJsonContent = fs3.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
function serveExpoManifest(platform, res) {
  const manifestPath = path3.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json"
  );
  if (!fs3.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const manifest = fs3.readFileSync(manifestPath, "utf-8");
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
var ADMIN_COOKIE = "onway_admin_session";
function makeToken() {
  const secret = `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`;
  return crypto2.createHmac("sha256", secret).update("onway_admin").digest("hex");
}
function isValidSession(req) {
  const raw = req.cookies?.[ADMIN_COOKIE];
  if (!raw) return false;
  return raw === makeToken();
}
function parseCookies2(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  req.cookies = cookies;
}
function configureExpoAndLanding(app2) {
  const templatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs3.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  const adminTemplatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin.html"
  );
  const loginTemplatePath = path3.resolve(
    process.cwd(),
    "server",
    "templates",
    "login.html"
  );
  log("Serving static Expo files with dynamic manifest routing");
  app2.use((req, _res, next) => {
    parseCookies2(req);
    next();
  });
  function renderLogin(errorPlaceholder, googleBtnPlaceholder) {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const template = fs3.readFileSync(loginTemplatePath, "utf-8");
    return template.replace("ERROR_PLACEHOLDER", errorPlaceholder).replace("GOOGLE_BTN_PLACEHOLDER", googleBtnPlaceholder);
  }
  function buildGoogleBtn(clientId) {
    if (!clientId) return "";
    return `
      <div id="google-signin-div" style="display:flex;justify-content:center;"></div>
      <script>
        window.addEventListener('load', function() {
          if (typeof google === 'undefined') return;
          google.accounts.id.initialize({
            client_id: '${clientId}',
            callback: handleGoogleCredential,
            ux_mode: 'popup',
          });
          google.accounts.id.renderButton(
            document.getElementById('google-signin-div'),
            {
              theme: 'outline',
              size: 'large',
              width: 320,
              text: 'signin_with',
              locale: 'ar',
              shape: 'rectangular',
            }
          );
        });
      </script>
    `;
  }
  app2.get("/admin/login", (req, res) => {
    if (isValidSession(req)) return res.redirect("/admin");
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const html = renderLogin("", buildGoogleBtn(clientId));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });
  app2.post("/admin/login", express3.urlencoded({ extended: false }), async (req, res) => {
    const { username, password } = req.body || {};
    const valid = await validateAdminCredentials(username, password);
    if (valid) {
      const token = makeToken();
      const maxAge = 60 * 60 * 24 * 7;
      res.setHeader(
        "Set-Cookie",
        `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`
      );
      return res.redirect("/admin");
    }
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const html = renderLogin(`<div class="error">\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629</div>`, buildGoogleBtn(clientId));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(401).send(html);
  });
  app2.post("/admin/google-signin", express3.json(), async (req, res) => {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: "\u0628\u064A\u0627\u0646\u0627\u062A \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629" });
    try {
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!verifyRes.ok) return res.status(401).json({ error: "\u0641\u0634\u0644 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062D\u0633\u0627\u0628 Google" });
      const payload = await verifyRes.json();
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (expectedClientId && payload.aud !== expectedClientId) {
        return res.status(401).json({ error: "\u062A\u0648\u0643\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
      }
      if (payload.email_verified !== "true") {
        return res.status(401).json({ error: "\u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A \u0645\u0648\u062B\u0642\u0627\u064B" });
      }
      const allowedEmail = process.env.ADMIN_GOOGLE_EMAIL || "";
      if (!allowedEmail || payload.email?.toLowerCase() !== allowedEmail.toLowerCase()) {
        return res.status(403).json({ error: `\u0647\u0630\u0627 \u0627\u0644\u062D\u0633\u0627\u0628 (${payload.email}) \u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0647 \u0628\u0627\u0644\u062F\u062E\u0648\u0644` });
      }
      const token = makeToken();
      const maxAge = 60 * 60 * 24 * 7;
      res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`);
      return res.json({ success: true, redirect: "/admin" });
    } catch (e) {
      console.error("[Google signin error]", e);
      return res.status(500).json({ error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u062F\u0627\u062E\u0644\u064A. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649." });
    }
  });
  app2.post("/admin/reset-password", express3.urlencoded({ extended: false }), async (req, res) => {
    const { recoveryCode, newUsername, newPassword, confirmPassword } = req.body || {};
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const send = (status, msg, isSuccess = false) => {
      const cls = isSuccess ? "success" : "error";
      const html = renderLogin(`<div class="${cls}">${msg}</div>`, buildGoogleBtn(clientId));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(status).send(html);
    };
    if (recoveryCode !== process.env.ADMIN_PASSWORD) {
      return send(401, "\u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u0631\u062F\u0627\u062F \u063A\u064A\u0631 \u0635\u062D\u064A\u062D");
    }
    if (!newUsername || newUsername.length < 3) return send(400, "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 3 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
    if (!newPassword || newPassword.length < 6) return send(400, "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644");
    if (newPassword !== confirmPassword) return send(400, "\u0643\u0644\u0645\u062A\u0627 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u062A\u064A\u0646");
    try {
      await setCustomCredentials(newUsername, newPassword);
      return send(200, "\u062A\u0645 \u062A\u063A\u064A\u064A\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0628\u0646\u062C\u0627\u062D. \u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0622\u0646.", true);
    } catch {
      return send(500, "\u0641\u0634\u0644 \u0641\u064A \u062D\u0641\u0638 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.");
    }
  });
  app2.post("/api/admin/change-credentials", express3.json(), async (req, res) => {
    if (!isValidSession(req)) return res.status(401).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
    const { currentPassword, newUsername, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword) return res.status(400).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u0645\u0637\u0644\u0648\u0628\u0629" });
    const custom = await getCustomCredentials();
    const currentUsername = custom ? custom.username : process.env.ADMIN_USERNAME || "admin";
    const valid = await validateAdminCredentials(currentUsername, currentPassword);
    if (!valid) return res.status(401).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
    if (!newUsername || newUsername.length < 3) return res.status(400).json({ error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 3 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 6 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644" });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: "\u0643\u0644\u0645\u062A\u0627 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u062A\u064A\u0646" });
    try {
      await setCustomCredentials(newUsername, newPassword);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "\u0641\u0634\u0644 \u0641\u064A \u0627\u0644\u062D\u0641\u0638. \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649." });
    }
  });
  app2.get("/api/admin/credentials-info", async (req, res) => {
    if (!isValidSession(req)) return res.status(401).json({ error: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D" });
    const custom = await getCustomCredentials();
    res.json({
      username: custom ? custom.username : process.env.ADMIN_USERNAME || "admin",
      isCustom: !!custom,
      updatedAt: custom?.updatedAt || null
    });
  });
  app2.get("/admin/logout", (_req, res) => {
    res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; HttpOnly; Max-Age=0; Path=/`);
    res.redirect("/admin/login");
  });
  app2.get("/admin", (req, res) => {
    if (!isValidSession(req)) return res.redirect("/admin/login");
    const adminTemplate = fs3.readFileSync(adminTemplatePath, "utf-8");
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
  app2.use("/uploads", express3.static(path3.resolve(process.cwd(), "uploads"), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (staticRes) => {
      staticRes.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      staticRes.setHeader("Pragma", "no-cache");
      staticRes.setHeader("Expires", "0");
    }
  }));
  app2.use("/assets", express3.static(path3.resolve(process.cwd(), "assets"), {
    maxAge: "7d",
    etag: true
  }));
  app2.use(express3.static(path3.resolve(process.cwd(), "server", "public"), {
    maxAge: "1d",
    etag: true
  }));
  app2.use(express3.static(path3.resolve(process.cwd(), "static-build"), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (staticRes) => {
      staticRes.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      staticRes.setHeader("Pragma", "no-cache");
      staticRes.setHeader("Expires", "0");
    }
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
  app.use(vendor_default);
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
