# FINAL_MEDIUM_FIXES.md — M7 و M9

**المرجع:** `FINAL_SADD_AUDIT.md`
**النطاق:** **M7 و M9 فقط** — فهرسان مركّبان مفقودان. لم يُعدَّل أي منطق تطبيق، ولا قواعد Firestore، ولا أي واجهة، ولا أي بند Medium أو Low آخر.
**التاريخ:** 2026-07-26
**الفرع:** `claude/onway-enterprise-review-q1d18o`

---

## ملخّص

| البند | الحالة | الأثر قبل الإصلاح |
|-------|--------|--------------------|
| M7 — فهرس تحليلات التاجر | ✅ مُغلق | `GET /api/vendor/analytics` يرمي `FAILED_PRECONDITION` عند أول استخدام إنتاجي |
| M9 — فهرس تقييمات المتجر | ✅ مُغلق | صفحة تقييمات كل متجر تُرجع نتيجة فارغة بصمت |

**كود الإنتاج المعدَّل:** ملف واحد (`firestore.indexes.json`)، **+28 سطراً**، ثلاثة فهارس مضافة. **صفر تعديلات على أي ملف `.ts` / `.tsx` / `.html` / `.rules`.**

| البوابة | النتيجة |
|---------|---------|
| Typecheck | ✅ نظيف |
| Tests | ✅ **167 ناجح / 0 فاشل** (41 مجموعة) — كانت 160 |
| Build | ✅ `server_dist/index.js` — 531.7 kb |
| Mutation | ✅ **7/7** طفرات تُكتشف |
| حلّ الاستعلامات | ✅ **11/11** استعلاماً مركّباً يجد فهرساً |

---

## M7 — فهرس تحليلات التاجر

### التحقّق من استمرار الخلل
نعم. `server/vendor.ts:2151` (داخل `GET /api/vendor/analytics`):
```ts
const snap = await db.collection("orders")
  .where("vendorId", "==", vid)
  .where("status", "==", "delivered")
  .orderBy("createdAt", "desc")
  .limit(500)
  .get();
```
الفهارس المُعرَّفة على `orders` قبل هذا التغيير: **واحد فقط** — `vendorId ASC, createdAt DESC`.

### السبب الجذري
مساواتان (`vendorId`, `status`) + `orderBy` على حقل ثالث تتطلّب فهرساً مركّباً يحوي **الحقلين معاً** في بادئته ثم حقل الترتيب. الفهرس الموجود يغطّي `vendorId` وحده، فهو **لا يُلبّي** الاستعلام: Firestore ترفضه بـ `FAILED_PRECONDITION`.

هذا فخّ "الفهرس الذي يبدو قريباً بما يكفي" — الوجود السطحي لفهرس على `orders` بحقلَي `vendorId` و`createdAt` يوحي بالتغطية بينما الاستعلام يحتاج شكلاً مختلفاً.

على عكس M8 و M9، هذا الاستعلام **لا يُبتلع خطؤه**: الاستثناء يصعد إلى معالج المسار فيُرجع 500، أي أن شاشة تحليلات التاجر ستكون معطَّلة بوضوح عند أول فتح في الإنتاج.

### الفهرس المُضاف
```json
{
  "collectionGroup": "orders",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "vendorId",  "order": "ASCENDING"  },
    { "fieldPath": "status",    "order": "ASCENDING"  },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```
الفهرس القديم (`vendorId + createdAt`) **أُبقي كما هو** — يخدم استعلامات أخرى على `orders`، وحذفه كان سيكسرها.

---

## M9 — فهرس تقييمات المتجر (مع الصور)

### التحقّق من استمرار الخلل
نعم. `server/routes.ts` داخل `GET /api/stores/:id/ratings`:
```ts
let query = db.collection("ratings")
  .where("vendorId", "==", vendorId)
  .where("hidden",   "==", false)
  .where("deleted",  "==", false);

if (filterParam === "with_images") {
  query = (query as any).where("image", "!=", "");
}
```
الفهارس الموجودة على `ratings` كانت خمسة، ولا واحد منها يغطّي هذه المجموعة:
`vendorId+createdAt` · `stars+createdAt` · `vendorId+stars+createdAt` · `hidden+deleted+createdAt` · `vendorId+hidden+createdAt`.

### السبب الجذري
شكلان مختلفان للاستعلام، وكلاهما بلا تغطية:

