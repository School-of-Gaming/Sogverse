// @vitest-environment node
//
// Node environment so Request, FormData and File are all undici/Node natives
// from one realm: jsdom's FormData isn't serializable by undici's Request, and
// a file parsed out of a real multipart body would fail the route's
// `instanceof File` check against jsdom's File.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/guides/route";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * POST /api/admin/guides — the admin tab's upload of one language's file.
 *
 * The route is the HTTP shell around the store function the MCP tool shares:
 * it reads the form, picks the target (a guide by id, or a new guide by its
 * label), and turns the store's and the database's refusals into codes the
 * page translates. So these cases are about that translation, and about the
 * split the store is built on — the object goes to the private bucket on the
 * service-role client, the rows are written on the admin's own session.
 *
 * The admin's session is a REAL typed client with a stubbed fetch, so the
 * genuine RPC builder runs and the assertions are about the calls it makes.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpload = vi.fn();
const mockRemove = vi.fn();
const mockStorageFrom = vi.fn((_bucket: string) => ({ upload: mockUpload, remove: mockRemove }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: (bucket: string) => mockStorageFrom(bucket) },
  })),
}));

const fetchMock: FetchMock = vi.fn();

const GUIDE_ID = "5b0d7a6e-1c2f-4e3a-9b8d-7f6e5d4c3b2a";
const PDF = new TextEncoder().encode("%PDF-1.7\n%fake guide\n");

function mockAdmin(): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: createFetchStubbedClient(fetchMock),
  });
}

function createRequest(
  fields: { file?: File | null; locale?: string | null; guideId?: string; label?: string } = {},
): Request {
  const form = new FormData();
  const file = "file" in fields ? fields.file : new File([PDF], "Parents guide.pdf");
  if (file) form.append("file", file);
  const locale = "locale" in fields ? fields.locale : "fi";
  if (locale) form.append("locale", locale);
  if (fields.guideId !== undefined) form.append("guideId", fields.guideId);
  if (fields.label !== undefined) form.append("label", fields.label);
  return new Request("http://localhost/api/admin/guides", { method: "POST", body: form });
}

/** The JSON body of the nth fetch the route issued. */
function requestBody(call: number): unknown {
  return JSON.parse(String(fetchMock.mock.calls[call][1]?.body));
}

describe("POST /api/admin/guides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await POST(createRequest({ label: "Guide" }))).status).toBe(401);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Only admins can upload a guide" }, { status: 403 }),
    );
    expect((await POST(createRequest({ label: "Guide" }))).status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("admin", expect.anything());
  });

  it("returns 400 for a missing file, a locale the site does not ship, or an unclear target", async () => {
    mockAdmin();
    for (const request of [
      createRequest({ file: null, label: "Guide" }),
      createRequest({ locale: "de", label: "Guide" }),
      createRequest({ locale: null, label: "Guide" }),
      createRequest({}),
      createRequest({ guideId: GUIDE_ID, label: "Guide" }),
      createRequest({ guideId: "not-a-uuid" }),
    ]) {
      expect((await POST(request)).status).toBe(400);
    }
    expect(mockUpload).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a file over the cap with too_large, storing nothing", async () => {
    mockAdmin();
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(PDF);
    const response = await POST(createRequest({ file: new File([big], "big.pdf"), label: "Guide" }));
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("too_large");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a file that is not a PDF by its bytes, whatever its name", async () => {
    mockAdmin();
    const response = await POST(
      createRequest({ file: new File(["<html>"], "guide.pdf"), label: "Guide" }),
    );
    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe("not_pdf");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a blank label for a new guide", async () => {
    mockAdmin();
    const response = await POST(createRequest({ label: "   " }));
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("label");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("creates a new guide with its first file: the object on the service role, the rows on the admin's session", async () => {
    mockAdmin();
    fetchMock.mockImplementationOnce(async () => postgrestJson(GUIDE_ID));

    const response = await POST(createRequest({ label: "  Parents' guide  " }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      created: true,
      locale: "fi",
      fileName: "Parents guide.pdf",
      byteSize: PDF.byteLength,
      replaced: false,
    });
    expect(mockStorageFrom).toHaveBeenCalledWith("guides");
    const [path, bytes, options] = mockUpload.mock.calls[0];
    expect(body.guideId).toMatch(/^[0-9a-f-]{36}$/);
    expect(path).toMatch(/^[0-9a-f-]{36}\/fi\/[0-9a-f-]{36}\.pdf$/);
    expect(String(path).startsWith(`${body.guideId}/fi/`)).toBe(true);
    expect(bytes).toEqual(PDF);
    expect(options).toMatchObject({ contentType: "application/pdf", upsert: false });

    expect(requestedUrl(fetchMock.mock.calls[0][0]).pathname).toBe("/rest/v1/rpc/create_guide");
    expect(requestBody(0)).toMatchObject({
      p_id: body.guideId,
      p_label: "Parents' guide",
      p_locale: "fi",
      p_storage_path: path,
      p_file_name: "Parents guide.pdf",
      p_byte_size: PDF.byteLength,
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("replaces a language's file on an existing guide and deletes the object it replaced", async () => {
    mockAdmin();
    const old = `${GUIDE_ID}/fi/0f0e0d0c-0b0a-4908-8706-050403020100.pdf`;
    fetchMock.mockImplementationOnce(async () => postgrestJson(old));

    const response = await POST(createRequest({ guideId: GUIDE_ID }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      guideId: GUIDE_ID,
      created: false,
      replaced: true,
    });
    expect(requestedUrl(fetchMock.mock.calls[0][0]).pathname).toBe("/rest/v1/rpc/save_guide_file");
    expect(requestBody(0)).toMatchObject({ p_id: GUIDE_ID, p_locale: "fi" });
    expect(mockRemove).toHaveBeenCalledWith([old]);
  });

  it("quotes the database's refusal with code refused, and deletes the object just uploaded", async () => {
    mockAdmin();
    fetchMock.mockImplementationOnce(async () =>
      postgrestJson(
        { message: "A guide's label is at most 200 characters", code: "23514", details: null, hint: null },
        400,
      ),
    );

    const response = await POST(createRequest({ label: "Guide" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A guide's label is at most 200 characters",
      code: "refused",
    });
    expect(mockRemove).toHaveBeenCalledWith([mockUpload.mock.calls[0][0]]);
  });

  it("answers 404 when the guide is gone", async () => {
    mockAdmin();
    fetchMock.mockImplementationOnce(async () =>
      postgrestJson({ message: "No such guide", code: "P0002", details: null, hint: null }, 400),
    );

    const response = await POST(createRequest({ guideId: GUIDE_ID }));

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("refused");
  });

  it("keeps any other database failure generic", async () => {
    mockAdmin();
    fetchMock.mockImplementationOnce(async () =>
      postgrestJson({ message: "relation secrets does not exist", code: "42P01", details: null, hint: null }, 400),
    );

    const response = await POST(createRequest({ guideId: GUIDE_ID }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).not.toContain("secrets");
    expect(body.code).toBeUndefined();
  });
});
