import {
  Zap,
  MapPinned,
  LayoutGrid,
  MousePointerClick,
  BellRing,
  Headset,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "../Reveal";
import type { Dictionary, FeatureKey } from "@/lib/dictionaries";

const icons: Record<FeatureKey, LucideIcon> = {
  fast: Zap,
  tracking: MapPinned,
  multi: LayoutGrid,
  easy: MousePointerClick,
  notifications: BellRing,
  support: Headset,
};

const order: FeatureKey[] = [
  "fast",
  "tracking",
  "multi",
  "easy",
  "notifications",
  "support",
];

export function WhyOnWay({ t }: { t: Dictionary }) {
  return (
    <section id="why" className="scroll-mt-20 py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.why.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t.why.title}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t.why.subtitle}</p>
        </Reveal>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {order.map((key, i) => {
            const Icon = icons[key];
            const item = t.why.items[key];
            return (
              <Reveal key={key} delay={(i % 3) * 70}>
                <article className="group h-full rounded-3xl border border-ink/5 bg-white p-6 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card-hover">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-ink">{item.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-muted">{item.body}</p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
