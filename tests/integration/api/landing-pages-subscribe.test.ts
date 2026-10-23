import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_COOKIE_NAME } from "@/lib/consent";
import { KLAVIYO_REVISION } from "@/lib/klaviyo";
import type { LandingSection } from "@/lib/landing-pages/sections";
import type { PublishedLandingPage } from "@/services/landing-pages/landing-pages.contracts";

/**
 * **A landing page's email sign-up, end to end through the route and the
 * Klaviyo client.** A public form a stranger controls, whose one power is
 * putting whatever address it is handed on the newsletter list. So what is
 * pinned is the shape of that power: a bot's honeypot fill costs nothing and
 * learns nothing, a new and a known address get the same answer, the UTM
 * values reach Klaviyo only under marketing consent, the two calls are exactly
 * Klaviyo's profile-import and subscribe contracts carrying nothing beyond
 * what the owner ruled, any Klaviyo refusal or timeout is a generic 502 whose
 * logs never carry the address, and a
 * misconfigured deployment refuses rather than swallowing sign-ups.
 */

vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => ({}) }));

const mockGetPublishedPage = vi.fn();
vi.mock("@/services/landing-pages/landing-pages.service", () => ({
  LandingPageService: class {
    getPublishedPage(id: string) {
      return mockGetPublishedPage(id);
    }
  },
}));

const { POST } = await import("@/app/api/landing-pages/subscribe/route");

const PAGE = "3f1c2a7e-8d4b-4e59-9a61-0b7c5d2e8f13";
const HERO = "9d39dd23-2b00-43f4-a0f5-af63bd58ad67";
const FORM = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const CTA = "0b3c6f52-6d0e-4b8e-9f0c-1f4e8e9c1a21";
const KEY = "pk_test_landing";
const LIST = "Y6nRLr";

const SECTIONS: LandingSection[] = [
  { id: HERO, type: "hero" },
  { id: FORM, type: "subscribe", background: "default" },
  { id: CTA, type: "cta", background: "default", button: { kind: "internal", path: "/shop" } },
];

