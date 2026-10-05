import { withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createBearerClient } from "@/lib/supabase/bearer";
import { getOrigin } from "@/lib/url";
import type { AppSupabaseClient, UserRole } from "@/types";

/** Where the MCP endpoint is served, relative to the app's origin. */
export const MCP_ENDPOINT_PATH = "/api/mcp";

/**
 * Where the endpoint's protected-resource metadata (RFC 9728) is served: the
 * well-known prefix inserted before the endpoint's own path, which is the form
 * the spec derives from a resource URL that has a path. The 401 names it
 * outright, so a client never has to guess.
 */
export const MCP_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_ENDPOINT_PATH}`;

/**
 * The issuer every token this endpoint accepts must name: the project's own
 * Auth server, which is also the authorization server the metadata advertises.
 */
export function mcpTokenIssuer(): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1`;
}

/** Who the token belongs to, as the tools read it off `ctx.http.authInfo`. */
export interface McpCaller {
  userId: string;
  email: string | null;
  role: UserRole;
}

/**
 * What one bearer token is, decided afresh on every request:
 *
 * - `invalid` — not a token this endpoint takes at all: missing, bad signature,
 *   expired, minted by another issuer, or a first-party session token rather
 *   than one an OAuth client was granted. Answered 401, which sends a client
 *   back through sign-in.
 * - `forbidden` — a genuine grant to someone who is not an admin. Answered 403,
 *   and never as a scope challenge: no scope a client could ask for would make
 *   the caller an admin, so inviting it to step up would only loop.
 * - `admin` — let through, carrying the token and who it names.
 */
export type McpTokenVerdict =
  | { kind: "invalid"; reason: string }
  | { kind: "forbidden"; reason: string }
  | { kind: "admin"; authInfo: AuthInfo; caller: McpCaller };

/**
 * Verify a bearer token presented to the MCP endpoint, in this order:
 *
 * 1. **Signature and expiry**, through `getClaims` — against the project's
 *    published keys, so it costs no Auth round trip where the keys are
 *    asymmetric.
 * 2. **Issuer** — the project's own Auth server and no other.
 * 3. **`client_id` present.** Supabase stamps it on every token its OAuth server
 *    issues and on no first-party session token, so this is what refuses a
 *    browser session's token lifted out of a cookie and presented as a bearer:
 *    the endpoint is for granted clients only, each one a grant the admin
 *    approved on the consent page.
 * 4. **The caller's role, read now**, on a client bound to the token itself, so
 *    the read runs under that user's own row policies. A grant outlives a
 *    role change, which is why this is re-read on every request rather than
 *    trusted from when the grant was made.
 */
export async function verifyMcpAccessToken(
  token: string | undefined,
): Promise<McpTokenVerdict> {
  if (!token) return { kind: "invalid", reason: "no bearer token" };

  const supabase = createBearerClient(token);
  const claims = await readVerifiedClaims(supabase, token);
  if (!claims?.sub) {
    return { kind: "invalid", reason: "the token did not verify" };
  }

  if (claims.iss !== mcpTokenIssuer()) {
    return { kind: "invalid", reason: "the token names another issuer" };
  }

  const clientId: unknown = claims.client_id;
  if (typeof clientId !== "string" || clientId === "") {
    return { kind: "invalid", reason: "the token was not issued to an OAuth client" };
  }

  const role = await readRole(supabase, claims.sub);
  if (role !== "admin") {
    return { kind: "forbidden", reason: "the caller is not an admin" };
  }

  const scope: unknown = claims.scope;
  const caller: McpCaller = {
    userId: claims.sub,
    email: claims.email ?? null,
    role,
  };
  return {
    kind: "admin",
    caller,
    authInfo: {
      token,
      clientId,
      scopes: typeof scope === "string" ? scope.split(" ").filter(Boolean) : [],
      expiresAt: claims.exp,
      extra: { ...caller },
    },
  };
}

/**
 * The token's claims once its signature and expiry check out, or null when
 * they do not. `getClaims` returns most refusals as an error but throws a
 * plain `Error` for an expired token, and an expired token is the one every
 * client presents an hour into its grant: it has to read as a refusal, so the
 * client gets the 401 that sends it to refresh, never the 500 that tells it we
 * are down.
 */
async function readVerifiedClaims(supabase: AppSupabaseClient, token: string) {
  try {
    const { data, error } = await supabase.auth.getClaims(token);
    return error ? null : (data?.claims ?? null);
  } catch {
    return null;
  }
}

/**
 * The caller's current role, or null when their profile cannot be read — which
 * on a token that verified means there is no profile to read, and so no admin.
 */
async function readRole(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<UserRole | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // A failed read is a server fault, not a verdict about the caller: thrown,
    // and answered 500 by the gate, so the caller is not sent to sign in again
    // over our outage.
    throw new Error(`profile read failed: ${error.message}`);
  }
  return data?.role ?? null;
}

/**
 * Read the caller back out of the auth info a verified request carries. The
 * tools take it from here rather than from the token, so they see exactly what
 * the gate decided.
 */
export function readMcpCaller(authInfo: AuthInfo | undefined): McpCaller | null {
  const extra = authInfo?.extra;
  if (!extra) return null;
  const { userId, email, role } = extra;
  if (typeof userId !== "string" || role !== "admin") return null;
  return { userId, email: typeof email === "string" ? email : null, role };
}

const FORBIDDEN_BODY = {
  error: "forbidden",
  error_description: "This MCP server is for School of Gaming admins only.",
} as const;

/**
 * Gate an MCP handler to admins holding an OAuth grant — the endpoint's whole
 * authorization, run on every request.
 *
 * mcp-handler's `withMcpAuth` owns the bearer parse and the 401 challenge, whose
 * `resource_metadata` is what lets a client with nothing but the URL find the
 * authorization server; its origin comes from `getOrigin`, never from the
 * forwarding headers the library would otherwise trust. The 403 is ours:
 * `withMcpAuth` turns anything its verifier throws into a 401, so a grant held
 * by a non-admin is let through it and refused here, after it.
 */
export function withMcpAdmin(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    // What the verifier decided, for the handler wrapped inside it to act on:
    // the verdict, or `null` when verification itself failed.
    let verdict: McpTokenVerdict | null = null;

    const authenticated = withMcpAuth(
      async (req) => {
        if (verdict === null) {
          return Response.json({ error: "server_error" }, { status: 500 });
        }
        if (verdict.kind !== "admin") {
          return Response.json(FORBIDDEN_BODY, { status: 403 });
        }
        return handler(req);
      },
      async (_req, bearerToken) => {
        try {
          verdict = await verifyMcpAccessToken(bearerToken);
        } catch (error) {
          console.error("[mcp] token verification failed:", error);
          verdict = null;
        }
        if (verdict?.kind === "invalid") return undefined;
        if (verdict?.kind === "admin") return verdict.authInfo;
        // A forbidden caller is still a verified one, and so is a caller whose
        // verification failed on our side: passing through is what gets each to
        // its own answer above rather than to a 401 telling it to sign in again.
        return { token: bearerToken ?? "", clientId: "", scopes: [] };
      },
      {
        required: true,
        resourceUrl: getOrigin(request),
        resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
      },
    );

    return authenticated(request);
  };
}
