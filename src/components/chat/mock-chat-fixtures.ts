import type { ChatReactionCode } from "@/lib/constants/chat";
import {
  SESSION_FEED_ADULT_ID,
  SESSION_FEED_GAMER_IDS,
} from "@/components/gedu/session-feed/mock-fixtures";
import { VOICE_ROOM_GEDU_ID } from "@/components/voice/mock-room-fixtures";
import type { ChatAccount, ChatImageRef, ChatMessage } from "./types";

/**
 * Fixtures for the chat preview scene.
 *
 * **Deliberately not a client module.** The scene that renders these is one,
 * but the scenario guard beside them is called by the preview route on the
 * *server* to decide whether a slug is a 404 before anything renders, and a
 * guard exported from a `"use client"` file cannot be called from there at all.
 * Every other scene's fixtures sit the same way, for the same reason.
 */

export const CHAT_SCENE_SCENARIOS = ["session"] as const;
export type ChatSceneScenario = (typeof CHAT_SCENE_SCENARIOS)[number];

export function isChatSceneScenario(value: string): value is ChatSceneScenario {
  return (CHAT_SCENE_SCENARIOS as readonly string[]).includes(value);
}

/**
 * The mock roster's ids, named so the seeded conversation can say who spoke
 * without repeating a UUID.
 *
 * **Every id is a real UUIDv4, hardcoded, and most of them are borrowed rather
 * than minted.** An identicon is a pattern hashed out of an id's hex bytes, so
 * a readable stand-in renders a degenerate avatar and a generated one hands the
 * same person a different face on every reload. Borrowing the session feed's
 * and the voice room's ids is the same reasoning one step further out: a
 * reviewer comparing the chat panel against the room it will live in is
 * comparing the same faces rather than two unrelated crowds.
 *
 * Petra is the one new id, because no other fixture surface has an admin in the
 * room — and an admin in a family-facing chat is exactly one of the viewers the
 * capability derivation has to be looked at through.
 */
export const CHAT_ACCOUNT_IDS = {
  sanna: VOICE_ROOM_GEDU_ID,
  petra: "8e527763-0994-423d-a868-33bc5698dccd",
  marja: SESSION_FEED_ADULT_ID,
  aino: SESSION_FEED_GAMER_IDS.aino,
  vaino: SESSION_FEED_GAMER_IDS.vaino,
  siiri: SESSION_FEED_GAMER_IDS.siiri,
} as const;

/**
 * Who is in the room: two of each kind that matters.
 *
 * A Gedu and an admin, because both moderate and only one of them is normally
 * present; a parent, because a customer holding a seat is a participant with no
 * moderator powers and is the viewer most easily got wrong; and three children,
 * because grouping, mentions and a burst of images all need somebody to be said
 * to and about.
 *
 * The order is the order the switcher offers them, which is the order the
 * capability set widens: child, parent, staff.
 */
export const CHAT_SCENE_ACCOUNTS: readonly ChatAccount[] = [
  { id: CHAT_ACCOUNT_IDS.aino, name: "Aino", role: "gamer" },
  { id: CHAT_ACCOUNT_IDS.vaino, name: "Väinö", role: "gamer" },
  { id: CHAT_ACCOUNT_IDS.siiri, name: "Siiri", role: "gamer" },
  { id: CHAT_ACCOUNT_IDS.marja, name: "Marja", role: "customer" },
  { id: CHAT_ACCOUNT_IDS.sanna, name: "Sanna", role: "gedu" },
  { id: CHAT_ACCOUNT_IDS.petra, name: "Petra", role: "admin" },
];

/**
 * Demo art, travelling in the same `src` field a stored image will.
 *
 * The dimensions are the files' real ones, because every box in the log is
 * arithmetic off them — a fixture that guessed would make the thumbnail row
 * lie about the one property it exists to demonstrate.
 */
const FIXTURE_IMAGES = {
  build: {
    id: "chat-image-build",
    src: "/preview-art/session-build.jpg",
    width: 1600,
    height: 900,
  },
  tower: {
    id: "chat-image-tower",
    src: "/preview-art/session-tower.jpg",
    width: 900,
    height: 1600,
  },
  badge: {
    id: "chat-image-badge",
    src: "/preview-art/session-badge.jpg",
    width: 1200,
    height: 1200,
  },
  arena: {
    id: "chat-image-arena",
    src: "/preview-art/session-arena.jpg",
    width: 1600,
    height: 900,
  },
} as const satisfies Record<string, ChatImageRef>;

