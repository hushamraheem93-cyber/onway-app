import { Apple, Play } from "lucide-react";
import { siteConfig } from "@/lib/config";
import type { Dictionary } from "@/lib/dictionaries";

// Renders App Store + Google Play buttons. When a store URL isn't set yet
// (siteConfig.appStore / googlePlay === null) the button shows "coming soon"
// and is non-interactive.
export function AppStoreButtons({
  t,
  variant = "light",
}: {
  t: Dictionary;
  variant?: "light" | "dark";
}) {
  const base =
    "inline-flex items-center gap-2.5 rounded-2xl px-4 py-2.5 transition-all";
  const styles =
    variant === "dark"
      ? "bg-white text-ink hover:-translate-y-0.5"
      : "bg-ink text-white hover:bg-ink-soft hover:-translate-y-0.5";

  const stores = [
    { url: siteConfig.appStore, Icon: Apple, name: t.common.appStore },
    { url: siteConfig.googlePlay, Icon: Play, name: t.common.googlePlay },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {stores.map(({ url, Icon, name }) => {
        const content = (
          <>
            <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] font-medium opacity-70">
                {url ? "" : t.common.comingSoon}
              </span>
              <span className="text-sm font-bold">{name}</span>
            </span>
          </>
        );
        return url ? (
          <a key={name} href={url} className={`${base} ${styles}`}>
            {content}
          </a>
        ) : (
          <span
            key={name}
            aria-disabled="true"
            className={`${base} ${styles} cursor-default opacity-70`}
          >
            {content}
          </span>
        );
      })}
    </div>
  );
}
