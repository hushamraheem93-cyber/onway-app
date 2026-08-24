# Sprint 2 — Architecture, Responsibility, Sitemap and Deprecation Plan

## 1. القرار المعماري

يعتمد OnWay في Sprint 2 على ثلاث طبقات واضحة:

```text
                         Backend API
                              │
                 Business Rules + RBAC + Audit
                              │
                 ┌────────────┴────────────┐
                 │                         │
          Admin Web                   Admin Mobile
     Primary Admin Control Center   Admin Operations Interface
           UI/UX كاملة                 UI/UX سريعة وميدانية
```

> **Backend = Business Logic Source of Truth**. Web وMobile يعرضان وينفذان عبر العقود نفسها، ولا يملكان نسخة مستقلة من قواعد الطلبات أو المحافظ أو التسويات أو التفويض.

لا توجد في نتيجة الاكتشاف حاجة آمنة إلى دمج التطبيقين أو حذف أحدهما. الاختلاف الحالي في العمق والسياق: Web يقدم لوحة إدارة شاملة، بينما Mobile يقدم مجموعة تبويبات واسعة ولكنها مهيأة للاستخدام السريع من الهاتف.

## 2. مسؤولية Admin Web

يُعتمد Admin Web بوصفه **PRIMARY ADMIN CONTROL CENTER**. وهو سطح الإدارة الكامل لأن الكود الحالي يحتوي على أقسام كبيرة، جداول، تقارير، Modals، عمليات bulk/export، إدارة الدعم، CMS، السجل المالي، إدارة Admin Users، ومصفوفة الأدوار والصلاحيات.

### Sitemap الفعلي النهائي لـ Admin Web

| المجموعة | الأقسام الفعلية في الكود | القرار |
|---|---|---|
| Overview | `dashboard` | Web-primary، مع ملخص Mobile موازي |
| Core Operations | `orders`, `drivers`, `driverQueue`, `delivery`, `supportChat` | Web كامل؛ Mobile يقدم العمليات السريعة حيث توجد |
| Partners | `merchants`, `appUsers`, `drivers` | Web كامل؛ Mobile يقدم العرض والإجراءات المختصرة |
| Finance | `financialDashboard`, `driverFinancial`, `settlementRequests`، وكشوفات الحساب داخل Modals | Web-primary للتقارير والتدقيق؛ Mobile يقتصر على ما تدعمه الصلاحية والواجهة الحالية |
| Catalog | `categories`, `businessCategories`, `products`, `bestSellers`, `featured` | Web-primary للتحرير الكامل؛ لا حذف من Mobile |
| Marketing | `banners`, `discounts`, `promoCodes`, `notifications` | Shared جزئيًا؛ Web كامل وMobile سريع |
| System | `ratingsManagement`, `settings`, `adminUsers`, مصفوفة Roles/Permissions، Audit داخل Financial Dashboard | Web-primary، مع إبقاء الحماية Backend مشتركة |
| CMS | `websiteCms`, `storeRanking` حيث تظهر داخل الكود | Web-primary؛ Mobile يدعم `websiteCms` الحالي فقط |

توجد أقسام أو أسطح إضافية داخل القالب مثل `storeRanking` و`businessCategories` وبعض Modals المتخصصة. تُعامل كجزء من Web-primary عندما تكون ظاهرة أو مستعملة فعليًا، ولا تُعتبر سببًا لإضافة تبويبات جديدة إلى Mobile.

## 3. مسؤولية Admin Mobile

يُعتمد Admin Mobile بوصفه **ADMIN OPERATIONS MOBILE** وليس نسخة مصغرة من Web. الأولوية هي متابعة التشغيل أثناء الحركة، وقراءة المؤشرات، وتحديث الطلبات، وإسناد السائقين، وتغيير حالات التشغيل، ومراجعة التسويات والإشعارات ضمن الصلاحيات الحالية.

### Sitemap الفعلي النهائي لـ Admin Mobile

| الترتيب التشغيلي | التبويب الفعلي | المسؤولية |
|---:|---|---|
| 1 | `dashboard` | KPIs وملخصات وتنبيهات التشغيل |
| 2 | `orders` | عرض الطلبات، تحديث الحالة، إسناد السائق، والمتابعة |
| 3 | `drivers` | متابعة السائقين، الحالة، والإجراءات السريعة |
| 4 | `users` | قراءة العملاء والمستخدمين |
| 5 | `vendors` | متابعة المتاجر وإجراءاتها المختصرة |
| 6 | `settlements` | متابعة التسويات وتنفيذ الإجراء المدعوم بالصلاحية |
| 7 | `notifications` | إرسال الإشعارات الإدارية |
| 8 | `banners`, `categories`, `products`, `areas`, `promoCodes` | إدارة سريعة للمحتوى والبيانات التشغيلية الموجودة فعليًا |
| 9 | `settings`, `storage`, `websiteCms` | إعدادات وقراءة مختصرة حسب الصلاحية |

