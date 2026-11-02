import type {
  AppSupabaseClient,
  DeliveryMode,
  Json,
  ParticipationStatus,
  ParticipationSubscriptionState,
  ProductTopic,
  ProductType,
  ProductTranslation,
  PurchaseShape,
  SessionAudience,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { gamersAttendSite } from "@/lib/products/delivery-mode";
import type { QueryData } from "@supabase/supabase-js";
import {
  parseJsonResponse,
  readApiError,
  readErrorMessage,
} from "@/lib/api/json-response";
import {
  createParticipationResponse,
  joinWaitlistResponse,
  leaveWaitlistResponse,
  myPlannedSessions,
  myWaitlistPositions,
  waitlistPositionResult,
  type CreateParticipationResponse,
  type JoinWaitlistResponse,
  type LeaveWaitlistResponse,
} from "./participations.contracts";
import {
  seatOfferRespondResponse,
  seatOfferSweepResponse,
  type SeatOfferRespondResponse,
  type SeatOfferSweepResponse,
} from "./seat-offer.contracts";
import type { PlannedSession } from "@/lib/planned-sessions";
import {
  productVoiceRoom,
  type ProductVoiceRoom,
} from "@/lib/products/voice-room";

/**
 * A site's name as it comes off the row — the canonical `name` plus the
 * `locale -> name` override map — resolved to the viewer's locale at render
 * time by the shared location-name helper.
 *
 * Kept raw for the same reason the product translations are: resolving here
 * would put the viewer's locale in the query cache key, so switching locale
 * would refetch a row whose only locale-dependent part is a string lookup.
 */
export interface ProductSiteName {
  name: string;
  name_i18n: Json | null;
}

/**
 * Row shape returned by `getMyUpcomingSessions()`. The family dashboards roll
 * one of these up into a single enrollment card, so we need the seat's planned
 * sessions (what is next, and when the prep window closes), the per-product
 * slot list and date bounds (the schedule sentence and whether the run has
 * ended) and the timezone those are stated in.
 *
 * Filtered to active participations (assigned and unassigned alike);
 * waitlisted rows are excluded since they have no placement. `groupId` is
 * null for unassigned rows — the adapter turns those into plain seat cards
 * whose Join stays locked and which open no page, so a fresh purchase shows
 * up before an admin has placed the gamer in a group.
 */
export interface MyUpcomingSessionRow {
  /**
   * The `participations.id` this row expands from. Carried through to the
   * cards so the payment-problem badge can name the exact subscription it is
   * complaining about when it opens the billing portal — a parent can own
   * several Stripe customers, and a portal session covers only one.
   */
  participationId: string;
  /**
   * Whoever holds the seat. A child on a parent's dashboard, or the parent
   * themselves on a seat they bought for themselves — the read is keyed on the
   * participant column, so a self seat lands here with no special case.
   */
  participant: {
    id: string;
    firstName: string;
  };
  product: {
    id: string;
    type: ProductType;
    /**
     * The product's topic. Carried so a family surface can ask whether the
     * topic has a "Before the first session" guide to offer — the enrolment
     * card's prep affordance is the only reader today.
     */
    topic: ProductTopic;
    timezone: string;
    /**
     * Inclusive start date in the product's local calendar (YYYY-MM-DD). Read
     * by the schedule sentence, which anchors a dated run's slots to it.
     */
    startDate: string | null;
    /**
     * Inclusive end date in the product's local calendar (YYYY-MM-DD), null
     * for ongoing clubs. Read by the schedule sentence and by whether the run
     * has ended; the plan below already stops at it.
     */
    endDate: string | null;
    /**
     * How the product is delivered. The dashboard asks `hasVoiceRoom` of it,
     * together with `groupId`, to gate whether the Join Voice link gets a real
     * destination — an in-person product has no voice room, so the button
     * stays inert.
     */
    deliveryMode: DeliveryMode;
    /**
     * The site an in-person or hybrid product runs at, `null` on an online one.
     *
     * Gated on `gamersAttendSite` rather than on whether the join found a row:
     * an online municipality club carries a `location_id` too (the municipality
     * that commissioned it), and that is an administrative fact, not a
     * building anybody travels to. Answering "where is this happening" with a
     * municipality name on a card whose sessions are in a voice room would be
     * worse than saying nothing. Every in-person product has a location by
     * schema CHECK, so `null` here means "no building involved" rather than
     * "not loaded".
     */
    site: ProductSiteName | null;
    /**
     * How the product's sessions are joined — the Sogverse room, a meeting
     * elsewhere, or written instructions per locale. Always `sogverse` on an
     * in-person product.
     */
    voiceRoom: ProductVoiceRoom;
    /**
     * Raw translation rows. The dashboard resolves to the viewer's UI locale
     * at render time so the cache key doesn't need to include locale (and a
     * locale switch doesn't refetch).
     */
    translations: ProductTranslation[];
  };
  /**
   * The `product_groups.id` the gamer is placed in for this product, or
   * `null` for unassigned participations (redesign §4.10: no voice access).
   * The dashboard treats null as "no voice destination" — the button stays
   * inert exactly like an in-person product.
   */
  groupId: string | null;
  /**
   * When this seat was taken on the product — the row's own creation stamp.
   *
   * Read for one thing: the family dashboards bound the "Before the first
   * session" guide to this family's first sessions, and that needs to know when
   * the run began *for them* rather than when the product's did. A club has run
   * since February; a family who joined it last week has their first session
   * ahead of them.
   */
  signedUpAt: Date;
  /**
   * When this seat entered its group, `null` while nobody has placed it.
   *
   * The other half of the same question, and the half that matters to a family
   * promoted off the waitlist: they signed up weeks before the seat was theirs,
   * so the prep window counts from the placement rather than from the day they
   * joined the queue.
   */
  groupJoinedAt: Date | null;
  /**
   * The product's weekly slots, for the schedule sentence alone: which
   * sessions are planned comes from `plan`, never from walking these.
   */
  slots: Array<{
    weekday: number;
    startTime: string;
    durationMinutes: number;
  }>;
  /**
   * The participation's club subscription is `past_due` (a card declined or
   * expired). Drives the payment-problem badge on the session cards. Always
   * `false` for non-subscription products and healthy subs. Sourced from
   * `get_my_participation_subscription_states`, not the row itself — see
   * `getMyUpcomingSessions`.
   */
  paymentProblem: boolean;
  /**
   * When the parent has cancelled this club's subscription (Stripe
   * `cancel_at_period_end` → our `canceling` status), the instant their paid
   * access ends (`current_period_end`). `null` for healthy/past_due subs and
   * non-subscription products. Drives two things: the card reads only the
   * planned sessions starting on or before this instant (both audiences),
   * and the parent dashboard shows an "access until {date}" badge. Sourced
   * from `get_my_participation_subscription_states` — see
   * `getMyUpcomingSessions`.
   */
  subscriptionEndsAt: Date | null;
  /**
   * The seat's planned sessions, soonest first, each flagged when the seat's
   * group cancelled it (never on an unplaced seat). The span runs from the day
   * before the earlier of today and the day the seat became the family's, to
   * the plan's horizon raised to a cancelled membership's paid-through date —
   * enough for the next session that runs, every session a winding-down
   * membership still covers, and the prep window. Sourced from
   * `get_my_planned_sessions` — see `getMyUpcomingSessions`.
   */
  plan: readonly PlannedSession[];
}

/**
 * Row shape returned by `getMyWaitlistEntries()` — one waitlisted
 * participation, with the live position that makes it a card. The counterpart
 * to `MyUpcomingSessionRow`: that one covers `status='active'` rows, which have
 * a placement and a schedule; this one covers `status='waitlisted'` rows, which
 * have neither and so never appear in the sessions list.
 *
 * **It carries roughly the sessions read's product shell**, because a waitlist
 * place is now a card in the same list as every other enrollment rather than a
 * band of its own: it wears the same type eyebrow and states the same schedule
 * in words, so a family reading "you are #3 for this" can see what "this" would
 * cost them on a Tuesday. That needs the product type, the slots, the source
 * zone the slots are wall-clock times in, and the date bounds the schedule
 * formatter reads for a dated run.
 *
 * What it still does not carry is anything that only a *seat* produces: no
 * group, no subscription state, and no site. A waitlisted family has no
 * placement to derive a next session from and no billing relationship to be in
 * trouble with, and their card's footer is the queue sentence, so nothing
 * downstream has a use for them. The product's own id is absent for the same
 * reason it always was — a waitlisted card links nowhere.
 */
export interface MyWaitlistRow {
  /** The `participations.id`, and what the leave action names. */
  participationId: string;
  /** Whoever holds the queued spot — a child, or the parent themselves. */
  participant: {
    id: string;
    firstName: string;
  };
  product: {
    /** The type noun the card's eyebrow reads. */
    type: ProductType;
    /**
     * The product's topic. A waitlisted card never draws the prep affordance —
     * there is no seat behind it and nothing to get ready for — but the summary
     * this row becomes states the product's topic either way, exactly as it
     * states whether the product has a room.
     */
    topic: ProductTopic;
    /** The zone the slot times below are wall-clock times **in**. */
    timezone: string;
    /**
     * Inclusive start date in the product's local calendar (YYYY-MM-DD), or
     * null on an open-ended club. The schedule formatter anchors a camp's slots
     * to their first in-range date from this, so a dated run with no start date
     * renders as "no schedule set yet" rather than as a wrong one.
     */
    startDate: string | null;
    /** Inclusive end date in the product's local calendar, null when open-ended. */
    endDate: string | null;
    /**
     * How the product is delivered. No Join is ever drawn on a waitlisted
     * card — there is no seat behind it — but the summary this row becomes says
     * whether the product *has* a room, and inventing "no room" for every
     * waitlist place would be stating something untrue about the product.
     */
    deliveryMode: DeliveryMode;
    /**
     * How the product's sessions are joined. Nothing is joined from a
     * waitlisted card; it is carried for the same reason `deliveryMode` is.
     */
    voiceRoom: ProductVoiceRoom;
    /**
     * Raw translation rows, resolved to the viewer's UI locale at render time —
     * same arrangement as the sessions read, so the cache key stays locale-free
     * and switching locale doesn't refetch.
     */
    translations: ProductTranslation[];
  };
  /** The product's weekly slots, for the schedule sentence. */
  slots: Array<{
    weekday: number;
    startTime: string;
    durationMinutes: number;
  }>;
  /**
   * 1-based position in line, recomputed live by the RPC rather than read from
   * the stamped-at-join value, so it shrinks as people ahead leave.
   */
  position: number;
  /**
   * When a seat was offered to this family, or null if none ever has been.
   *
   * It comes off the `participations` row rather than the position RPC, and
   * deliberately: the RPC is `SECURITY DEFINER` and counts past the caller's
   * RLS, so everything it returns is data the caller may not be entitled to —
   * its comment bounds that surface to an id and an integer. This value is the
   * caller's own row, readable under their own policies, so it belongs in the
   * select beside every other field on this shape.
   *
   * Whether the offer is still LIVE is derived from it, against
   * `SEAT_OFFER_WINDOW_DAYS` — the same arithmetic the database does, and the
   * reason the deadline can be stated without a second round trip. An offer
   * whose window has closed reads as an ordinary queue place again: the row is
   * still waitlisted, and an admin may offer it afresh.
   */
  seatOfferSentAt: string | null;
}

/**
 * Builds the admin "assigned products" query: every participation for the
 * given gamers, across all statuses, joined with product chrome (name + the
 * type→admin-route link) and the assigned group name.
 *
 * `products!inner` mirrors the schema — `participations.product_id` is
 * NOT NULL with ON DELETE CASCADE, so a participation can never outlive its
 * product. The inner join makes that guarantee explicit and lets the inferred
 * row type treat `product` as non-null. `group` stays a plain (nullable) embed
 * because `group_id` is nullable — waitlisted/unassigned rows have no cohort.
 *
 * Defined standalone so the row type can be inferred from it via `QueryData`,
 * with no hand-written shape and no cast (the select string and the type stay
 * in lockstep — drift becomes a compile error).
 */
function buildGamerParticipationsQuery(
  supabase: AppSupabaseClient,
  gamerIds: string[],
) {
  return supabase
    .from("participations")
    .select(
      `
        id, participant_id, status, signed_up_at,
        product:products!inner(
          id, product_type,
          product_translations(*)
        ),
        group:product_groups(name)
      `,
    )
    .in("participant_id", gamerIds)
    .order("participant_id", { ascending: true })
    .order("signed_up_at", { ascending: false });
}

/**
 * Row shape returned by `getParticipationsForGamers()`, inferred from
 * `buildGamerParticipationsQuery`. Powers the admin user-detail page's
 * "Assigned products" surface, where an admin views every product a gamer (or
 * a parent's gamers) is signed up to — across all statuses (active /
 * waitlisted / completed), so support can see exactly what state
 * each gamer is in. Reachable only for admins via the
 * `admin_full_access_participations` RLS policy.
 */
export type AdminGamerParticipationRow = QueryData<
  ReturnType<typeof buildGamerParticipationsQuery>
>[number];

/**
 * Per-product participation counts for the browse + detail surfaces.
 */
export interface ParticipationCounts {
  productId: string;
  activeCount: number;
  waitlistCount: number;
  /**
   * Per-gamer signup state for the logged-in customer's children on this
   * product, keyed by `participant_id`. A gamer with no row is simply absent from
   * the map. The detail page's signup form uses this to disable each
   * already-signed-up child in the picker and label them in place.
   *
   * A parent part-way through Stripe Checkout has no row at all, so their
   * gamer stays selectable — which is what we want: an abandoned checkout must
   * leave the child free to try again.
   */
  myGamerStates: Record<string, "active" | "waitlisted">;
}

export type CreateParticipationInput = {
  productId: string;
  participantId: string;
  purchaseShape: PurchaseShape;
  currency: SupportedCurrency;
  /**
   * The consent documents the parent ticked, as slugs — empty on the
   * overwhelming majority of products, which require none.
   *
   * Required here although the wire field is optional, and the asymmetry is the
   * point: the wire has to tolerate an omission so the database gets to give
   * the authoritative refusal, while a *caller* stating the answer explicitly
   * is what keeps a new signup surface from forgetting the question exists.
   */
  consentedDocuments: string[];
  /**
   * The answer to the product's School of Gaming mailing box, or `null` when
   * the product does not ask. Required for the same reason the documents are:
   * a caller has to state it.
   */
  schoolOfGamingMarketingOptIn: boolean | null;
};

/**
 * What a Checkout Session's booking says about the purchase. `seat_gone` is a
 * settled booking whose seat has since been cancelled: an old link, revisited.
 */
export type CheckoutConfirmation =
  | { state: "settled"; confirmation: ParticipationConfirmation }
  | { state: "duplicate" }
  | { state: "pending" }
  | { state: "seat_gone" };

/**
 * The single participation behind a just-completed signup, for the purchase
 * confirmation page. The page joins this to the full product detail (via
 * `useProductDetail`) for pricing + schedule, so this shape carries only what
 * the product row can't: which product, who it's for, and the row's status.
 */
export interface ParticipationConfirmation {
  /**
   * The row's own id. Carried because the page can arrive holding a Stripe
   * Checkout Session id instead, and the waitlist-position read needs the
   * participation.
   */
  participationId: string;
  status: ParticipationStatus;
  productId: string;
  /**
   * The payer — the profile the confirmation email is always sent to. The page
   * names that address only when the payer is the one reading.
   */
  customerId: string;
  /** The participant's first name — a child's, or the buyer's own on a self seat. */
  participantName: string;
  /**
   * Whether the seat is the buyer's own, i.e. `participant_id = customer_id`.
   *
   * Read from the **row**, not from the viewer. That is the structural
   * definition of a self seat and it answers identically for both readers RLS
   * lets in here — a parent reading their own purchase, and a gamer who somehow
   * has the `?p=` link to their own row. Comparing the participant against
   * `auth.uid()` would call the second of those a self seat and put the whole
   * confirmation into the second person about a child's own signup.
   */
  isSelfSeat: boolean;
}

export type {
  CreateParticipationResponse,
  JoinWaitlistResponse,
  LeaveWaitlistResponse,
} from "./participations.contracts";

export type JoinWaitlistInput = {
  productId: string;
  participantId: string;
  /** Ticked consent document slugs — see `CreateParticipationInput`. A queue
   *  place is held to the same enrolment conditions as a seat. */
  consentedDocuments: string[];
  /** The School of Gaming mailing answer — see `CreateParticipationInput`. */
  schoolOfGamingMarketingOptIn: boolean | null;
};

/**
 * A booking's JSON body with an unasked School of Gaming box left off the wire
 * rather than sent as null: absent is the one spelling the routes read as "not
 * asked".
 */
function bookingBody<T extends { schoolOfGamingMarketingOptIn: boolean | null }>(
  input: T,
): string {
  const { schoolOfGamingMarketingOptIn, ...rest } = input;
  return JSON.stringify(
    schoolOfGamingMarketingOptIn === null
      ? rest
      : { ...rest, schoolOfGamingMarketingOptIn },
  );
}

export type LeaveWaitlistInput = {
  participationId: string;
};

/**
 * A parent's answer to a seat offer, given in My SOG. `accept: false` is a
 * decline, which deletes the queue place — the same act the emailed "No, thank
 * you" performs, and the reason the card puts a confirmation in front of it.
 */
export type InAppSeatOfferResponseInput = {
  participationId: string;
  accept: boolean;
};

export class ParticipationsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Admin-only: every participation belonging to the given gamers, across all
   * statuses, joined with product chrome (for the name + the type→admin-route
   * link) and the assigned group name. Returns `[]` for empty input.
   *
   * Only reachable under the `admin_full_access_participations` RLS policy —
   * this is wired exclusively to the admin user-detail "Assigned products"
   * surface. Ordered by gamer then newest signup so the page can group per
   * child with a stable within-child order.
   */
  async getParticipationsForGamers(
    gamerIds: string[],
  ): Promise<AdminGamerParticipationRow[]> {
    if (gamerIds.length === 0) return [];

    const { data, error } = await buildGamerParticipationsQuery(
      this.supabase,
      gamerIds,
    );

    if (error) throw error;

    return data;
  }

  /**
   * The logged-in user's *active* participations, joined with the bits the
   * family dashboards need to roll one up into an enrollment card: per-product
   * weekly slots, start/end-date bounds and timezone.
   *
   * Filtered to `status='active'` only — waitlisted rows aren't scheduled
   * yet, but BOTH assigned (`group_id IS NOT NULL`) and unassigned
   * (`group_id IS NULL`) rows are returned. The schedule lives on the
   * *product* (`schedule_slots`), not the group, so an unassigned gamer's
   * sessions are identical to an assigned one's — the only difference is
   * there's no voice room to join yet. The adapter keys off `group_id`
   * (null → a plain seat card whose Join stays locked and which opens no page) so
   * a parent sees their purchase reflected immediately instead of an empty
   * section while an admin places the gamer in a group.
   *
   * Each row carries its planned sessions as the database expands them; what
   * is next is the client-side roll-up's to decide, because it re-derives on
   * the shared clock. This method hands back the raw rows with everything the
   * roll-up needs in one round trip.
   *
   * Audience selects which column the row is keyed off:
   *   - 'customer' → `customer_id = auth.uid()`: every participation the
   *     parent paid for, across all their kids.
   *   - 'gamer' → `participant_id = auth.uid()`: only the rows belonging to the
   *     logged-in gamer.
   * The matching RLS policy gates the other audience out either way; the
   * filter is here so the network call doesn't drag rows the policy would
   * just reject.
   */
  async getMyUpcomingSessions(
    audience: SessionAudience,
  ): Promise<MyUpcomingSessionRow[]> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return [];

    const audienceColumn =
      audience === "customer" ? "customer_id" : "participant_id";

    // Fetch the sessions and the subscription-state signals concurrently. The
    // signals come from `get_my_participation_subscription_states`
    // rather than a `family_subscriptions` embed because gamers have no SELECT
    // access to that table — the RPC self-scopes via auth.uid() and returns
    // only participation id + status + period end (no money), so it works
    // identically for both audiences. One RPC carries both the past_due flag
    // and the canceling access-until date; the client derives each below.
    const [
      { data, error },
      { data: subRows, error: subError },
      { data: planRows, error: planError },
    ] = await Promise.all([
      buildMyUpcomingSessionsQuery(this.supabase, audienceColumn, userId),
      this.supabase.rpc("get_my_participation_subscription_states"),
      // The plan comes from its own self-scoped read: the database expands it,
      // and the cancellations folded into it are a table no client role can
      // read, so the select above cannot embed it.
      this.supabase.rpc("get_my_planned_sessions"),
    ]);

    if (error) throw error;
    // Not secondary like the badges: without the plan no card can name a
    // session, and an empty one would tell a family nothing is ahead of them.
    if (planError) throw planError;

    // The read answers for every seat the caller is party to, in either role;
    // the rows above are one audience's, so only their plans are picked up.
    const planByParticipation = new Map<string, PlannedSession[]>();
    for (const { participationId, session } of myPlannedSessions.parse(
      planRows,
    )) {
      const plan = planByParticipation.get(participationId);
      if (plan) plan.push(session);
      else planByParticipation.set(participationId, [session]);
    }

    // The badges are a secondary signal — if the state query fails, degrade to
    // "no problem / not canceling" rather than breaking the whole sessions list.
    if (subError) {
      console.error(
        "[getMyUpcomingSessions] subscription-state signals failed:",
        subError,
      );
    }
    // Past_due → payment-problem badge. Canceling → the instant paid access
    // ends, used both to clamp the session list and to render the
    // access-until badge. `current_period_end` is loosened to nullable in the
    // alias (the generator over-promises non-null); a canceling row missing it
    // simply yields no clamp + no badge.
    const states = (subRows ?? []) as ParticipationSubscriptionState[];
    const problemIds = new Set(
      states.filter((s) => s.status === "past_due").map((s) => s.participation_id),
    );
    const cancelEnds = new Map<string, Date>();
    for (const s of states) {
      if (s.status === "canceling" && s.current_period_end !== null) {
        cancelEnds.set(s.participation_id, new Date(s.current_period_end));
      }
    }

    return data.map((row) =>
      toMyUpcomingSessionRow(
        row,
        problemIds.has(row.id),
        cancelEnds.get(row.id) ?? null,
        planByParticipation.get(row.id) ?? [],
      ),
    );
  }

  /**
   * The logged-in user's *waitlisted* participations, with each one's live
   * position — the waitlist band on both dashboards. The complement of
   * `getMyUpcomingSessions`, which filters to `status='active'`: between them
   * the two reads cover every row a family holds on a product, and neither
   * shows a row the other does.
   *
   * Audience selects the owner column exactly as it does for the sessions read
   * ('customer' → every child's spot the parent joined; 'gamer' → only the
   * logged-in child's), with the matching RLS policy gating the other one out
   * regardless.
   *
   * Two reads, not N+1. The rows come back through the caller's own RLS; the
   * positions come from `get_my_waitlist_positions`, which self-scopes on
   * `auth.uid()` and is SECURITY DEFINER because a position counts rows the
   * caller may not see. Calling the single-row `get_waitlist_position` per card
   * would issue N round trips answered at N different instants — an admin
   * promotion landing mid-flight nulls one card's position while its
   * neighbours keep a staler one.
   *
   * A row with no position in the map is DROPPED rather than rendered. The two
   * reads run concurrently, so a promotion landing between them leaves a row
   * that the select still calls waitlisted and the RPC no longer ranks; that
   * family now holds a seat, and showing them a waitlist card — at a
   * fabricated position, since `position` is required — would be worse than
   * showing nothing. Nothing here schedules a retry, so the row simply stays
   * absent from the band until some independent refetch — a remount, or React
   * Query's refetch-on-window-focus once the cached data has gone stale — runs
   * both reads again. By then both agree the row was promoted, so it never
   * comes back to the band: it appears in the sessions list instead.
   */
  async getMyWaitlistEntries(
    audience: SessionAudience,
  ): Promise<MyWaitlistRow[]> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return [];

    const audienceColumn =
      audience === "customer" ? "customer_id" : "participant_id";

    const [{ data, error }, { data: positionRows, error: positionError }] =
      await Promise.all([
        buildMyWaitlistQuery(this.supabase, audienceColumn, userId),
        this.supabase.rpc("get_my_waitlist_positions"),
      ]);

    if (error) throw error;
    // Unlike the sessions read's badge signals, this one can't degrade: the
    // position IS the card. Failing loudly beats a band of positionless cards.
    if (positionError) throw positionError;

    // No `?? []` fallback: throwing on `positionError` above is what makes the
    // rows non-null here, unlike the sessions read where a failed signal query
    // degrades instead of throwing.
    const positions = new Map(
      myWaitlistPositions
        .parse(positionRows)
        .map((row) => [row.participation_id, row.waitlist_position]),
    );

    return data.flatMap((row) => {
      const position = positions.get(row.id);
      return position === undefined ? [] : [toMyWaitlistRow(row, position)];
    });
  }

  /**
   * Aggregate counts feeding the seat-left pill and the "already signed up"
   * detection for the listed products.
   *
   * Reads `product_seat_counts` (public-readable, RLS-permissive) for
   * the live counts; `myGamerStates` is derived per-customer by looking
   * up `participations` rows for each of their gamers on each product.
   */
  async getParticipationCounts(
    productIds: string[],
  ): Promise<ParticipationCounts[]> {
    if (productIds.length === 0) return [];

    const { data: countsData, error: countsErr } = await this.supabase
      .from("product_seat_counts")
      .select("product_id, active_count, waitlist_count")
      .in("product_id", productIds);
    if (countsErr) throw countsErr;

    const countsByProduct = new Map<string, ParticipationCounts>();
    for (const id of productIds) {
      const row = countsData.find((r) => r.product_id === id);
      countsByProduct.set(id, {
        productId: id,
        activeCount: row?.active_count ?? 0,
        waitlistCount: row?.waitlist_count ?? 0,
        myGamerStates: {},
      });
    }

    // Per-gamer signup state on each of the listed products.
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (userId) {
      const { data: mine } = await this.supabase
        .from("participations")
        .select("product_id, participant_id, status")
        .eq("customer_id", userId)
        .in("product_id", productIds);
      if (mine) {
        for (const row of mine) {
          const existing = countsByProduct.get(row.product_id);
          if (!existing) continue;
          const next = mergeGamerSignupState(
            existing.myGamerStates[row.participant_id],
            row.status,
          );
          if (next) existing.myGamerStates[row.participant_id] = next;
        }
      }
    }

    return [...countsByProduct.values()];
  }

  /**
   * The single participation behind a just-completed signup, for the purchase
   * confirmation page (`/shop/confirmation?p=<id>`). Gated entirely by RLS:
   * `customer_select_own_participations` (`customer_id = auth.uid()`) is the
   * intended path — a parent reading their own purchase. Note RLS *also* lets a
   * gamer read their OWN row (`gamer_select_own_participations`,
   * `participant_id = auth.uid()`), so a logged-in child who somehow has the `?p=`
   * link can load their own confirmation. That's not the intended flow but it's
   * harmless: own data only (no IDOR), and the product detail is public anyway.
   * Returns null when the id matches nothing the caller may see (a stale or
   * forged `?p=` link), which the page renders as a friendly "couldn't find
   * that order" fallback.
   *
   * Status is returned but NOT gated on: the row exists before the page is ever
   * linked to (a free or municipality signup activates in the same request, a
   * waitlist join likewise), so whatever status it carries is the one to show.
   */
  async getConfirmation(
    participationId: string,
  ): Promise<ParticipationConfirmation | null> {
    const { data, error } = await this.supabase
      .from("participations")
      .select(
        `
          id, status, product_id, participant_id, customer_id,
          participant:profiles!participations_participant_id_fkey(first_name)
        `,
      )
      .eq("id", participationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      participationId: data.id,
      status: data.status,
      productId: data.product_id,
      customerId: data.customer_id,
      participantName: data.participant.first_name,
      isSelfSeat: data.participant_id === data.customer_id,
    };
  }

  /**
   * The read for a paid signup, which arrives holding a Stripe Checkout Session
   * id instead of a participation id — no seat existed when the `success_url` was
   * built. The booking records the Session and the seat records the booking.
   *
   * `bookings` is readable only by the customer who booked, so a session id
   * belonging to someone else reads as null rather than as anyone's order. Null
   * also covers a legacy-checkout-session Session the webhook has not reached yet,
   * which has no booking until then; the page falls back to Stripe for those.
   */
  async getConfirmationByCheckoutSession(
    checkoutSessionId: string,
  ): Promise<CheckoutConfirmation | null> {
    const { data, error } = await this.supabase
      .from("bookings")
      .select(
        `
          status, participant_id, customer_id,
          participant:profiles!bookings_participant_id_fkey(first_name),
          seat:participations(id, status, product_id)
        `,
      )
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    if (data.status !== "settled") return { state: data.status };
    if (!data.seat) return { state: "seat_gone" };

    return {
      state: "settled",
      confirmation: {
        participationId: data.seat.id,
        status: data.seat.status,
        productId: data.seat.product_id,
        customerId: data.customer_id,
        participantName: data.participant.first_name,
        isSelfSeat: data.participant_id === data.customer_id,
      },
    };
  }

  /**
   * legacy-checkout-session: does this participant — a child, or the buyer
   * themselves on a for-parents product — already hold a spot on this product?
   * Asked by the paid confirmation page when a Session from before bookings has
   * no booking yet, to tell the two reasons for that apart: the webhook has not landed yet (wait), or
   * the payment was refused as a duplicate because the seat was already taken
   * (there will never be a row for this session, so waiting is a dead end).
   *
   * Mirrors the status set the confirmation RPC conflicts on, so the page's
   * answer and the database's decision cannot drift. RLS-scoped like every read
   * here — the caller has already been checked to be the session's purchaser, so
   * the row is theirs to see.
   */
  async hasSeatOnProduct(
    productId: string,
    participantId: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("participations")
      .select("id")
      .eq("product_id", productId)
      .eq("participant_id", participantId)
      .in("status", ["active", "waitlisted", "completed"])
      .maybeSingle();

    if (error) throw error;
    return data !== null;
  }

  /**
   * The caller's 1-based position on a product's waitlist for one of their own
   * waitlisted participations — the "you're #N" read for the post-join summary
   * (and, later, the parent/gamer dashboards). Recomputed live from
   * (waitlisted_at, id), so it shrinks as people ahead leave — unlike the
   * stamped-at-join value join_waitlist returns.
   *
   * Backed by the get_waitlist_position RPC: SECURITY DEFINER so it can count
   * past the caller's RLS, but owner-authorized (customer_id OR participant_id) and
   * returns ONLY the integer. Null when the row is unknown, not waitlisted, or
   * not the caller's — the contract schema makes that nullability explicit
   * (codegen types the RPC as a bare number). Uses the injected RLS-scoped
   * client, like the other read methods.
   */
  async getWaitlistPosition(participationId: string): Promise<number | null> {
    const { data, error } = await this.supabase.rpc("get_waitlist_position", {
      p_participation_id: participationId,
    });
    if (error) throw error;
    return waitlistPositionResult.parse(data);
  }

  // ------------------------------------------------------------------
  // Write methods — fetch() to API routes. The injected supabase client
  // is intentionally unused here (per the service-layer pattern in
  // CLAUDE.md). We hit our own endpoints because they need server-side
  // Stripe + admin-client work.
  // ------------------------------------------------------------------

  async createParticipation(
    input: CreateParticipationInput,
  ): Promise<CreateParticipationResponse> {
    const response = await fetch("/api/checkout/products/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bookingBody(input),
    });
    if (!response.ok) {
      // An `ApiError` rather than a bare `Error`: the panel branches on the
      // consent-refusal code this route can attach, and only this shape carries
      // it. The message is unchanged either way.
      throw await readApiError(response, "Failed to start checkout");
    }
    return parseJsonResponse(response, createParticipationResponse);
  }

  async joinWaitlist(input: JoinWaitlistInput): Promise<JoinWaitlistResponse> {
    const response = await fetch("/api/participations/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bookingBody(input),
    });
    if (!response.ok) {
      // Same shape as the signup door above, and for the same reason: this
      // route can refuse a stale consent list too.
      throw await readApiError(response, "Failed to join waitlist");
    }
    return parseJsonResponse(response, joinWaitlistResponse);
  }

  /**
   * Give up a waitlist spot — the same collection the join POSTs to, addressed
   * with DELETE. Parent-only, and enforced in the database rather than here:
   * the route is role-gated to `customer` and the RPC underneath keys on
   * `customer_id = auth.uid()`, so a gamer's call would be refused even if the
   * UI ever offered them the button.
   */
  async leaveWaitlist(
    input: LeaveWaitlistInput,
  ): Promise<LeaveWaitlistResponse> {
    const response = await fetch("/api/participations/waitlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to leave waitlist"),
      );
    }
    return parseJsonResponse(response, leaveWaitlistResponse);
  }

  /**
   * Answer a seat offer from inside My SOG — the same yes-or-no the emailed
   * links carry, given by a parent who is already signed in.
   *
   * The body names only the row: the session is the credential here, and the
   * route proves the participation belongs to the caller under their own RLS
   * before it reads the stored stamp. There is no token to send and none to
   * check.
   *
   * **Every outcome is a 200**, including the two the card has to draw as a
   * lapsed offer rather than as a failure: `expired` is the window closing
   * between the paint and the press, and `invalid` is the offer having already
   * been answered or superseded. A rejection from this method therefore means
   * the request itself did not land, which is the only case the parent should
   * be asked to try again.
   */
  async respondToSeatOffer(
    input: InAppSeatOfferResponseInput,
  ): Promise<SeatOfferRespondResponse> {
    const response = await fetch("/api/participations/seat-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to answer the seat offer"),
      );
    }
    return parseJsonResponse(response, seatOfferRespondResponse);
  }

  /**
   * Ask the server to notice any seat offers whose five-day window has closed,
   * and tell staff about them.
   *
   * **This is the whole of the feature's clock, and it is an observation rather
   * than a schedule.** Nothing in a database notices time passing; instead an
   * admin arriving at a surface that would care about a lapsed offer says so,
   * and the route claims and mails whatever it finds. The claim is exactly-once
   * inside one statement, so several admins landing together produce one mail
   * between them.
   *
   * Cheap and usually empty — the common answer is `{ claimed: 0 }`, which is
   * why callers may fire it on mount without thinking about it.
   */
  async sweepSeatOffers(): Promise<SeatOfferSweepResponse> {
    const response = await fetch("/api/admin/seat-offers/sweep", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to sweep seat offers"),
      );
    }
    return parseJsonResponse(response, seatOfferSweepResponse);
  }
}

