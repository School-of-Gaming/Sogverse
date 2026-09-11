import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * `gamer_profiles.sign_in` (00235) — who may write it, and what having a real
 * address on a child does NOT change.
 *
 * The column decides how a child reaches their own account: switch-only from
 * the parent (`parent`), a username and password of their own (`username`), or
 * their real mailbox (`email`). That makes it a privilege marker, not a
 * preference, and the two halves of this file are the two things that follow.
 *
 *   1. **Nobody in the family writes it.** `authenticated` holds column-scoped
 *      UPDATE on this table — date_of_birth and gender, the child's own facts —
 *      and `sign_in` is deliberately outside the grant, so neither the child nor
 *      their parent can hand the child a login from the browser. Only the API
 *      routes, on the service-role client, after the PIN check they make.
 *   2. **A gamer's real email never reaches a gedu.** Mode `email` is the first
 *      time a child's row carries an address a human reads, and the roster and
 *      feed RPCs a gedu can call have always emitted the PARENT's address for a
 *      child and never the participant's. That was previously true for a reason
 *      that has now gone away — a gamer's address used to be a synthetic handle,
 *      so a leak would have been embarrassing rather than harmful — which is
 *      exactly why it is pinned here now that it is load-bearing. The owner
 *      named this boundary explicitly: staff see the family's contact, not the
 *      child's.
 *
 * The second half needs a whole product, a group, a gedu assigned to it and a
 * seat on the roster, because the only way to prove an address is absent from a
 * document is to build the document that would carry it.
 */

const PRODUCT = "00000000-0000-0000-0000-0000000007f5";
const GROUP = "00000000-0000-0000-0000-0000000007f6";

/**
 * Deliberately a plausible mailbox rather than a `@test.local`-shaped one: the
 * assertion is a substring search over a whole JSON document, and a value that
 * could not appear in a real one would prove less than a value that could.
 */
const CHILD_EMAIL = "boundary.child@example.test";
const PARENT_EMAIL = "boundary.parent@example.test";

