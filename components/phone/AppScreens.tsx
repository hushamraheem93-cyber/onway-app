import {
  Search,
  UtensilsCrossed,
  ShoppingCart,
  Carrot,
  Pill,
  Croissant,
  Cake,
  Store,
  Bike,
  MapPin,
  Phone,
  Minus,
  Plus,
} from "lucide-react";
import { RouteLine } from "../RouteLine";
import type { Dictionary } from "@/lib/dictionaries";

// ── Live tracking (hero centerpiece) ─────────────────────────────
export function TrackingScreen({ t }: { t: Dictionary }) {
  return (
    <div className="flex h-full flex-col">
      {/* map area */}
      <div className="relative h-[58%] w-full bg-[#F1ECE6]">
        <RouteLine className="absolute inset-0 h-full w-full" />
        {/* moving driver marker */}
        <div className="absolute left-[38%] top-[44%] -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inset-0 -z-10 rounded-full bg-brand-500/40 motion-safe:animate-pulse-ring" />
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-glow">
            <Bike className="h-4 w-4" />
          </span>
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-ink shadow-sm backdrop-blur">
          {t.hero.trackEta}
        </div>
      </div>

      {/* status sheet */}
      <div className="-mt-5 flex-1 rounded-t-3xl bg-white px-4 pt-4">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/10" />
        <p className="text-[13px] font-extrabold text-ink">{t.hero.trackTitle}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-brand-600">
          <MapPin className="h-3.5 w-3.5" />
          {t.hero.trackStatus}
        </div>

        {/* progress */}
        <div className="mt-3 flex items-center gap-1">
          <span className="h-1.5 flex-1 rounded-full bg-brand-500" />
          <span className="h-1.5 flex-1 rounded-full bg-brand-500" />
          <span className="h-1.5 flex-1 rounded-full bg-brand-500" />
          <span className="h-1.5 flex-1 rounded-full bg-ink/10" />
        </div>

        {/* driver card */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-cream p-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-white">
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-bold text-ink">{t.hero.driverName}</p>
            <p className="truncate text-[10px] font-medium text-ink-muted">{t.hero.driverRole}</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white">
            <Phone className="h-4 w-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Home ─────────────────────────────────────────────────────────
const homeCats = [
  { icon: UtensilsCrossed, label: "🍽" },
  { icon: ShoppingCart, label: "🛒" },
  { icon: Carrot, label: "🥕" },
  { icon: Pill, label: "💊" },
  { icon: Croissant, label: "🥐" },
  { icon: Cake, label: "🍰" },
];

export function HomeScreen({ t }: { t: Dictionary }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="bg-brand-500 px-4 pb-5 pt-6 text-white">
        <p className="text-[10px] font-semibold opacity-90">OnWay</p>
        <p className="text-[13px] font-extrabold">{t.services.title.split("،")[0]}</p>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 py-2 text-ink-muted">
          <Search className="h-3.5 w-3.5" />
          <span className="text-[10px] font-medium">{t.nav.services}…</span>
        </div>
      </div>
      {/* promo banner */}
      <div className="px-4">
        <div className="-mt-3 flex items-center justify-between rounded-2xl bg-ink px-3 py-3 text-white shadow-card">
          <div>
            <p className="text-[11px] font-extrabold">-20%</p>
            <p className="text-[8px] opacity-80">{t.services.more}</p>
          </div>
          <Store className="h-6 w-6 text-brand-400" />
        </div>
      </div>
      {/* category grid */}
      <div className="grid grid-cols-3 gap-2.5 px-4 pt-4">
        {homeCats.map((c, i) => (
          <div
            key={i}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl bg-cream"
          >
            <c.icon className="h-5 w-5 text-brand-500" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Store (product list) ─────────────────────────────────────────
export function StoreScreen({ t }: { t: Dictionary }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-ink/5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
          <UtensilsCrossed className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[12px] font-extrabold text-ink">{t.services.items.restaurants}</p>
          <p className="text-[9px] font-medium text-ink-muted">★ 4.8 · 20–30</p>
        </div>
      </div>
      <div className="flex-1 space-y-2.5 px-4 pt-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-2xl bg-cream p-2">
            <span className="h-11 w-11 rounded-xl bg-brand-100" />
            <div className="flex-1">
              <span className="block h-2 w-20 rounded-full bg-ink/10" />
              <span className="mt-1.5 block h-2 w-12 rounded-full bg-ink/5" />
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-white">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cart ─────────────────────────────────────────────────────────
export function CartScreen({ t }: { t: Dictionary }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-ink/5 px-4 py-4">
        <p className="text-[12px] font-extrabold text-ink">{t.showcase.screens[2].title}</p>
      </div>
      <div className="flex-1 space-y-2.5 px-4 pt-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-2xl bg-cream p-2">
            <span className="h-10 w-10 rounded-xl bg-brand-100" />
            <div className="flex-1">
              <span className="block h-2 w-16 rounded-full bg-ink/10" />
              <span className="mt-1.5 block h-2 w-10 rounded-full bg-brand-200" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-ink shadow-sm">
                <Minus className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-bold">1</span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
                <Plus className="h-3 w-3" />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-ink/5 p-4">
        <div className="flex items-center justify-center rounded-full bg-brand-500 py-2.5 text-[11px] font-extrabold text-white">
          {t.cta.download}
        </div>
      </div>
    </div>
  );
}

export const screenMap = {
  home: HomeScreen,
  store: StoreScreen,
  cart: CartScreen,
  tracking: TrackingScreen,
} as const;

export type ScreenName = keyof typeof screenMap;
