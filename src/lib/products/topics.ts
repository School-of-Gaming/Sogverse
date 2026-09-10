import type { ProductTopic } from "@/types";
import type { GamePlatform } from "@/lib/constants/game-platforms";

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
//   - The optional `prep` block is its twin on the other side of the till: it
//     drives the "Before the first session" guide the confirmation page, the
//     confirmation mail and the My SOG enrolment cards all render. Its prose
//     lives in the top-level `topicPrep` namespace — top-level rather than
//     under a surface's own namespace precisely because three surfaces read it.
//
// **About answers "should I buy this"; Prep answers "what do I do now".**
// That split is the whole reason there are two blocks rather than one longer
// card, and it decides which sentence goes where:
//
//   - **About (`info`)** is read *before* a purchase, on the shop page. What
//     the thing is, what it costs, what device it needs, what a parent should
//     know about its content and safety. Requirements are stated as FACTS
//     ("playing needs a free Epic Games account"), never as instructions.
//   - **Prep (`prep`)** is read *after* a purchase. The steps that make a
//     family ready for the first session: create the account, install the
//     software, test it. It repeats a requirement only as the step that
//     satisfies it ("Create a free Epic Games account").
//
// A how-to sentence in an About note, or a cost/PEGI fact in a prep step, is
// the drift these definitions exist to catch.
//
// Exactly the seven topics that carry `info` carry `prep`, for the same reason:
// the five label-only topics name subject matter rather than one piece of
// software, so there is nothing single to install or sign into.
//
// **Every step declares a scope, because an in-person product supplies the
// machines.** At an in-person session School of Gaming provides computers with
// everything already installed, so a family only has to bring the accounts:
// `"always"` steps render on every product, `"ownDevice"` steps only on a
// remote one (`is_remote`). A topic whose `always` steps come to nothing —
// Minecraft Education, where School of Gaming provides the login too — renders
// no guide at all in person, which is what `resolveTopicPrep` returning null
// means.
//
// **One step belongs to no topic at all.** Getting a microphone and camera
// ready for the voice room is a fact about a *remote* product — the session
// happens in a browser room, and in person it does not happen at all — so it is
// declared once, outside every topic's `steps`, and `resolveTopicPrep` appends
// it as the last step of every remote guide. Written into the seven blocks it
// would be seven copies of one paragraph, drifting apart the first time one of
// them was edited. It is also why the five label-only topics now render a guide
// on a remote product where they rendered none before: there is exactly one
// thing to do beforehand, and it is this.
//
// **Every message-shaped thing stays out of this registry.** It holds structure
// and literals (a step's key, its scope, its URL) and the catalog holds the
// prose, exactly as `info` and `productDetail.topicInfo` already relate. The
// keys of any list-shaped prose — a step's per-platform notes, its checklist —
// are declared here as literal arrays so the catalog stays object-shaped and
// the compiler can check that each key exists. Those keys are **globally
// unique and the catalog holds them flat**, rather than nested under their
// topic: a nested shape would make a composed message key the cross product of
// every topic and every step, most of which do not exist, and the compiler
// would reject the composition that reads them.
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

/**
 * Who has to do a step, which decides whether an in-person product renders it.
 *
 * - `always` — an account step. A family holds the account wherever the
 *   sessions happen, so it survives every filter.
 * - `ownDevice` — an install, sign-in or test step against the family's own
 *   machine. At an in-person product School of Gaming supplies the machines
 *   with the software already on them, so the step is not the family's to do.
 */
export type TopicPrepScope = "always" | "ownDevice";

/**
 * One step of a prep guide, as the registry declares it: a stable key, who has
 * to do it, and the literals a renderer needs. No prose — every string a reader
 * sees is resolved from the `topicPrep` catalog by one of these keys.
 */
