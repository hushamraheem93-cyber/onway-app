====================================================================
Onway - حزمة المراجعة الخارجية (Review Export)
تاريخ التجهيز: يُنشأ آلياً من نسخة المشروع الحالية (بدون أي تعديل على الكود)
====================================================================

هذه الحزمة نسخة مطابقة (Copy) من ملفات المشروع الأصلي، مرتبة في مجلدات
حسب الغرض لتسهيل المراجعة الخارجية. لم يتم تعديل أو حذف أي سطر برمجي،
هذه فقط نسخ منظمة للمراجعة.

--------------------------------------------------------------------
شجرة المجلدات الكاملة (review-export/)
--------------------------------------------------------------------
review-export/
├── 01-server/                          (Backend - Node.js + Express)
│   ├── firebase.ts                     -> اتصال Firebase Admin SDK + دوال قراءة/كتابة Firestore
│   ├── index.ts                        -> نقطة تشغيل الخادم، الجلسات، تسجيل دخول الأدمن، Push setup
│   ├── routes.ts                       -> جميع مسارات API (طلبات، مستخدمين، عناوين...) + إعداد Socket.io
│   ├── vendor.ts                       -> مسارات API الخاصة بالتجار/المتاجر ولوحة التاجر
│   ├── pushNotifications.ts            -> إرسال الإشعارات عبر Expo Push API
│   ├── seed-data.ts                    -> بيانات أولية/تجريبية للتطوير
│   ├── public/                         -> ملفات ثابتة تُخدَّم من السيرفر (uploads, manifest)
│   │   └── uploads/                    -> صور مرفوعة (بانرات ...الخ)
│   └── templates/                      -> صفحات HTML تُخدَّم مباشرة من السيرفر
│       ├── admin.html                  -> لوحة تحكم الأدمن (المصدر الفعلي المستخدم حالياً)
│       ├── landing-page.html           -> الصفحة الرئيسية التعريفية
│       ├── login.html                  -> صفحة تسجيل دخول الأدمن
│       ├── vendor-dashboard.html       -> لوحة تحكم التاجر (نسخة ويب، إن استُخدمت)
│       └── vendor-login.html           -> تسجيل دخول التاجر (نسخة ويب)
│
├── 02-client/                          (تطبيق الموبايل - React Native / Expo، مشترك بين
│   │                                    المستخدم/السائق/التاجر عبر شاشات وملاحات منفصلة)
│   ├── App.tsx                         -> نقطة دخول التطبيق
│   ├── index.js                        -> Registry الخاص بـ Expo
│   ├── assets/                         -> صور وأصوات التطبيق
│   ├── components/                     -> مكونات UI عامة مشتركة
│   ├── config/                         -> إعدادات عامة للتطبيق
│   ├── constants/                      -> ثوابت (الألوان، الفئات، العملة...)
│   ├── context/                        -> React Context (Auth, Cart, Orders, Notifications...)
│   ├── hooks/                          -> React Hooks مخصصة (منها usePushNotifications.ts, useDriver.ts)
│   ├── lib/                            -> عملاء خارجيون (lib/firebase.ts, query-client.ts, geocoding.ts)
│   ├── navigation/                     -> جميع الملاحات (Navigators)
│   ├── screens/                        -> جميع شاشات التطبيق
│   ├── services/                       -> api.ts (طبقة الاتصال بالـ Backend)
│   ├── types/                          -> تعريفات TypeScript المشتركة
│   └── utils/                          -> دوال مساعدة عامة
│
│   >>> مكان تطبيق العميل (المستخدم النهائي):
│       client/screens/Home*, Cart*, Orders*, Product*, Store*, Profile*, ...
│       الملاح الرئيسي: client/navigation/MainTabNavigator.tsx + RootStackNavigator.tsx
│
│   >>> مكان تطبيق السائق (Driver):
│       الشاشات: client/screens/Driver*.tsx
│         (DriverHomeScreen, DriverBatchScreen, DriverOrdersScreen,
│          DriverOrderDetailScreen, DriverEarningsScreen, DriverProfileScreen,
│          DriverRegistrationScreen)
│       الملاح: client/navigation/DriverTabNavigator.tsx
│       Hook خاص بالسائق: client/hooks/useDriver.ts
│
│   >>> مكان تطبيق التاجر (Vendor):
│       الشاشات: client/screens/Vendor*.tsx
│         (VendorHomeScreen, VendorOrdersScreen, VendorProductsScreen,
│          VendorAddProductScreen, VendorEditProductScreen, VendorWalletScreen,
│          VendorRatingsScreen, VendorProfileScreen, VendorNotificationsScreen,
│          VendorRegistrationScreen)
│       الملاح: client/navigation/VendorTabNavigator.tsx
│       Context خاص: client/context/VendorNotificationsContext.tsx
│
│   ملاحظة: client/screens/AdminScreen.tsx موجود في الكود لكنه غير مرتبط
│   حالياً بأي ملاح (Navigator) - أي أنه غير قابل للوصول من داخل التطبيق.
│   لوحة التحكم الفعلية المستخدمة هي 04-admin (صفحة ويب منفصلة).
│
├── 03-shared/                          (أنواع ومخططات بيانات مشتركة بين Backend/Client)
│   └── schema.ts                       -> تعريفات الأنواع/المخططات المشتركة (Orders, Vendors, ...)
│
├── 04-admin/                           (لوحة تحكم الإدارة - جميعها منسوخة هنا لسهولة المراجعة)
│   ├── admin-dist/                     -> نسخة مبنية/مصدرة من لوحة الأدمن (ثابتة الملفات)
│   │   ├── index.html
│   │   ├── login.html
│   │   ├── config.js
│   │   └── .htaccess
│   ├── server-public/                  -> نسخة من server/public (أصول لوحة التحكم/الرفعات)
│   └── server-templates/               -> نسخة من server/templates (الأصل الحي المستخدم فعلياً)
│       ├── admin.html                  -> *** المصدر الفعلي للوحة التحكم الحالية ***
│       ├── login.html
│       ├── vendor-dashboard.html
│       └── vendor-login.html
│
│   >>> مكان لوحة الإدارة (الأصل الحقيقي المستخدم في التشغيل):
│       server/templates/admin.html  (يُخدَّم عبر Express على المسار /admin)
│       تسجيل الدخول: server/templates/login.html  (المسار /admin/login)
│       منطق الجلسة/الصلاحيات: server/index.ts (isValidSession) و server/vendor.ts
│       و server/routes.ts (isAdminSessionValid)
│
└── 05-config/                          (ملفات الإعداد والتهيئة على مستوى المشروع)
    ├── package.json                    -> الاعتماديات والسكربتات
    ├── package-lock.json               -> قفل نسخ الاعتماديات
    ├── tsconfig.json                   -> إعدادات TypeScript
    ├── app.json                        -> إعدادات Expo (تعريفية/احتياطية)
    ├── app.config.js                   -> إعدادات Expo الفعلية (تدعم متغيرات البيئة وقت البناء)
    ├── eas.json                        -> إعدادات Expo Application Services (البناء/النشر)
    ├── babel.config.js                 -> إعداد Babel
    ├── metro.config.js                 -> إعداد Metro Bundler (React Native)
    ├── eslint.config.js                -> إعداد ESLint
    ├── drizzle.config.ts               -> إعداد Drizzle (إن استُخدم لأي طبقة قاعدة بيانات علائقية)
    ├── firebase.json                   -> إعداد مشروع Firebase (Hosting/Functions...)
    ├── firestore.rules                 -> قواعد أمان Firestore
    ├── firestore.indexes.json          -> فهارس Firestore
    ├── .firebaserc                     -> ربط مشروع Firebase الافتراضي
    ├── firebaseConfig.js               -> إعداد عميل Firebase (Client SDK) في الجذر
    ├── .replit                         -> إعدادات بيئة Replit (المنافذ، الـ Workflows، النشر)
    ├── .gitignore
    └── .watchmanconfig

