import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/products/route";
import { encodeCursor } from "@/lib/api/partner-cursor.server";
import { partnerProductsResponse } from "@/services/partner/partner.contracts";
import type { FetchMock } from "../../mocks/postgrest-fetch";
import {
  PARTNER_TEST_KEY,
  emptyTables,
  inList,
  partnerRequest,
  postgrestTables,
  readsOf,
} from "../../mocks/partner-api";

// --- Mocks ---

const db = vi.hoisted(() => ({ fetch: undefined as FetchMock | undefined }));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFetchStubbedClient } = await import("../../mocks/postgrest-fetch");
  return {
    createAdminClient: () => {
      if (db.fetch === undefined) throw new Error("the database stub is not installed");
      return createFetchStubbedClient(db.fetch);
    },
  };
});

// --- Fixtures ---

/**
 * Noon UTC on 17 September. The runtime zone is pinned to UTC+14 below, where it
 * is already the 18th: a status derived from the runtime's calendar day instead
 * of the product's would call `RUNNING` (ending on the 17th in Helsinki)
 * completed.
 */
const NOW = new Date("2026-09-17T12:00:00Z");

const RUNNING = "10000000-0000-4000-8000-000000000001";
const PENDING = "10000000-0000-4000-8000-000000000002";
const COMPLETED = "10000000-0000-4000-8000-000000000003";
const EXPIRED = "10000000-0000-4000-8000-000000000004";
const RUNNING_2 = "10000000-0000-4000-8000-000000000005";
const GROUP_A = "50000000-0000-4000-8000-000000000001";
const GROUP_B = "50000000-0000-4000-8000-000000000002";

type ProductRow = {
  id: string;
  product_type: string;
  is_remote: boolean;
  for_gamers: boolean;
  for_parents: boolean;
  location_id: string | null;
  start_date: string | null;
  end_date: string | null;
  signup_threshold: number | null;
  timezone: string;
  min_age: number | null;
  max_age: number | null;
  created_at: string;
};

function product(id: string, overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id,
    product_type: "camp",
    is_remote: false,
    for_gamers: true,
    for_parents: false,
    location_id: "l-site",
    start_date: "2026-09-01",
    end_date: "2026-09-17",
    signup_threshold: null,
    timezone: "Europe/Helsinki",
    min_age: 13,
    max_age: 17,
    created_at: "2026-08-20T09:12:44.5+00:00",
    ...overrides,
  };
}

const CATALOGUE: ProductRow[] = [
  product(RUNNING),
  product(PENDING, {
    product_type: "consumer_club",
    is_remote: true,
    for_gamers: false,
    for_parents: true,
    location_id: null,
    start_date: "2026-10-01",
    end_date: null,
    min_age: null,
    max_age: null,
  }),
  product(COMPLETED, { start_date: "2026-06-01", end_date: "2026-08-01" }),
  // Its end date passed with its threshold never met: it never started.
  product(EXPIRED, { start_date: "2026-06-01", end_date: "2026-08-01", signup_threshold: 5 }),
  product(RUNNING_2, { location_id: null, is_remote: true, end_date: "2026-12-01" }),
];

const chainNode = (id: string, type: string, name: string, parent: unknown = null) => ({
  id,
  name,
  name_i18n: null,
  type,
  parent_id: null,
  country_code: "FI",
  external_code: null,
  parent,
});

/**
 * The fixture database: `products` answers the page read (scoped, keyset,
 * limited, as PostgREST would) and the keyed status read; every other table
 * answers the keys it was asked for.
 */
