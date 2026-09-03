import {
  SESSION_FEED_ADULT_ID,
  SESSION_FEED_GAMER_IDS,
} from "@/components/gedu/session-feed/mock-fixtures";
import type { VoiceParticipant } from "./hooks/types";
import type { GamerCreation, VoiceZone } from "@/types";

/**
 * Fixtures for the voice-room preview scene.
 *
 * **Deliberately not a client module.** The scene that renders these is one —
 * it holds state and drives the room — but the scenario guard beside them is
 * called by the preview route on the *server*, to decide whether a slug is a
 * 404 before anything renders. A guard exported from a `"use client"` file
 * cannot be called from there at all, so the data and its guard live here and
 * the scene imports them. Every other scene's fixtures sit the same way, for
 * the same reason.
 */

export const VOICE_ROOM_SCENARIOS = ["gedu", "gamer"] as const;
export type VoiceRoomScenario = (typeof VOICE_ROOM_SCENARIOS)[number];

export function isVoiceRoomScenario(value: string): value is VoiceRoomScenario {
  return (VOICE_ROOM_SCENARIOS as readonly string[]).includes(value);
}

/** The Gedu whose view the staff scenario is. */
export const VOICE_ROOM_GEDU_ID = "4a84d001-b789-41f5-ace3-cfcffa139869";
/**
 * Marja — the parent holding a seat of her own.
 *
 * Imported rather than restated, like the children's ids beside it: the
 * identicon is hashed from the id, so a second literal for the same fixture
 * person would give her a different face here than on the gedu roster, and this
 * file's whole claim is that the two surfaces show the same crowd.
 */
const ADULT_ID = SESSION_FEED_ADULT_ID;

const DAY_MS = 86_400_000;

/**
 * One custom zone beside the virtual ones. A single zone is enough here: the
 * zone list has its own home in the style guide, where it is exercised at the
 * crowd sizes it has to survive. What this scene needs from it is the width it
 * takes off the rail, not its own states.
 */
export const VOICE_ROOM_CUSTOM_ZONES: VoiceZone[] = [
  {
    id: "preview-build-corner",
    group_id: "preview-group",
    name: "Build corner",
    icon: "anvil",
    color: "teal",
    is_locked: false,
    sort_order: 0,
    created_by: VOICE_ROOM_GEDU_ID,
    created_at: "2026-06-16T10:00:00Z",
    updated_at: "2026-06-16T10:00:00Z",
  },
];

/**
 * The room's membership — the same eight children and one parent the gedu
 * product page's roster carries, under the same ids.
 *
 * Sharing the ids is deliberate: the identicon is hashed from the id, so a
 * reviewer comparing the two surfaces is comparing the same faces with the same
 * marks rather than two unrelated crowds, and "does this read the same in both
 * places" becomes a question a screenshot can answer.
 */
export function buildParticipants(
  scenario: VoiceRoomScenario,
): VoiceParticipant[] {
  const member = (
    over: Pick<
      VoiceParticipant,
      "sessionId" | "userId" | "userName" | "zoneId"
    > &
      Partial<VoiceParticipant>,
  ): VoiceParticipant => ({
    role: "gamer",
    audioOn: true,
    videoOn: false,
    screenShareOn: false,
    isLocal: false,
    isOwner: false,
    isSpeaking: false,
    isBroadcasting: false,
    gamePlatform: "minecraft",
    gameUsername: null,
    gameExternalId: null,
    ...over,
  });

  const localIsGedu = scenario === "gedu";

  return [
    member({
      sessionId: "s-staff",
      userId: VOICE_ROOM_GEDU_ID,
      userName: "Sanna",
      zoneId: "lobby",
      role: "gedu",
      gameUsername: "SannaBuilds",
      isLocal: localIsGedu,
      isOwner: localIsGedu,
    }),
    member({
      sessionId: "s-aino",
      userId: SESSION_FEED_GAMER_IDS.aino,
      userName: "Aino",
      zoneId: "lobby",
      gameUsername: "AinoCrafts",
      isSpeaking: true,
      // The child whose view the family scenario is — the one row that proves
      // the overlay is absent rather than merely unrendered.
      isLocal: !localIsGedu,
    }),
    member({
      sessionId: "s-vaino",
      userId: SESSION_FEED_GAMER_IDS.vaino,
      userName: "Väinö",
      zoneId: "lobby",
      gameUsername: "vaino_mc",
      audioOn: false,
    }),
    member({
      sessionId: "s-elias",
      userId: SESSION_FEED_GAMER_IDS.elias,
      userName: "Elias",
      zoneId: "yty-valor",
      gameUsername: "EliasTheRed",
    }),
    member({
      sessionId: "s-linnea",
      userId: SESSION_FEED_GAMER_IDS.linnea,
      userName: "Linnéa",
      zoneId: "yty-valor",
      // Linked but never filled in — the "(Unknown)" identity, which a room
      // always has one or two of.
      gameUsername: null,
    }),
    member({
      sessionId: "s-oskar",
      userId: SESSION_FEED_GAMER_IDS.oskar,
      userName: "Oskar",
      zoneId: "preview-build-corner",
      gameUsername: "oskar_builds_things",
      videoOn: true,
    }),
    member({
      sessionId: "s-siiri",
      userId: SESSION_FEED_GAMER_IDS.siiri,
      userName: "Siiri",
      zoneId: "preview-build-corner",
      gameUsername: "SiiriSky",
    }),
    member({
      sessionId: "s-emil",
      userId: SESSION_FEED_GAMER_IDS.emil,
      userName: "Emil",
      zoneId: "lobby",
      gameUsername: "emil_redstone",
    }),
    member({
      sessionId: "s-hilda",
      userId: SESSION_FEED_GAMER_IDS.hilda,
      userName: "Hilda",
      zoneId: "yty-harmony",
      gameUsername: "HildaH",
      audioOn: false,
    }),
    member({
      sessionId: "s-marja",
      userId: ADULT_ID,
      userName: "Marja",
      zoneId: "lobby",
      role: "customer",
      // A parent cannot link a game account, so the identity slot is the Parent
      // badge instead — and an adult can be new to a group like anyone else.
      gamePlatform: undefined,
    }),
  ];
}

