import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import {
  CHAT_LOCKED_SQLSTATE,
  chatChannelRoster,
  chatReactionCode,
  ensureChatChannelResult,
  type ChatRosterEntry,
} from "@/services/chat/chat.contracts";
import { createAdminTestClient, createAuthenticatedClient } from "./helpers";
import { TEST_IDS, TEST_CREDENTIALS } from "./constants";
import {
  createScheduleSlot,
  createTestProduct,
  deleteTestProducts,
} from "./product-helpers";
import { getStringRecord } from "../helpers/json";

/**
 * The chat surface's nine RPCs and two membership predicates (00228 / 00229).
 *
 * This file is the **scope test** every chat entry in the authorization spine's
 * self-scoping allowlist names, and that classification is why it looks the way
 * it does. None of these functions is role-gated and none of them can be: chat
 * authorization is a MEMBERSHIP question, not a role question — a gamer, a
 * parent, a gedu and an admin are all legitimate callers of the same RPC, and
 * which one you are decides nothing on its own. Every guard is keyed to
 * `auth.uid()` through `is_chat_channel_member` / `is_chat_channel_moderator`,
 * so the caller's own identity determines the scope of every answer, which is
 * exactly what §3.4 admits as self-scoping. The failure mode that leaves is
 * scope leakage, and a scope test is the only thing that can see it — hence
 * every refusal below is paired with the call that must still succeed, so no
 * assertion can pass because the fixture was empty.
 *
 * The guards mirror `src/components/chat/capabilities.ts`, which is the spec.
 * The two halves of the moderation principle are pinned here on purpose:
 * hide/restore are SYMMETRIC (a moderator may remove anyone's message, a fellow
 * gedu's and an admin's included), and the lock is NOT (a moderator cannot lock
 * a colleague). A UI offering what the server refuses — or the reverse — is the
 * defect the pairing exists to prevent.
 *
 * Fixture layout:
 *   PRODUCT_LIVE  — one group, taught by GEDU, with GAMER and GAMER_2 holding
 *                   active seats, and a schedule slot placed so its session
 *                   window is OPEN while this file runs. ADMIN is a member of
 *                   every group by role; CUSTOMER_2 is the stranger.
 *   PRODUCT_SILENT— one group with no schedule slots at all, so
 *                   `ensure_chat_channel` has no window to find.
 *
 * One channel is materialized by the RPC; a second, EXPIRED one is fabricated
 * through the service-role client, because the read bound it exists to prove is
 * a window no RPC will ever mint a channel outside of.
 */

const PRODUCT_LIVE = "00000000-0000-0000-0000-0000000007e1";
const PRODUCT_SILENT = "00000000-0000-0000-0000-0000000007e2";
const ALL_PRODUCTS = [PRODUCT_LIVE, PRODUCT_SILENT];

/** Every seeded profile's `first_name`; the mention token snapshots it. */
const SEEDED_FIRST_NAME = "Test";

/** SQLSTATEs this surface answers with. */
const FORBIDDEN = "42501";
const CHECK_VIOLATION = "23514";
const NO_DATA = "P0002";

type Result<T> = { data: T; error: null } | { data: null; error: PostgrestError };

