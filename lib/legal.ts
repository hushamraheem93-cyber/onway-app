import type { Locale } from "./config";

type LegalDoc = {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
};

// Lightweight placeholder legal copy so the footer links resolve.
// Replace with content reviewed by a lawyer before public launch.
export const privacy: Record<Locale, LegalDoc> = {
  ar: {
    title: "سياسة الخصوصية",
    updated: "آخر تحديث: تموز ٢٠٢٦",
    sections: [
      {
        heading: "مقدمة",
        body: "تحترم OnWay خصوصيتك. توضح هذه السياسة كيف نجمع بياناتك ونستخدمها ونحميها عند استخدامك لتطبيقنا وموقعنا. هذه نسخة أولية يُنصح بمراجعتها قانونيًا قبل الإطلاق.",
      },
      {
        heading: "البيانات التي نجمعها",
        body: "قد نجمع اسمك ورقم هاتفك وعنوان التوصيل وتفاصيل طلباتك لتقديم الخدمة وتحسين تجربتك. لا نبيع بياناتك لأي طرف ثالث.",
      },
      {
        heading: "كيف نستخدم بياناتك",
        body: "نستخدم بياناتك لتنفيذ طلباتك، والتواصل معك بشأن حالة الطلب، وتحسين خدماتنا، وإرسال إشعارات متعلقة بحسابك.",
      },
      {
        heading: "حماية البيانات",
        body: "نتخذ إجراءات أمنية معقولة لحماية بياناتك من الوصول غير المصرح به أو الفقدان أو الإفشاء.",
      },
      {
        heading: "تواصل معنا",
        body: "لأي استفسار حول الخصوصية، تواصل معنا عبر البريد info@onwayiq.com.",
      },
    ],
  },
  en: {
    title: "Privacy Policy",
    updated: "Last updated: July 2026",
    sections: [
      {
        heading: "Introduction",
        body: "OnWay respects your privacy. This policy explains how we collect, use and protect your data when you use our app and website. This is a preliminary draft and should be reviewed by a lawyer before launch.",
      },
      {
        heading: "Data we collect",
        body: "We may collect your name, phone number, delivery address and order details to provide the service and improve your experience. We do not sell your data to third parties.",
      },
      {
        heading: "How we use your data",
        body: "We use your data to fulfill your orders, communicate order status, improve our services and send account-related notifications.",
      },
      {
        heading: "Data protection",
        body: "We take reasonable security measures to protect your data from unauthorized access, loss or disclosure.",
      },
      {
        heading: "Contact us",
        body: "For any privacy question, reach us at info@onwayiq.com.",
      },
    ],
  },
};

export const terms: Record<Locale, LegalDoc> = {
  ar: {
    title: "شروط الاستخدام",
    updated: "آخر تحديث: تموز ٢٠٢٦",
    sections: [
      {
        heading: "قبول الشروط",
        body: "باستخدامك تطبيق OnWay أو موقعه، فإنك توافق على هذه الشروط. هذه نسخة أولية يُنصح بمراجعتها قانونيًا قبل الإطلاق.",
      },
      {
        heading: "استخدام الخدمة",
        body: "توفّر OnWay منصة تربط بين الزبائن والمتاجر والسائقين لتوصيل الطلبات. تلتزم باستخدام الخدمة بشكل قانوني وتقديم معلومات صحيحة.",
      },
      {
        heading: "الطلبات والدفع",
        body: "تظهر أسعار المنتجات ورسوم التوصيل قبل تأكيد الطلب. أنت مسؤول عن دقة عنوان التوصيل وبيانات التواصل.",
      },
      {
        heading: "المتاجر والسائقون",
        body: "يلتزم الشركاء من المتاجر والسائقين بمعايير الجودة والالتزام بالمواعيد وحسن التعامل مع الزبائن.",
      },
      {
        heading: "التعديلات",
        body: "قد نحدّث هذه الشروط من وقت لآخر، وستُنشر النسخة المحدّثة على هذه الصفحة.",
      },
    ],
  },
  en: {
    title: "Terms of Use",
    updated: "Last updated: July 2026",
    sections: [
      {
        heading: "Acceptance of terms",
        body: "By using the OnWay app or website, you agree to these terms. This is a preliminary draft and should be reviewed by a lawyer before launch.",
      },
      {
        heading: "Use of the service",
        body: "OnWay provides a platform connecting customers, stores and drivers for order delivery. You agree to use the service lawfully and provide accurate information.",
      },
      {
        heading: "Orders and payment",
        body: "Product prices and delivery fees are shown before you confirm an order. You are responsible for the accuracy of your delivery address and contact details.",
      },
      {
        heading: "Stores and drivers",
        body: "Store and driver partners commit to quality standards, punctuality and good conduct with customers.",
      },
      {
        heading: "Changes",
        body: "We may update these terms from time to time; the updated version will be published on this page.",
      },
    ],
  },
};
