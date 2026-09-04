// Both cookies this route mints are HMACs over PIN_COOKIE_SECRET, read lazily
// at mint time — set before the route imports.
process.env.PIN_COOKIE_SECRET = "route-test-switch-account-secret";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/switch-account/route";
import { NextResponse } from "next/server";
import {
  FAMILY_SESSION_COOKIE_NAME,
  PIN_COOKIE_NAME,
  mintFamilySessionToken,
  pinTokenFor,
} from "@/lib/pin-session";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

/**
 * The switch route has two independent authorizations and this file exercises
 * both, because passing one and skipping the other is exactly the bug shape
 * that would ship silently.
 *
 * 1. **Who may be reached** — the family-membership matrix. Unchanged by the
 *    gate work, and still the thing that makes a target id in the body harmless.
 * 2. **What it costs** — the gate, keyed on the caller's role and the provenance
 *    of their session. A parent pays nothing. A gamer in a switched-in (family)
 *    session pays a linked parent's PIN. A gamer in a session they signed into
 *    themselves cannot switch at all: the route refuses with
 *    `SIGN_OUT_REQUIRED`, and no credential in the body changes that.
 *
 * Three properties are asserted over and over on purpose, because they are the
 * ones a refactor breaks quietly: **a failed gate never signs the caller out**,
 * **the unlock cookie is minted on exactly one path**, and **every session this
 * route creates carries the family-session marker**. The third is what the gate
 * above reads: nothing in a token can separate a switch from a password
 * recovery, so the classification is this route's own signature on a session it
 * built.
 */

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
const mockAdminGenerateLink = vi.fn();
const mockAdminGetUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockAdminGenerateLink(...args),
        getUserById: (...args: unknown[]) => mockAdminGetUserById(...args),
      },
    },
  })),
}));

const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();
const mockGetClaims = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: mockSignOut,
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      getClaims: (...args: unknown[]) => mockGetClaims(...args),
    },
  })),
}));

// Two cookies pass through here: the parent-PIN unlock cookie, cleared on most
// paths and minted on exactly one, and the family-session marker, minted on
// every switch this route completes.
const mockCookieDelete = vi.fn();
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: mockCookieDelete,
    set: mockCookieSet,
  })),
}));

// --- Helpers ---

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/auth/switch-account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/**
 * The gate's success shape. `provenance` is the new axis: `family` is a session
 * this route itself created (its `amr` names `otp`), `own` is one opened by
 * typing a password.
 */
function mockAuthenticated(
  role: "customer" | "gamer",
  userId: string,
  provenance: "own" | "family" = "family",
) {
  mockRequireRole.mockResolvedValue({
    user: {
      id: userId,
      session: { id: "caller-session", provenance },
    },
    profile: {
      id: userId,
      role,
      first_name: role === "customer" ? "Parent" : "Gamer",
    },
    supabase: {
      auth: { signOut: mockSignOut },
    },
  });
}

/**
 * A target as the route meets it. `email` is deliberately NOT part of the
 * profile row the route reads: it asks GoTrue for every target's address,
 * gamers included, because `profiles.email` is a copy and a copy is the wrong
 * thing to open a session against. So this field feeds `getUserById`.
 */
type TargetProfile = { id: string; role: string; email: string | null } | null;

/**
 * Configure the admin client to dispatch `from()` calls to per-table mock
 * builders, and to answer the address lookup. The profile lookup always
 * responds the same way, but the parent_gamer chain varies between tests
 * (eq+eq+maybeSingle for direct link checks, in() for sibling checks, eq() for
 * the caller's parent list), so each test passes a builder for it.
 */
