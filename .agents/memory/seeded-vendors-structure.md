---
name: Seeded vendors Firestore structure
description: How seeded (catalog) vendors differ from registered vendor users, and fixes applied.
---

## المشكلة الأصلية

الـ vendors المبذورة كانت لديها حقول مختلفة عن الـ vendors المسجّلين:

| الحقل | vendor مبذور | vendor مسجّل |
|-------|-------------|--------------|
| الاسم | `name` | `storeName` |
| الحالة | `isOpen: true` (بدون `status`) | `status: "active"` |
| المعرّف | لا يوجد `id` في البيانات | `id` موجود في البيانات |

`getCachedStores()` كانت تُصفّي على `status === "active"` وتقرأ `storeName` فقط.

## الإصلاحات المُطبَّقة (July 2026)

1. **Firestore batch update**: أُضيف لكل vendor مبذور:
   - `status: "active"`
   - `storeName = name`
   - `isApproved: true`
   - `id = doc.id` (Firestore document ID)
   - `totalProducts` = العدد الفعلي من collection `products`

2. **getCachedStores() في routes.ts**: 
   - `const storeName = v.storeName || v.name || ""`
   - `const id = v.id || d.id`
   - أُضيف `coverImageUrl: v.coverImageUrl || v.image`
   - أُضيف `sortOrder` و `isOpen`
   - الترتيب بـ `sortOrder` ثم `approvedAt`

**Why:** `getCachedStores` تقرأ من collection `vendors` where `status == "active"`. الـ vendors المبذورة لم تكن تُطابق هذا الشرط.

**How to apply:** أي vendor مبذور جديد يجب أن يحتوي على `status: "active"`, `storeName`, `id` داخل بيانات الوثيقة.
