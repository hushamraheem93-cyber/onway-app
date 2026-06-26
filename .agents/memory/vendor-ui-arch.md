---
name: Vendor UI architecture
description: Tab layout, stats endpoint, and new-order popup pattern for the vendor interface
---

## Tab order (VendorTabNavigator.tsx)
Home → Orders → Products → Profits (VendorWalletScreen) → Account (VendorProfileScreen)
- Notifications tab was replaced by Account tab
- Bell badge lives on the Orders tab (unreadCount from VendorNotificationsContext)
- VendorNotificationsScreen still exists but is no longer a tab; accessible only if explicitly navigated

## Stats endpoint (GET /api/vendor/stats)
Returns: totalOrders, pendingOrders, preparingOrders, readyOrders, totalRevenue, rating, ratingCount
- preparingOrders = confirmed + preparing statuses
- readyOrders = ready status
- rating / ratingCount fetched from vendors/{vid} Firestore document

## VendorHomeScreen stats grid
2×2 grid of statCards: new orders (amber), preparing (purple), waiting driver (cyan), store rating (yellow)
Replaces the old revenueSummary / revenueCard / revenueSmallCard layout.

## New-order popup (VendorNotificationsContext)
- Polls /api/vendor/orders every 20 s
- Seeds known pending order IDs on first load (isFirstLoad ref) to avoid false popup on app open
- Shows bottom-sheet modal (NewOrderPopupModal) when a new pending order ID is detected
- Dismissing popup clears newOrderPopup state; does NOT auto-navigate to Orders tab

## Copy product (VendorProductsScreen)
- copyProduct() calls POST /api/vendor/products with the same data but name suffixed "(نسخة)", status=pending, inStock=true
- Button is the purple Feather "copy" icon in the product card actions row

**Why:** User requested profile tab replacement for notifications, live stats grid, in-app new-order popups, and product copy to reduce repetitive data entry.
