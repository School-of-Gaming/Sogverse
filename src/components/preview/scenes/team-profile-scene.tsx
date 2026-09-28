import { TEAM_PROFILE_FIXTURES } from "@/components/team/mock-team-fixtures";
import { TeamProfileBody } from "@/components/team/team-profile-body";

/**
 * The public team profile page, over fixtures: one person per scenario.
 *
 * Three, because a page shows exactly one person and each of these is a
 * state the others cannot share a render with — an admin with their own title
 * and surname, a Gedu with everything filled in, and a Gedu who filled in the
 * least a profile can hold: no photo (the identicon stands in), two skills,
 * and a tagline in a spoken language other than English, so an English reader
 * sees its caption and a Finnish reader does not.
 *
 * The people are invented, and shared with the team card editor scenes
 * (`mock-team-fixtures.ts`), so the editor's preview and this page are judged on
 * the same cards.
 */

export const TEAM_PROFILE_SCENARIOS = ["admin", "gedu", "gedu-sparse"] as const;

export type TeamProfileSceneScenario = (typeof TEAM_PROFILE_SCENARIOS)[number];

export function isTeamProfileScenario(
  s: string,
): s is TeamProfileSceneScenario {
  return (TEAM_PROFILE_SCENARIOS as readonly string[]).includes(s);
}

export function TeamProfileScene({
  scenario,
}: {
  scenario: TeamProfileSceneScenario;
}) {
  return <TeamProfileBody profile={TEAM_PROFILE_FIXTURES[scenario]} />;
}
