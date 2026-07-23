import { notFound } from "next/navigation";
import { getDictionary } from "@/lib/dictionaries";
import { isLocale, type Locale } from "@/lib/config";
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

export default function Home({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  const t = getDictionary(locale);

  return (
    <>
      <Header t={t} locale={locale} />
      <main>
        <Hero t={t} locale={locale} />
        <Services t={t} />
        <WhyOnWay t={t} />
        <HowItWorks t={t} />
        <AppShowcase t={t} locale={locale} />
        <Partners t={t} locale={locale} />
        <Faq t={t} />
        <Contact t={t} />
        <FinalCta t={t} />
      </main>
      <Footer t={t} locale={locale} />
    </>
  );
}
