/**
 * Where a category card gets its picture.
 *
 * This used to live twice — once in HomeScreen, once in CategoriesScreen — with
 * opposite priorities and, by the time it was measured, one value that had already
 * drifted apart ("restaurants" named a different file in each copy). Worse, the
 * CategoriesScreen copy consulted the map FIRST and unconditionally, so on
 * "عرض جميع الأقسام" the picture an admin had uploaded was never even tried: every
 * one of the fourteen mapped categories asked for a /uploads/ URL instead.
 *
 * The old /uploads/ directory is not in the repository and is wiped on every
 * redeploy. The bundled seed assets under /assets/seed are the durable fallback.
 */
import { resolveImageUrl } from "@/utils/imageUtils";

/**
 * Bundled artwork, kept as a last resort when an admin image is unavailable.
 *
 * These files are shipped in the repository and served from the read-only assets
 * mount, so a category never falls back to a dead local-disk URL.
 */
export const CATEGORY_3D_IMAGES: Record<string, string> = {
  restaurants: "/assets/seed/category-restaurants.png",
  "fruits-vegetables": "/assets/seed/category-vegetables.png",
  "meat-poultry": "/assets/seed/category-meat.png",
  "dairy-eggs": "/assets/seed/category-dairy.png",
  "cleaning-care": "/assets/seed/category-cleaning.png",
  beverages: "/assets/seed/category-beverages.png",
  "snacks-sweets": "/assets/seed/category-snacks.png",
  "tea-coffee": "/assets/seed/category-coffee.png",
  baby: "/assets/seed/category-baby.png",
  flowers: "/assets/seed/category-flowers.png",
  delivery: "/assets/seed/category-delivery.png",
  "food-supplies": "/assets/seed/category-food-supplies.png",
  "women-bags": "/assets/seed/category-bags.png",
  "international-shopping": "/assets/seed/category-international.png",
};

const DEFAULT_CATEGORY_IMAGE = "/assets/seed/category-food-supplies.png";

export function categoryImageFallbackSource(categoryId?: string): string {
  const fallback = (categoryId && CATEGORY_3D_IMAGES[categoryId]) || DEFAULT_CATEGORY_IMAGE;
  return resolveImageUrl(fallback);
}

/**
 * The URL a category card should request, in priority order:
 *
 *   1. whatever `category.image` holds — a Firebase Storage URL, a data: URI, or a
 *      relative path such as /assets/seed/category-x.png, all resolved the same way
 *   2. the bundled seed asset, when this category has one
 *   3. the generic bundled asset
 *
 * Returns a string always, never null, so a caller can pass it straight to <Image>.
 *
 * The uploaded image comes first, and the reason is availability rather than
 * appearance. Preferring the bundled asset was tried and reverted: a bundled path
 * is relative, so it only becomes a real URL once resolveImageUrl joins it to the
 * API host, and the whole grid then depends on that one host serving /assets/seed.
 * When it did not, all fourteen mapped categories lost their picture at once —
 * and the caller's fallbackUri is drawn from this same bundled family, so the
 * fallback could not rescue them either. A Firebase Storage URL is absolute and
 * carries no such dependency.
 *
 * That leaves the ordering doing useful work in both directions: the uploaded
 * picture is what an admin can change without a release, and the bundled asset is
 * the thing that still renders when there is no uploaded picture at all. The two
 * now sit on genuinely different sources, so the <Image> fallback chain in the
 * screens can actually recover — remote first, bundled second, placeholder last.
 */
export function categoryImageSource(categoryId?: string, image?: string): string {
  const stored = typeof image === "string" ? image.trim() : "";
  if (stored) {
    const resolved = resolveImageUrl(stored);
    // resolveImageUrl returns "" when there is no API host to resolve a relative
    // path against; fall through to the bundled asset rather than render nothing.
    // Old Firestore records may still name a dead disk path under /uploads/, which
    // is wiped on every redeploy. Never point an <Image> at one.
    if (resolved && !stored.startsWith("/uploads/")) return resolved;
  }

  return categoryImageFallbackSource(categoryId);
}
