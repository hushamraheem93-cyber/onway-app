export const ADMIN_ROLES = [
  "super_admin",
  "operations_admin",
  "finance_admin",
  "support_admin",
  "catalog_admin",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "admin_users.read",
  "admin_users.manage",
  "roles.read",
  "roles.manage",
  "audit.read",
  "orders.read",
  "orders.update",
  "orders.assign_driver",
  "orders.archive",
  "drivers.read",
  "drivers.manage",
  "merchants.read",
  "merchants.manage",
  "customers.read",
  "delivery.read",
  "delivery.manage",
  "dispatch.read",
  "dispatch.manage",
  "support.read",
  "support.manage",
  "operations.read",
  "operations.manage",
  "finance.read",
  "ledger.read",
  "settlements.read",
  "settlements.approve",
  "settlements.reject",
  "settlements.complete",
  "settlements.manage",
  "financial_adjustments.read",
  "financial_adjustments.create",
  "wallet_adjustments.read",
  "wallet_adjustments.create",
  "commission.read",
  "commission.update",
  "products.read",
  "products.manage",
  "categories.read",
  "categories.manage",
  "banners.read",
  "banners.manage",
  "catalog.manage",
  "promotions.read",
  "promotions.manage",
  "notifications.read",
  "notifications.send",
  "settings.read",
  "settings.update",
  "ratings.read",
  "ratings.manage",
  "analytics.read",
  "website_cms.read",
  "website_cms.manage",
  "storage.read",
  "system.maintenance",
] as const;


export interface AdminIdentity {
  adminId: string;
  username: string;
  displayName: string;
  email?: string;
  role: AdminRole;
  permissions: string[];
}

export interface AdminUserRecord extends AdminIdentity {
  passwordHash: string;
  usernameNormalized: string;
  isActive: boolean;
  createdAt: unknown;
  updatedAt: unknown;
  lastLoginAt?: unknown;
}

export const ROLE_PERMISSIONS: Record<AdminRole, readonly string[]> = {
  super_admin: ["*"],
  operations_admin: [
    "orders.read", "orders.update", "orders.assign_driver",
    "drivers.read", "drivers.manage", "merchants.read", "merchants.manage",
    "customers.read", "delivery.read", "delivery.manage", "dispatch.read",
    "dispatch.manage", "support.read", "support.manage", "operations.read",
    "operations.manage", "notifications.send", "ratings.read", "ratings.manage",
  ],
  finance_admin: [
    "finance.read", "ledger.read", "settlements.read", "settlements.approve",
    "settlements.reject", "settlements.complete", "settlements.manage",
    "financial_adjustments.read", "financial_adjustments.create",
    "wallet_adjustments.read", "wallet_adjustments.create", "commission.read",
    "commission.update", "drivers.read", "merchants.read", "customers.read",
  ],
  support_admin: [
    "orders.read", "customers.read", "merchants.read", "drivers.read",
    "support.read", "support.manage", "operations.read", "ratings.read",
  ],
  catalog_admin: [
    "products.read", "products.manage", "categories.read", "categories.manage",
    "banners.read", "banners.manage", "catalog.manage", "promotions.read",
    "promotions.manage", "merchants.read", "website_cms.read", "website_cms.manage",
    "notifications.send",
  ],
};

export const ROLE_LABELS_AR: Record<AdminRole, string> = {
  super_admin: "مدير عام",
  operations_admin: "مدير العمليات",
  finance_admin: "مدير المالية",
  support_admin: "مدير الدعم",
  catalog_admin: "مدير المحتوى والكتالوج",
};

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function permissionsForRole(role: AdminRole): string[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasAdminPermission(identity: AdminIdentity, permission: string): boolean {
  return identity.permissions.includes("*") || identity.permissions.includes(permission);
}

export function identityFromRecord(record: AdminUserRecord): AdminIdentity {
  return {
    adminId: record.adminId,
    username: record.username,
    displayName: record.displayName,
    ...(record.email ? { email: record.email } : {}),
    role: record.role,
    permissions: [...record.permissions],
  };
}

/**
 * Rebuild an admin identity from verified session claims.
 *
 * R-04: the permission list is DERIVED from the role, never read from the token.
 * It used to prefer `claims.permissions`, which meant `role` took no part in any
 * authorization decision — a token saying `role: "support_admin"` with
 * `permissions: ["*"]` was a super admin, and the two fields could describe
 * different people. Signing one needs the secret, so nothing was reachable from
 * outside; what was missing was the layer that makes them unable to disagree.
 *
 * This changes no real admin's access: every write path already stores
 * `permissionsForRole(role)` — createAdminUser, updateAdminUser and both bootstrap
 * paths — so the derived set is the set that was being carried. There is no
 * per-admin custom permission feature for it to discard.
 */
export function identityFromClaims(claims: any): AdminIdentity | null {
  if (!claims?.adminId || !claims?.username || !isAdminRole(claims.role)) return null;
  return {
    adminId: String(claims.adminId),
    username: String(claims.username),
    displayName: String(claims.displayName || claims.username),
    ...(claims.email ? { email: String(claims.email) } : {}),
    role: claims.role,
    permissions: permissionsForRole(claims.role),
  };
}
