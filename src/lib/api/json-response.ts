import { z } from "zod";

/**
 * Parse a JSON API response body against its contract schema.
 *
 * Service-layer counterpart to the route's request-body schema: both ends of
 * an internal API call import their schemas from the feature's
 * `*.contracts.ts` file, so the request and response shapes can't drift
 * between the route and the service that calls it.
 *
 * Throws (ZodError) when the body doesn't match — an internal API returning
 * a malformed payload is a bug we want to surface loudly, not pass through.
 */
export async function parseJsonResponse<T>(
  response: Response,
  schema: z.ZodType<T>
): Promise<T> {
  return schema.parse(await response.json());
}

const errorBody = z.object({ error: z.string() });

/**
 * Read the `{ error: string }` message our API routes return on failure,
 * falling back when the body is missing, malformed, or not JSON at all.
 */
export async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const parsed = errorBody.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error : fallback;
}
