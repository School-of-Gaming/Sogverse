import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  SUPPORTED_ATTENDANCE_STATUSES,
  attendanceMarkResult,
  geduAssignmentSummaries,
  geduGroupFeed,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { groupMemberMinecraftResult } from "@/services/minecraft/minecraft.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * The gedu session feed: the two read RPCs, the four write RPCs, and the
 * guarantees the migration claims for them.
 *
 * The RPCs are the ONLY way into `group_sessions` and `session_attendance` —
 * neither table grants anything to `authenticated` — so this file is where
 * "who may write what" is actually settled. Three separate authorizations are
 * pinned, because they fail differently:
 *
 *   1. **Role** — only a gedu passes. Admin is refused too, matching every
 *      other gedu RPC on the surface; admin override is a service-role concern
 *      and has no UI.
 *   2. **Assignment (the actor)** — a gedu may only touch groups they teach.
 *   3. **Roster membership (the target)** — an assigned gedu may only mark, or
 *      edit the Minecraft name of, children actually in that group. A test
 *      where the attacker fails the role check as well proves much less than
 *      one where only the target check stands between them and the row.
 *
 * Plus the two rules that are easy to state and easy to lose: attendance opens
 * at the session's scheduled start (roll call during the session, never
 * before it), and a mark is written ONE AT A TIME so two gedus recording
 * different children cannot clobber each other.
 *
 * Layout. PRODUCT_MINE is a seven-day-a-week schedule owned by GEDU through
 * "Cohort A", so any calendar date inside the run is a legal session date and
 * the tests can talk about "yesterday" and "tomorrow" without hunting for a
 * matching weekday. GAMER is on its roster; GAMER_2 is deliberately NOT, which
 * makes them the sharp target for the roster checks. PRODUCT_OTHER exists so
 * there is a group the gedu genuinely does not teach.
 */

const PRODUCT_MINE = "00000000-0000-0000-0000-000000000601";
const PRODUCT_OTHER = "00000000-0000-0000-0000-000000000602";
const PRODUCT_SITE = "00000000-0000-0000-0000-000000000603";
const GROUP_MINE = "00000000-0000-0000-0000-000000000604";
const GROUP_OTHER = "00000000-0000-0000-0000-000000000605";
const GROUP_SITE = "00000000-0000-0000-0000-000000000606";

const ALL_PRODUCTS = [PRODUCT_MINE, PRODUCT_OTHER, PRODUCT_SITE];

/**
 * The slot every fixture product runs on, seven days a week.
 *
 * **Late in the day on purpose.** A 23:00 start with a one-hour duration means
 * today's session ends at tomorrow's midnight, so it has NOT finished at any
 * hour the suite might run — while yesterday's ended at today's midnight and
 * therefore always has. Without that, "how many past sessions are owed"
 * silently changes answer depending on what time CI started.
 */
const SLOT_START = "23:00";
const SLOT_MINUTES = 60;

