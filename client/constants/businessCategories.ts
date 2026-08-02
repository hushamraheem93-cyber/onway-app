export const BUSINESS_TYPES = [
  { label: "مطعم / وجبات",           value: "restaurant" },
  { label: "سوبرماركت",              value: "supermarket" },
  { label: "صيدلية",                 value: "pharmacy" },
  { label: "مخبز",                   value: "bakery" },
  { label: "حلويات",                 value: "sweets" },
  { label: "كافيه / مشروبات",        value: "cafe" },
  { label: "بقالة",                  value: "grocery" },
  { label: "ملحمة",                  value: "butcher" },
  { label: "خضار وفواكه",            value: "fruit_veg" },
  { label: "ورد وهدايا",             value: "flowers" },
  { label: "إلكترونيات",             value: "electronics" },
  { label: "مستحضرات تجميل",         value: "cosmetics" },
  { label: "مستلزمات الحيوانات",     value: "pet" },
  { label: "قرطاسية",               value: "stationery" },
  { label: "أخرى",                   value: "other" },
];

export const BUSINESS_LABELS: Record<string, string> = {
  restaurant:  "مطعم",
  supermarket: "سوبرماركت",
  pharmacy:    "صيدلية",
  bakery:      "مخبز",
  sweets:      "حلويات",
  cafe:        "كافيه",
  grocery:     "بقالة",
  butcher:     "ملحمة",
  fruit_veg:   "خضار وفواكه",
  flowers:     "ورد وهدايا",
  electronics: "إلكترونيات",
  cosmetics:   "مستحضرات تجميل",
  pet:         "مستلزمات الحيوانات",
  stationery:  "قرطاسية",
  other:       "متجر",
};

