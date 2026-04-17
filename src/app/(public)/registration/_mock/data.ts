// UI-only mockup data for the school-club parent registration flow.
// No DB, no API. Edit freely during product-team review.
//
// Data model mirrors the direction the real feature is headed:
//  - Clubs are tied to a *location* (a row in the locations tree), not to a
//    "school code". The location can be any level — most often a municipality
//    (the buyer / jurisdiction) or a site (a specific school building, library,
//    community centre). Parents browse by picking a municipality, then see
//    every club whose location is at-or-under that municipality.
//  - A club optionally carries a free-text `venueName` when its location is a
//    municipality (so we can say "hosted at Oodi library") or when the site
//    name alone isn't specific enough ("Room 204, Tapiolan koulu").

export type LocationType = "country" | "region" | "municipality" | "site";

export type Location = {
  id: string;
  slug: string;
  name: string;
  type: LocationType;
  parentId: string | null;
  // Municipality-only: the term window every school-club in this municipality
  // runs against. In the real model this lives on the products themselves;
  // here it's on the location for compact demo data.
  termLabel?: string;
  termStartIso?: string;
  termEndIso?: string;
};

export type Gedu = {
  name: string;
  bio: string;
};

export type SkippedSession = {
  date: string; // YYYY-MM-DD
  reason: string;
};

export type Club = {
  id: string;
  locationId: string; // the jurisdictional owner (site or municipality)
  venueName?: string; // human-readable venue label when location alone isn't enough
  name: string;
  description: string;
  game: string;
  language: "Finnish" | "English";
  isOnline: boolean;
  dayOfWeek: number; // 0=Monday .. 6=Sunday
  startTime: string; // "15:30"
  endTime: string;
  seasonStartIso: string;
  seasonEndIso: string;
  // Offset from Date.now() at page load, used for the demo countdown so the
  // mockup always shows a realistic "opens in X" regardless of when viewed.
  opensOffsetMs: number;
  seatCount: number;
  seatsTaken: number;
  waitlistCount: number;
  skipped: SkippedSession[];
  gedu: Gedu;
  assistantGedu?: Gedu;
  minAge: number;
  maxAge: number;
};

export type Gamer = {
  id: string;
  name: string;
  age: number;
  favoriteGame: string;
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

  // Municipalities (Uusimaa)
  {
    id: "espoo",
    slug: "espoo",
    name: "Espoo",
    type: "municipality",
    parentId: "uusimaa",
    ...STANDARD_TERM,
  },
  {
    id: "helsinki",
    slug: "helsinki",
    name: "Helsinki",
    type: "municipality",
    parentId: "uusimaa",
    ...STANDARD_TERM,
  },
  {
    id: "vantaa",
    slug: "vantaa",
    name: "Vantaa",
    type: "municipality",
    parentId: "uusimaa",
    ...STANDARD_TERM,
  },

  // Municipalities (Pirkanmaa)
  {
    id: "tampere",
    slug: "tampere",
    name: "Tampere",
    type: "municipality",
    parentId: "pirkanmaa",
    ...STANDARD_TERM,
  },

  // Sites under Espoo
  {
    id: "tapiolan-koulu",
    slug: "tapiolan-koulu",
    name: "Tapiolan koulu",
    type: "site",
    parentId: "espoo",
  },
  // Sites under Helsinki
  {
    id: "ressun-peruskoulu",
    slug: "ressun-peruskoulu",
    name: "Ressun peruskoulu",
    type: "site",
    parentId: "helsinki",
  },
  {
    id: "munkkivuoren-ala-aste",
    slug: "munkkivuoren-ala-aste",
    name: "Munkkivuoren ala-aste",
    type: "site",
    parentId: "helsinki",
  },
];

const MIKKO: Gedu = {
  name: "Mikko Virtanen",
  bio: "Minecraft-pedagogiikan vetäjä, 6 vuoden kokemus lasten kerhoista.",
};
const ANNA: Gedu = {
  name: "Anna Korhonen",
  bio: "Luova koodari ja Roblox-studion ohjaaja.",
};
const EMILIA: Gedu = {
  name: "Emilia Mäkinen",
  bio: "Pelikasvattaja ja Fortnite-strategi.",
};
const JUHO: Gedu = {
  name: "Juho Laine",
  bio: "Monipuolinen pelikerhonohjaaja, Minecraft & Roblox.",
};

const STANDARD_SKIPS: SkippedSession[] = [
  { date: "2026-02-24", reason: "Talviloma" },
  { date: "2026-04-07", reason: "Pääsiäisloma" },
  { date: "2026-05-01", reason: "Vappu" },
];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Anchor for "opens in X" countdowns. Captured once when the module is first
// evaluated in the browser so every page sees the same fixed target; `now`
// can then tick freely without dragging the target along with it. Refreshing
// the page resets this anchor, which conveniently re-starts the demo
// countdowns from the top.
const MODULE_LOAD_TIME = typeof window !== "undefined" ? Date.now() : 0;

