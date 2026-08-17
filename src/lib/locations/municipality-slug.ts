/**
 * Deterministic, URL-safe slug for a Finnish municipality name.
 *
 * Used to build human-readable `/schools/<slug>` links (e.g. `helsinki`,
 * `espoo`) without storing a slug column -- the `locations` table holds only
 * the native name. The transform: Unicode NFD-decompose, drop combining
 * accents (a-umlaut -> a, o-umlaut -> o, a-ring -> a, e-acute -> e, ...),
 * lowercase, collapse every run of non-`[a-z0-9]` to a single hyphen, then
 * trim leading/trailing hyphens.
 *
 * Verified collision-free across all 308 municipalities in Finland's 2025
 * classification (see migration 00109 + the unit test that re-checks the seed),
 * so no disambiguation suffix is needed. A few names carry more than the bare
 * town: "Koski Tl" -> `koski-tl` (the official tiebreaker survives), "Pedersoren
 * kunta" -> `pedersoren-kunta`.
 */
export function municipalitySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents left by NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
