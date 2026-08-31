// Resolves a session photo's row id to its storage object name and public URL.
// Kept pure so callers don't need a Supabase client to render an image.

/** The bucket these objects live in — one name, shared by the URL below and
 *  the route's admin-client upload and delete. */
export const SESSION_IMAGES_BUCKET = "session-images";

/**
 * **The object name is derived, never stored.** A session photo's object is
 * named for the row's own random UUID (`<id>.jpg`), so a `path` column would be
 * a restatement of the primary key. Every writer and reader goes through this
 * one function instead, which is what makes "the object for this row" a single
 * fact rather than a convention two call sites have to agree on.
 *
 * One extension, because the ingestion pipeline re-encodes every input to JPEG
 * — the bucket cannot contain anything else.
 */
export function sessionImageObjectName(id: string): string {
  return `${id}.jpg`;
}

/**
 * The public URL for a session photo, from its row id.
 *
 * **An id starting with `/` is passed straight through**, mirroring the
 * product-image helper: it is already a servable URL rather than a storage
 * object — anything under `public/` is served from the site's own origin — and
 * prefixing it with the bucket URL would point at an object that does not
 * exist. That is what lets a preview scene's fixture images carry demo art
 * (`/preview-art/*.jpg`) in the same `id` field the live document uses, with no
 * scene-only override prop anywhere on the gallery's API. A real photo's id is
 * a `gen_random_uuid()` and never begins with `/`.
 *
 * The bucket is public and the unguessable name *is* the credential: ~122
 * random bits, linked from no crawlable page, and the same URL serves the app
 * and the report email (an email client fetches images with a bare GET, so the
 * URL has to work unauthenticated). Deleting the object is the kill switch.
 */
export function sessionImageUrl(id: string): string {
  if (id.startsWith("/")) return id;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  return `${base}/storage/v1/object/public/${SESSION_IMAGES_BUCKET}/${sessionImageObjectName(id)}`;
}