/** Unwraps a PostgREST result, throwing the SQLSTATE so a failure names itself. */
function ok<T>(result: Result<T>): T {
  if (result.error) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

/** The stored form of a mention: a name snapshot plus the id that is the truth. */
function mentionToken(accountId: string): string {
  return `@[${SEEDED_FIRST_NAME}](${accountId})`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

describe("chat RPCs", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let gamer2Auth: SupabaseClient<Database>;
  let strangerAuth: SupabaseClient<Database>;

  let liveGroup: string;
  let silentGroup: string;
  let channelId: string;
  let expiredChannelId: string;
  let expiredMessageId: string;
  /** The roster as it stood before anybody outside the group had sent. */
  let initialRoster: ChatRosterEntry[];
  /**
   * The same answer before the contracts schema touched it.
   *
   * `chatChannelRoster` strips unknown keys, so asserting on its output could
   * never notice a column that should not be travelling. This surface is a
   * deliberate hole in the `profiles` RLS that refuses cross-participant reads,
   * so "and nothing else about anybody" is a property worth pinning against the
   * raw response.
   */
  let rawInitialRoster: unknown;

  /** A fresh client-supplied message id, as the optimistic echo mints one. */
  function newMessageId(): string {
    return crypto.randomUUID();
  }

  /** Sends as the gamer and returns the id, for tests that need a target. */
  async function gamerSends(body: string): Promise<string> {
    const id = newMessageId();
    ok(
      await gamerAuth.rpc("send_chat_message", {
        p_id: id,
        p_channel_id: channelId,
        p_body: body,
      }),
    );
    return id;
  }

  async function lockGamer(): Promise<void> {
    ok(
      await geduAuth.rpc("set_chat_lock", {
        p_channel_id: channelId,
        p_user_id: TEST_IDS.GAMER,
        p_locked: true,
      }),
    );
  }

  async function unlockGamer(): Promise<void> {
    ok(
      await geduAuth.rpc("set_chat_lock", {
        p_channel_id: channelId,
        p_user_id: TEST_IDS.GAMER,
        p_locked: false,
      }),
    );
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    // Five sign-ins, concurrently: each is an independent password grant, and
    // serially they are most of this hook's budget.
    [adminAuth, geduAuth, gamerAuth, gamer2Auth, strangerAuth] =
      await Promise.all([
        createAuthenticatedClient(
          TEST_CREDENTIALS.ADMIN.email,
          TEST_CREDENTIALS.ADMIN.password,
        ),
        createAuthenticatedClient(
          TEST_CREDENTIALS.GEDU.email,
          TEST_CREDENTIALS.GEDU.password,
        ),
        createAuthenticatedClient(
          TEST_CREDENTIALS.GAMER.email,
          TEST_CREDENTIALS.GAMER.password,
        ),
        createAuthenticatedClient(
          TEST_CREDENTIALS.GAMER_2.email,
          TEST_CREDENTIALS.GAMER_2.password,
        ),
        createAuthenticatedClient(
          TEST_CREDENTIALS.CUSTOMER_2.email,
          TEST_CREDENTIALS.CUSTOMER_2.password,
        ),
      ]);

    await deleteTestProducts(admin, ALL_PRODUCTS);
    for (const id of ALL_PRODUCTS) {
      await createTestProduct(admin, { id, seatCount: 50, timezone: "UTC" });
    }

    // A slot whose window is open RIGHT NOW: the session started ten minutes
    // ago and runs an hour, so `ensure_chat_channel` finds it however long this
    // file takes. The product's timezone is UTC, so the weekday and wall clock
    // come straight off the UTC fields. If ten minutes ago fell before UTC
    // midnight the slot lands on yesterday's weekday, which is the adjacent-day
    // probe doing its job rather than a case to avoid.
    const sessionStart = new Date(Date.now() - 10 * 60_000);
    await createScheduleSlot(admin, PRODUCT_LIVE, {
      // schedule_slots.weekday is 0 = Monday; getUTCDay() is 0 = Sunday.
      weekday: (sessionStart.getUTCDay() + 6) % 7,
      startTime: `${pad(sessionStart.getUTCHours())}:${pad(sessionStart.getUTCMinutes())}`,
      durationMinutes: 60,
    });

    const live = ok(
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_LIVE,
        p_added_groups: [
          { tempId: "tLive", name: "Live", geduIds: [TEST_IDS.GEDU] },
        ],
      }),
    );
    liveGroup = getStringRecord(live, "tempMap").tLive;

    const silent = ok(
      await adminAuth.rpc("apply_group_changes", {
        p_product_id: PRODUCT_SILENT,
        p_added_groups: [{ tempId: "tSilent", name: "Silent", geduIds: [] }],
      }),
    );
    silentGroup = getStringRecord(silent, "tempMap").tSilent;

    const seats = await admin.from("participations").insert([
      {
        product_id: PRODUCT_LIVE,
        participant_id: TEST_IDS.GAMER,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: liveGroup,
      },
      {
        product_id: PRODUCT_LIVE,
        participant_id: TEST_IDS.GAMER_2,
        customer_id: TEST_IDS.CUSTOMER,
        status: "active",
        group_id: liveGroup,
      },
    ]);
    if (seats.error) {
      throw new Error(`seed participations failed: ${seats.error.message}`);
    }

    const [channel] = ensureChatChannelResult.parse(
      ok(await gamerAuth.rpc("ensure_chat_channel", { p_group_id: liveGroup })),
    );
    channelId = channel.id;

    // The roster before anybody outside the group's own membership has sent —
    // captured here rather than read inside the test, so a later case that puts
    // an admin in the log cannot change what the ordering assertion is looking
    // at whichever order the runner picks.
    rawInitialRoster = ok(
      await gamerAuth.rpc("get_chat_channel_roster", {
        p_channel_id: channelId,
      }),
    );
    initialRoster = chatChannelRoster.parse(rawInitialRoster);

    // A channel whose window closed a month ago. Fabricated through the
    // service-role client on purpose: it is the one row on this surface no RPC
    // will produce, because `ensure_chat_channel` only ever mints the window
    // that is open now — and the read bound cannot be proved without one.
    const expiredOpens = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const expired = await admin
      .from("chat_channels")
      .insert({
        type: "group_session",
        group_id: liveGroup,
        session_opens_at: expiredOpens.toISOString(),
        session_ends_at: new Date(
          expiredOpens.getTime() + 60 * 60_000,
        ).toISOString(),
      })
      .select("id")
      .single();
    if (expired.error) {
      throw new Error(`seed expired channel failed: ${expired.error.message}`);
    }
    expiredChannelId = expired.data.id;

    // A message inside it, so "the seat-holder reads nothing" is a statement
    // about the policy rather than about an empty table.
    expiredMessageId = newMessageId();
    const oldMessage = await admin.from("chat_messages").insert({
      id: expiredMessageId,
      channel_id: expiredChannelId,
      sender_id: TEST_IDS.GAMER,
      body: "last month",
    });
    if (oldMessage.error) {
      throw new Error(`seed expired message failed: ${oldMessage.error.message}`);
    }
  });

  afterAll(async () => {
    // Channels cascade from product_groups, which cascade from products — but
    // delete them explicitly so a failed run does not leave rows behind that
    // outlive the product teardown.
    await admin.from("chat_channels").delete().eq("group_id", liveGroup);
    await admin.from("participations").delete().in("product_id", ALL_PRODUCTS);
    await deleteTestProducts(admin, ALL_PRODUCTS);
  });

  // -------------------------------------------------------------------------
  // ensure_chat_channel
  // -------------------------------------------------------------------------

  describe("ensure_chat_channel", () => {
    it("materializes the open window's channel for a member, idempotently", async () => {
      const again = ensureChatChannelResult.parse(
        ok(await gamerAuth.rpc("ensure_chat_channel", { p_group_id: liveGroup })),
      );

      expect(again[0].id).toBe(channelId);
      expect(again[0].group_id).toBe(liveGroup);
      expect(again[0].type).toBe("group_session");
      // Both instants are server-derived: the window opened before now and
      // closes after it, which is the whole of what "the room is open" means.
      expect(Date.parse(again[0].session_opens_at)).toBeLessThan(Date.now());
      expect(Date.parse(again[0].session_ends_at)).toBeGreaterThan(Date.now());
    });

    it("refuses a stranger", async () => {
      const result = await strangerAuth.rpc("ensure_chat_channel", {
        p_group_id: liveGroup,
      });

      expect(result.error?.code).toBe(FORBIDDEN);
    });

    it("refuses a group whose schedule has no window open", async () => {
      // An admin is a member of every group, so the only thing left to refuse
      // this call is the window search itself — which is what makes the
      // assertion about the search rather than about membership.
      const result = await adminAuth.rpc("ensure_chat_channel", {
        p_group_id: silentGroup,
      });

      expect(result.error?.code).toBe(NO_DATA);
    });

    it("never creates a group_sessions row", async () => {
      // The reason chat channels carry their own window instants instead of a
      // foreign key: `ensure_group_session` is unguarded behind staff-only
      // callers, and a participant reaching it would manufacture phantom
      // sessions that surface as blank cards in the gedu and admin feeds.
      const { data } = await admin
        .from("group_sessions")
        .select("id")
        .in("group_id", [liveGroup, silentGroup]);

      expect(data ?? []).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // The membership predicates, and the read bound they carry
  // -------------------------------------------------------------------------

  describe("is_chat_channel_member / is_chat_channel_moderator", () => {
    it("a seat-holder is a member of the open channel and moderates nothing", async () => {
      expect(
        ok(
          await gamerAuth.rpc("is_chat_channel_member", {
            p_channel_id: channelId,
          }),
        ),
      ).toBe(true);
      expect(
        ok(
          await gamerAuth.rpc("is_chat_channel_moderator", {
            p_channel_id: channelId,
          }),
        ),
      ).toBe(false);
    });

    it("the assigned gedu and an admin are both, by a positive allow-list", async () => {
      for (const client of [geduAuth, adminAuth]) {
        expect(
          ok(await client.rpc("is_chat_channel_member", { p_channel_id: channelId })),
        ).toBe(true);
        expect(
          ok(
            await client.rpc("is_chat_channel_moderator", {
              p_channel_id: channelId,
            }),
          ),
        ).toBe(true);
      }
    });

    it("a stranger is neither, and an unknown channel is a total false", async () => {
      expect(
        ok(
          await strangerAuth.rpc("is_chat_channel_member", {
            p_channel_id: channelId,
          }),
        ),
      ).toBe(false);
      // Not NULL — the predicate COALESCEs, because a NULL-capable boolean is a
      // trap for every consumer that is not a USING clause.
      expect(
        ok(
          await gamerAuth.rpc("is_chat_channel_member", {
            p_channel_id: "00000000-0000-0000-0000-0000000007ef",
          }),
        ),
      ).toBe(false);
    });

    it("the family read bound expires for a seat-holder and never for staff", async () => {
      expect(
        ok(
          await gamerAuth.rpc("is_chat_channel_member", {
            p_channel_id: expiredChannelId,
          }),
        ),
      ).toBe(false);
      // Staff review is the point of keeping the rows, so neither the assigned
      // gedu nor an admin has a time bound at all.
      expect(
        ok(
          await geduAuth.rpc("is_chat_channel_member", {
            p_channel_id: expiredChannelId,
          }),
        ),
      ).toBe(true);
      expect(
        ok(
          await adminAuth.rpc("is_chat_channel_member", {
            p_channel_id: expiredChannelId,
          }),
        ),
      ).toBe(true);
    });

    it("and the RLS SELECT policy says the same thing about the rows", async () => {
      // This is the assertion the whole time bound exists for. The UI never
      // shows an old channel — but postgres_changes respects RLS, so the
      // subscriber reads these tables DIRECTLY, and any member's own account can
      // point PostgREST at them. Without the bound that path returns every past
      // session's log, including chat from before that member joined the group.
      const stale = await gamerAuth
        .from("chat_messages")
        .select("id")
        .eq("channel_id", expiredChannelId);
      expect(stale.data ?? []).toEqual([]);

      const staffStale = await geduAuth
        .from("chat_messages")
        .select("id")
        .eq("channel_id", expiredChannelId);
      expect((staffStale.data ?? []).map((row) => row.id)).toEqual([
        expiredMessageId,
      ]);

      // Non-vacuity: the same account reads the CURRENT channel perfectly well,
      // so the empty result above is the window and not a broken fixture.
      const liveRead = await gamerAuth
        .from("chat_channels")
        .select("id")
        .eq("id", channelId);
      expect((liveRead.data ?? []).map((row) => row.id)).toEqual([channelId]);
    });
  });

  // -------------------------------------------------------------------------
  // get_chat_channel_roster
  // -------------------------------------------------------------------------

  describe("get_chat_channel_roster", () => {
    it("names the group's seat-holders and the product's gedus, ordered by id", async () => {
      // Deterministic order is a contract, not tidiness: mention resolution
      // settles two accounts sharing a name by list position, and the composer
      // and the in-place editor are handed the same array. The seeded ids sort
      // gedu(…003) < gamer(…004) < gamer 2(…006), so this is an exact list.
      expect(initialRoster.map((entry) => entry.id)).toEqual([
        TEST_IDS.GEDU,
        TEST_IDS.GAMER,
        TEST_IDS.GAMER_2,
      ]);
      expect(initialRoster.map((entry) => entry.role)).toEqual([
        "gedu",
        "gamer",
        "gamer",
      ]);
      // First name and role and nothing else. Asserted against the RAW response
      // with a strict schema, because this RPC is a deliberate hole in the
      // `profiles` RLS that refuses cross-participant reads: an email, a
      // surname or a date of birth arriving alongside would be stripped
      // invisibly by the contracts schema and caught by nothing.
      const strictRoster = z.array(
        z
          .object({
            id: z.string(),
            first_name: z.literal(SEEDED_FIRST_NAME),
            role: z.string(),
          })
          .strict(),
      );
      expect(() => strictRoster.parse(rawInitialRoster)).not.toThrow();
    });

    it("refuses a stranger", async () => {
      const result = await strangerAuth.rpc("get_chat_channel_roster", {
        p_channel_id: channelId,
      });

      expect(result.error?.code).toBe(FORBIDDEN);
    });

    it("admits somebody who is in the channel only because they sent", async () => {
      // The third clause of the roster, and what it buys: an admin dropping in,
      // or a covering gedu outside the assignment, becomes nameable and
      // mentionable the moment they speak — and a departed member's name keeps
      // rendering on the words they left behind.
      expect(initialRoster.map((entry) => entry.id)).not.toContain(
        TEST_IDS.ADMIN,
      );

      ok(
        await adminAuth.rpc("send_chat_message", {
          p_id: newMessageId(),
          p_channel_id: channelId,
          p_body: "dropping in",
        }),
      );

      const roster = chatChannelRoster.parse(
        ok(
          await gamerAuth.rpc("get_chat_channel_roster", {
            p_channel_id: channelId,
          }),
        ),
      );
      expect(roster.map((entry) => entry.id)).toContain(TEST_IDS.ADMIN);
      // Still ordered by id, with the newcomer in their place rather than at the
      // end — the order is the RPC's, not arrival order.
      expect(roster.map((entry) => entry.id)).toEqual(
        [...roster.map((entry) => entry.id)].sort(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // send_chat_message
  // -------------------------------------------------------------------------

  describe("send_chat_message", () => {
    it("lands the message under the caller's own id and sender", async () => {
      const id = newMessageId();
      const createdAt = ok(
        await gamerAuth.rpc("send_chat_message", {
          p_id: id,
          p_channel_id: channelId,
          p_body: "hello everyone",
        }),
      );
      expect(Number.isNaN(Date.parse(createdAt))).toBe(false);

      const row = await admin
        .from("chat_messages")
        .select("id, sender_id, body, image_width, hidden_at, edited_at")
        .eq("id", id)
        .single();
      expect(row.error).toBeNull();
      expect(row.data?.sender_id).toBe(TEST_IDS.GAMER);
      expect(row.data?.body).toBe("hello everyone");
      expect(row.data?.image_width).toBeNull();
      expect(row.data?.hidden_at).toBeNull();
      expect(row.data?.edited_at).toBeNull();
    });

    it("accepts a draft at the cap that names three people, storing far more than the cap", async () => {
      // The cap is a promise about the sentence somebody WROTE — mentions
      // counted as the `@Name` they read — so it is measured on the display
      // form, and the stored string is legitimately longer. This is the draft a
      // flat cap on the stored column would have refused, which is the exact
      // failure the display-measured CHECK exists to prevent.
      const tokens = [TEST_IDS.GEDU, TEST_IDS.GAMER, TEST_IDS.GAMER_2]
        .map(mentionToken)
        .join(" ");
      const displaySoFar = 3 * `@${SEEDED_FIRST_NAME}`.length + 2 + 1;
      const body = `${tokens} ${"x".repeat(500 - displaySoFar)}`;

      expect(body.length).toBeGreaterThan(500);

      const id = newMessageId();
      ok(
        await gamerAuth.rpc("send_chat_message", {
          p_id: id,
          p_channel_id: channelId,
          p_body: body,
        }),
      );

      const row = await admin
        .from("chat_messages")
        .select("body")
        .eq("id", id)
        .single();
      expect(row.data?.body).toBe(body);
    });

    it("refuses a draft one character past the display cap", async () => {
      const result = await gamerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: "x".repeat(501),
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses a mention of somebody outside the roster", async () => {
      // An unvalidated token renders attacker-chosen text as a trusted-looking
      // chip in a room of children: the name inside the token is a snapshot the
      // renderer falls back to, so a crafted body can put any words at all
      // beside a mention. The honest composer only ever emits roster ids.
      const result = await gamerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: `hi ${mentionToken(TEST_IDS.CUSTOMER_2)}`,
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses a reply to a removed message", async () => {
      // capabilities.ts offers reply only on a non-hidden target. The tombstone
      // is fabricated through the service-role client so this case stands on its
      // own rather than on hide_chat_message passing first.
      const target = await gamerSends("about to go");
      const hide = await admin
        .from("chat_messages")
        .update({
          hidden_at: new Date().toISOString(),
          hidden_by: TEST_IDS.GEDU,
        })
        .eq("id", target);
      expect(hide.error).toBeNull();

      const result = await gamerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: "quoting that",
        p_reply_to_message_id: target,
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses a reply to a message in another channel", async () => {
      const result = await gamerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: "quoting last month",
        p_reply_to_message_id: expiredMessageId,
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("accepts a reply to a standing message of the same channel", async () => {
      // The half that keeps every refusal above non-vacuous.
      const target = await gamerSends("what time is it");
      const id = newMessageId();
      ok(
        await gamer2Auth.rpc("send_chat_message", {
          p_id: id,
          p_channel_id: channelId,
          p_body: "half past",
          p_reply_to_message_id: target,
        }),
      );

      const row = await admin
        .from("chat_messages")
        .select("reply_to_message_id")
        .eq("id", id)
        .single();
      expect(row.data?.reply_to_message_id).toBe(target);
    });

    it("refuses an empty body — the XOR constraint means text OR one image", async () => {
      const result = await gamerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: "   ",
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses a stranger", async () => {
      const result = await strangerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: "let me in",
      });

      expect(result.error?.code).toBe(FORBIDDEN);
    });
  });

  // -------------------------------------------------------------------------
  // send_chat_image_message
  // -------------------------------------------------------------------------

  describe("send_chat_image_message", () => {
    it("creates an image row with the dimensions the route measured and no body", async () => {
      const id = newMessageId();
      ok(
        await gamerAuth.rpc("send_chat_image_message", {
          p_id: id,
          p_channel_id: channelId,
          p_width: 1200,
          p_height: 800,
        }),
      );

      const row = await admin
        .from("chat_messages")
        .select("body, image_width, image_height")
        .eq("id", id)
        .single();
      expect(row.data?.body).toBeNull();
      expect(row.data?.image_width).toBe(1200);
      expect(row.data?.image_height).toBe(800);
    });

    it("refuses implausible dimensions as one class", async () => {
      // Every thumbnail box in the log is arithmetic from these two numbers and
      // nothing measures a decoded image, so a fabricated 1 × 20000 would be a
      // layout bomb in every viewer's log rather than one mis-sized box.
      for (const size of [
        { p_width: 0, p_height: 800 },
        { p_width: 1200, p_height: 20_000 },
      ]) {
        const result = await gamerAuth.rpc("send_chat_image_message", {
          p_id: newMessageId(),
          p_channel_id: channelId,
          ...size,
        });
        expect(result.error?.code).toBe(CHECK_VIOLATION);
      }
    });

    it("refuses a stranger", async () => {
      const result = await strangerAuth.rpc("send_chat_image_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_width: 800,
        p_height: 600,
      });

      expect(result.error?.code).toBe(FORBIDDEN);
    });
  });

  // -------------------------------------------------------------------------
  // edit_chat_message
  // -------------------------------------------------------------------------

  describe("edit_chat_message", () => {
    it("rewrites the sender's own standing message and stamps edited_at", async () => {
      const id = await gamerSends("teh cat");
      const editedAt = ok(
        await gamerAuth.rpc("edit_chat_message", { p_id: id, p_body: "the cat" }),
      );
      expect(Number.isNaN(Date.parse(editedAt))).toBe(false);

      const row = await admin
        .from("chat_messages")
        .select("body, edited_at")
        .eq("id", id)
        .single();
      expect(row.data?.body).toBe("the cat");
      expect(row.data?.edited_at).not.toBeNull();
    });

    it("refuses somebody else's message, identically to one that does not exist", async () => {
      const id = await gamerSends("mine");

      const other = await gamer2Auth.rpc("edit_chat_message", {
        p_id: id,
        p_body: "not yours",
      });
      const missing = await gamer2Auth.rpc("edit_chat_message", {
        p_id: "00000000-0000-0000-0000-0000000007ee",
        p_body: "nothing",
      });

      expect(other.error?.code).toBe(FORBIDDEN);
      expect(missing.error?.code).toBe(FORBIDDEN);
    });

    it("refuses an image message — there is nothing to edit", async () => {
      const id = newMessageId();
      ok(
        await gamerAuth.rpc("send_chat_image_message", {
          p_id: id,
          p_channel_id: channelId,
          p_width: 640,
          p_height: 480,
        }),
      );

      const result = await gamerAuth.rpc("edit_chat_message", {
        p_id: id,
        p_body: "a caption",
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses under a lock, with the named refusal", async () => {
      // capabilities.ts is the spec and a lock takes edits away. The code is its
      // own because the client must NOT offer a retry: the lock's realtime
      // arrival is what disables the composer, and this refusal races it.
      const id = await gamerSends("before the lock");
      await lockGamer();
      try {
        const result = await gamerAuth.rpc("edit_chat_message", {
          p_id: id,
          p_body: "after the lock",
        });
        expect(result.error?.code).toBe(CHAT_LOCKED_SQLSTATE);
      } finally {
        await unlockGamer();
      }
    });
  });

  // -------------------------------------------------------------------------
  // hide_chat_message / restore_chat_message
  // -------------------------------------------------------------------------

  describe("hide_chat_message / restore_chat_message", () => {
    it("a sender removes their own message, and the row and body survive", async () => {
      const id = await gamerSends("said too much");
      const hiddenAt = ok(await gamerAuth.rpc("hide_chat_message", { p_id: id }));
      expect(Number.isNaN(Date.parse(hiddenAt))).toBe(false);

      const row = await admin
        .from("chat_messages")
        .select("body, hidden_at, hidden_by")
        .eq("id", id)
        .single();
      // The soft delete is the whole design: a moderator keeps reading what was
      // removed, which is the moment the record matters most.
      expect(row.data?.body).toBe("said too much");
      expect(row.data?.hidden_at).not.toBeNull();
      expect(row.data?.hidden_by).toBe(TEST_IDS.GAMER);
    });

    it("a moderator removes another moderator's message — moderation is symmetric", async () => {
      // The absence of a mod-vs-mod test in this RPC is a decision, not an
      // oversight: removing a message acts on one thing that was said, and a
      // rule exempting staff would make the one message nobody could take down
      // the one a moderator is standing next to.
      const id = newMessageId();
      ok(
        await adminAuth.rpc("send_chat_message", {
          p_id: id,
          p_channel_id: channelId,
          p_body: "an admin's slip",
        }),
      );

      ok(await geduAuth.rpc("hide_chat_message", { p_id: id }));

      const row = await admin
        .from("chat_messages")
        .select("hidden_by")
        .eq("id", id)
        .single();
      expect(row.data?.hidden_by).toBe(TEST_IDS.GEDU);

      // And back again, by the same symmetry.
      ok(await adminAuth.rpc("restore_chat_message", { p_id: id }));
      const restored = await admin
        .from("chat_messages")
        .select("hidden_at, hidden_by")
        .eq("id", id)
        .single();
      expect(restored.data?.hidden_at).toBeNull();
      // Cleared with the stamp: after a restore nothing was removed, and a name
      // left on an act that no longer stands reads as an accusation in the psql
      // review path the column exists for.
      expect(restored.data?.hidden_by).toBeNull();
    });

    it("a participant cannot remove somebody else's message", async () => {
      const id = await gamerSends("not yours to take");

      const result = await gamer2Auth.rpc("hide_chat_message", { p_id: id });

      expect(result.error?.code).toBe(FORBIDDEN);
    });

    it("a locked member can still take back their own message", async () => {
      // The one write a lock leaves. Refusing it would make the lock a
      // punishment rather than a control.
      const id = await gamerSends("regretted");
      await lockGamer();
      try {
        ok(await gamerAuth.rpc("hide_chat_message", { p_id: id }));
        const row = await admin
          .from("chat_messages")
          .select("hidden_at")
          .eq("id", id)
          .single();
        expect(row.data?.hidden_at).not.toBeNull();
      } finally {
        await unlockGamer();
      }
    });

    it("restore is moderators only, and only on a message that was removed", async () => {
      const id = await gamerSends("put me back");
      ok(await gamerAuth.rpc("hide_chat_message", { p_id: id }));

      const bySender = await gamerAuth.rpc("restore_chat_message", { p_id: id });
      expect(bySender.error?.code).toBe(FORBIDDEN);

      ok(await geduAuth.rpc("restore_chat_message", { p_id: id }));

      const again = await geduAuth.rpc("restore_chat_message", { p_id: id });
      expect(again.error?.code).toBe(CHECK_VIOLATION);
    });
  });

  // -------------------------------------------------------------------------
  // toggle_chat_reaction
  // -------------------------------------------------------------------------

  describe("toggle_chat_reaction", () => {
    it("adds and takes back, stamping channel_id from the message", async () => {
      const id = await gamerSends("react to this");
      const code = chatReactionCode.options[0];

      expect(
        ok(
          await gamer2Auth.rpc("toggle_chat_reaction", {
            p_message_id: id,
            p_code: code,
          }),
        ),
      ).toBe(true);

      const added = await admin
        .from("chat_reactions")
        .select("message_id, sender_id, code, channel_id")
        .eq("message_id", id)
        .single();
      expect(added.data?.sender_id).toBe(TEST_IDS.GAMER_2);
      // Never from the caller: that is what stops a reaction being filed under a
      // channel its message is not in, and the column is what lets a
      // postgres_changes subscription filter on one column.
      expect(added.data?.channel_id).toBe(channelId);
      expect(chatReactionCode.parse(added.data?.code)).toBe(code);

      expect(
        ok(
          await gamer2Auth.rpc("toggle_chat_reaction", {
            p_message_id: id,
            p_code: code,
          }),
        ),
      ).toBe(false);

      const { data: after } = await admin
        .from("chat_reactions")
        .select("message_id")
        .eq("message_id", id);
      expect(after ?? []).toEqual([]);
    });

    it("refuses a code outside the approved set", async () => {
      // The DB stores the CODE and never the emoji, and the approved list lives
      // in exactly one place in SQL — the column's own CHECK, mirroring
      // CHAT_REACTION_CODES.
      const id = await gamerSends("nothing draws that");

      const result = await gamer2Auth.rpc("toggle_chat_reaction", {
        p_message_id: id,
        p_code: "shrug",
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses a removed message", async () => {
      const id = await gamerSends("gone");
      ok(await gamerAuth.rpc("hide_chat_message", { p_id: id }));

      const result = await gamer2Auth.rpc("toggle_chat_reaction", {
        p_message_id: id,
        p_code: chatReactionCode.options[0],
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("refuses under a lock — a reaction is a message with fewer characters", async () => {
      const id = await gamerSends("would have reacted");
      await lockGamer();
      try {
        const result = await gamerAuth.rpc("toggle_chat_reaction", {
          p_message_id: id,
          p_code: chatReactionCode.options[0],
        });
        expect(result.error?.code).toBe(CHAT_LOCKED_SQLSTATE);
      } finally {
        await unlockGamer();
      }
    });

    it("refuses a stranger", async () => {
      const id = await gamerSends("not for you");

      const result = await strangerAuth.rpc("toggle_chat_reaction", {
        p_message_id: id,
        p_code: chatReactionCode.options[0],
      });

      expect(result.error?.code).toBe(FORBIDDEN);
    });
  });

  // -------------------------------------------------------------------------
  // set_chat_lock
  // -------------------------------------------------------------------------

  describe("set_chat_lock", () => {
    it("a moderator locks a participant, and unlocking UPDATES rather than deletes", async () => {
      await lockGamer();

      const locked = await admin
        .from("chat_channel_locks")
        .select("locked_at, locked_by")
        .eq("channel_id", channelId)
        .eq("user_id", TEST_IDS.GAMER)
        .single();
      expect(locked.data?.locked_at).not.toBeNull();
      expect(locked.data?.locked_by).toBe(TEST_IDS.GEDU);

      await unlockGamer();

      // The row SURVIVES with locked_at cleared. That is what makes both
      // directions of the switch replicate as UPDATEs, so a lock lifted
      // mid-conversation arrives live rather than on a refetch — and it is why
      // chat_channel_locks needs no REPLICA IDENTITY change.
      const unlocked = await admin
        .from("chat_channel_locks")
        .select("locked_at, locked_by")
        .eq("channel_id", channelId)
        .eq("user_id", TEST_IDS.GAMER)
        .single();
      expect(unlocked.error).toBeNull();
      expect(unlocked.data?.locked_at).toBeNull();
      expect(unlocked.data?.locked_by).toBe(TEST_IDS.GEDU);
    });

    it("refuses a moderator target — a lock is not offered against a colleague", async () => {
      // The asymmetric half of the moderation principle. Between staff a lock is
      // not moderation, it is one member of staff silencing another in front of
      // children they are both responsible for.
      for (const target of [TEST_IDS.GEDU, TEST_IDS.ADMIN]) {
        const result = await geduAuth.rpc("set_chat_lock", {
          p_channel_id: channelId,
          p_user_id: target,
          p_locked: true,
        });
        expect(result.error?.code).toBe(CHECK_VIOLATION);
      }
    });

    it("refuses a target who is not in this chat at all", async () => {
      // The target half of the authorization: a moderator may lock people in
      // this room, not write lock rows about arbitrary accounts.
      const result = await geduAuth.rpc("set_chat_lock", {
        p_channel_id: channelId,
        p_user_id: TEST_IDS.CUSTOMER_2,
        p_locked: true,
      });

      expect(result.error?.code).toBe(CHECK_VIOLATION);
    });

    it("a participant cannot lock anybody", async () => {
      const result = await gamerAuth.rpc("set_chat_lock", {
        p_channel_id: channelId,
        p_user_id: TEST_IDS.GAMER_2,
        p_locked: true,
      });

      expect(result.error?.code).toBe(FORBIDDEN);
    });

    it("a lock is readable by the person it lands on and by moderators, nobody else", async () => {
      // A channel-wide read would broadcast live to every child in the room that
      // a gedu had silenced a particular child. The UI needs no more than this:
      // the switch is moderator-gated, and a locked viewer needs only their own
      // state to draw the composer's notice.
      await lockGamer();
      try {
        const own = await gamerAuth
          .from("chat_channel_locks")
          .select("user_id")
          .eq("channel_id", channelId);
        expect((own.data ?? []).map((row) => row.user_id)).toEqual([
          TEST_IDS.GAMER,
        ]);

        const peer = await gamer2Auth
          .from("chat_channel_locks")
          .select("user_id")
          .eq("channel_id", channelId);
        expect(peer.data ?? []).toEqual([]);

        const moderator = await geduAuth
          .from("chat_channel_locks")
          .select("user_id")
          .eq("channel_id", channelId);
        expect((moderator.data ?? []).map((row) => row.user_id)).toContain(
          TEST_IDS.GAMER,
        );
      } finally {
        await unlockGamer();
      }
    });

    it("a locked member is refused a send, and sending works again once lifted", async () => {
      await lockGamer();
      const refused = await gamerAuth.rpc("send_chat_message", {
        p_id: newMessageId(),
        p_channel_id: channelId,
        p_body: "still here",
      });
      expect(refused.error?.code).toBe(CHAT_LOCKED_SQLSTATE);

      // A lock takes the keyboard away and leaves the room: reading is untouched.
      const stillReads = await gamerAuth
        .from("chat_messages")
        .select("id")
        .eq("channel_id", channelId)
        .limit(1);
      expect((stillReads.data ?? []).length).toBe(1);

      await unlockGamer();
      await gamerSends("back");
    });
  });
});
