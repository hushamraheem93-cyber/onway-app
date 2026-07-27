---
name: Image upload Storage fix
description: Root cause and fix for images being stored as /uploads/ paths or Base64 instead of Firebase Storage URLs.
---

## Root Cause
`server/vendor.ts` had three functions frozen in a "Storage not provisioned" workaround state. When Storage was finally enabled, the code was never updated.

## Three broken functions (all in server/vendor.ts)

### 1. processAndSaveImage() (product images)
- **Was**: always encoded to Base64 data URI
- **Fix**: calls uploadToFirebaseStorage() for both full + thumb; falls back to Base64 on error

Storage paths used:
- Full:  `products/{md5hash}.webp`
- Thumb: `products/thumbs/{md5hash}.webp`

### 2. findDuplicateImage() (dedup cache)
Two bugs:
- Line 122 explicitly discarded Firebase Storage URLs: `if (full.startsWith("https://firebasestorage...")) return null` — forced re-upload every time, invalidated cache
- Did NOT filter stale `/uploads/products/...` paths (written by old diskStorage multer) — returned them as valid, causing dead-link images after redeploys

**Fix**: removed the Storage URL filter; added `/uploads/` filter to invalidate stale entries.

### 3. saveProfileImage() (vendor avatar + cover)
- **Was**: always encoded to Base64 data URI
- **Fix**: calls uploadToFirebaseStorage(); falls back to Base64 on error

Storage path: `vendors/{vendorId}/{type}-{timestamp}.webp`

## What was NOT changed
- `POST /api/upload` (customer profile photos in routes.ts) — already tried Firebase Storage first, fell back to `/uploads/` only on Storage failure. Correct as-is.
- `POST /api/admin/upload-image` (admin banners/categories) — already used uploadToFirebaseStorage with Base64 fallback. Correct as-is.
- Firebase config, bucket settings, security rules — untouched.

## Why stale /uploads/ entries appear in productImageHashes
Old diskStorage multer saved files as `/uploads/products/{timestamp}_{random}.webp` and stored that path in productImageHashes. After redeploys those files vanish. findDuplicateImage was returning them as valid cache hits. Now they're skipped and re-uploaded.
