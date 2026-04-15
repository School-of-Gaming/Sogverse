import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/upload-product-image/route";
import { NextResponse } from "next/server";

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpload = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
      })),
    },
  })),
}));

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

// jsdom's Request can't parse multipart bodies, so we hand a fake Request
// whose formData() returns the prepared FormData directly. The route only
// touches request.formData(), so this is the entire surface area we need.
function createRequest(formData: FormData): Request {
  return { formData: async () => formData } as unknown as Request;
}

describe("POST /api/admin/upload-product-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const fd = new FormData();
    fd.append("file", new File(["x"], "a.jpg", { type: "image/jpeg" }));

    const response = await POST(createRequest(fd));
    expect(response.status).toBe(401);
  });

  it("returns 400 when file field is missing", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(createRequest(new FormData()));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Missing 'file' field");
  });

  it("returns 415 for unsupported extensions", async () => {
    mockAuthenticatedAdmin();

    const fd = new FormData();
    fd.append("file", new File(["x"], "shady.gif", { type: "image/gif" }));

    const response = await POST(createRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(415);
    expect(data.error).toMatch(/JPEG|PNG|WEBP|AVIF|SVG/);
  });

  it("uploads allowed file and returns the generated path", async () => {
    mockAuthenticatedAdmin();
    mockUpload.mockResolvedValue({ error: null });

    const fd = new FormData();
    fd.append("file", new File(["bytes"], "photo.PNG", { type: "image/png" }));

    const response = await POST(createRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.path).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(mockUpload).toHaveBeenCalledWith(
      data.path,
      expect.any(File),
      expect.objectContaining({ contentType: "image/png", upsert: false })
    );
  });

  it("normalises jpeg extension to jpg", async () => {
    mockAuthenticatedAdmin();
    mockUpload.mockResolvedValue({ error: null });

    const fd = new FormData();
    fd.append("file", new File(["bytes"], "photo.jpeg", { type: "image/jpeg" }));

    const response = await POST(createRequest(fd));
    const data = await response.json();

    expect(data.path).toMatch(/\.jpg$/);
  });

  it("returns 500 when storage upload fails", async () => {
    mockAuthenticatedAdmin();
    mockUpload.mockResolvedValue({ error: { message: "bucket offline" } });

    const fd = new FormData();
    fd.append("file", new File(["bytes"], "photo.jpg", { type: "image/jpeg" }));

    const response = await POST(createRequest(fd));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("bucket offline");
  });
});
