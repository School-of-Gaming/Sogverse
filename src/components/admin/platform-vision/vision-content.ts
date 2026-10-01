import type { YtyElementId } from "@/lib/constants/yty";

/**
 * Every word on the platform vision page (`/admin/platform-vision`).
 *
 * **English only — a declared exception to the every-locale rule.** This is an
 * admin-only page about where Sogverse is going, read by School of Gaming's own
 * staff and rewritten whenever the dream moves; four translations of it would be
 * four copies drifting behind the English with nobody reading them. So the copy
 * is typed constants beside the component, not keys in `messages/`. The page's
 * chrome is not part of the exception: its `<title>` and sidebar label are
 * translated like every other admin page's.
 *
 * The page is a vision board, not the plan: the minimum words that carry the
 * dream, with the detail left to the document the team already has. It states
 * no dates and no quarters; where order matters it is the order of priority.
 */

/**
 * The day the content last changed, as a bare calendar date (UTC-pinned).
 * Bump it whenever any copy in this file changes.
 */
export const VISION_LAST_UPDATED = "2026-10-01";

/** A titled idea: what it is called, and one short line about it. */
export interface VisionIdea {
  readonly title: string;
  readonly body: string;
}

export const VISION_HERO = {
  eyebrow: "The big picture",
  title: "The platform's vision",
  lead: "Not just a place to run clubs: a living world where every session a gamer plays becomes growth you can see.",
  lastUpdatedLabel: "Last updated",
  artTitle: "The gamer profile, circled by the Four Yty-Elements",
} as const;

export const VISION_THREAD = {
  eyebrow: "The heart",
  heading: "One profile at the centre of everything",
  body: "The gamer profile is the single source of truth. Everything else plugs into it.",
  writesInLabel: "Writes in",
  writesIn: ["Clubs", "Parents", "The community"],
  readsOutLabel: "Reads out",
  readsOut: ["The avatar", "Achievement Badges", "What gamers earn", "Growth parents can see"],
  principlesLabel: "Never traded away",
  principles: [
    {
      title: "Game-agnostic",
      body: "A new game is a new club, never a new platform.",
    },
    {
      title: "Playful Learning Method",
      body: "PLM, our method for learning through play. Every Quest counts towards something.",
    },
    {
      title: "Safety first",
      body: "Nothing ships that puts a gamer at risk.",
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
  intro: "Four links. Once they join up, every session in every club grows a gamer's profile on its own.",
  artTitle: "The loop: lore, story generator, PLM engine, gamer profile, and back to lore",
  steps: [
    { tone: "world", title: "Lore", body: "One storyline, one cast, one storyteller." },
    { tone: "valor", title: "Story generator", body: "Spins Quests that fit each club's own world." },
    { tone: "wit", title: "PLM engine", body: "Ties every Quest to the method, so it counts." },
    { tone: "glow", title: "Gamer profile", body: "Scores the growth, and writes the next chapter." },
  ] satisfies readonly LoopStep[],
  rules: {
    title: "Rules come first",
    body: "How Yty-Points are earned and Achievement Badges unlock. Loose at first, but they have to exist.",
  },
} as const;

export const VISION_YTY = {
  eyebrow: "Our values, made playable",
  heading: "The Four Yty-Elements",
  intro: "Scouting made values a hobby: grow, earn the badge, wear it with pride. We do the same.",
  /** What each element grows, beside the canonical definition in the Yty constants. */
  grows: {
    harmony: "Balance, calm and rest.",
    glow: "Empathy, kindness and belonging.",
    valor: "Teamwork and civic courage.",
    wit: "Critical thinking and media literacy.",
  } satisfies Record<YtyElementId, string>,
  wit: {
    title: "Wit is the new survival skill",
    body: "The scouts had the forest. Gamers have the online world.",
    slogan: "Scouts of the Online Age",
  },
} as const;

export const VISION_AVATAR = {
  eyebrow: "The avatar",
  heading: "Everyone starts the same. Nobody ends up the same.",
  body: "An avatar grows with the elements its gamer grows.",
  artTitle: "One starting avatar growing into four: Harmony, Glow, Valor and Wit",
} as const;

export const VISION_GEDUS = {
  eyebrow: "Gedus as entrepreneurs",
  heading: "A livelihood, not a side hustle",
  intro: "Certified Gedus build clubs of their own, level up their profile, and make a full living.",
  artTitle: "Three rising steps: a Gedu alone, a Gedu sharing a club, a Gedu leading a team",
  stages: [
    { title: "Start something of your own", body: "Any game, online or on site, with a share of what it earns." },
    { title: "Share what works", body: "Other Gedus run your club, and you earn every time." },
    { title: "Build a team", body: "A club takes off, and you hire the Gedus to run it." },
  ] satisfies readonly VisionIdea[],
  stageLabel: "Stage",
} as const;

export const VISION_COMMUNITY = {
  eyebrow: "Gamer community",
  heading: "Belonging, safe by design",
  intro: "Gamers start things together, and that grows the profile too.",
  ideas: [
    { title: "No direct messages", body: "Friendship happens through clubs and shared activities." },
    { title: "GamerPal", body: "Gaming friends, matched safely and approved by a parent." },
    { title: "Clans and rankings", body: "Celebrating progress, never shaming." },
    { title: "Giving back", body: "Gamers share what they earn so more children can join." },
  ] satisfies readonly VisionIdea[],
} as const;

export const VISION_PARENTS = {
  eyebrow: "Parents as partners",
  heading: "Parents are our eyes in real life",
  ideas: [
    { title: "Credit for real life", body: "Homework, helping at home, being a good sibling: it all counts." },
    { title: "Growth they can see", body: "Learning outcomes, shown over time." },
    { title: "A community of their own", body: "Webinars and help with gaming at home." },
  ] satisfies readonly VisionIdea[],
} as const;

export const VISION_GAMES = {
  eyebrow: "Product lines",
  heading: "Many games, one method",
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
    { tone: "world", icon: "website", title: "Sogverse is the website", body: "sog.gg lives on the platform." },
    { tone: "harmony", icon: "birthday", title: "Birthday parties", body: "Booked online, with a birthday badge." },
    { tone: "act", icon: "merch", title: "Merch with meaning", body: "A real patch for the digital one you earned." },
    { tone: "wit", icon: "bots", title: "Help bots", body: "For Gedus, parents and gamers alike." },
    { tone: "valor", icon: "webinars", title: "Webinars and tournaments", body: "For parents and the community." },
    { tone: "glow", icon: "wellbeing", title: "Wellbeing tools", body: "Gamer Gym, and a button for a break." },
    { tone: "act", icon: "shop", title: "Shop essentials", body: "Gift cards, referrals and bring-a-friend." },
    { tone: "wit", icon: "international", title: "Ready for the world", body: "More languages, more countries." },
  ] satisfies readonly WallIdea[],
} as const;

export const VISION_FOUNDATION = {
  eyebrow: "Where we stand",
  heading: "None of this starts from zero",
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
  body: "Growth a child can see, a parent can trust and a Gedu can build a life around.",
} as const;
