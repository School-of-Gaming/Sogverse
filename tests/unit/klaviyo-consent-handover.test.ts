import { describe, expect, it, vi } from "vitest";

import type { KlaviyoEmailMarketing } from "@/lib/klaviyo";
import {
  HANDOVER_CUSTOM_SOURCE,
  consentedParents,
  decide,
  handOver,
  isHandedOverSubscription,
  withdrawRevoked,
  type ConsentedParent,
  type ConsentRow,
  type HandoverDeps,
} from "../../scripts/klaviyo-consent-handover/handover";

const ANNA = "0b8f3c9e-4a6d-4f0e-9d0a-1c2b3d4e5f60";
const BEN = "7c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const row = (id: string, updatedAt: string, email = `${id}@example.com`): ConsentRow => ({
  customer_id: id,
  updated_at: updatedAt,
  profiles: { email, first_name: "Anna", last_name: "", locale: "fi" },
});

const parent = (id: string, email = `${id}@example.com`): ConsentedParent => ({
  id,
  email,
  firstName: "Anna",
  lastName: "Virtanen",
  locale: "fi",
  consentedAt: "2026-03-01T10:00:00.000Z",
  source: "settings",
});

const marketing = (over: Partial<KlaviyoEmailMarketing> = {}): KlaviyoEmailMarketing => ({
  profileId: "kl-1",
  email: null,
  consent: "NEVER_SUBSCRIBED",
  suppressed: false,
  source: null,
  ...over,
});

function deps(find: HandoverDeps["findEmailMarketing"]) {
  return {
    findEmailMarketing: vi.fn(find),
    upsertProfile: vi.fn(async () => "kl-new"),
    subscribe: vi.fn(async () => {}),
    unsubscribe: vi.fn(async () => {}),
    sleep: vi.fn(async () => {}),
  } satisfies HandoverDeps;
}

describe("consentedParents", () => {
  it("takes the latest granting event's time and source", () => {
    const [anna] = consentedParents(
      [row(ANNA, "2026-05-01T00:00:00+00:00")],
      [
        { customer_id: ANNA, source: "registration", created_at: "2025-01-01T00:00:00+00:00" },
        { customer_id: ANNA, source: "enrolment", created_at: "2026-04-02T08:30:00+00:00" },
        { customer_id: BEN, source: "settings", created_at: "2026-09-01T00:00:00+00:00" },
      ],
    );
    expect(anna).toMatchObject({
      id: ANNA,
      consentedAt: "2026-04-02T08:30:00.000Z",
      source: "enrolment",
      locale: "fi",
    });
  });

  it("falls back to the row's updated_at when no event records the grant", () => {
    const [ben] = consentedParents([row(BEN, "2026-02-03T04:05:06.789+00:00")], []);
    expect(ben).toMatchObject({ consentedAt: "2026-02-03T04:05:06.789Z", source: null });
  });
});

describe("decide", () => {
  it("subscribes a parent Klaviyo has never heard of", () => {
    expect(decide(null, null)).toEqual({ kind: "subscribe", profileId: null });
  });

  it("subscribes a never-subscribed profile, updating the one the sync wrote", () => {
    expect(decide(marketing({ profileId: "kl-ext" }), null)).toEqual({
      kind: "subscribe",
      profileId: "kl-ext",
    });
  });

  it("never re-subscribes an unsubscribed profile", () => {
    expect(decide(marketing({ consent: "UNSUBSCRIBED" }), null)).toEqual({ kind: "unsubscribed" });
  });

  it("never re-subscribes a suppressed profile, whatever its consent says", () => {
    expect(decide(marketing({ consent: "SUBSCRIBED", suppressed: true }), null)).toEqual({
      kind: "unsubscribed",
    });
  });

  it("skips when the profile holding the address unsubscribed, though the external id's did not", () => {
    expect(decide(marketing(), marketing({ profileId: "kl-mail", consent: "UNSUBSCRIBED" }))).toEqual(
      { kind: "unsubscribed" },
    );
  });

  it("leaves an already subscribed address alone", () => {
    expect(decide(null, marketing({ consent: "SUBSCRIBED" }))).toEqual({
      kind: "already_subscribed",
    });
  });
});

