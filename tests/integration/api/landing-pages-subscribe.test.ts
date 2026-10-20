import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE_NAME } from "@/lib/consent";
import type { LandingSection } from "@/lib/landing-pages/sections";
import type { PublishedLandingPage } from "@/services/landing-pages/landing-pages.contracts";

/**
 * **A landing page's email sign-up, end to end through the route.** A public
 * form a stranger controls, whose one power is making Brevo mail a
 * confirmation to whatever address it is handed. So what is pinned is the
 * shape of that power: a bot's honeypot fill costs nothing and learns nothing,
 * the rate limit stands in front of Brevo, a new and a known address get the
 * same answer, the UTM values reach Brevo only under marketing consent, the
 * payload is exactly Brevo's double opt-in contract with a confirmation link
 * on the trusted origin, and a misconfigured deployment refuses rather than
 * swallowing sign-ups.
 */

const mockAllowance = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "take_landing_signup_allowance") return mockAllowance(args);
      throw new Error(`Unexpected rpc in admin mock: ${fn}`);
    },
  }),
}));

vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => ({}) }));

const mockGetPublishedPage = vi.fn();
vi.mock("@/services/landing-pages/landing-pages.service", () => ({
  LandingPageService: class {
    getPublishedPage(id: string) {
      return mockGetPublishedPage(id);
    }
  },
}));

const mockCreateDoubleOptInContact = vi.fn();
vi.mock("@/lib/brevo", () => ({
  createDoubleOptInContact: (...args: unknown[]) => mockCreateDoubleOptInContact(...args),
}));

// The confirmation link names the page's own address in its locale, so the
// real navigation is taken over the shared setup's locale-blind mock.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/landing-pages/subscribe/route");

const PAGE = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const HERO = "9d39dd23-2b00-43f4-a0f5-af63bd58ad67";
const FORM = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const CTA = "0b3c6f52-6d0e-4b8e-9f0c-1f4e8e9c1a21";

const SECTIONS: LandingSection[] = [
  { id: HERO, type: "hero" },
  { id: FORM, type: "subscribe" },
  { id: CTA, type: "cta", button: { kind: "internal", path: "/shop" } },
];

function livePage(sections: LandingSection[] = SECTIONS): PublishedLandingPage {
  return {
    id: PAGE,
    firstPublishedAt: "2026-10-01T00:00:00Z",
    publishedAt: "2026-10-01T00:00:00Z",
    sections,
    imagePaths: {},
    versions: [
      { locale: "en", title: "Espoo", summary: "Clubs", slug: "espoo-clubs", sectionTexts: {} },
      { locale: "fi", title: "Espoo", summary: "Kerhot", slug: "espoon-kerhot", sectionTexts: {} },
    ],
  };
}

const VALID = {
  pageId: PAGE,
  sectionId: FORM,
  locale: "fi",
  email: " Aino@Example.com ",
  firstName: " Aino ",
  consent: true,
  website: "",
  utm: { source: "newsletter", campaign: "autumn" },
};

function consentCookie(marketing: boolean): string {
  const value = encodeURIComponent(
    JSON.stringify({ v: 1, at: "2026-10-01T10:00:00.000Z", analytics: true, marketing }),
  );
  return `${CONSENT_COOKIE_NAME}=${value}`;
}

