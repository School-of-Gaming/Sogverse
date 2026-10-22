import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * GET /api/guides/[id]/download — a landing page's guide as a PDF attachment.
 *
 * What this file holds still: the database is asked on the caller's own
 * session which files they may have, and only then is the one chosen object
 * read on the service-role client; a guide they may not have and one that
 * does not exist answer the same 404 without touching the bucket; the file is
 * the reader's language by the reader fallback; and the response is an
 * attachment no cache keeps, under a name that cannot break the header.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminDownload = vi.fn();
const mockAdminStorageFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => {
        mockAdminStorageFrom(bucket);
        return { download: (path: string) => mockAdminDownload(path) };
      },
    },
  }),
}));

import { GET } from "@/app/api/guides/[id]/download/route";

const GUIDE_ID = "5b0e8f8a-6a2d-4c1e-9b7f-3d2c1a0f9e84";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const mockRpc = vi.fn();

/** A file row as `get_guide_download_files` answers it. */
function fileRow(locale: string, fileName = `guide-${locale}.pdf`) {
  return {
    locale,
    storage_path: `${GUIDE_ID}/${locale}/0d1c2b3a-4f5e-4a6b-8c7d-9e0f1a2b3c4d.pdf`,
    file_name: fileName,
    byte_size: 2_400_000,
  };
}

function request(id: string, query: string): [Request, { params: Promise<unknown> }] {
  return [
    new Request(`http://localhost:3000/api/guides/${id}/download${query}`),
    { params: Promise.resolve({ id }) },
  ];
}

function signedInAs(role: "admin" | "customer" | "gamer" | "gedu") {
  mockRequireRole.mockResolvedValue({
    user: { id: "reader-id", email: "reader@example.com" },
    profile: { id: "reader-id", role },
    supabase: { rpc: mockRpc },
  });
}

describe("GET /api/guides/[id]/download", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    // A refused or failed download is logged by the route wrapper.
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs("customer");
    mockRpc.mockResolvedValue({ data: [fileRow("en"), fileRow("fi")], error: null });
    mockAdminDownload.mockResolvedValue({
      data: new Blob([PDF_BYTES], { type: "application/pdf" }),
      error: null,
    });
  });

  it("asks the role gate for every role, PIN and registration gates left on", async () => {
    await GET(...request(GUIDE_ID, "?locale=fi"));

    const [roles, options] = mockRequireRole.mock.calls[0];
    expect([...roles].sort()).toEqual(["admin", "customer", "gamer", "gedu"]);
    expect(options?.allowUnverified).toBeFalsy();
    expect(options?.allowRegistrationOwed).toBeFalsy();
  });

  it("refuses a signed-out caller before asking anything", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET(...request(GUIDE_ID, "?locale=fi"));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockAdminDownload).not.toHaveBeenCalled();
  });

  it("passes on the gate's refusal of a locked parent session", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "PIN verification required", code: "PIN_REQUIRED" },
        { status: 403 },
      ),
    );

    const response = await GET(...request(GUIDE_ID, "?locale=fi"));

    expect(response.status).toBe(403);
    expect(mockAdminDownload).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid, and a locale the app does not ship", async () => {
    expect((await GET(...request("not-a-uuid", "?locale=fi"))).status).toBe(400);
    expect((await GET(...request(GUIDE_ID, "?locale=de"))).status).toBe(400);
    expect((await GET(...request(GUIDE_ID, ""))).status).toBe(400);
    expect(mockAdminDownload).not.toHaveBeenCalled();
  });

  it("answers 404 when the database lets the caller have no file, without touching the bucket", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const response = await GET(...request(GUIDE_ID, "?locale=fi"));

    expect(response.status).toBe(404);
    expect(mockAdminDownload).not.toHaveBeenCalled();
  });

  it("asks the database on the caller's own session, then reads that object from the guides bucket", async () => {
    const response = await GET(...request(GUIDE_ID, "?locale=fi"));

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("get_guide_download_files", { p_guide_id: GUIDE_ID });
    expect(mockAdminStorageFrom).toHaveBeenCalledWith("guides");
    expect(mockAdminDownload).toHaveBeenCalledWith(fileRow("fi").storage_path);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it("serves an attachment no cache keeps", async () => {
    const response = await GET(...request(GUIDE_ID, "?locale=fi"));

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      `attachment; filename="guide-fi.pdf"; filename*=UTF-8''guide-fi.pdf`,
    );
  });

  it("falls back to English for a language the guide has no file in", async () => {
    await GET(...request(GUIDE_ID, "?locale=sv"));

    expect(mockAdminDownload).toHaveBeenCalledWith(fileRow("en").storage_path);
  });

  it("answers an object the bucket cannot read as a fault, not a refusal", async () => {
    mockAdminDownload.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const response = await GET(...request(GUIDE_ID, "?locale=fi"));

    expect(response.status).toBe(500);
  });
});
