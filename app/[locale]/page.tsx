import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
import { getCmsContent } from "@/lib/cms";
import { mergeCmsIntoDictionary, resolveContact, resolveStoreLinks } from "@/lib/mergeCms";
import { Header } from "@/components/Header";
import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";
import { WhyOnWay } from "@/components/sections/WhyOnWay";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { AppShowcase } from "@/components/sections/AppShowcase";
import { Partners } from "@/components/sections/Partners";
import { Faq } from "@/components/sections/Faq";
import { Contact } from "@/components/sections/Contact";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";

export default async function Home({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;

  // Fetch CMS data and static dictionary in parallel
  const [cms, t] = await Promise.all([
    getCmsContent(),
    Promise.resolve(getDictionary(locale)),
  ]);

  // Merge CMS data on top of the static dictionary (falls back to dict on empty CMS fields)
  const mergedT = mergeCmsIntoDictionary(t, cms, locale);
  const contact = resolveContact(cms);
  const storeLinks = resolveStoreLinks(cms);

  // Screenshots from CMS (only used when at least 4 images are uploaded)
  const cmsImages = (cms.screenshots?.images ?? []).filter(Boolean);

  return (
    <>
      <Header t={mergedT} locale={locale} />
      <main>
        <Hero t={mergedT} locale={locale} />
        <Services t={mergedT} />
        <WhyOnWay t={mergedT} cmsFeatures={cms.features?.items} />
        <HowItWorks t={mergedT} />
        <AppShowcase
          t={mergedT}
          locale={locale}
          cmsImages={cmsImages.length >= 4 ? cmsImages : undefined}
        />
        <Partners t={mergedT} locale={locale} contact={contact} />
        <Faq t={mergedT} />
        <Contact t={mergedT} contact={contact} />
        <FinalCta t={mergedT} storeLinks={storeLinks} />
      </main>
      <Footer t={mergedT} locale={locale} contact={contact} storeLinks={storeLinks} />
    </>
  );
}