describe("gamer sign-in mode", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

  /** The family built for the boundary half: a real address on a real child. */
  let parentId: string;
  let childId: string;

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );

    await deleteTestProducts(admin, [PRODUCT]);
    await createTestProduct(admin, {
      id: PRODUCT,
      seatCount: null,
      startDate: new Date(Date.now() - 30 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    });
    await admin.from("product_translations").insert({
      product_id: PRODUCT,
      locale: "en",
      name: "Sign-in boundary fixture",
      short_description: "Seeded by gamer-sign-in.test.ts",
    });
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, PRODUCT, {
        weekday,
        startTime: "23:00",
        durationMinutes: 60,
      });
    }

    await admin
      .from("product_groups")
      .insert({ id: GROUP, product_id: PRODUCT, name: "Boundary cohort" });
    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP,
      gedu_id: TEST_IDS.GEDU,
      product_id: PRODUCT,
    });

    // A family of its own rather than the seeded one, because this child has to
    // hold a REAL address and the seeded gamer's synthetic handle is what half
    // the suite asserts on.
    const { data: parent } = await admin.auth.admin.createUser({
      email: PARENT_EMAIL,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Boundary", last_name: "Parentson" },
    });
    parentId = parent.user!.id;
    await admin.rpc("set_pin_for_user", { p_user_id: parentId, p_pin: "1234" });

    // No password, matching what mode `email` actually produces: the child sets
    // one through the reset flow after verifying the address.
    const { data: child } = await admin.auth.admin.createUser({
      email: CHILD_EMAIL,
      email_confirm: true,
      user_metadata: { first_name: "Boundary", last_name: "Parentson" },
    });
    childId = child.user!.id;

    const { error: createError } = await admin.rpc("create_gamer", {
      p_gamer_id: childId,
      p_parent_id: parentId,
      p_first_name: "Boundary",
      p_last_name: "Parentson",
      p_date_of_birth: "2015-06-15",
      p_sign_in: "email",
    });
    expect(createError).toBeNull();

    await admin.from("participations").insert({
      product_id: PRODUCT,
      group_id: GROUP,
      participant_id: childId,
      customer_id: parentId,
      status: "active",
    });
  });

  afterAll(async () => {
    await admin.from("participations").delete().eq("product_id", PRODUCT);
    await deleteTestProducts(admin, [PRODUCT]);
    for (const userId of [childId, parentId]) {
      if (!userId) continue;
      await admin.from("parent_gamer").delete().eq("gamer_id", userId);
      await admin.from("parent_gamer").delete().eq("parent_id", userId);
      await admin.from("gamer_profiles").delete().eq("user_id", userId);
      await admin.from("customer_profiles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    // The seeded gamer's row is restored rather than assumed: the write cases
    // above aim at it, and the two that are meant to SUCCEED are exactly the
    // ones that would leave it changed — including if a later assertion in the
    // same case failed before its inline restore ran.
    await admin
      .from("gamer_profiles")
      .update({ sign_in: "parent", gender: "boy" })
      .eq("user_id", TEST_IDS.GAMER);
  });

  // -------------------------------------------------------------------------
  // 1. Who may write the mode
  // -------------------------------------------------------------------------

  describe("the column is written by the routes and by nobody else", () => {
    it("defaults a gamer to switch-only", async () => {
      const { data } = await admin
        .from("gamer_profiles")
        .select("sign_in")
        .eq("user_id", TEST_IDS.GAMER_2)
        .single();

      expect(data?.sign_in).toBe("parent");
    });

    it("refuses the gamer flipping their own mode", async () => {
      // The self-update policy still admits this row — what stops the statement
      // is the grant, which reaches date_of_birth and gender and nothing else.
      // So the refusal is an error rather than zero rows affected.
      const { error } = await gamerAuth
        .from("gamer_profiles")
        .update({ sign_in: "username" })
        .eq("user_id", TEST_IDS.GAMER)
        .select("user_id");

      expect(error).not.toBeNull();

      const { data } = await admin
        .from("gamer_profiles")
        .select("sign_in")
        .eq("user_id", TEST_IDS.GAMER)
        .single();
      expect(data?.sign_in).toBe("parent");
    });

    it("refuses the parent flipping their own child's mode", async () => {
      const { error } = await customerAuth
        .from("gamer_profiles")
        .update({ sign_in: "email" })
        .eq("user_id", TEST_IDS.GAMER)
        .select("user_id");

      expect(error).not.toBeNull();

      const { data } = await admin
        .from("gamer_profiles")
        .select("sign_in")
        .eq("user_id", TEST_IDS.GAMER)
        .single();
      expect(data?.sign_in).toBe("parent");
    });

    it("still lets the gamer edit their own facts", async () => {
      // The other direction, and it is what keeps the case above from passing
      // for the wrong reason: the grant was narrowed, not withdrawn.
      const { error } = await gamerAuth
        .from("gamer_profiles")
        .update({ gender: "non_binary" })
        .eq("user_id", TEST_IDS.GAMER)
        .select("user_id");

      expect(error).toBeNull();

      await admin
        .from("gamer_profiles")
        .update({ gender: "boy" })
        .eq("user_id", TEST_IDS.GAMER);
    });

    it("lets the service-role client write it", async () => {
      const { error } = await admin
        .from("gamer_profiles")
        .update({ sign_in: "username" })
        .eq("user_id", TEST_IDS.GAMER);
      expect(error).toBeNull();

      const { data } = await admin
        .from("gamer_profiles")
        .select("sign_in")
        .eq("user_id", TEST_IDS.GAMER)
        .single();
      expect(data?.sign_in).toBe("username");

      await admin
        .from("gamer_profiles")
        .update({ sign_in: "parent" })
        .eq("user_id", TEST_IDS.GAMER);
    });
  });

  // -------------------------------------------------------------------------
  // 2. A gamer's real address never reaches a gedu
  // -------------------------------------------------------------------------

  describe("a child's real address stays inside the family", () => {
    it("gives the gedu the parent's address on the group feed, never the child's", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP,
      });
      expect(error).toBeNull();

      const document = JSON.stringify(data);
      expect(
        document.includes(CHILD_EMAIL),
        "a gamer's own address must never reach a gedu",
      ).toBe(false);
      // The positive half: the roster is not simply empty. The contact a gedu
      // gets is the family's.
      expect(document).toContain(PARENT_EMAIL);
    });

    it("gives the gedu the parent's address on the assigned-product roster too", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT,
      });
      expect(error).toBeNull();

      const document = JSON.stringify(data);
      expect(document.includes(CHILD_EMAIL)).toBe(false);
      expect(document).toContain(PARENT_EMAIL);
    });

    it("keeps the child's address out of the staff overlay entirely", async () => {
      // This one carries no address at all, for either party — asserted so a
      // future field added to it has to answer this question deliberately.
      const { data, error } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP,
      });
      expect(error).toBeNull();

      const document = JSON.stringify(data);
      expect(document.includes(CHILD_EMAIL)).toBe(false);
      expect(document.includes(PARENT_EMAIL)).toBe(false);
    });

    it("holds the same line on the admin group document", async () => {
      // Admin-only rather than gedu-callable, and pinned here anyway: it emits
      // the same participant_email predicate from the same reasoning, and a
      // change made to one and not the other is precisely how this boundary
      // would be lost. It names the parent rather than mailing them — first and
      // last name, no address for either party — so the proof that the roster
      // is not simply empty is the child's own name.
      const { data, error } = await adminAuth.rpc(
        "get_product_groups_with_details",
        { p_product_id: PRODUCT },
      );
      expect(error).toBeNull();

      const document = JSON.stringify(data);
      expect(document.includes(CHILD_EMAIL)).toBe(false);
      expect(document).toContain("Boundary");
    });
  });
});
