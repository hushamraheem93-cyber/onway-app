---
name: Firebase Storage bucket
description: GCS bucket for OnWay media uploads — bucket name, init pattern, and why domain-named buckets failed.
---

## الـ Bucket النشط

`onway-media-onway74c20`

URL pattern: `https://firebasestorage.googleapis.com/v0/b/onway-media-onway74c20/o/{path}?alt=media&token={token}`

## سبب الاسم الغير-Firebase

الـ Firebase-branded buckets (`.firebasestorage.app` و `.appspot.com`) تتطلب Domain Ownership Verification.  
تم إنشاء bucket بـ GCS مباشرة باسم `onway-media-{projectId.replace(/[^a-z0-9]/g,"")}`.

## التهيئة في server/firebase.ts

```typescript
storageBucket: `onway-media-${serviceAccount.project_id.replace(/[^a-z0-9]/g, "")}`,
```

**Why:** `project_id = onway-74c20` → after replace → `onway74c20` → bucket name: `onway-media-onway74c20`

## صلاحيات IAM

Service account ليس لديه `storage.buckets.setIamPolicy` — لذا الصور تُخدَم عبر **download tokens** فقط (مُدرَج في URL). الصور لا يمكن الوصول إليها بدون التوكن.

**How to apply:** أي upload جديد عبر `uploadToFirebaseStorage()` يعمل تلقائياً مع هذا الـ bucket. الـ fallback لـ Base64 لا يزال موجوداً إذا فشل الـ bucket.
