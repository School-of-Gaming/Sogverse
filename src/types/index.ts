// Re-export the raw generated types (Database, Json, etc.)
// database.types.ts is auto-generated — do not hand-edit.
// After running `supabase gen types`, check whether new tables/enums
// need convenience aliases added below.
export type { Database, Json } from "./database.types";
export { Constants } from "./database.types";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

// ---------------------------------------------------------------------------
// Convenience type aliases
// Keep these in sync with the schema. When you add a new table or enum,
// add its alias here so the rest of the codebase imports from "@/types".
// ---------------------------------------------------------------------------

// Enums
export type UserRole = Database["public"]["Enums"]["user_role"];
export type GenderType = Database["public"]["Enums"]["gender_type"];
export type LocationType = Database["public"]["Enums"]["location_type"];

/**
 * The two roles whose dashboards consume the upcoming-sessions list. Derived
 * from `UserRole` so it stays in sync if the enum ever moves; used by
 * `getMyUpcomingSessions` and the wrapper components to pick the audience
 * filter (`customer_id = auth.uid()` vs. `gamer_id = auth.uid()`) and the
 * empty-state copy.
 */
export type SessionAudience = Extract<UserRole, "customer" | "gamer">;

// profiles
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/** Type guard: narrows a possibly-nullish `Profile` to a non-null gamer profile. */
export function isGamerProfile(p: Profile | null | undefined): p is Profile & { role: "gamer" } {
  return p?.role === "gamer";
}

// customer_profiles
export type CustomerProfile = Database["public"]["Tables"]["customer_profiles"]["Row"];
export type CustomerProfileUpdate = Database["public"]["Tables"]["customer_profiles"]["Update"];

// gamer_profiles
export type GamerProfile = Database["public"]["Tables"]["gamer_profiles"]["Row"];
export type GamerProfileUpdate = Database["public"]["Tables"]["gamer_profiles"]["Update"];

// gedu_profiles
export type GeduProfile = Database["public"]["Tables"]["gedu_profiles"]["Row"];
export type GeduProfileUpdate = Database["public"]["Tables"]["gedu_profiles"]["Update"];

// minecraft_accounts
export type MinecraftAccount = Database["public"]["Tables"]["minecraft_accounts"]["Row"];
export type MinecraftAccountUpdate = Database["public"]["Tables"]["minecraft_accounts"]["Update"];

// roblox_accounts
export type RobloxAccount = Database["public"]["Tables"]["roblox_accounts"]["Row"];
export type RobloxAccountUpdate = Database["public"]["Tables"]["roblox_accounts"]["Update"];

// parent_gamer
export type ParentGamer = Database["public"]["Tables"]["parent_gamer"]["Row"];
export type ParentGamerInsert = Database["public"]["Tables"]["parent_gamer"]["Insert"];

// feedback_submissions
export type FeedbackSubmission = Database["public"]["Tables"]["feedback_submissions"]["Row"];

// spoken_languages (reference table — the human languages a person speaks /
// a club is delivered in). Distinct from `locale` (UI translation), which
// has no DB table and is constrained by SUPPORTED_LOCALES in code.
export type SpokenLanguage = Database["public"]["Tables"]["spoken_languages"]["Row"];

// locations
/**
 * A `locations` row as the application sees it: every column that any surface
 * renders, and nothing else.
 *
 * Four columns are excluded, for two different reasons.
 *
 * `search_blob` is a generated column — the folded search terms the database
 * maintains for the row and the trigram index consumes — and nothing outside
 * Postgres reads it. It is also the largest value on a row, and a browse page
 * is 200 rows, so it is worth not sending.
 *
 * `geonames_id`, `retired_at` and `depth` are the columns the GeoNames data
 * supply runs on, and they are the database's business rather than the
 * application's: the upstream key is used by ingestion and sync migrations,
 * `depth` is maintained by a trigger and consumed by the search function's
 * ranking, and `retired_at` decides which rows a read *offers* — which is a
 * filter, not a value anyone renders. Nothing on any surface displays one, so
 * nothing selects one.
 *
 * Excluding them from the alias is what makes that stick: every read names its
 * columns instead of selecting `*`, and a read that regressed to `*` would be
 * assigning a wider row to this narrower type, which compiles — so the alias is
 * the statement of intent, and the explicit select lists in the service are the
 * enforcement.
 */
