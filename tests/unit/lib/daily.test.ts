import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildUserName,
  createMeetingToken,
  DailyApiError,
  getOrCreateDailyRoom,
  groupVoiceRoomName,
  isDailyDuplicateRoomError,
} from "@/lib/daily";

describe("buildUserName", () => {
  it("encodes userId|role|displayName with no game slots when no platform is passed", () => {
    expect(
      buildUserName({ userId: "u1", role: "gamer", displayName: "Kid" }),
    ).toBe("u1|gamer|Kid");
  });

  it("appends all three game slots for a verified Minecraft identity", () => {
    expect(
      buildUserName({
        userId: "u1",
        role: "gamer",
        displayName: "Kid",
        gamePlatform: "minecraft",
        gameUsername: "Steve123",
        gameExternalId: "abc-uuid",
      }),
    ).toBe("u1|gamer|Kid|minecraft|Steve123|abc-uuid");
  });

  it("writes a Roblox account id as its decimal string", () => {
    // A Roblox key is an int64 where a Mojang key is a UUID string. One slot
    // carries both, as text; parseUserName turns this one back into a number.
    expect(
      buildUserName({
        userId: "u1",
        role: "gamer",
        displayName: "Kid",
        gamePlatform: "roblox",
        gameUsername: "BuilderKid",
        gameExternalId: 1583920471,
      }),
    ).toBe("u1|gamer|Kid|roblox|BuilderKid|1583920471");
  });

  it("emits empty (but present) identity slots when the fields are null", () => {
    // A platform with null fields = the room surfaces this identity but the
    // user has no linked account → the client renders "(Unknown)", which
    // requires the slots to exist even though they're empty.
    expect(
      buildUserName({
        userId: "u1",
        role: "gamer",
        displayName: "Kid",
        gamePlatform: "minecraft",
        gameUsername: null,
        gameExternalId: null,
      }),
    ).toBe("u1|gamer|Kid|minecraft||");
  });

  it("emits no slots at all when the platform is null (a topic about no game account)", () => {
    // The platform is the gate, not the identity fields: a product whose topic
    // is about no single game account mints exactly what an instant room does,
    // and the client hides the identity slot rather than showing "(Unknown)".
    expect(
      buildUserName({
        userId: "u1",
        role: "gamer",
        displayName: "Kid",
        gamePlatform: null,
        gameUsername: null,
        gameExternalId: null,
      }),
    ).toBe("u1|gamer|Kid");
  });

  it("strips pipe characters from displayName so a guest can't spoof the role slot", () => {
    // A guest picking the name "Evil|admin|x" must not be able to inject
    // extra pipe-delimited slots and claim the admin role. Cosmetic defense
    // (Daily's is_owner is the real authority), but pinned here.
    expect(
      buildUserName({ userId: "u1", role: "guest", displayName: "Evil|admin|x" }),
    ).toBe("u1|guest|Eviladminx");
  });

  it("strips pipe characters from the game slots too", () => {
    expect(
      buildUserName({
        userId: "u1",
        role: "gamer",
        displayName: "Kid",
        gamePlatform: "minecraft",
        gameUsername: "a|b",
        gameExternalId: "c|d",
      }),
    ).toBe("u1|gamer|Kid|minecraft|ab|cd");
  });
});

describe("groupVoiceRoomName", () => {
  it("formats the timestamp in the product timezone and uses the full group id", () => {
    // 2026-05-27 04:25 UTC → 07:25 in Europe/Helsinki (UTC+3 in May).
    const name = groupVoiceRoomName({
      groupId: "7b2b7676-6452-4812-8e36-55ad5beb249b",
      windowOpensAt: new Date("2026-05-27T04:25:00Z"),
      timezone: "Europe/Helsinki",
    });
    expect(name).toBe("g-7b2b7676-6452-4812-8e36-55ad5beb249b-202605270725");
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
    expect(winter).toBe("g-aaaaaaaa-0000-0000-0000-000000000000-202601151355");
    expect(summer).toBe("g-aaaaaaaa-0000-0000-0000-000000000000-202607151355");
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
  const originalKey = process.env.DAILY_API_KEY;

  beforeEach(() => {
    process.env.DAILY_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.DAILY_API_KEY = originalKey;
  });

  function mockSequence(
    calls: Array<{ status: number; body: unknown }>,
  ): ReturnType<typeof vi.fn<typeof fetch>> {
    const fn = vi.fn<typeof fetch>();
    for (const call of calls) {
      fn.mockResolvedValueOnce(
        new Response(JSON.stringify(call.body), {
          status: call.status,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    vi.stubGlobal("fetch", fn);
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

describe("createMeetingToken — the doubled owner flag", () => {
  const originalKey = process.env.DAILY_API_KEY;

  beforeEach(() => {
    process.env.DAILY_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.DAILY_API_KEY = originalKey;
  });

  /** Mint a token and return the `properties` Daily was actually sent. */
  async function mintedProperties(
    isOwner: boolean,
  ): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ token: "t" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createMeetingToken({
      roomName: "g-x-202605270425",
      isOwner,
      expUnix: 1_800_000_000,
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body;
    return JSON.parse(String(body)).properties;
  }

  // `isOwner` is one caller-facing option that fans out to TWO Daily
  // properties. Asserting the route's argument only proves the route's local
  // variable; these assert the request body Daily actually receives, which is
  // the only place the doubling is visible. A future edit that decouples
  // screen share from ownership has to come through here.
  it("withholds screen share from a non-owner (this is what keeps parents/gamers off it)", async () => {
    const properties = await mintedProperties(false);
    expect(properties.is_owner).toBe(false);
    expect(properties.enable_screenshare).toBe(false);
  });

  it("grants screen share to an owner", async () => {
    const properties = await mintedProperties(true);
    expect(properties.is_owner).toBe(true);
    expect(properties.enable_screenshare).toBe(true);
  });
});
