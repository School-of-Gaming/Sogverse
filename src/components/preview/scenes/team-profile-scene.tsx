import { TEAM_PROFILE_FIXTURES } from "@/components/team/mock-team-fixtures";
import { TeamProfileBody } from "@/components/team/team-profile-body";

/**
 * The public team profile page, over fixtures: one person per scenario.
 *
 * Three, because a page shows exactly one person: an admin with their own
 * title and surname, a Gedu who wrote in two languages and added a fun fact,
 * and a Gedu who wrote in Finnish alone with no fun fact — so a reader in any
 * other locale sees the fallback and its caption, and a Finnish reader does
 * not. Switching the site's locale is the axis the fallback is read along.
 *
 * The people are invented, and shared with the team card editor scenes
 * (`mock-team-fixtures.ts`), so the editor's preview and this page are judged on
 * the same cards.
 */

export const TEAM_PROFILE_SCENARIOS = [
  "admin",
  "gedu",
  "gedu-finnish-only",
] as const;

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
