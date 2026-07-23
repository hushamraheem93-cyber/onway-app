import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { LanguageToggle } from "./LanguageToggle";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

// Shared shell for the privacy / terms pages.
export function LegalLayout({
  t,
  locale,
  title,
  updated,
  sections,
}: {
  t: Dictionary;
  locale: Locale;
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
}) {
  const Arrow = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <>
      <header className="border-b border-ink/5">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href={`/${locale}`} aria-label="OnWay">
            <LogoMark />
          </Link>
          <LanguageToggle locale={locale} label={t.nav.switchTo} />
        </div>
      </header>

      <main className="container-page py-14 md:py-20">
        <Link
          href={`/${locale}`}
          className="inline-flex items-center gap-2 text-sm font-bold text-brand-600 hover:text-brand-700"
        >
          <Arrow className="h-4 w-4" aria-hidden="true" />
          {t.nav.download}
        </Link>

        <h1 className="mt-6 font-display text-4xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{updated}</p>

        <div className="mt-10 max-w-3xl space-y-8">
          {sections.map((s, i) => (
            <section key={i}>
              <h2 className="text-xl font-bold text-ink">{s.heading}</h2>
              <p className="mt-2 leading-relaxed text-ink-muted">{s.body}</p>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-ink/5">
        <div className="container-page py-6 text-sm text-ink-muted">
          © {new Date().getFullYear()} OnWay. {t.footer.rights}
        </div>
      </footer>
    </>
  );
}
