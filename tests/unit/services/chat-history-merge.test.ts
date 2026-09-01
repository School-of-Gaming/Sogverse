import { describe, it, expect } from "vitest";
import { withNewerCachedMessages } from "@/services/chat/chat.queries";
import type { ChatHistory } from "@/services/chat/chat.service";
import type { ChatMessageRow } from "@/types";

/**
 * The history read's reconciliation of a resolved fetch against what the cache
 * already holds.
 *
 * **A fetch in flight is a snapshot of the past**, and every clause of this
 * function exists to stop that snapshot deleting the present: a message the
 * subscription patched in while the request was out, and an `image_stored_at`
 * flag that flipped in the same window. Both losses would be permanent rather
 * than transient — a dropped row is only recovered by the next focus refetch,
 * and a reverted flag by nothing at all, since the row it belongs to may never
 * emit another event — which is exactly why the merge is worth pinning here
 * rather than trusting to a reading of the code.
 *
 * The boundary is the other half: a cached row at or before the newest fetched
 * one is inside the window the fetch is authoritative for, so it must NOT be
 * unioned back in. Getting that wrong would resurrect a message the 200-row
 * limit has legitimately aged out of the log.
 */

const CHANNEL = "1c9c2d4e-6b1a-4f5a-9d2e-70a6a5b3c111";
const SENDER = "2f8b4a10-7c3d-4e6b-8a91-3d5f0c7e9a22";

function message(
  id: string,
  createdAt: string,
  overrides: Partial<ChatMessageRow> = {},
): ChatMessageRow {
  return {
    id,
    channel_id: CHANNEL,
    sender_id: SENDER,
    body: id,
    created_at: createdAt,
    edited_at: null,
    hidden_at: null,
    hidden_by: null,
    image_width: null,
    image_height: null,
    image_stored_at: null,
    reply_to_message_id: null,
    ...overrides,
  };
}

function history(messages: ChatMessageRow[]): ChatHistory {
  return { messages, reactions: [], locks: [] };
}

/** An image row, which is the only kind the stored flag can appear on. */
function picture(
  id: string,
  createdAt: string,
  storedAt: string | null,
): ChatMessageRow {
  return message(id, createdAt, {
    body: null,
    image_width: 800,
    image_height: 600,
    image_stored_at: storedAt,
  });
}

describe("withNewerCachedMessages", () => {
  it("takes the fetch as-is when the cache holds nothing", () => {
    const fetched = history([message("a", "2026-09-01T10:00:00Z")]);

    expect(withNewerCachedMessages(undefined, fetched)).toBe(fetched);
  });

  // -------------------------------------------------------------------------
  // The stored-image flag: monotone, so a fetched NULL is always the stale one
  // -------------------------------------------------------------------------

  it("never lets a fetched NULL flag override a cached image_stored_at", () => {
    // The sharp case the merge exists for: the flag's realtime UPDATE landed
    // while a refetch was in flight, and the refetch's snapshot predates it.
    // Reverting it would blank the picture until the next focus refetch,
    // because the flag is the last event that row will ever emit.
    const held = history([picture("a", "2026-09-01T10:00:00Z", "2026-09-01T10:00:02Z")]);
    const fetched = history([picture("a", "2026-09-01T10:00:00Z", null)]);

    const merged = withNewerCachedMessages(held, fetched);

    expect(merged.messages).toHaveLength(1);
    expect(merged.messages[0].image_stored_at).toBe("2026-09-01T10:00:02Z");
  });

  it("keeps the fetched flag when the cache has none", () => {
    const held = history([picture("a", "2026-09-01T10:00:00Z", null)]);
    const fetched = history([picture("a", "2026-09-01T10:00:00Z", "2026-09-01T10:00:05Z")]);

    const merged = withNewerCachedMessages(held, fetched);

    expect(merged.messages[0].image_stored_at).toBe("2026-09-01T10:00:05Z");
  });

  it("leaves the fetch authoritative for everything else in its window", () => {
    // Only the flag is merged. A tombstone the fetch carries wins over the
    // cached row it replaces — the fetch read the log later than the cache
    // learned about that row.
    const held = history([message("a", "2026-09-01T10:00:00Z")]);
    const fetched = history([
      message("a", "2026-09-01T10:00:00Z", {
        hidden_at: "2026-09-01T10:01:00Z",
        hidden_by: SENDER,
      }),
    ]);

    const merged = withNewerCachedMessages(held, fetched);

    expect(merged.messages[0].hidden_at).toBe("2026-09-01T10:01:00Z");
  });

  // -------------------------------------------------------------------------
  // The union, and the boundary that bounds it
  // -------------------------------------------------------------------------

  it("keeps a cached message newer than the fetched window's newest", () => {
    const arrival = message("c", "2026-09-01T10:00:09Z");
    const held = history([message("a", "2026-09-01T10:00:00Z"), arrival]);
    const fetched = history([
      message("a", "2026-09-01T10:00:00Z"),
      message("b", "2026-09-01T10:00:05Z"),
    ]);

    const merged = withNewerCachedMessages(held, fetched);

    // Appended, not interleaved: every kept row sorts after the last fetched
    // one, which is what makes appending order-preserving.
    expect(merged.messages.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks a shared instant by id, so a burst's tail is not lost or duplicated", () => {
    // `created_at` alone is not a total order — one press of Send fans a burst
    // out inside a single transaction — so the id is what decides which side of
    // the boundary a row sharing the newest instant falls on.
    const held = history([
      message("m1", "2026-09-01T10:00:05Z"),
      message("m3", "2026-09-01T10:00:05Z"),
    ]);
    const fetched = history([message("m2", "2026-09-01T10:00:05Z")]);

    const merged = withNewerCachedMessages(held, fetched);

    // "m3" > "m2" at the same instant, so it postdates the snapshot and is
    // kept; "m1" is inside the window the fetch is authoritative for.
    expect(merged.messages.map((row) => row.id)).toEqual(["m2", "m3"]);
  });

  it("does not resurrect a cached message older than the fetched window", () => {
    // The 200-row limit ages rows off the top of the log. One the fetch no
    // longer carries is one that has legitimately gone, not one that was lost.
    const held = history([
      message("old", "2026-09-01T09:00:00Z"),
      message("a", "2026-09-01T10:00:00Z"),
    ]);
    const fetched = history([message("a", "2026-09-01T10:00:00Z")]);

    const merged = withNewerCachedMessages(held, fetched);

    expect(merged.messages.map((row) => row.id)).toEqual(["a"]);
  });

  it("takes an empty answer at face value and drops the cached rows", () => {
    // The only ways to read nothing are an empty channel and a read window
    // that has closed, and the cached rows are what should go in both.
    const held = history([message("a", "2026-09-01T10:00:00Z")]);
    const fetched = history([]);

    const merged = withNewerCachedMessages(held, fetched);

    expect(merged.messages).toEqual([]);
  });
});
