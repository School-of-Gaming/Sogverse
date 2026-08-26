import type { GameAccountExternalId } from "@/components/game-account";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { RobloxRenderMap } from "@/services/roblox";
import type {
  BillingMode,
  GroupParticipationDetail,
  ProductGroupsSnapshot,
  ProductType,
} from "@/types";

/**
 * The Groups panel's pure rules: how a drag/drop payload is read, what a drop
 * resolves to, whether the panel may comp-enroll onto this product, and which
 * game identity — if any — its chips are about.
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

/** Payload attached by ParticipantChip's useDraggable. */
export interface ChipDragData {
  participationId: string;
  firstName: string;
}

export function readChipDragData(value: unknown): ChipDragData | null {
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
 * `admin_enroll_participant` refuses on:
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

// ---------------------------------------------------------------------------
// Automatic placement into a single group
// ---------------------------------------------------------------------------

/**
 * The panel's answer to the question an admin who has just been handed a
 * product actually asks: *have I done everything needed for gamers to be seated
 * automatically — and if not, what is missing, or why does this product not
 * qualify?* Each state is one of those three answers.
 *
 *  - `single` — yes, nothing left to do: the seat is placed in this group
 *    without anyone touching it, and the group is named so the admin can see
 *    which one.
 *  - `noGroups` — the "what do I need to do" answer, and the only state whose
 *    fix is one click: automatic placement needs a group to place people into.
 *  - `manyGroups` — the "why not here" answer: which of several groups a child
 *    belongs in is a decision that stays a human's, so the seat waits.
 *  - `charged` — the "why not ever" answer: a seat on a product that charges is
 *    written by the Stripe webhook on its own transaction, and that writer
 *    places nobody.
 *
 * The three negative states are all "the seat waits in the inbox", and they are
 * kept apart because the *reason* is the whole of what the admin came for.
 */
export type AutoPlacement =
  | { kind: "single"; groupName: string }
  | { kind: "noGroups" }
  | { kind: "manyGroups" }
  | { kind: "charged" };

/**
 * Mirrors the enrollment writers' own predicate: a product that charges nothing
 * AND has exactly one group seats new participations in that group instead of
 * in the unassigned inbox.
 *
 * Whether the single group has a gedu assigned is deliberately not consulted —
 * an unstaffed group is still the only place the seat can go.
 *
 * The panel only *describes* this; the database is what does it. The two can
 * only disagree if one of them is changed alone, which is why the predicate is
 * written here in one place rather than inlined into the note that renders it.
 */
export function autoPlacementFor(
  billingMode: BillingMode,
  groups: readonly { name: string }[],
): AutoPlacement {
  if (billingMode !== "free" && billingMode !== "external_contract") {
    return { kind: "charged" };
  }
  const only = groups.length === 1 ? groups[0] : undefined;
  if (only) return { kind: "single", groupName: only.name };
  return groups.length === 0 ? { kind: "noGroups" } : { kind: "manyGroups" };
}

// ---------------------------------------------------------------------------
// The chip's game identity
// ---------------------------------------------------------------------------

/**
 * A chip's identity props, as the panel resolves them. Flat rather than an
 * object the chip destructures, because the chip's content is memoized against
 * dnd-kit re-rendering the wrapper on every pointer move, and a freshly built
 * object would defeat that comparison on every frame of a drag.
 *
 * `gameAvatarUrl` carries the row's three-meaning `avatarUrl` unchanged:
 * `undefined` lets the platform derive one from the name (which is what a
 * Minecraft row wants and the only platform that can), and an explicit `null`
 * is the drawn placeholder.
 */
export interface ChipGameIdentity {
  /** `null` for a topic about no single game account — the chip draws no row. */
  gamePlatform: GamePlatform | null;
  gameUsername: string | null;
  gameExternalId: GameAccountExternalId | null;
  gameAvatarUrl: string | null | undefined;
}

/** The topic is about no game account: every chip drops its identity row. */
const NO_GAME_IDENTITY: ChipGameIdentity = {
  gamePlatform: null,
  gameUsername: null,
  gameExternalId: null,
  gameAvatarUrl: null,
};

/**
 * Which identity one chip draws, decided by the product's platform rather than
 * by what the participation happens to carry. A child may hold both handles;
 * the chip shows the one the product is about, and nothing at all when the
 * product is about neither.
 *
 * Minecraft leaves `gameAvatarUrl` off, because its skin host is addressable by
 * username and the row can find the face itself. Roblox cannot — a render only
 * exists once something resolved it server-side by account id — so this hands
 * over whatever the batch found, and the placeholder in every other case: an
 * unverified handle has no id to ask about, and resolving the *name* would draw
 * whichever stranger owns it beside a child's.
 */
export function chipGameIdentity(
  participation: GroupParticipationDetail,
  platform: GamePlatform | null,
  renders: RobloxRenderMap | undefined,
): ChipGameIdentity {
  if (platform === null) return NO_GAME_IDENTITY;

  if (platform === "minecraft") {
    return {
      gamePlatform: "minecraft",
      gameUsername: participation.participant_minecraft_username,
      gameExternalId: participation.participant_minecraft_uuid,
      // Omitted on purpose — see the type's note.
      gameAvatarUrl: undefined,
    };
  }

  const robloxUserId = participation.participant_roblox_user_id;
  return {
    gamePlatform: "roblox",
    gameUsername: participation.participant_roblox_username,
    gameExternalId: robloxUserId,
    gameAvatarUrl:
      robloxUserId === null ? null : (renders?.[String(robloxUserId)] ?? null),
  };
}

/**
 * Every Roblox account id on the panel, in one pass over the snapshot — the
 * list the single batched lookup is made from.
 *
 * **One request for the whole page, never one per chip.** The upstream cost is
 * per request against a per-IP budget the entire serverless fleet shares, and
 * this panel is the fifty-plus-chip surface that would drain it. Ids repeat
 * freely here (siblings may share one game account); the hook normalizes the
 * list into its cache key, so a duplicate costs nothing.
 *
 * Empty for any other platform, which disables the query outright — a Minecraft
 * or topic-less product asks Roblox nothing.
 */
export function robloxIdsFrom(
  snapshot: ProductGroupsSnapshot | undefined,
  platform: GamePlatform | null,
): number[] {
  if (platform !== "roblox" || !snapshot) return [];

  const ids: number[] = [];
  const add = (p: GroupParticipationDetail) => {
    if (p.participant_roblox_user_id !== null) {
      ids.push(p.participant_roblox_user_id);
    }
  };

  for (const group of snapshot.groups) group.participations.forEach(add);
  snapshot.unassigned.forEach(add);
  snapshot.waitlist.forEach(add);

  return ids;
}
