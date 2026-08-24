# OnWay — Sprint 1 RBAC Design

## Design principles

The change keeps the existing JWT transport, cookie/Bearer compatibility, CSRF boundary, Firestore backend-only model, and settlement/ledger calculations. It adds an Admin identity record to the existing session rather than introducing a second authentication transport. Authorization is enforced in the backend before controllers run; UI gating is only a usability layer.

Every newly issued session contains `adminId`, `username`, `displayName`, `role`, and the resolved permission list. Existing test/development tokens without the new claims remain compatible only while the legacy shared-admin mode is still active; once the first real Admin User is created, those legacy sessions are invalidated and the environment-variable/shared-credential fallback is disabled.

Role changes and activation changes invalidate all Admin sessions. This intentionally favors immediate revocation over preserving other operators' sessions: a changed or disabled identity cannot continue using an old seven-day token.

## Final roles

| Role | Intended responsibility | Permissions |
|---|---|---|
| `super_admin` | Full platform administration, Admin User management, emergency/destructive controls | `*` |
| `operations_admin` | Orders, dispatch, delivery, drivers, merchants, support, operational notifications | `orders.*`, `drivers.*`, `merchants.*`, `delivery.*`, `dispatch.*`, `support.*`, `customers.read`, `operations.*`, `notifications.send`, `ratings.*` |
| `finance_admin` | Financial visibility, settlements, ledger and controlled financial adjustments | `finance.*`, `ledger.*`, `settlements.*`, `financial_adjustments.*`, `wallet_adjustments.*`, `commission.*`, plus the minimum driver/merchant reads needed to identify accounts |
| `support_admin` | Read-only operational context and support conversations | `orders.read`, `customers.read`, `merchants.read`, `drivers.read`, `support.read`, `support.manage`, `operations.read`, `ratings.read` |
| `catalog_admin` | Catalog, promotions, categories, banners, merchant catalog, and marketing CMS | `products.*`, `categories.*`, `banners.*`, `catalog.*`, `promotions.*`, `merchants.read`, `website_cms.*`, `notifications.send` |

The wildcard belongs only to `super_admin`; all other roles use explicit permissions. Permission names are stable lower-case dot-separated identifiers.

## Permission vocabulary

The implementation uses the following permission identifiers, selected from the actual API surface: `admin_users.read`, `admin_users.manage`, `roles.read`, `roles.manage`, `audit.read`, `orders.read`, `orders.update`, `orders.assign_driver`, `orders.archive`, `drivers.read`, `drivers.manage`, `merchants.read`, `merchants.manage`, `customers.read`, `delivery.read`, `delivery.manage`, `dispatch.read`, `dispatch.manage`, `support.read`, `support.manage`, `operations.read`, `operations.manage`, `finance.read`, `ledger.read`, `settlements.read`, `settlements.approve`, `settlements.reject`, `settlements.complete`, `settlements.manage`, `financial_adjustments.read`, `financial_adjustments.create`, `wallet_adjustments.read`, `wallet_adjustments.create`, `commission.read`, `commission.update`, `products.read`, `products.manage`, `categories.read`, `categories.manage`, `banners.read`, `banners.manage`, `catalog.manage`, `promotions.read`, `promotions.manage`, `notifications.read`, `notifications.send`, `settings.read`, `settings.update`, `ratings.read`, `ratings.manage`, `analytics.read`, `website_cms.read`, `website_cms.manage`, `storage.read`, and `system.maintenance`.

## Backend enforcement

A global `/api/admin` authorization boundary runs after authentication and before any Admin route is registered. It resolves a required permission from the HTTP method and normalized path. Unknown Admin API paths fail closed with HTTP 403 rather than silently becoming authenticated-only endpoints. Existing per-route authentication guards remain as defense in depth.

The mapping covers the Admin routes in `server/index.ts`, `server/routes.ts`, and `server/vendor.ts`, including catalog, delivery, settings, orders, dispatch, drivers, merchants, settlements, financial reports, notifications, support, ratings, CMS, storage, archival, and the new Admin User/Role endpoints.

## Admin User storage

Admin records are stored in the backend-only Firestore collection `adminUsers`. A document contains `id`, `username`, `usernameNormalized`, `displayName`, optional `email`, `passwordHash`, `role`, `isActive`, `createdAt`, `updatedAt`, and `lastLoginAt`. Passwords are bcrypt hashes only. API responses always omit `passwordHash` and never return credential material.

The existing `adminConfig/credentials` document and `ADMIN_USERNAME`/`ADMIN_PASSWORD` remain read-only bootstrap sources while no Admin User exists. A successful legacy login creates the first Admin User as `super_admin`, copies only the supplied password into a new bcrypt hash, updates a migration marker, invalidates old sessions, and issues a new identity-bearing session. After the first Admin User exists, the legacy fallback is rejected, including for disabled accounts. The old shared credential document is not deleted by this Sprint.

## Admin User API

The backend adds list/create/update/activate/deactivate operations under `/api/admin/admin-users` and read-only role/permission metadata under `/api/admin/roles` and `/api/admin/permissions`. Admin User mutations are limited to `super_admin` through `admin_users.manage`; the backend prevents deactivating or demoting the last active Super Admin.

The existing credential endpoints remain compatible but are redirected to the current Admin User identity. They no longer create or rotate a shared credential after RBAC is active. The emergency legacy reset endpoint is limited to the pre-migration bootstrap state.

## Audit identity

`auditLog` keeps existing fields for compatibility and gains `actorId`, `actorUsername`, `actorRole`, `resourceType`, `resourceId`, `before`, and `after`. Sensitive keys such as passwords, password hashes, tokens, session secrets, API keys, and credentials are recursively removed before persistence. Financial events include before/after balance/status snapshots. A backend middleware also writes a minimal `admin.request` event for authenticated Admin mutations, using only method, path, and response status; it never records request bodies.

Login, failed login, logout, Admin creation, Admin updates, role changes, activation changes, and financial operations receive identifiable audit events. The Admin audit API gains pagination and filters for date, actor, action, and resource while preserving the existing target filters.

## Client integration

Admin Web receives a minimal Admin Users section with list/create/edit/activate/deactivate, a role/permission matrix, and an audit log filter/detail surface. The existing dashboard layout is not redesigned. Admin Mobile keeps its existing screens and uses the enhanced `/api/admin/session` response to load the current role and permissions; it gates visible tabs/actions for usability while backend 401/403 responses remain authoritative.

## Explicitly unchanged

Merchant, Driver, and Customer behavior; order lifecycle semantics; pricing, commission, and delivery-fee calculations; wallet/ledger/settlement identifiers and business calculations; existing Firestore financial collections; dashboard redesign; analytics features; live map; driver performance; dark mode; deletion of existing data; commit; and push.
