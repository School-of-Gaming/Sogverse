import type {
  AppSupabaseClient,
  Product,
  ProductTranslation,
  ProductLongDescription,
  ProductType,
  ProductTopic,
  BillingMode,
  ProductStatus,
  ProductBrowseRow,
} from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";
import { effectiveStatus } from "@/lib/products/effective-status";

// `topic` is a column on Product (the product_topic enum) — its label is
// resolved client-side via PRODUCT_TOPICS, so no join is needed here.
export type ProductWithDetails = Product & {
  product_translations: ProductTranslation[];
};

// Parent-facing single-product detail. Shares the browse row's joins
// and adds a flattened `holidays` array — every (date, reason) pair
// pulled from the product's linked holiday calendars. The reason
// falls back to the calendar's `name` if the admin didn't set a
// per-date one. Consumed by the detail page calendar widget. The
// signup panel also reads `product_prices` off this row.
export type ProductDetailRow = ProductBrowseRow & {
  holidays: { date: string; reason: string }[];
};

// Admin-only single-product detail. Unlike ProductDetailRow this is
// NOT filtered on is_visible / status, so admins can fetch drafts and
// cancelled rows. Carries everything the form needs to round-trip an
// edit (holiday calendar IDs) plus readable strings the details page
// renders (location chain, holiday calendar names). The topic enum
// rides along on the base Product columns.
export type ProductAdminDetailRow = Product & {
  product_translations: ProductTranslation[];
  product_prices: {
    currency: string;
    price_cents: number;
  }[];
  schedule_slots: {
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
  product_holiday_calendars: {
    calendar_id: string;
    holiday_calendars: { name: string } | null;
  }[];
};

export type ProductTranslationInput = {
  locale: SupportedLocale;
  name: string;
  short_description: string;
  // null = no long description for this locale (the RPC stores SQL NULL).
  long_description: ProductLongDescription | null;
};

export type ScheduleSlotInput = {
  weekday: number;
  start_time: string;
  duration_minutes: number;
};

export type PriceInput = {
  currency: SupportedCurrency;
  price_cents: number;
};

// Shape accepted by /api/admin/products/create. Mirrors create_product()
// RPC args, minus the image (uploaded separately as the last step so a failed
// insert never leaves an orphan in the bucket — see docs/products-architecture.md).
//
// `translations` must contain at least one entry, and at least one of those
// entries must have locale 'en' or 'fi'. The RPC enforces the same rule;
// the form blocks submit before we get here.
export type CreateProductInput = {
  product_type: ProductType;
  billing_mode: BillingMode;
  translations: ProductTranslationInput[];
  topic: ProductTopic;
  min_age: number;
  max_age: number;
  spoken_language_code: string;
  padlet_url: string | null;
  location_id: string | null;
  is_remote: boolean;
  status: ProductStatus;
  signup_threshold: number | null;
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  seat_count: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string;
  is_visible: boolean;
  schedule_slots: ScheduleSlotInput[];
  prices: PriceInput[];
  holiday_calendar_ids: string[];
  image: File | null;
};

// Shape accepted by /api/admin/products/[id]/update. Mirrors
// update_product() RPC args. Differs from CreateProductInput in:
//   - no `product_type` (immutable; URL-locked)
//   - no `status` (preserved by the RPC; effective status re-derives
//     from the data fields this input edits)
//   - `image` accepts `string` ("keep existing path") in addition to
//     `File` (replace) and `null` (clear). The route reads the existing
//     `image_path` from the DB to decide what to do — string values
//     from the client are *not* trusted as-is; the route preserves the
//     existing path on its own when the client signals "no change."
export type UpdateProductInput = {
  billing_mode: BillingMode;
  translations: ProductTranslationInput[];
  topic: ProductTopic;
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
  prices: PriceInput[];
  holiday_calendar_ids: string[];
  image: File | string | null;
};

export class ProductsService {
  constructor(private supabase: AppSupabaseClient) {}

  async listByType(type: ProductType): Promise<ProductWithDetails[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select("*, product_translations(*)")
      .eq("product_type", type)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as ProductWithDetails[];
  }

  // Parent-facing list: only visible products in a parent-relevant lifecycle
  // state. RLS already restricts anon/customer reads to the same predicate
  // (per redesign §5.8) — the explicit filters here are defensive and let
  // admins (who can see everything) call this same hook from the public
  // pages without seeing draft/cancelled rows. Joins everything the browse
  // card needs in one round trip.
  //
  // The stored-status filter below keeps draft/cancelled/completed rows out,
  // but it can't catch a row stored as `running` whose `end_date` has already
  // passed — that product has finished and must not appear in the storefront.
  // There is no cron flipping stored status, so we make the call here in JS:
  // `effectiveStatus()` downgrades such a row to `completed` (or `expired`)
  // and we drop it. The comparison is date-only against the product's *own*
  // timezone (a finished-yesterday camp in Helsinki must not linger for a UTC
  // viewer — CLAUDE.md "Date & Time"); `effectiveStatus()` already projects
  // `now` into `product.timezone`. The active-participation count is irrelevant
  // to the ended decision (only `end_date` drives completed/expired), so 0 is
  // safe to pass.
  async listVisibleByTypes(types: ProductType[]): Promise<ProductBrowseRow[]> {
    const { data, error } = await this.supabase
      .from("products")
      .select(
        // `parent:parent_id(...)` (column-name form) embeds the parent row
        // via the FK on parent_id. The `locations!parent_id` form looks
        // like the same thing but PostgREST resolves it to the *children*
        // (rows whose parent_id points back here) and returns `[]` for
        // any leaf location — surfaces as "Foo, undefined" in the UI.
        "*, product_translations(*), product_prices(*), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type))"
      )
      .in("product_type", types)
      .eq("is_visible", true)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false });

    if (error) throw error;

    const now = new Date();
    return (data as ProductBrowseRow[]).filter((row) => {
      const status = effectiveStatus(row, now, 0);
      return status !== "completed" && status !== "expired";
    });
  }

  // Single-product detail fetch for the parent-facing detail page
  // (`/shop/[id]`). Returns the same shape as `listVisibleByTypes` plus a
  // flattened `holidays` array sourced from the linked holiday calendars —
  // that's everything the calendar widget and the signup panel need to render.
  //
  // RLS is the sole gate: a viewer reaches this row if either
  // `public_read_published_products` (visible + pending/running) OR
  // `purchaser_read_products` (active/waitlisted participation owned
  // by the viewer) lets them through. The detail page renders the
  // marketing layout for the former and the purchased layout for the
  // latter — both branches need the row, so no explicit `is_visible` /
  // status filters here. Returns null on miss so the page can render a
  // clean "not found" state.
  async getDetailById(
    id: string,
  ): Promise<ProductDetailRow | null> {
    const { data, error } = await this.supabase
      .from("products")
      .select(
        "*, product_translations(*), product_prices(*), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type)), product_holiday_calendars(holiday_calendars(name, calendar_holidays(date, reason)))",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    // One direct cast to the row shape we read — same pattern as
    // listVisibleByTypes above. `RawRow` extends ProductBrowseRow with
    // the holiday-calendars join included in this query's select.
    type RawRow = ProductBrowseRow & {
      product_holiday_calendars?: {
        holiday_calendars: {
          name: string;
          calendar_holidays: { date: string; reason: string | null }[];
        } | null;
      }[];
    };
    const row = data as RawRow;

    // Flatten linked-calendar holidays into a single array. Each row keeps
    // its per-date `reason` if the admin filled one in; otherwise the
    // calendar's own `name` is the fallback (e.g., "Finnish national
    // holidays" reads better than a blank row in the UI).
    const holidays: { date: string; reason: string }[] = [];
    for (const link of row.product_holiday_calendars ?? []) {
      const cal = link.holiday_calendars;
      if (!cal) continue;
      for (const h of cal.calendar_holidays) {
        holidays.push({ date: h.date, reason: h.reason ?? cal.name });
      }
    }

    return { ...row, holidays };
  }

  async createProduct(input: CreateProductInput): Promise<string> {
    const { image, ...metadata } = input;

    const formData = new FormData();
    formData.append("data", JSON.stringify(metadata));
    if (image) {
      formData.append("file", image);
    }

    const response = await fetch("/api/admin/products/create", {
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
  ): Promise<ProductAdminDetailRow | null> {
    const { data, error } = await this.supabase
      .from("products")
      .select(
        "*, product_translations(*), product_prices(currency, price_cents), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, type, parent:parent_id(id, name, type)), product_holiday_calendars(calendar_id, holiday_calendars(name))",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data as ProductAdminDetailRow;
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<string> {
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

    const response = await fetch(`/api/admin/products/${id}/update`, {
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
