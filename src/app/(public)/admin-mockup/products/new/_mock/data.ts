// UI-only mockup data for the admin "add product" flow.
// No DB, no API. Edit freely during product-team review.
//
// Mirrors the direction in docs/products-redesign.md:
//  - Four product types, one unified form that adapts.
//  - billing_mode drives behavior; product_type is just a label.
//  - Topics + tags describe what a product is about.
//  - Schedule is one-or-more (weekday, start_time, duration) slots.
//  - Seat count lives on the product.

export type ProductType =
  | "consumer-club"
  | "municipality-club"
  | "camp"
  | "event";

export type BillingMode =
  | "paid_per_session"
  | "paid_upfront"
  | "free"
  | "external_contract";

export type ProductTypeDef = {
  slug: ProductType;
  name: string;
  shortName: string;
  tagline: string;
  blurb: string;
  traits: string[];
  billingMode: BillingMode | "choose_free_or_paid"; // event chooses at form time
  scheduleShape: "weekly_ongoing" | "weekly_bounded" | "multi_day_bounded" | "single_date";
  hasRegistrationOpensAt: "never" | "required" | "optional";
  hasRefundWindow: boolean;
  seatCountOptional: boolean; // true only for free events
};

export const PRODUCT_TYPES: ProductTypeDef[] = [
  {
    slug: "consumer-club",
    name: "Consumer club",
    shortName: "Club",
    tagline: "Weekly, ongoing, parent-paid per session.",
    blurb:
      "Parents enroll their child and pay in Sorg tokens per session. Clubs run week after week with no end date unless you set one.",
    traits: [
      "Weekly · one day per week",
      "No end date by default",
      "Parents pay per session (Sorg tokens)",
      "Fixed seat count, with a waitlist",
    ],
    billingMode: "paid_per_session",
    scheduleShape: "weekly_ongoing",
    hasRegistrationOpensAt: "never",
    hasRefundWindow: false,
    seatCountOptional: false,
  },
  {
    slug: "municipality-club",
    name: "Municipality club",
    shortName: "School club",
    tagline: "Term-based, school-paid, ticket-drop registration.",
    blurb:
      "A Finnish municipality or school pays up front for a block of seats. Parents register their child for free; the registration window opens at a fixed moment like a concert ticket drop.",
    traits: [
      "Weekly · one day per week",
      "Runs between a start and end date",
      "School of Gaming invoices the municipality",
      "Fixed seat count, with a waitlist",
    ],
    billingMode: "external_contract",
    scheduleShape: "weekly_bounded",
    hasRegistrationOpensAt: "required",
    hasRefundWindow: false,
    seatCountOptional: false,
  },
  {
    slug: "camp",
    name: "Camp",
    shortName: "Camp",
    tagline: "Runs across several days for a set period. Parents pay upfront.",
    blurb:
      "A camp runs across several days of the week for a set period — any time of year. Parents pay the full price in Sorg tokens once, at signup. Refundable up to a cutoff before the camp starts.",
    traits: [
      "Several days per week (each with its own time)",
      "Runs between a start and end date",
      "Parents pay upfront (Sorg tokens)",
      "Refundable before the camp starts",
    ],
    billingMode: "paid_upfront",
    scheduleShape: "multi_day_bounded",
    hasRegistrationOpensAt: "optional",
    hasRefundWindow: true,
    seatCountOptional: false,
  },
  {
    slug: "event",
    name: "Event",
    shortName: "Event",
    tagline: "A single date. Free, or a one-time Sorg token charge.",
    blurb:
      "A one-time event on a specific date. Good for demo days, community walks, webinars, tournaments. Free events can have no seat limit; paid events always have a seat count.",
    traits: [
      "Single date, single start time",
      "Free or paid upfront (Sorg tokens)",
      "Free events can have no seat limit",
      "Great for demos, webinars, tournaments",
    ],
    billingMode: "choose_free_or_paid",
    scheduleShape: "single_date",
    hasRegistrationOpensAt: "optional",
    hasRefundWindow: true, // applies only when paid
    seatCountOptional: true,
  },
];

