# ONWAY — Sprint 9 Theme Audit (Working Findings)

## Scope

The repository contains a single Expo client under `client/` with Customer, Vendor, Driver, and Admin mobile surfaces, plus server-rendered Admin Web, Vendor Web, Vendor Login, and an Expo landing page.

## Central theming findings

| Area | Current Theme | Dark Logic | Light Logic | Action |
|---|---|---|---|---|
| `client/constants/theme.ts` | Light palette already uses `#FB5B21`; `Colors.dark` and dark presets remain | `Colors.dark`, `GradientPresets.dark`, `BadgeVariants.dark`; unused portal dark/admin sidebar token | `Colors.light` and `AppColors` are broadly light | Pin all runtime reads to `Colors.light`; update portal tokens to OnWay light-compatible values; keep only functional status colors and subtle shadows |
| `client/context/ThemeContext.tsx` | `effectiveTheme` is already hard-pinned to `light` | Saved `themeMode`, setter, and system scheme plumbing remain; no call-site uses `setThemeMode` | `effectiveTheme: "light"` | Remove user/system selection path or make provider light-only while preserving compatible exports; no switcher exists |
| `client/hooks/useTheme.ts` | Returns light at runtime because provider is pinned | Computes `isDark` and indexes `Colors[effectiveTheme]` | Consumers receive light palette | Return the light palette and retain only compatibility if needed; remove active `isDark` consumers |
| Expo config | `userInterfaceStyle: "light"` already set | Android adaptive icon and splash use `#F83D0D`, not the brand primary | Native shell is light | Change brand backgrounds to `#FB5B21` where appropriate |
| `client/App.tsx` | Status bar currently automatic | `StatusBar style="auto"` can follow system appearance | App shell uses ThemeProvider | Set explicit light status bar styling compatible with light surfaces |
| Customer/Vendor/Driver mobile components | Most surfaces consume light-friendly AppColors | Concrete `isDark` branches remain in `SearchScreen`, `CartItemCard`, `DriverHomeScreen`, `DriverTabNavigator`; shared Themed primitives still accept dark overrides | Light branch already works | Normalize these branches to light tokens without changing data or navigation logic |
| Admin Web | RTL/Cairo and existing Admin layout | Dark sidebar gradient, dark header shell, white-on-dark nav styling; `--primary` is `#E86520` | Main content already mostly light | Convert shell tokens and nav to light surfaces, set `--primary: #FB5B21`, preserve layout/order/business logic |
| Vendor Web | Dark-first dashboard (`--bg`, `--bg2`, `--bg3`) | Body/sidebar/header/cards/tables/forms/modals use dark tokens | None as a full surface system | Rewrite existing tokens to light surfaces and brand accent; do not alter JS/API flows |
| Vendor Login | Dark-first page | Dark gradient/card/inputs/options and white text | None as a full surface system | Convert existing styles to light card/page/input surfaces with OnWay accent |
| Landing Page | Light default with browser dark media query | `@media (prefers-color-scheme: dark)` actively changes page surfaces | Light base styles | Remove/neutralize the dark media branch so browser preference cannot activate a dark UI |

## Dark-related source inventory

A broad source scan found **17 files** containing dark/theme-related symbols. This includes central theme plumbing, compatibility wrappers, explicit mobile `isDark` branches, web dark templates, config, and comments—not 17 files that necessarily render a dark UI at runtime.

The files with explicit dark-capable or dark-surface behavior are:

1. `client/constants/theme.ts`
2. `client/context/ThemeContext.tsx`
3. `client/hooks/useTheme.ts`
4. `client/hooks/useColorScheme.ts`
5. `client/hooks/useColorScheme.web.ts`
6. `client/components/ThemedText.tsx`
7. `client/components/ThemedView.tsx`
8. `client/components/CartItemCard.tsx`
9. `client/screens/SearchScreen.tsx`
10. `client/screens/DriverHomeScreen.tsx`
11. `client/navigation/DriverTabNavigator.tsx`
12. `client/App.tsx`
13. `app.config.js`
14. `server/templates/admin.html`
15. `server/templates/vendor-dashboard.html`
16. `server/templates/vendor-login.html`
17. `server/templates/landing-page.html`

`client/context/AuthContext.tsx` appeared in the broad keyword scan because it contains unrelated appearance-like text in notification configuration and is not a theme implementation.

## Theme switcher finding

No call site invokes `setThemeMode(...)`; only `ThemeContext.tsx` defines it. No visible Light/Dark toggle was found by source search. The remaining risk is system/browser preference plumbing and dead dark-capable branches, not an exposed user switcher.

## Guardrails for implementation

No Finance, Wallet, Ledger, Settlement, Commission, Pricing, Orders, Driver Assignment, RBAC, Audit Log, Live Operations Map, Vendor Analytics, or Driver Performance logic may be changed. Theme and brand styles only. Existing status semantics (success, warning, error, info) must remain distinct. Black used for shadow color or map overlays is functional and must not be replaced blindly with a light background.

## Implemented during audit-to-build pass

The runtime theme path is now light-only. `ThemeContext` no longer reads AsyncStorage or the device scheme; `useTheme` retains `isDark: false` only as a compatibility field, and both color-scheme hooks return `light`. Shared themed primitives and the concrete mobile branches in Search, Cart, Driver Home, and Driver Tab navigation now use Light tokens directly. The native StatusBar is explicitly configured for a light surface, and Expo splash/adaptive icon backgrounds use `#FB5B21`.

The mobile tokens now map legacy portal purple/blue names to OnWay orange-compatible values, while success/warning/error/info colors remain semantic. The primary Arabic font aliases resolve to Cairo, and direct ThemedText/Button/Admin Mobile font uses were changed to Cairo.

Admin Web, Vendor Web, Vendor Login, Admin Login, landing-page developer preview, and landing-public now use light surfaces and the `#FB5B21` brand. Admin Web's sidebar and live monitor card were converted from dark surfaces to white/light-wash surfaces. Vendor Web's dark-first tokens were converted to light page/card/form tokens. Browser dark preference media rules were removed from the developer preview, and all public templates are RTL/Cairo-aware.

## Current verification snapshot

`npm run check:types` passed after the mobile theme changes. The initial Sprint 9 test suite now passes 6/6, including runtime Light-only assertions, removal of active mobile `isDark` branches, web surface checks, brand checks, and primary-text contrast.

## Remaining verification

Run the official Server Build, the Sprint 9 test together with RBAC/UI regressions, and the full Unit suite. Then update this file into the final closure report. No commit or push is permitted.

## Visual verification note

The local rendered Vendor Login and Admin Login surfaces both showed a light gradient page, white card, readable dark labels/inputs, RTL Arabic controls, and orange OnWay primary controls. The Admin Login logo image appears broken when opened directly as a local template because `/uploads/onway-logo.png` is a server-relative asset; this is an environment/asset-resolution artifact, not a theme regression and was not changed.

A second visual check showed the Admin Web shell rendered with a white sidebar/header, light monitor card, readable RTL labels, and the orange brand accent. Opening `vendor-dashboard.html` directly as a `file://` document triggered its existing client-side redirect to `/vendor/login`, so that standalone file could not be visually inspected without the normal server/API route; static token and Light-mode tests cover its CSS conversion.

## Final theme scan

The final source scan returned zero matches for system dark preference branches, native/browser scheme readers, active `isDark` branches, old `#E86520`/`#F83D0D` brand values, and explicit dark background literals. Vendor Web still contains `var(--bg2)`/`var(--bg3)` declarations by name, but their values are `#FFFFFF` and `#FFF8F5`; they are light tokens, not dark surfaces.
