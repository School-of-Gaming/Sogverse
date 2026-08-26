import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  gamerGroupNoteResult,
  groupStaffOverlay,
} from "@/services/member-flair/member-flair.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createTestProduct, deleteTestProducts } from "./product-helpers";

/**
 * The two staff-only marks a gedu meets before a session starts (00203): the
 * newcomer badge's clock — `participations.group_joined_at`, wound by a trigger
 * and by nothing else — and the per-(group, member) note, read through
 * `get_group_staff_overlay` and written through `set_gamer_group_note`.
 *
 * Three things about this file are decisions rather than convenience, and each
 * would otherwise read as a gap:
 *
 * 1. **The write RPC's target check is what stands in for a write-IDOR loop
 *    entry.** `gamer_group_notes` grants `authenticated` nothing at all — every
 *    read rides a roster document or the overlay, every write goes through the
 *    RPC, and all of those are SECURITY DEFINER — so the loop in
 *    write-idor.test.ts, which is closed over "every table `authenticated` may
 *    UPDATE or DELETE", neither demands nor accepts an entry for it. The
 *    write-IDOR *requirement* is met one layer up, by the RPC authorizing the
 *    ACTOR (staff reach over the product) and the TARGET (the participant
 *    actually sits in that group), and both halves are asserted negatively
 *    below. Do not go looking for the missing loop entry.
 *
 * 2. **The second editor is a second gedu, created here, not the admin.** The
 *    plan allowed either. The seed does not: every seeded profile's
 *    `first_name` is "Test", so an admin standing in as the second editor could
 *    not be told from the first in `note_updated_by_first_name` — the very
 *    field the assertion is about. The second gedu is minted with a first name
 *    of its own, assigned to the SISTER group, and torn down in the same hook —
 *    which makes the overwrite prove the cross-group mobility at the same time.
 *    The admin's parity is asserted separately, where it does not depend on a
 *    name.
 *
 * 3. **`gedu_teaches_group_product` gets no direct coverage and no spine
 *    entry.** It is not granted to `authenticated`; it is exercised only from
 *    inside the two RPCs, which is where its behaviour is pinned.
 *
 * Layout:
 *   - PRODUCT_FLAIR (a club — the badge is a clubs-only presentation rule, and
 *     `product_type` on the overlay is what a client applies it from) carries
 *     GROUP_A, taught by the seeded GEDU with GAMER on its roster, and GROUP_B,
 *     taught by the second gedu with GAMER_2 on its roster. Neither gedu teaches
 *     the other's group, which is exactly what makes every cross-group case
 *     below about the PRODUCT rather than the group.
 *   - PRODUCT_OFF carries GROUP_OFF, which neither gedu teaches — and GAMER
 *     sits in it, so a refusal there is the ACTOR half alone. An admin writing
 *     the same note succeeds, which is what proves the target was never the
 *     problem.
 *   - PRODUCT_TRIGGER carries the trigger's own groups, kept apart from
 *     everything above because two of its cases delete rows — a group among
 *     them — and neither may disturb a roster another block is asserting on.
 */

const PRODUCT_FLAIR = "00000000-0000-0000-0000-000000000650";
const GROUP_A = "00000000-0000-0000-0000-000000000651";
const GROUP_B = "00000000-0000-0000-0000-000000000652";
const PRODUCT_OFF = "00000000-0000-0000-0000-000000000653";
const GROUP_OFF = "00000000-0000-0000-0000-000000000654";
const PRODUCT_TRIGGER = "00000000-0000-0000-0000-000000000655";
const GROUP_T1 = "00000000-0000-0000-0000-000000000656";
const GROUP_T2 = "00000000-0000-0000-0000-000000000657";
const GROUP_T3 = "00000000-0000-0000-0000-000000000658";

const ALL_PRODUCTS = [PRODUCT_FLAIR, PRODUCT_OFF, PRODUCT_TRIGGER];

/**
 * A timestamptz as whole microseconds since the epoch.
 *
 * `Date.parse` truncates to milliseconds, and two HTTP round trips can land
 * inside one — so a millisecond comparison of two stamps that really are
 * ordered would tie, and the "strictly greater" assertions below would flake on
 * a fast day rather than fail on a broken one. Postgres emits the fraction to
 * microsecond precision (and omits trailing zeros), so this pads it back out
 * and reads the last three digits `Date.parse` threw away.
 */
