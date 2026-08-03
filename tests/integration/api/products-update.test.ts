// @vitest-environment node
//
// Node environment so Request, FormData, and File are all undici/Node natives
// from one realm: jsdom's FormData isn't serializable by undici's Request, and
// files parsed out of a real multipart body would fail the route's
// `instanceof File` check against jsdom's File. See the sibling create test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products/[id]/update/route";
import { asString } from "../../helpers/json";

// The update route is the create route's mirror with one extra hazard: it moves
// blobs in a bucket the caller has no rights to, around an RPC that can fail.
// So beyond auth and body validation, what this file pins is the storage
// choreography — upload BEFORE the RPC so the new path commits atomically with
// the rest of the update, delete the new blob if the RPC then fails, and delete
// the superseded blob only once the RPC has succeeded.

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUserRpc = vi.fn();

const mockAdminUpload = vi.fn();
const mockAdminRemove = vi.fn();
const mockProductRead = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ upload: mockAdminUpload, remove: mockAdminRemove })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: () => mockProductRead() })),
      })),
    })),
  })),
}));

// --- Helpers ---

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
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
    supabase: { rpc: mockUserRpc },
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
  min_age: 7,
  max_age: 12,
  spoken_language_code: "en",
  padlet_url: null,
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
  refund_policy_days: null,
  schedule_slots: [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }],
  prices: [],
  holiday_calendar_ids: [],
  primary_gedu_fee_cents: null,
  assistant_gedu_fee_cents: null,
  municipality_fee_cents: null,
};

function updateRequest(
  opts: {
    data?: unknown;
    rawData?: string;
    file?: File | null;
    clearImage?: boolean;
    plainBody?: boolean;
  } = {},
): Request {
  if (opts.plainBody) {
    return new Request(`http://localhost/api/admin/products/x/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not a form",
    });
  }

  const fd = new FormData();
  if (opts.rawData !== undefined) {
    fd.append("data", opts.rawData);
  } else if ("data" in opts) {
    if (opts.data !== undefined) fd.append("data", JSON.stringify(opts.data));
  } else {
    fd.append("data", JSON.stringify(validBody));
  }

  const file = "file" in opts ? opts.file : null;
  if (file) fd.append("file", file);
  if (opts.clearImage) fd.append("clear_image", "true");

  return new Request(`http://localhost/api/admin/products/x/update`, {
    method: "POST",
    body: fd,
  });
}

function jpeg(name = "new.jpg"): File {
  return new File(["bytes"], name, { type: "image/jpeg" });
}

// --- Tests ---

