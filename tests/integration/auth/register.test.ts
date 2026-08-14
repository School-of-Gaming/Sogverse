import { describe, it, expect, vi, beforeEach } from "vitest";

// Parent self-registration: the second-highest-value public route on the
// surface, and the twin of the educator one. It creates an account with no
// session in play, from a body a stranger controls, and then sends mail to the
// address in that body. So what this file covers is the shape of that power —
// the account it creates is never privileged, the metadata reaching the profile
// trigger is exactly what the browser used to send, the welcome mail is bound
// to the address Supabase actually stored, and a send that fails costs the
// registration nothing.

// The verification token is an HMAC over PIN_COOKIE_SECRET, read lazily at mint
// time — set before the route is imported.
process.env.PIN_COOKIE_SECRET = "route-test-parent-register-secret";
// The mail's links come from getOrigin(), which falls back to
// NEXT_PUBLIC_SITE_URL when the request carries no trusted Host (these mock
// requests don't). A fake value keeps the suite hermetic and exercises the
// production-representative path.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockProfileUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: (table: string) => {
      // The route touches exactly one table, and only for the optional home
      // location. Anything else appearing here is a change worth failing on.
      if (table !== "profiles") {
        throw new Error(`Unexpected table in admin mock: ${table}`);
      }
      return {
        update: (row: Record<string, unknown>) => ({
          eq: (column: string, value: string) =>
            mockProfileUpdate({ row, column, value }),
        }),
      };
    },
  }),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

import { POST } from "@/app/api/auth/register/route";
import { REGISTER_WEAK_PASSWORD } from "@/services/users/parent-registration.contracts";
import { verifyEmailVerificationToken } from "@/lib/email-verification";
import { asObject } from "../../helpers/json";

const NEW_USER_ID = "88888888-8888-4888-8888-888888888888";
const LOCATION_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const validBody = {
  email: "parent@example.test",
  password: "a-long-enough-password",
  firstName: "Marja",
  lastName: "Virtanen",
  locale: "en",
};

