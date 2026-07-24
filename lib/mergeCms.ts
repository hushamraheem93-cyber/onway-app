/**
 * lib/mergeCms.ts
 * Merges live CMS data on top of the static dictionary and siteConfig.
 * Components receive the merged result — no component needs to know about CMS directly.
 */

import type { Dictionary } from "./dictionaries";
import type { CmsData, ResolvedContact, StoreLinks } from "./cms";
import { siteConfig } from "./config";
import type { Locale } from "./config";

/** Deep-clone the dictionary then overlay CMS values where they exist. */
export function mergeCmsIntoDictionary(
  t: Dictionary,
  cms: CmsData,
  locale: Locale
): Dictionary {
  const merged: Dictionary = JSON.parse(JSON.stringify(t));

  // ── Hero ──────────────────────────────────────────────────────────────────
  const hero = cms.hero;
  if (hero) {
    if (locale === "ar") {
      if (hero.title_ar?.trim()) {
        merged.hero.titleLead = hero.title_ar;
        merged.hero.titleHi = "";
      }
      if (hero.subtitle_ar?.trim()) merged.hero.subtitle = hero.subtitle_ar;
      if (hero.ctaPrimary_ar?.trim()) merged.hero.download = hero.ctaPrimary_ar;
      if (hero.ctaSecondary_ar?.trim()) merged.hero.partner = hero.ctaSecondary_ar;
    }
  }

  // ── Stats (map to hero stats array, preserving existing labels) ───────────
  const stats = cms.stats;
  if (stats) {
    const current = merged.hero.stats;
    const overrides: [string | undefined, number][] = [
      [stats.downloads, 0],
      [stats.vendors, 1],
      [stats.cities, 2],
    ];
    overrides.forEach(([val, idx]) => {
      if (val?.trim() && current[idx]) {
        current[idx] = { value: val, label: current[idx].label };
      }
    });
  }

  // ── FAQ ───────────────────────────────────────────────────────────────────
  const faq = cms.faq;
  if (faq?.items && faq.items.length > 0) {
    const sorted = [...faq.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const mapped = sorted.map((item) => ({
      q: item.question_ar,
      a: item.answer_ar,
    }));
    const valid = mapped.filter((i) => i.q?.trim() && i.a?.trim());
    if (valid.length > 0) merged.faq.items = valid;
  }

  // ── SEO metadata ──────────────────────────────────────────────────────────
  const seo = cms.seo;
  if (seo && locale === "ar") {
    if (seo.title_ar?.trim()) merged.meta.title = seo.title_ar;
    if (seo.description_ar?.trim()) merged.meta.description = seo.description_ar;
    if (seo.keywords?.trim()) merged.meta.keywords = seo.keywords;
  }

  // ── Footer tagline ────────────────────────────────────────────────────────
  const footer = cms.footer;
  if (footer) {
    if (locale === "ar" && footer.tagline_ar?.trim())
      merged.footer.tagline = footer.tagline_ar;
    if (locale === "en" && footer.tagline_en?.trim())
      merged.footer.tagline = footer.tagline_en;
  }

  return merged;
}

/** Build a resolved contact config, preferring CMS values over siteConfig defaults. */
export function resolveContact(cms: CmsData): ResolvedContact {
  const c = cms.contact;

  const whatsapp = c?.whatsapp?.replace(/^\+/, "").trim() || siteConfig.whatsapp;
  const email = c?.email?.trim() || siteConfig.email;
  const facebook = c?.facebook?.trim() || siteConfig.facebook;

  let instagram = siteConfig.instagram;
  if (c?.instagram?.trim()) {
    const handle = c.instagram.trim().replace(/^@/, "");
    instagram = handle.startsWith("http")
      ? handle
      : `https://instagram.com/${handle}`;
  }

  return { whatsapp, email, facebook, instagram };
}

/** Build resolved store links, preferring CMS values over siteConfig. */
export function resolveStoreLinks(cms: CmsData): StoreLinks {
  const dl = cms.downloadLinks;
  return {
    appStore:
      dl?.appStoreEnabled !== false && dl?.appStoreUrl?.trim()
        ? dl.appStoreUrl.trim()
        : siteConfig.appStore,
    googlePlay:
      dl?.playStoreEnabled !== false && dl?.playStoreUrl?.trim()
        ? dl.playStoreUrl.trim()
        : siteConfig.googlePlay,
  };
}