// ---------------------------------------------------------------------------
// Adapters between the raw select shape and the row shape exposed to UI.
// ---------------------------------------------------------------------------

/**
 * Builds the upcoming-sessions query for one audience. Both embeds use
 * `!inner` (`product_id` and `participant_id` are NOT-NULL FKs, so an inner join
 * drops nothing), which lets the inferred row treat `product` and `participant` as
 * non-null — no post-filter, no `!` assertions in the mapper. Standalone so
 * the row type can be inferred via `QueryData` with no hand-written shape and
 * no cast (select string and type stay in lockstep — drift is a compile error).
 */
function buildMyUpcomingSessionsQuery(
  supabase: AppSupabaseClient,
  audienceColumn: "customer_id" | "participant_id",
  userId: string,
) {
  return supabase
    .from("participations")
    .select(
      `
        id,
        participant_id,
        group_id,
        signed_up_at,
        group_joined_at,
        product:products!inner(
          id, product_type, topic, timezone, start_date, end_date, delivery_mode,
          voice_room_mode, external_voice_url,
          product_translations(*),
          schedule_slots(weekday, start_time, duration_minutes),
          location:locations(name, name_i18n)
        ),
        participant:profiles!participations_participant_id_fkey!inner(
          first_name
        )
      `,
    )
    .eq(audienceColumn, userId)
    .eq("status", "active");
}

