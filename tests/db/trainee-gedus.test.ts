import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { geduAssignmentSummaries } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { myAssignedProductRows } from "@/services/assignments/assignments.contracts";
import { chatChannelRoster } from "@/services/chat/chat.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_CREDENTIALS, TEST_IDS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";

/**
 * Trainee seats: a gedu placed on one group to shadow it, who opens the same
 * workspace an assigned gedu opens with what a gamer on the group could see.
 *
 * Pinned here, in the order a failure would matter:
 *
 *   1. **Every staff gate stays shut.** The trainee is refused by the gedu
 *      workspace document and by every write on it, is not a voice
 *      moderator, and cannot read the photo-consent answers.
 *   2. **The trainee's own document carries nothing redacted** — the keys are
 *      absent from the wire, not blanked.
 *   3. **Families are never told**, and cannot read the table.
 *   4. **One seat per gedu per product**, refused from both tables, and a
 *      promotion is one atomic batch.
 *
 * Layout. PRODUCT_MAIN has two groups: GROUP_MINE, where the seeded GEDU is
 * assigned, GAMER sits and the minted trainee shadows; and GROUP_SIBLING,
 * where GAMER_2 sits. PRODUCT_PROMOTE carries one group for the promotion
 * cases, so moving the trainee's seat there never disturbs the rest.
 */

const PRODUCT_MAIN = "00000000-0000-0000-0000-000000000e51";
const PRODUCT_PROMOTE = "00000000-0000-0000-0000-000000000e52";
const GROUP_MINE = "00000000-0000-0000-0000-000000000e53";
const GROUP_SIBLING = "00000000-0000-0000-0000-000000000e54";
const GROUP_PROMOTE = "00000000-0000-0000-0000-000000000e55";
/** A group id that exists nowhere, by shape: no fixture uses the f-range. */
const GROUP_NOWHERE = "00000000-0000-0000-0000-00000000fe5f";

const ALL_PRODUCTS = [PRODUCT_MAIN, PRODUCT_PROMOTE];
const ALL_GROUPS = [GROUP_MINE, GROUP_SIBLING, GROUP_PROMOTE];

const GROUP_STAFF_NOTE = "Trainee-invisible group staff note";
const MEMBER_NOTE = "Trainee-invisible member note";
const SESSION_STAFF_NOTE = "Trainee-invisible session staff note";
const SESSION_REPORT = "We built a castle together.";
const MATERIAL_URL = "https://example.com/trainee-material";

