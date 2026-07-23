import { getApiUrl } from "@/lib/query-client";

/**
 * Resolves a local server image path or external URL.
 * Always applies WebP transformation for known CDNs.
 */
export function resolveImageUrl(image: string, quality = 80): string {
  if (!image) return "";
  if (image.startsWith("data:")) return image;

  let url = image;
  if (!image.startsWith("http") && !image.startsWith("blob:")) {
    url = `${getApiUrl()}${image}`;
  }

  // Unsplash CDN
  if (url.includes("images.unsplash.com")) {
    const base = url.split("?")[0];
    const existing = url.includes("?") ? url.split("?")[1] : "";
    const params = new URLSearchParams(existing);
    params.set("fm", "webp");
    params.set("q", String(quality));
    if (!params.has("w")) params.set("w", "600");
    return `${base}?${params.toString()}`;
  }

  // Cloudinary CDN
  if (url.includes("cloudinary.com") && !url.includes("f_webp")) {
    return url.replace("/upload/", "/upload/f_webp,q_auto/");
  }

  // imgix CDN
  if (url.includes(".imgix.net")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}fm=webp&q=${quality}`;
  }

  return url;
}
