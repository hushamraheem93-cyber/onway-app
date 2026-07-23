import { AppStoreButtons } from "../AppStoreButtons";
import { RouteLine } from "../RouteLine";
import { Reveal } from "../Reveal";
import type { Dictionary } from "@/lib/dictionaries";

export function FinalCta({ t }: { t: Dictionary }) {
  return (
    <section id="download" className="scroll-mt-24 py-6">
      <div className="container-page">
        <Reveal>
          <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-brand-500 to-brand-600 px-6 py-14 text-center text-white shadow-glow sm:px-12 sm:py-20">
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-25">
              <RouteLine className="absolute inset-x-0 bottom-0 h-40 w-full" />
            </div>
            <div aria-hidden className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {t.cta.title}
              </h2>
              <p className="mt-4 text-lg text-white/85">{t.cta.subtitle}</p>
              <div className="mt-8 flex justify-center">
                <AppStoreButtons t={t} variant="dark" />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
