import { describe, it, expect, vi, beforeEach } from "vitest";

// Both are read lazily, but set before the imports anyway so nothing can depend
// on call order: the token helper signs under PIN_COOKIE_SECRET, and the link's
// origin falls back to NEXT_PUBLIC_SITE_URL for any Host we do not trust.
process.env.PIN_COOKIE_SECRET = "unit-test-gamer-welcome-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://sogverse.example.test";

/**
 * The one place three routes send a child's welcome-and-verify mail from —
 * creating a gamer in `email` mode, changing one into it, and the parent's
 * resend. What is under test is the pair of refusals it owns and the shape of
 * the link it mints, because each of the three callers trusts this module to
 * make them rather than making them itself.
 *
 * The two refusals are the interesting half. A send to a synthetic handle is a
 * no-op that looks like a working feature, and a link minted while `auth.users`
 * and `profiles.email` disagree would let a click stamp `email_verified_at` for
 * an address the account cannot sign in as — a "verified" mailbox that is not a
 * login. Both are the kind of failure nobody notices from the outside, which is
 * why they are asserted here rather than left to the callers.
 */

const supabase = vi.hoisted(() => {
  const state = {
    profile: null as Record<string, unknown> | null,
    profileError: null as { message: string } | null,
    /** What `auth.admin.getUserById` answers. */
    authUser: null as { email: string | null } | null,
    authError: null as { message: string } | null,
  };

  function reset() {
    state.profile = null;
    state.profileError = null;
    state.authUser = null;
    state.authError = null;
  }

  function createAdminClient() {
    return {
      from() {
        return {
          select() {
            const read = {
              eq() {
                return read;
              },
              single: async () => ({
                data: state.profile,
                error: state.profileError,
              }),
            };
            return read;
          },
        };
      },
      auth: {
        admin: {
          getUserById: async () => ({
            data: state.authUser ? { user: state.authUser } : { user: null },
            error: state.authError,
          }),
        },
      },
    };
  }

  return { state, reset, createAdminClient };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: supabase.createAdminClient,
}));

/** Only the fields this module decides are named; the builder fills the rest. */
interface SentMail {
  toEmail: string;
  subject: string;
  htmlContent: string;
}

const mockSendTransactionalEmail =
  vi.fn<(mail: SentMail) => Promise<{ messageId: string }>>();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (mail: SentMail) => mockSendTransactionalEmail(mail),
}));

// The translator and the template are stood in for, because what this module
// decides about them is which LOCALE they are asked for — not what they render.
const mockGetEmailTranslator = vi.fn();
vi.mock("@/lib/email-templates/translator", () => ({
  getEmailTranslator: (...args: unknown[]) => mockGetEmailTranslator(...args),
}));

interface WelcomeParams {
  gamerFirstName: string;
  verificationUrl: string;
}

const mockBuildGamerWelcomeEmail =
  vi.fn<(t: unknown, locale: string, params: WelcomeParams) => string>();
vi.mock("@/lib/email-templates/gamer-welcome", () => ({
  buildGamerWelcomeEmail: (t: unknown, locale: string, params: WelcomeParams) =>
    mockBuildGamerWelcomeEmail(t, locale, params),
}));

import { sendGamerWelcomeEmail } from "@/lib/gamer-welcome.server";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { ROUTES } from "@/lib/constants/routes";

const GAMER_ID = "33333333-3333-4333-8333-333333333333";
const REAL_EMAIL = "aino@example.test";

/**
 * A request whose Host is one we do not trust. The link goes in an email and
 * carries a signed token, so the origin has to come from `getOrigin` — which
 * falls back to the canonical site URL — rather than from what the caller sent.
 */
function request(acceptLanguage?: string): Request {
  const headers = new Headers({ host: "evil.example.com" });
  if (acceptLanguage) headers.set("Accept-Language", acceptLanguage);
  return new Request("http://evil.example.com/api/gamers/x", { headers });
}

/** The single argument bag handed to Brevo. */
function sentMail(): SentMail {
  expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
  return mockSendTransactionalEmail.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.reset();
  mockGetEmailTranslator.mockImplementation(async () => (key: string) => key);
  mockBuildGamerWelcomeEmail.mockReturnValue("<html>welcome</html>");
  mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
});

