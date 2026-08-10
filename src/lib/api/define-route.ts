import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/api-error";
import { parseBodyValue, parseJsonBody } from "@/lib/api/json-body.server";
import type { AuthenticatedUser, Profile, UserRole } from "@/types";

/**
 * `defineRoute` — the HTTP route boundary primitive.
 *
 * See docs/route-boundary-architecture.md. It composes the existing boundary
 * primitives (the role gate, the contract-schema body parse, the ApiError
 * carrier) into one declaration so the conforming route is the shortest route
 * to write: declare the posture and the schemas, receive an already-narrowed
 * and already-validated context, return data.
 *
 * What it owns, and why each part is centralized here rather than per route:
 *
 *  - **Auth**, from the declared posture. A route cannot accidentally omit its
 *    gate, because the gate is a required field of the declaration.
 *  - **Parsing slots** for body, query and dynamic params. The body is read
 *    ONLY when a body schema is declared — a posture whose verifier needs the
 *    untouched raw text (any webhook) must not be wrapped, and this wrapper
 *    gives it no way to be consumed behind the handler's back.
 *  - **One error-code → HTTP status table**, overridable per route, so the same
 *    database error cannot mean 403 in one route and 500 in the next.
 *  - **One message-disclosure point.** By default the client gets a generic
 *    message for the status and the real one goes to the log. Forwarding the
 *    underlying message is a per-route opt-in that must carry its reason.
 *  - **An optional response schema**, validated on the way out (mismatch is a
 *    logged 500, never a malformed payload delivered to a client).
 *  - **A non-JSON escape hatch**: a handler that returns a `Response` has it
 *    passed through untouched — redirects, 204s and raw text stay possible.
 *
 * Postures the wrapper does NOT cover — webhook, api-key, signed-token and
 * optional-auth — are hand-written by design. They still must be classified in
 * the route posture registry, which is what keeps them honest.
 */

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/**
 * The default PostgreSQL / PostgREST error-code → HTTP status table. A route
 * that needs a different answer for one code overrides just that code; it does
 * not re-implement the table.
 */
const DEFAULT_ERROR_STATUS: Readonly<Partial<Record<string, number>>> = {
  // insufficient_privilege — a guard or an RLS policy refused the caller.
  "42501": 403,
  // unique_violation — the row already exists.
  "23505": 409,
  // no_data_found (raised by our guarded RPCs) and PostgREST's zero-row result.
  P0002: 404,
  PGRST116: 404,
  // foreign_key_violation / check_violation — the request itself is invalid.
  "23503": 400,
  "23514": 400,
  // assert_failure — an invariant the database expected to hold did not. Never
  // the caller's fault, so it is a logged server error.
  P0004: 500,
};

/**
 * What the client is told when the route has not opted into disclosure. Keyed
 * by status so the message never depends on the underlying failure.
 */
const GENERIC_ERROR_MESSAGE: Readonly<Partial<Record<number, string>>> = {
  400: "Invalid request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
};

const FALLBACK_ERROR_MESSAGE = "Internal server error";

function genericMessageFor(status: number): string {
  return GENERIC_ERROR_MESSAGE[status] ?? FALLBACK_ERROR_MESSAGE;
}

/** Read a string `code` off an unknown thrown value without asserting a type. */
function errorCodeOf(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("code" in value)) {
    return null;
  }
  return typeof value.code === "string" ? value.code : null;
}

/** Read a string `message` off an unknown thrown value. */
function errorMessageOf(value: unknown): string | null {
  if (value instanceof Error) return value.message;
  if (typeof value !== "object" || value === null || !("message" in value)) {
    return null;
  }
  return typeof value.message === "string" ? value.message : null;
}

// ---------------------------------------------------------------------------
// Posture declarations
// ---------------------------------------------------------------------------

/** The Supabase client the gate hands back, bound to the calling user. */
type UserBoundClient = Awaited<ReturnType<typeof createClient>>;

