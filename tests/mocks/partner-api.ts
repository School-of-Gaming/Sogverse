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

// ---------------------------------------------------------------------------
// Reading a request back
// ---------------------------------------------------------------------------

/** Every URL the fake was asked for on `table`, in request order. */
export function readsOf(fetchMock: FetchMock | undefined, table: string): URL[] {
  return (fetchMock?.mock.calls ?? [])
    .map(([input]) => requestedUrl(input))
    .filter((url) => url.pathname.endsWith(`/${table}`));
}

/** The values of an `in.(…)` filter on a column; none when there is no such filter. */
export function inList(url: URL, column: string): string[] {
  const value = url.searchParams.get(column) ?? "";
  return /^in\.\((.*)\)$/.exec(value)?.[1].split(",") ?? [];
}

/** Every PostgREST `op.value` filter on a column, split. */
export function columnFilters(url: URL, column: string): { op: string; value: string }[] {
  return url.searchParams.getAll(column).map((raw) => {
    const at = raw.indexOf(".");
    return { op: raw.slice(0, at), value: raw.slice(at + 1) };
  });
}

// ---------------------------------------------------------------------------
// A table that evaluates its filters
// ---------------------------------------------------------------------------

/** The value or values at a dotted path, reading through embedded arrays. */
function valuesAt(value: unknown, path: readonly string[]): unknown[] {
  if (path.length === 0) return [value];
  if (Array.isArray(value)) return value.flatMap((item) => valuesAt(item, path));
  if (typeof value !== "object" || value === null) return [];
  const entry = Object.entries(value).find(([name]) => name === path[0]);
  return entry === undefined ? [] : valuesAt(entry[1], path.slice(1));
}

function matches(operator: string, operand: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  switch (operator) {
    case "eq":
      return value === operand;
    case "gt":
      return value > operand;
    case "gte":
      return value >= operand;
    case "lte":
      return value <= operand;
    case "in":
      return operand
        .slice(1, -1)
        .split(",")
        .map((item) => item.replace(/^"|"$/g, ""))
        .includes(value);
    default:
      throw new Error(`the fixture does not evaluate the ${operator} operator`);
  }
}

const NOT_FILTERS = new Set(["select", "order", "limit", "offset"]);

/**
 * A table handler that applies the request's filters, offset and limit to rows
 * already in the requested order — enough PostgREST for a read that filters
 * with `eq`, `gt`, `gte`, `lte` and `in`, and what lets a suite's fixtures be
 * the whole world rather than one answer per call. A filter on an embedded
 * column narrows the top-level rows, as an `!inner` embed makes it, and a null
 * never matches a comparison, as in SQL. An operator it does not evaluate
 * throws, so a read that starts sending one fails rather than passes.
 */
export function filteringTable(rows: readonly unknown[]): TableHandler {
  return (url) => {
    const filtered = rows.filter((row) =>
      [...url.searchParams].every(([name, expression]) => {
        if (NOT_FILTERS.has(name)) return true;
        const dot = expression.indexOf(".");
        const operator = expression.slice(0, dot);
        const operand = expression.slice(dot + 1);
        return valuesAt(row, name.split(".")).some((value) =>
          matches(operator, operand, value),
        );
      }),
    );
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = url.searchParams.get("limit");
    return filtered.slice(offset, limit === null ? undefined : offset + Number(limit));
  };
}
