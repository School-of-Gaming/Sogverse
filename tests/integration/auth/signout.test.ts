import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/auth/signout/route";

// --- Mocks ---

const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signOut: mockSignOut },
  })),
}));

// --- Tests ---

describe("POST /api/auth/signout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls signOut and returns success", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const response = await POST();

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});

describe("GET /api/auth/signout", () => {
  it("returns 405 Method Not Allowed", async () => {
    const response = await GET();

    expect(response.status).toBe(405);
  });
});
