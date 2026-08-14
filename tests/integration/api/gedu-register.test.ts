import { describe, it, expect, vi, beforeEach } from "vitest";

// The highest-value public route on the surface: it creates an account, with no
// session in play, from a body a stranger controls. There is no wrong-role case
// — there is no role — so what this file covers instead is the shape of that
// power: the account it creates is never privileged, the auth user is created
// only after every rejectable precondition has been checked, a failed promotion
// leaves no orphaned auth user behind, and no database text reaches the caller.

// The welcome mail's verification token is an HMAC over PIN_COOKIE_SECRET, read
// lazily at mint time — set before the route is imported. The links come from
// getOrigin(), which falls back to NEXT_PUBLIC_SITE_URL when the request carries
// no trusted Host (these mock requests don't).
process.env.PIN_COOKIE_SECRET = "route-test-gedu-register-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockRpc = vi.fn();

// No `from` here on purpose: the route reaches the database only through the
// promotion RPC. It used to query `minecraft_accounts` first to reject an
// already-linked account; sharing one is allowed now, so that read is gone.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
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

import { POST } from "@/app/api/gedu/register/route";
import { verifyEmailVerificationToken } from "@/lib/email-verification";
import { asObject, getString } from "../../helpers/json";

const NEW_USER_ID = "99999999-9999-4999-8999-999999999999";

const validBody = {
  email: "teacher@example.test",
  password: "a-long-enough-password",
  firstName: "Aino",
  lastName: "Virtanen",
  // The route strips a leading + and requires bare digits; it does not strip
  // separators, so the form sends the compact form.
  phone: "+358401234567",
  spokenLanguages: ["fi"],
  locale: "fi",
  locationIds: [],
};

