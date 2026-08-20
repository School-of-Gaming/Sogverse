// @vitest-environment node
//
// Node environment because this exercises a route handler and nothing else —
// no DOM, and Request/Response are the undici natives the runtime actually
// hands the route.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products/create/route";

// The create route in one sentence: validate a JSON body, call create_product
// on the caller's own client, then link the product's catalogue image in a
// second statement. Three things that shape these tests:
//
//   1. **Plain JSON.** No file rides along any more — a picture is a
//      catalogue entry uploaded through its own route, and a product carries
//      its id. `image_id` is required and nullable, so "I forgot the field"
//      and "this product has no picture" cannot be the same request.
//
//   2. **Image-last.** The RPC creates the row first; if the link statement
//      then fails the product still exists, so the response is a 200 carrying
//      a soft warning rather than an error that would hide a good save. The
//      realistic failure is a foreign-key violation — another admin removed
//      the entry while this form was open — and that case gets named copy.
//
//   3. **No storage, ever.** This route touches no bucket and writes no path;
//      `image_path` is derived from `image_id` by a database trigger.
//
// The route validates the body's *structure* against the contract schema
// (products.contracts.ts); semantic rules (age ordering, translation locales)
// stay in the RPC + form.

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUserRpc = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserUpdateEq = vi.fn();

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockAuthenticatedAdmin() {
  // The route uses the user-session client for both statements: the RPC and
  // the image link. Build a stub that records both.
  const supabase = {
    rpc: mockUserRpc,
    from: vi.fn(() => ({
      update: (...args: unknown[]) => {
        mockUserUpdate(...args);
        return { eq: mockUserUpdateEq };
      },
    })),
  };
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase,
  });
}

function mockAuthenticatedNonAdmin() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can create products" },
      { status: 403 },
    ),
  );
}

const IMAGE_ID = "0f2c9d5e-6b41-4a7c-9f18-3d5e2a1b4c60";

// Mirrors what the admin form actually sends: every CreateProductInput
// field, with explicit nulls (the contract schema requires the full shape).
const validBody = {
  product_type: "consumer_club",
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
  spoken_language_code: "en",
  image_id: IMAGE_ID,
  material_url: null,
  location_id: null,
  is_remote: true,
  status: "pending",
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
  holiday_calendar_ids: [],
  primary_gedu_fee_cents: null,
  assistant_gedu_fee_cents: null,
  municipality_fee_cents: null,
};

