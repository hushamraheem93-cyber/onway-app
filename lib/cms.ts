/**
 * lib/cms.ts
 * Fetches website content from the OnWay CMS API.
 * All data is cached with ISR (revalidate: 60 seconds).
 */

const CMS_URL = "https://onwayiq.com/api/website-content";

// ── Field types (match WebsiteCmsTab.tsx field names exactly) ─────────────────

export interface CmsHero {
  title_ar?: string;
  subtitle_ar?: string;
  ctaPrimary_ar?: string;
  ctaSecondary_ar?: string;
  heroImageUrl?: string;
}

export interface CmsFeatureItem {
  id: string;
  icon: string;
  title_ar: string;
  desc_ar: string;
  order: number;
}

export interface CmsFeatures {
  items?: CmsFeatureItem[];
}

export interface CmsStats {
  downloads?: string;
  vendors?: string;
  cities?: string;
  rating?: string;
}

export interface CmsFaqItem {
  id: string;
  question_ar: string;
  answer_ar: string;
  order: number;
}

export interface CmsFaq {
  items?: CmsFaqItem[];
}

export interface CmsDownloadLinks {
  appStoreUrl?: string;
  playStoreUrl?: string;
  appStoreEnabled?: boolean;
  playStoreEnabled?: boolean;
}

export interface CmsScreenshots {
  images?: string[];
}

export interface CmsContact {
  email?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  twitter?: string;
  facebook?: string;
  address_ar?: string;
}

export interface CmsSeo {
  title_ar?: string;
  description_ar?: string;
  keywords?: string;
  ogImageUrl?: string;
}

export interface CmsFooter {
  tagline_ar?: string;
  tagline_en?: string;
}

export interface CmsData {
  hero?: CmsHero;
  features?: CmsFeatures;
  stats?: CmsStats;
  faq?: CmsFaq;
  downloadLinks?: CmsDownloadLinks;
  screenshots?: CmsScreenshots;
  contact?: CmsContact;
  seo?: CmsSeo;
  footer?: CmsFooter;
}

/** Resolved store links after applying CMS overrides */
export interface StoreLinks {
  appStore: string | null;
  googlePlay: string | null;
}

/** Resolved contact config after applying CMS overrides */
export interface ResolvedContact {
  whatsapp: string;
  email: string;
  facebook: string;
  instagram: string;
}

/**
 * Fetch all CMS sections. Returns empty object on error so the site
 * always falls back gracefully to the static dictionary values.
 */
export async function getCmsContent(): Promise<CmsData> {
  try {
    const res = await fetch(CMS_URL, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return {};
    return (await res.json()) as CmsData;
  } catch {
    return {};
  }
}
