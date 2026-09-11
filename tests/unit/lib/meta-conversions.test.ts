import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  CONSENT_COOKIE_NAME,
  serialiseConsent,
  type ConsentState,
} from "@/lib/consent";
import { reportMetaConversion } from "@/lib/meta-conversions.server";
import { asObject } from "../../helpers/json";

/**
 * ============================================================================
 * The Conversions API: what leaves our servers, and what stops it leaving.
 * ============================================================================
 *
 * This is the only place in the app that reports a person's action to an
 * advertiser from the server, so two things are pinned hard and everything else
 * follows from them.
 *
 * **Nothing is sent unless all three hold** — a configured pixel, a configured
 * token, and a request whose own consent cookie says marketing is allowed.
 * Deciding consent here, from the cookie the browser actually sent, is what
 * makes an un-consented report impossible rather than merely unlikely; a
 * client-side gate could slip, and this one cannot.
 *
 * **The body is the privacy policy, in JSON.** The user agent, the IP, and
 * Meta's own two cookies. No email, no name, no id of a person and nothing about
 * a child. A field appearing here that this file does not assert on is a field
 * nobody promised.
 */

const PIXEL_ID = "1234567890";
const ACCESS_TOKEN = "meta-access-token";

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

/**
 * The global under test, typed the way the module calls it — which is what
 * keeps every reader below assertion-free: `mock.calls[0]` is a real tuple
 * rather than a bag of `any` somebody has to promise the shape of.
 */
type FetchCall = (input: string, init: RequestInit) => Promise<Response>;

let fetchMock: Mock<FetchCall>;

/** The one request made, parsed. */
function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0];
  return asObject(JSON.parse(String(init.body)));
}

function sentEvent(): Record<string, unknown> {
  const data = sentBody().data;
  if (!Array.isArray(data)) throw new Error("the body carried no event array");
  return asObject(data[0]);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", PIXEL_ID);
  vi.stubEnv("META_CONVERSIONS_API_ACCESS_TOKEN", ACCESS_TOKEN);
  vi.stubEnv("META_CONVERSIONS_API_TEST_EVENT_CODE", undefined);
  // The trusted origin every `event_source_url` is built off: these requests
  // carry no Vercel host, so the configured site URL is what getOrigin answers.
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

describe("reportMetaConversion — the three gates", () => {
  it("sends nothing without a pixel id", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", undefined);

    await reportMetaConversion(request(), {
      event: "account_created",
      sourcePath: "/register",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The placeholder `.env.local.example` ships. It must read as "off" rather
  // than as a pixel that 400s on every event.
  it("sends nothing for an id that is not digits", async () => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "your-meta-pixel-id");

    await reportMetaConversion(request(), {
      event: "account_created",
      sourcePath: "/register",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing without an access token", async () => {
    vi.stubEnv("META_CONVERSIONS_API_ACCESS_TOKEN", undefined);

    await reportMetaConversion(request(), {
      event: "account_created",
      sourcePath: "/register",
    });

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
    await reportMetaConversion(request({ cookie }), {
      event: "account_created",
      sourcePath: "/register",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reportMetaConversion — the request", () => {
  it("posts a Lead to the pixel's events endpoint", async () => {
    await reportMetaConversion(
      request({
        headers: {
          "x-forwarded-for": "203.0.113.7, 70.41.3.18",
          "user-agent": "Mozilla/5.0 (test)",
        },
        cookie: `${cookieHeaderFor(GRANTED)}; _fbp=fb.1.123.456; _fbc=fb.1.123.IwAR`,
      }),
      { event: "account_created", sourcePath: "/register" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://graph.facebook.com/v25.0/${PIXEL_ID}/events`,
    );
    expect(init.method).toBe("POST");

    const body = sentBody();
    expect(body.access_token).toBe(ACCESS_TOKEN);
    expect(body).not.toHaveProperty("test_event_code");

    const event = sentEvent();
    expect(event.event_name).toBe("Lead");
    expect(event.action_source).toBe("website");
    // Built from the trusted origin and the path the caller stated — never from
    // the request's own URL, which is an API route.
    expect(event.event_source_url).toBe(
      "https://test.sogverse.local/register",
    );
    expect(typeof event.event_id).toBe("string");
    // Seconds, not milliseconds: Meta rejects a timestamp more than seven days
    // out, and a millisecond value is fifty years out.
    expect(event.event_time).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(event.event_time).toBeGreaterThan(Math.floor(Date.now() / 1000) - 60);
    // An account creation carries no outcome — it is not an enrolment.
    expect(event).not.toHaveProperty("custom_data");

    // The whole of what identifies a person, and nothing else: the first
    // forwarded address (the client's, not a proxy's), the user agent, and
    // Meta's own two cookies read off this request.
    expect(event.user_data).toEqual({
      client_user_agent: "Mozilla/5.0 (test)",
      client_ip_address: "203.0.113.7",
      fbp: "fb.1.123.456",
      fbc: "fb.1.123.IwAR",
    });
  });

  it("falls back to x-real-ip, and omits the address when there is none", async () => {
    await reportMetaConversion(
      request({ headers: { "x-real-ip": "198.51.100.9" } }),
      { event: "account_created", sourcePath: "/register" },
    );
    expect(asObject(sentEvent().user_data).client_ip_address).toBe(
      "198.51.100.9",
    );

    fetchMock.mockClear();
    await reportMetaConversion(request(), {
      event: "account_created",
      sourcePath: "/register",
    });
    expect(sentEvent().user_data).toEqual({
      client_user_agent: "Mozilla/5.0 (test)",
    });
  });

  // The names are the campaign's optimisation target, so each outcome's is
  // stated here rather than trusted to the caller.
  it.each([
    ["enrolled", "CompleteRegistration"],
    ["waitlisted", "CompleteRegistration"],
    ["sent_to_checkout", "InitiateCheckout"],
  ] as const)("reports %s as %s, with the outcome beside it", async (
    outcome,
    eventName,
  ) => {
    await reportMetaConversion(request(), {
      event: "enrolment",
      outcome,
      sourcePath: "/shop/abc-123",
    });

    const event = sentEvent();
    expect(event.event_name).toBe(eventName);
    expect(event.custom_data).toEqual({ outcome });
    expect(event.event_source_url).toBe(
      "https://test.sogverse.local/shop/abc-123",
    );
  });

  it("carries the test event code only when one is configured", async () => {
    vi.stubEnv("META_CONVERSIONS_API_TEST_EVENT_CODE", "TEST12345");

    await reportMetaConversion(request(), {
      event: "enrolment",
      outcome: "enrolled",
      sourcePath: "/shop/abc-123",
    });

    expect(sentBody().test_event_code).toBe("TEST12345");
  });
});

describe("reportMetaConversion — failure", () => {
  it("resolves and logs when Meta refuses the event", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Invalid token" } }), {
        status: 400,
      }),
    );

    await expect(
      reportMetaConversion(request(), {
        event: "account_created",
        sourcePath: "/register",
      }),
    ).resolves.toBeUndefined();

    // Meta's own body, because the status alone says nothing: an expired token,
    // the wrong pixel and a malformed field all arrive as the same 400.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[meta-conversions]"),
      400,
      expect.stringContaining("Invalid token"),
    );
  });

  it("resolves and logs when the call throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(
      reportMetaConversion(request(), {
        event: "account_created",
        sourcePath: "/register",
      }),
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[meta-conversions]"),
      expect.any(Error),
    );
  });
});
