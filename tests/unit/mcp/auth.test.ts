import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The MCP endpoint's gate: which bearer tokens become an admin's auth info, and
 * what every other token is answered with. The Supabase client is mocked at the
 * bearer factory, so each case states exactly what the token's claims and the
 * caller's profile say.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: () => ({
    auth: { getClaims: mockGetClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

import { readMcpCaller, verifyMcpAccessToken, withMcpAdmin } from "@/lib/mcp/auth";

const SUPABASE_URL = "https://project.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const USER_ID = "8f1c2a8e-6c1b-4a7e-9a52-2d0d3c6e9b11";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";

function claims(overrides: Record<string, unknown> = {}) {
  return {
    sub: USER_ID,
    email: "admin@example.com",
    iss: ISSUER,
    exp: 2_000_000_000,
    client_id: CLIENT_ID,
    scope: "email",
    ...overrides,
  };
}

function tokenVerifies(overrides: Record<string, unknown> = {}) {
  mockGetClaims.mockResolvedValue({ data: { claims: claims(overrides) }, error: null });
}

function profileRole(role: string | null) {
  mockMaybeSingle.mockResolvedValue({ data: role ? { role } : null, error: null });
}

function mcpRequest(token?: string) {
  return new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: "{}",
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  mockGetClaims.mockReset();
  mockMaybeSingle.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifyMcpAccessToken", () => {
  it("lets an admin's OAuth token through, carrying who it names", async () => {
    tokenVerifies();
    profileRole("admin");

    const verdict = await verifyMcpAccessToken("token");

    expect(verdict.kind).toBe("admin");
    if (verdict.kind !== "admin") return;
    expect(verdict.authInfo).toMatchObject({
      token: "token",
      clientId: CLIENT_ID,
      scopes: ["email"],
      expiresAt: 2_000_000_000,
    });
    expect(readMcpCaller(verdict.authInfo)).toEqual({
      userId: USER_ID,
      email: "admin@example.com",
      role: "admin",
    });
  });

  it("refuses a token with no client_id — a first-party session token", async () => {
    tokenVerifies({ client_id: undefined });
    profileRole("admin");

    expect((await verifyMcpAccessToken("token")).kind).toBe("invalid");
    // Refused before the caller's role is so much as read.
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it("refuses a token from another issuer", async () => {
    tokenVerifies({ iss: "https://other-project.supabase.co/auth/v1" });
    profileRole("admin");

    expect((await verifyMcpAccessToken("token")).kind).toBe("invalid");
  });

  it("refuses a token that does not verify", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: new Error("bad signature") });

    expect((await verifyMcpAccessToken("token")).kind).toBe("invalid");
  });

  it("refuses no token at all without asking Supabase", async () => {
    expect((await verifyMcpAccessToken(undefined)).kind).toBe("invalid");
    expect(mockGetClaims).not.toHaveBeenCalled();
  });

  it("answers a non-admin's genuine grant as forbidden", async () => {
    tokenVerifies();
    profileRole("customer");

    expect((await verifyMcpAccessToken("token")).kind).toBe("forbidden");
  });

  it("answers a token naming no profile as forbidden", async () => {
    tokenVerifies();
    profileRole(null);

    expect((await verifyMcpAccessToken("token")).kind).toBe("forbidden");
  });
});

describe("withMcpAdmin", () => {
  const handler = vi.fn(async (_request: Request) => new Response("handled"));
  const gated = withMcpAdmin(handler);

  beforeEach(() => handler.mockClear());

  it("answers no token with a 401 naming the resource metadata", async () => {
    const response = await gated(mcpRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"',
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("builds the metadata URL from the trusted origin, never a forwarded host", async () => {
    const request = mcpRequest();
    request.headers.set("x-forwarded-host", "evil.example.com");

    const response = await gated(request);

    expect(response.headers.get("www-authenticate")).not.toContain("evil.example.com");
  });

  it("answers a token without client_id with a 401", async () => {
    tokenVerifies({ client_id: undefined });
    profileRole("admin");

    expect((await gated(mcpRequest("token"))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers a token from another issuer with a 401", async () => {
    tokenVerifies({ iss: "https://other-project.supabase.co/auth/v1" });
    profileRole("admin");

    expect((await gated(mcpRequest("token"))).status).toBe(401);
  });

  it("answers a non-admin with a 403 that is no scope challenge", async () => {
    tokenVerifies();
    profileRole("gedu");

    const response = await gated(mcpRequest("token"));

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers a failed role read with a 500 rather than sending the caller to sign in", async () => {
    tokenVerifies();
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await gated(mcpRequest("token"))).status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands an admin's request to the handler with its auth info", async () => {
    tokenVerifies();
    profileRole("admin");

    const response = await gated(mcpRequest("token"));

    expect(await response.text()).toBe("handled");
    expect(readMcpCaller(handler.mock.calls[0][0].auth)?.userId).toBe(USER_ID);
  });
});
