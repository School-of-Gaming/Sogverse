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
 *    themselves pays the TARGET's password, and the session they get is itself a
 *    password session.
 *
 * Three properties are asserted over and over on purpose, because they are the
 * ones a refactor breaks quietly: **a failed gate never signs the caller out**,
 * **the unlock cookie is minted on exactly one path**, and **every session the
 * OTP path creates carries the family-session marker while every session the
 * password path creates does not**. The third is what the gate above reads:
 * nothing in a token can separate a switch from a password recovery, so the
 * classification is this route's own signature on a session it built.
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
const mockAdminSignOut = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockAdminGenerateLink(...args),
        getUserById: (...args: unknown[]) => mockAdminGetUserById(...args),
        signOut: (...args: unknown[]) => mockAdminSignOut(...args),
      },
    },
  })),
}));

const mockSignOut = vi.fn();
const mockVerifyOtp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockGetClaims = vi.fn();
const mockGetSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signOut: mockSignOut,
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      getClaims: (...args: unknown[]) => mockGetClaims(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  })),
}));

// Two cookies pass through here: the parent-PIN unlock cookie, cleared on most
// paths and minted on exactly one, and the family-session marker, minted on
// every OTP switch and deleted on every password switch.
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
      auth: { signOut: mockSignOut, getSession: mockGetSession },
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
 * `gamerSignIn` feeds the one `gamer_profiles` read the own-session path makes.
 */
function setupAdminFrom(args: {
  target: TargetProfile;
  parentGamerBuilder?: () => Record<string, unknown>;
  gamerSignIn?: "parent" | "username" | "email" | null;
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

  const gamerProfileChain = {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi
          .fn()
          .mockResolvedValue(
            mockSupabaseSuccess(
              args.gamerSignIn === undefined || args.gamerSignIn === null
                ? null
                : { sign_in: args.gamerSignIn },
            ),
          ),
      }),
    }),
  };

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "profiles") return profileChain;
    if (table === "gamer_profiles") return gamerProfileChain;
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
 * The OTP switch succeeding: a link is minted and redeemed. The address it is
 * minted for comes from `setupAdminFrom`, which is where GoTrue's answer lives.
 */
function mockHappyPathSession() {
  mockAdminGenerateLink.mockResolvedValue({
    data: { properties: { email_otp: "123456" } },
    error: null,
  });
  mockVerifyOtp.mockResolvedValue({
    data: { session: { access_token: "new-token" } },
    error: null,
  });
}

