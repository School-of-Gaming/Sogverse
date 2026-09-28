import {
  TeamProfileBody,
  type TeamProfile,
} from "@/components/team/team-profile-body";

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
 * The people are invented. The photos are abstract preview art already in
 * `public/preview-art/`, never a picture of a person: one square, one tall, so
 * the portrait's crop is judged on both shapes. Ids are real UUIDs because
 * the no-photo profile draws an identicon from its id.
 */

export const TEAM_PROFILE_SCENARIOS = ["admin", "gedu", "gedu-sparse"] as const;

export type TeamProfileSceneScenario = (typeof TEAM_PROFILE_SCENARIOS)[number];

export function isTeamProfileScenario(
  s: string,
): s is TeamProfileSceneScenario {
  return (TEAM_PROFILE_SCENARIOS as readonly string[]).includes(s);
}

const PROFILES: Record<TeamProfileSceneScenario, TeamProfile> = {
  admin: {
    kind: "admin",
    id: "65fd2cbb-acda-45fd-9dad-b973f75b2579",
    firstName: "Laura",
    lastName: "Virtanen",
    nickname: "Nightowl",
    title: "Head of Clubs",
    photo: { src: "/preview-art/session-badge.jpg", width: 1200, height: 1200 },
    tagline: {
      text: "I build the week every club runs on, and I still sneak into a Minecraft session whenever the calendar leaves me a gap.",
      spokenLanguage: "en",
    },
    skills: [
      "Club planning and scheduling",
      "Partnerships with schools and municipalities",
      "Gedu training",
      "Family support",
      "Minecraft world building",
      "Event hosting",
    ],
    topics: ["minecraft_java", "minecraft_education", "roblox_studio", "esports"],
    spokenLanguages: ["fi", "en", "sv"],
  },
  gedu: {
    kind: "gedu",
    id: "eadea095-24f1-40cd-bc31-e898edc9ab3a",
    firstName: "Eetu",
    nickname: "Creeperhug",
    photo: { src: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
    tagline: {
      text: "Redstone nerd, speedrun cheerleader and the Gedu who always has one more build challenge up his sleeve for the last ten minutes.",
      spokenLanguage: "en",
    },
    skills: [
      "Redstone engineering",
      "Build challenges",
      "Team games",
      "Rocket League coaching",
      "Game design basics",
    ],
    topics: ["minecraft_java", "minecraft_bedrock", "fortnite", "rocket_league"],
    spokenLanguages: ["fi", "en"],
    areas: ["Helsinki", "Espoo", "Vantaa"],
  },
  "gedu-sparse": {
    kind: "gedu",
    id: "e401c5af-f126-4e16-bf00-784b8fc438c7",
    firstName: "Saana",
    nickname: null,
    photo: null,
    tagline: {
      text: "Rakennan mieluiten yhdessä muiden kanssa, ja parhaat ideat syntyvät aina viimeisellä minuutilla.",
      spokenLanguage: "fi",
    },
    skills: ["Minecraft Education", "Storytelling"],
    topics: ["minecraft_education"],
    spokenLanguages: ["fi"],
    areas: ["Tampere"],
  },
};

export function TeamProfileScene({
  scenario,
}: {
  scenario: TeamProfileSceneScenario;
}) {
  return <TeamProfileBody profile={PROFILES[scenario]} />;
}
