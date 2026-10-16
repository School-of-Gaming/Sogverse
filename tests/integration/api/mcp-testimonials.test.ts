import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TEST_ORIGIN as ORIGIN, callTool, resultText } from "../../helpers/mcp";
import type { AdminTestimonial } from "@/services/testimonials";

/**
 * **The testimonial tools, through the real endpoint.** The real gate, SDK and
 * tool module, with the testimonial service mocked: what is under test is what
 * each tool sends the service, how it reads the answer back to the AI app —
 * where a testimonial is shown, the home spots — and that a quote in
 * quotation marks or a database refusal comes back as a tool error the app
 * can act on. No tool sets a home spot.
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
  deleteTestimonial: vi.fn(),
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

const PLACED: AdminTestimonial = {
  id: ID,
  versions: [
    { locale: "en", from: "Mum, Finland", quote: "Gaming is fun and supervised." },
    { locale: "fi", from: "Äiti, Suomi", quote: "Pelaaminen on hauskaa ja valvottua." },
  ],
  usages: [{ kind: "home", spot: "safety", position: 1 }],
  createdAt: "2026-10-16T09:00:00Z",
  created: { by: null, via: null },
  updatedAt: "2026-10-16T10:00:00Z",
  lastSaved: { by: "Kyle Hutchinson", via: { clientId: CLIENT_ID, name: "Claude" } },
};

const UNPLACED: AdminTestimonial = {
  ...PLACED,
  id: OTHER,
  versions: [{ locale: "en", from: "Gedu Pixel", quote: "I love these sessions." }],
  usages: [],
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
  testimonials.getAdminTestimonial.mockResolvedValue(PLACED);
  testimonials.listAdminTestimonials.mockResolvedValue([PLACED, UNPLACED]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reading", () => {
  it("lists every testimonial with where it is shown and whether it can be deleted", async () => {
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
          usedIn: [
            {
              place: "home",
              spot: "safety",
              position: 1,
              spotSize: 2,
              shownOn: [`${ORIGIN}/en`, `${ORIGIN}/en/about#parents`],
            },
          ],
          canDelete: false,
          lastSaved: { by: "Kyle Hutchinson", via: { name: "Claude" } },
          editorLink: `${ORIGIN}/en/admin/testimonials/${ID}`,
        },
        { testimonialId: OTHER, usedIn: [], canDelete: true },
      ],
    });
  });

  it("lists the home spots in page order with what fills each", async () => {
    const result = await tool("list_home_testimonial_spots");

    expect(result.structuredContent).toMatchObject({
      spots: [
        { spot: "feature", size: 1, testimonials: [] },
        { spot: "safety", size: 2, testimonials: [{ position: 1, testimonialId: ID }] },
        { spot: "row", size: 3, testimonials: [] },
      ],
    });
  });

  it("answers an unknown id as a tool error", async () => {
    testimonials.getAdminTestimonial.mockResolvedValue(null);
    const result = await tool("get_testimonial", { testimonialId: OTHER });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("No testimonial has that id.");
  });

  it("tells the AI app never to write a testimonial's words", async () => {
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
    expect(text).not.toContain("set_home");
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

  it("writes one language and answers where the testimonial is shown", async () => {
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
    expect(result.structuredContent).toMatchObject({ usedIn: [{ spot: "safety" }] });
  });

  it("removes one language through the one-language writer", async () => {
    await tool("remove_testimonial_language", { testimonialId: ID, locale: "fi" });
    expect(testimonials.removeTestimonialVersion).toHaveBeenCalledWith(ID, "fi");
  });

  it("returns the database's refusal of deleting a placed testimonial as it is written", async () => {
    const sentence =
      "This testimonial is shown in the home page's safety (beside the safety facts) spot, and so on About too, so it cannot be deleted. Which testimonial fills a home spot is changed by a developer.";
    testimonials.deleteTestimonial.mockRejectedValue(dbError("23503", sentence));

    const result = await tool("delete_testimonial", { testimonialId: ID });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe(sentence);
  });

  it("answers a fault of ours without its developer-facing detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    testimonials.deleteTestimonial.mockRejectedValue(dbError("42P01", "relation does not exist"));

    const result = await tool("delete_testimonial", { testimonialId: ID });

    expect(result.isError).toBe(true);
    expect(resultText(result)).not.toContain("relation");
  });
});
