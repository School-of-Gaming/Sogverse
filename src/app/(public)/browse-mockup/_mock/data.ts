// UI-only mockup data for the parent product-discovery flow.
// No DB, no API. Edit freely during product-team review.
//
// Mirrors docs/products-redesign.md §7:
//  - Four product types shown on one unified browse page.
//  - Parents filter by age, language, type, online/in-person, topic.
//  - Card shows a derived "seat state" so parents can scan quickly.
//  - No cohort picker; cohort subdivision (groups) is an admin concern.

export type ProductType =
  | "consumer-club"
  | "municipality-club"
  | "camp"
  | "event";

export type Language = "fi" | "en" | "sv";

export type PriceInfo =
  | { mode: "per_session"; tokens: number }
  | { mode: "upfront"; tokens: number }
  | { mode: "free" }
  | { mode: "external_contract" };

export type Topic = {
  id: string;
  name: string;
  kind: "game" | "subject";
  blurb: string; // one-liner parent-friendly description
};

export type Tag = {
  id: string;
  name: string;
  description: string;
};

export type Product = {
  id: string;
  slug: string;
  type: ProductType;
  name: string;
  tagline: string;
  description: string;
  topicIds: string[];
  tagIds: string[];
  languages: Language[];
  minAge: number;
  maxAge: number;
  isOnline: boolean;
  // Human label: "Online", "Ressun peruskoulu, Helsinki", "Sogverse HQ".
  locationLabel: string;
  // One-line schedule summary for cards.
  scheduleSummary: string;
  // Multi-line detail — days + times + any notes.
  scheduleDetail: string[];
  dateRange?: string;
  price: PriceInfo;
  seatCount: number | null;
  seatsTaken: number;
  waitlistCount: number;
  // Offset from module-load time (ms); undefined = always open; positive =
  // still in the future; negative = already open. Same pattern as the
  // registration mock's countdown so the demo timer is stable per page load.
  registrationOpensOffsetMs?: number;
  status: "running" | "pending" | "completed";
  // Present when threshold-triggered start applies (§4.11).
  signupThreshold?: number;
  primaryGeduName: string;
  primaryGeduBio: string;
};

// ---------- Topics, tags ----------

export const TOPICS: Topic[] = [
  { id: "t-minecraft", name: "Minecraft", kind: "game", blurb: "Building, exploring, and playing together." },
  { id: "t-roblox", name: "Roblox", kind: "game", blurb: "A platform of thousands of kid-made games." },
  { id: "t-fortnite", name: "Fortnite", kind: "game", blurb: "Team-based action and strategy." },
  { id: "t-pokemon-go", name: "Pokémon GO", kind: "game", blurb: "Played outdoors on a phone." },
  { id: "t-valorant", name: "Valorant", kind: "game", blurb: "Tactical team shooter. Usually 13+." },
  { id: "t-smash", name: "Super Smash Bros.", kind: "game", blurb: "Party fighting game — great for groups." },
  { id: "t-game-design", name: "Game design", kind: "subject", blurb: "How games get made — build your own." },
  { id: "t-online-safety", name: "Online safety", kind: "subject", blurb: "Staying safe and kind online." },
  { id: "t-esports", name: "Esports basics", kind: "subject", blurb: "How competitive gaming actually works." },
  { id: "t-coding", name: "Coding for gamers", kind: "subject", blurb: "Scratch, Roblox, and real programming basics." },
];

export const TAGS: Tag[] = [
  { id: "tag-chill", name: "Chill", description: "Relaxed pace, no pressure." },
  { id: "tag-competitive", name: "Competitive", description: "For kids who like to improve and compete." },
  { id: "tag-beginner", name: "Beginner friendly", description: "Totally fine to have never played before." },
  { id: "tag-advanced", name: "Advanced", description: "Best for kids who already play regularly." },
  { id: "tag-nd", name: "Neurodiversity friendly", description: "Pacing and structure tuned for neurodiverse kids." },
  { id: "tag-girls", name: "Girls' club", description: "A girls-only space." },
  { id: "tag-creative", name: "Creative", description: "Building, designing, storytelling." },
  { id: "tag-teams", name: "Team play", description: "Working together with others." },
];

