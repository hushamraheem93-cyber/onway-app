# Sprint 2 — Feature Inventory and Source of Truth

## 1. الهدف والنطاق

يوثّق هذا الملف الواقع الحالي بعد Sprint 1 لمنصتي الإدارة في OnWay، ويحدد ما هو مشترك وما هو خاص بكل منصة، ومصدر الحقيقة لكل وظيفة، وحدود إعادة الهيكلة المسموح بها في Sprint 2. لا يتضمن هذا المستند بدء Sprint 3، ولا يغيّر منطق الأعمال أو عقود API.

القاعدة المعتمدة هي أن **Backend هو مصدر الحقيقة للبيانات والسياسات والتفويض**، وأن Admin Web هو سطح الإدارة الكامل، بينما Admin Mobile هو سطح تشغيلي مرافق يركز على الأعمال اليومية التي تحتاج إلى تنفيذ سريع من الهاتف. لا تُعدّ إخفاءات الواجهة في أي منصة بديلًا عن حماية Backend عبر RBAC.

## 2. المنصات الحالية

| المنصة | نقطة الدخول | طبيعة التنفيذ | المسؤولية المقترحة في Sprint 2 | الحالة |
|---|---|---|---|---|
| Admin Web | `server/templates/admin.html` | لوحة HTML/JavaScript أحادية الصفحة مع أقسام وModals كثيرة | سطح الإدارة الكامل، إعدادات النظام، التحليلات، الدعم، إدارة المستخدمين الإداريين، والتدقيق | قائم ويحتوي معظم الميزات |
| Admin Mobile | `client/screens/AdminScreen.tsx` مع `client/lib/adminAuth.ts` | شاشة Expo/React Native واحدة مقسمة إلى تبويبات ومكونات فرعية | سطح العمليات اليومية، المتابعة، الإجراءات السريعة، والتعامل الميداني | قائم ويغطي مجموعة كبيرة من الوظائف |
| Backend API | `server/index.ts`, `server/routes.ts`, `server/vendor.ts`, `server/settlement.ts` | Express/Node مع حماية Admin وRBAC وAudit | مصدر الحقيقة الوحيد للبيانات، الصلاحيات، التحقق، والتأثيرات الجانبية | مرجعي وملزم |
| Admin identity | `server/adminAuth.ts`, `server/adminAuthorization.ts`, `server/adminRbac.ts` | JWT Claims + Admin Users + صلاحيات | مصدر الحقيقة للهوية والصلاحية وسريان الجلسات | أُنجز في Sprint 1 |

## 3. جرد ميزات Admin Web

| المجال | القسم أو السطح | الوظائف المرصودة | الاستدعاءات الأساسية | مصدر الحقيقة |
|---|---|---|---|---|
| التشغيل | `dashboard` | مؤشرات عامة، خريطة السائقين، آخر الطلبات، تحديثات سريعة | Dashboard stats، driver activity، orders | Backend؛ العرض في Web |
| الطلبات | `orders` | قائمة الطلبات، الفلاتر، التصدير، التقارير، الأرشفة، تفاصيل الطلب وتغيير حالته | `/api/admin/orders` وعقود الطلبات المرتبطة | Backend والـ ledger عند الأثر المالي |
| العملاء | `appUsers` | إحصاءات العملاء، البحث، الفلاتر، العرض والتصدير | `/api/admin/users` أو مسارات العملاء الحالية | Backend |
| السائقون | `drivers` و`driverQueue` و`driverFinancial` | الموافقة، الحالة، الإضافة، الوثائق، الموقع، الحسابات، الدفع، التعديل، الكشوفات | Drivers، driver activity، driver wallet، orders، settings | Backend؛ أي أثر مالي عبر settlement/ledger |
| التجار | `merchants` | قائمة التجار، الإنشاء والتعديل، المنتجات، الموقع، الكشوفات، إشعارات التاجر | Vendors، vendor products، vendor statements، notifications | Backend |
| المحتوى | `categories`, `banners`, `bestSellers`, `featured`, `discounts`, `promoCodes` | إدارة التصنيفات والبنرات والأقسام الترويجية والخصومات وأكواد الترويج | Categories، banners، promotional sections، promo codes | Backend |
| الموقع | `websiteCms` | محتوى وإحصاءات CMS، إعدادات العرض، النصوص والمؤشرات | CMS/settings endpoints | Backend؛ Web هو سطح التحرير الأساسي |
| التوصيل | `delivery` | مناطق التوصيل والإعدادات المرتبطة بالرسوم والعتبات | Delivery areas، fees/settings | Backend |
| الإشعارات | `notifications` | إرسال broadcast، إحصاءات الإشعارات، نماذج الإرسال | `/api/admin/send-notification`, `/api/admin/notification-stats` | Backend؛ Web هو السطح الكامل |
| العمليات المالية | `financialDashboard` | مؤشرات مالية، سجل تدقيق، receivables، driver owed، مراجعة آثار التعديل | Financial ledger، audit log، settlement | Backend والـ ledger؛ لا يُسمح بحساب مالي مستقل في العميل |
| التسويات | `settlementRequests` | مراجعة الطلبات، اعتماد/إكمال التسوية، سجل التسوية | Settlement requests/config/complete | Backend و`server/settlement.ts` |
| التقييمات | `ratingsManagement` | عرض وإدارة التقييمات، الإنشاء الإداري، الظهور والسبب | Ratings endpoints | Backend |
| الدعم | `supportChat` | قائمة المحادثات، الرسائل، القراءة، الرد، تنظيف المحادثة | `/api/admin/support/chats`, `/api/admin/support/messages/:phone`, `/api/admin/support/read/:phone`, `/api/admin/support/reply` | Backend؛ Web هو السطح الأساسي للدعم |
| إدارة المشرفين | `adminUsers` | قائمة Admin Users، إضافة/تعديل، الدور، الحالة، مصفوفة الصلاحيات | `/api/admin/users` | `adminRbac.ts` وBackend |
| الإعدادات | `settings` | بيانات اعتماد المشرف، إعدادات النظام، رسوم/عتبات وإعدادات تشغيلية | `/api/admin/change-credentials` ومسارات settings | Backend؛ الحقول الحساسة لا تُخزّن في العميل |
| التخزين | قسم/وظائف التخزين | إحصاءات التخزين وإدارة الملفات ذات الصلة | Storage stats/settings | Backend |