export function getProductType(slug: string): ProductTypeDef | undefined {
  return PRODUCT_TYPES.find((t) => t.slug === slug);
}

// ---------- Topics, tags, Gedus, locations, holiday calendars ----------

export type Topic = {
  id: string;
  name: string;
  kind: "game" | "subject";
};

export const TOPICS: Topic[] = [
  { id: "t-minecraft", name: "Minecraft", kind: "game" },
  { id: "t-fortnite", name: "Fortnite", kind: "game" },
  { id: "t-roblox", name: "Roblox", kind: "game" },
  { id: "t-pokemon-go", name: "Pokémon GO", kind: "game" },
  { id: "t-valorant", name: "Valorant", kind: "game" },
  { id: "t-smash", name: "Super Smash Bros.", kind: "game" },
  { id: "t-game-design", name: "Game design", kind: "subject" },
  { id: "t-online-safety", name: "Online safety", kind: "subject" },
  { id: "t-esports", name: "Esports fundamentals", kind: "subject" },
  { id: "t-coding", name: "Coding for gamers", kind: "subject" },
];

export type Tag = { id: string; name: string; description: string };

export const TAGS: Tag[] = [
  { id: "tag-chill", name: "Chill", description: "Relaxed pace, low pressure." },
  { id: "tag-competitive", name: "Competitive", description: "Focus on skill, ranking, tournament prep." },
  { id: "tag-beginner", name: "Beginner friendly", description: "No prior experience needed." },
  { id: "tag-advanced", name: "Advanced", description: "For experienced players." },
  { id: "tag-nd", name: "Neurodiversity friendly", description: "Structure and pacing tuned for neurodiverse gamers." },
  { id: "tag-girls", name: "Girls' club", description: "Girls-only space." },
  { id: "tag-creative", name: "Creative", description: "Building, design, storytelling." },
  { id: "tag-teams", name: "Team play", description: "Focus on coordination and communication." },
];

export type Gedu = {
  id: string;
  name: string;
  email: string;
  bio: string;
  languages: string[];
};