function registerRequest(body: unknown, rawBody?: string): Request {
  return new Request("http://localhost:3000/api/gedu/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

describe("POST /api/gedu/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookupMinecraftUser.mockResolvedValue({ uuid: "mc-uuid-1" });
    mockLookupRobloxProfile.mockResolvedValue({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: null,
      headshotUrl: null,
    });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID, email: validBody.email } },
      error: null,
    });
    mockRpc.mockResolvedValue({ error: null });
    mockDeleteUser.mockResolvedValue({ error: null });
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
  });

  /** The single link the welcome mail carries a signed token on. */
  function sentVerificationUrl(): string {
    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    const match = /https:\/\/[^"']*\/verify-email\?token=[^"'&]*/.exec(htmlContent);
    expect(match, "no verification link in the sent mail").not.toBeNull();
    return match![0];
  }

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

  it("returns 400 for an unusable phone number, before creating anything", async () => {
    const response = await POST(
      registerRequest({ ...validBody, phone: "12" }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid phone number");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed Minecraft username, before creating anything", async () => {
    const response = await POST(
      registerRequest({ ...validBody, minecraftUsername: "no spaces allowed" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("creates the auth user and promotes it, returning only the new id", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: NEW_USER_ID });
    expect(mockRpc).toHaveBeenCalledWith(
      "register_gedu",
      expect.objectContaining({ p_user_id: NEW_USER_ID, p_first_name: "Aino" }),
    );
  });

  it("normalizes the phone to the digits the profile CHECK accepts", async () => {
    await POST(registerRequest(validBody));

    expect(getString(mockRpc.mock.calls[0][1], "p_phone")).toMatch(
      /^\d{7,15}$/,
    );
  });

  it("never asks for a role — the account is created unverified by the RPC", async () => {
    // Self-registration must not be able to name its own privileges, so no
    // role, verification flag or admin field is passed from the request.
    await POST(
      registerRequest({ ...validBody, role: "admin", isVerified: true }),
    );

    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(Object.keys(args)).not.toContain("p_role");
    expect(JSON.stringify(args)).not.toContain("admin");
  });

  // -- Minecraft --

  it("registers an educator on a Minecraft account someone else already holds", async () => {
    // Sharing is allowed, so there is no pre-check to fail and no conflict to
    // report — the resolved name and uuid go straight to the RPC.
    mockLookupMinecraftUser.mockResolvedValue({ uuid: "shared-uuid" });

    const response = await POST(
      registerRequest({ ...validBody, minecraftUsername: "Notch" }),
    );

    expect(response.status).toBe(200);
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_minecraft_username).toBe("Notch");
    expect(args.p_minecraft_uuid).toBe("shared-uuid");
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("passes an empty uuid when Mojang cannot resolve the username", async () => {
    // An unresolvable name is still recorded; the RPC NULLIFs the empty uuid.
    mockLookupMinecraftUser.mockResolvedValue(null);

    const response = await POST(
      registerRequest({ ...validBody, minecraftUsername: "Notch" }),
    );

    expect(response.status).toBe(200);
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_minecraft_username).toBe("Notch");
    expect(args.p_minecraft_uuid).toBe("");
  });

  // -- Roblox --
  //
  // Same shape one platform over, with one difference that matters: the account
  // id is an int64, and it reaches the RPC as *text* because '' is this
  // function's sentinel for every absent optional argument and a bigint
  // parameter could not carry it.

  it("returns 400 for a malformed Roblox username, before creating anything", async () => {
    const response = await POST(
      // Two underscores — Roblox permits at most one, never at either end.
      registerRequest({ ...validBody, robloxUsername: "a_b_c" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("passes the resolved Roblox account id as a decimal string", async () => {
    const response = await POST(
      registerRequest({ ...validBody, robloxUsername: "builderman" }),
    );

    expect(response.status).toBe(200);
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_roblox_username).toBe("builderman");
    expect(args.p_roblox_user_id).toBe("156");
  });

  it("passes an empty account id when Roblox cannot resolve the handle", async () => {
    mockLookupRobloxProfile.mockResolvedValue(null);

    const response = await POST(
      registerRequest({ ...validBody, robloxUsername: "nobody_here" }),
    );

    expect(response.status).toBe(200);
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_roblox_username).toBe("nobody_here");
    expect(args.p_roblox_user_id).toBe("");
  });

  it("passes both sentinels when the educator gave no game handles at all", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_roblox_username).toBe("");
    expect(args.p_roblox_user_id).toBe("");
    expect(args.p_minecraft_username).toBe("");
  });

  // -- Referral attribution --
  //
  // The code travels in the body (the form POSTs here with no `?ref=` on the
  // URL, so the proxy's header is simply absent on this request) and reaches the
  // profile-creation trigger through the same user metadata key the parent path
  // uses. The body schema takes it as a plain string on purpose: the educator
  // never typed it and cannot see it, so a malformed one must not 400 them.

  it("passes a valid referral code through to the signup metadata", async () => {
    const response = await POST(
      registerRequest({ ...validBody, referralCode: "Paris-Nord" }),
    );

    expect(response.status).toBe(200);
    const metadata = asObject(
      asObject(mockCreateUser.mock.calls[0][0]).user_metadata,
    );
    expect(metadata.referral_code).toBe("paris-nord");
  });

  it("registers successfully with NULL when the referral code is malformed", async () => {
    const response = await POST(
      registerRequest({ ...validBody, referralCode: "=SUM(A1)" }),
    );

    // A 400 here would let whoever authored the marketing link break somebody
    // else's registration.
    expect(response.status).toBe(200);
    const metadata = asObject(
      asObject(mockCreateUser.mock.calls[0][0]).user_metadata,
    );
    expect(metadata).not.toHaveProperty("referral_code");
  });

  it("sends no referral key at all when the educator arrived without one", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    const metadata = asObject(
      asObject(mockCreateUser.mock.calls[0][0]).user_metadata,
    );
    expect(metadata).not.toHaveProperty("referral_code");
  });

  it("never passes the referral code to the promotion RPC", async () => {
    // register_gedu names a targeted column list and does not mention
    // referral_code, so the trigger-written value survives promotion untouched.
    await POST(registerRequest({ ...validBody, referralCode: "paris-nord" }));

    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(Object.keys(args)).not.toContain("p_referral_code");
  });

  // -- The welcome mail --
  //
  // The last step, and the only one whose failure the educator never hears
  // about: the account is what they asked for and it exists by this point.

  it("mails a link whose token verifies against the address Supabase stored", async () => {
    await POST(registerRequest(validBody));

    const token =
      new URL(sentVerificationUrl()).searchParams.get("token") ?? "";
    await expect(
      verifyEmailVerificationToken(token, validBody.email),
    ).resolves.toBe(NEW_USER_ID);
  });

  it("sends under the shared sender identity, replying to the support inbox", async () => {
    await POST(registerRequest(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: validBody.email,
        fromEmail: "sogverse@sog.gg",
        fromName: "School of Gaming",
        replyToEmail: "help@sog.gg",
      }),
    );
  });

  it("points the educator at their own dashboard and settings", async () => {
    await POST(registerRequest(validBody));

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).toContain("https://test.sogverse.local/gedu");
    expect(htmlContent).toContain("https://test.sogverse.local/settings");
  });

  it("renders the mail in the locale the form was being read in", async () => {
    await POST(registerRequest(validBody));

    // The fixture registers in Finnish, so an English subject would mean the
    // body's locale never reached the translator.
    const { subject } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(subject).not.toBe(
      "Welcome to School of Gaming – your Gedu account",
    );
  });

  // Regression guard: the emailed link carries a signed token, so an origin
  // taken from the attacker-controllable Host would turn it into a phishing URL
  // the recipient has every reason to trust.
  it("builds the links off the trusted origin, ignoring a spoofed Host", async () => {
    await POST(
      new Request("https://evil.com/api/gedu/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", host: "evil.com" },
        body: JSON.stringify(validBody),
      }),
    );

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).toContain(
      "https://test.sogverse.local/verify-email?token=",
    );
    expect(htmlContent).not.toContain("evil.com");
  });

  it("succeeds when the send throws, and keeps the account", async () => {
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: NEW_USER_ID });
    expect(mockDeleteUser).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("sends nothing when the promotion failed and the account was rolled back", async () => {
    mockRpc.mockResolvedValue({
      error: { code: "23514", message: "check constraint" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await POST(registerRequest(validBody));

    expect(mockDeleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // -- Failure --

  it("answers 400 without echoing the auth provider's message when signup is refused", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: "A user with this email address has already been registered" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).not.toContain("already been registered");
    spy.mockRestore();
  });

  it("answers 500 without echoing database text, and deletes the orphaned auth user", async () => {
    mockRpc.mockResolvedValue({
      error: {
        code: "23514",
        message: 'new row for relation "profiles" violates check constraint "profiles_phone_check"',
      },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(registerRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("check constraint");
    expect(mockDeleteUser).toHaveBeenCalledWith(NEW_USER_ID);
    spy.mockRestore();
  });
});
