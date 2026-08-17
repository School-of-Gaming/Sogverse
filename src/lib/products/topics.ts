import type { ProductTopic } from "@/types";

// Product "topic" is a fixed Postgres enum (`product_topic`), and it is one
// flat axis: every value is simply a topic. There is no game/subject split in
// the model — that discriminator used to bundle three unrelated facts (how a
// topic is categorised, where its name comes from, whether the product page
// shows an info card) and Roblox Studio broke it: a creation tool, named by a
// brand proper noun, that absolutely needs the card (it is the one desktop-only
// thing in the catalogue).
//
// Two rules replace it:
//   - Labels are literals and are never translated. Most topics are proper
//     nouns and settle that on their own — Minecraft, Rocket League, Roblox
//     Studio, and Creator Studio and Game Studio, which are School of Gaming's
//     own brand words for those programmes rather than descriptions of what
//     happens in them.
//     Three are ordinary common nouns: Programming, AI and Esports. Those were
//     looked at deliberately and left in English anyway, which is a decision
//     that has been taken rather than one still open — a parent browsing in
//     Finnish or French sees "Programming" verbatim, on the filter chips, in
//     the admin picker and in any card heading. The escape hatch if that is
//     ever reversed is a `labelKey` variant: a two-case union on the *name
//     only* (a literal `label` or a message key), orthogonal to `info` and
//     never a reintroduced kind discriminator. It is described here and
//     deliberately not built — an unused branch at every label read site is a
//     cost, and the decision it would implement went the other way.
//   - The optional `info` block is what drives the "About {name}" card on the
//     product detail page: present ⇒ the card renders, absent ⇒ no card. Its
//     facts are literals (a PEGI age rating where the topic has one, and where
//     to get the software); the parent-facing prose — description, the
//     needs/costs note, the link/heading label — lives in the
//     productDetail.topicInfo message namespace, keyed by topic.
//
// Five topics are label-only and render no card at all: creator_studio,
// game_studio, programming, ai and esports. That is the design, not an omission
// waiting to be filled. None of them is one piece of software a family installs
// — three name subject matter, and Creator Studio and Game Studio name
// programmes of ours — so there is nothing single to rate, price or link to. A
// Game Studio group builds its own game, and which engine that takes belongs to
// the product rather than to the topic. What a family needs for an
// Esports club is a fact about *that* club, and an admin writes it into that
// product's own description, where it can differ between two products sharing
// the topic. A generic card would be the wrong altitude and would push the
// specific answer further down the page.
//
// This map is the home for future per-topic config too — e.g. the account
// field a signup requires (Minecraft → Java username, Fortnite → Epic). A
// `switch (product.topic)` over the enum is compiler-checked exhaustive.
//
// An info block points either to a single "get it" page (`url`) or — where
// there is no single page to send a parent to, because the software is
// installed per-device from that device's own store (Minecraft Bedrock,
// Pokémon GO) — to a list of per-platform `stores`. A store's `name` is a
// brand/store proper noun (Xbox, App Store, Windows PC) and is NOT translated,
// same rule as topic labels.
type GameStore = { name: string; url: string };
export type TopicMeta = {
  /** Brand proper noun — never translated. */
  label: string;
  /** Present ⇒ the product page renders the "About {label}" card. `pegi` is
   *  omitted where the topic has no age rating (Roblox Studio is a creation
   *  tool, not a rated game). Exactly one of `url` / `stores` is set. */
  info?: {
    pegi?: number;
    url?: string;
    stores?: readonly GameStore[];
  };
};

