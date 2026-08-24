# OnWay — Sprint 1 Pre-Implementation Audit

## Scope

The repository is a public monorepo on branch `main`. It contains the Expo customer/driver/vendor client, the Node/Express backend, the server-rendered Admin Web panel, Firestore integration, settlement/ledger code, and tests. This audit is limited to Admin authentication, authorization, Admin clients, audit identity, and financially sensitive Admin operations.

## Authentication path

1. Admin Web uses `POST /admin/login` with username/password and receives an HttpOnly cookie named `onway_admin_session`.
2. Admin Mobile uses `POST /api/admin/login`, stores the returned JWT in secure token storage, and sends it as `Authorization: Bearer <token>` through the fetch interceptor.
3. `server/adminAuth.ts` validates a self-verifying HS256 JWT with `type: "admin"`, a username claim, a seven-day lifetime, and persisted revocation state.
4. `getSessionUsername(req)` currently derives only the username from the signed token. There is no stable Admin user id, role, or permission claim.
5. Before custom credentials exist, `validateAdminCredentials()` authenticates the single `ADMIN_USERNAME`/`ADMIN_PASSWORD` environment-variable pair. After the Firestore `adminConfig/credentials` document exists, the single custom username/password pair becomes the only valid pair.
6. Passwords in the custom credential document are bcrypt-hashed, while a legacy salted SHA-256 format remains accepted for compatibility. The current credential document stores one username and one password hash.
7. `/api/admin/session`, logout, CSRF protection, and the global `/api/admin` authentication boundary already exist. They must be preserved and extended, not replaced.

## Authorization path

The global `createAdminBoundary(isValidSession)` is mounted before Admin routes and protects `/api/admin/*` except `/login` and `/logout`. `registerRoutes()` also has a redundant `requireAdminAuth` guard, and `server/vendor.ts` has a local `requireAdmin` guard. All of these currently check only whether the session is a valid generic Admin session. No backend role or permission check exists.

The repository contains more than 100 Admin routes split between `server/index.ts`, `server/routes.ts`, and `server/vendor.ts`. The existing route boundary prevents unauthenticated access, but every authenticated Admin currently receives the same broad access.

## Admin clients

Admin Web has sections for dashboard, orders, customers, drivers, merchants, categories, banners, website CMS, financial dashboard, settlement requests, delivery, ratings, support, and settings. It uses the cookie and may also send a token stored in local storage. The credential UI rotates one shared username/password through `/api/admin/change-credentials`.

Admin Mobile uses the same username/password endpoint and the same server JWT. It validates session presence with `/api/admin/session`, handles 401 centrally, and renders all authenticated tabs/actions without fetching a role or permission set. It still posts a legacy `adminName: "admin"` value for settlement completion; the backend already ignores body-supplied identity for the financial actor name.

The existing `client/screens/admin/UsersTab.tsx` is an end-customer list, not an Admin-user management screen.

## Audit log

`server/financialLedger.ts` writes append-only entries to the `auditLog` collection. The current schema includes `action`, `actorType`, `actorName`, `targetType`, `targetId`, `amount`, `referenceId`, `notes`, optional `metadata`, and `createdAt`. The Admin API `/api/admin/audit-log` supports only `targetType` and `targetId` filters and returns up to 200 entries. Existing financial events are `settlement.approve`, `settlement.reject`, `settlement.complete`, and `ledger.adjust`; they record only `actorName`.

Financial paths are already centralized in `server/settlement.ts`, which is important because Sprint 1 can add actor identity and before/after snapshots without changing settlement calculations or ledger ids. The relevant callers are the settlement approve/reject transition, settlement completion, and direct ledger adjustment.

## Sensitive operations found

The actual Admin API surface includes, among others, catalog CRUD, delivery-area changes, system-fee and urgency-threshold changes, order status overrides, manual driver assignment, driver status/deletion, merchant status/product management, settlement approval/rejection/completion, settlement configuration, driver payment/recharge/adjustment, notifications, support operations, destructive order archival, website CMS mutations, and Admin credentials.

The initial permission matrix will be derived from these real route groups. Read-only routes will receive `*.read` permissions; mutations will receive the corresponding `*.manage`, `*.update`, `*.approve`, `*.reject`, `*.create`, `*.delete`, or `*.send` permissions. The destructive archive and shared-credential migration paths will receive explicit high-risk permissions.

## Storage and migration constraints

Firestore rules deny direct client access to `adminConfig`, so Admin users can be stored in a backend-only collection without exposing password hashes to clients. No `adminUsers` collection or multi-user schema currently exists. A safe migration must keep the legacy environment credentials available as a bootstrap path until the first Super Admin has been created and verified, then disable the shared fallback. It must never delete the existing credential document or alter financial collection identifiers.

## Baseline verification

After `npm ci --ignore-scripts`, `npm run check:types` passed. The existing unit suite reported 3,110 passing tests and one pre-existing failing test file, `tests/unit/vendor-order-scope.test.mjs`; the failure occurs in the baseline before Sprint 1 changes and is recorded separately in `Sprint1_baseline_unit.log`. No commit or push was performed.

## Out of scope

Merchant, Driver, and Customer app business behavior; order lifecycle rules; wallet/ledger/settlement business calculations; pricing, delivery fees, commission calculation; walletId/ledgerId/accountId/accountKey/settlementLedger identifiers; dashboard redesign; analytics, live map, driver performance, dark mode; deleting data; and any commit or push.
