import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TEST_ORIGIN as ORIGIN, callTool, mcpRequest, readRpc, resultText } from "../../helpers/mcp";
import type { AdminGuide } from "@/services/guides/guides.contracts";

/**
 * **The guide tools, through the real endpoint.** The real gate, SDK and tool
 * module, with the guide service mocked for the reads and writes; the upload
 * runs the real store function against fake clients, so what is under test is
 * what reaches the bucket and the database, what the store refuses before
 * either, and how each answer and refusal reads to the AI app. No tool deletes
 * a guide.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
const mockRpc = vi.fn();
const bearerClient = {
  auth: { getClaims: mockGetClaims },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  rpc: mockRpc,
};
vi.mock("@/lib/supabase/bearer", () => ({ createBearerClient: () => bearerClient }));

const mockUpload = vi.fn();
const mockRemove = vi.fn();
const bucket = { upload: mockUpload, remove: mockRemove };
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => bucket } }),
}));

const guides = {
  listAdminGuides: vi.fn(),
  getAdminGuide: vi.fn(),
  saveGuideLabel: vi.fn(),
  removeGuideFile: vi.fn(),
};
vi.mock("@/services/guides/guides.service", () => ({
  GuidesService: vi.fn(() => guides),
}));

// The links name each locale's own address, so the real navigation is taken
// over the shared setup's locale-blind mock.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/mcp/route");

const SUPABASE_URL = "https://project.supabase.co";
const ID = "0e6b9a52-31d4-4c7e-8f20-6a5d4c3b2a19";
const PAGE = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";

const tool = (name: string, args: Record<string, unknown> = {}) => callTool(POST, name, args);

const PDF = Buffer.from("%PDF-1.7\n% a guide\n").toString("base64");

const GUIDE: AdminGuide = {
  id: ID,
  label: "Parents' guide 2026",
  files: [
    {
      locale: "en",
      fileName: "parents-guide.pdf",
      byteSize: 1_572_864,
      uploadedAt: "2026-10-22T09:00:00Z",
      uploaded: { by: "Kyle Hutchinson", via: null },
    },
  ],
  usages: [],
  createdAt: "2026-10-22T09:00:00Z",
  created: { by: "Kyle Hutchinson", via: null },
  updatedAt: "2026-10-22T10:00:00Z",
  lastSaved: { by: "Kyle Hutchinson", via: { clientId: CLIENT_ID, name: "Claude" } },
};

function dbError(code: string, message: string) {
  return Object.assign(new Error(message), { code, details: null, hint: null });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  mockGetClaims.mockResolvedValue({
    data: {
      claims: {
        sub: "8f1c2a8e-6c1b-4a7e-9a52-2d0d3c6e9b11",
        email: "admin@example.com",
        iss: `${SUPABASE_URL}/auth/v1`,
        exp: 2_000_000_000,
        client_id: CLIENT_ID,
      },
    },
    error: null,
  });
  mockMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
  for (const method of Object.values(guides)) method.mockReset();
  guides.getAdminGuide.mockResolvedValue(GUIDE);
  guides.listAdminGuides.mockResolvedValue([GUIDE]);
  mockRpc.mockReset();
  mockUpload.mockReset().mockResolvedValue({ data: {}, error: null });
  mockRemove.mockReset().mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reading", () => {
  it("lists every guide with its files, the languages it lacks and where it is offered", async () => {
    guides.listAdminGuides.mockResolvedValue([
      {
        ...GUIDE,
        usages: [
          {
            pageId: PAGE,
            titles: [{ locale: "en", title: "Gaming clubs in Espoo" }],
            inLiveCopy: true,
            inWorkingCopy: false,
          },
        ],
      },
    ]);

    const result = await tool("list_guides");

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      guides: [
        {
          guideId: ID,
          label: "Parents' guide 2026",
          files: [{ locale: "en", language: "English", fileName: "parents-guide.pdf", size: "1.5 MB" }],
          languagesWithoutFile: ["fi", "sv", "fr", "tlh"],
          usedIn: [
            {
              pageId: PAGE,
              title: "Gaming clubs in Espoo",
              inLiveCopy: true,
              inWorkingCopy: false,
              adminLink: `${ORIGIN}/en/admin/landing-pages/${PAGE}`,
            },
          ],
          lastSaved: { by: "Kyle Hutchinson", via: { name: "Claude" } },
          adminLink: `${ORIGIN}/en/admin/guides/${ID}`,
        },
      ],
    });
  });

  it("answers an unknown id as a tool error", async () => {
    guides.getAdminGuide.mockResolvedValue(null);
    const result = await tool("get_guide", { guideId: ID });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("No guide has that id.");
  });

  it("tells the AI app how a guide reaches a landing page, and offers no delete", async () => {
    const text = await (
      await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }))
    ).text();
    expect(text).toContain("add a guide section naming its guideId to the page with save_landing_page_structure");
    expect(text).toContain("Guides are never deleted");
    expect(text).not.toContain("delete_guide");
  });
});

describe("writing", () => {
  it("saves a label and answers with the guide as it now stands", async () => {
    const result = await tool("save_guide_label", { guideId: ID, label: "  Parents' guide  " });

    expect(guides.saveGuideLabel).toHaveBeenCalledWith(ID, "Parents' guide");
    expect(result.structuredContent).toMatchObject({ guideId: ID });
  });

  it("removes one language's file, and quotes the database refusing the last", async () => {
    await tool("remove_guide_language", { guideId: ID, locale: "fi" });
    expect(guides.removeGuideFile).toHaveBeenCalledWith(ID, "fi");

    const sentence = "That is the guide's only file, and a guide needs one";
    guides.removeGuideFile.mockRejectedValueOnce(dbError("23514", sentence));
    const refused = await tool("remove_guide_language", { guideId: ID, locale: "en" });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toBe(sentence);

    vi.spyOn(console, "error").mockImplementation(() => {});
    guides.removeGuideFile.mockRejectedValueOnce(dbError("42P01", "relation does not exist"));
    const fault = await tool("remove_guide_language", { guideId: ID, locale: "en" });
    expect(fault.isError).toBe(true);
    expect(resultText(fault)).not.toContain("relation");
  });
});

describe("the uploader", () => {
  it("opens for a new guide with its label, sending a client without views to the Guides tab", async () => {
    const result = await tool("open_guide_uploader", { label: "School pack", locale: "fi" });

    expect(guides.getAdminGuide).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      guideId: null,
      label: "School pack",
      locale: "fi",
      replaces: null,
      uploader: {
        kind: "pdf",
        heading: "New guide",
        maxBytes: 2_900_000,
        uploadTool: "upload_guide",
        arguments: { locale: "fi", label: "School pack" },
        language: "Finnish",
      },
    });
    expect(resultText(result)).toContain(`the Guides tab of the Marketing hub in Sogverse's admin (${ORIGIN}/en/admin/guides/new)`);
  });

  it("opens for an existing guide's file, naming the one it replaces and the remedy for a large PDF", async () => {
    const result = await tool("open_guide_uploader", { guideId: ID, locale: "en" });

    expect(result.structuredContent).toMatchObject({
      guideId: ID,
      replaces: { fileName: "parents-guide.pdf" },
      adminLink: `${ORIGIN}/en/admin/guides/${ID}`,
      uploader: {
        arguments: { locale: "en", guideId: ID },
        subject: expect.stringContaining("replacing parents-guide.pdf"),
        tooLarge: expect.stringContaining("Acrobat's \"Reduce file size\""),
      },
    });
  });

  it.each([
    ["neither a guide nor a label", { locale: "en" }],
    ["both a guide and a label", { guideId: ID, label: "Pack", locale: "en" }],
  ])("refuses to open with %s", async (_, args) => {
    const result = await tool("open_guide_uploader", args);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("not both");
  });

  it("refuses to open for a guide that does not exist", async () => {
    guides.getAdminGuide.mockResolvedValue(null);
    const result = await tool("open_guide_uploader", { guideId: ID, locale: "en" });
    expect(resultText(result)).toBe("No guide has that id.");
  });

  it("stores a new guide's first file: the bytes on the service role, the rows on the admin's client", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const result = await tool("upload_guide", {
      label: "School pack",
      locale: "fi",
      fileName: "koulupaketti.pdf",
      pdfBase64: PDF,
    });

    expect(result.isError).toBeUndefined();
    const [path, bytes] = mockUpload.mock.calls[0];
    expect(path).toMatch(/^[0-9a-f-]{36}\/fi\/[0-9a-f-]{36}\.pdf$/);
    expect(Buffer.from(bytes).toString("base64")).toBe(PDF);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_guide",
      expect.objectContaining({ p_label: "School pack", p_locale: "fi", p_file_name: "koulupaketti.pdf" }),
    );
    expect(result.structuredContent).toEqual({
      guideId: path.split("/")[0],
      created: true,
      locale: "fi",
      fileName: "koulupaketti.pdf",
      byteSize: Buffer.from(PDF, "base64").byteLength,
      replaced: false,
    });
  });

  it("replaces an existing guide's file and deletes the object it replaced", async () => {
    mockRpc.mockResolvedValue({ data: `${ID}/en/old.pdf`, error: null });

    const result = await tool("upload_guide", { guideId: ID, locale: "en", fileName: "new.pdf", pdfBase64: PDF });

    expect(mockRpc).toHaveBeenCalledWith("save_guide_file", expect.objectContaining({ p_id: ID }));
    expect(mockRemove).toHaveBeenCalledWith([`${ID}/en/old.pdf`]);
    expect(result.structuredContent).toMatchObject({ guideId: ID, created: false, replaced: true });
  });

  it("refuses a file that is not a PDF before anything is stored", async () => {
    const result = await tool("upload_guide", {
      guideId: ID,
      locale: "en",
      fileName: "guide.pdf",
      pdfBase64: Buffer.from("PK\u0003\u0004 a zip").toString("base64"),
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("That file is not a PDF. A guide is a PDF file.");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a file over the uploader's cap, naming the Guides tab", async () => {
    const big = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2_900_000)]).toString("base64");

    const result = await tool("upload_guide", { guideId: ID, locale: "en", fileName: "big.pdf", pdfBase64: big });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Canva's \"Compress file\"");
    expect(resultText(result)).toContain("Guides tab of the Marketing hub");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses an upload naming both a guide and a label", async () => {
    const result = await tool("upload_guide", {
      guideId: ID,
      label: "Pack",
      locale: "en",
      fileName: "a.pdf",
      pdfBase64: PDF,
    });
    expect(result.isError).toBe(true);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("lists the opening tool with the shared view, and the upload tool as callable by the view alone", async () => {
    const { tools } = z
      .object({
        tools: z.array(z.object({ name: z.string(), _meta: z.record(z.unknown()).optional() })),
      })
      .parse(
        (await readRpc(await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }))))
          .result,
      );

    const uri = "ui://sogverse/picture-uploader.html";
    expect(tools.find((t) => t.name === "open_guide_uploader")?._meta).toEqual({
      ui: { resourceUri: uri },
      "ui/resourceUri": uri,
    });
    expect(tools.find((t) => t.name === "upload_guide")?._meta).toEqual({
      ui: { resourceUri: uri, visibility: ["app"] },
      "ui/resourceUri": uri,
    });
  });
});