/** A profile whose `role` is narrowed to the roles the posture allows. */
type NarrowedProfile<R extends UserRole> = Omit<Profile, "role"> & { role: R };

interface RoleGatedPosture<R extends UserRole> {
  posture: "role-gated";
  /** Roles allowed past the gate. Narrows `profile.role` at the type level. */
  roles: R | readonly R[];
  /** Message returned with the 403. Defaults to a bare "Forbidden". */
  forbiddenMessage?: string;
  /** Skip the parent-PIN gate — for routes a locked customer must reach. */
  allowUnverified?: boolean;
  /** Refuse an unverified gedu — for gedu actions that are a trust boundary. */
  requireVerifiedGedu?: boolean;
}

interface AnyAuthenticatedPosture {
  posture: "any-authenticated";
  /**
   * Why role is irrelevant here. Any signed-in caller is allowed, so the usual
   * "which roles" question has no answer and the intent has to be written down.
   */
  reason: string;
}

interface PublicPosture {
  posture: "public";
  /** Why this route is reachable with no session at all. Mandatory. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Handler context
// ---------------------------------------------------------------------------

interface ParsedInput<TBody, TQuery, TParams> {
  /** The raw request. Present for header reads and origin resolution. */
  request: Request;
  /** The validated JSON body, or `undefined` when no body schema is declared. */
  body: TBody;
  /** The validated query string, or `undefined` when no query schema is declared. */
  query: TQuery;
  /** The validated dynamic route params, or `undefined` when none is declared. */
  params: TParams;
}

type RoleGatedContext<R extends UserRole, TBody, TQuery, TParams> = ParsedInput<
  TBody,
  TQuery,
  TParams
> & {
  user: AuthenticatedUser;
  profile: NarrowedProfile<R>;
  supabase: UserBoundClient;
};

type AnyAuthenticatedContext<TBody, TQuery, TParams> = ParsedInput<
  TBody,
  TQuery,
  TParams
> & {
  user: AuthenticatedUser;
  supabase: UserBoundClient;
};

type PublicContext<TBody, TQuery, TParams> = ParsedInput<TBody, TQuery, TParams>;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * What a handler may return: a value the wrapper serializes as JSON, a
 * `Response` it passes through untouched, or `undefined` for a 204.
 */
type HandlerResult<TResult> =
  | TResult
  | Response
  | undefined
  | Promise<TResult | Response | undefined>;

interface SharedRouteConfig<TBody, TQuery, TParams, TResult> {
  /**
   * Schema for the JSON request body. Declaring it is the ONLY thing that makes
   * the wrapper read the body — omit it and the request stream is untouched.
   */
  body?: z.ZodType<TBody>;
  /**
   * Schema for the query string, read as a flat string record.
   *
   * The input side is `unknown` rather than `TQuery`: a query string is always
   * strings, so a schema that has to produce anything else — a number, an enum
   * array out of a delimited parameter — necessarily transforms, and a schema
   * whose input and output are pinned to the same type cannot express that.
   */
  query?: z.ZodType<TQuery, z.ZodTypeDef, unknown>;
  /** Schema for the dynamic route params (Next.js's second handler argument). */
  params?: z.ZodType<TParams>;
  /** Schema the outgoing payload is validated against. Mismatch is a 500. */
  response?: z.ZodType<TResult>;
  /**
   * Per-route deviations from the default error-code table. Only the codes
   * listed here differ; everything else keeps the shared answer.
   */
  errorStatus?: Readonly<Partial<Record<string, number>>>;
  /**
   * Opt in to forwarding the underlying error message to the client, with the
   * reason as the value. Without this the client gets a generic message for
   * the status and the real one is logged — which is the default because an
   * underlying message can name rows, columns and identifiers the caller was
   * never shown.
   */
  discloseErrorMessages?: string;
}

