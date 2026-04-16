import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/update-product/route";
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

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function createRequest(
  id: string,
  fields: Record<string, unknown>,
  file: File | null = null
): Request {
  const fd = new FormData();
  fd.append("id", id);
  fd.append("data", JSON.stringify(fields));
  if (file) fd.append("file", file);
  return { formData: async () => fd } as unknown as Request;
}

/** Wire up `from("products")` for a single read-then-update call sequence. */
function mockReadAndUpdate({
  previousImagePath,
  updateResult,
}: {
  previousImagePath: string | null;
  updateResult: { data: unknown; error: unknown };
}) {
  const single = vi.fn().mockResolvedValue(
    mockSupabaseSuccess({ image_path: previousImagePath })
  );
  const maybeSingle = vi.fn().mockResolvedValue(
    mockSupabaseSuccess({ image_path: previousImagePath })
  );
  const selectChain = {
    eq: vi.fn().mockReturnValue({
      maybeSingle,
      single,
    }),
  };

  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(updateResult),
      }),
    }),
  });

  mockAdminFrom.mockReturnValue({
    select: vi.fn().mockReturnValue(selectChain),
    update,
  });

  return { update, maybeSingle };
}

/** Wire up `from("products").select(...).eq().maybeSingle()` to return null. */
function mockProductNotFound() {
  mockAdminFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  });
}

const PRODUCT_ID = "00000000-0000-0000-0000-000000000020";

// --- Tests ---

describe("POST /api/admin/update-product", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ data: null, error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await POST(createRequest(PRODUCT_ID, { name: "X" }));
    expect(response.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockAuthenticatedAdmin();

    const fd = new FormData();
    fd.append("data", JSON.stringify({ name: "X" }));
    const response = await POST(
      { formData: async () => fd } as unknown as Request
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when the product does not exist", async () => {
    mockAuthenticatedAdmin();
    mockProductNotFound();

    const response = await POST(createRequest(PRODUCT_ID, { name: "New name" }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Product not found");
  });

  it("updates metadata without touching storage when no file is provided", async () => {
    mockAuthenticatedAdmin();
    const { update } = mockReadAndUpdate({
      previousImagePath: "old.jpg",
      updateResult: mockSupabaseSuccess({ id: PRODUCT_ID, name: "Renamed" }),
    });

    const response = await POST(createRequest(PRODUCT_ID, { name: "Renamed" }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ name: "Renamed" });
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it("supports partial updates like toggle visibility", async () => {
    mockAuthenticatedAdmin();
    const { update } = mockReadAndUpdate({
      previousImagePath: "keep.jpg",
      updateResult: mockSupabaseSuccess({ id: PRODUCT_ID, is_visible: true }),
    });

    const response = await POST(createRequest(PRODUCT_ID, { is_visible: true }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ is_visible: true });
    expect(mockStorageUpload).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it("uploads a new image and removes the old one on success", async () => {
    mockAuthenticatedAdmin();
    const { update } = mockReadAndUpdate({
      previousImagePath: "old.jpg",
      updateResult: mockSupabaseSuccess({ id: PRODUCT_ID }),
    });

    const newFile = new File(["bytes"], "photo.png", { type: "image/png" });
    const response = await POST(createRequest(PRODUCT_ID, { name: "With new pic" }, newFile));

    expect(response.status).toBe(200);

    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    const uploadedPath = mockStorageUpload.mock.calls[0][0] as string;
    expect(uploadedPath).toMatch(/^[0-9a-f-]{36}\.png$/);

    const updateCall = update.mock.calls[0][0];
    expect(updateCall.image_path).toBe(uploadedPath);
    expect(updateCall.name).toBe("With new pic");

    expect(mockStorageRemove).toHaveBeenCalledWith(["old.jpg"]);
  });

  // KEY TEST — failure of the DB update after a successful upload must
  // clean up the newly uploaded object so the bucket never holds a file
  // that no row references.
  it("removes the newly uploaded image when the update fails", async () => {
    mockAuthenticatedAdmin();
    mockReadAndUpdate({
      previousImagePath: "old.jpg",
      updateResult: mockSupabaseError("constraint violation"),
    });

    const newFile = new File(["bytes"], "photo.png", { type: "image/png" });
    const response = await POST(createRequest(PRODUCT_ID, { name: "Bad update" }, newFile));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("constraint violation");

    expect(mockStorageUpload).toHaveBeenCalledTimes(1);
    const uploadedPath = mockStorageUpload.mock.calls[0][0] as string;
    expect(mockStorageRemove).toHaveBeenCalledTimes(1);
    expect(mockStorageRemove).toHaveBeenCalledWith([uploadedPath]);
  });

  it("does not remove the old image when replacement upload fails", async () => {
    mockAuthenticatedAdmin();
    mockReadAndUpdate({
      previousImagePath: "old.jpg",
      updateResult: mockSupabaseSuccess({ id: PRODUCT_ID }),
    });
    mockStorageUpload.mockResolvedValue({ error: { message: "bucket offline" } });

    const newFile = new File(["bytes"], "photo.png", { type: "image/png" });
    const response = await POST(createRequest(PRODUCT_ID, { name: "X" }, newFile));

    expect(response.status).toBe(500);
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it("returns 415 for unsupported image extensions", async () => {
    mockAuthenticatedAdmin();

    const badFile = new File(["bytes"], "anim.gif", { type: "image/gif" });
    const response = await POST(createRequest(PRODUCT_ID, { name: "X" }, badFile));

    expect(response.status).toBe(415);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("returns 413 when replacement image exceeds 5 MB", async () => {
    mockAuthenticatedAdmin();

    const bigBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const bigFile = new File([bigBytes], "big.jpg", { type: "image/jpeg" });
    const response = await POST(createRequest(PRODUCT_ID, { name: "X" }, bigFile));

    expect(response.status).toBe(413);
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid padlet_url", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      createRequest(PRODUCT_ID, { padlet_url: "not-a-url" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Padlet URL must be a valid URL");
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it("returns 400 when is_remote=true and location_id is set in the same update", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(
      createRequest(PRODUCT_ID, {
        is_remote: true,
        location_id: "00000000-0000-0000-0000-000000000203",
      })
    );

    expect(response.status).toBe(400);
  });
});
