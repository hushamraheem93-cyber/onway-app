import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import multer, { StorageEngine, FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { 
  getFirestore, getUserByPhone, createUser, updateUser, FirestoreUserProfile,
  getProducts as getFirestoreProducts, createProduct as createFirestoreProduct, 
  updateProduct as updateFirestoreProduct, deleteProduct as deleteFirestoreProduct,
  getOrders, getOrdersByPhone, createOrder, updateOrderStatus,
  updateUserPushToken, getUserPushToken,
  getPromotionalSections, getPromotionalSection, savePromotionalSection,
  getCategories as getFirestoreCategories, createCategory as createFirestoreCategory,
  updateCategory as updateFirestoreCategory, deleteCategory as deleteFirestoreCategory,
  initializeDefaultCategories,
  generateOtp, verifyOtp as verifyOtpCode,
  getDrivers, getDriverByPhone, createDriver, updateDriverStatus as updateDriverStatusFn
} from "./firebase";
import { sendPushNotification } from "./pushNotifications";

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
}

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
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
  { id: "fruits-vegetables", name: "الخضروات والفواكه", image: "/uploads/category-vegetables.png", productCount: 50, order: 1, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "اللحوم والطازج", image: "/uploads/category-meat.png", productCount: 55, order: 2, color: "#FFEBEE", iconColor: "#EF5350" },
  { id: "dairy-eggs", name: "الألبان والأجبان", image: "/uploads/category-dairy.png", productCount: 70, order: 3, color: "#F3E5F5", iconColor: "#AB47BC" },
  { id: "cleaning-care", name: "المنظفات", image: "/uploads/category-cleaning.png", productCount: 95, order: 4, color: "#E3F2FD", iconColor: "#42A5F5" },
  { id: "beverages", name: "المشروبات", image: "/uploads/category-beverages.png", productCount: 90, order: 5, color: "#E0F7FA", iconColor: "#26C6DA" },
  { id: "snacks-sweets", name: "سناكس ومقرمشات", image: "/uploads/category-snacks.png", productCount: 110, order: 6, color: "#FFF3E0", iconColor: "#FFA726" },
  { id: "juices", name: "مشروبات وعصائر", image: "/uploads/category-juices.png", productCount: 45, order: 7, color: "#F1F8E9", iconColor: "#9CCC65" },
  { id: "tea-coffee", name: "شاي وقهوة", image: "/uploads/category-coffee.png", productCount: 35, order: 8, color: "#EFEBE9", iconColor: "#8D6E63" },
  { id: "baby", name: "مستلزمات أطفال", image: "/uploads/category-baby.png", productCount: 60, order: 9, color: "#FCE4EC", iconColor: "#EC407A" },
  { id: "flowers", name: "هدايا وورود", image: "/uploads/category-flowers.png", productCount: 25, order: 10, color: "#FDF2F2", iconColor: "#EF5350" },
  { id: "delivery", name: "خدمات المندوب", image: "/uploads/category-delivery.png", productCount: 0, order: 11, color: "#FFF9C4", iconColor: "#FBC02D" },
];