export type Location = Omit<
  Database["public"]["Tables"]["locations"]["Row"],
  "search_blob" | "geonames_id" | "retired_at" | "depth"
>;
export type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];

// gedu_locations (a gedu's coverage areas for substitute matching — rows
// can sit at any level of the location hierarchy)
export type GeduLocation = Database["public"]["Tables"]["gedu_locations"]["Row"];
export type GeduLocationInsert = Database["public"]["Tables"]["gedu_locations"]["Insert"];

// ---------------------------------------------------------------------------
// products (see docs/products-architecture.md)
// ---------------------------------------------------------------------------

// Enums
export type ProductType = Database["public"]["Enums"]["product_type"];
export type BillingMode = Database["public"]["Enums"]["billing_mode"];
export type ProductStatus = Database["public"]["Enums"]["product_status"];
// Fixed set of product topics. The game/subject split + display labels live
// in src/lib/products/topics.ts (PRODUCT_TOPICS).
export type ProductTopic = Database["public"]["Enums"]["product_topic"];

// products
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

// product_staff_details — the staff-only half of a product, split off `products`
// because that table is readable by anon and by every parent, and PostgREST lets
// a caller pick the columns it wants. Sparse: a product with nothing staff-only
// recorded has no row here.
export type ProductStaffDetails =
  Database["public"]["Tables"]["product_staff_details"]["Row"];
export type ProductStaffDetailsInsert =
  Database["public"]["Tables"]["product_staff_details"]["Insert"];

// schedule_slots
export type ScheduleSlot = Database["public"]["Tables"]["schedule_slots"]["Row"];
export type ScheduleSlotInsert = Database["public"]["Tables"]["schedule_slots"]["Insert"];

// Product translation table — one row per (product_id, locale). Products no
// longer carry name/description directly; the reader resolves a locale via
// resolveTranslation() in src/lib/i18n/resolve-translation.ts. (Topic names
// are not DB-backed — see src/lib/products/topics.ts.)
//
// Two description columns (migration 00091): `short_description` (the teaser
// shown on cards, the detail hero, and admin lists) and `long_description`
// (the optional structured blurb rendered only on the shop detail page —
// shape below).
export type ProductTranslation = Database["public"]["Tables"]["product_translations"]["Row"];
export type ProductTranslationInsert = Database["public"]["Tables"]["product_translations"]["Insert"];

/**
 * One block of a product's structured long description. The flat, ordered
 * array renders top-to-bottom on the shop detail page: `heading` blocks become
 * semantic headings, `paragraph` blocks become `<p>`. Plain text only — no
 * inline marks (bold/links). If those are ever needed, `text` becomes an
 * inline-node array (a localized, lossless follow-up migration).
 */
export type ProductLongDescriptionBlock = {
  type: "heading" | "paragraph";
  text: string;
};
export type ProductLongDescription = ProductLongDescriptionBlock[];

/**
 * Narrow a `product_translations.long_description` value (generated as
 * `Json | null`) into the structured block array. The DB CHECK
 * `product_translations_long_description_check` only enforces NULL-or-array
 * (migration 00092 deliberately dropped the deeper per-element validator —
 * see its header), so the per-block filtering here is the real read-side guard:
 * it drops anything that isn't a well-formed `{ type, text }` block. On the
 * write side the block-editor UI is the matching guard. Returns `[]` for
 * null/non-array/garbage so call sites can map directly.
 */
export function parseLongDescription(
  value: Json | null | undefined,
): ProductLongDescription {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (block): block is ProductLongDescriptionBlock =>
      typeof block === "object" &&
      block !== null &&
      !Array.isArray(block) &&
      (block.type === "heading" || block.type === "paragraph") &&
      typeof block.text === "string",
  );
}

