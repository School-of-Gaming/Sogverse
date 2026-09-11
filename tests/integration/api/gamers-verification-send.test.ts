import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * The parent's resend button, for the one child who cannot press one of their
 * own: a gamer in sign-in mode `email` has no password until the address is
 * verified, so they cannot sign in to ask for the link themselves.
 *
 * Three things this route owns and nothing else does — the ownership check, the
 * mode check, and the child-keyed rate limit — plus the one property that makes
 * it different from every other send in the codebase: **the send is the outcome
 * here**, so its failure is the answer rather than a logged shrug.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  })),
}));

const mockSendGamerWelcomeEmail = vi.fn();
vi.mock("@/lib/gamer-welcome.server", () => ({
  sendGamerWelcomeEmail: (...args: unknown[]) => mockSendGamerWelcomeEmail(...args),
}));

import { POST } from "@/app/api/gamers/[id]/verification/send/route";

const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const GAMER_ID = "22222222-2222-4222-8222-222222222222";

const mockUserFrom = vi.fn();
const mockRpc = vi.fn();

function mockAuthenticated() {
  mockRequireRole.mockResolvedValue({
    user: { id: PARENT_ID, session: { id: "s1", provenance: "own" } },
    profile: { id: PARENT_ID, role: "customer" },
    supabase: {
      from: (...args: unknown[]) => mockUserFrom(...args),
      rpc: (...args: unknown[]) => mockRpc(...args),
    },
  });
}

/** The parent_gamer link, read on the caller's own RLS-bound client. */
function mockLink(found: boolean) {
  mockUserFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: found ? { id: "link-1" } : null, error: null }),
        }),
      }),
    }),
  });
}

function mockAdmin(signIn: "parent" | "username" | "email" | null) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "gamer_profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue({
                data: signIn === null ? null : { sign_in: signIn },
                error: null,
              }),
          }),
        }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi
            .fn()
            .mockResolvedValue({ data: { first_name: "Marja" }, error: null }),
        }),
      }),
    };
  });
}

function createRequest(): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(
      `http://localhost:3000/api/gamers/${GAMER_ID}/verification/send`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: GAMER_ID }) },
  ];
}

describe("POST /api/gamers/[id]/verification/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticated();
    mockLink(true);
    mockAdmin("email");
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockSendGamerWelcomeEmail.mockResolvedValue(undefined);
  });

  it("refuses an unauthenticated caller and sends nothing", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const [req, ctx] = createRequest();
    const response = await POST(req, ctx);

    expect(response.status).toBe(401);
    expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
  });

  it("gates to customers", async () => {
    const [req, ctx] = createRequest();
    await POST(req, ctx);

    const [roles] = mockRequireRole.mock.calls[0];
    expect(roles).toBe("customer");
  });

  it("returns 400 for a path segment that is not a uuid", async () => {
    const request = new Request(
      "http://localhost:3000/api/gamers/not-a-uuid/verification/send",
      { method: "POST" },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
  });

  it("refuses a gamer this caller is not the parent of", async () => {
    mockLink(false);

    const [req, ctx] = createRequest();
    const response = await POST(req, ctx);

    expect(response.status).toBe(403);
    // Refused before the allowance is spent, so this cannot burn another
    // family's rate limit.
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
  });

  it.each(["parent", "username"] as const)(
    "refuses a gamer in %s mode, whose address nobody reads",
    async (mode) => {
      mockAdmin(mode);

      const [req, ctx] = createRequest();
      const response = await POST(req, ctx);

      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
    },
  );

  it("spends the allowance keyed on the CHILD, not on the caller", async () => {
    // A parent of four gets four independent hourly allowances, because the
    // shared mail quota this protects is spent per address.
    const [req, ctx] = createRequest();
    await POST(req, ctx);

    expect(mockRpc).toHaveBeenCalledWith("request_gamer_verification_email", {
      p_gamer_id: GAMER_ID,
    });
  });

  it("answers 429 when the rate limit refuses, and sends nothing", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const [req, ctx] = createRequest();
    const response = await POST(req, ctx);

    expect(response.status).toBe(429);
    expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
  });

  it("sends the mail on the happy path", async () => {
    const [req, ctx] = createRequest();
    const response = await POST(req, ctx);

    expect(response.status).toBe(200);
    expect(mockSendGamerWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ gamerId: GAMER_ID }),
    );
  });

  it("answers 500 when the send fails, because the send IS the outcome", async () => {
    // Unlike the same mail after a creation, which follows an account that
    // already exists: a parent who pressed "send it again" and got a 200 while
    // nothing left the building has been told the opposite of what happened.
    mockSendGamerWelcomeEmail.mockRejectedValue(new Error("brevo is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const [req, ctx] = createRequest();
    const response = await POST(req, ctx);

    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
