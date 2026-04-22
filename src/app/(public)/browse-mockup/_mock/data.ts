// UI-only mockup data for the parent-facing discovery + signup flow.
// No DB, no API. Edit freely during product-team review.
//
// Mirrors docs/products-redesign.md §7:
//  - Four product types shown on one unified browse page.
//  - Parents filter by age, language, type, online/in-person, topic.
//  - Card shows a derived seat state so parents can scan quickly.
//  - No cohort picker; cohort subdivision (groups) is an admin concern.
//
// This file also backs the /registration location-first entry point. Both
// /browse-mockup and /registration read from the same product catalog and
// converge at /browse-mockup/[productSlug] for the signup itself.

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
  blurb: string;
};

export type Tag = {
  id: string;
  name: string;
  description: string;
};

export type SkippedSession = {
  date: string; // YYYY-MM-DD
  reason: string;
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
  // The jurisdictional owner for location-first discovery. Can be any level:
  // municipality / site / region. NULL for online-anywhere products that
  // aren't scoped to any location (most consumer clubs, most camps, most
  // events). See docs/products-redesign.md §4.9.
  locationId: string | null;
  // Free-text override when the site name alone isn't specific enough
  // ("Room 204, Tapiolan koulu"). Also used when an online muni club needs
  // a label like "Online · for Helsinki residents".
  venueName?: string;
  // One-line schedule summary for cards.
  scheduleSummary: string;
  // Multi-line detail — days + times + any notes.
  scheduleDetail: string[];
  // Human text for the start / date range, shown on cards and the detail page.
  dateRange?: string;
  // First-session date — powers the post-signup confirmation line
  // "The first session starts <date>." Empty for events (event date is in
  // scheduleSummary itself).
  firstSessionIso?: string;
  // Skipped dates inside the term (bank holidays, school breaks). Mostly
  // relevant for clubs + muni clubs.
  skipped?: SkippedSession[];
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
  assistantGeduName?: string;
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
  { id: "t-mario-kart", name: "Mario Kart", kind: "game", blurb: "Nintendo's racing classic — any age can play." },
  { id: "t-among-us", name: "Among Us", kind: "game", blurb: "Social deduction — find the impostor." },
  { id: "t-splatoon", name: "Splatoon", kind: "game", blurb: "Nintendo's colorful team paint shooter." },
  { id: "t-brawl-stars", name: "Brawl Stars", kind: "game", blurb: "Fast mobile PvP, quick matches." },
  { id: "t-rocket-league", name: "Rocket League", kind: "game", blurb: "Soccer with rocket-powered cars." },
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
  { id: "tag-family", name: "Family friendly", description: "Parents welcome to join." },
];

export function getTopic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

export function getTag(id: string): Tag | undefined {
  return TAGS.find((t) => t.id === id);
}

// ---------- Locations ----------

export type LocationType = "country" | "region" | "municipality" | "site";

export type Location = {
  id: string;
  slug: string;
  name: string;
  type: LocationType;
  parentId: string | null;
  address?: string;
  accessNotes?: string;
  termLabel?: string;
  termStartIso?: string;
  termEndIso?: string;
};

const STANDARD_TERM = {
  termLabel: "Kevätlukukausi 2026 · Spring term 2026",
  termStartIso: "2026-01-12",
  termEndIso: "2026-05-30",
};

export const LOCATIONS: Location[] = [
  { id: "fi", slug: "finland", name: "Finland", type: "country", parentId: null },

  // Regions
  { id: "uusimaa", slug: "uusimaa", name: "Uusimaa", type: "region", parentId: "fi" },
  { id: "pirkanmaa", slug: "pirkanmaa", name: "Pirkanmaa", type: "region", parentId: "fi" },
  { id: "varsinais-suomi", slug: "varsinais-suomi", name: "Varsinais-Suomi", type: "region", parentId: "fi" },
  { id: "pohjois-pohjanmaa", slug: "pohjois-pohjanmaa", name: "Pohjois-Pohjanmaa", type: "region", parentId: "fi" },

  // Uusimaa municipalities
  { id: "espoo", slug: "espoo", name: "Espoo", type: "municipality", parentId: "uusimaa", ...STANDARD_TERM },
  { id: "helsinki", slug: "helsinki", name: "Helsinki", type: "municipality", parentId: "uusimaa", ...STANDARD_TERM },
  { id: "vantaa", slug: "vantaa", name: "Vantaa", type: "municipality", parentId: "uusimaa", ...STANDARD_TERM },

  // Pirkanmaa municipalities
  { id: "tampere", slug: "tampere", name: "Tampere", type: "municipality", parentId: "pirkanmaa", ...STANDARD_TERM },

  // Varsinais-Suomi municipalities
  { id: "turku", slug: "turku", name: "Turku", type: "municipality", parentId: "varsinais-suomi", ...STANDARD_TERM },

  // Pohjois-Pohjanmaa municipalities
  { id: "oulu", slug: "oulu", name: "Oulu", type: "municipality", parentId: "pohjois-pohjanmaa", ...STANDARD_TERM },

  // Espoo sites
  {
    id: "tapiolan-koulu",
    slug: "tapiolan-koulu",
    name: "Tapiolan koulu",
    type: "site",
    parentId: "espoo",
    address: "Opintie 1, 02100 Espoo",
    accessNotes: "Enter via back door on the east side. Gate code 4231.",
  },
  {
    id: "leppavaaran-kirjasto",
    slug: "leppavaaran-kirjasto",
    name: "Leppävaaran kirjasto",
    type: "site",
    parentId: "espoo",
    address: "Leppävaarankatu 9, 02600 Espoo",
    accessNotes: "Meeting room 2B on the second floor. Check in at the main desk.",
  },
  {
    id: "otaniemen-koulu",
    slug: "otaniemen-koulu",
    name: "Otaniemen koulu",
    type: "site",
    parentId: "espoo",
    address: "Otakaari 3, 02150 Espoo",
    accessNotes: "Computer lab · enter from the main entrance.",
  },

  // Helsinki sites
  {
    id: "ressun-peruskoulu",
    slug: "ressun-peruskoulu",
    name: "Ressun peruskoulu",
    type: "site",
    parentId: "helsinki",
    address: "Snellmaninkatu 18, 00170 Helsinki",
    accessNotes: "Computer room A · check in at the main desk on arrival.",
  },
  {
    id: "munkkivuoren-ala-aste",
    slug: "munkkivuoren-ala-aste",
    name: "Munkkivuoren ala-aste",
    type: "site",
    parentId: "helsinki",
    address: "Laajalahdentie 21, 00330 Helsinki",
  },
  {
    id: "oodi",
    slug: "oodi-kirjasto",
    name: "Oodi library",
    type: "site",
    parentId: "helsinki",
    address: "Töölönlahdenkatu 4, 00100 Helsinki",
    accessNotes:
      "3rd floor · Kuutio / The Cube room. Staff unlocks it 15 minutes before start.",
  },
  {
    id: "sogverse-hq",
    slug: "sogverse-hq",
    name: "Sogverse office",
    type: "site",
    parentId: "helsinki",
    address: "Iso Roobertinkatu 1, 00120 Helsinki",
    accessNotes: "Buzz 'Sogverse' at the main door. 4th floor.",
  },
  {
    id: "kallion-kirjasto",
    slug: "kallion-kirjasto",
    name: "Kallion kirjasto",
    type: "site",
    parentId: "helsinki",
    address: "Viides linja 11, 00530 Helsinki",
    accessNotes: "Children's section, 1st floor.",
  },

  // Vantaa sites
  {
    id: "vantaa-paakirjasto",
    slug: "vantaa-paakirjasto",
    name: "Tikkurilan pääkirjasto",
    type: "site",
    parentId: "vantaa",
    address: "Ratatie 11, 01300 Vantaa",
    accessNotes: "2nd floor meeting room.",
  },
  {
    id: "myyrmaen-peruskoulu",
    slug: "myyrmaen-peruskoulu",
    name: "Myyrmäen peruskoulu",
    type: "site",
    parentId: "vantaa",
    address: "Kilterinraitti 6, 01600 Vantaa",
    accessNotes: "Tietokoneluokka · check in at the school office.",
  },

  // Tampere sites
  {
    id: "tampere-metso",
    slug: "tampere-metso",
    name: "Tampereen pääkirjasto Metso",
    type: "site",
    parentId: "tampere",
    address: "Pirkankatu 2, 33230 Tampere",
    accessNotes: "Lasten osasto · check in at the info desk.",
  },

  // Turku sites
  {
    id: "turku-paakirjasto",
    slug: "turku-paakirjasto",
    name: "Turun pääkirjasto",
    type: "site",
    parentId: "turku",
    address: "Linnankatu 2, 20100 Turku",
    accessNotes: "Lasten osasto · info desk on arrival.",
  },

  // Oulu sites
  {
    id: "oulu-paakirjasto",
    slug: "oulu-paakirjasto",
    name: "Oulun pääkirjasto",
    type: "site",
    parentId: "oulu",
    address: "Kaarlenväylä 3, 90100 Oulu",
    accessNotes: "Children's floor · staff point the way.",
  },
];

