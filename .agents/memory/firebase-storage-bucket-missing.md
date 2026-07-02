---
name: Firebase Storage bucket not provisioned
description: This project's Firebase project has zero Storage buckets — any code path that calls uploadToFirebaseStorage fails with "The specified bucket does not exist."
---

The Firebase project (`onway-74c20`) has never had Cloud Storage enabled — `storage.getBuckets()` returns an empty list. Any upload through `uploadToFirebaseStorage` (server/firebase.ts) throws "The specified bucket does not exist."

Bucket creation cannot be done programmatically (tried both `<project>.firebasestorage.app` and `<project>.appspot.com` names via the Cloud Storage admin API) — Google requires interactive domain/site ownership verification, which only works from the Firebase Console "Get Started" flow for Storage, done by the project owner.

**Why:** This silently broke vendor product image add/edit (create endpoint returned a raw error, edit endpoint failed to attach new images) because product images relied on `uploadToFirebaseStorage` instead of the project's documented Base64-in-Firestore convention.

**How to apply:** `server/vendor.ts` product images and vendor profile/cover images, and the admin panel's `/api/admin/upload-image` (banners/categories/products in `server/routes.ts`), were migrated to compressed Base64 data URIs (webp, resized, embedded directly in Firestore) to match the rest of the app and avoid depending on Storage. Verified working for all three admin image types end-to-end. Remaining `deleteFromFirebaseStorage` calls are safe no-ops on non-Storage-URL strings (guarded by a `firebasestorage.googleapis.com` prefix check), and driver national ID/license images already used Base64-in-JSON, not Storage — no further migration needed unless the user re-enables Storage in the Firebase Console.