function tables(catalogue: ProductRow[] = CATALOGUE, { names = true } = {}) {
  return postgrestTables({
    products: (url) => {
      if (!url.searchParams.has("programme_terms.document_slug")) {
        const ids = inList(url, "id");
        return catalogue.filter((row) => ids.includes(row.id));
      }
      const after = url.searchParams.get("id")?.replace(/^gt\./, "");
      const limit = Number(url.searchParams.get("limit"));
      return catalogue
        .filter((row) => after === undefined || row.id > after)
        .slice(0, limit)
        .map((row) => ({
          ...row,
          programme_terms: [{ document_slug: "roblox-programme-terms" }],
        }));
    },
    product_seat_counts: (url) =>
      inList(url, "product_id").map((product_id) => ({ product_id, active_count: 0 })),
    product_translations: (url) =>
      (names ? inList(url, "product_id") : []).flatMap((product_id) => [
        { product_id, locale: "en", name: `Camp ${product_id.slice(-1)}` },
        { product_id, locale: "fi", name: `Leiri ${product_id.slice(-1)}` },
      ]),
    locations: () => [
      {
        ...chainNode(
          "l-site",
          "site",
          "Kaisaniemi school",
          chainNode("l-helsinki", "municipality", "Helsinki", chainNode("l-fi", "country", "Finland")),
        ),
        created_at: "2026-01-01T00:00:00+00:00",
        updated_at: "2026-01-01T00:00:00+00:00",
      },
    ],
    product_groups: (url) =>
      inList(url, "product_id").includes(RUNNING)
        ? [
            { id: GROUP_A, product_id: RUNNING, name: "Group A" },
            { id: GROUP_B, product_id: RUNNING, name: "Group B" },
          ]
        : [],
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/products", { query });
}

async function readPage(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return partnerProductsResponse.parse(await response.json());
}

/** The page read — the one `products` request that carries the scope filter. */
function pageReads(): URL[] {
  return readsOf(db.fetch, "products").filter((url) =>
    url.searchParams.has("programme_terms.document_slug"),
  );
}

// --- Tests ---

describe("GET /api/partner/v1/products", () => {
  let originalTZ: string | undefined;

  beforeEach(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    db.fetch = tables();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    process.env.TZ = originalTZ;
    db.fetch = undefined;
  });

  it("maps a product to the documented record", async () => {
    const body = await readPage();

    expect(body.data[0]).toEqual({
      id: RUNNING,
      name: { en: "Camp 1", fi: "Leiri 1" },
      type: "camp",
      delivery: "in_person",
      audience: { gamers: true, parents: false },
      location: { city: "Helsinki", country_code: "FI" },
      status: "running",
      start_date: "2026-09-01",
      end_date: "2026-09-17",
      timezone: "Europe/Helsinki",
      age_range: { min: 13, max: 17 },
      groups: [
        { id: GROUP_A, name: "Group A" },
        { id: GROUP_B, name: "Group B" },
      ],
      created_at: "2026-08-20T09:12:44.500Z",
    });
    expect(body.data[1]).toEqual({
      id: PENDING,
      name: { en: "Camp 2", fi: "Leiri 2" },
      type: "consumer_club",
      delivery: "online",
      audience: { gamers: false, parents: true },
      location: null,
      status: "pending",
      start_date: "2026-10-01",
      end_date: null,
      timezone: "Europe/Helsinki",
      age_range: null,
      groups: [],
      created_at: "2026-08-20T09:12:44.500Z",
    });
    expect(body.data.map((record) => [record.id, record.status])).toEqual([
      [RUNNING, "running"],
      [PENDING, "pending"],
      [COMPLETED, "completed"],
      [EXPIRED, "expired"],
      [RUNNING_2, "running"],
    ]);
    expect(body.next_cursor).toBeNull();
  });

  it("scopes the read to the Programme through the inner embed, in id order", async () => {
    await readPage();

    const [url] = pageReads();
    expect(url.searchParams.get("select")).toContain(
      "programme_terms:product_required_consents!inner(document_slug)",
    );
    expect(url.searchParams.get("programme_terms.document_slug")).toBe("eq.roblox-programme-terms");
    expect(url.searchParams.get("order")).toBe("id.asc");
  });

  it("answers an empty last page when the Programme has no products", async () => {
    db.fetch = postgrestTables(emptyTables);
    expect(await readPage()).toEqual({ data: [], next_cursor: null });
  });

  it("filters on the derived status", async () => {
    const body = await readPage("?status=running");
    expect(body.data.map((record) => record.id)).toEqual([RUNNING, RUNNING_2]);
    expect(body.next_cursor).toBeNull();

    expect((await readPage("?status=expired")).data.map((record) => record.id)).toEqual([EXPIRED]);
    expect((await readPage("?status=completed")).data.map((record) => record.id)).toEqual([COMPLETED]);
  });

  it("pages through the catalogue with next_cursor", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=2${cursor === null ? "" : `&cursor=${cursor}`}`;
      const body = await readPage(query);
      seen.push(...body.data.map((record) => record.id));
      cursor = body.next_cursor;
      pages += 1;
    } while (cursor !== null);

    expect(seen).toEqual(CATALOGUE.map((row) => row.id));
    expect(pages).toBe(3);
  });

  it("pages a derived filter without skipping a match behind a dropped row", async () => {
    // limit=1: the first page holds RUNNING and has to read past three products
    // of other statuses to learn that RUNNING_2 follows it.
    const first = await readPage("?status=running&limit=1");
    expect(first.data.map((record) => record.id)).toEqual([RUNNING]);
    expect(first.next_cursor).not.toBeNull();

    const second = await readPage(`?status=running&limit=1&cursor=${first.next_cursor}`);
    expect(second.data.map((record) => record.id)).toEqual([RUNNING_2]);
    expect(second.next_cursor).toBeNull();
  });

  it("refuses a cursor issued under different filters", async () => {
    const first = await readPage("?status=running&limit=1");
    const response = await GET(request(`?limit=1&cursor=${first.next_cursor}`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toContain("cursor");
  });

  it("refuses another resource's cursor and a malformed one", async () => {
    const foreign = encodeCursor("sessions", { limit: 1 }, RUNNING);
    for (const cursor of [foreign, "not-a-cursor"]) {
      const response = await GET(request(`?cursor=${cursor}`));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toContain("cursor");
    }
  });

  it("answers internal_error for a product with no name in any locale", async () => {
    // The database refuses a product without a translation, so this is a broken
    // invariant: a loud 500 rather than a record the contract refuses anyway.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    db.fetch = tables(CATALOGUE, { names: false });

    const response = await GET(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("forbids caching the answer", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
