import type {
  AppSupabaseClient,
  ProductType,
  ProductTopic,
  ProductTag,
  BillingMode,
  ProductStatus,
  SpokenLanguageCode,
} from "@/types";
import type { QueryData } from "@supabase/supabase-js";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  effectiveStatus,
  type LifecycleInputs,
} from "@/lib/products/effective-status";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import { productIdResponse } from "./products.contracts";

// ---------------------------------------------------------------------------
// Query builders + inferred row types. Each select lives in a standalone
// builder so its row type is derived via `QueryData<ReturnType<...>>` — the
// select string and the type can't drift (CLAUDE.md § "Verify generated
// nullability"). `!inner` recovers a non-null embed across a NOT-NULL FK;
// plain embeds (nullable FKs like `location_id`) stay nullable.
//
// `parent:parent_id(...)` (column-name form) embeds the parent location via
// the FK on parent_id. The `locations!parent_id` form looks like the same
// thing but PostgREST resolves it to the *children* (rows whose parent_id
// points back here) and returns `[]` for any leaf location — surfaces as
// "Foo, undefined" in the UI.
// ---------------------------------------------------------------------------

// The browse listing. `is_visible` is filtered HERE and nowhere in the database
// — that is what the column means: listed on the public browse pages. An
// unlisted product stays readable and purchasable through its own URL, so
// dropping this filter would publish products that were deliberately kept off
// the grid, and adding the same filter to a single-product read would break the
// direct link the unlisted state exists for.
//
// The filters live in one place and the *select* is the parameter, because two
// surfaces ask this same question of different amounts of the row (see
// `LOCATION_ONLY_SELECT` below). Forking the query would fork the visibility
// rule with it, and a visibility rule that exists twice is one that will
// eventually disagree with itself. The select is a generic literal so each
// caller's row type is still inferred from its own string.
function buildVisibleProductsQuery<Select extends string>(
  supabase: AppSupabaseClient,
  types: ProductType[],
  select: Select,
) {
  return supabase
    .from("products")
    .select(select)
    .in("product_type", types)
    .eq("is_visible", true)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false });
}

/**
 * Everything a browse card renders, in one round trip — and nothing else.
 *
 * Spelled out column by column rather than as `*`, because this listing is the
 * anon-readable one: it is what an unauthenticated `/shop` visitor is handed,
 * so every column here is a column we have decided to publish. `*` published
 * the three per-session operating fees and `created_by` to the open web purely
 * because they happened to sit on the same table, and it shipped the authored
 * long description — markdown, once per locale — to a grid of cards that render
 * a one-line summary. Roughly 40% of each row was reaching browsers that had no
 * use for it.
 *
 * The list is therefore a promise about *reads*, not just a size optimisation:
 * a browse surface that needs a new column adds it here deliberately, and the
 * compiler stops it at the call site until someone does. The long description
 * in particular belongs to the detail page alone, which asks its own query
 * (`buildProductDetailQuery`) and keeps `product_translations(*)`.
 */
const BROWSE_SELECT =
  "id, product_type, billing_mode, topic, tag, min_age, max_age, for_gamers, for_parents, spoken_language_code, image_path, is_remote, seat_count, waitlist_enabled, registration_opens_at, status, start_date, end_date, timezone, signup_threshold, product_translations(locale, name, short_description), product_prices(currency, price_cents), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type))";

/**
 * The same listing read by a caller that wants only *where* each product is:
 * the location embed, plus the five lifecycle columns `effectiveStatus()` needs
 * to finish the visibility filter in JS. None of the twenty columns a card
 * paints: no translations, no prices, no schedule slots.
 *
 * `/schools` is that caller — it groups municipality clubs by municipality and
 * reads nothing else off the row — and it is a landing page, so the difference
 * between this and the full row is most of its server fetch.
 */
const LOCATION_ONLY_SELECT =
  "status, start_date, end_date, signup_threshold, timezone, locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type))";

function buildBrowseQuery(supabase: AppSupabaseClient, types: ProductType[]) {
  return buildVisibleProductsQuery(supabase, types, BROWSE_SELECT);
}

function buildVisibleLocationsQuery(
  supabase: AppSupabaseClient,
  types: ProductType[],
) {
  return buildVisibleProductsQuery(supabase, types, LOCATION_ONLY_SELECT);
}