// A deliberately longer list (~30 Gedus) so the picker has to scale —
// a flat dropdown or chip list would not work well at this size.
// Random UUIDs are used so Identicons visibly differ for each Gedu —
// predictable slug-style ids cluster into visually similar hashes.
export const GEDUS: Gedu[] = [
  { id: "18165fca-7d07-44ee-a808-ad2a492989f5", name: "Mikko Virtanen", email: "mikko@sog.gg", bio: "Minecraft pedagogy, 6 years.", languages: ["fi", "en"] },
  { id: "eaed1e64-8ee9-4897-bbd4-8232608eb8cd", name: "Anna Korhonen", email: "anna@sog.gg", bio: "Creative coder & Roblox studio lead.", languages: ["fi"] },
  { id: "af5144ba-e3c0-4f4d-b835-924173d402fb", name: "Emilia Mäkinen", email: "emilia@sog.gg", bio: "Game educator, Fortnite strategist.", languages: ["fi", "en"] },
  { id: "80596389-03d1-4144-b2e6-dd6f13846505", name: "Juho Laine", email: "juho@sog.gg", bio: "Multi-game club host.", languages: ["fi"] },
  { id: "ecab8243-88bd-4dd7-aa3b-130977a1b9aa", name: "Sara Nieminen", email: "sara@sog.gg", bio: "Neurodiversity-friendly facilitator.", languages: ["fi", "sv"] },
  { id: "3e58a252-b782-44a0-b02f-b9b3b8bb1e02", name: "Ben Carter", email: "ben@sog.gg", bio: "English-language host, esports coach.", languages: ["en"] },
  { id: "ac7a414b-a487-415c-9147-934a04e2fe00", name: "Laura Salo", email: "laura@sog.gg", bio: "Game-design educator.", languages: ["fi", "en"] },
  { id: "05aec771-2c10-43c5-9988-aec418ebf540", name: "Pekka Heinonen", email: "pekka@sog.gg", bio: "Competitive Valorant coach.", languages: ["fi"] },
  { id: "9b0c2a38-fbc5-43aa-9464-85831f1e5931", name: "Sofia Rautio", email: "sofia@sog.gg", bio: "Younger gamers, chill vibes.", languages: ["fi", "en"] },
  { id: "49c0faf4-7bc9-40e7-9688-0721b8b129fc", name: "Tom Lindholm", email: "tom@sog.gg", bio: "Super Smash Bros. & party games.", languages: ["fi", "en"] },
  { id: "87ac34c6-882f-4080-9c2f-4120c96d492a", name: "Oskar Manninen", email: "oskar@sog.gg", bio: "Pokémon GO community lead.", languages: ["fi"] },
  { id: "35494ea0-9a49-413a-a205-cf6eed807fa5", name: "Noora Hakala", email: "noora@sog.gg", bio: "Coding for gamers, Scratch + Roblox.", languages: ["fi"] },
  { id: "6e2b1efe-757a-4cbc-9dc6-e563faad8548", name: "Eero Aalto", email: "eero@sog.gg", bio: "Online safety & digital literacy.", languages: ["fi", "en"] },
  { id: "43f658a7-cbc3-4e7f-9eaa-4e87109e1443", name: "Henna Laakso", email: "henna@sog.gg", bio: "Girls-only Minecraft lead.", languages: ["fi"] },
  { id: "a224ab0b-5449-4c66-99b2-0af2ef14fbb2", name: "Jari Kinnunen", email: "jari@sog.gg", bio: "Strategy-game specialist.", languages: ["fi"] },
  { id: "e18d7d18-f589-4b79-a043-73ffba64de5c", name: "Aino Peltola", email: "aino@sog.gg", bio: "Roblox studio building.", languages: ["fi", "en"] },
  { id: "6e85996c-5639-46c8-9919-e970338d47b1", name: "Leo Salminen", email: "leo@sog.gg", bio: "Multi-platform game design.", languages: ["fi"] },
  { id: "1ffaf09b-7e1e-4fdb-81cb-f380dc90f23d", name: "Iida Järvinen", email: "iida@sog.gg", bio: "Creative storytelling through games.", languages: ["fi", "sv"] },
  { id: "58c62038-6481-4a0b-9442-9876baf846db", name: "Ville Nieminen", email: "ville@sog.gg", bio: "Minecraft redstone & automation.", languages: ["fi"] },
  { id: "1132f733-1616-41be-a192-75c14c71e4c6", name: "Saga Grönlund", email: "saga@sog.gg", bio: "Swedish-speaking club host.", languages: ["sv", "fi"] },
  { id: "54010000-237b-4bdb-a8b1-b89928cae052", name: "Onni Vainio", email: "onni@sog.gg", bio: "Tournament organiser.", languages: ["fi", "en"] },
  { id: "f52672c0-1dfc-4c4d-9c81-7c2782e3a53d", name: "Mira Tuominen", email: "mira@sog.gg", bio: "Neurodiversity support, calm pacing.", languages: ["fi"] },
  { id: "43fbe130-393a-4f5f-869c-b5696498c31a", name: "Daniel Ahonen", email: "daniel@sog.gg", bio: "English-first esports fundamentals.", languages: ["en", "fi"] },
  { id: "fca50041-e6d6-431a-9bf2-e47fc95f7fae", name: "Essi Rantanen", email: "essi@sog.gg", bio: "Creative Minecraft worlds.", languages: ["fi"] },
  { id: "b8cd0c34-5884-4049-ae22-82b7c55cc1eb", name: "Kasper Nordström", email: "kasper@sog.gg", bio: "Competitive Fortnite.", languages: ["fi", "sv"] },
  { id: "00e68615-fb37-4fb0-825f-e15b8b945f61", name: "Matilda Wahlberg", email: "matilda@sog.gg", bio: "Swedish + English host.", languages: ["sv", "en"] },
  { id: "c01db0f3-1b49-423c-bd1f-113b9b7f66db", name: "Risto Mäki", email: "risto@sog.gg", bio: "Retro & indie game club.", languages: ["fi"] },
  { id: "5bfcd194-6c06-45cf-98b7-984ddf93d7e1", name: "Tuuli Koskinen", email: "tuuli@sog.gg", bio: "Younger children specialist.", languages: ["fi"] },
  { id: "2016823c-8a2f-48aa-8c3d-705dace747ed", name: "Alex Saarinen", email: "alex@sog.gg", bio: "English-language all-rounder.", languages: ["en"] },
  { id: "a04d80f0-4875-4965-8394-d965174d1147", name: "Veera Ruusunen", email: "veera@sog.gg", bio: "Game-design fundamentals.", languages: ["fi", "en"] },
];

