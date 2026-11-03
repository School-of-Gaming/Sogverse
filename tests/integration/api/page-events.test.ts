import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { SITE_HOST, SITE_ORIGIN } from "../../mocks/site-origin";
import { CONSENT_COOKIE_NAME, serialiseConsent } from "@/lib/consent";
import { advertisedProductDetails } from "@/lib/marketing-events";
import { asObject } from "../../helpers/json";

/**
 * ============================================================================
 * POST /api/page-events — the server twins of the browser's three moments.
 * ============================================================================
 *
 * Run against the real reporters with only `fetch` stubbed, so what is pinned
 * is end to end: which requests reach Meta and Reddit, under which names and
 * with the browser's id, and which reach neither. Every refusal answers the
 * same 204 as a report, so each case asserts on what was sent, never on the
 * status alone.
 */

vi.mock("next/server", async (importOriginal) =>
  (await import("../../mocks/next-after")).nextServerWithImmediateAfter(
    importOriginal,
  ),
);

/** The session, as the cookie-bound server client reads it. */
const mockGetClaims = vi.fn();
const mockProfileRead = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: () => mockGetClaims() },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: () => mockProfileRead(id),
          }),
        }),
      };
    },
  }),
}));

// The product read is its own module's subject; here only what the route asks
// it and does with its answer.
const mockAdvertisedProductFor = vi.fn();
vi.mock("@/lib/advertised-product.server", () => ({
  advertisedProductFor: (...args: unknown[]) =>
    mockAdvertisedProductFor(...args),
}));

import { POST } from "@/app/api/page-events/route";
import { settleAfter } from "../../mocks/next-after";

const META_URL = "https://graph.facebook.com/v25.0/1234567890/events";
const REDDIT_URL =
  "https://ads-api.reddit.com/api/v3/pixels/a2_abc123/conversion_events";

const PRODUCT_ID = "0f8b6c1e-3c2a-4d5e-9f60-7a8b9c0d1e2f";
const PRODUCT = advertisedProductDetails({
  id: PRODUCT_ID,
  topic: "roblox_studio",
  billing_mode: "paid",
  product_translations: [{ locale: "en", name: "Roblox Studio Club" }],
  product_prices: [{ currency: "eur", price_cents: 4900 }],
});

const EVENT_ID = "3f2b7c1e-9a4d-4e8b-b6c5-0d1e2f3a4b5c";
const PARENT_ID = "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f";

/** Finnish shop page, as the address bar holds it, with an ad link's query. */
const SHOP_PAGE = "/fi/kauppa?utm_source=meta&fbclid=abc";
const PRODUCT_PAGE = `/fi/kauppa/${PRODUCT_ID}`;

function consentCookie(marketing: boolean): string {
  const value = encodeURIComponent(
    serialiseConsent({
      analytics: true,
      marketing,
      decidedAt: "2026-09-03T10:15:00.000Z",
    }),
  );
  return `${CONSENT_COOKIE_NAME}=${value}`;
}

