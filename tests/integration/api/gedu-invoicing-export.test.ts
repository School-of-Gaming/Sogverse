import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import fi from "../../../messages/fi.json";
import {
  GEDU_INVOICING_WORKING_MONTH,
  MY_GEDU_INVOICING_VIEWERS,
  geduInvoicingMonthFixture,
} from "@/components/gedu-invoicing/mock-gedu-invoicing-fixtures";

/**
 * The gedu's own invoicing month as a file: a CSV for their spreadsheet, or a
 * PDF work statement for their invoice.
 *
 * It reads the same caller-scoped RPC the gedu's page reads, on the gedu's own
 * session client, and answers with a document rather than JSON — so what this
 * suite is about is the headers that make a browser save the file, the body
 * being the file it claims to be, and a failed read never passing for an empty
 * month.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRpc = vi.fn();

import { GET } from "@/app/api/gedu/invoicing/export/route";

/** The fixture gedu who was away once — Aino Kallio. */
const AINO = MY_GEDU_INVOICING_VIEWERS["was-away"];

/** The working month narrowed to Aino, the way the caller-scoped RPC answers. */
function ainosMonth() {
  return geduInvoicingMonthFixture(GEDU_INVOICING_WORKING_MONTH, AINO);
}

function request(query: string): Request {
  return new Request(`http://localhost:3000/api/gedu/invoicing/export${query}`);
}

function mockGedu() {
  mockRequireRole.mockResolvedValue({
    user: { id: AINO },
    profile: {
      role: "gedu",
      first_name: "Aino",
      last_name: "Kallio",
      email: "aino.kallio@example.com",
    },
    supabase: { rpc: mockRpc },
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockNonGedu() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only gedus can export their invoicing month" },
      { status: 403 },
    ),
  );
}

describe("GET /api/gedu/invoicing/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: ainosMonth(), error: null });
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await GET(request("?month=2026-05&format=csv&locale=en"));

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a caller who is not a gedu", async () => {
    mockNonGedu();

    const response = await GET(request("?month=2026-05&format=csv&locale=en"));

    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Input --

  it.each([
    ["a malformed month", "?month=2026-13&format=csv&locale=en"],
    ["a month outside this century", "?month=0007-03&format=csv&locale=en"],
    ["no month at all", "?format=csv&locale=en"],
    ["an unknown format", "?month=2026-05&format=xlsx&locale=en"],
    ["an unknown locale", "?month=2026-05&format=csv&locale=de"],
  ])("returns 400 for %s", async (_, query) => {
    mockGedu();

    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- The files --

  it("reads the caller's own month, as the month's first day", async () => {
    mockGedu();

    await GET(request("?month=2026-05&format=csv&locale=en"));

    expect(mockRpc).toHaveBeenCalledWith("get_my_gedu_invoicing", {
      p_month_start: "2026-05-01",
    });
  });

  it("answers with the month as a CSV attachment", async () => {
    mockGedu();

    const response = await GET(request("?month=2026-05&format=csv&locale=en"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="sog-gedu-invoicing-2026-05-aino-kallio.csv"',
    );
    // Every figure is recomputed on every read, so a cached copy can quietly
    // disagree with the page it was downloaded from.
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // The bytes, not the decoded text: `text()` would swallow the BOM Excel
    // needs to read the file as UTF-8.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    const [header, ...rows] = csv.replace(/^﻿/, "").split("\r\n");
    expect(header.split(";")[0]).toBe("Date");
    expect(rows.filter((row) => row !== "").length).toBeGreaterThan(0);
    expect(csv).toContain("Pelikerho Kivikko");
  });

  it("words the file in the locale the page was read in", async () => {
    mockGedu();

    const csv = await (
      await GET(request("?month=2026-05&format=csv&locale=fi"))
    ).text();

    expect(csv.replace(/^﻿/, "").split(";")[0]).toBe(
      fi.geduInvoicing.export.columnDate,
    );
  });

  it("answers with the month as a PDF attachment", async () => {
    mockGedu();

    const response = await GET(request("?month=2026-05&format=pdf&locale=en"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="sog-gedu-invoicing-2026-05-aino-kallio.pdf"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("still downloads a month with nothing in it, named for the caller", async () => {
    // The build lists only gedus with a line, so an empty month carries nobody;
    // "nothing to invoice" is still a true answer about the month.
    mockGedu();
    mockRpc.mockResolvedValue({
      data: geduInvoicingMonthFixture("2026-04-01", AINO),
      error: null,
    });

    const csvResponse = await GET(
      request("?month=2026-04&format=csv&locale=en"),
    );
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get("Content-Disposition")).toBe(
      'attachment; filename="sog-gedu-invoicing-2026-04-aino-kallio.csv"',
    );
    const lines = (await csvResponse.text())
      .split("\r\n")
      .filter((line) => line !== "");
    expect(lines).toHaveLength(1);

    const pdfResponse = await GET(
      request("?month=2026-04&format=pdf&locale=en"),
    );
    expect(pdfResponse.status).toBe(200);
    const pdf = Buffer.from(await pdfResponse.arrayBuffer());
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  // -- The read behind it --

  it("answers an error, never an empty file, when the read fails", async () => {
    mockGedu();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "the database fell over" },
    });

    const response = await GET(request("?month=2026-05&format=csv&locale=en"));

    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("maps the guard's refusal off the wire to a 403", async () => {
    // The RPC is guard-first on the gedu role, so the gate here is the first of
    // two layers rather than the only one.
    mockGedu();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const response = await GET(request("?month=2026-05&format=pdf&locale=en"));

    expect(response.status).toBe(403);
  });
});
