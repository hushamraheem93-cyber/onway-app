import { MessageCircle, Facebook, Instagram, Mail, type LucideIcon } from "lucide-react";
import { Reveal } from "../Reveal";
import { siteConfig } from "@/lib/config";
import type { Dictionary } from "@/lib/dictionaries";
import type { ResolvedContact } from "@/lib/cms";

interface Props {
  t: Dictionary;
  /** CMS-resolved contact info. Falls back to siteConfig when not provided. */
  contact?: ResolvedContact;
}

export function Contact({ t, contact }: Props) {
  const whatsapp = contact?.whatsapp ?? siteConfig.whatsapp;
  const email = contact?.email ?? siteConfig.email;
  const facebook = contact?.facebook ?? siteConfig.facebook;
  const instagram = contact?.instagram ?? siteConfig.instagram;

  const channels: {
    Icon: LucideIcon;
    label: string;
    value: string;
    href: string;
    tint: string;
  }[] = [
    {
      Icon: MessageCircle,
      label: t.contact.whatsapp,
      value: `+${whatsapp}`,
      href: `https://wa.me/${whatsapp}`,
      tint: "bg-[#25D366]/10 text-[#128C4B]",
    },
    {
      Icon: Facebook,
      label: t.contact.facebook,
      value: "@onwayiq",
      href: facebook,
      tint: "bg-[#1877F2]/10 text-[#1877F2]",
    },
    {
      Icon: Instagram,
      label: t.contact.instagram,
      value: "@onwayiq",
      href: instagram,
      tint: "bg-[#E1306C]/10 text-[#E1306C]",
    },
    {
      Icon: Mail,
      label: t.contact.email,
      value: email,
      href: `mailto:${email}`,
      tint: "bg-brand-50 text-brand-500",
    },
  ];

  return (
    <section id="contact" className="scroll-mt-20 bg-cream py-20 md:py-28">
      <div className="container-page">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">{t.contact.eyebrow}</span>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t.contact.title}
          </h2>
          <p className="mt-4 text-lg text-ink-muted">{t.contact.subtitle}</p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {channels.map(({ Icon, label, value, href, tint }, i) => (
            <Reveal key={label} delay={(i % 4) * 60}>
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="group flex h-full flex-col items-center gap-3 rounded-3xl border border-ink/5 bg-white p-6 text-center shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-card-hover"
              >
                <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tint}`}>
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <span className="font-bold text-ink">{label}</span>
                <span dir="ltr" className="text-sm font-medium text-ink-muted">
                  {value}
                </span>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
