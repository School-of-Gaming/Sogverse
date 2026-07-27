import { describe, it, expect, vi, beforeEach } from "vitest";

// The highest-value public route on the surface: it creates an account, with no
// session in play, from a body a stranger controls. There is no wrong-role case
// — there is no role — so what this file covers instead is the shape of that
// power: the account it creates is never privileged, the auth user is created
// only after every rejectable precondition has been checked, a failed promotion
// leaves no orphaned auth user behind, and no database text reaches the caller.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockRpc = vi.fn();
const mockMinecraftLookupRow = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => mockMinecraftLookupRow() }) }),
    }),
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

import { POST } from "@/app/api/gedu/register/route";
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
    mockMinecraftLookupRow.mockResolvedValue({ data: null, error: null });
    mockLookupMinecraftUser.mockResolvedValue({ uuid: "mc-uuid-1" });
    mockCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    });
    mockRpc.mockResolvedValue({ error: null });
    mockDeleteUser.mockResolvedValue({ error: null });
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

  // -- Minecraft conflict --

  it("returns 409 for an already-linked Minecraft account, without creating the user", async () => {
    // Checked before createUser because createUser burns the email
    // irreversibly — the registrant can retry with a different Minecraft name.
    mockMinecraftLookupRow.mockResolvedValue({
      data: { user_id: "someone-else" },
      error: null,
    });

    const response = await POST(
      registerRequest({ ...validBody, minecraftUsername: "Notch" }),
    );

    expect(response.status).toBe(409);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns 409 and deletes the auth user when the RPC loses the Minecraft race", async () => {
    mockRpc.mockResolvedValue({
      error: { code: "23505", message: "duplicate key minecraft_uuid" },
    });

    const response = await POST(
      registerRequest({ ...validBody, minecraftUsername: "Notch" }),
    );

    expect(response.status).toBe(409);
    expect(mockDeleteUser).toHaveBeenCalledWith(NEW_USER_ID);
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
