import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  CONSENT_COOKIE_NAME,
  serialiseConsent,
  type ConsentState,
} from "@/lib/consent";
import type { RedditProductDetails } from "@/lib/marketing-events";
import { reportRedditConversion } from "@/lib/reddit-conversions.server";
import { asObject } from "../../helpers/json";

/**
 * ============================================================================
 * Reddit's Conversions API: what leaves our servers, and what stops it leaving.
 * ============================================================================
 *
 * The Reddit twin of the Meta suite, pinning the same two things hard.
 *
 * **Nothing is sent unless all three hold** — a configured pixel, a configured
 * token, and a request whose own consent cookie says marketing is allowed.
 *
 * **The body is the privacy policy, in JSON.** The user agent, the IP,
 * Reddit's own two cookies, and the parent's email (in Reddit's canonical
 * form) and account id as SHA-256 hashes — never the address or the id itself.
 * No name and nothing about a child. A field appearing here that this file
 * does not assert on is a field nobody promised.
 */

const PIXEL_ID = "a2_abc123def456";
const ACCESS_TOKEN = "reddit-access-token";

/** Which product a conversion was for, as the routes build it. */
const PRODUCT: RedditProductDetails = {
  products: [
    { id: "abc-123", name: "Roblox Studio Club", category: "roblox_studio" },
  ],
  itemCount: 1,
  value: 49,
  currency: "EUR",
};

/** The product without a price, as an unpriced report names it. */
const UNPRICED_PRODUCT = { item_count: 1, products: PRODUCT.products };

/** The parent's own account id. */
const PARENT_ID = "6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f";

/** The parent the request acts as. */
const PARENT = { id: PARENT_ID, email: "parent.example@sogverse.test" };

/**
 * SHA-256 of `parentexample@sogverse.test` — Reddit's canonical form drops
 * the dot in the local part, which is where it parts from Meta's.
 */
const PARENT_EMAIL_SHA256 =
  "c9d1e7cf37af94e2d154858240f60ab4a5f3f7c768d39b27260c9b574a092500";

/** SHA-256 of `PARENT_ID`, as lowercase hex — the same value Meta is sent. */
const PARENT_ID_SHA256 =
  "39bdf0f78b90b6e231792f2f62f58e1b3c8d8396a4e56ed69893d26a65f873d3";

const GRANTED: ConsentState = {
  analytics: true,
  marketing: true,
  decidedAt: "2026-09-03T10:15:00.000Z",
};

function cookieHeaderFor(consent: ConsentState, extra = ""): string {
  const value = encodeURIComponent(serialiseConsent(consent));
  return `${CONSENT_COOKIE_NAME}=${value}${extra}`;
}

/** A request as a route handler would hand it over. */
function request({
  cookie = cookieHeaderFor(GRANTED),
  headers = {},
}: {
  cookie?: string | null;
  headers?: Record<string, string>;
} = {}): Request {
  return new Request("https://test.sogverse.local/api/auth/register", {
    method: "POST",
    headers: {
      host: "test.sogverse.local",
      "user-agent": "Mozilla/5.0 (test)",
      ...(cookie === null ? {} : { cookie }),
      ...headers,
    },
  });
}

type FetchCall = (input: string, init: RequestInit) => Promise<Response>;

let fetchMock: Mock<FetchCall>;

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0];
  return asObject(JSON.parse(String(init.body)));
}

