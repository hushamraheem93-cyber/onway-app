# ONWAY — SPRINT 2 FINAL REPORT

**العنوان:** توحيد وتحديد مسؤوليات Admin Web وAdmin Mobile

**حالة Sprint 2:** **PASS WITH WARNINGS**

**النطاق:** Architecture + Feature Inventory + Controlled Refactor فقط. لم يبدأ Sprint 3، ولم تُحذف واجهة أو API أو بيانات، ولم يُنفذ `git commit` أو `git push`.

## الملخص التنفيذي

أظهر الفحص الفعلي للكود الحالي بعد Sprint 1 أن وجود Admin Web وAdmin Mobile ليس تكرارًا يجب حذفه، بل سطحان مختلفان فوق Backend واحد. Admin Web هو مركز التحكم الإداري الكامل، في حين أن Admin Mobile هو واجهة العمليات السريعة أثناء الحركة. لم يثبت وجود تكرار مستقل في Business Logic أو Financial Logic داخل العميلين؛ الاختلاف الحالي في العرض، وعمق البيانات، وتجميع الاستدعاءات، وتجربة الاستخدام.

بناءً على ذلك، كان القرار الآمن هو عدم تنفيذ refactor سلوكي أو حذف أي endpoint. تم تثبيت الجرد، والمعمارية، ومصفوفة المسؤوليات، وخطة الإيقاف الآمن للمرشحين فقط. بقيت تغييرات Sprint 1 الموجودة مسبقًا في working tree كما هي ولم تُخفَ أو تُعدّل لأغراض Sprint 2.

## A — Current Admin Web

### العدد

يحتوي Admin Web على **15 قسمًا ظاهرًا في شريط التنقل الرئيسي**، مع **24 سطح قسم/قسمًا داخليًا فريدًا** عند احتساب الأقسام الثانوية وواجهات Driver Queue وDriver Financial وModals المرتبطة بها.

### قائمة الأقسام والأسطح الفعلية

| المجموعة | الأقسام أو الأسطح المكتشفة |
|---|---|
| Overview | `dashboard` |
| Core Operations | `orders`, `drivers`, `driverQueue`, `delivery`, `supportChat` |
| Partners | `merchants`, `appUsers`، إضافة إلى إدارة السائقين ضمن `drivers` |
| Finance | `financialDashboard`, `driverFinancial`, `settlementRequests`، وكشوفات الحساب داخل Modals |
| Catalog | `categories`, `businessCategories`, `products`, `bestSellers`, `featured` |
| Marketing | `banners`, `discounts`, `promoCodes`, `notifications` |
| System | `ratingsManagement`, `settings`, `adminUsers`، مصفوفة Roles/Permissions، وAudit ضمن السطح المالي |
| CMS and ranking | `websiteCms`, `storeRanking` |

يضم القالب أيضًا Modals كثيرة لإضافة وتعديل التاجر والمنتج والسائق والدفع والتعديل المالي وكشوفات الحساب والتقييم والدعم. لم تُعدّ الـ Modals أقسامًا مستقلة في العدد أعلاه، لكنها جزء من مسؤولية Web الكاملة.

## B — Current Admin Mobile

يحتوي Admin Mobile على **شاشة Admin رئيسية واحدة** هي `client/screens/AdminScreen.tsx`، وتحتوي على **15 تبويبًا فعليًا** تُصفّى حسب `adminSession.permissions`.

