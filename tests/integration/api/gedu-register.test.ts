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
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";
import { verifyEmailVerificationToken } from "@/lib/email-verification";
import { asObject, getString } from "../../helpers/json";
import { INVISIBLE_ONLY_NAME } from "../../helpers/invisible-characters";

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

  it("returns 400 for an address in our own synthetic gamer domain", async () => {
    // `@gamer.sogverse.internal` is the namespace a child's username-mode
    // account lives in, and GoTrue's uniqueness on the address is what makes a
    // username unique. A stranger registering there would squat the handle a
    // family later picks for their child — so a PUBLIC registration refuses the
    // domain outright, before anything is created.
    const response = await POST(
      registerRequest({ ...validBody, email: "aino@gamer.sogverse.internal" }),
    );

    expect(response.status).toBe(400);
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

  /**
   * **The decision, on the public registration form: no handle is refused for
   * its shape.** A name with spaces was a 400 here once, and Mojang has issued
   * names our old rule called impossible — so an educator's real handle could
   * block a registration that has nothing to do with Minecraft. Now the name is
   * recorded either way; only its uuid depends on what Mojang says.
   */
  it("registers an educator whose Minecraft name our old format rule called impossible", async () => {
    mockLookupMinecraftUser.mockResolvedValue(null);

    const response = await POST(
      registerRequest({ ...validBody, minecraftUsername: "no spaces allowed" }),
    );

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).toHaveBeenCalledWith("no spaces allowed");
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_minecraft_username).toBe("no spaces allowed");
    expect(args.p_minecraft_uuid).toBe("");
  });

  // The one refusal left, and it still lands before `createUser` burns the email
  // irreversibly — which is the whole reason the ordering matters.
  it("returns 400 for a Minecraft username past the length bound, before creating anything", async () => {
    const response = await POST(
      registerRequest({
        ...validBody,
        minecraftUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
      }),
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

  // The Roblox half of the same decision: two underscores is something Roblox's
  // signup page refuses today and its older accounts carry, so it is Roblox's
  // answer that decides — and even that only decides the account id.
  it("registers an educator whose Roblox handle our old format rule called impossible", async () => {
    mockLookupRobloxProfile.mockResolvedValue(null);

    const response = await POST(
      registerRequest({ ...validBody, robloxUsername: "a_b_c" }),
    );

    expect(response.status).toBe(200);
    expect(mockLookupRobloxProfile).toHaveBeenCalledWith("a_b_c");
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_roblox_username).toBe("a_b_c");
    expect(args.p_roblox_user_id).toBe("");
  });

  it("returns 400 for a Roblox username past the length bound, before creating anything", async () => {
    const response = await POST(
      registerRequest({
        ...validBody,
        robloxUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
      }),
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

  /**
   * **A field the educator opened and left blank registers no account at all,
   * and that is the direction that changed.** A blank handle used to be refused
   * by a format rule; it now means the same thing as a field never touched, so
   * both spellings have to land on the RPC's empty sentinels — which is what
   * makes the function skip the account row rather than insert an empty one —
   * and neither may cost a call to a platform. The invisible case is the one
   * `.trim()` alone would let through, and it would create a row holding a name
   * that draws as nothing.
   */
  it.each([
    ["an empty string", ""],
    ["a blank string", "   "],
    ["only invisible characters", INVISIBLE_ONLY_NAME],
  ])("creates no game account row for %s in either field", async (_label, name) => {
    const response = await POST(
      registerRequest({
        ...validBody,
        minecraftUsername: name,
        robloxUsername: name,
      }),
    );

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(args.p_minecraft_username).toBe("");
    expect(args.p_minecraft_uuid).toBe("");
    expect(args.p_roblox_username).toBe("");
    expect(args.p_roblox_user_id).toBe("");
  });

  // -- UTM attribution --
  //
  // The values travel in the body (the form POSTs here with no utm params on
  // the URL, so the proxy's header is simply absent on this request) and reach
  // the profile-creation trigger through the same three user-metadata keys the
  // parent path uses. The body schema takes them as plain strings on purpose:
  // the educator never typed them and cannot see them, so a malformed one must
  // not 400 them.

  function signupMetadata() {
    return asObject(asObject(mockCreateUser.mock.calls[0][0]).user_metadata);
  }

  it("passes valid utm values through to the signup metadata", async () => {
    const response = await POST(
      registerRequest({
        ...validBody,
        utm: { source: "Lynx", medium: "email", campaign: "lynx-summer-a" },
      }),
    );

    expect(response.status).toBe(200);
    const metadata = signupMetadata();
    expect(metadata.utm_source).toBe("Lynx");
    expect(metadata.utm_medium).toBe("email");
    expect(metadata.utm_campaign).toBe("lynx-summer-a");
  });

  it("registers successfully with NULL when a utm value is malformed", async () => {
    const response = await POST(
      registerRequest({
        ...validBody,
        utm: { source: "=SUM(A1)", campaign: "lynx-summer-a" },
      }),
    );

    // A 400 here would let whoever authored the marketing link break somebody
    // else's registration. The fields are independent, so the well-formed
    // campaign beside the refused source still lands.
    expect(response.status).toBe(200);
    const metadata = signupMetadata();
    expect(metadata).not.toHaveProperty("utm_source");
    expect(metadata.utm_campaign).toBe("lynx-summer-a");
  });

  it("sends no utm keys at all when the educator arrived without any", async () => {
    const response = await POST(registerRequest(validBody));

    expect(response.status).toBe(200);
    const metadata = signupMetadata();
    expect(metadata).not.toHaveProperty("utm_source");
    expect(metadata).not.toHaveProperty("utm_medium");
    expect(metadata).not.toHaveProperty("utm_campaign");
  });

  it("never passes the utm values to the promotion RPC", async () => {
    // register_gedu names a targeted column list and mentions none of the
    // three, so the trigger-written values survive promotion untouched.
    await POST(
      registerRequest({ ...validBody, utm: { campaign: "lynx-summer-a" } }),
    );

    const args = asObject(mockRpc.mock.calls[0][1]);
    expect(Object.keys(args)).not.toContain("p_utm_source");
    expect(Object.keys(args)).not.toContain("p_utm_medium");
    expect(Object.keys(args)).not.toContain("p_utm_campaign");
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
