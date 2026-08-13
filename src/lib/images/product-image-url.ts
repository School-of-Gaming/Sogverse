// Resolves a product-images bucket path to a public URL.
// Kept pure so callers don't need a Supabase client to render an image.

/**
 * **A path starting with `/` is passed straight through**, because it is
 * already a servable URL rather than a storage object — anything under
 * `public/` is served from the site's own origin, and prefixing it with the
 * bucket URL would point at an object that does not exist.
 *
 * This is what lets a preview scene's fixture rows carry demo art
 * (`/preview-art/*.svg`) in `image_path` and flow through ordinary image
 * resolution, with no scene-only override prop anywhere on the live API. A real
 * product's `image_path` is a bucket key and never begins with `/`; admins are
 * trusted not to hand-craft one that does, so this is documented rather than
 * guarded.
 */
export function productImageUrl(path: string): string {
  if (path.startsWith("/")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return `${base}/storage/v1/object/public/product-images/${path}`;
}

/**
 * The row-level resolution: `products.image_path` into a servable URL, or null
 * for "no image". **Truthiness, not a null check, on purpose** — `image_path`
 * is a plain text column and an empty string is representable in it, meaning
 * the same thing as null; a `=== null` test would send `""` down the URL path
 * and paint a broken frame. Every family surface (card adapter, detail hero,
 * purchase confirmation) resolves through this one function so the
 * empty-string rule cannot be forgotten at the next call site.
 */
export function productImageSrc(
  imagePath: string | null | undefined,
): string | null {
  return imagePath ? productImageUrl(imagePath) : null;
}
