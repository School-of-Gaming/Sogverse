import type {
  BillingMode,
  ProductGroupsSnapshot,
  ProductType,
} from "@/types";

/**
 * The Groups panel's pure rules: how a drag/drop payload is read, what a drop
 * resolves to, and whether the panel may comp-enroll onto this product.
 *
 * They live outside the panel component so each one can be exercised directly —
 * the interesting cases (a never-paid waitlister promoted onto a subscription-
 * billed club, a subscribed member dragged onto the waitlist or onto the remove
 * zone) are decisions, not rendering, and a decision that only exists inside a
 * drag handler can't be tested without simulating a pointer.
 */

// ---------------------------------------------------------------------------
// dnd-kit payload readers. Drag/drop `data.current` is an untyped record, so
// these narrow it by checking the discriminating fields for real. Unknown
// shapes return null and the handlers no-op — a drag must never throw.
// ---------------------------------------------------------------------------

/** Payload attached by GamerChip's useDraggable. */
export interface GamerDragData {
  participationId: string;
  firstName: string;
}

export function readGamerDragData(value: unknown): GamerDragData | null {
  if (typeof value !== "object" || value === null) return null;
  if (
    !("participationId" in value) ||
    typeof value.participationId !== "string"
  ) {
    return null;
  }
  if (!("firstName" in value) || typeof value.firstName !== "string") {
    return null;
  }
  return {
    participationId: value.participationId,
    firstName: value.firstName,
  };
}

/**
 * Payload attached by the droppables: group columns and the unassigned card
 * carry `{ toGroupId }` (null = unassigned inbox); the header's removal zone
 * carries `{ remove: true }`; the waitlist card carries `{ waitlist: true }`.
 */
export type DropData =
  | { kind: "move"; toGroupId: string | null }
  | { kind: "remove" }
  | { kind: "waitlist" };