| الترتيب | التبويب | الصلاحية المرتبطة |
|---:|---|---|
| 1 | `dashboard` — الرئيسية | `operations.read` |
| 2 | `orders` — الطلبات | `orders.read` |
| 3 | `drivers` — السائقون | `drivers.read` |
| 4 | `users` — المستخدمون | `customers.read` |
| 5 | `banners` — البانرات | `banners.read` |
| 6 | `categories` — الأقسام | `categories.read` |
| 7 | `products` — المنتجات | `products.read` |
| 8 | `areas` — المناطق | `delivery.read` |
| 9 | `promoCodes` — الخصومات | `promotions.read` |
| 10 | `notifications` — الإشعارات | `notifications.read` |
| 11 | `vendors` — المتاجر | `merchants.read` |
| 12 | `settlements` — التسويات | `settlements.read` |
| 13 | `settings` — الإعدادات | `settings.read` |
| 14 | `storage` — التخزين | `storage.read` |
| 15 | `websiteCms` — الموقع | `website_cms.read` |

لا يوجد تبويب دعم مستقل في مصفوفة `TABS` الحالية، ولذلك لم تُضف وظيفة دعم جديدة إلى Mobile في Sprint 2. كما لم تُضف Live Map أو Analytics أو Driver Performance.

## C — Feature Overlap

| Feature | Admin Web | Admin Mobile | مستوى التداخل | القرار |
|---|---|---|---|---|
| Orders | إدارة كاملة، تقارير، تصدير، أرشفة، تفاصيل | عرض، تحديث حالة، إسناد سائق، متابعة | مرتفع وظيفيًا | **KEEP**؛ Web كامل وMobile تشغيلي |
| Drivers | إدارة، Queue، وثائق، مالية، موقع | حالة وإجراءات سريعة | متوسط | **KEEP**؛ لا نقل للتقارير المالية الكاملة |
| Merchants | تحرير كامل، منتجات، موقع، كشوفات، إشعارات | متابعة وإدارة مختصرة | متوسط | **KEEP**؛ Web مصدر التحرير الكامل |
| Customers/Users | إحصاءات وبحث وفلاتر وتصدير | قراءة وعرض | جزئي | **KEEP**؛ اختلاف UX مقصود |
| Finance | Dashboard، Audit، مؤشرات، كشوفات | وظائف مالية وتسويات محدودة | حساس ومتداخل | **KEEP**؛ الحساب والقرار في Backend |
| Settlements | مراجعة وإكمال وإعدادات | متابعة وتنفيذ مدعوم | متداخل | **KEEP**؛ نفس authorization |
| Categories/Products | تحرير كامل | تحرير سريع | مرتفع | **KEEP**؛ لا حذف API |
| Notifications | Broadcast وإحصاءات ونموذج كامل | إرسال إداري سريع | متوسط | **KEEP** |
| Settings | إعدادات كاملة وبيانات اعتماد | إعدادات مختصرة | جزئي | **WEB-PRIMARY** |
| Support Chat | قائمة محادثات ورسائل وقراءة ورد وتنظيف | غير موجود كتبويب مستقل | Web-only حاليًا | **WEB-ONLY** |
| Admin Users/RBAC | CRUD للأدمن ومصفوفة صلاحيات | هوية وصلاحيات وتصفية تبويبات | متداخل أمنيًا | **WEB-PRIMARY** للإدارة؛ Backend مشترك |
| CMS | تحرير واسع | دعم محدود | جزئي | **WEB-PRIMARY** |

## D — API Overlap

أُجريت مقارنة نصية مطبّعة للاستدعاءات الفعلية في قالب Web و`AdminScreen.tsx`. نتج **تداخل حرفي مباشر مؤكد في مسارين**:

| API مشتركة حرفيًا | الاستخدام |
|---|---|
| `/api/admin/send-notification` | إرسال إشعار إداري من Web وMobile |
| `/api/admin/users` | استخدام مسار المستخدمين في كلا السطحين بحسب سياق الإدارة |

توجد أيضًا ميزات متقابلة على مستوى المورد، مثل Orders وDrivers وVendors وProducts وSettings وSettlements، لكن Web يستعمل في مواضع كثيرة helpers داخل قالب HTML، بينما Mobile يستعمل `fetch` و`apiRequest` وReact Query. لذلك لا يُعلن عن تطابق endpoint حرفي حيث لم يثبت من الكود النصي مباشرة.

