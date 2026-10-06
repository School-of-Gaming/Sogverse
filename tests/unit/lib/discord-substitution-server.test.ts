import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Discord bot's side of filing an absence. The database decides everything
 * — who the Discord user acts as, what they may file — and the DB suite holds it
 * to that; what this module owns, and what is asserted here, is the seam: the
 * not-linked refusal read as `null` by the reads and thrown by the write, every
 * other refusal handed on unchanged for the web's own mapper, the note left out
 * rather than sent blank, and the picker's list built from the two seat reads by
 * the web's own expansion, less the sessions the live-requests read names.
 */

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import {
  fileDiscordSubstitutionRequest,
  getDiscordGeduUpcomingSessions,
  isDiscordGeduNotLinked,
  resolveDiscordGedu,
} from "@/lib/discord-substitution.server";
import { substitutionRequestFailureKey } from "@/services/session-substitution/session-substitution.refusals";

const DISCORD_ID = "910000000000000001";
const GEDU_ID = "6f1c0e2a-8b7d-4f3e-9a21-5c4d3b2a1f00";
const PRODUCT_ID = "0f8e7d6c-5b4a-4392-8170-6e5d4c3b2a19";
const GROUP_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const NOT_LINKED = {
  code: "P0031",
  message: "DISCORD_GEDU_NOT_LINKED",
  details: null,
  hint: null,
};

/** One standing assignment on a club meeting every Monday at 10:00 UTC. */
const ASSIGNMENT_ROW = {
  group_id: GROUP_ID,
  product: {
    id: PRODUCT_ID,
    product_type: "consumer_club",
    tag: null,
    topic: "minecraft_java",
    spoken_language_code: "en",
    timezone: "UTC",
    is_remote: true,
    start_date: "2026-09-01",
    end_date: "2026-10-31",
    site_name: null,
    translations: [{ locale: "en", name: "Builders Club", description: "x" }],
    schedule_slots: [{ weekday: 0, start_time: "10:00:00", duration_minutes: 60 }],
  },
  group_count: 1,
  participant_count: 4,
  kind: "assignment",
  substitution_date: null,
  cancelled_dates: ["2026-10-12"],
  substitution_cancelled: false,
};

const SUMMARY = {
  product_id: PRODUCT_ID,
  group_id: GROUP_ID,
  group_name: "Monday Cohort",
  kind: "assignment",
  substitution_date: null,
  group_participant_count: 4,
  site_name: null,
  attention_count: 0,
};

const REQUEST_DOCUMENT = {
  id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  group_id: GROUP_ID,
  session_date: "2026-10-19",
  role: "primary",
  status: "open",
  created_at: "2026-10-05T12:00:00+00:00",
  requested_by: GEDU_ID,
  requested_by_first_name: "Disco",
  substitute_id: null,
  substitute_first_name: null,
  approved_at: null,
  is_requester: true,
  offer_count: 0,
  reason: null,
  reason_note: null,
};

/** Answers each function by name, as the service-role client would. */
function answer(byName: Record<string, { data?: unknown; error?: unknown }>) {
  const results = new Map(Object.entries(byName));
  rpc.mockImplementation(async (name: string) => {
    const result = results.get(name);
    if (!result) throw new Error(`unexpected rpc ${name}`);
    return { data: result.data ?? null, error: result.error ?? null };
  });
}

beforeEach(() => {
  rpc.mockReset();
});

describe("resolveDiscordGedu", () => {
  it("names the linked gedu and their locale", async () => {
    answer({ get_gedu_for_discord_user: { data: { profile_id: GEDU_ID, locale: "fi" } } });
    await expect(resolveDiscordGedu(DISCORD_ID)).resolves.toEqual({
      profileId: GEDU_ID,
      locale: "fi",
    });
    expect(rpc).toHaveBeenCalledWith("get_gedu_for_discord_user", {
      p_discord_user_id: DISCORD_ID,
    });
  });

  it.each([null, "xx"])("answers no locale for a stored %s", async (locale) => {
    answer({ get_gedu_for_discord_user: { data: { profile_id: GEDU_ID, locale } } });
    expect((await resolveDiscordGedu(DISCORD_ID))?.locale).toBeNull();
  });

  it("answers null when no gedu is linked", async () => {
    answer({ get_gedu_for_discord_user: { error: NOT_LINKED } });
    await expect(resolveDiscordGedu(DISCORD_ID)).resolves.toBeNull();
  });

  it("throws any other failure", async () => {
    const failure = { code: "08006", message: "connection failure" };
    answer({ get_gedu_for_discord_user: { error: failure } });
    await expect(resolveDiscordGedu(DISCORD_ID)).rejects.toBe(failure);
  });
});