describe("POST /api/admin/products/[id]/update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProductRead.mockResolvedValue({
      data: { image_path: null },
      error: null,
    });
    mockUserRpc.mockResolvedValue({ data: PRODUCT_ID, error: null });
    mockAdminUpload.mockResolvedValue({ error: null });
    mockAdminRemove.mockResolvedValue({ error: null });
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

  it("returns 400 for a non-multipart request", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(updateRequest({ plainBody: true }), { params });

    expect(response.status).toBe(400);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the data field is missing", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(updateRequest({ data: undefined }), { params });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing 'data' field" });
  });

  it("returns 400 when the data field is not valid JSON", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(updateRequest({ rawData: "{nope" }), { params });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "'data' field must be valid JSON",
    });
  });

  it("returns 400 when the data field fails the contract schema", async () => {
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

  it("returns 413 for an oversized image", async () => {
    mockAuthenticatedAdmin();
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });

    const response = await POST(updateRequest({ file: big }), { params });

    expect(response.status).toBe(413);
    expect(mockAdminUpload).not.toHaveBeenCalled();
  });

  it("returns 415 for an unsupported image type", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      updateRequest({ file: new File(["x"], "notes.txt", { type: "text/plain" }) }),
      { params },
    );

    expect(response.status).toBe(415);
    expect(mockAdminUpload).not.toHaveBeenCalled();
  });

  it("returns 404 when the product does not exist", async () => {
    mockAuthenticatedAdmin();
    mockProductRead.mockResolvedValue({ data: null, error: null });

    const response = await POST(updateRequest(), { params });

    expect(response.status).toBe(404);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("updates without touching storage when no image is sent", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(updateRequest(), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ product_id: PRODUCT_ID });
    expect(mockAdminUpload).not.toHaveBeenCalled();
    expect(mockAdminRemove).not.toHaveBeenCalled();
  });

  it("calls the RPC on the user client, with the id from the path", async () => {
    // SECURITY INVOKER: the RPC's role lookup needs auth.uid() populated, so it
    // must run on the caller's client and not on the admin one used for storage.
    mockAuthenticatedAdmin();

    await POST(updateRequest(), { params });

    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_id: PRODUCT_ID }),
    );
  });

  it("uploads the new blob BEFORE the RPC, and commits its server-derived path", async () => {
    // The path never comes from the client: it is derived from the uploaded
    // blob, so a caller cannot point a product row at an arbitrary object.
    mockAuthenticatedAdmin();
    const order: string[] = [];
    mockAdminUpload.mockImplementation(async () => {
      order.push("upload");
      return { error: null };
    });
    mockUserRpc.mockImplementation(async () => {
      order.push("rpc");
      return { data: PRODUCT_ID, error: null };
    });

    await POST(updateRequest({ file: jpeg() }), { params });

    expect(order).toEqual(["upload", "rpc"]);
    const uploadedPath = asString(mockAdminUpload.mock.calls[0][0]);
    expect(uploadedPath).toMatch(/^[0-9a-f-]+\.jpg$/);
    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_image_path: uploadedPath }),
    );
  });

  it("normalizes a .jpeg upload to a .jpg path", async () => {
    mockAuthenticatedAdmin();

    await POST(updateRequest({ file: jpeg("photo.jpeg") }), { params });

    expect(mockAdminUpload.mock.calls[0][0]).toMatch(/\.jpg$/);
  });

  it("deletes the superseded blob after a successful replace", async () => {
    mockAuthenticatedAdmin();
    mockProductRead.mockResolvedValue({
      data: { image_path: "old-path.png" },
      error: null,
    });

    const response = await POST(updateRequest({ file: jpeg() }), { params });

    expect(response.status).toBe(200);
    expect(mockAdminRemove).toHaveBeenCalledWith(["old-path.png"]);
  });

  it("clears the image and deletes the old blob when asked to", async () => {
    mockAuthenticatedAdmin();
    mockProductRead.mockResolvedValue({
      data: { image_path: "old-path.png" },
      error: null,
    });

    const response = await POST(updateRequest({ clearImage: true }), { params });

    expect(response.status).toBe(200);
    expect(mockUserRpc).toHaveBeenCalledWith(
      "update_product",
      expect.objectContaining({ p_image_path: undefined }),
    );
    expect(mockAdminRemove).toHaveBeenCalledWith(["old-path.png"]);
  });

  // -- Failure --

  it("deletes the freshly uploaded blob when the RPC then fails", async () => {
    // Otherwise a failed update leaves an unreferenced object in the bucket.
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({
      data: null,
      error: { code: "23503", message: "violates foreign key constraint" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(updateRequest({ file: jpeg() }), { params });

    expect(response.status).toBe(400);
    const uploadedPath = asString(mockAdminUpload.mock.calls[0][0]);
    expect(mockAdminRemove).toHaveBeenCalledWith([uploadedPath]);
    spy.mockRestore();
  });

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

  it("answers 500 without echoing storage internals when the upload fails", async () => {
    mockAuthenticatedAdmin();
    mockAdminUpload.mockResolvedValue({
      error: { message: "bucket product-images: signature expired" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(updateRequest({ file: jpeg() }), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("signature expired");
    expect(mockUserRpc).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("answers 500 without echoing database text when the existence read fails", async () => {
    mockAuthenticatedAdmin();
    mockProductRead.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for table products" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(updateRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).not.toContain("permission denied");
    spy.mockRestore();
  });
});