هذا الاختلاف لا يبرر حذف API. التوصية هي اعتبار Backend route contracts مصدر الحقيقة، ثم توحيد adapters أو أسماء العقود في مهمة مستقلة فقط إذا أثبتت اختبارات contract أن الوظيفة نفسها تستخدم endpointين مختلفين دون سبب.

## E — Business Logic Duplication

لم يثبت وجود منطق مكرر مستقل في Web وMobile لـ Order Lifecycle أو Wallet أو Ledger أو Settlement أو Pricing أو Commission. منطق المال والتدقيق والتفويض موجود في Backend، بينما العملاء ينفذون orchestration للطلبات والعرض والتحديث.

النتيجة هي **عدم وجود Business Logic Duplication مؤكدة تستدعي نقلًا أو دمجًا في Sprint 2**. الاختلافات الحالية في Presentation وUX وتجميع البيانات، وهي اختلافات مقبولة ما دامت النتيجة والسياسة تُحسمان في Backend.

## F — Final Responsibility

### Admin Web — Primary Admin Control Center

Web هو الواجهة الكاملة للإدارة، ويملك المساحات الكبيرة والجداول والتقارير والتصدير والعمليات الجماعية وSupport Chat وCMS وإدارة Admin Users والتدقيق المالي وواجهات الإعدادات. Web هو سطح التحرير والتحليل الأساسي عندما تكون الشاشة الكبيرة مطلوبة.

### Admin Mobile — Admin Operations Interface

Mobile هو واجهة العمليات السريعة أثناء الحركة. يركز على Dashboard وOrders وDrivers وMerchants وSettlements وNotifications والإجراءات المختصرة التي يحتاجها المسؤول ميدانيًا. لا ينبغي تحويله إلى نسخة مصغرة من Web، ولا ينبغي إضافة وظائف جديدة غير موجودة في Sprint 2.

## G — Source of Truth

```text
Backend = Business Logic Source of Truth
Web = Primary Admin Control Center
Mobile = Admin Operations Interface
```

| القرار | مصدر الحقيقة |
|---|---|
| Business Rules والبيانات | Backend API وFirestore عبر الخادم |
| Admin identity وRBAC | `server/adminAuth.ts`, `server/adminRbac.ts`, JWT Claims |
| Authorization النهائي | `server/adminAuthorization.ts` |
| Ledger وWallet وSettlement وAudit | `server/financialLedger.ts` و`server/settlement.ts` |
| عرض التبويب أو القسم | حالة العميل المشتقة من Claims؛ ليست حماية مستقلة |
| UX والنصوص والتخطيط | المنصة نفسها، مع توحيد المصطلحات والعقود عند الحاجة |

لا يوجد سبب تقني يمنع هذه البنية. الاختلاف بين السطحين يجب أن يبقى في Presentation/UX، وليس في Business Logic أو Financial Logic أو Authorization Logic.

## H — Deprecation Candidates

لا يوجد عنصر مؤهل للحذف في Sprint 2، ولا توجد route أو API أو بيانات محذوفة.

| المرشح المستقبلي | الحالة الحالية | الإجراء الآمن المقترح |
|---|---|---|
| أي API تبدو Web-only أو Mobile-only | Candidate for Deprecation فقط؛ قد يكون لها scripts أو clients خارجية | حصر Web/Mobile/tests/scripts/docs/deployment/external references قبل أي قرار |
| أي helper أو query key مكرر | قد يكون adapter خاصًا بالمنصة وليس Business Logic مكررًا | توحيد contract واختباره قبل إزالة القديم |
| Support على Mobile | غير موجود كتَبويب مستقل في الكود الحالي | يبقى Web-only؛ لا يُضاف أو يُحذف ضمن Sprint 2 |

خطة أي إيقاف مستقبلي هي: `Current → Deprecated → Migration → Verify no consumers → Remove`.

## I — Changes Implemented