/**
 * A mention token — the *stored* form, which is what a seeded message is: a row
 * that has already been sent. What the composer shows while somebody writes one
 * is `@Name`; the substitution happens at send.
 */
function mention(id: string, name: string): string {
  return `@[${name}](${id})`;
}

/** One seeded message, before the clock is applied. */
interface SeedSpec {
  /** How long before `now` it was sent. */
  minutesAgo: number;
  senderId: string;
  body?: string;
  image?: ChatImageRef;
  /** The seeded message's index in this list that it answers. */
  replyToIndex?: number;
  edited?: boolean;
  /** Who removed it — set on the one message a moderator took down. */
  hiddenBy?: string;
}

/**
 * The conversation the scene opens on.
 *
 * It is written to put every state the design has to answer for on one screen,
 * because that is the whole discipline of a one-scenario scene: states that
 * share a render compare themselves, and states behind separate links get
 * compared from memory. In order of appearance it carries a mention, a run of
 * grouped messages, a quote-reply, a burst of images fanned out exactly as the
 * composer fans one out, a lone image, a message a moderator removed, an edited
 * message, and reactions in both the one-person and several-people shapes.
 *
 * **Väinö is seeded locked**, by the Gedu, right after the message she removed.
 * That is what makes the locked composer reachable by switching account rather
 * than by first performing a moderation — and it makes the room's own account
 * list carry the story that explains it.
 */
const CONVERSATION: readonly SeedSpec[] = [
  {
    minutesAgo: 42,
    senderId: CHAT_ACCOUNT_IDS.sanna,
    body: "Afternoon everyone. We are carrying on with the redstone build today, so grab a seat and hop into the lobby when you are ready.",
  },
  {
    minutesAgo: 41,
    senderId: CHAT_ACCOUNT_IDS.sanna,
    body: `${mention(CHAT_ACCOUNT_IDS.aino, "Aino")} you were halfway through the piston door last week — do you want to pick that back up?`,
  },
  {
    minutesAgo: 39,
    senderId: CHAT_ACCOUNT_IDS.aino,
    body: "yes please!! i want to finish the door",
  },
  {
    minutesAgo: 37,
    senderId: CHAT_ACCOUNT_IDS.vaino,
    body: "can i come and help with the door",
  },
  {
    minutesAgo: 36,
    senderId: CHAT_ACCOUNT_IDS.aino,
    body: "yeah come over, i need someone to run the wiring underneath",
    replyToIndex: 3,
  },
  {
    minutesAgo: 30,
    senderId: CHAT_ACCOUNT_IDS.siiri,
    image: FIXTURE_IMAGES.build,
  },
  {
    minutesAgo: 30,
    senderId: CHAT_ACCOUNT_IDS.siiri,
    image: FIXTURE_IMAGES.tower,
  },
  {
    minutesAgo: 30,
    senderId: CHAT_ACCOUNT_IDS.siiri,
    image: FIXTURE_IMAGES.badge,
  },
  {
    minutesAgo: 30,
    senderId: CHAT_ACCOUNT_IDS.siiri,
    body: "look what we finished last week :)",
  },
  {
    minutesAgo: 24,
    senderId: CHAT_ACCOUNT_IDS.marja,
    body: "Thank you Sanna — Siiri will be about five minutes late next week, we have a dentist appointment.",
  },
  {
    minutesAgo: 23,
    senderId: CHAT_ACCOUNT_IDS.sanna,
    body: "No problem at all, we will keep her spot.",
    replyToIndex: 9,
  },
  {
    minutesAgo: 16,
    senderId: CHAT_ACCOUNT_IDS.vaino,
    body: "you are all rubbish at this lol",
    hiddenBy: CHAT_ACCOUNT_IDS.sanna,
  },
  {
    minutesAgo: 15,
    senderId: CHAT_ACCOUNT_IDS.sanna,
    body: `Let us keep it kind in here please. ${mention(CHAT_ACCOUNT_IDS.vaino, "Väinö")} have another read of the club rules and we will talk after the session.`,
  },
  {
    minutesAgo: 8,
    senderId: CHAT_ACCOUNT_IDS.petra,
    body: "Dropping in to watch the last stretch — carry on as you were.",
  },
  {
    minutesAgo: 4,
    senderId: CHAT_ACCOUNT_IDS.aino,
    body: "the door works!!! it opens both ways now",
    edited: true,
  },
  {
    minutesAgo: 3,
    senderId: CHAT_ACCOUNT_IDS.aino,
    image: FIXTURE_IMAGES.arena,
  },
];

