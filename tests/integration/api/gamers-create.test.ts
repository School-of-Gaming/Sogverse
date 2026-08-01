import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { POST } from "@/app/api/gamers/create/route";
import { NextResponse } from "next/server";

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

const mockLookupMinecraftUser = vi.fn();
const mockIsValidMinecraftUsername = vi.fn();
vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: (...args: unknown[]) => mockLookupMinecraftUser(...args),
  isValidMinecraftUsername: (...args: unknown[]) => mockIsValidMinecraftUsername(...args),
}));

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
    mockIsValidMinecraftUsername.mockImplementation(
      (u: string) => /^[a-zA-Z0-9_]{3,16}$/.test(u),
    );
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

describe("POST /api/gamers/create — v1 minimal body (auto-generated credentials, optional gender)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a body with only firstName + dateOfBirth and auto-generates credentials", async () => {
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
        password: z.string(),
      })
      .parse(mockCreateUser.mock.calls[0][0]);
    // Opaque internal email local-part shape: "g" + 16 hex chars.
    expect(callArg.email).toMatch(/^g[0-9a-f]{16}@gamer\.sogverse\.internal$/);
    // Auto-generated password is a non-empty random string.
    expect(typeof callArg.password).toBe("string");
    expect(callArg.password.length).toBeGreaterThanOrEqual(16);
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

  it("deletes the orphaned auth user and returns a friendly 500 when the RPC fails", async () => {
    mockRpc.mockResolvedValue({ error: { code: "P0001", message: "boom" } });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    // The raw Postgres error text never reaches the client.
    expect(data.error).not.toContain("boom");
    expect(data.error).toBe("Something went wrong creating the gamer. Please try again.");
    // No code on any failure — the client has one localized generic and uses it.
    expect(data.code).toBeUndefined();
    expect(mockDeleteUser).toHaveBeenCalledWith("new-gamer-id");
  });

  it("answers a unique violation generically rather than naming Minecraft", async () => {
    // Nothing in create_gamer's Minecraft insert can raise 23505 any more, so a
    // unique violation reaching here means some *other* constraint — which the
    // route must not mislabel as a Minecraft conflict the way it used to.
    mockRpc.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Something went wrong creating the gamer. Please try again.");
    expect(data.code).toBeUndefined();
    expect(mockDeleteUser).toHaveBeenCalledWith("new-gamer-id");
  });
});
