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
 * /uploads/ is dead. The directory is not in the repository, and server/index.ts
 * keeps the mount only as a documented "legacy read-only" path for documents
 * written before the move to Firebase Storage — on a VM disk that was "wiped on
 * every redeploy". Nothing is deleted here: the entries stay, demoted to the last
 * thing tried rather than the first.
 */
import { resolveImageUrl } from "@/utils/imageUtils";

/**
 * Legacy bundled artwork, kept as a last resort.
 *
 * These paths resolve to 404 today. They are retained deliberately: a deployment
 * whose uploads/ directory survived the migration still serves them, and removing
 * the entries would delete that possibility for no gain.
 *
 * "restaurants" keeps the HomeScreen spelling of the two that existed. Both 404, so
 * the choice is cosmetic — recorded here so the divergence is not silently lost.
 */
export const CATEGORY_3D_IMAGES: Record<string, string> = {
  restaurants: "/uploads/tab-icon-restaurants.png",
  "fruits-vegetables": "/uploads/category-3d-vegetables.png",
  "meat-poultry": "/uploads/category-3d-meat.png",
  "dairy-eggs": "/uploads/category-3d-dairy.png",
  "cleaning-care": "/uploads/category-3d-cleaning.png",
  beverages: "/uploads/category-3d-beverages.png",
  "snacks-sweets": "/uploads/category-3d-snacks.png",
  "tea-coffee": "/uploads/category-3d-coffee.png",
  baby: "/uploads/category-3d-baby.png",
  flowers: "/uploads/category-3d-flowers.png",
  delivery: "/uploads/category-3d-delivery.png",
  pharmacy: "/uploads/category-3d-pharmacy.png",
  "women-bags": "/uploads/category-3d-bags.png",
  "international-shopping": "/uploads/category-3d-international.png",
};

/**
 * The URL a category card should request, in priority order:
 *
 *   1. whatever `category.image` holds — a Firebase Storage URL, a data: URI, or a
 *      relative path such as /assets/seed/category-x.png, all resolved the same way
 *   2. the legacy bundled asset, if this category has one
 *   3. "" — the caller renders its own placeholder rather than a broken image
 *
 * Returns a string always, never null, so a caller can pass it straight to <Image>.
 */
export function categoryImageSource(categoryId?: string, image?: string): string {
  const stored = typeof image === "string" ? image.trim() : "";
  if (stored) {
    const resolved = resolveImageUrl(stored);
    // resolveImageUrl returns "" when there is no API host to resolve a relative
    // path against; fall through to the legacy asset rather than render nothing.
    if (resolved) return resolved;
  }

  const legacy = categoryId ? CATEGORY_3D_IMAGES[categoryId] : undefined;
  if (legacy) return resolveImageUrl(legacy);

  return "";
}
