---
name: Enterprise Design System — theme.ts
description: Single source of truth for ALL design tokens in Onway. 1169 lines, 54 exports, 12 sections.
---

## Rule
Every design value (color, spacing, radius, font, duration, z-index) must reference a token from `client/constants/theme.ts`. No hardcoded values outside this file.

**Why:** Full Enterprise Design System refactor completed June 2026. Zero hardcoded hex colors (except intentional Mastercard brand in PaymentScreen) and zero hardcoded fontWeight strings across all 78+ files.

## File Overview

`client/constants/theme.ts` — 1169 lines, 54 exports, 12 sections:

| Section | Exports |
|---|---|
| 1 — Semantic Colors | `AppColors`, `ORDER_STATUS_COLORS`, `ORDER_STATUS_LABELS`, `Colors` (light/dark) |
| 2 — Typography | `FontSize`, `FontFamily`, `FontWeight`, `LineHeight`, `Typography`, `Fonts` |
| 3 — Spatial/Dimension | `Spacing`, `BorderRadius`, `DesignSystem`, `IconSize`, `AvatarSize`, `AvatarStyles`, `Opacity` |
| 4 — Shadow/Elevation | `Shadows`, `Elevation` |
| 5 — Animation | `Anim`, `AnimCurve` |
| 6 — Layout | `ZIndex`, `Breakpoints`, `responsive()` |
| 7 — Gradients | `Gradients`, `GradientPresets` |
| 8 — Component Tokens | `ButtonVariants`, `InputVariants`, `CardVariants`, `BadgeVariants`, `ChipVariants`, `TagVariants`, `ListItemStyles`, `ModalStyles`, `BottomSheetStyles`, `DialogStyles`, `ToastStyles`, `SnackbarStyles`, `SkeletonStyles`, `LoadingStyles`, `EmptyStateStyles` |
| 9 — Domain | `ORDER_STATUS_STYLES`, `VendorTheme`, `DriverTheme`, `AdminTheme` |
| 10 — Accessibility | `A11y` |
| 11 — RTL | `RTL` |
| 12 — Utilities | `hexAlpha()`, `getStatusStyle()`, `getStatusColor()`, `getStatusLabel()`, `clamp()`, `spacingMultiple()`, `getThemeColors()` |

## CRITICAL: Anim vs Animation
Export is `Anim`, NOT `Animation` — `Animation` is a reserved TypeScript/Web API global. Import as `import { Anim } from "@/constants/theme";`

## CRITICAL: FontWeight Migration
All hardcoded `fontWeight: "700"` etc. replaced with `FontWeight.bold` etc. across 43 files (232 replacements, Jun 2026). Never write string literals for fontWeight in new code.

## Key Color Tokens
- `primary` = `#E86520` — ALL orange variants map here
- `AppColors.wayYellow` removed — was duplicate of primary
- PaymentScreen exception: Mastercard brand colors (`#1A1F71`, `#EB001B`, `#FF5F00`, `#F79E1B`) intentional

## Remaining Hardcoded Values (Future Migration)
- ~501 hardcoded `fontSize: N` → should use `FontSize.X`
- ~410 hardcoded `borderRadius: N` → should use `BorderRadius.X`
- New component tokens (ButtonVariants, InputVariants, etc.) defined but not yet adopted by existing screens — for future new component development

## Token Usage (active, high-traffic)
AppColors: 2085 refs | Spacing: 1019 | FontWeight: 275 | BorderRadius: 272 | Shadows: 119 | Anim: 18

## ThemeProvider
`client/context/ThemeContext.tsx` — provides `useThemeMode()` hook with `{ themeMode, setThemeMode, effectiveTheme }`
`client/hooks/useTheme.ts` — provides `useTheme()` → `{ theme: Colors[effectiveTheme], isDark }`