function micros(stamp: string): number {
  const fraction = /\.(\d+)/.exec(stamp)?.[1] ?? "";
  const padded = fraction.padEnd(6, "0").slice(0, 6);
  return Date.parse(stamp) * 1000 + Number(padded.slice(3));
}

describe("member flair", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  /** The second gedu — see note 2 in the header. */
  let sisterGeduAuth: SupabaseClient<Database>;
  let sisterGeduId = "";
  let sisterGeduFirstName = "";
  let geduFirstName = "";

  beforeAll(async () => {
    admin = createAdminTestClient();
    adminAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.ADMIN.email,
      TEST_CREDENTIALS.ADMIN.password,
    );
    geduAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GEDU.email,
      TEST_CREDENTIALS.GEDU.password,
    );
    customerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.CUSTOMER.email,
      TEST_CREDENTIALS.CUSTOMER.password,
    );
    gamerAuth = await createAuthenticatedClient(
      TEST_CREDENTIALS.GAMER.email,
      TEST_CREDENTIALS.GAMER.password,
    );

    // Unique per run: CI's database carries the seed fixtures AND whatever a
    // previous run left behind, so a fixed address is a collision waiting to
    // happen.
    const sisterEmail = `flair-sister-gedu-${Date.now()}@test.local`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: sisterEmail,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Sanni", last_name: "Sisterson" },
      });
    expect(createError).toBeNull();
    sisterGeduId = created.user!.id;

    // handle_new_user lands every signup as a customer; the gedu role and the
    // extension row are an admin's doing, exactly as in the real flow.
    await admin.from("profiles").update({ role: "gedu" }).eq("id", sisterGeduId);
    await admin.from("customer_profiles").delete().eq("user_id", sisterGeduId);
    await admin
      .from("gedu_profiles")
      .insert({ user_id: sisterGeduId, certified: true });

    sisterGeduAuth = await createAuthenticatedClient(
      sisterEmail,
      "testpassword123",
    );

    // Read both names from the database rather than restating them here: the
    // assertion is "the document names THIS person", and a hardcoded copy would
    // pass just as happily against the wrong person.
    const { data: names } = await admin
      .from("profiles")
      .select("id, first_name")
      .in("id", [TEST_IDS.GEDU, sisterGeduId]);
    geduFirstName = names?.find((p) => p.id === TEST_IDS.GEDU)?.first_name ?? "";
    sisterGeduFirstName =
      names?.find((p) => p.id === sisterGeduId)?.first_name ?? "";
    expect(geduFirstName).toBeTruthy();
    expect(sisterGeduFirstName).toBe("Sanni");
    // The whole point of minting the second account: the two editors have to be
    // tellable apart by the one field the overwrite case asserts on.
    expect(sisterGeduFirstName).not.toBe(geduFirstName);

    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      // consumer_club by default — the badge is drawn on club products only, so
      // the fixture is the side of that rule where `product_type` matters.
      await createTestProduct(admin, { id, seatCount: null });
    }

    await admin.from("product_groups").insert([
      { id: GROUP_A, product_id: PRODUCT_FLAIR, name: "Cohort A" },
      { id: GROUP_B, product_id: PRODUCT_FLAIR, name: "Cohort B" },
      { id: GROUP_OFF, product_id: PRODUCT_OFF, name: "Cohort Elsewhere" },
      { id: GROUP_T1, product_id: PRODUCT_TRIGGER, name: "Trigger One" },
      { id: GROUP_T2, product_id: PRODUCT_TRIGGER, name: "Trigger Two" },
    ]);

    // One gedu per group of the SAME product, and neither on PRODUCT_OFF.
    await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP_A, gedu_id: TEST_IDS.GEDU, product_id: PRODUCT_FLAIR },
      { group_id: GROUP_B, gedu_id: sisterGeduId, product_id: PRODUCT_FLAIR },
    ]);

    await admin.from("participations").insert([
      {
        product_id: PRODUCT_FLAIR,
        group_id: GROUP_A,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: PRODUCT_FLAIR,
        group_id: GROUP_B,
        participant_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      // GAMER really does sit in GROUP_OFF, which is what makes the refusal
      // there the ACTOR half and nothing else.
      {
        product_id: PRODUCT_OFF,
        group_id: GROUP_OFF,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
    ]);
  });

  afterAll(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    // The assignment FK onto profiles is ON DELETE RESTRICT, so the row has to
    // go before the account does.
    await admin
      .from("gedu_group_assignments")
      .delete()
      .eq("gedu_id", sisterGeduId);
    // Notes cascade with their group, which cascades with its product — so
    // deleting the products is the whole of the note cleanup.
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin.auth.admin.deleteUser(sisterGeduId);
  });

  // -------------------------------------------------------------------------
  // 1. The clock, and the trigger that is its only writer
  // -------------------------------------------------------------------------

  describe("trg_participations_stamp_group_joined_at", () => {
    afterEach(async () => {
      await admin
        .from("participations")
        .delete()
        .eq("product_id", PRODUCT_TRIGGER);
      // GROUP_T3 exists only inside the cascade case, which deletes it itself;
      // this is the belt to that braces, so a failure mid-test cannot leave a
      // third group behind for the next one to trip over.
      await admin.from("product_groups").delete().eq("id", GROUP_T3);
    });

    /** The seat's stamp as the database currently holds it. */
    async function stampOf(participationId: string): Promise<string | null> {
      const { data } = await admin
        .from("participations")
        .select("group_joined_at")
        .eq("id", participationId)
        .single();
      return data?.group_joined_at ?? null;
    }

    /** A seat on PRODUCT_TRIGGER, in `groupId` or in no group at all. */
    async function seat(groupId: string | null) {
      const { data, error } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_TRIGGER,
          group_id: groupId,
          participant_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        })
        .select("id, group_joined_at")
        .single();
      expect(error).toBeNull();
      return data!;
    }

    it("stamps a seat inserted into a group", async () => {
      const row = await seat(GROUP_T1);
      expect(row.group_joined_at).not.toBeNull();
    });

    it("leaves a seat inserted with no group unstamped", async () => {
      // A member with no group is not new to anything, so NULL is the answer
      // rather than "joined nothing at 12:04".
      const row = await seat(null);
      expect(row.group_joined_at).toBeNull();
    });

    it("re-stamps a move between two groups of one product", async () => {
      const row = await seat(GROUP_T1);
      const before = row.group_joined_at!;

      const { error } = await admin
        .from("participations")
        .update({ group_id: GROUP_T2 })
        .eq("id", row.id);
      expect(error).toBeNull();

      const after = await stampOf(row.id);
      expect(after).not.toBeNull();
      // Strictly greater — and that comparison holds here ONLY because the two
      // writes are separate round trips. The trigger stamps `now()`, which is
      // the TRANSACTION timestamp: two moves inside one statement or one RPC
      // call stamp identically, and that is correct, because they are one
      // decision. A reader who later meets a same-transaction pair of moves
      // wants a second round trip, not a "fix" to clock_timestamp() — which
      // would buy nothing here and would break this column's parity with
      // signed_up_at beside it.
      expect(micros(after!)).toBeGreaterThan(micros(before));
    });

    it("clears the stamp when the seat leaves its group", async () => {
      const row = await seat(GROUP_T1);
      expect(row.group_joined_at).not.toBeNull();

      await admin
        .from("participations")
        .update({ group_id: null })
        .eq("id", row.id);

      expect(await stampOf(row.id)).toBeNull();
    });

    it("clears the stamp when the GROUP is deleted (the ON DELETE SET NULL cascade)", async () => {
      // The path no function would ever have covered: deleting a group rewrites
      // group_id on every member row with nothing in between, which is the whole
      // reason the stamp lives in a trigger rather than in apply_group_changes.
      await admin
        .from("product_groups")
        .insert({ id: GROUP_T3, product_id: PRODUCT_TRIGGER, name: "Doomed" });

      const { data: row, error } = await admin
        .from("participations")
        .insert({
          product_id: PRODUCT_TRIGGER,
          group_id: GROUP_T3,
          participant_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        })
        .select("id, group_joined_at")
        .single();
      expect(error).toBeNull();
      expect(row!.group_joined_at).not.toBeNull();

      await admin.from("product_groups").delete().eq("id", GROUP_T3);

      const { data: after } = await admin
        .from("participations")
        .select("group_id, group_joined_at")
        .eq("id", row!.id)
        .single();
      expect(after?.group_id).toBeNull();
      expect(after?.group_joined_at).toBeNull();
    });

    it("does not re-stamp on an UPDATE that never names group_id", async () => {
      // The trigger is BEFORE INSERT OR UPDATE **OF group_id**, so a status
      // change — or the updated_at touch riding with it — cannot reach it.
      const row = await seat(GROUP_T1);
      const before = row.group_joined_at!;

      await admin
        .from("participations")
        .update({ status: "completed" })
        .eq("id", row.id);

      expect(await stampOf(row.id)).toBe(before);
    });

    it("does not re-stamp on an UPDATE setting group_id to the value it already held", async () => {
      // This one DOES fire the trigger — group_id is named — and the
      // `IS DISTINCT FROM` comparison is the whole of what makes it a no-op.
      const row = await seat(GROUP_T1);
      const before = row.group_joined_at!;

      await admin
        .from("participations")
        .update({ group_id: GROUP_T1 })
        .eq("id", row.id);

      expect(await stampOf(row.id)).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // 2. The staff overlay read
  // -------------------------------------------------------------------------

  describe("get_group_staff_overlay", () => {
    it("hands an admin the document", async () => {
      const { data, error } = await adminAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_A,
      });
      expect(error).toBeNull();

      const overlay = groupStaffOverlay.parse(data);
      expect(Object.keys(overlay.members)).toEqual([TEST_IDS.GAMER]);
    });

    it("hands a gedu the document for a SISTER group they do not teach", async () => {
      // The cross-group mobility that is the whole point: GEDU teaches GROUP_A
      // and nothing else, and GROUP_B is another group of the same product. A
      // substitute standing in for another group is exactly the person who needs
      // these marks, so refusing them would make the feature useless in the one
      // situation it matters most.
      const { data, error } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_B,
      });
      expect(error).toBeNull();

      const overlay = groupStaffOverlay.parse(data);
      // Keyed by participant id, per group: GROUP_B's roster, not GROUP_A's.
      expect(Object.keys(overlay.members)).toEqual([TEST_IDS.GAMER_2]);
    });

    it("refuses a gedu who teaches a different product", async () => {
      const { error } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_OFF,
      });
      expect(error?.code).toBe("42501");
    });

    it("refuses a customer and a gamer", async () => {
      // Visibility is DATA ACCESS rather than a viewer prop a later refactor
      // could drop — this is the assertion that says so.
      for (const client of [customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_group_staff_overlay", {
          p_group_id: GROUP_A,
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("carries the group's product type", async () => {
      // The voice room has no other route to it, and the clubs-only newcomer
      // rule is applied client-side from exactly this field.
      const { data } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_A,
      });
      expect(groupStaffOverlay.parse(data).product_type).toBe("consumer_club");
    });

    it("covers the ACTIVE roster, note or no note, stamp or no stamp", async () => {
      const { data } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_A,
      });
      const member = groupStaffOverlay.parse(data).members[TEST_IDS.GAMER];

      // The map's own keys are the seat-holder set the voice room needs, which
      // is why nobody has to add an ids array beside it: an entry exists for a
      // member with nothing written about them at all.
      expect(member).toBeDefined();
      expect(member.note).toBeNull();
      expect(member.note_updated_by_first_name).toBeNull();
      // Stamped at insert by the trigger, since the seat was created in a group.
      expect(member.group_joined_at).not.toBeNull();
    });

    it("drops a member from the map once their seat is no longer active", async () => {
      await admin
        .from("participations")
        .update({ status: "completed" })
        .eq("product_id", PRODUCT_FLAIR)
        .eq("participant_id", TEST_IDS.GAMER);

      const { data } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_A,
      });
      expect(groupStaffOverlay.parse(data).members).toEqual({});

      await admin
        .from("participations")
        .update({ status: "active" })
        .eq("product_id", PRODUCT_FLAIR)
        .eq("participant_id", TEST_IDS.GAMER);
    });
  });

  // -------------------------------------------------------------------------
  // 3. The note write
  // -------------------------------------------------------------------------

  describe("set_gamer_group_note", () => {
    afterEach(async () => {
      await admin
        .from("gamer_group_notes")
        .delete()
        .in("group_id", [GROUP_A, GROUP_B, GROUP_OFF]);
    });

    /** The note as `get_group_staff_overlay` serves it back. */
    async function overlayNote(
      client: SupabaseClient<Database>,
      groupId: string,
      participantId: string,
    ) {
      const { data, error } = await client.rpc("get_group_staff_overlay", {
        p_group_id: groupId,
      });
      expect(error).toBeNull();
      return groupStaffOverlay.parse(data).members[participantId];
    }

    it("writes a note, names its writer, and reads back through the overlay", async () => {
      const { data, error } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        // Untrimmed on purpose: the RPC trims before it stores, and the stored
        // value is what every surface renders.
        p_note: "  Pairs badly with the loud table.  ",
      });
      expect(error).toBeNull();

      const result = gamerGroupNoteResult.parse(data);
      expect(result.group_id).toBe(GROUP_A);
      expect(result.participant_id).toBe(TEST_IDS.GAMER);
      expect(result.note).toBe("Pairs badly with the loud table.");
      expect(result.note_updated_by_first_name).toBe(geduFirstName);
      expect(result.updated_at).not.toBeNull();

      const member = await overlayNote(geduAuth, GROUP_A, TEST_IDS.GAMER);
      expect(member.note).toBe("Pairs badly with the loud table.");
      expect(member.note_updated_by_first_name).toBe(geduFirstName);
    });

    it("lets a second gedu on the product overwrite it and become the named editor", async () => {
      await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "Written by the group's own gedu.",
      });

      // The sister gedu teaches GROUP_B, not GROUP_A — so this is the write half
      // of the cross-group mobility the read already proved.
      const { data, error } = await sisterGeduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "Corrected by the substitute.",
      });
      expect(error).toBeNull();

      const result = gamerGroupNoteResult.parse(data);
      expect(result.note).toBe("Corrected by the substitute.");
      expect(result.note_updated_by_first_name).toBe(sisterGeduFirstName);

      // Last-write-wins, one row, and only the last editor stored — there is no
      // history here, which is what the single row is asserting.
      const { data: rows } = await admin
        .from("gamer_group_notes")
        .select("note, updated_by")
        .eq("group_id", GROUP_A)
        .eq("participant_id", TEST_IDS.GAMER);
      expect(rows).toHaveLength(1);
      expect(rows?.[0].updated_by).toBe(sisterGeduId);
    });

    it("deletes the row on a trimmed-empty save, and answers with the null shape", async () => {
      await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "Something that will stop being true.",
      });

      const { data, error } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "   ",
      });
      expect(error).toBeNull();

      // The same keys either way, so a caller merges one shape.
      const result = gamerGroupNoteResult.parse(data);
      expect(result.note).toBeNull();
      expect(result.note_updated_by_first_name).toBeNull();
      expect(result.updated_at).toBeNull();

      // Absence of a row is what "no note" means everywhere else, so the empty
      // save has to produce that absence rather than an empty string standing in
      // for it.
      const { data: rows } = await admin
        .from("gamer_group_notes")
        .select("note")
        .eq("group_id", GROUP_A)
        .eq("participant_id", TEST_IDS.GAMER);
      expect(rows).toEqual([]);

      const member = await overlayNote(geduAuth, GROUP_A, TEST_IDS.GAMER);
      expect(member.note).toBeNull();
    });

    it("refuses a note about somebody who does not sit in that group (the TARGET half)", async () => {
      // GAMER_2 is a real person on the same product — they just sit in GROUP_B.
      // Without this check an authorized gedu could file a note against any
      // profile id on the platform. This is what stands in for a write-IDOR loop
      // entry; see note 1 in the header.
      const { error } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER_2,
        p_note: "Filed against somebody else's group.",
      });
      expect(error?.code).toBe("42501");

      const { data: rows } = await admin
        .from("gamer_group_notes")
        .select("note")
        .eq("group_id", GROUP_A)
        .eq("participant_id", TEST_IDS.GAMER_2);
      expect(rows).toEqual([]);
    });

    it("refuses a gedu who teaches another product (the ACTOR half)", async () => {
      // GAMER really does sit in GROUP_OFF, so the target half is satisfied and
      // the actor half is the only thing standing between this gedu and the row.
      const { error } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_OFF,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "About a group I do not teach.",
      });
      expect(error?.code).toBe("42501");

      const { data: rows } = await admin
        .from("gamer_group_notes")
        .select("note")
        .eq("group_id", GROUP_OFF);
      expect(rows).toEqual([]);
    });

    it("gives an admin full parity, including on a product no gedu here teaches", async () => {
      const { data, error } = await adminAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_OFF,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "An admin can write what a passing gedu cannot.",
      });
      expect(error).toBeNull();

      const result = gamerGroupNoteResult.parse(data);
      expect(result.note).toBe("An admin can write what a passing gedu cannot.");
      // Same target, same group, one refusal and one success — so the refusal
      // above was about the ACTOR and nothing else.

      const member = await overlayNote(adminAuth, GROUP_OFF, TEST_IDS.GAMER);
      expect(member.note).toBe("An admin can write what a passing gedu cannot.");
    });

    it("refuses a note longer than 2000 characters, by CHECK", async () => {
      // The dialog caps at 2000, so a longer write can only come from a non-UI
      // caller and deserves a loud refusal rather than a silent truncation.
      const { error } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "x".repeat(2001),
      });
      expect(error?.code).toBe("23514");

      const { data: rows } = await admin
        .from("gamer_group_notes")
        .select("note")
        .eq("group_id", GROUP_A)
        .eq("participant_id", TEST_IDS.GAMER);
      expect(rows).toEqual([]);
    });

    it("accepts a note of exactly 2000 characters", async () => {
      // The other side of the same CHECK: 2000 is the cap, not the first value
      // over it, and a boundary asserted from one side only is half asserted.
      const { data, error } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_note: "x".repeat(2000),
      });
      expect(error).toBeNull();
      expect(gamerGroupNoteResult.parse(data).note).toHaveLength(2000);
    });
  });

  // -------------------------------------------------------------------------
  // 4. A note does not follow a member
  // -------------------------------------------------------------------------

  describe("moving a member between two groups of one product", () => {
    it("leaves the note on the OLD group and resets the badge clock", async () => {
      // Written about how THIS group is going — half of them would be stale or
      // actively misleading in the next one ("moving groups next week"), which
      // is why the note is keyed to the group and stays where it was written.
      const write = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_B,
        p_participant_id: TEST_IDS.GAMER_2,
        p_note: "Settled once she stopped sitting next to the door.",
      });
      expect(write.error).toBeNull();

      const { data: seatBefore } = await admin
        .from("participations")
        .select("id, group_joined_at")
        .eq("product_id", PRODUCT_FLAIR)
        .eq("participant_id", TEST_IDS.GAMER_2)
        .single();
      const before = seatBefore!.group_joined_at!;

      const { error: moveError } = await admin
        .from("participations")
        .update({ group_id: GROUP_A })
        .eq("id", seatBefore!.id);
      expect(moveError).toBeNull();

      // The badge resets: the member is new to THAT group, which is the whole
      // claim the badge makes. Strictly greater holds for the same reason it
      // does in the trigger block — the write above and this one are separate
      // round trips, so they are separate transactions.
      const { data: seatAfter } = await admin
        .from("participations")
        .select("group_joined_at")
        .eq("id", seatBefore!.id)
        .single();
      expect(micros(seatAfter!.group_joined_at!)).toBeGreaterThan(
        micros(before),
      );

      // The note stayed behind, and the new group starts empty.
      const { data: rows } = await admin
        .from("gamer_group_notes")
        .select("group_id, note")
        .eq("participant_id", TEST_IDS.GAMER_2);
      expect(rows).toHaveLength(1);
      expect(rows?.[0].group_id).toBe(GROUP_B);

      const { data: overlayData } = await geduAuth.rpc(
        "get_group_staff_overlay",
        { p_group_id: GROUP_A },
      );
      const moved = groupStaffOverlay.parse(overlayData).members[
        TEST_IDS.GAMER_2
      ];
      expect(moved.note).toBeNull();
      expect(moved.note_updated_by_first_name).toBeNull();

      // The orphan is an ACCEPTED leftover — nothing cleans it up, and the write
      // RPC now refuses to edit it back into life, because its target check asks
      // whether the participant currently sits in that group.
      const { error: orphanEdit } = await geduAuth.rpc("set_gamer_group_note", {
        p_group_id: GROUP_B,
        p_participant_id: TEST_IDS.GAMER_2,
        p_note: "Editing a note nobody can reach.",
      });
      expect(orphanEdit?.code).toBe("42501");

      // Put the fixture back the way the rest of the file expects to find it.
      await admin
        .from("participations")
        .update({ group_id: GROUP_B })
        .eq("id", seatBefore!.id);
      await admin
        .from("gamer_group_notes")
        .delete()
        .eq("participant_id", TEST_IDS.GAMER_2);
    });
  });
});
