import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Finishing a parent registration that began with Google. The account exists
// and is signed in, but owes its name, its terms and its consents. What this
// file pins is the shape of that power: only an account that still owes its
// registration can run it, the terms record is the one write that stops the
// route and it stops it BEFORE the stamp, the stamp is the last write, the
// write-once attribution is consent-gated exactly as signup metadata is, and
// Google's word on the address replaces the verification link only when it is
// about the same address.

// The verification token is an HMAC over PIN_COOKIE_SECRET, read lazily at mint
// time; the links come from getOrigin(), which falls back to
// NEXT_PUBLIC_SITE_URL for these Host-less requests.
process.env.PIN_COOKIE_SECRET = "route-test-complete-registration-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

/** Every write the admin client makes, in order, so ordering can be asserted. */
const writes: string[] = [];
const mockGetUserById = vi.fn();
const mockProfileUpdate = vi.fn();
const mockAccountConsentRpc = vi.fn();
const mockMarketingConsentRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => mockGetUserById(...args),
      },
    },
    from: (table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }
      return {
        update: (row: Record<string, unknown>) => ({
          eq: (column: string, value: string) => {
            writes.push(
              "registration_completed_at" in row ? "stamp" : "profile",
            );
            return mockProfileUpdate({ row, column, value });
          },
        }),
      };
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      writes.push(fn);
      if (fn === "record_account_consents") return mockAccountConsentRpc(args);
      if (fn === "record_registration_marketing_consent") {
        return mockMarketingConsentRpc(args);
      }
      throw new Error(`Unexpected rpc in admin mock: ${fn}`);
    },
  }),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

const mockReportMetaConversion = vi.fn();
vi.mock("@/lib/meta-conversions.server", () => ({
  reportMetaConversion: (...args: unknown[]) => mockReportMetaConversion(...args),
}));

// The conversion is handed to the post-response hook; capture it instead.
const deferred: unknown[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: unknown) => {
      deferred.push(work);
    },
  };
});

import { POST } from "@/app/api/auth/complete-registration/route";
import {
  REGISTRATION_ALREADY_COMPLETE,
} from "@/services/users/parent-registration.contracts";
import { REGISTRATION_CONSENT_DOCUMENTS } from "@/lib/constants/consent-documents";
import { CONSENT_COOKIE_NAME } from "@/lib/consent";
import { ROUTES } from "@/lib/constants/routes";

const USER_ID = "77777777-7777-4777-8777-777777777777";
const LOCATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EMAIL = "parent@example.test";

const validBody = {
  firstName: "Marja",
  lastName: "Virtanen",
  locale: "fi",
  utm: { source: "Lynx", medium: "email", campaign: "lynx-summer-a" },
  marketingConsent: true,
  acceptedTerms: true,
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
        at: "2026-09-03T10:15:00.000Z",
        analytics: true,
        marketing,
      }),
    );
    headers.cookie = `${CONSENT_COOKIE_NAME}=${value}`;
  }
  return new Request("http://localhost:3000/api/auth/complete-registration", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** The gate admits a signed-in customer whose profile reads as given. */
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

/** The auth user, with a Google identity whose data reads as given. */
function googleIdentity(identityData: Record<string, unknown> | null) {
  mockGetUserById.mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        identities:
          identityData === null
            ? []
            : [{ provider: "google", identity_data: identityData }],
      },
    },
    error: null,
  });
}

/** The row of the first profile write — the names, extras and attribution. */
function profileRow(): Record<string, unknown> {
  const call = mockProfileUpdate.mock.calls.find(
    ([arg]) => !("registration_completed_at" in arg.row),
  );
  if (!call) throw new Error("no profile write");
  return call[0].row;
}

function stampCall() {
  return mockProfileUpdate.mock.calls.find(
    ([arg]) => "registration_completed_at" in arg.row,
  );
}

function sentHtml(): string {
  return mockSendTransactionalEmail.mock.calls[0][0].htmlContent;
}