let banners: Banner[] = [
  { id: "slider-1", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800", title: "خضروات وفواكه طازجة", isActive: true, type: "slider", order: 1 },
  { id: "slider-2", image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800", title: "كل ما تحتاجه للمطبخ", isActive: true, type: "slider", order: 2 },
  { id: "slider-3", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800", title: "وجبات جاهزة للأكل", isActive: true, type: "slider", order: 3 },
];

const products: Product[] = [
  { id: "p1", categoryId: "groceries", name: "أرز بسمتي", price: 35000, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300", description: "أرز بسمتي عالي الجودة 5 كيلو", inStock: true },
  { id: "p2", categoryId: "groceries", name: "زيت زيتون", price: 65000, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300", description: "زيت زيتون بكر ممتاز 1 لتر", inStock: true },
  { id: "p3", categoryId: "groceries", name: "عسل طبيعي", price: 85000, image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300", description: "عسل طبيعي صافي 500 جرام", inStock: true },
  { id: "p4", categoryId: "dairy-eggs", name: "حليب طازج", price: 12000, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300", description: "حليب طازج كامل الدسم 1 لتر", inStock: true },
  { id: "p5", categoryId: "bakery", name: "خبز عربي", price: 5000, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300", description: "خبز عربي طازج 6 قطع", inStock: true },
  { id: "p6", categoryId: "dairy-eggs", name: "جبنة بيضاء", price: 22000, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300", description: "جبنة بيضاء طازجة 400 جرام", inStock: true },
  { id: "p7", categoryId: "cleaning-care", name: "صابون غسيل", price: 15000, image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300", description: "صابون غسيل معطر 3 كيلو", inStock: true },
  { id: "p8", categoryId: "fruits-vegetables", name: "تفاح أحمر", price: 15000, image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=300", description: "تفاح أحمر طازج 1 كيلو", inStock: true },
  { id: "p9", categoryId: "fruits-vegetables", name: "طماطم طازجة", price: 8000, image: "https://images.unsplash.com/photo-1546470427-e26264be0b11?w=300", description: "طماطم طازجة 1 كيلو", inStock: true },
  { id: "p10", categoryId: "meat-poultry", name: "دجاج كامل", price: 45000, image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300", description: "دجاج طازج كامل 1.5 كيلو", inStock: true },
  { id: "p11", categoryId: "beverages", name: "عصير برتقال", price: 12000, image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300", description: "عصير برتقال طبيعي 1 لتر", inStock: true },
  { id: "p12", categoryId: "snacks-sweets", name: "شوكولاتة داكنة", price: 18000, image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=300", description: "شوكولاتة داكنة فاخرة 100 جرام", inStock: true },
  { id: "p13", categoryId: "baby", name: "حفاضات أطفال", price: 35000, image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300", description: "حفاضات أطفال مقاس M عبوة 40", inStock: true },
  { id: "p14", categoryId: "electronics-services", name: "شاحن سريع", price: 65000, image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300", description: "شاحن سريع 20 واط", inStock: true },
];

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize default categories in Firestore if empty
  await initializeDefaultCategories(categories);
  
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  }, require("express").static(uploadsDir));

  app.get("/api/categories", async (req, res) => {
    try {
      const db = getFirestore();
      if (db) {
        const firestoreCategories = await getFirestoreCategories();
        if (firestoreCategories.length > 0) {
          return res.json(firestoreCategories);
        }
      }
      // Fallback to in-memory categories
      const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
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

  app.get("/api/banners", (req, res) => {
    const type = req.query.type as string;
    let result = banners.filter(b => b.isActive);
    if (type) {
      result = result.filter(b => b.type === type);
    }
    res.json(result.sort((a, b) => a.order - b.order));
  });

  app.get("/api/admin/banners", (req, res) => {
    res.json(banners.sort((a, b) => a.order - b.order));
  });

  app.post("/api/admin/banners", (req: Request, res: Response) => {
    const { title, type, order, isActive, image } = req.body;
    
    const newBanner: Banner = {
      id: randomUUID(),
      image: image || "",
      title,
      type: type || "slider",
      order: parseInt(order) || banners.length + 1,
      isActive: isActive !== false,
    };
    
    banners.push(newBanner);
    res.json(newBanner);
  });

  app.put("/api/admin/banners/:id", (req: Request, res: Response) => {
    const index = banners.findIndex(b => b.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Banner not found" });
    }
    
    const { title, type, order, isActive, image } = req.body;
    
    banners[index] = {
      ...banners[index],
      image: image || banners[index].image,
      title: title !== undefined ? title : banners[index].title,
      type: type || banners[index].type,
      order: order ? parseInt(order) : banners[index].order,
      isActive: isActive !== undefined ? isActive : banners[index].isActive,
    };
    
    res.json(banners[index]);
  });

  app.delete("/api/admin/banners/:id", (req, res) => {
    const index = banners.findIndex(b => b.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Banner not found" });
    }
    banners.splice(index, 1);
    res.json({ success: true });
  });

  app.get("/api/products", async (req, res) => {
    const categoryId = req.query.categoryId as string;
    const search = req.query.search as string;
    const db = getFirestore();
    
    if (db) {
      let result = await getFirestoreProducts(categoryId);
      if (search) {
        const searchLower = search.toLowerCase();
        result = result.filter(p => 
          p.name.toLowerCase().includes(searchLower) || 
          p.description.toLowerCase().includes(searchLower)
        );
      }
      return res.json(result);
    }
    
    let result = products;
    if (categoryId) {
      result = result.filter(p => p.categoryId === categoryId);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(searchLower) || 
        p.description.toLowerCase().includes(searchLower)
      );
    }
    res.json(result);
  });

  app.get("/api/admin/products", async (req, res) => {
    const db = getFirestore();
    if (db) {
      const result = await getFirestoreProducts();
      return res.json(result);
    }
    res.json(products);
  });

  app.post("/api/admin/products", async (req: Request, res: Response) => {
    try {
      if (!req.body) {
        return res.status(400).json({ error: "Request body is empty" });
      }
      
      const { name, categoryId, price, originalPrice, discount, description, inStock, image } = req.body;
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
        });
        if (newProduct) return res.json(newProduct);
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
    const { name, categoryId, price, originalPrice, discount, description, inStock, image } = req.body;
    const productId = req.params.id as string;
    const db = getFirestore();
    
    const priceNum = price !== undefined ? Number(price) : undefined;
    const originalPriceNum = originalPrice !== undefined ? Number(originalPrice) : undefined;
    const discountNum = discount !== undefined ? Number(discount) : undefined;
    const inStockBool = inStock !== undefined ? (inStock === 'true' || inStock === true) : undefined;
    
    if (db) {
      const updated = await updateFirestoreProduct(productId, {
        name: name !== undefined ? String(name) : undefined,
        categoryId: categoryId !== undefined ? String(categoryId) : undefined,
        price: priceNum,
        originalPrice: originalPriceNum,
        discount: discountNum,
        image: image !== undefined ? String(image) : undefined,
        description: description !== undefined ? String(description) : undefined,
        inStock: inStockBool,
      });
      if (updated) return res.json(updated);
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
    };
    res.json(products[index]);
  });

  app.delete("/api/admin/products/:id", async (req, res) => {
    const db = getFirestore();
    if (db) {
      const success = await deleteFirestoreProduct(req.params.id);
      if (success) return res.json({ success: true });
      return res.status(404).json({ error: "Product not found" });
    }
    
    const index = products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    products.splice(index, 1);
    res.json({ success: true });
  });

  app.get("/api/delivery-areas", (req, res) => {
    res.json(deliveryAreas.filter(a => a.isActive));
  });

  app.get("/api/admin/delivery-areas", (req, res) => {
    res.json(deliveryAreas);
  });

  app.post("/api/admin/delivery-areas", (req: Request, res: Response) => {
    const { name, fee } = req.body;
    
    const newArea: DeliveryArea = {
      id: randomUUID(),
      name,
      fee: parseInt(fee) || 0,
      isActive: true,
    };
    
    deliveryAreas.push(newArea);
    res.json(newArea);
  });

  app.put("/api/admin/delivery-areas/:id", (req: Request, res: Response) => {
    const index = deliveryAreas.findIndex(a => a.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Delivery area not found" });
    }
    
    const { name, fee, isActive } = req.body;
    
    deliveryAreas[index] = {
      ...deliveryAreas[index],
      name: name || deliveryAreas[index].name,
      fee: fee ? parseInt(fee) : deliveryAreas[index].fee,
      isActive: isActive !== undefined ? isActive !== "false" : deliveryAreas[index].isActive,
    };
    
    res.json(deliveryAreas[index]);
  });

  app.delete("/api/admin/delivery-areas/:id", (req, res) => {
    const index = deliveryAreas.findIndex(a => a.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Delivery area not found" });
    }
    deliveryAreas.splice(index, 1);
    res.json({ success: true });
  });

  // Order Routes
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
    const { userId, phoneNumber, items, total, deliveryFee, address, region } = req.body;
    const db = getFirestore();
    
    if (db) {
      const newOrder = await createOrder({
        userId: userId || "",
        phoneNumber,
        items,
        total,
        deliveryFee,
        address,
        region,
        status: "pending",
      });
      if (newOrder) {
        return res.json({
          ...newOrder,
          createdAt: newOrder.createdAt.toDate().toISOString(),
          updatedAt: newOrder.updatedAt.toDate().toISOString(),
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
        return res.json({ success: true, id: orderId, status });
      }
      return res.status(404).json({ error: "Order not found" });
    }
    res.status(500).json({ error: "Database not configured" });
  });

  app.post("/api/users/push-token", async (req: Request, res: Response) => {
    const { phoneNumber, pushToken } = req.body;
    
    if (!phoneNumber || !pushToken) {
      return res.status(400).json({ error: "Phone number and push token are required" });
    }

    const db = getFirestore();
    if (db) {
      const success = await updateUserPushToken(phoneNumber, pushToken);
      if (success) {
        return res.json({ success: true });
      }
      return res.status(404).json({ error: "User not found" });
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
    const isValid = verifyOtpCode(phoneNumber, code);
    if (!isValid) {
      return res.status(400).json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
    }
    res.json({ success: true, message: "OTP verified" });
  });

  // Driver Routes
  app.post("/api/drivers", async (req: Request, res: Response) => {
    try {
      const { phoneNumber, fullName, firstName, secondName, thirdName, fourthName, nationalIdImage, driverLicenseImage } = req.body;

      if (!phoneNumber || !fullName || !nationalIdImage) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const existing = await getDriverByPhone(phoneNumber);
      if (existing) {
        return res.status(400).json({ error: "هذا الرقم مسجل مسبقاً كسائق" });
      }

      const driver = await createDriver({
        phoneNumber,
        fullName,
        firstName: firstName || "",
        secondName: secondName || "",
        thirdName: thirdName || "",
        fourthName: fourthName || "",
        nationalIdImage,
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

  const httpServer = createServer(app);
  return httpServer;
}
