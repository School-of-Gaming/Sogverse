/**
 * Deterministic test UUIDs matching supabase/seed.sql.
 * These never collide with real user data.
 */
export const TEST_IDS = {
  ADMIN: "00000000-0000-0000-0000-000000000001",
  CUSTOMER: "00000000-0000-0000-0000-000000000002",
  GEDU: "00000000-0000-0000-0000-000000000003",
  GAMER: "00000000-0000-0000-0000-000000000004",
  CUSTOMER_2: "00000000-0000-0000-0000-000000000005",
  GAMER_2: "00000000-0000-0000-0000-000000000006",
  PARENT_GAMER_LINK: "00000000-0000-0000-0000-000000000100",
  PARENT_GAMER_2_LINK: "00000000-0000-0000-0000-000000000101",
  // Location tree seeded in seed.sql: Finland -> Uusimaa -> Helsinki -> Test School
  LOCATION_COUNTRY: "00000000-0000-0000-0000-000000000200",
  LOCATION_REGION: "00000000-0000-0000-0000-000000000201",
  LOCATION_MUNICIPALITY: "00000000-0000-0000-0000-000000000202",
  LOCATION_SITE: "00000000-0000-0000-0000-000000000203",
} as const;

export const TEST_CREDENTIALS = {
  ADMIN: { email: "admin@test.local", password: "testpassword123" },
  CUSTOMER: { email: "customer@test.local", password: "testpassword123" },
  GEDU: { email: "gedu@test.local", password: "testpassword123" },
  GAMER: {
    email: "testgamer@gamer.sogverse.internal",
    password: "testpassword123",
  },
  CUSTOMER_2: { email: "customer2@test.local", password: "testpassword123" },
  /**
   * The second child, linked to the SAME parent as GAMER — which is what makes
   * them the sibling case for any scope test keyed on a participation rather
   * than on a family.
   */
  GAMER_2: {
    email: "testgamer-c1@gamer.sogverse.internal",
    password: "testpassword123",
  },
} as const;

/** Seed values — must match seed.sql */
export const SEED = {
  MINECRAFT_USERNAME_GEDU: "TestGedu",
  MINECRAFT_USERNAME_GAMER: "TestGamer",
  // Spelled differently from the Minecraft pair on purpose: a test asserting on
  // one platform's stored handle would pass against the other's row if the two
  // fixtures were the same string.
  ROBLOX_USERNAME_GEDU: "TestGeduRoblox",
  ROBLOX_USERNAME_GAMER: "TestGamerRoblox",
} as const;
