# تقرير الإغلاق النهائي — Sprint 9

**المشروع:** OnWay — تطبيق توصيل عراقي

**التاريخ:** 21 آب 2026

**نطاق Sprint:** توحيد Light Mode وهوية OnWay البصرية عبر تطبيقات Customer وVendor وDriver وAdmin Mobile، إضافة إلى Admin Web وVendor Web وقوالب تسجيل الدخول والصفحات العامة.

## الحالة التنفيذية

> **SPRINT 9 STATUS: PASS**
>
> **SPRINT 9 CLOSED**
>
> **READY FOR NEXT SPRINT: YES — لم يبدأ Sprint التالي.**

تم تنفيذ Sprint 9 ضمن نطاق التصميم والثيم فقط. لم تتم إضافة API أو route أو قاعدة بيانات أو منطق أعمال جديد، ولم تتم إعادة بناء RBAC أو Audit Log أو أي نظام مالي.

## ملخص التنفيذ

| السطح | ما تم توحيده | النتيجة |
|---|---|---|
| Customer/Vendor/Driver/Admin Mobile | تثبيت palette Light مركزية، تعطيل قراءة system appearance، إزالة فروع `isDark` من المستهلكين الفعليين، وتوحيد portal accents مع OnWay orange | Light-only runtime |
| Design Tokens | جعل `Colors.dark` compatibility alias لنفس palette الفاتحة، وتحويل portal purple/blue legacy names إلى tokens برتقالية متوافقة، مع إبقاء ألوان success/warning/error/info دلالية | لا توجد palette داكنة قابلة للتفعيل |
| Typography | جعل Cairo الخط العربي الفعلي في `ThemedText` و`Button` وAdmin Mobile وFontFamily aliases، مع تحميل Cairo في القوالب الويب | Cairo موحد |
| Native shell | `StatusBar` صريح للسطح الفاتح، وExpo `userInterfaceStyle: "light"`، وتوحيد splash/adaptive icon إلى `#FB5B21` | لا يتبع dark system appearance |
| Admin Web | تحويل sidebar وheader shell وLive Monitor وTracking Modal وزر التتبع إلى surfaces فاتحة، وتوحيد primary إلى `#FB5B21` | RTL/Cairo/Light |
| Vendor Web | تحويل dashboard من dark-first tokens إلى page/card/form tokens فاتحة، وتحسين النصوص والتنبيهات والحقول والـ scrollbar | RTL/Cairo/Light |
| Vendor Login وAdmin Login | تحويل الخلفيات والبطاقات والحقول والتنبيهات والأزرار إلى Light، مع تباين نصي واضح | RTL/Cairo/Light |
| Landing pages | إزالة `prefers-color-scheme: dark` من developer preview، وتوحيد landing-public مع Cairo و`#FB5B21` وإضافة RTL للـ preview | browser preference لا يفعّل Dark Mode |

## قرارات Dark Mode

بدأ التدقيق بوجود **17 ملف source** يحتوي كلمات أو plumbing مرتبطة بالثيم الداكن. لم تكن هذه الملفات كلها تعرض Dark UI وقت التشغيل؛ بعضها كان compatibility plumbing أو tokens غير مستخدمة. بعد فحص المستهلكين، تم تثبيت القرار الآمن التالي:

| العنصر | القرار |
|---|---|
| `ThemeContext` | أصبح Light-only ولا يقرأ AsyncStorage أو system scheme، ولا توجد واجهة Theme Switcher للمستخدم. `setThemeMode` بقي كـ compatibility no-op فقط. |
| `useTheme` | يعيد `Colors[effectiveTheme]` مع `effectiveTheme: "light"` ثابتًا، دون `isDark` runtime field. |
| `Colors.dark` | لم يُحذف مباشرة؛ بقي alias لنفس `lightColors` لأن بعض المستهلكين أو التكاملات القديمة قد تعتمد على اسم المفتاح. لذلك لا يمكنه إنتاج surface داكن. |
| screen-level branches | أزيلت من Search وCart وDriver Home وDriver Tab Navigation ومن primitives المشتركة. |
| browser/native scheme hooks | كلا hookين يعيدان `light` فقط. |
| الألوان الداكنة الوظيفية | بقيت ألوان النصوص الداكنة، الظلال، overlays، الخرائط، وألوان الحالة عند الحاجة؛ هذه ليست Dark Theme surfaces. |

أعاد post-scan النهائي **صفر نتائج** لمسارات `prefers-color-scheme` و`useSystemColorScheme` و`useRNColorScheme` و`isDark`، وصفر نتائج للون القديم `#E86520` أو `#F83D0D` في ملفات source المستهدفة، وصفر dark media queries في قوالب الويب.

