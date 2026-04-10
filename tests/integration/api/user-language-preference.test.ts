import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/user/language-preference/route";

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
  return new Request("http://localhost:3000/api/user/language-preference", {
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

describe("PATCH /api/user/language-preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminUpdate.mockReturnValue({ eq: mockAdminEq });
    mockAdminEq.mockResolvedValue({ data: null, error: null });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(createRequest({ language: "fi" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  // -- Validation --

  it("should return 400 for unsupported language", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ language: "de" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid language");
  });

  it("should return 400 for missing language", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid language");
  });

  // -- Happy path --

  it("should update language and return it", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ language: "fi" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.language).toBe("fi");
    expect(mockAdminUpdate).toHaveBeenCalledWith({ language_preference: "fi" });
    expect(mockAdminEq).toHaveBeenCalledWith("id", "user-123");
  });

  it("should accept all supported languages", async () => {
    for (const language of ["en", "fi", "sv", "tlh"]) {
      vi.clearAllMocks();
      mockAdminUpdate.mockReturnValue({ eq: mockAdminEq });
      mockAdminEq.mockResolvedValue({ data: null, error: null });
      mockAuthenticated();

      const response = await PATCH(createRequest({ language }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.language).toBe(language);
    }
  });

  // -- DB error --

  it("should return 500 when database update fails", async () => {
    mockAuthenticated();
    mockAdminEq.mockResolvedValue({
      data: null,
      error: { message: "connection error", code: "PGRST301" },
    });

    const response = await PATCH(createRequest({ language: "sv" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to update language preference");
  });

  // -- Security: uses authenticated user ID, not request body --

  it("should use the authenticated user ID for the update", async () => {
    mockAuthenticated("actual-session-user-id");

    await PATCH(createRequest({ language: "en" }));

    expect(mockAdminEq).toHaveBeenCalledWith("id", "actual-session-user-id");
  });
});
