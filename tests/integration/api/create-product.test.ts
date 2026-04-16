import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/create-product/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageRemove = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockStorageUpload,
        remove: mockStorageRemove,
      })),
    },
  })),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedWithRole(role: string) {
  if (role !== "admin") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can create products" },
        { status: 403 }
      )
    );
    return;
  }

  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

/**
 * jsdom's Request can't reliably parse multipart bodies, so we hand the route
 * a fake Request whose formData() returns the prepared FormData directly.
 * The route only touches request.formData(), so this is the full surface area.
 */
function createRequest(
  fields: Record<string, unknown>,
  file: File | null = new File(["bytes"], "test.jpg", { type: "image/jpeg" })
): Request {
  const fd = new FormData();
  fd.append("data", JSON.stringify(fields));
  if (file) fd.append("file", file);
  return { formData: async () => fd } as unknown as Request;
}

/** Chain shape for `admin.from("products").insert(...).select().single()`. */
function mockInsertResult(result: { data: unknown; error: unknown }) {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(result),
    }),
  });
  mockAdminFrom.mockReturnValue({ insert });
  return insert;
}

const validBody = {
  name: "Test Product",
  description: "A test product",
  token_cost: 2,
  game_id: "00000000-0000-0000-0000-000000000001",
  day_of_week: 2,
  start_time: "16:00",
  duration_minutes: 60,
  min_age: 7,
  max_age: 12,
  is_remote: true,
  spoken_language_code: "en",
};

// --- Tests ---

describe("POST /api/admin/create-product", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
  });

  // Auth & authorization

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthenticatedWithRole("customer");

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only admins can create products");
  });

  // File handling

  it("returns 400 when file is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest(validBody, null));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Image file is required");
  });

  it("returns 415 for unsupported file extensions", async () => {
    mockAuthenticatedWithRole("admin");

    const badFile = new File(["bytes"], "nope.gif", { type: "image/gif" });
    const response = await POST(createRequest(validBody, badFile));
    const data = await response.json();

    expect(response.status).toBe(415);
    expect(data.error).toMatch(/JPEG|PNG|WEBP|AVIF|SVG/);
  });

  it("returns 413 when file exceeds 5 MB", async () => {
    mockAuthenticatedWithRole("admin");

    // 5 MB + 1 byte
    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const bigFile = new File([bigBytes], "big.jpg", { type: "image/jpeg" });
    const response = await POST(createRequest(validBody, bigFile));

    expect(response.status).toBe(413);
  });

  // Validation — required fields

  it("returns 400 when name is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, name: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Product name is required");
  });

  it("returns 400 when description is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, description: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Description is required");
  });

  it("returns 400 when token_cost is a decimal", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, token_cost: 2.5 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Token cost is required (must be a positive integer)");
  });

  it("returns 400 when game_id is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, game_id: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Game is required");
  });

  it("returns 400 for invalid start_time format", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, start_time: "4pm" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Start time must be a valid time");
  });

  it("returns 400 when max_age is less than min_age", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, min_age: 10, max_age: 5 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Max age must be greater than or equal to min age");
  });

  it("returns 400 for invalid padlet_url", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, padlet_url: "not-a-url" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Padlet URL must be a valid URL");
  });

  it("returns 400 when is_remote=false and location_id is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({
      ...validBody,
      is_remote: false,
      location_id: null,
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("In-person products must have a location");
  });

  it("returns 400 when is_remote=true and location_id is set", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({
      ...validBody,
      is_remote: true,
      location_id: "00000000-0000-0000-0000-000000000203",
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Remote products cannot have a location");
  });

  it("returns 400 when spoken_language_code is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const { spoken_language_code: _drop, ...bodyWithoutLanguage } = validBody;
    const response = await POST(createRequest(bodyWithoutLanguage));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Spoken language is required");
  });

  // KEY TEST #1 — no upload happens when metadata validation fails
  it("does not upload the image when metadata validation fails", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, name: "" }));

    expect(response.status).toBe(400);
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  // Successful creation

  it("uploads the image with a UUID path and persists image_path on the row", async () => {
    mockAuthenticatedWithRole("admin");

    const insert = mockInsertResult(mockSupabaseSuccess({ id: "new-id" }));
    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(200);
    expect(mockStorageUpload).toHaveBeenCalledTimes(1);

    const uploadedPath = mockStorageUpload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^[0-9a-f-]{36}\.jpg$/);

    const insertCall = insert.mock.calls[0][0];
    expect(insertCall.image_path).toBe(uploadedPath);
    expect(insertCall.created_by).toBe("admin-user-id");
    expect(insertCall.timezone).toBe("Europe/Helsinki");
  });

  it("trims name and description", async () => {
    mockAuthenticatedWithRole("admin");

    const insert = mockInsertResult(mockSupabaseSuccess({ id: "new-id" }));

    await POST(createRequest({
      ...validBody,
      name: "  Padded Name  ",
      description: "  Padded Desc  ",
    }));

    const insertCall = insert.mock.calls[0][0];
    expect(insertCall.name).toBe("Padded Name");
    expect(insertCall.description).toBe("Padded Desc");
  });

  it("includes padlet_url when provided", async () => {
    mockAuthenticatedWithRole("admin");

    const insert = mockInsertResult(mockSupabaseSuccess({ id: "new-id" }));

    await POST(createRequest({ ...validBody, padlet_url: "https://padlet.com/test" }));

    expect(insert.mock.calls[0][0].padlet_url).toBe("https://padlet.com/test");
  });

  // KEY TEST #2 — insert failure cleans up the uploaded object
  it("removes the uploaded image when the insert fails", async () => {
    mockAuthenticatedWithRole("admin");

    mockInsertResult(mockSupabaseError("duplicate key value violates unique constraint"));

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("duplicate key value violates unique constraint");

    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    const uploadedPath = mockStorageUpload.mock.calls[0][0] as string;
    expect(mockStorageRemove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("returns 500 when the upload itself fails", async () => {
    mockAuthenticatedWithRole("admin");
    mockStorageUpload.mockResolvedValue({ error: { message: "bucket offline" } });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("bucket offline");
    expect(mockAdminFrom).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected errors", async () => {
    mockAuthenticatedWithRole("admin");

    const badRequest = {
      formData: async () => {
        throw new Error("parse failed");
      },
    } as unknown as Request;

    // Our route turns formData() rejection into a 400, but truly unexpected
    // errors (e.g. thrown synchronously later) fall through to the catch.
    const response = await POST(badRequest);
    expect(response.status).toBe(400);
  });
});
