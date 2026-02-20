import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/user/currency/route";

// --- Mocks ---

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockAdminUpdate = vi.fn();
const mockAdminEq = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: mockAdminUpdate,
    })),
  })),
}));

// --- Helpers ---

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/user/currency", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(userId = "user-123") {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: "No session" },
  });
}

// --- Tests ---

describe("PATCH /api/user/currency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpdate.mockReturnValue({ eq: mockAdminEq });
    mockAdminEq.mockResolvedValue({ data: null, error: null });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(createRequest({ currency: "usd" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  // -- Validation --

  it("should return 400 for unsupported currency", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ currency: "jpy" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid currency");
  });

  it("should return 400 for uppercase currency", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ currency: "USD" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid currency");
  });

  it("should return 400 for missing currency", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid currency");
  });

  // -- Happy path --

  it("should update currency and return it", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ currency: "gbp" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currency).toBe("gbp");
    expect(mockAdminUpdate).toHaveBeenCalledWith({ currency: "gbp" });
    expect(mockAdminEq).toHaveBeenCalledWith("id", "user-123");
  });

  it("should accept all supported currencies", async () => {
    for (const currency of ["usd", "gbp", "eur"]) {
      vi.clearAllMocks();
      mockAdminUpdate.mockReturnValue({ eq: mockAdminEq });
      mockAdminEq.mockResolvedValue({ data: null, error: null });
      mockAuthenticated();

      const response = await PATCH(createRequest({ currency }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.currency).toBe(currency);
    }
  });

  // -- DB error --

  it("should return 500 when database update fails", async () => {
    mockAuthenticated();
    mockAdminEq.mockResolvedValue({
      data: null,
      error: { message: "connection error", code: "PGRST301" },
    });

    const response = await PATCH(createRequest({ currency: "eur" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update currency");
  });

  // -- Security: uses authenticated user ID, not request body --

  it("should use the authenticated user ID for the update", async () => {
    mockAuthenticated("actual-session-user-id");

    await PATCH(createRequest({ currency: "usd" }));

    expect(mockAdminEq).toHaveBeenCalledWith("id", "actual-session-user-id");
  });
});