1. **الاستعلام الأساسي** — ثلاث مساواتٍ (`vendorId`, `hidden`, `deleted`) بلا ترتيب صريح (الفرز يتمّ في الذاكرة بعد الجلب). يتطلّب فهرساً ببادئة الحقول الثلاثة.
2. **مرشِّح "مع صور"** — يضيف `image != ""`. المتباينة يجب أن تأتي مباشرةً بعد بادئة المساواة في الفهرس، وإلا فالاستعلام مرفوض.

**ملاحظة تصحيحية على وصف التدقيق:** ذكر التدقيق أن الأثر هو "500 على كل صفحة متجر". القراءة الفعلية للكود تُظهر أن المعالج يلتقط الاستثناء ويُرجع حمولة فارغة:
```ts
} catch (err) {
  console.error("GET store ratings:", err);
  res.json({ average: 0, total: 0, breakdown: [], items: [], hasMore: false });
}
```
أي أنه **لا يوجد 500**، بل شيء أسوأ تشخيصياً: **كل متجر في التطبيق يعرض صفر تقييمات** بصمت، بلا أي إشارة إلى وجود خلل. وهذا ينطبق على الاستعلام الأساسي أيضاً — لا على مرشِّح الصور وحده.

### الفهرسان المُضافان
```json
{ "collectionGroup": "ratings",
  "fields": [ vendorId ASC, hidden ASC, deleted ASC ] },

{ "collectionGroup": "ratings",
  "fields": [ vendorId ASC, hidden ASC, deleted ASC, image ASC ] }
```

**لماذا فهرسان لا واحد؟** بند M9 كما ورد يخصّ مرشِّح الصور. لكن أثناء التحقّق تبيّن أن الاستعلام الأساسي — الذي يعمل عند **كل** فتح لصفحة متجر — غير مُغطّى هو الآخر. الاعتماد على أن Firestore ستستخدم بادئة الفهرس الرباعي لخدمة الاستعلام الثلاثي سلوكٌ يعمل عملياً لكنه يترك هامش شكّ في مطابقة الفهارس؛ التصريح بالفهرسين يُزيل الشكّ ويكلّف مدخلاً واحداً إضافياً. كلاهما يخدم النقطة نفسها التي يغطّيها بند M9.

**اتجاه `image`:** تصاعدي، وفي آخر الفهرس. فهرس يضع `image` قبل بادئة المساواة **لا يُلبّي** الاستعلام — ولهذا يوجد اختبار مستقلّ لموضع المتباينة واتجاهها.

---

## الملفات المعدَّلة

| الملف | التغيير |
|-------|---------|
| `firestore.indexes.json` | +28 / −0 · ثلاثة فهارس مضافة (13 → 16) |
| `tests/unit/firestore-indexes.test.mjs` | +135 / −5 · مُحلِّل فهارس + 7 اختبارات جديدة |

لم يُلمس أي ملف آخر. لا منطق تطبيق، لا قواعد، لا واجهات، لا إعادة هيكلة.

---

## التحقّق المُنفَّذ

### 1. البوابات
```
npx tsc --noEmit      → نظيف (عدا خطأَي expo-file-system القائمين قبل كل هذا العمل)
npm run test:unit     → 167 ناجح / 0 فاشل (41 مجموعة)
npm run server:build  → server_dist/index.js — 531.7 kb
npx eslint tests/unit/firestore-indexes.test.mjs → نظيف
```
لا تراجع في أي مجموعة Critical أو High أو M6/M8.

### 2. حلّ الاستعلامات مقابل ملف الفهارس

كُتب مُحلِّل يُطبّق قواعد مطابقة الفهارس المركّبة الموثَّقة من Firestore (بادئة المساواة → المتباينة → حقول الترتيب باتجاهاتها)، وشُغّل على كل استعلام مركّب معروف في الخادم:

```
query                          collection            result
────────────────────────────────────────────────────────────────────────────────
M7  vendor analytics           orders                ✅ [vendorId ASC, status ASC, createdAt DESC]
M9  store ratings (base)       ratings               ✅ [vendorId ASC, hidden ASC, deleted ASC]
M9  store ratings (+images)    ratings               ✅ [vendorId ASC, hidden ASC, deleted ASC, image ASC]
M6  promo dedup                promoUsageHistory     ✅ [userId ASC, promoCode ASC]
M8  FIFO repair                settlementPayments    ✅ [accountKey ASC, fifoApplied ASC, createdAt DESC]
    vendor products            vendorProducts        ✅ [vendorId ASC, status ASC]
    driver queue               drivers               ✅ [isOnline ASC, status ASC]
    delivery batches           delivery_batches      ✅ [driverId ASC, status ASC]
    vendor notifications       vendorNotifications   ✅ [vendorId ASC, status ASC]
    settlements history        settlements           ✅ [accountType ASC, createdAt DESC]
    orders by vendor           orders                ✅ [vendorId ASC, createdAt DESC]
────────────────────────────────────────────────────────────────────────────────
ALL 11 QUERIES RESOLVE
```
الأسطر الستّة الأخيرة تحقّق من عدم كسر أي فهرس قائم أثناء التعديل.

