import type {
  AppSupabaseClient,
  ProductV2,
  ProductTranslationV2,
  ProductTypeV2,
  BillingModeV2,
  ProductStatusV2,
  ProductV2BrowseRow,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";

// Topic translations join is read locale-agnostic; the client picks the row
// to display via resolveTranslation. List/detail views always need at least
// the topic name + slug, plus all topic translations so admin tooling can
// switch locales without re-fetching.
export type ProductV2WithDetails = ProductV2 & {
  topics_v2:
    | {
        slug: string;
        topic_translations_v2: { locale: string; name: string }[];
      }
    | null;
  product_translations_v2: ProductTranslationV2[];
};

// Parent-facing single-product detail. Shares the browse row's joins
// and adds a flattened `holidays` array — every (date, reason) pair
// pulled from the product's linked holiday calendars. The reason
// falls back to the calendar's `name` if the admin didn't set a
// per-date one. Consumed by the detail page calendar widget. The
// signup panel also reads `product_prices_v2` off this row.
export type ProductV2DetailRow = ProductV2BrowseRow & {
  holidays: { date: string; reason: string }[];
};

// Admin-only single-product detail. Unlike ProductV2DetailRow this is
// NOT filtered on is_visible / status, so admins can fetch drafts and
// cancelled rows. Carries everything the form needs to round-trip an
// edit (tag IDs, holiday calendar IDs) plus readable strings the
// details page renders (tag/topic translations, location chain,
// holiday calendar names).
export type ProductV2AdminDetailRow = ProductV2 & {
  topics_v2:
    | {
        id: string;
        slug: string;
        kind: string;
        topic_translations_v2: { locale: string; name: string }[];
      }
    | null;
  product_translations_v2: ProductTranslationV2[];
  product_tags_v2: {
    tag_id: string;
    tags_v2:
      | {
          slug: string;
          tag_translations_v2: { locale: string; name: string }[];
        }
      | null;
  }[];
  product_prices_v2: {
    currency: string;
    price_per_session: number;
    price_per_month: number;
  }[];
  schedule_slots_v2: {
    weekday: number;
    start_time: string;
    duration_minutes: number;
  }[];
  locations:
    | {
        id: string;
        name: string;
        type: string;
        parent: { id: string; name: string; type: string } | null;
      }
    | null;
  product_holiday_calendars_v2: {
    calendar_id: string;
    holiday_calendars_v2: { name: string } | null;
  }[];
};

export type ProductTranslationInput = {
  locale: SupportedLocale;
  name: string;
  description: string;
};

export type ScheduleSlotInput = {
  weekday: number;
  start_time: string;
  duration_minutes: number;
};

export type PriceInput = {
  currency: SupportedCurrency;
  price_per_session: number;
  price_per_month: number;
};

// Shape accepted by /api/admin/products-v2/create. Mirrors create_product_v2()
// RPC args, minus the image (uploaded separately as the last step so a failed
// insert never leaves an orphan in the bucket — see docs/products-redesign.md).
//
// `translations` must contain at least one entry, and at least one of those
// entries must have locale 'en' or 'fi'. The RPC enforces the same rule;
// the form blocks submit before we get here.
export type CreateProductV2Input = {
  product_type: ProductTypeV2;
  billing_mode: BillingModeV2;
  translations: ProductTranslationInput[];
  topic_id: string;
  min_age: number;
  max_age: number;
  spoken_language_code: string;
  padlet_url: string | null;
  location_id: string | null;
  is_remote: boolean;
  status: ProductStatusV2;
  signup_threshold: number | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  seat_count: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string;
  is_visible: boolean;
  schedule_slots: ScheduleSlotInput[];
  tag_ids: string[];
  prices: PriceInput[];
  holiday_calendar_ids: string[];
  image: File | null;
};

// Shape accepted by /api/admin/products-v2/[id]/update. Mirrors
// update_product_v2() RPC args. Differs from CreateProductV2Input in:
//   - no `product_type` (immutable; URL-locked)
//   - no `status` (preserved by the RPC; effective status re-derives
//     from the data fields this input edits)
//   - `image` accepts `string` ("keep existing path") in addition to
//     `File` (replace) and `null` (clear). The route reads the existing
//     `image_path` from the DB to decide what to do — string values
//     from the client are *not* trusted as-is; the route preserves the
//     existing path on its own when the client signals "no change."
export type UpdateProductV2Input = {
  billing_mode: BillingModeV2;
  translations: ProductTranslationInput[];
  topic_id: string;
  min_age: number;
  max_age: number;
  spoken_language_code: string;
  padlet_url: string | null;
  location_id: string | null;
  is_remote: boolean;
  signup_threshold: number | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  seat_count: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string;
  is_visible: boolean;
  schedule_slots: ScheduleSlotInput[];
  tag_ids: string[];
  prices: PriceInput[];
  holiday_calendar_ids: string[];
  image: File | string | null;
};

export class ProductsV2Service {
  constructor(private supabase: AppSupabaseClient) {}

  async listByType(type: ProductTypeV2): Promise<ProductV2WithDetails[]> {
    const { data, error } = await this.supabase
      .from("products_v2")
      .select(
        "*, topics_v2(slug, topic_translations_v2(locale, name)), product_translations_v2(*)"
      )
      .eq("product_type", type)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as ProductV2WithDetails[];
  }

  // Parent-facing list: only visible products in a parent-relevant lifecycle
  // state. RLS already restricts anon/customer reads to the same predicate
  // (per redesign §5.8) — the explicit filters here are defensive and let
  // admins (who can see everything) call this same hook from the public
  // pages without seeing draft/cancelled rows. Joins everything the browse
  // card needs in one round trip.
  //
  // We deliberately *don't* filter on end_date — a `running` row whose
  // end_date has already passed still comes back here. The card layer
  // calls effectiveStatus() to surface those as "Ended" with a muted
  // visual treatment instead of letting them masquerade as live. Once the
  // cron flips them to `completed`, RLS hides them entirely.
  async listVisibleByType(type: ProductTypeV2): Promise<ProductV2BrowseRow[]> {
    const { data, error } = await this.supabase
      .from("products_v2")
      .select(
        // `parent:parent_id(...)` (column-name form) embeds the parent row
        // via the FK on parent_id. The `locations!parent_id` form looks
        // like the same thing but PostgREST resolves it to the *children*
        // (rows whose parent_id points back here) and returns `[]` for
        // any leaf location — surfaces as "Foo, undefined" in the UI.
        "*, topics_v2(slug, kind, icon_path, topic_translations_v2(*)), product_translations_v2(*), product_tags_v2(tags_v2(slug, tag_translations_v2(*))), product_prices_v2(*), schedule_slots_v2(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type))"
      )
      .eq("product_type", type)
      .eq("is_visible", true)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as ProductV2BrowseRow[];
  }

  // Products the current Gedu is assigned to (via gedu_group_assignments_v2).
  // Returns the same shape as `listVisibleByType` so the public browse page
  // can render gedu-owned rows with the same card adapters. Unlike
  // listVisibleByType, this does NOT filter on is_visible / status: an
  // assignment is the gedu's claim on the product, parallel to the customer's
  // participation, so a hidden / draft / cancelled product they're on still
  // shows up. The new `gedu_assigned_read_products_v2` policy (migration
  // 00056) lifts the visibility gate on products_v2 for the second query.
  //
  // Two-step (assignments → products) instead of an `!inner` join: a gedu can
  // sit on multiple groups within the same product, so we have to dedupe
  // product_ids before fetching products. JS dedup on the small assignment
  // payload (a couple of UUIDs per row) reads cleaner than letting the join
  // multiply rows out and deduping the larger product payloads downstream.
  //
  // RLS on the join table is `gedus_read_own_assignments_v2` (migration 00050,
  // which replaced the earlier team-visibility policy after it caused
  // self-referential recursion). That policy already restricts the result to
  // the caller's own rows; the explicit `.eq("gedu_id", userId)` here is
  // belt-and-suspenders.
  async listMyGeduAssigned(): Promise<ProductV2BrowseRow[]> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return [];

    const { data: assignments, error: assignErr } = await this.supabase
      .from("gedu_group_assignments_v2")
      .select("product_id")
      .eq("gedu_id", userId);
    if (assignErr) throw assignErr;

    const productIds = Array.from(
      new Set(assignments.map((a) => a.product_id)),
    );
    if (productIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("products_v2")
      .select(
        "*, topics_v2(slug, kind, icon_path, topic_translations_v2(*)), product_translations_v2(*), product_tags_v2(tags_v2(slug, tag_translations_v2(*))), product_prices_v2(*), schedule_slots_v2(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type))",
      )
      .in("id", productIds)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as ProductV2BrowseRow[];
  }

  // Single-product detail fetch for the parent-facing detail page
  // (`/clubs/[id]`, `/camps/[id]`, `/events/[id]`). Returns the same shape
  // as `listVisibleByType` plus a flattened `holidays` array sourced from
  // the linked holiday calendars — that's everything the calendar widget
  // and the signup panel need to render.
  //
  // RLS is the sole gate: a viewer reaches this row if either
  // `public_read_published_products_v2` (visible + pending/running) OR
  // `purchaser_read_products_v2` (active/waitlisted participation owned
  // by the viewer) lets them through. The detail page renders the
  // marketing layout for the former and the purchased layout for the
  // latter — both branches need the row, so no explicit `is_visible` /
  // status filters here. Returns null on miss so the page can render a
  // clean "not found" state.
  async getDetailById(
    id: string,
  ): Promise<ProductV2DetailRow | null> {
    const { data, error } = await this.supabase
      .from("products_v2")
      .select(
        "*, topics_v2(slug, kind, icon_path, topic_translations_v2(*)), product_translations_v2(*), product_tags_v2(tags_v2(slug, tag_translations_v2(*))), product_prices_v2(*), schedule_slots_v2(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type)), product_holiday_calendars_v2(holiday_calendars_v2(name, calendar_holidays_v2(date, reason)))",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // One direct cast to the row shape we read — same pattern as
    // listVisibleByType above. `RawRow` extends ProductV2BrowseRow with
    // the holiday-calendars join included in this query's select.
    type RawRow = ProductV2BrowseRow & {
      product_holiday_calendars_v2?: {
        holiday_calendars_v2: {
          name: string;
          calendar_holidays_v2: { date: string; reason: string | null }[];
        } | null;
      }[];
    };
    const row = data as RawRow;

    // Flatten linked-calendar holidays into a single array. Each row keeps
    // its per-date `reason` if the admin filled one in; otherwise the
    // calendar's own `name` is the fallback (e.g., "Finnish national
    // holidays" reads better than a blank row in the UI).
    const holidays: { date: string; reason: string }[] = [];
    for (const link of row.product_holiday_calendars_v2 ?? []) {
      const cal = link.holiday_calendars_v2;
      if (!cal) continue;
      for (const h of cal.calendar_holidays_v2) {
        holidays.push({ date: h.date, reason: h.reason ?? cal.name });
      }
    }

    return { ...row, holidays };
  }

  async createProduct(input: CreateProductV2Input): Promise<string> {
    const { image, ...metadata } = input;

    const formData = new FormData();
    formData.append("data", JSON.stringify(metadata));
    if (image) {
      formData.append("file", image);
    }

    const response = await fetch("/api/admin/products-v2/create", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to create product");
    }

    const { product_id } = (await response.json()) as { product_id: string };
    return product_id;
  }

  // Admin-only single-product fetch. Same join shape as getDetailById but
  // WITHOUT the `is_visible = true` and `status IN (pending, running)`
  // filters, so admins see drafts, hidden, and cancelled products too.
  // Carries the IDs the form needs to round-trip an edit (tag_id,
  // calendar_id) plus readable strings for the read-only details page.
  async getByIdForAdmin(
    id: string,
  ): Promise<ProductV2AdminDetailRow | null> {
    const { data, error } = await this.supabase
      .from("products_v2")
      .select(
        "*, topics_v2(id, slug, kind, topic_translations_v2(locale, name)), product_translations_v2(*), product_tags_v2(tag_id, tags_v2(slug, tag_translations_v2(locale, name))), product_prices_v2(currency, price_per_session, price_per_month), schedule_slots_v2(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type)), product_holiday_calendars_v2(calendar_id, holiday_calendars_v2(name))",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data as ProductV2AdminDetailRow;
  }

  async updateProduct(id: string, input: UpdateProductV2Input): Promise<string> {
    const { image, ...metadata } = input;

    const formData = new FormData();
    formData.append("data", JSON.stringify(metadata));
    // File = admin picked a new image to replace the current one.
    // null when there used to be an image but the admin cleared it OR
    //   when the product never had an image: the route distinguishes
    //   via the `clear_image` field below + the existing DB row.
    // string = "keep the existing path" — the route preserves it without
    //   trusting the string value (it re-reads the existing path from
    //   the DB and uses that).
    if (image instanceof File) {
      formData.append("file", image);
    } else if (image === null) {
      formData.append("clear_image", "true");
    }

    const response = await fetch(`/api/admin/products-v2/${id}/update`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to update product");
    }

    const { product_id } = (await response.json()) as { product_id: string };
    return product_id;
  }
}
