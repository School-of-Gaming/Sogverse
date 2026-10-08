import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { geduAssignmentSummaries } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { myAssignedProductRows } from "@/services/assignments/assignments.contracts";
import { chatChannelRoster } from "@/services/chat/chat.contracts";
import { productGroupsSnapshot } from "@/services/groups/groups.contracts";
import { traineeGroupOverlay } from "@/services/member-flair/member-flair.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { SEED, TEST_CREDENTIALS, TEST_IDS } from "./constants";
import { ageOnDate } from "@/lib/gamer-age-eligibility";
import type { GamerBirthMonthYear } from "@/lib/gamer-birth";
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
 *   3. **Families are never told**, and cannot read the table. Staff and the
 *      group's own trainees are.
 *   4. **One seat per gedu per product**, refused from both tables, and
 *      judged on a batch's end state because the batch removes before it adds.
 *
 * Layout. PRODUCT_MAIN has two groups: GROUP_MINE, where the seeded GEDU is
 * assigned, GAMER sits and the minted trainee shadows; and GROUP_SIBLING,
 * where GAMER_2 sits. PRODUCT_BATCH carries one group for the batch-order
 * cases, so moving the trainee's seat there never disturbs the rest.
 */

const PRODUCT_MAIN = "00000000-0000-0000-0000-000000000e51";
const PRODUCT_BATCH = "00000000-0000-0000-0000-000000000e52";
const GROUP_MINE = "00000000-0000-0000-0000-000000000e53";
const GROUP_SIBLING = "00000000-0000-0000-0000-000000000e54";
const GROUP_BATCH = "00000000-0000-0000-0000-000000000e55";
/** A group id that exists nowhere, by shape: no fixture uses the f-range. */
const GROUP_NOWHERE = "00000000-0000-0000-0000-00000000fe5f";

const ALL_PRODUCTS = [PRODUCT_MAIN, PRODUCT_BATCH];
const ALL_GROUPS = [GROUP_MINE, GROUP_SIBLING, GROUP_BATCH];

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

/**
 * A birth month's age today in UTC, by the application's own rule — which the
 * RPC has to agree with.
 */
function ageInUtc(birth: GamerBirthMonthYear): number {
  return ageOnDate(birth, dayOffset(0));
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
  groups: z.array(record.and(z.object({ id: z.string() }))),
});

/** The redacted roster row, the same on both of the trainee's documents. */
const TRAINEE_ROSTER_KEYS = [
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
].sort();