/** `YYYY-MM-DD`, `offset` days from today. The products run in UTC. */
function dayOffset(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const YESTERDAY = dayOffset(-1);

/** Whole years between a date of birth and today in UTC, as the RPC counts them. */
function ageInUtc(dateOfBirth: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [ty, tm, td] = dayOffset(0).split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

type Admin = SupabaseClient<Database>;

/**
 * Deliberately loose: these tests assert on which keys arrive, so every object
 * is kept whole as a record rather than stripped to a known shape.
 */
const record = z.record(z.string(), z.unknown());
const traineeFeed = z.object({
  product: record,
  group: record,
  roster: z.array(record),
  sessions: z.array(record),
  gedus: z.array(record),
  substitutions: z.array(z.unknown()),
  trainees: z.array(record),
});
const traineeProduct = z.object({
  my_group_id: z.string(),
  groups: z.array(record.and(z.object({ roster: z.array(record) }))),
});
const withTrainees = z.object({ trainees: z.array(record) });
const groupsPanel = z.object({
  groups: z.array(z.object({ id: z.string(), trainees: z.array(record) })),
});

describe("trainee gedus", () => {
  let admin: Admin;
  let adminAuth: Admin;
  let customerAuth: Admin;
  let gamerAuth: Admin;
  let geduAuth: Admin;
  let traineeAuth: Admin;
  let traineeId = "";
  let traineeEmail = "";
  let participationId = "";
  let channelId = "";

  async function applyChanges(
    client: Admin,
    productId: string,
    changes: Partial<Database["public"]["Functions"]["apply_group_changes"]["Args"]>,
  ) {
    return client.rpc("apply_group_changes", { p_product_id: productId, ...changes });
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    [adminAuth, customerAuth, gamerAuth, geduAuth] = await Promise.all([
      createAuthenticatedClient(TEST_CREDENTIALS.ADMIN.email, TEST_CREDENTIALS.ADMIN.password),
      createAuthenticatedClient(TEST_CREDENTIALS.CUSTOMER.email, TEST_CREDENTIALS.CUSTOMER.password),
      createAuthenticatedClient(TEST_CREDENTIALS.GAMER.email, TEST_CREDENTIALS.GAMER.password),
      createAuthenticatedClient(TEST_CREDENTIALS.GEDU.email, TEST_CREDENTIALS.GEDU.password),
    ]);

    // Unique per run, and UNCERTIFIED on purpose: trainee status is
    // independent of certification, so nothing here may depend on it.
    traineeEmail = `trainee-${Date.now()}@test.local`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email: traineeEmail,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Tiina", last_name: "Trainee" },
    });
    expect(error).toBeNull();
    traineeId = created.user?.id ?? "";
    expect(traineeId).toBeTruthy();
    await admin.from("profiles").update({ role: "gedu" }).eq("id", traineeId);
    await admin.from("customer_profiles").delete().eq("user_id", traineeId);
    await admin.from("gedu_profiles").insert({ user_id: traineeId, certified: false });
    traineeAuth = await createAuthenticatedClient(traineeEmail, "testpassword123");

    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, seatCount: null, startDate: dayOffset(-30) });
      await admin.from("product_translations").insert({
        product_id: id,
        locale: "en",
        name: "Trainee fixture",
        short_description: "Seeded by trainee-gedus.test.ts",
      });
      for (let weekday = 0; weekday < 7; weekday++) {
        await createScheduleSlot(admin, id, { weekday, startTime: "23:00", durationMinutes: 60 });
      }
    }
    await admin
      .from("product_staff_details")
      .upsert({ product_id: PRODUCT_MAIN, material_url: MATERIAL_URL });

    await admin.from("product_groups").insert([
      { id: GROUP_MINE, product_id: PRODUCT_MAIN, name: "Cohort Trainee", gedu_note: GROUP_STAFF_NOTE },
      { id: GROUP_SIBLING, product_id: PRODUCT_MAIN, name: "Cohort Sibling" },
      { id: GROUP_PROMOTE, product_id: PRODUCT_PROMOTE, name: "Cohort Promote" },
    ]);
    await admin.from("gedu_group_assignments").insert({
      group_id: GROUP_MINE,
      gedu_id: TEST_IDS.GEDU,
      product_id: PRODUCT_MAIN,
    });

    const { data: seats } = await admin
      .from("participations")
      .insert([
        {
          product_id: PRODUCT_MAIN,
          group_id: GROUP_MINE,
          participant_id: TEST_IDS.GAMER,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
        {
          product_id: PRODUCT_MAIN,
          group_id: GROUP_SIBLING,
          participant_id: TEST_IDS.GAMER_2,
          customer_id: TEST_IDS.CUSTOMER,
          status: "active",
        },
      ])
      .select("id, participant_id");
    participationId = seats?.find((s) => s.participant_id === TEST_IDS.GAMER)?.id ?? "";
    expect(participationId).toBeTruthy();
    await admin
      .from("participations")
      .update({ group_joined_at: `${dayOffset(-30)}T00:00:00.000Z` })
      .in("product_id", ALL_PRODUCTS);

    await admin.from("gamer_group_notes").insert({
      group_id: GROUP_MINE,
      participant_id: TEST_IDS.GAMER,
      note: MEMBER_NOTE,
      updated_by: TEST_IDS.GEDU,
    });

    // Yesterday's session, written the way a gedu writes it.
    const notes = await geduAuth.rpc("set_group_session_notes", {
      p_group_id: GROUP_MINE,
      p_session_date: YESTERDAY,
      p_report: SESSION_REPORT,
      p_gedu_note: SESSION_STAFF_NOTE,
    });
    expect(notes.error).toBeNull();
    const mark = await geduAuth.rpc("record_attendance", {
      p_group_id: GROUP_MINE,
      p_session_date: YESTERDAY,
      p_participant_id: TEST_IDS.GAMER,
      p_status: "present",
    });
    expect(mark.error).toBeNull();

    // The seat itself goes in through the admin groups panel's write.
    const placed = await applyChanges(adminAuth, PRODUCT_MAIN, {
      p_trainees_added: [{ groupId: GROUP_MINE, geduId: traineeId }],
    });
    expect(placed.error).toBeNull();

    // A chat channel whose window is open now, so every member reads it.
    const opens = new Date(Date.now() - 10 * 60_000);
    const channel = await admin
      .from("chat_channels")
      .insert({
        type: "group_session",
        group_id: GROUP_MINE,
        session_opens_at: opens.toISOString(),
        session_ends_at: new Date(opens.getTime() + 60 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    expect(channel.error).toBeNull();
    channelId = channel.data?.id ?? "";
  });

  afterAll(async () => {
    await admin.from("chat_channels").delete().in("group_id", ALL_GROUPS);
    await admin.from("gamer_group_notes").delete().in("group_id", ALL_GROUPS);
    await admin.from("group_sessions").delete().in("group_id", ALL_GROUPS);
    await admin.from("gedu_group_trainees").delete().in("product_id", ALL_PRODUCTS);
    await admin.from("gedu_group_assignments").delete().in("product_id", ALL_PRODUCTS);
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
    if (traineeId) await admin.auth.admin.deleteUser(traineeId);
  });

  // -------------------------------------------------------------------------
  // 1. Every staff gate stays shut
  // -------------------------------------------------------------------------

  describe("the staff gates", () => {
    it("refuses the trainee the gedu workspace document and product door", async () => {
      const feed = await traineeAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP_MINE });
      expect(feed.error?.code).toBe("42501");

      const door = await traineeAuth.rpc("get_gedu_assigned_product", {
        p_product_id: PRODUCT_MAIN,
      });
      expect(door.error?.code).toBe("42501");
    });

    it("refuses the trainee every write on the workspace", async () => {
      const writes = [
        traineeAuth.rpc("set_group_session_notes", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_report: "nope",
          p_gedu_note: "",
        }),
        traineeAuth.rpc("record_attendance", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_participant_id: TEST_IDS.GAMER,
          p_status: "absent",
        }),
        traineeAuth.rpc("set_group_notes", {
          p_group_id: GROUP_MINE,
          p_public_note: "nope",
          p_gedu_note: "",
        }),
        traineeAuth.rpc("set_gamer_group_note", {
          p_group_id: GROUP_MINE,
          p_participant_id: TEST_IDS.GAMER,
          p_note: "nope",
        }),
        traineeAuth.rpc("add_group_session_image", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
          p_width: 10,
          p_height: 10,
          p_max_images: 10,
        }),
        traineeAuth.rpc("claim_group_session_report_email", {
          p_group_id: GROUP_MINE,
          p_session_date: YESTERDAY,
        }),
      ];
      for (const { error } of await Promise.all(writes)) {
        expect(error?.code).toBe("42501");
      }

      // And nothing moved: the report is the gedu's, unmailed.
      const { data: session } = await admin
        .from("group_sessions")
        .select("report, report_emailed_at")
        .eq("group_id", GROUP_MINE)
        .eq("session_date", YESTERDAY)
        .single();
      expect(session?.report).toBe(SESSION_REPORT);
      expect(session?.report_emailed_at).toBeNull();
    });

    it("is not a voice moderator, and cannot read a child's photo-consent answers", async () => {
      const moderator = await traineeAuth.rpc("is_voice_group_moderator", {
        p_group_id: GROUP_MINE,
      });
      expect(moderator.data).toBe(false);

      // The photo-consent read policy asks this predicate. It is true for the
      // assigned gedu and false for the trainee on the same child.
      const trainee = await traineeAuth.rpc("gedu_teaches_gamer", {
        p_gamer_id: TEST_IDS.GAMER,
      });
      expect(trainee.data).toBe(false);
      const gedu = await geduAuth.rpc("gedu_teaches_gamer", { p_gamer_id: TEST_IDS.GAMER });
      expect(gedu.data).toBe(true);
    });

    it("is a member of their own group's voice room and no sibling's", async () => {
      const own = await traineeAuth.rpc("is_voice_group_member", { p_group_id: GROUP_MINE });
      expect(own.data).toBe(true);
      const sibling = await traineeAuth.rpc("is_voice_group_member", {
        p_group_id: GROUP_SIBLING,
      });
      expect(sibling.data).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 2. The trainee's own documents
  // -------------------------------------------------------------------------

  describe("get_trainee_group_feed", () => {
    it("serves the trainee the redacted document with nothing staff-only on the wire", async () => {
      const { data, error } = await traineeAuth.rpc("get_trainee_group_feed", {
        p_group_id: GROUP_MINE,
      });
      expect(error).toBeNull();
      const wire = JSON.stringify(data);
      const doc = traineeFeed.parse(data);

      // The sentinels a trainee must never receive, anywhere in the document.
      for (const secret of [
        GROUP_STAFF_NOTE,
        MEMBER_NOTE,
        SESSION_STAFF_NOTE,
        TEST_CREDENTIALS.CUSTOMER.email,
        "2015-06-15",
      ]) {
        expect(wire).not.toContain(secret);
      }

      expect(doc.product.material_url).toBe(MATERIAL_URL);
      expect(Object.keys(doc.group).sort()).toEqual(["id", "name", "public_note"]);

      const roster = doc.roster;
      expect(roster).toHaveLength(1);
      expect(Object.keys(roster[0]).sort()).toEqual(
        [
          "age",
          "creations",
          "first_name",
          "gender",
          "group_joined_at",
          "has_note",
          "minecraft_username",
          "minecraft_uuid",
          "participant_id",
          "roblox_user_id",
          "roblox_username",
          "signed_up_at",
        ].sort(),
      );
      expect(roster[0].participant_id).toBe(TEST_IDS.GAMER);
      expect(roster[0].age).toBe(ageInUtc("2015-06-15"));
      expect(roster[0].gender).toBe("boy");
      expect(roster[0].has_note).toBe(true);
      expect(roster[0].creations).toEqual([]);

      const sessions = doc.sessions;
      expect(sessions).toHaveLength(1);
      expect(sessions[0].report).toBe(SESSION_REPORT);
      expect(sessions[0].attendance).toEqual({});
      for (const key of ["gedu_note", "created_by", "created_at", "updated_at"]) {
        expect(sessions[0]).not.toHaveProperty(key);
      }
      expect(sessions[0]).toHaveProperty("report_emailed_at");
      expect(sessions[0]).toHaveProperty("updated_by_first_name");

      expect(doc.substitutions).toEqual([]);
      expect(doc.gedus).toEqual([
        expect.objectContaining({ id: TEST_IDS.GEDU, role: "primary" }),
      ]);
      expect(doc.trainees).toEqual([{ id: traineeId, first_name: "Tiina" }]);
    });

    it("lets an admin preview it, and refuses an assigned gedu, a parent and a gamer", async () => {
      const preview = await adminAuth.rpc("get_trainee_group_feed", { p_group_id: GROUP_MINE });
      expect(preview.error).toBeNull();

      for (const client of [geduAuth, customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_trainee_group_feed", { p_group_id: GROUP_MINE });
        expect(error?.code).toBe("42501");
      }
    });

    it("refuses the trainee a sibling group of the same product", async () => {
      const { error } = await traineeAuth.rpc("get_trainee_group_feed", {
        p_group_id: GROUP_SIBLING,
      });
      expect(error?.code).toBe("42501");
    });
  });

  describe("get_trainee_assigned_product", () => {
    it("serves the trainee their own group alone, with the redacted roster", async () => {
      const { data, error } = await traineeAuth.rpc("get_trainee_assigned_product", {
        p_product_id: PRODUCT_MAIN,
      });
      expect(error).toBeNull();
      expect(JSON.stringify(data)).not.toContain(MEMBER_NOTE);
      const doc = traineeProduct.parse(data);
      expect(doc.my_group_id).toBe(GROUP_MINE);
      expect(doc.groups.map((g) => g.id)).toEqual([GROUP_MINE]);
      const roster = doc.groups[0].roster;
      expect(roster[0]).not.toHaveProperty("date_of_birth");
      expect(roster[0]).not.toHaveProperty("parent_email");
      expect(roster[0]).not.toHaveProperty("note");
    });

    it("refuses a named group that is not the trainee's, and a gedu with no trainee seat", async () => {
      const wrong = await traineeAuth.rpc("get_trainee_assigned_product", {
        p_product_id: PRODUCT_MAIN,
        p_group_id: GROUP_SIBLING,
      });
      expect(wrong.error?.code).toBe("42501");

      const assigned = await geduAuth.rpc("get_trainee_assigned_product", {
        p_product_id: PRODUCT_MAIN,
      });
      expect(assigned.error?.code).toBe("42501");
    });
  });

  describe("My SOG", () => {
    it("lists the trainee seat as a third kind, owing nothing", async () => {
      const summaries = await traineeAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: dayOffset(-365),
      });
      expect(summaries.error).toBeNull();
      const mine = geduAssignmentSummaries
        .parse(summaries.data)
        .filter((s) => s.product_id === PRODUCT_MAIN);
      expect(mine).toEqual([
        expect.objectContaining({
          kind: "trainee",
          group_id: GROUP_MINE,
          group_participant_count: 1,
          attention_count: 0,
        }),
      ]);

      // The same group owes the assigned gedu yesterday's mail, so the zero is
      // the trainee arm's and not an empty history.
      const gedu = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: dayOffset(-365),
      });
      const geduRow = geduAssignmentSummaries
        .parse(gedu.data)
        .find((s) => s.group_id === GROUP_MINE);
      expect(geduRow?.attention_count).toBeGreaterThan(0);

      const rows = await traineeAuth.rpc("get_my_assigned_products");
      expect(rows.error).toBeNull();
      const productRows = myAssignedProductRows
        .parse(rows.data)
        .filter((r) => r.product_id === PRODUCT_MAIN);
      expect(productRows).toEqual([
        expect.objectContaining({ kind: "trainee", group_id: GROUP_MINE, substitution_date: null }),
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Staff see the trainee; families never do
  // -------------------------------------------------------------------------

  describe("who is told", () => {
    it("names the trainee on the assigned gedu's workspace and the admin groups panel", async () => {
      const feed = await geduAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP_MINE });
      expect(feed.error).toBeNull();
      expect(withTrainees.parse(feed.data).trainees).toEqual([
        { id: traineeId, first_name: "Tiina" },
      ]);

      const panel = await adminAuth.rpc("get_product_groups_with_details", {
        p_product_id: PRODUCT_MAIN,
      });
      expect(panel.error).toBeNull();
      const { groups } = groupsPanel.parse(panel.data);
      expect(groups.find((g) => g.id === GROUP_MINE)?.trainees).toEqual([
        { id: traineeId, first_name: "Tiina", email: traineeEmail },
      ]);
      expect(groups.find((g) => g.id === GROUP_SIBLING)?.trainees).toEqual([]);
    });

    it("lets an admin read every seat and a gedu only their own", async () => {
      const all = await adminAuth
        .from("gedu_group_trainees")
        .select("gedu_id")
        .eq("product_id", PRODUCT_MAIN);
      expect(all.data).toEqual([{ gedu_id: traineeId }]);

      const own = await traineeAuth.from("gedu_group_trainees").select("gedu_id");
      expect(own.data).toEqual([{ gedu_id: traineeId }]);

      const other = await geduAuth
        .from("gedu_group_trainees")
        .select("gedu_id")
        .eq("product_id", PRODUCT_MAIN);
      expect(other.data).toEqual([]);
    });

    it("never tells a parent or a gamer: no row, and no trainee on the family document", async () => {
      for (const client of [customerAuth, gamerAuth]) {
        const { data, error } = await client
          .from("gedu_group_trainees")
          .select("gedu_id")
          .eq("product_id", PRODUCT_MAIN);
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }

      const family = await customerAuth.rpc("get_my_family_product_feed", {
        p_participation_id: participationId,
      });
      expect(family.error).toBeNull();
      const wire = JSON.stringify(family.data);
      expect(wire).not.toContain(traineeId);
      expect(wire).not.toContain("Tiina");
    });

    it("puts the trainee on the call chat's roster, tagged for staff alone", async () => {
      const tagFor = async (client: Admin) => {
        const { data, error } = await client.rpc("get_chat_channel_roster", {
          p_channel_id: channelId,
        });
        expect(error).toBeNull();
        return chatChannelRoster.parse(data).find((row) => row.id === traineeId);
      };

      // Staff are told; a gamer and the trainee themselves are not.
      expect((await tagFor(adminAuth))).toMatchObject({ is_trainee: true });
      expect((await tagFor(geduAuth))).toMatchObject({ is_trainee: true });
      expect((await tagFor(gamerAuth))).toMatchObject({ is_trainee: false, role: "gedu" });
      expect((await tagFor(traineeAuth))).toMatchObject({ is_trainee: false });
    });
  });

  // -------------------------------------------------------------------------
  // 4. One seat per gedu per product, and promotion
  // -------------------------------------------------------------------------

  describe("one seat per gedu per product", () => {
    it("refuses assigning a trainee on the product they train on, from the RPC and the table", async () => {
      const viaPanel = await applyChanges(adminAuth, PRODUCT_MAIN, {
        p_gedu_assignments_added: [
          { groupId: GROUP_SIBLING, geduId: traineeId, role: "primary" },
        ],
      });
      expect(viaPanel.error?.code).toBe("23505");

      const direct = await admin.from("gedu_group_assignments").insert({
        group_id: GROUP_SIBLING,
        gedu_id: traineeId,
        product_id: PRODUCT_MAIN,
      });
      expect(direct.error?.code).toBe("23505");
    });

    it("refuses a trainee seat for a gedu assigned on the product, and a second trainee seat", async () => {
      const assigned = await applyChanges(adminAuth, PRODUCT_MAIN, {
        p_trainees_added: [{ groupId: GROUP_SIBLING, geduId: TEST_IDS.GEDU }],
      });
      expect(assigned.error?.code).toBe("23505");

      const second = await applyChanges(adminAuth, PRODUCT_MAIN, {
        p_trainees_added: [{ groupId: GROUP_SIBLING, geduId: traineeId }],
      });
      expect(second.error?.code).toBe("23505");
    });

    it("refuses a trainee seat for anybody who is not a gedu", async () => {
      const { error } = await applyChanges(adminAuth, PRODUCT_MAIN, {
        p_trainees_added: [{ groupId: GROUP_SIBLING, geduId: TEST_IDS.CUSTOMER }],
      });
      expect(error?.code).toBe("23514");
    });

    it("refuses every role but an admin the write", async () => {
      for (const client of [geduAuth, traineeAuth, customerAuth, gamerAuth]) {
        const { error } = await applyChanges(client, PRODUCT_PROMOTE, {
          p_trainees_added: [{ groupId: GROUP_PROMOTE, geduId: traineeId }],
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("promotes in one atomic batch, and a failed batch leaves the trainee seat standing", async () => {
      const placed = await applyChanges(adminAuth, PRODUCT_PROMOTE, {
        p_trainees_added: [{ groupId: GROUP_PROMOTE, geduId: traineeId }],
      });
      expect(placed.error).toBeNull();

      const seats = async () => {
        const [trainees, assignments] = await Promise.all([
          admin.from("gedu_group_trainees").select("group_id").eq("product_id", PRODUCT_PROMOTE),
          admin
            .from("gedu_group_assignments")
            .select("group_id, role")
            .eq("product_id", PRODUCT_PROMOTE),
        ]);
        return { trainees: trainees.data, assignments: assignments.data };
      };

      // The removal succeeds and the add fails on a group that does not exist,
      // so the whole batch rolls back.
      const failed = await applyChanges(adminAuth, PRODUCT_PROMOTE, {
        p_trainees_removed: [{ groupId: GROUP_PROMOTE, geduId: traineeId }],
        p_gedu_assignments_added: [
          { groupId: GROUP_NOWHERE, geduId: traineeId, role: "primary" },
        ],
      });
      expect(failed.error).not.toBeNull();
      expect(await seats()).toEqual({
        trainees: [{ group_id: GROUP_PROMOTE }],
        assignments: [],
      });

      const promoted = await applyChanges(adminAuth, PRODUCT_PROMOTE, {
        p_trainees_removed: [{ groupId: GROUP_PROMOTE, geduId: traineeId }],
        p_gedu_assignments_added: [
          { groupId: GROUP_PROMOTE, geduId: traineeId, role: "assistant" },
        ],
      });
      expect(promoted.error).toBeNull();
      expect(await seats()).toEqual({
        trainees: [],
        assignments: [{ group_id: GROUP_PROMOTE, role: "assistant" }],
      });

      // Promoted, the gedu reads the full workspace and not the trainee's.
      const full = await traineeAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP_PROMOTE });
      expect(full.error).toBeNull();
      const redacted = await traineeAuth.rpc("get_trainee_group_feed", {
        p_group_id: GROUP_PROMOTE,
      });
      expect(redacted.error?.code).toBe("42501");

      // And back: a demotion is the same batch the other way round.
      const demoted = await applyChanges(adminAuth, PRODUCT_PROMOTE, {
        p_gedu_assignments_removed: [{ groupId: GROUP_PROMOTE, geduId: traineeId }],
        p_trainees_added: [{ groupId: GROUP_PROMOTE, geduId: traineeId }],
      });
      expect(demoted.error).toBeNull();
      expect(await seats()).toEqual({
        trainees: [{ group_id: GROUP_PROMOTE }],
        assignments: [],
      });
    });
  });
});