type RawMyUpcomingSessionRow = QueryData<
  ReturnType<typeof buildMyUpcomingSessionsQuery>
>[number];

/**
 * Builds the waitlist query for one audience — the `status='waitlisted'`
 * counterpart to the upcoming-sessions builder, and the same shape of thing:
 * `!inner` on both NOT-NULL-FK embeds so the inferred row treats `product` and
 * `participant` as non-null, and standalone so `QueryData` can infer it.
 *
 * The product shell it selects mirrors the sessions builder's minus the parts
 * only a seat produces — see `MyWaitlistRow` for why each half is where it is.
 * No location embed: a waitlisted card's footer is the queue sentence, so there
 * is no site line for one to fill.
 *
 * `seat_offer_sent_at` is the one column here that is not about the product,
 * and it is selected rather than asked of the position RPC on purpose: that RPC
 * is SECURITY DEFINER and counts past the caller's RLS, so its answer is
 * deliberately bounded to an id and an integer. This is the caller's own row,
 * under their own policies.
 *
 * Ordered oldest-first by the waitlist stamp, which is neither selected nor
 * needed by the card: it just gives the band a stable order that means
 * something (longest wait at the top) instead of whatever PostgREST returns.
 * `id` breaks sub-tick ties, the same tiebreaker the position derivation uses.
 */
