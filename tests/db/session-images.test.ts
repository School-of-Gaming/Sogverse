import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { geduGroupFeed } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Session-report photos (00222): the two write RPCs, the removal check 00224
 * put in front of them, the cap, and the photos' arrival on the gedu document.
 *
 * `group_session_images` grants nothing to `authenticated` and carries no RLS
 * policy at all — the same posture as `group_sessions` itself — so these
 * SECURITY DEFINER functions are the ONLY way a client reaches the table, and
 * this file is where "who may attach and remove what" is settled. Three
 * authorizations, and they fail differently:
 *
 *   1. **Role** — an admin or a gedu; a customer and a gamer are refused on the
 *      first statement.
 *   2. **Assignment** — a gedu may only touch groups they teach, and that is the
 *      only half an admin is exempt from.
 *   3. **The photo's own group, on removal** — the delete RPC takes an image id
 *      and nothing else, so the group is resolved from the row. A photo id
 *      belonging to another group and one belonging to nothing are refused
 *      identically, which is what keeps it from being an oracle for real ids.
 *
 * Removal is two functions rather than one. The route deletes the storage OBJECT
 * before the row — so a removal that did not remove the picture stays visible,
 * with the photo on the card to retry — and that storage call runs on the
 * service-role client, which must never act for a caller whose right to the
 * photo has not been proved. `assert_can_delete_session_image` (00224) is that
 * proof: no mutation, and the delete RPC's gate byte for byte, oracle-free
 * refusal included.
 *
 * There is deliberately no per-photo ownership: ANY gedu assigned to the group
 * may remove any photo on it, matching how the report itself is edited under the
 * last-editor model. `created_by` is safeguarding audit — it answers "who put
 * this here" about pictures concerning children — and it gates nothing and
 * reaches no feed.
 *
 * The cap is the other half. The product cap (5 at launch) lives in one constant
 * in the contracts module and is PASSED IN, so raising it never needs a
 * migration; SQL holds only a hard sanity ceiling of 24. Enforcement happens
 * under the session row's lock, which is what makes two concurrent tabs unable
 * to overshoot — the lock cannot be observed from here, but the count-then-insert
 * it protects can.
 *
 * Layout mirrors gedu-session-feed.test.ts: a seven-day-a-week schedule so any
 * date is a legal session date, one group the gedu teaches and one they do not,
 * and a SECOND gedu on the same group — the whole point of the shared-removal
 * case.
 */

const PRODUCT_MINE = "00000000-0000-0000-0000-0000000006a0";
const PRODUCT_OTHER = "00000000-0000-0000-0000-0000000006a1";
const GROUP_MINE = "00000000-0000-0000-0000-0000000006a2";
const GROUP_OTHER = "00000000-0000-0000-0000-0000000006a3";

const ALL_PRODUCTS = [PRODUCT_MINE, PRODUCT_OTHER];

/**
 * A photo id that belongs to nothing.
 *
 * Constructed rather than guessed: the table's ids are `gen_random_uuid()`, so
 * an all-but-one-digit-zero UUID cannot collide with a real row in CI's
 * database, which carries the seed fixtures and the real migrations' data side
 * by side.
 */
const NO_SUCH_IMAGE = "00000000-0000-0000-0000-0000000006a9";

/** The product cap at launch. Passed in by the route from the contracts module. */
const CAP = 5;

/** As in the gedu feed fixtures: late enough that today's session has not ended. */
const SLOT_START = "23:00";
const SLOT_MINUTES = 60;