export function getLocation(idOrSlug: string): Location | undefined {
  const n = idOrSlug.toLowerCase();
  return LOCATIONS.find((l) => l.id === n || l.slug === n);
}

/** Walk from a location up to its root, root → leaf. */
export function getAncestors(locationId: string): Location[] {
  const byId = new Map(LOCATIONS.map((l) => [l.id, l] as const));
  const chain: Location[] = [];
  let current = byId.get(locationId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

function collectDescendantIds(locationId: string): Set<string> {
  const ids = new Set<string>([locationId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const loc of LOCATIONS) {
      if (loc.parentId && ids.has(loc.parentId) && !ids.has(loc.id)) {
        ids.add(loc.id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Products whose `locationId` is at-or-under the given location. Online
 * products with `locationId = null` are *not* returned — they aren't scoped
 * to any particular place. (Online muni clubs scoped to e.g. Helsinki DO
 * return, because their locationId is the municipality.)
 */
export function getProductsForLocation(locationId: string): Product[] {
  const descendants = collectDescendantIds(locationId);
  return PRODUCTS.filter(
    (p) => p.locationId !== null && descendants.has(p.locationId),
  );
}

/**
 * Municipality clubs only, for the location-first /registration entry point.
 * The consumer browse page handles camps, events, and consumer clubs —
 * municipality clubs live in a separate path because they're a fundamentally
 * different product for parents (free, city-funded, residency-restricted).
 */
export function getMunicipalityClubsForLocation(locationId: string): Product[] {
  return getProductsForLocation(locationId).filter(
    (p) => p.type === "municipality-club",
  );
}

// ---------- Products ----------

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const MODULE_LOAD_TIME =
  typeof window !== "undefined" ? Date.now() : 0;

const STANDARD_SKIPS: SkippedSession[] = [
  { date: "2026-02-24", reason: "Talviloma / winter break" },
  { date: "2026-04-07", reason: "Pääsiäisloma / Easter" },
  { date: "2026-05-01", reason: "Vappu" },
];

export const PRODUCTS: Product[] = [
  // ---------- Consumer clubs ----------
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
    locationId: null,
    scheduleSummary: "Tuesdays · 15:30–17:00",
    scheduleDetail: ["Every Tuesday 15:30–17:00", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-13",
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
    locationId: null,
    scheduleSummary: "Wednesdays · 16:00–17:30",
    scheduleDetail: ["Every Wednesday 16:00–17:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-14",
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
    locationId: null,
    scheduleSummary: "Mondays · 17:00–18:30",
    scheduleDetail: ["Every Monday 17:00–18:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-12",
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
    locationId: null,
    scheduleSummary: "Saturdays · 10:00–11:30",
    scheduleDetail: ["Every Saturday 10:00–11:30", "Starts once 8 kids have signed up"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-02-07",
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
    locationId: null,
    scheduleSummary: "Thursdays · 16:00–17:30",
    scheduleDetail: ["Every Thursday 16:00–17:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-15",
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
    locationId: "helsinki",
    venueName: "Meeting at Esplanadi fountain, Helsinki",
    scheduleSummary: "Saturdays · 13:00–14:30",
    scheduleDetail: [
      "Every Saturday 13:00–14:30",
      "Meet at the Esplanadi fountain. Bring a phone + water.",
    ],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-17",
    price: { mode: "per_session", tokens: 6 },
    seatCount: 20,
    seatsTaken: 11,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Oskar Manninen",
    primaryGeduBio: "Pokémon GO community lead.",
  },
  {
    id: "mc-redstone-advanced",
    slug: "minecraft-redstone-advanced",
    type: "consumer-club",
    name: "Minecraft Redstone · Advanced",
    tagline: "Deep-end redstone for kids who already love circuits.",
    description:
      "For kids who've outgrown the basics. Piston machines, silent automation, minor programming. This club is full right now — the waitlist moves a seat every few weeks.",
    topicIds: ["t-minecraft", "t-coding"],
    tagIds: ["tag-advanced", "tag-creative"],
    languages: ["fi"],
    minAge: 11,
    maxAge: 14,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Mondays · 17:30–19:00",
    scheduleDetail: ["Every Monday 17:30–19:00", "Ongoing — waitlist only"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-12",
    price: { mode: "per_session", tokens: 10 },
    seatCount: 10,
    seatsTaken: 10,
    waitlistCount: 4,
    status: "running",
    primaryGeduName: "Ville Nieminen",
    primaryGeduBio: "Minecraft redstone & automation.",
    assistantGeduName: "Juho Laine",
  },
  {
    id: "mc-svenska",
    slug: "minecraft-pa-svenska",
    type: "consumer-club",
    name: "Minecraft på svenska",
    tagline: "Ett avslappnat Minecraft-kerho på svenska.",
    description:
      "Ett avslappnat Minecraft-kerho på svenska. Vi bygger tillsammans och spelar. Perfekt för barn som vill leka på svenska efter skolan.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-chill", "tag-beginner", "tag-creative"],
    languages: ["sv"],
    minAge: 8,
    maxAge: 12,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Wednesdays · 15:30–17:00",
    scheduleDetail: ["Every Wednesday 15:30–17:00", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-14",
    price: { mode: "per_session", tokens: 8 },
    seatCount: 10,
    seatsTaken: 4,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Saga Grönlund",
    primaryGeduBio: "Swedish-speaking club host.",
  },
  {
    id: "mc-survival-beginners",
    slug: "minecraft-survival-beginners",
    type: "consumer-club",
    name: "Minecraft Survival · Beginners",
    tagline: "A gentle intro for younger kids.",
    description:
      "Their first gaming club — we play survival mode together, help each other, and focus on the fun of exploring. Perfect for 6–8 year olds whose parents are dipping a toe into gaming.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-chill", "tag-creative"],
    languages: ["fi"],
    minAge: 6,
    maxAge: 9,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Fridays · 16:30–17:30",
    scheduleDetail: ["Every Friday 16:30–17:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-16",
    price: { mode: "per_session", tokens: 6 },
    seatCount: 8,
    seatsTaken: 5,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Riikka Salminen",
    primaryGeduBio: "Little-gamers specialist.",
  },
  {
    id: "mc-pvp-teens",
    slug: "minecraft-pvp-hunger-games",
    type: "consumer-club",
    name: "Minecraft PvP · Hunger Games",
    tagline: "Bedwars, Hunger Games, SkyWars — minigame night.",
    description:
      "For kids who want the fast stuff. We rotate through popular minigame servers. Sportsmanship rules are strict — mute button ready.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-competitive", "tag-teams", "tag-advanced"],
    languages: ["fi"],
    minAge: 10,
    maxAge: 14,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Fridays · 18:00–19:30",
    scheduleDetail: ["Every Friday 18:00–19:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-16",
    price: { mode: "per_session", tokens: 8 },
    seatCount: 12,
    seatsTaken: 7,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Joonas Tuominen",
    primaryGeduBio: "Minecraft minigames, competitive coach.",
  },
  {
    id: "roblox-obby-academy",
    slug: "roblox-obby-academy",
    type: "consumer-club",
    name: "Roblox Obby Academy",
    tagline: "Play, study, and build obstacle courses.",
    description:
      "We play popular obbys, talk about what makes them fun (or frustrating!), and then build our own each term. Younger Roblox fans love this one.",
    topicIds: ["t-roblox", "t-game-design"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 7,
    maxAge: 11,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Tuesdays · 16:30–17:30",
    scheduleDetail: ["Every Tuesday 16:30–17:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-13",
    price: { mode: "per_session", tokens: 7 },
    seatCount: 12,
    seatsTaken: 10,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Petra Lindström",
    primaryGeduBio: "Roblox obby creator and player.",
  },
  {
    id: "mario-kart-league",
    slug: "mario-kart-racing-league",
    type: "consumer-club",
    name: "Mario Kart Racing League",
    tagline: "Weekly races on Nintendo Switch Online.",
    description:
      "Every Sunday we run a Grand Prix on Switch Online. Trophies, silly trash talk, and a live leaderboard. Needs a Switch + Nintendo Online at home.",
    topicIds: ["t-mario-kart"],
    tagIds: ["tag-competitive", "tag-chill"],
    languages: ["fi", "en"],
    minAge: 8,
    maxAge: 14,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Sundays · 16:00–17:00",
    scheduleDetail: [
      "Every Sunday 16:00–17:00",
      "Requires Switch + Nintendo Online at home",
    ],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-18",
    price: { mode: "per_session", tokens: 6 },
    seatCount: 12,
    seatsTaken: 8,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Markus Hiltunen",
    primaryGeduBio: "Nintendo-first Gedu.",
  },
  {
    id: "among-us-deduction",
    slug: "among-us-deduction-club",
    type: "consumer-club",
    name: "Among Us · Deduction Club",
    tagline: "Quick rounds, lots of laughs, in English.",
    description:
      "Sharp-thinking kids who love mystery stories will enjoy this. We play Among Us rounds and talk deduction — a natural way to practice English conversationally.",
    topicIds: ["t-among-us"],
    tagIds: ["tag-chill", "tag-beginner", "tag-teams"],
    languages: ["en"],
    minAge: 8,
    maxAge: 12,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Thursdays · 17:30–18:30",
    scheduleDetail: ["Every Thursday 17:30–18:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-15",
    price: { mode: "per_session", tokens: 7 },
    seatCount: 10,
    seatsTaken: 4,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Lucy Henderson",
    primaryGeduBio: "English-language host, story-game fan.",
  },
  {
    id: "splatoon-squad",
    slug: "splatoon-squad",
    type: "consumer-club",
    name: "Splatoon Squad",
    tagline: "Team paint battles on Switch.",
    description:
      "Turf War, Salmon Run, and occasional private tournaments. A Switch-only club for kids who love Splatoon's colorful chaos.",
    topicIds: ["t-splatoon"],
    tagIds: ["tag-teams", "tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 14,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Tuesdays · 17:30–19:00",
    scheduleDetail: [
      "Every Tuesday 17:30–19:00",
      "Requires Switch + Nintendo Online at home",
    ],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-13",
    price: { mode: "per_session", tokens: 8 },
    seatCount: 8,
    seatsTaken: 6,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Niina Heikkilä",
    primaryGeduBio: "Nintendo multiplayer specialist.",
  },
  {
    id: "brawl-stars-strategy",
    slug: "brawl-stars-strategy",
    type: "consumer-club",
    name: "Brawl Stars Strategy",
    tagline: "Mobile PvP done right — with coaching.",
    description:
      "Weekly club for dedicated Brawl Stars players. We play together, review match replays, and work on positioning. Usually a fit for kids who already have a few hundred trophies.",
    topicIds: ["t-brawl-stars", "t-esports"],
    tagIds: ["tag-competitive", "tag-teams"],
    languages: ["en"],
    minAge: 10,
    maxAge: 14,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Wednesdays · 17:00–18:00",
    scheduleDetail: [
      "Every Wednesday 17:00–18:00",
      "Mobile only — phone or tablet",
    ],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-14",
    price: { mode: "per_session", tokens: 8 },
    seatCount: 12,
    seatsTaken: 11,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Samir Karim",
    primaryGeduBio: "Mobile esports coach.",
  },
  {
    id: "little-gamers",
    slug: "little-gamers-club",
    type: "consumer-club",
    name: "Little Gamers · Very First Club",
    tagline: "A gentle first club for 5–7 year olds.",
    description:
      "Their first club ever? Start here. Playful 45-minute sessions with Roblox obbys and Minecraft creative. No pressure. Parents welcome to sit in.",
    topicIds: ["t-minecraft", "t-roblox"],
    tagIds: ["tag-chill", "tag-beginner", "tag-creative", "tag-nd", "tag-family"],
    languages: ["fi"],
    minAge: 5,
    maxAge: 7,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Wednesdays · 16:00–16:45",
    scheduleDetail: [
      "Every Wednesday 16:00–16:45",
      "Shorter 45-minute sessions",
      "Parents welcome to sit in",
    ],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-14",
    price: { mode: "per_session", tokens: 5 },
    seatCount: 8,
    seatsTaken: 7,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Riikka Salminen",
    primaryGeduBio: "Little-gamers specialist.",
  },
  {
    id: "roblox-svenska",
    slug: "roblox-pa-svenska",
    type: "consumer-club",
    name: "Roblox på svenska",
    tagline: "Ett Roblox-kerho på svenska.",
    description:
      "Ett avslappnat Roblox-kerho på svenska. Vi spelar tillsammans och bygger små spel. För svenska-talande barn som vill ha en egen tid.",
    topicIds: ["t-roblox", "t-game-design"],
    tagIds: ["tag-chill", "tag-beginner", "tag-creative"],
    languages: ["sv"],
    minAge: 8,
    maxAge: 12,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Mondays · 16:30–17:30",
    scheduleDetail: ["Every Monday 16:30–17:30", "Ongoing — join any time"],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-12",
    price: { mode: "per_session", tokens: 7 },
    seatCount: 10,
    seatsTaken: 3,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Linnea Ekström",
    primaryGeduBio: "Swedish-speaking Roblox host.",
  },
  {
    id: "girls-minecraft-sat",
    slug: "girls-minecraft-saturdays",
    type: "consumer-club",
    name: "Girls' Minecraft · Saturdays",
    tagline: "A girls-only Minecraft club in Helsinki.",
    description:
      "A cozy in-person club for girls at our Helsinki office. Build together, chat, bring a friend. Saturday afternoons.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-girls", "tag-chill", "tag-creative", "tag-beginner"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 13,
    isOnline: false,
    locationId: "sogverse-hq",
    scheduleSummary: "Saturdays · 14:00–15:30",
    scheduleDetail: [
      "Every Saturday 14:00–15:30",
      "Sogverse office · Helsinki",
      "Girls-only space",
    ],
    skipped: STANDARD_SKIPS,
    firstSessionIso: "2026-01-17",
    price: { mode: "per_session", tokens: 9 },
    seatCount: 10,
    seatsTaken: 8,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Henna Laakso",
    primaryGeduBio: "Girls-only Minecraft lead.",
  },

  // ---------- Municipality clubs ----------
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
    locationId: "ressun-peruskoulu",
    scheduleSummary: "Wednesdays · 14:30–16:00",
    scheduleDetail: [
      "Every Wednesday 14:30–16:00",
      "Computer room A · check in at the main desk",
      "Spring term · Jan 14 – May 27, 2026",
    ],
    dateRange: "Jan 14 – May 27, 2026",
    firstSessionIso: "2026-01-14",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 14,
    seatsTaken: 0,
    waitlistCount: 0,
    // Flips to open in ~45s so product-team review can quickly see the
    // countdown → open transition without waiting.
    registrationOpensOffsetMs: 45 * 1000,
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
    locationId: "oodi",
    scheduleSummary: "Tuesdays · 15:30–17:00",
    scheduleDetail: [
      "Every Tuesday 15:30–17:00",
      "3rd floor · Kuutio room",
      "Spring term · Jan 13 – May 26, 2026",
    ],
    dateRange: "Jan 13 – May 26, 2026",
    firstSessionIso: "2026-01-13",
    skipped: STANDARD_SKIPS,
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
    locationId: "helsinki",
    venueName: "Online · for Helsinki residents",
    scheduleSummary: "Fridays · 16:00–17:30",
    scheduleDetail: [
      "Every Friday 16:00–17:30",
      "Online",
      "Spring term · Jan 16 – May 29, 2026",
    ],
    dateRange: "Jan 16 – May 29, 2026",
    firstSessionIso: "2026-01-16",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 16,
    seatsTaken: 11,
    waitlistCount: 0,
    registrationOpensOffsetMs: -2 * DAY,
    status: "running",
    primaryGeduName: "Daniel Ahonen",
    primaryGeduBio: "English-first esports fundamentals.",
  },
  {
    id: "muni-munkki-fortnite",
    slug: "munkki-fortnite",
    type: "municipality-club",
    name: "Fortnite Strategy · Munkkivuoren ala-aste",
    tagline: "Already full — join the waitlist for a chance.",
    description:
      "Last term's bestseller. All seats are taken this term, but families sometimes drop off the first few weeks — the waitlist usually moves one or two spots in the first month.",
    topicIds: ["t-fortnite", "t-esports"],
    tagIds: ["tag-competitive", "tag-teams"],
    languages: ["fi"],
    minAge: 11,
    maxAge: 14,
    isOnline: false,
    locationId: "munkkivuoren-ala-aste",
    scheduleSummary: "Thursdays · 14:30–16:00",
    scheduleDetail: [
      "Every Thursday 14:30–16:00",
      "Tietokoneluokka, Munkkivuoren ala-aste",
      "Spring term · Jan 15 – May 28, 2026",
    ],
    dateRange: "Jan 15 – May 28, 2026",
    firstSessionIso: "2026-01-15",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 14,
    seatsTaken: 14,
    waitlistCount: 7,
    registrationOpensOffsetMs: -5 * DAY,
    status: "running",
    primaryGeduName: "Emilia Mäkinen",
    primaryGeduBio: "Game educator, Fortnite strategist.",
  },
  {
    id: "muni-tampere-mc",
    slug: "tampere-minecraft",
    type: "municipality-club",
    name: "Minecraft · Tampereen pääkirjasto",
    tagline: "A new Tampere club at Metso library.",
    description:
      "Our first Tampere school club, running at the Metso library children's floor. Free to Tampere families. Registration is about to open.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 12,
    isOnline: false,
    locationId: "tampere-metso",
    scheduleSummary: "Mondays · 15:00–16:30",
    scheduleDetail: [
      "Every Monday 15:00–16:30",
      "Lasten osasto · Tampereen pääkirjasto Metso",
      "Spring term · Jan 19 – May 25, 2026",
    ],
    dateRange: "Jan 19 – May 25, 2026",
    firstSessionIso: "2026-01-19",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 12,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 12 * HOUR,
    status: "running",
    primaryGeduName: "Juho Laine",
    primaryGeduBio: "Multi-game club host.",
  },
  {
    id: "muni-vantaa-mc",
    slug: "vantaa-minecraft",
    type: "municipality-club",
    name: "Minecraft · Tikkurilan pääkirjasto",
    tagline: "After-school club for Vantaa kids.",
    description:
      "Funded by the City of Vantaa, free to families. Held on Tikkurila library's second-floor meeting room.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: false,
    locationId: "vantaa-paakirjasto",
    scheduleSummary: "Tuesdays · 15:00–16:30",
    scheduleDetail: [
      "Every Tuesday 15:00–16:30",
      "Tikkurilan pääkirjasto · 2nd floor",
      "Spring term · Jan 13 – May 26, 2026",
    ],
    dateRange: "Jan 13 – May 26, 2026",
    firstSessionIso: "2026-01-13",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 12,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 2 * DAY,
    status: "running",
    primaryGeduName: "Jenni Hakala",
    primaryGeduBio: "Multi-game host, Vantaa native.",
  },
  {
    id: "muni-myyrmaki-roblox",
    slug: "myyrmaki-roblox",
    type: "municipality-club",
    name: "Roblox · Myyrmäen peruskoulu",
    tagline: "After-school Roblox, paid for by Vantaa.",
    description:
      "An after-school Roblox club at Myyrmäki school. Registration is open now — still seats left.",
    topicIds: ["t-roblox", "t-game-design"],
    tagIds: ["tag-creative", "tag-beginner"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: false,
    locationId: "myyrmaen-peruskoulu",
    scheduleSummary: "Thursdays · 14:30–16:00",
    scheduleDetail: [
      "Every Thursday 14:30–16:00",
      "Tietokoneluokka · Myyrmäen peruskoulu",
      "Spring term · Jan 15 – May 28, 2026",
    ],
    dateRange: "Jan 15 – May 28, 2026",
    firstSessionIso: "2026-01-15",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 14,
    seatsTaken: 9,
    waitlistCount: 0,
    registrationOpensOffsetMs: -3 * DAY,
    status: "running",
    primaryGeduName: "Juho Laine",
    primaryGeduBio: "Multi-game club host.",
  },
  {
    id: "muni-leppavaara-mc",
    slug: "leppavaara-minecraft",
    type: "municipality-club",
    name: "Minecraft · Leppävaaran kirjasto",
    tagline: "Free after-school Minecraft for Espoo kids.",
    description:
      "A spring-term Minecraft club at Leppävaara library's meeting room. Free to Espoo families.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 12,
    isOnline: false,
    locationId: "leppavaaran-kirjasto",
    scheduleSummary: "Mondays · 15:00–16:30",
    scheduleDetail: [
      "Every Monday 15:00–16:30",
      "Meeting room 2B, Leppävaaran kirjasto",
      "Spring term · Jan 12 – May 25, 2026",
    ],
    dateRange: "Jan 12 – May 25, 2026",
    firstSessionIso: "2026-01-12",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 14,
    seatsTaken: 11,
    waitlistCount: 0,
    registrationOpensOffsetMs: -7 * DAY,
    status: "running",
    primaryGeduName: "Essi Rantanen",
    primaryGeduBio: "Creative Minecraft worlds.",
  },
  {
    id: "muni-otaniemi-coding",
    slug: "otaniemi-coding",
    type: "municipality-club",
    name: "Coding for Gamers · Otaniemen koulu",
    tagline: "Scratch + Roblox scripting, paid for by Espoo.",
    description:
      "Kids learn real coding basics — starting with Scratch and moving into Roblox scripting — in Otaniemi school's computer lab.",
    topicIds: ["t-coding", "t-roblox", "t-game-design"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 10,
    maxAge: 14,
    isOnline: false,
    locationId: "otaniemen-koulu",
    scheduleSummary: "Wednesdays · 14:30–16:00",
    scheduleDetail: [
      "Every Wednesday 14:30–16:00",
      "Otaniemen koulu · computer lab",
      "Spring term · Jan 14 – May 27, 2026",
    ],
    dateRange: "Jan 14 – May 27, 2026",
    firstSessionIso: "2026-01-14",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 12,
    seatsTaken: 12,
    waitlistCount: 5,
    registrationOpensOffsetMs: -10 * DAY,
    status: "running",
    primaryGeduName: "Noora Hakala",
    primaryGeduBio: "Coding for gamers — Scratch + Roblox.",
  },
  {
    id: "muni-kallio-mc",
    slug: "kallio-minecraft",
    type: "municipality-club",
    name: "Minecraft · Kallion kirjasto",
    tagline: "New Helsinki club at Kallio library.",
    description:
      "A spring-term club at Kallio library's children's section. Free to Helsinki families.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: false,
    locationId: "kallion-kirjasto",
    scheduleSummary: "Thursdays · 15:30–17:00",
    scheduleDetail: [
      "Every Thursday 15:30–17:00",
      "Children's section, Kallion kirjasto",
      "Spring term · Jan 15 – May 28, 2026",
    ],
    dateRange: "Jan 15 – May 28, 2026",
    firstSessionIso: "2026-01-15",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 12,
    seatsTaken: 4,
    waitlistCount: 0,
    registrationOpensOffsetMs: -1 * DAY,
    status: "running",
    primaryGeduName: "Oskar Manninen",
    primaryGeduBio: "Multi-game host, Helsinki local.",
  },
  {
    id: "muni-turku-mc",
    slug: "turku-minecraft",
    type: "municipality-club",
    name: "Minecraft · Turun pääkirjasto",
    tagline: "Our first Turku club.",
    description:
      "A new spring-term Minecraft club at Turku's main library, children's floor. Free to Turku families.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: false,
    locationId: "turku-paakirjasto",
    scheduleSummary: "Thursdays · 15:00–16:30",
    scheduleDetail: [
      "Every Thursday 15:00–16:30",
      "Turun pääkirjasto · lasten osasto",
      "Spring term · Jan 15 – May 28, 2026",
    ],
    dateRange: "Jan 15 – May 28, 2026",
    firstSessionIso: "2026-01-15",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 14,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 5 * DAY,
    status: "running",
    primaryGeduName: "Kalle Mäkelä",
    primaryGeduBio: "Multi-game club host.",
  },
  {
    id: "muni-oulu-roblox",
    slug: "oulu-roblox",
    type: "municipality-club",
    name: "Roblox · Oulun pääkirjasto",
    tagline: "First-ever Oulu club.",
    description:
      "A brand-new Roblox club at Oulu's main library. Funded by the City of Oulu.",
    topicIds: ["t-roblox", "t-game-design"],
    tagIds: ["tag-beginner", "tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: false,
    locationId: "oulu-paakirjasto",
    scheduleSummary: "Fridays · 15:00–16:30",
    scheduleDetail: [
      "Every Friday 15:00–16:30",
      "Oulun pääkirjasto · children's floor",
      "Spring term · Jan 16 – May 29, 2026",
    ],
    dateRange: "Jan 16 – May 29, 2026",
    firstSessionIso: "2026-01-16",
    skipped: STANDARD_SKIPS,
    price: { mode: "external_contract" },
    seatCount: 12,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 6 * HOUR,
    status: "running",
    primaryGeduName: "Sanna Aho",
    primaryGeduBio: "Oulu-based Gedu.",
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
    locationId: "sogverse-hq",
    scheduleSummary: "Jun 8–12 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Mon–Fri · June 8 – June 12, 2026",
      "Daily 10:00–15:00 with a lunch break",
      "At Sogverse HQ, Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Jun 8–12, 2026",
    firstSessionIso: "2026-06-08",
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
    locationId: "leppavaaran-kirjasto",
    scheduleSummary: "Oct 20–24 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Mon–Fri · October 20 – October 24, 2026",
      "Daily 10:00–15:00 (bring lunch)",
      "Meeting room 2B, Leppävaaran kirjasto",
    ],
    dateRange: "Oct 20–24, 2026",
    firstSessionIso: "2026-10-20",
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
    locationId: null,
    scheduleSummary: "Jul 15–19 · weekdays 14:00–17:00",
    scheduleDetail: [
      "Mon–Fri · July 15 – July 19, 2026",
      "Daily 14:00–17:00 (Helsinki time)",
      "Online",
    ],
    dateRange: "Jul 15–19, 2026",
    firstSessionIso: "2026-07-15",
    price: { mode: "upfront", tokens: 75 },
    seatCount: 20,
    seatsTaken: 18,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Alex Saarinen",
    primaryGeduBio: "English-language all-rounder.",
  },
  {
    id: "camp-winter-mc-helsinki",
    slug: "winter-minecraft-camp-helsinki",
    type: "camp",
    name: "Winter Minecraft Camp · Helsinki",
    tagline: "Three days of Minecraft during winter break.",
    description:
      "Wed–Fri during winter break at Sogverse HQ — intensive worlds + redstone. Lunch included. Fully refundable up to a week before start.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-creative", "tag-teams"],
    languages: ["fi"],
    minAge: 8,
    maxAge: 12,
    isOnline: false,
    locationId: "sogverse-hq",
    scheduleSummary: "Feb 25–27 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Wed–Fri · February 25 – February 27, 2026",
      "Daily 10:00–15:00 with a lunch break",
      "At Sogverse HQ, Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Feb 25–27, 2026",
    firstSessionIso: "2026-02-25",
    price: { mode: "upfront", tokens: 75 },
    seatCount: 14,
    seatsTaken: 14,
    waitlistCount: 3,
    status: "running",
    primaryGeduName: "Essi Rantanen",
    primaryGeduBio: "Creative Minecraft worlds.",
  },
  {
    id: "camp-summer-roblox-tampere",
    slug: "roblox-summer-camp-tampere",
    type: "camp",
    name: "Summer Roblox Camp · Tampere",
    tagline: "A full week of Roblox game-making, at Metso library.",
    description:
      "Five days of Roblox Studio, ending with a family showcase. Bring lunch. Fully refundable up to a week before.",
    topicIds: ["t-roblox", "t-game-design", "t-coding"],
    tagIds: ["tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: false,
    locationId: "tampere-metso",
    scheduleSummary: "Jun 15–19 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Mon–Fri · June 15 – June 19, 2026",
      "Daily 10:00–15:00 (bring lunch)",
      "Tampereen pääkirjasto Metso",
    ],
    dateRange: "Jun 15–19, 2026",
    firstSessionIso: "2026-06-15",
    price: { mode: "upfront", tokens: 90 },
    seatCount: 14,
    seatsTaken: 4,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Aino Peltola",
    primaryGeduBio: "Roblox studio building.",
  },
  {
    id: "camp-en-autumn-online",
    slug: "english-gaming-autumn-camp",
    type: "camp",
    name: "Autumn English Gaming Camp · Online",
    tagline: "A fun English-immersion camp over October break.",
    description:
      "Three mornings of gaming in English over October break — great for kids building English confidence naturally. Online only.",
    topicIds: ["t-minecraft", "t-roblox"],
    tagIds: ["tag-chill", "tag-beginner"],
    languages: ["en"],
    minAge: 9,
    maxAge: 13,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Oct 14–16 · 10:00–12:30",
    scheduleDetail: [
      "Wed–Fri · October 14 – October 16, 2026",
      "Daily 10:00–12:30 (Helsinki time)",
      "Online",
    ],
    dateRange: "Oct 14–16, 2026",
    firstSessionIso: "2026-10-14",
    price: { mode: "upfront", tokens: 50 },
    seatCount: 20,
    seatsTaken: 0,
    waitlistCount: 0,
    registrationOpensOffsetMs: 4 * DAY,
    status: "running",
    primaryGeduName: "Alex Saarinen",
    primaryGeduBio: "English-language all-rounder.",
  },
  {
    id: "camp-girls-summer-helsinki",
    slug: "girls-summer-gaming-camp",
    type: "camp",
    name: "Girls' Summer Gaming Camp",
    tagline: "Girls-only, four full days in June.",
    description:
      "A welcoming, girls-only gaming camp — Minecraft, Roblox, Mario Kart, creative building. Plenty of chill breaks, no pressure.",
    topicIds: ["t-minecraft", "t-roblox", "t-mario-kart"],
    tagIds: ["tag-girls", "tag-chill", "tag-creative"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: false,
    locationId: "sogverse-hq",
    scheduleSummary: "Jun 22–25 · weekdays 10:00–15:00",
    scheduleDetail: [
      "Mon–Thu · June 22 – June 25, 2026",
      "Daily 10:00–15:00 with lunch",
      "At Sogverse HQ, Helsinki",
    ],
    dateRange: "Jun 22–25, 2026",
    firstSessionIso: "2026-06-22",
    price: { mode: "upfront", tokens: 110 },
    seatCount: 14,
    seatsTaken: 7,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Henna Laakso",
    primaryGeduBio: "Girls-only Minecraft lead.",
  },
  {
    id: "camp-family-spring-helsinki",
    slug: "family-gaming-spring-camp",
    type: "camp",
    name: "Parent-and-Kid Spring Camp",
    tagline: "A half-day camp you attend with your child.",
    description:
      "A camp you come to with your child — three mornings of gaming, demo sessions, and talking about healthy gaming habits. Free to families in the trial program.",
    topicIds: ["t-minecraft", "t-online-safety"],
    tagIds: ["tag-family", "tag-chill", "tag-beginner"],
    languages: ["fi"],
    minAge: 7,
    maxAge: 12,
    isOnline: false,
    locationId: "sogverse-hq",
    scheduleSummary: "Mar 17–19 · 10:00–13:00",
    scheduleDetail: [
      "Tue–Thu · March 17 – March 19, 2026",
      "Daily 10:00–13:00",
      "Sogverse HQ, Helsinki",
    ],
    dateRange: "Mar 17–19, 2026",
    firstSessionIso: "2026-03-17",
    price: { mode: "free" },
    seatCount: 12,
    seatsTaken: 6,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Eero Aalto",
    primaryGeduBio: "Online safety & digital literacy.",
  },
  {
    id: "camp-winter-workshop",
    slug: "winter-break-workshop-camp",
    type: "camp",
    name: "Winter Break Workshop Camp · Online",
    tagline: "Three afternoons of game-making over winter break.",
    description:
      "A shorter, cheaper camp that runs during winter break. We start once 6 kids sign up — if we don't hit that by Feb 15, we refund everyone.",
    topicIds: ["t-game-design", "t-coding", "t-roblox"],
    tagIds: ["tag-beginner", "tag-chill"],
    languages: ["fi"],
    minAge: 9,
    maxAge: 13,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Feb 23–25 · 14:00–16:30",
    scheduleDetail: [
      "Mon–Wed · February 23 – February 25, 2026",
      "Daily 14:00–16:30",
      "Online",
    ],
    dateRange: "Feb 23–25, 2026",
    firstSessionIso: "2026-02-23",
    price: { mode: "upfront", tokens: 45 },
    seatCount: 16,
    seatsTaken: 3,
    waitlistCount: 0,
    status: "pending",
    signupThreshold: 6,
    primaryGeduName: "Laura Salo",
    primaryGeduBio: "Game-design educator.",
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
    locationId: "sogverse-hq",
    scheduleSummary: "Sat Jun 14 · 13:00–17:00",
    scheduleDetail: [
      "Saturday, June 14, 2026",
      "13:00–17:00 at Sogverse HQ",
      "Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Jun 14, 2026",
    firstSessionIso: "2026-06-14",
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
    locationId: null,
    scheduleSummary: "Sat May 17 · 10:00–12:00",
    scheduleDetail: [
      "Saturday, May 17, 2026",
      "10:00–12:00 (Helsinki time)",
      "Online",
    ],
    dateRange: "May 17, 2026",
    firstSessionIso: "2026-05-17",
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
    locationId: null,
    scheduleSummary: "Fri Jun 27 · 18:00–20:00",
    scheduleDetail: [
      "Friday, June 27, 2026",
      "18:00–20:00 (Helsinki time)",
      "Online",
    ],
    dateRange: "Jun 27, 2026",
    firstSessionIso: "2026-06-27",
    price: { mode: "upfront", tokens: 10 },
    seatCount: 24,
    seatsTaken: 6,
    waitlistCount: 0,
    registrationOpensOffsetMs: 20 * HOUR,
    status: "running",
    primaryGeduName: "Pekka Heinonen",
    primaryGeduBio: "Competitive Valorant coach.",
  },
  {
    id: "event-mario-kart-tournament",
    slug: "mario-kart-tournament-april",
    type: "event",
    name: "Mario Kart Grand Prix",
    tagline: "Saturday afternoon tournament at our Helsinki office.",
    description:
      "Bring your Switch (or use one of ours) and race. Trophies, silly prizes, cake. Beginners welcome — brackets adapt to skill.",
    topicIds: ["t-mario-kart"],
    tagIds: ["tag-competitive", "tag-chill", "tag-family"],
    languages: ["fi", "en"],
    minAge: 7,
    maxAge: 14,
    isOnline: false,
    locationId: "sogverse-hq",
    scheduleSummary: "Sat Apr 25 · 13:00–16:00",
    scheduleDetail: [
      "Saturday, April 25, 2026",
      "13:00–16:00 at Sogverse HQ",
      "Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Apr 25, 2026",
    firstSessionIso: "2026-04-25",
    price: { mode: "free" },
    seatCount: 24,
    seatsTaken: 18,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Markus Hiltunen",
    primaryGeduBio: "Nintendo-first Gedu.",
  },
  {
    id: "event-parent-night-mc",
    slug: "minecraft-parent-night",
    type: "event",
    name: "Minecraft Parent Night",
    tagline: "Two-hour evening session — play with your child.",
    description:
      "Join your kid for a Minecraft session. Parents who haven't played before welcome. A friendly way to see what your child is actually doing when they say 'I'm just playing Minecraft'.",
    topicIds: ["t-minecraft"],
    tagIds: ["tag-family", "tag-chill", "tag-beginner"],
    languages: ["fi"],
    minAge: 7,
    maxAge: 13,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Thu May 7 · 19:00–21:00",
    scheduleDetail: [
      "Thursday, May 7, 2026",
      "19:00–21:00 (Helsinki time)",
      "Online",
    ],
    dateRange: "May 7, 2026",
    firstSessionIso: "2026-05-07",
    price: { mode: "free" },
    seatCount: null,
    seatsTaken: 28,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Eero Aalto",
    primaryGeduBio: "Online safety & digital literacy.",
  },
  {
    id: "event-roblox-devs-meetup",
    slug: "roblox-devs-meetup",
    type: "event",
    name: "Roblox Developers Meetup · Oodi",
    tagline: "Saturday meetup for young Roblox creators.",
    description:
      "Kids show what they're building, get feedback, see other kids' games, swap tips. We'll bring snacks. Bring your laptop.",
    topicIds: ["t-roblox", "t-game-design", "t-coding"],
    tagIds: ["tag-creative"],
    languages: ["fi", "en"],
    minAge: 10,
    maxAge: 16,
    isOnline: false,
    locationId: "oodi",
    scheduleSummary: "Sat Mar 7 · 13:00–16:00",
    scheduleDetail: [
      "Saturday, March 7, 2026",
      "13:00–16:00",
      "3rd floor · Kuutio room, Oodi library",
    ],
    dateRange: "Mar 7, 2026",
    firstSessionIso: "2026-03-07",
    price: { mode: "free" },
    seatCount: 20,
    seatsTaken: 8,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Anna Korhonen",
    primaryGeduBio: "Creative coder and Roblox studio lead.",
  },
  {
    id: "event-rocket-league-friday",
    slug: "rocket-league-friday-nights",
    type: "event",
    name: "Rocket League Friday Night",
    tagline: "Two-hour Friday-evening tournament, in English.",
    description:
      "A casual Friday-evening Rocket League tournament. Prizes for style and teamwork, not just wins. In English.",
    topicIds: ["t-rocket-league", "t-esports"],
    tagIds: ["tag-teams", "tag-competitive"],
    languages: ["en"],
    minAge: 12,
    maxAge: 16,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Fri May 29 · 19:00–21:00",
    scheduleDetail: [
      "Friday, May 29, 2026",
      "19:00–21:00 (Helsinki time)",
      "Online",
    ],
    dateRange: "May 29, 2026",
    firstSessionIso: "2026-05-29",
    price: { mode: "upfront", tokens: 8 },
    seatCount: 20,
    seatsTaken: 13,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Ben Carter",
    primaryGeduBio: "English-language host, esports coach.",
  },
  {
    id: "event-fortnite-creative",
    slug: "fortnite-creative-workshop",
    type: "event",
    name: "Fortnite Creative Workshop",
    tagline: "Build your own Fortnite map in one evening.",
    description:
      "A hands-on workshop where kids build a Fortnite Creative map from scratch. We'll play each other's maps at the end.",
    topicIds: ["t-fortnite", "t-game-design"],
    tagIds: ["tag-creative"],
    languages: ["fi"],
    minAge: 10,
    maxAge: 14,
    isOnline: true,
    locationId: null,
    scheduleSummary: "Tue Apr 7 · 17:00–19:00",
    scheduleDetail: [
      "Tuesday, April 7, 2026",
      "17:00–19:00 (Helsinki time)",
      "Online",
    ],
    dateRange: "Apr 7, 2026",
    firstSessionIso: "2026-04-07",
    price: { mode: "upfront", tokens: 12 },
    seatCount: 16,
    seatsTaken: 16,
    waitlistCount: 4,
    status: "running",
    primaryGeduName: "Emilia Mäkinen",
    primaryGeduBio: "Game educator, Fortnite strategist.",
  },
  {
    id: "event-retro-game-day",
    slug: "retro-game-day",
    type: "event",
    name: "Retro Game Day",
    tagline: "A Sunday afternoon of classic games — NES, SNES, N64.",
    description:
      "Kids try games parents grew up with. We bring the old consoles, you bring friends. Free snacks. A reminder that games have always been fun.",
    topicIds: ["t-smash", "t-mario-kart"],
    tagIds: ["tag-chill", "tag-family"],
    languages: ["fi", "en"],
    minAge: 7,
    maxAge: 16,
    isOnline: false,
    locationId: "sogverse-hq",
    scheduleSummary: "Sun Feb 22 · 13:00–16:00",
    scheduleDetail: [
      "Sunday, February 22, 2026",
      "13:00–16:00 at Sogverse HQ",
      "Iso Roobertinkatu 1, Helsinki",
    ],
    dateRange: "Feb 22, 2026",
    firstSessionIso: "2026-02-22",
    price: { mode: "free" },
    seatCount: 30,
    seatsTaken: 11,
    waitlistCount: 0,
    status: "running",
    primaryGeduName: "Tom Lindholm",
    primaryGeduBio: "Super Smash Bros. & party games.",
  },
  {
    id: "event-girls-meetup",
    slug: "girls-gaming-meetup",
    type: "event",
    name: "Girls' Gaming Meetup",
    tagline: "A free afternoon meetup for girls who game.",
    description:
      "Free afternoon meetup at Oodi library for girls 10–14 who play games — whatever game. Chill hangout, bring a friend, bring a Switch.",
    topicIds: [],
    tagIds: ["tag-girls", "tag-chill"],
    languages: ["fi", "en"],
    minAge: 10,
    maxAge: 14,
    isOnline: false,
    locationId: "oodi",
    scheduleSummary: "Sun Apr 19 · 13:00–16:00",
    scheduleDetail: [
      "Sunday, April 19, 2026",
      "13:00–16:00",
      "3rd floor · Kuutio room, Oodi library",
    ],
    dateRange: "Apr 19, 2026",
    firstSessionIso: "2026-04-19",
    price: { mode: "free" },
    seatCount: 24,
    seatsTaken: 24,
    waitlistCount: 3,
    status: "running",
    primaryGeduName: "Henna Laakso",
    primaryGeduBio: "Girls-only Minecraft lead.",
  },
];

// ---------- Lookups & derived state ----------

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

/**
 * Canonical URL for a product's detail page. Municipality clubs live under
 * /registration/club/[slug]; consumer clubs, camps, and events live under
 * /browse-mockup/[slug]. The two routes share the same page component — this
 * helper is how every link in the app stays on the right entry point.
 */
export function productDetailPath(product: Product): string {
  if (product.type === "municipality-club") {
    return `/registration/club/${product.slug}`;
  }
  return `/browse-mockup/${product.slug}`;
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
  seatsRemaining: number | null;
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

/**
 * Pretty "where it happens" label. For online products either the
 * locationId-derived jurisdiction label (muni clubs) or a plain "Online"
 * (for unscoped online products). For in-person, the venue override falls
 * back to the site name + municipality context.
 */
export function getLocationLabel(product: Product): string {
  if (product.isOnline) {
    if (product.venueName) return product.venueName;
    if (!product.locationId) return "Online";
    const loc = getLocation(product.locationId);
    return loc ? `Online · for ${loc.name} residents` : "Online";
  }
  // In person
  if (product.venueName) return product.venueName;
  if (!product.locationId) return "In person · venue TBD";
  const loc = getLocation(product.locationId);
  if (!loc) return "In person · venue TBD";
  if (loc.type === "site") {
    const ancestors = getAncestors(loc.id);
    const muni = ancestors.find((a) => a.type === "municipality");
    return muni ? `${loc.name}, ${muni.name}` : loc.name;
  }
  return loc.name;
}

// ---------- Filter helpers ----------

export type Filters = {
  age: number | null;
  languages: Language[];
  types: ProductType[];
  format: "any" | "online" | "in_person";
  topicIds: string[];
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
  name: string;
  plural: string;
  shortBlurb: string;
  // CTA verb tuned per type. "Sign up" for clubs, "Enroll" for camps,
  // "Get a spot" for events. Shown in the signup panel button.
  signupVerb: string;
};

export const PRODUCT_TYPE_DEFS: ProductTypeDef[] = [
  {
    slug: "consumer-club",
    name: "Club",
    plural: "Clubs",
    shortBlurb: "Weekly, ongoing. Pay per session.",
    signupVerb: "Enroll",
  },
  {
    slug: "municipality-club",
    name: "Municipality club",
    plural: "Municipality clubs",
    shortBlurb:
      "Funded by your municipality. Free to you. Held at schools, libraries, or community centres.",
    signupVerb: "Register",
  },
  {
    slug: "camp",
    name: "Camp",
    plural: "Camps",
    shortBlurb: "A full week (or more) during school breaks.",
    signupVerb: "Sign up",
  },
  {
    slug: "event",
    name: "One-off event",
    plural: "Events",
    shortBlurb: "A single date — tournament, workshop, or demo.",
    signupVerb: "Join",
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

// ---------- Mock gamers ----------
// Pretend these are already on the parent's account — used by the signup
// flow's "Who are you signing up?" picker.

export type Gamer = {
  id: string;
  name: string;
  age: number;
  favoriteGame: string;
};

export const MOCK_GAMERS: Gamer[] = [
  { id: "g1", name: "Oona", age: 10, favoriteGame: "Minecraft" },
  { id: "g2", name: "Aino", age: 8, favoriteGame: "Roblox" },
  { id: "g3", name: "Eelis", age: 13, favoriteGame: "Fortnite" },
];
