// Resolves a product-images bucket path to a public URL.
// Kept pure so callers don't need a Supabase client to render an image.

export function productImageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return `${base}/storage/v1/object/public/product-images/${path}`;
}
