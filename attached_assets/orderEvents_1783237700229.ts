// Small shared event bus used to decouple order-confirmation triggers from the
// driver-assignment logic living inside routes.ts's registerRoutes() closure.
//
// Why this exists: onOrderConfirmed() / assignWaitingBatchToDriver() are local
// functions inside registerRoutes() (they close over in-memory state like
// driverQueue). vendor.ts is a separate router with no access to that closure.
// Before this fix, only the ADMIN order-status route called onOrderConfirmed()
// directly — vendor-confirmed orders (the primary real-world path) silently
// relied on the 30-second watchdog interval instead of firing immediately.
//
// routes.ts subscribes to the "confirmed" event once during registerRoutes().
// vendor.ts emits it right after a vendor transitions an order to "confirmed".
import { EventEmitter } from "events";

export const orderEvents = new EventEmitter();
