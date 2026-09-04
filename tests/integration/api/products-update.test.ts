// @vitest-environment node
//
// Node environment: this exercises a route handler and nothing else. See the
// sibling create test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products/[id]/update/route";

// The update route is the create route's mirror, and it no longer has a hazard
// of its own: it used to move blobs in a bucket the caller has no rights to,
// around an RPC that can fail. A picture is now a catalogue entry a product
// points at, so all that is gone — no upload, no superseded-object delete, no
// existing-path read-back, and no path on the wire at all. What is left is one
// `image_id` write after the RPC and the soft warning when it fails.

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUserRpc = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserUpdateEq = vi.fn();
// The link statement ends in `.select("id")`: the route reads the returned row
// to know the write landed, because a filtered UPDATE that matches nothing
// raises no error. This is what the handler actually awaits.
const mockUserLinkSelect = vi.fn();

// --- Helpers ---

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const IMAGE_ID = "22222222-2222-2222-2222-222222222222";
const params = Promise.resolve({ id: PRODUCT_ID });

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {
      rpc: mockUserRpc,
      from: vi.fn(() => ({
        update: (...args: unknown[]) => {
          mockUserUpdate(...args);
          return {
            eq: (...eqArgs: unknown[]) => {
              mockUserUpdateEq(...eqArgs);
              return { select: mockUserLinkSelect };
            },
          };
        },
      })),
    },
  });
}

function mockAuthenticatedNonAdmin() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can update products" },
      { status: 403 },
    ),
  );
}

// The full UpdateProductInput shape the admin form sends; the contract schema
// requires every field, with explicit nulls for the absent ones.
const validBody = {
  billing_mode: "paid",
  translations: [
    { locale: "en", name: "X", short_description: "Y", long_description: null },
  ],
  topic: "minecraft_java",
  for_gamers: true,
  for_parents: false,
  min_age: 7,
  max_age: 12,
  tag: null,
  region_lock_country: null,
  requires_gamer_creations: false,
  spoken_language_code: "en",
  image_id: IMAGE_ID,
  material_url: null,
  location_id: null,
  is_remote: true,
  signup_threshold: null,
  start_date: null,
  end_date: null,
  timezone: "Europe/Helsinki",
  seat_count: null,
  waitlist_enabled: false,
  registration_opens_at: "2026-01-01T00:00:00Z",
  is_visible: true,
  schedule_slots: [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }],
  prices: [],
  required_consent_slugs: [],
  marketing_consent_types: [],
  primary_gedu_fee_cents: null,
  assistant_gedu_fee_cents: null,
  municipality_fee_cents: null,
};

