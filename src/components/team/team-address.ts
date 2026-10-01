import { findBySlug, oldestFirst, slugAddressOf, slugify } from "@/lib/slug";
import type {
  PublicTeamProfile,
  TeamProfile,
  TeamProfileRecord,
} from "@/services/team-profiles/team-profiles.types";

/*
 * Where a person's public page lives. Two addresses, neither redirecting
 * (`src/lib/slug.ts`): `/team/<id>`, and `/team/<slug>`, the one people share
 * and the canonical. The slug is the person's first name and nickname —
 * never a surname, an admin's included — derived on every read and stored
 * nowhere.
 *
 * **Two people deriving one slug (two Gedus named Mikko with no nickname): the
 * older profile owns it** — the one first saved, which never moves, not the
 * one approved first, since a re-approval moves that — and the newer is
 * reachable by its id alone, as two Library articles are. So a newly approved
 * person never takes over an address already shared.
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

/** The public profile a slug addresses: the oldest to derive it. */
export function findTeamMemberBySlug<T extends PublicTeamProfile>(
  team: readonly T[],
  slug: string,
): T | null {
  return findBySlug(oldestFirst(team, byFirstSave), slug, teamMemberSlug);
}

/**
 * The path segment of a person's canonical address, judged against the public
 * list: their slug, or their id when they derive none, an older profile
 * derives the same one, or they are not in the list at all.
 */
export function teamMemberAddress(
  team: readonly PublicTeamProfile[],
  person: Pick<TeamProfile, "id">,
): string {
  return (
    slugAddressOf(oldestFirst(team, byFirstSave), person.id, teamMemberSlug) ??
    person.id
  );
}

function byFirstSave(person: PublicTeamProfile): string {
  return person.createdAt;
}

/**
 * The segment a staff page links a profile's public page to, judged against
 * the public list like every other address — so the newer of two people
 * deriving one slug is linked to their own page by id, never to the older's.
 * Read on the server, and only for a live profile (ready and made public):
 * anything else has no public page to link and answers `null` without reading
 * the list.
 */
export async function teamMemberPublicAddress(
  record: Pick<TeamProfileRecord, "profile" | "ready" | "approved">,
  listPublicTeam: () => Promise<readonly PublicTeamProfile[]>,
): Promise<string | null> {
  if (!record.ready || !record.approved) return null;
  return teamMemberAddress(await listPublicTeam(), record.profile);
}

/**
 * The segment to link a person's public page to from a staff page, given the
 * address the page was read with (`teamMemberPublicAddress`): that address
 * while the person still derives it, else their id, which always resolves —
 * for a name saved since the read, or a profile made public since it, whose
 * standing in the list was never read.
 */
export function teamMemberLinkAddress(
  person: Pick<TeamProfile, "id" | "firstName" | "nickname">,
  readAddress: string | null,
): string {
  return readAddress !== null && readAddress === teamMemberSlug(person)
    ? readAddress
    : person.id;
}
