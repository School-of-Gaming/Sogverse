import type { ProductTopic } from "@/types";

// Product "topic" is a fixed Postgres enum (`product_topic`). The game/subject
// split — once a `topic_kind` column on a dynamic `topics` table — is now a
// pure function of the enum value and lives here in code.
//
// Two label rules:
//   - Games (the Minecraft editions, Fortnite) are brand proper nouns:
//     identical in every locale, so their labels are literals here and never
//     go through i18n.
//   - Subjects (Webinar) localize, so they carry a key into the next-intl
//     `topics` message namespace (resolved by useTopicLabel).
//
// This map is the home for future per-topic config too — e.g. the account
// field a signup requires (Minecraft → Java username, Fortnite → Epic). A
// `switch (product.topic)` over the enum is compiler-checked exhaustive.

// Games carry the extra per-game facts the "About the game" card on the product
// detail page needs: a PEGI age rating (number; rendered as "PEGI {age}") and
// where to get the game. The brand label and these facts are literals (identical
// in every locale); the parent-facing prose — description, the "not included"
// note, the link/heading label — lives in the productDetail.gameInfo message
// namespace, keyed by topic. Subjects (Webinar) have no game facts.
//
// A game points either to a single "get it" page (`url`) or — for Minecraft
// Bedrock, which is the same game sold in a different store on every device — to
// a list of per-platform `stores`. A store's `name` is a brand/store proper noun
// (Xbox, App Store, Windows PC) and is NOT translated, same rule as game labels.
type GameStore = { name: string; url: string };
type TopicMeta =
  | {
      kind: "game";
      label: string;
      pegi: number;
      url?: string;
      stores?: readonly GameStore[];
    }
  | { kind: "subject"; labelKey: "webinar" };

export const PRODUCT_TOPICS = {
  minecraft_java: {
    kind: "game",
    label: "Minecraft Java",
    pegi: 7,
    // The PC purchase page ("Minecraft: Java & Bedrock Edition for PC"). Java
    // and Bedrock are a constant point of parental confusion — they're bought
    // in different places — so Java links to the *computer* purchase (what our
    // remote clubs need) and Bedrock to the device picker below. The copy
    // cross-references them too.
    url: "https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc",
  },
  minecraft_education: {
    kind: "game",
    label: "Minecraft Education",
    pegi: 7,
    url: "https://education.minecraft.net/",
  },
  minecraft_bedrock: {
    kind: "game",
    label: "Minecraft Bedrock",
    pegi: 7,
    // Bedrock is the same game sold in a different store per device, so it gets a
    // per-platform link list instead of one URL — a parent must buy on the device
    // their child will actually play on. These are Minecraft's own canonical
    // "Other platforms" URLs (from minecraft.net/get-minecraft), tracking params
    // stripped. Ordered by rough popularity for our audience, with mobile and
    // console kept as contiguous groups. Every form omits a locale and redirects
    // by the visitor's region — correct from anywhere, including Apple's id-only
    // form (verified). The one genuinely region-bound link is Amazon (amazon.com /
    // US; there's no amazon.fi), but Fire is niche. (PlayStation is cross-buy: one
    // purchase grants both the PS4 and PS5 versions.)
    stores: [
      // Mobile
      {
        name: "App Store",
        // Region-less id-only form: Apple 301-redirects to the visitor's regional
        // store AND fills in the correct slug (verified: a no-region URL bounces
        // to /<geo>/app/minecraft-play-with-friends/id479516143). So unlike
        // Mojang's hardcoded /us/, this one is correct from any country.
        url: "https://apps.apple.com/app/id479516143",
      },
      {
        name: "Google Play",
        url: "https://play.google.com/store/apps/details?id=com.mojang.minecraftpe",
      },
      // Console
      {
        name: "Nintendo Switch",
        url: "https://www.nintendo.com/store/products/minecraft-106679",
      },
      {
        name: "PlayStation",
        url: "https://store.playstation.com/product/UP4433-PPSA17221_00-MINECRAFTPS50000/",
      },
      {
        name: "Xbox",
        url: "https://www.xbox.com/games/store/minecraft/9MVXMVT8ZKWC",
      },
      // Other
      {
        name: "Windows PC",
        url: "https://apps.microsoft.com/detail/9NBLGGH2JHXJ",
      },
      {
        name: "Amazon Fire",
        // Mojang's official Amazon Fire link is amazon.com (US). Amazon is
        // per-country (no amazon.fi), so this one IS region-bound — but it's the
        // canonical link from get-minecraft, and Fire is a niche device anyway.
        url: "https://www.amazon.com/Mojang-Minecraft-Pocket-Edition/dp/B00992CF6W",
      },
    ],
  },
  fortnite: {
    kind: "game",
    label: "Fortnite",
    pegi: 12,
    url: "https://www.fortnite.com/",
  },
  webinar: { kind: "subject", labelKey: "webinar" },
} as const satisfies Record<ProductTopic, TopicMeta>;

// Display order for pickers and filter chips: games first, then subjects.
export const PRODUCT_TOPIC_VALUES = [
  "minecraft_java",
  "minecraft_education",
  "minecraft_bedrock",
  "fortnite",
  "webinar",
] as const satisfies readonly ProductTopic[];

// The subset of topics that are games. Useful as a key type for per-game
// config that only exists for games (e.g. the productDetail.gameInfo messages),
// so call sites narrow away `webinar` before indexing into it.
export type GameTopic = {
  [K in ProductTopic]: (typeof PRODUCT_TOPICS)[K]["kind"] extends "game"
    ? K
    : never;
}[ProductTopic];

/** Narrowing guard: true (and refines the type) for game topics. */
export function isGameTopic(topic: ProductTopic): topic is GameTopic {
  return PRODUCT_TOPICS[topic].kind === "game";
}

export const GAME_TOPICS: readonly ProductTopic[] = PRODUCT_TOPIC_VALUES.filter(
  (t) => PRODUCT_TOPICS[t].kind === "game",
);
export const SUBJECT_TOPICS: readonly ProductTopic[] =
  PRODUCT_TOPIC_VALUES.filter((t) => PRODUCT_TOPICS[t].kind === "subject");