export function getTopic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

export function getTag(id: string): Tag | undefined {
  return TAGS.find((t) => t.id === id);
}

// ---------- Products ----------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const MODULE_LOAD_TIME =
  typeof window !== "undefined" ? Date.now() : 0;

export const PRODUCTS: Product[] = [
  // ---------- Consumer clubs (per-session, online) ----------
  {
    id: "mc-redstone",
    slug: "minecraft-redstone",
    type: "consumer-club",
    name: "Minecraft Redstone",
    tagline: "Logic, wiring, and automation inside Minecraft.",
    description:
      "We build little machines together — doors that open on command, traps, sorting systems, small factories. A playful way to learn how circuits actually think.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-creative", "tag-teams"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Tuesdays · 15:30–17:00",
    scheduleDetail: ["Every Tuesday 15:30–17:00", "Ongoing — join any time"],
    price: { mode: "per_session", tokens: 8 },
    seatCount: 10,
    seatsTaken: 6,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Mikko Virtanen",
    primaryGeduBio: "Minecraft pedagogy, 6 years with kids' clubs.",
  },
  {
    id: "roblox-builders",
    slug: "roblox-builders",
    type: "consumer-club",
    name: "Roblox Builders",
    tagline: "Design and publish your own Roblox game.",
    description:
      "Kids design their own Roblox game over the term — worlds, simple scripts, maybe even a soft launch. Great for creative kids who like making things.",
    topicIds: ["t-roblox", "t-game-design", "t-coding"],
    tagIds: ["tag-creative", "tag-beginner"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Wednesdays · 16:00–17:30",
    scheduleDetail: ["Every Wednesday 16:00–17:30", "Ongoing — join any time"],
    price: { mode: "per_session", tokens: 8 },
    seatCount: 12,
    seatsTaken: 9,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Anna Korhonen",
    primaryGeduBio: "Creative coder and Roblox studio lead.",
  },
  {
    id: "fortnite-strategy",
    slug: "fortnite-strategy",
    type: "consumer-club",
    name: "Fortnite Strategy",
    tagline: "Team play, tactics, and post-match review.",
    description:
      "For older kids who already play and want to get better as a team. We focus on communication, positioning, and reading the match — not just aim.",
    topicIds: ["t-fortnite", "t-esports"],
    tagIds: ["tag-competitive", "tag-teams", "tag-advanced"],
    languages: ["en"],
    minAge: 11,
    maxAge: 15,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Mondays · 17:00–18:30",
    scheduleDetail: ["Every Monday 17:00–18:30", "Ongoing — join any time"],
    price: { mode: "per_session", tokens: 10 },
    seatCount: 10,
    seatsTaken: 9,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Ben Carter",
    primaryGeduBio: "English-language host, esports coach.",
  },
  {
    id: "mc-creative-sat",
    slug: "minecraft-creative-saturday",
    type: "consumer-club",
    name: "Minecraft Creative · Saturdays",
    tagline: "Chill Saturday mornings for younger builders.",
    description:
      "A cozy Saturday-morning club for younger kids who like to build and explore. No competition, no pressure. We're still gathering enough kids to get going — the club will start once 8 sign up.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-chill", "tag-creative", "tag-beginner", "tag-nd"],
    languages: ["fi"],
    minAge: 7,
    maxAge: 10,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Saturdays · 10:00–11:30",
    scheduleDetail: ["Every Saturday 10:00–11:30", "Starts once 8 kids have signed up"],
    price: { mode: "per_session", tokens: 8 },
    seatCount: 14,
    seatsTaken: 4,
    waitlistCount: 0,
    status: "pending",
    signupThreshold: 8,
    primaryGeduName: "Sofia Rautio",
    primaryGeduBio: "Younger gamers, chill vibes.",
  },
  {
    id: "coding-scratch-roblox",
    slug: "coding-for-gamers",
    type: "consumer-club",
    name: "Coding for Gamers",
    tagline: "Real coding basics, through games kids already love.",
    description:
      "We start with Scratch and move into Roblox scripting over the term. Best for kids who want to understand how games actually work under the hood.",
    topicIds: ["t-coding", "t-roblox", "t-game-design"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["en"],
    minAge: 9,
    maxAge: 12,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Thursdays · 16:00–17:30",
    scheduleDetail: ["Every Thursday 16:00–17:30", "Ongoing — join any time"],
    price: { mode: "per_session", tokens: 10 },
    seatCount: 10,
    seatsTaken: 3,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Noora Hakala",
    primaryGeduBio: "Coding for gamers — Scratch + Roblox.",
  },
  {
    id: "pokemon-walks",
    slug: "pokemon-go-walks",
    type: "consumer-club",
    name: "Pokémon GO · Weekend Walks",
    tagline: "Get outside and play with other families.",
    description:
      "A low-key weekend walking group that plays Pokémon GO together around Helsinki. Parents welcome, and a great excuse to get kids off the sofa and outdoors.",
    topicIds: ["t-pokemon-go"],
    tagIds: ["tag-chill", "tag-beginner"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 14,
    isOnline: false,
    locationLabel: "Helsinki · meeting spot in Esplanadi",
    scheduleSummary: "Saturdays · 13:00–14:30",
    scheduleDetail: [
      "Every Saturday 13:00–14:30",
      "Meet at the Esplanadi fountain. Brings phone + water.",
    ],
    price: { mode: "per_session", tokens: 6 },
    seatCount: 20,
    seatsTaken: 11,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Oskar Manninen",
    primaryGeduBio: "Pokémon GO community lead.",
  },

  // ---------- Municipality clubs (in-person or online, free to parent) ----------
  {
    id: "muni-ressu-mc",
    slug: "ressu-minecraft",
    type: "municipality-club",
    name: "Minecraft · Ressun peruskoulu",
    tagline: "After-school gaming club, paid for by the City of Helsinki.",
    description:
      "A spring-term club at Ressun peruskoulu. Free to families — the City of Helsinki covers the cost. Seats are limited and usually fill fast, so sign up the moment registration opens.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: false,
    locationLabel: "Ressun peruskoulu, Helsinki",
    scheduleSummary: "Wednesdays · 14:30–16:00",
    scheduleDetail: [
      "Every Wednesday 14:30–16:00",
      "Computer room A · check in at the main desk",
      "Spring term · Jan 14 – May 27, 2026",
    ],
    dateRange: "Jan 14 – May 27, 2026",
    price: { mode: "external_contract" },
    seatCount: 14,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 45 * 1000, // ~45s: demo-friendly drop
    status: "running",
    primaryGeduName: "Mikko Virtanen",
    primaryGeduBio: "Minecraft pedagogy, 6 years with kids' clubs.",
  },
  {
    id: "muni-oodi-roblox",
    slug: "oodi-roblox-studio",
    type: "municipality-club",
    name: "Roblox Studio · Oodi library",
    tagline: "A Helsinki-wide after-school club, held at Oodi library.",
    description:
      "Open to any Helsinki kid — no school attachment needed. Hosted in Oodi's Kuutio room. Free to families, funded by the City of Helsinki.",
    topicIds: ["t-roblox", "t-game-design", "t-coding"],
    tagIds: ["tag-creative", "tag-beginner"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: false,
    locationLabel: "Oodi library, Helsinki",
    scheduleSummary: "Tuesdays · 15:30–17:00",
    scheduleDetail: [
      "Every Tuesday 15:30–17:00",
      "3rd floor · Kuutio room",
      "Spring term · Jan 13 – May 26, 2026",
    ],
    dateRange: "Jan 13 – May 26, 2026",
    price: { mode: "external_contract" },
    seatCount: 12,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 3 * DAY,
    status: "running",
    primaryGeduName: "Anna Korhonen",
    primaryGeduBio: "Creative coder and Roblox studio lead.",
  },
  {
    id: "muni-esports-hel-online",
    slug: "helsinki-esports-fundamentals",
    type: "municipality-club",
    name: "Esports Fundamentals · Helsinki",
    tagline: "An online after-school club for Helsinki kids, in English.",
    description:
      "How competitive gaming actually works — teamwork, tactics, review. Held online so kids across Helsinki can join from home. Free to Helsinki families.",
    topicIds: ["t-esports", "t-fortnite"],
    tagIds: ["tag-competitive", "tag-teams"],
    languages: ["en"],
    minAge: 12,
    maxAge: 15,
    isOnline: true,
    locationLabel: "Online · for Helsinki residents",
    scheduleSummary: "Fridays · 16:00–17:30",
    scheduleDetail: [
      "Every Friday 16:00–17:30",
      "Online via Daily.co",
      "Spring term · Jan 16 – May 29, 2026",
    ],
    dateRange: "Jan 16 – May 29, 2026",
    price: { mode: "external_contract" },
    seatCount: 16,
    seatsTaken: 11,
    waitlistCount: 0,
    registrationOpensOffsetMs: -2 * DAY,
    status: "running",
    primaryGeduName: "Daniel Ahonen",
    primaryGeduBio: "English-first esports fundamentals.",
  },

  // ---------- Camps ----------
  {
    id: "camp-mc-helsinki-summer",
    slug: "minecraft-summer-camp-helsinki",
    type: "camp",
    name: "Summer Minecraft Camp",
    tagline: "A full week of Minecraft building at our Helsinki office.",
    description:
      "Five weekdays of intensive Minecraft — worlds, redstone, collaborative builds. Lunch breaks included. Mon–Fri 10:00–15:00, at the Sogverse office. Fully refundable up to a week before start.",
    topicIds: ["t-minecraft", "t-game-design"],
    tagIds: ["tag-creative", "tag-teams"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: false,
    locationLabel: "Sogverse HQ, Helsinki",
    scheduleSummary: "Jun 8–12 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Mon–Fri · June 8 – June 12, 2026",
      "Daily 10:00–15:00 with a lunch break",
      "At Sogverse HQ, Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Jun 8–12, 2026",
    price: { mode: "upfront", tokens: 120 },
    seatCount: 16,
    seatsTaken: 5,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Essi Rantanen",
    primaryGeduBio: "Creative Minecraft worlds.",
  },
  {
    id: "camp-roblox-autumn-espoo",
    slug: "roblox-game-jam-camp",
    type: "camp",
    name: "Roblox Game Jam Camp",
    tagline: "Make a Roblox game in a week, over autumn break.",
    description:
      "A ship-a-game-in-a-week camp for kids who already know Roblox. We end the week with a family showcase. Includes all materials; fully refundable until a week before start.",
    topicIds: ["t-roblox", "t-game-design", "t-coding"],
    tagIds: ["tag-creative", "tag-advanced"],
    languages: ["fi"],
    minAge: 10,
    maxAge: 14,
    isOnline: false,
    locationLabel: "Leppävaaran kirjasto, Espoo",
    scheduleSummary: "Oct 20–24 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Mon–Fri · October 20 – October 24, 2026",
      "Daily 10:00–15:00 (bring lunch)",
      "Meeting room 2B, Leppävaaran kirjasto",
    ],
    dateRange: "Oct 20–24, 2026",
    price: { mode: "upfront", tokens: 90 },
    seatCount: 12,
    seatsTaken: 3,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Aino Peltola",
    primaryGeduBio: "Roblox studio building.",
  },
  {
    id: "camp-en-online-summer",
    slug: "english-gaming-summer-camp",
    type: "camp",
    name: "English Gaming Camp · Online",
    tagline: "A week of gaming in English — from anywhere.",
    description:
      "A fun, low-pressure camp held entirely online in English. Great for kids who want extra English exposure in a natural setting. Afternoons only.",
    topicIds: ["t-minecraft", "t-roblox"],
    tagIds: ["tag-beginner", "tag-chill"],
    languages: ["en"],
    minAge: 9,
    maxAge: 13,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Jul 15–19 · weekdays 14:00–17:00",
    scheduleDetail: [
      "Mon–Fri · July 15 – July 19, 2026",
      "Daily 14:00–17:00 (Helsinki time)",
      "Online via Daily.co",
    ],
    dateRange: "Jul 15–19, 2026",
    price: { mode: "upfront", tokens: 75 },
    seatCount: 20,
    seatsTaken: 18,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Alex Saarinen",
    primaryGeduBio: "English-language all-rounder.",
  },

  // ---------- Events ----------
  {
    id: "event-smash-tournament",
    slug: "smash-bros-tournament",
    type: "event",
    name: "Super Smash Bros. Tournament",
    tagline: "Afternoon tournament for kids and teens.",
    description:
      "Come play Smash Bros. with other kids at our Helsinki office. Bracketed tournament with silly prizes. Beginners welcome — we pair people up by level.",
    topicIds: ["t-smash"],
    tagIds: ["tag-competitive", "tag-beginner", "tag-teams"],
    languages: ["fi", "en"],
    minAge: 10,
    maxAge: 16,
    isOnline: false,
    locationLabel: "Sogverse HQ, Helsinki",
    scheduleSummary: "Sat Jun 14 · 13:00–17:00",
    scheduleDetail: [
      "Saturday, June 14, 2026",
      "13:00–17:00 at Sogverse HQ",
      "Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Jun 14, 2026",
    price: { mode: "free" },
    seatCount: 32,
    seatsTaken: 12,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Tom Lindholm",
    primaryGeduBio: "Super Smash Bros. & party games.",
  },
  {
    id: "event-online-safety",
    slug: "online-safety-parent-workshop",
    type: "event",
    name: "Online Safety · Parent + Kid Workshop",
    tagline: "A two-hour Saturday session you can do together.",
    description:
      "A relaxed Saturday-morning workshop on online safety — what kids actually run into, how to talk about it, and practical habits. Aimed at parent-and-kid pairs.",
    topicIds: ["t-online-safety"],
    tagIds: ["tag-chill", "tag-beginner"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 14,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Sat May 17 · 10:00–12:00",
    scheduleDetail: [
      "Saturday, May 17, 2026",
      "10:00–12:00 (Helsinki time)",
      "Online via Daily.co",
    ],
    dateRange: "May 17, 2026",
    price: { mode: "free" },
    seatCount: null, // unlimited
    seatsTaken: 42,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Eero Aalto",
    primaryGeduBio: "Online safety & digital literacy.",
  },
  {
    id: "event-valorant-demo",
    slug: "valorant-demo-day",
    type: "event",
    name: "Valorant Demo Day",
    tagline: "A Friday-evening taster for older kids.",
    description:
      "Is Valorant right for your teen? A Friday-evening demo session where we play, talk through the game, and show how teams actually communicate. Valorant is rated 13+.",
    topicIds: ["t-valorant", "t-esports"],
    tagIds: ["tag-teams", "tag-competitive"],
    languages: ["en"],
    minAge: 13,
    maxAge: 17,
    isOnline: true,
    locationLabel: "Online",
    scheduleSummary: "Fri Jun 27 · 18:00–20:00",
    scheduleDetail: [
      "Friday, June 27, 2026",
      "18:00–20:00 (Helsinki time)",
      "Online via Daily.co",
    ],
    dateRange: "Jun 27, 2026",
    price: { mode: "upfront", tokens: 10 },
    seatCount: 24,
    seatsTaken: 6,
    waitlistCount: 0,
    registrationOpensOffsetMs: 20 * HOUR,
    status: "running",
    primaryGeduName: "Pekka Heinonen",
    primaryGeduBio: "Competitive Valorant coach.",
  },
];

// ---------- Lookups & derived state ----------

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export type RegistrationStatus =
  | "not_open"
  | "available"
  | "almost_full"
  | "full";

export type ProductRuntimeState = {
  registration: RegistrationStatus;
  opensAt: Date | null;
  isOpen: boolean;
  seatsRemaining: number | null; // null when seatCount is null (unlimited)
};

export function getProductState(
  product: Product,
  now: number,
): ProductRuntimeState {
  const opensAt =
    product.registrationOpensOffsetMs !== undefined
      ? new Date(MODULE_LOAD_TIME + product.registrationOpensOffsetMs)
      : null;
  const isOpen = opensAt === null || now >= opensAt.getTime();

  if (product.seatCount === null) {
    return {
      registration: isOpen ? "available" : "not_open",
      opensAt,
      isOpen,
      seatsRemaining: null,
    };
  }

  const seatsRemaining = Math.max(0, product.seatCount - product.seatsTaken);
  if (!isOpen) {
    return { registration: "not_open", opensAt, isOpen, seatsRemaining };
  }
  if (seatsRemaining <= 0) {
    return { registration: "full", opensAt, isOpen, seatsRemaining };
  }
  const almostFullThreshold = Math.max(1, Math.ceil(product.seatCount * 0.2));
  if (seatsRemaining <= almostFullThreshold) {
    return { registration: "almost_full", opensAt, isOpen, seatsRemaining };
  }
  return { registration: "available", opensAt, isOpen, seatsRemaining };
}

// ---------- Filter helpers ----------

export type Filters = {
  age: number | null;
  languages: Language[]; // empty = any
  types: ProductType[]; // empty = any
  format: "any" | "online" | "in_person";
  topicIds: string[]; // empty = any
};

export const EMPTY_FILTERS: Filters = {
  age: null,
  languages: [],
  types: [],
  format: "any",
  topicIds: [],
};

export function filterProducts(
  products: Product[],
  f: Filters,
): Product[] {
  return products.filter((p) => {
    if (f.age !== null && (f.age < p.minAge || f.age > p.maxAge)) return false;
    if (f.languages.length > 0 && !p.languages.some((l) => f.languages.includes(l)))
      return false;
    if (f.types.length > 0 && !f.types.includes(p.type)) return false;
    if (f.format === "online" && !p.isOnline) return false;
    if (f.format === "in_person" && p.isOnline) return false;
    if (
      f.topicIds.length > 0 &&
      !p.topicIds.some((t) => f.topicIds.includes(t))
    )
      return false;
    return true;
  });
}

// ---------- Product type metadata ----------

export type ProductTypeDef = {
  slug: ProductType;
  name: string; // parent-facing — NOT "consumer club"
  plural: string;
  shortBlurb: string;
};

export const PRODUCT_TYPE_DEFS: ProductTypeDef[] = [
  {
    slug: "consumer-club",
    name: "Club",
    plural: "Clubs",
    shortBlurb: "Weekly, ongoing. Pay per session.",
  },
  {
    slug: "municipality-club",
    name: "School club",
    plural: "School clubs",
    shortBlurb: "After-school, paid for by your municipality. Free to you.",
  },
  {
    slug: "camp",
    name: "Camp",
    plural: "Camps",
    shortBlurb: "A full week (or more) during school breaks.",
  },
  {
    slug: "event",
    name: "One-off event",
    plural: "Events",
    shortBlurb: "A single date — tournament, workshop, or demo.",
  },
];

export function getProductTypeDef(type: ProductType): ProductTypeDef {
  return PRODUCT_TYPE_DEFS.find((d) => d.slug === type)!;
}

// ---------- Misc display helpers ----------

export function priceLabel(price: PriceInfo): string {
  switch (price.mode) {
    case "free":
      return "Free";
    case "external_contract":
      return "Free to you · paid by municipality";
    case "per_session":
      return `${price.tokens} Sorg / session`;
    case "upfront":
      return `${price.tokens} Sorg · one-time`;
  }
}

export const LANGUAGE_NAMES: Record<Language, string> = {
  fi: "Finnish",
  en: "English",
  sv: "Swedish",
};

export const LANGUAGE_ORDER: Language[] = ["fi", "en", "sv"];
