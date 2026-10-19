import type {
  AppSupabaseClient,
  ProductType,
  ProductTopic,
  ProductTag,
  BillingMode,
  SpokenLanguageCode,
  MarketingConsentType,
  GamerPhotoConsentType,
} from "@/types";
import type { QueryData } from "@supabase/supabase-js";
import { z } from "zod";
import { escapeLikePattern } from "@/lib/utils";
import {
  keysetPage,
  quoteFilterValue,
  type KeysetCursor,
} from "@/lib/supabase/keyset";
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
import {
  plannedSessionRows,
  type PlannedSession,
} from "@/lib/planned-sessions";
import {
  productIdResponse,
  productListFacetsRow,
  type ProductListFacetsRow,
} from "./products.contracts";

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
  "id, product_type, billing_mode, topic, tag, min_age, max_age, for_gamers, for_parents, spoken_language_code, image_path, is_remote, seat_count, waitlist_enabled, registration_opens_at, start_date, end_date, timezone, product_translations(locale, name, short_description), product_prices(currency, price_cents), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type))";

/**
 * The same listing read by a caller that wants only *where* each product is:
 * the location embed, plus the three lifecycle columns `effectiveStatus()`
 * needs to finish the visibility filter in JS. None of the twenty columns a card
 * paints: no translations, no prices, no schedule slots.
 *
 * `/schools` is that caller — it groups municipality clubs by municipality and
 * reads nothing else off the row — and it is a landing page, so the difference
 * between this and the full row is most of its server fetch.
 */
const LOCATION_ONLY_SELECT =
  "start_date, end_date, timezone, locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type))";

/**
 * The same listing read by a caller that wants only *which* products are on it
 * and the languages each is written in: the sitemap, which lists a listed
 * product's page once per language written, and the product page, which asks
 * whether its own product is on the listing. The three lifecycle columns are
 * what `effectiveStatus()` needs to finish the visibility filter in JS.
 */
const LISTING_SELECT =
  "id, start_date, end_date, timezone, product_translations(locale)";

function buildBrowseQuery(supabase: AppSupabaseClient, types: ProductType[]) {
  return buildVisibleProductsQuery(supabase, types, BROWSE_SELECT);
}

function buildListingQuery(supabase: AppSupabaseClient, types: ProductType[]) {
  return buildVisibleProductsQuery(supabase, types, LISTING_SELECT);
}

function buildVisibleLocationsQuery(
  supabase: AppSupabaseClient,
  types: ProductType[],
) {
  return buildVisibleProductsQuery(supabase, types, LOCATION_ONLY_SELECT);
}

