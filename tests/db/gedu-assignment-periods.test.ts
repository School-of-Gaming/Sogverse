import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { substitutionRequestDocument } from "@/services/session-substitution/session-substitution.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import { createScheduleSlot, createTestProduct, deleteTestProducts } from "./product-helpers";
import { seedAssignment } from "./assignment-helpers";
import { getStringRecord } from "../helpers/json";

/**
 * An assignment is a period: [started_at, ended_at), and a session belongs to
 * the period holding its start instant. These cases pin the table's own rules,
 * what the writer does with periods, and the boundary instant, for a planned
 * session and a stored one alike.
 *
 * PRODUCT is a UTC club with a 10:00–11:00 slot on every weekday across a term
 * reaching sixty days either side of today, so every date used here is planned.
 * The seeded GEDU and the ADMIN account (gedu-shaped for the table's purposes)
 * are the two people; nothing here needs either to be certified.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000ae0";
const GROUP_1 = "00000000-0000-0000-0000-000000000ae1";
const GROUP_2 = "00000000-0000-0000-0000-000000000ae2";
const GROUPS = [GROUP_1, GROUP_2];

const GEDU = TEST_IDS.GEDU;
const OTHER = TEST_IDS.ADMIN;

const FORBIDDEN = "42501";

/** A UTC calendar date `offset` days from today, UTC-pinned end to end. */
function utcDate(offset: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  )
    .toISOString()
    .slice(0, 10);
}

/** The planned start of a date: the slot's 10:00 UTC. */
function plannedStart(date: string): string {
  return `${date}T10:00:00.000Z`;
}

const periodRows = z.array(
  z.object({
    group_id: z.string(),
    role: z.enum(["primary", "assistant"]),
    started_at: z.string(),
    ended_at: z.string().nullable(),
  }),
);

