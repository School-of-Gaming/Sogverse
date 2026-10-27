import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findKlaviyoEmailMarketing, unsubscribeKlaviyoProfile } from "@/lib/klaviyo";

/**
 * The two Klaviyo calls the consent handover's withdrawal rests on: reading the
 * source of the consent an address stands on, which Klaviyo keeps as the
 * profile's `custom_method_detail`, and the global unsubscribe.
 */

const mockFetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function answer(status: number, body: unknown) {
  return new Response(body === null ? "" : JSON.stringify(body), { status });
}

describe("Klaviyo email marketing", () => {
  beforeEach(() => {
    vi.stubEnv("KLAVIYO_PRIVATE_API_KEY", "pk_test");
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the standing consent's custom source from custom_method_detail", async () => {
    mockFetch.mockResolvedValue(
      answer(200, {
        data: [
          {
            id: "kl-1",
            attributes: {
              email: "anna@example.com",
              subscriptions: {
                email: {
                  marketing: {
                    can_receive_email_marketing: true,
                    consent: "SUBSCRIBED",
                    custom_method_detail: "Sogverse account (consent given before the Klaviyo sync)",
                    suppression: [],
                  },
                },
              },
            },
          },
        ],
      }),
    );

    expect(await findKlaviyoEmailMarketing({ email: "anna@example.com" })).toEqual({
      profileId: "kl-1",
      email: "anna@example.com",
      consent: "SUBSCRIBED",
      suppressed: false,
      source: "Sogverse account (consent given before the Klaviyo sync)",
    });
  });

  it("reads no source when the consent carries none", async () => {
    mockFetch.mockResolvedValue(
      answer(200, {
        data: [
          {
            id: "kl-2",
            attributes: {
              email: null,
              subscriptions: { email: { marketing: { consent: "NEVER_SUBSCRIBED", custom_method_detail: "" } } },
            },
          },
        ],
      }),
    );
    expect((await findKlaviyoEmailMarketing({ externalId: "x" }))?.source).toBeNull();
  });

  it("unsubscribes the address globally: no list named", async () => {
    mockFetch.mockResolvedValue(answer(202, null));

    await unsubscribeKlaviyoProfile("anna@example.com");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://a.klaviyo.com/api/profile-subscription-bulk-delete-jobs");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      data: {
        type: "profile-subscription-bulk-delete-job",
        attributes: {
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email: "anna@example.com",
                  subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED" } } },
                },
              },
            ],
          },
        },
      },
    });
  });
});