// product_prices
export type ProductPrice = Database["public"]["Tables"]["product_prices"]["Row"];
export type ProductPriceInsert = Database["public"]["Tables"]["product_prices"]["Insert"];
export type ProductPriceUpdate = Database["public"]["Tables"]["product_prices"]["Update"];

// holiday_calendars + calendar_holidays + product_holiday_calendars
export type HolidayCalendar = Database["public"]["Tables"]["holiday_calendars"]["Row"];
export type HolidayCalendarInsert = Database["public"]["Tables"]["holiday_calendars"]["Insert"];
export type CalendarHoliday = Database["public"]["Tables"]["calendar_holidays"]["Row"];
export type CalendarHolidayInsert = Database["public"]["Tables"]["calendar_holidays"]["Insert"];
export type ProductHolidayCalendar = Database["public"]["Tables"]["product_holiday_calendars"]["Row"];
export type ProductHolidayCalendarInsert = Database["public"]["Tables"]["product_holiday_calendars"]["Insert"];

// site_details (member-visible) + site_staff_details (admin + Gedu only)
export type SiteDetails = Database["public"]["Tables"]["site_details"]["Row"];
export type SiteDetailsInsert = Database["public"]["Tables"]["site_details"]["Insert"];
export type SiteStaffDetails = Database["public"]["Tables"]["site_staff_details"]["Row"];
export type SiteStaffDetailsInsert = Database["public"]["Tables"]["site_staff_details"]["Insert"];

// Joined location shape shared by browse rows. The detail / card layers
// only need the name + type plus one level of parent for display
// ("Tapiolan koulu, Espoo"). Walk the chain via `parent` if a deeper
// hierarchy is ever needed — the SELECT only fetches one level today.
export type BrowseRowLocation = {
  id: string;
  name: string;
  name_i18n: Json | null;
  type: LocationType;
  parent: {
    id: string;
    name: string;
    name_i18n: Json | null;
    type: LocationType;
  } | null;
};

// `ProductBrowseRow` is inferred from the browse query in products.service.ts
// (single source of truth — the select string and the row type can't drift).
// Re-exported here so consumers keep importing it from `@/types`.
export type { ProductBrowseRow } from "@/services/products/products.service";

// ---------------------------------------------------------------------------
// products — participations, payments, family subs (00039)
// See docs/products-architecture.md §§ 5.5, 5.7, 5.7a, 5.1a, 6.1.
// ---------------------------------------------------------------------------

// Enums
export type ParticipationStatus = Database["public"]["Enums"]["participation_status"];
export type PaymentPurpose = Database["public"]["Enums"]["payment_purpose"];
export type EffectiveProductStatusDB = Database["public"]["Enums"]["effective_product_status"];

// participations
export type Participation = Database["public"]["Tables"]["participations"]["Row"];
export type ParticipationInsert = Database["public"]["Tables"]["participations"]["Insert"];

/**
 * Derived 3-state placement vocabulary for participations.
 * See products-architecture.md §3 "Participation state vocabulary":
 *   - 'waitlisted'  — `status = 'waitlisted'`
 *   - 'unassigned'  — `status = 'active' AND group_id IS NULL`
 *   - 'assigned'    — `status = 'active' AND group_id IS NOT NULL`
 *
 * Use `participationStateOf()` (src/lib/participation-state.ts) to derive.
 */
export type ParticipationState = "waitlisted" | "unassigned" | "assigned";

/**
 * Purchase shape selectors the client sends to the create-participation route.
 * Server recomputes prices from the product's stored base price + the
 * pricing constants — clients never send amounts.
 */
export type PurchaseShape =
  | "subscription_monthly"
  | "single_payment"
  | "free"
  // Municipality clubs: invoiced off-platform, so registration is instant and
  // never touches Stripe. See create_participation's external_contract branch.
  | "external";

