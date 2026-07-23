"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DeviceShot } from "../phone/DeviceShot";
import { Reveal } from "../Reveal";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

// Real app screenshots (stored in /public/app)
const screens = [
  "/app/onboarding-1.png",
  "/app/onboarding-2.png",
  "/app/onboarding-3.png",
  "/app/login.png",
];

export function AppShowcase({ t, locale }: { t: Dictionary; locale: Locale }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const rtl = locale === "ar";

  const scrollTo = (index: number) => {
    const clamped = Math.max(0, Math.min(screens.length - 1, index));
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[clamped] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setActive(clamped);
  };

  return (
    <section className="scroll-mt-20 py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.showcase.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t.showcase.title}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t.showcase.subtitle}</p>
        </Reveal>

        <div className="relative mt-14">
          <div
            ref={trackRef}
            className="no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 sm:justify-center"
          >
            {screens.map((src, i) => (
              <figure
                key={i}
                className="flex shrink-0 snap-center flex-col items-center"
              >
                <div className={i === active ? "" : "opacity-90"}>
                  <DeviceShot
                    src={src}
                    alt={t.showcase.screens[i].title}
                    className="!max-w-[230px]"
                  />
                </div>
                <figcaption className="mt-5 max-w-[230px] text-center">
                  <p className="font-bold text-ink">{t.showcase.screens[i].title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{t.showcase.screens[i].caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>

          {/* controls */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => scrollTo(active + (rtl ? 1 : -1))}
              aria-label={t.showcase.prev}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 text-ink transition-colors hover:border-brand-500 hover:text-brand-600"
            >
              {rtl ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            </button>

            <div className="flex items-center gap-2">
              {screens.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollTo(i)}
                  aria-label={`${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === active ? "w-6 bg-brand-500" : "w-2 bg-ink/15 hover:bg-ink/30"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollTo(active + (rtl ? -1 : 1))}
              aria-label={t.showcase.next}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 text-ink transition-colors hover:border-brand-500 hover:text-brand-600"
            >
              {rtl ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