export const PRODUCT_TOPICS = {
  minecraft_java: {
    label: "Minecraft Java",
    info: {
      pegi: 7,
      // The PC purchase page ("Minecraft: Java & Bedrock Edition for PC"). Java
      // and Bedrock are a constant point of parental confusion — they're bought
      // in different places — so Java links to the *computer* purchase (what our
      // remote clubs need) and Bedrock to the device picker below. The copy
      // cross-references them too. Locale-less form: minecraft.net redirects by the
      // visitor's Accept-Language to their regional store (verified fi-fi/sv-se),
      // so we don't hardcode /en-us/ — same region-neutral rule as the Bedrock
      // store links below.
      url: "https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc",
    },
  },
  minecraft_education: {
    label: "Minecraft Education",
    info: {
      pegi: 7,
      url: "https://education.minecraft.net/",
    },
  },
  minecraft_bedrock: {
    label: "Minecraft Bedrock",
    info: {
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
  },
  fortnite: {
    label: "Fortnite",
    info: {
      pegi: 12,
      url: "https://www.fortnite.com/",
    },
  },
  rocket_league: {
    label: "Rocket League",
    info: {
      pegi: 3,
      // Free to install on every platform it runs on, so this looked like a
      // Bedrock-shaped `stores` list — and three of the four links check out as
      // region-neutral (Epic's bare /p/ form, which is what /en-US/ itself
      // canonicalises to; Xbox's bare games/store form, which redirects to the
      // visitor's regional store; and PlayStation's *concept* URL, the one PS
      // form that is not region-bound — the product SKUs are split, and the
      // North American one resolves to nothing on the Finnish store).
      //
      // Nintendo is the one that fails, and it takes the list down with it:
      // Nintendo's American and European sites do not share a URL structure at
      // all (/us/store/products/<slug>/ against /en-gb/Games/…-<id>.html), so
      // there is no Switch link that is correct from both. A store row that
      // silently 404s for a Finnish parent is worse than a less specific link,
      // so the whole list gives way to the game's own official site, which
      // carries its own platform picker and is one global page with no regional
      // variants to get wrong.
      url: "https://www.rocketleague.com/",
    },
  },
  pokemon_go: {
    label: "Pokémon GO",
    info: {
      pegi: 7,
      // Mobile-only and free to install, so — like Bedrock — there is no single
      // page to send a parent to: they install it on the phone or tablet the child
      // will actually play on. Two stores rather than Bedrock's seven, because
      // Pokémon GO has no PC or console version at all.
      //
      // Both forms are region-neutral and redirect to the visitor's local store,
      // the same rule as the Minecraft links above: Apple's id-only URL 301s to
      // /<geo>/app/pokemon-go/id1094591345, and Google Play resolves the package
      // id per-region. Neither hardcodes a country.
      stores: [
        { name: "App Store", url: "https://apps.apple.com/app/id1094591345" },
        {
          name: "Google Play",
          url: "https://play.google.com/store/apps/details?id=com.nianticlabs.pokemongo",
        },
      ],
    },
  },
  // Label-only: competitive play across whichever game the product is actually
  // about, so there is nothing single to rate or link to. See the header note.
  esports: {
    label: "Esports",
  },
  roblox_studio: {
    label: "Roblox Studio",
    info: {
      // Deliberately no `pegi`: Studio is a creation tool with no age rating of
      // its own, and borrowing the Roblox platform's rating would assert one it
      // does not have. The card's copy carries the load-bearing fact instead —
      // Studio runs on Windows PCs and Macs only, so a family without a desktop
      // or laptop cannot take part.
      url: "https://create.roblox.com/",
    },
  },
  // Label-only, for the reason in the header note: each names subject matter,
  // and the software (if any) varies by product. Creator Studio and Game Studio
  // are our own programme names, so they are proper nouns like the game brands
  // above even though the two below them are common nouns.
  creator_studio: {
    label: "Creator Studio",
  },
  game_studio: {
    label: "Game Studio",
  },
  programming: {
    label: "Programming",
  },
  ai: {
    label: "AI",
  },
} as const satisfies Record<ProductTopic, TopicMeta>;

// The topics that carry an info block, derived from the map rather than listed
// — so adding or removing one `info` is the whole edit. This is the type the
// About card's message keys are resolved against: only these topics have prose
// under productDetail.topicInfo.topics, and typing the card's `topic` as the
// full enum would ask next-intl for keys that are deliberately absent.
export type TopicWithInfoCard = {
  [K in ProductTopic]: (typeof PRODUCT_TOPICS)[K] extends { info: unknown }
    ? K
    : never;
}[ProductTopic];

/** A `TopicMeta` known to carry its info block — what a card-bearing topic
 *  resolves to once `topicHasInfoCard` has narrowed it. */
export type TopicMetaWithInfoCard = TopicMeta & {
  info: NonNullable<TopicMeta["info"]>;
};

// The card's render condition, in one place, asked by two callers: the card
// itself returns null on false, and the product detail page skips rendering the
// card's *grid wrapper* — an empty wrapper is still a grid item in a gapped
// container and would leave a hole in the reading column. Two `info` checks in
// two files would drift; one predicate cannot.
//
// It is a type predicate rather than a plain boolean because the card needs
// both halves of the same fact: that a block exists, and that this topic is one
// of the ones the message catalog has prose for. The lookup inside widens to
// `TopicMeta` deliberately — the const map's literal member types answer the
// question per entry, and reading it through the declared shape keeps the
// runtime check honest instead of something the compiler folds away.
export function topicHasInfoCard(
  topic: ProductTopic,
): topic is TopicWithInfoCard {
  const meta: TopicMeta = PRODUCT_TOPICS[topic];
  return meta.info !== undefined;
}

// Display order for pickers and filter chips. This is hand-ordered rather than
// derived from the generated `Constants` tuple, because the enum's own order is
// just the order values were added to the type (roblox_studio inherited
// webinar's slot ahead of pokemon_go, for instance) — which is not an order
// anyone should be shown.
//
// The cost of hand-ordering is that `satisfies readonly ProductTopic[]` checks
// every element IS a topic but not that every topic is listed, so a new enum
// value omitted here type-checks fine and simply never appears in the admin
// picker or any filter chip. A unit test asserts this tuple covers the enum,
// because the compiler will not.
// The order is games first, then esports, then the creation and tech subjects —
// so the row reads from the concrete thing a child names ("Minecraft") toward
// the subject a parent names ("Programming"), rather than alphabetically.
export const PRODUCT_TOPIC_VALUES = [
  "minecraft_java",
  "minecraft_education",
  "minecraft_bedrock",
  "fortnite",
  "rocket_league",
  "pokemon_go",
  "esports",
  "roblox_studio",
  "creator_studio",
  "game_studio",
  "programming",
  "ai",
] as const satisfies readonly ProductTopic[];

// A topic filter chip groups one or more product topics behind a single chip.
// Most chips are 1:1 with a topic; the Minecraft editions (Java/Education/
// Bedrock) collapse into one "Minecraft" chip. A chip selects all its topics
// together (OR-ed in `filterProducts`). Module-local on purpose: the one chip
// list below is the only chip set — a second one was built once and removed.
interface TopicFilterChip {
  /** Stable key for the React list and the URL-membership check. */
  key: string;
  /** The topic enum values this chip selects together. */
  topics: readonly ProductTopic[];
  /** Literal brand label for a multi-topic group (e.g. "Minecraft"). A
   *  single-topic chip omits this and resolves its label from the topic via
   *  `useTopicLabel`. */
  label?: string;
}

// The Minecraft editions, collapsed behind the one "Minecraft" chip. Listed
// explicitly (rather than matched on a name prefix) so adding a new edition is
// a deliberate choice, not a silent inclusion.
const MINECRAFT_TOPICS: readonly ProductTopic[] = [
  "minecraft_java",
  "minecraft_education",
  "minecraft_bedrock",
];

// The topic chips every browse surface offers: Minecraft as one chip, then
// every remaining topic on its own, derived from the full tuple so new topics
// surface here automatically. Three edition chips made the filter row hard to
// read and the edition is not the browsing decision anyway — it stays fully
// visible where it matters, on the product card and the detail page (which
// also carries the edition's own info card).
export const TOPIC_FILTER_CHIPS: readonly TopicFilterChip[] = [
  { key: "minecraft", topics: MINECRAFT_TOPICS, label: "Minecraft" },
  ...PRODUCT_TOPIC_VALUES.filter((t) => !MINECRAFT_TOPICS.includes(t)).map(
    (t) => ({ key: t, topics: [t] }),
  ),
];
