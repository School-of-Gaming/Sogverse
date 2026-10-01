import { findBySlug, slugAddressOf, slugify } from "@/lib/slug";
import type {
  TeamProfile,
  TeamProfileRecord,
} from "@/services/team-profiles/team-profiles.types";

/*
 * Where a person's public page lives. Two addresses, neither redirecting
 * (`src/lib/slug.ts`): `/team/<id>`, and `/team/<slug>`, the one people share
 * and the canonical. The slug is the person's first name and nickname —
 * never a surname, an admin's included — derived on every read and stored
 * nowhere.
 */

/** The slug a person derives: `Eetu` + `CreeperHug` → `eetu-creeperhug`. */
export function teamMemberSlug(
  person: Pick<TeamProfile, "firstName" | "nickname">,
): string {
  return slugify(
    person.nickname === null
      ? person.firstName
      : `${person.firstName} ${person.nickname}`,
  );
}

/** The public profile a slug addresses: the first in the team's order to derive it. */
export function findTeamMemberBySlug(
  team: readonly TeamProfile[],
  slug: string,
): TeamProfile | null {
  return findBySlug(team, slug, teamMemberSlug);
}

/**
 * The path segment of a person's canonical address, judged against the public
 * list in its own order: their slug, or their id when they derive none or
 * someone listed before them derives the same one.
 */
export function teamMemberAddress(
  team: readonly TeamProfile[],
  person: TeamProfile,
): string {
  return slugAddressOf(team, person.id, teamMemberSlug) ?? person.id;
}

/**
 * The segment a staff page links a profile's public page to, judged against
 * the public list like every other address — so the second of two people
 * deriving one slug is linked to their own page by id, never to the first's.
 * Read on the server, and only for a live profile (ready and made public):
 * anything else has no public page to link and answers `null` without reading
 * the list.
 */
export async function teamMemberPublicAddress(
  record: Pick<TeamProfileRecord, "profile" | "ready" | "approved">,
  listPublicTeam: () => Promise<readonly TeamProfile[]>,
): Promise<string | null> {
  if (!record.ready || !record.approved) return null;
  return teamMemberAddress(await listPublicTeam(), record.profile);
}

/**
 * The segment to link a person's public page to from a staff page, given the
 * address the page was read with (`teamMemberPublicAddress`): that address
 * while the person still derives it, else their id, which always resolves —
 * for a name saved since the read, or a profile made public since it, whose
 * place in the list was never read.
 */
export function teamMemberLinkAddress(
  person: Pick<TeamProfile, "id" | "firstName" | "nickname">,
  readAddress: string | null,
): string {
  return readAddress !== null && readAddress === teamMemberSlug(person)
    ? readAddress
    : person.id;
}
