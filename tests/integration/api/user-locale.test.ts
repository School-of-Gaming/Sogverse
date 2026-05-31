import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/user/locale/route";

// --- Mocks ---

const mockGetUser = vi.fn();

// The route reads identity via the getClaims-backed `getUser()` server helper.
vi.mock("@/lib/supabase/server", () => ({
  getUser: () => mockGetUser(),
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
  return new Request("http://localhost:3000/api/user/locale", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuthenticated(userId = "user-123") {
  mockGetUser.mockResolvedValue({ id: userId, email: "user@example.com" });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue(null);
}

// --- Tests ---

describe("PATCH /api/user/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpdate.mockReturnValue({ eq: mockAdminEq });
    mockAdminEq.mockResolvedValue({ data: null, error: null });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(createRequest({ locale: "fi" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  // -- Validation --

  it("should return 400 for unsupported locale", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ locale: "de" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid locale");
  });

  it("should return 400 for missing locale", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid locale");
  });

  // -- Happy path --

  it("should update locale and return it", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ locale: "fi" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.locale).toBe("fi");
    expect(mockAdminUpdate).toHaveBeenCalledWith({ locale: "fi" });
    expect(mockAdminEq).toHaveBeenCalledWith("id", "user-123");
  });

  it("should accept all supported locales", async () => {
    for (const locale of ["en", "fi", "sv", "tlh"]) {
      vi.clearAllMocks();
      mockAdminUpdate.mockReturnValue({ eq: mockAdminEq });
      mockAdminEq.mockResolvedValue({ data: null, error: null });
      mockAuthenticated();

      const response = await PATCH(createRequest({ locale }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.locale).toBe(locale);
    }
  });

  // -- DB error --

  it("should return 500 when database update fails", async () => {
    mockAuthenticated();
    mockAdminEq.mockResolvedValue({
      data: null,
      error: { message: "connection error", code: "PGRST301" },
    });

    const response = await PATCH(createRequest({ locale: "sv" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update locale");
  });

  // -- Security: uses authenticated user ID, not request body --

  it("should use the authenticated user ID for the update", async () => {
    mockAuthenticated("actual-session-user-id");

    await PATCH(createRequest({ locale: "en" }));

    expect(mockAdminEq).toHaveBeenCalledWith("id", "actual-session-user-id");
  });
});
