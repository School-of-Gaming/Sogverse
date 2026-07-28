import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/user/locale/route";

// --- Mocks ---

// The route builds one server client and uses it for both halves: `getClaims()`
// for identity and `.from("profiles").update()` for the write. The write is a
// Model B write — `profiles.locale` carries a column-level UPDATE grant and the
// users_update_own_profile policy scopes it to auth.uid() — so there is no admin
// client in this route to mock any more.
const mockGetClaims = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getClaims: () => mockGetClaims() },
      from: () => ({ update: mockUpdate }),
    }),
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
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: userId, email: "user@example.com" } },
    error: null,
  });
}

function mockUnauthenticated() {
  mockGetClaims.mockResolvedValue({ data: null, error: null });
}

// --- Tests ---

describe("PATCH /api/user/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ data: null, error: null });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(createRequest({ locale: "fi" }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should return 401 when the token fails verification", async () => {
    mockGetClaims.mockResolvedValue({
      data: null,
      error: { message: "invalid JWT" },
    });

    const response = await PATCH(createRequest({ locale: "fi" }));

    expect(response.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -- Validation --

  // The hand-rolled `isSupportedLocale` check is now a body schema, so the 400
  // names the offending field the way every other schema-validated route does.
  it("should return 400 for unsupported locale", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ locale: "de" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("locale");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should return 400 for missing locale", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("locale");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("should update locale and return it", async () => {
    mockAuthenticated();

    const response = await PATCH(createRequest({ locale: "fi" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.locale).toBe("fi");
    expect(mockUpdate).toHaveBeenCalledWith({ locale: "fi" });
    expect(mockEq).toHaveBeenCalledWith("id", "user-123");
  });

  it("should accept all supported locales", async () => {
    for (const locale of ["en", "fi", "sv", "tlh"]) {
      vi.clearAllMocks();
      mockUpdate.mockReturnValue({ eq: mockEq });
      mockEq.mockResolvedValue({ data: null, error: null });
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
    mockEq.mockResolvedValue({
      data: null,
      error: { message: "connection error", code: "PGRST301" },
    });

    const response = await PATCH(createRequest({ locale: "sv" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    // The driver's message goes to the log, not to the client — this route
    // never opted into disclosure.
    expect(data.error).toBe("Internal server error");
  });

  it("should return 403 when the database refuses the write", async () => {
    // Only reachable if the grant or the self-update policy were changed under
    // the route's feet — but "the DB said no" must not read as "we broke".
    mockAuthenticated();
    mockEq.mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });

    const response = await PATCH(createRequest({ locale: "sv" }));

    expect(response.status).toBe(403);
  });

  // -- Security: uses authenticated user ID, not request body --

  it("should use the authenticated user ID for the update", async () => {
    mockAuthenticated("actual-session-user-id");

    await PATCH(createRequest({ locale: "en" }));

    expect(mockEq).toHaveBeenCalledWith("id", "actual-session-user-id");
  });
});
