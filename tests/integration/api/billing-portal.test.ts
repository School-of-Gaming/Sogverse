import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { getString } from "../../helpers/json";

process.env.STRIPE_SECRET_KEY = "sk_test_billing_portal";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// The billing-portal route hands a parent a Stripe-hosted session URL. Three
// things make it worth pinning: an unnamed target must resolve from the
// verified session (a portal session for someone else's Stripe customer is a
// full billing-data leak), a *named* target must be proved to be the caller's
// before it is honoured, and the return URL must be built off the trusted
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

const mockResolveParticipationStripeCustomerId = vi.fn();
const mockOwnsStripeCustomer = vi.fn();
vi.mock("@/services/billing/billing.server", () => ({
  resolveParticipationStripeCustomerId: (...args: unknown[]) =>
    mockResolveParticipationStripeCustomerId(...args),
  ownsStripeCustomer: (...args: unknown[]) => mockOwnsStripeCustomer(...args),
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
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

function portalRequest(
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost:3000/api/parent/billing-portal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockAuthenticatedCustomer(id = CUSTOMER_ID) {
  mockRequireRole.mockResolvedValue({
    user: { id },
    profile: { id, role: "customer" },
    supabase: { marker: "rls" },
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

  // -- Happy path: no target named --

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

  it("lands on the portal's front page when no participation is named", async () => {
    mockAuthenticatedCustomer();

    await POST(portalRequest());

    expect(mockPortalCreate.mock.calls[0][0]).not.toHaveProperty("flow_data");
  });

  it("builds the return URL off the trusted origin, ignoring a spoofed Host", async () => {
    mockAuthenticatedCustomer();

    await POST(portalRequest({}, { host: "evil.example" }));

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

  // -- Routing by participation (the payment-problem badge) --
  //
  // A parent migrated from the old platform can own several Stripe customers,
  // and a portal session covers exactly one. The badge names its participation
  // so the parent lands on the customer that owns the *failing* subscription
  // rather than whichever one happens to be bound to their profile.

  it("opens the customer that owns the named participation's subscription", async () => {
    mockAuthenticatedCustomer();
    mockResolveParticipationStripeCustomerId.mockResolvedValue("cus_migrated");

    const response = await POST(
      portalRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(response.status).toBe(200);
    expect(mockResolveParticipationStripeCustomerId).toHaveBeenCalledWith(
      expect.anything(),
      CUSTOMER_ID,
      PARTICIPATION_ID,
    );
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_migrated" }),
    );
    // Never the profile-bound fallback — that is the confusion being fixed.
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
  });

  it("lands a named participation straight on the card-update flow", async () => {
    mockAuthenticatedCustomer();
    mockResolveParticipationStripeCustomerId.mockResolvedValue("cus_migrated");

    await POST(portalRequest({ participationId: PARTICIPATION_ID }));

    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: { type: "payment_method_update" },
      }),
    );
  });

  it("refuses a participation that is not the caller's", async () => {
    mockAuthenticatedCustomer();
    // The RLS-scoped lookup finds nothing for this caller — another family's
    // participation and one with no subscription are indistinguishable here,
    // and both must be refused rather than falling back to the caller's own
    // customer.
    mockResolveParticipationStripeCustomerId.mockResolvedValue(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      portalRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(response.status).toBe(404);
    expect(mockPortalCreate).not.toHaveBeenCalled();
    expect(mockGetOrCreateStripeCustomer).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // -- Routing by Stripe customer (the multi-account billing card) --

  it("opens a named Stripe customer once ownership is proved", async () => {
    mockAuthenticatedCustomer();
    mockOwnsStripeCustomer.mockResolvedValue(true);

    const response = await POST(portalRequest({ stripeCustomerId: "cus_mine" }));

    expect(response.status).toBe(200);
    expect(mockOwnsStripeCustomer).toHaveBeenCalledWith(
      expect.anything(),
      CUSTOMER_ID,
      "cus_mine",
    );
    expect(mockPortalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_mine" }),
    );
  });

  it("refuses a Stripe customer that is not the caller's", async () => {
    mockAuthenticatedCustomer();
    mockOwnsStripeCustomer.mockResolvedValue(false);
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      portalRequest({ stripeCustomerId: "cus_someone_else" }),
    );

    expect(response.status).toBe(404);
    expect(mockPortalCreate).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // -- Failure --

  it("answers 400 for a malformed participation id", async () => {
    mockAuthenticatedCustomer();

    const response = await POST(portalRequest({ participationId: "nope" }));

    expect(response.status).toBe(400);
    expect(mockResolveParticipationStripeCustomerId).not.toHaveBeenCalled();
  });

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
