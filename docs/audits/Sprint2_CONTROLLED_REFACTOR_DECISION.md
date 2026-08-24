# Sprint 2 — Controlled Refactor Decision

## القرار

بعد فحص Admin Web وAdmin Mobile وموارد Backend، لا توجد حاجة إلى إعادة هيكلة سلوكية في Sprint 2. لم يثبت وجود نسخة مستقلة من Order Lifecycle أو Wallet أو Ledger أو Settlement Logic داخل أي من العميلين؛ منطق العمل والتفويض والتدقيق مركزي في Backend.

لذلك تم اختيار **No Behavioural Refactor** بدل نقل أو حذف كود قد يغيّر السلوك. هذا القرار يلتزم بقواعد المهمة: لا حذف لأي واجهة، ولا حذف لأي API، ولا تغيير في Business Logic أو Order Lifecycle أو Finance أو Database schema.

## ما تم تنفيذه فعليًا

تمت إضافة وثائق معمارية وجردية فقط:

| الملف | الغرض |
|---|---|
| `Sprint2_FEATURE_INVENTORY.md` | جرد الميزات، التداخل، API usage، وSource of Truth |
| `Sprint2_ARCHITECTURE_AND_DEPRECATION.md` | مسؤولية Web وMobile، Sitemap، قرارات KEEP/WEB-ONLY، وخطة الإيقاف الآمن |
| `Sprint2_CONTROLLED_REFACTOR_DECISION.md` | توثيق سبب عدم تنفيذ refactor سلوكي |

## ضمانات عدم تغيير السلوك

لم تُحذف routes أو APIs أو بيانات، ولم تُغيّر مخططات Firestore، ولم تُعدّل وظائف الطلبات أو المحافظ أو التسويات أو الأسعار أو العمولات أو تطبيقات العملاء والتجار والسائقين. بقيت RBAC وAuthorization وAudit الخاصة بـ Sprint 1 كما هي.

## شروط أي Refactor مستقبلي

أي إعادة هيكلة لاحقة يجب أن تمر عبر مقارنة consumers في Web وMobile وscripts والاختبارات والمراجع الخارجية وإعدادات النشر، ثم اختبار contract قبل التغيير وبعده. إذا بقيت الملكية أو الاستهلاك غير واضحة، يبقى العنصر في `Candidate for Deprecation` ولا يُحذف.

## نتيجة المرحلة

Sprint 2 يحقق هدف التوحيد عبر تحديد المسؤوليات ومصدر الحقيقة، وليس عبر فرض تطابق بصري أو حذف التداخل الظاهري. المرحلة التالية هي تشغيل الاختبارات والتحقق من Git diff فقط.