function setupAdminFrom(args: {
  target: TargetProfile;
  parentGamerBuilder?: () => Record<string, unknown>;
}) {
  const target = args.target;
  const profileChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        // Only the two columns the route selects. Handing it an `email` here
        // would let a regression that reads the profile copy pass this file.
        maybeSingle: vi.fn().mockResolvedValue(
          target
            ? mockSupabaseSuccess({ id: target.id, role: target.role })
            : mockSupabaseSuccess(null),
        ),
      }),
    }),
  };

  if (target) {
    mockAdminGetUserById.mockResolvedValue({
      data: { user: { id: target.id, email: target.email } },
      error: null,
    });
  }

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "profiles") return profileChain;
    if (table === "parent_gamer") return args.parentGamerBuilder?.() ?? {};
    return {};
  });
}

/** Direct parent_gamer link check: .select('id').eq().eq().maybeSingle() */
function linkLookup(linked: boolean) {
  return () => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue(linked ? mockSupabaseSuccess({ id: "link-1" }) : mockSupabaseSuccess(null)),
        }),
      }),
    }),
  });
}

/**
 * The gamer→parent shape needs both chains from one builder: the membership
 * check (`.eq().eq().maybeSingle()`) and the PIN gate's parent list
 * (`.eq()` resolving to rows). The `eq` mock therefore returns an object that is
 * both thenable and further chainable.
 */
function linkLookupWithParents(linked: boolean, parentIds: string[]) {
  return () => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockImplementation(() => {
        const rows = mockSupabaseSuccess(parentIds.map((id) => ({ parent_id: id })));
        return {
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi
              .fn()
              .mockResolvedValue(
                linked ? mockSupabaseSuccess({ id: "link-1" }) : mockSupabaseSuccess(null),
              ),
          }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
        };
      }),
    }),
  });
}

/** Sibling check: .select('parent_id, gamer_id').in('gamer_id', [...]) */
function siblingLookup(rows: Array<{ parent_id: string; gamer_id: string }>) {
  return () => ({
    select: vi.fn().mockImplementation((columns: string) => {
      if (columns === "parent_id") {
        // The PIN gate's read of the caller's own parents.
        return {
          eq: vi
            .fn()
            .mockResolvedValue(
              mockSupabaseSuccess(
                rows.map((row) => ({ parent_id: row.parent_id })),
              ),
            ),
        };
      }
      return { in: vi.fn().mockResolvedValue(mockSupabaseSuccess(rows)) };
    }),
  });
}

/**
 * An access token shaped the way GoTrue's is: three dot-separated segments
 * whose middle one is base64url JSON. The route reads the new session's id out
 * of this rather than asking the client for its claims — that would be a
 * JWKS-verifying call inside the window between the switch happening and the
 * marker being minted, where a transient failure downgrades a switched-in
 * child to `own`. Unpadded on purpose: real tokens are, so this exercises the
 * route's padding restore.
 */
function accessTokenFor(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

/**
 * The OTP switch succeeding: a link is minted and redeemed. The address it is
 * minted for comes from `setupAdminFrom`, which is where GoTrue's answer lives.
 * The redeemed session names the target and carries the id both cookies are
 * bound to — the two facts the route reads back out of the token.
 */
function mockHappyPathSession(targetId: string, sessionId = "new-session") {
  mockAdminGenerateLink.mockResolvedValue({
    data: { properties: { email_otp: "123456" } },
    error: null,
  });
  mockVerifyOtp.mockResolvedValue({
    data: {
      session: {
        access_token: accessTokenFor({ sub: targetId, session_id: sessionId }),
      },
    },
    error: null,
  });
}

/** The value the family marker must carry: bound to the NEW session, not the caller's. */
function familyMarkerFor(userId: string, sessionId = "new-session") {
  return mintFamilySessionToken(userId, sessionId);
}

// The exact attributes each cookie must be minted with — asserted whole rather
// than sampled, because every one of them is a way to weaken the cookie by
// accident. `secure` follows NODE_ENV (true only in production), so it is
// derived here rather than written as a literal.
const COOKIE_SECURE = process.env.NODE_ENV === "production";

/**
 * A year, and it is the marker's whole expiry story: dropping it would
 * re-classify a switched-in child as self-authenticated and ask their family
 * for a password they may not have, so it has to outlive a browser restart and
 * the `session_id` binding is what actually expires it.
 */
const FAMILY_MARKER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
  maxAge: 365 * 24 * 60 * 60,
};

