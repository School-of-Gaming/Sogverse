import type { ProductTypeV2 } from "@/types";

// Mocked "your enrolled products" rows for the parent browse pages.
//
// Until participations_v2 ships there's no real data to power the
// "your enrolled clubs / camps / events" section above the browse grid.
// These rows are gated behind ?mock=1 so real visitors never see them
// — they exist only for design / UX review of the unified-management
// surface.
//
// When participations land (per docs/products-redesign.md §5.5),
// replace consumers of this module with a real `useMyParticipations`
// hook and delete this file.

export interface MockPurchasedRow {
  /** Drives the verb badge: "Enrolled" / "Registered" / "Signed up" / "Joined". */
  productType: ProductTypeV2;
  /** Synthetic — never collides with a real product id. */
  id: string;
  name: string;
  imagePath: string | null;
  topicLabel: string;
  /**
   * One or more linked gamers on the product. `seed` feeds the identicon —
   * passing a stable string per gamer keeps the avatar shape consistent
   * across renders / pages.
   */
  gamers: { displayName: string; seed?: string }[];
  /** Pre-formatted "next session" line; type-shape-agnostic on purpose. */
  nextSession: string;
  /** Schedule one-liner for the secondary line. */
  scheduleSummary: string;
  /** "external" hides the manage-payment surface (muni clubs). */
  billingMode: "paid" | "free" | "external_contract";
}

// Mock gamer identities — UUID seeds keep the identicons stable across
// renders/pages and produce visually distinct avatars (the identicon
// generator hashes the seed). Five entries so a single row can stack
// up to three clip-avatars without repeating shapes.
const MOCK_GAMERS = {
  oliver: { displayName: "Oliver", seed: "f5066ba6-bd8c-49f7-8912-524cd53de323" },
  ella: { displayName: "Ella", seed: "e2c031b4-a853-4a75-91fd-0aa07935fa56" },
  aino: { displayName: "Aino", seed: "86d1eed7-8d73-4de1-a654-064a62b60bc6" },
  noah: { displayName: "Noah", seed: "fda26c15-4677-4374-aa3b-7bed0cb0e2af" },
  mira: { displayName: "Mira", seed: "b86618b9-1cc0-4276-8dcc-14f995356e55" },
} as const;

export const MOCK_PURCHASED: Record<ProductTypeV2, MockPurchasedRow[]> = {
  consumer_club: [
    {
      productType: "consumer_club",
      id: "mock-cc-1",
      name: "Tuesday Minecraft Builders",
      imagePath: null,
      topicLabel: "Minecraft",
      gamers: [MOCK_GAMERS.oliver, MOCK_GAMERS.mira],
      nextSession: "Tomorrow, 17:00",
      scheduleSummary: "Every Tuesday · 17:00 (Helsinki)",
      billingMode: "paid",
    },
  ],
  // Muni clubs don't get a browse landing page (per redesign §7.3), but
  // an enrolled muni club shows up on /clubs alongside consumer-club
  // enrollments. Keep one mock row here so /clubs?mock=1 demonstrates
  // the unified parent UX.
  municipality_club: [
    {
      productType: "municipality_club",
      id: "mock-mc-1",
      name: "Helsinki Coding Club",
      imagePath: null,
      topicLabel: "Game Design",
      gamers: [MOCK_GAMERS.ella],
      nextSession: "Friday, 15:30",
      scheduleSummary: "Every Friday · 15:30 (Helsinki)",
      billingMode: "external_contract",
    },
  ],
  camp: [
    {
      productType: "camp",
      id: "mock-camp-1",
      name: "Spring Break Roblox Camp",
      imagePath: null,
      topicLabel: "Roblox",
      // Three gamers so the clip-avatar stack renders with overlap.
      gamers: [MOCK_GAMERS.oliver, MOCK_GAMERS.ella, MOCK_GAMERS.aino],
      nextSession: "Mon 24 Mar, 10:00",
      scheduleSummary: "24–28 March · 10:00–14:00 (Helsinki)",
      billingMode: "paid",
    },
  ],
  event: [
    {
      productType: "event",
      id: "mock-event-1",
      name: "Family Fortnite Friday",
      imagePath: null,
      topicLabel: "Fortnite",
      gamers: [MOCK_GAMERS.oliver, MOCK_GAMERS.noah],
      nextSession: "Fri 12 Apr, 18:00",
      scheduleSummary: "Friday 12 April · 18:00–20:00 (Helsinki)",
      billingMode: "paid",
    },
  ],
};

