import type { Locale } from "./config";

export type ServiceKey =
  | "restaurants"
  | "supermarket"
  | "produce"
  | "pharmacy"
  | "meat"
  | "bakery"
  | "sweets"
  | "drinks"
  | "perfume"
  | "flowers"
  | "bookstore"
  | "stores";

export type FeatureKey =
  | "fast"
  | "tracking"
  | "multi"
  | "easy"
  | "notifications"
  | "support";

export interface Dictionary {
  meta: { title: string; description: string; keywords: string };
  nav: {
    services: string;
    why: string;
    how: string;
    partners: string;
    faq: string;
    download: string;
    langLabel: string;
    switchTo: string;
  };
  hero: {
    badge: string;
    titleLead: string;
    titleHi: string;
    subtitle: string;
    download: string;
    partner: string;
    stats: { value: string; label: string }[];
    launch: string;
    trackTitle: string;
    trackStatus: string;
    trackEta: string;
    driverName: string;
    driverRole: string;
  };
  services: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Record<ServiceKey, string>;
    more: string;
  };
  why: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Record<FeatureKey, { title: string; body: string }>;
  };
  how: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: { title: string; body: string }[];
  };
  showcase: {
    eyebrow: string;
    title: string;
    subtitle: string;
    screens: { title: string; caption: string }[];
    prev: string;
    next: string;
  };
  partners: {
    eyebrow: string;
    title: string;
    subtitle: string;
    store: { title: string; body: string; points: string[]; cta: string };
    driver: { title: string; body: string; points: string[]; cta: string };
  };
  faq: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: { q: string; a: string }[];
  };
  contact: {
    eyebrow: string;
    title: string;
    subtitle: string;
    whatsapp: string;
    facebook: string;
    instagram: string;
    email: string;
  };
  cta: {
    title: string;
    subtitle: string;
    download: string;
    partner: string;
  };
  footer: {
    tagline: string;
    product: string;
    company: string;
    legal: string;
    links: {
      services: string;
      how: string;
      partners: string;
      faq: string;
      privacy: string;
      terms: string;
      contact: string;
    };
    rights: string;
    madeIn: string;
  };
  common: { comingSoon: string; appStore: string; googlePlay: string };
}

