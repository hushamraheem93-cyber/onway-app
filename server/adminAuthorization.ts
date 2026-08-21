import type { Express, NextFunction, Request, Response } from "express";
import { getAdminIdentity } from "./adminAuth";
import { AdminIdentity, hasAdminPermission } from "./adminTypes";
import { recordAudit } from "./financialLedger";

function relativePath(req: Request): string {
  const path = String(req.path || "").toLowerCase().replace(/\/+$/, "") || "/";
  return path;
}

function matches(path: string, pattern: RegExp): boolean {
  return pattern.test(path);
}

function auditActionForRequest(method: string, path: string): string {
  const verb = method.toLowerCase();
  if (path === "/send-notification") return "notification.broadcast";
  if (path === "/orders" || matches(path, /^\/orders\/[^/]+\/status$/)) return "order.admin_status_changed";
  if (matches(path, /^\/orders\/[^/]+\/assign-driver$/)) return "order.driver_assigned_manually";
  if (matches(path, /^\/drivers\/[^/]+\/status$/)) return "driver.status_changed";
  if (matches(path, /^\/drivers\/[^/]+$/)) return "driver.deleted";
  if (matches(path, /^\/vendor-partners\/[^/]+\/status$/)) return "merchant.status_changed";
  if (matches(path, /^\/vendors\/[^/]+$/)) return "merchant.changed";
  if (matches(path, /^\/settings(?:\/|$)/)) return "settings.changed";
  if (matches(path, /^\/website-cms(?:\/|$)/)) return "website_cms.changed";
  if (matches(path, /^\/archive-old-orders$/)) return "orders.archived";
  if (matches(path, /^\/admin-users(?:\/|$)/)) return "admin_user.changed";
  return `admin.${verb}_request`;
}

/**
 * Map the real Admin API surface to explicit permissions. This is deliberately
 * centralized and fail-closed: adding a new /api/admin route without adding a
 * mapping gives non-super-admin users a 403 instead of silently granting access.
 */
