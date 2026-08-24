# H68 — FINAL REPORT

## الحالة النهائية

**H-68 — CLOSED.** كل متطلبات الطلب مُثبتة باختبارات تفشل عند إعادة إدخال الخلل.

لا commit · لا push · لا نشر · **ولا أي كتابة في Firestore**. `HEAD = e900e7f`.

---

## 1. الحالة في HEAD قبل هذه الجولة (المتطلب 1)

H-68 كانت **منفَّذة جزئياً** من جولة سابقة في هذه الجلسة. فحصتُ الشيفرة فعلياً ولم أفترض. ما كان صحيحاً تركتُه؛ الفجوات المتبقية كانت:

| # | الفجوة في HEAD | الحالة |
|---|---|---|
| أ | `REPLIT_DEPLOYMENT === "1"` — اختبار سلسلة حرفية واحدة | ❌ **fail-open متبقٍّ**: `"true"` أو `"yes"` أو `" 1"` **لا تمنع** |
| ب | الحارس مكتوب مرتين: TypeScript في `server/env.ts` ونسخة يدوية في `scripts/seed-test-data.mjs` | ❌ مخالف للمتطلب 5 (اعتمد على اختبار تباعد بدل تطبيق واحد) |
| ج | تغطية مسارات النشر الثلاثة (PM2 / Replit / محلي) غير مُثبتة باختبار | ❌ ناقصة |
| د | اختبار الترتيب في السكربت غير سليم | ❌ `indexOf` تُرجع `-1` عند غياب الاستدعاء، و`-1 < n` صحيح — **فحذف الحارس كان يمرّ** |

ما كان صحيحاً بالفعل ولم أُعِد كتابته: قائمة سماح `NODE_ENV`، الـopt-in الصريح، الحارس قبل `getFirestore()`، وربط الـendpoint و`seed-data.ts`.

---

## 2. السبب الجذري الفعلي في HEAD

الحارس الأصلي:

```ts
if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") deny
```

**يفشل مفتوحاً على محورين**، وكلاهما يختبر سلسلة حرفية واحدة:

1. **محور `NODE_ENV`** — أي قيمة غير `"production"` بالحرف (غير مضبوطة، `"Production"`، `"prod"`، بمسافة) تمرّ. و`.replit` ينشر بـ`run = ["sh", "-c", "node server_dist/index.js"]` **بلا `NODE_ENV` إطلاقاً**.
2. **محور `REPLIT_DEPLOYMENT`** — أي قيمة غير `"1"` بالحرف تمرّ. (هذه هي الفجوة المتبقية في HEAD.)

النتيجة: على نشر Replit، كانت الحماية كلها معلَّقة على أن تكون Replit قد ضبطت `REPLIT_DEPLOYMENT` إلى `"1"` تحديداً — وطلب إداري واحد يكتب متاجر ومنتجات وبانرات وهمية في الكتالوج الحيّ.

---

## 3. الملفات المعدّلة

| الملف | التغيير |
|---|---|
| `shared/seedGuard.mjs` | **جديد** — التطبيق الوحيد للحارس، JavaScript صِرف |
| `shared/seedGuard.d.ts` | **جديد** — تعريفات النوع لمستدعِي TypeScript |
| `server/env.ts` | يعيد التصدير من الوحدة المشتركة (كان يحمل نسخته) |
| `scripts/seed-test-data.mjs` | يستورد الحارس بدل إعادة كتابة شروطه |
| `tests/unit/h68-demo-seed-guard.test.mjs` | أُعيدت كتابته — 29 → **31** اختباراً |

`server/routes.ts` و`server/seed-data.ts` **لم يتغيّرا في هذه الجولة** — ربطهما كان صحيحاً.

### لماذا JavaScript صِرف

ثلاثة مستدعِين بثلاثة مُحمِّلات مختلفة: `server/routes.ts` (esbuild)، `server/seed-data.ts` (tsx)، و`scripts/seed-test-data.mjs` (**node مجرّد، بلا مُحمِّل TypeScript**). وحدة `.ts` كانت ستمنع الثالث من مشاركتها دون تغيير طريقة تشغيله. `.mjs` + `.d.ts` تعطي **تطبيقاً واحداً** يعمل عبر الثلاثة — تحقّقتُ عملياً: `check:types` و`server:build` و`node scripts/…` كلها تقبله.

---

## 4. مسارات seed التي فُحصت (المتطلب 2)

جرد كامل من المستودع، لا من الافتراض:

| المسار | يكتب demo/test؟ | الحالة |
|---|---|---|
| `POST /api/admin/seed-demo-stores` | نعم | ✅ محروس (خلف `requireAdminAuth` **و** الحارس، قبل `getFirestore()`) |
| `server/seed-data.ts` | نعم | ✅ محروس (deny-by-default + تجاوز `ALLOW_SEED` للمشغّل عبر shell) |
| `scripts/seed-test-data.mjs` | نعم | ✅ محروس (كان بلا حارس إطلاقاً) |
| `scripts/clean-test-data.mjs` · `cleanup-demo-data.mjs` | حذف لا بذر | خارج النطاق |
| `backfill-order-vendor-ids` · `migrate-settlement` · `rollback-settlement` | migrations تشغيلية | ليست demo seed |
| `production-validate.mjs` · `build*.js` | قراءة/بناء | ليست seed |

