import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  ownsStripeCustomer,
  resolveBillingAccountsViaRls,
  resolveParticipationStripeCustomerId,
} from "@/services/billing/billing.server";
import {
  createFetchStubbedClient,
  postgrestError,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

// These run the REAL Supabase client over a fake fetch transport (see
// tests/mocks/postgrest-fetch.ts), so the genuine query builder constructs
// each PostgREST request and the assertions can read the filters that carry
// the access scoping.

const USER_ID = "11111111-1111-1111-1111-111111111111";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

const PROFILES_PATH = "/rest/v1/customer_profiles";
const SUBSCRIPTIONS_PATH = "/rest/v1/family_subscriptions";

/** Canned getClaims() success for the spied auth client. */
function claimsFor(sub: string) {
  return {
    data: {
      claims: {
        iss: "http://localhost:54321/auth/v1",
        sub,
        aud: "authenticated",
        exp: 4102444800,
        iat: 1735689600,
        role: "authenticated",
        aal: "aal1" as const,
        session_id: "session-1",
      },
      header: { alg: "ES256" as const, kid: "test-key", typ: "JWT" },
      signature: new Uint8Array(),
    },
    error: null,
  };
}

function subscriptionRow(
  stripeCustomerId: string,
  gamerFirstName: string,
  productName: string,
) {
  return {
    stripe_customer_id: stripeCustomerId,
    participation: {
      gamer: { first_name: gamerFirstName },
      product: {
        product_translations: [
          { locale: "en", name: productName },
        ],
      },
    },
  };
}

describe("resolveBillingAccountsViaRls", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;

  /** Routes the two concurrent reads: the customer profile and the subs. */
  function mockBackend(
    profile: unknown,
    subscriptions: { rows: unknown[] } | { errorMessage: string },
  ) {
    fetchMock.mockImplementation((input) => {
      const url = requestedUrl(input);
      if (url.pathname === PROFILES_PATH) {
        return Promise.resolve(postgrestJson(profile));
      }
      if (url.pathname === SUBSCRIPTIONS_PATH) {
        return Promise.resolve(
          "rows" in subscriptions
            ? postgrestJson(subscriptions.rows)
            : postgrestError(subscriptions.errorMessage),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url.pathname}`));
    });
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    supabase = createFetchStubbedClient(fetchMock);
    vi.spyOn(supabase.auth, "getClaims").mockResolvedValue(claimsFor(USER_ID));
  });

  it("returns the single profile-bound customer for the standard parent", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, {
      rows: [subscriptionRow("cus_native", "Alex", "Rocket League Club")],
    });

    const accounts = await resolveBillingAccountsViaRls(supabase);

    expect(accounts).toEqual([
      {
        stripeCustomerId: "cus_native",
        covers: [
          {
            gamerFirstName: "Alex",
            productTranslations: [{ locale: "en", name: "Rocket League Club" }],
          },
        ],
      },
    ]);
  });

  it("collapses several subscriptions on one customer into one account", async () => {
    // The common multi-child case: still ONE Stripe customer, so still one
    // button — several buttons opening the same page would read as broken.
    mockBackend({ stripe_customer_id: "cus_native" }, {
      rows: [
        subscriptionRow("cus_native", "Alex", "Rocket League Club"),
        subscriptionRow("cus_native", "Bobby", "Cosmic Builders Club"),
      ],
    });

    const accounts = await resolveBillingAccountsViaRls(supabase);

    expect(accounts).toHaveLength(1);
    expect(accounts[0].covers.map((c) => c.gamerFirstName)).toEqual([
      "Alex",
      "Bobby",
    ]);
  });

  it("splits a migrated parent's customers, profile-bound one first", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, {
      rows: [
        subscriptionRow("cus_migrated", "Bobby", "Cosmic Builders Club"),
        subscriptionRow("cus_native", "Alex", "Rocket League Club"),
      ],
    });

    const accounts = await resolveBillingAccountsViaRls(supabase);

    expect(accounts.map((a) => a.stripeCustomerId)).toEqual([
      "cus_native",
      "cus_migrated",
    ]);
  });

  it("keeps the profile-bound customer even when it carries no subscription", async () => {
    // It still holds their saved cards and invoice history, so it stays
    // reachable — and dropping it would strand a parent whose only live
    // subscription sits on a migrated customer.
    mockBackend({ stripe_customer_id: "cus_native" }, {
      rows: [subscriptionRow("cus_migrated", "Bobby", "Cosmic Builders Club")],
    });

    const accounts = await resolveBillingAccountsViaRls(supabase);

    expect(accounts).toEqual([
      { stripeCustomerId: "cus_native", covers: [] },
      {
        stripeCustomerId: "cus_migrated",
        covers: [
          {
            gamerFirstName: "Bobby",
            productTranslations: [
              { locale: "en", name: "Cosmic Builders Club" },
            ],
          },
        ],
      },
    ]);
  });

  it("returns [] for a parent who has never purchased", async () => {
    mockBackend({ stripe_customer_id: null }, { rows: [] });

    expect(await resolveBillingAccountsViaRls(supabase)).toEqual([]);
  });

  it("scopes both reads to the caller", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, { rows: [] });

    await resolveBillingAccountsViaRls(supabase);

    const urls = fetchMock.mock.calls.map(([input]) => requestedUrl(input));
    const profileUrl = urls.find((u) => u.pathname === PROFILES_PATH);
    const subsUrl = urls.find((u) => u.pathname === SUBSCRIPTIONS_PATH);
    expect(profileUrl?.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
    expect(subsUrl?.searchParams.get("customer_id")).toBe(`eq.${USER_ID}`);
  });

  it("degrades to [] (and does not throw) when the subscription read errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockBackend({ stripe_customer_id: "cus_native" }, { errorMessage: "boom" });

    expect(await resolveBillingAccountsViaRls(supabase)).toEqual([]);
    consoleError.mockRestore();
  });
});

describe("resolveParticipationStripeCustomerId", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    supabase = createFetchStubbedClient(fetchMock);
  });

  it("returns the customer billing the caller's own participation", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson({ stripe_customer_id: "cus_migrated" }),
    );

    const result = await resolveParticipationStripeCustomerId(
      supabase,
      USER_ID,
      PARTICIPATION_ID,
    );

    expect(result).toBe("cus_migrated");
    const url = requestedUrl(fetchMock.mock.calls[0][0]);
    // Both filters matter: the participation names the row, the customer id is
    // what stops another family's participation resolving to their customer.
    expect(url.searchParams.get("participation_id")).toBe(
      `eq.${PARTICIPATION_ID}`,
    );
    expect(url.searchParams.get("customer_id")).toBe(`eq.${USER_ID}`);
  });

  it("returns null when the participation is not the caller's", async () => {
    fetchMock.mockResolvedValue(postgrestJson(null));

    expect(
      await resolveParticipationStripeCustomerId(
        supabase,
        USER_ID,
        PARTICIPATION_ID,
      ),
    ).toBeNull();
  });
});

describe("ownsStripeCustomer", () => {
  let fetchMock: FetchMock;
  let supabase: SupabaseClient<Database>;

  function mockBackend(profile: unknown, subscription: unknown) {
    fetchMock.mockImplementation((input) => {
      const url = requestedUrl(input);
      if (url.pathname === PROFILES_PATH) {
        return Promise.resolve(postgrestJson(profile));
      }
      if (url.pathname === SUBSCRIPTIONS_PATH) {
        return Promise.resolve(postgrestJson(subscription));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url.pathname}`));
    });
  }

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    supabase = createFetchStubbedClient(fetchMock);
  });

  it("accepts the customer bound to the caller's profile", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, null);

    expect(await ownsStripeCustomer(supabase, USER_ID, "cus_native")).toBe(true);
  });

  it("accepts a customer carrying one of the caller's subscriptions", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, { id: "sub-row-1" });

    expect(await ownsStripeCustomer(supabase, USER_ID, "cus_migrated")).toBe(
      true,
    );
  });

  it("rejects a customer that is neither", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, null);

    expect(
      await ownsStripeCustomer(supabase, USER_ID, "cus_someone_else"),
    ).toBe(false);
  });

  it("scopes the subscription probe to the caller", async () => {
    mockBackend({ stripe_customer_id: "cus_native" }, null);

    await ownsStripeCustomer(supabase, USER_ID, "cus_migrated");

    const subsUrl = fetchMock.mock.calls
      .map(([input]) => requestedUrl(input))
      .find((u) => u.pathname === SUBSCRIPTIONS_PATH);
    expect(subsUrl?.searchParams.get("customer_id")).toBe(`eq.${USER_ID}`);
    expect(subsUrl?.searchParams.get("stripe_customer_id")).toBe(
      "eq.cus_migrated",
    );
  });
});
