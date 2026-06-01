import type {
  AppSupabaseClient,
  Participation,
  ProductType,
  BillingMode,
  ProductTranslation,
  PurchaseShape,
  SessionAudience,
  SubscriptionFrequency,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { QueryData } from "@supabase/supabase-js";

/**
 * Row shape returned by `getMyParticipations()`. Joins the bare minimum the
 * purchased card needs to render — product chrome (name, image, type),
 * the placement state inputs (status, group_id), the credit balance, and
 * a flag indicating whether a live `family_subscription_items` row
 * still points at this participation (= sub-covered).
 */
export type MyParticipationRow = Pick<
  Participation,
  | "id"
  | "product_id"
  | "group_id"
  | "gamer_id"
  | "status"
  | "credits_remaining"
  | "waitlist_position"
  | "signed_up_at"
> & {
  product: {
    id: string;
    product_type: ProductType;
    billing_mode: BillingMode;
    image_path: string | null;
    timezone: string;
    product_translations: ProductTranslation[];
  } | null;
  /**
   * Joined gamer profile so the purchased card can render "For {name}"
   * without a second lookup. RLS already permits parents to read their
   * gamers' profiles (same path the `parent_gamer` join uses elsewhere).
   * Either field can be missing depending on how the gamer was created;
   * the UI falls back to `first_name → username` and renders something
   * either way.
   */
  gamer: {
    first_name: string | null;
    username: string | null;
  } | null;
  /**
   * `true` when a live family_subscription_items row points at this
   * participation. Drives the bundle-vs-sub coverage UI on the purchased card.
   */
  is_sub_covered: boolean;
};

/**
 * Row shape returned by `getMyUpcomingSessions()`. The parent dashboard's
 * Sessions section flattens this into one card per (participation, slot,
 * occurrence) so we need the per-product slot list, the date-range bounds
 * (for camp/event termination), the timezone (so we can compute occurrences
 * in product-local wall time), and the Padlet URL for the reports link.
 *
 * Filtered to active-and-assigned participations: waitlisted rows have no
 * placement and unassigned rows aren't on a schedule yet, so neither makes
 * sense on a "next session" list.
 */
export interface MyUpcomingSessionRow {
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
}

/**
 * Row shape returned by `getMyFamilySubs()`. Used by the purchased-detail
 * placeholder to surface the family sub + its linked items so support and
 * dev can spot Stripe↔DB drift (active sub + participation flagged
 * non-sub-covered = missing link row).
 *
 * Pricing fields (`unit_amount_cents`, `stripe_price_currency`,
 * `recurring_interval`, `total_cents`) come from a live Stripe lookup, not
 * the local `product_subscription_prices` cache: existing subs are
 * billed at their locked-in Stripe price, so the local cache can drift
 * from what's actually being charged. They're nullable to allow graceful
 * degradation if the Stripe call fails (e.g., sub deleted on Stripe).
 */
export interface MyFamilySubRow {
  id: string;
  status: string;
  frequency: SubscriptionFrequency;
  currency: string;
  current_period_end: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  created_at: string;
  family_subscription_items: {
    id: string;
    participation_id: string;
    stripe_subscription_item_id: string;
    stripe_price_id: string;
    unit_amount_cents: number | null;
    stripe_price_currency: string | null;
    recurring_interval: string | null;
  }[];
  /** Sum of all items' unit_amount_cents. Null if any item failed to price. */
  total_cents: number | null;
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
  /** `'none' | 'reserving' | 'waitlisted' | 'active'` for the logged-in customer's gamers. */
  mySignupState: "none" | "reserving" | "waitlisted" | "active";
}

export type CreateParticipationInput = {
  productId: string;
  gamerId: string;
  purchaseShape: PurchaseShape;
  currency: SupportedCurrency;
  returnPath?: string;
};

export type CreateParticipationResponse =
  | { status: "redirect"; checkoutUrl: string }
  | { status: "subscribed"; participationId: string }
  | { status: "free_confirmed"; participationId: string }
  | { status: "full" };

export type JoinWaitlistInput = {
  productId: string;
  gamerId: string;
};

export type JoinWaitlistResponse = {
  participationId: string;
  waitlistPosition: number;
  status: string;
};

export class ParticipationsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The current customer's participations across all products. Used for the
   * "your enrolled" purchased-card rail.
   */
  async getMyParticipations(): Promise<MyParticipationRow[]> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return [];

    const { data, error } = await this.supabase
      .from("participations")
      .select(
        `
          id, product_id, group_id, gamer_id, status,
          credits_remaining, waitlist_position, signed_up_at,
          product:products(
            id, product_type, billing_mode, image_path, timezone,
            product_translations(*)
          ),
          gamer:profiles!participations_gamer_id_fkey(
            first_name, username
          ),
          family_subscription_items(
            id,
            family_subscription:family_subscriptions(status)
          )
        `,
      )
      .eq("customer_id", userId)
      .neq("status", "reserving")
      .order("signed_up_at", { ascending: false });

    if (error) throw error;

    return (data as RawMyParticipationRow[]).map(toMyParticipationRow);
  }

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
   * The logged-in user's *placed* participations, joined with the bits the
   * dashboard Sessions section needs to render one card per upcoming
   * occurrence: per-product weekly slots, start/end-date bounds, timezone,
   * and the Padlet URL for the reports link.
   *
   * Filtered to `status='active' AND group_id IS NOT NULL` — waitlisted rows
   * aren't scheduled yet, and unassigned rows have no placement either.
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

    const { data, error } = await this.supabase
      .from("participations")
      .select(
        `
          gamer_id,
          group_id,
          product:products!inner(
            id, product_type, timezone, start_date, end_date, padlet_url, is_remote,
            product_translations(*),
            schedule_slots(weekday, start_time, duration_minutes)
          ),
          gamer:profiles!participations_gamer_id_fkey(
            first_name, username
          )
        `,
      )
      .eq(audienceColumn, userId)
      .eq("status", "active")
      .not("group_id", "is", null);

    if (error) throw error;

    return (data as RawMyUpcomingSessionRow[])
      .filter((row) => row.product !== null && row.gamer !== null)
      .map(toMyUpcomingSessionRow);
  }

  /**
   * Aggregate counts feeding the seat-left pill, threshold progress, and
   * "already signed up" detection for the listed products.
   *
   * Reads `product_seat_counts` (public-readable, RLS-permissive) for
   * the live counts; the `mySignupState` is derived per-customer by looking
   * up `participations` rows for any of their gamers on each product.
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
        mySignupState: "none",
      });
    }

    // Per-customer signup state on each of the listed products.
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (userId) {
      const { data: mine } = await this.supabase
        .from("participations")
        .select("product_id, status")
        .eq("customer_id", userId)
        .in("product_id", productIds);
      if (mine) {
        for (const row of mine) {
          const existing = countsByProduct.get(row.product_id);
          if (!existing) continue;
          existing.mySignupState = mergeSignupState(
            existing.mySignupState,
            row.status,
          );
        }
      }
    }

    return [...countsByProduct.values()];
  }

  /**
   * The current customer's family subscriptions plus their items, enriched
   * with live Stripe pricing. Used by the purchased-detail placeholder to
   * surface Stripe↔DB drift (active family sub paired with a participation
   * NOT flagged sub-covered = inline-add atomicity gap, link row missing).
   *
   * Reads via API route, not direct supabase: the route hits Stripe to get
   * each item's actual locked-in price, since existing subs continue
   * paying their original price after a local price change.
   */
  async getMyFamilySubs(): Promise<MyFamilySubRow[]> {
    const response = await fetch("/api/family-subscriptions/me");
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to load family subscriptions");
    }
    return (await response.json()) as MyFamilySubRow[];
  }

  /**
   * Read the current customer's family subscriptions for a given (frequency,
   * currency). Used on the signup panel to decide whether the next
   * subscribe is a Stripe-Checkout-new-sub or an inline-add.
   *
   * Returns the row's `id` and `status` if a row exists at this tuple, or
   * `null` otherwise. Anything other than active / canceling / past_due is
   * treated as no-live-sub on the server side.
   */
  async getFamilySubAt(
    frequency: SubscriptionFrequency,
    currency: SupportedCurrency,
  ): Promise<{ id: string; status: string } | null> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return null;

    const { data, error } = await this.supabase
      .from("family_subscriptions")
      .select("id, status")
      .eq("customer_id", userId)
      .eq("frequency", frequency)
      .eq("currency", currency)
      .maybeSingle();
    if (error) return null;
    return data ?? null;
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
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to start checkout");
    }
    return (await response.json()) as CreateParticipationResponse;
  }

  async joinWaitlist(input: JoinWaitlistInput): Promise<JoinWaitlistResponse> {
    const response = await fetch("/api/participations/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to join waitlist");
    }
    return (await response.json()) as JoinWaitlistResponse;
  }
}

