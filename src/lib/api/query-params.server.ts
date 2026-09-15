import type { z } from "zod";

/**
 * Validate a request's query string against its contract schema — the query
 * counterpart of `json-body.server.ts`, and the same rule: the shape a route
 * accepts is a schema in the feature's `*.contracts.ts`, never a pile of
 * hand-rolled `searchParams.get()` checks.
 *
 * It returns a discriminated result rather than a ready-made `NextResponse`,
 * which is the one place it departs from the body helper. There is more than
 * one error envelope on the route surface — the app answers `{ error: string }`
 * and the partner API answers `{ error: { code, message } }` — and a helper
 * that builds the response would have to pick one for every caller. Framing the
 * failure and leaving the envelope to the route keeps both honest.
 *
 * A repeated parameter collapses to its last value. The schema is the contract,
 * and no contract in this repo takes a list on the query string; a caller that
 * sends one gets the reading a browser form would have produced rather than an
 * error about a shape nothing documents.
 */
export type QueryParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Generic over the schema rather than over its output type: a query schema
 * gives `limit` a default, so what it accepts and what it produces are
 * different types, and a `ZodType<T>` parameter can only name one of them.
 */
export function parseSearchParams<S extends z.ZodTypeAny>(
  url: string,
  schema: S,
): QueryParseResult<z.infer<S>> {
  const params = Object.fromEntries(new URL(url).searchParams);
  const parsed = schema.safeParse(params);
  if (parsed.success) return { ok: true, data: parsed.data };

  // The first issue only: a caller fixes one parameter at a time, and the
  // message names the parameter it is about.
  const issue = parsed.error.issues[0];
  const path = issue.path.join(".");
  return {
    ok: false,
    message: path === "" ? issue.message : `${path}: ${issue.message}`,
  };
}
