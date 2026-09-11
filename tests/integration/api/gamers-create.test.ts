import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { POST } from "@/app/api/gamers/create/route";
import { NextResponse } from "next/server";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockRpc = vi.fn();
const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}));

// Only the network hop is replaced. Neither platform module carries a format
// rule any more — the wire schema is a trim and a length bound, and the platform
// alone decides whether a name resolves.
const mockLookupMinecraftUser = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
}));

const mockSendGamerWelcomeEmail = vi.fn();
vi.mock("@/lib/gamer-welcome.server", () => ({
  sendGamerWelcomeEmail: (...args: unknown[]) => mockSendGamerWelcomeEmail(...args),
}));

const mockLookupRobloxProfile = vi.fn();
vi.mock("@/lib/roblox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/roblox")>();
  return {
    ...actual,
    lookupRobloxProfile: (...args: unknown[]) => mockLookupRobloxProfile(...args),
  };
});

// --- Helpers ---

function mockAuthenticated(userId = "customer-123") {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { role: "customer" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/gamers/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  firstName: "New Gamer",
  dateOfBirth: "2015-06-15",
  gender: "boy",
};

/**
 * Configure admin.from() chain mocks for the pre-createUser phase.
 * Only needs to handle "profiles" (synthetic-email uniqueness check) — tests
 * that use this helper stop before the post-createUser DB operations. The route
 * never queries `minecraft_accounts` itself; a Minecraft link is written by the
 * RPC and is not checked against anything.
 */
function mockPreCreateChecks(config: {
  emailExists?: boolean;
  parentLastName?: string | null;
}) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      // Two distinct chains hit profiles in this phase:
      //   1. email-uniqueness: .select("id").eq().maybeSingle()
      //   2. parent last_name snapshot: .select("last_name").eq().single()
      // Branch on the column passed to .select() so each test can configure
      // whether the email is taken AND what last_name to inherit.
      return {
        select: (col: string) => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: config.emailExists ? { id: "existing-id" } : null,
              error: null,
            }),
            single: () => Promise.resolve({
              data: col.includes("last_name")
                ? { last_name: config.parentLastName ?? "" }
                : null,
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
}

// --- Tests ---

describe("POST /api/gamers/create — DOB validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when dateOfBirth is missing", async () => {
    mockAuthenticated();

    const { dateOfBirth: _, ...body } = validBody;
    const response = await POST(createRequest(body));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("dateOfBirth");
  });

  it("should return 400 when dateOfBirth is in the future", async () => {
    mockAuthenticated();

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await POST(
      createRequest({ ...validBody, dateOfBirth: futureDateStr }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("future");
  });

  it("should return 400 when dateOfBirth is not a valid date", async () => {
    mockAuthenticated();

    const response = await POST(
      createRequest({ ...validBody, dateOfBirth: "not-a-date" }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("future");
  });

  it("should return 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(createRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-customer roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Switch to a parent account to add a gamer." },
        { status: 403 },
      ),
    );

    const response = await POST(createRequest(validBody));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/gamers/create — Minecraft linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticated();
    mockPreCreateChecks({ emailExists: false, parentLastName: "Parentson" });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: "new-gamer-id" } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
  });

  it("links a Minecraft account another Sogverse user already holds", async () => {
    // The point of dropping the minecraft_uuid UNIQUE: two siblings sharing one
    // Minecraft account on separate Sogverse accounts. The route asks Mojang who
    // the name belongs to and writes it — it never asks whether anyone else has
    // it, so there is nothing here that can refuse.
    mockLookupMinecraftUser.mockResolvedValue({
      username: "SharedPlayer",
      uuid: "shared-uuid",
    });

    const response = await POST(
      createRequest({ ...validBody, minecraftUsername: "SharedPlayer" }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({
        p_minecraft_username: "SharedPlayer",
        p_minecraft_uuid: "shared-uuid",
      }),
    );
    // No lookup against the table at all — not for this or any other reason.
    expect(mockAdminFrom).not.toHaveBeenCalledWith("minecraft_accounts");
  });

  it("still links a username Mojang cannot resolve, with a null uuid", async () => {
    mockLookupMinecraftUser.mockResolvedValue(null);

    const response = await POST(
      createRequest({ ...validBody, minecraftUsername: "unknown_player" }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({
        p_minecraft_username: "unknown_player",
        // Omitted rather than null — the RPC's params default to null and the
        // generated Args type accepts undefined, not null.
        p_minecraft_uuid: undefined,
      }),
    );
  });

  it("skips Mojang entirely when no minecraft username is provided", async () => {
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockLookupMinecraftUser).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({ p_minecraft_username: undefined }),
    );
  });
});