// The half of the visibility rule the database cannot answer, shared by every
// caller of the listing above so the two selects can never disagree about what
// is on sale.
//
// The stored-status filter in the query keeps cancelled/completed rows out, but
// it can't catch a row stored as `running` whose `end_date` has already passed
// — that product has finished and must not appear in the storefront. There is
// no cron flipping stored status, so the call is made here in JS:
// `effectiveStatus()` downgrades such a row to `completed` (or `expired`) and
// we drop it. The comparison is date-only against the product's *own* timezone
// (a finished-yesterday camp in Helsinki must not linger for a UTC viewer —
// CLAUDE.md "Date & Time"); `effectiveStatus()` already projects `now` into
// `product.timezone`. The active-participation count is irrelevant to the ended
// decision (only `end_date` drives completed/expired), so 0 is safe to pass.
function dropEndedProducts<Row extends LifecycleInputs>(rows: Row[]): Row[] {
  const now = new Date();
  return rows.filter((row) => {
    const status = effectiveStatus(row, now, 0);
    return status !== "completed" && status !== "expired";
  });
}

// Joined shape consumed by the parent-facing browse pages
// (src/components/public/products/product-browse-page.tsx) and re-exported
// from `@/types` so consumers import it there. The card renderer expects
// everything it needs in one row — the topic enum (label resolved via
// PRODUCT_TOPICS), the card's translated name and summary per locale, prices
// per currency, weekly schedule slots, and the joined location for in-person
// products. (`topic` is a column on Product, so no join is needed.)
//
// It is narrower than the products table on purpose (see `BROWSE_SELECT`), so
// it is not the type to reach for when a surface needs a whole product row —
// the detail and admin rows below are.
export type ProductBrowseRow = QueryData<
  ReturnType<typeof buildBrowseQuery>
>[number];

/**
 * The narrow half of the same listing: a visible product's location embed and
 * nothing a card would render. Consumed by `/schools`, which turns each club
 * into the municipality it belongs to and never opens the row any further.
 */
export type ProductLocationRow = QueryData<
  ReturnType<typeof buildVisibleLocationsQuery>
>[number];

function buildProductDetailQuery(supabase: AppSupabaseClient, id: string) {
  return supabase
    .from("products")
    .select(
      "*, product_translations(*), product_prices(*), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type)), product_holiday_calendars(holiday_calendars(name, calendar_holidays(date, reason)))",
    )
    .eq("id", id)
    .maybeSingle();
}

// The admin form is the one read path allowed to see the staff-only half of a
// product, so it is the one query that embeds `product_staff_details`. The embed
// is a to-one (its product_id is both primary and foreign key) and it is sparse —
// a product with no lesson link has no row, which arrives here as `null`. The
// family-facing queries above deliberately do not embed it: `products` is
// anon-readable and the whole point of the separate table is that a `select=*`
// against it cannot reach the link.
//
// `product_images(label, path)` is the second admin-only embed, and it is what
// lets the form's image card paint the selected entry — its picture and the
// name an admin gave it — from the read the page already makes. A nullable FK,
// so it arrives as `null` for a product with no picture. Family surfaces never
// need it: they read the derived `image_path` column, which is what the
// catalogue table exists to feed.
//
// It is unhinted, and it can only stay unhinted while `image_id` is the ONLY
// relationship between these two tables. A second foreign key — an FK on the
// derived `image_path` column is the tempting one — makes this embed ambiguous
// and PostgREST refuses the whole query with PGRST201, which the admin product
// page shows as "product not found". The header of the migration that chose
// not to add that key (supabase/migrations/00198) records the reasoning.
function buildAdminProductQuery(supabase: AppSupabaseClient, id: string) {
  return supabase
    .from("products")
    .select(
      "*, product_images(label, path), product_staff_details(material_url), product_translations(*), product_prices(currency, price_cents), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type)), product_holiday_calendars(calendar_id, holiday_calendars(name))",
    )
    .eq("id", id)
    .maybeSingle();
}

