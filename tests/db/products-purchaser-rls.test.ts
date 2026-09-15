import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Pins the parent-side dashboard reads against a product whose term ended long
 * ago: the "My Clubs / Camps / Events" rail join and the detail join the
 * upcoming-sessions read runs. Both walk `participations` → `products` →
 * (`schedule_slots`, `product_translations`), and each of those tables decides
 * the product half with the same read predicate, so a product that dropped out
 * of any layer would take the family's own history off their dashboard.
 *
 * **What this file used to be, and why it is smaller now.** It pinned a
 * *purchaser carve-out*: a product the public could no longer read stayed
 * readable for the customer who bought a place on it, and the negative controls
 * were the point — a `reserving` row, no participation at all, another
 * customer's participation and an anonymous visitor each had to come back
 * empty. There is no carve-out to pin any more. Every product stays readable by
 * direct link forever (owner decision, 2026-09-15), so nobody is refused and
 * five cases were deleted rather than inverted:
 *
 *   - "customer with only a reserving row CANNOT SELECT the closed product"
 *   - "customer with no participation CANNOT SELECT the closed product"
 *   - "a different customer's active participation does NOT grant access"
 *   - "anon CANNOT SELECT a closed product"
 *   - the rail join's third row, whose whole job was to be RLS-nulled
 *
 * Each of them asserted that some caller could not read a product, and no
 * caller cannot. The predicate's own before/after — every caller gets the same
 * answer for any product that exists, and `false` only for an id no product has
 * — is proved once, in `exposed-function-scope.test.ts`. What is left here is
 * the *surface* claim, which is not a predicate claim and did not move: these
 * two joins hand the dashboard a whole product, slots and names included.
 */

/**
 * A term that ended long ago, in a zone that cannot argue about it: the
 * fixtures' timezone is UTC and the date is years back. It no longer closes a
 * read — nothing does — but it is still what makes these the *history* reads
 * rather than ordinary ones.
 */
const CLOSED_END = "2020-01-31";

const CLOSED_ACTIVE_PRODUCT = "00000000-0000-0000-0000-0000000005e5";
const CLOSED_WAITLISTED_PRODUCT = "00000000-0000-0000-0000-0000000005e6";
const ALL_PRODUCTS = [CLOSED_ACTIVE_PRODUCT, CLOSED_WAITLISTED_PRODUCT];

describe("products purchaser-read RLS (00047)", () => {
  let admin: SupabaseClient<Database>;
  let customerClient: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    customerClient = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);

    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, endDate: CLOSED_END, seatCount: 10 });
    }

    // CUSTOMER's participations, one of each kind the rail renders.
    // RLS would block these inserts for a customer client; admin client
    // bypasses RLS so we can stage rows that mirror the post-purchase
    // state without going through the SECURITY DEFINER signup RPC.
    const seed = await admin.from("participations").insert([
      {
        product_id: CLOSED_ACTIVE_PRODUCT,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: CLOSED_WAITLISTED_PRODUCT,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "waitlisted",
        waitlisted_at: new Date().toISOString(),
      },
    ]);
    if (seed.error) throw seed.error;

    // The parent dashboard's `getMyUpcomingSessions("customer")` embeds the
    // product's schedule slots and translations under the product. Seed both
    // on the active product so the detail-join assertion can prove the read
    // reaches the *children*, not just the product row — an empty slots array
    // drops the session from the dashboard and an empty translations array
    // renders a blank product name.
    await createScheduleSlot(admin, CLOSED_ACTIVE_PRODUCT, {
      weekday: 1,
      startTime: "10:00",
    });
    const trans = await admin.from("product_translations").insert({
      product_id: CLOSED_ACTIVE_PRODUCT,
      locale: "en",
      name: "Finished Camp",
      short_description: "Seeded for the detail-join RLS assertion.",
    });
    if (trans.error) throw trans.error;
  });

  afterAll(async () => {
    // Products cascade to participations.
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  it("customer with an active participation can SELECT the ended product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id, end_date")
      .eq("id", CLOSED_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_ACTIVE_PRODUCT);
    // Non-vacuity: the row really is one whose term is years over, which is the
    // shape the dashboard has to keep rendering.
    expect(data?.end_date).toBe(CLOSED_END);
  });

  it("customer with a waitlisted participation can SELECT the ended product", async () => {
    const { data, error } = await customerClient
      .from("products")
      .select("id, end_date")
      .eq("id", CLOSED_WAITLISTED_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(CLOSED_WAITLISTED_PRODUCT);
    expect(data?.end_date).toBe(CLOSED_END);
  });

  it("rail join: the active and waitlisted rows both carry their product", async () => {
    // A customer reads their own participations with the product embedded
    // (just the columns the assertion needs). This is the shape the rail
    // renders from: a row whose embedded product came back null is a card with
    // no club on it.
    const { data, error } = await customerClient
      .from("participations")
      .select("product_id, status, product:products(id, end_date)")
      .in("product_id", ALL_PRODUCTS);

    expect(error).toBeNull();
    const byProduct = new Map((data ?? []).map((row) => [row.product_id, row]));

    expect(byProduct.get(CLOSED_ACTIVE_PRODUCT)?.product.id).toBe(
      CLOSED_ACTIVE_PRODUCT,
    );
    expect(byProduct.get(CLOSED_WAITLISTED_PRODUCT)?.product.id).toBe(
      CLOSED_WAITLISTED_PRODUCT,
    );
    expect(byProduct.get(CLOSED_WAITLISTED_PRODUCT)?.status).toBe("waitlisted");
  });

  it("detail join: the purchaser reads the ended product's slots and translations", async () => {
    const { data: row, error } = await customerClient
      .from("products")
      .select(
        "id, end_date, schedule_slots(weekday), product_translations(locale, name)",
      )
      .eq("id", CLOSED_ACTIVE_PRODUCT)
      .maybeSingle();

    expect(error).toBeNull();
    expect(row?.id).toBe(CLOSED_ACTIVE_PRODUCT);
    expect(row?.end_date).toBe(CLOSED_END);
    // The product row is not enough: the satellite tables carry their own
    // policies, and the dashboard reads both through this join.
    expect(row?.schedule_slots.length).toBeGreaterThan(0);
    expect(row?.product_translations.length).toBeGreaterThan(0);
  });
});
