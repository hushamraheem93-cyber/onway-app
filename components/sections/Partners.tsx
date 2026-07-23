import { Store, Bike, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { Reveal } from "../Reveal";
import { siteConfig } from "@/lib/config";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

export function Partners({ t, locale }: { t: Dictionary; locale: Locale }) {
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const wa = (msg: string) =>
    `https://wa.me/${siteConfig.whatsapp}?text=${encodeURIComponent(msg)}`;

  const cards = [
    {
      Icon: Store,
      data: t.partners.store,
      href: wa(
        locale === "ar" ? "مرحبًا، أريد تسجيل متجري في OnWay" : "Hi, I'd like to register my store on OnWay"
      ),
      dark: false,
    },
    {
      Icon: Bike,
      data: t.partners.driver,
      href: wa(
        locale === "ar" ? "مرحبًا، أريد الانضمام كسائق في OnWay" : "Hi, I'd like to become an OnWay driver"
      ),
      dark: true,
    },
  ];

  return (
    <section id="partners" className="scroll-mt-20 bg-cream py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.partners.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t.partners.title}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t.partners.subtitle}</p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {cards.map(({ Icon, data, href, dark }, i) => (
            <Reveal key={i} delay={i * 90}>
              <article
                className={`relative flex h-full flex-col overflow-hidden rounded-4xl p-8 shadow-card sm:p-10 ${
                  dark ? "bg-ink text-white" : "border border-ink/5 bg-white text-ink"
                }`}
              >
                {/* ambient corner */}
                <div
                  aria-hidden
                  className={`absolute -right-10 -top-10 h-40 w-40 rounded-full blur-2xl ${
                    dark ? "bg-brand-500/30" : "bg-brand-200/40"
                  }`}
                />
                <span
                  className={`relative flex h-14 w-14 items-center justify-center rounded-2xl ${
                    dark ? "bg-brand-500 text-white" : "bg-brand-50 text-brand-500"
                  }`}
                >
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <h3 className="relative mt-6 text-2xl font-bold">{data.title}</h3>
                <p className={`relative mt-3 leading-relaxed ${dark ? "text-white/60" : "text-ink-muted"}`}>
                  {data.body}
                </p>
                <ul className="relative mt-6 space-y-3">
                  {data.points.map((p) => (
                    <li key={p} className="flex items-center gap-3">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          dark ? "bg-white/10 text-brand-400" : "bg-brand-50 text-brand-500"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="font-medium">{p}</span>
                    </li>
                  ))}
                </ul>
                <div className="relative mt-8 pt-2">
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={dark ? "btn-primary w-full sm:w-auto" : "btn-dark w-full sm:w-auto"}
                  >
                    {data.cta}
                    <Arrow className="h-5 w-5" aria-hidden="true" />
                  </a>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
