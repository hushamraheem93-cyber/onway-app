import { Fragment } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { DeviceShot } from "../phone/DeviceShot";
import { Reveal } from "../Reveal";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

// Real app screenshots, in the order of the getting-started journey.
const screens = [
  "/app/onboarding-1.png", // open the app
  "/app/login.png", // sign in with phone
  "/app/home.png", // browse and order
  "/app/onboarding-3.png", // track to the door
];

export function AppShowcase({ t, locale }: { t: Dictionary; locale: Locale }) {
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

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

        {/* Step flow — real screens numbered and connected */}
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
                    alt={t.showcase.screens[i].title}
                    className="!w-[190px]"
                  />
                  {/* step number */}
                  <span className="absolute -top-3 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-4 border-cream bg-brand-500 font-display text-sm font-bold text-white shadow-glow">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-bold text-ink">
                  {t.showcase.screens[i].title}
                </h3>
                <p className="mt-1.5 max-w-[210px] text-center text-sm leading-relaxed text-ink-muted">
                  {t.showcase.screens[i].caption}
                </p>
              </Reveal>

              {/* connector arrow (desktop only) */}
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
