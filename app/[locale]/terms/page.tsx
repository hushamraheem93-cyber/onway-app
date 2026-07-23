import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale, type Locale, siteConfig } from "@/lib/config";
import { terms } from "@/lib/legal";
import { LegalLayout } from "@/components/LegalLayout";

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const locale = isLocale(params.locale) ? params.locale : "ar";
  const doc = terms[locale];
  return {
    metadataBase: new URL(siteConfig.url),
    title: `${doc.title} — ${siteConfig.name}`,
    alternates: { canonical: `/${locale}/terms` },
  };
}

export default function TermsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const t = getDictionary(locale);
  const doc = terms[locale];

  return (
    <LegalLayout
      t={t}
      locale={locale}
      title={doc.title}
      updated={doc.updated}
      sections={doc.sections}
    />
  );
}