// Admin per-type list. Carries the translations the row renders plus the
// weekly schedule slots — clubs that differ only by weekday are otherwise
// indistinguishable in the list without opening each one. The slot shape
// (`weekday, start_time, duration_minutes`) matches what
// `formatProductSchedule` consumes, so the list reuses the same schedule
// formatter as the browse card. `product_type`, `start_date`, `end_date`,
// `timezone`, `location_id` and `spoken_language_code` come from `*` (columns
// on Product). `gedu_group_assignments(gedu_id)` is embedded for the admin
// club-list filter on assigned educator; the rows the list renders ignore it,
// so it's inert for camps/events. The embed is keyed off the assignment's own
// `product_id` FK, so it spans every group on the product — an empty array
// means no educator is assigned anywhere.
//
// The location embed carries one level of parent, which is exactly what the
// admin club list's municipality filter needs: an online municipality club
// points at the municipality itself, an in-person one at a site whose parent
// is that municipality. Riding on this query is what lets that filter answer
// the question without reading the locations table.
function buildProductsByTypeQuery(
  supabase: AppSupabaseClient,
  type: ProductType,
) {
  return supabase
    .from("products")
    .select(
      "*, product_translations(*), schedule_slots(weekday, start_time, duration_minutes), gedu_group_assignments(gedu_id), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type))",
    )
    .eq("product_type", type)
    .order("created_at", { ascending: false });
}

// `topic` is a column on Product (the product_topic enum) — its label is
// resolved client-side via PRODUCT_TOPICS, so no join is needed here.
export type ProductWithDetails = QueryData<
  ReturnType<typeof buildProductsByTypeQuery>
>[number];

// Parent-facing single-product detail, inferred from its own query rather than
// from the browse row: one page reading one product can afford the whole row,
// and it renders things a card never does — the authored long description above
// all. Deriving it from the browse row is what used to force `BROWSE_SELECT` to
// stay wide, so the two are deliberately independent now.
//
// The junction embed is dropped from the public shape because the service
// flattens it: `holidays` is every (date, reason) pair pulled from the linked
// calendars, with the calendar's own `name` standing in where the admin set no
// per-date reason. Consumed by the detail page calendar widget; the signup panel
// also reads `product_prices` off this row.
export type ProductDetailRow = Omit<
  NonNullable<QueryData<ReturnType<typeof buildProductDetailQuery>>>,
  "product_holiday_calendars"
> & {
  holidays: { date: string; reason: string }[];
};

// Admin-only single-product detail, inferred from buildAdminProductQuery
// (`NonNullable` strips the `maybeSingle()` `| null`). Unlike the browse row
// this is NOT filtered on listing or status, so admins can fetch unlisted and
// cancelled rows alike. Carries the IDs the form needs to round-trip an edit
// plus readable strings (location chain, holiday calendar names).
export type ProductAdminDetailRow = NonNullable<
  QueryData<ReturnType<typeof buildAdminProductQuery>>
>;

