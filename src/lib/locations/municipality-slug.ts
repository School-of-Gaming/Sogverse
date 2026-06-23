import type { Location } from "@/types";
import { localizedNameAlternates } from "./localized-name";

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

/**
 * Reverse lookup: find the municipality whose name slugifies to `slug`.
 *
 * Both the canonical (native-name) slug and any alternate-locale slug resolve to
 * the same row, so `/schools/helsinki` and `/schools/helsingfors` both land on
 * Helsinki — the link a viewer follows is built from their locale's slug
 * (see `buildMunicipalityEntries`), but every form resolves here.
 *
 * The canonical slug is matched first: a Swedish exonym can therefore never
 * shadow another municipality whose *native* name slugifies the same way. The
 * native mapping is 1:1 across Finland's municipalities, so that first match is
 * the only one. Returns `null` when nothing matches.
 */
export function findMunicipalityBySlug(
  locations: Location[],
  slug: string,
): Location | null {
  const municipalities = locations.filter((l) => l.type === "municipality");
  const canonical = municipalities.find((l) => municipalitySlug(l.name) === slug);
  if (canonical) return canonical;
  return (
    municipalities.find((l) =>
      localizedNameAlternates(l).some((n) => municipalitySlug(n) === slug),
    ) ?? null
  );
}
