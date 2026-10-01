import { slugify } from "@/lib/slug";

/**
 * Deterministic, URL-safe slug for a Finnish municipality name.
 *
 * Used to build human-readable `/schools/<slug>` links (e.g. `helsinki`,
 * `espoo`) without storing a slug column -- the `locations` table holds only
 * the native name. The transform is the site's one `slugify`: diacritics
 * folded (a-umlaut -> a, o-umlaut -> o, a-ring -> a), lowercase, every run of
 * non-`[a-z0-9]` collapsed to a single hyphen, trimmed.
 *
 * Verified collision-free across all 308 municipalities in Finland's 2025
 * classification (the unit test re-checks it against the seed),
 * so no disambiguation suffix is needed. A few names carry more than the bare
 * town: "Koski Tl" -> `koski-tl` (the official tiebreaker survives), "Pedersoren
 * kunta" -> `pedersoren-kunta`.
 */
export function municipalitySlug(name: string): string {
  return slugify(name);
}
