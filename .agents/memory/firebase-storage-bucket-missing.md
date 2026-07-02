---
name: Firebase Storage bucket not provisioned
description: This project's Firebase project has zero Storage buckets — any code path that calls uploadToFirebaseStorage fails with "The specified bucket does not exist."
---

The Firebase project (`onway-74c20`) has never had Cloud Storage enabled — `storage.getBuckets()` returns an empty list. Any upload through `uploadToFirebaseStorage` (server/firebase.ts) throws "The specified bucket does not exist."

Bucket creation cannot be done programmatically (tried both `<project>.firebasestorage.app` and `<project>.appspot.com` names via the Cloud Storage admin API) — Google requires interactive domain/site ownership verification, which only works from the Firebase Console "Get Started" flow for Storage, done by the project owner.

**Why:** This silently broke vendor product image add/edit (create endpoint returned a raw error, edit endpoint failed to attach new images) because product images relied on `uploadToFirebaseStorage` instead of the project's documented Base64-in-Firestore convention.

**How to apply:** `server/vendor.ts` product images and vendor profile/cover images were migrated to compressed Base64 data URIs (webp, resized, embedded directly in Firestore) to match the rest of the app and avoid depending on Storage. Other remaining `uploadToFirebaseStorage`/`deleteFromFirebaseStorage` call sites (server/routes.ts — banners re: line ~1245, national ID/driver docs in server/firebase.ts) are still on the broken Storage path and will fail the same way until either (a) the user enables Firebase Storage in the Firebase Console, or (b) those paths are also migrated to Base64.
