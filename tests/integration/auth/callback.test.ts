import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/auth/callback/route";
import { createMockUser } from "../../mocks/auth";

// --- Mocks ---

const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();
const mockProfileQuery = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockProfileQuery,
        })),
      })),
    })),
  })),
}));

// --- Helpers ---

function createCallbackRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/auth/callback");
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  return new Request(url.toString());
}

function getRedirectUrl(response: Response): URL {
  const location = response.headers.get("location");
  if (!location) throw new Error("No Location header on response");
  return new URL(location);
}

// --- Tests ---

describe("GET /api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to login error when no code param", async () => {
    const response = await GET(createCallbackRequest());

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/login");
    expect(getRedirectUrl(response).searchParams.get("error")).toBe(
      "auth_callback_error"
    );
  });

  it("redirects to login error when exchangeCodeForSession fails", async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      error: { message: "Invalid code" },
    });

    const response = await GET(
      createCallbackRequest({ code: "invalid-code" })
    );

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/login");
    expect(getRedirectUrl(response).searchParams.get("error")).toBe(
      "auth_callback_error"
    );
  });

  it("redirects to /parent for customer role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: createMockUser() },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "customer" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/parent");
  });

  it("redirects to /admin for admin role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: createMockUser() },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "admin" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/admin");
  });

  it("redirects to /gedu for gedu role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: createMockUser() },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "gedu" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/gedu");
  });

  it("redirects to /gamer for gamer role", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: createMockUser() },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "gamer" },
      error: null,
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/gamer");
  });

  it("redirects to /parent when profile is null (fallback)", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: createMockUser() },
    });
    mockProfileQuery.mockResolvedValue({ data: null, error: null });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/parent");
  });

  it("redirects to next param when set", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: createMockUser() },
    });
    mockProfileQuery.mockResolvedValue({
      data: { role: "customer" },
      error: null,
    });

    const response = await GET(
      createCallbackRequest({ code: "valid-code", next: "/some-page" })
    );

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/some-page");
  });

  it("redirects to login error when getUser returns no user", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const response = await GET(createCallbackRequest({ code: "valid-code" }));

    expect(response.status).toBe(307);
    expect(getRedirectUrl(response).pathname).toBe("/login");
    expect(getRedirectUrl(response).searchParams.get("error")).toBe(
      "auth_callback_error"
    );
  });
});
