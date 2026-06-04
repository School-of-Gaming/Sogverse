import type { ProductTopic } from "@/types";

// Product "topic" is a fixed Postgres enum (`product_topic`). The game/subject
// split — once a `topic_kind` column on a dynamic `topics` table — is now a
// pure function of the enum value and lives here in code.
//
// Two label rules:
//   - Games (Minecraft, Fortnite) are brand proper nouns: identical in every
//     locale, so their labels are literals here and never go through i18n.
//   - Subjects (Webinar) localize, so they carry a key into the next-intl
//     `topics` message namespace (resolved by useTopicLabel).
//
// This map is the home for future per-topic config too — e.g. the account
// field a signup requires (Minecraft → Java username, Fortnite → Epic). A
// `switch (product.topic)` over the enum is compiler-checked exhaustive.

type TopicMeta =
  | { kind: "game"; label: string }
  | { kind: "subject"; labelKey: "webinar" };

export const PRODUCT_TOPICS = {
  minecraft: { kind: "game", label: "Minecraft" },
  fortnite: { kind: "game", label: "Fortnite" },
  webinar: { kind: "subject", labelKey: "webinar" },
} as const satisfies Record<ProductTopic, TopicMeta>;

// Display order for pickers and filter chips: games first, then subjects.
export const PRODUCT_TOPIC_VALUES = [
  "minecraft",
  "fortnite",
  "webinar",
] as const satisfies readonly ProductTopic[];

export const GAME_TOPICS: readonly ProductTopic[] = PRODUCT_TOPIC_VALUES.filter(
  (t) => PRODUCT_TOPICS[t].kind === "game",
);
export const SUBJECT_TOPICS: readonly ProductTopic[] =
  PRODUCT_TOPIC_VALUES.filter((t) => PRODUCT_TOPICS[t].kind === "subject");