describe("POST /api/auth/complete-registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    deferred.length = 0;
    signedInCustomer();
    googleIdentity({ email: EMAIL, email_verified: true });
    mockProfileUpdate.mockResolvedValue({ error: null });
    mockAccountConsentRpc.mockResolvedValue({ data: 1, error: null });
    mockMarketingConsentRpc.mockResolvedValue({ error: null });
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

  it("refuses an account that has already finished registering with a 409", async () => {
    signedInCustomer({ registration_completed_at: "2026-09-01T12:00:00Z" });

    const response = await POST(request(validBody, { marketing: true }));

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(REGISTRATION_ALREADY_COMPLETE);
    expect(writes).toEqual([]);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  // -- Input --

  it("refuses a body without the terms tick, writing nothing", async () => {
    const response = await POST(
      request({ ...validBody, acceptedTerms: false }),
    );

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  it("refuses a first name below the display-name minimum", async () => {
    const response = await POST(request({ ...validBody, firstName: "A" }));

    expect(response.status).toBe(400);
    expect(writes).toEqual([]);
  });

  // -- The happy path --

  it("writes the names, extras and consent-gated attribution, then stamps last", async () => {
    const response = await POST(
      request(
        { ...validBody, homeLocationId: LOCATION_ID },
        { marketing: true },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const row = profileRow();
    expect(row).toMatchObject({
      first_name: "Marja",
      last_name: "Virtanen",
      home_location_id: LOCATION_ID,
      locale: "fi",
      utm_source: "Lynx",
      utm_medium: "email",
      utm_campaign: "lynx-summer-a",
    });
    expect(row).not.toHaveProperty("registration_completed_at");

    const stamp = stampCall();
    expect(stamp?.[0].column).toBe("id");
    expect(stamp?.[0].value).toBe(USER_ID);
    expect(typeof stamp?.[0].row.registration_completed_at).toBe("string");

    // The consents are recorded before the stamp, and the stamp is the last
    // write the route makes.
    expect(writes).toEqual([
      "profile",
      "record_account_consents",
      "record_registration_marketing_consent",
      "stamp",
    ]);
    expect(mockAccountConsentRpc).toHaveBeenCalledWith({
      p_customer_id: USER_ID,
      p_document_slugs: [...REGISTRATION_CONSENT_DOCUMENTS],
    });
    expect(mockMarketingConsentRpc).toHaveBeenCalledWith({
      p_customer_id: USER_ID,
      p_granted: true,
    });
  });

  it("records a marketing refusal when the box was left unticked", async () => {
    await POST(request({ ...validBody, marketingConsent: false }));

    expect(mockMarketingConsentRpc).toHaveBeenCalledWith({
      p_customer_id: USER_ID,
      p_granted: false,
    });
  });

  it("omits every attribution column without a marketing grant in the cookie", async () => {
    await POST(request(validBody, { marketing: false }));

    const row = profileRow();
    expect(row).not.toHaveProperty("utm_source");
    expect(row).not.toHaveProperty("utm_medium");
    expect(row).not.toHaveProperty("utm_campaign");
  });

  it("omits the attribution when there is no consent cookie at all", async () => {
    await POST(request(validBody));

    expect(profileRow()).not.toHaveProperty("utm_source");
  });

  // -- Google's word on the address --

  it("stamps the address verified, and mails no verification link, when Google verified it", async () => {
    googleIdentity({ email: "Parent@Example.TEST", email_verified: true });

    await POST(request(validBody));

    expect(typeof profileRow().email_verified_at).toBe("string");
    expect(sentHtml()).not.toContain("/verify-email");
  });

  it("leaves the address unverified, and mails a link, when Google did not verify it", async () => {
    googleIdentity({ email: EMAIL, email_verified: false });

    await POST(request(validBody));

    expect(profileRow()).not.toHaveProperty("email_verified_at");
    expect(sentHtml()).toContain(`${ROUTES.verifyEmail}?token=`);
  });

  it("leaves the address unverified when Google's address is a different one", async () => {
    googleIdentity({ email: "someone.else@example.test", email_verified: true });

    await POST(request(validBody));

    expect(profileRow()).not.toHaveProperty("email_verified_at");
    expect(sentHtml()).toContain(`${ROUTES.verifyEmail}?token=`);
  });

  it("leaves the address unverified when the account has no Google identity", async () => {
    googleIdentity(null);

    await POST(request(validBody));

    expect(profileRow()).not.toHaveProperty("email_verified_at");
  });

  // -- Failures --

  it("answers 500 and does not stamp when the terms record fails", async () => {
    mockAccountConsentRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "boom" },
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(500);
    expect(stampCall()).toBeUndefined();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(0);
  });

  it("answers 500 and does not stamp when the profile write fails", async () => {
    mockProfileUpdate.mockResolvedValueOnce({
      error: { code: "23503", message: "fk" },
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(500);
    expect(writes).toEqual(["profile"]);
  });

  it("still completes when the marketing write fails", async () => {
    mockMarketingConsentRpc.mockResolvedValue({
      error: { code: "XX000", message: "boom" },
    });

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(stampCall()).toBeDefined();
  });

  it("still completes when the welcome mail fails", async () => {
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo down"));

    const response = await POST(request(validBody));

    expect(response.status).toBe(200);
    expect(stampCall()).toBeDefined();
  });

  // -- Mail and conversion --

  it("mails the welcome to the profile's address, in the body's locale", async () => {
    await POST(request(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    const [sent] = mockSendTransactionalEmail.mock.calls[0];
    expect(sent.toEmail).toBe(EMAIL);
    expect(sent.htmlContent).toContain('lang="fi"');
  });

  it("queues the account-creation conversion after the response", async () => {
    await POST(request(validBody, { marketing: true }));

    expect(deferred).toHaveLength(1);
    expect(mockReportMetaConversion).toHaveBeenCalledTimes(1);
    const [, conversion] = mockReportMetaConversion.mock.calls[0];
    expect(conversion).toEqual({
      event: "account_created",
      sourcePath: ROUTES.register,
    });
  });
});
