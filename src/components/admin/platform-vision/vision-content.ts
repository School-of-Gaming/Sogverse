import type { YtyElementId } from "@/lib/constants/yty";

/**
 * Every word on the platform vision page (`/admin/platform-vision`).
 *
 * **English only — a declared exception to the every-locale rule.** This is an
 * admin-only page of long prose about where Sogverse is going: it is read by
 * School of Gaming's own staff, it changes whenever the dream does, and four
 * thin translations of a moving vision would be four copies drifting behind the
 * English with nobody reading them. So the copy is typed constants beside the
 * component that renders it, not keys in `messages/`, and there is nothing for
 * the translation gate to hold in parity. The page's chrome is not part of the
 * exception: its `<title>` and its sidebar label are translated like every other
 * admin page's, because they sit in lists beside translated neighbours.
 *
 * The page states no dates and no quarters. Where order matters it is the order
 * of dependency — what has to exist before what — because revenue sets the pace
 * and a date on a vision board is a promise nobody made.
 */

/** A titled idea: what it is called, and one or two sentences about it. */
export interface VisionIdea {
  readonly title: string;
  readonly body: string;
}

export const VISION_HERO = {
  eyebrow: "Platform vision",
  title: "The dream, drawn big",
  lead: "Sogverse is growing into far more than a place to run clubs. It is becoming a living world where every session a gamer plays turns into real, visible growth, where parents get to see it happen, and where a great Gedu can build a whole livelihood. This is the big picture: the ideas, the hopes and the order we chase them in.",
  statementLabel: "The vision, in one line",
  statement: "Where Screen Time Becomes Quality Time.",
  artTitle: "The gamer profile at the centre, circled by the Four Yty-Elements",
} as const;

export const VISION_THREAD = {
  eyebrow: "The thread",
  heading: "One profile at the heart of everything",
  body: "The gamer profile is the single source of truth. The story generator writes progress into it, the avatar reads progress out of it, parents add to it, community activity feeds it, and badges and the currency hang off it. The Gedu profile works the same way for the people who lead. Build both as the core and every idea on this page has somewhere to plug in.",
  writesInLabel: "Writes in",
  writesIn: [
    "Clubs, through the story generator",
    "Parents, from real life",
    "The gamer community",
  ],
  readsOutLabel: "Reads out",
  readsOut: [
    "The avatar",
    "Achievement Badges",
    "What gamers earn",
    "Learning outcomes for parents",
  ],
  principlesLabel: "Three things we never trade away",
  principles: [
    {
      title: "Game-agnostic",
      body: "Any game, any product line, no special cases. A new title is a new club, not a new platform.",
    },
    {
      title: "PLM-based",
      body: "Every Quest and challenge is tied to the method, so everything a gamer does counts towards something.",
    },
    {
      title: "Safety first",
      body: "Gamers find each other through clubs and shared activities, never through direct messages, and nothing ships that creates a safety hazard.",
    },
  ] satisfies readonly VisionIdea[],
} as const;

/** One link in the loop, with the Yty family or brand hue its station is drawn in. */
export interface LoopStep extends VisionIdea {
  readonly tone: "world" | "valor" | "wit" | "glow";
}

export const VISION_LOOP = {
  eyebrow: "Priority one",
  heading: "Close the loop",
  intro: "The biggest build ahead is a chain of four links. Once it closes, any session in any club builds a real gamer profile on its own, with no Gedu scripting content or logging progress by hand.",
  artTitle:
    "The loop: lore feeds the story generator, the story generator feeds the PLM engine, the PLM engine feeds the gamer profile, and the profile feeds the next chapter of the lore",
  steps: [
    {
      tone: "world",
      title: "Lore",
      body: "The top-level storyline and its cast of characters. One storyteller holds all the strings.",
    },
    {
      tone: "valor",
      title: "Story generator",
      body: "Works both ways: it takes the main storyline, remembers what each club and its Gedu built on their own server, and spins matching challenges, Quests and stories for that club.",
    },
    {
      tone: "wit",
      title: "PLM engine",
      body: "Every Quest and challenge the generator produces is linked to the PLM framework, so completing it counts.",
    },
    {
      tone: "glow",
      title: "Gamer profile",
      body: "Progress lands here, scored against the Four Yty-Elements, and becomes the next chapter of the story.",
    },
  ] satisfies readonly LoopStep[],
  rules: {
    title: "First, the rules of the game",
    body: "The loop runs on rules, so they come before everything else: how Yty-Points are earned, how they spread across the four elements, how Achievement Badges level up and unlock, and how what gamers earn ties in. The first version can be loose. It has to exist, and it has to be adjustable.",
  },
} as const;

