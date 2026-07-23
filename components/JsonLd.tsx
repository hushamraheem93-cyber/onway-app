import { siteConfig, type Locale } from "@/lib/config";
import { getDictionary } from "@/lib/dictionaries";

// Structured data for SEO / rich results.
export function JsonLd({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);

  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      logo: `${siteConfig.url}/icon.svg`,
      email: siteConfig.email,
      areaServed: "IQ",
      sameAs: [siteConfig.facebook, siteConfig.instagram],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: siteConfig.name,
      applicationCategory: "ShoppingApplication",
      operatingSystem: "Android, iOS",
      description: t.meta.description,
      offers: { "@type": "Offer", price: "0", priceCurrency: "IQD" },
    },
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
