# OnWay — Official Website (الموقع الرسمي)

Marketing website for **OnWay**, a multi-service local delivery app in Iraq (launching first in Ḍuluʿiyya / قضاء الضلوعية). Domain: **onwayiq.com**.

The site's job is to present OnWay's services and drive visitors to **download the app** or **join as a partner** (store owner / driver). It is not a store.

## Features

- ⚡️ **Next.js 14 (App Router) + TypeScript + Tailwind CSS**
- 🌍 **Bilingual** Arabic (RTL, default) + English (LTR) via locale routes `/ar` and `/en`, with a language toggle and `hreflang` alternates
- 📱 Fully **responsive**, mobile-first, no horizontal scroll
- 🎨 OnWay brand identity — orange primary, Cairo (Arabic) + Space Grotesk/Inter (Latin)
- 🛰️ Signature **live-route** motif: an animated delivery route and a live order-tracking phone mockup
- ✨ Light, performant animations (CSS + IntersectionObserver), fully **`prefers-reduced-motion`** aware
- 🔎 **SEO**: per-locale metadata, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`
- ♿️ Accessible focus states, semantic landmarks, keyboard-friendly

## Sections

Hero · Services · Why OnWay · How it works · App showcase (slider) · Partners (stores & drivers) · FAQ · Contact · Final CTA · Footer, plus `/[locale]/privacy` and `/[locale]/terms`.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 — `/` redirects to `/ar` (or `/en` based on the browser language). Try `/en` and the language toggle in the header.

```bash
npm run build   # production build
npm run start   # serve the production build
```

## Editing content

- **Text / translations:** `lib/dictionaries.ts` — a single typed dictionary for both `ar` and `en`.
- **Contact & links:** `lib/config.ts` — WhatsApp number, email, Facebook/Instagram URLs, and the App Store / Google Play links. These ship as **placeholders**; replace them with real values. When `appStore` / `googlePlay` are `null`, the download buttons show "coming soon".
- **Brand colors / fonts:** `tailwind.config.ts` and `lib/fonts.ts`.
- **Legal copy:** `lib/legal.ts` (placeholder — review before public launch).

## Project structure

```
app/
  layout.tsx            # root pass-through
  [locale]/layout.tsx   # <html lang/dir>, metadata, JSON-LD
  [locale]/page.tsx     # landing page
  [locale]/privacy, terms
  sitemap.ts, robots.ts
components/              # Header, sections/*, phone/*, shared UI
lib/                    # config, dictionaries, fonts, legal
middleware.ts           # "/" -> "/ar" | "/en"
```
