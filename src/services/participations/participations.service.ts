import type {
  AppSupabaseClient,
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

/**
 * Row shape returned by `getMyUpcomingSessions()`. The parent dashboard's
 * Sessions section flattens this into one card per (participation, slot,
 * occurrence) so we need the per-product slot list, the date-range bounds
 * (for camp/event termination), the timezone (so we can compute occurrences
 * in product-local wall time), and the Padlet URL for the reports link.
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
  gamer: {
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
    /** External Padlet URL for the session reports link. Null if not set. */
    padletUrl: string | null;
    /**
     * `false` for in-person products. The dashboard uses this together with
     * `groupId` to gate whether the Join Voice link gets a real
     * destination — in-person products have no voice room, so the button
     * stays inert.
     */
    isRemote: boolean;
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
 * Deliberately thin. A waitlist card shows a product name, a gamer and a
 * number — no slots, timezone, Padlet URL or subscription state — so none of
 * that is fetched.
 */
export interface MyWaitlistRow {
  /** The `participations.id`, and what the leave action names. */
  participationId: string;
  gamer: {
    id: string;
    firstName: string;
  };
  product: {
    /**
     * Raw translation rows, resolved to the viewer's UI locale at render time —
     * same arrangement as the sessions read, so the cache key stays locale-free
     * and switching locale doesn't refetch. The product's own id is not here:
     * a waitlist card links nowhere, so nothing downstream ever needed it.
     */
    translations: ProductTranslation[];
  };
  /**
   * 1-based position in line, recomputed live by the RPC rather than read from
   * the stamped-at-join value, so it shrinks as people ahead leave.
   */
  position: number;
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
        id, gamer_id, status, signed_up_at,
        product:products!inner(
          id, product_type,
          product_translations(*)
        ),
        group:product_groups(name)
      `,
    )
    .in("gamer_id", gamerIds)
    .order("gamer_id", { ascending: true })
    .order("signed_up_at", { ascending: false });
}

/**
 * Row shape returned by `getParticipationsForGamers()`, inferred from
 * `buildGamerParticipationsQuery`. Powers the admin user-detail page's
 * "Assigned products" surface, where an admin views every product a gamer (or
 * a parent's gamers) is signed up to — across all statuses (active /
 * waitlisted / reserving / completed), so support can see exactly what state
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
  reservingCount: number;
  waitlistCount: number;
  /**
   * Per-gamer signup state for the logged-in customer's children on this
   * product, keyed by `gamer_id`. A gamer with no row is simply absent from
   * the map. The detail page's signup form uses this to disable each
   * already-signed-up child in the picker and label them in place.
   *
   * `reserving` is deliberately excluded — the movie-ticket reservation model
   * treats a held seat as the parent's to retry against (they just click Sign
   * Up again), so a reserving gamer stays selectable. See
   * docs/products-architecture.md "Movie-ticket reservation model".
   */
  myGamerStates: Record<string, "active" | "waitlisted">;
}

export type CreateParticipationInput = {
  productId: string;
  gamerId: string;
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
  status: ParticipationStatus;
  productId: string;
  /** Gamer's first name (or username fallback); null → page shows "Your child". */
  gamerName: string | null;
}

export type {
  CreateParticipationResponse,
  JoinWaitlistResponse,
  LeaveWaitlistResponse,
} from "./participations.contracts";

export type JoinWaitlistInput = {
  productId: string;
  gamerId: string;
};

export type LeaveWaitlistInput = {
  participationId: string;
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
   * dashboard Sessions section needs to render one card per upcoming
   * occurrence: per-product weekly slots, start/end-date bounds, timezone,
   * and the Padlet URL for the reports link.
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
   * Expansion into concrete (start, end) pairs is the adapter's job
   * (`src/lib/upcoming-sessions.ts`); this method just hands back the raw
   * rows with everything that expansion needs in one round trip.
   *
   * Audience selects which column the row is keyed off:
   *   - 'customer' → `customer_id = auth.uid()`: every participation the
   *     parent paid for, across all their kids.
   *   - 'gamer' → `gamer_id = auth.uid()`: only the rows belonging to the
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
      audience === "customer" ? "customer_id" : "gamer_id";

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
      audience === "customer" ? "customer_id" : "gamer_id";

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
      .select("product_id, active_count, reserving_count, waitlist_count")
      .in("product_id", productIds);
    if (countsErr) throw countsErr;

    const countsByProduct = new Map<string, ParticipationCounts>();
    for (const id of productIds) {
      const row = countsData.find((r) => r.product_id === id);
      countsByProduct.set(id, {
        productId: id,
        activeCount: row?.active_count ?? 0,
        reservingCount: row?.reserving_count ?? 0,
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
        .select("product_id, gamer_id, status")
        .eq("customer_id", userId)
        .in("product_id", productIds);
      if (mine) {
        for (const row of mine) {
          const existing = countsByProduct.get(row.product_id);
          if (!existing) continue;
          const next = mergeGamerSignupState(
            existing.myGamerStates[row.gamer_id],
            row.status,
          );
          if (next) existing.myGamerStates[row.gamer_id] = next;
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
   * `gamer_id = auth.uid()`), so a logged-in child who somehow has the `?p=`
   * link can load their own confirmation. That's not the intended flow but it's
   * harmless: own data only (no IDOR), and the product detail is public anyway.
   * Returns null when the id matches nothing the caller may see (a stale or
   * forged `?p=` link), which the page renders as a friendly "couldn't find
   * that order" fallback.
   *
   * Status is returned but NOT gated on. After Stripe Checkout the redirect
   * waits on our webhook (`confirm_reservation` has run → 'active'), and free
   * signups arrive 'active' — but every field the page displays lives on the
   * row from creation, so a rare still-'reserving' row renders identically. We
   * don't poll.
   */
  async getConfirmation(
    participationId: string,
  ): Promise<ParticipationConfirmation | null> {
    const { data, error } = await this.supabase
      .from("participations")
      .select(
        `
          status, product_id,
          gamer:profiles!participations_gamer_id_fkey(first_name)
        `,
      )
      .eq("id", participationId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      status: data.status,
      productId: data.product_id,
      gamerName: data.gamer.first_name || null,
    };
  }

  /**
   * The caller's 1-based position on a product's waitlist for one of their own
   * waitlisted participations — the "you're #N" read for the post-join summary
   * (and, later, the parent/gamer dashboards). Recomputed live from
   * (waitlisted_at, id), so it shrinks as people ahead leave — unlike the
   * stamped-at-join value join_waitlist returns.
   *
   * Backed by the get_waitlist_position RPC: SECURITY DEFINER so it can count
   * past the caller's RLS, but owner-authorized (customer_id OR gamer_id) and
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
}

// ---------------------------------------------------------------------------
// Adapters between the raw select shape and the row shape exposed to UI.
// ---------------------------------------------------------------------------

/**
 * Builds the upcoming-sessions query for one audience. Both embeds use
 * `!inner` (`product_id` and `gamer_id` are NOT-NULL FKs, so an inner join
 * drops nothing), which lets the inferred row treat `product` and `gamer` as
 * non-null — no post-filter, no `!` assertions in the mapper. Standalone so
 * the row type can be inferred via `QueryData` with no hand-written shape and
 * no cast (select string and type stay in lockstep — drift is a compile error).
 */
function buildMyUpcomingSessionsQuery(
  supabase: AppSupabaseClient,
  audienceColumn: "customer_id" | "gamer_id",
  userId: string,
) {
  return supabase
    .from("participations")
    .select(
      `
        id,
        gamer_id,
        group_id,
        product:products!inner(
          id, product_type, timezone, start_date, end_date, padlet_url, is_remote,
          product_translations(*),
          schedule_slots(weekday, start_time, duration_minutes)
        ),
        gamer:profiles!participations_gamer_id_fkey!inner(
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
 * `gamer` as non-null, and standalone so `QueryData` can infer it.
 *
 * Ordered oldest-first by the waitlist stamp, which is neither selected nor
 * needed by the card: it just gives the band a stable order that means
 * something (longest wait at the top) instead of whatever PostgREST returns.
 * `id` breaks sub-tick ties, the same tiebreaker the position derivation uses.
 */
function buildMyWaitlistQuery(
  supabase: AppSupabaseClient,
  audienceColumn: "customer_id" | "gamer_id",
  userId: string,
) {
  return supabase
    .from("participations")
    .select(
      `
        id,
        gamer_id,
        product:products!inner(
          product_translations(*)
        ),
        gamer:profiles!participations_gamer_id_fkey!inner(
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
  const { product, gamer } = row;
  // Mirror the purchased-card fallback chain so a missing first_name still
  // renders something readable. The seed comes from `gamer_id` regardless,
  // so the identicon stays stable across name edits.
  const firstName = gamer.first_name || row.gamer_id.slice(0, 8);
  return {
    participationId: row.id,
    gamer: { id: row.gamer_id, firstName },
    product: {
      id: product.id,
      type: product.product_type,
      timezone: product.timezone,
      startDate: product.start_date,
      endDate: product.end_date,
      padletUrl: product.padlet_url,
      isRemote: product.is_remote,
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
  // first-name fallback as the sessions adapter, so a gamer with no name set
  // reads identically on a waitlist card and a session card.
  const { product, gamer } = row;
  return {
    participationId: row.id,
    gamer: {
      id: row.gamer_id,
      firstName: gamer.first_name || row.gamer_id.slice(0, 8),
    },
    product: { translations: product.product_translations },
    position,
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
  // `reserving` and any other status are ignored — only placed/waitlisted rows
  // lock a child out of the picker.
  if (current === "active" || rowStatus === "active") return "active";
  if (current === "waitlisted" || rowStatus === "waitlisted") return "waitlisted";
  // `current` is narrowed to `undefined` here (both states returned above), and
  // `rowStatus` is something we don't lock on (reserving/other) — no change.
  return null;
}