// payments
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];

// family_subscriptions — one Stripe subscription per (gamer, club) participation.
// "Family" is historical: a row is one gamer in one club, not a family's whole bill.
export type FamilySubscription = Database["public"]["Tables"]["family_subscriptions"]["Row"];
export type FamilySubscriptionInsert = Database["public"]["Tables"]["family_subscriptions"]["Insert"];

// product_subscription_prices (Stripe Price ID cache; admin-only)
export type ProductSubscriptionPrice = Database["public"]["Tables"]["product_subscription_prices"]["Row"];
export type ProductSubscriptionPriceInsert = Database["public"]["Tables"]["product_subscription_prices"]["Insert"];

// product_seat_counts (public-readable rollup feeding the realtime counter)
export type ProductSeatCount = Database["public"]["Tables"]["product_seat_counts"]["Row"];

// ---------------------------------------------------------------------------
// products — groups & gedu assignments (00049)
// See docs/products-architecture.md §4.1, §5.4, §6.1a.
// ---------------------------------------------------------------------------

// product_groups
export type ProductGroup = Database["public"]["Tables"]["product_groups"]["Row"];
export type ProductGroupInsert = Database["public"]["Tables"]["product_groups"]["Insert"];
export type ProductGroupUpdate = Database["public"]["Tables"]["product_groups"]["Update"];

// gedu_group_assignments
export type GeduGroupAssignment = Database["public"]["Tables"]["gedu_group_assignments"]["Row"];
export type GeduGroupAssignmentInsert = Database["public"]["Tables"]["gedu_group_assignments"]["Insert"];

// ---------------------------------------------------------------------------
// products — session records (the gedu session feed)
// ---------------------------------------------------------------------------

// group_sessions — one lazily materialized row per (group, product-local date).
// Neither table grants anything to `authenticated`: every read and write goes
// through the SECURITY DEFINER RPCs in src/services/gedu-sessions/, so these
// aliases exist for the service-role side (db tests, admin tooling) rather than
// for browser queries.
export type GroupSession = Database["public"]["Tables"]["group_sessions"]["Row"];
export type GroupSessionInsert = Database["public"]["Tables"]["group_sessions"]["Insert"];
export type GroupSessionUpdate = Database["public"]["Tables"]["group_sessions"]["Update"];

// session_attendance — one row per explicit mark. A roster member with NO row
// is unanswered, which is why the status column has no "unmarked" member: that
// state is the absence of a row, not a value.
export type SessionAttendance = Database["public"]["Tables"]["session_attendance"]["Row"];
export type SessionAttendanceInsert = Database["public"]["Tables"]["session_attendance"]["Insert"];

// The attendance vocabulary is a text column with a CHECK rather than a
// Postgres enum (adding 'late'/'excused' is expected), so there is no
// Constants entry to derive from — the tuple in the contracts file is the
// code-side source of truth. Re-exported here so consumers keep importing
// their types from "@/types".
export type {
  AttendanceStatus,
  GeduAssignmentSummary,
  GeduFeedRosterEntry,
  GeduFeedSession,
  GeduFeedSite,
  GeduGroupFeed,
} from "@/services/gedu-sessions/gedu-sessions.contracts";

// ---------------------------------------------------------------------------
// voice zones (00103) — the persisted half of the discrete-zone voice model.
// See src/components/voice/CLAUDE.md for the discrete-zone voice model.
// Lobby + the 4 Yty zones stay virtual/hardcoded on the client; only these
// mod-created rows persist, tied to a product_group.
// ---------------------------------------------------------------------------

// Icon/color keys are app-owned, not DB enums — the `voice_zones.icon`/`.color`
// columns are plain text and `src/lib/constants/voice-zones.ts` is the source of
// truth for the valid set (so adding/removing one needs no migration). Re-export
// the derived types here so the rest of the app can keep importing from `@/types`.
export type { VoiceZoneIcon, VoiceZoneColor } from "@/lib/constants/voice-zones";