/** The value the family marker must carry: bound to the NEW session, not the caller's. */
function familyMarkerFor(userId: string) {
  return mintFamilySessionToken(userId, "new-session");
}

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
    mockGetClaims.mockResolvedValue({
      data: { claims: { session_id: "new-session" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "caller-token" } },
      error: null,
    });
    mockAdminSignOut.mockResolvedValue({ error: null });
    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: "target-token" } },
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
      mockHappyPathSession();

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
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it("asks GoTrue for the gamer's address rather than trusting the profile copy", async () => {
      mockAuthenticated("customer", PARENT_A);
      setupAdminFrom({
        target: { id: GAMER_A1, role: "gamer", email: "alphaone@gamer.sogverse.internal" },
        parentGamerBuilder: linkLookup(true),
      });
      mockHappyPathSession();

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
      mockHappyPathSession();

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
      mockHappyPathSession();
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
      // The token is bound to the NEW session's id, read off its own claims.
      expect(mockCookieSet).toHaveBeenCalledWith(
        PIN_COOKIE_NAME,
        expect.any(String),
        expect.objectContaining({ httpOnly: true }),
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
        expect.objectContaining({ httpOnly: true }),
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
      mockHappyPathSession();

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
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Gate B — an own session pays the TARGET's password
  // -------------------------------------------------------------------------

  describe("gamer, own session → the password gate", () => {
    function ownSessionToParent() {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", email: "parent-a@example.com" },
        parentGamerBuilder: linkLookup(true),
      });
      mockAdminGetUserById.mockResolvedValue({
        data: { user: { id: PARENT_A, email: "parent-a@example.com" } },
        error: null,
      });
    }

    it("refuses with PASSWORD_REQUIRED when none was sent — and never asks for a PIN", async () => {
      ownSessionToParent();

      const response = await POST(createRequest({ userId: PARENT_A }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PASSWORD_REQUIRED");
      // A four-digit PIN is not what should stand between a school computer and
      // the parent's account, so this path never falls back to one.
      expect(mockAdminRpc).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it("refuses a PIN sent instead of a password", async () => {
      ownSessionToParent();

      const response = await POST(createRequest({ userId: PARENT_A, pin: "1234" }));
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PASSWORD_REQUIRED");
    });

    it("refuses with PASSWORD_INVALID, leaving the caller's session untouched", async () => {
      ownSessionToParent();
      mockSignInWithPassword.mockResolvedValue({
        data: { session: null },
        error: { code: "invalid_credentials", message: "Invalid login credentials" },
      });

      const response = await POST(
        createRequest({ userId: PARENT_A, password: "wrong" }),
      );
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.code).toBe("PASSWORD_INVALID");
      // The hard constraint of this path: a failed sign-in writes no cookies, so
      // there is nothing to unwind and the child is still signed in as
      // themselves. Nothing revoked the old session either.
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockAdminSignOut).not.toHaveBeenCalled();
    });

    it("signs in AS the parent, so the new session is itself a password session", async () => {
      ownSessionToParent();

      const response = await POST(
        createRequest({ userId: PARENT_A, password: "correct horse" }),
      );

      expect(response.status).toBe(200);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "parent-a@example.com",
        password: "correct horse",
      });
      // The OTP path is not taken at all — an otp-created session would be a
      // family session, and the next switch out of it would cost only a PIN.
      expect(mockAdminGenerateLink).not.toHaveBeenCalled();
    });

    it("never mints the unlock cookie — the parent lands on the PIN gate too", async () => {
      ownSessionToParent();

      await POST(createRequest({ userId: PARENT_A, password: "correct horse" }));

      expect(mockCookieSet).not.toHaveBeenCalled();
      expect(mockCookieDelete).toHaveBeenCalledWith(PIN_COOKIE_NAME);
    });

    it("deletes the family marker, so this session is an own session", async () => {
      ownSessionToParent();

      await POST(createRequest({ userId: PARENT_A, password: "correct horse" }));

      // The person at the keyboard typed the target's own credential, so the
      // session that results is theirs — and the browser must not carry into it
      // a marker minted for the session this one replaced. Left behind, it would
      // make the next switch out cost four digits instead of a password, which
      // is the whole thing this path exists to refuse.
      expect(mockCookieDelete).toHaveBeenCalledWith(FAMILY_SESSION_COOKIE_NAME);
      expect(mockCookieSet).not.toHaveBeenCalled();
    });

    it("revokes the caller's old session by its own access token", async () => {
      ownSessionToParent();

      await POST(createRequest({ userId: PARENT_A, password: "correct horse" }));

      expect(mockAdminSignOut).toHaveBeenCalledWith("caller-token", "local");
    });

    it("reaches a sibling who has a sign-in of their own", async () => {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", email: "alphatwo@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
        gamerSignIn: "username",
      });

      const response = await POST(
        createRequest({ userId: GAMER_A2, password: "sibling-password" }),
      );

      expect(response.status).toBe(200);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "alphatwo@gamer.sogverse.internal",
        password: "sibling-password",
      });
    });

    it("refuses a switch-only sibling with TARGET_UNREACHABLE, not a wrong password", async () => {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", email: "alphatwo@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
        gamerSignIn: "parent",
      });

      const response = await POST(
        createRequest({ userId: GAMER_A2, password: "anything" }),
      );
      const data = await response.json();

      expect(response.status).toBe(403);
      // Said plainly rather than answered as a wrong password: no password can
      // ever be right, so the family fixes it by giving that child a sign-in.
      expect(data.code).toBe("TARGET_UNREACHABLE");
      expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("treats a sibling with no gamer_profiles row as unreachable", async () => {
      mockAuthenticated("gamer", GAMER_A1, "own");
      setupAdminFrom({
        target: { id: GAMER_A2, role: "gamer", email: "alphatwo@gamer.sogverse.internal" },
        parentGamerBuilder: siblingLookup([
          { parent_id: PARENT_A, gamer_id: GAMER_A1 },
          { parent_id: PARENT_A, gamer_id: GAMER_A2 },
        ]),
        gamerSignIn: null,
      });

      const response = await POST(
        createRequest({ userId: GAMER_A2, password: "anything" }),
      );

      expect((await response.json()).code).toBe("TARGET_UNREACHABLE");
    });
  });

  // -------------------------------------------------------------------------
  // Everything that can go wrong after the gate
  // -------------------------------------------------------------------------

  describe("session mutation failures", () => {
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
      mockAuthenticated("gamer", GAMER_A1, "family");
      setupAdminFrom({
        target: { id: PARENT_A, role: "customer", email: "parent-a@example.com" },
        parentGamerBuilder: linkLookupWithParents(true, [PARENT_A]),
      });
      mockAdminRpc.mockResolvedValue(mockSupabaseSuccess("valid"));
      mockHappyPathSession();
      mockGetClaims.mockResolvedValue({ data: { claims: {} }, error: null });

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
