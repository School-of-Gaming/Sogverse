import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/locations/materialize/route";

/**
 * Materialization is the only way a municipality reaches `locations`, so what
 * it must guarantee is narrow and worth pinning: it builds the chain the
 * catalog describes, it is idempotent, it refuses a code the catalog does not
 * contain, and a lost race resolves to the winner's row rather than an error.
 *
 * The catalog itself is NOT mocked — the route reads the real shipped
 * `fi.json`, which is the point: a test against a fake catalog would not catch
 * the shape drifting away from the generator's output. Finland's file is small,
 * and Helsinki (kunta 091, under maakunta 01 Uusimaa) is the fixture.
 */

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

interface FakeRow {
  id: string;
  name: string;
  name_i18n: null;
  type: string;
  parent_id: string | null;
  country_code: string | null;
  external_code: string | null;
  created_at: string;
  updated_at: string;
}

const TIMESTAMP = "2026-01-01T00:00:00.000Z";
const COUNTRY_ID = "00000000-0000-0000-0000-0000000000f1";
const REGION_ID = "00000000-0000-0000-0000-000000000001";
const HELSINKI_ID = "00000000-0000-0000-0000-000000000091";

function row(partial: Partial<FakeRow> & { id: string; name: string; type: string }): FakeRow {
  return {
    name_i18n: null,
    parent_id: null,
    country_code: "FI",
    external_code: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...partial,
  };
}

const FINLAND = row({ id: COUNTRY_ID, name: "Suomi", type: "country" });
const UUSIMAA = row({
  id: REGION_ID,
  name: "Uusimaa",
  type: "region",
  parent_id: COUNTRY_ID,
  external_code: "01",
});
const HELSINKI = row({
  id: HELSINKI_ID,
  name: "Helsinki",
  type: "municipality",
  parent_id: REGION_ID,
  external_code: "091",
});

/** The subset of a `locations` insert the route ever writes. */
interface InsertValues {
  name: string;
  type: string;
  parent_id: string | null;
  country_code: string | null;
  external_code?: string | null;
}

/**
 * A tiny in-memory stand-in for the `locations` table, supporting exactly the
 * two shapes the route uses: a filtered `select(...).maybeSingle()` and an
 * `insert(...).select().single()`.
 */
function createFakeTable(
  initial: FakeRow[],
  options: { conflictOnce?: FakeRow } = {},
) {
  const rows = [...initial];
  const inserted: InsertValues[] = [];
  let conflictPending = options.conflictOnce;

  function select() {
    const filters: ((r: FakeRow) => boolean)[] = [];
    const builder = {
      eq(column: keyof FakeRow, value: unknown) {
        filters.push((r) => r[column] === value);
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        const match = rows.find((r) => filters.every((f) => f(r))) ?? null;
        return Promise.resolve({ data: match, error: null });
      },
    };
    return builder;
  }

  function insert(values: InsertValues) {
    return {
      select: () => ({
        single: () => {
          // Simulate the concurrent writer: it lands the row we were about to
          // insert, and our own statement comes back as a unique violation.
          if (conflictPending && values.external_code === conflictPending.external_code) {
            rows.push(conflictPending);
            conflictPending = undefined;
            return Promise.resolve({
              data: null,
              error: { code: "23505", message: "duplicate key value" },
            });
          }
          inserted.push(values);
          const created = row({
            id: `generated-${inserted.length}`,
            name: values.name,
            type: values.type,
            parent_id: values.parent_id,
            country_code: values.country_code,
            external_code: values.external_code ?? null,
          });
          rows.push(created);
          return Promise.resolve({ data: created, error: null });
        },
      }),
    };
  }

  return {
    client: { from: vi.fn(() => ({ select, insert })) },
    inserted,
    rows,
  };
}

function mockAdmin(table: ReturnType<typeof createFakeTable>) {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: table.client,
  });
}

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/locations/materialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const HELSINKI_BODY = { country_code: "FI", external_code: "091" };

// --- Tests ---

describe("POST /api/admin/locations/materialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const table = createFakeTable([]);
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const res = await POST(createRequest(HELSINKI_BODY));

    expect(res.status).toBe(401);
    expect(table.inserted).toEqual([]);
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can add locations from the catalog" },
        { status: 403 },
      ),
    );

    const res = await POST(createRequest(HELSINKI_BODY));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only admins can add locations from the catalog");
  });

  it("returns 400 for a country with no shipped catalog", async () => {
    const table = createFakeTable([FINLAND]);
    mockAdmin(table);

    const res = await POST(
      createRequest({ country_code: "GB", external_code: "091" }),
    );

    expect(res.status).toBe(400);
    expect(table.inserted).toEqual([]);
  });

  it("returns 400 for a code the catalog does not contain", async () => {
    const table = createFakeTable([FINLAND]);
    mockAdmin(table);

    const res = await POST(
      createRequest({ country_code: "FI", external_code: "999999" }),
    );

    expect(res.status).toBe(400);
    expect(table.inserted).toEqual([]);
  });

  it("refuses a region-level code — only leaf codes identify an entry", async () => {
    // Finland's region "01" (Uusimaa) is a real catalog code, just not at leaf
    // depth. Matching it would materialize a maakunta as a municipality.
    const table = createFakeTable([FINLAND]);
    mockAdmin(table);

    const res = await POST(
      createRequest({ country_code: "FI", external_code: "01" }),
    );

    expect(res.status).toBe(400);
    expect(table.inserted).toEqual([]);
  });

  it("creates the missing chain and returns the municipality", async () => {
    // Only the country row is seeded, so both the region and the municipality
    // have to be built from the catalog.
    const table = createFakeTable([FINLAND]);
    mockAdmin(table);

    const res = await POST(createRequest(HELSINKI_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(table.client.from).toHaveBeenCalledWith("locations");
    expect(table.inserted).toEqual([
      {
        name: "Uusimaa",
        type: "region",
        parent_id: COUNTRY_ID,
        country_code: "FI",
        external_code: "01",
      },
      {
        name: "Helsinki",
        type: "municipality",
        parent_id: "generated-1",
        country_code: "FI",
        external_code: "091",
      },
    ]);
    expect(data).toMatchObject({
      name: "Helsinki",
      type: "municipality",
      external_code: "091",
      parent_id: "generated-1",
    });
  });

  it("creates the country row when even that is missing", async () => {
    const table = createFakeTable([]);
    mockAdmin(table);

    const res = await POST(createRequest(HELSINKI_BODY));

    expect(res.status).toBe(200);
    expect(table.inserted[0]).toEqual({
      name: "Finland",
      type: "country",
      parent_id: null,
      country_code: "FI",
    });
  });

  it("is idempotent — a second call inserts nothing", async () => {
    const table = createFakeTable([FINLAND, UUSIMAA, HELSINKI]);
    mockAdmin(table);

    const res = await POST(createRequest(HELSINKI_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(table.inserted).toEqual([]);
    expect(data.id).toBe(HELSINKI_ID);
  });

  it("resolves a lost unique-index race to the winner's row", async () => {
    // A concurrent materialization of the same commune lands Helsinki between
    // our read and our write; the 23505 must resolve to that row, not an error.
    const table = createFakeTable([FINLAND, UUSIMAA], {
      conflictOnce: HELSINKI,
    });
    mockAdmin(table);

    const res = await POST(createRequest(HELSINKI_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe(HELSINKI_ID);
    expect(table.inserted).toEqual([]);
  });
});
