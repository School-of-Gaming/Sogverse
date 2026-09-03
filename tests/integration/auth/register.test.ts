import { describe, it, expect, vi, beforeEach } from "vitest";

// Parent self-registration: the second-highest-value public route on the
// surface, and the twin of the educator one. It creates an account with no
// session in play, from a body a stranger controls, and then sends mail to the
// address in that body. So what this file covers is the shape of that power —
// the account it creates is never privileged, the metadata reaching the profile
// trigger is exactly what the browser used to send, the welcome mail is bound
// to the address Supabase actually stored, and a send that fails costs the
// registration nothing. It also covers the one write here that no client can
// ever make: the marketing consent stamped `source: 'registration'`, which the
// self-service RPC refuses precisely so that this route's service-role client
// is the whole of that provenance.

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
const mockConsentRpc = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    // One table and no more: the profile, for the optional home location and
    // the locale. The marketing-consent pair used to be reachable here too and
    // deliberately is not any more — those two writes are one RPC now (00221),
    // so a `from("marketing_consents")` reappearing is the non-atomic pair
    // coming back and this mock fails on it.
    from: (table: string) => {
      if (table === "profiles") {
        return {
          update: (row: Record<string, unknown>) => ({
            eq: (column: string, value: string) =>
              mockProfileUpdate({ row, column, value }),
          }),
        };
      }
      throw new Error(`Unexpected table in admin mock: ${table}`);
    },
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "record_registration_marketing_consent") {
        return mockConsentRpc(args);
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

import { POST } from "@/app/api/auth/register/route";
import { REGISTER_WEAK_PASSWORD } from "@/services/users/parent-registration.contracts";
import { verifyEmailVerificationToken } from "@/lib/email-verification";
import {
  CONSENT_COOKIE_NAME,
  CONVERSION_COOKIE_NAME,
  REGISTRATION_CONVERSION,
} from "@/lib/consent";
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

/** A registration arriving with a given `sog_consent` cookie already set. */
function registerRequestWithConsent(consent: {
  analytics: boolean;
  marketing: boolean;
}): Request {
  const value = encodeURIComponent(
    JSON.stringify({
      v: 1,
      at: "2026-09-03T10:15:00.000Z",
      analytics: consent.analytics,
      marketing: consent.marketing,
    }),
  );
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: `locale=en; ${CONSENT_COOKIE_NAME}=${value}`,
    },
    body: JSON.stringify(validBody),
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
    mockConsentRpc.mockResolvedValue({ error: null });
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

  // -- The registration conversion marker --
  //
  // The one cookie this route sets, and the only thing on the surface that is
  // *deliberately* readable by a page script — the marketing pixels read it on
  // the next page, report the conversion and delete it. Whether it is written
  // is decided here, on the server, from the consent the request already
  // carried: a marker written for someone who refused marketing is a
  // conversion report waiting for the day a client-side gate slips.

  it("sets the conversion marker when the request carried marketing consent", async () => {
    const response = await POST(
      registerRequestWithConsent({ analytics: true, marketing: true }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(
      `${CONVERSION_COOKIE_NAME}=${REGISTRATION_CONVERSION}`,
    );
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=300");
    expect(setCookie).toMatch(/SameSite=lax/i);
    // These mock requests carry no Host, so getOrigin falls back to the https
    // NEXT_PUBLIC_SITE_URL set at the top of this file — the
    // production-representative branch, where the flag has to be on.
    expect(setCookie).toContain("Secure");
    // NOT HttpOnly, and that is the feature: the pixel script has to read it.
    // Which is also why it carries one fixed word and no identifier at all.
    expect(setCookie).not.toMatch(/HttpOnly/i);
    // The body is unchanged by any of this.
    expect(await response.json()).toEqual({ userId: NEW_USER_ID });
  });

  it.each([
    ["analytics only", { analytics: true, marketing: false }],
    ["a full refusal", { analytics: false, marketing: false }],
  ])("sets no conversion marker for %s", async (_label, consent) => {
    const response = await POST(registerRequestWithConsent(consent));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      CONVERSION_COOKIE_NAME,
    );
  });

  it("sets no conversion marker when no consent has been given at all", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").not.toContain(
      CONVERSION_COOKIE_NAME,
    );
  });

  // The trigger reads first_name/last_name (and the three utm_* keys) straight
  // out of
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
      row: { home_location_id: LOCATION_ID, locale: "en" },
      column: "id",
      value: NEW_USER_ID,
    });
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

  // -- UTM attribution --

  it("passes valid utm values through to the signup metadata", async () => {
    await POST(
      registerRequest({
        ...validBody,
        utm: { source: "Lynx", medium: "email", campaign: "lynx-summer-a" },
      }),
    );

    const metadata = signupMetadata();
    expect(metadata.utm_source).toBe("Lynx");
    expect(metadata.utm_medium).toBe("email");
    expect(metadata.utm_campaign).toBe("lynx-summer-a");
  });

  it("registers successfully with no key at all when a value is malformed", async () => {
    // A 400 here would let whoever authored the marketing link break somebody
    // else's registration. The fields are independent, so the well-formed
    // campaign beside the refused source still lands.
    const response = await POST(
      registerRequest({
        ...validBody,
        utm: { source: "=SUM(A1)", campaign: "lynx-summer-a" },
      }),
    );

    expect(response.status).toBe(200);
    const metadata = signupMetadata();
    expect(metadata).not.toHaveProperty("utm_source");
    expect(metadata.utm_campaign).toBe("lynx-summer-a");
  });

  it("sends no utm keys at all when the parent arrived without any", async () => {
    await POST(registerRequest(validBody));

    const metadata = signupMetadata();
    expect(metadata).not.toHaveProperty("utm_source");
    expect(metadata).not.toHaveProperty("utm_medium");
    expect(metadata).not.toHaveProperty("utm_campaign");
  });

  // -- Marketing consent --
  //
  // The registration checkbox is the one place `source: 'registration'` can be
  // written from: the RPC every signed-in surface uses refuses that value, so
  // the service-role call below is the whole of its provenance.

  it("records a ticked opt-in through the one RPC that carries the registration provenance", async () => {
    const response = await POST(
      registerRequest({ ...validBody, marketingConsent: true }),
    );

    expect(response.status).toBe(200);
    expect(mockConsentRpc).toHaveBeenCalledTimes(1);
    // The route names the customer and the answer, and nothing else. Neither
    // the consent type nor the `registration` source is a parameter — 00221
    // hardcodes both, so this route cannot stamp that provenance onto the
    // partner's list and nothing a client can reach can claim it at all.
    expect(mockConsentRpc).toHaveBeenCalledWith({
      p_customer_id: NEW_USER_ID,
      p_granted: true,
    });
  });

  // **The state row and its event row are one transaction now.** They used to
  // be two PostgREST calls, and two calls are two transactions: a failed second
  // one left `marketing_consents` asserting an answer `marketing_consent_events`
  // could not corroborate. The admin mock throws on any `from("marketing_*")`,
  // so a regression back to the pair fails loudly rather than by an assertion
  // count — but pin the single call here too, because that is the property.
  it("makes exactly one write for the pair, never two", async () => {
    await POST(registerRequest({ ...validBody, marketingConsent: true }));

    expect(mockConsentRpc).toHaveBeenCalledTimes(1);
  });

  // The write is last on purpose — it is the least important thing this route
  // does and the only one with no user-visible consequence if it fails, so
  // nothing above it can be delayed or broken by it. Pinned here because the
  // ordering is a decision rather than an accident of where the code was typed.
  it("writes the consent only after the welcome mail has gone out", async () => {
    await POST(registerRequest({ ...validBody, marketingConsent: true }));

    expect(mockConsentRpc.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockSendTransactionalEmail.mock.invocationCallOrder[0],
    );
  });

  // An absent row would mean "never asked"; this form asked, so a parent who
  // left the box alone gets a recorded `false` — which is what makes their
  // settings page show a definite answer rather than a shrug.
  it("records a decline when the body carries no answer at all", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockConsentRpc).toHaveBeenCalledWith({
      p_customer_id: NEW_USER_ID,
      p_granted: false,
    });
  });

  // Losing an opt-in under-markets, which is the safe direction to fail in.
  // Destroying a working account over one is not. There is no half-written
  // state to check for any more: the RPC either committed both rows or neither.
  it("still registers when the consent write is refused", async () => {
    mockConsentRpc.mockResolvedValue({
      error: { code: "42501", message: "permission denied" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      registerRequest({ ...validBody, marketingConsent: true }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: NEW_USER_ID });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("returns 400 for a marketing answer that is not a boolean", async () => {
    const response = await POST(
      registerRequest({ ...validBody, marketingConsent: "yes" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
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

  // The persisted locale is what a browserless sender consults later: without
  // it, the Stripe webhook's confirmation mail for this parent falls through
  // Accept-Language on Stripe's own request and lands on English.
  it("persists the registration locale onto the profile", async () => {
    const response = await POST(registerRequest({ ...validBody, locale: "fi" }));

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).toHaveBeenCalledWith({
      row: { locale: "fi" },
      column: "id",
      value: NEW_USER_ID,
    });
  });

  it("writes no profile extras when neither locale nor location was sent", async () => {
    const { locale: _omitted, ...noLocale } = validBody;
    const response = await POST(registerRequest(noLocale));

    expect(response.status).toBe(200);
    expect(mockProfileUpdate).not.toHaveBeenCalled();
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