const ar: Dictionary = {
  meta: {
    title: "OnWay — كل احتياجاتك في تطبيق واحد | توصيل سريع في العراق",
    description:
      "OnWay منصة توصيل متعددة الخدمات في العراق. اطلب من المطاعم والسوبر ماركت والصيدليات والخضار والمزيد، وتابع طلبك مباشرة حتى باب بيتك. حمّل التطبيق أو انضم كشريك.",
    keywords:
      "OnWay, اون واي, توصيل, العراق, الضلوعية, مطاعم, سوبر ماركت, صيدلية, توصيل طلبات, تطبيق توصيل",
  },
  nav: {
    services: "الخدمات",
    why: "لماذا OnWay",
    how: "كيف يعمل",
    partners: "الشركاء",
    faq: "الأسئلة الشائعة",
    download: "تحميل التطبيق",
    langLabel: "اللغة",
    switchTo: "English",
  },
  hero: {
    badge: "من الضلوعية… إلى باب بيتك",
    titleLead: "كل احتياجاتك",
    titleHi: "في تطبيق واحد",
    subtitle:
      "من المطعم إلى الصيدلية، ومن السوبر ماركت إلى محل الورد — اطلب ما تريد من متاجر مدينتك وتابع السائق في الطريق إليك لحظة بلحظة.",
    download: "تحميل التطبيق",
    partner: "انضم كشريك",
    stats: [
      { value: "+11", label: "فئة خدمات" },
      { value: "دقائق", label: "توصيل سريع" },
      { value: "مباشر", label: "تتبّع الطلب" },
    ],
    launch: "قيد الإطلاق",
    trackTitle: "طلبك في الطريق",
    trackStatus: "السائق في الطريق إليك",
    trackEta: "الوصول خلال ٨ دقائق",
    driverName: "أحمد — سائق OnWay",
    driverRole: "على بُعد ١٫٢ كم",
  },
  services: {
    eyebrow: "الخدمات",
    title: "متجر مدينتك بالكامل، بين يديك",
    subtitle:
      "فئة واحدة لا تكفي. جمعنا لك كل ما تحتاجه من متاجر محلية موثوقة في مكان واحد.",
    items: {
      restaurants: "مطاعم",
      supermarket: "سوبر ماركت",
      produce: "خضار وفواكه",
      pharmacy: "صيدليات",
      meat: "لحوم",
      bakery: "مخابز",
      sweets: "حلويات",
      drinks: "مشروبات",
      perfume: "عطور",
      flowers: "زهور",
      bookstore: "مكتبات",
      stores: "كل المتاجر المحلية",
    },
    more: "والمزيد يُضاف كل يوم",
  },
  why: {
    eyebrow: "لماذا OnWay",
    title: "تجربة توصيل تستحق الثقة",
    subtitle: "بنينا OnWay حول شيء واحد: أن يصلك طلبك بسرعة وأنت مطمئن.",
    items: {
      fast: {
        title: "توصيل سريع",
        body: "شبكة سائقين قريبة منك تختصر وقت الانتظار وتوصل طلبك وهو طازج.",
      },
      tracking: {
        title: "تتبّع مباشر",
        body: "تابع طلبك على الخريطة من لحظة القبول حتى وصوله إلى بابك.",
      },
      multi: {
        title: "متاجر متعددة",
        body: "مطاعم، أسواق، صيدليات وأكثر — كلها داخل تطبيق واحد بحساب واحد.",
      },
      easy: {
        title: "واجهة سهلة",
        body: "تصميم عربي بسيط وسريع، تُنهي طلبك في خطوات معدودة بلا تعقيد.",
      },
      notifications: {
        title: "إشعارات فورية",
        body: "تنبيهات لحظية بكل تحديث في حالة طلبك، فلا تفوتك أي خطوة.",
      },
      support: {
        title: "دعم فني",
        body: "فريق دعم محلي جاهز لمساعدتك في أي وقت وحل أي مشكلة بسرعة.",
      },
    },
  },
  how: {
    eyebrow: "كيف يعمل",
    title: "من الطلب إلى الباب في خمس خطوات",
    subtitle: "بساطة كاملة — تختار، تؤكد، ونحن نتكفّل بالباقي.",
    steps: [
      { title: "اختر المتجر", body: "تصفّح المتاجر القريبة منك واختر ما يناسبك." },
      { title: "أضف المنتجات", body: "املأ سلتك بما تريد من منتجات متنوعة." },
      { title: "أكّد الطلب", body: "أدخل عنوانك وطريقة الدفع وأكمل طلبك." },
      { title: "السائق في الطريق", body: "يستلم السائق طلبك ويتجه إليك مباشرة." },
      { title: "استلم طلبك", body: "يصلك طلبك إلى باب بيتك في الوقت المحدد." },
    ],
  },
  showcase: {
    eyebrow: "من داخل التطبيق",
    title: "تجربة صُمّمت لتكون سهلة",
    subtitle: "نظرة سريعة على واجهة OnWay وكيف تُنهي طلبك بأقل عدد من اللمسات.",
    screens: [
      { title: "توصيل سريع وموثوق", caption: "اطلب من مطاعم وأسواق الضلوعية ويوصلك خلال دقائق." },
      { title: "كلشي بمكان واحد", caption: "مطاعم، متاجر، وأكثر — كلها داخل تطبيق واحد." },
      { title: "لحد باب بيتك", caption: "تابع طلبك لحظة بلحظة حتى يصل إلى بابك." },
      { title: "دخول سهل وسريع", caption: "برقم هاتفك فقط تبدأ الطلب خلال ثوانٍ." },
    ],
    prev: "السابق",
    next: "التالي",
  },
  partners: {
    eyebrow: "انضم إلى OnWay",
    title: "لنكبر معًا",
    subtitle: "سواء كنت صاحب متجر أو سائقًا، OnWay فرصة لدخل إضافي ونمو حقيقي.",
    store: {
      title: "أصحاب المتاجر",
      body: "اعرض متجرك أمام آلاف الزبائن في مدينتك، وأدر طلباتك بسهولة عبر لوحة تحكم بسيطة.",
      points: ["زبائن جدد كل يوم", "لوحة تحكم سهلة", "تسويق مجاني لمتجرك"],
      cta: "سجّل متجرك",
    },
    driver: {
      title: "السائقون",
      body: "اعمل بالوقت الذي يناسبك، واحصل على دخل إضافي مقابل كل طلب توصله.",
      points: ["أوقات عمل مرنة", "أرباح واضحة لكل طلب", "دعم مستمر على الطريق"],
      cta: "انضم كسائق",
    },
  },
  faq: {
    eyebrow: "الأسئلة الشائعة",
    title: "أسئلة يسألها الجميع",
    subtitle: "لم تجد إجابتك؟ تواصل معنا وسنكون سعداء بمساعدتك.",
    items: [
      {
        q: "كيف أطلب عبر OnWay؟",
        a: "حمّل التطبيق، اختر المتجر، أضف المنتجات إلى السلة، أدخل عنوانك وأكّد الطلب. ستتابع بعدها السائق حتى وصوله إليك.",
      },
      {
        q: "كم تبلغ رسوم التوصيل؟",
        a: "تُحتسب رسوم التوصيل حسب بُعد المتجر عن موقعك وتظهر بوضوح قبل تأكيد الطلب، بلا أي رسوم مخفية.",
      },
      {
        q: "ما هي مناطق التغطية؟",
        a: "ننطلق أولًا من قضاء الضلوعية في العراق، ونتوسّع تدريجيًا إلى مناطق جديدة. تابعنا لمعرفة وصولنا إلى مدينتك.",
      },
      {
        q: "كيف أصبح سائقًا لدى OnWay؟",
        a: "اضغط على «انضم كسائق»، املأ بياناتك، وسيتواصل معك فريقنا لإكمال التسجيل وبدء العمل بأوقات مرنة.",
      },
      {
        q: "كيف أضيف متجري إلى التطبيق؟",
        a: "اضغط على «سجّل متجرك» وأرسل بيانات متجرك، وسيقوم فريقنا بمساعدتك في التفعيل وعرض منتجاتك للزبائن.",
      },
      {
        q: "ما طرق الدفع المتاحة؟",
        a: "يمكنك الدفع نقدًا عند الاستلام، ونعمل على إضافة الدفع الإلكتروني قريبًا لمزيد من الراحة.",
      },
    ],
  },
  contact: {
    eyebrow: "تواصل معنا",
    title: "نحن هنا لمساعدتك",
    subtitle: "لأي استفسار أو دعم، تواصل معنا عبر القناة التي تناسبك.",
    whatsapp: "واتساب",
    facebook: "فيسبوك",
    instagram: "إنستغرام",
    email: "البريد الإلكتروني",
  },
  cta: {
    title: "جاهز لتجربة أسهل طريقة للطلب؟",
    subtitle: "حمّل OnWay اليوم، أو انضم إلينا كشريك وكن جزءًا من الانطلاقة.",
    download: "تحميل التطبيق",
    partner: "انضم كشريك",
  },
  footer: {
    tagline: "كل احتياجاتك في تطبيق واحد. توصيل سريع من متاجر مدينتك إلى بابك.",
    product: "المنتج",
    company: "الشركة",
    legal: "قانوني",
    links: {
      services: "الخدمات",
      how: "كيف يعمل",
      partners: "الشركاء",
      faq: "الأسئلة الشائعة",
      privacy: "سياسة الخصوصية",
      terms: "شروط الاستخدام",
      contact: "تواصل معنا",
    },
    rights: "جميع الحقوق محفوظة.",
    madeIn: "صُنع بشغف في العراق",
  },
  common: {
    comingSoon: "قريبًا",
    appStore: "App Store",
    googlePlay: "Google Play",
  },
};