التغييرات الخاصة بـ Sprint 2 كانت توثيقية ومعمارية، لأن التحليل لم يثبت حاجة إلى refactor سلوكي:

| التغيير | النتيجة |
|---|---|
| Feature Inventory | تم إنشاء جرد فعلي للأقسام والتبويبات والميزات ومصادر الحقيقة |
| Architecture | تم تثبيت مسؤولية Web وMobile وعلاقة Backend بهما |
| API Overlap analysis | تم توثيق التداخل الحرفي المؤكد والتداخل على مستوى المورد دون حذف |
| Deprecation Plan | تم توثيق المرشحين وخطوات الإيقاف الآمن دون تنفيذ إزالة |
| Controlled Refactor decision | تم توثيق قرار No Behavioural Refactor حفاظًا على Sprint 1 والمال والطلبات |
| Code behavior | لم يتغير Order Lifecycle أو Wallet أو Ledger أو Settlement أو Pricing أو Commission |

## J — Files Changed

### ملفات Sprint 2 المضافة

| الملف | السبب |
|---|---|
| `Sprint2_FEATURE_INVENTORY.md` | الجرد الكامل ومصفوفة الميزات ومصدر الحقيقة |
| `Sprint2_ARCHITECTURE_AND_DEPRECATION.md` | المعمارية النهائية، Sitemap، المسؤوليات، وخطة الإيقاف |
| `Sprint2_CONTROLLED_REFACTOR_DECISION.md` | سبب عدم تنفيذ refactor سلوكي |
| `Sprint2_API_OVERLAP.txt` | نتيجة مقارنة API المطبعّة |
| `Sprint2_FINAL_REPORT.md` | التقرير النهائي الحالي |
| `Sprint2_discovery_inventory.txt` | أثر اكتشاف حالة Git والأقسام والإجراءات |
| `Sprint2_mobile_inventory.txt` | جرد Mobile المحفوظ |
| `Sprint2_mobile_tabs.txt` | قائمة التبويبات والصلاحيات |
| `Sprint2_web_apis_complete_definitive_ultimate_exhaustive_ultimate_exhaustive_ultimate_final.txt` | أثر استخراج Web API الأخير |
| `Sprint2_check_types.log` | سجل typecheck |
| `Sprint2_server_build.log` | سجل بناء الخادم |
| `Sprint2_targeted_tests.log` | سجل الاختبارات المستهدفة |
| `Sprint2_full_unit.log` | سجل suite الوحدة الكامل |
| `Sprint2_diff_check.log` | سجل فحص whitespace/diff |
| `Sprint2_diff_stat.log` | سجل إحصاء diff |
| `Sprint2_git_status.log` | سجل حالة Git |

### ملفات Sprint 1 الموجودة مسبقًا في working tree

هذه الملفات كانت معدّلة أو مضافة قبل Sprint 2، ولم تُعدّل في Sprint 2 إلا من حيث القراءة والتحقق: `client/lib/adminAuth.ts`, `client/screens/AdminScreen.tsx`, `firestore.rules`, `package-lock.json`, `package.json`, `scripts/backfill-order-vendor-ids.mjs`, `server/adminAuth.ts`, `server/financialLedger.ts`, `server/index.ts`, `server/routes.ts`, `server/settlement.ts`, `server/templates/admin.html`, `tests/unit/admin-audit-export.test.mjs`, `tests/unit/admin-query-gating.test.mjs`, `tests/unit/financial-failure-not-zero.test.mjs`, `tests/unit/h51-admin-session-helper.test.mjs`, `tests/unit/h64-admin-dashboard-sync.test.mjs`, `tests/unit/h65-adminscreen-decomposition.test.mjs`, `tests/unit/identity-boundaries.test.mjs`, `tests/unit/jwt-hardening.test.mjs`, `tests/unit/ledger-adjustment.test.mjs`, `tests/unit/vendor-order-scope.test.mjs`, `tests/utils/helpers.mjs`, إضافة إلى ملفات Sprint 1 الخاصة بالتدقيق والاختبارات والتحقق.

