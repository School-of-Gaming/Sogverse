import { findBySlug, slugAddressOf, slugify } from "@/lib/slug";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

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
 * The segment the staff editor and the admin user page link a live profile
 * to, with no public list in hand: the person's slug, or their id when they
 * derive none. Two people sharing a slug is rare enough that the link is not
 * worth a read of the whole team; the one listed second still has their id.
 */
export function teamMemberSharedAddress(
  person: Pick<TeamProfile, "id" | "firstName" | "nickname">,
): string {
  const slug = teamMemberSlug(person);
  return slug === "" ? person.id : slug;
}
