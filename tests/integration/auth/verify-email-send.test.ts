import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// The token is an HMAC over PIN_COOKIE_SECRET, read lazily at mint time — set
// before the route is imported.
process.env.PIN_COOKIE_SECRET = "route-test-verify-email-secret";
// The route builds the emailed link via getOrigin(), which falls back to
// NEXT_PUBLIC_SITE_URL when the request carries no trusted Host (these mock
// requests don't). A fake value keeps the suite hermetic and exercises the
// production-representative path (untrusted Host → canonical origin).
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

import { POST } from "@/app/api/auth/verify-email/send/route";
import { verifyEmailVerificationToken } from "@/lib/email-verification";

// --- Helpers ---

const USER_ID = "3f1c4e6a-9a2b-4a5f-8d1e-2c7b6f0a9d34";

function createRequest(headers?: Record<string, string>): Request {
  return new Request(
    "http://localhost:3000/api/auth/verify-email/send",
    { method: "POST", headers },
  );
}

/**
 * The caller's own client, which the route uses for exactly one thing: the
 * self-scoping rate-limit RPC. `true` is "you are under the hourly limit".
 */
const mockRpc = vi.fn();

/**
 * The sign-in mode the caller's own client reports — the one read this route
 * makes beyond the rate-limit RPC, and only for a gamer caller.
 */
const mockSignIn = vi.fn();

/** The gate's success shape, for a caller with a real inbox. */
function authAs(
  overrides: {
    role?: "customer" | "gamer" | "gedu" | "admin";
    email?: string | null;
    locale?: string | null;
    emailVerifiedAt?: string | null;
  } = {},
) {
  mockRequireRole.mockResolvedValue({
    user: { id: USER_ID, email: overrides.email ?? "parent@example.com" },
    profile: {
      id: USER_ID,
      role: overrides.role ?? "customer",
      email: overrides.email === undefined ? "parent@example.com" : overrides.email,
      first_name: "Marja",
      locale: overrides.locale === undefined ? "en" : overrides.locale,
      email_verified_at: overrides.emailVerifiedAt ?? null,
    },
    supabase: {
      rpc: mockRpc,
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: mockSignIn }) }),
      }),
    },
  });
}