اختبار يحصر نقاط الدخول ويفشل إذا ظهر `/api/*seed*` أو `/api/*demo*` جديد.

---

## 5. عقد الحارس النهائي

ثلاثة شروط، **كلٌّ منها وحده يمنع**، ولا يُقرأ فيها أي شيء عن المُستدعي:

```
1. env.ALLOW_DEMO_SEED === "true"              وإلا → DENY   (opt-in صريح، بلا fallback)
2. NODE_ENV ∈ {development, test}              وإلا → DENY   (بعد trim+lowercase؛ المفقود والمجهول يمنعان)
3. REPLIT_DEPLOYMENT فارغ/غير موجود             وإلا → DENY   (الوجود هو الإشارة، لا السلسلة "1")
```

### قبل/بعد (مُنفَّذ فعلياً)

```
environment                            BEFORE     AFTER
NODE_ENV unset (.replit publish)       SEEDS      blocked
NODE_ENV unset + opt-in                SEEDS      blocked
NODE_ENV=Production + opt-in           SEEDS      blocked
NODE_ENV=prod + opt-in                 SEEDS      blocked
NODE_ENV=production (PM2) + opt-in     blocked    blocked
staging + opt-in                       SEEDS      blocked
dev + REPLIT_DEPLOYMENT=1              blocked    blocked
dev + REPLIT_DEPLOYMENT=true           SEEDS      blocked   ← الفجوة المتبقية في HEAD
dev, no opt-in                         SEEDS      blocked
dev + opt-in=1 (wrong value)           SEEDS      blocked
dev + opt-in  (local)                  SEEDS      SEEDS
test + opt-in (CI)                     SEEDS      SEEDS
```

**الإنتاج ممنوع نهائياً** — لا يوجد متغيّر يفتحه. **صلاحية الإدارة لا تكفي**: اختبار يثبّت أن الحارس لا يقرأ `req` ولا جلسة ولا دوراً ولا كوكي.

**تغطية مسارات النشر (المتطلب 6):** اختبارات تقرأ `ecosystem.config.js` و`.replit` نفسيهما وتفشل إذا تغيّرت افتراضاتهما — PM2 يضبط `NODE_ENV=production`؛ `.replit` لا يضبط شيئاً (فالمنع يقع على محور `NODE_ENV` وحده، دون الاعتماد على Replit)؛ والتشغيل المحلي يبقى صالحاً بالـopt-in.

---

## 6. الاختبارات (المتطلب 11)

**قبل: 2607 · بعد: 2609** (ملف H-68 نفسه: 29 → 31 اختباراً).

الاختبارات تستورد `shared/seedGuard.mjs` مباشرة — الوحدة نفسها التي يشحنها المنتج — وتمرّر البيئة كوسيط، فلا يُمَس `process.env` ولا تتسرّب حالة بين الاختبارات.

| المتطلب | مُغطّى |
|---|---|
| 11.1 `NODE_ENV` غير موجود → DENY | ✅ 3 اختبارات |
| 11.2 `NODE_ENV` قيمة غير متوقعة → DENY | ✅ 3 (12 إملاءً + staging) |
| 11.3 `REPLIT_DEPLOYMENT` غير موجود → DENY | ✅ |
| 11.4 `REPLIT_DEPLOYMENT` قيمة غير صحيحة → DENY | ✅ 9 قيم |
| 11.5 الإنتاج → DENY | ✅ 3 |
| 11.6 البيئة المصرّح بها → ALLOW | ✅ |
| 11.7 opt-in → ALLOW فقط عند تحقق العقد | ✅ 10 قيم خاطئة مرفوضة |
| 11.8 كل المسارات تستخدم الحارس نفسه | ✅ 4 |
| 11.9 لا مسار يكتب متجاوزاً الحارس | ✅ 5 |

---

## 7. Mutation testing (المتطلب 12)

| # | الطفرة | النتيجة |
|---|---|---|
| 12.a | fail-open: قائمة السماح → اختبار `NODE_ENV === "production"` | ❌ **5 فشل** |
| 12.b | حذف شرط الـopt-in | ❌ **3 فشل** |
| 12.b | حذف شرط `NODE_ENV` | ❌ **8 فشل** |
| 12.b | حذف شرط `REPLIT_DEPLOYMENT` | ❌ **3 فشل** |
| 12.c | قيمة الـopt-in `"true"` → `"1"` | ❌ **5 فشل** |
| 12.c | اسم متغيّر الـopt-in → `ALLOW_SEED` | ❌ **1 فشل** |
| إضافي | `REPLIT_DEPLOYMENT` رجوع إلى `=== "1"` | ❌ **1 فشل** |
| إضافي | تجاوز الحارس في السكربت المستقل | ❌ **1 فشل** |
| إضافي | تجاوز الحارس في `seed-data.ts` | ❌ **1 فشل** |
| إضافي | تجاوز الحارس في الـendpoint الإداري | ❌ **1 فشل** |

