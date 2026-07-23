"use client";

import { useEffect, useState } from "react";
import { Menu, X, Download } from "lucide-react";
import { LogoMark } from "./LogoMark";
import { LanguageToggle } from "./LanguageToggle";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

export function Header({ t, locale }: { t: Dictionary; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll when the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "#services", label: t.nav.services },
    { href: "#why", label: t.nav.why },
    { href: "#how", label: t.nav.how },
    { href: "#partners", label: t.nav.partners },
    { href: "#faq", label: t.nav.faq },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-ink/5 bg-white/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-[4.5rem]">
        <a href="#top" aria-label="OnWay" className="shrink-0">
          <LogoMark />
        </a>

        <nav className="hidden items-center gap-7 lg:flex" aria-label={t.nav.services}>
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[0.95rem] font-semibold text-ink-soft transition-colors hover:text-brand-600"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:block">
            <LanguageToggle locale={locale} label={t.nav.switchTo} />
          </div>
          <a href="#download" className="btn-primary hidden !px-5 !py-2.5 !text-[0.95rem] sm:inline-flex">
            <Download className="h-4 w-4" aria-hidden="true" />
            {t.nav.download}
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink/10 text-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="lg:hidden">
          <div className="container-page animate-fade-in border-t border-ink/5 pb-6 pt-2">
            <nav className="flex flex-col" aria-label={t.nav.services}>
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-ink/5 py-3.5 text-lg font-bold text-ink"
                >
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="mt-5 flex items-center justify-between gap-3">
              <LanguageToggle locale={locale} label={t.nav.switchTo} />
              <a
                href="#download"
                onClick={() => setOpen(false)}
                className="btn-primary flex-1"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                {t.nav.download}
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
