import { describe, expect, it, vi } from "vitest";
import {
  createFetchStubbedClient,
  postgrestJson,
  postgrestPage,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";
import {
  emptyTestimonialForm,
  testimonialInputFromForm,
  testimonialSaveBlocker,
  type TestimonialForm,
} from "@/components/admin/testimonials/testimonial-form";
import {
  QUOTATION_MARKS,
  hasQuotationMarks,
  testimonialInput,
  testimonialWriteFailure,
} from "@/services/testimonials/testimonials.contracts";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";

const A = "11111111-2222-4333-8444-555555555555";
const B = "66666666-7777-4888-9999-aaaaaaaaaaaa";

/**
 * The REAL Supabase client over a fake fetch transport answering `body`, so
 * what is asserted is the request the genuine client sent.
 */
function stubbed(body: unknown) {
  const fetchMock: FetchMock = vi.fn<typeof fetch>();
  fetchMock.mockResolvedValue(postgrestJson(body));
  return { fetchMock, service: new TestimonialsService(createFetchStubbedClient(fetchMock)) };
}

/** The RPC a call reached, and the arguments it was sent. */
function rpcCall(fetchMock: FetchMock) {
  const [input, init] = fetchMock.mock.calls[0];
  return {
    path: requestedUrl(input).pathname,
    args: JSON.parse(String(init?.body)),
  };
}

describe("quotation marks", () => {
  it("are refused at either end of a quote, and nowhere else", () => {
    for (const mark of QUOTATION_MARKS) {
      expect(hasQuotationMarks(`${mark}Words`)).toBe(true);
      expect(hasQuotationMarks(`Words${mark}`)).toBe(true);
      expect(hasQuotationMarks(`Wor${mark}ds`)).toBe(false);
    }
    expect(hasQuotationMarks("  “Words”  ")).toBe(true);
    expect(hasQuotationMarks("« Mots »")).toBe(true);
  });

  it("leave the apostrophes alone, which start and end words", () => {
    expect(hasQuotationMarks("’ej Qapla’")).toBe(false);
    expect(hasQuotationMarks("'Twas the parents'")).toBe(false);
  });

  it("refuse a save before it reaches the database", () => {
    const parsed = testimonialInput.safeParse({
      versions: [{ locale: "en", from: "Mum, Finland", quote: "“Great.”" }],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("the editor's save check", () => {
  const withDraft = (from: string, quote: string): TestimonialForm => {
    const form = emptyTestimonialForm("fi");
    return { tabs: { ...form.tabs, drafts: { fi: { from, quote } } } };
  };

  it("names nothing written, a quote in marks, and a half-written language", () => {
    expect(testimonialSaveBlocker(emptyTestimonialForm("en"))).toEqual({ kind: "noVersion" });
    expect(testimonialSaveBlocker(withDraft("Äiti, Suomi", "”Hauskaa.”"))).toEqual({
      kind: "quoted",
      locale: "fi",
    });
    expect(testimonialSaveBlocker(withDraft("", "Hauskaa."))).toEqual({
      kind: "incomplete",
      locale: "fi",
    });
    expect(testimonialSaveBlocker(withDraft("Äiti, Suomi", "Hauskaa."))).toBeNull();
  });

  it("sends the trimmed versions", () => {
    expect(testimonialInputFromForm(withDraft(" Äiti, Suomi ", " Hauskaa. "))).toEqual({
      versions: [{ locale: "fi", from: "Äiti, Suomi", quote: "Hauskaa." }],
    });
  });
});

describe("TestimonialsService", () => {
  it("reads a testimonial with its versions in locale order and `from` for the stored attribution", async () => {
    const row = {
      id: A,
      created_at: "2026-10-16T09:00:00Z",
      created_via: null,
      updated_at: "2026-10-16T10:00:00Z",
      last_saved_via: null,
      creator: { first_name: "Kyle", last_name: "Hutchinson" },
      last_saver: null,
      versions: [
        { locale: "fi", attribution: "Äiti", quote: "Yksi." },
        { locale: "en", attribution: "Mum", quote: "One." },
      ],
    };
    // The testimonial's row, and no landing page placing it.
    const fetchMock: FetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(async (input) =>
      requestedUrl(input).pathname.endsWith("/landing_pages")
        ? postgrestPage([], { from: 0, total: 0 })
        : postgrestJson(row),
    );
    const service = new TestimonialsService(createFetchStubbedClient(fetchMock));

    expect(await service.getAdminTestimonial(A)).toEqual({
      id: A,
      versions: [
        { locale: "en", from: "Mum", quote: "One." },
        { locale: "fi", from: "Äiti", quote: "Yksi." },
      ],
      usages: [],
      createdAt: "2026-10-16T09:00:00Z",
      created: { by: "Kyle Hutchinson", via: null },
      updatedAt: "2026-10-16T10:00:00Z",
      lastSaved: { by: null, via: null },
    });
  });

  it("reads a live landing page's testimonials through the public read, versions in locale order", async () => {
    const { fetchMock, service } = stubbed([
      {
        testimonial_id: A,
        versions: [
          { locale: "fi", attribution: "Äiti", quote: "Yksi." },
          { locale: "en", attribution: "Mum", quote: "One." },
        ],
      },
    ]);

    const live = await service.listLandingPageTestimonials(B);

    expect(rpcCall(fetchMock)).toEqual({
      path: "/rest/v1/rpc/list_landing_page_testimonials",
      args: { p_page_id: B },
    });
    expect(live).toEqual([
      {
        id: A,
        versions: [
          { locale: "en", from: "Mum", quote: "One." },
          { locale: "fi", from: "Äiti", quote: "Yksi." },
        ],
      },
    ]);
  });

  it("answers a page id that is not a uuid with nothing, asking nobody", async () => {
    const { fetchMock, service } = stubbed([]);
    expect(await service.listLandingPageTestimonials("espoo")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("writes `from` as the stored attribution", async () => {
    const { fetchMock, service } = stubbed(A);

    await service.createTestimonial({
      versions: [{ locale: "en", from: "Gedu Pixel", quote: "Great sessions." }],
    });

    expect(rpcCall(fetchMock)).toEqual({
      path: "/rest/v1/rpc/create_testimonial",
      args: { p_versions: [{ locale: "en", attribution: "Gedu Pixel", quote: "Great sessions." }] },
    });
  });

  it("writes one language through its own writer", async () => {
    const { fetchMock, service } = stubbed(null);

    await service.saveTestimonialVersion(A, { locale: "sv", from: "Mamma", quote: "Roligt." });

    expect(rpcCall(fetchMock)).toEqual({
      path: "/rest/v1/rpc/save_testimonial_version",
      args: { p_id: A, p_locale: "sv", p_attribution: "Mamma", p_quote: "Roligt." },
    });
  });
});

describe("testimonialWriteFailure", () => {
  it("quotes the refusals written for an admin and hides the rest", () => {
    expect(testimonialWriteFailure({ code: "23514", message: "The fi version needs its quote" })).toEqual({
      kind: "reason",
      reason: "The fi version needs its quote",
    });
    expect(testimonialWriteFailure({ code: "23503", message: "violates foreign key" })).toEqual({
      kind: "unknown",
    });
    expect(testimonialWriteFailure({ code: "42P01", message: "relation" })).toEqual({ kind: "unknown" });
  });
});