// ---------------------------------------------------------------------------
// Adapters between the raw select shape and the row shape exposed to UI.
// ---------------------------------------------------------------------------

type RawMyParticipationRow = Pick<
  Participation,
  | "id"
  | "product_id"
  | "group_id"
  | "gamer_id"
  | "status"
  | "credits_remaining"
  | "waitlist_position"
  | "signed_up_at"
> & {
  product: {
    id: string;
    product_type: ProductType;
    billing_mode: BillingMode;
    image_path: string | null;
    timezone: string;
    product_translations: ProductTranslation[];
  } | null;
  gamer: {
    first_name: string | null;
    username: string | null;
  } | null;
  // Migration 00045 added UNIQUE(participation_id) — PostgREST now treats
  // this as a to-one relationship, so the embedded shape is a single
  // nullable object (not an array). At most one item ever links to a given
  // participation.
  family_subscription_items: {
    id: string;
    family_subscription: { status: string } | null;
  } | null;
};

interface RawMyUpcomingSessionRow {
  gamer_id: string;
  group_id: string | null;
  product: {
    id: string;
    product_type: ProductType;
    timezone: string;
    start_date: string | null;
    end_date: string | null;
    padlet_url: string | null;
    is_remote: boolean;
    product_translations: ProductTranslation[];
    schedule_slots: Array<{
      weekday: number;
      start_time: string;
      duration_minutes: number;
    }>;
  } | null;
  gamer: {
    first_name: string | null;
    username: string | null;
  } | null;
}

