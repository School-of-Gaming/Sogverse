import { vi } from "vitest";

import { requestedUrl, type FetchMock } from "./postgrest-fetch";

/**
 * Shared scaffolding for the partner API's integration suites: the issued key,
 * a request builder that speaks the partner's wire, and a PostgREST fake that
 * answers by table.
 *
 * The partner routes read through `partnerDb()`, which constructs the
 * service-role client, so a suite drives them by mocking the factory with a
 * real client over a fake transport:
 *
 *   const db = vi.hoisted(() => ({ fetch: undefined as FetchMock | undefined }));
 *   vi.mock("@/lib/supabase/admin", async () => {
 *     const { createFetchStubbedClient } = await import("../../mocks/postgrest-fetch");
 *     return { createAdminClient: () => createFetchStubbedClient(db.fetch!) };
 *   });
 *   beforeEach(() => { db.fetch = postgrestTables({ products: (url) => [...] }); });
 */

/** The key every partner suite stubs into `LYNX_PARTNER_API_KEY`. */
export const PARTNER_TEST_KEY = "test-lynx-partner-key-32-chars-min";

/**
 * A request to `/api/partner/<path>`. `authorization` defaults to the issued
 * key as a Bearer token; pass `null` to send no header at all, or a string to
 * send that header verbatim.
 */
export function partnerRequest(
  path: string,
  options: {
    query?: string;
    authorization?: string | null;
    method?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {};
  const authorization =
    options.authorization === undefined
      ? `Bearer ${PARTNER_TEST_KEY}`
      : options.authorization;
  if (authorization !== null) headers.Authorization = authorization;
  return new Request(
    `http://localhost:3000/api/partner/${path}${options.query ?? ""}`,
    { method: options.method ?? "GET", headers },
  );
}

/** What a table handler is given: the parsed request URL. */
export type TableHandler = (url: URL) => unknown[];

/**
 * A fetch mock answering PostgREST reads per table: the handler for the table
 * the URL names returns the rows, and the response carries an exact
 * `Content-Range` total equal to the number of rows returned — what a
 * `count: "exact"` select receives when the handler has already applied the
 * request's filters, order and limit.
 *
 * A read of a table with no handler answers a PostgREST error, so a suite fails
 * loudly on a read it did not expect instead of treating it as empty. Pass
 * `emptyTables` for a suite that wants every read to find nothing.
 */
export function postgrestTables(
  handlers: Readonly<Partial<Record<string, TableHandler>>>,
): FetchMock {
  return vi.fn<typeof fetch>(async (input) => {
    const url = requestedUrl(input);
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const handler = handlers[table] ?? handlers["*"];
    if (handler === undefined) {
      return new Response(
        JSON.stringify({
          message: `no fixture for table ${table}`,
          code: "TEST",
          details: null,
          hint: null,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
    const rows = handler(url);
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Range": rows.length === 0 ? "*/0" : `0-${rows.length - 1}/${rows.length}`,
      },
    });
  });
}

/** Handlers that answer every table with no rows. */
export const emptyTables: Readonly<Record<string, TableHandler>> = {
  "*": () => [],
};
