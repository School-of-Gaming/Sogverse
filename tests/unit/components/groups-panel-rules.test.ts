import { describe, expect, it } from "vitest";
import {
  canCompEnroll,
  readDropData,
  readGamerDragData,
  resolveDrop,
  type DragSubject,
} from "@/components/admin/products/groups/panel-rules";

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

describe("readGamerDragData", () => {
  it("reads a well-formed chip payload", () => {
    expect(
      readGamerDragData({ participationId: "p1", firstName: "Aino" }),
    ).toEqual({ participationId: "p1", firstName: "Aino" });
  });

  it("rejects anything that isn't one", () => {
    expect(readGamerDragData(null)).toBeNull();
    expect(readGamerDragData(undefined)).toBeNull();
    expect(readGamerDragData("p1")).toBeNull();
    expect(readGamerDragData({ participationId: "p1" })).toBeNull();
    expect(readGamerDragData({ firstName: "Aino" })).toBeNull();
    expect(readGamerDragData({ participationId: 7, firstName: "Aino" })).toBeNull();
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
    expect(resolveDrop(toGroup2, member, "paid")).toEqual({
      kind: "move",
      toGroupId: "group-2",
    });
  });

  it("moves a member back to the unassigned inbox", () => {
    expect(resolveDrop(toUnassigned, member, "paid")).toEqual({
      kind: "move",
      toGroupId: null,
    });
  });

  it("does nothing when a chip is dropped back where it started", () => {
    expect(
      resolveDrop({ kind: "move", toGroupId: "group-1" }, member, "paid"),
    ).toEqual({ kind: "none" });
    expect(
      resolveDrop(toUnassigned, { ...member, currentGroupId: null }, "free"),
    ).toEqual({ kind: "none" });
  });

  it("always offers removal, from a group or from the waitlist", () => {
    expect(resolveDrop(toRemoveZone, member, "paid")).toEqual({
      kind: "remove",
    });
    expect(resolveDrop(toRemoveZone, waitlisted, "paid")).toEqual({
      kind: "remove",
    });
  });
});

describe("resolveDrop — promoting off the waitlist", () => {
  it("refuses a never-paid waitlister on a paid product", () => {
    expect(resolveDrop(toGroup2, waitlisted, "paid")).toEqual({
      kind: "blocked",
      reason: "unpaidPromote",
    });
    // Same refusal into the unassigned inbox — the seat is what costs money,
    // not the group.
    expect(resolveDrop(toUnassigned, waitlisted, "paid")).toEqual({
      kind: "blocked",
      reason: "unpaidPromote",
    });
  });

  it("promotes a demoted-after-paying member plainly, even on a paid product", () => {
    // The payment marker survives demotion — this is the camper who genuinely
    // paid, was moved to the waitlist, and is being put back. Keying the
    // refusal on billing alone would trap them there forever.
    expect(
      resolveDrop(toGroup2, { ...waitlisted, hasPaymentMarker: true }, "paid"),
    ).toEqual({ kind: "promote", toGroupId: "group-2" });
  });

  it("promotes plainly on free and externally-contracted products", () => {
    expect(resolveDrop(toGroup2, waitlisted, "free")).toEqual({
      kind: "promote",
      toGroupId: "group-2",
    });
    expect(resolveDrop(toUnassigned, waitlisted, "external_contract")).toEqual({
      kind: "promote",
      toGroupId: null,
    });
  });

  it("ignores where a waitlisted chip 'currently' sits", () => {
    // A waitlisted row has no group, so a stale currentGroupId must never turn
    // a promotion into a no-op.
    expect(
      resolveDrop(
        { kind: "move", toGroupId: "group-1" },
        { ...waitlisted, currentGroupId: "group-1", hasPaymentMarker: true },
        "paid",
      ),
    ).toEqual({ kind: "promote", toGroupId: "group-1" });
  });
});

describe("resolveDrop — demoting onto the waitlist", () => {
  it("demotes a member with no subscription", () => {
    expect(resolveDrop(toWaitlist, member, "paid")).toEqual({ kind: "demote" });
    expect(resolveDrop(toWaitlist, member, "free")).toEqual({ kind: "demote" });
  });

  it("refuses a member whose seat is behind a live subscription", () => {
    // Keyed to the participation's subscription, not the product's billing —
    // a club flipped to free can still have subscribed members.
    for (const billing of ["paid", "free", "external_contract"] as const) {
      expect(
        resolveDrop(toWaitlist, { ...member, hasLiveSubscription: true }, billing),
      ).toEqual({ kind: "blocked", reason: "liveSubscription" });
    }
  });

  it("does nothing when a waitlisted chip is dropped back on the waitlist", () => {
    expect(resolveDrop(toWaitlist, waitlisted, "paid")).toEqual({
      kind: "none",
    });
  });
});

describe("canCompEnroll", () => {
  it("refuses only the subscription-shaped product", () => {
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