## الوصولية والهوية

تم استخدام Cairo وRTL في الأسطح العربية، مع إبقاء layout وتدفقات الأعمال كما هي. اختبر Sprint 9 تباين النص الداكن `#1F2937` فوق `#FB5B21` وفرض نسبة لا تقل عن **4.5:1** للنص العادي وفق معيار WCAG AA. كما تم استبدال الأبيض منخفض التباين فوق primary في أزرار Admin/Vendor الرئيسية بنص داكن، مع إبقاء ألوان الحالة مستقلة.

## حماية النطاق وعدم تغيير Business Logic

لم يتم تعديل `server/routes.ts` أو `server/financialLedger.ts` أو `server/adminAuthorization.ts` ضمن تنفيذ Sprint 9. لم تتم إضافة route أو API أو Firestore collection، ولم يتم تغيير Finance أو Wallet أو Ledger أو Settlement أو Commission أو Pricing أو RBAC أو Audit Log أو Order/Driver Assignment logic. اختبارات Sprint 9 تحتوي assertion تمنع إدخال مؤشرات business/financial logic في ملفات الثيم المركزية.

## ملفات التنفيذ الرئيسية

| المجموعة | الملفات |
|---|---|
| Mobile theme/runtime | `client/constants/theme.ts`, `client/context/ThemeContext.tsx`, `client/hooks/useTheme.ts`, `client/hooks/useColorScheme.ts`, `client/hooks/useColorScheme.web.ts`, `client/App.tsx`, `app.config.js` |
| Shared/mobile UI | `client/components/ThemedText.tsx`, `client/components/ThemedView.tsx`, `client/components/CartItemCard.tsx`, `client/components/Button.tsx`, `client/navigation/DriverTabNavigator.tsx`, `client/screens/DriverHomeScreen.tsx`, `client/screens/SearchScreen.tsx`, `client/screens/admin/adminStyles.ts`, `client/screens/WebsiteCmsTab.tsx` |
| Web surfaces | `server/templates/admin.html`, `server/templates/vendor-dashboard.html`, `server/templates/vendor-login.html`, `server/templates/login.html`, `server/templates/landing-page.html`, `server/templates/landing-public.html` |
| Tests and audit notes | `tests/unit/sprint9-theme-light-mode.test.mjs`, `SPRINT9_THEME_AUDIT.md` |

## التحقق والاختبارات

| الفحص | النتيجة |
|---|---:|
| Sprint 9 tests | **6/6 PASS** |
| Regression: Sprint 1 RBAC + Sprint 5 UI States + Sprint 8 Audit + Sprint 9 Theme | **31/31 PASS** |
| TypeScript (`npm run check:types`) | **PASS** |
| Server Build (`npm run server:build`) | **PASS** — `server_dist/index.js` بحجم 700.7kb |
| Full Unit (`npm run test:unit`) | **3199/3199 PASS** |
| Dark/brand post-scan | **PASS** — لا scheme branches ولا old brand ولا dark media query |
| Visual local check | **PASS** لـ Admin Web وVendor Login؛ Admin Login ظهر Light أيضًا |

عند فتح Admin Login كملف `file://` ظهر logo مفقودًا لأن `/uploads/onway-logo.png` مسار server-relative يحتاج تشغيل القالب عبر الخادم. وعند فتح Vendor Dashboard كملف محلي أعاد JavaScript التوجيه إلى `/vendor/login`؛ لذلك تم الاعتماد في هذه القوالب على static token checks، بينما يعمل المسار الطبيعي عبر server route.

## حالة Git والتسليم

لا توجد metadata خاصة بـ Git في workspace الحالي؛ الفحص أعاد:

```text
NO_GIT_METADATA_WORKSPACE_SNAPSHOT
```

لذلك لا يمكن إثبات diff أو history عبر Git، ولم يتم إنشاء history مزيف. لم يتم تنفيذ **commit** أو **push**، كما طُلب. ملفات المشروع والتقرير والاختبار مرفقة للتدقيق.

## خلاصة الإغلاق

Sprint 9 يحقق المتطلبات المحددة: Light Mode موحد غير قابل للتبديل أو الانقسام حسب system preference، Cairo وRTL في الأسطح العربية، `#FB5B21` كـ OnWay primary، إزالة dark surfaces الفعلية من Admin/Vendor Web، الحفاظ على التباين، وعدم المساس بـ Backend أو Business Logic أو الأنظمة المالية. Sprint 9 مغلق، ولا يبدأ Sprint التالي إلا بتوجيه صريح.
