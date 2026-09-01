import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { geduAssignedProduct } from "@/services/assignments/assignments.contracts";
import { familyProductFeed } from "@/services/family-product-feed/family-product-feed.contracts";
import {
  geduAssignmentSummaries,
  geduGroupFeed,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import {
  gamerGroupCreationsResult,
  groupStaffOverlay,
} from "@/services/member-flair/member-flair.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Gamer creations (00227): the write RPC, the four documents that carry the
 * list, and the fourth condition it adds to a gedu's owed count.
 *
 * Four things about this file are decisions rather than convenience, and each
 * would otherwise read as a gap:
 *
 * 1. **The write RPC's target check is what stands in for a write-IDOR loop
 *    entry.** `gamer_group_creations` grants `authenticated` nothing at all —
 *    every read rides one of the widened documents, every write goes through
 *    the RPC, and all of those are SECURITY DEFINER — so the loop in
 *    write-idor.test.ts, which is closed over "every table `authenticated` may
 *    UPDATE or DELETE", neither demands nor accepts an entry for it. The
 *    write-IDOR *requirement* is met one layer up, by the RPC authorizing the
 *    ACTOR (staff reach over the product) and the TARGET (the participant
 *    actually sits in that group), and both halves are asserted negatively
 *    below. Do not go looking for the missing loop entry.
 *
 * 2. **Every widened document is parsed through its own contract schema**, with
 *    a real list in it. That is what keeps Postgres and TypeScript from drifting
 *    apart quietly — and on the family document it is load-bearing twice over,
 *    because that schema is `.strict()` at every level, so a staff-only field
 *    creeping into the RPC fails the parse here rather than reaching a parent.
 *
 * 3. **The family document is checked for what it does NOT carry.** The list is
 *    a top-level array for one participation, so another child's work has
 *    nowhere to live BY TYPE; the assertion below writes a list for a DIFFERENT
 *    child of the SAME parent first, so "only their own came back" cannot pass
 *    vacuously.
 *
 * 4. **The owed condition needs a product whose run has ENDED**, because it
 *    attaches to the final computed occurrence and to nothing else. That is why
 *    PRODUCT_OWED is a separate fixture rather than a flag flipped on the club
 *    above: its cases deliberately satisfy the other three conditions so the
 *    fourth can be observed alone, and doing that to a shared product would move
 *    the counts every other block reads.
 *
 * Layout:
 *   - PRODUCT_CLUB carries GROUP_A, taught by the seeded GEDU with GAMER on its
 *     roster, and GROUP_B, with GAMER_2 on its roster. The gedu's reach is over
 *     the PRODUCT, so they may write on both — which is exactly what makes
 *     GAMER_2 the sharp target for the group-scoped target check.
 *   - PRODUCT_OFF carries GROUP_OFF, which no gedu here teaches — and GAMER sits
 *     in it, so a refusal there is the ACTOR half alone. An admin writing the
 *     same list succeeds, which is what proves the target was never the problem.
 *   - PRODUCT_OWED is flagged, ended yesterday, and runs every weekday, so
 *     yesterday is both a finished occurrence and the run's LAST one.
 */

const PRODUCT_CLUB = "00000000-0000-0000-0000-0000000006b0";
const GROUP_A = "00000000-0000-0000-0000-0000000006b1";
const GROUP_B = "00000000-0000-0000-0000-0000000006b2";
const PRODUCT_OFF = "00000000-0000-0000-0000-0000000006b3";
const GROUP_OFF = "00000000-0000-0000-0000-0000000006b4";
const PRODUCT_OWED = "00000000-0000-0000-0000-0000000006b5";
const GROUP_OWED = "00000000-0000-0000-0000-0000000006b6";

const ALL_PRODUCTS = [PRODUCT_CLUB, PRODUCT_OFF, PRODUCT_OWED];

/**
 * The slot PRODUCT_OWED runs on, seven days a week.
 *
 * **Late in the day on purpose**, the same trick the session-feed suite uses: a
 * 23:00 start with a one-hour duration means yesterday's session ended at
 * today's midnight and therefore always has finished, whatever hour CI starts.
 */
const SLOT_START = "23:00";
const SLOT_MINUTES = 60;

/** `YYYY-MM-DD`, `offset` days from today. The fixture products run in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const YESTERDAY = dayOffset(-1);

const ROBLOX_GAME = {
  title: "Skyward Bazaar",
  url: "https://www.roblox.com/games/1818/skyward-bazaar",
};
const SCRATCH_PROJECT = {
  title: "Talking cat",
  url: "https://scratch.mit.edu/projects/1234567",
};

describe("gamer creations", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;

  /** GAMER's seat on PRODUCT_CLUB — the family page this file reads. */
  let gamerParticipationId = "";

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

    await deleteTestProducts(admin, ALL_PRODUCTS);

    for (const id of [PRODUCT_CLUB, PRODUCT_OFF]) {
      await createTestProduct(admin, {
        id,
        seatCount: null,
        startDate: dayOffset(-30),
      });
      await admin.from("product_translations").insert({
        product_id: id,
        locale: "en",
        name: "Creations fixture",
        short_description: "Seeded by gamer-creations.test.ts",
      });
    }

    // The flagged product: its run ENDED yesterday, and it runs every weekday,
    // so yesterday is the last occurrence the schedule projects on or before
    // end_date — which is the one session the fourth condition can attach to.
    await createTestProduct(admin, {
      id: PRODUCT_OWED,
      seatCount: null,
      startDate: dayOffset(-30),
      endDate: YESTERDAY,
    });
    await admin.from("product_translations").insert({
      product_id: PRODUCT_OWED,
      locale: "en",
      name: "Creations required fixture",
      short_description: "Seeded by gamer-creations.test.ts",
    });
    // The column is admin-set through create_product/update_product; the flag is
    // written directly here because this file is about what the flag DOES, and
    // the product writers' own coverage lives with them.
    await admin
      .from("products")
      .update({ requires_gamer_creations: true })
      .eq("id", PRODUCT_OWED);
    for (let weekday = 0; weekday < 7; weekday++) {
      await createScheduleSlot(admin, PRODUCT_OWED, {
        weekday,
        startTime: SLOT_START,
        durationMinutes: SLOT_MINUTES,
      });
    }

    await admin.from("product_groups").insert([
      { id: GROUP_A, product_id: PRODUCT_CLUB, name: "Cohort A" },
      { id: GROUP_B, product_id: PRODUCT_CLUB, name: "Cohort B" },
      { id: GROUP_OFF, product_id: PRODUCT_OFF, name: "Cohort Elsewhere" },
      { id: GROUP_OWED, product_id: PRODUCT_OWED, name: "Cohort Owed" },
    ]);

    // The gedu teaches one group of PRODUCT_CLUB and the whole of PRODUCT_OWED,
    // and nothing on PRODUCT_OFF.
    await admin.from("gedu_group_assignments").insert([
      { group_id: GROUP_A, gedu_id: TEST_IDS.GEDU, product_id: PRODUCT_CLUB },
      { group_id: GROUP_OWED, gedu_id: TEST_IDS.GEDU, product_id: PRODUCT_OWED },
    ]);

    await admin.from("participations").insert([
      {
        product_id: PRODUCT_CLUB,
        group_id: GROUP_A,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: PRODUCT_CLUB,
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
      {
        product_id: PRODUCT_OWED,
        group_id: GROUP_OWED,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
    ]);

    const { data: seat } = await admin
      .from("participations")
      .select("id")
      .eq("product_id", PRODUCT_CLUB)
      .eq("participant_id", TEST_IDS.GAMER)
      .single();
    gamerParticipationId = seat!.id;
  });

  afterAll(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    // Creations cascade with their group, which cascades with its product — so
    // deleting the products is the whole of the cleanup.
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  /** Every stored list on this file's groups, straight off the table. */
  async function storedRows(groupId: string, participantId: string) {
    const { data } = await admin
      .from("gamer_group_creations")
      .select("creations")
      .eq("group_id", groupId)
      .eq("participant_id", participantId);
    return data ?? [];
  }

  // -------------------------------------------------------------------------
  // 1. The write
  // -------------------------------------------------------------------------

  describe("set_gamer_group_creations", () => {
    afterEach(async () => {
      await admin
        .from("gamer_group_creations")
        .delete()
        .in("group_id", [GROUP_A, GROUP_B, GROUP_OFF, GROUP_OWED]);
    });

    it("writes a list for a member of a group the gedu teaches", async () => {
      const { data, error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME, SCRATCH_PROJECT],
      });
      expect(error).toBeNull();

      const result = gamerGroupCreationsResult.parse(data);
      expect(result.group_id).toBe(GROUP_A);
      expect(result.participant_id).toBe(TEST_IDS.GAMER);
      // Array order IS display order, so the round trip has to preserve it —
      // there is no position column to reconstruct it from.
      expect(result.creations).toEqual([ROBLOX_GAME, SCRATCH_PROJECT]);
      expect(result.updated_at).not.toBeNull();

      const { data: row } = await admin
        .from("gamer_group_creations")
        .select("creations, updated_by")
        .eq("group_id", GROUP_A)
        .eq("participant_id", TEST_IDS.GAMER)
        .single();
      expect(row?.updated_by).toBe(TEST_IDS.GEDU);
    });

    it("replaces the whole list rather than merging into it", async () => {
      await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME, SCRATCH_PROJECT],
      });

      const { data, error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [SCRATCH_PROJECT],
      });
      expect(error).toBeNull();

      // Set-shaped: what came back is what was sent, not what was sent plus
      // what was there. Removing an entry is a save of the list without it.
      expect(gamerGroupCreationsResult.parse(data).creations).toEqual([
        SCRATCH_PROJECT,
      ]);
      // Last-write-wins, one row, no history.
      expect(await storedRows(GROUP_A, TEST_IDS.GAMER)).toHaveLength(1);
    });

    it("is idempotent — the same list written twice is the same row", async () => {
      // Which is what makes a partial failure in the two-write dialog safe to
      // retry: the note may have landed and the creations may not, and simply
      // repeating the save cannot double anything.
      for (let i = 0; i < 2; i++) {
        const { error } = await geduAuth.rpc("set_gamer_group_creations", {
          p_group_id: GROUP_A,
          p_participant_id: TEST_IDS.GAMER,
          p_creations: [ROBLOX_GAME],
        });
        expect(error).toBeNull();
      }

      const rows = await storedRows(GROUP_A, TEST_IDS.GAMER);
      expect(rows).toHaveLength(1);
      expect(rows[0].creations).toEqual([ROBLOX_GAME]);
    });

    it("deletes the row on an empty list, and answers with the empty shape", async () => {
      await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME],
      });

      const { data, error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [],
      });
      expect(error).toBeNull();

      // The same keys either way, so a caller merges one shape.
      const result = gamerGroupCreationsResult.parse(data);
      expect(result.creations).toEqual([]);
      expect(result.updated_at).toBeNull();

      // Absence of a row is what "no creations" means everywhere else, and the
      // table's CHECK refuses an empty array — so the two states genuinely
      // cannot both exist and the empty save has to produce the absence.
      expect(await storedRows(GROUP_A, TEST_IDS.GAMER)).toEqual([]);
    });

    it("gives an admin full parity, including on a product no gedu here teaches", async () => {
      const { data, error } = await adminAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_OFF,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME],
      });
      expect(error).toBeNull();
      expect(gamerGroupCreationsResult.parse(data).creations).toEqual([
        ROBLOX_GAME,
      ]);
    });

    it("refuses a gedu who teaches another product (the ACTOR half)", async () => {
      // GAMER really does sit in GROUP_OFF, so the target half is satisfied and
      // the actor half is the only thing standing between this gedu and the row.
      // The admin case directly above writes the same list successfully, which
      // is what makes this refusal about the actor and nothing else.
      const { error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_OFF,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME],
      });
      expect(error?.code).toBe("42501");

      expect(await storedRows(GROUP_OFF, TEST_IDS.GAMER)).toEqual([]);
    });

    it("refuses a list filed against somebody not in that group (the TARGET half)", async () => {
      // GAMER_2 is a real person on the same product — they just sit in GROUP_B,
      // and the gedu's reach is over the product, so the actor half passes.
      // Without this check an authorized gedu could file creations against any
      // profile id on the platform. This is what stands in for a write-IDOR loop
      // entry; see note 1 in the header.
      const { error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER_2,
        p_creations: [ROBLOX_GAME],
      });
      expect(error?.code).toBe("42501");

      expect(await storedRows(GROUP_A, TEST_IDS.GAMER_2)).toEqual([]);
    });

    it("refuses a customer and a gamer on the first statement", async () => {
      // Gamers never write their own creations, and neither do their families:
      // this is staff-authored data that a family only ever reads.
      for (const client of [customerAuth, gamerAuth]) {
        const { error } = await client.rpc("set_gamer_group_creations", {
          p_group_id: GROUP_A,
          p_participant_id: TEST_IDS.GAMER,
          p_creations: [ROBLOX_GAME],
        });
        expect(error?.code).toBe("42501");
      }

      expect(await storedRows(GROUP_A, TEST_IDS.GAMER)).toEqual([]);
    });

    it("leaves the whole shape to the table's CHECK", async () => {
      // The dialog drops a fully blank row and refuses to save a half-filled
      // one, so a violation reaching here means a non-UI caller — and the caps
      // in the contracts file are these numbers, which is what keeps the CHECK a
      // loud backstop rather than a routine error path.
      const refusals = [
        [{ title: "   ", url: "https://example.com" }],
        [{ title: "t", url: "  " }],
        [{ title: "x".repeat(201), url: "https://example.com" }],
        [{ title: "t", url: "x".repeat(2001) }],
        [{ title: "t", url: "https://example.com", kind: "roblox" }],
        Array.from({ length: 21 }, (_, i) => ({
          title: `Entry ${i}`,
          url: "https://example.com",
        })),
      ];

      for (const creations of refusals) {
        const { error } = await geduAuth.rpc("set_gamer_group_creations", {
          p_group_id: GROUP_A,
          p_participant_id: TEST_IDS.GAMER,
          p_creations: creations,
        });
        expect(error?.code).toBe("23514");
      }

      // ...and the boundaries themselves get through, or the CHECK is refusing
      // the feature rather than protecting it. A cap asserted from one side only
      // is half asserted.
      const { error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [{ title: "x".repeat(200), url: "x".repeat(2000) }],
      });
      expect(error).toBeNull();
    });

    it("stores the value verbatim, without trimming it", async () => {
      // Deliberate: rebuilding each element in the RPC would silently discard
      // the extra keys the CHECK exists to refuse, and trimming would make the
      // CHECK's non-blank clause unreachable. So the surface hands over what the
      // gedu typed and the stored value is what every reader renders.
      const padded = { title: "  Padded title  ", url: " https://example.com " };
      const { data, error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [padded],
      });
      expect(error).toBeNull();
      expect(gamerGroupCreationsResult.parse(data).creations).toEqual([padded]);
    });

    it("gives an authenticated gedu no direct read or write on the table", async () => {
      // No grant at all, so PostgREST refuses before RLS is consulted. That is
      // the stronger of the two guarantees, and it is also why the table needs
      // no write-IDOR case of its own.
      const read = await geduAuth.from("gamer_group_creations").select("*");
      expect(read.error).not.toBeNull();

      const write = await geduAuth
        .from("gamer_group_creations")
        .insert({
          group_id: GROUP_A,
          participant_id: TEST_IDS.GAMER,
          creations: [ROBLOX_GAME],
        })
        .select("group_id");
      expect(write.error).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 2. The four widened documents
  // -------------------------------------------------------------------------

  describe("the widened readers", () => {
    beforeAll(async () => {
      // One list per child, and the two children share a parent — which is what
      // makes the family document's "only their own" assertion sharp rather than
      // vacuous. GAMER_2's is written by an admin, since the gedu's reach covers
      // the product but the target check binds them to a group.
      await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_A,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME, SCRATCH_PROJECT],
      });
      await adminAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_B,
        p_participant_id: TEST_IDS.GAMER_2,
        p_creations: [{ title: "Sibling's maze", url: "https://example.com/m" }],
      });
    });

    afterAll(async () => {
      await admin
        .from("gamer_group_creations")
        .delete()
        .in("group_id", [GROUP_A, GROUP_B]);
    });

    it("carries the list on the voice room's staff overlay", async () => {
      const { data, error } = await geduAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_A,
      });
      expect(error).toBeNull();

      const overlay = groupStaffOverlay.parse(data);
      expect(overlay.members[TEST_IDS.GAMER].creations).toEqual([
        ROBLOX_GAME,
        SCRATCH_PROJECT,
      ]);
    });

    it("emits an empty array, never a null, for a member with no row", async () => {
      // A list has a real empty value where a note does not, so no reader has to
      // decide what a null list means. The same member's `note` is null beside
      // it, which is what makes the difference deliberate rather than accidental.
      const { data } = await adminAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_OFF,
      });
      const member = groupStaffOverlay.parse(data).members[TEST_IDS.GAMER];
      expect(member.creations).toEqual([]);
      expect(member.note).toBeNull();
    });

    it("carries the list and the flag on the gedu group feed", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_A,
      });
      expect(error).toBeNull();

      const feed = geduGroupFeed.parse(data);
      const row = feed.roster.find(
        (member) => member.participant_id === TEST_IDS.GAMER,
      );
      expect(row?.creations).toEqual([ROBLOX_GAME, SCRATCH_PROJECT]);
      // The flag is on the SHELL, and it has to be: the fourth completeness
      // condition is derived on the client from the flag, the schedule and this
      // roster's creations, so a document with the list and not the flag cannot
      // answer the question at all.
      expect(feed.product.requires_gamer_creations).toBe(false);
    });

    it("shows the flag set on a product that requires creations", async () => {
      const { data } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_OWED,
      });
      expect(geduGroupFeed.parse(data).product.requires_gamer_creations).toBe(
        true,
      );
    });

    it("keeps the assigned-product document in parity with the feed", async () => {
      const { data, error } = await geduAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_CLUB,
      });
      expect(error).toBeNull();

      const document = geduAssignedProduct.parse(data);
      expect(document.product.requires_gamer_creations).toBe(false);

      const mine = document.groups.find((group) => group.is_my_group);
      const row = mine?.roster?.find(
        (member) => member.participant_id === TEST_IDS.GAMER,
      );
      expect(row?.creations).toEqual([ROBLOX_GAME, SCRATCH_PROJECT]);
    });

    it("hands a family their own child's list, and only theirs", async () => {
      const { data, error } = await customerAuth.rpc(
        "get_my_family_product_feed",
        { p_participation_id: gamerParticipationId },
      );
      expect(error).toBeNull();

      // The parse is half the assertion: this schema is `.strict()` at every
      // level, so a staff-only field creeping into the RPC fails here rather
      // than reaching a parent.
      const feed = familyProductFeed.parse(data);
      expect(feed.creations).toEqual([ROBLOX_GAME, SCRATCH_PROJECT]);

      // A TOP-LEVEL array for one participation, not a map keyed by participant
      // — so the sibling's list, written above against the same parent, has
      // nowhere to live here BY TYPE.
      expect(JSON.stringify(feed)).not.toContain("Sibling's maze");
    });

    it("gives the gamer themselves the same list", async () => {
      // Same body, same document: the page serves parent, self and gamer, and
      // this is how a gamer revisits their own work.
      const { data, error } = await gamerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: gamerParticipationId,
      });
      expect(error).toBeNull();
      expect(familyProductFeed.parse(data).creations).toEqual([
        ROBLOX_GAME,
        SCRATCH_PROJECT,
      ]);
    });

    it("gives a family an empty array when nothing was written", async () => {
      const { data: seat } = await admin
        .from("participations")
        .select("id")
        .eq("product_id", PRODUCT_OWED)
        .eq("participant_id", TEST_IDS.GAMER)
        .single();

      const { data } = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: seat!.id,
      });
      // Empty, never null: the card renders on "is this empty" and never on "is
      // this null", so no creations means no card and no reserved space.
      expect(familyProductFeed.parse(data).creations).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. The fourth thing a final session owes
  // -------------------------------------------------------------------------

  describe("get_my_gedu_assignment_summaries — the creations condition", () => {
    /**
     * Satisfy the OTHER three conditions on yesterday's session, so the fourth
     * is the only thing left that can keep it on the list.
     *
     * Without this the count would be 1 either way and the assertions below
     * would pass whatever the fourth condition did.
     */
    beforeAll(async () => {
      const mark = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_OWED,
        p_session_date: YESTERDAY,
        p_participant_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      expect(mark.error).toBeNull();

      const notes = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_OWED,
        p_session_date: YESTERDAY,
        p_report: "We finished the builds and exported them.",
        p_gedu_note: "",
      });
      expect(notes.error).toBeNull();

      const claim = await geduAuth.rpc("claim_group_session_report_email", {
        p_group_id: GROUP_OWED,
        p_session_date: YESTERDAY,
      });
      expect(claim.error).toBeNull();
    });

    afterAll(async () => {
      await admin
        .from("gamer_group_creations")
        .delete()
        .eq("group_id", GROUP_OWED);
      await admin.from("group_sessions").delete().eq("group_id", GROUP_OWED);
    });

    /** This group's owed count, floored at yesterday. */
    async function owedCount(): Promise<number | undefined> {
      const { data, error } = await geduAuth.rpc(
        "get_my_gedu_assignment_summaries",
        { p_epoch_date: YESTERDAY },
      );
      expect(error).toBeNull();
      return geduAssignmentSummaries
        .parse(data)
        .find((summary) => summary.group_id === GROUP_OWED)?.attention_count;
    }

    it("counts the final session while a roster member has no creations", async () => {
      // Marked, written up and mailed — under the three original conditions this
      // session is finished. It is not, because the product requires a creation
      // from every member and this member has none.
      expect(await owedCount()).toBe(1);
    });

    it("clears once every current member has one", async () => {
      const { error } = await geduAuth.rpc("set_gamer_group_creations", {
        p_group_id: GROUP_OWED,
        p_participant_id: TEST_IDS.GAMER,
        p_creations: [ROBLOX_GAME],
      });
      expect(error).toBeNull();

      expect(await owedCount()).toBe(0);
    });

    it("owes nothing on an UNFLAGGED product, however empty the lists", async () => {
      // The control, and it is what stops the assertions above passing for the
      // wrong reason. GROUP_A's members have creations and GROUP_OFF's do not,
      // but neither product is flagged and neither has ended — so nothing there
      // is ever owed a creation.
      await admin
        .from("products")
        .update({ requires_gamer_creations: false })
        .eq("id", PRODUCT_OWED);

      // Same session, same empty-then-filled history, flag off: zero.
      await admin
        .from("gamer_group_creations")
        .delete()
        .eq("group_id", GROUP_OWED);
      expect(await owedCount()).toBe(0);

      await admin
        .from("products")
        .update({ requires_gamer_creations: true })
        .eq("id", PRODUCT_OWED);
    });

    it("owes nothing on an OPEN-ENDED flagged product", async () => {
      // Documented behaviour rather than an error: "the final session" is the
      // last occurrence on or before end_date, so a product with no end_date has
      // none and can be flagged forever without owing anything.
      await admin
        .from("gamer_group_creations")
        .delete()
        .eq("group_id", GROUP_OWED);
      await admin
        .from("products")
        .update({ end_date: null })
        .eq("id", PRODUCT_OWED);

      expect(await owedCount()).toBe(0);

      await admin
        .from("products")
        .update({ end_date: YESTERDAY })
        .eq("id", PRODUCT_OWED);
    });
  });
});