## 4. جرد ميزات Admin Mobile

| التبويب | الوظائف الحالية | الصلاحية المقيدة | مسؤولية Mobile المقترحة |
|---|---|---|---|
| `dashboard` | مؤشرات التشغيل والتنبيهات والملخصات | `operations.read` | ملخص سريع قابل للتحديث |
| `orders` | قراءة الطلبات، تغيير الحالة، إسناد السائق، تحديثات التشغيل | `orders.read` | إجراءات يومية سريعة؛ Backend يحسم التفويض |
| `drivers` | قراءة السائقين وتغيير الحالة وبعض إجراءات التشغيل | `drivers.read` | المتابعة والإجراءات الميدانية |
| `users` | قراءة العملاء/المستخدمين | `customers.read` | بحث وعرض مختصر |
| `banners` | قراءة وتعديل/حذف البنرات | `banners.read` | إدارة سريعة للمحتوى |
| `categories` | قراءة وتعديل الأقسام | `categories.read` | إدارة مختصرة |
| `products` | إدارة المنتجات ومنتجات التجار والصور | `products.read` | إجراءات تشغيلية على المنتج |
| `areas` | قراءة وتعديل مناطق التوصيل | `delivery.read` | تعديلات محدودة عند الحاجة |
| `promoCodes` | إدارة الخصومات وأكواد الترويج | `promotions.read` | إدارة مختصرة |
| `notifications` | إرسال إشعارات إدارية | `notifications.read` | إرسال سريع مع نفس حماية Backend |
| `vendors` | قراءة التجار والمنتجات المرتبطة بهم | `merchants.read` | المتابعة والتعديل التشغيلي |
| `settlements` | قراءة التسويات وإكمالها وإدارة الإعدادات المرتبطة بها | `settlements.read` | متابعة واعتماد تشغيلي؛ لا حساب مالي محلي |
| `settings` | قراءة وتعديل الإعدادات المسموح بها | `settings.read` | إعدادات تشغيلية محدودة |
| `storage` | قراءة إحصاءات التخزين | `storage.read` | عرض مختصر |
| `websiteCms` | قراءة/تعديل أجزاء CMS الحالية | `website_cms.read` | دعم محدود؛ Web يبقى سطح التحرير الكامل |

حاليًا تُشتق قائمة التبويبات في `AdminScreen.tsx` من مصفوفة `TABS` وتُصفّى وفق `adminSession.permissions`. هذا السلوك جزء من Sprint 1 ويجب الحفاظ عليه. كما أن `Admin Web` يحتوي على بوابات `data-admin-permission` لبعض عناصر التنقل والنماذج، ويجب عدم اعتبارها حماية مستقلة عن Backend.

## 5. API Inventory مختصر

### 5.1 Admin Web

الاستدعاءات المرصودة مباشرة في قالب Web تشمل: `/api/admin/change-credentials`، و`/api/admin/driver-activity`، و`/api/admin/notification-stats`، و`/api/admin/send-notification`، و`/api/admin/support/chats`، و`/api/admin/support/messages/:phone`، و`/api/admin/support/read/:phone`، و`/api/admin/support/reply`، و`/api/admin/users`، و`/api/admin/vendors`، إضافة إلى مسارات الأقسام المتخصصة التي تُستدعى عبر وظائف JavaScript داخل القالب.

### 5.2 Admin Mobile

