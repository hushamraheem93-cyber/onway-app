import type { MetadataRoute } from "next";
import { siteConfig, locales } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["", "/privacy", "/terms"];
  const now = new Date();

  return locales.flatMap((locale) =>
    paths.map((path) => ({
      url: `${siteConfig.url}/${locale}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.5,
      alternates: {
        languages: {
          ar: `${siteConfig.url}/ar${path}`,
          en: `${siteConfig.url}/en${path}`,
        },
      },
    }))
  );
}
