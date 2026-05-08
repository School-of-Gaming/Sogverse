import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  Participation,
  ProductTypeV2,
  BillingModeV2,
  ProductTranslationV2,
  PurchaseShape,
  SubscriptionFrequencyV2,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";

/**
 * Row shape returned by `getMyParticipations()`. Joins the bare minimum the
 * purchased card needs to render — product chrome (name, image, type),
 * the placement state inputs (status, group_id), the credit balance, and
 * a flag indicating whether a live `family_subscription_items_v2` row
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
    product_type: ProductTypeV2;
    billing_mode: BillingModeV2;
    image_path: string | null;
    timezone: string;
    product_translations_v2: ProductTranslationV2[];
  } | null;
  /**
   * Joined gamer profile so the purchased card can render "For {name}"
   * without a second lookup. RLS already permits parents to read their
   * gamers' profiles (same path the `parent_gamer` join uses elsewhere).
   * Either field can be missing depending on how the gamer was created;
   * the UI falls back to `display_name → username` and renders something
   * either way.
   */
  gamer: {
    display_name: string | null;
    username: string | null;
  } | null;
  /**
   * `true` when a live family_subscription_items_v2 row points at this
   * participation. Drives the bundle-vs-sub coverage UI on the purchased card.
   */
  is_sub_covered: boolean;
};

/**
 * Row shape returned by `getMyFamilySubs()`. Used by the purchased-detail
 * placeholder to surface the family sub + its linked items so support and
 * dev can spot Stripe↔DB drift (active sub + participation flagged
 * non-sub-covered = missing link row).
 *
 * Pricing fields (`unit_amount_cents`, `stripe_price_currency`,
 * `recurring_interval`, `total_cents`) come from a live Stripe lookup, not
 * the local `product_subscription_prices_v2` cache: existing subs are
 * billed at their locked-in Stripe price, so the local cache can drift
 * from what's actually being charged. They're nullable to allow graceful
 * degradation if the Stripe call fails (e.g., sub deleted on Stripe).
 */
export interface MyFamilySubRow {
  id: string;
  status: string;
  frequency: SubscriptionFrequencyV2;
  currency: string;
  current_period_end: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  created_at: string;
  family_subscription_items_v2: {
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
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * The current customer's participations across all products. Used for the
   * "your enrolled" purchased-card rail.
   */
  async getMyParticipations(): Promise<MyParticipationRow[]> {
    const { data: userData } = await this.supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];

    const { data, error } = await this.supabase
      .from("participations_v2")
      .select(
        `
          id, product_id, group_id, gamer_id, status,
          credits_remaining, waitlist_position, signed_up_at,
          product:products_v2(
            id, product_type, billing_mode, image_path, timezone,
            product_translations_v2(*)
          ),
          gamer:profiles!participations_v2_gamer_id_fkey(
            display_name, username
          ),
          family_subscription_items_v2(
            id,
            family_subscription:family_subscriptions_v2(status)
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
   * Aggregate counts feeding the seat-left pill, threshold progress, and
   * "already signed up" detection for the listed products.
   *
   * Reads `product_seat_counts_v2` (public-readable, RLS-permissive) for
   * the live counts; the `mySignupState` is derived per-customer by looking
   * up `participations_v2` rows for any of their gamers on each product.
   */
  async getParticipationCounts(
    productIds: string[],
  ): Promise<ParticipationCounts[]> {
    if (productIds.length === 0) return [];

    const { data: countsData, error: countsErr } = await this.supabase
      .from("product_seat_counts_v2")
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
    const { data: userData } = await this.supabase.auth.getUser();
    const userId = userData.user?.id;
    if (userId) {
      const { data: mine } = await this.supabase
        .from("participations_v2")
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
    frequency: SubscriptionFrequencyV2,
    currency: SupportedCurrency,
  ): Promise<{ id: string; status: string } | null> {
    const { data: userData } = await this.supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return null;

    const { data, error } = await this.supabase
      .from("family_subscriptions_v2")
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
    product_type: ProductTypeV2;
    billing_mode: BillingModeV2;
    image_path: string | null;
    timezone: string;
    product_translations_v2: ProductTranslationV2[];
  } | null;
  gamer: {
    display_name: string | null;
    username: string | null;
  } | null;
  // Migration 00045 added UNIQUE(participation_id) — PostgREST now treats
  // this as a to-one relationship, so the embedded shape is a single
  // nullable object (not an array). At most one item ever links to a given
  // participation.
  family_subscription_items_v2: {
    id: string;
    family_subscription: { status: string } | null;
  } | null;
};

function toMyParticipationRow(row: RawMyParticipationRow): MyParticipationRow {
  // "Sub-covered" = the linked item exists AND its parent sub is live.
  const item = row.family_subscription_items_v2;
  const isSubCovered =
    item !== null &&
    item.family_subscription !== null &&
    ["active", "canceling", "past_due"].includes(item.family_subscription.status);
  const { family_subscription_items_v2: _items, ...rest } = row;
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