describe("POST /api/gamers/create — Roblox linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticated();
    mockPreCreateChecks({ emailExists: false, parentLastName: "Parentson" });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: "new-gamer-id" } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
  });

  it("resolves the handle server-side and passes the numeric account id", async () => {
    mockLookupRobloxProfile.mockResolvedValue({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: null,
      headshotUrl: null,
    });

    const response = await POST(
      createRequest({ ...validBody, robloxUsername: "builderman" }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({
        p_roblox_username: "builderman",
        p_roblox_user_id: 156,
      }),
    );
  });

  it("still links a handle Roblox cannot resolve, with no account id", async () => {
    mockLookupRobloxProfile.mockResolvedValue(null);

    const response = await POST(
      createRequest({ ...validBody, robloxUsername: "nobody_here" }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({
        p_roblox_username: "nobody_here",
        // Omitted rather than null — the RPC's params default to null and the
        // generated Args type accepts undefined, not null.
        p_roblox_user_id: undefined,
      }),
    );
  });

  it("skips Roblox entirely when no handle is provided", async () => {
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({ p_roblox_username: undefined }),
    );
  });

  /**
   * **The decision, on gamer creation: no handle is refused for its shape.** Two
   * underscores was a 400 here once, on the strength of a copy of Roblox's
   * *current* signup validator — a rule younger than the accounts it judges. A
   * parent typing their child's real handle could not create the account at all,
   * on a form whose subject is a name and a birthday.
   */
  it.each([
    ["two underscores", "a_b_c"],
    ["a space", "Old Timer"],
  ])(
    "creates the gamer with a handle carrying %s, unresolved",
    async (_label, username) => {
      mockLookupRobloxProfile.mockResolvedValue(null);

      const response = await POST(
        createRequest({ ...validBody, robloxUsername: username }),
      );

      expect(response.status).toBe(200);
      expect(mockLookupRobloxProfile).toHaveBeenCalledWith(username);
      expect(mockRpc).toHaveBeenCalledWith(
        "create_gamer",
        expect.objectContaining({
          p_roblox_username: username,
          p_roblox_user_id: undefined,
        }),
      );
    },
  );

  // The one refusal left, and it still lands before `createUser` burns the email
  // irreversibly.
  it("rejects a handle past the length bound, before any account exists", async () => {
    const response = await POST(
      createRequest({
        ...validBody,
        robloxUsername: "a".repeat(GAME_USERNAME_MAX_LENGTH + 1),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockLookupRobloxProfile).not.toHaveBeenCalled();
  });

  it("carries both platforms through in one call", async () => {
    mockLookupMinecraftUser.mockResolvedValue({
      username: "Notch",
      uuid: "mc-uuid",
    });
    mockLookupRobloxProfile.mockResolvedValue({
      username: "builderman",
      userId: 156,
      displayName: "builderman",
      avatarUrl: null,
      headshotUrl: null,
    });

    const response = await POST(
      createRequest({
        ...validBody,
        minecraftUsername: "Notch",
        robloxUsername: "builderman",
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({
        p_minecraft_username: "Notch",
        p_minecraft_uuid: "mc-uuid",
        p_roblox_username: "builderman",
        p_roblox_user_id: 156,
      }),
    );
  });
});

describe("POST /api/gamers/create — v1 minimal body (auto-generated email, passwordless, optional gender)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a body with only firstName + dateOfBirth and creates a passwordless auth user", async () => {
    mockAuthenticated();
    mockPreCreateChecks({ emailExists: false });
    // Stop the flow at createUser so we can inspect what got passed.
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: "mock-stop" },
    });

    await POST(createRequest({ firstName: "Lily", dateOfBirth: "2018-04-15" }));

    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const callArg = z
      .object({
        email: z.string(),
      })
      .parse(mockCreateUser.mock.calls[0][0]);
    // Opaque internal email local-part shape: "g" + 16 hex chars.
    expect(callArg.email).toMatch(/^g[0-9a-f]{16}@gamer\.sogverse\.internal$/);
    // Absence, not an undefined value: vitest's toHaveProperty checks
    // hasOwnProperty first, so `password: undefined` would read as present and
    // fail this — which is what we want, since sending the key at all is the
    // regression. The reason there is no password lives at the route.
    expect(mockCreateUser.mock.calls[0][0]).not.toHaveProperty("password");
    // With the password gone this is the last field in the call that the
    // account depends on: without it the gamer is created unconfirmed and the
    // parent's switch into them fails.
    expect(mockCreateUser.mock.calls[0][0]).toMatchObject({ email_confirm: true });
  });

  it("rejects an invalid gender value", async () => {
    mockAuthenticated();

    const response = await POST(
      createRequest({ firstName: "Lily", dateOfBirth: "2018-04-15", gender: "robot" }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("gender");
  });

  it("accepts a missing/null gender (no longer required)", async () => {
    mockAuthenticated();
    mockPreCreateChecks({ emailExists: false });
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { message: "mock-stop" },
    });

    const response = await POST(
      createRequest({ firstName: "Lily", dateOfBirth: "2018-04-15" }),
    );

    // 400 from createUser's mock-stop, not from a gender validation error.
    // The provider's own message is logged rather than forwarded now, so the
    // body is this route's own copy — what matters here is that no gender
    // issue was raised on the way.
    const data = await response.json();
    expect(data.error).not.toContain("gender");
    expect(response.status).toBe(400);
  });
});

