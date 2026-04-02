import { getApiUrl } from "@/lib/query-client";

/**
 * Transforms an image URL to request WebP format when supported.
 * Applies provider-specific WebP query params for known CDNs.
 */
export function toWebPUrl(url: string, quality = 80): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("blob:")) return url;

  // Unsplash CDN — supports fm=webp&q= params
  if (url.includes("images.unsplash.com")) {
    const base = url.split("?")[0];
    const existing = url.includes("?") ? url.split("?")[1] : "";
    const params = new URLSearchParams(existing);
    params.set("fm", "webp");
    params.set("q", String(quality));
    if (!params.has("w")) params.set("w", "600"); // reasonable default width
    return `${base}?${params.toString()}`;
  }

  // Cloudinary — supports f_webp transformation
  if (url.includes("cloudinary.com") && !url.includes("f_webp")) {
    return url.replace("/upload/", "/upload/f_webp,q_auto/");
  }

  // imgix CDN — supports fm=webp
  if (url.includes(".imgix.net")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}fm=webp&q=${quality}`;
  }

  return url;
}

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

  return toWebPUrl(url, quality);
}
