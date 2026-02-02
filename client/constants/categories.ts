export interface Category {
  id: string;
  name: string;
  image: string;
  productCount: number;
}

export const CATEGORIES: Category[] = [
  {
    id: "new-arrivals",
    name: "أضيف حديثاً",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=300",
    productCount: 25,
  },
  {
    id: "best-offers",
    name: "أفضل العروض",
    image: "https://images.unsplash.com/photo-1607082350899-7e105aa886ae?w=300",
    productCount: 40,
  },
  {
    id: "cooking-essentials",
    name: "أساسيات الطبخ",
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300",
    productCount: 85,
  },
  {
    id: "bakery",
    name: "المخبوزات",
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300",
    productCount: 30,
  },
  {
    id: "fruits-vegetables",
    name: "الفواكه والخضروات",
    image: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=300",
    productCount: 120,
  },
  {
    id: "meat-poultry",
    name: "اللحوم والدواجن",
    image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=300",
    productCount: 55,
  },
  {
    id: "dairy-eggs",
    name: "منتجات الألبان والبيض",
    image: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?w=300",
    productCount: 70,
  },
  {
    id: "ready-to-eat",
    name: "جاهز للأكل",
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300",
    productCount: 45,
  },
  {
    id: "frozen-foods",
    name: "الأطعمة المجمدة",
    image: "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=300",
    productCount: 60,
  },
  {
    id: "processed-meat-pickles",
    name: "اللحوم المصنعة والمخللات",
    image: "https://images.unsplash.com/photo-1625943553852-781c6dd46faa?w=300",
    productCount: 35,
  },
  {
    id: "fresh-cheese",
    name: "أجبان طازجة",
    image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300",
    productCount: 40,
  },
  {
    id: "beverages",
    name: "المشروبات",
    image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300",
    productCount: 90,
  },
  {
    id: "canned-goods",
    name: "معلبات",
    image: "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=300",
    productCount: 65,
  },
  {
    id: "snacks-chocolate",
    name: "الوجبات الخفيفة والشوكولاتة",
    image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=300",
    productCount: 110,
  },
  {
    id: "coffee-tea",
    name: "القهوة والشاي",
    image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=300",
    productCount: 50,
  },
  {
    id: "protein-diet",
    name: "البروتين والنظام الغذائي الخاص",
    image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=300",
    productCount: 35,
  },
  {
    id: "breakfast",
    name: "طعام الإفطار",
    image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=300",
    productCount: 45,
  },
  {
    id: "cooking-baking",
    name: "الطبخ والخبز",
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300",
    productCount: 75,
  },
  {
    id: "spices-sauces",
    name: "التوابل والصلصات",
    image: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=300",
    productCount: 80,
  },
  {
    id: "milk",
    name: "حليب",
    image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300",
    productCount: 25,
  },
  {
    id: "cleaning-laundry",
    name: "التنظيف والغسيل",
    image: "https://images.unsplash.com/photo-1563453392212-326f5e854473?w=300",
    productCount: 95,
  },
  {
    id: "personal-care",
    name: "العناية الشخصية",
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300",
    productCount: 85,
  },
  {
    id: "baby-corner",
    name: "ركن الأطفال",
    image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=300",
    productCount: 60,
  },
  {
    id: "disposable",
    name: "الاستخدام الواحد",
    image: "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=300",
    productCount: 40,
  },
  {
    id: "health-beauty",
    name: "الصحة والجمال",
    image: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=300",
    productCount: 70,
  },
  {
    id: "household",
    name: "المستلزمات المنزلية",
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300",
    productCount: 55,
  },
  {
    id: "phone-credit",
    name: "رصيد الهاتف",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=300",
    productCount: 10,
  },
  {
    id: "electronics",
    name: "الإلكترونيات",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=300",
    productCount: 65,
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
  {
    id: "p1",
    categoryId: "cooking-essentials",
    name: "أرز بسمتي",
    price: 35000,
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300",
    description: "أرز بسمتي عالي الجودة 5 كيلو",
    inStock: true,
  },
  {
    id: "p2",
    categoryId: "cooking-essentials",
    name: "زيت زيتون",
    price: 65000,
    image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=300",
    description: "زيت زيتون بكر ممتاز 1 لتر",
    inStock: true,
  },
  {
    id: "p3",
    categoryId: "breakfast",
    name: "عسل طبيعي",
    price: 85000,
    image: "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=300",
    description: "عسل طبيعي صافي 500 جرام",
    inStock: true,
  },
  {
    id: "p4",
    categoryId: "milk",
    name: "حليب طازج",
    price: 12000,
    image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=300",
    description: "حليب طازج كامل الدسم 1 لتر",
    inStock: true,
  },
  {
    id: "p5",
    categoryId: "bakery",
    name: "خبز عربي",
    price: 5000,
    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=300",
    description: "خبز عربي طازج 6 قطع",
    inStock: true,
  },
  {
    id: "p6",
    categoryId: "fresh-cheese",
    name: "جبنة بيضاء",
    price: 22000,
    image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=300",
    description: "جبنة بيضاء طازجة 400 جرام",
    inStock: true,
  },
  {
    id: "p7",
    categoryId: "health-beauty",
    name: "فيتامين سي",
    price: 50000,
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300",
    description: "فيتامين سي 1000 ملغ 30 قرص",
    inStock: true,
  },
  {
    id: "p8",
    categoryId: "health-beauty",
    name: "مسكن للألم",
    price: 18000,
    image: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=300",
    description: "مسكن للألم سريع المفعول 20 قرص",
    inStock: true,
  },
  {
    id: "p9",
    categoryId: "electronics",
    name: "سماعات لاسلكية",
    price: 220000,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=300",
    description: "سماعات بلوتوث عالية الجودة",
    inStock: true,
  },
  {
    id: "p10",
    categoryId: "electronics",
    name: "شاحن سريع",
    price: 65000,
    image: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=300",
    description: "شاحن سريع 20 واط",
    inStock: true,
  },
  {
    id: "p11",
    categoryId: "fruits-vegetables",
    name: "تفاح أحمر",
    price: 15000,
    image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=300",
    description: "تفاح أحمر طازج 1 كيلو",
    inStock: true,
  },
  {
    id: "p12",
    categoryId: "fruits-vegetables",
    name: "طماطم طازجة",
    price: 8000,
    image: "https://images.unsplash.com/photo-1546470427-e26264be0b11?w=300",
    description: "طماطم طازجة 1 كيلو",
    inStock: true,
  },
  {
    id: "p13",
    categoryId: "meat-poultry",
    name: "دجاج كامل",
    price: 45000,
    image: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=300",
    description: "دجاج طازج كامل 1.5 كيلو",
    inStock: true,
  },
  {
    id: "p14",
    categoryId: "beverages",
    name: "عصير برتقال",
    price: 12000,
    image: "https://images.unsplash.com/photo-1534353473418-4cfa6c56fd38?w=300",
    description: "عصير برتقال طبيعي 1 لتر",
    inStock: true,
  },
  {
    id: "p15",
    categoryId: "snacks-chocolate",
    name: "شوكولاتة داكنة",
    price: 18000,
    image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=300",
    description: "شوكولاتة داكنة فاخرة 100 جرام",
    inStock: true,
  },
  {
    id: "p16",
    categoryId: "coffee-tea",
    name: "قهوة عربية",
    price: 35000,
    image: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=300",
    description: "قهوة عربية فاخرة 250 جرام",
    inStock: true,
  },
];
