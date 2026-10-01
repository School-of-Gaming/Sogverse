import { TeamIndexBody } from "@/components/team/public/team-index-body";
import { TEAM_PROFILE_FIXTURES } from "@/components/team/mock-team-fixtures";
import { previewSceneHref } from "../href";
import type { TeamProfileSceneScenario } from "./team-profile-scene";

/**
 * The public Team index, over fixtures — the live body, once with people on it
 * and once with nobody public yet.
 *
 * Two, because a team either has someone public or it does not, and the empty
 * page is the one no seeded database shows beside the full one. The people are
 * the team-profile scene's, in the order the public read returns them
 * (leadership first, then by first name), and each card opens that person's
 * profile scene rather than `/team/<slug>`, which no fixture resolves to.
 */

export const TEAM_INDEX_SCENARIOS = ["team", "empty"] as const;

export type TeamIndexSceneScenario = (typeof TEAM_INDEX_SCENARIOS)[number];

export function isTeamIndexScenario(s: string): s is TeamIndexSceneScenario {
  return (TEAM_INDEX_SCENARIOS as readonly string[]).includes(s);
}

const PROFILE_SCENARIOS: readonly TeamProfileSceneScenario[] = [
  "admin",
  "gedu",
  "gedu-finnish-only",
];

const MEMBERS = PROFILE_SCENARIOS.map((scenario) => ({
  profile: TEAM_PROFILE_FIXTURES[scenario],
  href: previewSceneHref("team-profile", scenario),
}));

export function TeamIndexScene({
  scenario,
}: {
  scenario: TeamIndexSceneScenario;
}) {
  return <TeamIndexBody members={scenario === "team" ? MEMBERS : []} />;
}
