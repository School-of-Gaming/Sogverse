import { describe, it, expect, vi, beforeEach } from "vitest";

// The sign-out route is deliberately session-mutating-public: clearing a session
// must work even when the session is already unusable, so requiring a valid one
// would strand exactly the callers who need it. What this file pins is that the
// route really does all four parts of a sign-out — drop the Supabase session,
// drop the parent-PIN unlock cookie, drop the switch route's family-session
// marker, and hand back a redirect the browser follows as a full-page GET —
// because a partial sign-out leaves the browser's in-memory Supabase client
// believing it is still signed in.

const mockSignOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve({ auth: { signOut: mockSignOut } }),
}));

const mockCookieDelete = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: mockCookieDelete })),
}));

import { POST } from "@/app/api/auth/signout/route";
import { FAMILY_SESSION_COOKIE_NAME, PIN_COOKIE_NAME } from "@/lib/pin-session";

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

  it("drops the family-session marker so the next session starts unmarked", async () => {
    // The marker is bound to a session_id that is gone by now, so it could not
    // validate for whatever comes next either way — dropping it is what keeps
    // the cookie jar honest rather than what makes the next session `own`.
    await POST(signoutRequest());

    expect(mockCookieDelete).toHaveBeenCalledWith(FAMILY_SESSION_COOKIE_NAME);
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

  describe("the form's `next` field", () => {
    function formSignoutRequest(next: string) {
      return new Request("http://localhost:3000/api/auth/signout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ next }).toString(),
      });
    }

    it("lands on an internal path the form asked for", async () => {
      // The sign-out-to-switch dialog posts `/login`: its point is signing in
      // as someone else, so the home page would be a detour.
      const response = await POST(formSignoutRequest("/login"));

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "http://localhost:3000/login",
      );
    });

    it("falls back to the site root for anything that is not an internal path", async () => {
      // Caller-supplied, so it is an open-redirect surface; every escape the
      // URL parser can spell has to land at home.
      for (const next of [
        "https://evil.example/",
        "//evil.example",
        "/\\evil.example",
      ]) {
        const response = await POST(formSignoutRequest(next));
        expect(response.headers.get("location")).toBe("http://localhost:3000/");
      }
    });

    it("never leaves the request's own origin, whatever the field spells", async () => {
      // `https:/evil.example` (one slash) is the variant string matching loses
      // to. The parser resolves it as a *path* on our own origin, which is the
      // safe reading — it lands somewhere internal, never on another host.
      const response = await POST(formSignoutRequest("https:/evil.example"));

      expect(new URL(response.headers.get("location")!).origin).toBe(
        "http://localhost:3000",
      );
    });

    it("still signs out and lands at home when the body is not a form", async () => {
      const response = await POST(
        new Request("http://localhost:3000/api/auth/signout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      );

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(response.headers.get("location")).toBe("http://localhost:3000/");
    });
  });
});