function updateRequest(
  opts: { data?: unknown; rawBody?: string } = {},
): Request {
  const body =
    opts.rawBody !== undefined
      ? opts.rawBody
      : JSON.stringify("data" in opts ? opts.data : validBody);
  return new Request(`http://localhost/api/admin/products/x/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

// --- Tests ---

describe("POST /api/admin/products/[id]/update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRpc.mockResolvedValue({ data: PRODUCT_ID, error: null });
    mockUserLinkSelect.mockResolvedValue({
      data: [{ id: PRODUCT_ID }],
      error: null,
    });
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(updateRequest(), { params });

    expect(response.status).toBe(401);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockAuthenticatedNonAdmin();

    const response = await POST(updateRequest(), { params });

    expect(response.status).toBe(403);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 for a body that is not JSON", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(updateRequest({ rawBody: "not a body" }), {
      params,
    });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails the contract schema", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      updateRequest({ data: { ...validBody, min_age: "seven" } }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed product id in the path", async () => {
    // The path segment is validated at the boundary, so a junk id becomes a
    // plain 400 rather than an unmapped driver error further in.
    mockAuthenticatedAdmin();

    const response = await POST(updateRequest(), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("calls the RPC on the user client, with the id from the path", async () => {
    // SECURITY INVOKER: the RPC's role lookup needs auth.uid() populated, so it
    // must run on the caller's client.
    mockAuthenticatedAdmin();

    await POST(updateRequest(), { params });

    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_id: PRODUCT_ID }),
    );
  });

  it("carries the product's own audience through an unrelated edit", async () => {
    // The RPC assigns every editable column on every call, so an edit that
    // never touched the audience still has to send it. The form loads these
    // from the product; the route must not substitute a default for them.
    mockAuthenticatedAdmin();

    await POST(
      updateRequest({
        data: {
          ...validBody,
          for_gamers: false,
          for_parents: true,
          min_age: null,
          max_age: null,
        },
      }),
      { params },
    );

    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_for_gamers: false, p_for_parents: true }),
    );
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_min_age).toBeUndefined();
    expect(args.p_max_age).toBeUndefined();
  });

  it("returns 400 when the audience flags are missing", async () => {
    mockAuthenticatedAdmin();
    const {
      for_gamers: _g,
      for_parents: _p,
      ...noAudience
    } = validBody;

    const response = await POST(updateRequest({ data: noAudience }), { params });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("carries a tag through, and clears one by omitting the argument", async () => {
    mockAuthenticatedAdmin();

    await POST(
      updateRequest({ data: { ...validBody, tag: "neuroinclusive" } }),
      { params },
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_tag: "neuroinclusive" }),
    );

    mockUserRpc.mockClear();
    await POST(updateRequest({ data: validBody }), { params });
    // A null tag is a deliberate clear: the route maps null to undefined,
    // supabase-js JSON-serializes the arguments (dropping undefined keys), and
    // the RPC's DEFAULT NULL turns the omission into the cleared column.
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_tag).toBeUndefined();
  });

  it("returns 400 when the tag field is missing", async () => {
    // The wire-level guard the defaulted parameter needs: an omitted field
    // would reach an RPC that assigns every editable column, so "forgot to
    // send it" and "clear it" would be the same request. The schema makes the
    // first one impossible, leaving an explicit null as the only way to clear.
    mockAuthenticatedAdmin();
    const { tag: _tag, ...noTag } = validBody;

    const response = await POST(updateRequest({ data: noTag }), { params });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("carries a region lock through, and unlocks by omitting the argument", async () => {
    mockAuthenticatedAdmin();

    await POST(
      updateRequest({ data: { ...validBody, region_lock_country: "SE" } }),
      { params },
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_region_lock_country: "SE" }),
    );

    mockUserRpc.mockClear();
    await POST(updateRequest({ data: validBody }), { params });
    // A null lock is a deliberate unlock, by the same route the tag's clear
    // takes: null → undefined → dropped key → the RPC's DEFAULT NULL.
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_region_lock_country).toBeUndefined();
  });

  it("sends the creation-requirement flag explicitly on every save", async () => {
    mockAuthenticatedAdmin();

    await POST(
      updateRequest({
        data: { ...validBody, requires_gamer_creations: true },
      }),
      { params },
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_requires_gamer_creations: true }),
    );

    mockUserRpc.mockClear();
    await POST(updateRequest({ data: validBody }), { params });
    // Unflagging is an explicit `false`, NOT an omission — the parameter
    // defaults to false because the column is NOT NULL, so a dropped key would
    // unflag the product on any edit made for some other reason.
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_requires_gamer_creations).toBe(false);
  });

  it("returns 400 when the creation-requirement flag is missing", async () => {
    mockAuthenticatedAdmin();
    const { requires_gamer_creations: _flag, ...noFlag } = validBody;
    const response = await POST(updateRequest({ data: noFlag }), { params });
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("replaces the requirement set on every save, empty array included", async () => {
    mockAuthenticatedAdmin();

    await POST(
      updateRequest({
        data: {
          ...validBody,
          required_consent_slugs: ["roblox-privacy-policy"],
        },
      }),
      { params },
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({
        p_required_consent_slugs: ["roblox-privacy-policy"],
      }),
    );

    mockUserRpc.mockClear();
    await POST(updateRequest({ data: validBody }), { params });
    // Clearing is an empty array here rather than an omission: the RPC hands
    // this to the requirement set's single writer, which treats NULL and []
    // alike, so the array says what it means and the wire schema demands it.
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_required_consent_slugs).toEqual([]);
  });

  it("returns 400 when the required consent field is missing", async () => {
    mockAuthenticatedAdmin();
    const { required_consent_slugs: _slugs, ...noSlugs } = validBody;
    const response = await POST(updateRequest({ data: noSlugs }), { params });
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // The optional marketing asks, which are not an `update_product` parameter at
  // all: the set is keyed on the product, so it is replaced by a second call.

  it("replaces the marketing ask set on every save, empty array included", async () => {
    mockAuthenticatedAdmin();

    await POST(
      updateRequest({
        data: { ...validBody, marketing_consent_types: ["lynx_educate"] },
      }),
      { params },
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "admin_set_product_marketing_consents",
      { p_product_id: PRODUCT_ID, p_consent_types: ["lynx_educate"] },
    );

    mockUserRpc.mockClear();
    await POST(updateRequest({ data: validBody }), { params });
    // Clearing is an empty array rather than an omission, exactly as the
    // requirement set above: the writer treats NULL and [] alike, so the array
    // says what it means and the wire schema demands it on every save.
    expect(mockUserRpc.mock.calls[1]).toEqual([
      "admin_set_product_marketing_consents",
      { p_product_id: PRODUCT_ID, p_consent_types: [] },
    ]);
  });

  it("returns 400 when the marketing field is missing", async () => {
    // The load-bearing half: the writer replaces the whole set, so a forgotten
    // field on an edit about something else would leave a stale ask behind.
    mockAuthenticatedAdmin();
    const { marketing_consent_types: _types, ...noTypes } = validBody;
    const response = await POST(updateRequest({ data: noTypes }), { params });
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a consent type outside the enum", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(
      updateRequest({
        data: { ...validBody, marketing_consent_types: ["nonsense"] },
      }),
      { params },
    );
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("warns rather than errors when the marketing write fails", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockImplementation(async (fn: string) =>
      fn === "update_product"
        ? { data: PRODUCT_ID, error: null }
        : { data: null, error: { message: "product does not exist" } },
    );

    const response = await POST(updateRequest(), { params });
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe(PRODUCT_ID);
    expect(json.warning).toMatch(/marketing consents were not applied/);
    expect(json.warning).toMatch(/edit page/);
  });

  it("returns 400 when the region lock field is missing", async () => {
    // The same wire-level guard the tag needs, and for a consequence that is
    // arguably worse: an omitted field would silently open a product to every
    // country on an edit that was about something else entirely.
    mockAuthenticatedAdmin();
    const { region_lock_country: _lock, ...noLock } = validBody;

    const response = await POST(updateRequest({ data: noLock }), { params });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a country the lock cannot point at", async () => {
    // Narrowed to the countries we operate in rather than to the column's
    // alpha-2 shape: "JP" is well-formed and not one of them, so it has no
    // location rows and a lock on it would be a gate nobody could ever pass.
    mockAuthenticatedAdmin();

    const response = await POST(
      updateRequest({ data: { ...validBody, region_lock_country: "JP" } }),
      { params },
    );

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // -- The image link --

  it("returns 400 when image_id is missing", async () => {
    // Required even though nullable: the route writes the column on every
    // save, so a forgotten field would take a product's picture off.
    mockAuthenticatedAdmin();
    const { image_id: _img, ...noImage } = validBody;

    const response = await POST(updateRequest({ data: noImage }), { params });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("writes the chosen entry after the RPC, and passes no path to it", async () => {
    mockAuthenticatedAdmin();
    const order: string[] = [];
    // Recorded by name rather than as a bare "rpc": two functions are called
    // here now, and both of the writes after `update_product` are keyed on the
    // id it returns — so the ordering claim is about which came first, not just
    // how many there were.
    mockUserRpc.mockImplementation(async (fn: string) => {
      order.push(fn);
      return { data: PRODUCT_ID, error: null };
    });
    mockUserLinkSelect.mockImplementation(async () => {
      order.push("link");
      return { data: [{ id: PRODUCT_ID }], error: null };
    });

    const response = await POST(updateRequest(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ product_id: PRODUCT_ID });
    expect(order).toEqual([
      "update_product",
      "admin_set_product_marketing_consents",
      "link",
    ]);
    expect(mockUserUpdate).toHaveBeenCalledWith({ image_id: IMAGE_ID });
    expect(mockUserUpdateEq).toHaveBeenCalledWith("id", PRODUCT_ID);
    // The served column is derived by a database trigger, so the route neither
    // sends a path to the RPC nor writes one itself — and migration 00198
    // dropped `p_image_path` from the RPC entirely, so this now guards against
    // reintroducing an argument the function no longer has.
    expect(mockUserRpc.mock.calls[0][1]).not.toHaveProperty("p_image_path");
  });

  it("takes the picture off the product when image_id is null", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      updateRequest({ data: { ...validBody, image_id: null } }),
      { params },
    );

    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({ image_id: null });
  });

  // -- Failure --

  it("gives a written explanation for the two native codes the RPC can raise", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({
      data: null,
      error: { code: "23503", message: "violates foreign key constraint" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(updateRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("no longer available");
    expect(data.error).not.toContain("foreign key");
    expect(mockUserUpdate).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("passes the RPC's own refusal through, which the product form shows verbatim", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "At least one translation is required" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(updateRequest(), { params });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "At least one translation is required",
    );
    spy.mockRestore();
  });

  it("names the removed entry when the link hits the foreign key", async () => {
    // A saved product with an unapplied picture is a 200 with a warning, never
    // an error that would hide the save and never a bare 200.
    mockAuthenticatedAdmin();
    mockUserLinkSelect.mockResolvedValue({
      data: null,
      error: { code: "23503", message: "violates foreign key constraint" },
    });

    const response = await POST(updateRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.product_id).toBe(PRODUCT_ID);
    expect(data.warning).toMatch(/catalogue entry no longer exists/);
    expect(data.warning).toMatch(/edit page/);
    expect(data.warning).not.toMatch(/foreign key/);
  });

  it("passes any other link failure through in the warning", async () => {
    mockAuthenticatedAdmin();
    mockUserLinkSelect.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "could not serialize access" },
    });

    const response = await POST(updateRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.warning).toMatch(/could not serialize access/);
  });

  it("warns when the link statement matched no row at all", async () => {
    // An UPDATE with a filter that matches nothing succeeds — no error, no
    // rows. Without the returned row this route would answer a clean 200 for a
    // picture it never applied, which is the one shape the design forbids.
    mockAuthenticatedAdmin();
    mockUserLinkSelect.mockResolvedValue({ data: [], error: null });

    const response = await POST(updateRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.product_id).toBe(PRODUCT_ID);
    expect(data.warning).toMatch(/could not be found/);
    expect(data.warning).toMatch(/edit page/);
  });
});