function sentEvent(): Record<string, unknown> {
  const events = asObject(sentBody().data).events;
  if (!Array.isArray(events)) throw new Error("the body carried no event array");
  return asObject(events[0]);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", PIXEL_ID);
  vi.stubEnv("REDDIT_CONVERSIONS_API_ACCESS_TOKEN", ACCESS_TOKEN);
  vi.stubEnv("REDDIT_CONVERSIONS_API_TEST_ID", undefined);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://test.sogverse.local");
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

const LEAD = { event: "account_created", sourcePath: "/register" } as const;

describe("reportRedditConversion — the three gates", () => {
  it("sends nothing without a pixel id", async () => {
    vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", undefined);

    await reportRedditConversion(request(), LEAD, PARENT);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The placeholder `.env.local.example` ships must read as "off".
  it("sends nothing for an id that is not Reddit's shape", async () => {
    vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", "your-reddit-pixel-id");

    await reportRedditConversion(request(), LEAD, PARENT);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing without an access token", async () => {
    vi.stubEnv("REDDIT_CONVERSIONS_API_ACCESS_TOKEN", undefined);

    await reportRedditConversion(request(), LEAD, PARENT);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no cookie at all", null],
    ["a cookie jar without our answer", "locale=fi; timezone=Europe%2FHelsinki"],
    [
      "an answer that refused marketing",
      cookieHeaderFor({ ...GRANTED, marketing: false }),
    ],
  ])("sends nothing for %s", async (_label, cookie) => {
    await reportRedditConversion(request({ cookie }), LEAD, PARENT);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reportRedditConversion — the request", () => {
  it("posts a LEAD to the pixel's conversion events endpoint", async () => {
    const before = Date.now();
    await reportRedditConversion(
      request({
        headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
        cookie: `${cookieHeaderFor(GRANTED)}; _rdt_uuid=1700000000000.abcd-ef; _rdt_cid=click-123; _fbp=fb.1.123.456`,
      }),
      LEAD,
      PARENT,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://ads-api.reddit.com/api/v3/pixels/${PIXEL_ID}/conversion_events`,
    );
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${ACCESS_TOKEN}`,
    );
    // The token goes in the header and nowhere else.
    expect(String(init.body)).not.toContain(ACCESS_TOKEN);
    expect(asObject(sentBody().data)).not.toHaveProperty("test_id");

    const event = sentEvent();
    expect(event.type).toEqual({ tracking_type: "LEAD" });
    expect(event.action_source).toBe("WEBSITE");
    expect(event.event_source_url).toBe("https://test.sogverse.local/register");
    // Milliseconds, not Meta's seconds.
    expect(event.event_at).toBeGreaterThanOrEqual(before);
    expect(event.event_at).toBeLessThanOrEqual(Date.now());
    expect(event.click_id).toBe("click-123");
    // A lead from no product page names nothing but its own id.
    const metadata = asObject(event.metadata);
    expect(typeof metadata.conversion_id).toBe("string");
    expect(Object.keys(metadata)).toEqual(["conversion_id"]);

    // The whole of what identifies a person, and nothing else — Meta's cookie
    // on the same request is not Reddit's to read.
    expect(event.user).toEqual({
      user_agent: "Mozilla/5.0 (test)",
      ip_address: "203.0.113.7",
      uuid: "1700000000000.abcd-ef",
      email: PARENT_EMAIL_SHA256,
      external_id: PARENT_ID_SHA256,
    });
  });

  it("gives every report its own conversion id", async () => {
    await reportRedditConversion(request(), LEAD, PARENT);
    await reportRedditConversion(request(), LEAD, PARENT);

    const ids = fetchMock.mock.calls.map(([, init]) => {
      const body = asObject(JSON.parse(String(init.body)));
      const events = asObject(body.data).events;
      if (!Array.isArray(events)) throw new Error("no event array");
      return asObject(asObject(events[0]).metadata).conversion_id;
    });
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("falls back to x-real-ip, and omits what the request does not carry", async () => {
    await reportRedditConversion(
      request({ headers: { "x-real-ip": "198.51.100.9" } }),
      LEAD,
      PARENT,
    );
    expect(asObject(sentEvent().user).ip_address).toBe("198.51.100.9");

    fetchMock.mockClear();
    await reportRedditConversion(request(), LEAD, PARENT);
    const event = sentEvent();
    expect(event).not.toHaveProperty("click_id");
    expect(event.user).toEqual({
      user_agent: "Mozilla/5.0 (test)",
      email: PARENT_EMAIL_SHA256,
      external_id: PARENT_ID_SHA256,
    });
  });

  // Reddit's own worked example: both spellings are one address once the
  // local part's dots and its `+` tag are gone.
  it.each(["alice@example.com", "  Al.ice+Apple@Example.Com \n"])(
    "hashes %j in Reddit's canonical form",
    async (email) => {
      await reportRedditConversion(request(), LEAD, { id: null, email });

      expect(asObject(sentEvent().user).email).toBe(
        "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976",
      );
    },
  );

  // The canonical form touches only the local part: a dotted domain keeps
  // its dots.
  it("keeps the domain's dots", async () => {
    await reportRedditConversion(
      request(),
      LEAD,
      { id: null, email: "a.b@mail.example.co.uk" },
    );

    expect(asObject(sentEvent().user).email).toBe(
      // SHA-256 of `ab@mail.example.co.uk`, worked out outside the code.
      "62f6ca758c638a9be5c7e2648123c53defea7a28a0658163a2d5e4aedc0ed5e7",
    );
  });

  it("never puts the plain email or account id anywhere in the request", async () => {
    await reportRedditConversion(
      request(),
      {
        event: "enrolment",
        outcome: "enrolled",
        product: PRODUCT,
        sourcePath: "/shop/abc-123",
      },
      PARENT,
    );

    const [url, init] = fetchMock.mock.calls[0];
    const sent = `${url} ${String(init.body)}`.toLowerCase();
    expect(sent).not.toContain("parent.example");
    expect(sent).not.toContain("parentexample");
    expect(sent).not.toContain("@sogverse.test");
    expect(sent).not.toContain(PARENT_ID);
    expect(sent).not.toContain("1a2b3c4d5e6f");
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([
    ["no account id or email", { id: null, email: null }],
    ["a blank account id and email", { id: "   ", email: "  " }],
  ])("sends the report without the hashes for %s", async (_label, account) => {
    await reportRedditConversion(request(), LEAD, account);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentEvent().user).toEqual({ user_agent: "Mozilla/5.0 (test)" });
  });

  // A seat taken carries the product, price included.
  it("reports an enrolled seat as SIGN_UP with the product and its value", async () => {
    await reportRedditConversion(
      request(),
      {
        event: "enrolment",
        outcome: "enrolled",
        product: PRODUCT,
        sourcePath: "/shop/abc-123",
      },
      PARENT,
    );

    const event = sentEvent();
    expect(event.type).toEqual({ tracking_type: "SIGN_UP" });
    expect(event.event_source_url).toBe(
      "https://test.sogverse.local/shop/abc-123",
    );
    const { conversion_id: _id, ...metadata } = asObject(event.metadata);
    expect(metadata).toEqual({
      ...UNPRICED_PRODUCT,
      value: 49,
      currency: "EUR",
    });
  });

  // A free seat is still worth zero, stated, rather than no value at all.
  it("states a free seat's zero value", async () => {
    await reportRedditConversion(
      request(),
      {
        event: "enrolment",
        outcome: "enrolled",
        product: { ...PRODUCT, value: 0 },
        sourcePath: "/shop/abc-123",
      },
      PARENT,
    );

    expect(asObject(sentEvent().metadata).value).toBe(0);
  });

  // A queue place is not revenue: the report drops the price whatever the
  // caller passed, and keeps the product.
  it("names the product without a value on a waitlisted enrolment", async () => {
    await reportRedditConversion(
      request(),
      {
        event: "enrolment",
        outcome: "waitlisted",
        product: PRODUCT,
        sourcePath: "/shop/abc-123",
      },
      PARENT,
    );

    const event = sentEvent();
    expect(event.type).toEqual({ tracking_type: "SIGN_UP" });
    const { conversion_id: _id, ...metadata } = asObject(event.metadata);
    expect(metadata).toEqual(UNPRICED_PRODUCT);
  });

  // Nor is a new account: a lead from a product page names it, unpriced, and
  // its source stays the register page.
  it("names the product without a value on a lead from a product page", async () => {
    await reportRedditConversion(
      request(),
      { event: "account_created", product: PRODUCT, sourcePath: "/register" },
      PARENT,
    );

    const event = sentEvent();
    expect(event.type).toEqual({ tracking_type: "LEAD" });
    const { conversion_id: _id, ...metadata } = asObject(event.metadata);
    expect(metadata).toEqual(UNPRICED_PRODUCT);
    expect(event.event_source_url).toBe("https://test.sogverse.local/register");
  });

  it("carries the test id only when one is configured", async () => {
    vi.stubEnv("REDDIT_CONVERSIONS_API_TEST_ID", "t2_testing");

    await reportRedditConversion(request(), LEAD, PARENT);

    expect(asObject(sentBody().data).test_id).toBe("t2_testing");
  });
});

describe("reportRedditConversion — failure", () => {
  it("resolves and logs when Reddit refuses the event", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
        status: 401,
      }),
    );

    await expect(
      reportRedditConversion(request(), LEAD, PARENT),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[reddit-conversions]"),
      401,
      expect.stringContaining("Unauthorized"),
    );
  });

  it("resolves and logs when the call throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      reportRedditConversion(request(), LEAD, PARENT),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[reddit-conversions]"),
      expect.any(Error),
    );
  });
});
