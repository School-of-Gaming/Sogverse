import { describe, expect, it } from "vitest";
import {
  canCompEnroll,
  chipGameIdentity,
  dragSubjectsFrom,
  isSubscriptionShaped,
  readDropData,
  readChipDragData,
  resolveDrop,
  robloxIdsFrom,
  type DragSubject,
} from "@/components/admin/products/groups/panel-rules";
import type { GroupParticipationDetail, ProductGroupsSnapshot } from "@/types";

// resolveDrop's third argument, named at the call sites so the boolean reads.
// It answers one question: can this product's active seat exist without a
// monthly Stripe subscription? A paid camp or event can — its payment is a
// one-off settled out of band, and the admin's drag is trusted there.
const SUBSCRIPTION_CLUB = true;
const ONE_OFF = false;

// A member sitting in a group, paid for, no subscription — the boring case each
// test bends one field of.
const member: DragSubject = {
  isWaitlisted: false,
  currentGroupId: "group-1",
  hasLiveSubscription: false,
  hasPaymentMarker: true,
};

const waitlisted: DragSubject = {
  isWaitlisted: true,
  currentGroupId: null,
  hasLiveSubscription: false,
  hasPaymentMarker: false,
};

const toGroup2 = { kind: "move", toGroupId: "group-2" } as const;
const toUnassigned = { kind: "move", toGroupId: null } as const;
const toWaitlist = { kind: "waitlist" } as const;
const toRemoveZone = { kind: "remove" } as const;

describe("readChipDragData", () => {
  it("reads a well-formed chip payload", () => {
    expect(
      readChipDragData({ participationId: "p1", firstName: "Aino" }),
    ).toEqual({ participationId: "p1", firstName: "Aino" });
  });

  it("rejects anything that isn't one", () => {
    expect(readChipDragData(null)).toBeNull();
    expect(readChipDragData(undefined)).toBeNull();
    expect(readChipDragData("p1")).toBeNull();
    expect(readChipDragData({ participationId: "p1" })).toBeNull();
    expect(readChipDragData({ firstName: "Aino" })).toBeNull();
    expect(readChipDragData({ participationId: 7, firstName: "Aino" })).toBeNull();
  });
});

describe("readDropData", () => {
  it("reads each droppable's payload", () => {
    expect(readDropData({ remove: true })).toEqual({ kind: "remove" });
    expect(readDropData({ waitlist: true })).toEqual({ kind: "waitlist" });
    expect(readDropData({ toGroupId: "group-1" })).toEqual({
      kind: "move",
      toGroupId: "group-1",
    });
    // The unassigned inbox is a move to "no group".
    expect(readDropData({ toGroupId: null })).toEqual({
      kind: "move",
      toGroupId: null,
    });
  });

  it("rejects anything that isn't one", () => {
    expect(readDropData(null)).toBeNull();
    expect(readDropData({})).toBeNull();
    expect(readDropData({ remove: false })).toBeNull();
    expect(readDropData({ toGroupId: 7 })).toBeNull();
  });
});

describe("resolveDrop — ordinary moves", () => {
  it("moves a member into another group", () => {
    expect(resolveDrop(toGroup2, member, SUBSCRIPTION_CLUB)).toEqual({
      kind: "move",
      toGroupId: "group-2",
    });
  });

  it("moves a member back to the unassigned inbox", () => {
    expect(resolveDrop(toUnassigned, member, SUBSCRIPTION_CLUB)).toEqual({
      kind: "move",
      toGroupId: null,
    });
  });

  it("does nothing when a chip is dropped back where it started", () => {
    expect(
      resolveDrop(
        { kind: "move", toGroupId: "group-1" },
        member,
        SUBSCRIPTION_CLUB,
      ),
    ).toEqual({ kind: "none" });
    expect(
      resolveDrop(toUnassigned, { ...member, currentGroupId: null }, ONE_OFF),
    ).toEqual({ kind: "none" });
  });

  it("offers removal from a group or from the waitlist when no money is behind the seat", () => {
    expect(resolveDrop(toRemoveZone, member, SUBSCRIPTION_CLUB)).toEqual({
      kind: "remove",
    });
    expect(resolveDrop(toRemoveZone, waitlisted, SUBSCRIPTION_CLUB)).toEqual({
      kind: "remove",
    });
  });
});

