import type {
  AdminTeamProfile,
  GeduTeamProfile,
  TeamProfile,
} from "@/components/team/team-profile-body";
import type {
  AdminTeamCardState,
  GeduTeamCardState,
} from "@/components/team/team-card-editor-body";

/**
 * The team fixtures: three invented people, shared by the public profile scene
 * and the team card editor scenes, so the editor's preview and the public page
 * are judged on the same cards.
 *
 * The photos are abstract preview art already in `public/preview-art/`, never a
 * picture of a person: one square, one tall and one wide, so the portrait's
 * crop is judged on every shape. Ids are real UUIDs because a card with no
 * photo draws an identicon from its id.
 */

const LAURA: AdminTeamProfile = {
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
};

const EETU: GeduTeamProfile = {
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
};

const SAANA: GeduTeamProfile = {
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
};

export const TEAM_PROFILE_FIXTURES = {
  admin: LAURA,
  gedu: EETU,
  "gedu-sparse": SAANA,
} as const satisfies Record<string, TeamProfile>;

// ---------------------------------------------------------------------------
// The team card editor
// ---------------------------------------------------------------------------

/**
 * One scenario per state a Gedu's card can be in, and no more: each is a state
 * the others cannot share a render with. Unsubmitted edits to a live card are
 * not a sixth — they are what `live` becomes the moment somebody types, which
 * is the one state here reached by local interaction rather than by fixture.
 */
export const GEDU_TEAM_CARD_SCENARIOS = [
  "draft",
  "in-review",
  "live",
  "changes-in-review",
  "returned",
] as const;

export type GeduTeamCardScenario = (typeof GEDU_TEAM_CARD_SCENARIOS)[number];

export function isGeduTeamCardScenario(s: string): s is GeduTeamCardScenario {
  return (GEDU_TEAM_CARD_SCENARIOS as readonly string[]).includes(s);
}

/**
 * Two, because an office card is either on the team page or it is not, and
 * those two carry different actions. The hidden one has no photo, which puts
 * the identicon fallback on the admin side too.
 */
export const ADMIN_TEAM_CARD_SCENARIOS = ["published", "hidden"] as const;

export type AdminTeamCardScenario = (typeof ADMIN_TEAM_CARD_SCENARIOS)[number];

export function isAdminTeamCardScenario(
  s: string,
): s is AdminTeamCardScenario {
  return (ADMIN_TEAM_CARD_SCENARIOS as readonly string[]).includes(s);
}

/** A Gedu's card as the editor receives it: the draft, and its state. */
export interface GeduTeamCardFixture {
  draft: GeduTeamProfile;
  state: GeduTeamCardState;
}

/**
 * Saana's card the day she opens the editor: only what her account already
 * says. Nothing written, no photo, so the editor's empty states and the public
 * body's left-out sections are both on screen.
 */
const SAANA_NEW: GeduTeamProfile = {
  ...SAANA,
  tagline: null,
  skills: [],
  topics: [],
};

/**
 * Eetu's edit to his live card: a new photo in the wide shape, a rewritten
 * tagline, a phrase added and a topic swapped — enough that the draft and the
 * live card are told apart at a glance in the preview.
 */
const EETU_EDITED: GeduTeamProfile = {
  ...EETU,
  photo: { src: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  tagline: {
    text: "I run the build challenges, and I have never once let a team leave without finishing their redstone door.",
    spokenLanguage: "en",
  },
  skills: [...EETU.skills, "Speedrun races"],
  topics: ["minecraft_java", "minecraft_bedrock", "rocket_league", "esports"],
};

export const GEDU_TEAM_CARD_FIXTURES: Record<
  GeduTeamCardScenario,
  GeduTeamCardFixture
> = {
  draft: { draft: SAANA_NEW, state: { kind: "draft" } },
  "in-review": { draft: EETU, state: { kind: "inReview" } },
  live: { draft: EETU, state: { kind: "live", live: EETU } },
  "changes-in-review": {
    draft: EETU_EDITED,
    state: { kind: "changesInReview", live: EETU },
  },
  returned: {
    draft: SAANA,
    state: {
      kind: "returned",
      live: null,
      returnedBy: LAURA.firstName,
      note: "Lovely start! Could you add a couple more things you do in your sessions, and a photo? Families like to see who they will meet.",
    },
  },
};

/** An office card as the editor receives it. */
export interface AdminTeamCardFixture {
  card: AdminTeamProfile;
  state: AdminTeamCardState;
}

export const ADMIN_TEAM_CARD_FIXTURES: Record<
  AdminTeamCardScenario,
  AdminTeamCardFixture
> = {
  published: { card: LAURA, state: { kind: "published" } },
  hidden: {
    card: { ...LAURA, photo: null, skills: LAURA.skills.slice(0, 3) },
    state: { kind: "hidden" },
  },
};