/** `YYYY-MM-DD`, `offset` days from today. The products run in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const YESTERDAY = dayOffset(-1);
const TWO_DAYS_AGO = dayOffset(-2);


describe("session photos", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  /** A second gedu assigned to GROUP_MINE — the shared-removal case. */
  let peerAuth: SupabaseClient<Database>;
  let peerId = "";

  /** Attach one photo through the real write path, and hand back its id. */
  async function attach(
    client: SupabaseClient<Database>,
    date: string,
    dimensions: { width: number; height: number } = { width: 1920, height: 1080 },
  ): Promise<string> {
    const { data, error } = await client.rpc("add_group_session_image", {
      p_group_id: GROUP_MINE,
      p_session_date: date,
      p_width: dimensions.width,
      p_height: dimensions.height,
      p_max_images: CAP,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    return data ?? "";
  }

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

    await deleteTestProducts(admin, ALL_PRODUCTS);

    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, {
        id,
        seatCount: null,
        startDate: dayOffset(-30),
      });
      await admin.from("product_translations").insert({
        product_id: id,
        locale: "en",
        name: "Session photo fixture",
        short_description: "Seeded by session-images.test.ts",
      });
      for (let weekday = 0; weekday < 7; weekday++) {
        await createScheduleSlot(admin, id, {
          weekday,
          startTime: SLOT_START,
          durationMinutes: SLOT_MINUTES,
        });
      }
    }

    await admin.from("product_groups").insert([
      { id: GROUP_MINE, product_id: PRODUCT_MINE, name: "Cohort Photo" },
      { id: GROUP_OTHER, product_id: PRODUCT_OTHER, name: "Cohort Elsewhere" },
    ]);

    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_MINE,
      gedu_id: TEST_IDS.GEDU,
      product_id: PRODUCT_MINE,
    });

    await admin.from("participations").insert({
      product_id: PRODUCT_MINE,
      group_id: GROUP_MINE,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
    });

    // The second gedu on the SAME group. Unique per run: CI's database carries
    // the seed fixtures and whatever a previous run left behind, so a fixed
    // address is a collision waiting to happen.
    const email = `photo-peer-${Date.now()}@test.local`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Peer", last_name: "Gedu" },
      });
    expect(createError).toBeNull();
    peerId = created.user!.id;

    // handle_new_user lands every signup as a customer; the gedu role and the
    // extension row are an admin's doing, exactly as in the real flow.
    await admin.from("profiles").update({ role: "gedu" }).eq("id", peerId);
    await admin.from("customer_profiles").delete().eq("user_id", peerId);
    await admin
      .from("gedu_profiles")
      .insert({ user_id: peerId, certified: true });
    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_MINE,
      gedu_id: peerId,
      product_id: PRODUCT_MINE,
    });

    peerAuth = await createAuthenticatedClient(email, "testpassword123");
  });

  afterAll(async () => {
    // The assignment FK onto profiles is ON DELETE RESTRICT, so the row has to
    // go before the account does.
    await admin.from("gedu_group_assignments").delete().eq("gedu_id", peerId);
    await admin.auth.admin.deleteUser(peerId);
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  /** Wipe the session rows, which CASCADEs the photos with them. */
  beforeEach(async () => {
    await admin
      .from("group_sessions")
      .delete()
      .in("group_id", [GROUP_MINE, GROUP_OTHER]);
  });

  /** Every photo row on GROUP_MINE, oldest first. */
  async function storedImages() {
    const { data } = await admin
      .from("group_session_images")
      .select("id, width, height, created_by, created_at, session_id")
      .order("created_at");
    const { data: sessions } = await admin
      .from("group_sessions")
      .select("id")
      .eq("group_id", GROUP_MINE);
    const mine = new Set((sessions ?? []).map((s) => s.id));
    return (data ?? []).filter((row) => mine.has(row.session_id));
  }

  // -------------------------------------------------------------------------
  // 1. Role gate
  // -------------------------------------------------------------------------

  describe("role gate", () => {
    it("refuses a customer and a gamer on every photo RPC", async () => {
      // An admin is deliberately absent from this loop: the admin product page
      // renders the gedu session components, so both RPCs admit one, and the
      // admin's positive path is pinned further down. What stays refused is a
      // family reaching a staff write on pictures of children.
      for (const client of [customerAuth, gamerAuth]) {
        const add = await client.rpc("add_group_session_image", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_width: 1920,
          p_height: 1080,
          p_max_images: CAP,
        });
        expect(add.error?.code).toBe("42501");

        const remove = await client.rpc("delete_group_session_image", {
          p_image_id: NO_SUCH_IMAGE,
        });
        expect(remove.error?.code).toBe("42501");

        // The check-only half (00224) is refused on the same first statement.
        // It is what the route calls BEFORE deleting the object with the
        // service-role client, so a family reaching past it would be a
        // privileged storage delete performed for an unauthorized caller.
        const check = await client.rpc("assert_can_delete_session_image", {
          p_image_id: NO_SUCH_IMAGE,
        });
        expect(check.error?.code).toBe("42501");
      }

      // Refused on the FIRST statement, so nothing was materialized on the way.
      const { count } = await admin
        .from("group_sessions")
        .select("*", { count: "exact", head: true })
        .eq("group_id", GROUP_MINE);
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Assignment gate — the actor
  // -------------------------------------------------------------------------

  describe("assignment gate", () => {
    it("refuses a gedu attaching a photo to a group they do not teach", async () => {
      const { error } = await geduAuth.rpc("add_group_session_image", {
        p_group_id: GROUP_OTHER,
        p_session_date: YESTERDAY,
        p_width: 1920,
        p_height: 1080,
        p_max_images: CAP,
      });
      expect(error?.code).toBe("42501");

      // The refusal precedes materialization, so the group they do not teach is
      // left with no session row either.
      const { count } = await admin
        .from("group_sessions")
        .select("*", { count: "exact", head: true })
        .eq("group_id", GROUP_OTHER);
      expect(count).toBe(0);
    });

    it("refuses a gedu removing a photo from a group they do not teach", async () => {
      // The photo exists and is perfectly removable — what is missing is the
      // assignment, which is the only thing between this caller and another
      // group's record of its session.
      const { data: session } = await admin
        .from("group_sessions")
        .insert({
          group_id: GROUP_OTHER,
          session_date: YESTERDAY,
          starts_at: `${YESTERDAY}T23:00:00Z`,
          ends_at: `${dayOffset(0)}T00:00:00Z`,
        })
        .select("id")
        .single();
      const { data: image } = await admin
        .from("group_session_images")
        .insert({ session_id: session!.id, width: 1920, height: 1080 })
        .select("id")
        .single();

      const { error } = await geduAuth.rpc("delete_group_session_image", {
        p_image_id: image!.id,
      });
      expect(error?.code).toBe("42501");

      // And the row survived the refusal.
      const { count } = await admin
        .from("group_session_images")
        .select("*", { count: "exact", head: true })
        .eq("id", image!.id);
      expect(count).toBe(1);
    });

    it("answers a photo id that belongs to nothing exactly as it answers someone else's", async () => {
      // Identical replies, so the function cannot be used as an oracle for "is
      // this a real photo id" — which matters more here than for most ids,
      // because a real one names an object in a public bucket.
      const { data: session } = await admin
        .from("group_sessions")
        .insert({
          group_id: GROUP_OTHER,
          session_date: TWO_DAYS_AGO,
          starts_at: `${TWO_DAYS_AGO}T23:00:00Z`,
          ends_at: `${YESTERDAY}T00:00:00Z`,
        })
        .select("id")
        .single();
      const { data: image } = await admin
        .from("group_session_images")
        .insert({ session_id: session!.id, width: 1920, height: 1080 })
        .select("id")
        .single();

      const theirs = await geduAuth.rpc("delete_group_session_image", {
        p_image_id: image!.id,
      });
      const missing = await geduAuth.rpc("delete_group_session_image", {
        p_image_id: NO_SUCH_IMAGE,
      });

      expect(theirs.error?.code).toBe("42501");
      expect(missing.error?.code).toBe("42501");
      expect(missing.error?.message).toBe(theirs.error?.message);
    });
  });

  // -------------------------------------------------------------------------
  // 2b. The removal check (00224)
  // -------------------------------------------------------------------------
  //
  // The route deletes the storage OBJECT before the row, so that a removal which
  // did not remove the picture is visible with the photo still on the card to
  // retry. That inversion means the row delete is no longer what proves the
  // caller may do this — and the object delete runs on the service-role client
  // against a bucket with no policies at all. So this function is what stands in
  // front of it: it mutates nothing, and its gate is byte for byte the delete
  // RPC's, refusals included.
  describe("assert_can_delete_session_image", () => {
    /** One photo on a group the test gedu does not teach. */
    async function photoOnOtherGroup(date: string): Promise<string> {
      const { data: session } = await admin
        .from("group_sessions")
        .insert({
          group_id: GROUP_OTHER,
          session_date: date,
          starts_at: `${date}T23:00:00Z`,
          ends_at: `${date}T23:59:00Z`,
        })
        .select("id")
        .single();
      const { data: image } = await admin
        .from("group_session_images")
        .insert({ session_id: session!.id, width: 1920, height: 1080 })
        .select("id")
        .single();
      return image!.id;
    }

    it("refuses a gedu the photos of a group they do not teach", async () => {
      const id = await photoOnOtherGroup(YESTERDAY);

      const { error } = await geduAuth.rpc("assert_can_delete_session_image", {
        p_image_id: id,
      });
      expect(error?.code).toBe("42501");

      // And nothing moved. A refusal here is what keeps the route's privileged
      // storage call from ever running for this caller.
      const { count } = await admin
        .from("group_session_images")
        .select("*", { count: "exact", head: true })
        .eq("id", id);
      expect(count).toBe(1);
    });

    it("answers a photo id that belongs to nothing exactly as it answers someone else's", async () => {
      // The same oracle-free refusal the delete RPC carries, and a check-only
      // function is exactly the shape that would tempt somebody to distinguish
      // the two "for a better message" — which would turn it into an oracle for
      // real photo ids, and a real id names an object in a public bucket.
      const id = await photoOnOtherGroup(TWO_DAYS_AGO);

      const theirs = await geduAuth.rpc("assert_can_delete_session_image", {
        p_image_id: id,
      });
      const missing = await geduAuth.rpc("assert_can_delete_session_image", {
        p_image_id: NO_SUCH_IMAGE,
      });

      expect(theirs.error?.code).toBe("42501");
      expect(missing.error?.code).toBe("42501");
      expect(missing.error?.message).toBe(theirs.error?.message);
    });

    it("passes ANY assigned gedu, hands back the id, and deletes nothing", async () => {
      // No per-photo ownership here either: the check has to admit whoever the
      // delete admits, or the route would refuse a removal the RPC behind it
      // would have allowed.
      const id = await attach(geduAuth, YESTERDAY);

      const { data, error } = await peerAuth.rpc(
        "assert_can_delete_session_image",
        { p_image_id: id },
      );
      expect(error).toBeNull();
      // The id it validated — a positive answer rather than the absence of an
      // error. It discloses nothing: it is the id the caller just sent, and it
      // comes back only on the path where they were allowed.
      expect(data).toBe(id);

      // It is a CHECK. The photo is still there, which is what lets the route
      // put it before the storage delete and still keep the row as the retry.
      expect(await storedImages()).toHaveLength(1);
    });

    it("passes an admin on a group they teach nothing of", async () => {
      const id = await attach(geduAuth, YESTERDAY);

      const { data, error } = await adminAuth.rpc(
        "assert_can_delete_session_image",
        { p_image_id: id },
      );
      expect(error).toBeNull();
      expect(data).toBe(id);
      expect(await storedImages()).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // 3. The cap
  // -------------------------------------------------------------------------

  describe("the cap", () => {
    it("refuses the photo past the cap the caller asked for", async () => {
      for (let i = 0; i < CAP; i++) {
        await attach(geduAuth, YESTERDAY);
      }

      const { error } = await geduAuth.rpc("add_group_session_image", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_width: 1920,
        p_height: 1080,
        p_max_images: CAP,
      });

      // A SQLSTATE of its own, because the UI answers it differently from every
      // other refusal: "remove one first", not "that did not work".
      expect(error?.code).toBe("P0023");
      expect(await storedImages()).toHaveLength(CAP);
    });

    it("enforces the cap the CALLER passed, not a number baked into SQL", async () => {
      // The whole reason the cap is a parameter: raising it is a one-line change
      // to one constant in the contracts module, with no migration. A caller
      // asking for one more gets one more.
      for (let i = 0; i < CAP; i++) {
        await attach(geduAuth, YESTERDAY);
      }

      const { error } = await geduAuth.rpc("add_group_session_image", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_width: 1920,
        p_height: 1080,
        p_max_images: CAP + 1,
      });
      expect(error).toBeNull();
      expect(await storedImages()).toHaveLength(CAP + 1);
    });

    it("refuses a cap outside the 1..24 SQL will honour", async () => {
      // The hard sanity ceiling behind the parameter. It is not the product cap
      // and is not derived from it — it only stops a buggy caller asking for
      // something absurd, and it is checked before anything is materialized.
      for (const cap of [0, -1, 25, 1000]) {
        const { error } = await geduAuth.rpc("add_group_session_image", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_width: 1920,
          p_height: 1080,
          p_max_images: cap,
        });
        expect(error?.code).toBe("23514");
      }

      expect(await storedImages()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Dimensions
  // -------------------------------------------------------------------------

  describe("dimensions", () => {
    it("refuses implausible dimensions as one class", async () => {
      // The client claims these and the server bounds them; all gallery and
      // email geometry is arithmetic from them, so a nonsense value is a
      // mis-sized box rather than a security problem — which is exactly why the
      // bound is a sanity ceiling rather than a re-derivation from the bytes.
      for (const [width, height] of [
        [0, 1080],
        [1920, 0],
        [4097, 1080],
        [1920, 4097],
        [-1920, 1080],
      ]) {
        const { error } = await geduAuth.rpc("add_group_session_image", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_width: width,
          p_height: height,
          p_max_images: CAP,
        });
        expect(error?.code).toBe("23514");
      }

      expect(await storedImages()).toHaveLength(0);
    });

    it("keeps the table's CHECK behind the RPC, not merely beside it", async () => {
      // The RPC's guard gives one error class for every bad dimension; the
      // constraint is what makes the bound a guarantee rather than a convention,
      // and this is the only writer that can reach past the guard to prove it.
      const { data: session } = await admin
        .from("group_sessions")
        .insert({
          group_id: GROUP_MINE,
          session_date: YESTERDAY,
          starts_at: `${YESTERDAY}T23:00:00Z`,
          ends_at: `${dayOffset(0)}T00:00:00Z`,
        })
        .select("id")
        .single();

      const { error } = await admin
        .from("group_session_images")
        .insert({ session_id: session!.id, width: 5000, height: 1080 });
      expect(error?.code).toBe("23514");
    });

    it("accepts the widest plausible photo", async () => {
      // The ceiling is inclusive, and deliberately looser than the client's
      // ~2048 px edge cap: the two are not derived from one another.
      const id = await attach(geduAuth, YESTERDAY, { width: 4096, height: 4096 });
      expect(id).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // 5. The writers
  // -------------------------------------------------------------------------

  describe("attaching and removing", () => {
    it("attaches a photo, materializes the session, and stamps the uploader", async () => {
      const id = await attach(geduAuth, YESTERDAY, {
        width: 1080,
        height: 1440,
      });

      const stored = await storedImages();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(id);
      expect(stored[0].width).toBe(1080);
      expect(stored[0].height).toBe(1440);
      // Audit, for safeguarding: these are pictures concerning children and
      // "who put this here" must be answerable, on a feed or not.
      expect(stored[0].created_by).toBe(TEST_IDS.GEDU);

      // The session row was created on the way, exactly as a first note or a
      // first attendance mark creates one.
      const { data: row } = await admin
        .from("group_sessions")
        .select("report, gedu_note")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY)
        .single();
      expect(row?.report).toBeNull();
      expect(row?.gedu_note).toBeNull();
    });

    it("removes a photo the same gedu attached", async () => {
      const id = await attach(geduAuth, YESTERDAY);

      const { error } = await geduAuth.rpc("delete_group_session_image", {
        p_image_id: id,
      });
      expect(error).toBeNull();
      expect(await storedImages()).toHaveLength(0);
    });

    it("lets ANY assigned gedu remove another's photo", async () => {
      // There is no per-photo ownership, and that is a decision rather than an
      // oversight: it matches how the report itself is edited under the
      // last-editor model, and a substitute covering the session has to be able
      // to take down a photo that should not have gone up.
      const id = await attach(geduAuth, YESTERDAY);

      const { error } = await peerAuth.rpc("delete_group_session_image", {
        p_image_id: id,
      });
      expect(error).toBeNull();
      expect(await storedImages()).toHaveLength(0);
    });

    it("lets an admin attach and remove on a group they teach nothing of", async () => {
      // The admin holds no assignment on any fixture product here, so a pass is
      // a pass by ROLE — which is the whole of what the widening grants. The
      // admin product page reuses the gedu session components, so a control it
      // draws has to be served.
      const { data: id, error } = await adminAuth.rpc(
        "add_group_session_image",
        {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_width: 1920,
          p_height: 1080,
          p_max_images: CAP,
        },
      );
      expect(error).toBeNull();

      const stored = await storedImages();
      expect(stored[0]?.created_by).toBe(TEST_IDS.ADMIN);

      const removed = await adminAuth.rpc("delete_group_session_image", {
        p_image_id: id ?? "",
      });
      expect(removed.error).toBeNull();
      expect(await storedImages()).toHaveLength(0);
    });

    it("refuses a date the session record does not reach", async () => {
      // The same loose, holiday-blind validation every session write is held to.
      // A photo cannot document a session that was never scheduled.
      const { error } = await geduAuth.rpc("add_group_session_image", {
        p_group_id: GROUP_MINE,
        p_session_date: dayOffset(-400),
        p_width: 1920,
        p_height: 1080,
        p_max_images: CAP,
      });
      expect(error?.code).toBe("23514");
    });

    it("takes a session's photos with it when the session row goes", async () => {
      // The whole of the retention model: a photo lives exactly as long as its
      // report. No timer, no reaper, no scheduled job. The objects behind these
      // rows are orphaned by this path — accepted, rare and admin-driven, and
      // reconciled by joining derived names against storage if it ever matters.
      await attach(geduAuth, YESTERDAY);
      await attach(geduAuth, YESTERDAY);
      expect(await storedImages()).toHaveLength(2);

      await admin
        .from("group_sessions")
        .delete()
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY);

      expect(await storedImages()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 6. The gedu document
  // -------------------------------------------------------------------------

  // The photos are inspected through the feature's OWN contracts schema, widened
  // in place — the same parse the service performs on every real read, run here
  // against real Postgres output so SQL and TypeScript cannot drift apart
  // quietly. `created_by` staying off an image's wire shape is asserted by
  // whole-object equality on the image objects (the schema is tolerant, so a
  // strict nested shape would contradict the tolerance the next paragraph
  // relies on) — a raw-document key search cannot work here, because the
  // session row itself legitimately carries its own `created_by` audit column.
  describe("get_gedu_group_feed", () => {
    it("carries each session's photos, oldest first, and never the uploader", async () => {
      const first = await attach(geduAuth, YESTERDAY, {
        width: 1920,
        height: 1080,
      });
      const second = await attach(geduAuth, YESTERDAY, {
        width: 1080,
        height: 1440,
      });

      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });
      expect(error).toBeNull();

      const session = geduGroupFeed
        .parse(data)
        .sessions.find((s) => s.session_date === YESTERDAY);

      // Display order on every surface, and what the clock_timestamp() stamp
      // taken under the session lock plus the id tiebreak exist to make stable.
      expect(session?.images.map((i) => i.id)).toEqual([first, second]);
      expect(session?.images[0]).toEqual({
        id: first,
        width: 1920,
        height: 1080,
      });
      // Mixed ratios travel intact — the gallery's geometry is arithmetic from
      // these and is never measured.
      expect(session?.images[1]).toEqual({
        id: second,
        width: 1080,
        height: 1440,
      });

      // `created_by` stays off an IMAGE's wire shape for the same reason
      // `report_emailed_by` stays off the session's: audit that nothing
      // renders. Whole-object equality on the raw image objects is the check
      // that binds — the session object legitimately carries its own
      // `created_by` audit column, so searching the raw document for the key
      // name would match something real.
      const rawSession = z
        .object({
          sessions: z.array(
            z
              .object({
                session_date: z.string(),
                images: z.array(z.record(z.string(), z.unknown())),
              })
              .passthrough(),
          ),
        })
        .parse(data)
        .sessions.find((s) => s.session_date === YESTERDAY);
      expect(rawSession?.images).toHaveLength(2);
      for (const image of rawSession?.images ?? []) {
        expect(Object.keys(image).sort()).toEqual(["height", "id", "width"]);
      }
    });

    it("hands an admin the same photos on a group they teach nothing of", async () => {
      const id = await attach(geduAuth, YESTERDAY);

      const { data, error } = await adminAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });
      expect(error).toBeNull();

      const session = geduGroupFeed
        .parse(data)
        .sessions.find((s) => s.session_date === YESTERDAY);
      expect(session?.images.map((i) => i.id)).toEqual([id]);
    });

    it("hands back an empty array for a session with no photos", async () => {
      // An empty array rather than a missing key or a null, so the renderer has
      // one shape to handle.
      const { error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "Nothing photogenic happened.",
        p_gedu_note: "",
      });
      expect(error).toBeNull();

      const { data } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });
      const session = geduGroupFeed
        .parse(data)
        .sessions.find((s) => s.session_date === YESTERDAY);
      expect(session?.images).toEqual([]);
    });

    it("still parses through the contract the deployed app carries", async () => {
      // The gedu half of the release-window question. This schema is tolerant of
      // unknown keys — it strips them — so the app deployed a minute before the
      // migration went on parsing this document happily, ignoring the key it had
      // never heard of. (The family document is `.strict()` and does briefly
      // fail its parse in that window; the severity paragraph in
      // docs/plans/CLAUDE.md's "Landing in stages" section settles that transient
      // read-side breakage as inside the accepted window.) The whole document is
      // parsed here, so a failure means the widening changed something other
      // than adding that key.
      await attach(geduAuth, YESTERDAY);

      const { data } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });

      const feed = geduGroupFeed.parse(data);
      expect(feed.group.id).toBe(GROUP_MINE);
      expect(feed.roster).toHaveLength(1);
      expect(
        feed.sessions.find((s) => s.session_date === YESTERDAY),
      ).toBeDefined();
    });
  });
});
