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
 *   1. the bundled seed asset, when this category has one
 *   2. whatever `category.image` holds — a Firebase Storage URL, a data: URI, or a
 *      relative path such as /assets/seed/category-x.png, all resolved the same way
 *   3. the generic bundled asset
 *
 * Returns a string always, never null, so a caller can pass it straight to <Image>.
 *
 * The bundled asset comes FIRST, which is a deliberate inversion of the original
 * order. The uploaded pictures are photographs with a background baked into the
 * pixels — measured on the live grid: lavender rgb(243,220,248) behind the dairy
 * icon, pink rgb(254,234,237) behind the meat one, flat white behind others, an
 * orange disc behind the courier. Set side by side on tinted cards they read as a
 * row of mismatched stickers, because each carries its own backdrop instead of
 * letting the card's own colour show through.
 *
 * The fourteen bundled files are the opposite: transparent, and normalised to one
 * geometry (every one of them 1024×1024 with its artwork occupying 85.0% of the
 * frame, centred to within a rounding error). Preferring them is what makes the
 * grid look like one set.
 *
 * The trade-off, stated plainly: for these fourteen ids the picture is now fixed
 * in the app bundle, so changing one is a release rather than an upload. Every
 * other category — anything an admin creates later, "pharmacy" among them — is
 * untouched by this and still shows whatever was uploaded for it. Nothing is
 * deleted; the uploaded images stay in Storage, and removing an id from the map
 * below hands that category straight back to its uploaded picture.
 */
export function categoryImageSource(categoryId?: string, image?: string): string {
  const bundled = categoryId ? CATEGORY_3D_IMAGES[categoryId] : undefined;
  if (bundled) {
    const resolved = resolveImageUrl(bundled);
    // "" means there is no API host to resolve a relative path against. That is a
    // build-configuration problem, not a reason to show nothing, so fall through
    // to the uploaded image, which may well be an absolute URL that still works.
    if (resolved) return resolved;
  }

  const stored = typeof image === "string" ? image.trim() : "";
  if (stored) {
    const resolved = resolveImageUrl(stored);
    // Old Firestore records may still name a dead disk path under /uploads/,
    // which is wiped on every redeploy. Never point an <Image> at one.
    if (resolved && !stored.startsWith("/uploads/")) return resolved;
  }

  return categoryImageFallbackSource(categoryId);
}