// The half of the visibility rule the query does not make, shared by every
// caller of the listing above so the two selects can never disagree about what
// is on sale.
//
// A product that has finished must not appear in the storefront, and "finished"
// is a date question the row answers for itself. The comparison is date-only
// against the product's *own* timezone (a finished-yesterday camp in Helsinki
// must not linger for a UTC viewer — CLAUDE.md "Date & Time"), which is what
// `effectiveStatus()` does: it projects `now` into `product.timezone`. A
// `.lte()` on `end_date` could not do this: the cut-off is per row, because it
// is each product's own local calendar day.
function dropEndedProducts<Row extends LifecycleInputs>(rows: Row[]): Row[] {
  const now = new Date();
  return rows.filter((row) => effectiveStatus(row, now) !== "completed");
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

/**
 * A listed product's id and the languages it is written in — nothing a card
 * would render. Consumed by the sitemap.
 */
export type ProductListingRow = QueryData<
  ReturnType<typeof buildListingQuery>
>[number];

function buildProductDetailQuery(supabase: AppSupabaseClient, id: string) {
  return supabase
    .from("products")
    .select(
      "*, product_translations(*), product_prices(*), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type)), product_required_consents(document_slug), product_marketing_consents(consent_type), product_gamer_photo_consents(consent_type)",
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
// `catalogue_images(label, path)` is the second admin-only embed, and it is what
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
// page shows as "product not found". That is why `image_path` carries no FK of
// its own — see `src/services/catalogue-images/CLAUDE.md`.
//
// `product_holiday_calendars(holiday_calendars(id, name))` is the third: the
// calendars a club follows, with each one's name so the details page can list
// and link them and the form can seed its picker. Calendar names are
// admin-readable only, which is why no family-facing query embeds it.
//
// `creator:profiles!products_created_by_fkey(id, first_name, last_name)` is the
// admin who created the product, which the details page names and links. It is
// hinted because products and profiles meet over more than one path, and it is
// deliberately not `!inner`: a creator whose profile the reader cannot see must
// leave the product readable with the creator unknown, never make the whole
// product read as "not found".
//
// `invoice_customer:invoice_customers!products_invoice_customer_id_fkey(id,
// invoice_name, fennoa_customer_no)` is the Fennoa buyer a municipality club is
// invoiced to — only the three fields the details page names and links, never
// the billing address, which belongs to the invoicing page. It rides on this
// read so the name paints with the rest of the details rather than a round trip
// later. The foreign key is nullable, so the embed is `null` on every product
// with no customer, which is every type but a municipality club.
function buildAdminProductQuery(supabase: AppSupabaseClient, id: string) {
  return supabase
    .from("products")
    .select(
      "*, catalogue_images(label, path), product_staff_details(material_url), product_translations(*), product_prices(currency, price_cents), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type)), product_required_consents(document_slug), product_marketing_consents(consent_type), product_gamer_photo_consents(consent_type), product_holiday_calendars(holiday_calendars(id, name)), creator:profiles!products_created_by_fkey(id, first_name, last_name), invoice_customer:invoice_customers!products_invoice_customer_id_fkey(id, invoice_name, fennoa_customer_no)",
    )
    .eq("id", id)
    .maybeSingle();
}

// The two admin product list reads below share one row: the translations a
// row renders (the three columns it reads, never `*` — the long description is
// most of a translation's bytes and no list renders it), the weekly schedule
// slots in the shape `formatProductSchedule` consumes (clubs that differ only
// by weekday are otherwise indistinguishable without opening each one), and
// the location with one level of parent, which is enough to name a product's
// municipality: an online municipality club points at the municipality itself,
// an in-person one at a site whose parent is that municipality. Each builder
// spells its select out as a literal, because the row type is inferred from it.

// Every product of one type, newest first — the admin's club-switch picker.
function buildProductsByTypeQuery(
  supabase: AppSupabaseClient,
  type: ProductType,
) {
  return supabase
    .from("products")
    .select(
      "*, product_translations(locale, name, short_description), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type))",
    )
    .eq("product_type", type)
    .order("created_at", { ascending: false });
}

/**
 * The admin product list's read: the same row, plus three empty embeds that
 * exist only to be filtered on.
 *
 * An empty embed (`alias:table()`) puts nothing in the response; paired with a
 * `not.is.null` filter on its alias it keeps only the products that have a
 * matching child row. That is how a filter over a product's *children* — any of
 * its names, any of its weekdays, its location — stays one ordinary PostgREST
 * parameter on the products read, ANDed with the rest, rather than a second
 * query. Each is aliased apart from the embed the row renders, because a filter
 * on that one would narrow the rendered children too: a club on Monday and
 * Wednesday filtered to Monday must still show both days. The gedu filter is
 * not an embed, because a gedu's seat lives in one of two tables; the page read
 * says how it narrows instead.
 *
 * It reads `products` itself rather than a view so the row type stays the
 * table's own: a view's columns all come back nullable, and the row renders
 * most of them.
 *
 * The order, the resume filter and the limit are `keysetPage`'s.
 */
function buildAdminProductListQuery(
  supabase: AppSupabaseClient,
  withCount: boolean,
) {
  return supabase
    .from("products")
    .select(
      "*, product_translations(locale, name, short_description), schedule_slots(weekday, start_time, duration_minutes), locations(id, name, name_i18n, type, parent:parent_id(id, name, name_i18n, type)), name_match:product_translations(), day_match:schedule_slots(), municipality_match:locations()",
      withCount ? { count: "exact" } : undefined,
    );
}

// `topic` is a column on Product (the product_topic enum) — its label is
// resolved client-side via PRODUCT_TOPICS, so no join is needed here.
export type ProductWithDetails = QueryData<
  ReturnType<typeof buildProductsByTypeQuery>
>[number];

/** One row of the admin product list. */
export type AdminProductListRow = QueryData<
  ReturnType<typeof buildAdminProductListQuery>
>[number];

/**
 * How many products one page of the admin product list carries: a screenful
 * and a little, so the first page fills the viewport and there is something to
 * scroll through. The hook decides "there is more" from a page coming back
 * shorter than this, so the read and the hook share this one constant.
 */
export const ADMIN_PRODUCT_LIST_PAGE_SIZE = 25;

/**
 * Which products one page of the admin product list is about. Every field
 * narrows the same read, as its own PostgREST parameter the database ANDs.
 */
export interface AdminProductListFilters {
  /** One product type, or null for every type. */
  type: ProductType | null;
  /**
   * What the admin typed, trimmed; empty is "no search". Matched as a
   * case-insensitive substring of any one of the product's names, in every
   * locale — an admin may have typed the English name while reading the list
   * in Finnish.
   */
  search: string;
  /** A weekday the product must be scheduled on (0 = Monday), or null. */
  weekday: number | null;
  /**
   * A gedu holding a standing seat on any group of the product — assigned
   * (primary or assistant) or a trainee — or null.
   */
  geduId: string | null;
  /** The language the product is delivered in, or null. */
  spokenLanguage: SpokenLanguageCode | null;
  /** The municipality the product sits in, or null. */
  municipalityId: string | null;
}

/** One keyset page of the admin product list. */
export interface AdminProductListPage {
  /** The page's rows, newest first. */
  rows: AdminProductListRow[];
  /**
   * How many products match the filters — on the first page only, `null`
   * after it. The count cannot change as the reader scrolls, so it is asked
   * once rather than paid for per page; `null` means "not asked", never
   * "none".
   */
  total: number | null;
}

// Parent-facing single-product detail, inferred from its own query rather than
// from the browse row: one page reading one product can afford the whole row,
// and it renders things a card never does — the authored long description above
// all. Deriving it from the browse row is what used to force `BROWSE_SELECT` to
// stay wide, so the two are deliberately independent now. The signup panel reads
// `product_prices` off this row.
export type ProductDetailRow = NonNullable<
  QueryData<ReturnType<typeof buildProductDetailQuery>>
>;

// Admin-only single-product detail, inferred from buildAdminProductQuery
// (`NonNullable` strips the `maybeSingle()` `| null`). Unlike the browse row
// this is NOT filtered on listing, so admins can fetch an unlisted product and
// a long-finished one alike. Carries the IDs the form needs to round-trip an
// edit plus readable strings (the location chain).
//
// `creator` is widened to admit `null`. The generator reads the NOT NULL foreign
// key and types the embed as always present, but the embed is a left join under
// the profiles table's own row security: a creator the reader cannot see arrives
// as `null`, and the details page shows the creator as unknown in that case.
type AdminProductQueryRow = NonNullable<
  QueryData<ReturnType<typeof buildAdminProductQuery>>
>;
export type ProductAdminDetailRow = Omit<AdminProductQueryRow, "creator"> & {
  creator: AdminProductQueryRow["creator"] | null;
};

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
// the RPC rather than through it (see docs/architecture/products.md).
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
   * accepted — see the column's own comment in
   * `supabase/schema/tables/products.sql`.
   */
  region_lock_country: string | null;
  /**
   * Does every member of this product owe a creation — a link to the thing they
   * made — by the time it ends? An admin decision, deliberately not derived
   * from `topic`: not every Roblox-Studio product is sponsored, so a contract
   * obligation is stated rather than inferred.
   *
   * Staff-facing only: a family sees nothing different on a flagged product,
   * and what the flag changes is signals (the final session's completeness
   * gains a fourth condition), never the authoring surface.
   *
   * Required and non-nullable, and the update half is again the load-bearing
   * one: the RPC assigns this column on every call and its parameter defaults
   * to **false**, so an omitted field would unflag a product rather than leave
   * it alone.
   */
  requires_gamer_creations: boolean;
  spoken_language_code: SpokenLanguageCode;
  /**
   * Gedu/admin-only lesson material. Never rendered to a family — and not a
   * column on `products`, which is anon-readable by column selection. The RPC
   * files it in `product_staff_details`; blank or null means no row there.
   */
  material_url: string | null;
  location_id: string | null;
  is_remote: boolean;
  start_date: string;
  end_date: string | null;
  timezone: string;
  seat_count: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string;
  is_visible: boolean;
  schedule_slots: ScheduleSlotInput[];
  prices: PriceInput[];
  /**
   * The consent documents a parent must agree to before enrolling, as slugs
   * from `consent_documents`. Empty on almost every product — the Roblox
   * programme is what this exists for.
   *
   * A plain array rather than the required-nullable shape `tag` and
   * `region_lock_country` take: an empty array already says "requires nothing",
   * and the RPC reads NULL and `[]` identically, so there is no second answer a
   * null would express.
   */
  required_consent_slugs: string[];
  /**
   * The marketing consents this product's signup panel ASKS a parent about —
   * never requires. Empty on almost every product; the Lynx Educate partnership
   * is what it exists for.
   *
   * A plain array for the same reason the slugs above are one: an empty array
   * already says "asks nothing", and the writer behind it reads NULL and `[]`
   * identically. The route calls that writer *after* the product RPC, because
   * the set is keyed on a product id the RPC is what produces.
   */
  marketing_consent_types: MarketingConsentType[];
  /**
   * The photo consents this product's signup panel ASKS a parent about — never
   * requires. The marketing field's twin above, with the subject changed from
   * the answering adult's mailbox to a child's image, and a plain array for the
   * same reason: an empty array already says "asks nothing", and the writer
   * behind it reads NULL and `[]` identically. Written by the route in its own
   * call after the product RPC, because the set is keyed on a product id the
   * RPC is what produces.
   */
  gamer_photo_consent_types: GamerPhotoConsentType[];
  // Per-session operating fees in integer cents. null = unknown/none,
  // 0 = volunteer, > 0 = a fee (see products.contracts.ts).
  primary_gedu_fee_cents: number | null;
  assistant_gedu_fee_cents: number | null;
  municipality_fee_cents: number | null;
  /**
   * The Fennoa customer a municipality club is invoiced to, or `null` where
   * nobody has agreed who pays yet — the ordinary state at creation, and the
   * one the invoicing page flags before a file can be produced.
   *
   * Per club and never derived from the club's location: one city can be two
   * customers, and an association can buy clubs sited in a municipality it is
   * not. Required and nullable for the same reason `tag` is — the RPC parameter
   * is `DEFAULT NULL`, so an omitted field would unlink a club rather than
   * leave it alone. A non-municipality product may not carry one at all, which
   * the database's own CHECK refuses.
   */
  invoice_customer_id: string | null;
  /**
   * The holiday calendars this club follows, as calendar row ids; empty for a
   * club that follows none and for every other product type. A plain array
   * that travels on every save: the RPC replaces the whole set on each call and
   * reads NULL and `[]` alike, so an omission would detach every calendar. Only
   * the two club types may follow one, which the RPC refuses otherwise.
   */
  holiday_calendar_ids: string[];
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
// update_product() RPC args. Differs from CreateProductInput in one field:
//   - no `product_type` (immutable; URL-locked)
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
  /** Creation requirement — see CreateProductInput. Required on the update half
   *  too, and that is the load-bearing one: the RPC assigns every editable
   *  column and this parameter defaults to false, so an omitted answer unflags
   *  the product. */
  requires_gamer_creations: boolean;
  spoken_language_code: SpokenLanguageCode;
  /**
   * Gedu/admin-only lesson material. Never rendered to a family — and not a
   * column on `products`, which is anon-readable by column selection. The RPC
   * files it in `product_staff_details`; blank or null means no row there.
   */
  material_url: string | null;
  location_id: string | null;
  is_remote: boolean;
  start_date: string;
  end_date: string | null;
  timezone: string;
  seat_count: number | null;
  waitlist_enabled: boolean;
  registration_opens_at: string;
  is_visible: boolean;
  schedule_slots: ScheduleSlotInput[];
  prices: PriceInput[];
  /** Required consent document slugs — see CreateProductInput. The update half
   *  is the load-bearing one: the RPC replaces the whole requirement set on
   *  every call, so the answer has to travel on every save. */
  required_consent_slugs: string[];
  /** Marketing consents the panel asks about — see CreateProductInput. The
   *  update half is the load-bearing one for the same reason: the writer
   *  replaces the whole ask set on every call, so the answer has to travel on
   *  every save. */
  marketing_consent_types: MarketingConsentType[];
  /** Photo consents the panel asks about — see CreateProductInput. The update
   *  half is the load-bearing one for the same reason: the writer replaces the
   *  whole ask set on every call, so the answer has to travel on every save. */
  gamer_photo_consent_types: GamerPhotoConsentType[];
  // Per-session operating fees in integer cents — see CreateProductInput.
  primary_gedu_fee_cents: number | null;
  assistant_gedu_fee_cents: number | null;
  municipality_fee_cents: number | null;
  /** The club's Fennoa invoice customer — see CreateProductInput. Required and
   *  nullable on the update half too, and that is the load-bearing one: the RPC
   *  assigns every editable column, so an omitted id unlinks the club. */
  invoice_customer_id: string | null;
  /** The club's holiday calendars — see CreateProductInput. The update half
   *  is the load-bearing one: the RPC replaces the whole set on every call, so
   *  an omitted answer would detach every calendar the club follows. */
  holiday_calendar_ids: string[];
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

  /**
   * One keyset page of the admin product list, filtered as the admin asked.
   *
   * Listing and filtering are one read: the type, the language and the
   * filters over a product's children are each an ordinary PostgREST
   * parameter the database ANDs, and `keysetPage` owns the order, the resume
   * filter and the limit — and with them the query's only top-level `or`,
   * which is why the municipality filter's `or` is scoped to its embed. The
   * gedu filter alone costs a small read first — the products the gedu is
   * seated on — and then narrows the list to those ids, ANDed like the rest.
   */
  async getAdminListPage(
    filters: AdminProductListFilters,
    { cursor }: { cursor?: KeysetCursor } = {},
  ): Promise<AdminProductListPage> {
    // Asked on the first page only: an aggregate over the whole match set
    // cannot change as the reader scrolls.
    const withCount = cursor === undefined;
    let query = buildAdminProductListQuery(this.supabase, withCount);

    if (filters.type !== null) query = query.eq("product_type", filters.type);
    if (filters.spokenLanguage !== null) {
      query = query.eq("spoken_language_code", filters.spokenLanguage);
    }

    // PostgREST reads `*` in an ilike pattern as a wildcard before SQL sees it,
    // and there is no escaping it — so it is dropped rather than left to match
    // every name. No product is named with one.
    const needle = filters.search.replaceAll("*", "").trim();
    if (needle !== "") {
      query = query
        .ilike("name_match.name", `%${escapeLikePattern(needle)}%`)
        .not("name_match", "is", null);
    }
    if (filters.weekday !== null) {
      query = query
        .eq("day_match.weekday", filters.weekday)
        .not("day_match", "is", null);
    }
    if (filters.geduId !== null) {
      query = query.in("id", await this.geduSeatProductIds(filters.geduId));
    }
    if (filters.municipalityId !== null) {
      // The location itself when it is the municipality, or the site under it.
      // Quoted, because the id comes off the URL and the `or` grammar reserves
      // characters a hand-edited one could carry.
      const id = quoteFilterValue(filters.municipalityId);
      query = query
        .or(`id.eq.${id},parent_id.eq.${id}`, {
          referencedTable: "municipality_match",
        })
        .not("municipality_match", "is", null);
    }

    const { data, error, count } = await keysetPage(query, {
      cursor,
      pageSize: ADMIN_PRODUCT_LIST_PAGE_SIZE,
    });

    if (error) throw error;
    return { rows: data, total: withCount ? count : null };
  }

  /**
   * The products a gedu holds a standing seat on: an assignment (primary or
   * assistant) or a trainee seat, the two tables a seat can live in. The gedu
   * filter asks who is on a product, and a trainee is on it as much as a lead
   * is — the difference is pay and permissions, not presence. A substitution is
   * not a seat: a sub covering one afternoon is not one of a club's educators.
   *
   * Read first and handed to the list as `id=in.(…)` because matching either
   * table is an `or` across two embeds, which would have to sit at the top
   * level — where the keyset resume filter keeps the query's only `or`. Both
   * reads are by an indexed `gedu_id` and bounded by one seat per product, and
   * an empty answer becomes `in.()`, which keeps no product.
   */
  private async geduSeatProductIds(geduId: string): Promise<string[]> {
    const [assignments, trainees] = await Promise.all([
      this.supabase
        .from("gedu_group_assignments")
        .select("product_id")
        .eq("gedu_id", geduId),
      this.supabase
        .from("gedu_group_trainees")
        .select("product_id")
        .eq("gedu_id", geduId),
    ]);
    if (assignments.error) throw assignments.error;
    if (trainees.error) throw trainees.error;
    return [
      ...new Set(
        [...assignments.data, ...trainees.data].map((seat) => seat.product_id),
      ),
    ];
  }

  /**
   * The admin product list's facets: per product type, how many products
   * exist and the values each filter can offer. One row per type — bounded by
   * the enum, so a plain read.
   */
  async getListFacets(): Promise<ProductListFacetsRow[]> {
    const { data, error } = await this.supabase
      .from("product_list_facets")
      .select(
        "product_type, product_count, gedu_ids, weekdays, spoken_language_codes, municipalities",
      );

    if (error) throw error;
    return z.array(productListFacetsRow).parse(data);
  }

  // Parent-facing list: the visible products a parent should be offered. The
  // listing half of that is the query's `is_visible` filter; the lifecycle half
  // is the ended filter applied here in JS, and that filter is now the *sole*
  // thing keeping a finished product out of the storefront. The database read
  // rule deliberately does not narrow by lifecycle — it admits every product
  // that exists, to every caller — so nothing behind this call is a second line
  // of defence and the filter must not be trimmed as though it were one.
  // Joins everything the browse card needs in one round trip.
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

  // The same listing again, narrowed to ids and written languages — and, with
  // `id`, to one product, which answers "is this product on the listing?" by
  // asking the listing itself rather than restating its rule. The rule is the
  // query's filters plus the ended pass, so a second copy of it written as a
  // predicate over a fetched row would be one that could disagree with the
  // grid.
  async listVisibleListingByTypes(
    types: ProductType[],
    id?: string,
  ): Promise<ProductListingRow[]> {
    const query = buildListingQuery(this.supabase, types);
    const { data, error } = await (id === undefined ? query : query.eq("id", id));

    if (error) throw error;
    return dropEndedProducts(data);
  }

  // Single-product detail fetch for the parent-facing detail page
  // (`/shop/[id]`).
  //
  // There is no gate to pass: every viewer reaches every product row that
  // exists, by owner decision — listed or not, running or long finished, with
  // or without a seat on it, because a link out of last spring's confirmation
  // mail has to open and the crawler rendering its preview holds no session at
  // all. What the page renders it decides for itself from the registration
  // state and the dates, so there are deliberately no listing or lifecycle
  // filters here. Returns null on miss so the page can render a clean "not
  // found" state; a miss now means only that no product carries that id.
  async getDetailById(id: string): Promise<ProductDetailRow | null> {
    const { data, error } = await buildProductDetailQuery(this.supabase, id);

    if (error) throw error;
    return data;
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

  // Admin-only single-product fetch. Same join shape as getDetailById, and the
  // read rule it goes through is the same one too — it has no admin arm to
  // take, because it already admits every row that exists to every caller,
  // unlisted and finished alike. What makes this the admin read is the payload:
  // the IDs the form needs to round-trip an edit (tag_id, calendar_id) plus
  // readable strings for the read-only details page.
  async getByIdForAdmin(
    id: string,
  ): Promise<ProductAdminDetailRow | null> {
    const { data, error } = await buildAdminProductQuery(this.supabase, id);

    if (error) throw error;
    return data;
  }

  /**
   * A product's planned sessions in `[from, to]` (product-local `YYYY-MM-DD`,
   * both inclusive), soonest first — the database's one expansion of the plan,
   * which answers every caller identically. The admin product page reads it
   * because no document it holds carries the plan.
   */
  async getPlannedSessions(
    productId: string,
    from: string,
    to: string,
  ): Promise<PlannedSession[]> {
    const { data, error } = await this.supabase.rpc("planned_session_dates", {
      p_product_id: productId,
      p_from: from,
      p_to: to,
    });

    if (error) throw error;
    return plannedSessionRows.parse(data);
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
