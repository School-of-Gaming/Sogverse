import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/auth/signout/route";

// --- Mocks ---

const mockSignOut = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signOut: mockSignOut },
  })),
}));

// --- Tests ---

describe("GET /api/auth/signout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls signOut and redirects to /", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const response = await GET(
      new Request("http://localhost:3000/api/auth/signout")
    );

    expect(mockSignOut).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/");
  });
});