--------------------------------------------------------------------
مواقع مكونات رئيسية إضافية (للمراجعة السريعة)
--------------------------------------------------------------------

>>> ملفات Firebase:
    - server/firebase.ts              : تهيئة Firebase Admin SDK + كل دوال القراءة/الكتابة
                                         في Firestore (Orders, Vendors, Users, Categories...)
    - client/lib/firebase.ts          : تهيئة Firebase Client SDK (غير مستخدم حالياً للقراءة
                                         المباشرة؛ كل البيانات تمر عبر Express API)
    - firebaseConfig.js (جذر المشروع) : إعداد Firebase عام إضافي
    - firebase.json / .firebaserc / firestore.rules / firestore.indexes.json
                                       : إعدادات مشروع Firebase (في 05-config)

>>> ملفات Socket.io (اتصال لحظي/Real-time):
    - server/routes.ts                : تهيئة Socket.io Server (import { Server as SocketServer }
                                         from "socket.io") وإرسال أحداث تحديث الطلبات لحظياً
    - client/screens/OrderTrackingScreen.tsx : استهلاك أحداث Socket.io لتتبع الطلب لحظياً (العميل)
    - client/screens/DriverHomeScreen.tsx    : استهلاك أحداث Socket.io لدى السائق

>>> ملفات Push Notifications (الإشعارات):
    - server/pushNotifications.ts     : إرسال الإشعارات عبر Expo Push API من السيرفر
    - server/index.ts / server/routes.ts / server/vendor.ts / server/firebase.ts
                                       : نقاط استدعاء إرسال الإشعارات (طلب جديد، تغيير حالة، ...)
    - client/hooks/usePushNotifications.ts : تسجيل جهاز العميل لاستقبال الإشعارات (Expo push token)
    - client/context/NotificationContext.tsx        : إدارة حالة إشعارات المستخدم في التطبيق
    - client/context/VendorNotificationsContext.tsx  : إدارة إشعارات التاجر (طلب جديد) عالمياً
    - client/screens/VendorNotificationsScreen.tsx   : شاشة عرض إشعارات التاجر
    - client/screens/AdminScreen.tsx / server/templates/admin.html : عرض/إدارة الإشعارات من لوحة التحكم

--------------------------------------------------------------------
ملاحظات هامة للمراجع
--------------------------------------------------------------------
1. هذه نسخة (Copy) فقط للمراجعة الخارجية، وليست نسخة تشغيلية. لا تحتوي
   على node_modules أو مجلدات البناء (server_dist) أو ملفات البيئة (.env)
   أو المفاتيح السرية.
2. لوحة التحكم (Admin Panel) تعمل فعلياً على الخادم الخلفي (Express) على
   المنفذ 5000 عبر server/templates/admin.html، وليس عبر client/screens/AdminScreen.tsx
   (هذا الملف غير مستخدم حالياً داخل تطبيق الموبايل).
3. تطبيقا السائق والتاجر ليسا تطبيقين منفصلين فعلياً، بل شاشات وملاحات
   ضمن نفس مشروع client الواحد (React Native/Expo)، يتم التبديل بينها بحسب
   نوع الحساب المسجّل دخوله.