function livePage(sections: LandingSection[] = SECTIONS): PublishedLandingPage {
  return {
    id: PAGE,
    firstPublishedAt: "2026-10-01T00:00:00Z",
    publishedAt: "2026-10-01T00:00:00Z",
    sections,
    pictures: {},
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
  lastName: " Virtanen ",
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

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/landing-pages/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function klaviyoAnswers(...statuses: number[]) {
  for (const status of statuses) {
    mockFetch.mockResolvedValueOnce(
      new Response(status === 202 ? null : JSON.stringify({ data: {} }), { status }),
    );
  }
}

interface SentCall {
  url: string;
  headers: Record<string, string>;
  body: { data: Record<string, unknown> & { attributes: Record<string, unknown> } };
}

/** The calls the route made to Klaviyo, in order. */
function sentToKlaviyo(): SentCall[] {
  return mockFetch.mock.calls.map(([url, init]) => ({
    url,
    headers: Object.fromEntries(new Headers(init.headers)),
    body: JSON.parse(String(init.body)),
  }));
}

/** The profile attributes the profile-import call carried. */
function profileSent(): Record<string, unknown> {
  return sentToKlaviyo()[0].body.data.attributes;
}

beforeEach(() => {
  vi.stubEnv("KLAVIYO_PRIVATE_API_KEY", KEY);
  vi.stubEnv("KLAVIYO_NEWSLETTER_LIST_ID", LIST);
  mockGetPublishedPage.mockReset().mockResolvedValue(livePage());
  mockFetch.mockReset();
  klaviyoAnswers(201, 202);
  vi.stubGlobal("fetch", mockFetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/landing-pages/subscribe", () => {
  it("upserts the profile, then subscribes it to the list", async () => {
    const response = await POST(request(VALID, { cookie: consentCookie(true) }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const [profile, subscribe] = sentToKlaviyo();
    for (const call of [profile, subscribe]) {
      expect(call.headers).toMatchObject({
        authorization: `Klaviyo-API-Key ${KEY}`,
        revision: KLAVIYO_REVISION,
        "content-type": "application/vnd.api+json",
        accept: "application/vnd.api+json",
      });
    }

    expect(profile.url).toBe("https://a.klaviyo.com/api/profile-import");
    expect(profile.body).toEqual({
      data: {
        type: "profile",
        attributes: {
          email: "aino@example.com",
          first_name: "Aino",
          last_name: "Virtanen",
          locale: "fi",
          properties: {
            landing_page_id: PAGE,
            utm_source: "newsletter",
            utm_campaign: "autumn",
          },
        },
      },
    });

    expect(subscribe.url).toBe("https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs");
    expect(subscribe.body).toEqual({
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          custom_source: expect.any(String),
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email: "aino@example.com",
                  subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                },
              },
            ],
          },
        },
        relationships: { list: { data: { type: "list", id: LIST } } },
      },
    });
  });

  it.each([
    ["absent", { firstName: undefined, lastName: undefined }],
    ["blank", { firstName: "", lastName: "   " }],
  ])("accepts %s names and leaves them out of the profile", async (_, names) => {
    const response = await POST(request({ ...VALID, ...names }));
    expect(response.status).toBe(200);
    const profile = profileSent();
    expect(profile).not.toHaveProperty("first_name");
    expect(profile).not.toHaveProperty("last_name");
  });

  it("sends only the name that was given", async () => {
    await POST(request({ ...VALID, lastName: undefined }));
    expect(profileSent()).toMatchObject({ first_name: "Aino" });
    expect(profileSent()).not.toHaveProperty("last_name");
  });

  it.each([
    ["no consent cookie", {}],
    ["marketing refused", { cookie: consentCookie(false) }],
  ])("sends no UTM values with %s", async (_, headers) => {
    await POST(request(VALID, headers));
    expect(profileSent().properties).toEqual({
      landing_page_id: PAGE,
    });
  });

  it("drops a UTM value the shared sanitiser refuses, keeping the others", async () => {
    await POST(
      request(
        { ...VALID, utm: { source: "=HYPERLINK()", medium: "email" } },
        { cookie: consentCookie(true) },
      ),
    );
    const properties = profileSent().properties;
    expect(properties).toMatchObject({ utm_medium: "email" });
    expect(properties).not.toHaveProperty("utm_source");
  });

  it("answers a known address exactly as a new one", async () => {
    // Klaviyo answers 201 for a new profile and 200 for one it holds.
    klaviyoAnswers(200, 202);
    const first = await POST(request(VALID));
    const second = await POST(request(VALID));
    expect(first.status).toBe(200);
    expect(first.status).toBe(second.status);
    expect(await first.json()).toEqual(await second.json());
  });

  describe("the honeypot", () => {
    it("answers a filled one as a success, sending nothing", async () => {
      const response = await POST(request({ ...VALID, website: "https://spam.example" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockGetPublishedPage).not.toHaveBeenCalled();
    });
  });

  describe("refusals", () => {
    it.each([
      ["no consent", { ...VALID, consent: false }],
      ["consent sent as a string", { ...VALID, consent: "true" }],
      ["not an address", { ...VALID, email: "aino" }],
      ["our internal domain", { ...VALID, email: "aino@gamer.sogverse.internal" }],
      ["a first name over the length cap", { ...VALID, firstName: "A".repeat(101) }],
      ["a last name over the length cap", { ...VALID, lastName: "V".repeat(101) }],
      ["a locale we do not ship", { ...VALID, locale: "de" }],
      ["a page id that is not an id", { ...VALID, pageId: "espoo" }],
    ])("answers 400 to %s", async (_, body) => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each([
      ["a page that is not live", null],
      ["a page without that form", livePage([SECTIONS[0], SECTIONS[2]])],
      [
        "a section of that id that is not a form",
        livePage([SECTIONS[0], { id: FORM, type: "cta", background: "default", button: { kind: "internal", path: "/" } }]),
      ],
    ])("answers 404 to %s", async (_, page) => {
      mockGetPublishedPage.mockResolvedValue(page);
      const response = await POST(request(VALID));
      expect(response.status).toBe(404);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("refuses every sign-up while the key or the list is not configured, saying which", async () => {
      vi.stubEnv("KLAVIYO_PRIVATE_API_KEY", "");
      vi.stubEnv("KLAVIYO_NEWSLETTER_LIST_ID", " ");
      const response = await POST(request(VALID));
      expect(response.status).toBe(503);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(String(vi.mocked(console.error).mock.calls[0])).toContain(
        "KLAVIYO_PRIVATE_API_KEY, KLAVIYO_NEWSLETTER_LIST_ID",
      );
    });

    it.each([
      ["the profile import", [400], 1],
      ["the subscription", [201, 500], 2],
    ])(
      "gives a generic 502 when Klaviyo refuses %s, and logs only its codes, never the address",
      async (_, statuses, calls) => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        mockFetch.mockReset();
        for (const status of statuses) {
          mockFetch.mockResolvedValueOnce(
            new Response(
              JSON.stringify(
                status >= 400
                  ? {
                      errors: [
                        {
                          status,
                          code: "invalid",
                          title: "Invalid input.",
                          detail: "aino@example.com is not a valid profile",
                          source: { pointer: "/data/attributes/email" },
                          meta: { email: "aino@example.com" },
                        },
                      ],
                    }
                  : { data: {} },
              ),
              { status },
            ),
          );
        }
        const response = await POST(request(VALID));
        expect(response.status).toBe(502);
        expect(mockFetch).toHaveBeenCalledTimes(calls);
        const body = await response.json();
        expect(JSON.stringify(body)).not.toContain("aino@example.com");
        expect(JSON.stringify(body)).not.toContain("invalid");

        const logged = [...vi.mocked(console.error).mock.calls, ...warn.mock.calls]
          .flat()
          .map((arg) => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg)))
          .join("\n");
        expect(logged).toContain(String(statuses[statuses.length - 1]));
        expect(logged).toContain("invalid: Invalid input.");
        expect(logged.toLowerCase()).not.toContain("aino@example.com");
      },
    );

    it.each([
      ["TimeoutError", "The operation was aborted due to timeout"],
      ["AbortError", "This operation was aborted"],
    ])("gives the generic 502 when a Klaviyo call is aborted (%s)", async (name, message) => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValueOnce(new DOMException(message, name));
      const response = await POST(request(VALID));
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "Could not sign you up. Please try again later.",
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });
  });
});