/**
 * The unlock cookie runs the opposite way — no `maxAge` at all, so quitting the
 * browser re-locks the parent. Asserting the exact object is what keeps a
 * future edit from "harmonising" the two and quietly making a parent's unlock
 * survive for a year.
 */
const UNLOCK_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
};

const PARENT_A = "parent-a";
const PARENT_B = "parent-b";
const GAMER_A1 = "gamer-a1";
const GAMER_A2 = "gamer-a2";
const GAMER_B1 = "gamer-b1";

// --- Tests ---

describe("POST /api/auth/switch-account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOut.mockResolvedValue({ error: null });
    // Answers, so a route that asked would pass rather than crash — and every
    // OTP test asserts it was not asked. The id comes out of the token
    // `verifyOtp` returned; this call is the network hop that must not happen
    // between the switch landing and the marker being minted.
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "someone-else", session_id: "claims-session" } },
      error: null,
    });
  });

  describe("authentication & input validation", () => {
    it("returns 401 when not authenticated", async () => {
      mockRequireRole.mockResolvedValue(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      );

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(401);
    });

    it("returns 403 when caller is admin or gedu (requireRole gates roles)", async () => {
      mockRequireRole.mockResolvedValue(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      );

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(403);
    });

    it("requireRole is called with both customer and gamer roles", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({ target: null });

      await POST(createRequest({ userId: GAMER_A1 }));
      expect(mockRequireRole).toHaveBeenCalledWith(["customer", "gamer"], { allowUnverified: true });
    });

    it("returns 400 when body is invalid JSON", async () => {
      mockAuthenticated("customer", PARENT_A);

      const response = await POST(createRequest("not-json"));
      expect(response.status).toBe(400);
    });

    it("returns 400 when userId is missing", async () => {
      mockAuthenticated("customer", PARENT_A);

      const response = await POST(createRequest({}));
      const data = await response.json();
      expect(response.status).toBe(400);
      // The hand-rolled presence check is now a body schema, so the message is
      // the shared "<field>: <issue>" shape every other route already uses.
      expect(data.error).toContain("userId");
    });

    it("returns 400 when userId is the caller itself", async () => {
      mockAuthenticated("customer", PARENT_A);

      const response = await POST(createRequest({ userId: PARENT_A }));
      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.error).toBe("Cannot switch to yourself");
    });
  });

  describe("target lookup", () => {
    it("returns 403 when target profile does not exist", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({ target: null });

      const response = await POST(createRequest({ userId: "ghost" }));
      expect(response.status).toBe(403);
      // No session mutation
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // The membership matrix — who may be reached at all
  // -------------------------------------------------------------------------

  describe("parent → gamer (ungated)", () => {
    it("allows parent to switch to their own linked gamer with no credential", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", email: "alphaone@gamer.sogverse.internal" },
        parentGamerBuilder: linkLookup(true),
      });
      mockHappyPathSession(GAMER_A1);

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSignOut).toHaveBeenCalledOnce();
      expect(mockAdminGenerateLink).toHaveBeenCalledWith({
        type: "magiclink",
        email: "alphaone@gamer.sogverse.internal",
      });
      // No PIN was asked for and none was checked: handing the device to a
      // child is the gesture this route exists for.
      expect(mockAdminRpc).not.toHaveBeenCalled();
      // Switching INTO a gamer always re-locks.
      expect(mockCookieDelete).toHaveBeenCalledWith(PIN_COOKIE_NAME);
      expect(mockCookieSet).not.toHaveBeenCalledWith(
        PIN_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
      // ...and the child's new session is marked as one this route handed over,
      // which is what makes their way back out cost a parent's PIN. Bound to
      // the NEW session's id and to the CHILD, so nothing else can present it.
      expect(mockCookieSet).toHaveBeenCalledWith(
        FAMILY_SESSION_COOKIE_NAME,
        await familyMarkerFor(GAMER_A1),
        FAMILY_MARKER_COOKIE_OPTIONS,
      );
    });

    it("asks GoTrue for the gamer's address rather than trusting the profile copy", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", email: "alphaone@gamer.sogverse.internal" },
        parentGamerBuilder: linkLookup(true),
      });
      mockHappyPathSession(GAMER_A1);

      await POST(createRequest({ userId: GAMER_A1 }));

      // `profiles.email` is a copy the credential edit writes second, so a
      // failure between the two auth writes and it leaves the profile naming an
      // address the account no longer answers to — and the magic link would be
      // minted for a mailbox that cannot be signed into.
      expect(mockAdminGetUserById).toHaveBeenCalledWith(GAMER_A1);
    });

    it("forbids parent from switching to a different parent's gamer", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_B1, role: "gamer", email: "betaone@gamer.sogverse.internal" },
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: GAMER_B1 }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
    });

    it("forbids parent from switching to another customer", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: PARENT_B, role: "customer", email: "parent-b@example.com" },
        // parent_gamer should not even be checked when target role is wrong;
        // but if it were, configure as not-linked to be safe.
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: PARENT_B }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("forbids parent from switching to admin/gedu account", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: "admin-1", role: "admin", email: "admin-1@example.com" },
      });

      const response = await POST(createRequest({ userId: "admin-1" }));
      expect(response.status).toBe(403);
    });
  });

  describe("membership, from a gamer session", () => {
    it("forbids gamer from switching to an unrelated parent", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: PARENT_B, role: "customer", email: "parent-b@example.com" },
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: PARENT_B, pin: "1234" }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
      // Refused on membership BEFORE the PIN is checked, so this route cannot
      // be used to test PINs against families the caller is not in.
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("forbids sibling switch when gamers belong to different parents", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: GAMER_B1, role: "gamer", email: "betaone@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_B, gamer_id: GAMER_B1 },
        ]),
      });

      const response = await POST(createRequest({ userId: GAMER_B1, pin: "1234" }));
      expect(response.status).toBe(403);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
    });

    it("allows sibling switch when siblings share only one of several parents", async () => {
      mockAuthenticated("gamer", GAMER_A1);
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", email: "alphatwo@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          // GAMER_A1 has both PARENT_A and PARENT_B as parents
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_B, gamer_id: GAMER_A1 },
          // GAMER_A2 only has PARENT_A — still in the family
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
      });
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));
      mockHappyPathSession(GAMER_A2);

      const response = await POST(createRequest({ userId: GAMER_A2, pin: "1234" }));
      expect(response.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // Gate A — a family session pays a linked parent's PIN
  // -------------------------------------------------------------------------

  describe("gamer, family session → the PIN gate", () => {
    function familySessionToParent() {
      mockAuthenticated("gamer", GAMER_A1, "family");
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", email: "parent-a@example.com" },
        parentGamerBuilder: linkLookupWithParents(true, [PARENT_A, PARENT_B]),
      });
      mockHappyPathSession(PARENT_A);
    }

    it("refuses with PIN_REQUIRED when no PIN was sent", async () => {
      familySessionToParent();

      const response = await POST(createRequest({ userId: PARENT_A }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PIN_REQUIRED");
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminRpc).not.toHaveBeenCalled();
    });

    it("refuses with PIN_INVALID, and does NOT sign the caller out", async () => {
      familySessionToParent();
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("invalid"));

      const response = await POST(createRequest({ userId: PARENT_A, pin: "9999" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PIN_INVALID");
      // The property that matters most on this path: a wrong PIN leaves the
      // child exactly where they were rather than stranding them signed out.
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
    });

    it("refuses with PIN_NOT_SET when nobody in the family holds one", async () => {
      familySessionToParent();
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("not_set"));

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      // Distinct from PIN_INVALID on purpose: typing more carefully cannot fix
      // this, and the family is sent to set a PIN instead.
      expect(data.code).toBe("PIN_NOT_SET");
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("checks the PIN against EVERY linked parent, not just one", async () => {
      familySessionToParent();
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));

      await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      expect(mockAdminRpc).toHaveBeenCalledWith("verify_pin_for_any", {
        p_user_ids: [PARENT_A, PARENT_B],
        p_pin: "1234",
      });
    });

    it("switches to the parent on a valid PIN, and mints the unlock cookie", async () => {
      familySessionToParent();
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      expect(response.status).toBe(200);
      expect(mockSignOut).toHaveBeenCalledOnce();
      // The PIN was just checked one step earlier, so the parent lands unlocked
      // rather than being asked for the same four digits twice in one gesture.
      // The token is bound to the NEW session's id, read out of the access
      // token `verifyOtp` returned — and it is minted with no expiry, so
      // quitting the browser re-locks them.
      expect(mockCookieSet).toHaveBeenCalledWith(
        PIN_COOKIE_NAME,
        await pinTokenFor(PARENT_A, "new-session"),
        UNLOCK_COOKIE_OPTIONS,
      );
      expect(mockCookieDelete).not.toHaveBeenCalled();
    });

    it("marks the parent's new session as one this route handed over", async () => {
      familySessionToParent();
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));

      await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      // The marker goes on EVERY session the OTP path creates, without a
      // per-target condition — a condition is a thing that can be got wrong in
      // the one place where getting it wrong hands out the cheaper gate. On a
      // parent target it is inert (only a gamer caller is ever charged for
      // leaving), so narrowing it would buy nothing.
      expect(mockCookieSet).toHaveBeenCalledWith(
        FAMILY_SESSION_COOKIE_NAME,
        await familyMarkerFor(PARENT_A),
        FAMILY_MARKER_COOKIE_OPTIONS,
      );
    });

    it("switches to a sibling on a valid PIN, and CLEARS the unlock cookie", async () => {
      mockAuthenticated("gamer", GAMER_A1, "family");
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", email: "alphatwo@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
      });
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));
      mockHappyPathSession(GAMER_A2);

      const response = await POST(createRequest({ userId: GAMER_A2, pin: "1234" }));

      expect(response.status).toBe(200);
      // Entering a gamer never unlocks anything.
      expect(mockCookieSet).not.toHaveBeenCalledWith(
        PIN_COOKIE_NAME,
        expect.anything(),
        expect.anything(),
      );
      expect(mockCookieDelete).toHaveBeenCalledWith(PIN_COOKIE_NAME);
      // The sibling's session is still one this route handed over, so leaving
      // it costs a PIN in turn.
      expect(mockCookieSet).toHaveBeenCalledWith(
        FAMILY_SESSION_COOKIE_NAME,
        await familyMarkerFor(GAMER_A2),
        FAMILY_MARKER_COOKIE_OPTIONS,
      );
    });
  });

  // -------------------------------------------------------------------------
  // An own session cannot switch at all
  // -------------------------------------------------------------------------

  /**
   * The other half of the gate, and it is a refusal rather than a price. A
   * gamer session opened with the child's own credentials — a school computer
   * they walked away from is the case this is about — is not a session any
   * other family account may be reached from. Charging the target's password
   * instead would have made this endpoint a password oracle aimable at a family
   * member; the way to somebody else's account is the login page.
   *
   * What every case here asserts, beyond the code: the refusal is inert. No
   * sign-out, no link minted, no cookie written or deleted — the child is left
   * holding exactly the session they arrived with.
   */
  describe("gamer, own session → refused, sign out instead", () => {
    function ownSessionToParent() {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", email: "parent-a@example.com" },
        parentGamerBuilder: linkLookup(true),
      });
      mockHappyPathSession(PARENT_A);
    }

    function ownSessionToSibling() {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", email: "alphatwo@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
      });
      mockHappyPathSession(GAMER_A2);
    }

    function expectNothingHappened() {
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockCookieDelete).not.toHaveBeenCalled();
    }

    it("refuses a switch to a linked parent with SIGN_OUT_REQUIRED", async () => {
      ownSessionToParent();

      const response = await POST(createRequest({ userId: PARENT_A }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("SIGN_OUT_REQUIRED");
      expectNothingHappened();
    });

    it("refuses a switch to a sibling with SIGN_OUT_REQUIRED", async () => {
      ownSessionToSibling();

      const response = await POST(createRequest({ userId: GAMER_A2 }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("SIGN_OUT_REQUIRED");
      expectNothingHappened();
    });

    it("refuses even when a PIN is sent — the PIN is not an alternative", async () => {
      ownSessionToParent();

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("SIGN_OUT_REQUIRED");
      // A four-digit PIN with no rate limit is not what should stand between a
      // school computer and a parent's account, so this path never falls back
      // to one — and it does not even ask the PIN RPC whether it would match.
      expectNothingHappened();
    });

    it("refuses on membership first, so it says nothing about accounts outside the family", async () => {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: PARENT_B, role: "customer", email: "parent-b@example.com" },
        parentGamerBuilder: linkLookup(false),
      });

      const response = await POST(createRequest({ userId: PARENT_B }));
      const data = await response.json();

      // The plain 403 an unrelated target always gets — no code at all. An own
      // session learning "that account exists but you'd have to sign out" for
      // an arbitrary id is exactly the probe the matrix runs first to prevent.
      expect(response.status).toBe(403);
      expect(data.code).toBeUndefined();
      expectNothingHappened();
    });
  });

  // -------------------------------------------------------------------------
  // Everything that can go wrong after the gate
  // -------------------------------------------------------------------------

  describe("session mutation failures", () => {
    /**
     * A gamer leaving their own account for a linked parent, PIN accepted — the
     * shape every "what if the new session is wrong" case below starts from,
     * because it is the one switch that mints BOTH cookies and so has the most
     * to lose from a session id read wrongly.
     */
    function switchToParentOnAValidPin() {
      mockAuthenticated("gamer", GAMER_A1, "family");
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", email: "parent-a@example.com" },
        parentGamerBuilder: linkLookupWithParents(true, [PARENT_A]),
      });
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));
      mockHappyPathSession(PARENT_A);
    }

    it("returns 500 when generateLink fails — does NOT sign out the caller", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", email: "alphaone@gamer.sogverse.internal" },
        parentGamerBuilder: linkLookup(true),
      });
      mockAdminGenerateLink.mockResolvedValue({
        data: null,
        error: { message: "boom" },
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(500);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("returns 500 when verifyOtp fails (sign-out was already called)", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", email: "alphaone@gamer.sogverse.internal" },
        parentGamerBuilder: linkLookup(true),
      });
      mockAdminGenerateLink.mockResolvedValue({
        data: { properties: { email_otp: "123456" } },
        error: null,
      });
      mockVerifyOtp.mockResolvedValue({
        data: { session: null },
        error: { message: "OTP invalid" },
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(500);
      expect(mockSignOut).toHaveBeenCalledOnce();
    });

    it("returns 500 when GoTrue holds no address for the target gamer", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", email: null },
        parentGamerBuilder: linkLookup(true),
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      const data = await response.json();
      expect(response.status).toBe(500);
      // A misconfigured account is our problem, not a fact the caller needs
      // spelled out — the detail is logged and the client gets the generic 500.
      expect(data.error).toBe("Internal server error");
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("returns 500 when parent email lookup fails", async () => {
      mockAuthenticated("gamer", GAMER_A1, "family");
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", email: "parent-a@example.com" },
        parentGamerBuilder: linkLookupWithParents(true, [PARENT_A]),
      });
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));
      mockAdminGetUserById.mockResolvedValue({
        data: { user: null },
        error: { message: "User not found" },
      });

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));
      expect(response.status).toBe(500);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("leaves the parent locked when the new session carries no session_id", async () => {
      switchToParentOnAValidPin();
      mockVerifyOtp.mockResolvedValue({
        data: { session: { access_token: accessTokenFor({ sub: PARENT_A }) } },
        error: null,
      });

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      expect(response.status).toBe(200);
      // Worse UX, never a weaker gate, and it holds for both cookies: neither
      // can be bound without a session id, so neither is minted. The parent
      // types the PIN again at the unlock screen, and the unmarked session reads
      // as `own` — the STRONGER of the two switch gates.
      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockCookieDelete).toHaveBeenCalledWith(PIN_COOKIE_NAME);
      expect(mockCookieDelete).toHaveBeenCalledWith(FAMILY_SESSION_COOKIE_NAME);
    });

    it("binds both cookies to the id in the token verifyOtp returned, without asking for claims", async () => {
      switchToParentOnAValidPin();
      // A different id from the one the mocked `getClaims` would answer, so the
      // assertions below can only pass by reading the token.
      mockVerifyOtp.mockResolvedValue({
        data: {
          session: {
            access_token: accessTokenFor({
              sub: PARENT_A,
              session_id: "session-from-the-token",
            }),
          },
        },
        error: null,
      });

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      expect(response.status).toBe(200);
      expect(mockCookieSet).toHaveBeenCalledWith(
        FAMILY_SESSION_COOKIE_NAME,
        await familyMarkerFor(PARENT_A, "session-from-the-token"),
        FAMILY_MARKER_COOKIE_OPTIONS,
      );
      // The point of reading the token rather than the claims: `getClaims`
      // verifies against the project's JWKS, which can reach the network. A
      // transient failure there, in the window after `verifyOtp` has already
      // written the target's cookies, would silently hand a switched-in child
      // an unmarked session — the switch succeeds and the classification is
      // lost. Nothing in this window may leave the process.
      expect(mockGetClaims).not.toHaveBeenCalled();
    });

    it("still succeeds, unmarked, when the new session's token cannot be read", async () => {
      switchToParentOnAValidPin();
      mockVerifyOtp.mockResolvedValue({
        data: { session: { access_token: "not-a-jwt" } },
        error: null,
      });

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      // A 500 here would be the worst of both: the switch has already happened
      // (the target's cookies are in the store), so the caller would be handed
      // an error for a session they are now holding. The same landing as a
      // missing session id — unmarked, locked, and therefore on the stronger
      // gate — is the honest answer.
      expect(response.status).toBe(200);
      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockCookieDelete).toHaveBeenCalledWith(FAMILY_SESSION_COOKIE_NAME);
    });

    it("refuses when the new session names an account other than the target", async () => {
      switchToParentOnAValidPin();
      mockVerifyOtp.mockResolvedValue({
        data: {
          session: {
            access_token: accessTokenFor({
              sub: GAMER_B1,
              session_id: "new-session",
            }),
          },
        },
        error: null,
      });

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));

      // Both cookies bind the target we resolved while the id binding them comes
      // from the new session's token, so the two are only one binding if the
      // token names that same account. Unreachable in practice, and refused
      // rather than papered over by binding whatever `sub` came back: a marker
      // written against a mismatch would say a session belongs to somebody it
      // does not.
      expect(response.status).toBe(500);
      expect(mockCookieSet).not.toHaveBeenCalled();
    });
  });

  describe("admin client lookup errors", () => {
    it("returns 500 when target profile lookup throws a database error", async () => {
      mockAuthenticated("customer", PARENT_A);
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue(mockSupabaseError("DB exploded", "PG500")),
              }),
            }),
          };
        }
        return {};
      });

      const response = await POST(createRequest({ userId: GAMER_A1 }));
      expect(response.status).toBe(500);
    });
  });
});
