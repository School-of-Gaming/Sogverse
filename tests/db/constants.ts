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
  GAME: "00000000-0000-0000-0000-000000000010",
  PRODUCT: "00000000-0000-0000-0000-000000000020",
  GROUP: "00000000-0000-0000-0000-000000000030",
  ENROLLMENT: "00000000-0000-0000-0000-000000000040",
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
} as const;

/** Seed values — must match seed.sql */
export const SEED = {
  CUSTOMER_TOKEN_BALANCE: 20,
  PRODUCT_TOKEN_COST: 2,
  PRODUCT_NAME: "Test Product",
  GAME_NAME: "Test Game",
  MINECRAFT_USERNAME_GEDU: "TestGedu",
  MINECRAFT_USERNAME_GAMER: "TestGamer",
} as const;