يستخدم Mobile عقودًا مشتركة مع Web عبر `fetch` و`apiRequest`، ومن أمثلتها مسارات الطلبات، التسويات، الحسابات، الإعدادات، التخزين، السائقين، البنرات، المنتجات، مناطق التوصيل، الإشعارات، التجار، و`/api/admin/send-notification`. توجد أيضًا مسارات عامة مقيدة مثل `/api/categories` و`/api/settings/fees` و`/api/settings/urgency-thresholds`؛ تبقى مسؤولية تحديد الوصول إليها في Backend ولا تُنقل إلى منطق واجهة Mobile.

## 6. Feature Matrix: Web مقابل Mobile

| الميزة | Web | Mobile | مستوى التطابق | مصدر الحقيقة | القرار في Sprint 2 |
|---|---|---|---|---|---|
| Dashboard والعمليات | كامل، مع خريطة وتحليلات | ملخص تشغيلي | جزئي مقصود | Backend | لا توحيد بصري؛ توحيد العقود فقط |
| الطلبات | كامل وتقارير وتصدير وأرشفة | تشغيل وتحديث وإسناد | متداخل | Backend | إبقاء Web كاملًا وMobile سريعًا |
| السائقون | إدارة وqueue ومالية ووثائق | متابعة وحالات وإجراءات ميدانية | متداخل | Backend | لا نقل للوظائف المالية الكاملة إلى Mobile |
| التجار والمنتجات | إدارة كاملة وModals كثيرة | إدارة تشغيلية مختصرة | متداخل | Backend | Web مصدر التحرير الكامل |
| المحتوى والتسويق | كامل | جزء كبير من الإدارة | متداخل | Backend | الحفاظ على Mobile مع تقليل التكرار لاحقًا |
| الدعم | Chat كامل | غير ظاهر كتَبويب مستقل في `TABS` الحالية | Web-only حاليًا | Backend | لا إضافة Mobile في Sprint 2 دون طلب صريح |
| Admin Users/RBAC | إدارة كاملة | هوية وصلاحيات وتصفية تبويبات | متداخل | `adminRbac.ts` | توحيد contract فقط |
| المالية والتسويات | Dashboard وAudit وتسويات | تسويات وإجراءات محددة | متداخل حساس | ledger/settlement | ممنوع ازدواج الحساب المالي |
| CMS | سطح تحرير كامل | دعم محدود | Web-primary | Backend | لا نقل CMS كاملًا إلى Mobile |
| الإعدادات | كامل | مختصر | Web-primary | Backend | إبقاء Web مصدر الإعداد الكامل |

## 7. Source of Truth النهائي

| نوع المعلومة أو القرار | المصدر الملزم |
|---|---|
| هوية المشرف، الدور، الصلاحيات، وتعطيل الحساب | `server/adminRbac.ts`, `server/adminAuth.ts`, JWT الموقّع |
| السماح أو الرفض لكل مسار Admin | `server/adminAuthorization.ts` وmiddleware Backend |
| بيانات الكيانات والطلبات | Firestore/Backend API |
| الرصيد، التسوية، before/after، وسجل التدقيق | `server/financialLedger.ts` و`server/settlement.ts` |
| حالة الجلسة والإبطال | Backend session claims + revocation state |
| عرض التبويب أو القسم | Client state مشتق من session، لكنه ليس مصدر صلاحية |
| النصوص والتنسيق وتوزيع الشاشة | المنصة نفسها؛ Web وMobile لا يُفترض أن يتطابقا بصريًا |
| عقود HTTP وأسماء الحقول | Backend routes/types والاختبارات |

## 8. قرار Controlled Refactor

لا توجد حاجة إلى إعادة كتابة شاملة أو دمج Admin Web وAdmin Mobile في واجهة واحدة. المسار الآمن هو **Refactor توثيقي وتعاقدي محدود**: تثبيت هذا الجرد، إضافة تعريفات مشتركة غير حساسة لعقود الميزات عند الحاجة، إزالة أي أسماء أو دوال مكررة فقط إذا ثبت أنها لا تغيّر السلوك، والحفاظ على سطح Web الكامل وسطح Mobile التشغيلي.

أي تغيير في مسار أو payload أو صلاحية يجب أن يبدأ باختبار عقدي، ثم يُنفّذ في Backend، ثم تُحدّث المنصتان. لا يُسمح في Sprint 2 بنقل منطق الصلاحيات أو الحسابات المالية أو التدقيق إلى العملاء، ولا بإزالة وظيفة قائمة بحجة التوحيد، ولا ببدء Sprint 3.

## 9. حالة الاكتشاف

اكتملت خريطة الأقسام والتبويبات والاستدعاءات الأساسية. الفجوة المعمارية الرئيسية ليست اختلافًا في مصدر البيانات، بل اختلاف في **عمق السطح**: Web كامل ومفصل، وMobile مختصر وموجه للتشغيل. لذلك سيكون معيار النجاح في Sprint 2 هو وضوح المسؤوليات وتقليل الازدواجية الخطرة، لا إجبار المنصتين على تطابق كامل.
