import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KlaviyoParentSnapshot } from "@/lib/klaviyo-sync/snapshot.contracts";

/**
 * The Klaviyo drain against a scripted outbox and a mocked Klaviyo client.
 * Pinned: an unconfigured environment claims nothing; a parent with a snapshot
 * is upserted onto the profile Klaviyo already holds for their id and added
 * to its lists — production's history lists, or staging's one list — and one
 * without is deleted; one row's failure is finished with a label and the rest
 * go on; an event whose parent is gone is finished unsent; and the one
 * subscription goes only with a ticked account creation, into the marketing
 * consent list.
 */

const klaviyo = {
  isKlaviyoConfigured: vi.fn(() => true),
  findKlaviyoProfileIdByExternalId: vi.fn<(id: string) => Promise<string | null>>(),
  upsertKlaviyoProfile: vi.fn<() => Promise<string | null>>(async () => "kl-id"),
  addKlaviyoProfileToList: vi.fn(async () => undefined),
  requestKlaviyoProfileDeletion: vi.fn(async () => undefined),
  createKlaviyoEvent: vi.fn(async () => undefined),
  subscribeKlaviyoProfile: vi.fn(async () => undefined),
};
vi.mock("@/lib/klaviyo", () => klaviyo);

interface RpcArgs extends Record<string, unknown> {
  p_customer_ids?: string[];
}
type Rpc = (name: string, args: RpcArgs) => { data: unknown; error: unknown };
let rpcHandler: Rpc;
const rpcCalls: [string, RpcArgs][] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: RpcArgs) => {
      rpcCalls.push([name, args]);
      return rpcHandler(name, args);
    },
  }),
}));

const { drainKlaviyoSync } = await import("@/lib/klaviyo-sync/sync.server");

const KEPT = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";

function snapshot(id: string, consent: boolean | null = null): KlaviyoParentSnapshot {
  return {
    profile: {
      id,
      email: `${id}@example.com`,
      first_name: "Aino",
      last_name: "Virtanen",
      phone: null,
      locale: "en",
      spoken_languages: [],
      currency: null,
      created_at: "2026-08-01T10:00:00+00:00",
      email_verified_at: null,
      home_location: null,
    },
    attribution: {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      signup_intent_kind: null,
      signup_intent_id: null,
      registration_marketing_consent: consent,
    },
    gamers: [],
    participations: [],
    subscriptions: [],
    payments: { first_at: null, last_at: null, lifetime_cents: {} },
  };
}

/** An outbox handing out its jobs once, then nothing. */
function outbox({
  profiles = [] as { customer_id: string; seq: number }[],
  events = [] as { event_id: string; kind: string; customer_id: string }[],
  eventRows = [] as Record<string, unknown>[],
  snapshots = [] as KlaviyoParentSnapshot[],
}) {
  let profileClaims = 0;
  let eventClaims = 0;
  rpcHandler = (name, args) => {
    switch (name) {
      case "claim_klaviyo_profile_jobs":
        return { data: profileClaims++ === 0 ? profiles : [], error: null };
      case "claim_klaviyo_event_jobs":
        return { data: eventClaims++ === 0 ? events : [], error: null };
      case "get_klaviyo_parent_snapshots": {
        const ids = args.p_customer_ids ?? [];
        return {
          data: snapshots
            .filter((s) => ids.includes(s.profile.id))
            .map((s) => ({ customer_id: s.profile.id, snapshot: s })),
          error: null,
        };
      }
      case "get_klaviyo_events":
        return { data: eventRows, error: null };
      default:
        return { data: false, error: null };
    }
  };
}

function finishes(name: string) {
  return rpcCalls.filter(([called]) => called === name).map(([, args]) => args);
}

