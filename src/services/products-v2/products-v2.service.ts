import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
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

export class ProductsV2Service {
  constructor(private supabase: SupabaseClient<Database>) {}

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
        "*, topics_v2(slug, kind, icon_path, topic_translations_v2(*)), product_translations_v2(*), product_tags_v2(tags_v2(slug, tag_translations_v2(*))), product_prices_v2(*), schedule_slots_v2(weekday, start_time, duration_minutes)"
      )
      .eq("product_type", type)
      .eq("is_visible", true)
      .in("status", ["pending", "running"])
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
  // RLS: parent-facing read; only `is_visible = true` AND status in
  // (pending, running) products are returned. Returns null on miss so the
  // page can render a clean "not found" state.
  async getDetailById(
    id: string,
  ): Promise<ProductV2DetailRow | null> {
    const { data, error } = await this.supabase
      .from("products_v2")
      .select(
        "*, topics_v2(slug, kind, icon_path, topic_translations_v2(*)), product_translations_v2(*), product_tags_v2(tags_v2(slug, tag_translations_v2(*))), product_prices_v2(*), schedule_slots_v2(weekday, start_time, duration_minutes), product_holiday_calendars_v2(holiday_calendars_v2(name, calendar_holidays_v2(date, reason)))",
      )
      .eq("id", id)
      .eq("is_visible", true)
      .in("status", ["pending", "running"])
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    type RawRow = ProductV2BrowseRow & {
      product_holiday_calendars_v2?: {
        holiday_calendars_v2: {
          name: string;
          calendar_holidays_v2: { date: string; reason: string | null }[];
        } | null;
      }[];
    };
    const row = data as unknown as RawRow;

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

    return {
      ...row,
      holidays,
    } as ProductV2DetailRow;
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
}
