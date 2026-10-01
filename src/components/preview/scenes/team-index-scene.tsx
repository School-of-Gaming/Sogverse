import { TeamIndexBody } from "@/components/team/public/team-index-body";

/**
 * The public Team index with nobody public — the live body, handed no people.
 *
 * One scenario, because it is the state the seeded database cannot show: the
 * rich seed makes profiles public, so the full index is read on `/team` itself.
 */

export const TEAM_INDEX_SCENARIOS = ["empty"] as const;

export type TeamIndexSceneScenario = (typeof TEAM_INDEX_SCENARIOS)[number];

export function isTeamIndexScenario(s: string): s is TeamIndexSceneScenario {
  return (TEAM_INDEX_SCENARIOS as readonly string[]).includes(s);
}

export function TeamIndexScene() {
  return <TeamIndexBody members={[]} />;
}
