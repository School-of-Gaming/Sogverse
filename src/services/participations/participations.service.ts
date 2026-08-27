import type {
  AppSupabaseClient,
  Json,
  ParticipationStatus,
  ParticipationSubscriptionState,
  ProductType,
  ProductTranslation,
  PurchaseShape,
  SessionAudience,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { QueryData } from "@supabase/supabase-js";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import {
  createParticipationResponse,
  joinWaitlistResponse,
  leaveWaitlistResponse,
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

/**
 * A venue's name as it comes off the row — the canonical `name` plus the
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
 * one of these up into a single enrollment card, so we need the per-product
 * slot list, the date-range bounds (for camp/event termination) and the
 * timezone (so occurrences can be computed in product-local wall time).
 *
 * Filtered to active participations (assigned and unassigned alike);
 * waitlisted rows are excluded since they have no placement. `groupId` is
 * null for unassigned rows — the adapter turns those into "awaiting Gedu
 * placement" cards (full schedule, disabled Join button) so a fresh
 * purchase shows up before an admin has placed the gamer in a group.
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
    timezone: string;
    /**
     * Inclusive start date in the product's local calendar (YYYY-MM-DD).
     * Used to clamp the upcoming-sessions list so a camp that has slots on
     * "this week's weekday" but whose start_date is still in the future
     * doesn't emit phantom in-progress sessions.
     */
    startDate: string | null;
    /**
     * Inclusive end date in the product's local calendar (YYYY-MM-DD).
     * Null for ongoing clubs; the dashboard caps those at the next N
     * occurrences instead.
     */
    endDate: string | null;
    /**
     * `false` for in-person products. The dashboard uses this together with
     * `groupId` to gate whether the Join Voice link gets a real
     * destination — in-person products have no voice room, so the button
     * stays inert.
     */
    isRemote: boolean;
    /**
     * The venue an **in-person** product runs at, `null` on a remote one.
     *
     * Gated on `is_remote` rather than on whether the join found a row: a
     * remote municipality club carries a `location_id` too (the municipality
     * that commissioned it), and that is an administrative fact, not a
     * building anybody travels to. Answering "where is this happening" with a
     * municipality name on a card whose sessions are in a voice room would be
     * worse than saying nothing. Every in-person product has a location by
     * schema CHECK, so `null` here means "no building involved" rather than
     * "not loaded".
     */
    site: ProductSiteName | null;
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
   * non-subscription products. Drives two things: the expander clamps the
   * session list to occurrences on or before this instant (both audiences),
   * and the parent dashboard shows an "access until {date}" badge. Sourced
   * from `get_my_participation_subscription_states` — see
   * `getMyUpcomingSessions`.
   */
  subscriptionEndsAt: Date | null;
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
 * group, no subscription state, and no venue. A waitlisted family has no
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
     * `false` for in-person products. No Join is ever drawn on a waitlisted
     * card — there is no seat behind it — but the summary this row becomes says
     * whether the product *has* a room, and inventing `false` for every
     * waitlist place would be stating something untrue about the product.
     */
    isRemote: boolean;
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
};

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
   * The participant's first name — a child's, or the buyer's own on a self
   * seat. Null → the page falls back to "Your child" / "You" depending on
   * `isSelfSeat`.
   */
  participantName: string | null;
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
};

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
   * (null → "awaiting Gedu placement" card with a disabled Join button) so
   * a parent sees their purchase reflected immediately instead of an empty
   * section while an admin places the gamer in a group.
   *
   * Expansion into concrete (start, end) pairs belongs to the client-side
   * roll-up, which needs the viewer's locale and zone and has to re-derive on
   * the shared clock; this method just hands back the raw rows with everything
   * that expansion needs in one round trip.
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
    // signals come from `get_my_participation_subscription_states` (00093)
    // rather than a `family_subscriptions` embed because gamers have no SELECT
    // access to that table — the RPC self-scopes via auth.uid() and returns
    // only participation id + status + period end (no money), so it works
    // identically for both audiences. One RPC carries both the past_due flag
    // and the canceling access-until date; the client derives each below.
    const [{ data, error }, { data: subRows, error: subError }] =
      await Promise.all([
        buildMyUpcomingSessionsQuery(this.supabase, audienceColumn, userId),
        this.supabase.rpc("get_my_participation_subscription_states"),
      ]);

    if (error) throw error;

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
   * Aggregate counts feeding the seat-left pill, threshold progress, and
   * "already signed up" detection for the listed products.
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
      participantName: data.participant.first_name || null,
      isSelfSeat: data.participant_id === data.customer_id,
    };
  }

  /**
   * The same read for a paid signup, which arrives holding a Stripe Checkout
   * Session id instead of a participation id — the row did not exist when the
   * `success_url` was built, so there was nothing else to key it on. The row
   * records the session that bought it, which is what closes the loop.
   *
   * Same RLS gate as the sibling above (`customer_id = auth.uid()`, or the
   * gamer's own row), so a session id belonging to someone else reads as null
   * rather than as anyone's order.
   *
   * Null is NOT the same "stale link" answer here: the webhook creates the row,
   * and Stripe waits up to ten seconds on it before redirecting, so null almost
   * always means "not written *yet*". The page shows a finalizing state and
   * polls this until it lands, rather than telling a parent who just paid that
   * their order could not be found.
   */
  async getConfirmationByCheckoutSession(
    checkoutSessionId: string,
  ): Promise<ParticipationConfirmation | null> {
    const { data, error } = await this.supabase
      .from("participations")
      .select(
        `
          id, status, product_id, participant_id, customer_id,
          participant:profiles!participations_participant_id_fkey(first_name)
        `,
      )
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      participationId: data.id,
      status: data.status,
      productId: data.product_id,
      participantName: data.participant.first_name || null,
      isSelfSeat: data.participant_id === data.customer_id,
    };
  }

  /**
   * When the **first** subscription charge for this participation will happen —
   * or `null` when there is no deferred first charge to state.
   *
   * A club bought before it starts completes Checkout at €0 and bills for the
   * first time at the anchor, so the confirmation has to say when that is. One
   * fact turns the line on and two guards turn it off, and none works alone:
   *
   *   - **The signal is the €0 subscription payment row** — the marker the
   *     webhook writes for a completion that collected nothing. A future
   *     `current_period_end` on its own is not a signal: an immediately-charged
   *     subscription has one too (its renewal), and calling a renewal the "first
   *     charge" is a lie about money.
   *   - **The first guard is the absence of a positive-amount row** for this
   *     subscription. The €0 marker is permanent, the deferral is not: once the
   *     anchor fires, `current_period_end` advances to the *next* renewal, and a
   *     parent revisiting their confirmation link — which they do — would be told
   *     a renewal date under a "first charge" label.
   *   - **The second guard is the clock.** The line only makes a claim about the
   *     future, so an instant that is not in the future retires it whatever the
   *     ledger says. That covers what the payment row cannot: an anchor charge
   *     that *failed* (the subscription goes `past_due`, no positive payment row
   *     is ever written, and `current_period_end` sits in the past), and an
   *     `invoice.paid` delivery we never received.
   *
   * **What is still open, honestly.** The two guards do not close the
   * webhook-ordering race: Stripe can deliver `customer.subscription.updated` for
   * the anchor cycle before the matching `invoice.paid`, and in the window
   * between them `current_period_end` has already advanced to the next renewal
   * while no positive payment row exists yet — so a confirmation loaded in that
   * window states a renewal date under the "first charge" label. The window is
   * seconds to minutes, both events are near-simultaneous, and the clock guard
   * does not help because the advanced value is in the future. Closing it (by
   * recording the anchor at purchase and comparing against it, rather than
   * inferring from the period end) is a decision deliberately still pending.
   *
   * The date itself is the subscription row's `current_period_end`, which for a
   * deferred purchase *is* the anchor.
   *
   * Everything here is RLS-scoped: the `payments` SELECT policy is customer-only,
   * so a gamer reading their own confirmation gets nothing and sees no billing
   * line. That is the intended outcome — billing copy is for the payer.
   */
  async getDeferredFirstChargeAt(
    participationId: string,
  ): Promise<string | null> {
    const { data: sub, error: subError } = await this.supabase
      .from("family_subscriptions")
      .select("stripe_subscription_id, current_period_end")
      .eq("participation_id", participationId)
      .maybeSingle();
    if (subError) throw subError;
    if (!sub?.current_period_end) return null;

    // A first charge is a promise about the future; an instant already behind us
    // is not one, whatever the ledger looks like. Checked before the payments
    // read because it is free and settles the common stale cases on its own. An
    // instant comparison, not a local-date one — nothing here is being formatted
    // against anybody's calendar yet.
    if (new Date(sub.current_period_end).getTime() <= Date.now()) return null;

    // Filtered in JS rather than with a jsonb path filter: the two links live
    // under different metadata keys (the checkout marker records the
    // participation, a renewal records the subscription), and one typed read is
    // simpler than two hand-written PostgREST json filters. Newest first with a
    // bound, so the read cannot grow without limit as a family's ledger does —
    // and the ordering is what makes the bound safe in the direction that
    // matters: a real charge is always *newer* than the €0 marker it follows, so
    // a window holding the marker holds its successor too. Falling off the end
    // can only hide the line, never show a stale one.
    const { data: payments, error: paymentsError } = await this.supabase
      .from("payments")
      .select("amount_cents, metadata")
      .eq("purpose", "subscription_invoice")
      .order("created_at", { ascending: false })
      .limit(RECENT_SUBSCRIPTION_PAYMENTS);
    if (paymentsError) throw paymentsError;

    const deferredMarker = payments.some(
      (row) =>
        row.amount_cents === 0 &&
        metadataString(row.metadata, "participationId") === participationId,
    );
    if (!deferredMarker) return null;

    const firstChargeLanded = payments.some(
      (row) =>
        row.amount_cents > 0 &&
        metadataString(row.metadata, "stripeSubscriptionId") ===
          sub.stripe_subscription_id,
    );
    if (firstChargeLanded) return null;

    return sub.current_period_end;
  }

  /**
   * Does this participant — a child, or the buyer themselves on a for-parents
   * product — already hold a spot on this product? Asked by the paid
   * confirmation page when the session it arrived with bought nothing, to tell
   * the two reasons for that apart: the webhook has not landed yet (wait), or
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
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to start checkout"),
      );
    }
    return parseJsonResponse(response, createParticipationResponse);
  }

  async joinWaitlist(input: JoinWaitlistInput): Promise<JoinWaitlistResponse> {
    const response = await fetch("/api/participations/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to join waitlist"),
      );
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
        product:products!inner(
          id, product_type, timezone, start_date, end_date, is_remote,
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
 * is no venue line for one to fill.
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
          product_type, timezone, start_date, end_date, is_remote,
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
): MyUpcomingSessionRow {
  // Both non-null via the `!inner` joins in buildMyUpcomingSessionsQuery.
  const { product, participant } = row;
  // Mirror the purchased-card fallback chain so a missing first_name still
  // renders something readable. The seed comes from `participant_id` regardless,
  // so the identicon stays stable across name edits.
  const firstName = participant.first_name || row.participant_id.slice(0, 8);
  return {
    participationId: row.id,
    participant: { id: row.participant_id, firstName },
    product: {
      id: product.id,
      type: product.product_type,
      timezone: product.timezone,
      startDate: product.start_date,
      endDate: product.end_date,
      isRemote: product.is_remote,
      // The join is gated here rather than in the select, because the select
      // cannot express it: a remote municipality club has a `location_id` and
      // no venue. See `MyUpcomingSessionRow.product.site`.
      site: product.is_remote ? null : product.location,
      translations: product.product_translations,
    },
    groupId: row.group_id,
    slots: product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMinutes: s.duration_minutes,
    })),
    paymentProblem,
    subscriptionEndsAt,
  };
}

function toMyWaitlistRow(
  row: RawMyWaitlistRow,
  position: number,
): MyWaitlistRow {
  // Both non-null via the `!inner` joins in buildMyWaitlistQuery. Same
  // first-name fallback as the sessions adapter, so a participant with no name
  // set reads identically on a waitlist card and a session card.
  const { product, participant } = row;
  return {
    participationId: row.id,
    participant: {
      id: row.participant_id,
      firstName: participant.first_name || row.participant_id.slice(0, 8),
    },
    product: {
      type: product.product_type,
      timezone: product.timezone,
      startDate: product.start_date,
      endDate: product.end_date,
      isRemote: product.is_remote,
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

/**
 * How far back the deferred-first-charge read looks through a family's
 * subscription payments. Comfortably more rows than a family accumulates in the
 * window that matters (the €0 marker and any charge that followed it), and small
 * enough that the confirmation page never pulls a decade of ledger.
 */
const RECENT_SUBSCRIPTION_PAYMENTS = 100;

/** A string value out of a `jsonb` metadata blob, or null if it isn't one. */
function metadataString(metadata: Json, key: string): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  if (Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" ? value : null;
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