describe("handOver", () => {
  it("writes nothing in a dry run, and counts what an apply would do", async () => {
    const d = deps(async (by) =>
      "externalId" in by && by.externalId === BEN
        ? marketing({ consent: "UNSUBSCRIBED", email: `${BEN}@example.com` })
        : null,
    );
    const result = await handOver([parent(ANNA), parent(BEN)], d, {
      apply: false,
      environment: "production",
    });
    expect(result).toMatchObject({ subscribe: 1, unsubscribed: 1, alreadySubscribed: 0 });
    expect(result.bySource).toEqual({ settings: 1 });
    expect(d.upsertProfile).not.toHaveBeenCalled();
    expect(d.subscribe).not.toHaveBeenCalled();
  });

  it("upserts the profile and subscribes it with the original consent time", async () => {
    const d = deps(async (by) =>
      "externalId" in by ? marketing({ profileId: "kl-ext", email: "old@example.com" }) : null,
    );
    const result = await handOver([parent(ANNA, "new@example.com")], d, {
      apply: true,
      environment: "staging",
    });
    expect(result.subscribe).toBe(1);
    // The external id's profile holds another address, so the new one is looked up too.
    expect(d.findEmailMarketing).toHaveBeenCalledWith({ email: "new@example.com" });
    expect(d.upsertProfile).toHaveBeenCalledWith({
      id: "kl-ext",
      email: "new@example.com",
      externalId: ANNA,
      firstName: "Anna",
      lastName: "Virtanen",
      locale: "fi",
      properties: { "Sogverse Account": true, "Sogverse Environment": "staging" },
    });
    expect(d.subscribe).toHaveBeenCalledWith({
      email: "new@example.com",
      customSource: HANDOVER_CUSTOM_SOURCE,
      consentedAt: "2026-03-01T10:00:00.000Z",
    });
  });

  it("does not write to a parent an earlier run subscribed", async () => {
    const d = deps(async () => marketing({ consent: "SUBSCRIBED", email: `${ANNA}@example.com` }));
    const result = await handOver([parent(ANNA)], d, { apply: true, environment: "production" });
    expect(result.alreadySubscribed).toBe(1);
    expect(d.findEmailMarketing).toHaveBeenCalledTimes(1);
    expect(d.upsertProfile).not.toHaveBeenCalled();
    expect(d.subscribe).not.toHaveBeenCalled();
  });

  it("waits out a 429 and retries", async () => {
    const d = deps(async () => null);
    d.subscribe
      .mockRejectedValueOnce(new Error("Klaviyo /profile-subscription-bulk-create-jobs answered 429"))
      .mockResolvedValueOnce(undefined);
    const result = await handOver([parent(ANNA)], d, { apply: true, environment: "production" });
    expect(result.errors).toEqual([]);
    expect(d.subscribe).toHaveBeenCalledTimes(2);
    expect(d.sleep).toHaveBeenCalledWith(1_000);
  });

  it("records a failure by profile id and goes on to the next parent", async () => {
    const d = deps(async () => null);
    d.upsertProfile.mockRejectedValueOnce(
      new Error("Klaviyo /profile-import answered 409 (duplicate_profile: Conflict)"),
    );
    const result = await handOver([parent(ANNA), parent(BEN)], d, {
      apply: true,
      environment: "production",
    });
    expect(result.subscribe).toBe(1);
    expect(result.errors).toEqual([
      {
        profileId: ANNA,
        error: "Error: Klaviyo /profile-import answered 409 (duplicate_profile: Conflict)",
      },
    ]);
    expect(d.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("isHandedOverSubscription", () => {
  const handedOver = { consent: "SUBSCRIBED", source: HANDOVER_CUSTOM_SOURCE };

  it("recognises the handover's own standing subscription", () => {
    expect(isHandedOverSubscription(marketing(handedOver))).toBe(true);
  });

  it("leaves a subscription the parent gave Klaviyo another way", () => {
    expect(isHandedOverSubscription(marketing({ ...handedOver, source: "Landing page newsletter" }))).toBe(false);
    expect(isHandedOverSubscription(marketing({ ...handedOver, source: null }))).toBe(false);
  });

  it("has nothing to take back from an address not subscribed", () => {
    expect(isHandedOverSubscription(null)).toBe(false);
    expect(isHandedOverSubscription(marketing({ ...handedOver, consent: "UNSUBSCRIBED" }))).toBe(false);
    expect(isHandedOverSubscription(marketing({ ...handedOver, suppressed: true }))).toBe(false);
  });
});

describe("withdrawRevoked", () => {
  const revoked = [
    { id: ANNA, email: "anna@example.com" },
    { id: BEN, email: "ben@example.com" },
  ];
  const find: HandoverDeps["findEmailMarketing"] = async (by) =>
    "email" in by && by.email === "anna@example.com"
      ? marketing({ consent: "SUBSCRIBED", source: HANDOVER_CUSTOM_SOURCE })
      : marketing({ consent: "SUBSCRIBED", source: "Landing page newsletter" });

  it("counts, in a dry run, the parents whose handed-over subscription a revocation takes back", async () => {
    const d = deps(find);
    const result = await withdrawRevoked(revoked, d, { apply: false });
    expect(result).toEqual({ unsubscribe: 1, leftAlone: 1, errors: [] });
    expect(d.findEmailMarketing).toHaveBeenCalledWith({ email: "anna@example.com" });
    expect(d.unsubscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes only those under --apply", async () => {
    const d = deps(find);
    const result = await withdrawRevoked(revoked, d, { apply: true });
    expect(result.unsubscribe).toBe(1);
    expect(d.unsubscribe).toHaveBeenCalledTimes(1);
    expect(d.unsubscribe).toHaveBeenCalledWith("anna@example.com");
  });

  it("records a failure by profile id and goes on", async () => {
    const d = deps(find);
    d.unsubscribe.mockRejectedValueOnce(new Error("Klaviyo /profile-subscription-bulk-delete-jobs answered 400"));
    const result = await withdrawRevoked(revoked, d, { apply: true });
    expect(result.errors).toEqual([
      { profileId: ANNA, error: "Error: Klaviyo /profile-subscription-bulk-delete-jobs answered 400" },
    ]);
    expect(result.leftAlone).toBe(1);
  });
});
