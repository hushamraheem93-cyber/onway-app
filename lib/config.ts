// Central place for brand + contact details.
// Replace the placeholder values below with the real ones when available.

export const siteConfig = {
  name: "OnWay",
  domain: "onwayiq.com",
  url: "https://onwayiq.com",
  // Contact — placeholders, safe to edit later
  whatsapp: "9647700000000", // international format, no "+" (used in wa.me link)
  email: "info@onwayiq.com",
  facebook: "https://facebook.com/onwayiq",
  instagram: "https://instagram.com/onwayiq",
  // App availability — set to real store URLs once published; null shows "coming soon"
  appStore: null as string | null,
  googlePlay: null as string | null,
};

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const dir = (locale: Locale): "rtl" | "ltr" =>
  locale === "ar" ? "rtl" : "ltr";
