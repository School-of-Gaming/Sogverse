import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { PATCH } from "@/app/api/gedu/gamers/[gamerId]/minecraft/route";

/**
 * PATCH /api/gedu/gamers/[gamerId]/minecraft — a gedu fixing a group member's
 * Minecraft username.
 *
 * What this file is responsible for is the *route*: the role gate, the shape of
 * the path parameter, the Mojang round trip, and what reaches the RPC. It is
 * deliberately NOT responsible for whether the caller may touch this particular
 * child — that authorization lives in `set_group_member_minecraft`, which
 * re-derives the caller from `auth.uid()`, and is proved against a real
 * database in tests/db/gedu-session-feed.test.ts. Asserting it here against a
 * mocked client would only prove the mock returns what it was told to.
 *
 * The behaviour worth pinning is the one decision (15) turns on: a successful
 * edit lands VERIFIED. The route sends the canonical name Mojang returned
 * together with its UUID, rather than the string that was typed — which is what
 * separates this from the mock's original null-the-uuid behaviour.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  isValidMinecraftUsername: (username: string) =>
    /^[a-zA-Z0-9_]{3,16}$/.test(username),
}));

const GAMER_ID = "11111111-2222-3333-4444-555555555555";

const mockRpc = vi.fn();

function createRequest(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost:3000/api/gedu/gamers/${GAMER_ID}/minecraft`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

/** Next.js's second handler argument for a dynamic route. */
function routeContext(gamerId: string = GAMER_ID) {
  return { params: Promise.resolve({ gamerId }) };
}

function mockAuthenticatedGedu() {
  mockRequireRole.mockResolvedValue({
    user: { id: "gedu-1" },
    profile: { role: "gedu" },
    supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
  });
}

function mockRpcSuccess(
  username: string | null,
  uuid: string | null,
) {
  mockRpc.mockResolvedValue({
    data: {
      gamer_id: GAMER_ID,
      minecraft_username: username,
      minecraft_uuid: uuid,
    },
    error: null,
  });
}

describe("PATCH /api/gedu/gamers/[gamerId]/minecraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(
      createRequest({ minecraftUsername: "Notch" }),
      routeContext(),
    );

    expect(response.status).toBe(401);
  });

  it("gates on the gedu role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await PATCH(
      createRequest({ minecraftUsername: "Notch" }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("gedu", expect.any(Object));
  });

  it("rejects a malformed Minecraft username", async () => {
    mockAuthenticatedGedu();

    const response = await PATCH(
      createRequest({ minecraftUsername: "ab" }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a gamer id that is not a uuid", async () => {
    mockAuthenticatedGedu();

    const response = await PATCH(
      createRequest({ minecraftUsername: "Notch" }),
      routeContext("not-a-uuid"),
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("stores the canonical name and the UUID together, so the edit lands verified", async () => {
    mockAuthenticatedGedu();
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    mockRpcSuccess("Notch", "069a79f4-44e9-4726-a5be-fca90e38aaf5");

    // Typed in the wrong case on purpose: Mojang's spelling is what should
    // reach the database, because the roster row and the skin beside it read
    // from the same value.
    const response = await PATCH(
      createRequest({ minecraftUsername: "notch" }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_minecraft", {
      p_gamer_id: GAMER_ID,
      p_minecraft_username: "Notch",
      p_minecraft_uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    expect(data.minecraft_username).toBe("Notch");
    expect(data.minecraft_uuid).toBe("069a79f4-44e9-4726-a5be-fca90e38aaf5");
  });

  it("saves a name Mojang does not know, with no uuid", async () => {
    mockAuthenticatedGedu();
    mockLookupMinecraftUser.mockResolvedValue(null);
    mockRpcSuccess("unknown_player", null);

    const response = await PATCH(
      createRequest({ minecraftUsername: "unknown_player" }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    // Empty string rather than null: the generated RPC argument types make
    // every text parameter non-null, and the function maps '' back to NULL.
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_minecraft", {
      p_gamer_id: GAMER_ID,
      p_minecraft_username: "unknown_player",
      p_minecraft_uuid: "",
    });
    expect(data.minecraft_uuid).toBeNull();
  });

  it("clears both columns without asking Mojang anything", async () => {
    mockAuthenticatedGedu();
    mockRpcSuccess(null, null);

    const response = await PATCH(
      createRequest({ minecraftUsername: null }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_minecraft", {
      p_gamer_id: GAMER_ID,
      p_minecraft_username: "",
      p_minecraft_uuid: "",
    });
    expect(data.minecraft_username).toBeNull();
    expect(data.minecraft_uuid).toBeNull();
  });

  it("surfaces the database's refusal as a 403", async () => {
    // The shape a gedu aiming at a child outside their group actually gets:
    // the RPC raises 42501 and the shared error table turns it into a 403.
    mockAuthenticatedGedu();
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "069a79f4-44e9-4726-a5be-fca90e38aaf5",
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const response = await PATCH(
      createRequest({ minecraftUsername: "Notch" }),
      routeContext(),
    );

    expect(response.status).toBe(403);
  });
});
