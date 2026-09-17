import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * `session_feedback` (00254, its answers shape tightened by 00255) — the row a
 * child writes on the way out of an
 * online session, and the scope test the write-IDOR loop deliberately does not
 * cover.
 *
 * That loop is UPDATE/DELETE-only by design (a blocked INSERT and a constraint
 * violation both come back as an error, so it would risk passing for the wrong
 * reason). Everything an INSERT has to prove therefore lives here, together
 * with the read scoping and the shape constraints:
 *
 *   - The policy authorises BOTH halves — the caller is the participant named
 *     on the row AND holds an active participation in the group. A case for
 *     each half failing on its own, so neither can be carrying the other.
 *   - A member reads their own row and nobody else's, proven with two children
 *     seated in the SAME group each holding a row.
 *   - The UPDATE policy's WITH CHECK, which is what stops an existing row being
 *     re-keyed on the way through. A `WITH CHECK` refusal is an ERROR, unlike a
 *     `USING` miss, which is a success over zero rows — so those cases assert on
 *     the error AND on the row still reading back unchanged.
 *   - The shape checks: `{}` is legal, a level of 9 is not, a value that merely
 *     CONTAINS a level or holds none — an array, an object, a null — is not, a
 *     note over 2000 characters is not, and an exit reason outside the two
 *     words is not.
 *   - The upsert on the natural key updates rather than duplicating, which is
 *     what "the last Done wins" rests on.
 *
 * Fixtures — groups, seats and the rows the read and update cases act on — are
 * built in `beforeAll` as admin: seed.sql has no groups and no seats, and a case
 * that depended on a row a previous `it` happened to write would pass or fail on
 * the order the file happened to run in. Every case below stands alone.
 *
 *   PRODUCT_X / GROUP_X — GAMER and GAMER_2 both hold an active seat.
 *   PRODUCT_Y / GROUP_Y — nobody does. It is the control that makes every
 *                         "refused in a group they are not in" case fail for
 *                         the group clause alone.
 */

const PRODUCT_X = "00000000-0000-0000-0000-000000000801";
const PRODUCT_Y = "00000000-0000-0000-0000-000000000802";
const GROUP_X = "00000000-0000-0000-0000-000000000803";
const GROUP_Y = "00000000-0000-0000-0000-000000000804";
const ALL_PRODUCTS = [PRODUCT_X, PRODUCT_Y];

/**
 * Fixed window instants, one per concern, so a case that writes a row cannot
 * move a row another case asserts on. They are arbitrary — the column is
 * client-asserted and bounds nothing, which is the whole point of it.
 */
const WINDOW_OWN = "2026-06-16T10:00:00+00:00";
const WINDOW_SIBLING = "2026-06-16T11:00:00+00:00";
const WINDOW_UPSERT = "2026-06-16T12:00:00+00:00";
const WINDOW_SHAPE = "2026-06-16T13:00:00+00:00";
const WINDOW_WRITE = "2026-06-16T14:00:00+00:00";
const WINDOW_REKEY = "2026-06-16T15:00:00+00:00";

/** The rows `beforeAll` lays down, so the cases that read or update one do not
 * have to have written it. WINDOW_OWN and WINDOW_SIBLING are the pair the read
 * scoping is proven on; WINDOW_REKEY is the row the re-keying attempts aim at.
 * WINDOW_WRITE and WINDOW_UPSERT are left empty for the cases that write them. */
const SEEDED_ROWS = [
  {
    group_id: GROUP_X,
    participant_id: TEST_IDS.GAMER,
    session_opens_at: WINDOW_OWN,
    answers: { learned: 5, fun: 4 },
    note: "It was good",
    exit_reason: "left",
  },
  {
    group_id: GROUP_X,
    participant_id: TEST_IDS.GAMER_2,
    session_opens_at: WINDOW_SIBLING,
    answers: { learned: 3 },
    note: "",
    exit_reason: "ended",
  },
  {
    group_id: GROUP_X,
    participant_id: TEST_IDS.GAMER,
    session_opens_at: WINDOW_REKEY,
    answers: { learned: 2 },
    note: "mine",
    exit_reason: "left",
  },
];

