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

/** The gate's success shape, for a caller with a real inbox. */
function authAs(
  overrides: {
    role?: "customer" | "gedu" | "admin";
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
    supabase: {},
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

  // The gate itself is mocked, so what this route owns — and what this asserts —
  // is the role list it hands the gate. A gamer's address is the synthetic
  // `@gamer.sogverse.internal` one their account was created with: nobody reads
  // that inbox, so mail to it goes nowhere and a "verified" stamp on it would
  // assert something nobody confirmed.
  it("gates on the three roles with a real inbox, excluding gamers", async () => {
    authAs();

    await POST(createRequest());

    const [roles] = mockRequireRole.mock.calls[0];
    expect(roles).toEqual(["customer", "gedu", "admin"]);
    expect(roles).not.toContain("gamer");
  });

  it("returns the gate's 403 when the caller is a gamer", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

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
  });
});
