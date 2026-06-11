import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products/create/route";

// Equivalent of the old `tests/integration/api/create-product.test.ts` for
// the new v2 route. Two interesting things this route does:
//
//   1. **Image-last upload pattern.** The RPC creates the row first; if
//      the upload or path-update then fails, the product still exists and
//      the response carries a soft warning. No orphan-image cleanup is
//      needed (mirror of the orphan-cleanup logic the old route had to do
//      because it inserted *after* uploading).
//
//   2. **Image is optional.** v2 lets admins create a product without
//      an image, then add it later from the edit page.
//
// The route validates the body's *structure* against the contract schema
// (products.contracts.ts); semantic rules (age ordering, translation
// locales) stay in the RPC + form. These tests focus on auth, body
// validation, file handling, RPC error surfacing, and the soft-warning
// fallback paths.

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUserRpc = vi.fn();
const mockUserUpdate = vi.fn();

const mockAdminUpload = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({ upload: mockAdminUpload })),
    },
  })),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockAuthenticatedAdmin() {
  // The route uses the user-session client to call the RPC and the path
  // update. Build a stub that records both.
  const supabase = {
    rpc: mockUserRpc,
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: mockUserUpdate })),
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

// Mirrors what the admin form actually sends: every CreateProductInput
// field, with explicit nulls (the contract schema requires the full shape).
const validBody = {
  product_type: "consumer_club",
  billing_mode: "paid",
  translations: [
    { locale: "en", name: "X", short_description: "Y", long_description: null },
  ],
  topic: "minecraft_java",
  min_age: 7,
  max_age: 12,
  spoken_language_code: "en",
  padlet_url: null,
  location_id: null,
  is_remote: true,
  status: "draft",
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
};

/**
 * jsdom's Request can't reliably parse multipart bodies, so we hand the
 * route a fake Request whose formData() returns the prepared FormData.
 * The route only ever calls request.formData(), which is the full surface.
 */
function createRequest(opts: {
  data?: unknown;
  rawData?: string;
  file?: File | null;
} = {}): Request {
  const fd = new FormData();
  if (opts.rawData !== undefined) {
    fd.append("data", opts.rawData);
  } else if ("data" in opts) {
    if (opts.data !== undefined) {
      fd.append("data", JSON.stringify(opts.data));
    }
  } else {
    fd.append("data", JSON.stringify(validBody));
  }
  const file = "file" in opts ? opts.file : new File(["bytes"], "test.jpg", { type: "image/jpeg" });
  if (file) fd.append("file", file);
  return { formData: async () => fd } as unknown as Request;
}

// --- Tests ---

describe("POST /api/admin/products/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRpc.mockResolvedValue({ data: "new-prod-id", error: null });
    mockAdminUpload.mockResolvedValue({ error: null });
    mockUserUpdate.mockResolvedValue({ error: null });
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

  it("returns 400 when the 'data' field is missing", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({ data: undefined }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/Missing 'data' field/);
  });

  it("returns 400 when 'data' isn't valid JSON", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({ rawData: "{not-json" }));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/valid JSON/);
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

  it("returns 400 when formData itself fails to parse", async () => {
    mockAuthenticatedAdmin();
    const badRequest = {
      formData: async () => {
        throw new Error("parse failed");
      },
    } as unknown as Request;
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });

  // File handling

  it("returns 415 for unsupported file extensions", async () => {
    mockAuthenticatedAdmin();
    const badFile = new File(["bytes"], "nope.gif", { type: "image/gif" });
    const response = await POST(createRequest({ file: badFile }));
    expect(response.status).toBe(415);
    const json = await response.json();
    expect(json.error).toMatch(/JPEG|PNG|WEBP|AVIF|SVG/);
    // RPC should not have been called when file validation fails.
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  it("returns 413 when file exceeds 5 MB", async () => {
    mockAuthenticatedAdmin();
    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const bigFile = new File([bigBytes], "big.jpg", { type: "image/jpeg" });
    const response = await POST(createRequest({ file: bigFile }));
    expect(response.status).toBe(413);
    expect(mockUserRpc).not.toHaveBeenCalled();
  });

  // RPC

  it("surfaces RPC errors as 400 with the message", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({
      data: null,
      error: { message: "min_age must be less than or equal to max_age" },
    });
    const response = await POST(createRequest());
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("min_age must be less than or equal to max_age");
    // No upload should have happened — the row didn't get created.
    expect(mockAdminUpload).not.toHaveBeenCalled();
  });

  it("returns 500 when RPC succeeds but returns null product_id", async () => {
    mockAuthenticatedAdmin();
    mockUserRpc.mockResolvedValue({ data: null, error: null });
    const response = await POST(createRequest());
    expect(response.status).toBe(500);
  });

  // Successful creation

  it("creates the product and uploads the image with a UUID path", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(json.warning).toBeUndefined();

    // Path is a UUID + jpg extension.
    expect(mockAdminUpload).toHaveBeenCalledTimes(1);
    const uploadedPath = mockAdminUpload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^[0-9a-f-]{36}\.jpg$/);

    // path-update gets the same path.
    expect(mockUserUpdate).toHaveBeenCalledTimes(1);
  });

  it("normalises 'jpeg' extension to 'jpg'", async () => {
    mockAuthenticatedAdmin();
    const file = new File(["x"], "thing.jpeg", { type: "image/jpeg" });
    await POST(createRequest({ file }));
    const uploadedPath = mockAdminUpload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^[0-9a-f-]{36}\.jpg$/);
  });

  it("creates the product without an image when no file is provided", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({ file: null }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(mockAdminUpload).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  // Soft-warning fallback paths — image-last semantics

  it("returns the product_id with a warning when the upload fails", async () => {
    mockAuthenticatedAdmin();
    mockAdminUpload.mockResolvedValue({ error: { message: "bucket offline" } });
    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(json.warning).toMatch(/image upload failed.*bucket offline/);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns the product_id with a warning when the path-update fails", async () => {
    mockAuthenticatedAdmin();
    mockUserUpdate.mockResolvedValue({ error: { message: "DB write failed" } });
    const response = await POST(createRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.product_id).toBe("new-prod-id");
    expect(json.warning).toMatch(/DB update failed.*DB write failed/);
  });
});