export const VISION_YTY = {
  eyebrow: "Our values, made playable",
  heading: "The Four Yty-Elements",
  intro: "Scouting proved long ago that values can be a hobby: you grow, you earn the badge, you wear it with pride. Harmony, Glow and Valor carry that tradition, and its badge structure is our template. Wit is the element we added.",
  /** What each element grows, beside the canonical definition in the Yty constants. */
  grows: {
    harmony: "Balance, emotional control and rest.",
    glow: "Empathy, kindness and belonging.",
    valor: "Teamwork, innovation and civic courage.",
    wit: "Critical thinking and media literacy.",
  } satisfies Record<YtyElementId, string>,
  wit: {
    title: "Wit is the new survival skill",
    body: "For scouts, the forest was where you learned to survive. For today's gamers it is the online world: technology, media and games. Wit's badges are designed from scratch, because nobody has drawn them before.",
    slogan: "Scouts of the Online Age",
  },
} as const;

export const VISION_AVATAR = {
  eyebrow: "The avatar",
  heading: "Everyone starts the same. Nobody ends up the same.",
  body: "A gamer's avatar begins almost identical to everyone else's, then grows in its own direction depending on which elements they develop, collecting patches, gadgets and items from events and activities along the way. The look stays pixel art for now. Underneath, the profile is built for everything the avatar will become, because a data model is cheap to get right early and expensive to rework later.",
  artTitle:
    "One starting avatar branching into four grown avatars: Harmony with a heart patch, Glow with a sprouting leaf, Valor with a cape and shield, and Wit with a visor",
} as const;

export const VISION_GEDUS = {
  eyebrow: "Gedus as entrepreneurs",
  heading: "A livelihood, not a side hustle",
  intro: "In the long run, School of Gaming steps back from being the main maker of clubs on its own platform. A growing crowd of independent, certified Gedus attract their own families, create their own content and build their own products, and can make a full living doing it.",
  artTitle:
    "Three rising steps: a Gedu starting alone, a Gedu sharing their club with another Gedu, and a Gedu leading a team",
  stages: [
    {
      title: "Start something of your own",
      body: "A certified Gedu creates their own club or event, online or on site, in any game: a Pokémon club in their town, an online chess club, anything that follows the PLM method and meets the quality bar. They get their own presence, marketing tools and a revenue share on what they sell.",
    },
    {
      title: "Share what works",
      body: "A Gedu offers their club concept and material to other Gedus to run, and earns a share every time they do.",
    },
    {
      title: "Build a team",
      body: "When a club takes off (a hundred gamers wanting into one club), its Gedu hires Gedus and assistant Gedus to run it with them, and earns a share of the team's earnings.",
    },
  ] satisfies readonly VisionIdea[],
  stageLabel: "Stage",
  foundation:
    "Payouts and roles are shaped today so that a Gedu who earns and leads a team at the same time is possible later without a rebuild.",
  profile: {
    title: "A Gedu profile that levels up",
    body: "Training, experience, events and community all count. Certificates renew on a cycle, especially after time away, and earnings grow with training, experience and feedback from gamers and parents, rewarding the Gedus who stay active.",
  },
  community: {
    title: "A home for Gedus",
    body: "A space on the platform for Gedus to connect, back each other up, share what works and take part in events together.",
  },
} as const;

export const VISION_COMMUNITY = {
  eyebrow: "Gamer community",
  heading: "Belonging, safe by design",
  intro: "Sogverse is a safe, friendly place for young gamers, and belonging is at the heart of it. Gamers get tools to do things together: start something, create an event, organise a tournament. All of it ties into the PLM and the Four Yty-Elements, so time spent with the community builds the profile too.",
  ideas: [
    {
      title: "No direct messaging",
      body: "Gamers never message each other one to one. Friendship happens through clubs and shared activities.",
    },
    {
      title: "GamerPal",
      body: "Helps gamers find gaming friends inside Sogverse: opt-in, approved by a parent, matched by age, interests and Yty profile.",
    },
    {
      title: "Clans, tribes and rankings",
      body: "Club rankings that celebrate progress and never shame, and a home server for every club.",
    },
    {
      title: "Giving back",
      body: "Gamers can donate what they earn so that children from families who cannot afford it can join.",
    },
  ] satisfies readonly VisionIdea[],
} as const;

export const VISION_PARENTS = {
  eyebrow: "Parents as partners",
  heading: "Parents are our eyes in real life",
  intro: "Families are where all new product energy goes, and the parent is who we have the relationship with. Schools can still be a way to reach a family; the family is the customer.",
  ideas: [
    {
      title: "Credit for real-life growth",
      body: "Every so often a parent gives their own gamer credit for growth no server can see: schoolwork, friendships, tidying their room, helping at home, being a good brother or sister. It feeds the profile the same way parents already give feedback on Gedus.",
    },
    {
      title: "Growth they can see",
      body: "Learning outcomes shown to parents over time, and the evidence School of Gaming shows partners and investors.",
    },
    {
      title: "A community of their own",
      body: "Webinars, help forums and support with gaming at home when it is needed, built around their child's hobby.",
    },
  ] satisfies readonly VisionIdea[],
} as const;

