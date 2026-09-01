import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Service-role client — bypasses RLS. Use for setup/teardown and assertions.
 */
export function createAdminTestClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Unauthenticated client — carries the `anon` role, so it sees exactly the
 * public surface. Use to prove a public read policy or predicate really is
 * reachable (or not) without a session.
 */
export function createAnonTestClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Signs in via Supabase Auth and returns a client that respects RLS.
 * Each call creates a fresh client instance (no shared session state).
 */
export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }

  return client;
}

/**
 * Signs in and returns the raw access token, for callers that need to hit
 * PostgREST directly rather than through the typed supabase-js client.
 */
export async function accessTokenFor(
  email: string,
  password: string
): Promise<string> {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }

  return data.session.access_token;
}

/** What PostgREST said: the HTTP status plus the PostgreSQL SQLSTATE, if any. */
export interface RawRestResult {
  status: number;
  /** SQLSTATE from the PostgREST error body — `null` when the call succeeded. */
  code: string | null;
  message: string | null;
}

/**
 * Calls an RPC over PostgREST with an arbitrary argument object.
 *
 * The typed `supabase.rpc()` helper cannot express the role × RPC matrix's
 * calling convention — deliberately passing `null` for every parameter, so the
 * call reaches the function's guard without per-RPC fixtures — because the
 * generated argument types forbid it, and casting around them would be the
 * suppression the code-style rule warns about. This posts the same request the
 * browser posts, and hands back the SQLSTATE the matrix asserts on.
 */
export async function callRpcRaw(
  accessToken: string,
  functionName: string,
  args: Record<string, unknown>
): Promise<RawRestResult> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  return readRestResult(response);
}

/**
 * Calls an RPC as `service_role` with an arbitrary argument object, and hands
 * back the JSON it returned.
 *
 * Same reason `callRpcRaw` exists one function up — the generated argument
 * types cannot express a NULL that a SQL parameter genuinely accepts, and
 * casting around them is the suppression the code-style rule warns about — but
 * for the service-role RPCs, where the RESULT is the thing under test rather
 * than the SQLSTATE of a refusal. A raise still throws, because a test asking
 * what a function answered has nothing to say about a call that never ran.
 */
export async function callServiceRoleRpcRaw(
  functionName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(
      `${functionName} failed: ${response.status} ${await response.text()}`
    );
  }
  return response.json();
}

/**
 * Calls an RPC as `service_role` with an arbitrary argument object and hands
 * back what PostgREST said, refusal included.
 *
 * The third member of the family above, and it exists for the one shape neither
 * of the others covers: a service-role-only RPC whose REFUSAL is the thing under
 * test. `callRpcRaw` needs a user's access token, which a service-role-only
 * function has no caller for; `callServiceRoleRpcRaw` throws on an error, which
 * is exactly the answer being asserted here. The argument that forces a raw call
 * is the same one both of them name — a NULL *inside* an array is a value the
 * generated types cannot express and casting around them would be the
 * suppression the code-style rule warns about — and a NULL element is precisely
 * what the consent gate has to refuse.
 */
export async function callServiceRoleRpcResult(
  functionName: string,
  args: Record<string, unknown>
): Promise<RawRestResult> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  return readRestResult(response);
}

/**
 * PATCHes rows over PostgREST with an arbitrary body, for the same reason
 * `callRpcRaw` exists two functions up: some values a test has to send are ones
 * the generated types forbid, and that prohibition is frequently the very
 * guarantee under test.
 *
 * An enum column is the clearest case. Since 00199 the compiler will not let
 * `profiles.spoken_languages` be written with a language we do not offer — but
 * `authenticated` holds a column-level UPDATE grant on it, so a hand-written
 * request is a real path a real caller has, and proving the *database* refuses
 * needs a request built without the generated types rather than a cast around
 * them.
 *
 * `path` is everything after `/rest/v1/`, filter included — e.g.
 * `profiles?id=eq.<uuid>`.
 */
export async function patchRaw(
  accessToken: string,
  path: string,
  body: Record<string, unknown>
): Promise<RawRestResult> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return readRestResult(response);
}

async function readRestResult(response: Response): Promise<RawRestResult> {
  if (response.ok) {
    return { status: response.status, code: null, message: null };
  }

  const body: unknown = await response.json().catch(() => null);
  const error =
    body !== null && typeof body === "object"
      ? (body as { code?: unknown; message?: unknown })
      : {};

  return {
    status: response.status,
    code: typeof error.code === "string" ? error.code : null,
    message: typeof error.message === "string" ? error.message : null,
  };
}