function registerRequest(body: unknown, rawBody?: string): Request {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

/** The metadata handed to the Auth Admin API. */
function signupMetadata(): Record<string, unknown> {
  return asObject(asObject(mockCreateUser.mock.calls[0][0]).user_metadata);
}

/** The single link the welcome mail carries a signed token on. */
function sentVerificationUrl(): string {
  const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
  const match = /https:\/\/[^"']*\/verify-email\?token=[^"'&]*/.exec(htmlContent);
  expect(match, "no verification link in the sent mail").not.toBeNull();
  return match![0];
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID, email: "parent@example.test" } },
      error: null,
    });
    mockProfileUpdate.mockResolvedValue({ error: null });
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
  });

  // -- Public posture --

  it("registers with no session and never consults the role gate", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(registerRequest(null, "{not-json"));

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that fails the contract schema", async () => {
    const response = await POST(
      registerRequest({ ...validBody, email: "not-an-email" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("email");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a password below the contract minimum", async () => {
    const response = await POST(
      registerRequest({ ...validBody, password: "short" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a first name shorter than the display-name minimum", async () => {
    const response = await POST(registerRequest({ ...validBody, firstName: "A" }));

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a home location that is not a uuid", async () => {
    const response = await POST(
      registerRequest({ ...validBody, homeLocationId: "not-a-uuid" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("creates the auth user and returns only the new id", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: NEW_USER_ID });
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "parent@example.test",
        password: "a-long-enough-password",
        email_confirm: true,
      }),
    );
  });

  // The trigger reads first_name/last_name (and referral_code) straight out of
  // this bag, so the shape is a contract with the database, not a detail. The
  // two inert keys are kept because the Supabase Auth dashboard shows
  // display_name and because a reader of the metadata should see what they saw
  // before this moved off the browser.
  it("sends the same signup metadata the browser used to send", async () => {
    await POST(registerRequest(validBody));

    expect(signupMetadata()).toEqual({
      first_name: "Marja",
      last_name: "Virtanen",
      display_name: "Marja Virtanen",
      role: "customer",
    });
  });

  it("trims the names before they reach the profile trigger", async () => {
    await POST(
      registerRequest({ ...validBody, firstName: "  Marja  ", lastName: " Virtanen " }),
    );

    expect(signupMetadata().first_name).toBe("Marja");
    expect(signupMetadata().last_name).toBe("Virtanen");
  });

  // The role in the metadata is inert — handle_new_user hardcodes `customer` —
  // and this route must not start honouring one either.
  it("never lets the body name its own privileges", async () => {
    await POST(
      registerRequest({ ...validBody, role: "admin", isVerified: true }),
    );

    expect(signupMetadata().role).toBe("customer");
    expect(JSON.stringify(signupMetadata())).not.toContain("admin");
  });

  // -- Home location --

  it("writes the optional home location onto the new profile", async () => {
    const response = await POST(
      registerRequest({ ...validBody, homeLocationId: LOCATION_ID }),
    );

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      row: { home_location_id: LOCATION_ID },
      column: "id",
      value: NEW_USER_ID,
    });
  });

  it("writes nothing when no home location was given", async () => {
    await POST(registerRequest(validBody));

    expect(mockProfileUpdate).not.toHaveBeenCalled();
  });

  // The one place this route deliberately has NO rollback. The account is the
  // outcome the parent asked for and it exists; the location is optional and
  // re-pickable from settings, so deleting a working account over it — or
  // stranding them on the form — would both be strictly worse than losing it.
  it("still succeeds when the home-location write fails, and keeps the account", async () => {
    mockProfileUpdate.mockResolvedValue({
      error: { code: "23503", message: "locations fk violation" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      registerRequest({ ...validBody, homeLocationId: LOCATION_ID }),
    );

    expect(response.status).toBe(200);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  // -- Referral attribution --

  it("passes a valid referral code through to the signup metadata", async () => {
    await POST(registerRequest({ ...validBody, referralCode: "Paris-Nord" }));

    expect(signupMetadata().referral_code).toBe("paris-nord");
  });

  it("registers successfully with no key at all when the code is malformed", async () => {
    // A 400 here would let whoever authored the marketing link break somebody
    // else's registration.
    const response = await POST(
      registerRequest({ ...validBody, referralCode: "=SUM(A1)" }),
    );

    expect(response.status).toBe(200);
    expect(signupMetadata()).not.toHaveProperty("referral_code");
  });

  // -- The welcome mail --

  it("mails a link whose token verifies against the address Supabase stored", async () => {
    await POST(registerRequest(validBody));

    const url = new URL(sentVerificationUrl());
    const token = url.searchParams.get("token") ?? "";
    await expect(
      verifyEmailVerificationToken(token, "parent@example.test"),
    ).resolves.toBe(NEW_USER_ID);
  });

  // GoTrue normalises the address on the way in, so a token minted against the
  // string the parent typed would never verify against the profile row.
  it("binds the token to the stored address, not the one that was typed", async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID, email: "parent@example.test" } },
      error: null,
    });

    await POST(registerRequest({ ...validBody, email: "Parent@Example.Test" }));

    const token =
      new URL(sentVerificationUrl()).searchParams.get("token") ?? "";
    await expect(
      verifyEmailVerificationToken(token, "parent@example.test"),
    ).resolves.toBe(NEW_USER_ID);
    expect(mockSendTransactionalEmail.mock.calls[0][0].toEmail).toBe(
      "parent@example.test",
    );
  });

  it("sends under the shared sender identity, replying to the support inbox", async () => {
    await POST(registerRequest(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "parent@example.test",
        fromEmail: "sogverse@sog.gg",
        fromName: "School of Gaming",
        replyToEmail: "help@sog.gg",
        subject: "Welcome to School of Gaming",
      }),
    );
  });

  it("carries the parent's own way onward — shop, My SOG and settings", async () => {
    await POST(registerRequest(validBody));

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).toContain("https://test.sogverse.local/shop");
    expect(htmlContent).toContain("https://test.sogverse.local/parent");
    expect(htmlContent).toContain("https://test.sogverse.local/settings");
  });

  it("renders the mail in the locale the form was being read in", async () => {
    await POST(
      registerRequest({ ...validBody, locale: "fi" }),
    );

    const { subject } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(subject).not.toBe("Welcome to School of Gaming");
  });

  it("falls back to Accept-Language when the body names no locale", async () => {
    const { locale: _omitted, ...noLocale } = validBody;
    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "fi-FI,fi;q=0.9",
      },
      body: JSON.stringify(noLocale),
    });

    await POST(request);

    const { subject } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(subject).not.toBe("Welcome to School of Gaming");
  });

  // Regression guard: the emailed link carries a signed token, so an origin
  // taken from the attacker-controllable Host would turn it into a phishing URL
  // the recipient has every reason to trust.
  it("builds the links off the trusted origin, ignoring a spoofed Host", async () => {
    await POST(
      new Request("https://evil.com/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "evil.com" },
        body: JSON.stringify(validBody),
      }),
    );

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).toContain("https://test.sogverse.local/verify-email?token=");
    expect(htmlContent).not.toContain("evil.com");
  });

  // The account is the primary outcome; a Brevo error must not undo it, and a
  // fresh verification link is one button away in settings.
  it("succeeds when the send throws, and keeps the account", async () => {
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: NEW_USER_ID });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // -- Failure --

  it("answers 409 for an address that already has an account", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: {
        code: "email_exists",
        message: "A user with this email address has already been registered",
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));

    // The status is what the form keys on to offer the sign-in link, so it is
    // part of the contract rather than an incidental choice.
    expect(response.status).toBe(409);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("recognises the duplicate from the message when no code is sent", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(409);
    spy.mockRestore();
  });

  // A rejected password is a 400 like any other refusal, but it carries a code,
  // because the generic answer points the wrong way: it ends "if you already
  // have an account, sign in instead", and no account exists — the fix is one
  // field away. The form branches on the code to say so in the parent's
  // language.
  it("answers 400 with a distinguishable code when the password is refused", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { code: "weak_password", message: "Password is known to be leaked" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe(REGISTER_WEAK_PASSWORD);
    // Still not the provider's own sentence: it is raw English and sometimes
    // names the check that fired.
    expect(data.error).not.toContain("leaked");
    // And it must not send the parent looking for a sign-in they never made.
    expect(data.error).not.toMatch(/sign in/i);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("answers 400 without echoing the auth provider's message on any other refusal", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { code: "unexpected_failure", message: "database is on fire" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).not.toContain("fire");
    // No code: nothing here is actionable, so the generic sentence stands.
    expect(data.code).toBeUndefined();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