**اكتشاف أثناء الـmutation:** طفرة «تجاوز الحارس في السكربت» **نجحت في البداية** — لأن `indexOf` تُرجع `-1` عند غياب الاستدعاء و`-1 < n` صحيح، فتأكيد الترتيب كان يُرضى بحذف الاستدعاء تماماً. صحّحتُ الاختبار (وجود الاستدعاء + الربط بمتغيّر + التفرّع عليه)، وأعدتُ الطفرات الثلاث — كلها تفشل الآن.

`md5sum -c` بعد كل جولة: الملفات الأربعة استُعيدت.

---

## 8. نتائج التشغيل (المتطلبان 13 و14)

```
npm run check:types  ✅ نظيف
npm run server:build ✅ 639.6kb
npm run test:unit    ✅ 2609/2609  (×3 تشغيلات متتالية، بلا تذبذب)
git diff --check     ✅ نظيف
```

**eslint — الملفات المعدَّلة فقط، ولم أُعِد تنسيق أي ملف:**

| الملف | HEAD | الآن |
|---|---|---|
| `shared/seedGuard.mjs` | (جديد) | **0** |
| `shared/seedGuard.d.ts` | (جديد) | **0** |
| `server/env.ts` | 0 | **0** |
| `server/seed-data.ts` | 4 | **3** |
| `scripts/seed-test-data.mjs` | 44 | **44** |

صفر أخطاء جديدة. `server/routes.ts` **لم يُنسَّق ولم يُمَس** في هذه الجولة.

---

## 9. ما لم يُلمس

- **منطق البذر نفسه** (المتطلب 7): حمولة `demoStores` لم تتغيّر بحرف — اختبار يثبّتها. التغيير في **من يُسمح له بالتشغيل** فقط.
- **schema · API · المصادقة · الصلاحيات** (المتطلب 10): نفس المسار، نفس الرمز 403، نفس نص الخطأ، نفس `requireAdminAuth`.
- **`isDevMode` و`isExpoGoSurfaceEnabled`**: عقدان مستقلان، غير مشمولين، واختبار يثبّتهما.
- **H-69 · H-70 · H-79 وأي بند آخر** (المتطلب 20): لم أقترب منها.
- **`.env` و`.env.example`**: لم تُلمَس. `ALLOW_DEMO_SEED` موثَّق داخل `shared/seedGuard.mjs` وفي رسائل الرفض.

---

## 10. تأكيد عدم وجود Firestore writes (المتطلبان 8 و9 و19)

- **لم يُنفَّذ أي seed.** الـendpoint لم يُستدعَ، و`seed-data.ts` لم يُشغَّل.
- شغّلتُ `node scripts/seed-test-data.mjs` مرة واحدة **للتحقق من الحارس نفسه**؛ خرج بـ`exit 1` عند الشرط الأول — **قبل قراءة `FIREBASE_SERVICE_ACCOUNT` وقبل `admin.initializeApp`**. اختبار يثبّت هذا الترتيب.
- **كل الاختبارات نقية**: تستورد وحدة JavaScript وتمرّر كائن بيئة. لا شبكة، ولا Firebase SDK، ولا اعتماد على `process.env`.
- **لا migration، لا حذف، لا تعديل** لأي مستند. لا بيانات موجودة في Firestore تغيّرت.

---

## 11. الخلاصة

| المتطلب | الحالة |
|---|---|
| 1. فحص HEAD أولاً | ✅ منفَّذ جزئياً — أُصلحت 4 فجوات فقط |
| 2. كل مسارات seed | ✅ 3 محروسة، والباقي مُصنَّف |
| 3. DENY-BY-DEFAULT | ✅ على المحاور الثلاثة |
| 4. opt-in صريح | ✅ |
| 5. حارس مشترك | ✅ **تطبيق واحد** يستورده الثلاثة |
| 6. PM2 / Replit / محلي | ✅ مُختبَرة من ملفات النشر ذاتها |
| 7. منطق البذر لم يتغيّر | ✅ |
| 8–9. لا كتابة Firestore | ✅ |
| 10. لا تغيير schema/API/auth | ✅ |
| 11. الاختبارات | ✅ 31 اختباراً، كل البنود التسعة |
| 12. Mutation testing | ✅ 10 طفرات، كلها تفشل |
| 13–14. التشغيل و eslint | ✅ |
| 15. عدّ الاختبارات | ✅ 2607 → 2609 |
| 16–20. لا commit/push/نشر/كتابة/بنود أخرى | ✅ |

**H-68 — CLOSED.**
