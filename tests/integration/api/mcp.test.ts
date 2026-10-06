import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_TEST_ORIGIN as ORIGIN, mcpRequest as rpc, readRpc } from "../../helpers/mcp";

/**
 * The MCP endpoint end to end inside the process: the real gate, the real
 * mcp-handler and SDK, the real tools — with only the token's claims and the
 * caller's profile mocked at the bearer client. Beside it, the endpoint's
 * protected-resource metadata, which sits outside `src/app/api/` and so is
 * covered here rather than by a registry entry.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: () => ({
    auth: { getClaims: mockGetClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

import { GET, POST } from "@/app/api/mcp/route";
import {
  GET as getMetadata,
  OPTIONS as optionsMetadata,
} from "@/app/.well-known/oauth-protected-resource/api/mcp/route";

const SUPABASE_URL = "https://project.supabase.co";
const USER_ID = "8f1c2a8e-6c1b-4a7e-9a52-2d0d3c6e9b11";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const EXP = 2_000_000_000;

function signedInAs(role: string, overrides: Record<string, unknown> = {}) {
  mockGetClaims.mockResolvedValue({
    data: {
      claims: {
        sub: USER_ID,
        email: "admin@example.com",
        iss: `${SUPABASE_URL}/auth/v1`,
        exp: EXP,
        client_id: CLIENT_ID,
        scope: "email",
        ...overrides,
      },
    },
    error: null,
  });
  mockMaybeSingle.mockResolvedValue({ data: { role }, error: null });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  mockGetClaims.mockReset();
  mockMaybeSingle.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/mcp", () => {
  it("answers an unauthenticated initialize with the 401 a client discovers from", async () => {
    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "initialize" }, null));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });

  it("refuses a non-admin's grant with a 403", async () => {
    signedInAs("customer");

    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));

    expect(response.status).toBe(403);
  });

  it("refuses a first-party session token with a 401", async () => {
    signedInAs("admin", { client_id: undefined });

    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));

    expect(response.status).toBe(401);
  });

  it("answers an expired token with the 401 challenge that sends a client to refresh", async () => {
    // What getClaims does with an expired token: throws, rather than returning
    // an error as it does for every other refusal.
    mockGetClaims.mockRejectedValue(new Error("JWT has expired"));

    const response = await POST(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("gates GET as well", async () => {
    const response = await GET(rpc(null, null, "GET"));

    expect(response.status).toBe(401);
  });

  it("initializes for an admin", async () => {
    signedInAs("admin");

    const response = await POST(
      rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
    );

    expect(response.status).toBe(200);
    const body = await readRpc(response);
    expect(body.result).toMatchObject({ serverInfo: { name: "sogverse" } });
  });

  it("lists every tool, each stating its annotations", async () => {
    signedInAs("admin");

    const body = await readRpc(
      await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })),
    );

    const tools = z
      .object({
        tools: z.array(
          z.object({
            name: z.string(),
            annotations: z.object({
              readOnlyHint: z.boolean(),
              destructiveHint: z.boolean(),
              idempotentHint: z.boolean(),
              openWorldHint: z.boolean(),
            }),
          }),
        ),
      })
      .parse(body.result).tools;
    expect(tools.map((tool) => tool.name)).toEqual([
      "whoami",
      "list_library_articles",
      "get_library_article",
      "list_library_categories",
      "get_library_preview_link",
      "create_library_article",
      "save_library_article_version",
      "set_library_article_category",
      "publish_library_article",
      "unpublish_library_article",
      "list_library_covers",
      "set_library_article_cover",
      "open_cover_uploader",
      "upload_library_cover",
      "list_landing_pages",
      "get_landing_page",
      "get_landing_page_preview_link",
      "create_landing_page",
      "save_landing_page_structure",
      "save_landing_page_text",
      "remove_landing_page_language",
      "publish_landing_page",
      "unpublish_landing_page",
      "list_landing_images",
      "set_landing_section_image",
      "open_landing_image_uploader",
      "upload_landing_image",
    ]);
    expect(tools.find((tool) => tool.name === "whoami")?.annotations.readOnlyHint).toBe(true);
  });

  it("answers whoami with the admin, the client, the server and the expiry", async () => {
    signedInAs("admin");

    const body = await readRpc(
      await POST(
        rpc({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "whoami", arguments: {} },
        }),
      ),
    );

    expect(body.result).toMatchObject({
      structuredContent: {
        userId: USER_ID,
        email: "admin@example.com",
        role: "admin",
        clientId: CLIENT_ID,
        server: ORIGIN,
        tokenExpiresAt: new Date(EXP * 1000).toISOString(),
      },
    });
  });
});

describe("/.well-known/oauth-protected-resource/api/mcp", () => {
  it("names the endpoint on the trusted origin and the project's Auth server", async () => {
    const response = getMetadata(
      new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`, {
        headers: { host: "localhost:3000" },
      }),
    );

    expect(await response.json()).toMatchObject({
      resource: `${ORIGIN}/api/mcp`,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      scopes_supported: ["email"],
    });
  });

  it("ignores an untrusted host, so the document cannot point elsewhere", async () => {
    const response = getMetadata(
      new Request("http://evil.example.com/.well-known/oauth-protected-resource/api/mcp", {
        headers: { host: "evil.example.com", "x-forwarded-host": "evil.example.com" },
      }),
    );

    expect((await response.json()).resource).toBe(`${ORIGIN}/api/mcp`);
  });

  it("answers a browser client's preflight", () => {
    const response = optionsMetadata();

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