function post(
  body: unknown,
  { marketing = true }: { marketing?: boolean } = {},
): Request {
  return new Request(`${SITE_ORIGIN}/api/page-events`, {
    method: "POST",
    headers: {
      host: SITE_HOST,
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0 (test)",
      // A Referer naming another page: the report must never use it.
      referer: `${SITE_ORIGIN}/parent/gamers/123`,
      cookie: consentCookie(marketing),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Post a body and wait for the work the route deferred. */
async function send(body: unknown, options?: { marketing?: boolean }) {
  const response = await POST(post(body, options));
  await settleAfter();
  return response;
}

type FetchCall = (input: string, init: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchCall>;

function eventSentTo(url: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([sentUrl]) => sentUrl === url);
  if (!call) throw new Error(`nothing was sent to ${url}`);
  const body = asObject(JSON.parse(String(call[1].body)));
  const events = url === META_URL ? body.data : asObject(body.data).events;
  if (!Array.isArray(events)) throw new Error("the body carried no events");
  return asObject(events[0]);
}

const anonymous = () => mockGetClaims.mockResolvedValue({ data: null, error: null });
function signedInAs(role: string, email = "parent@x.test") {
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: PARENT_ID } },
    error: null,
  });
  // The address is on the profile row so a report that named the parent would
  // have it to hash; the assertions are that none does.
  mockProfileRead.mockResolvedValue({ data: { role, email }, error: null });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1234567890");
  vi.stubEnv("META_CONVERSIONS_API_ACCESS_TOKEN", "meta-token");
  vi.stubEnv("META_CONVERSIONS_API_TEST_EVENT_CODE", undefined);
  vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", "a2_abc123");
  vi.stubEnv("REDDIT_CONVERSIONS_API_ACCESS_TOKEN", "reddit-token");
  vi.stubEnv("REDDIT_CONVERSIONS_API_TEST_ID", undefined);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_ORIGIN);
  fetchMock = vi
    .fn<FetchCall>()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockGetClaims.mockReset();
  mockProfileRead.mockReset();
  mockAdvertisedProductFor.mockReset().mockResolvedValue(PRODUCT);
  anonymous();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/page-events — the happy paths", () => {
  it("reports an anonymous page view to both platforms under the browser's id", async () => {
    const response = await send({
      event: "page_view",
      eventId: EVENT_ID,
      pagePath: SHOP_PAGE,
    });

    expect(response.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const meta = eventSentTo(META_URL);
    expect(meta.event_name).toBe("PageView");
    expect(meta.event_id).toBe(EVENT_ID);
    // The trusted origin and the vetted page — never the Referer.
    expect(meta.event_source_url).toBe(`${SITE_ORIGIN}${SHOP_PAGE}`);
    expect(meta).not.toHaveProperty("custom_data");
    // No account: nothing but what a report carries without one.
    expect(asObject(meta.user_data)).not.toHaveProperty("em");
    expect(asObject(meta.user_data)).not.toHaveProperty("external_id");

    const reddit = eventSentTo(REDDIT_URL);
    expect(reddit.type).toEqual({ tracking_type: "PAGE_VISIT" });
    expect(reddit.event_source_url).toBe(`${SITE_ORIGIN}${SHOP_PAGE}`);
    expect(asObject(reddit.metadata)).toEqual({ conversion_id: EVENT_ID });
    expect(asObject(reddit.user)).not.toHaveProperty("email");
  });

  it("reports a product view with the product read from its row", async () => {
    await send({
      event: "view_item",
      eventId: EVENT_ID,
      pagePath: PRODUCT_PAGE,
      productId: PRODUCT_ID,
    });

    expect(mockAdvertisedProductFor).toHaveBeenCalledWith(PRODUCT_ID);
    const meta = eventSentTo(META_URL);
    expect(meta.event_name).toBe("ViewContent");
    expect(meta.event_id).toBe(EVENT_ID);
    expect(meta.custom_data).toEqual(PRODUCT.meta);

    const reddit = eventSentTo(REDDIT_URL);
    expect(reddit.type).toEqual({ tracking_type: "VIEW_CONTENT" });
    expect(asObject(reddit.metadata)).toEqual({
      conversion_id: EVENT_ID,
      item_count: 1,
      products: PRODUCT.reddit.products,
      value: 49,
      currency: "EUR",
    });
  });

  it("reports a signed-in parent's checkout start without naming the parent", async () => {
    signedInAs("customer");

    await send({
      event: "add_to_cart",
      eventId: EVENT_ID,
      pagePath: PRODUCT_PAGE,
      productId: PRODUCT_ID,
    });

    const meta = eventSentTo(META_URL);
    expect(meta.event_name).toBe("InitiateCheckout");
    expect(meta.event_id).toBe(EVENT_ID);
    expect(asObject(meta.user_data)).not.toHaveProperty("em");
    expect(asObject(meta.user_data)).not.toHaveProperty("external_id");

    const reddit = eventSentTo(REDDIT_URL);
    expect(reddit.type).toEqual({ tracking_type: "ADD_TO_CART" });
    expect(asObject(reddit.metadata).conversion_id).toBe(EVENT_ID);
    expect(asObject(reddit.user)).not.toHaveProperty("email");
    expect(asObject(reddit.user)).not.toHaveProperty("external_id");
  });

  it.each(["customer", "admin", "gedu"])(
    "reports for a signed-in %s, naming no account",
    async (role) => {
      signedInAs(role);

      await send({ event: "page_view", eventId: EVENT_ID, pagePath: SHOP_PAGE });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const metaUser = asObject(eventSentTo(META_URL).user_data);
      expect(metaUser).not.toHaveProperty("em");
      expect(metaUser).not.toHaveProperty("external_id");
      const redditUser = asObject(eventSentTo(REDDIT_URL).user);
      expect(redditUser).not.toHaveProperty("email");
      expect(redditUser).not.toHaveProperty("external_id");
    },
  );
});