/** The sentinels a trainee must never receive, anywhere in either document. */
const TRAINEE_SECRETS = [
  GROUP_STAFF_NOTE,
  MEMBER_NOTE,
  SESSION_STAFF_NOTE,
  TEST_CREDENTIALS.CUSTOMER.email,
  "2015-06-15",
];
const withTrainees = z.object({ trainees: z.array(record) });

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
      { id: GROUP_BATCH, product_id: PRODUCT_BATCH, name: "Cohort Batch" },
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

      for (const secret of TRAINEE_SECRETS) {
        expect(wire).not.toContain(secret);
      }

      expect(doc.product.material_url).toBe(MATERIAL_URL);
      expect(Object.keys(doc.group).sort()).toEqual(["id", "name", "public_note"]);

      const roster = doc.roster;
      expect(roster).toHaveLength(1);
      expect(Object.keys(roster[0]).sort()).toEqual(TRAINEE_ROSTER_KEYS);
      expect(roster[0].participant_id).toBe(TEST_IDS.GAMER);
      expect(roster[0].age).toBe(ageInUtc({
        year: SEED.GAMER_BIRTH.birth_year,
        month: SEED.GAMER_BIRTH.birth_month,
      }));
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

  describe("get_trainee_group_overlay", () => {
    it("serves the trainee their group's room flair: stamps and whether a note exists, never its text", async () => {
      const { data, error } = await traineeAuth.rpc("get_trainee_group_overlay", {
        p_group_id: GROUP_MINE,
      });
      expect(error).toBeNull();
      const wire = JSON.stringify(data);
      for (const secret of TRAINEE_SECRETS) {
        expect(wire).not.toContain(secret);
      }

      const doc = traineeGroupOverlay.parse(data);
      expect(Object.keys(doc.members)).toEqual([TEST_IDS.GAMER]);
      // The keys on the wire, not the parsed shape: nothing more may arrive.
      const raw = z.object({ members: z.record(z.string(), record) }).parse(data);
      expect(Object.keys(raw.members[TEST_IDS.GAMER]).sort()).toEqual([
        "creations",
        "group_joined_at",
        "has_note",
      ]);
      expect(doc.members[TEST_IDS.GAMER]).toEqual({
        group_joined_at: expect.any(String),
        has_note: true,
        creations: [],
      });
    });

    it("lets an admin preview it, and refuses an assigned gedu, a parent and a gamer", async () => {
      const preview = await adminAuth.rpc("get_trainee_group_overlay", {
        p_group_id: GROUP_MINE,
      });
      expect(preview.error).toBeNull();

      for (const client of [geduAuth, customerAuth, gamerAuth]) {
        const { error } = await client.rpc("get_trainee_group_overlay", {
          p_group_id: GROUP_MINE,
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("refuses the trainee a sibling group of the same product, and the staff overlay", async () => {
      const sibling = await traineeAuth.rpc("get_trainee_group_overlay", {
        p_group_id: GROUP_SIBLING,
      });
      expect(sibling.error?.code).toBe("42501");

      const staff = await traineeAuth.rpc("get_group_staff_overlay", {
        p_group_id: GROUP_MINE,
      });
      expect(staff.error?.code).toBe("42501");
    });
  });

  describe("get_trainee_assigned_product", () => {
    it("serves the trainee their own group with the redacted roster, and its siblings by name alone", async () => {
      const { data, error } = await traineeAuth.rpc("get_trainee_assigned_product", {
        p_product_id: PRODUCT_MAIN,
      });
      expect(error).toBeNull();
      const wire = JSON.stringify(data);
      for (const secret of TRAINEE_SECRETS) {
        expect(wire).not.toContain(secret);
      }
      // A sibling carries none of its members, so GAMER_2, who sits there,
      // never travels.
      expect(wire).not.toContain(TEST_IDS.GAMER_2);

      const doc = traineeProduct.parse(data);
      expect(doc.my_group_id).toBe(GROUP_MINE);
      // Both groups were inserted in one statement, so they tie on created_at
      // and the id breaks the tie.
      expect(doc.groups.map((g) => g.id)).toEqual([GROUP_MINE, GROUP_SIBLING]);

      const own = doc.groups.find((g) => g.id === GROUP_MINE);
      expect(Object.keys(own ?? {}).sort()).toEqual(
        ["created_at", "gedus", "id", "is_my_group", "name", "participant_count", "roster"].sort(),
      );
      expect(own?.is_my_group).toBe(true);
      expect(own?.participant_count).toBe(1);
      const roster = z.array(record).parse(own?.roster);
      expect(roster).toHaveLength(1);
      expect(Object.keys(roster[0]).sort()).toEqual(TRAINEE_ROSTER_KEYS);

      const sibling = doc.groups.find((g) => g.id === GROUP_SIBLING);
      expect(Object.keys(sibling ?? {}).sort()).toEqual(
        ["created_at", "id", "is_my_group", "name"].sort(),
      );
      expect(sibling).toMatchObject({ name: "Cohort Sibling", is_my_group: false });
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
        .filter((r) => r.product.id === PRODUCT_MAIN);
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
      // Parsed through the panel's own contract, so a trainee entry that stops
      // carrying what the pill draws fails here rather than in the browser.
      const { groups } = productGroupsSnapshot.parse(panel.data);
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

    it("puts the trainee on the call chat's roster, tagged for staff and the group's trainees alone", async () => {
      // A second trainee on the same group, so a trainee's view of a fellow
      // trainee is pinned as well as their view of themselves.
      const secondEmail = `trainee-2-${Date.now()}@test.local`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: secondEmail,
        password: "testpassword123",
        email_confirm: true,
        user_metadata: { first_name: "Aarne", last_name: "Trainee" },
      });
      expect(createError).toBeNull();
      const secondId = created.user?.id ?? "";
      expect(secondId).toBeTruthy();
      try {
        await admin.from("profiles").update({ role: "gedu" }).eq("id", secondId);
        await admin.from("customer_profiles").delete().eq("user_id", secondId);
        await admin.from("gedu_profiles").insert({ user_id: secondId, certified: false });
        const placed = await applyChanges(adminAuth, PRODUCT_MAIN, {
          p_trainees_added: [{ groupId: GROUP_MINE, geduId: secondId }],
        });
        expect(placed.error).toBeNull();

        // Both feeds list trainees in the order the seats were made, whatever
        // their names sort to: Aarne sorts first but was placed second.
        const feed = await geduAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP_MINE });
        expect(feed.error).toBeNull();
        expect(withTrainees.parse(feed.data).trainees.map((t) => t.id)).toEqual([
          traineeId,
          secondId,
        ]);
        const ownFeed = await traineeAuth.rpc("get_trainee_group_feed", {
          p_group_id: GROUP_MINE,
        });
        expect(ownFeed.error).toBeNull();
        expect(withTrainees.parse(ownFeed.data).trainees.map((t) => t.id)).toEqual([
          traineeId,
          secondId,
        ]);

        const tagsFor = async (client: Admin) => {
          const { data, error } = await client.rpc("get_chat_channel_roster", {
            p_channel_id: channelId,
          });
          expect(error).toBeNull();
          const roster = chatChannelRoster.parse(data);
          const tagOf = (id: string) => roster.find((row) => row.id === id)?.is_trainee;
          return {
            first: tagOf(traineeId),
            second: tagOf(secondId),
            gedu: tagOf(TEST_IDS.GEDU),
            anyoneElse: roster
              .filter((row) => row.id !== traineeId && row.id !== secondId)
              .some((row) => row.is_trainee),
          };
        };
        const tagged = { first: true, second: true, gedu: false, anyoneElse: false };

        // Staff are told, and so is each trainee, of themselves and each other.
        expect(await tagsFor(adminAuth)).toEqual(tagged);
        expect(await tagsFor(geduAuth)).toEqual(tagged);
        expect(await tagsFor(traineeAuth)).toEqual(tagged);
        const secondAuth = await createAuthenticatedClient(secondEmail, "testpassword123");
        expect(await tagsFor(secondAuth)).toEqual(tagged);

        // A gamer reads the trainees as the gedus their role says they are.
        const { data: gamerRoster, error: gamerError } = await gamerAuth.rpc(
          "get_chat_channel_roster",
          { p_channel_id: channelId },
        );
        expect(gamerError).toBeNull();
        const rows = chatChannelRoster.parse(gamerRoster);
        expect(rows.find((row) => row.id === traineeId)).toMatchObject({ role: "gedu" });
        expect(rows.find((row) => row.id === secondId)).toMatchObject({ role: "gedu" });
        expect(rows.every((row) => !row.is_trainee)).toBe(true);

        // A parent is not in the room, so is not handed the roster at all.
        const parent = await customerAuth.rpc("get_chat_channel_roster", {
          p_channel_id: channelId,
        });
        expect(parent.error?.code).toBe("42501");
      } finally {
        await admin.from("gedu_group_trainees").delete().eq("gedu_id", secondId);
        await admin.auth.admin.deleteUser(secondId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. One seat per gedu per product, judged on the batch's end state
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
        const { error } = await applyChanges(client, PRODUCT_BATCH, {
          p_trainees_added: [{ groupId: GROUP_BATCH, geduId: traineeId }],
        });
        expect(error?.code).toBe("42501");
      }
    });

    it("runs a batch's removes before its adds, and a failed batch leaves the trainee seat standing", async () => {
      const placed = await applyChanges(adminAuth, PRODUCT_BATCH, {
        p_trainees_added: [{ groupId: GROUP_BATCH, geduId: traineeId }],
      });
      expect(placed.error).toBeNull();

      const seats = async () => {
        const [trainees, assignments] = await Promise.all([
          admin.from("gedu_group_trainees").select("group_id").eq("product_id", PRODUCT_BATCH),
          admin
            .from("gedu_group_assignments")
            .select("group_id, role")
            .eq("product_id", PRODUCT_BATCH),
        ]);
        return { trainees: trainees.data, assignments: assignments.data };
      };

      // The removal succeeds and the add fails on a group that does not exist,
      // so the whole batch rolls back.
      const failed = await applyChanges(adminAuth, PRODUCT_BATCH, {
        p_trainees_removed: [{ groupId: GROUP_BATCH, geduId: traineeId }],
        p_gedu_assignments_added: [
          { groupId: GROUP_NOWHERE, geduId: traineeId, role: "primary" },
        ],
      });
      expect(failed.error).not.toBeNull();
      expect(await seats()).toEqual({
        trainees: [{ group_id: GROUP_BATCH }],
        assignments: [],
      });

      // The trainee seat removed and an assignment added for the same gedu on
      // the product: the trigger sees the add only after the remove.
      const swapped = await applyChanges(adminAuth, PRODUCT_BATCH, {
        p_trainees_removed: [{ groupId: GROUP_BATCH, geduId: traineeId }],
        p_gedu_assignments_added: [
          { groupId: GROUP_BATCH, geduId: traineeId, role: "assistant" },
        ],
      });
      expect(swapped.error).toBeNull();
      expect(await seats()).toEqual({
        trainees: [],
        assignments: [{ group_id: GROUP_BATCH, role: "assistant" }],
      });

      // The seat's kind decides the document: assigned, the gedu reads the
      // full workspace and not the trainee's.
      const full = await traineeAuth.rpc("get_gedu_group_feed", { p_group_id: GROUP_BATCH });
      expect(full.error).toBeNull();
      const redacted = await traineeAuth.rpc("get_trainee_group_feed", {
        p_group_id: GROUP_BATCH,
      });
      expect(redacted.error?.code).toBe("42501");

      // The other way round too: an assignment removed and a trainee seat
      // added in one batch, since trainee seats are added after every remove.
      const reversed = await applyChanges(adminAuth, PRODUCT_BATCH, {
        p_gedu_assignments_removed: [{ groupId: GROUP_BATCH, geduId: traineeId }],
        p_trainees_added: [{ groupId: GROUP_BATCH, geduId: traineeId }],
      });
      expect(reversed.error).toBeNull();
      expect(await seats()).toEqual({
        trainees: [{ group_id: GROUP_BATCH }],
        assignments: [],
      });
    });
  });
});