// Comprehensive product categories per business type. Each list is meant to cover the
// full range of what a store of that type normally sells (Iraqi market), so a merchant
// rarely needs to add a category manually. "أخرى" always stays last as a catch-all.
export const CATEGORY_MAP: Record<string, string[]> = {
  restaurant: [
    "وجبات رئيسية", "برغر", "بيتزا", "مشويات", "دجاج", "شاورما",
    "سندويشات", "معجنات", "مقبلات", "سلطات", "شوربات",
    "أرز وبرياني", "باستا ومعكرونة", "أطباق جانبية", "بطاطا",
    "فطور", "وجبات عائلية", "وجبات أطفال", "مشروبات", "عصائر طازجة",
    "حلويات", "آيس كريم", "صوصات وإضافات", "أخرى",
  ],
  supermarket: [
    "الألبان والأجبان", "البيض", "العصائر والمشروبات", "المياه",
    "الشاي والقهوة", "الخبز والمخابز", "الرز والحبوب", "البقوليات",
    "المعكرونة والباستا", "السكر والزيوت", "التوابل والبهارات",
    "الصلصات والمعجونات", "المعلبات", "المخللات", "المجمدات",
    "اللحوم المصنعة", "المكسرات والفواكه المجففة", "الحلويات والشوكولاتة",
    "الوجبات الخفيفة والمقرمشات", "منتجات الأطفال", "الخضار", "الفواكه",
    "المنظفات", "العناية الشخصية", "الورقيات والمناديل",
    "مستلزمات المطبخ", "أطعمة صحية ودايت", "أخرى",
  ],
  pharmacy: [
    "الأدوية", "الفيتامينات والمكملات", "العناية الشخصية",
    "العناية بالبشرة", "العناية بالشعر", "العناية بالفم والأسنان",
    "منتجات الأطفال والحفاضات", "أجهزة طبية", "مستلزمات السكري",
    "ضغط الدم", "الإسعافات الأولية", "العناية بالمرأة",
    "مستحضرات تجميل طبية", "أعشاب ومنتجات طبيعية", "مستلزمات طبية عامة",
  ],
  bakery: [
    "خبز وأرغفة", "صمون", "معجنات", "كرواسون", "مناقيش", "فطائر",
    "كيك ومافن", "بسكويت", "خبز التوست", "منتجات خالية من الغلوتين",
  ],
  sweets: [
    "كيك", "تورتة", "كب كيك", "شوكولاتة", "كوكيز", "دونات",
    "حلويات شرقية", "كنافة", "بقلاوة", "معمول", "حلويات غربية",
    "آيس كريم", "بوكسات هدايا",
  ],
  cafe: [
    "قهوة", "إسبريسو", "شاي", "عصائر طازجة", "سموذي", "ميلك شيك",
    "مشروبات باردة", "مشروبات ساخنة", "معجنات وسناكس", "حلويات", "فطور",
  ],
  grocery: [
    "مواد غذائية", "مشروبات", "ألبان وأجبان", "خبز", "معلبات",
    "توابل وبهارات", "حلويات ومقرمشات", "منظفات", "عناية شخصية",
    "خضراوات", "فواكه", "أخرى",
  ],
  butcher: [
    "لحم بقري", "لحم غنم", "دجاج", "مفروم", "كباب وتكات",
    "مشويات جاهزة", "أسماك ومأكولات بحرية", "لحوم مصنعة", "أحشاء",
  ],
  fruit_veg: [
    "خضار", "فواكه", "أعشاب وخضار ورقية", "موسميات",
    "فواكه مجففة", "خضار مجمدة", "عصائر طازجة", "سلطات جاهزة",
  ],
  flowers: [
    "باقات ورد", "تنسيق ورد", "ورد صناعي", "نباتات داخلية",
    "هدايا", "مناسبات", "بالونات", "بطاقات تهنئة",
  ],
  electronics: [
    "هواتف وإكسسوارات", "أجهزة منزلية", "كمبيوتر ولابتوب",
    "إكسسوارات كمبيوتر", "سماعات وصوتيات", "كاميرات",
    "بطاريات وشواحن", "أجهزة كهربائية صغيرة", "ألعاب إلكترونية", "أخرى",
  ],
  cosmetics: [
    "عطور رجالية", "عطور نسائية", "العناية بالبشرة", "مكياج",
    "العناية بالشعر", "العناية بالجسم", "أظافر", "كريمات",
    "أدوات تجميل", "مستلزمات حلاقة", "أخرى",
  ],
  pet: [
    "طعام قطط", "طعام كلاب", "طعام طيور", "طعام أسماك",
    "مستلزمات نظافة", "ألعاب حيوانات", "أقفاص وبيوت",
    "أدوية بيطرية", "مستلزمات عامة",
  ],
  stationery: [
    "أقلام ودفاتر", "أدوات مدرسية", "حقائب مدرسية", "طباعة وتصوير",
    "لوازم مكتبية", "ورق وطباعة", "كتب", "أدوات فنية ورسم",
    "ألعاب تعليمية", "أخرى",
  ],
  other: [
    "منتجات غذائية", "منتجات منزلية", "ملابس وإكسسوارات",
    "إلكترونيات", "عطور ومستحضرات", "ألعاب", "أدوات وعدد", "هدايا", "أخرى",
  ],
};

export interface DynamicFieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "toggle" | "select";
  placeholder?: string;
  options?: string[];
  unit?: string;
}

