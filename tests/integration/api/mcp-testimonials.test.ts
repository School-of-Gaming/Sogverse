import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TEST_ORIGIN as ORIGIN, callTool, mcpRequest, resultText } from "../../helpers/mcp";
import type { AdminTestimonial } from "@/services/testimonials/testimonials.contracts";

/**
 * **The testimonial tools, through the real endpoint.** The real gate, SDK and
 * tool module, with the testimonial service mocked: what is under test is what
 * each tool sends the service, how it reads the answer back to the AI app,
 * and that a quote in quotation marks or a database refusal comes back as a
 * tool error the app can act on. No tool deletes a testimonial.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: () => ({
    auth: { getClaims: mockGetClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

const testimonials = {
  listAdminTestimonials: vi.fn(),
  getAdminTestimonial: vi.fn(),
  createTestimonial: vi.fn(),
  saveTestimonialVersion: vi.fn(),
  removeTestimonialVersion: vi.fn(),
};
vi.mock("@/services/testimonials/testimonials.service", () => ({
  TestimonialsService: vi.fn(() => testimonials),
}));

// The links name each locale's own address, so the real navigation is taken
// over the shared setup's locale-blind mock.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/mcp/route");

const SUPABASE_URL = "https://project.supabase.co";
const ID = "0e6b9a52-31d4-4c7e-8f20-6a5d4c3b2a19";
const OTHER = "7c2d1e0f-9a8b-4c6d-8e5f-4a3b2c1d0e9f";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";

const tool = (name: string, args: Record<string, unknown> = {}) => callTool(POST, name, args);

const PARENT: AdminTestimonial = {
  id: ID,
  versions: [
    { locale: "en", from: "Mum, Finland", quote: "Gaming is fun and supervised." },
    { locale: "fi", from: "Äiti, Suomi", quote: "Pelaaminen on hauskaa ja valvottua." },
  ],
  usages: [],
  createdAt: "2026-10-16T09:00:00Z",
  created: { by: null, via: null },
  updatedAt: "2026-10-16T10:00:00Z",
  lastSaved: { by: "Kyle Hutchinson", via: { clientId: CLIENT_ID, name: "Claude" } },
};

const GEDU: AdminTestimonial = {
  ...PARENT,
  id: OTHER,
  versions: [{ locale: "en", from: "Gedu Pixel", quote: "I love these sessions." }],
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
  for (const method of Object.values(testimonials)) method.mockReset();
  testimonials.getAdminTestimonial.mockResolvedValue(PARENT);
  testimonials.listAdminTestimonials.mockResolvedValue([PARENT, GEDU]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reading", () => {
  it("lists every testimonial with its versions, its record and its editor", async () => {
    const result = await tool("list_testimonials");

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      testimonials: [
        {
          testimonialId: ID,
          versions: [
            { locale: "en", language: "English", from: "Mum, Finland", quote: "Gaming is fun and supervised." },
            { locale: "fi", from: "Äiti, Suomi" },
          ],
          lastSaved: { by: "Kyle Hutchinson", via: { name: "Claude" } },
          editorLink: `${ORIGIN}/en/admin/testimonials/${ID}`,
        },
        { testimonialId: OTHER, versions: [{ locale: "en", from: "Gedu Pixel" }] },
      ],
    });
  });

  it("answers an unknown id as a tool error", async () => {
    testimonials.getAdminTestimonial.mockResolvedValue(null);
    const result = await tool("get_testimonial", { testimonialId: OTHER });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("No testimonial has that id.");
  });

  it("tells the AI app never to write a testimonial's words, and offers no delete", async () => {
    const response = await POST(
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": "2025-06-18",
          Authorization: "Bearer token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    const text = await response.text();
    expect(text).toContain("Never write, invent, embellish");
    expect(text).not.toContain("delete_testimonial");
  });
});

describe("writing", () => {
  it("creates a testimonial with the versions the admin supplied", async () => {
    testimonials.createTestimonial.mockResolvedValue(OTHER);

    const result = await tool("create_testimonial", {
      versions: [{ locale: "en", from: "Gedu Pixel", quote: "I love these sessions." }],
    });

    expect(testimonials.createTestimonial).toHaveBeenCalledWith({
      versions: [{ locale: "en", from: "Gedu Pixel", quote: "I love these sessions." }],
    });
    expect(result.structuredContent).toEqual({
      testimonialId: OTHER,
      editorLink: `${ORIGIN}/en/admin/testimonials/${OTHER}`,
    });
  });

  it("refuses a quote in quotation marks before anything is sent", async () => {
    const result = await tool("save_testimonial_version", {
      testimonialId: ID,
      locale: "fr",
      from: "Maman, Finlande",
      quote: "« Le jeu est amusant. »",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Leave the marks out");
    expect(testimonials.saveTestimonialVersion).not.toHaveBeenCalled();
  });

  it("writes one language and answers with the testimonial as it now stands", async () => {
    const result = await tool("save_testimonial_version", {
      testimonialId: ID,
      locale: "sv",
      from: "Mamma, Finland",
      quote: "Spelandet är roligt och övervakat.",
    });

    expect(testimonials.saveTestimonialVersion).toHaveBeenCalledWith(ID, {
      locale: "sv",
      from: "Mamma, Finland",
      quote: "Spelandet är roligt och övervakat.",
    });
    expect(result.structuredContent).toMatchObject({ testimonialId: ID, versions: [{ locale: "en" }, { locale: "fi" }] });
  });

  it("removes one language through the one-language writer", async () => {
    await tool("remove_testimonial_language", { testimonialId: ID, locale: "fi" });
    expect(testimonials.removeTestimonialVersion).toHaveBeenCalledWith(ID, "fi");
  });

  it("returns a database refusal as it is written, and a fault of ours without its detail", async () => {
    const sentence = "That is the testimonial's only language version, and a testimonial needs one";
    testimonials.removeTestimonialVersion.mockRejectedValueOnce(dbError("23514", sentence));
    const refused = await tool("remove_testimonial_language", { testimonialId: ID, locale: "en" });
    expect(refused.isError).toBe(true);
    expect(resultText(refused)).toBe(sentence);

    vi.spyOn(console, "error").mockImplementation(() => {});
    testimonials.removeTestimonialVersion.mockRejectedValueOnce(dbError("42P01", "relation does not exist"));
    const fault = await tool("remove_testimonial_language", { testimonialId: ID, locale: "en" });
    expect(fault.isError).toBe(true);
    expect(resultText(fault)).not.toContain("relation");
  });
});

describe("landing pages", () => {
  const PAGE = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";

  it("lists each landing page placing a testimonial, live or saved, with its status page", async () => {
    testimonials.getAdminTestimonial.mockResolvedValue({
      ...PARENT,
      usages: [
        {
          pageId: PAGE,
          titles: [
            { locale: "en", title: "Gaming clubs in Espoo" },
            { locale: "fi", title: "Pelikerhot Espoossa" },
          ],
          inLiveCopy: true,
          inWorkingCopy: false,
        },
      ],
    });

    const result = await tool("get_testimonial", { testimonialId: ID });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      usedIn: [
        {
          pageId: PAGE,
          title: "Gaming clubs in Espoo",
          inLiveCopy: true,
          inWorkingCopy: false,
          adminLink: `${ORIGIN}/en/admin/landing-pages/${PAGE}`,
        },
      ],
    });
  });

  it("lists every testimonial with where it is used, nothing for one shown nowhere", async () => {
    testimonials.listAdminTestimonials.mockResolvedValue([
      {
        ...PARENT,
        usages: [
          {
            pageId: PAGE,
            titles: [{ locale: "en", title: "Gaming clubs in Espoo" }],
            inLiveCopy: true,
            inWorkingCopy: true,
          },
        ],
      },
      GEDU,
    ]);

    const result = await tool("list_testimonials");

    expect(result.structuredContent).toMatchObject({
      testimonials: [
        { testimonialId: ID, usedIn: [{ pageId: PAGE, inLiveCopy: true, inWorkingCopy: true }] },
        { testimonialId: OTHER, usedIn: [] },
      ],
    });
  });

  it("tells the AI app an edit shows on live landing pages at once, and how a quote comes off one", async () => {
    const result = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
    const text = await result.text();
    expect(text).toContain("on every live landing page placing it, with no republish");
    expect(text).toContain("from a landing page by saving that page's structure without it");
  });
});