function buildMyWaitlistQuery(
  supabase: AppSupabaseClient,
  audienceColumn: "customer_id" | "participant_id",
  userId: string,
) {
  return supabase
    .from("participations")
    .select(
      `
        id,
        participant_id,
        seat_offer_sent_at,
        product:products!inner(
          product_type, topic, timezone, start_date, end_date, delivery_mode,
          voice_room_mode, external_voice_url,
          product_translations(*),
          schedule_slots(weekday, start_time, duration_minutes)
        ),
        participant:profiles!participations_participant_id_fkey!inner(
          first_name
        )
      `,
    )
    .eq(audienceColumn, userId)
    .eq("status", "waitlisted")
    .order("waitlisted_at", { ascending: true })
    .order("id", { ascending: true });
}

type RawMyWaitlistRow = QueryData<ReturnType<typeof buildMyWaitlistQuery>>[number];

function toMyUpcomingSessionRow(
  row: RawMyUpcomingSessionRow,
  paymentProblem: boolean,
  subscriptionEndsAt: Date | null,
  plan: readonly PlannedSession[],
): MyUpcomingSessionRow {
  // Both non-null via the `!inner` joins in buildMyUpcomingSessionsQuery.
  const { product, participant } = row;
  return {
    participationId: row.id,
    participant: { id: row.participant_id, firstName: participant.first_name },
    product: {
      id: product.id,
      type: product.product_type,
      topic: product.topic,
      timezone: product.timezone,
      startDate: product.start_date,
      endDate: product.end_date,
      deliveryMode: product.delivery_mode,
      // The join is gated here rather than in the select, because the select
      // cannot express it: an online municipality club has a `location_id` and
      // no site. See `MyUpcomingSessionRow.product.site`.
      site: gamersAttendSite(product.delivery_mode) ? product.location : null,
      voiceRoom: productVoiceRoom(product, product.product_translations),
      translations: product.product_translations,
    },
    groupId: row.group_id,
    // Parsed here rather than carried as text, so every consumer works in
    // instants and none of them re-parses the same string per render tick.
    signedUpAt: new Date(row.signed_up_at),
    groupJoinedAt:
      row.group_joined_at === null ? null : new Date(row.group_joined_at),
    slots: product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMinutes: s.duration_minutes,
    })),
    paymentProblem,
    subscriptionEndsAt,
    plan,
  };
}