/** The link the route put in the mail. */
function sentVerificationUrl(): string {
  const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
  const match = /https:\/\/[^"']*\/verify-email\?token=[^"'&]*/.exec(htmlContent);
  expect(match, "no verification link in the sent mail").not.toBeNull();
  return match![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
  mockRpc.mockResolvedValue({ data: true, error: null });
  mockSignIn.mockResolvedValue({ data: { sign_in: "email" }, error: null });
});

// --- Tests ---

describe("POST /api/auth/verify-email/send", () => {
  // -- Auth --

  it("refuses an unauthenticated caller and sends nothing", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // The role gate lets every role through, because the question this route
  // actually asks is about the ADDRESS: every adult holds a real one, and a
  // gamer holds one only in sign-in mode `email`. The other two modes carry a
  // synthetic `@gamer.sogverse.internal` handle nobody reads, so mail to it goes
  // nowhere and a "verified" stamp on it would assert something nobody
  // confirmed — which the handler refuses, one table over from the role.
  it("gates on every role, and asks about the address in the handler", async () => {
    authAs();

    await POST(createRequest());

    const [roles] = mockRequireRole.mock.calls[0];
    expect(roles).toEqual(["customer", "gamer", "gedu", "admin"]);
  });

  it("returns the gate's 403 when the gate itself refuses", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("lets a gamer in email mode send themselves the link", async () => {
    authAs({ role: "gamer", email: "aino@example.com" });
    mockSignIn.mockResolvedValue({ data: { sign_in: "email" }, error: null });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  it.each(["parent", "username"] as const)(
    "refuses a gamer in %s mode, whose address nobody reads",
    async (mode) => {
      authAs({ role: "gamer", email: "aino@gamer.sogverse.internal" });
      mockSignIn.mockResolvedValue({ data: { sign_in: mode }, error: null });

      const response = await POST(createRequest());

      expect(response.status).toBe(403);
      expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
      // Refused before the allowance is spent: no mail leaves, so nothing
      // should be charged for it.
      expect(mockRpc).not.toHaveBeenCalled();
    },
  );

  // -- Happy path --

  it("mails a link whose token verifies against the caller's current address", async () => {
    authAs();

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const url = new URL(sentVerificationUrl());
    const token = url.searchParams.get("token") ?? "";
    // The end-to-end claim: what the route minted is what the landing page will
    // accept, for this account and this address.
    await expect(
      verifyEmailVerificationToken(token, "parent@example.com"),
    ).resolves.toBe(USER_ID);
    // And it stops working the moment the address changes, with no revocation.
    await expect(
      verifyEmailVerificationToken(token, "moved@example.com"),
    ).resolves.toBeNull();
  });

  it("sends under the shared sender identity, replying to the support inbox", async () => {
    authAs();

    await POST(createRequest());

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "parent@example.com",
        fromEmail: "sogverse@sog.gg",
        fromName: "School of Gaming",
        replyToEmail: "help@sog.gg",
        subject: "Verify your email address",
      }),
    );
  });

  it("renders the mail in the caller's stored locale", async () => {
    authAs({ locale: "fi" });

    await POST(createRequest({ "Accept-Language": "en-US,en;q=0.9" }));

    const { subject } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(subject).not.toBe("Verify your email address");
  });

  // Regression guard, same shape as the password-reset one: the emailed link
  // carries a signed token, so an origin taken from the attacker-controllable
  // Host would turn it into a phishing URL the recipient has every reason to
  // trust.
  it("builds the link off the trusted origin, ignoring a spoofed Host", async () => {
    authAs();

    await POST(
      new Request("https://evil.com/api/auth/verify-email/send", {
        method: "POST",
        headers: { host: "evil.com" },
      }),
    );

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).toContain("https://test.sogverse.local/verify-email?token=");
    expect(htmlContent).not.toContain("evil.com");
  });

  // -- Already verified --

  // Documented behaviour rather than an oversight: the settings button that
  // calls this is only offered while the address is unverified, so arriving here
  // already-verified means the page was stale. Re-sending an idempotent link is
  // the honest answer to "send me the link"; a special-cased no-op would ask the
  // client to tell apart two outcomes that are the same outcome.
  it("re-sends to an already-verified caller rather than refusing", async () => {
    authAs({ emailVerifiedAt: "2026-01-01T00:00:00.000Z" });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
  });

  // -- Nothing to send to --

  it("succeeds without sending when the profile carries no address", async () => {
    authAs({ email: null });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    // And it costs nothing: no mail leaves, so nothing is charged against the
    // hourly allowance.
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Rate limit --
  //
  // Sending yourself mail reaches nobody else's data, but every send spends one
  // message from the shared Brevo quota — the same quota password-reset mail
  // draws on — so the button is limited in the database rather than in this
  // process.

  it("spends the caller's own allowance through the self-scoping RPC", async () => {
    authAs();

    await POST(createRequest());

    // On the USER-bound client, and with no argument naming a user: the row it
    // writes is keyed to auth.uid(), so this handler cannot spend anyone else's
    // allowance or exempt itself from its own.
    expect(mockRpc).toHaveBeenCalledWith("request_my_verification_email");
  });

  it("answers 429 and sends nothing once the caller is over the limit", async () => {
    authAs();
    mockRpc.mockResolvedValue({ data: false, error: null });

    const response = await POST(createRequest());

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("Too many"),
    });
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("does not send when the rate-limit check itself fails", async () => {
    authAs();
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection reset", code: "XX000" },
    });

    const response = await POST(createRequest());

    // A limit we could not consult is not a limit that passed, so the send does
    // not happen — the shared quota is exactly what an unchecked path spends.
    expect(response.status).toBe(500);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });
});
