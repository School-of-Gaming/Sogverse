// UI-only mockup data for the school-club parent registration flow.
// No DB, no API. Edit freely during product-team review.

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
  schoolCode: string;
  name: string;
  description: string;
  game: string;
  language: "Finnish" | "English";
  isOnline: boolean;
  locationName?: string;
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

export type School = {
  code: string;
  name: string;
  municipality: string;
  address: string;
  termLabel: string;
  termStartIso: string;
  termEndIso: string;
};

export type Gamer = {
  id: string;
  name: string;
  age: number;
  favoriteGame: string;
};

export const SCHOOLS: School[] = [
  {
    code: "TAPIOLA26",
    name: "Tapiolan koulu",
    municipality: "Espoo",
    address: "Opintie 1, 02100 Espoo",
    termLabel: "Kevätlukukausi 2026 · Spring term 2026",
    termStartIso: "2026-01-12",
    termEndIso: "2026-05-30",
  },
  {
    code: "RESSU26",
    name: "Ressun peruskoulu",
    municipality: "Helsinki",
    address: "Kalevankatu 8-10, 00100 Helsinki",
    termLabel: "Kevätlukukausi 2026 · Spring term 2026",
    termStartIso: "2026-01-12",
    termEndIso: "2026-05-30",
  },
  {
    code: "MUNKKI26",
    name: "Munkkivuoren ala-aste",
    municipality: "Helsinki",
    address: "Raumantie 2, 00350 Helsinki",
    termLabel: "Kevätlukukausi 2026 · Spring term 2026",
    termStartIso: "2026-01-12",
    termEndIso: "2026-05-30",
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
    id: "tap-mc-redstone",
    schoolCode: "TAPIOLA26",
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
    schoolCode: "TAPIOLA26",
    name: "Minecraft Survival -kerho",
    description:
      "Yhteispeliä ja rakentelua Minecraftin Survival-tilassa. Opetellaan strategiaa, yhteistyötä ja oman maailman suunnittelua.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    locationName: "Luokka 204, Tapiolan koulu",
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
    id: "tap-roblox-builders",
    schoolCode: "TAPIOLA26",
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
    id: "tap-fortnite-strat",
    schoolCode: "TAPIOLA26",
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
    schoolCode: "TAPIOLA26",
    name: "Minecraft Creative -kerho",
    description:
      "Luovaa rakentelua ja yhteisprojekteja Minecraftissa. Kaudella rakennamme oman kaupunkimaailmamme.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    locationName: "Luokka 115, Tapiolan koulu",
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
    id: "tap-roblox-br",
    schoolCode: "TAPIOLA26",
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
    schoolCode: "RESSU26",
    name: "Minecraft-kerho",
    description: "Yhteispeliä ja rakentelua ystävien kanssa koulun jälkeen.",
    game: "Minecraft",
    language: "Finnish",
    isOnline: false,
    locationName: "Tietokoneluokka A, Ressun peruskoulu",
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
    id: "munkki-roblox-studio",
    schoolCode: "MUNKKI26",
    name: "Roblox-pelistudio",
    description:
      "Oman pelin suunnittelua ja koodausta Robloxissa. Pienryhmä, intensiivinen koodausperehdytys.",
    game: "Roblox",
    language: "Finnish",
    isOnline: false,
    locationName: "Ryhmätila 3, Munkkivuoren ala-aste",
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

export function getSchool(code: string): School | undefined {
  const normalized = code.trim().toUpperCase();
  return SCHOOLS.find((s) => s.code === normalized);
}

export function getClub(id: string): Club | undefined {
  return CLUBS.find((c) => c.id === id);
}

export function getClubsForSchool(code: string): Club[] {
  const normalized = code.trim().toUpperCase();
  return CLUBS.filter((c) => c.schoolCode === normalized);
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
