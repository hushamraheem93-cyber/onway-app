---
name: Admin auth two-system mismatch (critical bug)
description: The admin login session and most /api/admin/* route guards use two incompatible auth checks under the same cookie name, breaking nearly all admin panel actions.
---

`server/index.ts` implements admin login/logout via an in-memory `adminSessions` Map keyed by a random token stored in the `onway_admin_session` cookie (or Bearer header). `isValidSession()` there checks token membership in that map.

Separately, `server/routes.ts` (`isAdminSessionValid`, applied globally via `app.use("/api/admin", requireAdminAuth)`) and `server/vendor.ts` (`isAdminSession`, used by `requireAdmin` on vendor-partner/vendor-product routes) both read the *same* `onway_admin_session` cookie but expect it to equal a static `HMAC-SHA256(ADMIN_USERNAME:ADMIN_PASSWORD, "onway_admin")` digest — a value no login flow ever sets.

**Why this matters:** Confirmed empirically (Jul 2026) that a real admin login (`/admin/login` cookie flow or `/api/admin/login` Bearer flow) authenticates fine for `/admin`, `/api/admin/login`, `/api/admin/change-credentials`, `/api/admin/credentials-info` (index.ts's own routes), but gets 401 "غير مصرح" on essentially everything else under `/api/admin/*` in routes.ts and vendor.ts — vendors list, drivers list, vendor-partners, vendor-products, order status update, manual driver assignment, etc. `AdminScreen.tsx` calls these exact endpoints with `credentials: "include"`, so the real admin panel's vendor/driver/order-management actions are broken in this state.

**How to apply:** Before trusting "admin panel works" from a build/login check alone, actually exercise one of the broken-prone routes (e.g. `PUT /api/admin/orders/:id/status`) with a real session. If reintroducing/fixing, unify all three admin-auth checks to use the same session mechanism (prefer the revocable `adminSessions` map approach, not the static HMAC one, since the HMAC value never rotates on logout/password change).