type RouteConfig<
  R extends UserRole,
  TBody,
  TQuery,
  TParams,
  TResult,
> =
  | (SharedRouteConfig<TBody, TQuery, TParams, TResult> &
      RoleGatedPosture<R> & {
        handler: (
          context: RoleGatedContext<R, TBody, TQuery, TParams>,
        ) => HandlerResult<TResult>;
      })
  | (SharedRouteConfig<TBody, TQuery, TParams, TResult> &
      AnyAuthenticatedPosture & {
        handler: (
          context: AnyAuthenticatedContext<TBody, TQuery, TParams>,
        ) => HandlerResult<TResult>;
      })
  | (SharedRouteConfig<TBody, TQuery, TParams, TResult> &
      PublicPosture & {
        handler: (
          context: PublicContext<TBody, TQuery, TParams>,
        ) => HandlerResult<TResult>;
      });

/**
 * Next.js hands dynamic route handlers a second argument carrying the params
 * promise. It is optional here so integration tests can call a handler for a
 * static route with the request alone.
 */
interface RouteContextArgument {
  params: Promise<unknown>;
}

export type DefinedRouteHandler = (
  request: Request,
  context?: RouteContextArgument,
) => Promise<Response>;

// ---------------------------------------------------------------------------
// The wrapper
// ---------------------------------------------------------------------------

/**
 * The internal view of a config, with the per-route generics erased. The public
 * overload above is what route authors see; this is what the single engine
 * below operates on. `handler` is declared with method syntax deliberately —
 * the erased context has to accept every concrete context shape.
 */
interface ErasedRouteConfig {
  posture: "role-gated" | "any-authenticated" | "public";
  roles?: UserRole | readonly UserRole[];
  forbiddenMessage?: string;
  allowUnverified?: boolean;
  requireVerifiedGedu?: boolean;
  reason?: string;
  body?: z.ZodType<unknown>;
  query?: z.ZodType<unknown>;
  params?: z.ZodType<unknown>;
  response?: z.ZodType<unknown>;
  errorStatus?: Readonly<Partial<Record<string, number>>>;
  discloseErrorMessages?: string;
  handler(context: {
    request: Request;
    body: unknown;
    query: unknown;
    params: unknown;
    // Optional because a public route has none. The typed overload is what
    // decides whether a given handler may read them.
    user?: AuthenticatedUser;
    profile?: Profile;
    supabase?: UserBoundClient;
  }): unknown;
}

export function defineRoute<
  const R extends UserRole,
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
  TResult = unknown,
>(config: RouteConfig<R, TBody, TQuery, TParams, TResult>): DefinedRouteHandler;
export function defineRoute(config: ErasedRouteConfig): DefinedRouteHandler {
  return async (request, context) => {
    try {
      return await runRoute(config, request, context);
    } catch (error) {
      return toErrorResponse(error, config, request);
    }
  };
}

async function runRoute(
  config: ErasedRouteConfig,
  request: Request,
  context: RouteContextArgument | undefined,
): Promise<Response> {
  // --- Auth, from the declared posture -------------------------------------
  //
  // Runs before any parsing so an unauthorized caller is refused without the
  // route revealing which inputs it would have accepted.
  let identity: {
    user: AuthenticatedUser;
    profile?: Profile;
    supabase: UserBoundClient;
  } | null = null;

  if (config.posture === "role-gated") {
    const gate = await requireRole(config.roles ?? [], {
      forbiddenMessage: config.forbiddenMessage,
      allowUnverified: config.allowUnverified,
      requireVerifiedGedu: config.requireVerifiedGedu,
    });
    if (gate instanceof NextResponse) return gate;
    identity = gate;
  } else if (config.posture === "any-authenticated") {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;
    identity = session;
  }

  // --- Parsing slots -------------------------------------------------------
  const parsed = await parseInputs(config, request, context);
  if (parsed instanceof NextResponse) return parsed;

  // --- The handler ---------------------------------------------------------
  //
  // A public route has no identity; the erased context declares the auth
  // fields, and the typed overload is what stops a public handler from
  // reading them.
  const result = await config.handler({
    request,
    body: parsed.body,
    query: parsed.query,
    params: parsed.params,
    ...identity,
  });

  // --- Response ------------------------------------------------------------
  //
  // The escape hatch: anything the handler already shaped as a Response —
  // a redirect, a 204, raw text — is delivered untouched.
  if (result instanceof Response) return result;
  if (result === undefined) return new NextResponse(null, { status: 204 });

  if (config.response) {
    const validated = config.response.safeParse(result);
    if (!validated.success) {
      console.error(
        `[${routeLabel(request)}] response failed its schema:`,
        validated.error.message,
      );
      return NextResponse.json(
        { error: FALLBACK_ERROR_MESSAGE },
        { status: 500 },
      );
    }
    return NextResponse.json(validated.data);
  }

  return NextResponse.json(result);
}