export function readDropData(value: unknown): DropData | null {
  if (typeof value !== "object" || value === null) return null;
  if ("remove" in value && value.remove === true) return { kind: "remove" };
  if ("waitlist" in value && value.waitlist === true) {
    return { kind: "waitlist" };
  }
  if ("toGroupId" in value) {
    const { toGroupId } = value;
    if (typeof toGroupId === "string" || toGroupId === null) {
      return { kind: "move", toGroupId };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Drop resolution
// ---------------------------------------------------------------------------

/**
 * Why a drop wrote nothing. All three are money problems the panel cannot fix
 * by dragging, so the drop is refused and a dialog explains the manual path.
 */
export type BlockedDropReason =
  /** Seating a never-paid waitlister on a product whose seat needs a sub. */
  | "unpaidPromote"
  /** Demoting a member whose seat is behind a live Stripe subscription. */
  | "liveSubscription"
  /** Removing a member whose seat is behind a live Stripe subscription. */
  | "removeSubscribed";

export type DropOutcome =
  /** Nothing to do: dropped back where it started, or already there. */
  | { kind: "none" }
  | { kind: "remove" }
  | { kind: "move"; toGroupId: string | null }
  | { kind: "promote"; toGroupId: string | null }
  | { kind: "demote" }
  | { kind: "blocked"; reason: BlockedDropReason };

/** The dragged participation's own facts, read off the panel's snapshot. */
export interface DragSubject {
  /** True when the chip currently sits on the waitlist. */
  isWaitlisted: boolean;
  /**
   * Where an active chip sits now — a group id, or null for the unassigned
   * inbox. Meaningless for a waitlisted chip, which has no group.
   */
  currentGroupId: string | null;
  /**
   * The participation has a live Stripe subscription behind it — carried by the
   * groups snapshot, and the exact condition both `demote_to_waitlist` and
   * `admin_remove_participation` refuse on. "Live" excludes a cancelled row:
   * a dunning-dead subscription bills nothing and must not hold the seat.
   */
  hasLiveSubscription: boolean;
  /**
   * The participation carries a payment marker (its recorded Checkout Session),
   * i.e. money once arrived for this seat. Demotion preserves the marker, so a
   * camper who paid and was later demoted still has one and promotes plainly;
   * a family who joined the queue without paying never has one.
   */
  hasPaymentMarker: boolean;
}

/**
 * Every draggable chip's facts, keyed by participation id, read in one pass
 * over the snapshot the panel already has. Both money questions a drop can ask
 * — the live subscription behind a seat, and whether money ever arrived for it
 * — are fields on the participation object, so a drag is decided from the same
 * document that drew the chip and no second query can disagree with it.
 *
 * A chip that is not in the map cannot be reasoned about, and the panel refuses
 * the drop rather than guessing; every chip it renders comes from this snapshot,
 * so that is a state it should not reach.
 */
export function dragSubjectsFrom(
  snapshot: ProductGroupsSnapshot | undefined,
): Map<string, DragSubject> {
  const subjects = new Map<string, DragSubject>();
  if (!snapshot) return subjects;

  const add = (
    participation: ProductGroupsSnapshot["unassigned"][number],
    placement: { isWaitlisted: boolean; currentGroupId: string | null },
  ) => {
    subjects.set(participation.id, {
      ...placement,
      hasLiveSubscription: participation.has_live_subscription,
      hasPaymentMarker: participation.has_payment_marker,
    });
  };

  for (const group of snapshot.groups) {
    for (const p of group.participations) {
      add(p, { isWaitlisted: false, currentGroupId: group.id });
    }
  }
  for (const p of snapshot.unassigned) {
    add(p, { isWaitlisted: false, currentGroupId: null });
  }
  // A waitlisted row has no group; currentGroupId is meaningless for it and
  // resolveDrop never reads it on that branch.
  for (const p of snapshot.waitlist) {
    add(p, { isWaitlisted: true, currentGroupId: null });
  }

  return subjects;
}

/**
 * What a completed drag should do. Every refusal is decided here rather than at
 * the mutation, so a blocked drop writes nothing at all — the panel shows the
 * dialog and the snapshot is left exactly as it was.
 *
 * Two of the three refusals key on the participation's own live subscription,
 * which is the same condition the database refuses on, so the dialog and the
 * RPC always agree. The third — promoting a never-paid waitlister — keys on the
 * product being subscription-shaped, not on it merely costing money: a one-off
 * paid camp or event is handled out of band and the admin's drag is trusted
 * there. It also asks for the payment marker, because demotion preserves it, so
 * a camper who genuinely paid and was later demoted promotes back plainly
 * rather than being trapped on the queue forever.
 */
export function resolveDrop(
  drop: DropData,
  subject: DragSubject,
  subscriptionShaped: boolean,
): DropOutcome {
  switch (drop.kind) {
    case "remove":
      // Removal CASCADEs family_subscriptions, so a live subscription would go
      // on billing a family with nothing left in the database to cancel it —
      // and `admin_remove_participation` refuses exactly this, whatever the
      // product type. Fronting it here means the admin reads why instead of
      // confirming a removal that is about to fail.
      if (subject.hasLiveSubscription) {
        return { kind: "blocked", reason: "removeSubscribed" };
      }
      // Otherwise legal from anywhere, including the waitlist (it just cancels
      // the queued family). Confirmed in its own dialog.
      return { kind: "remove" };

    case "waitlist":
      if (subject.isWaitlisted) return { kind: "none" };
      if (subject.hasLiveSubscription) {
        return { kind: "blocked", reason: "liveSubscription" };
      }
      return { kind: "demote" };

    case "move":
      if (subject.isWaitlisted) {
        if (subscriptionShaped && !subject.hasPaymentMarker) {
          return { kind: "blocked", reason: "unpaidPromote" };
        }
        return { kind: "promote", toGroupId: drop.toGroupId };
      }
      if (subject.currentGroupId === drop.toGroupId) return { kind: "none" };
      return { kind: "move", toGroupId: drop.toGroupId };
  }
}

// ---------------------------------------------------------------------------
// The subscription-shaped product
// ---------------------------------------------------------------------------

/**
 * A product whose active seat cannot exist without a monthly Stripe
 * subscription: a consumer club that charges. Every other shape is either
 * no-charge or paid once, out of band or through Checkout, and an admin action
 * on it leaves no recurring charge unaccounted for.
 *
 * Two panel decisions ask this one question, deliberately the same one
 * `admin_enroll_gamer` refuses on:
 *
 *  - whether the add-gamer affordance is offered at all (`canCompEnroll`), and
 *  - whether promoting a never-paid waitlister needs the dialog. A paid camp or
 *    event is *not* subscription-shaped: its payment is a one-off the admin
 *    settles out of band, so the drag is trusted and goes straight through.
 */
export function isSubscriptionShaped(
  productType: ProductType,
  billingMode: BillingMode,
): boolean {
  return productType === "consumer_club" && billingMode === "paid";
}

/**
 * Whether the panel offers its add-gamer affordance. Mirrors the enrollment
 * RPC's own refusal: the one shape an admin cannot comp is a seat that requires
 * a Stripe subscription nobody is creating. A free club comps exactly like a
 * free event or a camp does. The RPC refuses independently (defense in depth);
 * this only decides whether the button is worth offering.
 */
export function canCompEnroll(
  productType: ProductType,
  billingMode: BillingMode,
): boolean {
  return !isSubscriptionShaped(productType, billingMode);
}