### 3. اختبار الطفرات — 7/7

| الطفرة | النتيجة | الاختبارات التي فشلت |
|--------|---------|----------------------|
| حذف فهرس `orders` الثلاثي | ✅ أحمر | 2 |
| إسقاط `status` منه | ✅ أحمر | 1 |
| جعل `createdAt` تصاعدياً | ✅ أحمر | 1 |
| حذف فهرس التقييمات الأساسي | ✅ أحمر | 1 |
| حذف فهرس "مع صور" | ✅ أحمر | 2 |
| وضع `image` قبل بادئة المساواة | ✅ أحمر | 2 |
| إسقاط `deleted` من فهرس الصور | ✅ أحمر | 1 |

بعد الاسترجاع: 16/16 ناجح.

### 4. ما لم أستطع التحقّق منه — وأقوله صراحةً

طلبتَ التحقّق من أن استعلامَي تحليلات التاجر وتقييمات المتجر **يُنفَّذان دون `FAILED_PRECONDITION`**. **لم أُنفّذ أياً منهما مقابل Firestore حقيقي، ولا أستطيع:**
- لا يوجد `FIREBASE_SERVICE_ACCOUNT` ولا أي بيانات اعتماد إنتاج في هذه البيئة.
- `firebase-tools` غير مُثبَّت، فلا يوجد مُحاكي Firestore محلّي (`firebase emulators:start`) يمكن تشغيل الاستعلامات عليه.

ما قدّمته بديلاً هو **مطابقة ثابتة** لقواعد Firestore الموثَّقة: تُثبت أن تعريف الفهرس يطابق شكل الاستعلام كما هو مكتوب في المصدر اليوم. وهي تُمسك بالخلل الفعلي في M7 و M9 (وأثبتت الطفرات ذلك)، لكنها **ليست تنفيذاً حقيقياً**: لا تثبت أن الفهرس بُني في المشروع، ولا أن الحقول موجودة فعلاً في مستندات الإنتاج، ولا أن الاستعلام يعود بنتائج صحيحة.

**الإثبات الوحيد الحقيقي** هو، بعد النشر:
```bash
firebase deploy --only firestore:indexes
# انتظر حتى تصبح الفهارس Enabled في وحدة تحكّم Firebase، ثم:
#   افتح شاشة تحليلات التاجر  → يجب أن تعرض أرقاماً لا خطأ
#   افتح صفحة تقييمات متجر     → يجب أن تعرض التقييمات لا صفراً
#   فعّل مرشِّح "مع صور"       → يجب أن يعرض التقييمات المصوّرة
```

---

## بنود Medium المتبقّية (15 — لم تُلمس)

| # | البند | الملف |
|---|-------|-------|
| M1 | `assignWaitingBatchToDriver` بلا قفل — دفعات مكرّرة لنفس الطلبات | `routes.ts` |
| M2 | `report-issue` يتجاوز آلة الحالة → `delivered → issue → cancelled` بلا عكس للقيد | `routes.ts` |
| M3 | `adminAdjustLedger` يقبل `NaN` ويكتبه في الدفتر نهائياً | `settlement.ts` |
| M4 | إسناد الطلب قابل للانتحال — لا مقارنة بين `phoneNumber` والهاتف الموثَّق | `routes.ts` |
| M5 | استرداد الكوبون check-then-act بلا مُعرِّف حتمي | `routes.ts` |
| M10 | مصفوفة رسائل `supportChats` غير ذرّية وبلا سقف | `firebase.ts` |
| M11 | التاجر يستطيع كتابة تقييم متجره بنفسه بلا حدّ | `vendor.ts` |
| M12 | تبويب إدارة المحتوى في اللوحة لا يفعل شيئاً ويُبلّغ بالنجاح | `admin.html` |
| M13 | `confirmDelete` بلا فرع `else` على `response.ok` | `admin.html` |
| M14 | استطلاع إشعارات التاجر يُصفّر `isFirstLoad` عند كل تغيّر AppState | `VendorNotificationsContext.tsx` |
| M15 | `uncaughtException` يُسجَّل ويُبتلع — يُعطّل تعافي PM2 | `index.ts` |
| M16 | N+1 عند إنشاء الطلب | `routes.ts` |
| M17 | `/api/admin/dashboard-stats` يُحمّل 5 مجموعات كاملة في الذاكرة | `routes.ts` |
| M18 | `nginx.conf` لا يُحمَّل كما هو موثَّق | `deployment/nginx.conf` |
| M19 | `esbuild`/`compression`/`jsonwebtoken` غير معرَّفة في أي كتلة اعتماديات | `package.json` |