function request(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost:3000/api/landing-pages/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** What the route handed Brevo, from the one call it should have made. */
function sentToBrevo(): {
  email: string;
  attributes: Record<string, unknown>;
  listIds: number[];
  templateId: number;
  redirectionUrl: string;
} {
  expect(mockCreateDoubleOptInContact).toHaveBeenCalledTimes(1);
  return mockCreateDoubleOptInContact.mock.calls[0][0];
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sog.test");
  vi.stubEnv("BREVO_SIGNUP_LIST_ID", "12");
  vi.stubEnv("BREVO_SIGNUP_DOI_TEMPLATE_ID", "34");
  vi.stubEnv("BREVO_SIGNUP_DOI_TEMPLATE_ID_FI", "");
  mockAllowance.mockReset().mockResolvedValue({ data: true, error: null });
  mockGetPublishedPage.mockReset().mockResolvedValue(livePage());
  mockCreateDoubleOptInContact.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/landing-pages/subscribe", () => {
  it("hands Brevo the double opt-in: the address, the list, the template and the way back", async () => {
    const response = await POST(request(VALID, { cookie: consentCookie(true) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const sent = sentToBrevo();
    expect(sent.email).toBe("aino@example.com");
    expect(sent.listIds).toEqual([12]);
    expect(sent.templateId).toBe(34);
    // The page in its locale, on the trusted origin, at the form it came from
    // — by its id, which a slug rename before the click cannot break.
    expect(sent.redirectionUrl).toBe(
      `https://sog.test/fi/tutustu/${PAGE}?subscribed=1#signup-${FORM}`,
    );
    expect(sent.attributes).toEqual({
      FIRSTNAME: "Aino",
      SIGNUP_PAGE: "espoon-kerhot",
      SIGNUP_PAGE_ID: PAGE,
      SIGNUP_LOCALE: "fi",
      UTM_SOURCE: "newsletter",
      UTM_CAMPAIGN: "autumn",
    });
  });

  it("builds the way back on the trusted origin, never a spoofed Host", async () => {
    await POST(request(VALID, { host: "evil.example" }));
    expect(sentToBrevo().redirectionUrl.startsWith("https://sog.test/")).toBe(true);
  });

  it.each([
    ["no consent cookie", {}],
    ["marketing refused", { cookie: consentCookie(false) }],
  ])("sends no UTM values with %s", async (_, headers) => {
    await POST(request(VALID, headers));
    const { attributes } = sentToBrevo();
    expect(Object.keys(attributes).filter((name) => name.startsWith("UTM_"))).toEqual([]);
  });

  it("drops a UTM value the shared sanitiser refuses, keeping the others", async () => {
    await POST(
      request(
        { ...VALID, utm: { source: "=HYPERLINK()", medium: "email" } },
        { cookie: consentCookie(true) },
      ),
    );
    const { attributes } = sentToBrevo();
    expect(attributes).toMatchObject({ UTM_MEDIUM: "email" });
    expect(attributes).not.toHaveProperty("UTM_SOURCE");
  });

  it("uses the locale's own confirmation template where one is set", async () => {
    vi.stubEnv("BREVO_SIGNUP_DOI_TEMPLATE_ID_FI", "56");
    await POST(request(VALID));
    expect(sentToBrevo().templateId).toBe(56);
  });

  it("answers a known address exactly as a new one", async () => {
    // Brevo answers 201 and 204; its client resolves both alike.
    const first = await POST(request(VALID));
    const second = await POST(request(VALID));
    expect(first.status).toBe(second.status);
    expect(await first.json()).toEqual(await second.json());
  });

  describe("the honeypot", () => {
    it("answers a filled one as a success, sending and counting nothing", async () => {
      const response = await POST(request({ ...VALID, website: "https://spam.example" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(mockCreateDoubleOptInContact).not.toHaveBeenCalled();
      expect(mockAllowance).not.toHaveBeenCalled();
      expect(mockGetPublishedPage).not.toHaveBeenCalled();
    });
  });

  describe("the rate limit", () => {
    it("charges the requesting address, hashed, before Brevo is called", async () => {
      await POST(request(VALID));
      const { p_client_key: key } = mockAllowance.mock.calls[0][0];
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(key).not.toContain("203.0.113.7");

      await POST(request(VALID, { "x-forwarded-for": "198.51.100.1" }));
      expect(mockAllowance.mock.calls[1][0].p_client_key).not.toBe(key);
    });

    it("charges an IPv6 address's /64, so a fresh address in it is the same client", async () => {
      await POST(request(VALID, { "x-forwarded-for": "2001:db8:1:2::a" }));
      await POST(request(VALID, { "x-forwarded-for": "2001:db8:1:2:ffff::b" }));
      await POST(request(VALID, { "x-forwarded-for": "2001:db8:1:3::a" }));
      const [first, sameNetwork, otherNetwork] = mockAllowance.mock.calls.map(
        ([args]) => args.p_client_key,
      );
      expect(sameNetwork).toBe(first);
      expect(otherNetwork).not.toBe(first);
    });

    it("refuses with 429 once spent, and Brevo is not called", async () => {
      mockAllowance.mockResolvedValue({ data: false, error: null });
      const response = await POST(request(VALID));
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ code: "RATE_LIMITED" });
      expect(mockCreateDoubleOptInContact).not.toHaveBeenCalled();
    });
  });

  describe("refusals", () => {
    it.each([
      ["no consent", { ...VALID, consent: false }],
      ["no first name", { ...VALID, firstName: undefined }],
      ["an empty first name", { ...VALID, firstName: "" }],
      ["a whitespace-only first name", { ...VALID, firstName: "   " }],
      ["not an address", { ...VALID, email: "aino" }],
      ["our internal domain", { ...VALID, email: "aino@gamer.sogverse.internal" }],
      ["a locale we do not ship", { ...VALID, locale: "de" }],
      ["a page id that is not an id", { ...VALID, pageId: "espoo" }],
    ])("answers 400 to %s", async (_, body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(mockCreateDoubleOptInContact).not.toHaveBeenCalled();
    });

    it.each([
      ["a page that is not live", null],
      ["a page without that form", livePage([SECTIONS[0], SECTIONS[2]])],
      [
        "a section of that id that is not a form",
        livePage([SECTIONS[0], { id: FORM, type: "cta", button: { kind: "internal", path: "/" } }]),
      ],
    ])("answers 404 to %s", async (_, page) => {
      mockGetPublishedPage.mockResolvedValue(page);
      const response = await POST(request(VALID));
      expect(response.status).toBe(404);
      expect(mockCreateDoubleOptInContact).not.toHaveBeenCalled();
    });

    it("refuses every sign-up while the list or template is not configured, saying which", async () => {
      vi.stubEnv("BREVO_SIGNUP_LIST_ID", "");
      vi.stubEnv("BREVO_SIGNUP_DOI_TEMPLATE_ID", "not-an-id");
      const response = await POST(request(VALID));
      expect(response.status).toBe(503);
      expect(mockAllowance).not.toHaveBeenCalled();
      expect(mockCreateDoubleOptInContact).not.toHaveBeenCalled();
      expect(String(vi.mocked(console.error).mock.calls[0])).toContain(
        "BREVO_SIGNUP_LIST_ID, BREVO_SIGNUP_DOI_TEMPLATE_ID",
      );
    });

    it("gives a generic error when Brevo refuses, and logs it without the address", async () => {
      mockCreateDoubleOptInContact.mockRejectedValue(new Error("Attribute not found"));
      const response = await POST(request(VALID));
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error).not.toContain("Attribute");
      const logged = vi.mocked(console.error).mock.calls.map(String).join("\n");
      expect(logged).toContain("Attribute not found");
      expect(logged).not.toContain("aino@example.com");
    });
  });
});