describe("session_feedback RLS + shape constraints", () => {
  let admin: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let gamer2Auth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let customer2Auth: SupabaseClient<Database>;

  beforeAll(async () => {
    admin = createAdminTestClient();
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );
    gamer2Auth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER_2.email,
      TEST_CREDENTIALS.GAMER_2.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    customer2Auth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER_2.email,
      TEST_CREDENTIALS.CUSTOMER_2.password,
    );

    await deleteTestProducts(admin, ALL_PRODUCTS);
    await createTestProduct(admin, { id: PRODUCT_X, seatCount: 50 });
    await createTestProduct(admin, { id: PRODUCT_Y, seatCount: 50 });

    const groups = await admin.from("product_groups").insert([
      { id: GROUP_X, product_id: PRODUCT_X, name: "X" },
      { id: GROUP_Y, product_id: PRODUCT_Y, name: "Y" },
    ]);
    if (groups.error) {
      throw new Error(`seed product_groups failed: ${groups.error.message}`);
    }

    // Two children, one group, one parent — the sibling pair is what makes
    // "reads only their own row" provable rather than merely true.
    const seats = await admin.from("participations").insert([
      {
        product_id: PRODUCT_X,
        group_id: GROUP_X,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: PRODUCT_X,
        group_id: GROUP_X,
        participant_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
    ]);
    if (seats.error) {
      throw new Error(`seed participations failed: ${seats.error.message}`);
    }

    // The rows the read and update cases act on, written as admin so that no
    // case is a precondition for another. The policies are proven by the cases
    // that write through them, not by the fixture.
    const rows = await admin.from("session_feedback").insert(SEEDED_ROWS);
    if (rows.error) {
      throw new Error(`seed session_feedback failed: ${rows.error.message}`);
    }
  });

  afterAll(async () => {
    // session_feedback cascades from product_groups, which cascades from the
    // product — but delete it explicitly first so a failed run cannot leave
    // rows behind a teardown that threw earlier.
    await admin
      .from("session_feedback")
      .delete()
      .in("group_id", [GROUP_X, GROUP_Y]);
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // -------------------------------------------------------------------------
  // The happy path, and the read scoping beside it.
  // -------------------------------------------------------------------------

  describe("a seated child's own row", () => {
    // The write nothing else depends on: it takes a window of its own, so the
    // read cases below are proven against the seeded rows rather than against
    // whatever this one happened to leave behind.
    it("writes and reads back their own answers", async () => {
      const { error } = await gamerAuth.from("session_feedback").insert({
        group_id: GROUP_X,
        participant_id: TEST_IDS.GAMER,
        session_opens_at: WINDOW_WRITE,
        answers: { learned: 5, fun: 4 },
        note: "It was good",
        exit_reason: "left",
      });
      expect(error).toBeNull();

      const { data } = await gamerAuth
        .from("session_feedback")
        .select("answers, note, exit_reason")
        .eq("group_id", GROUP_X)
        .eq("participant_id", TEST_IDS.GAMER)
        .eq("session_opens_at", WINDOW_WRITE)
        .maybeSingle();
      expect(data?.answers).toEqual({ learned: 5, fun: 4 });
      expect(data?.note).toBe("It was good");
      expect(data?.exit_reason).toBe("left");
    });

    it("reads only their own row, not their group-mate's", async () => {
      // Both rows are seeded, so a policy that leaked would have something to
      // leak, and neither of them is another case's leftovers.
      const seen = await admin
        .from("session_feedback")
        .select("participant_id")
        .eq("group_id", GROUP_X)
        .in("session_opens_at", [WINDOW_OWN, WINDOW_SIBLING]);
      expect((seen.data ?? []).length).toBe(2);

      const { data } = await gamerAuth
        .from("session_feedback")
        .select("participant_id, session_opens_at")
        .eq("group_id", GROUP_X)
        .in("session_opens_at", [WINDOW_OWN, WINDOW_SIBLING]);
      expect((data ?? []).map((row) => row.participant_id)).toEqual([
        TEST_IDS.GAMER,
      ]);
    });

    it("an upsert on the key replaces the answers rather than duplicating", async () => {
      const first = await gamerAuth.from("session_feedback").upsert(
        {
          group_id: GROUP_X,
          participant_id: TEST_IDS.GAMER,
          session_opens_at: WINDOW_UPSERT,
          answers: { learned: 2 },
          note: "first",
          exit_reason: "ended",
        },
        { onConflict: "group_id,participant_id,session_opens_at" },
      );
      expect(first.error).toBeNull();

      // The second Done, with the earlier answers cleared away entirely — the
      // emptied form, which is an update and never a delete.
      const second = await gamerAuth.from("session_feedback").upsert(
        {
          group_id: GROUP_X,
          participant_id: TEST_IDS.GAMER,
          session_opens_at: WINDOW_UPSERT,
          answers: {},
          note: "",
          exit_reason: "left",
        },
        { onConflict: "group_id,participant_id,session_opens_at" },
      );
      expect(second.error).toBeNull();

      const { data } = await admin
        .from("session_feedback")
        .select("answers, note, exit_reason")
        .eq("group_id", GROUP_X)
        .eq("participant_id", TEST_IDS.GAMER)
        .eq("session_opens_at", WINDOW_UPSERT);
      expect((data ?? []).length).toBe(1);
      expect(data?.[0].answers).toEqual({});
      expect(data?.[0].note).toBe("");
      expect(data?.[0].exit_reason).toBe("left");
    });
  });

  // -------------------------------------------------------------------------
  // Both halves of the policy, each failing on its own.
  // -------------------------------------------------------------------------

  describe("the INSERT policy authorises actor and target", () => {
    it("refuses a seated child writing a row in another child's name", async () => {
      // The group half is satisfied outright — gamer2 holds a seat in GROUP_X.
      // Only `participant_id = auth.uid()` is left to fail, which is the
      // clause under test.
      const { error } = await gamer2Auth.from("session_feedback").insert({
        group_id: GROUP_X,
        participant_id: TEST_IDS.GAMER,
        session_opens_at: "2026-06-17T10:00:00+00:00",
        answers: { learned: 1 },
        note: "Written by somebody else",
        // Every column the schema requires is present, so the policy is the
        // only thing that can refuse the row.
        exit_reason: "left",
      });
      expect(error).not.toBeNull();
    });

    it("refuses a child writing their own row in a group they hold no seat in", async () => {
      // The mirror image: the participant half is satisfied and the group half
      // is the only thing standing.
      const { error } = await gamer2Auth.from("session_feedback").insert({
        group_id: GROUP_Y,
        participant_id: TEST_IDS.GAMER_2,
        session_opens_at: "2026-06-17T11:00:00+00:00",
        answers: { learned: 5 },
        exit_reason: "left",
      });
      expect(error).not.toBeNull();
    });

    it("refuses a non-member outright", async () => {
      const { error } = await customer2Auth.from("session_feedback").insert({
        group_id: GROUP_X,
        participant_id: TEST_IDS.CUSTOMER_2,
        session_opens_at: "2026-06-17T12:00:00+00:00",
        answers: { learned: 5 },
        exit_reason: "left",
      });
      expect(error).not.toBeNull();
    });

    it("refuses the paying parent writing their own child's row", async () => {
      // The reused seat predicate is satisfied through `customer_id`, so this
      // parent passes the group half — and is still refused, because the row
      // names the child and not them. The answers are the child's words.
      const { error } = await customerAuth.from("session_feedback").insert({
        group_id: GROUP_X,
        participant_id: TEST_IDS.GAMER,
        session_opens_at: "2026-06-17T13:00:00+00:00",
        answers: { learned: 5 },
        note: "Written by a parent",
        exit_reason: "left",
      });
      expect(error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // The UPDATE policy's WITH CHECK: what a row is allowed to BECOME.
  //
  // `USING` and `WITH CHECK` fail differently and the difference is the point.
  // A `USING` miss is an ordinary success over zero rows — the statement simply
  // never sees the row. A `WITH CHECK` violation is an ERROR ("new row violates
  // row-level security policy"), because the row was visible, was updated, and
  // the result was refused. Both cases below start from a row this child owns
  // and may see, so `USING` passes and `WITH CHECK` is the only thing standing;
  // asserting merely that no rows came back would pass even if the policy had
  // no `WITH CHECK` at all.
  // -------------------------------------------------------------------------

  describe("the UPDATE policy authorises what the row becomes", () => {
    async function rekeyRowAsAdmin(): Promise<{
      participant_id: string;
      group_id: string;
      note: string;
    } | null> {
      const { data } = await admin
        .from("session_feedback")
        .select("participant_id, group_id, note")
        .eq("group_id", GROUP_X)
        .eq("participant_id", TEST_IDS.GAMER)
        .eq("session_opens_at", WINDOW_REKEY)
        .maybeSingle();
      return data;
    }

    it("refuses re-keying their own row to their group-mate", async () => {
      const { error } = await gamerAuth
        .from("session_feedback")
        .update({ participant_id: TEST_IDS.GAMER_2, note: "handed over" })
        .eq("group_id", GROUP_X)
        .eq("participant_id", TEST_IDS.GAMER)
        .eq("session_opens_at", WINDOW_REKEY);
      expect(error).not.toBeNull();

      // And the row is still theirs, unedited — the refusal is not a silent
      // partial write.
      expect(await rekeyRowAsAdmin()).toEqual({
        participant_id: TEST_IDS.GAMER,
        group_id: GROUP_X,
        note: "mine",
      });
    });

    it("refuses moving their own row to a group they hold no seat in", async () => {
      const { error } = await gamerAuth
        .from("session_feedback")
        .update({ group_id: GROUP_Y, note: "moved" })
        .eq("group_id", GROUP_X)
        .eq("participant_id", TEST_IDS.GAMER)
        .eq("session_opens_at", WINDOW_REKEY);
      expect(error).not.toBeNull();

      expect(await rekeyRowAsAdmin()).toEqual({
        participant_id: TEST_IDS.GAMER,
        group_id: GROUP_X,
        note: "mine",
      });
    });
  });

  // -------------------------------------------------------------------------
  // The shape constraints. Keys are unconstrained on purpose; values are not.
  // -------------------------------------------------------------------------

  describe("the shape constraints", () => {
    async function insertShape(row: {
      answers?: Json;
      note?: string;
      exit_reason?: string;
    }): Promise<{ error: unknown }> {
      // A valid exit reason unless the case is about the exit reason, so every
      // other shape case is refused or admitted on the column it names.
      const { error } = await gamerAuth.from("session_feedback").insert({
        group_id: GROUP_X,
        participant_id: TEST_IDS.GAMER,
        session_opens_at: WINDOW_SHAPE,
        ...row,
        exit_reason: row.exit_reason ?? "left",
      });
      if (!error) {
        await admin
          .from("session_feedback")
          .delete()
          .eq("group_id", GROUP_X)
          .eq("participant_id", TEST_IDS.GAMER)
          .eq("session_opens_at", WINDOW_SHAPE);
      }
      return { error };
    }

    it("accepts an empty object", async () => {
      const { error } = await insertShape({ answers: {} });
      expect(error).toBeNull();
    });

    it("accepts a key the catalogue has never heard of", async () => {
      const { error } = await insertShape({ answers: { retired_item: 3 } });
      expect(error).toBeNull();
    });

    it("refuses a level of 9", async () => {
      const { error } = await insertShape({ answers: { learned: 9 } });
      expect(error).not.toBeNull();
    });

    it("refuses a level of 0", async () => {
      const { error } = await insertShape({ answers: { learned: 0 } });
      expect(error).not.toBeNull();
    });

    it("refuses a non-integer level", async () => {
      const { error } = await insertShape({ answers: { learned: 3.5 } });
      expect(error).not.toBeNull();
    });

    it("refuses a level that is not a number at all", async () => {
      const { error } = await insertShape({ answers: { learned: "5" } });
      expect(error).not.toBeNull();
    });

    // What lax mode let through, and what 00255's strict jsonpath refuses: a
    // member has to BE a level, not merely contain one or be empty of them.
    it("refuses a level wrapped in an array", async () => {
      const { error } = await insertShape({ answers: { learned: [3] } });
      expect(error).not.toBeNull();
    });

    it("refuses an empty array where a level should be", async () => {
      const { error } = await insertShape({ answers: { learned: [] } });
      expect(error).not.toBeNull();
    });

    it("refuses an object where a level should be", async () => {
      const { error } = await insertShape({ answers: { learned: { a: 1 } } });
      expect(error).not.toBeNull();
    });

    it("refuses a null where a level should be", async () => {
      const { error } = await insertShape({ answers: { learned: null } });
      expect(error).not.toBeNull();
    });

    it("refuses a boolean where a level should be", async () => {
      const { error } = await insertShape({ answers: { learned: true } });
      expect(error).not.toBeNull();
    });

    it("refuses an array where the object should be", async () => {
      const { error } = await insertShape({ answers: [5, 4] });
      expect(error).not.toBeNull();
    });

    it("refuses more than 32 entries", async () => {
      const answers: Record<string, number> = {};
      for (let i = 0; i < 33; i += 1) answers[`item_${i}`] = 3;
      const { error } = await insertShape({ answers });
      expect(error).not.toBeNull();
    });

    it("accepts exactly 32 entries", async () => {
      const answers: Record<string, number> = {};
      for (let i = 0; i < 32; i += 1) answers[`item_${i}`] = 3;
      const { error } = await insertShape({ answers });
      expect(error).toBeNull();
    });

    it("refuses a note over 2000 characters", async () => {
      const { error } = await insertShape({ note: "x".repeat(2001) });
      expect(error).not.toBeNull();
    });

    it("accepts a note of exactly 2000 characters", async () => {
      const { error } = await insertShape({ note: "x".repeat(2000) });
      expect(error).toBeNull();
    });

    it("refuses an exit reason outside the two words", async () => {
      const { error } = await insertShape({ exit_reason: "kicked" });
      expect(error).not.toBeNull();
    });
  });
});
