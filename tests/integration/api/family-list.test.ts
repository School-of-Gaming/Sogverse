import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// The family-list route is one of the few that legitimately reads past the
// caller's own row-level view: a gamer must be able to see their siblings, and
// RLS restricts them to their own parent link. The service-role read is
// therefore the point, and what this file pins is the boundary around it — the
// role gate, the PIN-gate exemption the profile chooser depends on, and the
// fact that identity is taken from the verified session rather than the request.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminClient = { marker: "admin" };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

const mockResolveFamily = vi.fn();
vi.mock("@/services/family/family.server", () => ({
  resolveFamilyWithAdmin: (...args: unknown[]) => mockResolveFamily(...args),
}));

import { GET } from "@/app/api/family/list/route";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const GAMER_ID = "22222222-2222-2222-2222-222222222222";

const FAMILY = [
  { id: CUSTOMER_ID, role: "customer", first_name: "Pat", sign_in: null },
  { id: GAMER_ID, role: "gamer", first_name: "Robin", sign_in: "username" },
];

function listRequest(): Request {
  return new Request("http://localhost:3000/api/family/list");
}

function mockAuthenticatedAs(
  role: "customer" | "gamer",
  id: string,
  provenance: "own" | "family" = "own",
) {
  mockRequireRole.mockResolvedValue({
    user: { id, session: { id: "session-1", provenance } },
    profile: { id, role },
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );
}

describe("GET /api/family/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveFamily.mockResolvedValue(FAMILY);
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await GET(listRequest());

    expect(response.status).toBe(401);
    expect(mockResolveFamily).not.toHaveBeenCalled();
  });

  it("returns 403 for a role outside the family unit (admin, gedu)", async () => {
    mockForbidden();

    const response = await GET(listRequest());

    expect(response.status).toBe(403);
    expect(mockResolveFamily).not.toHaveBeenCalled();
  });

  it("gates to customer and gamer, and exempts the parent-PIN lock", async () => {
    // allowUnverified is load-bearing: the profile chooser and the lock gate
    // both need this list while the customer session is still locked, so the
    // parent can hand the device to a child without entering the PIN first.
    mockAuthenticatedAs("customer", CUSTOMER_ID);

    await GET(listRequest());

    expect(mockRequireRole).toHaveBeenCalledWith(
      ["customer", "gamer"],
      expect.objectContaining({ allowUnverified: true }),
    );
  });

  // -- Happy path --

  it("returns the resolved family for a parent", async () => {
    mockAuthenticatedAs("customer", CUSTOMER_ID);

    const response = await GET(listRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      family: FAMILY,
      session_provenance: "own",
    });
  });

  it("names the provenance of the caller own session, off the verified JWT", async () => {
    // The switcher reads this to decide what leaving THIS session will cost: a
    // parent PIN from a switched-in session, the target password from one the
    // child signed into. It comes off the gate claims, never the request.
    mockAuthenticatedAs("gamer", GAMER_ID, "family");

    const response = await GET(listRequest());

    expect((await response.json()).session_provenance).toBe("family");
  });

  it("carries each gamer sign-in mode, and null for a customer", async () => {
    // Reachability is what the switcher needs it for: a sibling in `parent`
    // mode holds no password, so from an own session that tile can never be
    // clicked through.
    mockAuthenticatedAs("customer", CUSTOMER_ID);

    const { family } = await (await GET(listRequest())).json();

    expect(family).toEqual([
      expect.objectContaining({ role: "customer", sign_in: null }),
      expect.objectContaining({ role: "gamer", sign_in: "username" }),
    ]);
  });

  it("resolves against the session's identity, never a request parameter", async () => {
    // A gamer reading siblings is the case the service-role client exists for,
    // so the id it is handed has to be the gate-verified one.
    mockAuthenticatedAs("gamer", GAMER_ID);

    await GET(
      new Request("http://localhost:3000/api/family/list?userId=someone-else"),
    );

    expect(mockResolveFamily).toHaveBeenCalledWith(
      mockAdminClient,
      GAMER_ID,
      "gamer",
    );
  });

  // -- Failure --

  it("answers a generic 500 when the resolver fails", async () => {
    mockAuthenticatedAs("customer", CUSTOMER_ID);
    mockResolveFamily.mockRejectedValue(new Error("pg: connection reset"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(listRequest());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Internal server error");
    spy.mockRestore();
  });
});
