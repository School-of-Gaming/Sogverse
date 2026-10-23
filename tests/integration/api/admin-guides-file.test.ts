// @vitest-environment node
//
// Node environment for the one-realm reason the chat image read test gives:
// the route hands a storage Blob straight to a Response, and jsdom's Blob is
// not the undici Response's Blob.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/guides/[id]/file/route";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * GET /api/admin/guides/[id]/file?locale= — one guide's file in exactly one
 * language, for an admin checking what was uploaded.
 *
 * What this file holds still: the lookup is exact (the row is filtered to the
 * one locale asked for, and a missing one is a 404, never another language's
 * bytes), and everything is read on the admin's own session — the route does
 * not import the service-role client at all, so the bucket's admin read
 * policy is what admits the download.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const fetchMock: FetchMock = vi.fn();
const mockDownload = vi.fn();
const mockStorageFrom = vi.fn();

const GUIDE_ID = "5b0d7a6e-1c2f-4e3a-9b8d-7f6e5d4c3b2a";
const PATH = `${GUIDE_ID}/sv/0f0e0d0c-0b0a-4908-8706-050403020100.pdf`;
const PDF = new TextEncoder().encode("%PDF-1.7\n");

function mockAdmin(): void {
  const rows = createFetchStubbedClient(fetchMock);
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    // The admin's own session: rows through the real builder, the bucket
    // through a stub that records which object was read.
    supabase: {
      from: rows.from.bind(rows),
      storage: {
        from: (bucket: string) => {
          mockStorageFrom(bucket);
          return { download: (path: string) => mockDownload(path) };
        },
      },
    },
  });
}

function call(id: string, locale: string | null) {
  const query = locale === null ? "" : `?locale=${locale}`;
  return GET(new Request(`http://localhost/api/admin/guides/${id}/file${query}`), {
    params: Promise.resolve({ id }),
  });
}

describe("GET /api/admin/guides/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDownload.mockResolvedValue({
      data: new Blob([PDF], { type: "application/pdf" }),
      error: null,
    });
  });

  it("returns 401 when not authenticated, and 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValueOnce(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await call(GUIDE_ID, "sv")).status).toBe(401);
    mockRequireRole.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    expect((await call(GUIDE_ID, "sv")).status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith("admin", expect.anything());
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("returns 400 for an id that is not a guide's, or a locale the site does not ship", async () => {
    mockAdmin();
    expect((await call("not-a-uuid", "sv")).status).toBe(400);
    expect((await call(GUIDE_ID, "de")).status).toBe(400);
    expect((await call(GUIDE_ID, null)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves exactly that language's file, inline, read on the admin's session", async () => {
    mockAdmin();
    fetchMock.mockImplementationOnce(async () =>
      postgrestJson([{ storage_path: PATH, file_name: "Föräldraguide.pdf" }]),
    );

    const response = await call(GUIDE_ID, "sv");

    expect(response.status).toBe(200);
    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/rest/v1/guide_files");
    expect(url.searchParams.get("guide_id")).toBe(`eq.${GUIDE_ID}`);
    expect(url.searchParams.get("locale")).toBe("eq.sv");
    expect(mockStorageFrom).toHaveBeenCalledWith("guides");
    expect(mockDownload).toHaveBeenCalledWith(PATH);

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      `inline; filename="F_r_ldraguide.pdf"; filename*=UTF-8''${encodeURIComponent("Föräldraguide.pdf")}`,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
  });

  it("answers 404 for a language the guide has no file in, rather than another language's", async () => {
    mockAdmin();
    // maybeSingle on an empty result.
    fetchMock.mockImplementationOnce(async () => postgrestJson([]));

    const response = await call(GUIDE_ID, "fr");

    expect(response.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
