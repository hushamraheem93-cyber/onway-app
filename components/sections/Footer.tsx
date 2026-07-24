import Link from "next/link";
import { MessageCircle, Facebook, Instagram, Mail, Heart } from "lucide-react";
import { LogoMark } from "../LogoMark";
import { siteConfig } from "@/lib/config";
import type { Dictionary } from "@/lib/dictionaries";
import type { Locale } from "@/lib/config";
import type { ResolvedContact, StoreLinks } from "@/lib/cms";

interface Props {
  t: Dictionary;
  locale: Locale;
  /** CMS-resolved contact info. Falls back to siteConfig when not provided. */
  contact?: ResolvedContact;
  storeLinks?: StoreLinks;
}

export function Footer({ t, locale, contact }: Props) {
  const year = new Date().getFullYear();

  const whatsapp = contact?.whatsapp ?? siteConfig.whatsapp;
  const email = contact?.email ?? siteConfig.email;
  const facebook = contact?.facebook ?? siteConfig.facebook;
  const instagram = contact?.instagram ?? siteConfig.instagram;

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
    { Icon: MessageCircle, href: `https://wa.me/${whatsapp}`, label: t.contact.whatsapp },
    { Icon: Facebook, href: facebook, label: t.contact.facebook },
    { Icon: Instagram, href: instagram, label: t.contact.instagram },
    { Icon: Mail, href: `mailto:${email}`, label: t.contact.email },
  ];

  return (
    <footer className="border-t border-ink/5 bg-white">
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
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
          <p>© {year} {siteConfig.name}. {t.footer.rights}</p>
          <p className="inline-flex items-center gap-1.5">
            {t.footer.madeIn}
            <Heart className="h-4 w-4 fill-brand-500 text-brand-500" aria-hidden="true" />
          </p>
        </div>
      </div>
    </footer>
  );
}
