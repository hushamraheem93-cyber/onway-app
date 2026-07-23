import { Store, ListPlus, CheckCircle2, Bike, PackageCheck, type LucideIcon } from "lucide-react";
import { Reveal } from "../Reveal";
import type { Dictionary } from "@/lib/dictionaries";

const stepIcons: LucideIcon[] = [Store, ListPlus, CheckCircle2, Bike, PackageCheck];

export function HowItWorks({ t }: { t: Dictionary }) {
  return (
    <section id="how" className="scroll-mt-20 overflow-hidden bg-ink py-20 text-white md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow !text-brand-400">{t.how.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {t.how.title}
          </h2>
          <p className="mt-4 text-lg text-white/60">{t.how.subtitle}</p>
        </Reveal>

        {/* The route: a thread that connects 5 stops */}
        <ol className="relative mx-auto mt-14 max-w-3xl">
          {/* vertical route line (behind the pins), starts inline for RTL/LTR */}
          <span
            aria-hidden
            className="absolute top-4 h-[calc(100%-2rem)] w-0.5 bg-gradient-to-b from-brand-500 via-brand-500/60 to-white/10"
            style={{ insetInlineStart: "1.5rem" }}
          />
          {t.how.steps.map((step, i) => {
            const Icon = stepIcons[i];
            const last = i === t.how.steps.length - 1;
            return (
              <Reveal as="li" key={i} delay={i * 90} className="relative flex gap-5 pb-10 last:pb-0">
                {/* pin */}
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-ink bg-brand-500 shadow-glow">
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                  {last && (
                    <span className="absolute inset-0 -z-10 rounded-full bg-brand-500/50 motion-safe:animate-pulse-ring" />
                  )}
                </span>
                <div className="pt-1">
                  <span className="font-display text-sm font-bold text-brand-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-0.5 text-xl font-bold">{step.title}</h3>
                  <p className="mt-1.5 max-w-md leading-relaxed text-white/60">{step.body}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