export const DYNAMIC_FIELDS: Record<string, DynamicFieldConfig[]> = {
  restaurant: [
    { key: "preparationTime", label: "مدة التحضير (دقائق)", type: "number", placeholder: "15", unit: "دقيقة" },
    { key: "spiceLevel",      label: "مستوى الحار",         type: "select", options: ["غير حار", "خفيف", "متوسط", "حار", "حار جداً"] },
    { key: "sizes",           label: "الأحجام المتاحة",      type: "text",   placeholder: "صغير، وسط، كبير" },
    { key: "extras",          label: "الإضافات المتاحة",     type: "text",   placeholder: "جبن إضافي، صوص..." },
    { key: "isAvailableNow",  label: "متوفر الآن",           type: "toggle" },
  ],
  supermarket: [
    { key: "weight",          label: "الوزن / الحجم",         type: "text", placeholder: "1 كيلو / 500 مل" },
    { key: "quantity",        label: "الكمية في الباكيج",      type: "number", placeholder: "12" },
    { key: "barcode",         label: "الباركود (اختياري)",     type: "text", placeholder: "6281234567890" },
    { key: "expiryDate",      label: "تاريخ الانتهاء (اختياري)", type: "text", placeholder: "12/2026" },
  ],
  pharmacy: [
    { key: "manufacturer",        label: "الشركة المصنعة",    type: "text",   placeholder: "Pfizer / Bayer..." },
    { key: "concentration",       label: "التركيز / الجرعة",  type: "text",   placeholder: "500mg / 10ml" },
    { key: "volumeSize",          label: "الحجم / العبوة",     type: "text",   placeholder: "30 قرص / 100ml" },
    { key: "requiresPrescription",label: "يحتاج وصفة طبية",   type: "toggle" },
  ],
  bakery: [
    { key: "pieceSize",    label: "الحجم",          type: "text",   placeholder: "صغير / كبير" },
    { key: "piecesCount",  label: "عدد القطع",       type: "number", placeholder: "6" },
    { key: "allowNote",    label: "يقبل ملاحظات خاصة", type: "toggle" },
  ],
  sweets: [
    { key: "pieceSize",    label: "الحجم",           type: "text",   placeholder: "25 سم / كيلو..." },
    { key: "piecesCount",  label: "عدد القطع",        type: "number", placeholder: "12" },
    { key: "allowNote",    label: "إمكانية كتابة ملاحظة أو تهنئة", type: "toggle" },
  ],
  cafe: [
    { key: "sizes",        label: "الأحجام المتاحة", type: "select", options: ["صغير", "وسط", "كبير"] },
    { key: "isHot",        label: "ساخن / بارد",     type: "select", options: ["ساخن", "بارد", "الاثنان"] },
    { key: "extras",       label: "إضافات متاحة",    type: "text", placeholder: "حليب نباتي، سكر إضافي..." },
  ],
  grocery: [],
  butcher: [
    { key: "cutType",      label: "نوع القطع",        type: "text", placeholder: "شرائح / مكعبات / مفروم" },
    { key: "weight",       label: "الوزن",            type: "text", placeholder: "1 كيلو" },
  ],
  fruit_veg: [
    { key: "weight",       label: "الوزن / الوحدة",   type: "text", placeholder: "كيلو / حبة" },
    { key: "isSeasonal",   label: "موسمي",            type: "toggle" },
  ],
  flowers: [
    { key: "colorOptions", label: "الألوان المتاحة",   type: "text", placeholder: "أحمر، أبيض، وردي..." },
    { key: "allowNote",    label: "يقبل رسائل خاصة",  type: "toggle" },
  ],
  electronics: [],
  cosmetics: [],
  pet: [],
  stationery: [],
  other: [],
};

export const PRODUCT_NAME_PLACEHOLDER: Record<string, string> = {
  restaurant:  "مثال: برجر دجاج كريسبي",
  supermarket: "مثال: أرز بسمتي 5 كيلو",
  pharmacy:    "مثال: فيتامين C 1000mg",
  bakery:      "مثال: كنافة بالجبن",
  sweets:      "مثال: تورتة شوكولاتة",
  cafe:        "مثال: كابتشينو اسبريسو",
  grocery:     "مثال: زيت زيتون 1 لتر",
  butcher:     "مثال: لحم بقري مفروم 1 كيلو",
  fruit_veg:   "مثال: طماطم طازجة 1 كيلو",
  flowers:     "مثال: باقة ورد حمراء",
  electronics: "مثال: شاحن سريع 65 واط",
  cosmetics:   "مثال: كريم مرطب للبشرة",
  pet:         "مثال: طعام قطط 1 كيلو",
  stationery:  "مثال: دفتر رسم A4",
  other:       "اسم المنتج",
};

export const ALL_CATEGORIES = Array.from(new Set(Object.values(CATEGORY_MAP).flat()));
