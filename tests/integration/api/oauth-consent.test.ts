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

/** The headers a browser sends with the consent page's own fetch. */
const SAME_ORIGIN_HEADERS = {
  Host: "localhost:3000",
  Origin: "http://localhost:3000",
  "Sec-Fetch-Site": "same-origin",
};

function consentRequest(
  body: unknown,
  browserHeaders: Record<string, string> = SAME_ORIGIN_HEADERS,
) {
  return new Request("http://localhost:3000/api/oauth/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...browserHeaders },
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

  describe("refuses a request the browser does not vouch for as same-origin", () => {
    const APPROVE = { authorizationId: "auth-1", decision: "approve" };

    it.each([
      [
        "another site",
        { Host: "localhost:3000", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      ],
      [
        "a same-site but not same-origin page",
        { Host: "localhost:3000", "Sec-Fetch-Site": "same-site" },
      ],
      ["a foreign Origin with no Sec-Fetch-Site", { Host: "localhost:3000", Origin: "https://evil.example" }],
      ["an opaque Origin", { Host: "localhost:3000", Origin: "null" }],
      ["a cross-site Sec-Fetch-Site with no Origin", { Host: "localhost:3000", "Sec-Fetch-Site": "cross-site" }],
      ["neither header", { Host: "localhost:3000" }],
    ])("from %s, before the session is read", async (_label, headers) => {
      mockAdmin();

      const response = await POST(consentRequest(APPROVE, headers));

      expect(response.status).toBe(403);
      expect(mockRequireRole).not.toHaveBeenCalled();
      expect(mockApprove).not.toHaveBeenCalled();
    });

    it.each([
      ["Origin alone", { Host: "localhost:3000", Origin: "http://localhost:3000" }],
      ["Sec-Fetch-Site alone", { Host: "localhost:3000", "Sec-Fetch-Site": "same-origin" }],
    ])("but takes %s when it says same-origin", async (_label, headers) => {
      mockAdmin();
      mockApprove.mockResolvedValue({ data: { redirect_url: CALLBACK }, error: null });

      const response = await POST(consentRequest(APPROVE, headers));

      expect(response.status).toBe(200);
    });
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