function createRequest(
  opts: { data?: unknown; rawBody?: string } = {},
): Request {
  const body =
    opts.rawBody !== undefined
      ? opts.rawBody
      : JSON.stringify("data" in opts ? opts.data : validBody);
  return new Request("http://localhost/api/admin/products/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

// --- Tests ---

describe("POST /api/admin/products/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRpc.mockResolvedValue({ data: "new-prod-id", error: null });
    mockUserUpdateEq.mockResolvedValue({ error: null });
  });

  // Auth & authorization

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();
    const response = await POST(createRequest());
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthenticatedNonAdmin();
    const response = await POST(createRequest());
    expect(response.status).toBe(403);
  });

  // Body parsing

  it("returns 400 when the body is not valid JSON", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({ rawBody: "{not-json" }));
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails the contract schema", async () => {
    mockAuthenticatedAdmin();
    const { min_age: _dropped, ...missingMinAge } = validBody;
    const response = await POST(createRequest({ data: missingMinAge }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/min_age/);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-enum product_type", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(
      createRequest({ data: { ...validBody, product_type: "nonsense" } }),
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/product_type/);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the audience flags are missing", async () => {
    // They are non-defaulted RPC parameters precisely so that an omission
    // cannot be read as "gamers-only, presumably" — it has to fail, and it has
    // to fail here rather than at the database.
    mockAuthenticatedAdmin();
    const {
      for_gamers: _g,
      for_parents: _p,
      ...noAudience
    } = validBody;
    const response = await POST(createRequest({ data: noAudience }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/for_gamers|for_parents/);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // The image link

  it("returns 400 when image_id is missing", async () => {
    // Required even though it is nullable, and this is the guard that makes
    // the nullability safe: the route writes the column on every save, so a
    // forgotten field would silently take a product's picture off.
    mockAuthenticatedAdmin();
    const { image_id: _img, ...noImage } = validBody;
    const response = await POST(createRequest({ data: noImage }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/image_id/);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when image_id is not a uuid", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(
      createRequest({ data: { ...validBody, image_id: "abc.png" } }),
    );
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("links the chosen entry in a second statement after the RPC", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(json.warning).toBeUndefined();

    expect(mockUserUpdate).toHaveBeenCalledWith({ image_id: IMAGE_ID });
    expect(mockUserUpdateEq).toHaveBeenCalledWith("id", "new-prod-id");
    // The served path is never on the wire and never written here — a trigger
    // derives it from the id this statement just wrote.
    expect(mockUserRpc.mock.calls[0][1]).not.toHaveProperty("p_image_path");
  });

  it("accepts a null image_id and still writes the column", async () => {
    // Unconditional on purpose: null IS the answer for a product with no
    // picture, so skipping the write would make "no picture" unrepresentable.
    mockAuthenticatedAdmin();
    const response = await POST(
      createRequest({ data: { ...validBody, image_id: null } }),
    );
    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({ image_id: null });
  });

  // RPC

  it("passes the audience flags and ages through to the RPC", async () => {
    mockAuthenticatedAdmin();
    await POST(
      createRequest({
        data: {
          ...validBody,
          for_gamers: false,
          for_parents: true,
          min_age: null,
          max_age: null,
        },
      }),
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "create_product",
      expect.objectContaining({ p_for_gamers: false, p_for_parents: true }),
    );
    // A null age is sent as an OMISSION, so the RPC's DEFAULT NULL writes it.
    // Sending the key with an undefined value would be the same wire shape but
    // a different claim, so assert the absence rather than the value.
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_min_age).toBeUndefined();
    expect(args.p_max_age).toBeUndefined();
  });

  it("passes a tag through, and sends an omission for an untagged product", async () => {
    mockAuthenticatedAdmin();
    await POST(createRequest({ data: { ...validBody, tag: "beginner" } }));
    expect(mockUserRpc).toHaveBeenCalledWith(
      "create_product",
      expect.objectContaining({ p_tag: "beginner" }),
    );

    mockUserRpc.mockClear();
    await POST(createRequest({ data: validBody }));
    // Same shape as a null age: the route maps null to undefined, supabase-js
    // JSON-serializes the arguments (dropping undefined keys), and the RPC's
    // DEFAULT NULL fills in the omission — untagged reaches the column.
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_tag).toBeUndefined();
  });

  it("returns 400 when the tag field is missing", async () => {
    // Required-nullable on the wire even though the RPC parameter is defaulted:
    // the default means an omitted argument CLEARS the tag, so the one thing
    // that must never happen is a caller forgetting the field.
    mockAuthenticatedAdmin();
    const { tag: _tag, ...noTag } = validBody;
    const response = await POST(createRequest({ data: noTag }));
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("passes a region lock through, and sends an omission for an unlocked product", async () => {
    mockAuthenticatedAdmin();
    await POST(
      createRequest({ data: { ...validBody, region_lock_country: "FI" } }),
    );
    expect(mockUserRpc).toHaveBeenCalledWith(
      "create_product",
      expect.objectContaining({ p_region_lock_country: "FI" }),
    );

    mockUserRpc.mockClear();
    await POST(createRequest({ data: validBody }));
    // Same shape as an untagged product: null on the wire becomes undefined,
    // supabase-js drops the key, and the RPC's DEFAULT NULL writes "unlocked".
    const args = mockUserRpc.mock.calls[0][1];
    expect(args.p_region_lock_country).toBeUndefined();
  });

  it("returns 400 when the region lock field is missing", async () => {
    // Required-nullable for the same reason the tag is: the RPC parameter is
    // defaulted, so a forgotten field would silently unlock the product.
    mockAuthenticatedAdmin();
    const { region_lock_country: _lock, ...noLock } = validBody;
    const response = await POST(createRequest({ data: noLock }));
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a country the lock cannot point at", async () => {
    // The contract narrows to the SEEDED countries, not to the column CHECK's
    // alpha-2 shape. "ES" is a real, well-formed code and a declared entry in
    // SUPPORTED_COUNTRIES — it is simply not seeded, so a lock on it could
    // never match any family's stored location. Refusing here is the only place
    // that distinction is enforced.
    mockAuthenticatedAdmin();
    const response = await POST(
      createRequest({ data: { ...validBody, region_lock_country: "ES" } }),
    );
    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("surfaces RPC errors as 400 with the message", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({
      data: null,
      error: { message: "min_age must be less than or equal to max_age" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("min_age must be less than or equal to max_age");
    // The row was never created, so nothing should have tried to link a
    // picture to it.
    expect(mockUserUpdate).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns 500 when RPC succeeds but returns null product_id", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({ data: null, error: null });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(createRequest());
    expect(response.status).toBe(500);
    spy.mockRestore();
  });

  // The soft warning

  it("names the removed entry when the link hits the foreign key", async () => {
    // The realistic race: another admin deleted the catalogue entry between
    // this form loading and this save. The product is fine, so this is a 200
    // with an explanation and never a bare 200.
    mockAuthenticatedAdmin();
    mockUserUpdateEq.mockResolvedValue({
      error: { code: "23503", message: "violates foreign key constraint" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(json.warning).toMatch(/catalogue entry no longer exists/);
    expect(json.warning).toMatch(/edit page/);
    expect(json.warning).not.toMatch(/foreign key/);
  });

  it("passes any other link failure through in the warning", async () => {
    mockAuthenticatedAdmin();
    mockUserUpdateEq.mockResolvedValue({
      error: { code: "40001", message: "could not serialize access" },
    });

    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(json.warning).toMatch(/could not serialize access/);
  });
});