describe("POST /api/gamers/create — atomic create_gamer RPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticated();
    mockPreCreateChecks({ emailExists: false, parentLastName: "Parentson" });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: "new-gamer-id" } },
      error: null,
    });
    // Supabase's deleteUser resolves an { error } shape (it doesn't throw); the
    // route's cleanup helper destructures it, so the mock must mirror that.
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  it("calls create_gamer with the verified parent id and gamer details", async () => {
    mockRpc.mockResolvedValue({ error: null });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({
        p_gamer_id: "new-gamer-id",
        p_parent_id: "customer-123",
        p_first_name: "New Gamer",
        p_last_name: "Parentson",
        p_date_of_birth: "2015-06-15",
        p_gender: "boy",
      }),
    );
    // Returns just the new gamer's id (no read-back) — the only thing callers use.
    expect(response.status).toBe(200);
    expect(data).toEqual({ gamerId: "new-gamer-id" });
    // Happy path never rolls back the auth user.
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  // 23505 is in this list on purpose. It used to be special-cased into a 409
  // "already linked to another user", which was only ever reachable via the
  // minecraft_uuid UNIQUE; with that constraint dropped, a unique violation here
  // means some *other* constraint and must not be mislabelled as a Minecraft
  // conflict. Pinning it alongside an ordinary failure is what keeps the
  // special case from growing back.
  it.each([
    ["P0001", "boom"],
    ["23505", "duplicate key"],
  ])(
    "deletes the orphaned auth user and returns a friendly 500 when the RPC fails with %s",
    async (code, message) => {
      mockRpc.mockResolvedValue({ error: { code, message } });

      const response = await POST(createRequest(validBody));
      const data = await response.json();

      expect(response.status).toBe(500);
      // The raw Postgres error text never reaches the client.
      expect(data.error).not.toContain(message);
      expect(data.error).toBe("Something went wrong creating the gamer. Please try again.");
      // No code on any failure — the client has one localized generic and uses it.
      expect(data.code).toBeUndefined();
      expect(mockDeleteUser).toHaveBeenCalledWith("new-gamer-id");
    },
  );
});