export const CLUBS: Club[] = [
  {
    // Registration flips from countdown → open in ~30 seconds so the team
    // can quickly review the transition without waiting minutes.
    id: "esp-mc-redstone",
    locationId: "espoo", // online — offered municipality-wide in Espoo
    name: "Minecraft Redstone -kerho",
    description:
      "Redstone-kaapelointia, logiikkaportteja ja automaatiota Minecraftissa. Rakennetaan yhdessä pieniä koneita ja opitaan, miten sähköpiirit toimivat pelin sisällä.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: true,
    dayOfWeek: 2,
    startTime: "15:30",
    endTime: "17:00",
    seasonStartIso: "2026-01-14",
    seasonEndIso: "2026-05-27",
    opensOffsetMs: 30 * 1000,
    seatCount: 10,
    seatsTaken: 0,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: MIKKO,
    minAge: 9,
    maxAge: 13,
  },
  {
    id: "tap-mc-survival",
    locationId: "tapiolan-koulu", // in-person at a specific school
    venueName: "Luokka 204, Tapiolan koulu",
    name: "Minecraft Survival -kerho",
    description:
      "Yhteispeliä ja rakentelua Minecraftin Survival-tilassa. Opetellaan strategiaa, yhteistyötä ja oman maailman suunnittelua.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    dayOfWeek: 3,
    startTime: "15:30",
    endTime: "17:00",
    seasonStartIso: "2026-01-15",
    seasonEndIso: "2026-05-28",
    opensOffsetMs: 3 * DAY,
    seatCount: 15,
    seatsTaken: 0,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: MIKKO,
    minAge: 9,
    maxAge: 13,
  },
  {
    id: "esp-roblox-builders",
    locationId: "espoo",
    name: "Roblox-rakentajat",
    description:
      "Oman pelin suunnittelua Robloxin työkaluilla. Opetellaan perusskriptausta ja julkaistaan oma projekti kauden aikana.",
    game: "Roblox",
    language: "Finnish",
    isOnline: true,
    dayOfWeek: 1,
    startTime: "16:00",
    endTime: "17:30",
    seasonStartIso: "2026-01-13",
    seasonEndIso: "2026-05-26",
    // Opens in ~4 minutes — dramatic countdown for demo.
    opensOffsetMs: 4 * MINUTE,
    seatCount: 12,
    seatsTaken: 0,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: ANNA,
    minAge: 8,
    maxAge: 12,
  },
  {
    id: "esp-fortnite-strat",
    locationId: "espoo",
    name: "Fortnite-strategiakerho",
    description:
      "Taktiikkaa, pelianalyysiä ja tiimipeliä Fortnitessa. Kerho opettaa kommunikointia ja yhteistyötä.",
    game: "Fortnite",
    language: "English",
    isOnline: true,
    dayOfWeek: 2,
    startTime: "15:00",
    endTime: "16:30",
    seasonStartIso: "2026-01-14",
    seasonEndIso: "2026-05-27",
    opensOffsetMs: -2 * DAY,
    seatCount: 10,
    seatsTaken: 7,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: EMILIA,
    minAge: 11,
    maxAge: 15,
  },
  {
    id: "tap-mc-creative",
    locationId: "tapiolan-koulu",
    venueName: "Luokka 115, Tapiolan koulu",
    name: "Minecraft Creative -kerho",
    description:
      "Luovaa rakentelua ja yhteisprojekteja Minecraftissa. Kaudella rakennamme oman kaupunkimaailmamme.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    dayOfWeek: 4,
    startTime: "14:00",
    endTime: "15:30",
    seasonStartIso: "2026-01-16",
    seasonEndIso: "2026-05-29",
    opensOffsetMs: -5 * HOUR,
    seatCount: 15,
    seatsTaken: 14,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: JUHO,
    minAge: 9,
    maxAge: 13,
  },
  {
    id: "esp-roblox-br",
    locationId: "espoo",
    name: "Roblox Battle Royale -kerho",
    description:
      "Nopeaa toimintaa ja taktiikan opettelua Robloxin Battle Royale -peleissä.",
    game: "Roblox",
    language: "Finnish",
    isOnline: true,
    dayOfWeek: 0,
    startTime: "16:00",
    endTime: "17:30",
    seasonStartIso: "2026-01-12",
    seasonEndIso: "2026-05-25",
    opensOffsetMs: -3 * DAY,
    seatCount: 12,
    seatsTaken: 12,
    waitlistCount: 8,
    skipped: STANDARD_SKIPS,
    gedu: ANNA,
    assistantGedu: JUHO,
    minAge: 8,
    maxAge: 12,
  },
  {
    id: "ressu-mc",
    locationId: "ressun-peruskoulu",
    venueName: "Tietokoneluokka A, Ressun peruskoulu",
    name: "Minecraft-kerho",
    description: "Yhteispeliä ja rakentelua ystävien kanssa koulun jälkeen.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    dayOfWeek: 3,
    startTime: "14:30",
    endTime: "16:00",
    seasonStartIso: "2026-01-15",
    seasonEndIso: "2026-05-28",
    opensOffsetMs: -1 * DAY,
    seatCount: 14,
    seatsTaken: 5,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: MIKKO,
    minAge: 9,
    maxAge: 13,
  },
  {
    // Municipality-level club hosted at a public library — the kind of venue
    // this new model is designed to accommodate. No school involvement; the
    // city of Helsinki paid for it and any Helsinki parent can register.
    id: "hel-oodi-mc",
    locationId: "helsinki",
    venueName: "Oodi-kirjasto, Töölönlahdenkatu 4",
    name: "Minecraft pelikerho · Oodi",
    description:
      "Kaikille Helsingin lapsille avoin iltapäiväkerho Oodi-kirjastossa. Minecraft-pelailua, mini-projekteja ja kavereita.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    dayOfWeek: 1,
    startTime: "15:30",
    endTime: "17:00",
    seasonStartIso: "2026-01-13",
    seasonEndIso: "2026-05-26",
    opensOffsetMs: 6 * HOUR,
    seatCount: 18,
    seatsTaken: 0,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: JUHO,
    minAge: 8,
    maxAge: 12,
  },
  {
    id: "munkki-roblox-studio",
    locationId: "munkkivuoren-ala-aste",
    venueName: "Ryhmätila 3, Munkkivuoren ala-aste",
    name: "Roblox-pelistudio",
    description:
      "Oman pelin suunnittelua ja koodausta Robloxissa. Pienryhmä, intensiivinen koodausperehdytys.",
    game: "Roblox",
    language: "Finnish",
    isOnline: false,
    dayOfWeek: 2,
    startTime: "15:00",
    endTime: "16:30",
    seasonStartIso: "2026-01-14",
    seasonEndIso: "2026-05-27",
    opensOffsetMs: 20 * HOUR,
    seatCount: 12,
    seatsTaken: 0,
    waitlistCount: 0,
    skipped: STANDARD_SKIPS,
    gedu: ANNA,
    minAge: 8,
    maxAge: 12,
  },
];

