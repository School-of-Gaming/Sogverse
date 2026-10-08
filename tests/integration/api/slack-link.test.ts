import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/slack/link/route";

/**
 * The `/link-slack` page's confirm button: an admin spending the token the
 * Slack link command minted, on their own session. The database function does
 * the hashing, the role check, the single use and the expiry; what is pinned
 * here is the gate, that the raw token reaches the function on the caller's
 * own client, and that each refusal arrives as the code the page explains.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRpc = vi.fn();

function signedInAsAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: { rpc: mockRpc },
  });
}

function linkRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/slack/link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockRpc.mockResolvedValue({ data: "kyle.sog", error: null });
});

describe("POST /api/slack/link", () => {
  it("refuses a signed-out caller without spending anything", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(linkRequest({ token: "t" }));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("is gated to admins alone", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const response = await POST(linkRequest({ token: "t" }));

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith(["admin"], expect.anything());
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a body without a token", async () => {
    signedInAsAdmin();

    for (const body of [{}, { token: "" }, { token: 42 }]) {
      const response = await POST(linkRequest(body));
      expect(response.status).toBe(400);
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("spends the raw token on the caller's own session and names the linked account", async () => {
    signedInAsAdmin();

    const response = await POST(linkRequest({ token: "raw-token" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slackUsername: "kyle.sog" });
    expect(mockRpc).toHaveBeenCalledWith("consume_slack_link_token", { p_token: "raw-token" });
  });

  it("answers an unknown or used token 404 with its code", async () => {
    signedInAsAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0032", message: "SLACK_LINK_TOKEN_NOT_FOUND" },
    });

    const response = await POST(linkRequest({ token: "raw-token" }));

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("SLACK_LINK_TOKEN_NOT_FOUND");
  });

  it("answers an expired token 410 with its code", async () => {
    signedInAsAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "P0033", message: "SLACK_LINK_TOKEN_EXPIRED" },
    });

    const response = await POST(linkRequest({ token: "raw-token" }));

    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("SLACK_LINK_TOKEN_EXPIRED");
  });

  it("answers the function's role refusal as forbidden", async () => {
    signedInAsAdmin();
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "admin only" } });

    const response = await POST(linkRequest({ token: "raw-token" }));

    expect(response.status).toBe(403);
  });
});
