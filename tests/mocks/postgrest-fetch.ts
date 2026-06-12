import { vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Fake-fetch transport for service unit tests.
 *
 * Instead of hand-mocking `.from().select()...` chains (which needs an unsafe
 * cast to pass as a SupabaseClient), tests inject a vitest-typed fetch mock
 * into a REAL typed client. The genuine query builder runs — URL construction,
 * filter encoding, response parsing — and the mock only supplies canned
 * PostgREST wire responses, so the tests exercise the real query path with
 * zero casts.
 */

export const TEST_SUPABASE_URL = "http://localhost:54321";

/** A fetch mock whose `mock.calls` carry real fetch parameter types. */
export type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

// Tests create a fresh client each; a unique storage key per instance keeps
// GoTrueClient from logging "multiple instances" warnings into test output.
let clientCounter = 0;

/** A real typed Supabase client whose only transport is the given fetch mock. */
export function createFetchStubbedClient(
  fetchMock: FetchMock,
): SupabaseClient<Database> {
  clientCounter += 1;
  return createClient<Database>(TEST_SUPABASE_URL, "test-anon-key", {
    global: { fetch: fetchMock },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `sb-test-${clientCounter}`,
    },
  });
}

/** A PostgREST JSON success (array for list queries, bare object for .single()). */
export function postgrestJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The PostgREST error wire shape; the client surfaces it as `{ error }`. */
export function postgrestError(message: string, status = 400): Response {
  return postgrestJson(
    { message, code: "ERROR", details: null, hint: null },
    status,
  );
}

/** The URL a captured fetch call requested, whatever form it was passed in. */
export function requestedUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}
