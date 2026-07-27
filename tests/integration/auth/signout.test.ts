import { describe, it, expect, vi, beforeEach } from "vitest";

// The sign-out route is deliberately session-mutating-public: clearing a session
// must work even when the session is already unusable, so requiring a valid one
// would strand exactly the callers who need it. What this file pins is that the
// route really does all three parts of a sign-out — drop the Supabase session,
// drop the parent-PIN unlock cookie, and hand back a redirect the browser
// follows as a full-page GET — because a partial sign-out leaves the browser's
// in-memory Supabase client believing it is still signed in.

const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { signOut: mockSignOut } }),
}));

const mockCookieDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: mockCookieDelete })),
}));

import { POST } from "@/app/api/auth/signout/route";
import { PIN_COOKIE_NAME } from "@/lib/pin-session";

function signoutRequest(url = "http://localhost:3000/api/auth/signout") {
  return new Request(url, { method: "POST" });
}

describe("POST /api/auth/signout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("is reachable with no session at all", async () => {
    const response = await POST(signoutRequest());

    expect(response.status).toBe(303);
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("clears the Supabase session server-side", async () => {
    await POST(signoutRequest());

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("drops the parent-PIN unlock cookie so the next session starts locked", async () => {
    await POST(signoutRequest());

    expect(mockCookieDelete).toHaveBeenCalledWith(PIN_COOKIE_NAME);
  });

  it("answers a 303 to the site root, which the browser follows as a GET", async () => {
    // 303 specifically: it is what turns the POST into a full-page GET, and the
    // full-page load is what rebuilds the browser's Supabase client. A soft
    // navigation would leave a stale client thinking the user is signed in.
    const response = await POST(signoutRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("redirects within the request's own origin", async () => {
    const response = await POST(
      signoutRequest("https://app.example.test/api/auth/signout"),
    );

    expect(response.headers.get("location")).toBe("https://app.example.test/");
  });
});
