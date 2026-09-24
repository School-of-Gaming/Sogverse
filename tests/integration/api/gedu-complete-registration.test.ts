import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Finishing an educator registration that began with Google. The account is
// the person's own — signed in, the customer the new-user trigger made of it —
// and owes its registration. What this file pins: only such an account can be
// promoted through here, the promotion is the register route's own call with
// the register route's own parameters, a failed promotion never deletes the
// account, and the attribution, Google's verification and the stamp land in
// one write after the promotion.

process.env.PIN_COOKIE_SECRET = "route-test-gedu-complete-registration-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const writes: string[] = [];
const mockGetUserById = vi.fn();
const mockDeleteUser = vi.fn();
const mockProfileUpdate = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => mockGetUserById(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }
      return {
        update: (row: Record<string, unknown>) => ({
          eq: (column: string, value: string) => {
            writes.push("profile");
            return mockProfileUpdate({ row, column, value });
          },
        }),
      };
    },
    // Only the promotion: this route records no consents, as the register
    // route does not.
    rpc: (fn: string, args: Record<string, unknown>) => {
      writes.push(fn);
      if (fn === "register_gedu") return mockRpc(args);
      throw new Error(`Unexpected rpc in admin mock: ${fn}`);
    },
  }),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mojang")>();
  return {
    ...actual,
    lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  };
});

const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roblox")>();
  return {
    ...actual,
    lookupRobloxProfile: (...args: unknown[]) => mockLookupRobloxProfile(...args),
  };
});

import { POST } from "@/app/api/gedu/complete-registration/route";
import { REGISTRATION_ALREADY_COMPLETE } from "@/services/users/parent-registration.contracts";
import { CONSENT_COOKIE_NAME } from "@/lib/consent";
import { ROUTES } from "@/lib/constants/routes";

const USER_ID = "66666666-6666-4666-8666-666666666666";
const LOCATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EMAIL = "teacher@example.test";

const validBody = {
  firstName: "Aino",
  lastName: "Virtanen",
  phone: "+358401234567",
  spokenLanguages: ["fi"],
  locale: "fi",
  locationIds: [LOCATION_ID],
  minecraftUsername: "AinoBuilds",
  robloxUsername: "builderman",
  utm: { source: "recruit", campaign: "gedu-autumn" },
};

function request(
  body: unknown,
  { marketing }: { marketing?: boolean } = {},
): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (marketing !== undefined) {
    const value = encodeURIComponent(
      JSON.stringify({
        v: 1,
        at: "2026-09-14T10:15:00.000Z",
        analytics: true,
        marketing,
      }),
    );
    headers.cookie = `${CONSENT_COOKIE_NAME}=${value}`;
  }
  return new Request("http://localhost:3000/api/gedu/complete-registration", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function signedInCustomer(profile: Record<string, unknown> = {}) {
  mockRequireRole.mockResolvedValue({
    user: { id: USER_ID, email: EMAIL, session: { id: "s1", provenance: "own" } },
    profile: {
      id: USER_ID,
      role: "customer",
      email: EMAIL,
      locale: null,
      registration_completed_at: null,
      ...profile,
    },
    supabase: {},
  });
}

function googleIdentity(identityData: Record<string, unknown>) {
  mockGetUserById.mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        identities: [{ provider: "google", identity_data: identityData }],
      },
    },
    error: null,
  });
}

function profileRow(): Record<string, unknown> {
  const call = mockProfileUpdate.mock.calls.at(0);
  if (!call) throw new Error("no profile write");
  return call[0].row;
}

function sentHtml(): string {
  return mockSendTransactionalEmail.mock.calls[0][0].htmlContent;
}