**مُغلقة من Medium حتى الآن: 4** (M6، M7، M8، M9) من أصل 19.

> **الأعلى أثراً ضمن المتبقّي:** `M5` (كوبون أحادي الاستخدام يُسترد مرّتين — سباق check-then-act، ولا يُصلحه فهرس M6)، `M4` (إسناد الطلب قابل للانتحال)، و`M19` (بناء إنتاج نظيف قد يفشل لأن ثلاث اعتماديات مستخدَمة في الإنتاج تُحلّ عبر الوراثة فقط).

## بنود Low المتبقّية (6 — لم تُلمس)

| # | البند | الملف |
|---|-------|-------|
| L1 | مؤقّت/سوكِت GPS للسائق قد يستمرّ بعد "عدم الاتصال" | `DriverHomeScreen.tsx` |
| L2 | `OrderTrackingScreen` بحالة تحميل لا نهائية بلا إعادة محاولة | `OrderTrackingScreen.tsx` |
| L3 | `OrderConfirmationScreen` بحالة تحميل بلا رجوع أو إعادة محاولة | `OrderConfirmationScreen.tsx` |
| L4 | معالجات حفظ تُظهر نجاحاً عند الفشل | `VendorOrdersScreen.tsx` · `admin.html` · `AdminScreen.tsx` |
| L5 | `uncaughtException` يُبتلع (نسخة L من M15) | `index.ts` |
| L6 | `res.status(500).json({error: error.message})` في ~20 معالجاً | `routes.ts` |

> **L6 مُغلق فعلياً** كأثر جانبي لـ H23 (صفر مواضع `error.message` في أي استجابة 5xx). مُدرَج هنا أمانةً مع التدقيق الأصلي لا لأن العمل عليه مطلوب.

---

# Production blockers remaining:
# YES

**مُعطِّل واحد فقط، وهو تشغيلي بالكامل — لا يوجد أي عمل برمجي متبقٍّ عليّ:**

**الفهارس الأربعة (M6, M7, M8, M9) لم تُنشر.** ملف الفهارس **تعريف لا حالة**. حتى تُنفَّذ `firebase deploy --only firestore:indexes` وتبلغ الفهارس حالة **Enabled**، تبقى الأخطاء الأربعة **قائمة حرفياً في الإنتاج** رغم صحّة المستودع:
- تحليلات التاجر ترمي `FAILED_PRECONDITION`،
- كل صفحة تقييمات متجر تعرض صفر تقييمات بصمت،
- الكوبون أحادي الاستخدام قابل للتكرار بلا حدّ،
- إصلاح FIFO لا يعمل.

لا أستطيع تنفيذ هذه الخطوة هنا: لا بيانات اعتماد Firebase ولا `firebase-tools` في هذه البيئة. الخطوة موثَّقة في `DEPLOYMENT_CHECKLIST.md:72`.

**تذكيران إضافيان من المراحل السابقة لا يزالان قائمين:** ضبط `GOOGLE_CLIENT_ID` في بيئة الإنتاج، وتنفيذ قائمة التحقّق اليدوية السبعة في `HIGH_FIXES.md` مقابل Firebase حقيقي.

**ما لم يعد مُعطِّلاً:** صفر Critical · صفر High · M6/M7/M8/M9 مُغلقة في المستودع.

**الطريق إلى NO:**
1. `firebase deploy --only firestore:indexes` + التأكّد من بلوغ الفهارس الستّة عشر حالة Enabled.
2. ضبط `GOOGLE_CLIENT_ID`.
3. تنفيذ التحقّق اليدوي (بما فيه الشاشتان أعلاه).

لم أبدأ Production Validation · لم أدمج إلى `main` · لم أُجرِ أي Kaizen · بقيت على الفرع الحالي.
