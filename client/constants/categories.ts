import { Feather } from "@expo/vector-icons";

export interface Category {
  id: string;
  name: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  productCount: number;
}

export const CATEGORIES: Category[] = [
  {
    id: "groceries",
    name: "مواد غذائية",
    icon: "shopping-bag",
    color: "#FF8C42",
    productCount: 45,
  },
  {
    id: "supermarket",
    name: "سوبر ماركت",
    icon: "shopping-cart",
    color: "#4CAF50",
    productCount: 120,
  },
  {
    id: "pharmacy",
    name: "صيدلية",
    icon: "activity",
    color: "#2196F3",
    productCount: 80,
  },
  {
    id: "electronics",
    name: "إلكترونيات",
    icon: "smartphone",
    color: "#9C27B0",
    productCount: 65,
  },
  {
    id: "clothing",
    name: "ملابس",
    icon: "tag",
    color: "#E91E63",
    productCount: 95,
  },
  {
    id: "services",
    name: "خدمات",
    icon: "tool",
    color: "#607D8B",
    productCount: 30,
  },
];

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image: string;
  description: string;
  inStock: boolean;
}

export const PRODUCTS: Product[] = [
  // مواد غذائية
  {
    id: "p1",
    categoryId: "groceries",
    name: "أرز بسمتي",
    price: 25.0,
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300",
    description: "أرز بسمتي عالي الجودة 5 كيلو",
    inStock: true,
  },
  {
    id: "p2",
    categoryId: "groceries",
    name: "زيت زيتون",
    price: 45.0,
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300",
    description: "زيت زيتون بكر ممتاز 1 لتر",
    inStock: true,
  },
  {
    id: "p3",
    categoryId: "groceries",
    name: "عسل طبيعي",
    price: 60.0,
    image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300",
    description: "عسل طبيعي صافي 500 جرام",
    inStock: true,
  },
  // سوبر ماركت
  {
    id: "p4",
    categoryId: "supermarket",
    name: "حليب طازج",
    price: 8.0,
    image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300",
    description: "حليب طازج كامل الدسم 1 لتر",
    inStock: true,
  },
  {
    id: "p5",
    categoryId: "supermarket",
    name: "خبز عربي",
    price: 3.0,
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300",
    description: "خبز عربي طازج 6 قطع",
    inStock: true,
  },
  {
    id: "p6",
    categoryId: "supermarket",
    name: "جبنة بيضاء",
    price: 15.0,
    image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300",
    description: "جبنة بيضاء طازجة 400 جرام",
    inStock: true,
  },
  // صيدلية
  {
    id: "p7",
    categoryId: "pharmacy",
    name: "فيتامين سي",
    price: 35.0,
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300",
    description: "فيتامين سي 1000 ملغ 30 قرص",
    inStock: true,
  },
  {
    id: "p8",
    categoryId: "pharmacy",
    name: "مسكن للألم",
    price: 12.0,
    image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300",
    description: "مسكن للألم سريع المفعول 20 قرص",
    inStock: true,
  },
  // إلكترونيات
  {
    id: "p9",
    categoryId: "electronics",
    name: "سماعات لاسلكية",
    price: 150.0,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300",
    description: "سماعات بلوتوث عالية الجودة",
    inStock: true,
  },
  {
    id: "p10",
    categoryId: "electronics",
    name: "شاحن سريع",
    price: 45.0,
    image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300",
    description: "شاحن سريع 20 واط",
    inStock: true,
  },
  // ملابس
  {
    id: "p11",
    categoryId: "clothing",
    name: "قميص رجالي",
    price: 85.0,
    image: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=300",
    description: "قميص قطني عالي الجودة",
    inStock: true,
  },
  {
    id: "p12",
    categoryId: "clothing",
    name: "فستان نسائي",
    price: 120.0,
    image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300",
    description: "فستان أنيق للمناسبات",
    inStock: true,
  },
  // خدمات
  {
    id: "p13",
    categoryId: "services",
    name: "تنظيف منزلي",
    price: 100.0,
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=300",
    description: "خدمة تنظيف منزلي شاملة",
    inStock: true,
  },
  {
    id: "p14",
    categoryId: "services",
    name: "صيانة أجهزة",
    price: 50.0,
    image: "https://images.unsplash.com/photo-1581092921461-eab62e97a2aa?w=300",
    description: "صيانة وإصلاح الأجهزة الإلكترونية",
    inStock: true,
  },
];