// voice_zones
export type VoiceZone = Database["public"]["Tables"]["voice_zones"]["Row"];
export type VoiceZoneInsert = Database["public"]["Tables"]["voice_zones"]["Insert"];
export type VoiceZoneUpdate = Database["public"]["Tables"]["voice_zones"]["Update"];

// voice_private_zone_occupants — who is currently in a private (locked) zone
// this session window; the server-readable, mod-authored privacy boundary that
// the token endpoint bakes into each joiner's Daily `canReceive`.
export type VoicePrivateZoneOccupant = Database["public"]["Tables"]["voice_private_zone_occupants"]["Row"];
export type VoicePrivateZoneOccupantInsert = Database["public"]["Tables"]["voice_private_zone_occupants"]["Insert"];

// get_product_groups_with_details — returns JSONB, so the generated type is
// `Json`. The structured shape is derived from the productGroupsSnapshot zod
// contract (the same schema the service and db tests parse through), so the
// wire contract and the type can't drift. Re-exported here so consumers keep
// importing these from `@/types`.
export type {
  GroupGeduDetail,
  GroupParticipationDetail,
  ProductGroupWithDetails,
  ProductGroupsSnapshot,
} from "@/services/groups/groups.contracts";

// get_gedu_assigned_product — the JSONB document that backs the gedu's
// session-details page (entered from a dashboard session card, but
// product-scoped). Lives at /gedu/clubs/[id], /gedu/camps/[id], or
// /gedu/events/[id] depending on the product's type. The RPC raises 42501
// unless the caller has a gedu_group_assignments row on the product —
// hence the "assigned" name.
//
// Generated as `Json`; pin a structured shape here so consumers don't cast.
// Roster + parent_email are populated only on the caller's own group; sister
// groups carry just gamer_count + gedus[] so a gedu can see who they're
// teaching alongside without leaking the sister-group roster.
export interface GeduAssignedProductRosterEntry {
  gamer_id: string;
  first_name: string;
  date_of_birth: string | null;
  minecraft_username: string | null;
  /** UUID present only when the gamer has *verified* their Minecraft username via the verify flow. */
  minecraft_uuid: string | null;
  gender: GenderType | null;
  parent_email: string | null;
}

export interface GeduAssignedProductGroupGedu {
  id: string;
  first_name: string;
}

export interface GeduAssignedProductGroup {
  id: string;
  name: string;
  created_at: string;
  is_my_group: boolean;
  gamer_count: number;
  gedus: GeduAssignedProductGroupGedu[];
  /** Populated only when `is_my_group` is true; null otherwise. */
  roster: GeduAssignedProductRosterEntry[] | null;
}

export interface GeduAssignedProductShell {
  id: string;
  product_type: Database["public"]["Enums"]["product_type"];
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  is_remote: boolean;
  translations: Array<{
    locale: string;
    name: string;
    description: string;
  }>;
  schedule_slots: Array<{
    weekday: number;
    start_time: string;
    duration_minutes: number;
  }>;
}

export interface GeduAssignedProduct {
  product: GeduAssignedProductShell;
  my_group_id: string;
  groups: GeduAssignedProductGroup[];
}

// whatsapp_contacts
export type WhatsAppContact = Database["public"]["Tables"]["whatsapp_contacts"]["Row"];

// whatsapp_messages
export type WhatsAppMessage = Database["public"]["Tables"]["whatsapp_messages"]["Row"];
export type WhatsAppMessageUpdate = Database["public"]["Tables"]["whatsapp_messages"]["Update"];

export const WHATSAPP_MESSAGE_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  RECEIVED: "received",
} as const;
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUS)[keyof typeof WHATSAPP_MESSAGE_STATUS];

export const WHATSAPP_DIRECTION = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const;
export type WhatsAppDirection = (typeof WHATSAPP_DIRECTION)[keyof typeof WHATSAPP_DIRECTION];

