import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fontVariables } from "@/lib/fonts";
import { getDictionary } from "@/lib/dictionaries";
import { siteConfig, locales, isLocale, dir, type Locale } from "@/lib/config";
import { getCmsContent } from "@/lib/cms";
import { JsonLd } from "@/components/JsonLd";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const locale = isLocale(params.locale) ? params.locale : "ar";
  const t = getDictionary(locale);
  const path = `/${locale}`;

  // Fetch CMS SEO data (falls back to dictionary values if empty/unavailable)
  let cmsTitle = t.meta.title;
  let cmsDescription = t.meta.description;
  let cmsKeywords = t.meta.keywords;
  let ogImage: string | undefined;

  try {
    const cms = await getCmsContent();
    const seo = cms.seo;
    if (seo) {
      if (locale === "ar") {
        if (seo.title_ar?.trim()) cmsTitle = seo.title_ar;
        if (seo.description_ar?.trim()) cmsDescription = seo.description_ar;
        if (seo.keywords?.trim()) cmsKeywords = seo.keywords;
      }
      if (seo.ogImageUrl?.trim()) ogImage = seo.ogImageUrl;
    }
  } catch {
    // silently fall back to dictionary values
  }

  return {
    metadataBase: new URL(siteConfig.url),
    title: cmsTitle,
    description: cmsDescription,
    keywords: cmsKeywords,
    alternates: {
      canonical: path,
      languages: {
        ar: "/ar",
        en: "/en",
        "x-default": "/ar",
      },
    },
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      title: cmsTitle,
      description: cmsDescription,
      url: path,
      locale: locale === "ar" ? "ar_IQ" : "en_US",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: cmsTitle,
      description: cmsDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/icon.svg", type: "image/svg+xml" },
      ],
      apple: "/logo.png",
    },
  };
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;

  return (
    <html lang={locale} dir={dir(locale)} className={fontVariables}>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <JsonLd locale={locale} />
        {children}
      </body>
    </html>
  );
}