describe("POST /api/page-events — every refusal is a silent 204", () => {
  const PAGE_VIEW = { event: "page_view", eventId: EVENT_ID, pagePath: SHOP_PAGE };

  it("reports nothing without marketing consent", async () => {
    const response = await send(PAGE_VIEW, { marketing: false });

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports nothing for a signed-in gamer", async () => {
    signedInAs("gamer");

    const response = await send(PAGE_VIEW);

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports nothing for a session whose role cannot be read", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: PARENT_ID } },
      error: null,
    });
    mockProfileRead.mockResolvedValue({ data: null, error: { message: "down" } });

    await send(PAGE_VIEW);
    expect(fetchMock).not.toHaveBeenCalled();

    // Claims that fail to verify are not an anonymous visitor either.
    mockGetClaims.mockResolvedValue({ data: null, error: new Error("bad jwt") });
    await send(PAGE_VIEW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a page off the marketing allowlist", "/fi/parent/gamers/123"],
    ["a page matching no route", "/fi/nowhere"],
    ["a marketing page with an unvetted query", "/fi/login?token=secret"],
    [
      "the login bounce carrying a child's page",
      "/fi/login?redirect=/fi/parent/gamers/123",
    ],
    ["an absolute URL", "https://evil.test/fi/kauppa"],
    ["a non-canonical path", "/fi/../kauppa"],
  ])("reports nothing for %s", async (_label, pagePath) => {
    const response = await send({ ...PAGE_VIEW, pagePath });

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports nothing for a product we do not advertise", async () => {
    mockAdvertisedProductFor.mockResolvedValue(undefined);

    await send({
      event: "view_item",
      eventId: EVENT_ID,
      pagePath: PRODUCT_PAGE,
      productId: PRODUCT_ID,
    });

    expect(mockAdvertisedProductFor).toHaveBeenCalledWith(PRODUCT_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports nothing for a product other than the one its page names", async () => {
    await send({
      event: "add_to_cart",
      eventId: EVENT_ID,
      pagePath: SHOP_PAGE,
      productId: PRODUCT_ID,
    });

    expect(mockAdvertisedProductFor).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an event id that is not a UUID", { ...PAGE_VIEW, eventId: "not-a-uuid" }],
    ["an event with no twin", { ...PAGE_VIEW, event: "sign_up" }],
    [
      "a product event with no product",
      { event: "view_item", eventId: EVENT_ID, pagePath: PRODUCT_PAGE },
    ],
    ["a body that is not JSON", "{"],
  ])("answers 204 and reports nothing for %s", async (_label, body) => {
    const response = await send(body);

    expect(response.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockGetClaims).not.toHaveBeenCalled();
  });
});