beforeEach(() => {
  rpcCalls.length = 0;
  vi.clearAllMocks();
  klaviyo.isKlaviyoConfigured.mockReturnValue(true);
  klaviyo.findKlaviyoProfileIdByExternalId.mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("KLAVIYO_MARKETING_CONSENT_LIST_ID", "list-consent");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("drainKlaviyoSync", () => {
  it("claims nothing where Klaviyo is not configured", async () => {
    klaviyo.isKlaviyoConfigured.mockReturnValue(false);
    outbox({ profiles: [{ customer_id: KEPT, seq: 1 }] });

    const result = await drainKlaviyoSync();

    expect(result.notConfigured).toBe(true);
    expect(rpcCalls).toHaveLength(0);
  });

  it("upserts a parent onto their existing profile and deletes a gone one", async () => {
    outbox({
      profiles: [
        { customer_id: KEPT, seq: 3 },
        { customer_id: GONE, seq: 1 },
      ],
      snapshots: [snapshot(KEPT)],
    });
    klaviyo.findKlaviyoProfileIdByExternalId.mockImplementation(async (id) =>
      id === KEPT ? "kl-kept" : "kl-gone",
    );

    const result = await drainKlaviyoSync();

    expect(result).toMatchObject({ profilesSynced: 1, profilesDeleted: 1, failed: 0 });
    expect(klaviyo.upsertKlaviyoProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: "kl-kept", externalId: KEPT, email: `${KEPT}@example.com` }),
    );
    expect(klaviyo.requestKlaviyoProfileDeletion).toHaveBeenCalledWith("kl-gone");
    expect(finishes("finish_klaviyo_profile_job")).toEqual([
      { p_customer_id: KEPT, p_seq: 3 },
      { p_customer_id: GONE, p_seq: 1 },
    ]);
  });

  it("adds a staging parent to the one staging list and no other", async () => {
    outbox({ profiles: [{ customer_id: KEPT, seq: 1 }], snapshots: [snapshot(KEPT)] });

    await drainKlaviyoSync();

    expect(klaviyo.addKlaviyoProfileToList.mock.calls).toEqual([["list-consent", "kl-id"]]);
  });

  it("adds a production parent to the history lists their seats earn", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("KLAVIYO_ACCOUNT_LIST_ID", "list-account");
    vi.stubEnv("KLAVIYO_CLUB_LIST_ID", "list-club");
    const club = {
      id: "p1",
      status: "active" as const,
      product: {
        id: "0c8e5d1a-7b42-4e93-a6f0-3d9b2c7e8f14",
        names: [],
        topic: "minecraft_java" as const,
        product_type: "consumer_club" as const,
        billing_mode: "paid" as const,
        start_date: "2026-09-01",
        end_date: null,
        timezone: "Europe/Helsinki",
      },
    };
    outbox({
      profiles: [{ customer_id: KEPT, seq: 1 }],
      snapshots: [{ ...snapshot(KEPT), participations: [club] }],
    });
    klaviyo.findKlaviyoProfileIdByExternalId.mockResolvedValue("kl-kept");

    await drainKlaviyoSync();

    expect(klaviyo.addKlaviyoProfileToList.mock.calls).toEqual([
      ["list-account", "kl-id"],
      ["list-club", "kl-id"],
    ]);
  });

  it("fails the row, writing nothing, when a list it needs is not configured", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    outbox({ profiles: [{ customer_id: KEPT, seq: 1 }], snapshots: [snapshot(KEPT)] });

    const result = await drainKlaviyoSync();

    expect(result.failed).toBe(1);
    expect(klaviyo.upsertKlaviyoProfile).not.toHaveBeenCalled();
    expect(finishes("finish_klaviyo_profile_job")).toEqual([
      { p_customer_id: KEPT, p_seq: 1, p_error: "Error: KLAVIYO_ACCOUNT_LIST_ID is not set" },
    ]);
  });

  it("deletes nothing for a gone parent Klaviyo never held", async () => {
    outbox({ profiles: [{ customer_id: GONE, seq: 1 }] });

    await drainKlaviyoSync();

    expect(klaviyo.requestKlaviyoProfileDeletion).not.toHaveBeenCalled();
    expect(finishes("finish_klaviyo_profile_job")).toEqual([{ p_customer_id: GONE, p_seq: 1 }]);
  });

  it("finishes a failed row with a label and goes on to the next", async () => {
    outbox({
      profiles: [
        { customer_id: KEPT, seq: 1 },
        { customer_id: GONE, seq: 1 },
      ],
      snapshots: [snapshot(KEPT)],
    });
    klaviyo.upsertKlaviyoProfile.mockRejectedValueOnce(
      new Error("Klaviyo /profile-import answered 429 (throttled: Request was throttled.)"),
    );

    const result = await drainKlaviyoSync();

    expect(result.failed).toBe(1);
    const [failed, next] = finishes("finish_klaviyo_profile_job");
    expect(failed).toEqual({
      p_customer_id: KEPT,
      p_seq: 1,
      p_error: "Error: Klaviyo /profile-import answered 429 (throttled: Request was throttled.)",
    });
    expect(String(failed.p_error)).not.toContain("@example.com");
    expect(next).toEqual({ p_customer_id: GONE, p_seq: 1 });
  });

  it("sends an account creation and subscribes only a ticked one", async () => {
    const ticked = "33333333-3333-4333-8333-333333333333";
    outbox({
      events: [
        { event_id: "e1", kind: "account_created", customer_id: ticked },
        { event_id: "e2", kind: "account_created", customer_id: KEPT },
        { event_id: "e3", kind: "account_created", customer_id: GONE },
      ],
      eventRows: [ticked, KEPT].map((id, i) => ({
        event_id: `e${i + 1}`,
        kind: "account_created",
        unique_id: `account_created:${id}`,
        customer_id: id,
        occurred_at: "2026-10-01T09:00:00+00:00",
        properties: { source_id: id, product: null },
      })),
      snapshots: [snapshot(ticked, true), snapshot(KEPT, false)],
    });

    const result = await drainKlaviyoSync();

    expect(result).toMatchObject({ eventsSent: 2, eventsDropped: 1, failed: 0 });
    expect(klaviyo.createKlaviyoEvent).toHaveBeenCalledWith(
      { email: `${ticked}@example.com`, externalId: ticked },
      expect.objectContaining({ metric: "SV Account Created", uniqueId: `account_created:${ticked}` }),
    );
    expect(klaviyo.subscribeKlaviyoProfile).toHaveBeenCalledTimes(1);
    expect(klaviyo.subscribeKlaviyoProfile).toHaveBeenCalledWith({
      email: `${ticked}@example.com`,
      listId: "list-consent",
      customSource: "Sogverse account registration",
    });
    expect(finishes("finish_klaviyo_event_job")).toEqual([
      { p_event_id: "e1" },
      { p_event_id: "e2" },
      { p_event_id: "e3" },
    ]);
  });

  it("stops the drain when the database itself fails", async () => {
    rpcHandler = () => ({ data: null, error: { message: "down" } });
    await expect(drainKlaviyoSync()).rejects.toEqual({ message: "down" });
  });
});
