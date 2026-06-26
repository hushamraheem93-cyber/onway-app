# OnWay — نظام الاختبار الشامل

## تشغيل الاختبارات

```bash
# جميع الاختبارات (API + Load + Stress)
node tests/run-tests.mjs

# اختبارات API فقط (بدون Load/Stress)
node tests/run-tests.mjs --api

# API + Load فقط
node tests/run-tests.mjs --load

# API + Stress فقط
node tests/run-tests.mjs --stress
```

## ما يتم اختباره

| الملف | المحتوى |
|-------|---------|
| `api/01-public.test.mjs` | الـ Endpoints العامة (categories, banners, stores, products) |
| `api/02-customer.test.mjs` | تدفق الزبون (تسجيل، طلبات، إلغاء، تقييم، بروموكود) |
| `api/03-vendor.test.mjs` | تدفق التاجر (auth، منتجات، طلبات، stats، wallet) |
| `api/04-driver.test.mjs` | تدفق السائق (تسجيل، GPS، toggle-online، earnings) |
| `api/05-admin.test.mjs` | لوحة الإدارة (CRUD كامل لجميع الوحدات) |
| `api/06-e2e.test.mjs` | دورة الطلب الكاملة من الإنشاء حتى التسليم |
| `api/07-security.test.mjs` | الأمان (Auth bypass، Input validation، Access control) |
| `load/load-test.mjs` | اختبار الحمل (حتى 500 طلب متزامن) + Stress Test |

## التقرير

بعد التشغيل يُنشأ تقرير HTML في:
```
tests/reports/latest.html
tests/reports/report-<timestamp>.html
```

## ملاحظات

- الاختبارات تُنشئ بيانات تجريبية (بادئة `TEST_`) وتُنظّفها تلقائياً بعد الانتهاء
- يجب أن يكون الخادم يعمل على المنفذ 5000 قبل التشغيل
- متغيرات البيئة `ADMIN_USERNAME` و`ADMIN_PASSWORD` مطلوبة لاختبارات Admin