export function permissionForAdminRequest(method: string, rawPath: string): string | null {
  const path = String(rawPath || "").toLowerCase().replace(/\/+$/, "") || "/";
  const verb = method.toUpperCase();

  if (path === "/login" || path === "/logout" || path === "/session") return null;
  if (path === "/admin-users" || path.startsWith("/admin-users/")) {
    return verb === "GET" ? "admin_users.read" : "admin_users.manage";
  }
  if (path === "/roles" || path === "/permissions") return "roles.read";
  if (path === "/credentials-info") return "settings.read";
  if (path === "/change-credentials") return "settings.update";
  if (path === "/audit-log") return "audit.read";

  if (matches(path, /^\/settlements\/approve$/)) return "settlements.approve";
  if (matches(path, /^\/settlements\/reject$/)) return "settlements.reject";
  if (matches(path, /^\/settlements\/complete$/)) return "settlements.complete";
  if (matches(path, /^\/settlement-(requests|accounts?|export|config)/) || path === "/vendor-registry") {
    if (verb === "GET") return path.includes("export") ? "settlements.read" : "settlements.read";
    return "settlements.manage";
  }
  if (matches(path, /^\/driver-wallet\/(recharge|payment)$/)) return "settlements.complete";
  if (path === "/driver-wallet/adjustment") return "wallet_adjustments.create";
  if (matches(path, /^\/driver-financial(?:\/|$)/)) return "finance.read";
  if (matches(path, /^\/(financial-summary|financial-reports|owner-earnings|wallet-transactions)$/)) return "finance.read";
  if (path === "/ledger-statement" || matches(path, /^\/vendors\/[^/]+\/statement$/) || matches(path, /^\/vendors\/[^/]+\/settlement-history$/)) return "ledger.read";

  if (path === "/settings" || path.startsWith("/settings/")) return verb === "GET" ? "settings.read" : "settings.update";
  if (path === "/orders" || matches(path, /^\/orders\/[^/]+$/)) return verb === "GET" ? "orders.read" : "orders.update";
  if (matches(path, /^\/orders\/[^/]+\/assign-driver$/)) return "orders.assign_driver";
  if (matches(path, /^\/batches\//) || path === "/active-batches" || path === "/redistribute") return verb === "GET" ? "dispatch.read" : "dispatch.manage";
  if (path === "/drivers" || matches(path, /^\/driver-(locations|queue|stats|activity)$/)) return "drivers.read";
  if (matches(path, /^\/drivers\/[^/]+/)) return "drivers.manage";

  if (path === "/users") return "customers.read";
  if (matches(path, /^\/support\//)) return verb === "GET" ? "support.read" : "support.manage";
  if (matches(path, /^\/send-notification$/)) return "notifications.send";
  if (matches(path, /^\/notification-stats$/) || path === "/push-token") return "notifications.read";

  if (matches(path, /^\/vendor-products(?:\/|$)/) || matches(path, /^\/vendors\/[^/]+\/products$/)) {
    return verb === "GET" ? "products.read" : "products.manage";
  }
  if (matches(path, /^\/vendor-partners(?:\/|$)/) || path === "/vendors" || matches(path, /^\/vendors\/[^/]+/)) {
    return verb === "GET" ? "merchants.read" : "merchants.manage";
  }

  if (path === "/products" || path === "/picker-products" || matches(path, /^\/products\//)) return verb === "GET" ? "products.read" : "products.manage";
  if (path === "/categories" || matches(path, /^\/categories\//) || path === "/business-categories" || matches(path, /^\/business-categories\//)) return verb === "GET" ? "categories.read" : "categories.manage";
  if (path === "/banners" || matches(path, /^\/banners\//)) return verb === "GET" ? "banners.read" : "banners.manage";
  if (path === "/delivery-areas" || matches(path, /^\/delivery-areas\//)) return verb === "GET" ? "delivery.read" : "delivery.manage";
  if (path === "/promo-codes" || matches(path, /^\/promo-codes\//)) return verb === "GET" ? "promotions.read" : "promotions.manage";
  if (path === "/upload-image") return "catalog.manage";
  if (matches(path, /^\/promotional-sections\//)) return "promotions.manage";

  if (path === "/ratings" || path === "/ratings-dashboard" || path === "/store-ranking") return verb === "GET" ? "ratings.read" : "ratings.manage";
  if (path === "/storage-stats") return "storage.read";
  if (path === "/dashboard-stats" || path === "/operations") return "operations.read";
  if (path === "/analytics") return "analytics.read";
  if (matches(path, /^\/website-cms(?:\/|$)/)) return verb === "GET" ? "website_cms.read" : "website_cms.manage";
  if (path === "/seed-demo-stores") return "system.maintenance";
  if (path === "/archive-old-orders") return "orders.archive";

  // Fail closed for future endpoints until their permission is explicitly mapped.
  return "system.maintenance";
}

export function createAdminAuthorizationBoundary(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const permission = permissionForAdminRequest(req.method, relativePath(req));
    if (!permission) return next();
    const identity = getAdminIdentity(req);
    if (!identity) return res.status(401).json({ error: "انتهت صلاحية جلسة الإدارة، يرجى تسجيل الدخول مجدداً" });
    (req as any).adminIdentity = identity;
    if (!hasAdminPermission(identity, permission)) {
      return res.status(403).json({ error: "لا تملك الصلاحية لتنفيذ هذا الإجراء", permission });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase())) {
      res.once("finish", () => {
        recordAudit({
          action: auditActionForRequest(req.method, relativePath(req)),
          actorType: "admin",
          actorId: identity.adminId,
          actorUsername: identity.username,
          actorRole: identity.role,
          resourceType: "admin_api",
          resourceId: relativePath(req),
          metadata: { method: req.method, path: relativePath(req), status: res.statusCode },
        }).catch(() => {});
      });
    }
    next();
  };
}

export function adminIdentityFromRequest(req: Request): AdminIdentity | null {
  return (req as any).adminIdentity || getAdminIdentity(req);
}

export function registerAdminAuthorization(app: Express): void {
  app.use("/api/admin", createAdminAuthorizationBoundary());
}