export type SpokenLanguage = { code: string; name: string };

export const SPOKEN_LANGUAGES: SpokenLanguage[] = [
  { code: "fi", name: "Finnish" },
  { code: "en", name: "English" },
  { code: "sv", name: "Swedish" },
];

export type MockLocationType = "country" | "region" | "municipality" | "site";

export type MockLocation = {
  id: string;
  name: string;
  type: MockLocationType;
  parentId: string | null;
  /** Only meaningful on site-type rows. Lives on site_details in the real schema. */
  address?: string;
  /** Only meaningful on site-type rows. Lives on site_details in the real schema. */
  accessNotes?: string;
};

// Deliberately a deep tree with many sites so the picker has to work —
// search and drill-down rather than a flat dropdown.
export const LOCATIONS: MockLocation[] = [
  // Finland
  { id: "fi", name: "Finland", type: "country", parentId: null },
  { id: "fi-uusimaa", name: "Uusimaa", type: "region", parentId: "fi" },
  { id: "fi-pirkanmaa", name: "Pirkanmaa", type: "region", parentId: "fi" },
  { id: "fi-varsinais-suomi", name: "Varsinais-Suomi", type: "region", parentId: "fi" },
  { id: "fi-pohjois-pohjanmaa", name: "Pohjois-Pohjanmaa", type: "region", parentId: "fi" },

  // Uusimaa municipalities
  { id: "fi-espoo", name: "Espoo", type: "municipality", parentId: "fi-uusimaa" },
  { id: "fi-helsinki", name: "Helsinki", type: "municipality", parentId: "fi-uusimaa" },
  { id: "fi-vantaa", name: "Vantaa", type: "municipality", parentId: "fi-uusimaa" },
  { id: "fi-kauniainen", name: "Kauniainen", type: "municipality", parentId: "fi-uusimaa" },

  // Espoo sites
  { id: "s-tapiolan-koulu", name: "Tapiolan koulu", type: "site", parentId: "fi-espoo", address: "Opintie 1, 02100 Espoo", accessNotes: "Enter via back door on the east side. Gate code 4231. Parking behind the gym hall." },
  { id: "s-leppavaara-kirjasto", name: "Leppävaaran kirjasto", type: "site", parentId: "fi-espoo", address: "Leppävaarankatu 9, 02600 Espoo", accessNotes: "Meeting room 2B on the second floor. Check in at the main desk on arrival." },
  { id: "s-sello", name: "Sellon kirjasto", type: "site", parentId: "fi-espoo", address: "Leppävaarankatu 9, 02600 Espoo" },
  { id: "s-kilo-koulu", name: "Kilon koulu", type: "site", parentId: "fi-espoo", address: "Martinkatu 6, 02650 Espoo" },
  { id: "s-matinkyla-koulu", name: "Matinkylän koulu", type: "site", parentId: "fi-espoo", address: "Matinkatu 14, 02230 Espoo" },

  // Helsinki sites
  { id: "s-ressun", name: "Ressun peruskoulu", type: "site", parentId: "fi-helsinki", address: "Snellmaninkatu 18, 00170 Helsinki" },
  { id: "s-munkki", name: "Munkkivuoren ala-aste", type: "site", parentId: "fi-helsinki", address: "Laajalahdentie 21, 00330 Helsinki" },
  { id: "s-oodi", name: "Oodi library", type: "site", parentId: "fi-helsinki", address: "Töölönlahdenkatu 4, 00100 Helsinki", accessNotes: "3rd floor · Kuutio / The Cube room. Staff will unlock it 15 minutes before start." },
  { id: "s-hq", name: "Sogverse office", type: "site", parentId: "fi-helsinki", address: "Iso Roobertinkatu 1, 00120 Helsinki", accessNotes: "Buzz 'Sogverse' at the main door. 4th floor." },
  { id: "s-vuosaari-kirjasto", name: "Vuosaaren kirjasto", type: "site", parentId: "fi-helsinki", address: "Mosaiikkitori 2, 00980 Helsinki" },
  { id: "s-kallio-kirjasto", name: "Kallion kirjasto", type: "site", parentId: "fi-helsinki", address: "Viides linja 11, 00530 Helsinki" },
  { id: "s-torkkelin-koulu", name: "Torkkelin koulu", type: "site", parentId: "fi-helsinki", address: "Sturenkatu 2, 00510 Helsinki" },
  { id: "s-kannelmaki-koulu", name: "Kannelmäen peruskoulu", type: "site", parentId: "fi-helsinki", address: "Kanneltie 1, 00420 Helsinki" },

  // Vantaa sites
  { id: "s-tikkurila-koulu", name: "Tikkurilan koulu", type: "site", parentId: "fi-vantaa", address: "Valkoisenlähteentie 53, 01370 Vantaa" },
  { id: "s-myyrmaki-koulu", name: "Myyrmäen koulu", type: "site", parentId: "fi-vantaa", address: "Kilterinraitti 6, 01600 Vantaa" },

  // Kauniainen sites
  { id: "s-kauniainen-kirjasto", name: "Kauniaisten kirjasto", type: "site", parentId: "fi-kauniainen", address: "Thurmaninaukio 4, 02700 Kauniainen" },

  // Pirkanmaa
  { id: "fi-tampere", name: "Tampere", type: "municipality", parentId: "fi-pirkanmaa" },
  { id: "fi-nokia", name: "Nokia", type: "municipality", parentId: "fi-pirkanmaa" },
  { id: "s-tampere-metso", name: "Tampereen pääkirjasto Metso", type: "site", parentId: "fi-tampere", address: "Pirkankatu 2, 33230 Tampere" },
  { id: "s-hervannan-koulu", name: "Hervannan koulu", type: "site", parentId: "fi-tampere", address: "Opiskelijankatu 33, 33720 Tampere" },
  { id: "s-nokia-koulu", name: "Nokian yhteiskoulu", type: "site", parentId: "fi-nokia", address: "Poutuntie 2, 37100 Nokia" },

  // Varsinais-Suomi
  { id: "fi-turku", name: "Turku", type: "municipality", parentId: "fi-varsinais-suomi" },
  { id: "s-turku-paakirjasto", name: "Turun pääkirjasto", type: "site", parentId: "fi-turku", address: "Linnankatu 2, 20100 Turku" },
  { id: "s-turku-puolalan-koulu", name: "Puolalan koulu", type: "site", parentId: "fi-turku", address: "Kauppiaskatu 14, 20100 Turku" },

  // Pohjois-Pohjanmaa
  { id: "fi-oulu", name: "Oulu", type: "municipality", parentId: "fi-pohjois-pohjanmaa" },
  { id: "s-oulu-paakirjasto", name: "Oulun kaupunginkirjasto", type: "site", parentId: "fi-oulu", address: "Kaarlenväylä 3, 90100 Oulu" },

  // Sweden (sparse — just enough to show the tree supports multiple countries)
  { id: "se", name: "Sweden", type: "country", parentId: null },
  { id: "se-stockholm-lan", name: "Stockholm County", type: "region", parentId: "se" },
  { id: "se-stockholm", name: "Stockholm", type: "municipality", parentId: "se-stockholm-lan" },
  { id: "s-kungsholmen", name: "Kungsholmens Gymnasium", type: "site", parentId: "se-stockholm", address: "Hantverkargatan 67–69, 112 38 Stockholm" },
];

