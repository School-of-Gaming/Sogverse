import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SESSION_RECORDING_EPOCH } from "@/lib/constants";
import { discordLinkedGedu } from "@/lib/discord-substitution.contracts";
import { myAssignedProductRows } from "@/services/assignments/assignments.contracts";
import { geduAssignmentSummaries } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { substitutionRequestDocument } from "@/services/session-substitution/session-substitution.contracts";
import {
  createAdminTestClient,
  createAnonTestClient,
  createAuthenticatedClient,
} from "./helpers";
import { TEST_IDS } from "./constants";
import { deleteTestProducts } from "./product-helpers";

/**
 * The Discord bot's way into substitutions: a Discord user id resolved to the
 * gedu account linked to it, that gedu's two seat reads, and the filing write.
 *
 * Every account here is minted, never the seeded gedu or admin:
 * discord-links.test.ts wipes the seeded accounts' links before each of its
 * cases, and a link of ours on one of them would vanish under us.
 *
 * What is NOT re-tested here is the filing's own rule set — the derivation, the
 * writable date, the role snapshot — which session-substitution.test.ts covers
 * through `request_session_substitution`. Both reach one body, so the cases
 * below prove the Discord path reaches it too and surfaces its refusals
 * unchanged, not that the body is right.
 *
 * Layout: PRODUCT (remote club, UTC, a slot on every weekday so any date in the
 * term is writable) with GROUP, taught by GEDU, and its sister group
 * OTHER_GROUP that nobody teaches.
 */

const PRODUCT = "00000000-0000-0000-0000-000000000830";
const GROUP = "00000000-0000-0000-0000-000000000831";
const OTHER_GROUP = "00000000-0000-0000-0000-000000000832";

const FORBIDDEN = "42501";
const CHECK_VIOLATION = "23514";
const CANCELLED = "P0026";
const NOT_LINKED = "P0031";

/** Discord ids no other suite uses (discord-links.test.ts holds 9000…). */
const DISCORD_GEDU = "910000000000000001";
const DISCORD_SHARED = "910000000000000002";
const DISCORD_ADMIN_ONLY = "910000000000000003";
const DISCORD_NOBODY = "910000000000000004";

/** A UTC calendar date `offset` days from now; the product's zone is UTC. */
function utcDate(offset: number): string {
  const now = new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
  return day.toISOString().slice(0, 10);
}