describe("resolveDrop — promoting off the waitlist", () => {
  it("refuses a never-paid waitlister on a subscription-billed club", () => {
    expect(resolveDrop(toGroup2, waitlisted, SUBSCRIPTION_CLUB)).toEqual({
      kind: "blocked",
      reason: "unpaidPromote",
    });
    // Same refusal into the unassigned inbox — the seat is what needs the
    // subscription, not the group.
    expect(resolveDrop(toUnassigned, waitlisted, SUBSCRIPTION_CLUB)).toEqual({
      kind: "blocked",
      reason: "unpaidPromote",
    });
  });

  it("promotes a never-paid waitlister plainly on a one-off paid camp or event", () => {
    // The narrowed rule. A paid camp's seat is a single payment the admin
    // settles out of band (an invoice, a transfer, a comp) — there is no
    // recurring charge to leave unaccounted for, so the drag is trusted and no
    // dialog fires. Only a monthly club seat needs the subscription the panel
    // cannot create.
    expect(resolveDrop(toGroup2, waitlisted, ONE_OFF)).toEqual({
      kind: "promote",
      toGroupId: "group-2",
    });
    expect(resolveDrop(toUnassigned, waitlisted, ONE_OFF)).toEqual({
      kind: "promote",
      toGroupId: null,
    });
  });

  it("promotes a demoted-after-paying member plainly, even on a subscription club", () => {
    // The payment marker survives demotion — this is the family who genuinely
    // paid, was moved to the waitlist, and is being put back. Keying the
    // refusal on the product alone would trap them there forever.
    expect(
      resolveDrop(
        toGroup2,
        { ...waitlisted, hasPaymentMarker: true },
        SUBSCRIPTION_CLUB,
      ),
    ).toEqual({ kind: "promote", toGroupId: "group-2" });
  });

  it("ignores where a waitlisted chip 'currently' sits", () => {
    // A waitlisted row has no group, so a stale currentGroupId must never turn
    // a promotion into a no-op.
    expect(
      resolveDrop(
        { kind: "move", toGroupId: "group-1" },
        { ...waitlisted, currentGroupId: "group-1", hasPaymentMarker: true },
        SUBSCRIPTION_CLUB,
      ),
    ).toEqual({ kind: "promote", toGroupId: "group-1" });
  });
});

describe("resolveDrop — demoting onto the waitlist", () => {
  it("demotes a member with no subscription", () => {
    expect(resolveDrop(toWaitlist, member, SUBSCRIPTION_CLUB)).toEqual({
      kind: "demote",
    });
    expect(resolveDrop(toWaitlist, member, ONE_OFF)).toEqual({
      kind: "demote",
    });
  });

  it("refuses a member whose seat is behind a live subscription", () => {
    // Keyed to the participation's subscription, not the product's shape — a
    // club flipped to free can still have subscribed members.
    for (const shape of [SUBSCRIPTION_CLUB, ONE_OFF]) {
      expect(
        resolveDrop(toWaitlist, { ...member, hasLiveSubscription: true }, shape),
      ).toEqual({ kind: "blocked", reason: "liveSubscription" });
    }
  });

  it("does nothing when a waitlisted chip is dropped back on the waitlist", () => {
    expect(resolveDrop(toWaitlist, waitlisted, SUBSCRIPTION_CLUB)).toEqual({
      kind: "none",
    });
  });
});

