import { siteConfig } from "@/lib/config";
import type { Dictionary } from "@/lib/dictionaries";

// Solid Apple logo
function AppleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.564 13.02c-.03-2.79 2.28-4.13 2.38-4.19-1.3-1.9-3.32-2.16-4.04-2.19-1.72-.17-3.36 1.01-4.23 1.01-.87 0-2.22-.99-3.65-.96-1.88.03-3.6 1.09-4.57 2.77-1.95 3.38-.5 8.38 1.4 11.13.93 1.35 2.03 2.86 3.48 2.8 1.4-.06 1.92-.9 3.61-.9 1.68 0 2.16.9 3.64.87 1.5-.03 2.45-1.37 3.37-2.72 1.06-1.56 1.5-3.07 1.52-3.15-.03-.01-2.92-1.12-2.95-4.44zM14.77 4.84c.77-.93 1.29-2.22 1.15-3.51-1.11.04-2.46.74-3.25 1.67-.71.82-1.33 2.14-1.16 3.4 1.24.1 2.5-.63 3.26-1.56z" />
    </svg>
  );
}

// Official-style colored Google Play triangle
function PlayGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92z" fill="#00C3FF" />
      <path d="M16.802 15.011l-2.99-2.99L16.803 9.03l3.446 1.96c.98.556.98 1.9 0 2.457l-3.447 1.564z" fill="#FFD500" />
      <path d="M3.61 22.186l10.182-10.166 2.99 2.99L6.207 23.03c-.752.43-1.593.297-2.597-.844z" fill="#00E676" />
      <path d="M3.61 1.814C4.614.673 5.455.54 6.207.97l10.575 6.02-2.99 2.99L3.61 1.814z" fill="#FF3A44" />
    </svg>
  );
}

function Badge({
  href,
  glyph,
  top,
  big,
}: {
  href: string | null;
  glyph: React.ReactNode;
  top: string;
  big: string;
}) {
  const inner = (
    <span
      dir="ltr"
      className="inline-flex min-w-[190px] items-center gap-3 rounded-2xl border border-white/10 bg-ink px-5 py-3 text-white shadow-lg transition-transform duration-200"
    >
      {glyph}
      <span className="flex flex-col items-start leading-none">
        <span className="text-[11px] font-medium opacity-90">{top}</span>
        <span className="-mt-0.5 text-xl font-bold tracking-tight">{big}</span>
      </span>
    </span>
  );

  return href ? (
    <a href={href} className="hover:-translate-y-0.5">
      {inner}
    </a>
  ) : (
    <span aria-disabled="true" className="cursor-default">
      {inner}
    </span>
  );
}

// Big, centered, official-style colored store badges.
export function AppStoreButtons({ t }: { t: Dictionary }) {
  const notLive = !siteConfig.appStore && !siteConfig.googlePlay;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Badge
          href={siteConfig.googlePlay}
          glyph={<PlayGlyph className="h-8 w-8 shrink-0" />}
          top="GET IT ON"
          big="Google Play"
        />
        <Badge
          href={siteConfig.appStore}
          glyph={<AppleGlyph className="h-8 w-8 shrink-0" />}
          top="Download on the"
          big="App Store"
        />
      </div>
      {notLive && (
        <p className="text-sm font-semibold text-white/80">
          {t.common.comingSoon}
        </p>
      )}
    </div>
  );
}
