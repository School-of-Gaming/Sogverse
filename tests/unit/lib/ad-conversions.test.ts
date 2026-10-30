import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { SITE_ORIGIN } from "../../mocks/site-origin";
import {
  CONSENT_COOKIE_NAME,
  serialiseConsent,
} from "@/lib/consent";
import { reportAdConversion } from "@/lib/ad-conversions.server";
import { advertisedProductDetails } from "@/lib/marketing-events";
import { asObject } from "../../helpers/json";

/**
 * ============================================================================
 * One conversion, every platform: the fan-out the routes call.
 * ============================================================================
 *
 * Run against the real reporters with only `fetch` stubbed, because what is
 * pinned is the hand-off: each platform hears the conversion with the product
 * in its own fields, and one platform failing leaves the other's report
 * untouched. What each report says is its own suite's subject.
 */

const META_URL = "https://graph.facebook.com/v25.0/1234567890/events";
const REDDIT_URL =
  "https://ads-api.reddit.com/api/v3/pixels/a2_abc123/conversion_events";

const PRODUCT = advertisedProductDetails({
  id: "abc-123",
  topic: "roblox_studio",
  billing_mode: "paid",
  product_translations: [{ locale: "en", name: "Roblox Studio Club" }],
  product_prices: [{ currency: "eur", price_cents: 4900 }],
});

const PARENT = { id: "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f", email: "p@x.test" };

function request(): Request {
  const consent = encodeURIComponent(
    serialiseConsent({
      analytics: true,
      marketing: true,
      decidedAt: "2026-09-03T10:15:00.000Z",
    }),
  );
  return new Request(`${SITE_ORIGIN}/api/x`, {
    method: "POST",
    headers: { cookie: `${CONSENT_COOKIE_NAME}=${consent}` },
  });
}

type FetchCall = (input: string, init: RequestInit) => Promise<Response>;
let fetchMock: Mock<FetchCall>;

/** The one event sent to a platform's endpoint. */
function eventSentTo(url: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([sentUrl]) => sentUrl === url);
  if (!call) throw new Error(`nothing was sent to ${url}`);
  const body = asObject(JSON.parse(String(call[1].body)));
  const events = url === META_URL ? body.data : asObject(body.data).events;
  if (!Array.isArray(events)) throw new Error("the body carried no events");
  return asObject(events[0]);
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reportAdConversion", () => {
  it("tells each platform about the enrolment in its own product fields", async () => {
    await reportAdConversion(
      request(),
      {
        event: "enrolment",
        outcome: "enrolled",
        product: PRODUCT,
        sourcePath: "/shop/abc-123",
      },
      PARENT,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const meta = eventSentTo(META_URL);
    expect(meta.event_name).toBe("CompleteRegistration");
    expect(meta.custom_data).toEqual({ outcome: "enrolled", ...PRODUCT.meta });
    const reddit = eventSentTo(REDDIT_URL);
    expect(reddit.type).toEqual({ tracking_type: "SIGN_UP" });
    expect(asObject(reddit.metadata)).toMatchObject({
      products: PRODUCT.reddit.products,
      value: 49,
      currency: "EUR",
    });
  });

  it("tells each platform about a lead, with or without a product", async () => {
    await reportAdConversion(
      request(),
      { event: "account_created", product: PRODUCT, sourcePath: "/register" },
      PARENT,
    );
    expect(eventSentTo(META_URL).event_name).toBe("Lead");
    expect(asObject(eventSentTo(META_URL).custom_data).content_ids).toEqual([
      "abc-123",
    ]);
    expect(eventSentTo(REDDIT_URL).type).toEqual({ tracking_type: "LEAD" });
    expect(asObject(eventSentTo(REDDIT_URL).metadata).products).toEqual(
      PRODUCT.reddit.products,
    );

    fetchMock.mockClear();
    await reportAdConversion(
      request(),
      { event: "account_created", sourcePath: "/register" },
      PARENT,
    );
    expect(eventSentTo(META_URL)).not.toHaveProperty("custom_data");
    expect(asObject(eventSentTo(REDDIT_URL).metadata)).not.toHaveProperty(
      "products",
    );
  });

  // One platform's failure is that platform's lost report, and nothing more.
  it.each([
    ["Reddit", REDDIT_URL, META_URL],
    ["Meta", META_URL, REDDIT_URL],
  ])("still reports to the other platform when %s fails", async (
    _label,
    failing,
    healthy,
  ) => {
    fetchMock.mockImplementation((url) =>
      url === failing
        ? Promise.reject(new Error("network down"))
        : Promise.resolve(new Response("{}", { status: 200 })),
    );

    await expect(
      reportAdConversion(
        request(),
        { event: "account_created", sourcePath: "/register" },
        PARENT,
      ),
    ).resolves.toBeUndefined();

    expect(eventSentTo(healthy)).toBeDefined();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  // Each platform's switch is its own: Reddit unset is Meta unaffected.
  it("reports to Meta alone when Reddit is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", undefined);

    await reportAdConversion(
      request(),
      { event: "account_created", sourcePath: "/register" },
      PARENT,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(META_URL);
  });
});
