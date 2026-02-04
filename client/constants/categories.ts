export interface Category {
  id: string;
  name: string;
  image: string;
  productCount: number;
  order?: number;
  color?: string;
  iconColor?: string;
}

export interface Banner {
  id: string;
  image: string;
  title?: string;
  isActive: boolean;
  type: "offer" | "slider";
  order: number;
}

export const MAIN_CATEGORIES: Category[] = [
  { id: "fruits-vegetables", name: "الخضروات والفواكه", image: "/uploads/category-vegetables.png", productCount: 50, color: "#E8F5E9", iconColor: "#4CAF50" },
  { id: "meat-poultry", name: "اللحوم والطازج", image: "/uploads/category-meat.png", productCount: 55, color: "#FFEBEE", iconColor: "#EF5350" },
  { id: "dairy-eggs", name: "الألبان والأجبان", image: "/uploads/category-dairy.png", productCount: 70, color: "#F3E5F5", iconColor: "#AB47BC" },
  { id: "cleaning-care", name: "المنظفات", image: "/uploads/category-cleaning.png", productCount: 95, color: "#E3F2FD", iconColor: "#42A5F5" },
  { id: "beverages", name: "المشروبات", image: "/uploads/category-beverages.png", productCount: 90, color: "#E0F7FA", iconColor: "#26C6DA" },
  { id: "snacks-sweets", name: "سناكس ومقرمشات", image: "/uploads/category-snacks.png", productCount: 110, color: "#FFF3E0", iconColor: "#FFA726" },
  { id: "juices", name: "مشروبات وعصائر", image: "/uploads/category-juices.png", productCount: 45, color: "#F1F8E9", iconColor: "#9CCC65" },
  { id: "tea-coffee", name: "شاي وقهوة", image: "/uploads/category-coffee.png", productCount: 35, color: "#EFEBE9", iconColor: "#8D6E63" },
  { id: "baby", name: "مستلزمات أطفال", image: "/uploads/category-baby.png", productCount: 60, color: "#FCE4EC", iconColor: "#EC407A" },
  { id: "flowers", name: "هدايا وورود", image: "/uploads/category-flowers.png", productCount: 25, color: "#FDF2F2", iconColor: "#EF5350" },
  { id: "delivery", name: "خدمات المندوب", image: "/uploads/category-delivery.png", productCount: 0, color: "#FFF9C4", iconColor: "#FBC02D" },
];

export const CATEGORIES = MAIN_CATEGORIES;

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image: string;
  description: string;
  inStock: boolean;
  discount?: number;
}