export const VISION_GAMES = {
  eyebrow: "Product lines",
  heading: "Many games, one method",
  intro: "Games are dimensions of Sogverse, never the definition of it. The platform carries any number of product lines and titles side by side, with no special cases.",
  lines: [
    "Free trial sessions",
    "Learning English with Minecraft",
    "Neuroinclusive clubs",
    "Roblox game creation",
    "The 3E esports method",
    "A supervised survival server",
    "Fortnite",
    "Chess",
    "RPGs",
  ],
} as const;

/** An idea on the wall, with the Yty family or brand hue its tile is edged in. */
export interface WallIdea extends VisionIdea {
  readonly tone: "act" | "world" | "harmony" | "glow" | "valor" | "wit";
  readonly icon:
    | "website"
    | "merch"
    | "birthday"
    | "bots"
    | "webinars"
    | "wellbeing"
    | "shop"
    | "international";
}

export const VISION_WALL = {
  eyebrow: "More to dream about",
  heading: "Ideas pinned to the wall",
  ideas: [
    {
      tone: "world",
      icon: "website",
      title: "Sogverse is the website",
      body: "sog.gg lives on the platform, and every weekly message a Gedu sends parents carries the latest Library post and upcoming events.",
    },
    {
      tone: "harmony",
      icon: "birthday",
      title: "Birthday parties",
      body: "Booked online, run by a Gedu online or at our own space, with a birthday badge for the birthday gamer.",
    },
    {
      tone: "act",
      icon: "merch",
      title: "Merch with meaning",
      body: "School of Gaming merch, including a physical patch to match the digital one a gamer earned.",
    },
    {
      tone: "wit",
      icon: "bots",
      title: "Help bots",
      body: "A Gedu bot, a parent bot and a gamer bot, all answering from one knowledge base, with ticketing behind them.",
    },
    {
      tone: "valor",
      icon: "webinars",
      title: "Webinars and tournaments",
      body: "Online safety talks for parents and community tournaments, running on the event product we already have.",
    },
    {
      tone: "glow",
      icon: "wellbeing",
      title: "Wellbeing tools",
      body: "Gamer Gym for physical and mental wellbeing, and a tool that calls an activity pause.",
    },
    {
      tone: "act",
      icon: "shop",
      title: "Shop essentials",
      body: "Gift cards, referrals, affiliates and bring-a-friend: everything a family expects from a shop.",
    },
    {
      tone: "wit",
      icon: "international",
      title: "Ready for the world",
      body: "More languages beyond Finnish, Swedish, English and French, and country views for a country manager running each market.",
    },
  ] satisfies readonly WallIdea[],
} as const;

export const VISION_PATH = {
  eyebrow: "How we get there",
  heading: "Ordered by what each step unlocks",
  intro: "Sell first, then build the fancy features. Each stage funds the next, and nothing built today may block what comes after it.",
  steps: [
    {
      title: "Settle the game mechanism",
      body: "Yty-Points, elements, Achievement Badges and earnings. Without rules there is nothing to score.",
    },
    {
      title: "Close the loop",
      body: "Lore, story generator, PLM engine and gamer profile working as one chain.",
    },
    {
      title: "Build the profile for the future",
      body: "A data model ready for the growing avatar, its patches and its gadgets.",
    },
    {
      title: "Hang everything off the profile",
      body: "The full avatar, parents as partners, the community, the Gedu profile and the marketplace, stage one, then two, then three.",
    },
  ] satisfies readonly VisionIdea[],
} as const;

export const VISION_FOUNDATION = {
  eyebrow: "Where we stand",
  heading: "The foundation is real",
  body: "None of this starts from zero. Gedus already run their work on Sogverse, from sessions to invoicing and substitutions, across a full ladder from trainee to assistant to Gedu. Municipality invoicing runs here. The shop sells clubs, camps and events across games, partner pages are live, and the Library is published on the platform.",
  facts: [
    "Gedu work and invoicing",
    "Substitutions",
    "Municipality invoicing",
    "Clubs, camps and events",
    "Partner pages",
    "The Library",
  ],
} as const;

export const VISION_CLOSING = {
  heading: "Every session counts",
  body: "That is the dream: a world where what a child does in a club becomes growth they can see, a parent can trust and a Gedu can build a life around.",
} as const;