لا يوجد تبويب دعم مستقل في مصفوفة `TABS` الحالية، ولذلك لا تُضاف وظيفة دعم جديدة إلى Mobile في Sprint 2. كما لا تُضاف Live Map أو Analytics أو Driver Performance جديدة؛ ما يوجد حاليًا فقط يُوثق ويُحافظ عليه.

## 4. Feature Overlap وقرارات KEEP/MERGE/WEB-ONLY/MOBILE-ONLY

| الميزة | وضع Web | وضع Mobile | نفس Business Logic؟ | القرار |
|---|---|---|---|---|
| Dashboard | مؤشرات وخريطة وتحليلات وطلبات حديثة | مؤشرات وملخصات تشغيلية | نعم، عبر Backend | **KEEP** على المنصتين بواجهتين مختلفتين |
| Orders | إدارة وتقارير وتصدير وأرشفة وتفاصيل | قراءة وتحديث وإسناد ومتابعة | نعم، عبر API وBackend | **KEEP**؛ Web كامل وMobile تشغيلي |
| Drivers | إدارة وqueue ومالية ووثائق وموقع | حالة وإجراءات ميدانية | نعم، عبر Backend | **KEEP** دون نقل التقارير المالية الكاملة |
| Merchants | تحرير كامل ومنتجات وكشوفات وإشعارات | متابعة وإدارة سريعة | نعم | **KEEP**؛ Web مصدر التحرير الكامل |
| Finance | Dashboard وAudit وكشوفات | وظائف مالية وتسويات محدودة | نعم، والـ ledger مركزي | **KEEP** مع منع أي حساب مالي محلي |
| Settlements | مراجعة وإكمال وإعدادات وتقارير | متابعة وتنفيذ مدعوم | نعم | **KEEP**؛ نفس authorization |
| Categories/Products | تحرير كامل | تحرير سريع | نعم | **KEEP**، لا حذف API أو سطح قائم |
| Notifications | broadcast وإحصاءات ونماذج كاملة | إرسال إداري | نعم | **KEEP**، Web للتفصيل وMobile للسرعة |
| Settings | إعدادات كاملة وبيانات اعتماد | إعدادات مختصرة | نعم | **WEB-PRIMARY** وليس حذف Mobile |
| Support Chat | قائمة ورسائل وقراءة ورد وتنظيف | لا تبويب مستقل حاليًا | Backend مشترك عند وجود العميل | **WEB-ONLY** حاليًا؛ لا إضافة Mobile في Sprint 2 |
| Admin Users/RBAC | CRUD ومصفوفة أدوار | هوية وتصفية تبويبات | نعم، Backend هو الحكم | **WEB-PRIMARY** للإدارة؛ Mobile يستهلك Claims |
| CMS | تحرير واسع | `websiteCms` محدود | نعم | **WEB-PRIMARY** للتحرير |

## 5. API Overlap

تمت مقارنة الاستدعاءات الموجودة في الكود الحالي، لا أسماء الميزات فقط. التداخل المباشر المرصود بين Admin Web وAdmin Mobile هو:

| API مشتركة مباشرة | الاستخدام |
|---|---|
| `/api/admin/send-notification` | Web وMobile يرسلان إشعارًا إداريًا |
| `/api/admin/users` | Web يدير Admin Users/ويستعمل بيانات المستخدمين بحسب السياق، وMobile يقرأ مستخدمي التطبيق وفق المسار الموجود |

كما يشترك الطرفان على مستوى العقد الخلفي الأوسع في موارد مثل orders وdrivers وvendors وproducts وsettings، لكن Web يستخدم في أجزاء كثيرة وظائف داخل قالب HTML، بينما Mobile يستخدم `fetch` و`apiRequest` وReact Query. اختلاف الاستدعاء أو query key ليس اختلافًا في Business Logic بحد ذاته.

لا يُحذف أي API بسبب تداخل اسمي. قبل أي حذف مستقبلي يجب فحص Web consumers وMobile consumers والاختبارات والـ scripts والمراجع الخارجية والتوثيق وإعدادات النشر.

## 6. Authorization Consistency

يستخدم الطرفان هوية Admin التي يصدرها Backend بعد Sprint 1. في Web تُستخدم بوابات `data-admin-permission` وبعض حالات الصلاحية، وفي Mobile تُصفّى `TABS` عبر `adminSession.permissions`. هذه آليات عرض فقط؛ الحكم النهائي هو `server/adminAuthorization.ts` وRBAC في Backend.

