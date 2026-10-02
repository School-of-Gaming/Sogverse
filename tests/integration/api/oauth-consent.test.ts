import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/oauth/consent/route";

/**
 * The consent page's Allow and Deny: an admin's answer recorded by Supabase on
 * their own session, and the AI app's callback handed back for the browser to
 * leave by.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockApprove = vi.fn();
const mockDeny = vi.fn();

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {
      auth: { oauth: { approveAuthorization: mockApprove, denyAuthorization: mockDeny } },
    },
  });
}

function consentRequest(body: unknown) {
  return new Request("http://localhost:3000/api/oauth/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CALLBACK = "http://127.0.0.1:53123/callback?code=abc&state=xyz";

beforeEach(() => {
  mockRequireRole.mockReset();
  mockApprove.mockReset();
  mockDeny.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/oauth/consent", () => {
  it("refuses a signed-out caller", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(consentRequest({ authorizationId: "a", decision: "approve" }));

    expect(response.status).toBe(401);
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("is gated to admins", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(consentRequest({ authorizationId: "a", decision: "approve" }));

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("admin", expect.anything());
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("refuses a decision that is neither approve nor deny", async () => {
    mockAdmin();

    const response = await POST(consentRequest({ authorizationId: "a", decision: "maybe" }));

    expect(response.status).toBe(400);
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockDeny).not.toHaveBeenCalled();
  });

  it("approves without letting Supabase redirect, and hands back the callback", async () => {
    mockAdmin();
    mockApprove.mockResolvedValue({ data: { redirect_url: CALLBACK }, error: null });

    const response = await POST(consentRequest({ authorizationId: "auth-1", decision: "approve" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectUrl: CALLBACK });
    expect(mockApprove).toHaveBeenCalledWith("auth-1", { skipBrowserRedirect: true });
    expect(mockDeny).not.toHaveBeenCalled();
  });

  it("denies, handing back the callback that carries the refusal", async () => {
    mockAdmin();
    const refusal = "http://127.0.0.1:53123/callback?error=access_denied&state=xyz";
    mockDeny.mockResolvedValue({ data: { redirect_url: refusal }, error: null });

    const response = await POST(consentRequest({ authorizationId: "auth-1", decision: "deny" }));

    expect(await response.json()).toEqual({ redirectUrl: refusal });
    expect(mockDeny).toHaveBeenCalledWith("auth-1", { skipBrowserRedirect: true });
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it("answers an authorization Supabase will no longer take with a 400", async () => {
    mockAdmin();
    mockApprove.mockResolvedValue({
      data: null,
      error: { message: "authorization request cannot be processed", status: 400 },
    });

    const response = await POST(consentRequest({ authorizationId: "auth-1", decision: "approve" }));

    expect(response.status).toBe(400);
  });

  it("never hands the browser a script URL, whatever Supabase answers", async () => {
    mockAdmin();
    mockApprove.mockResolvedValue({
      data: { redirect_url: "javascript://x/%0aalert(1)" },
      error: null,
    });

    const response = await POST(consentRequest({ authorizationId: "auth-1", decision: "approve" }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("javascript");
  });
});