// Pretend these are already on the parent's account.
export const MOCK_GAMERS: Gamer[] = [
  { id: "g1", name: "Oona", age: 10, favoriteGame: "Minecraft" },
  { id: "g2", name: "Aino", age: 8, favoriteGame: "Roblox" },
];

export function getLocation(slugOrId: string): Location | undefined {
  const normalized = slugOrId.toLowerCase();
  return LOCATIONS.find(
    (l) => l.slug === normalized || l.id === normalized,
  );
}

export function getLocationChildren(parentId: string | null): Location[] {
  return LOCATIONS.filter((l) => l.parentId === parentId).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
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

/** Clubs whose `locationId` is at-or-under `locationId`. */
export function getClubsForLocation(locationId: string): Club[] {
  const descendants = collectDescendantIds(locationId);
  return CLUBS.filter((c) => descendants.has(c.locationId));
}

export function getClub(id: string): Club | undefined {
  return CLUBS.find((c) => c.id === id);
}

/**
 * A short label for where an in-person club physically meets. Online clubs
 * return null.
 */
export function getClubVenueLabel(club: Club): string | null {
  if (club.isOnline) return null;
  if (club.venueName) return club.venueName;
  const loc = getLocation(club.locationId);
  return loc?.type === "site" ? loc.name : null;
}

export type ClubStatus = "not_open" | "available" | "almost_full" | "full";

export type ClubRuntimeState = {
  status: ClubStatus;
  opensAt: Date;
  isOpen: boolean;
  seatsRemaining: number;
};

export function getClubState(club: Club, now: number): ClubRuntimeState {
  const opensAt = new Date(MODULE_LOAD_TIME + club.opensOffsetMs);
  const isOpen = now >= opensAt.getTime();
  const seatsRemaining = Math.max(0, club.seatCount - club.seatsTaken);
  if (!isOpen) return { status: "not_open", opensAt, isOpen, seatsRemaining };
  if (seatsRemaining <= 0) return { status: "full", opensAt, isOpen, seatsRemaining };
  const almostFullThreshold = Math.max(1, Math.ceil(club.seatCount * 0.2));
  if (seatsRemaining <= almostFullThreshold)
    return { status: "almost_full", opensAt, isOpen, seatsRemaining };
  return { status: "available", opensAt, isOpen, seatsRemaining };
}