describe("resolveDrop — removing a subscribed member", () => {
  it("refuses removal while a live subscription stands behind the seat", () => {
    // The same condition `admin_remove_participation` refuses on, fronted so
    // the admin reads why instead of confirming a removal that is about to
    // fail. Removal CASCADEs family_subscriptions, so the subscription would
    // bill on with nothing in the database left to cancel it.
    for (const shape of [SUBSCRIPTION_CLUB, ONE_OFF]) {
      expect(
        resolveDrop(
          toRemoveZone,
          { ...member, hasLiveSubscription: true },
          shape,
        ),
      ).toEqual({ kind: "blocked", reason: "removeSubscribed" });
    }
  });

  it("refuses it from the waitlist too", () => {
    // A waitlisted row can carry a live subscription: the webhook writes one
    // without the product lock, so a demote can land in that window.
    expect(
      resolveDrop(
        toRemoveZone,
        { ...waitlisted, hasLiveSubscription: true },
        SUBSCRIPTION_CLUB,
      ),
    ).toEqual({ kind: "blocked", reason: "removeSubscribed" });
  });

  it("allows removal once the subscription is no longer live", () => {
    // The flag is false for a cancelled subscription (the snapshot filters
    // them out), which is what stops a dunning-dead row holding the seat
    // forever — there is nothing left for the family to cancel.
    expect(
      resolveDrop(
        toRemoveZone,
        { ...member, hasLiveSubscription: false, hasPaymentMarker: true },
        SUBSCRIPTION_CLUB,
      ),
    ).toEqual({ kind: "remove" });
  });
});

describe("dragSubjectsFrom", () => {
  type Participation = ProductGroupsSnapshot["unassigned"][number];

  function participation(
    id: string,
    overrides: Partial<Participation> = {},
  ): Participation {
    return {
      id,
      participant_id: `gamer-of-${id}`,
      participant_first_name: "Aino",
      participant_date_of_birth: null,
      participant_gender: null,
      participant_minecraft_username: null,
      participant_minecraft_uuid: null,
      participant_roblox_username: null,
      participant_roblox_user_id: null,
      parent_first_name: null,
      parent_last_name: null,
      participant_email: null,
      status: "active",
      signed_up_at: "2026-01-01T00:00:00Z",
      has_live_subscription: false,
      has_payment_marker: false,
      ...overrides,
    };
  }

  // One product as the panel sees it: a subscribed member in a group, a plain
  // member in the inbox, and two waitlisters who differ only in whether money
  // ever arrived for them.
  const snapshot: ProductGroupsSnapshot = {
    product_id: "product-1",
    groups: [
      {
        id: "group-1",
        name: "Group A",
        created_at: "2026-01-01T00:00:00Z",
        gedus: [],
        participations: [
          participation("p-subscribed", {
            has_live_subscription: true,
            has_payment_marker: true,
          }),
        ],
      },
    ],
    unassigned: [participation("p-inbox")],
    waitlist: [
      participation("p-queued", { status: "waitlisted" }),
      participation("p-demoted", {
        status: "waitlisted",
        has_payment_marker: true,
      }),
    ],
  };

  const subjects = dragSubjectsFrom(snapshot);

  it("places each chip where the snapshot has it", () => {
    expect(subjects.get("p-subscribed")).toMatchObject({
      isWaitlisted: false,
      currentGroupId: "group-1",
    });
    expect(subjects.get("p-inbox")).toMatchObject({
      isWaitlisted: false,
      currentGroupId: null,
    });
    expect(subjects.get("p-queued")).toMatchObject({
      isWaitlisted: true,
      currentGroupId: null,
    });
  });

  it("takes both money facts off the participation object", () => {
    // Neither is a separate read any more: the snapshot RPC carries them, so
    // the flags a drag is decided on came from the same document as the chip.
    expect(subjects.get("p-subscribed")).toMatchObject({
      hasLiveSubscription: true,
      hasPaymentMarker: true,
    });
    expect(subjects.get("p-inbox")).toMatchObject({
      hasLiveSubscription: false,
      hasPaymentMarker: false,
    });
    // The waitlist is where the marker decides something, and it separates the
    // two rows the RPC reports identically in every other respect.
    expect(subjects.get("p-queued")?.hasPaymentMarker).toBe(false);
    expect(subjects.get("p-demoted")?.hasPaymentMarker).toBe(true);
  });

  it("knows nothing before the snapshot lands", () => {
    // Not "everyone is unpaid" — the panel refuses a drop it has no subject
    // for, so an empty map writes nothing rather than deciding wrongly.
    expect(dragSubjectsFrom(undefined).size).toBe(0);
    expect(subjects.get("p-not-here")).toBeUndefined();
  });

  it("feeds resolveDrop the refusal the panel shows", () => {
    // The end-to-end shape: snapshot → subject → outcome, on a subscription
    // club. Same queue, same drop, opposite answers — decided by the marker
    // alone.
    expect(
      resolveDrop(toGroup2, subjects.get("p-queued")!, SUBSCRIPTION_CLUB),
    ).toEqual({ kind: "blocked", reason: "unpaidPromote" });
    expect(
      resolveDrop(toGroup2, subjects.get("p-demoted")!, SUBSCRIPTION_CLUB),
    ).toEqual({ kind: "promote", toGroupId: "group-2" });
    expect(
      resolveDrop(toWaitlist, subjects.get("p-subscribed")!, SUBSCRIPTION_CLUB),
    ).toEqual({ kind: "blocked", reason: "liveSubscription" });
    expect(
      resolveDrop(
        toRemoveZone,
        subjects.get("p-subscribed")!,
        SUBSCRIPTION_CLUB,
      ),
    ).toEqual({ kind: "blocked", reason: "removeSubscribed" });
  });
});

