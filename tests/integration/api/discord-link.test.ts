import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/discord/link/route";

/**
 * The `/link-discord` page's confirm button: a Gedu or an admin spending the
 * token `/link` minted, on their own session. The database function does the
 * hashing, the role check, the single use and the expiry; what is pinned here
 * is the gate, that the raw token reaches the function on the caller's own
 * client, and that each refusal arrives as the code the page explains.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRpc = vi.fn();

function signedInAs(role: string) {
  mockRequireRole.mockResolvedValue({
    user: { id: `${role}-user-id` },
    profile: { role },
    supabase: { rpc: mockRpc },
  });
}

function linkRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/discord/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockRpc.mockResolvedValue({ data: "kyle_sog", error: null });
});

describe("POST /api/discord/link", () => {
  // -- The gate -------------------------------------------------------------

  it("refuses a signed-out caller without spending anything", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(linkRequest({ token: "t" }));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("is gated to admins and Gedus", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(linkRequest({ token: "t" }));

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith(["admin", "gedu"], expect.anything());
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Input ----------------------------------------------------------------

  it("refuses a body without a token", async () => {
    signedInAs("gedu");

    for (const body of [{}, { token: "" }, { token: 42 }]) {
      const response = await POST(linkRequest(body));
      expect(response.status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- The happy path -------------------------------------------------------

  it("spends the raw token on the caller's own session and names the account", async () => {
    signedInAs("gedu");

    const response = await POST(linkRequest({ token: "raw-token" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ discordUsername: "kyle_sog" });
    // The raw token, not a hash: the function hashes it, so the two ends can
    // never disagree on how.
    expect(mockRpc).toHaveBeenCalledWith("consume_discord_link_token", {
      p_token: "raw-token",
    });
  });

  // -- Refusals the page explains ------------------------------------------

  it("answers an unknown or used token with its code", async () => {
    signedInAs("admin");
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0029", message: "DISCORD_LINK_TOKEN_NOT_FOUND" },
    });

    const response = await POST(linkRequest({ token: "used" }));

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("DISCORD_LINK_TOKEN_NOT_FOUND");
  });

  it("answers an expired token with its code", async () => {
    signedInAs("gedu");
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0030", message: "DISCORD_LINK_TOKEN_EXPIRED" },
    });

    const response = await POST(linkRequest({ token: "old" }));

    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("DISCORD_LINK_TOKEN_EXPIRED");
  });

  it("answers the function's own role refusal as a 403 with no code", async () => {
    signedInAs("gedu");
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const response = await POST(linkRequest({ token: "t" }));

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBeUndefined();
  });

  it("answers any other failure as a generic 500, never the database's message", async () => {
    signedInAs("gedu");
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "relation discord_links is broken" },
    });

    const response = await POST(linkRequest({ token: "t" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