describe("POST /api/gedu/complete-registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    signedInCustomer();
    googleIdentity({ email: EMAIL, email_verified: true });
    mockLookupMinecraftUser.mockResolvedValue({ uuid: "mc-uuid-1" });
    mockLookupRobloxProfile.mockResolvedValue({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: null,
      headshotUrl: null,
    });
    mockRpc.mockResolvedValue({ error: null });
    mockProfileUpdate.mockResolvedValue({ error: null });
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
  });

  // -- Posture --

  it("asks the gate for a customer and skips the PIN lock", async () => {
    await POST(request(validBody));

    expect(mockRequireRole).toHaveBeenCalledWith(
      "customer",
      expect.objectContaining({ allowUnverified: true }),
    );
  });

  it("returns the gate's 401 for a caller with no session, writing nothing", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(401);
    expect(writes).toEqual([]);
  });

  it("returns the gate's 403 for a caller of another role, writing nothing", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(request(validBody));

    expect(response.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("never promotes a parent who has finished registering: 409, nothing written", async () => {
    signedInCustomer({ registration_completed_at: "2026-09-01T12:00:00Z" });

    const response = await POST(request(validBody));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(REGISTRATION_ALREADY_COMPLETE);
    expect(writes).toEqual([]);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // -- Input --

  it("refuses a body that fails the contract, writing nothing", async () => {
    const response = await POST(request({ ...validBody, firstName: "A" }));

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("refuses a phone number the profile cannot store, writing nothing", async () => {
    const response = await POST(request({ ...validBody, phone: "12" }));

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  // -- The happy path --

  it("promotes with the register route's parameters, then writes and stamps in one statement", async () => {
    const response = await POST(request(validBody, { marketing: true }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(writes).toEqual(["register_gedu", "profile"]);

    expect(mockRpc).toHaveBeenCalledWith({
      p_user_id: USER_ID,
      p_first_name: "Aino",
      p_last_name: "Virtanen",
      p_locale: "fi",
      p_phone: "358401234567",
      p_spoken_languages: ["fi"],
      p_location_ids: [LOCATION_ID],
      p_minecraft_username: "AinoBuilds",
      p_minecraft_uuid: "mc-uuid-1",
      p_roblox_username: "builderman",
      p_roblox_user_id: "156",
    });

    const row = profileRow();
    expect(row).toMatchObject({
      utm_source: "recruit",
      utm_campaign: "gedu-autumn",
    });
    expect(row).not.toHaveProperty("utm_medium");
    expect(typeof row.email_verified_at).toBe("string");
    expect(typeof row.registration_completed_at).toBe("string");
    expect(mockProfileUpdate.mock.calls[0][0].value).toBe(USER_ID);
  });

  it("omits the attribution without a marketing grant in the cookie", async () => {
    await POST(request(validBody, { marketing: false }));

    const row = profileRow();
    expect(row).not.toHaveProperty("utm_source");
    expect(row).not.toHaveProperty("utm_campaign");
    expect(typeof row.registration_completed_at).toBe("string");
  });

  it("leaves the address unverified, and mails a link, when Google did not verify it", async () => {
    googleIdentity({ email: EMAIL, email_verified: false });

    await POST(request(validBody));

    expect(profileRow()).not.toHaveProperty("email_verified_at");
    expect(sentHtml()).toContain(`${ROUTES.verifyEmail}?token=`);
  });

  it("leaves the address unverified when Google's address is a different one", async () => {
    googleIdentity({ email: "other@example.test", email_verified: true });

    await POST(request(validBody));

    expect(profileRow()).not.toHaveProperty("email_verified_at");
  });

  it("mails no verification link when Google verified the address", async () => {
    await POST(request(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    expect(mockSendTransactionalEmail.mock.calls[0][0].toEmail).toBe(EMAIL);
    expect(sentHtml()).not.toContain("/verify-email");
  });

  // -- Failures --

  it("answers 500 on a failed promotion and never deletes the account", async () => {
    mockRpc.mockResolvedValue({ error: { code: "XX000", message: "boom" } });

    const response = await POST(request(validBody));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("boom");
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockProfileUpdate).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("still completes when the welcome mail fails", async () => {
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo down"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(typeof profileRow().registration_completed_at).toBe("string");
  });
});