/**
 * Everyone in the fixture room who actually holds a seat in the group: the
 * eight children and Marja, and **not Sanna**, who is the Gedu running the
 * session. She is in the call and in nobody's roster, which is exactly the case
 * the note button has to refuse — a Gedu cannot write a note about themselves.
 */
export const SEATED_MEMBER_IDS: ReadonlySet<string> = new Set([
  ...Object.values(SESSION_FEED_GAMER_IDS),
  ADULT_ID,
]);

/**
 * The staff overlay: four newcomers spread across the window, two notes, and two
 * members carrying creations.
 *
 * **Four, at 1, 10, 19 and 28 days — one per pip of the badge's meter.** The
 * badge drains a four-pip block across the window, so four members spread
 * across it show every state the badge has, in one screenshot, in the order a
 * reader will meet them. A single newcomer would prove only that it renders.
 *
 * Two notes, one of them on a newcomer (Siiri) so a single row is seen wearing
 * both marks at once, and one on a settled member (Elias) so a note is also
 * seen alone. Every other row has none, which is the case the button has to keep
 * serving: it is present and dimmed there, because writing the first thing is
 * the common action.
 *
 * **The creations are on deliberately different people from the notes**, because
 * the button says only that *something* is recorded: Aino has a creation and no
 * note, Siiri has both, and Elias has a note alone — so the rail carries all
 * three ways a row can be lit, side by side, which is the only way to see that
 * the mark is not a note marker. One each, because the dialog authors one: a
 * fixture holding two would be showing a state no Gedu can produce.
 */
export function buildFlairFixture(now: Date): {
  newcomers: Record<string, string>;
  notes: Record<string, string>;
  noteEditors: Record<string, string>;
  creations: Record<string, readonly GamerCreation[]>;
} {
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * DAY_MS).toISOString();

  return {
    newcomers: {
      [SESSION_FEED_GAMER_IDS.emil]: daysAgo(1),
      [SESSION_FEED_GAMER_IDS.siiri]: daysAgo(10),
      [ADULT_ID]: daysAgo(19),
      [SESSION_FEED_GAMER_IDS.hilda]: daysAgo(28),
    },
    notes: {
      [SESSION_FEED_GAMER_IDS.siiri]:
        "Quiet in big groups — pair her rather than letting her pick a partner. Has warmed up a lot since autumn.",
      [SESSION_FEED_GAMER_IDS.elias]:
        "Sat out most of last session and asked to change teams — pair him with Väinö and check in before the build starts.",
    },
    noteEditors: {
      [SESSION_FEED_GAMER_IDS.siiri]: "Sanna",
      [SESSION_FEED_GAMER_IDS.elias]: "Petra",
    },
    creations: {
      [SESSION_FEED_GAMER_IDS.aino]: [
        {
          title: "Lohikäärmeen linna — the castle world",
          url: "https://www.planetminecraft.com/project/lohikaarmeen-linna/",
        },
      ],
      [SESSION_FEED_GAMER_IDS.siiri]: [
        {
          title: "Underwater dome with the working airlock",
          url: "https://www.planetminecraft.com/project/siiri-dome/",
        },
      ],
    },
  };
}
