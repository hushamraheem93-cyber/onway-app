---
name: Design System Color Tokens
description: Single source of truth for all design tokens in the Onway app — colors, typography, spacing, animation, breakpoints, and more.
---

## Rule
Every design value (color, spacing, radius, duration, z-index) must reference a token from `client/constants/theme.ts`. No hardcoded values outside theme.ts.

**Why:** Full design system refactor completed June 2026 — 0 hardcoded hex across 78+ files, animation durations migrated to Anim tokens. Single-file source for all visual decisions.

## All Exports from theme.ts

| Export | Purpose |
|---|---|
| `AppColors` | All colors (primary, grays, status, portal, utility) |
| `ORDER_STATUS_COLORS` | Order status → color map |
| `ORDER_STATUS_LABELS` | Order status → Arabic label map |
| `Gradients` | Splash and background gradients |
| `Colors` | Light/dark theme objects for useTheme() |
| `DesignSystem` | Screen padding, grid gap, card sizes |
| `Spacing` | xs=4, sm=8, md=12, lg=16, xl=20, 2xl=24, 3xl=32… |
| `BorderRadius` | xs=8, sm=12, md=16, lg=18, xl=24, 2xl=32, full=9999 |
| `FontSize` | xs=10, sm=11, base=13, md=14, lg=15, xl=18, 2xl=22, 3xl=28, 4xl=32 |
| `FontFamily` | tajawal, tajawalBold, cairo, cairoBold, montserrat… |
| `Typography` | Full text styles: h1–h4, body, bodyMd, small, caption, label, link, price, badge |
| `Fonts` | Platform-specific font fallback (used by ThemedText) |
| `Shadows` | xs/sm/md/lg/xl shadow presets |
| `Anim` | `Anim.duration.{instant/fastest/fast/normal/slow/slower/slowest/splash}` + `Anim.spring.{snappy/normal/bouncy/gentle}` |
| `ZIndex` | base=0, raised=1, sticky=10, overlay=100, modal=200, toast=300 |
| `Breakpoints` | sm=480, md=768, lg=1024, xl=1280, 2xl=1536 |
| `responsive()` | Helper fn: `responsive(width, { sm, md, lg, xl, default })` |

## Key Color Tokens

### Brand
- `primary` = `#E86520` — main orange. ALL orange variants map here.
- `primaryLight` = `#F28B4E`, `primaryDark` = `#C4520F`
- `secondary` = `#FFF0E8` — very light orange surface

### Status
- `success`/`successLight`, `error`/`errorLight`, `warning`/`warningLight`, `info`/`infoLight`
- `statusPurple` = `#8B5CF6` (preparing), `statusCyan` = `#06B6D4` (in_delivery)

### Portal
- `vendorPurple`/`vendorPurpleLight`, `driverBlue`/`driverBlueLight`

### On-brand surface (white on colored background)
- `textOnBrand`, `textOnBrandMuted` (0.8), `textOnBrandSubtle` (0.75), `iconOnBrand` (0.55), `decorativeOnBrand` (0.07)

### Utility
- `overlay` = `rgba(0,0,0,0.5)`, `shadowColor` = black, `whatsapp` = `#25D366`

## CRITICAL: Anim naming
- Export is `Anim`, NOT `Animation` — `Animation` is a reserved TypeScript/Web API global.
- Import as: `import { Anim } from "@/constants/theme";`
- Use: `withTiming(val, { duration: Anim.duration.normal })`

## Opacity pattern for brand color
- Use `AppColors.error + "33"` for error at 20% opacity (hex suffix: 33=20%, 1A=10%, 0F=6%)

## Exceptions
- PaymentScreen Mastercard SVG: `#1A1F71`, `#EB001B`, `#FF5F00`, `#F79E1B` — intentional brand colors
- Very specific one-off rgba values for frosted glass/gradient effects (e.g. `rgba(255,255,255,0.92)`)

## Batch refactor approach
Run Node.js script from `/home/runner/workspace` (not /tmp). After batch sed, run:
`perl -i -pe 's/(\w+)=AppColors\.([a-zA-Z0-9_]+)/$1={AppColors.$2}/g'` to fix missing JSX braces.