const en: Dictionary = {
  meta: {
    title: "OnWay — Everything you need in one app | Fast delivery in Iraq",
    description:
      "OnWay is a multi-service delivery platform in Iraq. Order from restaurants, supermarkets, pharmacies, groceries and more, and track your driver on the way to your door. Download the app or join as a partner.",
    keywords:
      "OnWay, delivery, Iraq, Duluiya, restaurants, supermarket, pharmacy, food delivery, delivery app",
  },
  nav: {
    services: "Services",
    why: "Why OnWay",
    how: "How it works",
    partners: "Partners",
    faq: "FAQ",
    download: "Get the app",
    langLabel: "Language",
    switchTo: "العربية",
  },
  hero: {
    badge: "From Ḍuluʿiyya… to your doorstep",
    titleLead: "Everything you need",
    titleHi: "in one app",
    subtitle:
      "From the restaurant to the pharmacy, from the supermarket to the flower shop — order from your city's local stores and watch your driver head your way in real time.",
    download: "Get the app",
    partner: "Become a partner",
    stats: [
      { value: "11+", label: "service categories" },
      { value: "Minutes", label: "fast delivery" },
      { value: "Live", label: "order tracking" },
    ],
    launch: "Launching soon",
    trackTitle: "Your order is on the way",
    trackStatus: "Driver is heading to you",
    trackEta: "Arriving in 8 min",
    driverName: "Ahmad — OnWay driver",
    driverRole: "1.2 km away",
  },
  services: {
    eyebrow: "Services",
    title: "Your whole city's shops, in your pocket",
    subtitle:
      "One category is never enough. We brought together everything you need from trusted local stores in one place.",
    items: {
      restaurants: "Restaurants",
      supermarket: "Supermarket",
      produce: "Fruits & veg",
      pharmacy: "Pharmacies",
      meat: "Butchers",
      bakery: "Bakeries",
      sweets: "Sweets",
      drinks: "Drinks",
      perfume: "Perfumes",
      flowers: "Flowers",
      bookstore: "Bookstores",
      stores: "All local stores",
    },
    more: "and more added every day",
  },
  why: {
    eyebrow: "Why OnWay",
    title: "A delivery experience you can trust",
    subtitle: "We built OnWay around one thing: getting your order to you fast, with peace of mind.",
    items: {
      fast: {
        title: "Fast delivery",
        body: "A network of nearby drivers cuts your wait and gets your order to you fresh.",
      },
      tracking: {
        title: "Live tracking",
        body: "Follow your order on the map from the moment it's accepted until it reaches your door.",
      },
      multi: {
        title: "Many stores",
        body: "Restaurants, markets, pharmacies and more — all in one app, one account.",
      },
      easy: {
        title: "Simple interface",
        body: "A clean, fast design that lets you finish your order in just a few taps.",
      },
      notifications: {
        title: "Instant updates",
        body: "Real-time alerts for every change to your order — you never miss a step.",
      },
      support: {
        title: "Local support",
        body: "A local support team ready to help and solve any issue, fast.",
      },
    },
  },
  how: {
    eyebrow: "How it works",
    title: "From order to doorstep in five steps",
    subtitle: "Total simplicity — you choose and confirm, we handle the rest.",
    steps: [
      { title: "Pick a store", body: "Browse the stores near you and choose what suits you." },
      { title: "Add products", body: "Fill your cart with everything you need." },
      { title: "Confirm order", body: "Enter your address and payment, then place your order." },
      { title: "Driver on the way", body: "A driver picks up your order and heads straight to you." },
      { title: "Receive it", body: "Your order arrives at your door, right on time." },
    ],
  },
  showcase: {
    eyebrow: "Inside the app",
    title: "An experience designed to be easy",
    subtitle: "A quick look at the OnWay interface and how you finish an order in the fewest taps.",
    screens: [
      { title: "Fast, reliable delivery", caption: "Order from Ḍuluʿiyya's restaurants and markets — delivered in minutes." },
      { title: "Everything in one place", caption: "Restaurants, stores and more — all in a single app." },
      { title: "To your doorstep", caption: "Track your order live until it reaches your door." },
      { title: "Quick, easy sign-in", caption: "Just your phone number and you start ordering in seconds." },
    ],
    prev: "Previous",
    next: "Next",
  },
  partners: {
    eyebrow: "Join OnWay",
    title: "Let's grow together",
    subtitle: "Whether you own a store or drive, OnWay is a real opportunity for extra income and growth.",
    store: {
      title: "Store owners",
      body: "Put your store in front of thousands of customers in your city, and manage orders easily from a simple dashboard.",
      points: ["New customers daily", "Easy dashboard", "Free marketing for your store"],
      cta: "Register your store",
    },
    driver: {
      title: "Drivers",
      body: "Work whenever suits you, and earn extra income for every order you deliver.",
      points: ["Flexible hours", "Clear earnings per order", "Ongoing support on the road"],
      cta: "Become a driver",
    },
  },
  faq: {
    eyebrow: "FAQ",
    title: "Questions everyone asks",
    subtitle: "Didn't find your answer? Reach out and we'll be happy to help.",
    items: [
      {
        q: "How do I order on OnWay?",
        a: "Download the app, pick a store, add products to your cart, enter your address and confirm. Then track your driver all the way to you.",
      },
      {
        q: "How much is delivery?",
        a: "Delivery fees depend on how far the store is from you and are shown clearly before you confirm — with no hidden charges.",
      },
      {
        q: "Which areas do you cover?",
        a: "We're launching first in Ḍuluʿiyya, Iraq, and expanding gradually to new areas. Follow us to know when we reach your city.",
      },
      {
        q: "How do I become an OnWay driver?",
        a: "Tap “Become a driver”, fill in your details, and our team will contact you to complete registration and start with flexible hours.",
      },
      {
        q: "How do I add my store to the app?",
        a: "Tap “Register your store” and send your store details. Our team will help you go live and showcase your products to customers.",
      },
      {
        q: "What payment methods are available?",
        a: "You can pay cash on delivery, and we're adding online payment soon for extra convenience.",
      },
    ],
  },
  contact: {
    eyebrow: "Contact us",
    title: "We're here to help",
    subtitle: "For any question or support, reach us on the channel that suits you.",
    whatsapp: "WhatsApp",
    facebook: "Facebook",
    instagram: "Instagram",
    email: "Email",
  },
  cta: {
    title: "Ready for the easiest way to order?",
    subtitle: "Download OnWay today, or join us as a partner and be part of the launch.",
    download: "Get the app",
    partner: "Become a partner",
  },
  footer: {
    tagline: "Everything you need in one app. Fast delivery from your city's stores to your door.",
    product: "Product",
    company: "Company",
    legal: "Legal",
    links: {
      services: "Services",
      how: "How it works",
      partners: "Partners",
      faq: "FAQ",
      privacy: "Privacy Policy",
      terms: "Terms of Use",
      contact: "Contact",
    },
    rights: "All rights reserved.",
    madeIn: "Made with care in Iraq",
  },
  common: {
    comingSoon: "Coming soon",
    appStore: "App Store",
    googlePlay: "Google Play",
  },
};

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