describe("gedu assignment periods", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

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

    await deleteTestProducts(admin, [PRODUCT]);
    await createTestProduct(admin, {
      id: PRODUCT,
      billingMode: "free",
      seatCount: null,
      startDate: utcDate(-60),
      endDate: utcDate(60),
    });
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      await createScheduleSlot(admin, PRODUCT, { weekday, startTime: "10:00" });
    }
    const groups = await admin.from("product_groups").insert([
      { id: GROUP_1, product_id: PRODUCT, name: "Periods One" },
      { id: GROUP_2, product_id: PRODUCT, name: "Periods Two" },
    ]);
    expect(groups.error).toBeNull();
  });

  afterAll(async () => {
    // Assignments, requests and stored sessions all go with the product.
    await deleteTestProducts(admin, [PRODUCT]);
  });

  /** Every case starts from an unstaffed product with nothing recorded. */
  beforeEach(async () => {
    for (const table of [
      "gedu_group_assignments",
      "session_substitution_requests",
      "group_sessions",
    ] as const) {
      const { error } = await admin.from(table).delete().in("group_id", GROUPS);
      expect(error).toBeNull();
    }
    // Groups an apply_group_changes case created inside the product.
    await admin
      .from("product_groups")
      .delete()
      .eq("product_id", PRODUCT)
      .not("id", "in", `(${GROUPS.join(",")})`);
  });

  /** One gedu's periods on the product, oldest first. */
  async function periodsOf(gedu: string) {
    const { data, error } = await admin
      .from("gedu_group_assignments")
      .select("group_id, role, started_at, ended_at")
      .eq("product_id", PRODUCT)
      .eq("gedu_id", gedu)
      .order("started_at");
    expect(error).toBeNull();
    return periodRows.parse(data);
  }

  async function seated(gedu: string, group: string, date: string) {
    const { data, error } = await admin.rpc("gedu_holds_seat_at_session", {
      p_gedu_id: gedu,
      p_group_id: group,
      p_session_date: date,
    });
    expect(error).toBeNull();
    return data;
  }

  /** The role each gedu held the group in at that date's session. */
  async function rolesAt(group: string, date: string) {
    const start = await admin.rpc("group_session_starts_at", {
      p_group_id: group,
      p_session_date: date,
    });
    expect(start.error).toBeNull();
    const { data, error } = await admin.rpc("group_assignments_at", {
      p_group_id: group,
      p_at: z.string().parse(start.data),
    });
    expect(error).toBeNull();
    return Object.fromEntries((data ?? []).map((row) => [row.gedu_id, row.role]));
  }

  /** A request written straight to the table. */
  async function seedRequest(input: {
    date: string;
    group?: string;
    substituteId?: string;
  }): Promise<string> {
    const substitute = input.substituteId ?? null;
    const { data, error } = await admin
      .from("session_substitution_requests")
      .insert({
        group_id: input.group ?? GROUP_1,
        session_date: input.date,
        requested_by: GEDU,
        role: "primary",
        reason: "other",
        status: substitute ? "substituted" : "open",
        substitute_id: substitute,
        approved_by: substitute ? TEST_IDS.ADMIN : null,
        approved_at: substitute ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id ?? "";
  }

  async function requestState(id: string) {
    const { data, error } = await admin
      .from("session_substitution_requests")
      .select("status, substitute_id")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    return data;
  }

  // -------------------------------------------------------------------------
  // The table's own rules
  // -------------------------------------------------------------------------

  describe("the table", () => {
    it("refuses an end at or before the start", async () => {
      await expect(
        seedAssignment(admin, {
          groupId: GROUP_1,
          geduId: GEDU,
          productId: PRODUCT,
          startedAt: "2001-01-01T00:00:00Z",
          endedAt: "2001-01-01T00:00:00Z",
        }),
      ).rejects.toThrow(/chk_gedu_group_assignments_ends_after_start/);
    });

    it("holds one live period per gedu per product, and any number of ended ones", async () => {
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        startedAt: "2003-01-01T00:00:00Z",
      });
      await expect(
        seedAssignment(admin, {
          groupId: GROUP_2,
          geduId: GEDU,
          productId: PRODUCT,
          startedAt: "2004-01-01T00:00:00Z",
        }),
      ).rejects.toThrow(/uq_gedu_group_assignments_live_per_product/);

      // An ended one before it, on another group, sits beside it.
      await seedAssignment(admin, {
        groupId: GROUP_2,
        geduId: GEDU,
        productId: PRODUCT,
        startedAt: "2001-01-01T00:00:00Z",
        endedAt: "2002-01-01T00:00:00Z",
      });
      // A group holds any number of gedus.
      await seedAssignment(admin, { groupId: GROUP_1, geduId: OTHER, productId: PRODUCT });
      expect(await periodsOf(GEDU)).toHaveLength(2);
    });

    it("refuses overlapping periods, closed ones included, and admits adjacent ones", async () => {
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        startedAt: "2001-01-01T00:00:00Z",
        endedAt: "2003-01-01T00:00:00Z",
      });

      await expect(
        seedAssignment(admin, {
          groupId: GROUP_2,
          geduId: GEDU,
          productId: PRODUCT,
          startedAt: "2002-01-01T00:00:00Z",
          endedAt: "2004-01-01T00:00:00Z",
        }),
      ).rejects.toThrow(/overlapping/);
      await expect(
        seedAssignment(admin, {
          groupId: GROUP_1,
          geduId: GEDU,
          productId: PRODUCT,
          startedAt: "2002-06-01T00:00:00Z",
        }),
      ).rejects.toThrow(/overlapping/);

      // [2001, 2003) then [2003, …): the end is exclusive.
      await seedAssignment(admin, {
        groupId: GROUP_2,
        geduId: GEDU,
        productId: PRODUCT,
        startedAt: "2003-01-01T00:00:00Z",
      });
      expect(await periodsOf(GEDU)).toHaveLength(2);
    });

    it("never moves a start, and ends a period once", async () => {
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        startedAt: "2001-01-01T00:00:00Z",
      });

      const moved = await admin
        .from("gedu_group_assignments")
        .update({ started_at: "2000-06-01T00:00:00Z" })
        .eq("group_id", GROUP_1)
        .eq("gedu_id", GEDU);
      expect(moved.error?.message).toMatch(/start does not move/);

      const ended = await admin
        .from("gedu_group_assignments")
        .update({ ended_at: "2002-01-01T00:00:00Z" })
        .eq("group_id", GROUP_1)
        .eq("gedu_id", GEDU);
      expect(ended.error).toBeNull();

      const reEnded = await admin
        .from("gedu_group_assignments")
        .update({ ended_at: "2003-01-01T00:00:00Z" })
        .eq("group_id", GROUP_1)
        .eq("gedu_id", GEDU);
      expect(reEnded.error?.message).toMatch(/ends once/);
    });
  });

  // -------------------------------------------------------------------------
  // The writer
  // -------------------------------------------------------------------------

  describe("apply_group_changes", () => {
    async function apply(
      changes: Omit<
        Database["public"]["Functions"]["apply_group_changes"]["Args"],
        "p_product_id"
      >,
    ) {
      const { data, error } = await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT,
        ...changes,
      });
      expect(error).toBeNull();
      return data;
    }

    it("a removal ends the period and keeps the row, and the past stays the gedu's", async () => {
      await seedAssignment(admin, { groupId: GROUP_1, geduId: GEDU, productId: PRODUCT });

      await apply({ p_gedu_assignments_removed: [{ groupId: GROUP_1, geduId: GEDU }] });

      const periods = await periodsOf(GEDU);
      expect(periods).toHaveLength(1);
      expect(periods[0].ended_at).not.toBeNull();
      expect(await seated(GEDU, GROUP_1, utcDate(-5))).toBe(true);
      expect(await seated(GEDU, GROUP_1, utcDate(5))).toBe(false);
    });

    it("adding a removed gedu again starts a new row, and the gap is nobody's", async () => {
      await seedAssignment(admin, { groupId: GROUP_1, geduId: GEDU, productId: PRODUCT });

      await apply({ p_gedu_assignments_removed: [{ groupId: GROUP_1, geduId: GEDU }] });
      await apply({
        p_gedu_assignments_added: [{ groupId: GROUP_1, geduId: GEDU, role: "primary" }],
      });

      const [first, second] = await periodsOf(GEDU);
      expect(second.ended_at).toBeNull();
      expect(Date.parse(second.started_at)).toBeGreaterThan(
        Date.parse(first.ended_at ?? ""),
      );
    });

    it("a role change makes two periods, and a past session keeps the old role", async () => {
      await seedAssignment(admin, { groupId: GROUP_1, geduId: GEDU, productId: PRODUCT });

      await apply({
        p_gedu_assignments_added: [{ groupId: GROUP_1, geduId: GEDU, role: "assistant" }],
      });

      const periods = await periodsOf(GEDU);
      expect(periods.map((period) => period.role)).toEqual(["primary", "assistant"]);
      expect(Date.parse(periods[0].ended_at ?? "")).toBe(Date.parse(periods[1].started_at));

      expect((await rolesAt(GROUP_1, utcDate(-5)))[GEDU]).toBe("primary");
      expect((await rolesAt(GROUP_1, utcDate(5)))[GEDU]).toBe("assistant");

      // A request filed for a future session snapshots the role of the period
      // holding it.
      const { data, error } = await geduAuth.rpc("request_session_substitution", {
        p_group_id: GROUP_1,
        p_session_date: utcDate(5),
        p_reason: "other",
      });
      expect(error).toBeNull();
      expect(substitutionRequestDocument.parse(data).role).toBe("assistant");
    });

    it("a move between groups ends one period where the next begins", async () => {
      await seedAssignment(admin, { groupId: GROUP_1, geduId: GEDU, productId: PRODUCT });

      await apply({
        p_gedu_assignments_removed: [{ groupId: GROUP_1, geduId: GEDU }],
        p_gedu_assignments_added: [{ groupId: GROUP_2, geduId: GEDU, role: "primary" }],
      });

      const [onOne, onTwo] = await periodsOf(GEDU);
      expect([onOne.group_id, onTwo.group_id]).toEqual([GROUP_1, GROUP_2]);
      expect(Date.parse(onOne.ended_at ?? "")).toBe(Date.parse(onTwo.started_at));

      expect(await seated(GEDU, GROUP_1, utcDate(-5))).toBe(true);
      expect(await seated(GEDU, GROUP_1, utcDate(5))).toBe(false);
      expect(await seated(GEDU, GROUP_2, utcDate(-5))).toBe(false);
      expect(await seated(GEDU, GROUP_2, utcDate(5))).toBe(true);
    });

    it("a removal and re-add in one batch leaves the future requests alive", async () => {
      await seedAssignment(admin, { groupId: GROUP_1, geduId: GEDU, productId: PRODUCT });
      const future = await seedRequest({ date: utcDate(5) });

      await apply({
        p_gedu_assignments_removed: [{ groupId: GROUP_1, geduId: GEDU }],
        p_gedu_assignments_added: [{ groupId: GROUP_1, geduId: GEDU, role: "primary" }],
      });

      expect(await periodsOf(GEDU)).toHaveLength(2);
      expect((await requestState(future))?.status).toBe("open");
    });

    it("an inline add then a role change in one batch leaves one period, in the later role", async () => {
      const data = await apply({
        p_added_groups: [
          {
            tempId: "tNew",
            name: "Periods New",
            gedus: [{ geduId: GEDU, role: "primary" }],
          },
        ],
        p_gedu_assignments_added: [{ groupId: "tNew", geduId: GEDU, role: "assistant" }],
      });
      const newGroup = getStringRecord(data, "tempMap").tNew;

      const periods = await periodsOf(GEDU);
      expect(periods).toEqual([
        expect.objectContaining({ group_id: newGroup, role: "assistant", ended_at: null }),
      ]);
    });

    it("the sweep withdraws a future request and keeps a past one with its substitute", async () => {
      await seedAssignment(admin, { groupId: GROUP_1, geduId: GEDU, productId: PRODUCT });
      const future = await seedRequest({ date: utcDate(5) });
      const past = await seedRequest({ date: utcDate(-5), substituteId: OTHER });

      await apply({ p_gedu_assignments_removed: [{ groupId: GROUP_1, geduId: GEDU }] });

      expect(await requestState(future)).toEqual({ status: "withdrawn", substitute_id: null });
      expect(await requestState(past)).toEqual({ status: "substituted", substitute_id: OTHER });
    });
  });

  // -------------------------------------------------------------------------
  // The boundary instant
  // -------------------------------------------------------------------------

  describe("a session belongs to the period holding its start", () => {
    it("at a planned start, the replacement added then takes the session", async () => {
      const date = utcDate(-10);
      const handover = plannedStart(date);
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        endedAt: handover,
      });
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: OTHER,
        productId: PRODUCT,
        startedAt: handover,
      });

      expect(await seated(GEDU, GROUP_1, date)).toBe(false);
      expect(await seated(OTHER, GROUP_1, date)).toBe(true);
      expect(await seated(GEDU, GROUP_1, utcDate(-11))).toBe(true);
      expect(await seated(OTHER, GROUP_1, utcDate(-11))).toBe(false);
    });

    it("a gedu removed just after a planned start keeps that session", async () => {
      const date = utcDate(-10);
      const handover = "T10:00:00.001Z";
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        endedAt: `${date}${handover}`,
      });
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: OTHER,
        productId: PRODUCT,
        startedAt: `${date}${handover}`,
      });

      expect(await seated(GEDU, GROUP_1, date)).toBe(true);
      expect(await seated(OTHER, GROUP_1, date)).toBe(false);
      expect(await seated(OTHER, GROUP_1, utcDate(-9))).toBe(true);
    });

    it("a stored session is judged at its stored start, not the plan's", async () => {
      // Stored at 15:30 while the plan says 10:00, and the handover falls
      // between the two: by the plan the session would be the leaver's.
      const date = utcDate(-12);
      const stored = await admin.from("group_sessions").insert({
        group_id: GROUP_1,
        session_date: date,
        starts_at: `${date}T15:30:00.000Z`,
        ends_at: `${date}T16:30:00.000Z`,
      });
      expect(stored.error).toBeNull();

      const handover = `${date}T12:00:00.000Z`;
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        endedAt: handover,
      });
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: OTHER,
        productId: PRODUCT,
        startedAt: handover,
      });

      expect(await seated(GEDU, GROUP_1, date)).toBe(false);
      expect(await seated(OTHER, GROUP_1, date)).toBe(true);

      // The start the rule judged by is the stored one.
      const start = await admin.rpc("group_session_starts_at", {
        p_group_id: GROUP_1,
        p_session_date: date,
      });
      expect(Date.parse(start.data ?? "")).toBe(Date.parse(`${date}T15:30:00.000Z`));
    });
  });

  // -------------------------------------------------------------------------
  // Filing follows the period
  // -------------------------------------------------------------------------

  describe("filing an absence", () => {
    it("is refused for a session after the gedu's period ends", async () => {
      await seedAssignment(admin, {
        groupId: GROUP_1,
        geduId: GEDU,
        productId: PRODUCT,
        endedAt: `${utcDate(7)}T00:00:00.000Z`,
      });

      const inside = await geduAuth.rpc("request_session_substitution", {
        p_group_id: GROUP_1,
        p_session_date: utcDate(5),
        p_reason: "sick",
      });
      expect(inside.error).toBeNull();

      const after = await geduAuth.rpc("request_session_substitution", {
        p_group_id: GROUP_1,
        p_session_date: utcDate(8),
        p_reason: "sick",
      });
      expect(after.error?.code).toBe(FORBIDDEN);
    });
  });
});