export type ProductTranslationInput = {
  locale: SupportedLocale;
  name: string;
  short_description: string;
  // The marketing blurb as authored markdown; null = no long description for
  // this locale (the RPC stores SQL NULL).
  long_description: string | null;
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

/**
 * What the create/update routes answer with. `product_id` is the write; a
 * `warning` beside it means the product was saved and its picture was not
 * linked (see products.contracts.ts). Both are returned rather than the id
 * alone so a caller can tell the admin their picture did not take — the save
 * itself succeeded, so this is never an error.
 */
export type ProductWriteResult = {
  product_id: string;
  warning?: string;
};

// Shape accepted by /api/admin/products/create. Mirrors create_product() RPC
// args, plus `image_id` — which the route writes in a second statement after
// the RPC rather than through it (see docs/products-architecture.md).
//
// `translations` must contain at least one entry, and at least one of those
// entries must have locale 'en' or 'fi'. The RPC enforces the same rule;
// the form blocks submit before we get here.
export type CreateProductInput = {
  product_type: ProductType;
  billing_mode: BillingMode;
  translations: ProductTranslationInput[];
  topic: ProductTopic;
  /**
   * Audience. At least one must be true (DB CHECK), and the ages below are
   * present exactly when `for_gamers` is. Both travel on every call — the RPC
   * parameters are non-defaulted so an omission cannot quietly reset them.
   */
  for_gamers: boolean;
  for_parents: boolean;
  /** Null on a product with no gamer audience — never a sentinel adult range. */
  min_age: number | null;
  max_age: number | null;
  /**
   * Who the product was *designed* for — a different question from the audience
   * above, which says who may hold a seat. One tag or none: `null` is untagged,
   * the ordinary state, and it renders nothing on any family surface.
   *
   * Required on the type, and nullable — never optional. The wire schema demands
   * the field for the same reason (see products.contracts.ts): the RPC parameter
   * is `DEFAULT NULL`, so an omitted tag would clear a product's tag rather than
   * leave it alone. Making the field mandatory here is what forces every builder
   * to state the answer.
   */
  tag: ProductTag | null;
  /**
   * The one country whose families may enrol, as an ISO 3166-1 alpha-2 code —
   * `null`, the ordinary state, means no lock. Required and nullable for the
   * same reason `tag` is: the RPC parameter is `DEFAULT NULL`, so an omitted
   * field would clear a lock rather than leave it alone.
   *
   * **Enforced in the UI alone, by design.** The shop's signup panel refuses to
   * open for a parent whose self-attested location is elsewhere, and nothing
   * behind it re-checks: a location the blocked party can rewrite in their own
   * settings is not something a server-side gate could actually guarantee. A
   * family already enrolled keeps its seat if it later moves. Known and
   * accepted — see the column comment in migration 00193.
   */
  region_lock_country: string | null;
  spoken_language_code: SpokenLanguageCode;
  /**
   * Gedu/admin-only lesson material. Never rendered to a family — and not a
   * column on `products`, which is anon-readable by column selection. The RPC
   * files it in `product_staff_details`; blank or null means no row there.
   */
  material_url: string | null;
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
  // Per-session operating fees in integer cents. null = unknown/none,
  // 0 = volunteer, > 0 = a fee (see products.contracts.ts).
  primary_gedu_fee_cents: number | null;
  assistant_gedu_fee_cents: number | null;
  municipality_fee_cents: number | null;
  /**
   * The catalogue entry this product's picture comes from, or `null` for a
   * product with no picture. Required and nullable for the same reason `tag`
   * is: the route writes the column on every save, so an omitted field would
   * be indistinguishable from "remove the picture".
   *
   * Never a file and never a path. Entries are uploaded through the catalogue's
   * own route before a product is saved, and the served `image_path` column is
   * derived from this id by a database trigger.
   */
  image_id: string | null;
};

// Shape accepted by /api/admin/products/[id]/update. Mirrors
// update_product() RPC args. Differs from CreateProductInput in:
//   - no `product_type` (immutable; URL-locked)
//   - no `status` (preserved by the RPC; effective status re-derives
//     from the data fields this input edits)
export type UpdateProductInput = {
  billing_mode: BillingMode;
  translations: ProductTranslationInput[];
  topic: ProductTopic;
  /** Audience — see CreateProductInput. */
  for_gamers: boolean;
  for_parents: boolean;
  /** Null on a product with no gamer audience — never a sentinel adult range. */
  min_age: number | null;
  max_age: number | null;
  /** Design tag — see CreateProductInput. Required and nullable on the update
   *  half too, and that is the load-bearing one: the RPC assigns every editable
   *  column, so an omitted tag clears the stored one. */
  tag: ProductTag | null;
  /** Region lock — see CreateProductInput. Required and nullable on the update
   *  half too, and that is the load-bearing one: the RPC assigns every editable
   *  column, so an omitted code unlocks the product. */
  region_lock_country: string | null;
  spoken_language_code: SpokenLanguageCode;
  /**
   * Gedu/admin-only lesson material. Never rendered to a family — and not a
   * column on `products`, which is anon-readable by column selection. The RPC
   * files it in `product_staff_details`; blank or null means no row there.
   */
  material_url: string | null;
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
  // Per-session operating fees in integer cents — see CreateProductInput.
  primary_gedu_fee_cents: number | null;
  assistant_gedu_fee_cents: number | null;
  municipality_fee_cents: number | null;
  /** Catalogue entry id, or `null` for no picture — see CreateProductInput.
   *  Required and nullable on the update half too, and that is the
   *  load-bearing one: the route writes the column on every save. */
  image_id: string | null;
};

export class ProductsService {
  constructor(private supabase: AppSupabaseClient) {}

  async listByType(type: ProductType): Promise<ProductWithDetails[]> {
    const { data, error } = await buildProductsByTypeQuery(this.supabase, type);

    if (error) throw error;
    return data;
  }

  // Parent-facing list: only visible products in a parent-relevant lifecycle
  // state. RLS already restricts anon/customer reads to the same predicate
  // (per redesign §5.8) — the explicit filters in the query are defensive and
  // let admins (who can see everything) call this same hook from the public
  // pages without seeing cancelled rows. Joins everything the browse card
  // needs in one round trip.
  async listVisibleByTypes(types: ProductType[]): Promise<ProductBrowseRow[]> {
    const { data, error } = await buildBrowseQuery(this.supabase, types);

    if (error) throw error;
    return dropEndedProducts(data);
  }

  // The same listing, narrowed to each product's location. `/schools` groups
  // municipality clubs by municipality and reads nothing else off the row, so
  // it pays for the location embed and the lifecycle columns and for nothing
  // else — see `LOCATION_ONLY_SELECT`.
  //
  // Same query shape and same effective-status pass as the full read above, on
  // purpose: what is visible must not depend on how much of the row a caller
  // asked for.
  async listVisibleLocationsByTypes(
    types: ProductType[],
  ): Promise<ProductLocationRow[]> {
    const { data, error } = await buildVisibleLocationsQuery(
      this.supabase,
      types,
    );

    if (error) throw error;
    return dropEndedProducts(data);
  }

  // Single-product detail fetch for the parent-facing detail page
  // (`/shop/[id]`). Returns the same shape as `listVisibleByTypes` plus a
  // flattened `holidays` array sourced from the linked holiday calendars —
  // that's everything the calendar widget and the signup panel need to render.
  //
  // RLS is the sole gate: a viewer reaches this row if the product is in a
  // published status (pending/running — listed or not, which is the point of
  // the direct link) OR they hold an active/waitlisted participation on it.
  // The detail page renders the marketing layout for the former and the
  // purchased layout for the latter — both branches need the row, so there are
  // deliberately no listing or status filters here. Returns null on miss so the
  // page can render a clean "not found" state.
  async getDetailById(
    id: string,
  ): Promise<ProductDetailRow | null> {
    const { data, error } = await buildProductDetailQuery(this.supabase, id);

    if (error) throw error;
    if (!data) return null;

    // Flatten linked-calendar holidays into a single array. Each row keeps
    // its per-date `reason` if the admin filled one in; otherwise the
    // calendar's own `name` is the fallback (e.g., "Finnish national
    // holidays" reads better than a blank row in the UI).
    const holidays: { date: string; reason: string }[] = [];
    for (const link of data.product_holiday_calendars) {
      // `holiday_calendars` is non-null — the junction's `calendar_id` is a
      // NOT-NULL FK, so the inferred embed can't be null (the old hand-written
      // raw type over-declared it nullable).
      const cal = link.holiday_calendars;
      for (const h of cal.calendar_holidays) {
        holidays.push({ date: h.date, reason: h.reason ?? cal.name });
      }
    }

    return { ...data, holidays };
  }

  // Plain JSON both ways. The picture travels as the id of a catalogue entry
  // that already exists, so there is no file on this request and no multipart
  // encoding to arrange.
  async createProduct(
    input: CreateProductInput,
  ): Promise<ProductWriteResult> {
    const response = await fetch("/api/admin/products/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to create product"),
      );
    }

    return parseJsonResponse(response, productIdResponse);
  }

  // Admin-only single-product fetch. Same join shape as getDetailById, read
  // through the admin branch of the product read predicate, so an admin sees
  // every row — unlisted, cancelled and completed included. Carries the IDs the
  // form needs to round-trip an edit (tag_id, calendar_id) plus readable
  // strings for the read-only details page.
  async getByIdForAdmin(
    id: string,
  ): Promise<ProductAdminDetailRow | null> {
    const { data, error } = await buildAdminProductQuery(this.supabase, id);

    if (error) throw error;
    return data;
  }

  async updateProduct(
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductWriteResult> {
    const response = await fetch(`/api/admin/products/${id}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to update product"),
      );
    }

    return parseJsonResponse(response, productIdResponse);
  }
}