// get_my_assigned_products RPC — the generator marks every column of an RPC
// RETURNS TABLE row as non-nullable from the column type alone, missing
// products columns that are actually nullable (start_date, end_date). It also
// degrades the jsonb arrays (product_translations,
// schedule_slots) to `Json`, which forces every consumer to cast. Tighten
// both: nullability matches the underlying products schema, and the
// arrays get structured shapes that mirror the jsonb_build_object calls in
// the RPC body. Keep this alias adjacent to its source in
// supabase/migrations/00061_get_my_assigned_products.sql.
type _MyAssignedProductGenerated =
  Database["public"]["Functions"]["get_my_assigned_products"]["Returns"][number];
export type MyAssignedProductRow = Omit<
  _MyAssignedProductGenerated,
  "start_date" | "end_date" | "product_translations" | "schedule_slots"
> & {
  start_date: string | null;
  end_date: string | null;
  product_translations: Array<{
    locale: string;
    name: string;
    description: string;
  }>;
  schedule_slots: Array<{
    weekday: number;
    start_time: string;
    duration_minutes: number;
  }>;
};

// get_my_participation_subscription_states RPC (00093) — money-free read of the
// caller's past_due/canceling subs feeding the dashboard payment-problem and
// access-until badges. The generator types `current_period_end` non-nullable
// from the RETURNS TABLE column alone, but family_subscriptions.current_period_end
// IS nullable and no CHECK forbids null on these statuses, so the guarantee is
// false. Loosen it to `string | null` so call sites are forced to handle the
// (rare, Stripe-always-provides-it-in-practice) null. Keep adjacent to its
// source in supabase/migrations/00093_subscription_states_rpc.sql.
type _SubscriptionStateGenerated =
  Database["public"]["Functions"]["get_my_participation_subscription_states"]["Returns"][number];
export type ParticipationSubscriptionState = Omit<
  _SubscriptionStateGenerated,
  "current_period_end"
> & {
  current_period_end: string | null;
};

// ---------------------------------------------------------------------------
// App-level types (not generated)
// ---------------------------------------------------------------------------

/**
 * The identity a locally-verified JWT actually guarantees. `getClaims()`
 * (see docs/performance.md) yields only the signed claims — `id` (`sub`) and
 * `email` — not the fully-populated GoTrue `User` that `getUser()` returned.
 * Derived from `User` via `Pick` so the field types track the SDK; every
 * server auth helper (`getUser`, `getUserWithProfile`, `requireRole`) and the
 * client auth context return this subset rather than fabricating the missing
 * `User` fields.
 */
export type AuthenticatedUser = Pick<User, "id" | "email">;

/**
 * The Supabase client our server code and service layer use. It is a normal
 * `SupabaseClient<Database>` with one method removed at the type level:
 * `auth.getUser()`.
 *
 * `getUser()` is a GoTrue HTTP round-trip; on the per-request / per-RSC-prefetch
 * server path it fans out into the F1 auth-waterfall (see docs/performance.md).
 * Server identity must instead come from `auth.getClaims()` (local ES256
 * verification, no round-trip). Subtracting `getUser` from the type makes a
 * server-side `supabase.auth.getUser()` a *compile* error — the structural
 * regression guard, in place of a lint that would nag forever once the codebase
 * is clean.
 *
 * The full browser `SupabaseClient<Database>` (which keeps `getUser`, for the
 * rare client-side case that genuinely needs the live GoTrue `User`) is
 * assignable to this narrower type, so `getClient()` results still flow into
 * service constructors unchanged. The reverse is intentionally not assignable —
 * that's what blocks `getUser` on the server.
 */
export type AppSupabaseClient = Omit<SupabaseClient<Database>, "auth"> & {
  auth: Omit<SupabaseClient<Database>["auth"], "getUser">;
};

export interface CreateGamerInput {
  firstName: string;
  dateOfBirth: string;
  gender?: "boy" | "girl" | "non_binary" | null;
  minecraftUsername?: string;
  robloxUsername?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