describe("chipGameIdentity", () => {
  // A child who holds both handles, so every case below is decided by the
  // product's platform rather than by which column happens to be filled in.
  function child(
    overrides: Partial<GroupParticipationDetail> = {},
  ): GroupParticipationDetail {
    return {
      id: "p-1",
      participant_id: "gamer-1",
      participant_first_name: "Aino",
      participant_date_of_birth: null,
      participant_gender: null,
      participant_minecraft_username: "Notch",
      participant_minecraft_uuid: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
      participant_roblox_username: "AinoBuilds",
      participant_roblox_user_id: 261,
      parent_first_name: null,
      parent_last_name: null,
      participant_email: null,
      status: "active",
      signed_up_at: "2026-01-01T00:00:00Z",
      has_live_subscription: false,
      has_payment_marker: false,
      ...overrides,
    };
  }

  it("draws the Minecraft columns on a Minecraft product", () => {
    expect(chipGameIdentity(child(), "minecraft", undefined)).toEqual({
      gamePlatform: "minecraft",
      gameUsername: "Notch",
      gameExternalId: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
      gameAvatarUrl: undefined,
    });
  });

  it("leaves a Minecraft row to find its own face", () => {
    // Not null — omitted. The skin host is addressable by username, so the row
    // derives the render itself; an explicit null would be the placeholder and
    // would silently strip every Minecraft face on the panel.
    expect(chipGameIdentity(child(), "minecraft", {}).gameAvatarUrl).toBe(
      undefined,
    );
  });

  it("draws the Roblox columns on a Roblox product, never the Minecraft ones", () => {
    const identity = chipGameIdentity(child(), "roblox", {
      "261": "https://tr.rbxcdn.com/aino-headshot",
    });
    expect(identity.gamePlatform).toBe("roblox");
    expect(identity.gameUsername).toBe("AinoBuilds");
    expect(identity.gameExternalId).toBe(261);
    expect(identity.gameAvatarUrl).toBe("https://tr.rbxcdn.com/aino-headshot");
  });

  it("takes the render the response named, not one it was handed by position", () => {
    // The single failure worse than no picture: one child wearing another's
    // face. The map is read by this participation's own id and nothing else.
    const renders = {
      "99": "https://tr.rbxcdn.com/somebody-else",
      "261": "https://tr.rbxcdn.com/aino-headshot",
    };
    expect(chipGameIdentity(child(), "roblox", renders).gameAvatarUrl).toBe(
      "https://tr.rbxcdn.com/aino-headshot",
    );
  });

  it("falls back to the placeholder for every way a render can be absent", () => {
    // In flight (or failed — renders are never retried): no map at all.
    expect(chipGameIdentity(child(), "roblox", undefined).gameAvatarUrl).toBe(
      null,
    );
    // Answered, and Roblox has no render for this account.
    expect(
      chipGameIdentity(child(), "roblox", { "261": null }).gameAvatarUrl,
    ).toBe(null);
    // The response somehow omitted an id we asked about.
    expect(chipGameIdentity(child(), "roblox", {}).gameAvatarUrl).toBe(null);
  });

  it("keeps an unverified Roblox handle on the silhouette", () => {
    // No id to ask about, and resolving the *name* would draw whichever
    // stranger happens to own it beside a child's. The name still shows.
    const identity = chipGameIdentity(
      child({ participant_roblox_user_id: null }),
      "roblox",
      { "261": "https://tr.rbxcdn.com/aino-headshot" },
    );
    expect(identity.gameUsername).toBe("AinoBuilds");
    expect(identity.gameExternalId).toBe(null);
    expect(identity.gameAvatarUrl).toBe(null);
  });

  it("draws no identity at all for a topic about no game account", () => {
    // Both handles are on the row and neither is the product's business.
    expect(chipGameIdentity(child(), null, undefined)).toEqual({
      gamePlatform: null,
      gameUsername: null,
      gameExternalId: null,
      gameAvatarUrl: null,
    });
  });
});