function toMyUpcomingSessionRow(row: RawMyUpcomingSessionRow): MyUpcomingSessionRow {
  // Non-null on both fields is asserted by the `!inner` join on product +
  // the `.filter()` step above for gamer; this narrows for downstream code.
  const product = row.product!;
  const gamer = row.gamer!;
  // Mirror the purchased-card fallback chain so a missing first_name still
  // renders something readable. The seed comes from `gamer_id` regardless,
  // so the identicon stays stable across name edits.
  const firstName =
    gamer.first_name || gamer.username || row.gamer_id.slice(0, 8);
  return {
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
  };
}

function toMyParticipationRow(row: RawMyParticipationRow): MyParticipationRow {
  // "Sub-covered" = the linked item exists AND its parent sub is live.
  const item = row.family_subscription_items;
  const isSubCovered =
    item !== null &&
    item.family_subscription !== null &&
    ["active", "canceling", "past_due"].includes(item.family_subscription.status);
  const { family_subscription_items: _items, ...rest } = row;
  void _items;
  return { ...rest, is_sub_covered: isSubCovered };
}

function mergeSignupState(
  current: ParticipationCounts["mySignupState"],
  rowStatus: string,
): ParticipationCounts["mySignupState"] {
  // Priority order: active > waitlisted > reserving > none.
  // If any of the customer's gamers is active on this product, the panel
  // shows the already-signed-up state regardless of other rows.
  if (current === "active") return "active";
  if (rowStatus === "active") return "active";
  if (current === "waitlisted") return "waitlisted";
  if (rowStatus === "waitlisted") return "waitlisted";
  if (current === "reserving") return "reserving";
  if (rowStatus === "reserving") return "reserving";
  return "none";
}
