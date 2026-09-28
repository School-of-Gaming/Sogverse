import type {
  AdminTeamProfile,
  GeduTeamProfile,
  GeduTeamProfileApproval,
  TeamProfile,
} from "@/services/team-profiles/team-profiles.types";

/**
 * The team fixtures: three invented people, shared by the public profile scene
 * and the profile editor scenes, so the editor's preview and the public page
 * are judged on the same profiles.
 *
 * The photos are abstract preview art already in `public/preview-art/`, never a
 * picture of a person. A real upload is cropped to 4:5 before it is stored;
 * this art is square, tall and wide, and the frame covers it, which is also
 * what shows a crop of the wrong shape would still sit right.
 *
 * The languages are chosen so the translation fallback shows: Laura writes in
 * English only, Eetu in English and Finnish, and Saana in Finnish only — so an
 * English, Swedish or French reader of Saana's page meets her Finnish. Eetu and
 * Laura have a fun fact; Saana does not. Laura and Eetu picked a colour; Saana
 * has not, so her page shows the brand's colours alone.
 */

const LAURA: AdminTeamProfile = {
  kind: "admin",
  id: "65fd2cbb-acda-45fd-9dad-b973f75b2579",
  firstName: "Laura",
  lastName: "Virtanen",
  nickname: "Nightowl",
  title: "Head of Clubs",
  pick: 11,
  photo: { src: "/preview-art/session-badge.jpg", width: 1200, height: 1200 },
  translations: [
    {
      locale: "en",
      shortDescription:
        "I build the week every club runs on, and still sneak into a Minecraft session when the calendar lets me.",
      longDescription: [
        "I look after our clubs from the first idea to the last session of the term: which games we run, where, when, and with which Gedus.",
        "",
        "Most of my week goes on:",
        "",
        "- **Planning** the club calendar with schools and municipalities",
        "- **Training** new Gedus before their first session",
        "- **Answering** families when something needs sorting out",
        "",
        "Before School of Gaming I was a primary school teacher, which is where I learnt that a good game teaches more than any worksheet.",
      ].join("\n"),
      funFact:
        "I have a Minecraft world I have played in since 2012, and I still have not finished the castle.",
    },
  ],
  spokenLanguages: ["fi", "en", "sv"],
};