describe("getDiscordGeduUpcomingSessions", () => {
  it("builds the picker's sessions from the two seat reads", async () => {
    answer({
      get_assigned_products_for_discord_user: { data: [ASSIGNMENT_ROW] },
      get_gedu_assignment_summaries_for_discord_user: { data: [SUMMARY] },
      get_live_substitution_requests_for_discord_user: { data: [] },
    });

    const sessions = await getDiscordGeduUpcomingSessions({
      discordUserId: DISCORD_ID,
      locale: "en",
      // A Monday morning before that day's session, which is still offered; the
      // cancelled 12th is not.
      now: new Date("2026-10-05T08:00:00Z"),
    });

    expect(sessions?.map((s) => s.sessionDate)).toEqual([
      "2026-10-05",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(sessions?.[0]).toMatchObject({
      groupId: GROUP_ID,
      productName: "Builders Club",
      groupName: "Monday Cohort",
    });
    expect(rpc).toHaveBeenCalledWith("get_gedu_assignment_summaries_for_discord_user", {
      p_discord_user_id: DISCORD_ID,
      p_epoch_date: expect.any(String),
    });
  });

  it("leaves out a session the gedu has already asked a substitute for", async () => {
    // A Discord option cannot be disabled, so the web's greyed-out row is no row
    // here. The request on the 26th belongs to another group and marks nothing.
    answer({
      get_assigned_products_for_discord_user: { data: [ASSIGNMENT_ROW] },
      get_gedu_assignment_summaries_for_discord_user: { data: [SUMMARY] },
      get_live_substitution_requests_for_discord_user: {
        data: [
          REQUEST_DOCUMENT,
          {
            ...REQUEST_DOCUMENT,
            id: "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f",
            group_id: PRODUCT_ID,
            session_date: "2026-10-26",
          },
        ],
      },
    });

    const sessions = await getDiscordGeduUpcomingSessions({
      discordUserId: DISCORD_ID,
      locale: "en",
      now: new Date("2026-10-05T08:00:00Z"),
    });

    expect(sessions?.map((s) => s.sessionDate)).toEqual(["2026-10-05", "2026-10-26"]);
    expect(rpc).toHaveBeenCalledWith("get_live_substitution_requests_for_discord_user", {
      p_discord_user_id: DISCORD_ID,
    });
  });

  it("answers null when no gedu is linked", async () => {
    answer({
      get_assigned_products_for_discord_user: { error: NOT_LINKED },
      get_gedu_assignment_summaries_for_discord_user: { error: NOT_LINKED },
      get_live_substitution_requests_for_discord_user: { error: NOT_LINKED },
    });
    await expect(
      getDiscordGeduUpcomingSessions({ discordUserId: DISCORD_ID, locale: "en", now: new Date() }),
    ).resolves.toBeNull();
  });

  it.each([
    "get_gedu_assignment_summaries_for_discord_user",
    "get_live_substitution_requests_for_discord_user",
  ])("throws when %s fails otherwise", async (failing) => {
    const failure = { code: "08006", message: "connection failure" };
    answer({
      get_assigned_products_for_discord_user: { data: [ASSIGNMENT_ROW] },
      get_gedu_assignment_summaries_for_discord_user: { data: [SUMMARY] },
      get_live_substitution_requests_for_discord_user: { data: [] },
      [failing]: { error: failure },
    });
    await expect(
      getDiscordGeduUpcomingSessions({ discordUserId: DISCORD_ID, locale: "en", now: new Date() }),
    ).rejects.toBe(failure);
  });
});

describe("fileDiscordSubstitutionRequest", () => {
  it("files with a trimmed note and returns the document", async () => {
    answer({ request_session_substitution_for_discord_user: { data: REQUEST_DOCUMENT } });
    const document = await fileDiscordSubstitutionRequest({
      discordUserId: DISCORD_ID,
      groupId: GROUP_ID,
      sessionDate: "2026-10-19",
      reason: "sick",
      reasonNote: "  feverish ",
    });
    expect(document).toEqual(REQUEST_DOCUMENT);
    expect(rpc).toHaveBeenCalledWith("request_session_substitution_for_discord_user", {
      p_discord_user_id: DISCORD_ID,
      p_group_id: GROUP_ID,
      p_session_date: "2026-10-19",
      p_reason: "sick",
      p_reason_note: "feverish",
    });
  });

  it.each([undefined, "", "   "])("leaves a %j note out of the call", async (reasonNote) => {
    answer({ request_session_substitution_for_discord_user: { data: REQUEST_DOCUMENT } });
    await fileDiscordSubstitutionRequest({
      discordUserId: DISCORD_ID,
      groupId: GROUP_ID,
      sessionDate: "2026-10-19",
      reason: "other",
      reasonNote,
    });
    expect(rpc).toHaveBeenCalledWith("request_session_substitution_for_discord_user", {
      p_discord_user_id: DISCORD_ID,
      p_group_id: GROUP_ID,
      p_session_date: "2026-10-19",
      p_reason: "other",
    });
  });

  it("throws a refusal unchanged, for the web's mapper to read", async () => {
    const refusal = {
      code: "23514",
      message: "a substitution request cannot be filed for a past session (2026-10-01)",
    };
    answer({ request_session_substitution_for_discord_user: { error: refusal } });
    const thrown = await fileDiscordSubstitutionRequest({
      discordUserId: DISCORD_ID,
      groupId: GROUP_ID,
      sessionDate: "2026-10-01",
      reason: "sick",
    }).catch((error: unknown) => error);
    expect(thrown).toBe(refusal);
    expect(substitutionRequestFailureKey(thrown)).toBe("substitutionRequestFailedPastSession");
    expect(isDiscordGeduNotLinked(thrown)).toBe(false);
  });

  it("throws the not-linked refusal, which the route can tell apart", async () => {
    answer({ request_session_substitution_for_discord_user: { error: NOT_LINKED } });
    const thrown = await fileDiscordSubstitutionRequest({
      discordUserId: DISCORD_ID,
      groupId: GROUP_ID,
      sessionDate: "2026-10-19",
      reason: "sick",
    }).catch((error: unknown) => error);
    expect(isDiscordGeduNotLinked(thrown)).toBe(true);
  });
});
