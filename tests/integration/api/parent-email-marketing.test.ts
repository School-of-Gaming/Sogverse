import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * A parent's School of Gaming email marketing, read from and written to
 * Klaviyo live from Settings. Pinned: the parent-only gate, that the profile
 * and address are the session's and never the body's, how Klaviyo's standing
 * becomes the box (subscribed and not suppressed, by external id first and
 * then by address), and that a subscribe joins the configured list under the
 * settings source while an unsubscribe is global.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFind = vi.fn();
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
vi.mock("@/lib/klaviyo", () => ({
  findKlaviyoEmailMarketing: (...args: unknown[]) => mockFind(...args),
  subscribeKlaviyoProfile: (...args: unknown[]) => mockSubscribe(...args),
  unsubscribeKlaviyoProfile: (...args: unknown[]) => mockUnsubscribe(...args),
}));

import { GET, PUT } from "@/app/api/parent/email-marketing/route";

const PARENT_ID = "6b3f0f8e-2a4d-4c1e-9b7a-5d2e8f13c0a1";
const PARENT_EMAIL = "parent@example.com";
const URL = "http://localhost:3000/api/parent/email-marketing";

function standing(overrides: Record<string, unknown> = {}) {
  return {
    profileId: "01KLAVIYO",
    email: PARENT_EMAIL,
    consent: "SUBSCRIBED",
    suppressed: false,
    source: null,
    ...overrides,
  };
}

function signedInAsParent() {
  mockRequireRole.mockResolvedValue({
    user: { id: PARENT_ID },
    profile: { id: PARENT_ID, role: "customer", email: PARENT_EMAIL },
    supabase: {},
  });
}

function put(body: unknown): Request {
  return new Request(URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KLAVIYO_PRIVATE_API_KEY", "pk_test_settings");
  vi.stubEnv("KLAVIYO_MARKETING_CONSENT_LIST_ID", "Y6nRLr");
  mockSubscribe.mockResolvedValue(undefined);
  mockUnsubscribe.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/parent/email-marketing", () => {
  it("returns the gate's refusal and asks Klaviyo nothing", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const response = await GET(new Request(URL));

    expect(response.status).toBe(403);
    expect(mockRequireRole).toHaveBeenCalledWith(["customer"], expect.anything());
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("is subscribed when Klaviyo's profile under the parent's id is subscribed", async () => {
    signedInAsParent();
    mockFind.mockResolvedValueOnce(standing());

    const response = await GET(new Request(URL));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subscribed: true });
    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalledWith({ externalId: PARENT_ID });
  });

  it("falls back to the address when no profile carries the parent's id", async () => {
    signedInAsParent();
    mockFind.mockResolvedValueOnce(null).mockResolvedValueOnce(standing());

    const response = await GET(new Request(URL));

    expect(await response.json()).toEqual({ subscribed: true });
    expect(mockFind).toHaveBeenNthCalledWith(2, { email: PARENT_EMAIL });
  });

  it.each([
    ["no profile at all", null],
    ["never subscribed", standing({ consent: "NEVER_SUBSCRIBED" })],
    ["unsubscribed", standing({ consent: "UNSUBSCRIBED", suppressed: true })],
    ["subscribed but suppressed", standing({ suppressed: true })],
  ])("is not subscribed with %s", async (_label, found) => {
    signedInAsParent();
    mockFind.mockResolvedValue(found);

    const response = await GET(new Request(URL));

    expect(await response.json()).toEqual({ subscribed: false });
  });

  it("answers a failed Klaviyo read with an error, never a guess", async () => {
    signedInAsParent();
    mockFind.mockRejectedValue(new Error("Klaviyo answered 503"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(new Request(URL));

    expect(response.status).toBe(500);
  });
});

describe("PUT /api/parent/email-marketing", () => {
  it("returns the gate's refusal and writes nothing", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const response = await PUT(put({ subscribed: true }));

    expect(response.status).toBe(403);
    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockUnsubscribe).not.toHaveBeenCalled();
  });

  it("subscribes the session's address to the list under the settings source", async () => {
    signedInAsParent();

    const response = await PUT(put({ subscribed: true, email: "someone-else@example.com" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ subscribed: true });
    expect(mockSubscribe).toHaveBeenCalledWith({
      email: PARENT_EMAIL,
      listId: "Y6nRLr",
      customSource: "Sogverse account settings",
    });
  });

  it("unsubscribes the session's address", async () => {
    signedInAsParent();

    const response = await PUT(put({ subscribed: false }));

    expect(await response.json()).toEqual({ subscribed: false });
    expect(mockUnsubscribe).toHaveBeenCalledWith(PARENT_EMAIL);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("refuses a body that is not a standing", async () => {
    signedInAsParent();

    const response = await PUT(put({ subscribed: "yes" }));

    expect(response.status).toBe(400);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("refuses to subscribe when the list is not configured", async () => {
    signedInAsParent();
    vi.stubEnv("KLAVIYO_MARKETING_CONSENT_LIST_ID", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await PUT(put({ subscribed: true }));

    expect(response.status).toBe(500);
    expect(mockSubscribe).not.toHaveBeenCalled();
  });

  it("never logs the address when Klaviyo refuses", async () => {
    signedInAsParent();
    mockSubscribe.mockRejectedValue(new Error("Klaviyo answered 400: invalid"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await PUT(put({ subscribed: true }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(PARENT_EMAIL);
  });
});
