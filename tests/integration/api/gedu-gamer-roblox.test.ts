import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { PATCH } from "@/app/api/gedu/gamers/[gamerId]/roblox/route";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";

/**
 * PATCH /api/gedu/gamers/[gamerId]/roblox — a gedu fixing a group member's
 * Roblox username. The Minecraft twin beside this file is the same edit on the
 * other platform, and the two suites are deliberately the same shape.
 *
 * What this file is responsible for is the *route*: the role gate, the shape of
 * the path parameter, the Roblox round trip, and what reaches the RPC. It is
 * deliberately NOT responsible for whether the caller may touch this particular
 * child — that authorization lives in `set_group_member_roblox`, which
 * re-derives the caller from `auth.uid()`, and is proved against a real database
 * in the db suite. Asserting it here against a mocked client would only prove
 * the mock returns what it was told to.
 *
 * Two decisions are worth pinning, and both are about the account id rather than
 * the name. A confirmed account is sent as `p_roblox_user_id`, so the edit lands
 * VERIFIED. An unconfirmed one **omits the argument entirely** rather than
 * passing a stand-in number: every Roblox id is a positive int64, so there is no
 * value that could mean "not verified", and the RPC's own default is SQL NULL.
 *
 * The third is that the name stored is the name that was sent. The row already
 * adopted the canonical casing before committing, so a route rewriting it would
 * make the stored value depend on when the lookup last ran.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockLookupRobloxUser = vi.fn();
vi.mock("@/lib/roblox", () => ({
  lookupRobloxUser: (...args: unknown[]) => mockLookupRobloxUser(...args),
  // The contracts module the route imports its schemas from also reads this
  // constant off the same module, for a query schema this route never touches.
  // Mocking the module wholesale takes it out with everything else, so it is
  // restated here to keep that import resolvable.
  ROBLOX_THUMBNAIL_BATCH_MAX: 100,
}));

const GAMER_ID = "11111111-2222-3333-4444-555555555555";
const ROBLOX_USER_ID = 1583920471;

const mockRpc = vi.fn();

function createRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000/api/gedu/gamers/${GAMER_ID}/roblox`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

function mockRpcSuccess(username: string | null, userId: number | null) {
  mockRpc.mockResolvedValue({
    data: {
      participant_id: GAMER_ID,
      roblox_username: username,
      roblox_user_id: userId,
    },
    error: null,
  });
}

describe("PATCH /api/gedu/gamers/[gamerId]/roblox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await PATCH(
      createRequest({ robloxUsername: "builderman" }),
      routeContext(),
    );

    expect(response.status).toBe(401);
  });

  it("gates on the gedu role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await PATCH(
      createRequest({ robloxUsername: "builderman" }),
      routeContext(),
    );

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("gedu", expect.any(Object));
  });

  /**
   * **The decision, on a gedu's edit: no handle is refused for its shape.** Two
   * underscores, or a space, was a 400 here once — on the strength of Roblox's
   * *current* signup validator, which is younger than the accounts it judges. A
   * gedu correcting a child's real handle was told it could not exist. Now it
   * goes to Roblox, and a miss is stored unverified.
   */
  it.each([
    ["two underscores", "a_b_c"],
    ["a space", "Old Timer"],
  ])("stores a handle with %s, unverified", async (_label, username) => {
    mockAuthenticatedGedu();
    mockLookupRobloxUser.mockResolvedValue(null);
    mockRpcSuccess(username, null);

    const response = await PATCH(
      createRequest({ robloxUsername: username }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockLookupRobloxUser).toHaveBeenCalledWith(username);
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_roblox", {
      p_participant_id: GAMER_ID,
      p_roblox_username: username,
    });
    expect(data.roblox_username).toBe(username);
    expect(data.roblox_user_id).toBeNull();
  });

  // The one refusal left: a bound on our own request, not a claim about handles.
  it("rejects a Roblox username past the length bound", async () => {
    mockAuthenticatedGedu();

    const response = await PATCH(
      createRequest({ robloxUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1) }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockLookupRobloxUser).not.toHaveBeenCalled();
  });

  it("rejects a gamer id that is not a uuid", async () => {
    mockAuthenticatedGedu();

    const response = await PATCH(
      createRequest({ robloxUsername: "builderman" }),
      routeContext("not-a-uuid"),
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("stores the name it was sent with the id it looked up, so the edit lands verified", async () => {
    mockAuthenticatedGedu();
    // Roblox answers with the canonical casing, which the route deliberately
    // does NOT adopt: the row already settled the spelling before committing,
    // and only the account id comes from this lookup.
    mockLookupRobloxUser.mockResolvedValue({
      username: "Builderman",
      userId: ROBLOX_USER_ID,
      displayName: "builderman",
    });
    mockRpcSuccess("builderman", ROBLOX_USER_ID);

    const response = await PATCH(
      createRequest({ robloxUsername: "builderman" }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_roblox", {
      p_participant_id: GAMER_ID,
      p_roblox_username: "builderman",
      p_roblox_user_id: ROBLOX_USER_ID,
    });
    expect(data.roblox_username).toBe("builderman");
    expect(data.roblox_user_id).toBe(ROBLOX_USER_ID);
  });

  it("saves a name Roblox does not know, omitting the id argument entirely", async () => {
    mockAuthenticatedGedu();
    mockLookupRobloxUser.mockResolvedValue(null);
    mockRpcSuccess("unknown_player", null);

    const response = await PATCH(
      createRequest({ robloxUsername: "unknown_player" }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    // The id argument is absent rather than null or zero — the RPC defaults it,
    // and no integer could stand in for "not verified".
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_roblox", {
      p_participant_id: GAMER_ID,
      p_roblox_username: "unknown_player",
    });
    expect(data.roblox_username).toBe("unknown_player");
    expect(data.roblox_user_id).toBeNull();
  });

  it("clears both columns without asking Roblox anything", async () => {
    mockAuthenticatedGedu();
    mockRpcSuccess(null, null);

    const response = await PATCH(
      createRequest({ robloxUsername: null }),
      routeContext(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockLookupRobloxUser).not.toHaveBeenCalled();
    // Empty string rather than null: the generated RPC argument types make
    // every text parameter non-null, and the function maps '' back to NULL.
    expect(mockRpc).toHaveBeenCalledWith("set_group_member_roblox", {
      p_participant_id: GAMER_ID,
      p_roblox_username: "",
    });
    expect(data.roblox_username).toBeNull();
    expect(data.roblox_user_id).toBeNull();
  });

  it("surfaces the database's refusal as a 403", async () => {
    // The shape a gedu aiming at a child outside their group actually gets:
    // the RPC raises 42501 and the shared error table turns it into a 403.
    mockAuthenticatedGedu();
    mockLookupRobloxUser.mockResolvedValue({
      username: "builderman",
      userId: ROBLOX_USER_ID,
      displayName: "builderman",
    });
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const response = await PATCH(
      createRequest({ robloxUsername: "builderman" }),
      routeContext(),
    );

    expect(response.status).toBe(403);
  });
});
