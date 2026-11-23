import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Pool, type Dispatcher } from "undici";
import type { Database } from "@/types/database.types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const stackOrigin = new URL(supabaseUrl).origin;

/**
 * The one connection pool every request this test process makes to the stack
 * travels through, so sockets are reused rather than opened per request.
 *
 * It works around an undici bug, nodejs/undici#5022: the `Agent` behind Node's
 * global `fetch` keys its per-origin bookkeeping by origin rather than by pool,
 * so when Kong retires a socket (it closes one after its hundredth request) the
 * old pool's late disconnect closes the new pool for that origin, and the
 * cascade runs on — every later request opens a connection and closes it after
 * one use. Across a full run that left thousands of client ports in TIME_WAIT
 * and slowed the run. A `Pool` for the single origin has no such bookkeeping
 * and reuses its sockets.
 *
 * It can go once the undici bundled with Node (`process.versions.undici`)
 * carries the fix, nodejs/undici#5034, which has landed only on undici's v8
 * line: the DB tests then use the platform's `fetch` as it comes.
 *
 * The requests themselves stay on the platform's `fetch`, handed this pool as
 * its dispatcher. The `undici` package's own `fetch` cannot carry them: it does
 * not recognise the platform's `FormData`, which storage uploads send, and posts
 * it as the text "[object FormData]". Because the pool is handed to Node's own
 * `fetch`, the `undici` package's major must match the major Node bundles
 * (`process.versions.undici`).
 */
const stackConnections = new Pool(stackOrigin);

/** Node's `fetch` takes a `dispatcher`, which the DOM's `RequestInit` does not name. */
type NodeFetch = (
  input: RequestInfo | URL,
  init: RequestInit & { dispatcher: Dispatcher }
) => Promise<Response>;
const platformFetch: NodeFetch = globalThis.fetch;

/**
 * `fetch` for requests to the stack, over the shared pool. Every DB-test
 * client and raw request uses it. A pool sends whatever it is handed to its own
 * host, so a URL on any other origin is refused rather than misdelivered, and a
 * redirect is an error unless the caller asks for it by `redirect: "manual"`:
 * following one would send its target to the stack as well.
 */
export const dbTestFetch: typeof fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== stackOrigin) {
    throw new Error(`dbTestFetch only reaches ${stackOrigin}, not ${url.origin}`);
  }
  return platformFetch(input, {
    redirect: "error",
    ...init,
    dispatcher: stackConnections,
  });
};

/** Ends the shared pool; the DB setup calls it once the file's tests are done. */
export function closeDbTestConnections(): Promise<void> {
  return stackConnections.destroy();
}

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: dbTestFetch },
};

/**
 * Service-role client — bypasses RLS. Use for setup/teardown and assertions.
 */
export function createAdminTestClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, clientOptions);
}

// The database's clock. The tests run on the host and the database in a WSL2
// kernel whose clock drifts seconds from the host's, so a time the database
// judges against its own `now()`, or a stamp it wrote, is read from its clock
// and never from this process's.

/** The client the clock is read through, built on the first read. */
let clockClient: SupabaseClient<Database> | undefined;

/** The database's clock as of this call, read fresh every time. */
export async function dbNow(): Promise<Date> {
  clockClient ??= createAdminTestClient();
  const { data, error } = await clockClient.rpc("db_clock");
  if (error) throw new Error(`Reading the database's clock failed: ${error.message}`);
  return new Date(data);
}

/**
 * The database's clock shifted by `offsetMs`. A past time stays past for the
 * database; a future one less than a minute ahead would race the test's own
 * runtime, so it throws.
 */
export async function dbTime(offsetMs: number): Promise<Date> {
  if (offsetMs > 0 && offsetMs < 60_000) {
    throw new Error(
      `dbTime(${offsetMs}): a future time under a minute ahead can pass while the test runs`
    );
  }
  return new Date((await dbNow()).getTime() + offsetMs);
}

/**
 * Runs `act` between two reads of the database's clock: anything the database
 * stamped during it lies within [notBefore, notAfter]. `notAfter` carries one
 * extra millisecond because Postgres stamps in microseconds and a Date floors
 * them.
 */
export async function dbInterval<T>(
  act: () => Promise<T>
): Promise<{ result: T; notBefore: Date; notAfter: Date }> {
  const notBefore = await dbNow();
  const result = await act();
  const after = await dbNow();
  return { result, notBefore, notAfter: new Date(after.getTime() + 1) };
}

/**
 * `YYYY-MM-DD`, the UTC calendar day `offsetDays` days from `from`'s. Fixture
 * products run in UTC, so from a `dbNow()` reading this is the product's own
 * calendar.
 */
export function utcDayOffset(from: Date, offsetDays: number): string {
  return new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + offsetDays),
  )
    .toISOString()
    .slice(0, 10);
}

/** Twelve random hex characters, for emails and names that must not collide. */
export function uniqueSuffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

/**
 * Unauthenticated client — carries the `anon` role, so it sees exactly the
 * public surface. Use to prove a public read policy or predicate really is
 * reachable (or not) without a session.
 */