describe("POST /api/gamers/create — the sign-in modes", () => {
  /**
   * The mode decides what auth user is created, and the three shapes are
   * genuinely different accounts rather than one account with a flag. What each
   * case pins is the pair that has to agree: the address GoTrue is given, and
   * whether a password goes with it.
   */
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticated();
    mockPreCreateChecks({ emailExists: false, parentLastName: "Parentson" });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: "new-gamer-id" } },
      error: null,
    });
    mockDeleteUser.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
    mockSendGamerWelcomeEmail.mockResolvedValue(undefined);
  });

  const base = { firstName: "Aino", dateOfBirth: "2015-06-15" };

  it("defaults to `parent`: a random handle, no password, no mail", async () => {
    // Absent rather than sent, because a client that predates the modes — a
    // cached bundle, a page open across a deploy — must still create the
    // switch-only account it has always created.
    const response = await POST(createRequest(base));

    expect(response.status).toBe(200);
    const [created] = mockCreateUser.mock.calls[0];
    expect(created.email).toMatch(/^g[0-9a-f]{16}@gamer\.sogverse\.internal$/);
    expect(created.password).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({ p_sign_in: "parent" }),
    );
    expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
  });

  it("`username`: the handle becomes the address, and the password is set", async () => {
    const response = await POST(
      createRequest({
        ...base,
        signIn: "username",
        username: "Aino",
        password: "a good password",
      }),
    );

    expect(response.status).toBe(200);
    const [created] = mockCreateUser.mock.calls[0];
    // Normalised on the way in, so GoTrue's uniqueness on the address is what
    // makes the username unique — one username can only ever be one account.
    expect(created.email).toBe("aino@gamer.sogverse.internal");
    expect(created.password).toBe("a good password");
    expect(mockRpc).toHaveBeenCalledWith(
      "create_gamer",
      expect.objectContaining({ p_sign_in: "username" }),
    );
    expect(mockSendGamerWelcomeEmail).not.toHaveBeenCalled();
  });

  it("normalises the address before it becomes the account", async () => {
    // GoTrue lowercases on the way in, so a parent typing capitals must produce
    // the row GoTrue will actually hold — not a second spelling of it that every
    // later comparison then has to fold for itself.
    const response = await POST(
      createRequest({ ...base, signIn: "email", email: "  Aino@Example.COM " }),
    );

    expect(response.status).toBe(200);
    expect(mockCreateUser.mock.calls[0][0].email).toBe("aino@example.com");
  });

  it("refuses an address in our own synthetic domain, creating nothing", async () => {
    // `@gamer.sogverse.internal` is the namespace the other two modes live in: a
    // random handle, or a username-derived one whose uniqueness IS the username's.
    // An address typed into this field that landed there would promise a mailbox
    // nobody can read — or claim a handle that belongs to another child.
    const response = await POST(
      createRequest({ ...base, signIn: "email", email: "AINO@gamer.sogverse.internal" }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("`email`: the real address, NO password, and the welcome mail", async () => {
    const response = await POST(
      createRequest({ ...base, signIn: "email", email: "aino@example.com" }),
    );

    expect(response.status).toBe(200);
    const [created] = mockCreateUser.mock.calls[0];
    expect(created.email).toBe("aino@example.com");
    // Deliberately passwordless: the child verifies the address first and then
    // sets a password through the ordinary reset flow.
    expect(created.password).toBeUndefined();
    expect(mockSendGamerWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ gamerId: "new-gamer-id" }),
    );
  });

  it("a failed welcome mail does not fail the creation", async () => {
    mockSendGamerWelcomeEmail.mockRejectedValue(new Error("brevo is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      createRequest({ ...base, signIn: "email", email: "aino@example.com" }),
    );

    // The account is the outcome the parent asked for and it exists by now; the
    // link can be sent again from the child's card.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ gamerId: "new-gamer-id" });
    spy.mockRestore();
  });

  // -- The pairing rules, refused by the schema before anything is created --

  it.each([
    ["username with no password", { signIn: "username", username: "aino" }],
    ["username with no username", { signIn: "username", password: "a good password" }],
    [
      "username with an email address",
      {
        signIn: "username",
        username: "aino",
        password: "a good password",
        email: "aino@example.com",
      },
    ],
    ["email with no address", { signIn: "email" }],
    [
      "email with a password",
      { signIn: "email", email: "aino@example.com", password: "a good password" },
    ],
    ["parent with a username", { signIn: "parent", username: "aino" }],
    ["parent with an address", { signIn: "parent", email: "aino@example.com" }],
    ["parent with a password", { signIn: "parent", password: "a good password" }],
  ])("refuses %s with 400, creating nothing", async (_name, credentials) => {
    const response = await POST(createRequest({ ...base, ...credentials }));

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("refuses a username that is not 3-20 letters or digits", async () => {
    const response = await POST(
      createRequest({
        ...base,
        signIn: "username",
        username: "ai no!",
        password: "a good password",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("holds the child's password to the same bar as their parent's", async () => {
    const response = await POST(
      createRequest({ ...base, signIn: "username", username: "aino", password: "short" }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at least 8 characters");
  });

  // -- Refusals the parent can act on --

  it("answers 409 USERNAME_TAKEN when the handle is already an address", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { code: "email_exists", message: "email already registered" },
    });

    const response = await POST(
      createRequest({
        ...base,
        signIn: "username",
        username: "taken",
        password: "a good password",
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    // In username mode the address IS the username, so naming the email field
    // would point at a form field this parent does not have.
    expect(data.code).toBe("USERNAME_TAKEN");
  });

  it("answers 409 EMAIL_TAKEN when the address already has an account", async () => {
    mockCreateUser.mockResolvedValue({
      data: null,
      error: { code: "email_exists", message: "email already registered" },
    });

    const response = await POST(
      createRequest({ ...base, signIn: "email", email: "taken@example.com" }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("EMAIL_TAKEN");
  });

  it("answers 403 PIN_REQUIRED when the family holds no PIN, and unwinds the auth user", async () => {
    // The gate on leaving a gamer session IS the parent's PIN, so a family may
    // not acquire a child account before it has one. P0025 is the RPC's own
    // SQLSTATE for exactly that refusal.
    mockRpc.mockResolvedValue({
      error: { code: "P0025", message: "PIN_REQUIRED" },
    });

    const response = await POST(createRequest(base));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.code).toBe("PIN_REQUIRED");
    // The RPC is transactional, so the database is untouched — but the auth
    // user created a step earlier would be orphaned without this.
    expect(mockDeleteUser).toHaveBeenCalledWith("new-gamer-id");
  });
});
