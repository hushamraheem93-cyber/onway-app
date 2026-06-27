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

export const CATEGORY_MAP: Record<string, string[]> = {
  restaurant: [
    "وجبات رئيسية", "البركر", "البيتزا", "المشويات", "الدجاج",
    "المقبلات", "السلطات", "الشوربات", "السندويشات",
    "المشروبات", "الحلويات", "الصوصات", "الوجبات العائلية",
  ],
  supermarket: [
    "الألبان والبيض", "العصائر والمشروبات", "المياه", "الخبز",
    "الرز والحبوب", "السكر والزيوت", "المعلبات", "المجمدات",
    "المنظفات", "منتجات الأطفال", "الخضار", "الفواكه",
    "الحلويات", "الوجبات الخفيفة", "أخرى",
  ],
  pharmacy: [
    "الأدوية", "الفيتامينات والمكملات", "العناية الشخصية",
    "منتجات الأطفال", "أجهزة طبية", "مستلزمات السكري",
    "ضغط الدم", "العناية بالبشرة", "العناية بالشعر",
  ],
  bakery: [
    "خبز وأرغفة", "معجنات", "كرواسون", "مناقيش", "فطائر",
  ],
  sweets: [
    "كيك", "تورتة", "شوكولاتة", "كوكيز", "بوكسات هدايا",
    "حلويات شرقية", "كنافة", "آيس كريم",
  ],
  cafe: [
    "قهوة", "شاي", "عصائر", "سموذي",
    "مشروبات باردة", "مشروبات ساخنة", "حلويات",
  ],
  grocery: [
    "مواد غذائية", "مشروبات", "حلويات", "منظفات", "معلبات",
  ],
  butcher: [
    "لحم بقري", "لحم غنم", "دجاج", "مفروم", "مشويات جاهزة",
  ],
  fruit_veg: [
    "خضار", "فواكه", "أعشاب", "موسميات",
  ],
  flowers: [
    "باقات ورد", "هدايا", "مناسبات", "تنسيق ورد",
  ],
  electronics: [
    "هواتف وإكسسوارات", "أجهزة منزلية", "كمبيوتر ولابتوب",
    "سماعات وصوتيات", "كاميرات", "بطاريات وشواحن", "أخرى",
  ],
  cosmetics: [
    "عطور", "العناية بالبشرة", "مكياج", "العناية بالشعر",
    "أظافر", "أدوات تجميل", "كريمات", "أخرى",
  ],
  pet: [
    "طعام قطط", "طعام كلاب", "طعام طيور", "مستلزمات عامة",
    "ألعاب حيوانات", "أدوية بيطرية",
  ],
  stationery: [
    "أقلام ودفاتر", "أدوات مدرسية", "طباعة وتصوير",
    "لوازم مكتبية", "كتب", "ألعاب تعليمية",
  ],
  other: [
    "منتجات غذائية", "منتجات منزلية", "ملابس وإكسسوارات",
    "إلكترونيات", "عطور ومستحضرات", "أخرى",
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
  grocery: [
    { key: "weight",       label: "الوزن / الحجم",   type: "text", placeholder: "1 كيلو / 1 لتر" },
    { key: "expiryDate",   label: "تاريخ الانتهاء (اختياري)", type: "text", placeholder: "06/2026" },
  ],
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