### الملفات المحذوفة

لا توجد ملفات محذوفة بسبب Sprint 2، ولم تُحذف أي API أو route أو بيانات.

## K — Tests

| Test | Result |
|---|---|
| `npm run check:types` | **PASS** |
| `npm run server:build` | **PASS** |
| Sprint 1 regression / targeted Admin suite | **PASS — 328/328** |
| Admin Web structural/contract coverage | **PASS** ضمن الاختبارات المستهدفة؛ لم تُجرَ إعادة تصميم أو تغيير سلوكي |
| Admin Mobile structural/permission coverage | **PASS** ضمن الاختبارات المستهدفة؛ التبويبات ما زالت تُصفّى بالصلاحيات |
| Full Unit | **PASS — 3,137/3,137** |
| `git diff --check` | **PASS** |

لم ينخفض عدد اختبارات الوحدة عن baseline Sprint 1، ولم تُسجل Regression جديدة. مدة suite الوحدة الأخيرة كانت نحو 28.4 ثانية، وانتهت جميع الاختبارات دون فشل أو إلغاء أو تخطي.

## L — Risks

الخطر المتبقي الرئيسي هو أن بعض Web API تُركّب داخل helpers أو وظائف JavaScript في قالب HTML، ولذلك يحتاج أي توحيد مستقبلي لمسارات متقابلة إلى contract tests إضافية قبل إعلان التطابق أو حذف endpoint. كما أن التقرير يثبت الحالة من الكود والاختبارات المحلية، وليس اختبارًا تشغيليًا لحسابات إنتاجية أو sessions حقيقية.

يوجد أيضًا working tree غير نظيف لأن تغييرات Sprint 1 والوثائق المرتبطة بها بقيت دون commit كما طُلب. من بينها تغيير كبير في `package-lock.json` مرتبط بتهيئة أدوات Sprint 1؛ لم يتم إخفاؤه أو إعادة كتابته في Sprint 2. لا يمثل ذلك تغييرًا سلوكيًا جديدًا في Sprint 2.

## Final Status

**SPRINT 2 STATUS: PASS WITH WARNINGS**

تم تحديد مسؤولية Web وMobile بوضوح، وتثبيت Backend كمصدر الحقيقة، وإثبات اشتراكهما في Authorization عبر Backend وClaims، وعدم إثبات Business Logic مختلف غير مبرر، وعدم حذف API، وعدم المساس بالمالية أو الطلبات أو تطبيقات Merchant/Driver/Customer، وبقاء Sprint 1 ناجحًا.

يتوقف العمل هنا حسب التعليمات. لا يبدأ Sprint 3، ولا Finance UX، ولا Vendor Ledger، ولا Driver Settlement History، ولا Live Map، ولا Driver Performance، ولا Analytics، ولا Dark Mode.

## References

1. [Sprint 2 requirements](../upload/pasted_content_4.txt)
2. [`Sprint2_FEATURE_INVENTORY.md`](Sprint2_FEATURE_INVENTORY.md)
3. [`Sprint2_ARCHITECTURE_AND_DEPRECATION.md`](Sprint2_ARCHITECTURE_AND_DEPRECATION.md)
4. [`Sprint2_CONTROLLED_REFACTOR_DECISION.md`](Sprint2_CONTROLLED_REFACTOR_DECISION.md)
5. [`Sprint2_API_OVERLAP.txt`](Sprint2_API_OVERLAP.txt)
6. [`server/adminAuthorization.ts`](server/adminAuthorization.ts)
7. [`server/adminRbac.ts`](server/adminRbac.ts)
8. [`client/screens/AdminScreen.tsx`](client/screens/AdminScreen.tsx)
9. [`server/templates/admin.html`](server/templates/admin.html)