export type MockLocationNode = MockLocation & { children: MockLocationNode[] };

/** Build a sorted tree from the flat locations list. */
export function buildLocationTree(flat: MockLocation[] = LOCATIONS): MockLocationNode[] {
  const byId = new Map<string, MockLocationNode>();
  for (const loc of flat) {
    byId.set(loc.id, { ...loc, children: [] });
  }
  const roots: MockLocationNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: MockLocationNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/**
 * Filter a tree by search query. Keeps every node whose name matches, plus
 * its ancestors so the match is still reachable. When a node matches, its
 * entire subtree is preserved so the user can pick a site under it.
 */
export function filterLocationTree(
  nodes: MockLocationNode[],
  query: string,
): MockLocationNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: MockLocationNode[] = [];
  for (const node of nodes) {
    const selfMatches = node.name.toLowerCase().includes(q);
    const filteredChildren = filterLocationTree(node.children, query);
    if (selfMatches || filteredChildren.length > 0) {
      out.push({
        ...node,
        children: selfMatches ? node.children : filteredChildren,
      });
    }
  }
  return out;
}

/** Root → leaf chain of ancestors for a location id. */
export function getLocationAncestors(locationId: string): MockLocation[] {
  const byId = new Map(LOCATIONS.map((l) => [l.id, l]));
  const chain: MockLocation[] = [];
  const seen = new Set<string>();
  let current = byId.get(locationId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function getLocation(locationId: string): MockLocation | undefined {
  return LOCATIONS.find((l) => l.id === locationId);
}

export type HolidayCalendar = {
  id: string;
  name: string;
  description: string;
};

export const HOLIDAY_CALENDARS: HolidayCalendar[] = [
  { id: "cal-fi-national", name: "Finnish national holidays", description: "Juhannus, Vappu, Itsenäisyyspäivä, …" },
  { id: "cal-espoo-schools", name: "Espoo school calendar", description: "Syysloma, Joululoma, Talviloma, Pääsiäisloma." },
  { id: "cal-helsinki-schools", name: "Helsinki school calendar", description: "Syysloma, Joululoma, Talviloma, Pääsiäisloma." },
  { id: "cal-tampere-schools", name: "Tampere school calendar", description: "Syysloma, Joululoma, Talviloma, Pääsiäisloma." },
];

export type Timezone = { id: string; label: string };

export const TIMEZONES: Timezone[] = [
  { id: "Europe/Helsinki", label: "Helsinki (EET/EEST)" },
  { id: "Europe/Stockholm", label: "Stockholm (CET/CEST)" },
  { id: "Europe/London", label: "London (GMT/BST)" },
  { id: "America/New_York", label: "New York (EST/EDT)" },
  { id: "UTC", label: "UTC" },
];

export const WEEKDAYS = [
  { value: 0, short: "Mon", full: "Monday" },
  { value: 1, short: "Tue", full: "Tuesday" },
  { value: 2, short: "Wed", full: "Wednesday" },
  { value: 3, short: "Thu", full: "Thursday" },
  { value: 4, short: "Fri", full: "Friday" },
  { value: 5, short: "Sat", full: "Saturday" },
  { value: 6, short: "Sun", full: "Sunday" },
] as const;
