import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * Check 3 of the verification spine — the write-path IDOR loop
 * (docs/db-authorization-architecture.md §3.4).
 *
 * For every table `authenticated` may UPDATE or DELETE, a row is seeded through
 * the service-role client (RLS bypassed) and then attacked through a user-bound
 * client that has no business touching it. The assertion is threefold: the
 * attacker's statement affects zero rows, the row is still there afterwards, and
 * — the part that stops the whole thing passing vacuously — the row was there to
 * begin with.
 *
 * The existing IDOR tests are SELECT-side ("customer A cannot *read* customer
 * B's rows"). This is the write half: the half that mutates state.
 *
 * The loop is closed at the end: the set of tables covered here must equal the
 * set the database actually grants UPDATE/DELETE on, so a new write grant fails
 * CI until someone writes its IDOR case. INSERT is deliberately out of scope —
 * a blocked INSERT and a constraint violation both come back as an error, so the
 * check would risk passing for the wrong reason; INSERT WITH CHECK is covered by
 * the per-feature RLS tests, which supply valid payloads.
 *
 * Attackers are chosen to be the sharpest wrong actor available, not the
 * weakest: the parent against their own child's profile, a group *member*
 * against a moderator-only zone, the confined gamer against their own
 * confinement row. A test where the attacker fails the role clause AND the
 * ownership clause proves less than one where only ownership stands between
 * them and the row.
 */

const PRODUCT = "00000000-0000-0000-0000-0000000005a4";
const GROUP = "00000000-0000-0000-0000-0000000005a5";
const ZONE = "00000000-0000-0000-0000-0000000005a6";
const CALENDAR = "00000000-0000-0000-0000-0000000005a7";
const HOLIDAY = "00000000-0000-0000-0000-0000000005a8";
const SLOT = "00000000-0000-0000-0000-0000000005a9";
// Outside the 5a4–5a9 block because it was full when the catalogue arrived;
// registered in product-helpers.ts alongside it.
const IMAGE = "00000000-0000-0000-0000-000000000637";
const WHATSAPP_PHONE = "358900000005";

const tableGrantRows = z.array(
  z.object({ table_name: z.string(), privilege_type: z.string() })
);

const ATTACKERS = ["customer", "customer2", "gedu", "gamer"] as const;
type Attacker = (typeof ATTACKERS)[number];

const ATTACKER_CREDENTIALS: Record<
  Attacker,
  { email: string; password: string }
> = {
  customer: TEST_CREDENTIALS.CUSTOMER,
  customer2: TEST_CREDENTIALS.CUSTOMER_2,
  gedu: TEST_CREDENTIALS.GEDU,
  gamer: TEST_CREDENTIALS.GAMER,
};

/** What a write attempt actually achieved. */
interface Outcome {
  rows: number;
  error: PostgrestError | null;
}

function outcomeOf(result: {
  data: unknown[] | null;
  error: PostgrestError | null;
}): Outcome {
  return { rows: result.data?.length ?? 0, error: result.error };
}

type Attempt = (client: SupabaseClient<Database>) => Promise<Outcome>;

interface IdorCase {
  attacker: Attacker;
  /** Why this attacker is the sharp one for this table. */
  why: string;
  /** Reads the victim row through the service-role client. */
  probe: (admin: SupabaseClient<Database>) => Promise<unknown>;
  update?: Attempt;
  remove?: Attempt;
}

/**
 * `authenticated` holds column-level UPDATE on `profiles` rather than a
 * table-level grant, so it is invisible to `_list_table_grants` and has to be
 * named here explicitly. The column-grant audit (spine check 4) pins which
 * columns those are; this pins that they are still only the caller's own.
 */
const COLUMN_GRANT_ONLY_TABLES = ["profiles"];

const CASES: Record<string, IdorCase> = {
  products: {
    attacker: "customer2",
    why: "products are admin-only; any authenticated user holds the raw grant",
    probe: async (admin) =>
      (await admin.from("products").select("*").eq("id", PRODUCT).maybeSingle())
        .data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("products")
          .update({ is_visible: true, seat_count: 999 })
          .eq("id", PRODUCT)
          .select("id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client.from("products").delete().eq("id", PRODUCT).select("id")
      ),
  },

  product_images: {
    attacker: "customer2",
    why:
      "the picture catalogue is admin-only, and every authenticated user holds " +
      "the raw grant; a renamed entry is cosmetic but a deleted one unlinks " +
      "every product showing that picture",
    probe: async (admin) =>
      (
        await admin
          .from("product_images")
          .select("*")
          .eq("id", IMAGE)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("product_images")
          .update({ label: "Renamed by an outsider" })
          .eq("id", IMAGE)
          .select("id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("product_images")
          .delete()
          .eq("id", IMAGE)
          .select("id")
      ),
  },

  schedule_slots: {
    attacker: "customer2",
    why: "moving a session's time is an admin action",
    probe: async (admin) =>
      (
        await admin
          .from("schedule_slots")
          .select("*")
          .eq("id", SLOT)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("schedule_slots")
          .update({ start_time: "23:00" })
          .eq("id", SLOT)
          .select("id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("schedule_slots")
          .delete()
          .eq("id", SLOT)
          .select("id")
      ),
  },

  product_prices: {
    attacker: "customer2",
    why: "a writable price is a self-service discount",
    probe: async (admin) =>
      (
        await admin
          .from("product_prices")
          .select("*")
          .eq("product_id", PRODUCT)
          .eq("currency", "eur")
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("product_prices")
          .update({ price_cents: 0 })
          .eq("product_id", PRODUCT)
          .eq("currency", "eur")
          .select("product_id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("product_prices")
          .delete()
          .eq("product_id", PRODUCT)
          .eq("currency", "eur")
          .select("product_id")
      ),
  },

  product_staff_details: {
    // The sharp attacker, and the reason this row exists at all. A gedu is the
    // one non-admin who is *meant* to see this link — the feed RPC hands it to
    // them — so "can read it through the RPC" must not become "can rewrite it
    // through the table". Anything weaker (a customer, a gamer) would be
    // refused for having no business here at all, which proves less.
    attacker: "gedu",
    why: "a gedu legitimately reads this link through the feed RPC; only the admin-only policy stops them writing the row",
    probe: async (admin) =>
      (
        await admin
          .from("product_staff_details")
          .select("*")
          .eq("product_id", PRODUCT)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("product_staff_details")
          .update({ material_url: "https://evil.example/defaced" })
          .eq("product_id", PRODUCT)
          .select("product_id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("product_staff_details")
          .delete()
          .eq("product_id", PRODUCT)
          .select("product_id")
      ),
  },

  product_translations: {
    attacker: "customer2",
    why: "public-facing copy on someone else's product",
    probe: async (admin) =>
      (
        await admin
          .from("product_translations")
          .select("*")
          .eq("product_id", PRODUCT)
          .eq("locale", "en")
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("product_translations")
          .update({ name: "Defaced" })
          .eq("product_id", PRODUCT)
          .eq("locale", "en")
          .select("product_id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("product_translations")
          .delete()
          .eq("product_id", PRODUCT)
          .eq("locale", "en")
          .select("product_id")
      ),
  },

  holiday_calendars: {
    attacker: "customer2",
    why: "publicly readable, admin-writable — the classic read/write mismatch",
    probe: async (admin) =>
      (
        await admin
          .from("holiday_calendars")
          .select("*")
          .eq("id", CALENDAR)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("holiday_calendars")
          .update({ name: "Defaced" })
          .eq("id", CALENDAR)
          .select("id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("holiday_calendars")
          .delete()
          .eq("id", CALENDAR)
          .select("id")
      ),
  },

  calendar_holidays: {
    attacker: "customer2",
    why: "deleting a holiday silently reinstates a cancelled session",
    probe: async (admin) =>
      (
        await admin
          .from("calendar_holidays")
          .select("*")
          .eq("id", HOLIDAY)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("calendar_holidays")
          .update({ reason: "Defaced" })
          .eq("id", HOLIDAY)
          .select("id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("calendar_holidays")
          .delete()
          .eq("id", HOLIDAY)
          .select("id")
      ),
  },

  product_holiday_calendars: {
    attacker: "customer2",
    why: "unlinking a calendar from someone else's product",
    probe: async (admin) =>
      (
        await admin
          .from("product_holiday_calendars")
          .select("*")
          .eq("product_id", PRODUCT)
          .eq("calendar_id", CALENDAR)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("product_holiday_calendars")
          .update({ created_at: new Date(0).toISOString() })
          .eq("product_id", PRODUCT)
          .eq("calendar_id", CALENDAR)
          .select("product_id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("product_holiday_calendars")
          .delete()
          .eq("product_id", PRODUCT)
          .eq("calendar_id", CALENDAR)
          .select("product_id")
      ),
  },

  site_details: {
    attacker: "gedu",
    why: "a gedu can *read* site addresses — read access must not imply write",
    probe: async (admin) =>
      (
        await admin
          .from("site_details")
          .select("*")
          .eq("location_id", TEST_IDS.LOCATION_SITE)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("site_details")
          .update({ address: "Defaced" })
          .eq("location_id", TEST_IDS.LOCATION_SITE)
          .select("location_id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("site_details")
          .delete()
          .eq("location_id", TEST_IDS.LOCATION_SITE)
          .select("location_id")
      ),
  },

  site_staff_details: {
    attacker: "gedu",
    why: "same read/write asymmetry as site_details",
    probe: async (admin) =>
      (
        await admin
          .from("site_staff_details")
          .select("*")
          .eq("location_id", TEST_IDS.LOCATION_SITE)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("site_staff_details")
          .update({ notes: "Defaced" })
          .eq("location_id", TEST_IDS.LOCATION_SITE)
          .select("location_id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client
          .from("site_staff_details")
          .delete()
          .eq("location_id", TEST_IDS.LOCATION_SITE)
          .select("location_id")
      ),
  },

  voice_zones: {
    attacker: "gamer",
    why: "the gamer is a member of this group — they can see the zone, and only the moderator clause stops them editing it",
    probe: async (admin) =>
      (await admin.from("voice_zones").select("*").eq("id", ZONE).maybeSingle())
        .data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("voice_zones")
          .update({ is_locked: false, name: "Unlocked" })
          .eq("id", ZONE)
          .select("id")
      ),
    remove: async (client) =>
      outcomeOf(
        await client.from("voice_zones").delete().eq("id", ZONE).select("id")
      ),
  },

  voice_private_zone_occupants: {
    attacker: "gamer",
    why: "the gamer IS the occupant — 'a gamer cannot free themselves' is the whole point of the private-zone model",
    probe: async (admin) =>
      (
        await admin
          .from("voice_private_zone_occupants")
          .select("*")
          .eq("zone_id", ZONE)
          .eq("user_id", TEST_IDS.GAMER)
          .maybeSingle()
      ).data,
    remove: async (client) =>
      outcomeOf(
        await client
          .from("voice_private_zone_occupants")
          .delete()
          .eq("zone_id", ZONE)
          .eq("user_id", TEST_IDS.GAMER)
          .select("id")
      ),
  },

  gedu_locations: {
    attacker: "customer2",
    why: "coverage rows are self-managed by gedus; nobody else may touch them",
    probe: async (admin) =>
      (
        await admin
          .from("gedu_locations")
          .select("*")
          .eq("gedu_id", TEST_IDS.GEDU)
          .eq("location_id", TEST_IDS.LOCATION_COUNTRY)
          .maybeSingle()
      ).data,
    remove: async (client) =>
      outcomeOf(
        await client
          .from("gedu_locations")
          .delete()
          .eq("gedu_id", TEST_IDS.GEDU)
          .eq("location_id", TEST_IDS.LOCATION_COUNTRY)
          .select("gedu_id")
      ),
  },

  gamer_profiles: {
    attacker: "customer",
    why: "the linked *parent* — who may read this row — must still not write it; the only self-update policy is the gamer's own",
    probe: async (admin) =>
      (
        await admin
          .from("gamer_profiles")
          .select("*")
          .eq("user_id", TEST_IDS.GAMER)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("gamer_profiles")
          .update({ date_of_birth: "2001-01-01" })
          .eq("user_id", TEST_IDS.GAMER)
          .select("user_id")
      ),
  },

  parent_gamer: {
    attacker: "customer2",
    why: "another customer severing someone else's parent link",
    probe: async (admin) =>
      (
        await admin
          .from("parent_gamer")
          .select("*")
          .eq("id", TEST_IDS.PARENT_GAMER_LINK)
          .maybeSingle()
      ).data,
    remove: async (client) =>
      outcomeOf(
        await client
          .from("parent_gamer")
          .delete()
          .eq("id", TEST_IDS.PARENT_GAMER_LINK)
          .select("id")
      ),
  },

  whatsapp_contacts: {
    attacker: "customer2",
    why: "the WhatsApp inbox is admin-only",
    probe: async (admin) =>
      (
        await admin
          .from("whatsapp_contacts")
          .select("*")
          .eq("phone", WHATSAPP_PHONE)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("whatsapp_contacts")
          .update({ wa_name: "Defaced" })
          .eq("phone", WHATSAPP_PHONE)
          .select("phone")
      ),
  },

  // whatsapp_messages has no case: Phase 3 revoked `authenticated`'s dead UPDATE
  // grant (it had no policy behind it), so message history is now unwritable at
  // the grant layer — a stronger guarantee than an RLS assertion, and one the
  // access-control test's grant allowlist already pins. `authenticated` keeps
  // INSERT, which this loop deliberately does not cover (see the header).

  locations: {
    attacker: "customer2",
    why: "locations are world-readable reference data that only an admin may edit — the classic read/write mismatch, now that authenticated holds the raw grant",
    probe: async (admin) =>
      (
        await admin
          .from("locations")
          .select("*")
          .eq("id", TEST_IDS.LOCATION_SITE)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("locations")
          .update({ name: "Defaced" })
          .eq("id", TEST_IDS.LOCATION_SITE)
          .select("id")
      ),
  },

  minecraft_accounts: {
    attacker: "customer",
    why: "the linked *parent* may read their gamer's Minecraft row — the self-write policies must still keep them from editing it",
    probe: async (admin) =>
      (
        await admin
          .from("minecraft_accounts")
          .select("*")
          .eq("user_id", TEST_IDS.GAMER)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("minecraft_accounts")
          .update({ minecraft_username: "Defaced" })
          .eq("user_id", TEST_IDS.GAMER)
          .select("user_id")
      ),
  },

  roblox_accounts: {
    attacker: "customer",
    why: "the linked *parent* may read their gamer's Roblox row — the self-write policies must still keep them from editing it",
    probe: async (admin) =>
      (
        await admin
          .from("roblox_accounts")
          .select("*")
          .eq("user_id", TEST_IDS.GAMER)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("roblox_accounts")
          .update({ roblox_username: "Defaced" })
          .eq("user_id", TEST_IDS.GAMER)
          .select("user_id")
      ),
  },

  profiles: {
    attacker: "customer2",
    why: "column-granted UPDATE still has to be scoped to the caller's own row",
    probe: async (admin) =>
      (
        await admin
          .from("profiles")
          .select("*")
          .eq("id", TEST_IDS.CUSTOMER)
          .maybeSingle()
      ).data,
    update: async (client) =>
      outcomeOf(
        await client
          .from("profiles")
          .update({ first_name: "Defaced" })
          .eq("id", TEST_IDS.CUSTOMER)
          .select("id")
      ),
  },
};

describe("write-path IDOR (§3.4 check 3)", () => {
  let admin: SupabaseClient<Database>;
  const clients = new Map<Attacker, SupabaseClient<Database>>();

  function clientFor(attacker: Attacker): SupabaseClient<Database> {
    const client = clients.get(attacker);
    if (client === undefined) throw new Error(`no client for ${attacker}`);
    return client;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();

    for (const attacker of ATTACKERS) {
      clients.set(
        attacker,
        await createAuthenticatedClient(
          ATTACKER_CREDENTIALS[attacker].email,
          ATTACKER_CREDENTIALS[attacker].password
        )
      );
    }

    await deleteTestProducts(admin, [PRODUCT]);
    await admin.from("holiday_calendars").delete().eq("id", CALENDAR);
    await admin.from("whatsapp_contacts").delete().eq("phone", WHATSAPP_PHONE);
    await admin.from("product_images").delete().eq("id", IMAGE);

    await createTestProduct(admin, { id: PRODUCT, seatCount: null });

    // `sha256` and `path` are UNIQUE table-wide, so these are shaped to be
    // impossible for a real entry to hold: a real hash is 64 hex characters.
    await admin.from("product_images").insert({
      id: IMAGE,
      label: "IDOR fixture",
      sha256: "idor-fixture",
      path: "idor-fixture.png",
    });

    await admin
      .from("schedule_slots")
      .insert({
        id: SLOT,
        product_id: PRODUCT,
        weekday: 2,
        start_time: "16:00",
        duration_minutes: 60,
      });
    await admin
      .from("product_prices")
      .insert({ product_id: PRODUCT, currency: "eur", price_cents: 4000 });
    await admin.from("product_staff_details").insert({
      product_id: PRODUCT,
      material_url: "https://drive.sog.gg/idor-fixture",
    });
    await admin.from("product_translations").insert({
      product_id: PRODUCT,
      locale: "en",
      name: "IDOR fixture",
      short_description: "Seeded by write-idor.test.ts",
    });

    await admin
      .from("holiday_calendars")
      .insert({ id: CALENDAR, name: "IDOR calendar", timezone: "UTC" });
    await admin
      .from("calendar_holidays")
      .insert({ id: HOLIDAY, calendar_id: CALENDAR, date: "2099-01-01" });
    await admin
      .from("product_holiday_calendars")
      .insert({ product_id: PRODUCT, calendar_id: CALENDAR });

    await admin.from("site_details").upsert({
      location_id: TEST_IDS.LOCATION_SITE,
      address: "Seeded by write-idor.test.ts",
      notes: "Seeded",
    });
    await admin.from("site_staff_details").upsert({
      location_id: TEST_IDS.LOCATION_SITE,
      notes: "Seeded by write-idor.test.ts",
    });

    // The gamer is an active participant in GROUP, which makes them a voice
    // *member* — the sharp attacker for the two voice tables.
    await admin
      .from("product_groups")
      .insert({ id: GROUP, product_id: PRODUCT, name: "IDOR" });
    await admin.from("participations").insert({
      product_id: PRODUCT,
      group_id: GROUP,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });
    await admin.from("voice_zones").insert({
      id: ZONE,
      group_id: GROUP,
      name: "Private",
      icon: "ghost",
      color: "indigo",
      is_locked: true,
      created_by: TEST_IDS.ADMIN,
    });
    await admin.from("voice_private_zone_occupants").insert({
      zone_id: ZONE,
      group_id: GROUP,
      user_id: TEST_IDS.GAMER,
      placed_by: TEST_IDS.ADMIN,
      session_opens_at: new Date().toISOString(),
    });

    await admin
      .from("gedu_locations")
      .delete()
      .eq("gedu_id", TEST_IDS.GEDU)
      .eq("location_id", TEST_IDS.LOCATION_COUNTRY);
    await admin.from("gedu_locations").insert({
      gedu_id: TEST_IDS.GEDU,
      location_id: TEST_IDS.LOCATION_COUNTRY,
    });

    await admin
      .from("whatsapp_contacts")
      .insert({ phone: WHATSAPP_PHONE, wa_name: "IDOR fixture" });

    // The gamer's game-identity rows: owned by the gamer, readable by their
    // linked parent, and therefore the sharp attacker's target. Seeded here
    // rather than relied on from seed.sql because the two per-platform RLS
    // tests delete them.
    await admin.from("minecraft_accounts").upsert(
      { user_id: TEST_IDS.GAMER, minecraft_username: "IDOR fixture" },
      { onConflict: "user_id" },
    );
    await admin.from("roblox_accounts").upsert(
      { user_id: TEST_IDS.GAMER, roblox_username: "IDORfixture" },
      { onConflict: "user_id" },
    );
  });

  afterAll(async () => {
    await deleteTestProducts(admin, [PRODUCT]);
    await admin.from("holiday_calendars").delete().eq("id", CALENDAR);
    await admin.from("whatsapp_contacts").delete().eq("phone", WHATSAPP_PHONE);
    await admin.from("product_images").delete().eq("id", IMAGE);
    await admin
      .from("gedu_locations")
      .delete()
      .eq("gedu_id", TEST_IDS.GEDU)
      .eq("location_id", TEST_IDS.LOCATION_COUNTRY);
    await admin
      .from("site_details")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
    await admin
      .from("site_staff_details")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
  });

  async function assertBlocked(testCase: IdorCase, attempt: Attempt) {
    const before = await testCase.probe(admin);
    expect(
      before,
      "the victim row was never seeded — this attack would pass vacuously"
    ).not.toBeNull();

    const result = await attempt(clientFor(testCase.attacker));

    expect(result.rows, `rows written: ${JSON.stringify(result)}`).toBe(0);
    expect(await testCase.probe(admin), "the victim row changed").toEqual(
      before
    );
  }

  for (const [table, testCase] of Object.entries(CASES)) {
    describe(table, () => {
      const update = testCase.update;
      const remove = testCase.remove;

      if (update) {
        it(`refuses an UPDATE by a ${testCase.attacker}`, async () => {
          await assertBlocked(testCase, update);
        });
      }

      if (remove) {
        it(`refuses a DELETE by a ${testCase.attacker}`, async () => {
          await assertBlocked(testCase, remove);
        });
      }
    });
  }

  it("covers every table authenticated can UPDATE or DELETE", async () => {
    const { data, error } = await admin.rpc("_list_table_grants", {
      p_grantee: "authenticated",
    });
    expect(error).toBeNull();

    const granted = new Set(
      tableGrantRows
        .parse(data)
        .filter(
          (row) =>
            row.privilege_type === "UPDATE" || row.privilege_type === "DELETE"
        )
        .map((row) => row.table_name)
    );
    for (const table of COLUMN_GRANT_ONLY_TABLES) granted.add(table);

    const covered = new Set(Object.keys(CASES));

    const uncovered = [...granted].filter((table) => !covered.has(table)).sort();
    expect(
      uncovered,
      "a table gained a write grant without an IDOR case — add one above"
    ).toEqual([]);

    const stale = [...covered].filter((table) => !granted.has(table)).sort();
    expect(stale, "an IDOR case names a table with no write grant").toEqual([]);
  });

  it("declares the right kind of attempt for each granted privilege", async () => {
    // A case that seeds a fixture but never attempts the privilege the database
    // actually grants is worse than no case at all — it reads as coverage.
    const { data } = await admin.rpc("_list_table_grants", {
      p_grantee: "authenticated",
    });

    const grants = tableGrantRows.parse(data);
    const missing: string[] = [];

    for (const [table, testCase] of Object.entries(CASES)) {
      const privileges = new Set(
        grants
          .filter((row) => row.table_name === table)
          .map((row) => row.privilege_type)
      );
      // profiles' UPDATE is column-level, so it never appears above.
      if (COLUMN_GRANT_ONLY_TABLES.includes(table)) privileges.add("UPDATE");

      if (privileges.has("UPDATE") && !testCase.update) {
        missing.push(`${table}.UPDATE`);
      }
      if (privileges.has("DELETE") && !testCase.remove) {
        missing.push(`${table}.DELETE`);
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});
