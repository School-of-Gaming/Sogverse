import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  CHAT_IMAGES_BUCKET,
  ensureChatChannelResult,
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
 * The `chat-images` storage policy (00231) — the one read boundary the bytes
 * have.
 *
 * **Reading the object requires SELECT on it under storage RLS**, which is
 * what lets a single policy carry the whole of it: membership, the family time
 * bound, and a hidden message's picture being refused to everyone but a
 * moderator. Nothing in the app has to remember to check any of that — which
 * is exactly why nothing in the app would notice if the policy stopped doing
 * it. In production the policy is exercised by the read route's
 * `storage.download` on the viewer's own client (no signed URL is minted
 * anywhere since 00233); every case below goes through `createSignedUrl` on a
 * real caller's own client instead, because the two are gated by the same
 * SELECT predicate and the mint is the one storage read a db test can make
 * without standing up the app in front of it.
 *
 * The object is written with the service-role client, as the upload route
 * writes it: the bucket grants SELECT alone, so there is no client-side write
 * path to imitate and no INSERT policy for one to pass.
 *
 * **Every refusal is paired with the call that must still succeed**, so no
 * assertion here can pass because the fixture was empty or the bucket
 * unreachable. The pairs are the policy's three clauses, one each:
 *
 *   - membership — the seat-holder mints, the stranger does not;
 *   - the family time bound — the seat-holder is refused a channel whose
 *     window has closed, while the assigned gedu, who has no bound, still
 *     mints it (staff review after the fact is the point of keeping the bytes);
 *   - the hidden state — hiding retracts the picture from participants and from
 *     nobody else.
 *
 * Plus the join itself: an object whose name matches no message row is readable
 * by nobody, moderators included.
 *
 * Fixture layout mirrors chat-rpcs.test.ts: one product whose schedule slot is
 * placed so its window is open while the file runs, one group taught by GEDU
 * with GAMER holding an active seat, CUSTOMER_2 as the stranger, and a SECOND
 * channel whose window closed a month ago — fabricated through the service-role
 * client, because `ensure_chat_channel` only ever mints the window that is open
 * now and the read bound cannot be proved without one.
 */

const PRODUCT_LIVE = "00000000-0000-0000-0000-0000000007e3";

/**
 * An object name that is a well-formed uuid and names no message row.
 *
 * Constructed rather than guessed: message ids are client-generated v4 uuids,
 * so an all-but-one-digit-zero uuid cannot collide with a real row in CI's
 * database, which carries the seed fixtures and the real migrations' data side
 * by side.
 */
const ORPHAN_OBJECT_NAME = "00000000-0000-0000-0000-0000000007e9";

/** How long a minted URL would live. Irrelevant here — the minting is the test. */
const SIGN_SECONDS = 60;

/** Bytes that stand in for a picture. The policy never looks inside one. */
const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