export const PRODUCTS: Product[] = [
  // خضراوات - Vegetables
  { id: "v1", categoryId: "fruits-vegetables", name: "طماطم طازجة", price: 3000, image: "https://images.unsplash.com/photo-1546470427-e26264be0b11?w=400", description: "طماطم طازجة 1 كيلو", inStock: true },
  { id: "v2", categoryId: "fruits-vegetables", name: "خيار", price: 2500, image: "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400", description: "خيار طازج 1 كيلو", inStock: true },
  { id: "v3", categoryId: "fruits-vegetables", name: "بصل أحمر", price: 2000, image: "https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400", description: "بصل أحمر 1 كيلو", inStock: true },
  { id: "v4", categoryId: "fruits-vegetables", name: "ثوم", price: 4000, image: "https://images.unsplash.com/photo-1540148426945-6cf22a6b2f85?w=400", description: "ثوم طازج 500 جرام", inStock: true },
  { id: "v5", categoryId: "fruits-vegetables", name: "بطاطا", price: 2500, image: "https://images.unsplash.com/photo-1518977676601-b53f82ber8a3?w=400", description: "بطاطا طازجة 1 كيلو", inStock: true },
  { id: "v6", categoryId: "fruits-vegetables", name: "جزر", price: 3000, image: "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400", description: "جزر طازج 1 كيلو", inStock: true },
  { id: "v7", categoryId: "fruits-vegetables", name: "باذنجان", price: 3500, image: "https://images.unsplash.com/photo-1528826007177-f38517ce9a8a?w=400", description: "باذنجان طازج 1 كيلو", inStock: true },
  { id: "v8", categoryId: "fruits-vegetables", name: "فلفل أخضر", price: 4000, image: "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400", description: "فلفل أخضر 1 كيلو", inStock: true },
  { id: "v9", categoryId: "fruits-vegetables", name: "فلفل ألوان", price: 6000, image: "https://images.unsplash.com/photo-1601648764658-cf37e8c89b70?w=400", description: "فلفل ألوان مشكل 1 كيلو", inStock: true },
  { id: "v10", categoryId: "fruits-vegetables", name: "كوسة", price: 3000, image: "https://images.unsplash.com/photo-1563252722-6434563a985d?w=400", description: "كوسة طازجة 1 كيلو", inStock: true },
  { id: "v11", categoryId: "fruits-vegetables", name: "ملفوف أخضر", price: 2000, image: "https://images.unsplash.com/photo-1594282486552-05a5f0a57f8c?w=400", description: "ملفوف أخضر طازج 1 حبة", inStock: true },
  { id: "v12", categoryId: "fruits-vegetables", name: "قرنبيط", price: 4000, image: "https://images.unsplash.com/photo-1568584711075-3d021a7c3ca3?w=400", description: "قرنبيط طازج 1 كيلو", inStock: true },
  { id: "v13", categoryId: "fruits-vegetables", name: "بروكلي", price: 5000, image: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400", description: "بروكلي طازج 500 جرام", inStock: true },
  { id: "v14", categoryId: "fruits-vegetables", name: "خس", price: 2000, image: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=400", description: "خس طازج 1 حبة", inStock: true },
  { id: "v15", categoryId: "fruits-vegetables", name: "سبانخ", price: 3000, image: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400", description: "سبانخ طازج 500 جرام", inStock: true },
  { id: "v16", categoryId: "fruits-vegetables", name: "بقدونس", price: 1500, image: "https://images.unsplash.com/photo-1509475826633-fed577a2c71b?w=400", description: "بقدونس طازج 1 حزمة", inStock: true },
  { id: "v17", categoryId: "fruits-vegetables", name: "نعناع", price: 1500, image: "https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=400", description: "نعناع طازج 1 حزمة", inStock: true },
  { id: "v18", categoryId: "fruits-vegetables", name: "كزبرة", price: 1500, image: "https://images.unsplash.com/photo-1592392864481-345a05d2a982?w=400", description: "كزبرة طازجة 1 حزمة", inStock: true },
  { id: "v19", categoryId: "fruits-vegetables", name: "فجل", price: 2000, image: "https://images.unsplash.com/photo-1558279572-8ec5b1c6a2e7?w=400", description: "فجل أحمر طازج 1 حزمة", inStock: true },
  { id: "v20", categoryId: "fruits-vegetables", name: "شمندر", price: 3000, image: "https://images.unsplash.com/photo-1593105544559-ecb03bf76f82?w=400", description: "شمندر طازج 1 كيلو", inStock: true },
  { id: "v21", categoryId: "fruits-vegetables", name: "لوبياء خضراء", price: 4000, image: "https://images.unsplash.com/photo-1567375698348-5d9d5ae99de0?w=400", description: "لوبياء خضراء طازجة 1 كيلو", inStock: true },
  { id: "v22", categoryId: "fruits-vegetables", name: "بازلاء", price: 4500, image: "https://images.unsplash.com/photo-1587735243615-c03f25aaff15?w=400", description: "بازلاء طازجة 500 جرام", inStock: true },
  { id: "v23", categoryId: "fruits-vegetables", name: "فطر", price: 5000, image: "https://images.unsplash.com/photo-1504545102780-26774c1bb073?w=400", description: "فطر طازج 250 جرام", inStock: true },
  { id: "v24", categoryId: "fruits-vegetables", name: "ذرة", price: 3000, image: "https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400", description: "ذرة طازجة 3 حبات", inStock: true },
  { id: "v25", categoryId: "fruits-vegetables", name: "كرفس", price: 2500, image: "https://images.unsplash.com/photo-1580391564590-aeca65c5e2d3?w=400", description: "كرفس طازج 1 حزمة", inStock: true },
  
  // فواكه - Fruits
  { id: "f1", categoryId: "fruits-vegetables", name: "تفاح أحمر", price: 5000, image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400", description: "تفاح أحمر طازج 1 كيلو", inStock: true },
  { id: "f2", categoryId: "fruits-vegetables", name: "تفاح أخضر", price: 5500, image: "https://images.unsplash.com/photo-1619546813926-a78fa6372cd2?w=400", description: "تفاح أخضر طازج 1 كيلو", inStock: true },
  { id: "f3", categoryId: "fruits-vegetables", name: "موز", price: 4000, image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400", description: "موز طازج 1 كيلو", inStock: true },
  { id: "f4", categoryId: "fruits-vegetables", name: "برتقال", price: 4500, image: "https://images.unsplash.com/photo-1547514701-42782101795e?w=400", description: "برتقال طازج 1 كيلو", inStock: true },
  { id: "f5", categoryId: "fruits-vegetables", name: "ليمون", price: 3500, image: "https://images.unsplash.com/photo-1590502593747-42a996133562?w=400", description: "ليمون طازج 1 كيلو", inStock: true },
  { id: "f6", categoryId: "fruits-vegetables", name: "عنب أحمر", price: 7000, image: "https://images.unsplash.com/photo-1537640538966-79f369143f8f?w=400", description: "عنب أحمر طازج 1 كيلو", inStock: true },
  { id: "f7", categoryId: "fruits-vegetables", name: "عنب أخضر", price: 7000, image: "https://images.unsplash.com/photo-1596363505729-4190a9506133?w=400", description: "عنب أخضر طازج 1 كيلو", inStock: true },
  { id: "f8", categoryId: "fruits-vegetables", name: "فراولة", price: 8000, image: "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400", description: "فراولة طازجة 500 جرام", inStock: true },
  { id: "f9", categoryId: "fruits-vegetables", name: "بطيخ أحمر", price: 6000, image: "https://images.unsplash.com/photo-1563114773-84221bd62daa?w=400", description: "بطيخ أحمر طازج 1 حبة", inStock: true },
  { id: "f10", categoryId: "fruits-vegetables", name: "شمام", price: 5000, image: "https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=400", description: "شمام طازج 1 حبة", inStock: true },
  { id: "f11", categoryId: "fruits-vegetables", name: "مانجو", price: 10000, image: "https://images.unsplash.com/photo-1553279768-865429fa0078?w=400", description: "مانجو طازج 1 كيلو", inStock: true },
  { id: "f12", categoryId: "fruits-vegetables", name: "أناناس", price: 8000, image: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=400", description: "أناناس طازج 1 حبة", inStock: true },
  { id: "f13", categoryId: "fruits-vegetables", name: "كيوي", price: 7000, image: "https://images.unsplash.com/photo-1585059895524-72359e06133a?w=400", description: "كيوي طازج 500 جرام", inStock: true },
  { id: "f14", categoryId: "fruits-vegetables", name: "رمان", price: 6000, image: "https://images.unsplash.com/photo-1541344999736-83eca272f6fc?w=400", description: "رمان طازج 1 كيلو", inStock: true },
  { id: "f15", categoryId: "fruits-vegetables", name: "تين", price: 9000, image: "https://images.unsplash.com/photo-1601379760883-1bb497c558e1?w=400", description: "تين طازج 500 جرام", inStock: true },
  { id: "f16", categoryId: "fruits-vegetables", name: "مشمش", price: 6500, image: "https://images.unsplash.com/photo-1592681814168-6df0fa93161b?w=400", description: "مشمش طازج 1 كيلو", inStock: true },
  { id: "f17", categoryId: "fruits-vegetables", name: "خوخ", price: 7000, image: "https://images.unsplash.com/photo-1595124323911-8a8c9c3c6ff9?w=400", description: "خوخ طازج 1 كيلو", inStock: true },
  { id: "f18", categoryId: "fruits-vegetables", name: "كرز", price: 12000, image: "https://images.unsplash.com/photo-1528821128474-27f963b062bf?w=400", description: "كرز طازج 500 جرام", inStock: true },
  { id: "f19", categoryId: "fruits-vegetables", name: "توت", price: 10000, image: "https://images.unsplash.com/photo-1498557850523-fd3d118b962e?w=400", description: "توت طازج 250 جرام", inStock: true },
  { id: "f20", categoryId: "fruits-vegetables", name: "أفوكادو", price: 8000, image: "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400", description: "أفوكادو طازج 3 حبات", inStock: true },
  { id: "f21", categoryId: "fruits-vegetables", name: "جوز الهند", price: 5000, image: "https://images.unsplash.com/photo-1580984969071-a8da5656c2fb?w=400", description: "جوز الهند طازج 1 حبة", inStock: true },
  { id: "f22", categoryId: "fruits-vegetables", name: "تمر", price: 15000, image: "https://images.unsplash.com/photo-1593096918847-4a35e0c78b3f?w=400", description: "تمر فاخر 1 كيلو", inStock: true },
  { id: "f23", categoryId: "fruits-vegetables", name: "كمثرى", price: 6000, image: "https://images.unsplash.com/photo-1514756331096-242fdeb70d4a?w=400", description: "كمثرى طازجة 1 كيلو", inStock: true },
  { id: "f24", categoryId: "fruits-vegetables", name: "جريب فروت", price: 5500, image: "https://images.unsplash.com/photo-1577234286642-fc512a5f8f11?w=400", description: "جريب فروت طازج 1 كيلو", inStock: true },
  { id: "f25", categoryId: "fruits-vegetables", name: "يوسفي", price: 5000, image: "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400", description: "يوسفي طازج 1 كيلو", inStock: true },

  // Other categories
  { id: "p1", categoryId: "groceries", name: "أرز بسمتي", price: 35000, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400", description: "أرز بسمتي عالي الجودة 5 كيلو", inStock: true },
  { id: "p2", categoryId: "groceries", name: "زيت زيتون", price: 65000, image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400", description: "زيت زيتون بكر ممتاز 1 لتر", inStock: true },
  { id: "p3", categoryId: "groceries", name: "عسل طبيعي", price: 85000, image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400", description: "عسل طبيعي صافي 500 جرام", inStock: true },
  { id: "p4", categoryId: "dairy-eggs", name: "حليب طازج", price: 12000, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400", description: "حليب طازج كامل الدسم 1 لتر", inStock: true },
  { id: "p5", categoryId: "bakery", name: "خبز عربي", price: 5000, image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400", description: "خبز عربي طازج 6 قطع", inStock: true },
  { id: "p6", categoryId: "dairy-eggs", name: "جبنة بيضاء", price: 22000, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=400", description: "جبنة بيضاء طازجة 400 جرام", inStock: true },
  { id: "p7", categoryId: "cleaning-care", name: "صابون غسيل", price: 15000, image: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400", description: "صابون غسيل معطر 3 كيلو", inStock: true },
  { id: "p10", categoryId: "meat-poultry", name: "دجاج كامل", price: 45000, image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400", description: "دجاج طازج كامل 1.5 كيلو", inStock: true },
  { id: "p11", categoryId: "beverages", name: "عصير برتقال", price: 12000, image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=400", description: "عصير برتقال طبيعي 1 لتر", inStock: true },
  { id: "p12", categoryId: "snacks-sweets", name: "شوكولاتة داكنة", price: 18000, image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400", description: "شوكولاتة داكنة فاخرة 100 جرام", inStock: true },
  { id: "p13", categoryId: "baby", name: "حفاضات أطفال", price: 35000, image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=400", description: "حفاضات أطفال مقاس M عبوة 40", inStock: true },
  { id: "p14", categoryId: "electronics-services", name: "شاحن سريع", price: 65000, image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400", description: "شاحن سريع 20 واط", inStock: true },

  // محلات الزهور - Flowers
  { id: "fl1", categoryId: "flowers", name: "باقة ورد أحمر", price: 45000, image: "https://images.unsplash.com/photo-1518882605630-8eb9c8b3d783?w=400", description: "باقة ورد أحمر طازج 12 وردة", inStock: true },
  { id: "fl2", categoryId: "flowers", name: "باقة ورد أبيض", price: 40000, image: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=400", description: "باقة ورد أبيض فاخرة 10 ورود", inStock: true },
  { id: "fl3", categoryId: "flowers", name: "زهور عباد الشمس", price: 35000, image: "https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400", description: "باقة عباد الشمس 6 زهرات", inStock: true },
  { id: "fl4", categoryId: "flowers", name: "أوركيد بنفسجي", price: 75000, image: "https://images.unsplash.com/photo-1566873535350-a3f5d4a804b7?w=400", description: "نبتة أوركيد بنفسجية في أصيص", inStock: true },
  { id: "fl5", categoryId: "flowers", name: "باقة ورد مشكل", price: 55000, image: "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=400", description: "باقة ورد مشكلة ملونة", inStock: true },
  { id: "fl6", categoryId: "flowers", name: "زنبق أبيض", price: 38000, image: "https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=400", description: "باقة زنبق أبيض 8 زهرات", inStock: true },
  { id: "fl7", categoryId: "flowers", name: "توليب هولندي", price: 60000, image: "https://images.unsplash.com/photo-1520763185298-1b434c919102?w=400", description: "باقة توليب هولندي ملون 10 زهرات", inStock: true },
  { id: "fl8", categoryId: "flowers", name: "ورد جوري وردي", price: 50000, image: "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=400", description: "باقة ورد جوري وردي 12 وردة", inStock: true },
  { id: "fl9", categoryId: "flowers", name: "باقة زفاف", price: 120000, image: "https://images.unsplash.com/photo-1522057306606-8d84dab69b81?w=400", description: "باقة زفاف فاخرة مع شريط ساتان", inStock: true, discount: 10 },
  { id: "fl10", categoryId: "flowers", name: "نبتة صبار", price: 25000, image: "https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400", description: "نبتة صبار صغيرة في أصيص", inStock: true },
  { id: "fl11", categoryId: "flowers", name: "لافندر", price: 28000, image: "https://images.unsplash.com/photo-1468327768560-75b778cbb551?w=400", description: "باقة لافندر عطرية", inStock: true },
  { id: "fl12", categoryId: "flowers", name: "قرنفل أحمر", price: 32000, image: "https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400", description: "باقة قرنفل أحمر 15 زهرة", inStock: true },
];
