import {
  UtensilsCrossed,
  ShoppingCart,
  Carrot,
  Pill,
  Beef,
  Croissant,
  Cake,
  CupSoda,
  SprayCan,
  Flower2,
  BookOpen,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "../Reveal";
import type { Dictionary, ServiceKey } from "@/lib/dictionaries";

const icons: Record<ServiceKey, LucideIcon> = {
  restaurants: UtensilsCrossed,
  supermarket: ShoppingCart,
  produce: Carrot,
  pharmacy: Pill,
  meat: Beef,
  bakery: Croissant,
  sweets: Cake,
  drinks: CupSoda,
  perfume: SprayCan,
  flowers: Flower2,
  bookstore: BookOpen,
  stores: Store,
};

const order: ServiceKey[] = [
  "restaurants",
  "supermarket",
  "produce",
  "pharmacy",
  "meat",
  "bakery",
  "sweets",
  "drinks",
  "perfume",
  "flowers",
  "bookstore",
  "stores",
];

export function Services({ t }: { t: Dictionary }) {
  return (
    <section id="services" className="scroll-mt-20 bg-cream py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.services.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t.services.title}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t.services.subtitle}</p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
          {order.map((key, i) => {
            const Icon = icons[key];
            const highlight = key === "stores";
            return (
              <Reveal key={key} delay={(i % 4) * 60}>
                <div
                  className={`group flex h-full items-center gap-3.5 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-1 sm:flex-col sm:items-start sm:gap-4 sm:p-5 ${
                    highlight
                      ? "border-transparent bg-brand-500 text-white shadow-glow"
                      : "border-ink/5 bg-white shadow-card hover:border-brand-200 hover:shadow-card-hover"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      highlight
                        ? "bg-white/15 text-white"
                        : "bg-brand-50 text-brand-500 group-hover:bg-brand-500 group-hover:text-white"
                    }`}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="text-[0.95rem] font-bold sm:text-base">
                    {t.services.items[key]}
                  </span>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-8 text-center">
          <p className="text-sm font-semibold text-ink-muted">{t.services.more}</p>
        </Reveal>
      </div>
    </section>
  );
}
