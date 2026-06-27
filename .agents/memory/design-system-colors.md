---
name: Design System Color Tokens
description: Single source of truth for all colors in the Onway app — rules, tokens, and key patterns established during full design system refactor.
---

## Rule
Every color in screens, components, and navigation must reference `AppColors` from `client/constants/theme.ts`. No hardcoded hex strings or rgba literals are allowed outside theme.ts.

**Why:** Refactor completed June 2026 achieved 0 hardcoded hex across 78+ files (2197 AppColors references). Maintaining this prevents color drift and enables brand/theme changes from a single file.

## Key Tokens

### Brand
- `primary` = `#E86520` — main orange. ALL orange variants map here.
- `primaryLight` = `#F28B4E` — light orange for chip backgrounds
- `primaryDark` = `#C4520F` — dark orange for gradients
- `secondary` = `#FFF0E8` — very light orange surface bg

### Status
- `success` / `successLight` = `#10B981` / `#D1FAE5`
- `error` / `errorLight` = `#EF4444` / `#FEE2E2`
- `warning` / `warningLight` = `#F59E0B` / `#FEF3C7`
- `info` / `infoLight` = `#3B82F6` / `#EFF6FF`
- `statusPurple` = `#8B5CF6` — for "preparing" badge
- `statusCyan` = `#06B6D4` — for "in_delivery" badge

### Portal-specific
- `vendorPurple` / `vendorPurpleLight` = `#673AB7` / `#EDE7F6`
- `driverBlue` / `driverBlueLight` = `#1565C0` / `#E3F2FD`

### On-brand surface (text/icons on primary-colored backgrounds)
- `textOnBrand` = white
- `textOnBrandMuted` = `rgba(255,255,255,0.8)`
- `textOnBrandSubtle` = `rgba(255,255,255,0.75)` (also used for 0.7, 0.85 approximations)
- `iconOnBrand` = `rgba(255,255,255,0.55)` (also used for 0.6)
- `decorativeOnBrand` = `rgba(255,255,255,0.07)` (bg circles, low-opacity decorations)

### Utility
- `overlay` = `rgba(0,0,0,0.5)` — modal/image overlays (also used for 0.45, 0.55, 0.65)
- `shadowColor` = black — always use this for shadowColor prop
- `whatsapp` = `#25D366`

## Single-source exports
- `ORDER_STATUS_COLORS` — maps order status string → color
- `ORDER_STATUS_LABELS` — maps order status string → Arabic label
- `Gradients.splash` = `[primary, primaryDark]`
- `Gradients.background` — 4-stop orange fade for GradientBackground

## How to apply
- Adding a new screen: import `{ AppColors }` from `@/constants/theme`
- New color needed: ADD IT to theme.ts first, then reference via AppColors
- Opacity variant of a brand color: use `AppColors.primary + "33"` pattern (hex suffix for opacity)
- PaymentScreen exception: Mastercard SVG colors (`#1A1F71`, `#EB001B`, `#FF5F00`, `#F79E1B`) are intentional brand colors of Mastercard — do not replace.

## Batch refactor approach (if needed again)
Run Node.js script from `/home/runner/workspace` (not from /tmp to avoid `__dirname` path issues). Script must:
1. Add `AppColors` to existing theme imports (not as a new separate import)
2. Replace JSX props FIRST (`color="#HEX"` → `color={AppColors.TOKEN}`) before string replacements
3. After batch, run `perl -i -pe` to fix any `attr=AppColors.X` (missing braces) introduced by sed
