import { Fragment } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DeviceShot } from "../phone/DeviceShot";
import { Reveal } from "../Reveal";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

// Static fallback screenshots (used when no CMS images are uploaded)
const STATIC_SCREENS = [
  "/app/onboarding-1.png",
  "/app/login.png",
  "/app/home.png",
  "/app/onboarding-3.png",
];

interface Props {
  t: Dictionary;
  locale: Locale;
  /** CMS-managed screenshot URLs. When provided (≥4 images), overrides the static screenshots. */
  cmsImages?: string[];
}

export function AppShowcase({ t, locale, cmsImages }: Props) {
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const screens = cmsImages ?? STATIC_SCREENS;

  return (
    <section id="steps" className="scroll-mt-20 bg-cream py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.showcase.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t.showcase.title}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t.showcase.subtitle}</p>
        </Reveal>

        <div className="no-scrollbar mt-14 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto pb-4 lg:justify-center lg:gap-0 lg:overflow-visible">
          {screens.map((src, i) => (
            <Fragment key={i}>
              <Reveal
                as="div"
                delay={i * 80}
                className="flex w-[248px] shrink-0 snap-center flex-col items-center px-2 lg:w-[244px]"
              >
                <div className="relative">
                  <DeviceShot
                    src={src}
                    alt={t.showcase.screens[i]?.title ?? `Step ${i + 1}`}
                    className="!w-[190px]"
                  />
                  <span className="absolute -top-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-4 border-cream bg-brand-500 font-display text-sm font-bold text-white shadow-glow">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-bold text-ink">
                  {t.showcase.screens[i]?.title ?? `${i + 1}`}
                </h3>
                <p className="mt-1.5 max-w-[210px] text-center text-sm leading-relaxed text-ink-muted">
                  {t.showcase.screens[i]?.caption ?? ""}
                </p>
              </Reveal>

              {i < screens.length - 1 && (
                <div
                  className="hidden shrink-0 items-center self-center pt-16 lg:flex"
                  aria-hidden="true"
                >
                  <Arrow className="h-7 w-7 text-brand-300" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
