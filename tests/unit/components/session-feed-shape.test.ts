import { describe, expect, it } from "vitest";
import {
  FEED_INITIAL_PAST_ENTRIES,
  FEED_PAST_CHUNK_SIZE,
  newestPastEntryId,
  partitionFeedEntries,
  pastEntryWindow,
} from "@/components/session-feed";

/**
 * The feed's structural arithmetic — where "next" is, which past entry is the
 * newest, and how much of the past is on screen.
 *
 * **Exercised over a minimal entry rather than either real one, on purpose.**
 * These helpers are shared by two feeds whose entries are deliberately different
 * types, and everything they are allowed to know about an entry is its id and
 * which side of the present it is on. Testing them against a union that carries
 * nothing else is what keeps that honest: a helper that started reading a report
 * or an attendance map would stop compiling here rather than quietly coupling
 * the shared shaping to one surface's shape.
 */
type ShapeEntry =
  | { kind: "future"; id: string }
  | { kind: "past"; id: string }
  /** A kind that recorded nothing — the gedu feed's pre-epoch gap. */
  | { kind: "no_record"; id: string };

const future = (id: string): ShapeEntry => ({ kind: "future", id });
const past = (id: string): ShapeEntry => ({ kind: "past", id });
const noRecord = (id: string): ShapeEntry => ({ kind: "no_record", id });

describe("partitionFeedEntries", () => {
  it("reads the next session off position — the last of the leading future run", () => {
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      future("f3"),
      future("f2"),
      future("f1"),
      past("p1"),
      noRecord("p2"),
    ]);
    expect(laterFuture.map((e) => e.id)).toEqual(["f3", "f2"]);
    expect(nextSession?.id).toBe("f1");
    expect(pastRows.map((e) => e.id)).toEqual(["p1", "p2"]);
  });

  it("has no later block when only one session is ahead", () => {
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      future("f1"),
      past("p1"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession?.id).toBe("f1");
    expect(pastRows.map((e) => e.id)).toEqual(["p1"]);
  });

  it("returns no next session for a feed whose schedule has run out", () => {
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      past("p1"),
      noRecord("p2"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession).toBeNull();
    expect(pastRows).toHaveLength(2);
  });

  it("leaves a stray out-of-order future entry in the past block", () => {
    // The feed sorts nothing, so a caller's ordering bug must render in the
    // order it was given rather than being silently reshuffled.
    const { laterFuture, nextSession, past: pastRows } = partitionFeedEntries([
      future("f1"),
      past("p1"),
      future("stray"),
    ]);
    expect(laterFuture).toEqual([]);
    expect(nextSession?.id).toBe("f1");
    expect(pastRows.map((e) => e.id)).toEqual(["p1", "stray"]);
  });

  it("is empty all round for an empty feed", () => {
    expect(partitionFeedEntries([])).toEqual({
      laterFuture: [],
      nextSession: null,
      past: [],
    });
  });
});

/**
 * The one report a workspace feed renders in full. It is what the weekly loop
 * opens the page for — what happened last time — so it costs no click, and
 * everything older keeps its clamp so a term of write-ups never becomes a wall.
 *
 * The rule is **positional**, and that is the part worth pinning: nothing about
 * the report's own length or shape may enter into it, or two feeds that differ
 * only in how chatty last week's gedu was would behave differently. Which is
 * also why the entries here carry no report at all.
 */
describe("newestPastEntryId", () => {
  it("names the first recorded session in the past run", () => {
    expect(newestPastEntryId([past("p1"), past("p2")])).toBe("p1");
  });

  it("steps over the kinds that recorded nothing", () => {
    expect(newestPastEntryId([noRecord("n1"), noRecord("n2"), past("p1")])).toBe(
      "p1",
    );
  });

  it("names nothing for a feed with no past at all", () => {
    expect(newestPastEntryId([])).toBeNull();
    expect(newestPastEntryId([noRecord("n1")])).toBeNull();
  });

  it("moves to the new top when an older chunk is revealed beneath it", () => {
    // The past grows downward as chunks are revealed, so the exemption must
    // stay pinned to the head of the run rather than to a fixed index.
    const head = past("p1");
    expect(newestPastEntryId([head])).toBe("p1");
    expect(newestPastEntryId([head, past("p2"), past("p3")])).toBe("p1");
  });
});

describe("pastEntryWindow", () => {
  it("opens on the recent slice and reports the rest as remaining", () => {
    const total = 55;
    expect(pastEntryWindow(total, 0)).toEqual({
      visible: FEED_INITIAL_PAST_ENTRIES,
      remaining: total - FEED_INITIAL_PAST_ENTRIES,
    });
  });

  it("reveals one chunk per click, cumulatively", () => {
    const total = 55;
    expect(pastEntryWindow(total, 1).visible).toBe(
      FEED_INITIAL_PAST_ENTRIES + FEED_PAST_CHUNK_SIZE,
    );
    expect(pastEntryWindow(total, 2).visible).toBe(
      FEED_INITIAL_PAST_ENTRIES + 2 * FEED_PAST_CHUNK_SIZE,
    );
  });

  it("never exceeds the total, and reaches zero remaining", () => {
    const total = 12;
    expect(pastEntryWindow(total, 1)).toEqual({ visible: 12, remaining: 0 });
    expect(pastEntryWindow(total, 99)).toEqual({ visible: 12, remaining: 0 });
  });

  it("hides the control for a term short enough to render whole", () => {
    expect(pastEntryWindow(FEED_INITIAL_PAST_ENTRIES, 0).remaining).toBe(0);
    expect(pastEntryWindow(3, 0)).toEqual({ visible: 3, remaining: 0 });
    expect(pastEntryWindow(0, 0)).toEqual({ visible: 0, remaining: 0 });
  });
});