describe("substitutions from Discord", () => {
  let admin: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;

  let geduId = "";
  let secondGeduId = "";
  let adminId = "";

  async function mint(
    label: string,
    role: "gedu" | "admin",
  ): Promise<{ id: string; email: string }> {
    const email = `discord-sub-${label}-${Date.now()}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: "testpassword123",
      email_confirm: true,
      user_metadata: { first_name: "Disco", last_name: label },
    });
    expect(error).toBeNull();
    const id = data.user?.id ?? "";
    expect(id).toBeTruthy();
    // handle_new_user lands every signup as a customer; the role is an admin's
    // doing, exactly as in the real flow.
    await admin.from("profiles").update({ role }).eq("id", id);
    await admin.from("customer_profiles").delete().eq("user_id", id);
    if (role === "gedu") {
      await admin.from("gedu_profiles").insert({ user_id: id, certified: true });
    }
    return { id, email };
  }

  async function link(profileId: string, discordUserId: string, linkedAt: Date) {
    const { error } = await admin.from("discord_links").upsert({
      profile_id: profileId,
      discord_user_id: discordUserId,
      discord_username: "disco",
      linked_at: linkedAt.toISOString(),
    });
    expect(error).toBeNull();
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    anon = createAnonTestClient();

    const gedu = await mint("gedu", "gedu");
    geduId = gedu.id;
    secondGeduId = (await mint("second", "gedu")).id;
    adminId = (await mint("admin", "admin")).id;
    await admin.from("profiles").update({ locale: "fi" }).eq("id", geduId);
    geduAuth = await createAuthenticatedClient(gedu.email, "testpassword123");

    await deleteTestProducts(admin, [PRODUCT]);
    const { error: productError } = await admin.from("products").insert({
      id: PRODUCT,
      product_type: "consumer_club",
      billing_mode: "free",
      topic: "minecraft_java",
      spoken_language_code: "en",
      is_remote: true,
      location_id: null,
      timezone: "UTC",
      registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
      is_visible: true,
      created_by: TEST_IDS.ADMIN,
      start_date: utcDate(-30),
      end_date: utcDate(60),
      min_age: 8,
      max_age: 18,
      seat_count: null,
    });
    expect(productError).toBeNull();
    await admin.from("product_translations").insert({
      product_id: PRODUCT,
      locale: "en",
      name: "Discord Club",
      short_description: "x",
    });
    await admin.from("schedule_slots").insert(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        product_id: PRODUCT,
        weekday,
        start_time: "10:00",
        duration_minutes: 60,
      })),
    );
    await admin.from("product_groups").insert([
      { id: GROUP, product_id: PRODUCT, name: "Discord Cohort" },
      { id: OTHER_GROUP, product_id: PRODUCT, name: "Elsewhere Cohort" },
    ]);
    const { error: assignmentError } = await admin
      .from("gedu_group_assignments")
      .insert({ group_id: GROUP, gedu_id: geduId, product_id: PRODUCT, role: "primary" });
    expect(assignmentError).toBeNull();
  });

  beforeEach(async () => {
    await admin
      .from("discord_links")
      .delete()
      .in("profile_id", [geduId, secondGeduId, adminId]);
    await admin.from("session_substitution_requests").delete().in("group_id", [GROUP, OTHER_GROUP]);
    await admin.from("session_cancellations").delete().in("group_id", [GROUP, OTHER_GROUP]);
  });

  afterAll(async () => {
    await admin.from("gedu_group_assignments").delete().eq("gedu_id", geduId);
    await deleteTestProducts(admin, [PRODUCT]);
    for (const id of [geduId, secondGeduId, adminId]) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  describe("resolving the Discord user", () => {
    it("answers the linked gedu and their stored locale", async () => {
      await link(geduId, DISCORD_GEDU, new Date());
      const { data, error } = await admin.rpc("get_gedu_for_discord_user", {
        p_discord_user_id: DISCORD_GEDU,
      });
      expect(error).toBeNull();
      expect(discordLinkedGedu.parse(data)).toEqual({ profile_id: geduId, locale: "fi" });
    });

    it("refuses a Discord user nobody has linked", async () => {
      const { error } = await admin.rpc("get_gedu_for_discord_user", {
        p_discord_user_id: DISCORD_NOBODY,
      });
      expect(error?.code).toBe(NOT_LINKED);
      expect(error?.message).toBe("DISCORD_GEDU_NOT_LINKED");
    });

    it("refuses a Discord user linked only to an account that is not a gedu", async () => {
      await link(adminId, DISCORD_ADMIN_ONLY, new Date());
      const { error } = await admin.rpc("get_gedu_for_discord_user", {
        p_discord_user_id: DISCORD_ADMIN_ONLY,
      });
      expect(error?.code).toBe(NOT_LINKED);
    });

    it("answers the gedu account, not a more recently linked admin one", async () => {
      await link(geduId, DISCORD_SHARED, new Date(Date.now() - 60_000));
      await link(adminId, DISCORD_SHARED, new Date());
      const { data, error } = await admin.rpc("get_gedu_for_discord_user", {
        p_discord_user_id: DISCORD_SHARED,
      });
      expect(error).toBeNull();
      expect(discordLinkedGedu.parse(data).profile_id).toBe(geduId);
    });

    it("answers the most recently linked of two gedu accounts", async () => {
      await link(geduId, DISCORD_SHARED, new Date(Date.now() - 60_000));
      await link(secondGeduId, DISCORD_SHARED, new Date());
      const first = await admin.rpc("get_gedu_for_discord_user", {
        p_discord_user_id: DISCORD_SHARED,
      });
      expect(discordLinkedGedu.parse(first.data).profile_id).toBe(secondGeduId);

      await link(geduId, DISCORD_SHARED, new Date(Date.now() + 60_000));
      const second = await admin.rpc("get_gedu_for_discord_user", {
        p_discord_user_id: DISCORD_SHARED,
      });
      expect(discordLinkedGedu.parse(second.data).profile_id).toBe(geduId);
    });
  });

  describe("the seat reads", () => {
    it("are the very rows the gedu reads on the web", async () => {
      await link(geduId, DISCORD_GEDU, new Date());

      const viaDiscord = await admin.rpc("get_assigned_products_for_discord_user", {
        p_discord_user_id: DISCORD_GEDU,
      });
      const onTheWeb = await geduAuth.rpc("get_my_assigned_products");
      expect(viaDiscord.error).toBeNull();
      expect(onTheWeb.error).toBeNull();
      const rows = myAssignedProductRows.parse(viaDiscord.data);
      expect(rows).toEqual(myAssignedProductRows.parse(onTheWeb.data));
      expect(rows.map((row) => [row.group_id, row.kind])).toEqual([[GROUP, "assignment"]]);

      const summariesViaDiscord = await admin.rpc(
        "get_gedu_assignment_summaries_for_discord_user",
        { p_discord_user_id: DISCORD_GEDU, p_epoch_date: SESSION_RECORDING_EPOCH },
      );
      const summariesOnTheWeb = await geduAuth.rpc("get_my_gedu_assignment_summaries", {
        p_epoch_date: SESSION_RECORDING_EPOCH,
      });
      expect(summariesViaDiscord.error).toBeNull();
      const summaries = geduAssignmentSummaries.parse(summariesViaDiscord.data);
      expect(summaries).toEqual(geduAssignmentSummaries.parse(summariesOnTheWeb.data));
      expect(summaries.map((s) => s.group_name)).toEqual(["Discord Cohort"]);
    });

    it("refuse an unlinked Discord user", async () => {
      const rows = await admin.rpc("get_assigned_products_for_discord_user", {
        p_discord_user_id: DISCORD_NOBODY,
      });
      expect(rows.error?.code).toBe(NOT_LINKED);
      const summaries = await admin.rpc("get_gedu_assignment_summaries_for_discord_user", {
        p_discord_user_id: DISCORD_NOBODY,
      });
      expect(summaries.error?.code).toBe(NOT_LINKED);
    });
  });

  describe("filing", () => {
    it("files for the linked gedu and returns the request document", async () => {
      await link(geduId, DISCORD_GEDU, new Date());
      const sessionDate = utcDate(5);
      const { data, error } = await admin.rpc("request_session_substitution_for_discord_user", {
        p_discord_user_id: DISCORD_GEDU,
        p_group_id: GROUP,
        p_session_date: sessionDate,
        p_reason: "sick",
        p_reason_note: "  feverish  ",
      });
      expect(error).toBeNull();
      const document = substitutionRequestDocument.parse(data);
      expect(document).toMatchObject({
        group_id: GROUP,
        session_date: sessionDate,
        status: "open",
        role: "primary",
        requested_by: geduId,
        // The filer is reading their own request, exactly as on the web.
        is_requester: true,
        reason: null,
        reason_note: null,
      });

      const { data: stored } = await admin
        .from("session_substitution_requests")
        .select("requested_by, reason, reason_note")
        .eq("id", document.id)
        .single();
      expect(stored).toEqual({ requested_by: geduId, reason: "sick", reason_note: "feverish" });
    });

    it("refuses an unlinked Discord user and writes nothing", async () => {
      await link(adminId, DISCORD_ADMIN_ONLY, new Date());
      for (const discordUserId of [DISCORD_NOBODY, DISCORD_ADMIN_ONLY]) {
        const { error } = await admin.rpc("request_session_substitution_for_discord_user", {
          p_discord_user_id: discordUserId,
          p_group_id: GROUP,
          p_session_date: utcDate(5),
          p_reason: "sick",
        });
        expect(error?.code).toBe(NOT_LINKED);
      }
      const { count } = await admin
        .from("session_substitution_requests")
        .select("id", { count: "exact", head: true })
        .eq("group_id", GROUP);
      expect(count).toBe(0);
    });

    it("surfaces the filing's own refusals with their codes and messages", async () => {
      await link(geduId, DISCORD_GEDU, new Date());
      const file = (args: {
        group?: string;
        date: string;
        reason?: "sick";
      }) =>
        admin.rpc("request_session_substitution_for_discord_user", {
          p_discord_user_id: DISCORD_GEDU,
          p_group_id: args.group ?? GROUP,
          p_session_date: args.date,
          ...(args.reason ? { p_reason: args.reason } : {}),
        });

      const notTaught = await file({ group: OTHER_GROUP, date: utcDate(5), reason: "sick" });
      expect(notTaught.error?.code).toBe(FORBIDDEN);

      const noReason = await file({ date: utcDate(5) });
      expect(noReason.error?.code).toBe(CHECK_VIOLATION);
      expect(noReason.error?.message).toContain("needs a reason category");

      const past = await file({ date: utcDate(-5), reason: "sick" });
      expect(past.error?.code).toBe(CHECK_VIOLATION);
      expect(past.error?.message).toContain("past session");

      const outsideTerm = await file({ date: utcDate(90), reason: "sick" });
      expect(outsideTerm.error?.code).toBe(CHECK_VIOLATION);
      expect(outsideTerm.error?.message).toContain("No scheduled session on");

      await admin.from("session_cancellations").insert({
        group_id: GROUP,
        session_date: utcDate(6),
        cancelled_by: TEST_IDS.ADMIN,
      });
      const cancelled = await file({ date: utcDate(6), reason: "sick" });
      expect(cancelled.error?.code).toBe(CANCELLED);

      const first = await file({ date: utcDate(7), reason: "sick" });
      expect(first.error).toBeNull();
      const again = await file({ date: utcDate(7), reason: "sick" });
      expect(again.error?.code).toBe(FORBIDDEN);
    });

    it("answers a web filing and a Discord filing as one: whichever came first, the other is refused", async () => {
      await link(geduId, DISCORD_GEDU, new Date());
      const web = await geduAuth.rpc("request_session_substitution", {
        p_group_id: GROUP,
        p_session_date: utcDate(8),
        p_reason: "sick",
      });
      expect(web.error).toBeNull();
      const discord = await admin.rpc("request_session_substitution_for_discord_user", {
        p_discord_user_id: DISCORD_GEDU,
        p_group_id: GROUP,
        p_session_date: utcDate(8),
        p_reason: "sick",
      });
      expect(discord.error?.code).toBe(FORBIDDEN);
    });
  });

  describe("who may call what", () => {
    const discordWrappers = [
      ["get_gedu_for_discord_user", { p_discord_user_id: DISCORD_GEDU }],
      ["get_assigned_products_for_discord_user", { p_discord_user_id: DISCORD_GEDU }],
      ["get_gedu_assignment_summaries_for_discord_user", { p_discord_user_id: DISCORD_GEDU }],
      [
        "request_session_substitution_for_discord_user",
        {
          p_discord_user_id: DISCORD_GEDU,
          p_group_id: GROUP,
          p_session_date: utcDate(5),
          p_reason: "sick",
        },
      ],
    ] as const;

    const internals = [
      ["require_discord_linked_gedu", { p_discord_user_id: DISCORD_GEDU }],
      ["gedu_assigned_products", { p_gedu_id: TEST_IDS.GEDU }],
      [
        "gedu_assignment_summaries",
        { p_gedu_id: TEST_IDS.GEDU, p_epoch_date: SESSION_RECORDING_EPOCH },
      ],
      [
        "file_session_substitution_request",
        {
          p_gedu_id: TEST_IDS.GEDU,
          p_group_id: GROUP,
          p_session_date: utcDate(5),
          p_reason: "sick",
          p_reason_note: "",
        },
      ],
    ] as const;

    /**
     * A call refused at the grant: Postgres answers `permission denied for
     * function`, which shares 42501 with the guard primitives' refusal, so the
     * message is what proves the body never ran.
     */
    function expectDeniedAtTheGrant(error: { code?: string; message?: string } | null) {
      expect(error?.code).toBe(FORBIDDEN);
      expect(error?.message).toContain("permission denied for function");
    }

    it("the Discord wrappers are closed to signed-in and anonymous callers", async () => {
      await link(geduId, DISCORD_GEDU, new Date());
      for (const [name, args] of discordWrappers) {
        for (const client of [geduAuth, anon]) {
          const { error } = await client.rpc(name, args);
          expectDeniedAtTheGrant(error);
        }
      }
    });

    it("the bodies behind them are closed to every API role, the service role included", async () => {
      for (const [name, args] of internals) {
        for (const client of [geduAuth, anon, admin]) {
          const { error } = await client.rpc(name, args);
          expectDeniedAtTheGrant(error);
        }
      }
      const { count } = await admin
        .from("session_substitution_requests")
        .select("id", { count: "exact", head: true })
        .eq("group_id", GROUP);
      expect(count).toBe(0);
    });
  });
});