describe("robloxIdsFrom", () => {
  function queued(id: string, robloxUserId: number | null) {
    return {
      id,
      participant_id: `gamer-of-${id}`,
      participant_first_name: "Aino",
      participant_date_of_birth: null,
      participant_gender: null,
      participant_minecraft_username: null,
      participant_minecraft_uuid: null,
      participant_roblox_username: robloxUserId === null ? "typed_only" : "Aino",
      participant_roblox_user_id: robloxUserId,
      parent_first_name: null,
      parent_last_name: null,
      participant_email: null,
      status: "active" as const,
      signed_up_at: "2026-01-01T00:00:00Z",
      has_live_subscription: false,
      has_payment_marker: false,
    };
  }

  const snapshot: ProductGroupsSnapshot = {
    product_id: "product-1",
    groups: [
      {
        id: "group-1",
        name: "Group A",
        created_at: "2026-01-01T00:00:00Z",
        gedus: [],
        participations: [queued("p-grouped", 261), queued("p-typed", null)],
      },
    ],
    unassigned: [queued("p-inbox", 12)],
    waitlist: [queued("p-queued", 7)],
  };

  it("collects every verified id on the panel, in one list", () => {
    // Groups, inbox and waitlist together: the whole page is one request, and
    // a section left out would leave its chips permanently on the silhouette.
    // Duplicates are fine here — the hook normalizes the list into its key.
    expect([...robloxIdsFrom(snapshot, "roblox")].sort((a, b) => a - b)).toEqual(
      [7, 12, 261],
    );
  });

  it("asks Roblox nothing on any other product", () => {
    // An empty list disables the query outright, so a Minecraft or topic-less
    // product spends none of the shared per-IP budget.
    expect(robloxIdsFrom(snapshot, "minecraft")).toEqual([]);
    expect(robloxIdsFrom(snapshot, null)).toEqual([]);
    expect(robloxIdsFrom(undefined, "roblox")).toEqual([]);
  });
});

describe("isSubscriptionShaped / canCompEnroll", () => {
  // One predicate, two consumers, and they are deliberately the same question:
  // a seat that only a monthly subscription can create is both the one an admin
  // cannot comp-enroll and the one a never-paid promotion must not hand out.
  it("is true only for a consumer club that charges", () => {
    expect(isSubscriptionShaped("consumer_club", "paid")).toBe(true);
    expect(isSubscriptionShaped("consumer_club", "free")).toBe(false);
    expect(isSubscriptionShaped("camp", "paid")).toBe(false);
    expect(isSubscriptionShaped("event", "paid")).toBe(false);
    expect(isSubscriptionShaped("municipality_club", "external_contract")).toBe(
      false,
    );
  });

  it("refuses comp-enrollment on exactly that shape", () => {
    expect(canCompEnroll("consumer_club", "paid")).toBe(false);
  });

  it("allows a free club, exactly like a free event", () => {
    expect(canCompEnroll("consumer_club", "free")).toBe(true);
    expect(canCompEnroll("event", "free")).toBe(true);
  });

  it("allows every other type on any billing", () => {
    expect(canCompEnroll("camp", "paid")).toBe(true);
    expect(canCompEnroll("event", "paid")).toBe(true);
    expect(canCompEnroll("municipality_club", "external_contract")).toBe(true);
  });
});
