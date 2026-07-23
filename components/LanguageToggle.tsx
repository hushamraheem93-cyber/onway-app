"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import type { Locale } from "@/lib/config";

// Swaps the locale segment of the current path (/ar/... <-> /en/...).
export function LanguageToggle({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const pathname = usePathname() || `/${locale}`;
  const target: Locale = locale === "ar" ? "en" : "ar";
  const nextPath = pathname.replace(/^\/(ar|en)/, `/${target}`);

  return (
    <Link
      href={nextPath}
      hrefLang={target}
      aria-label={target === "en" ? "Switch to English" : "التبديل إلى العربية"}
      className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3.5 py-2 text-sm font-bold text-ink transition-colors hover:border-brand-500 hover:text-brand-600"
    >
      <Languages className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