/**
 * Which reactions stand on which seeded message, by index.
 *
 * Two shapes are needed and neither stands in for the other: one person on one
 * face, which is the ordinary case and the only one where the toggle's pressed
 * state can be checked against nothing else; and several people on several
 * faces, which is where the row's wrapping and its counts are judged.
 */
const REACTIONS: Record<
  number,
  readonly { code: ChatReactionCode; senderId: string }[]
> = {
  2: [{ code: "heart", senderId: CHAT_ACCOUNT_IDS.sanna }],
  8: [
    { code: "thumbs_up", senderId: CHAT_ACCOUNT_IDS.sanna },
    { code: "thumbs_up", senderId: CHAT_ACCOUNT_IDS.aino },
    { code: "celebrate", senderId: CHAT_ACCOUNT_IDS.marja },
    { code: "surprised", senderId: CHAT_ACCOUNT_IDS.vaino },
  ],
  14: [
    { code: "celebrate", senderId: CHAT_ACCOUNT_IDS.sanna },
    { code: "celebrate", senderId: CHAT_ACCOUNT_IDS.siiri },
    { code: "thumbs_up", senderId: CHAT_ACCOUNT_IDS.petra },
  ],
};

/** Väinö, locked by the Gedu after the message she removed. */
export const CHAT_SCENE_LOCKED_IDS: readonly string[] = [
  CHAT_ACCOUNT_IDS.vaino,
];

/**
 * The seeded log, oldest first, anchored to the instant the scene mounted.
 *
 * Anchoring rather than hardcoding is what keeps the timestamps reading as a
 * session that is happening now, whichever afternoon somebody opens the page.
 */
export function buildChatSceneMessages(now: Date): ChatMessage[] {
  const ids = CONVERSATION.map((_, index) => `seed-${index}`);

  return CONVERSATION.map((spec, index) => {
    const createdAt = new Date(
      now.getTime() - spec.minutesAgo * 60_000,
    ).toISOString();
    const hidden = spec.hiddenBy !== undefined;
    return {
      id: ids[index],
      senderId: spec.senderId,
      createdAt,
      body: spec.body ?? null,
      image: spec.image ?? null,
      replyToId:
        spec.replyToIndex === undefined ? null : ids[spec.replyToIndex],
      editedAt:
        spec.edited === true
          ? new Date(Date.parse(createdAt) + 40_000).toISOString()
          : null,
      hiddenAt: hidden ? new Date(Date.parse(createdAt) + 60_000).toISOString() : null,
      hiddenBy: spec.hiddenBy ?? null,
      reactions: REACTIONS[index] ?? [],
      delivery: "sent" as const,
    };
  });
}

/**
 * Lines the scripted-activity control sends, in order and then wrapping.
 *
 * They are written to arrive from *different* people and to include one that
 * mentions the reader — arrivals are how auto-stick scrolling, the
 * scrolled-up counter and grouping are felt, and a run all from one sender
 * would only exercise one of the three.
 */
export const CHAT_SCENE_INCOMING: readonly {
  senderId: string;
  body: string;
}[] = [
  { senderId: CHAT_ACCOUNT_IDS.siiri, body: "nice one aino" },
  {
    senderId: CHAT_ACCOUNT_IDS.vaino,
    body: "can someone open the gate, i am stuck outside",
  },
  { senderId: CHAT_ACCOUNT_IDS.siiri, body: "coming!" },
  {
    senderId: CHAT_ACCOUNT_IDS.sanna,
    body: "Ten minutes left, everyone — start tidying your builds.",
  },
  { senderId: CHAT_ACCOUNT_IDS.aino, body: "one sec, saving the redstone" },
  {
    senderId: CHAT_ACCOUNT_IDS.marja,
    body: "Siiri is being picked up at half past, just so you know.",
  },
  {
    senderId: CHAT_ACCOUNT_IDS.petra,
    body: "Lovely session to watch, thanks all.",
  },
];