function toMyWaitlistRow(
  row: RawMyWaitlistRow,
  position: number,
): MyWaitlistRow {
  // Both non-null via the `!inner` joins in buildMyWaitlistQuery.
  const { product, participant } = row;
  return {
    participationId: row.id,
    participant: { id: row.participant_id, firstName: participant.first_name },
    product: {
      type: product.product_type,
      topic: product.topic,
      timezone: product.timezone,
      startDate: product.start_date,
      endDate: product.end_date,
      deliveryMode: product.delivery_mode,
      voiceRoom: productVoiceRoom(product, product.product_translations),
      translations: product.product_translations,
    },
    slots: product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMinutes: s.duration_minutes,
    })),
    position,
    seatOfferSentAt: row.seat_offer_sent_at,
  };
}

type GamerSignupState = "active" | "waitlisted";

function mergeGamerSignupState(
  current: GamerSignupState | undefined,
  rowStatus: string,
): GamerSignupState | null {
  // Priority order: active > waitlisted. A gamer can hold more than one row on
  // a product (e.g. a stale waitlisted row plus a fresh active one); the
  // strongest state wins so the picker shows "Signed up" over "On waitlist".
  // `completed` and any other status are ignored — only placed/waitlisted rows
  // lock a child out of the picker.
  if (current === "active" || rowStatus === "active") return "active";
  if (current === "waitlisted" || rowStatus === "waitlisted") return "waitlisted";
  // `current` is narrowed to `undefined` here (both states returned above), and
  // `rowStatus` is something we don't lock on (completed/other) — no change.
  return null;
}
