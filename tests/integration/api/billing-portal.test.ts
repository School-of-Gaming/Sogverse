import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { getString } from "../../helpers/json";

process.env.STRIPE_SECRET_KEY = "sk_test_billing_portal";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// The billing-portal route hands a parent a Stripe-hosted session URL. Two
// things make it worth pinning: the customer id it uses must come from the
// verified session (a portal session for someone else's Stripe customer is a
// full billing-data leak), and the return URL must be built off the trusted
// origin rather than the caller's Host header.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ marker: "admin" }),
}));

const mockGetOrCreateStripeCustomer = vi.fn();
vi.mock("@/lib/stripe/customer", () => ({
  getOrCreateStripeCustomer: (...args: unknown[]) =>
    mockGetOrCreateStripeCustomer(...args),
}));

vi.mock("@/lib/stripe/portal-configuration", () => ({
  getPortalConfigurationId: vi.fn(async () => "bpc_test"),
}));

const mockGetLocale = vi.fn();
vi.mock("next-intl/server", () => ({
  getLocale: () => mockGetLocale(),
}));

const mockPortalCreate = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    billingPortal = {
      sessions: { create: (...args: unknown[]) => mockPortalCreate(...args) },
    };
  },
}));

import { POST } from "@/app/api/parent/billing-portal/route";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";

function portalRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/parent/billing-portal", {
    method: "POST",
    headers,
  });
}

function mockAuthenticatedCustomer(id = CUSTOMER_ID) {
  mockRequireRole.mockResolvedValue({
    user: { id },
    profile: { id, role: "customer" },
  });
}

describe("POST /api/parent/billing-portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocale.mockResolvedValue("en");
    mockGetOrCreateStripeCustomer.mockResolvedValue("cus_test123");
    mockPortalCreate.mockResolvedValue({
      url: "https://billing.stripe.com/session/test",
    });
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(portalRequest());

    expect(response.status).toBe(401);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-customer role", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(portalRequest());

    expect(response.status).toBe(403);
    expect(mockPortalCreate).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("returns the Stripe-hosted portal URL", async () => {
    mockAuthenticatedCustomer();

    const response = await POST(portalRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: "https://billing.stripe.com/session/test",
    });
  });

  it("opens the portal for the SESSION's Stripe customer, never a requested one", async () => {
    mockAuthenticatedCustomer("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    await POST(portalRequest());

    expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(
      expect.anything(),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_test123" }),
    );
  });

  it("builds the return URL off the trusted origin, ignoring a spoofed Host", async () => {
    mockAuthenticatedCustomer();

    await POST(portalRequest({ host: "evil.example" }));

    const returnUrl = getString(mockPortalCreate.mock.calls[0][0], "return_url");
    expect(returnUrl).toBe("https://test.sogverse.local/parent#billing");
  });

  it("falls back to Stripe's own locale detection for a locale Stripe cannot render", async () => {
    // Klingon is an app locale but not a Stripe one; 'auto' is the documented
    // escape hatch rather than silently sending the wrong language.
    mockAuthenticatedCustomer();
    mockGetLocale.mockResolvedValue("tlh");

    await POST(portalRequest());

    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "auto" }),
    );
  });

  // -- Failure --

  it("answers 502 when Stripe refuses to create the session", async () => {
    mockAuthenticatedCustomer();
    mockPortalCreate.mockRejectedValue(new Error("stripe is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(portalRequest());

    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("Failed to open billing portal");
    spy.mockRestore();
  });
});
