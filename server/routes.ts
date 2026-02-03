import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import multer, { StorageEngine, FileFilterCallback } from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

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

let deliveryAreas: DeliveryArea[] = [
  { id: "daloaiya", name: "الضلوعية المركز", fee: 3000, isActive: true },
  { id: "hawija", name: "الحويجة البحرية", fee: 3500, isActive: true },
  { id: "jbour", name: "منطقة الجبور", fee: 3000, isActive: true },
  { id: "bishikan", name: "بيشيكان", fee: 3500, isActive: true },
];

let categories: Category[] = [
  { id: "fruits-vegetables", name: "خضروات وفواكه", image: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=300", productCount: 120, order: 1 },
  { id: "meat-poultry", name: "لحوم ودواجن", image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300", productCount: 55, order: 2 },
  { id: "bakery", name: "مخبوزات", image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300", productCount: 30, order: 3 },
  { id: "dairy-eggs", name: "ألبان وبيض", image: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=300", productCount: 70, order: 4 },
  { id: "groceries", name: "مواد غذائية", image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=300", productCount: 150, order: 5 },
  { id: "beverages", name: "مشروبات", image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300", productCount: 90, order: 6 },
  { id: "snacks-sweets", name: "حلويات ووجبات خفيفة", image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=300", productCount: 110, order: 7 },
  { id: "cleaning-care", name: "منظفات وعناية", image: "https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300", productCount: 95, order: 8 },
  { id: "baby", name: "مستلزمات الأطفال", image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300", productCount: 60, order: 9 },
  { id: "electronics-services", name: "إلكترونيات وخدمات", image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=300", productCount: 75, order: 10 },
  { id: "mail-courier", name: "استلام البريد من المندوب", image: "https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=300", productCount: 0, order: 11 },
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
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  }, require("express").static(uploadsDir));

  app.get("/api/categories", (req, res) => {
    const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
    res.json(sortedCategories);
  });

  app.get("/api/categories/:id", (req, res) => {
    const category = categories.find(c => c.id === req.params.id);
    if (category) {
      res.json(category);
    } else {
      res.status(404).json({ error: "Category not found" });
    }
  });

  app.post("/api/admin/categories", upload.single("image"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    const { name, productCount, order } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl;
    
    const newCategory: Category = {
      id: randomUUID(),
      name,
      image,
      productCount: parseInt(productCount) || 0,
      order: parseInt(order) || categories.length + 1,
    };
    
    categories.push(newCategory);
    res.json(newCategory);
  });

  app.put("/api/admin/categories/:id", upload.single("image"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    const index = categories.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Category not found" });
    }
    
    const { name, productCount, order } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || categories[index].image);
    
    categories[index] = {
      ...categories[index],
      name: name || categories[index].name,
      image,
      productCount: productCount ? parseInt(productCount) : categories[index].productCount,
      order: order ? parseInt(order) : categories[index].order,
    };
    
    res.json(categories[index]);
  });

  app.delete("/api/admin/categories/:id", (req, res) => {
    const index = categories.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Category not found" });
    }
    categories.splice(index, 1);
    res.json({ success: true });
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

  app.post("/api/admin/banners", upload.single("image"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    const { title, type, order, isActive } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl;
    
    const newBanner: Banner = {
      id: randomUUID(),
      image,
      title,
      type: type || "slider",
      order: parseInt(order) || banners.length + 1,
      isActive: isActive !== "false",
    };
    
    banners.push(newBanner);
    res.json(newBanner);
  });

  app.put("/api/admin/banners/:id", upload.single("image"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    const index = banners.findIndex(b => b.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Banner not found" });
    }
    
    const { title, type, order, isActive } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || banners[index].image);
    
    banners[index] = {
      ...banners[index],
      image,
      title: title !== undefined ? title : banners[index].title,
      type: type || banners[index].type,
      order: order ? parseInt(order) : banners[index].order,
      isActive: isActive !== undefined ? isActive !== "false" : banners[index].isActive,
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

  app.get("/api/products", (req, res) => {
    const categoryId = req.query.categoryId as string;
    const search = req.query.search as string;
    
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

  app.get("/api/admin/products", (req, res) => {
    res.json(products);
  });

  app.post("/api/admin/products", upload.single("image"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    const { name, categoryId, price, originalPrice, discount, description, inStock } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl;
    
    const newProduct: Product = {
      id: randomUUID(),
      name,
      categoryId,
      price: parseInt(price) || 0,
      originalPrice: originalPrice ? parseInt(originalPrice) : undefined,
      discount: discount ? parseInt(discount) : undefined,
      image,
      description: description || "",
      inStock: inStock !== "false",
    };
    
    products.push(newProduct);
    res.json(newProduct);
  });

  app.put("/api/admin/products/:id", upload.single("image"), (req: Request & { file?: Express.Multer.File }, res: Response) => {
    const index = products.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    const { name, categoryId, price, originalPrice, discount, description, inStock } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || products[index].image);
    
    products[index] = {
      ...products[index],
      name: name || products[index].name,
      categoryId: categoryId || products[index].categoryId,
      price: price ? parseInt(price) : products[index].price,
      originalPrice: originalPrice ? parseInt(originalPrice) : products[index].originalPrice,
      discount: discount ? parseInt(discount) : products[index].discount,
      image,
      description: description !== undefined ? description : products[index].description,
      inStock: inStock !== undefined ? inStock !== "false" : products[index].inStock,
    };
    
    res.json(products[index]);
  });

  app.delete("/api/admin/products/:id", (req, res) => {
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

  const httpServer = createServer(app);
  return httpServer;
}