إذا احتاجت الوظيفة نفسها إلى صلاحية مثل `orders.read` أو `drivers.read` أو `settlements.read`، فلا يجوز أن يقرر Web أو Mobile صلاحية مختلفة. يُسمح باختلاف الواجهة أو إخفاء زر لا يظهر في سطح معين، ولا يُسمح بتجاوز Backend عبر إخفاء شكلي أو endpoint بديل غير محمي.

## 7. Business Logic Duplication

لم يظهر في الاكتشاف دليل على وجود نسختين مستقلتين من منطق الطلبات أو المحافظ أو التسويات داخل العملاء. الاختلاف الموجود هو في العرض، وتجميع البيانات، وترتيب الخطوات، وبعض query keys ومسارات الاستدعاء المساندة. منطق المال والتسويات والتدقيق والتفويض موجود في Backend، ولذلك لا يلزم Controlled Refactor لنقل Business Logic في Sprint 2.

القرار هو **عدم تعديل Business Logic**. أي refactor في هذه المرحلة سيكون توثيقيًا وتعاقديًا فقط، لتقليل الالتباس دون تغيير النتائج أو دورة الطلب أو الحسابات المالية.

## 8. Deprecation Plan

لا توجد وظيفة أو API تستوفي شرط الإيقاف الآمن في Sprint 2. لذلك لا توجد عناصر محذوفة ولا routes محذوفة.

### Candidate for Deprecation لاحقًا

| المرشح | لماذا هو مرشح فقط؟ | المستهلكون الواجب فحصهم | المخاطر | خطوات الإيقاف المقترحة |
|---|---|---|---|---|
| أي endpoint إداري يبدو Web-only أو Mobile-only | قد تكون له scripts أو clients خارجية غير ظاهرة في الواجهتين | Web، Mobile، tests، scripts، docs، deployment، external references | كسر تكامل أو وظيفة مخفية | Current → إضافة telemetry/توثيق → Deprecated → حصر consumers → Migration → Verify no consumers → Remove |
| أي query key أو helper مكرر بين عميلَي Admin | التكرار قد يكون Adapter خاصًا بالمنصة وليس duplication في Business Logic | كل استدعاءات `fetch` و`apiRequest` والاختبارات | اختلاف cache أو stale data | توحيد contract أولًا → اختبار → نقل Adapter فقط → حذف القديم بعد التحقق |
| Support على Mobile | غير موجود حاليًا كميزة مستقلة، وليس حذفًا مقترحًا | لا يوجد consumer مثبت في `TABS` الحالية | إضافة غير مطلوبة توسّع النطاق | يبقى Web-only؛ أي نقل مستقبلي يحتاج قرارًا مستقلًا واختبارات |

## 9. UX Consistency Backlog

يجب توحيد المصطلحات ودلالات الحالة في مهمة لاحقة أو patch صغير مبرر، دون إعادة تصميم الآن. النقاط التي ينبغي مراجعتها هي أسماء حالات الطلب، رسائل النجاح والفشل، أسماء الصلاحيات، وعرض التسوية والتعديل المالي. لا تُعد هذه النقاط سببًا لتغيير المنطق في Sprint 2.

## 10. Controlled Refactor المنفّذ

لم تُنفذ إعادة هيكلة سلوكية في Sprint 2 لأن الكود الحالي يحقق فصلًا عمليًا مناسبًا: Backend يملك قواعد العمل، Web يملك السطح الكامل، وMobile يملك السطح التشغيلي. التغيير الآمن المنفّذ حتى الآن هو إنتاج وثيقتي الاكتشاف والجرد وهذه المعمارية، مع عدم حذف API أو تغيير schema أو تعديل order lifecycle أو wallet أو ledger أو settlement.

أي تعديل برمجي لاحق في Sprint 2 يجب أن يحقق واحدًا من الشروط التالية فقط: إزالة تكرار غير سلوكي، توحيد اسم عقد أو adapter دون تغيير payload semantics، أو إصلاح regression مثبتة مباشرة بمهمة التوحيد. خلاف ذلك يُرحّل إلى Sprint مستقل.

## 11. حدود Sprint 2

لا يشمل هذا القرار Finance UX جديدة، Vendor Ledger جديدًا، Driver Settlement History، Live Map جديدة، Driver Performance، Analytics، أو Dark Mode. كما لا يشمل حذف Admin Mobile أو Admin Web، ولا حذف APIs أو بيانات، ولا commit أو push.