type TopicPrepStepShape = {
  /** Globally unique across every topic — see the header note. */
  readonly key: string;
  readonly scope: TopicPrepScope;
  /** A literal "get it here" URL. Its label is `steps.<key>.linkLabel`. */
  readonly url?: string;
  /** Per-platform "how to find it" notes, by catalog key, in reading order. */
  readonly platformNotes?: readonly string[];
  /** A short checklist under the step, by catalog key, in reading order. */
  readonly checklist?: readonly string[];
};

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
  /** Present ⇒ the topic has a "Before the first session" guide. See the
   *  header note for the About/Prep split and for what a step's scope means. */
  prep?: {
    readonly steps: readonly TopicPrepStepShape[];
    /**
     * Declared on a topic that has both scopes: filtered down to its account
     * steps, its ordinary intro would promise a guide about installing
     * software that the reader is not being shown. Such a topic carries a
     * second intro under `topicPrep.accountsOnlyIntro`, and this flag is what
     * makes the pairing checkable rather than derived from a scope count the
     * catalog cannot see. A topic with one scope needs no second intro: an
     * all-`always` topic never filters, and an all-`ownDevice` one renders
     * nothing in person.
     *
     * The *closing* deliberately has no such twin — there is one, shared,
     * written to be true of either form.
     */
    readonly accountsOnlyIntro?: true;
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
    prep: {
      accountsOnlyIntro: true,
      steps: [
        {
          key: "minecraftJavaAccount",
          scope: "always",
          url: "https://www.minecraft.net/store/minecraft-java-bedrock-edition-pc",
        },
        { key: "minecraftJavaInstall", scope: "ownDevice" },
        { key: "minecraftJavaLaunch", scope: "ownDevice" },
      ],
    },
  },
  minecraft_education: {
    label: "Minecraft Education",
    info: {
      pegi: 7,
      url: "https://education.minecraft.net/",
    },
    prep: {
      // One step, and it is an `ownDevice` one — so an in-person Minecraft
      // Education product renders no guide at all, which is correct: School of
      // Gaming supplies the machines AND the logins, so a family has nothing to
      // do beforehand. A step saying "there is nothing to do" would be worse
      // than the silence.
      steps: [
        {
          key: "minecraftEducationInstall",
          scope: "ownDevice",
          url: "https://education.minecraft.net/",
        },
      ],
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
    prep: {
      accountsOnlyIntro: true,
      steps: [
        { key: "minecraftBedrockAccount", scope: "always" },
        {
          key: "minecraftBedrockInstall",
          scope: "ownDevice",
          // The About card's per-device store list is the shop page's answer;
          // a prep step is one instruction and wants one destination, so it
          // points at Minecraft's own device picker instead of repeating seven
          // links a reader has already chosen between.
          url: "https://www.minecraft.net/get-minecraft",
        },
        { key: "minecraftBedrockOnline", scope: "ownDevice" },
      ],
    },
  },
  fortnite: {
    label: "Fortnite",
    info: {
      pegi: 12,
      url: "https://www.fortnite.com/",
    },
    prep: {
      accountsOnlyIntro: true,
      steps: [
        { key: "fortniteAccount", scope: "always" },
        // Parental controls are set on the Epic account rather than on a
        // machine, so they follow the family to an in-person session too.
        { key: "fortniteControls", scope: "always" },
        {
          key: "fortniteInstall",
          scope: "ownDevice",
          url: "https://www.fortnite.com/",
        },
        { key: "fortniteCrossplay", scope: "ownDevice" },
      ],
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
    prep: {
      accountsOnlyIntro: true,
      steps: [
        { key: "rocketLeagueAccount", scope: "always" },
        {
          key: "rocketLeagueInstall",
          scope: "ownDevice",
          url: "https://www.rocketleague.com/",
        },
        { key: "rocketLeagueCrossplay", scope: "ownDevice" },
      ],
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
    prep: {
      // Every step is `always`, and no step carries a URL. The phone is the
      // family's wherever the session happens — School of Gaming supplies
      // computers, not the child's own phone — so nothing here is ours to
      // provide and nothing filters out in person. That also makes this the
      // topic whose accounts-only form never renders, which is why it declares
      // no second intro. The two app stores are named in the step's own prose
      // rather than linked, because which of them is right is a fact about the
      // phone in the reader's hand.
      steps: [
        { key: "pokemonGoInstall", scope: "always" },
        { key: "pokemonGoAccount", scope: "always" },
        { key: "pokemonGoPhone", scope: "always" },
        { key: "pokemonGoAgree", scope: "always" },
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
    prep: {
      accountsOnlyIntro: true,
      steps: [
        { key: "robloxStudioAccount", scope: "always" },
        {
          key: "robloxStudioInstall",
          scope: "ownDevice",
          url: "https://create.roblox.com/",
          platformNotes: ["robloxStudioWindows", "robloxStudioMac"],
        },
        {
          key: "robloxStudioTest",
          scope: "ownDevice",
          checklist: [
            "robloxStudioTestOpen",
            "robloxStudioTestSignIn",
            "robloxStudioTestHome",
            "robloxStudioTestClose",
          ],
        },
      ],
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

// ---------------------------------------------------------------------------
// Prep: the "Before the first session" guide
// ---------------------------------------------------------------------------

/**
 * The one prep step that is not a topic's: getting the microphone and camera
 * ready for the voice room.
 *
 * **Declared here rather than inside seven `steps` arrays** because it is a
 * fact about a *remote* product and not about any topic — the same paragraph
 * would otherwise be written seven times and be seven paragraphs to keep in
 * agreement. `resolveTopicPrep` appends it, last, to every remote guide, and a
 * label-only topic's remote guide is this step and nothing else.
 *
 * Its scope is `ownDevice` for the reason the scope axis exists: the room runs
 * in a browser on the family's own machine, and at an in-person product there
 * is no room to join, so the step is never the family's to do there. The
 * resolver never has to *filter* it — it is only ever added on the remote
 * branch — but the scope has to be the honest one, because the tests read a
 * plan's steps back through it.
 */
const REMOTE_SESSION_STEP = {
  key: "remoteSession",
  scope: "ownDevice",
} as const satisfies TopicPrepStepShape;

// The topics that carry a prep block, derived from the map the same way
// `TopicWithInfoCard` is — so adding or removing one `prep` is the whole edit.
// This is the type the guide's per-topic message keys are resolved against.
export type TopicWithPrep = {
  [K in ProductTopic]: (typeof PRODUCT_TOPICS)[K] extends { prep: unknown }
    ? K
    : never;
}[ProductTopic];

// The topics carrying a second, accounts-only intro — the ones that declare
// `accountsOnlyIntro`. Narrower than `TopicWithPrep` on purpose: only these
// have a key under `topicPrep.accountsOnlyIntro`, and typing the plan's topic
// as the wider union would ask the catalog for keys that are deliberately
// absent.
export type TopicWithAccountsOnlyIntro = {
  [K in TopicWithPrep]: (typeof PRODUCT_TOPICS)[K]["prep"] extends {
    accountsOnlyIntro: true;
  }
    ? K
    : never;
}[TopicWithPrep];

// One declared step, read back off the const map so its literal key survives.
// The literals are the point: a composed message key built from a `string`
// would be `steps.${string}.title`, which is not a member of the catalog's key
// union and therefore not something the compiler can check. Read through the
// map, it is a union of exactly the keys that exist.
export type TopicPrepStep =
  | (typeof PRODUCT_TOPICS)[TopicWithPrep]["prep"]["steps"][number]
  | typeof REMOTE_SESSION_STEP;

/** Every step key the catalog must hold prose for. */
export type TopicPrepStepKey = TopicPrepStep["key"];

/** Every per-platform note key, across every step that declares any. */
export type TopicPrepPlatformNoteKey = NonNullable<
  Extract<TopicPrepStep, { platformNotes: unknown }>["platformNotes"]
>[number];

/** Every checklist-item key, across every step that declares any. */
export type TopicPrepChecklistKey = NonNullable<
  Extract<TopicPrepStep, { checklist: unknown }>["checklist"]
>[number];

/**
 * What one surface renders: the steps that apply to this product, and which
 * intro they take.
 *
 * The form is a discriminant rather than a boolean because each branch reads a
 * *different message key*, and the type is what stops a renderer asking the
 * catalog for one that does not exist. `full` and `accountsOnly` are keyed by
 * topic and carry the narrowest topic union that has prose; `remoteOnly` is
 * keyed by nothing, because a guide that is only the shared remote-session step
 * has no topic-specific sentence to open with and takes the one generic intro.
 */
export type TopicPrepPlan =
  | {
      form: "full";
      topic: TopicWithPrep;
      steps: readonly TopicPrepStep[];
    }
  | {
      form: "accountsOnly";
      topic: TopicWithAccountsOnlyIntro;
      steps: readonly TopicPrepStep[];
    }
  | {
      /** A label-only topic on a remote product: the shared step, alone. */
      form: "remoteOnly";
      steps: readonly TopicPrepStep[];
    };

/**
 * Whether a topic brought a guide of its own — the twin of `topicHasInfoCard`,
 * and asked for the same reason: a `prep !== undefined` check repeated per
 * surface would drift.
 *
 * It is **not** the render condition on its own any more — a remote product
 * with no topic steps still renders the shared one — so a surface asks
 * `resolveTopicPrep`, and this predicate answers only the narrower question of
 * whether the topic brought steps and prose of its own.
 *
 * A type predicate rather than a boolean, so a caller's topic narrows to the
 * union the catalog actually has prose for. The lookup widens to `TopicMeta`
 * deliberately, exactly as the info predicate does: the const map's literal
 * member types would answer the question at compile time and fold the runtime
 * check away.
 */
export function topicHasPrep(topic: ProductTopic): topic is TopicWithPrep {
  const meta: TopicMeta = PRODUCT_TOPICS[topic];
  return meta.prep !== undefined;
}

/** Whether a prep-bearing topic carries the second, accounts-only intro. */
function topicHasAccountsOnlyIntro(
  topic: TopicWithPrep,
): topic is TopicWithAccountsOnlyIntro {
  const meta: TopicMeta = PRODUCT_TOPICS[topic];
  return meta.prep?.accountsOnlyIntro === true;
}

/**
 * The whole render decision for one product: which steps apply, which intro
 * they take, and — as `null` — whether anything applies at all.
 *
 * `null` covers both ways a surface ends up with nothing to draw, because a
 * caller cannot usefully tell them apart: the topic has no guide, or every one
 * of its steps belongs to a device School of Gaming is supplying. Minecraft
 * Education in person is the second case, and it is why the answer is a
 * predicate over the *filtered* steps rather than over `prep` alone.
 *
 * **Both ways are now in-person answers.** Every remote product has at least
 * the shared remote-session step, so `null` on a remote product is unreachable
 * — which is the whole change a label-only topic sees: it drew no guide, and
 * now it draws a one-step one.
 */
export function resolveTopicPrep(
  topic: ProductTopic,
  isRemote: boolean,
): TopicPrepPlan | null {
  // A topic with no steps of its own still has the shared one, on a remote
  // product: the room is browser-based and the mic has to work. In person it
  // has nothing, which is the answer it has always given.
  if (!topicHasPrep(topic)) {
    return isRemote ? { form: "remoteOnly", steps: [REMOTE_SESSION_STEP] } : null;
  }

  // Read through the const map rather than the declared shape, so the step
  // keys stay the literals the message catalog is checked against.
  const declared: readonly TopicPrepStep[] = PRODUCT_TOPICS[topic].prep.steps;
  const applicable = isRemote
    ? declared
    : declared.filter((step) => step.scope === "always");

  if (applicable.length === 0) return null;

  // The shared step goes last, after everything the topic itself asked for: it
  // is the one thing to do once the game is installed and signed into.
  const steps = isRemote ? [...applicable, REMOTE_SESSION_STEP] : applicable;

  if (applicable.length === declared.length) {
    return { form: "full", topic, steps };
  }

  // Something was filtered out, so the guide is the accounts-only form — which
  // only a topic declaring the second intro can be in. A topic that filters
  // without declaring one is a registry mistake, and rendering the full intro
  // over a shortened guide is the smaller of the two wrongs available here.
  return topicHasAccountsOnlyIntro(topic)
    ? { form: "accountsOnly", topic, steps }
    : { form: "full", topic, steps };
}

// Which game identity a product's surfaces are about — the first of the
// per-topic config this map's header anticipated, and the one thing that
// decides whether a roster, a chip or a product page shows a game username at
// all. `null` is a real answer and the common one: most topics are about no
// single account a child holds.
//
// Only two topics map to a platform, and the omissions are the deliberate part:
//
//   - `minecraft_bedrock` and `minecraft_education` map to NOTHING, even though
//     they are Minecraft. Our `minecraft_accounts` row is a Java/Mojang
//     identity — the username rule is Mojang's and the lookup that verifies it
//     is Mojang's — and neither of those editions has a Mojang account behind
//     it (Bedrock signs in with a Microsoft/Xbox gamertag, Education with a
//     school tenant). Showing a Java handle on a Bedrock club would be
//     asserting an identity we did not check and the child may not have.
//   - `esports`, `creator_studio`, `game_studio`, `programming` and `ai` name
//     subject matter rather than one piece of software, so there is nothing
//     single to hold an account on; `fortnite`, `rocket_league` and
//     `pokemon_go` are real games we simply store no identity for.
//
// A `switch` with no `default`, so adding an enum value fails to compile here
// (the function would fall off its end and return `undefined`, which the
// declared return type forbids) rather than silently joining the null side.
//
// The return type is the shared platform union rather than a locally-spelled
// one: it lives in `@/lib/constants/game-platforms`, which is the module the
// wire schemas and the UI descriptor registry both key off, so this cannot
// drift from what a caller can actually render.
export function platformForTopic(topic: ProductTopic): GamePlatform | null {
  switch (topic) {
    case "minecraft_java":
      return "minecraft";
    case "roblox_studio":
      return "roblox";
    case "minecraft_education":
    case "minecraft_bedrock":
    case "fortnite":
    case "rocket_league":
    case "pokemon_go":
    case "esports":
    case "creator_studio":
    case "game_studio":
    case "programming":
    case "ai":
      return null;
  }
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