const EETU: GeduTeamProfile = {
  kind: "gedu",
  id: "eadea095-24f1-40cd-bc31-e898edc9ab3a",
  firstName: "Eetu",
  nickname: "Creeperhug",
  pick: 6,
  photo: { src: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
  translations: [
    {
      locale: "en",
      shortDescription:
        "Redstone nerd, speedrun cheerleader and the Gedu with one more build challenge up his sleeve.",
      longDescription: [
        "I run Minecraft and Rocket League sessions, mostly in Helsinki and Espoo.",
        "",
        "**In my sessions:**",
        "",
        "- Build challenges where every team finishes something they are proud of",
        "- Redstone doors, traps and the occasional very loud machine",
        "- Team games where the quiet players get the ball too",
        "",
        "I have been gaming since I could hold a controller, and I study game design at university.",
      ].join("\n"),
      funFact:
        "My longest redstone build is a working elevator that takes eleven minutes to reach the top.",
    },
    {
      locale: "fi",
      shortDescription:
        "Redstone-nörtti, speedrun-tsemppari ja Gedu, jolla on aina vielä yksi rakennushaaste hihassa.",
      longDescription: [
        "Vedän Minecraft- ja Rocket League -sessioita, enimmäkseen Helsingissä ja Espoossa.",
        "",
        "**Sessioissani:**",
        "",
        "- Rakennushaasteita, joissa jokainen tiimi saa valmiiksi jotain, mistä on ylpeä",
        "- Redstone-ovia, ansoja ja välillä tosi äänekkäitä koneita",
        "- Joukkuepelejä, joissa hiljaisemmatkin pelaajat saavat pallon",
        "",
        "Olen pelannut siitä asti, kun pystyin pitelemään ohjainta, ja opiskelen pelisuunnittelua yliopistossa.",
      ].join("\n"),
      funFact:
        "Pisin redstone-rakennelmani on toimiva hissi, jolla kestää yksitoista minuuttia päästä ylös.",
    },
  ],
  spokenLanguages: ["fi", "en"],
};

const SAANA: GeduTeamProfile = {
  kind: "gedu",
  id: "e401c5af-f126-4e16-bf00-784b8fc438c7",
  firstName: "Saana",
  nickname: null,
  pick: null,
  photo: { src: "/preview-art/session-parkour.jpg", width: 1440, height: 810 },
  translations: [
    {
      locale: "fi",
      shortDescription:
        "Rakennan mieluiten yhdessä muiden kanssa, ja parhaat ideat syntyvät viimeisellä minuutilla.",
      longDescription: [
        "Vedän Minecraft Education -kerhoja Tampereella.",
        "",
        "Sessioissani rakennetaan tarinoita: jokainen maailma alkaa kysymyksellä, ja pelaajat päättävät, mihin se johtaa.",
      ].join("\n"),
      funFact: null,
    },
  ],
  spokenLanguages: ["fi"],
};

export const TEAM_PROFILE_FIXTURES = {
  admin: LAURA,
  gedu: EETU,
  "gedu-finnish-only": SAANA,
} as const satisfies Record<string, TeamProfile>;

// ---------------------------------------------------------------------------
// The profile editor
// ---------------------------------------------------------------------------

/**
 * One scenario per state a Gedu is told their profile is in, and no more: the
 * four combinations of their switch and an admin's approval that read
 * differently. Private-and-incomplete stands for private in general — a
 * complete private profile is the same render with the switch enabled, which
 * filling in the form reaches locally.
 */
export const GEDU_TEAM_PROFILE_EDITOR_SCENARIOS = [
  "private",
  "waiting",
  "live",
  "taken-off",
] as const;

export type GeduTeamProfileEditorScenario =
  (typeof GEDU_TEAM_PROFILE_EDITOR_SCENARIOS)[number];

export function isGeduTeamProfileEditorScenario(
  s: string,
): s is GeduTeamProfileEditorScenario {
  return (GEDU_TEAM_PROFILE_EDITOR_SCENARIOS as readonly string[]).includes(s);
}

/**
 * Two, one per profile an admin edits. Their own has a single switch, and
 * turning it off is a click away on the same render. A Gedu's, edited from the
 * admin panel, has no switch at all — it is the Gedu's — so it is a different
 * page and its own scenario, one status standing for the rest, which differ
 * only in the panel's words.
 */
export const ADMIN_TEAM_PROFILE_EDITOR_SCENARIOS = [
  "shown",
  "editing-gedu",
] as const;

export type AdminTeamProfileEditorScenario =
  (typeof ADMIN_TEAM_PROFILE_EDITOR_SCENARIOS)[number];

export function isAdminTeamProfileEditorScenario(
  s: string,
): s is AdminTeamProfileEditorScenario {
  return (ADMIN_TEAM_PROFILE_EDITOR_SCENARIOS as readonly string[]).includes(s);
}

/** A Gedu's profile as the editor receives it: the profile and both switches. */
export interface GeduTeamProfileEditorFixture {
  profile: GeduTeamProfile;
  ready: boolean;
  approval: GeduTeamProfileApproval;
}

/**
 * Saana's profile the day she opens the editor: a few words in Finnish and no
 * photo, so the switch is disabled with both reasons, and the preview shows
 * the drawn placeholder, her one line, and "About me" holding its place.
 */
const SAANA_NEW: GeduTeamProfile = {
  ...SAANA,
  photo: null,
  translations: [
    {
      locale: "fi",
      shortDescription: "Rakennan mieluiten yhdessä muiden kanssa.",
      longDescription: "",
      funFact: null,
    },
  ],
};

export const GEDU_TEAM_PROFILE_EDITOR_FIXTURES: Record<
  GeduTeamProfileEditorScenario,
  GeduTeamProfileEditorFixture
> = {
  private: { profile: SAANA_NEW, ready: false, approval: "pending" },
  waiting: { profile: SAANA, ready: true, approval: "pending" },
  live: { profile: EETU, ready: true, approval: "approved" },
  "taken-off": { profile: EETU, ready: true, approval: "withdrawn" },
};

/** A profile as the editor receives it on an admin's page. */
export type AdminTeamProfileEditorFixture =
  | { editing: "own"; profile: AdminTeamProfile; shown: boolean }
  | { editing: "gedu"; gedu: GeduTeamProfileEditorFixture };

export const ADMIN_TEAM_PROFILE_EDITOR_FIXTURES: Record<
  AdminTeamProfileEditorScenario,
  AdminTeamProfileEditorFixture
> = {
  shown: { editing: "own", profile: LAURA, shown: true },
  "editing-gedu": { editing: "gedu", gedu: GEDU_TEAM_PROFILE_EDITOR_FIXTURES.live },
};