export function createAnonTestClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, clientOptions);
}

/**
 * Signs in via Supabase Auth and returns a client that respects RLS.
 * Each call creates a fresh client instance (no shared session state).
 */
export async function createAuthenticatedClient(
  email: string,
  password: string,
  /**
   * Stands in for the network, to fail chosen requests. What it lets through
   * goes on to `dbTestFetch`.
   */
  customFetch?: typeof fetch
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(supabaseUrl, anonKey, {
    ...clientOptions,
    global: { fetch: customFetch ?? dbTestFetch },
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
  const client = createClient(supabaseUrl, anonKey, clientOptions);

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
  const response = await dbTestFetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
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
  const response = await dbTestFetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
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
  const response = await dbTestFetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
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
 * An enum column is the clearest case. The compiler will not let
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
  const response = await dbTestFetch(`${supabaseUrl}/rest/v1/${path}`, {
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

/** An AI app's grant, as the MCP endpoint's callers hold one. */
export interface OAuthGrant {
  /** The OAuth client registered for the grant — the token's `client_id`. */
  clientId: string;
  /** An access token carrying the `client_id` claim. */
  accessToken: string;
  /** The user's own session, which approved the grant and can revoke it. */
  user: SupabaseClient<Database>;
}

/**
 * Registers an OAuth client with the stack's Supabase Auth OAuth server and
 * walks one user through the whole authorization-code flow, PKCE included,
 * returning the access token an AI app would hold: an ordinary user JWT plus
 * the `client_id` claim. Nothing is signed by hand, so the claim is exactly
 * what Supabase Auth issues.
 *
 * The client is registered through the Admin API; call `revokeOAuthGrant` in
 * teardown.
 */
export async function oauthGrantFor(
  email: string,
  password: string,
  clientName: string
): Promise<OAuthGrant> {
  const admin = createAdminTestClient();
  const redirectUri = "http://127.0.0.1:9/callback";

  const registered = await admin.auth.admin.oauth.createClient({
    client_name: clientName,
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: "none",
  });
  if (registered.error) {
    throw new Error(`Registering ${clientName} failed: ${registered.error.message}`);
  }
  const clientId = registered.data.client_id;

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  // The authorize step answers with a redirect to the consent page, naming the
  // pending authorization.
  const authorize = await dbTestFetch(
    `${supabaseUrl}/auth/v1/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "db-test",
    })}`,
    { headers: { apikey: anonKey }, redirect: "manual" }
  );
  const consentPage = authorize.headers.get("location");
  const authorizationId =
    consentPage === null
      ? null
      : new URL(consentPage).searchParams.get("authorization_id");
  if (authorizationId === null) {
    throw new Error(`OAuth authorize gave no authorization (${authorize.status})`);
  }

  // The consent page's own two calls, on the user's session: reading the
  // authorization binds it to the reader, and only then can they approve it.
  const user = await createAuthenticatedClient(email, password);
  const details = await user.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) {
    throw new Error(`Reading the authorization failed: ${details.error.message}`);
  }
  const approved = await user.auth.oauth.approveAuthorization(authorizationId, {
    skipBrowserRedirect: true,
  });
  if (approved.error) {
    throw new Error(`Approving the authorization failed: ${approved.error.message}`);
  }
  const code = new URL(approved.data.redirect_url).searchParams.get("code");
  if (code === null) throw new Error("The approval carried no code");

  const exchanged = await dbTestFetch(`${supabaseUrl}/auth/v1/oauth/token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const token: unknown = await exchanged.json();
  const accessToken =
    token !== null && typeof token === "object" && "access_token" in token
      ? token.access_token
      : null;
  if (typeof accessToken !== "string") {
    throw new Error(`The token exchange failed (${exchanged.status})`);
  }

  return { clientId, accessToken, user };
}

/**
 * Undoes `oauthGrantFor`. Deleting a client through the Admin API only marks
 * it deleted and leaves its grant and session in place, so the user revokes
 * the grant first — which ends the app's session and its refresh token — and
 * signs out the session that approved it. The client and the grant stay
 * behind as deleted and revoked rows: no API removes them.
 */
export async function revokeOAuthGrant(grant: OAuthGrant): Promise<void> {
  const revoked = await grant.user.auth.oauth.revokeGrant({ clientId: grant.clientId });
  if (revoked.error) throw new Error(`Revoking the grant failed: ${revoked.error.message}`);
  const signedOut = await grant.user.auth.signOut({ scope: "local" });
  if (signedOut.error) throw new Error(`Signing out failed: ${signedOut.error.message}`);
  const { error } = await createAdminTestClient().auth.admin.oauth.deleteClient(
    grant.clientId
  );
  if (error) throw new Error(`Deleting OAuth client failed: ${error.message}`);
}

/**
 * A client acting on a raw access token rather than a signed-in session — how
 * an MCP tool reaches the database with an AI app's token.
 */
export function createBearerTestClient(
  accessToken: string
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, anonKey, {
    ...clientOptions,
    global: {
      fetch: dbTestFetch,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