/**
 * The any-authenticated gate: verify the session and hand back the caller's id
 * and their user-bound client. Deliberately does NOT load the profile — a
 * route that needs a role is role-gated, not any-authenticated.
 */
async function requireSession(): Promise<
  { user: AuthenticatedUser; supabase: UserBoundClient } | NextResponse
> {
  const supabase = await createClient();
  // Verifies the JWT locally against the project's JWKS — no auth round-trip,
  // and no profile read, because a route that needs a role is role-gated.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { user: { id: claims.sub, email: claims.email }, supabase };
}

async function parseInputs(
  config: ErasedRouteConfig,
  request: Request,
  context: RouteContextArgument | undefined,
): Promise<
  { body: unknown; query: unknown; params: unknown } | NextResponse
> {
  let params: unknown;
  if (config.params) {
    const raw = context ? await context.params : undefined;
    const validated = parseBodyValue(raw, config.params);
    if (validated instanceof NextResponse) return validated;
    params = validated;
  }

  let query: unknown;
  if (config.query) {
    // Flat string record. A repeated key collapses to its last value; a route
    // that needs list-valued query params declares a Response-returning handler
    // and reads the URL itself.
    const search = new URL(request.url).searchParams;
    const validated = parseBodyValue(
      Object.fromEntries(search.entries()),
      config.query,
    );
    if (validated instanceof NextResponse) return validated;
    query = validated;
  }

  let body: unknown;
  if (config.body) {
    const validated = await parseJsonBody(request, config.body);
    if (validated instanceof NextResponse) return validated;
    body = validated;
  }

  return { body, query, params };
}

/** The single point where a failure becomes a status and a client message. */
function toErrorResponse(
  error: unknown,
  config: ErasedRouteConfig,
  request: Request,
): Response {
  // A handler may throw a ready Response to short-circuit; honour it.
  if (error instanceof Response) return error;

  const label = routeLabel(request);
  const disclose = config.discloseErrorMessages !== undefined;

  if (error instanceof ApiError) {
    console.error(`[${label}] ${error.message}`);
    const message = disclose ? error.message : genericMessageFor(error.status);
    return NextResponse.json(
      error.code ? { error: message, code: error.code } : { error: message },
      { status: error.status },
    );
  }

  const code = errorCodeOf(error);
  if (code !== null) {
    const status =
      config.errorStatus?.[code] ?? DEFAULT_ERROR_STATUS[code] ?? 500;
    console.error(`[${label}] ${code}:`, errorMessageOf(error) ?? error);
    const message = disclose
      ? (errorMessageOf(error) ?? genericMessageFor(status))
      : genericMessageFor(status);
    return NextResponse.json({ error: message }, { status });
  }

  console.error(`[${label}] unhandled failure:`, error);
  return NextResponse.json({ error: FALLBACK_ERROR_MESSAGE }, { status: 500 });
}

function routeLabel(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "route";
  }
}