/** `YYYY-MM-DD`, `offset` days from today. The products all run in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const TODAY = dayOffset(0);
const YESTERDAY = dayOffset(-1);
const TWO_DAYS_AGO = dayOffset(-2);
const TOMORROW = dayOffset(1);

describe("gedu session feed", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let customerAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

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
        name: "Session feed fixture",
        short_description: "Seeded by gedu-session-feed.test.ts",
      });
      // Every weekday, so any date in the run is a legal session date and the
      // tests can talk about "yesterday" without hunting for a matching one.
      for (let weekday = 0; weekday < 7; weekday++) {
        await createScheduleSlot(admin, id, {
          weekday,
          startTime: SLOT_START,
          durationMinutes: SLOT_MINUTES,
        });
      }
    }

    // PRODUCT_SITE is the in-person one: it is the only way to exercise the
    // site-notes write path, whose authorization is "you teach a group on an
    // in-person product AT THIS BUILDING".
    await admin
      .from("products")
      .update({ is_remote: false, location_id: TEST_IDS.LOCATION_SITE })
      .eq("id", PRODUCT_SITE);

    await admin.from("product_groups").insert([
      { id: GROUP_MINE, product_id: PRODUCT_MINE, name: "Cohort A" },
      { id: GROUP_OTHER, product_id: PRODUCT_OTHER, name: "Cohort Elsewhere" },
      { id: GROUP_SITE, product_id: PRODUCT_SITE, name: "Cohort On Site" },
    ]);

    await admin.from("gedu_group_assignments").insert([
      {
        group_id: GROUP_MINE,
        gedu_id: TEST_IDS.GEDU,
        product_id: PRODUCT_MINE,
      },
      {
        group_id: GROUP_SITE,
        gedu_id: TEST_IDS.GEDU,
        product_id: PRODUCT_SITE,
      },
    ]);

    // GAMER is on the roster; GAMER_2 is on the OTHER product entirely, so
    // aiming a mark at them is the target-authorization case.
    await admin.from("participations").insert([
      {
        product_id: PRODUCT_MINE,
        group_id: GROUP_MINE,
        gamer_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
      {
        product_id: PRODUCT_OTHER,
        group_id: GROUP_OTHER,
        gamer_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
      },
    ]);
  });

  afterAll(async () => {
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    await admin
      .from("site_details")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
    await admin
      .from("site_staff_details")
      .delete()
      .eq("location_id", TEST_IDS.LOCATION_SITE);
  });

  /** Wipe the materialized rows so each block starts from "nothing recorded". */
  beforeEach(async () => {
    await admin
      .from("group_sessions")
      .delete()
      .in("group_id", [GROUP_MINE, GROUP_OTHER, GROUP_SITE]);
  });

  // -------------------------------------------------------------------------
  // 1. Role gate
  // -------------------------------------------------------------------------

  describe("role gate", () => {
    it("refuses every non-gedu role on the feed read", async () => {
      for (const client of [adminAuth, customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_gedu_group_feed", {
          p_group_id: GROUP_MINE,
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("refuses every non-gedu role on the assignment summaries", async () => {
      for (const client of [adminAuth, customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_my_gedu_assignment_summaries", {
          p_epoch_date: dayOffset(-365),
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("refuses every non-gedu role on each write path", async () => {
      for (const client of [adminAuth, customerAuth, gamerAuth]) {
        const notes = await client.rpc("set_group_session_notes", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_report: "nope",
          p_gedu_note: "",
        });
        expect(notes.error?.code).toBe("42501");

        const mark = await client.rpc("record_attendance", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_gamer_id: TEST_IDS.GAMER,
          p_status: "present",
        });
        expect(mark.error?.code).toBe("42501");

        const groupNotes = await client.rpc("set_group_notes", {
          p_group_id: GROUP_MINE,
          p_public_note: "nope",
          p_gedu_note: "",
        });
        expect(groupNotes.error?.code).toBe("42501");

        const siteNotes = await client.rpc("set_site_notes", {
          p_location_id: TEST_IDS.LOCATION_SITE,
          p_address: "nope",
          p_public_note: "",
          p_gedu_note: "",
        });
        expect(siteNotes.error?.code).toBe("42501");

        const minecraft = await client.rpc("set_group_member_minecraft", {
          p_gamer_id: TEST_IDS.GAMER,
          p_minecraft_username: "Defaced",
          p_minecraft_uuid: "",
        });
        expect(minecraft.error?.code).toBe("42501");
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Assignment gate — the actor
  // -------------------------------------------------------------------------

  describe("assignment gate", () => {
    it("refuses a gedu reading a group they do not teach", async () => {
      const { error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_OTHER,
      });
      expect(error?.code).toBe("42501");
    });

    it("refuses a gedu writing notes on a group they do not teach", async () => {
      const { error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_OTHER,
        p_session_date: YESTERDAY,
        p_report: "not mine",
        p_gedu_note: "",
      });
      expect(error?.code).toBe("42501");

      const { count } = await admin
        .from("group_sessions")
        .select("*", { count: "exact", head: true })
        .eq("group_id", GROUP_OTHER);
      expect(count).toBe(0);
    });

    it("refuses site notes for a building the gedu runs nothing at", async () => {
      // The municipality is a real location the gedu can read; what they do not
      // have is a product running there. That is the only thing standing
      // between them and the row, which is what makes it worth asserting.
      const { error } = await geduAuth.rpc("set_site_notes", {
        p_location_id: TEST_IDS.LOCATION_MUNICIPALITY,
        p_address: "not my building",
        p_public_note: "",
        p_gedu_note: "",
      });
      expect(error?.code).toBe("42501");
    });
  });

  // -------------------------------------------------------------------------
  // 3. Target authorization — the child
  // -------------------------------------------------------------------------

  describe("target authorization", () => {
    it("refuses a mark for a child who is not on the group's roster", async () => {
      const { error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_gamer_id: TEST_IDS.GAMER_2,
        p_status: "present",
      });
      expect(error?.code).toBe("42501");
    });

    it("refuses a Minecraft edit for a child the gedu does not teach", async () => {
      const { error } = await geduAuth.rpc("set_group_member_minecraft", {
        p_gamer_id: TEST_IDS.GAMER_2,
        p_minecraft_username: "Defaced",
        p_minecraft_uuid: "",
      });
      expect(error?.code).toBe("42501");
    });

    it("allows a Minecraft edit for a child on the gedu's own roster", async () => {
      const { data, error } = await geduAuth.rpc(
        "set_group_member_minecraft",
        {
          p_gamer_id: TEST_IDS.GAMER,
          p_minecraft_username: "FeedFixture",
          p_minecraft_uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      );

      expect(error).toBeNull();
      const written = groupMemberMinecraftResult.parse(data);
      // The name and the uuid land TOGETHER — that pairing is what makes a
      // gedu's save read as verified rather than pending.
      expect(written.minecraft_username).toBe("FeedFixture");
      expect(written.minecraft_uuid).toBe(
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      );
    });

    it("clearing the username clears the uuid with it", async () => {
      const { data, error } = await geduAuth.rpc(
        "set_group_member_minecraft",
        {
          p_gamer_id: TEST_IDS.GAMER,
          p_minecraft_username: "",
          p_minecraft_uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        },
      );

      expect(error).toBeNull();
      const written = groupMemberMinecraftResult.parse(data);
      expect(written.minecraft_username).toBeNull();
      // A uuid with no name behind it is a verified link to nothing.
      expect(written.minecraft_uuid).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Write validation — loose, holiday-blind, start-gated for attendance
  // -------------------------------------------------------------------------

  describe("write validation", () => {
    it("refuses a date before the product started", async () => {
      const { error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: dayOffset(-400),
        p_report: "before the beginning",
        p_gedu_note: "",
      });
      expect(error?.code).toBe("23514");
    });

    it("refuses a date beyond the visible horizon", async () => {
      const { error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: dayOffset(400),
        p_report: "far too far ahead",
        p_gedu_note: "",
      });
      expect(error?.code).toBe("23514");
    });

    it("accepts notes on a FUTURE session — forward planning is the point", async () => {
      const { data, error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: TOMORROW,
        p_report: "Tomorrow we build a castle.",
        p_gedu_note: "Start the machines early.",
      });

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    it("refuses attendance on a session that has not started", async () => {
      const { error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: TOMORROW,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      // Marks open at the scheduled START, and the server is what enforces it —
      // a client that forgot would otherwise record who attended a session
      // nobody has run. (During the session is fine: see the roll-call case.)
      expect(error?.code).toBe("23514");
    });

    it("accepts attendance during a session that is under way", async () => {
      // The roll-call pattern: the gedu starts the club, calls the roster, and
      // records attendance right there, while they can see who is in the room.
      // Materialize the row directly with a window straddling `now` — the RPC
      // reuses an existing row's snapshot instants rather than re-deriving, so
      // this stands at any hour the suite runs, unlike the fixture slot.
      const { error: seedError } = await admin.from("group_sessions").insert({
        group_id: GROUP_MINE,
        session_date: TODAY,
        starts_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        ends_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      expect(seedError).toBeNull();

      const { data, error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: TODAY,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      expect(error).toBeNull();
      expect(attendanceMarkResult.parse(data).status).toBe("present");
    });

    it("refuses a status outside the supported vocabulary", async () => {
      // The tuple in the contracts file and the CHECK on the table have to
      // agree; this is the assertion that notices when they stop.
      const { error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "maybe",
      });
      expect(error?.code).toBe("23514");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Materialization + per-mark attendance
  // -------------------------------------------------------------------------

  describe("materialization", () => {
    it("creates no row until something is recorded", async () => {
      const { count } = await admin
        .from("group_sessions")
        .select("*", { count: "exact", head: true })
        .eq("group_id", GROUP_MINE);
      expect(count).toBe(0);
    });

    it("derives the session instants server-side from the schedule", async () => {
      const { data, error } = await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "We built a castle.",
        p_gedu_note: "",
      });
      expect(error).toBeNull();

      const { data: row } = await admin
        .from("group_sessions")
        .select("*")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY)
        .single();

      // The client sent a date and nothing else; the 23:00 + 60min slot is
      // where these came from.
      expect(row?.starts_at).toBe(`${YESTERDAY}T23:00:00+00:00`);
      expect(row?.ends_at).toBe(`${TODAY}T00:00:00+00:00`);
      expect(row?.created_by).toBe(TEST_IDS.GEDU);
      expect(data).not.toBeNull();
    });

    it("keeps the original snapshot when the schedule later moves", async () => {
      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "First write.",
        p_gedu_note: "",
      });

      // An admin shifts every slot two hours earlier. The row already exists,
      // so its instants must not follow — history does not change because the
      // plan was edited.
      await admin
        .from("schedule_slots")
        .update({ start_time: "21:00" })
        .eq("product_id", PRODUCT_MINE);

      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "Second write.",
        p_gedu_note: "",
      });

      const { data: row } = await admin
        .from("group_sessions")
        .select("starts_at, report")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY)
        .single();

      expect(row?.starts_at).toBe(`${YESTERDAY}T23:00:00+00:00`);
      expect(row?.report).toBe("Second write.");

      await admin
        .from("schedule_slots")
        .update({ start_time: SLOT_START })
        .eq("product_id", PRODUCT_MINE);
    });

    it("collapses an emptied note back to null", async () => {
      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "Something.",
        p_gedu_note: "Private something.",
      });
      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "   ",
        p_gedu_note: "",
      });

      const { data: row } = await admin
        .from("group_sessions")
        .select("report, gedu_note")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY)
        .single();

      expect(row?.report).toBeNull();
      expect(row?.gedu_note).toBeNull();
    });
  });

  describe("attendance", () => {
    it("stores every supported status", async () => {
      for (const status of SUPPORTED_ATTENDANCE_STATUSES) {
        const { error } = await geduAuth.rpc("record_attendance", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_gamer_id: TEST_IDS.GAMER,
          p_status: status,
        });
        expect(error).toBeNull();

        const { data: rows } = await admin
          .from("session_attendance")
          .select("status")
          .eq("gamer_id", TEST_IDS.GAMER);

        expect(rows?.[0]?.status).toBe(status);
      }
    });

    it("materializes the session on the first mark, with no note written", async () => {
      const { error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: TWO_DAYS_AGO,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      expect(error).toBeNull();

      const { data: row } = await admin
        .from("group_sessions")
        .select("report, gedu_note")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", TWO_DAYS_AGO)
        .single();

      expect(row?.report).toBeNull();
      expect(row?.gedu_note).toBeNull();
    });

    it("reverting to unmarked deletes the row rather than storing a value", async () => {
      await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "absent",
      });

      // The empty string is how a browser caller spells "no answer": the
      // generated argument types have no SQL NULL to send.
      const { error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "",
      });
      expect(error).toBeNull();

      const { count } = await admin
        .from("session_attendance")
        .select("*", { count: "exact", head: true })
        .eq("gamer_id", TEST_IDS.GAMER);

      // Unmarked has to stay the ABSENCE of a record — a stored "unmarked"
      // would be indistinguishable from an answer to every reader.
      expect(count).toBe(0);
    });

    it("re-marking the same child updates in place instead of duplicating", async () => {
      for (const status of ["present", "absent", "present"]) {
        await geduAuth.rpc("record_attendance", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_gamer_id: TEST_IDS.GAMER,
          p_status: status,
        });
      }

      const { count } = await admin
        .from("session_attendance")
        .select("*", { count: "exact", head: true })
        .eq("gamer_id", TEST_IDS.GAMER);

      expect(count).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // 6. The read contracts, parsed against real Postgres output
  // -------------------------------------------------------------------------

  describe("get_gedu_group_feed", () => {
    it("returns the workspace document, parsed through the contract schema", async () => {
      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "# Yesterday\n\nWe built a castle.",
        p_gedu_note: "Two laptops still cannot hear shared audio.",
      });
      await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      await geduAuth.rpc("set_group_notes", {
        p_group_id: GROUP_MINE,
        p_public_note: "This group carries its world between sessions.",
        p_gedu_note: "Pair Siiri rather than letting her choose.",
      });

      const { data, error } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });
      expect(error).toBeNull();

      const feed = geduGroupFeed.parse(data);

      expect(feed.group.id).toBe(GROUP_MINE);
      expect(feed.group.public_note).toContain("carries its world");
      expect(feed.group.gedu_note).toContain("Siiri");
      // Remote product: no building, so no site block at all.
      expect(feed.site).toBeNull();
      expect(feed.product.schedule_slots.length).toBe(7);

      expect(feed.roster).toHaveLength(1);
      // Tightened to non-null in the contract, and this is what backs that
      // claim: every gamer account is created by a parent who signed up.
      expect(feed.roster[0].parent_email).toBeTruthy();
      expect(feed.roster[0].signed_up_at).toBeTruthy();

      const session = feed.sessions.find((s) => s.session_date === YESTERDAY);
      expect(session?.report).toContain("castle");
      expect(session?.attendance[TEST_IDS.GAMER]).toBe("present");
      // Reserved concepts, no UI on either side, but parsed so the shape is
      // honest about what the table holds.
      expect(session?.did_not_run).toBe(false);
      expect(session?.needs_substitute).toBe(false);
    });

    it("returns an empty session list and a real roster before anything is recorded", async () => {
      const { data } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });
      const feed = geduGroupFeed.parse(data);

      expect(feed.sessions).toEqual([]);
      expect(feed.roster).toHaveLength(1);
    });

    it("carries the site block on an in-person product", async () => {
      await geduAuth.rpc("set_site_notes", {
        p_location_id: TEST_IDS.LOCATION_SITE,
        p_address: "Leppavaarankatu 9",
        p_public_note: "Drop-off is at the main entrance.",
        p_gedu_note: "Room key is at the info desk.",
      });

      const { data } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_SITE,
      });
      const feed = geduGroupFeed.parse(data);

      expect(feed.site?.location_id).toBe(TEST_IDS.LOCATION_SITE);
      expect(feed.site?.address).toBe("Leppavaarankatu 9");
      expect(feed.site?.public_note).toContain("Drop-off");
      expect(feed.site?.gedu_note).toContain("info desk");
    });

    it("surfaces the gedu-only material link", async () => {
      await admin
        .from("products")
        .update({ material_url: "https://drive.sog.gg/lesson-plans" })
        .eq("id", PRODUCT_MINE);

      const { data } = await geduAuth.rpc("get_gedu_group_feed", {
        p_group_id: GROUP_MINE,
      });
      const feed = geduGroupFeed.parse(data);

      expect(feed.product.material_url).toBe(
        "https://drive.sog.gg/lesson-plans",
      );

      await admin
        .from("products")
        .update({ material_url: null })
        .eq("id", PRODUCT_MINE);
    });
  });

  describe("get_my_gedu_assignment_summaries", () => {
    it("returns one entry per assignment, parsed through the contract schema", async () => {
      const { data, error } = await geduAuth.rpc(
        "get_my_gedu_assignment_summaries",
        { p_epoch_date: dayOffset(-365) },
      );
      expect(error).toBeNull();

      const summaries = geduAssignmentSummaries.parse(data);
      const mine = summaries.find((s) => s.group_id === GROUP_MINE);
      const onSite = summaries.find((s) => s.group_id === GROUP_SITE);

      expect(mine?.group_name).toBe("Cohort A");
      expect(mine?.group_gamer_count).toBe(1);
      // Remote: no building at all, which is a different answer from "we do not
      // know the name".
      expect(mine?.site_name).toBeNull();

      // In-person: the venue name the dashboard card puts in its footer.
      expect(onSite?.site_name).toBeTruthy();

      // The gedu teaches neither of these.
      expect(summaries.some((s) => s.group_id === GROUP_OTHER)).toBe(false);
    });

    it("counts an unrecorded past session as outstanding work", async () => {
      const { data } = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: TWO_DAYS_AGO,
      });
      const summaries = geduAssignmentSummaries.parse(data);
      const mine = summaries.find((s) => s.group_id === GROUP_MINE);

      // Two days ago and yesterday have both finished; today's has not, and
      // nothing has been recorded against either of the two that have.
      expect(mine?.attention_count).toBe(2);
    });

    it("stops counting a session once every roster member is marked", async () => {
      for (const date of [TWO_DAYS_AGO, YESTERDAY]) {
        await geduAuth.rpc("record_attendance", {
          p_group_id: GROUP_MINE,
          p_session_date: date,
          p_gamer_id: TEST_IDS.GAMER,
          p_status: "present",
        });
      }

      const { data } = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: TWO_DAYS_AGO,
      });
      const summaries = geduAssignmentSummaries.parse(data);

      expect(
        summaries.find((s) => s.group_id === GROUP_MINE)?.attention_count,
      ).toBe(0);
    });

    it("owes nothing for sessions before the epoch, however incomplete", async () => {
      // The epoch gates what is OWED and nothing else — the same two sessions
      // are still fully recordable, they simply stop being asked for.
      const { data } = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: dayOffset(1),
      });
      const summaries = geduAssignmentSummaries.parse(data);

      expect(
        summaries.find((s) => s.group_id === GROUP_MINE)?.attention_count,
      ).toBe(0);
    });

    it("still lets a pre-epoch session be recorded", async () => {
      // The write validator has no epoch floor, deliberately: a gedu catching
      // up on last term's register must not be refused by the same constant
      // that decides whether we nag them about it.
      const { error } = await geduAuth.rpc("record_attendance", {
        p_group_id: GROUP_MINE,
        p_session_date: dayOffset(-20),
        p_gamer_id: TEST_IDS.GAMER,
        p_status: "present",
      });
      expect(error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 7. The tables are unreachable except through the RPCs
  // -------------------------------------------------------------------------

  describe("direct table access", () => {
    it("gives an authenticated gedu no direct read or write on the session tables", async () => {
      await geduAuth.rpc("set_group_session_notes", {
        p_group_id: GROUP_MINE,
        p_session_date: YESTERDAY,
        p_report: "Written through the RPC.",
        p_gedu_note: "",
      });

      // No grant at all, so PostgREST refuses before RLS is consulted. That is
      // the stronger of the two guarantees and it is the one this design
      // relies on: it is also why these tables need no write-IDOR case.
      const read = await geduAuth.from("group_sessions").select("*");
      expect(read.error).not.toBeNull();

      const write = await geduAuth
        .from("group_sessions")
        .update({ report: "Defaced" })
        .eq("group_id", GROUP_MINE)
        .select("id");
      expect(write.data ?? []).toEqual([]);

      const attendance = await geduAuth.from("session_attendance").select("*");
      expect(attendance.error).not.toBeNull();
    });
  });
});
