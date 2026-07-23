import Link from "next/link";
import { MessageCircle, Facebook, Instagram, Mail, Heart } from "lucide-react";
import { LogoMark } from "../LogoMark";
import { siteConfig } from "@/lib/config";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";

export function Footer({ t, locale }: { t: Dictionary; locale: Locale }) {
  const year = new Date().getFullYear();

  const productLinks = [
    { href: "#services", label: t.footer.links.services },
    { href: "#how", label: t.footer.links.how },
    { href: "#partners", label: t.footer.links.partners },
    { href: "#faq", label: t.footer.links.faq },
  ];
  const legalLinks = [
    { href: `/${locale}/privacy`, label: t.footer.links.privacy },
    { href: `/${locale}/terms`, label: t.footer.links.terms },
    { href: "#contact", label: t.footer.links.contact },
  ];
  const socials = [
    { Icon: MessageCircle, href: `https://wa.me/${siteConfig.whatsapp}`, label: t.contact.whatsapp },
    { Icon: Facebook, href: siteConfig.facebook, label: t.contact.facebook },
    { Icon: Instagram, href: siteConfig.instagram, label: t.contact.instagram },
    { Icon: Mail, href: `mailto:${siteConfig.email}`, label: t.contact.email },
  ];

  return (
    <footer className="border-t border-ink/5 bg-white">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          {/* brand */}
          <div className="max-w-sm">
            <LogoMark />
            <p className="mt-4 leading-relaxed text-ink-muted">{t.footer.tagline}</p>
            <div className="mt-5 flex gap-2.5">
              {socials.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink-muted transition-colors hover:border-brand-500 hover:bg-brand-500 hover:text-white"
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          {/* product */}
          <nav aria-label={t.footer.product}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">{t.footer.product}</h3>
            <ul className="mt-4 space-y-3">
              {productLinks.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="text-ink-muted transition-colors hover:text-brand-600">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* legal */}
          <nav aria-label={t.footer.legal}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-ink">{t.footer.legal}</h3>
            <ul className="mt-4 space-y-3">
              {legalLinks.map((l) =>
                l.href.startsWith("/") ? (
                  <li key={l.href}>
                    <Link href={l.href} className="text-ink-muted transition-colors hover:text-brand-600">
                      {l.label}
                    </Link>
                  </li>
                ) : (
                  <li key={l.href}>
                    <a href={l.href} className="text-ink-muted transition-colors hover:text-brand-600">
                      {l.label}
                    </a>
                  </li>
                )
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-ink/5 pt-6 text-sm text-ink-muted sm:flex-row">
          <p>
            © {year} {siteConfig.name}. {t.footer.rights}
          </p>
          <p className="inline-flex items-center gap-1.5">
            {t.footer.madeIn}
            <Heart className="h-4 w-4 fill-brand-500 text-brand-500" aria-hidden="true" />
          </p>
        </div>
      </div>
    </footer>
  );
}