describe("sendGamerWelcomeEmail — what it refuses", () => {
  it("refuses a synthetic address rather than mailing one", async () => {
    // A child in `username` or `parent` mode has an address nobody reads, so a
    // send there is a message into a void — the kind of no-op that looks like a
    // working feature until somebody asks why no mail arrived.
    supabase.state.profile = {
      email: "aino@gamer.sogverse.internal",
      first_name: "Aino",
      locale: "fi",
    };

    await expect(
      sendGamerWelcomeEmail({ request: request(), gamerId: GAMER_ID }),
    ).rejects.toThrow(/no real address/);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("refuses a profile holding no address at all", async () => {
    supabase.state.profile = { email: null, first_name: "Aino", locale: "en" };

    await expect(
      sendGamerWelcomeEmail({ request: request(), gamerId: GAMER_ID }),
    ).rejects.toThrow(/no real address/);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("refuses when auth.users and profiles.email name different addresses", async () => {
    // The window a mode change opens: `auth.users` moves first and `profiles`
    // second. The token is bound to `profiles.email` and the click is checked
    // against it, so a link minted here would stamp verified an address the
    // account does not authenticate as. Refusing makes it an operator's problem
    // instead of a family's.
    supabase.state.profile = {
      email: REAL_EMAIL,
      first_name: "Aino",
      locale: "en",
    };
    supabase.state.authUser = { email: "old@example.test" };

    await expect(
      sendGamerWelcomeEmail({ request: request(), gamerId: GAMER_ID }),
    ).rejects.toThrow(/disagree/);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("refuses when GoTrue's own address cannot be read", async () => {
    supabase.state.profile = {
      email: REAL_EMAIL,
      first_name: "Aino",
      locale: "en",
    };
    supabase.state.authError = { message: "auth is down" };

    await expect(
      sendGamerWelcomeEmail({ request: request(), gamerId: GAMER_ID }),
    ).rejects.toThrow(/could not read the address/);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });
});

describe("sendGamerWelcomeEmail — what it sends", () => {
  beforeEach(() => {
    supabase.state.profile = {
      email: REAL_EMAIL,
      first_name: "Aino",
      locale: "sv",
    };
    supabase.state.authUser = { email: REAL_EMAIL };
  });

  it("writes to the child, in the child's own locale", async () => {
    await sendGamerWelcomeEmail({
      // A parent's browser asking for French does not outrank the child's own
      // stored preference: the child is the reader.
      request: request("fr"),
      gamerId: GAMER_ID,
    });

    expect(sentMail().toEmail).toBe(REAL_EMAIL);
    expect(mockGetEmailTranslator).toHaveBeenCalledWith("sv");
    expect(mockBuildGamerWelcomeEmail.mock.calls[0][1]).toBe("sv");
  });

  it("falls back to the request's language when the stored locale is not one we ship", async () => {
    supabase.state.profile = { ...supabase.state.profile, locale: "xx" };

    await sendGamerWelcomeEmail({ request: request("fr"), gamerId: GAMER_ID });

    expect(mockGetEmailTranslator).toHaveBeenCalledWith("fr");
  });

  it("builds the verification link on the TRUSTED origin, not the caller's Host", async () => {
    await sendGamerWelcomeEmail({ request: request(), gamerId: GAMER_ID });

    const { verificationUrl } = mockBuildGamerWelcomeEmail.mock.calls[0][2];
    const url = new URL(verificationUrl);

    // A spoofed Host in an emailed link is a phishing URL the recipient has
    // every reason to trust, so the origin comes from `getOrigin` — which
    // refuses this Host and answers the canonical site URL.
    expect(url.origin).toBe("https://sogverse.example.test");
    expect(url.host).not.toBe("evil.example.com");
    expect(url.pathname).toBe(ROUTES.verifyEmail);

    // And the token is the one minted for THIS child and THIS address: the
    // signature binds both, so a link for another address would not verify.
    expect(url.searchParams.get("token")).toBe(
      await createEmailVerificationToken(GAMER_ID, REAL_EMAIL),
    );
  });
});
