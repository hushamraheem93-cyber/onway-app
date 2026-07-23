import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { PhoneFrame } from "../phone/PhoneFrame";
import { TrackingScreen } from "../phone/AppScreens";
import { AppStoreButtons } from "../AppStoreButtons";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

export function Hero({ t, locale }: { t: Dictionary; locale: Locale }) {
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <section id="top" className="relative overflow-hidden">
      {/* ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full bg-brand-200/40 blur-3xl" />
        <div className="absolute left-[-8%] top-40 h-72 w-72 rounded-full bg-brand-100/50 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(20,20,25,0.05) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
      </div>

      <div className="container-page grid items-center gap-12 pb-16 pt-10 md:pb-24 md:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
        {/* copy */}
        <div className="max-w-xl">
          <span className="eyebrow animate-fade-up rounded-full bg-brand-50 px-3 py-1.5">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {t.hero.badge}
          </span>

          <h1 className="mt-5 animate-fade-up font-display text-[2.6rem] font-bold leading-[1.08] tracking-tight text-ink sm:text-6xl">
            {t.hero.titleLead}{" "}
            <span className="relative whitespace-nowrap text-brand-500">
              {t.hero.titleHi}
              <svg
                className="absolute -bottom-2 left-0 h-3 w-full text-brand-300"
                viewBox="0 0 200 12"
                fill="none"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  d="M2 8c40-6 120-6 196 1"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p
            className="mt-6 animate-fade-up text-lg leading-relaxed text-ink-muted"
            style={{ animationDelay: "80ms" }}
          >
            {t.hero.subtitle}
          </p>

          <div
            className="mt-8 flex animate-fade-up flex-wrap gap-3"
            style={{ animationDelay: "160ms" }}
          >
            <a href="#download" className="btn-primary">
              {t.hero.download}
              <Arrow className="h-5 w-5" aria-hidden="true" />
            </a>
            <a href="#partners" className="btn-ghost">
              {t.hero.partner}
            </a>
          </div>

          {/* stats */}
          <dl
            className="mt-10 grid animate-fade-up grid-cols-3 gap-4 border-t border-ink/5 pt-6"
            style={{ animationDelay: "240ms" }}
          >
            {t.hero.stats.map((s) => (
              <div key={s.label}>
                <dt className="font-display text-2xl font-bold text-ink sm:text-3xl">
                  {s.value}
                </dt>
                <dd className="mt-1 text-sm font-medium text-ink-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* phone */}
        <div className="relative flex justify-center lg:justify-end">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 m-auto h-[22rem] w-[22rem] rounded-full bg-gradient-to-br from-brand-400 to-brand-600 opacity-20 blur-3xl"
          />
          <div className="animate-fade-up motion-safe:animate-float" style={{ animationDelay: "120ms" }}>
            <PhoneFrame>
              <TrackingScreen t={t} />
            </PhoneFrame>
          </div>

          {/* floating chips */}
          <div
            className="absolute top-6 hidden animate-fade-up rounded-2xl bg-white px-3.5 py-2.5 shadow-card sm:block"
            style={{ insetInlineStart: "0", animationDelay: "320ms" }}
          >
            <p className="text-xs font-bold text-ink">{t.hero.launch}</p>
            <p className="text-[11px] font-medium text-brand-600">{t.hero.badge.split("،")[0]}</p>
          </div>
        </div>
      </div>

      {/* store buttons band */}
      <div className="container-page -mt-4 pb-6" id="download">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-ink/5 bg-white/70 p-5 text-center shadow-card backdrop-blur sm:flex-row sm:justify-between sm:text-start">
          <p className="text-base font-bold text-ink sm:text-lg">
            {t.cta.subtitle}
          </p>
          <AppStoreButtons t={t} />
        </div>
      </div>
    </section>
  );
}
