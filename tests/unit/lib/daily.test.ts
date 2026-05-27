import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DailyApiError,
  getOrCreateDailyRoom,
  groupVoiceRoomName,
  isDailyDuplicateRoomError,
} from "@/lib/daily";

describe("groupVoiceRoomName", () => {
  it("formats the timestamp in the product timezone and uses the first 8 chars of the group id", () => {
    // 2026-05-27 04:25 UTC → 07:25 in Europe/Helsinki (UTC+3 in May).
    const name = groupVoiceRoomName({
      groupId: "7b2b7676-6452-4812-8e36-55ad5beb249b",
      windowOpensAt: new Date("2026-05-27T04:25:00Z"),
      timezone: "Europe/Helsinki",
    });
    expect(name).toBe("g-7b2b7676-202605270725");
  });

  it("renders the same wall-clock token across DST transitions", () => {
    // 13:55 local in Helsinki on the same calendar day, once in EET (winter)
    // and once in EEST (summer). The wall-clock identity is what matters
    // for stable room names — different UTC offsets, same name shape.
    const winter = groupVoiceRoomName({
      groupId: "aaaaaaaa-0000-0000-0000-000000000000",
      windowOpensAt: new Date("2026-01-15T11:55:00Z"), // 13:55 Helsinki, EET
      timezone: "Europe/Helsinki",
    });
    const summer = groupVoiceRoomName({
      groupId: "aaaaaaaa-0000-0000-0000-000000000000",
      windowOpensAt: new Date("2026-07-15T10:55:00Z"), // 13:55 Helsinki, EEST
      timezone: "Europe/Helsinki",
    });
    expect(winter).toBe("g-aaaaaaaa-202601151355");
    expect(summer).toBe("g-aaaaaaaa-202607151355");
  });
});

describe("isDailyDuplicateRoomError", () => {
  it("matches Daily's actual response: 400 + 'already exists' in the message", () => {
    // This is the literal shape Daily.co returns when you try to create a
    // room name that already exists — not the 409 you'd expect from a
    // RESTful API. Real example: `a room named g-X-Y already exists`.
    const err = new DailyApiError(400, "a room named g-X-Y already exists");
    expect(isDailyDuplicateRoomError(err)).toBe(true);
  });

  it("matches 409 too in case Daily ever returns the conventional code", () => {
    expect(isDailyDuplicateRoomError(new DailyApiError(409, "Conflict"))).toBe(
      true,
    );
  });

  it("does not match other 400 errors", () => {
    expect(
      isDailyDuplicateRoomError(new DailyApiError(400, "invalid token format")),
    ).toBe(false);
  });

  it("does not match other statuses", () => {
    expect(isDailyDuplicateRoomError(new DailyApiError(500, "Daily down"))).toBe(
      false,
    );
    expect(isDailyDuplicateRoomError(new DailyApiError(404, "Not found"))).toBe(
      false,
    );
  });

  it("does not match non-DailyApiError instances", () => {
    expect(isDailyDuplicateRoomError(new Error("already exists"))).toBe(false);
    expect(isDailyDuplicateRoomError(null)).toBe(false);
    expect(isDailyDuplicateRoomError(undefined)).toBe(false);
  });
});

describe("getOrCreateDailyRoom", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DAILY_API_KEY;

  beforeEach(() => {
    process.env.DAILY_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DAILY_API_KEY = originalKey;
  });

  function mockSequence(
    calls: Array<{ status: number; body: unknown }>,
  ): ReturnType<typeof vi.fn> {
    const fn = vi.fn();
    for (const call of calls) {
      fn.mockResolvedValueOnce(
        new Response(JSON.stringify(call.body), {
          status: call.status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    global.fetch = fn as unknown as typeof global.fetch;
    return fn;
  }

  const ROOM = {
    id: "room-id",
    name: "g-test-202605270425",
    url: "https://test.daily.co/g-test-202605270425",
    privacy: "private",
    created_at: "2026-05-27T04:25:00Z",
  };

  it("returns the existing room without calling POST when GET succeeds", async () => {
    const fetchMock = mockSequence([{ status: 200, body: ROOM }]);

    const result = await getOrCreateDailyRoom({ name: ROOM.name });

    expect(result).toEqual(ROOM);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBeUndefined(); // GET
  });

  it("creates the room when GET returns null (room doesn't exist)", async () => {
    // getDailyRoom swallows all errors and returns null, so the helper
    // can't tell 404 apart from a transient failure here — it just calls
    // POST. If POST then succeeds, that's the happy first-joiner path.
    const fetchMock = mockSequence([
      { status: 404, body: { error: "not-found" } },
      { status: 201, body: ROOM },
    ]);

    const result = await getOrCreateDailyRoom({ name: ROOM.name });

    expect(result).toEqual(ROOM);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
  });

  it("falls through to a re-GET when POST loses a duplicate-name race", async () => {
    // Two simultaneous first-joiners: GET returns null for both, the first
    // POST creates the room, the second POST gets Daily's 400 'already
    // exists' response. The loser falls through to a fresh GET that now
    // sees the room.
    const fetchMock = mockSequence([
      { status: 404, body: { error: "not-found" } },
      {
        status: 400,
        body: {
          error: "invalid-request-error",
          info: `a room named ${ROOM.name} already exists`,
        },
      },
      { status: 200, body: ROOM },
    ]);

    const result = await getOrCreateDailyRoom({ name: ROOM.name });

    expect(result).toEqual(ROOM);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates a real Daily error (not a duplicate race)", async () => {
    const fetchMock = mockSequence([
      { status: 404, body: { error: "not-found" } },
      { status: 500, body: { error: "internal-server-error", info: "boom" } },
    ]);

    await expect(getOrCreateDailyRoom({ name: ROOM.name })).rejects.toThrow(
      DailyApiError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