describe("chat image storage policy", () => {
  let admin: SupabaseClient<Database>;
  let adminAuth: SupabaseClient<Database>;
  let geduAuth: SupabaseClient<Database>;
  let gamerAuth: SupabaseClient<Database>;
  let strangerAuth: SupabaseClient<Database>;

  let liveGroup: string;
  let channelId: string;
  let expiredChannelId: string;
  /** The picture in the channel whose window is open right now. */
  let liveImageId: string;
  /** The picture in the channel whose window closed a month ago. */
  let expiredImageId: string;

  /** Mint a URL for one object as one caller, and say only whether it worked. */
  async function canSign(
    client: SupabaseClient<Database>,
    objectName: string,
  ): Promise<boolean> {
    const { data, error } = await client.storage
      .from(CHAT_IMAGES_BUCKET)
      .createSignedUrl(objectName, SIGN_SECONDS);
    // A refusal and a missing object are one answer here, by design: the
    // policy's whole job is to make an object the caller may not read
    // indistinguishable from one that is not there.
    if (error !== null) return false;
    return data.signedUrl.length > 0;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();
    [adminAuth, geduAuth, gamerAuth, strangerAuth] = await Promise.all([
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
        TEST_CREDENTIALS.CUSTOMER_2.email,
        TEST_CREDENTIALS.CUSTOMER_2.password,
      ),
    ]);

    await deleteTestProducts(admin, [PRODUCT_LIVE]);
    await createTestProduct(admin, {
      id: PRODUCT_LIVE,
      seatCount: 50,
      timezone: "UTC",
    });

    // A slot whose window is open RIGHT NOW: the session started ten minutes
    // ago and runs an hour, so `ensure_chat_channel` finds it however long this
    // file takes. The product's timezone is UTC, so the weekday and wall clock
    // come straight off the UTC fields.
    const sessionStart = new Date(Date.now() - 10 * 60_000);
    await createScheduleSlot(admin, PRODUCT_LIVE, {
      // schedule_slots.weekday is 0 = Monday; getUTCDay() is 0 = Sunday.
      weekday: (sessionStart.getUTCDay() + 6) % 7,
      startTime: `${pad(sessionStart.getUTCHours())}:${pad(sessionStart.getUTCMinutes())}`,
      durationMinutes: 60,
    });

    const { data: groups, error: groupError } = await adminAuth.rpc(
      "apply_group_changes",
      {
        p_product_id: PRODUCT_LIVE,
        p_added_groups: [
          { tempId: "tLive", name: "Live", geduIds: [TEST_IDS.GEDU] },
        ],
      },
    );
    if (groupError) throw new Error(`seed group failed: ${groupError.message}`);
    liveGroup = getStringRecord(groups, "tempMap").tLive;

    const seat = await admin.from("participations").insert({
      product_id: PRODUCT_LIVE,
      participant_id: TEST_IDS.GAMER,
      customer_id: TEST_IDS.CUSTOMER,
      status: "active",
      group_id: liveGroup,
    });
    if (seat.error) {
      throw new Error(`seed participation failed: ${seat.error.message}`);
    }

    const channel = await gamerAuth.rpc("ensure_chat_channel", {
      p_group_id: liveGroup,
    });
    if (channel.error) {
      throw new Error(`ensure_chat_channel failed: ${channel.error.message}`);
    }
    channelId = ensureChatChannelResult.parse(channel.data)[0].id;

    // The picture in the open channel, sent the way the upload route sends
    // one — row first, on the sender's own client.
    liveImageId = crypto.randomUUID();
    const liveRow = await gamerAuth.rpc("send_chat_image_message", {
      p_id: liveImageId,
      p_channel_id: channelId,
      p_width: 800,
      p_height: 600,
    });
    if (liveRow.error) {
      throw new Error(`seed image message failed: ${liveRow.error.message}`);
    }

    // A channel whose window closed a month ago, and a picture inside it. Both
    // fabricated through the service-role client on purpose: they are the rows
    // no RPC will produce, because the ensure function only ever mints the
    // window that is open now.
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

    expiredImageId = crypto.randomUUID();
    const expiredRow = await admin.from("chat_messages").insert({
      id: expiredImageId,
      channel_id: expiredChannelId,
      sender_id: TEST_IDS.GAMER,
      image_width: 800,
      image_height: 600,
    });
    if (expiredRow.error) {
      throw new Error(`seed expired image failed: ${expiredRow.error.message}`);
    }

    // The objects, named by their message ids, written the way the upload route
    // writes them: the service-role client, because the bucket grants SELECT
    // alone and there is no INSERT policy for anybody else to pass.
    const bucket = admin.storage.from(CHAT_IMAGES_BUCKET);
    for (const name of [liveImageId, expiredImageId, ORPHAN_OBJECT_NAME]) {
      const { error } = await bucket.upload(name, IMAGE_BYTES, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (error) {
        throw new Error(`seed object ${name} failed: ${error.message}`);
      }
    }
  });

  afterAll(async () => {
    await admin.storage
      .from(CHAT_IMAGES_BUCKET)
      .remove([liveImageId, expiredImageId, ORPHAN_OBJECT_NAME]);
    await admin.from("chat_channels").delete().eq("group_id", liveGroup);
    await admin.from("participations").delete().eq("product_id", PRODUCT_LIVE);
    await deleteTestProducts(admin, [PRODUCT_LIVE]);
  });

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  it("mints for an active seat-holder and refuses an unrelated account", async () => {
    // The pair is the policy's membership clause, and neither half means
    // anything alone: a lone success could be a policy that admits everyone,
    // and a lone refusal could be a bucket nobody can read at all.
    expect(await canSign(gamerAuth, liveImageId)).toBe(true);
    expect(await canSign(strangerAuth, liveImageId)).toBe(false);
  });

  it("refuses an object no message row names, moderators included", async () => {
    // The join is the whole policy: an object is readable because a message row
    // named by it says which channel it is in. An orphan has nothing to ask
    // about, so it is refused for the caller who is refused least.
    expect(await canSign(adminAuth, ORPHAN_OBJECT_NAME)).toBe(false);
    expect(await canSign(geduAuth, ORPHAN_OBJECT_NAME)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // The family time bound
  // -------------------------------------------------------------------------

  it("refuses a seat-holder a picture from a closed window and still serves staff", async () => {
    // The bytes outlive the window on purpose — after-the-fact review is the
    // point of keeping them — so the bound is what separates the family from
    // the staff, on the image bytes exactly as it does on the rows.
    expect(await canSign(gamerAuth, expiredImageId)).toBe(false);
    expect(await canSign(geduAuth, expiredImageId)).toBe(true);
    expect(await canSign(adminAuth, expiredImageId)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // The hidden state
  // -------------------------------------------------------------------------

  it("retracts a hidden picture from participants and from nobody else", async () => {
    // Hiding performs no storage action at all: the policy reads `hidden_at`
    // live, so a moderator's remove control stops fresh mints by itself. An
    // already-minted URL survives until it expires, which is the accepted edge
    // the hidden-body wire exposure records for text.
    const hidden = await geduAuth.rpc("hide_chat_message", {
      p_id: liveImageId,
    });
    expect(hidden.error).toBeNull();

    expect(await canSign(gamerAuth, liveImageId)).toBe(false);
    expect(await canSign(geduAuth, liveImageId)).toBe(true);
    expect(await canSign(adminAuth, liveImageId)).toBe(true);

    // And back: a restore returns the picture to the room, which is what makes
    // the refusal above a property of `hidden_at` rather than of anything the
    // hide did to the object.
    const restored = await geduAuth.rpc("restore_chat_message", {
      p_id: liveImageId,
    });
    expect(restored.error).toBeNull();
    expect(await canSign(gamerAuth, liveImageId)).toBe(true);
  });
});
