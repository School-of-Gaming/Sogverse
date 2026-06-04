// Re-export the raw generated types (Database, Json, etc.)
// database.types.ts is auto-generated — do not hand-edit.
// After running `supabase gen types`, check whether new tables/enums
// need convenience aliases added below.
export type { Database, Json } from "./database.types";
export { Constants } from "./database.types";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

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

/**
 * Profile narrowed for gamer context — username is always set.
 *
 * Backed by the `auth_identifier_check` CHECK constraint on `profiles`,
 * which enforces `username IS NOT NULL` whenever `role = 'gamer'`. The
 * generated `Profile` type cannot express this conditional invariant
 * (column-level nullability only), so we narrow here. If that CHECK is
 * ever relaxed, this alias must be relaxed with it.
 */
export type GamerProfileRow = Profile & { username: string };

/** Type guard for `GamerProfileRow`. Use to narrow a `Profile | null | undefined` at sites that need `username` as a non-nullable `string`. */
export function isGamerProfile(p: Profile | null | undefined): p is GamerProfileRow {
  return p?.role === "gamer";
}

// customer_profiles
export type CustomerProfile = Database["public"]["Tables"]["customer_profiles"]["Row"];
export type CustomerProfileUpdate = Database["public"]["Tables"]["customer_profiles"]["Update"];

// gamer_profiles
export type GamerProfile = Database["public"]["Tables"]["gamer_profiles"]["Row"];
export type GamerProfileUpdate = Database["public"]["Tables"]["gamer_profiles"]["Update"];

// minecraft_accounts
export type MinecraftAccount = Database["public"]["Tables"]["minecraft_accounts"]["Row"];
export type MinecraftAccountUpdate = Database["public"]["Tables"]["minecraft_accounts"]["Update"];

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
export type Location = Database["public"]["Tables"]["locations"]["Row"];
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

// schedule_slots
export type ScheduleSlot = Database["public"]["Tables"]["schedule_slots"]["Row"];
export type ScheduleSlotInsert = Database["public"]["Tables"]["schedule_slots"]["Insert"];

// Product translation table — one row per (product_id, locale). Products no
// longer carry name/description directly; the reader resolves a locale via
// resolveTranslation() in src/lib/i18n/resolve-translation.ts. (Topic names
// are not DB-backed — see src/lib/products/topics.ts.)
export type ProductTranslation = Database["public"]["Tables"]["product_translations"]["Row"];
export type ProductTranslationInsert = Database["public"]["Tables"]["product_translations"]["Insert"];

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
  type: LocationType;
  parent: {
    id: string;
    name: string;
    type: LocationType;
  } | null;
};

// Joined shape consumed by the parent-facing browse pages
// (src/components/public/products/product-browse-page.tsx). The card
// renderer expects everything it needs to draw itself in one row — the topic
// enum (label resolved via PRODUCT_TOPICS), all product translations, prices
// per supported currency, weekly schedule slots, and the joined location for
// in-person products. Single source so the component props mirror the SELECT
// shape exactly. (`topic` is a column on Product, so no join is needed.)
export type ProductBrowseRow = Product & {
  product_translations: ProductTranslation[];
  product_prices: ProductPrice[];
  schedule_slots: Pick<
    ScheduleSlot,
    "weekday" | "start_time" | "duration_minutes"
  >[];
  locations: BrowseRowLocation | null;
};

// ---------------------------------------------------------------------------
// products — participations, payments, family subs (00039)
// See docs/products-architecture.md §§ 5.5, 5.7, 5.7a, 5.1a, 6.1.
// ---------------------------------------------------------------------------

// Enums
export type ParticipationStatus = Database["public"]["Enums"]["participation_status"];
export type PaymentPurpose = Database["public"]["Enums"]["payment_purpose"];
export type RefundReason = Database["public"]["Enums"]["refund_reason"];
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
  | "free";

// payments
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];

// refunds
export type Refund = Database["public"]["Tables"]["refunds"]["Row"];
export type RefundInsert = Database["public"]["Tables"]["refunds"]["Insert"];

// family_subscriptions + family_subscription_items
export type FamilySubscription = Database["public"]["Tables"]["family_subscriptions"]["Row"];
export type FamilySubscriptionInsert = Database["public"]["Tables"]["family_subscriptions"]["Insert"];
export type FamilySubscriptionItem = Database["public"]["Tables"]["family_subscription_items"]["Row"];
export type FamilySubscriptionItemInsert = Database["public"]["Tables"]["family_subscription_items"]["Insert"];

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

// get_product_groups_with_details — returns JSONB, so the generated type is
// `Json`. Define a structured shape that mirrors what the RPC produces so the
// admin UI gets type safety without a Zod parse step.
export interface GroupGeduDetail {
  id: string;
  first_name: string;
  email: string | null;
}

export interface GroupParticipationDetail {
  id: string;
  gamer_id: string;
  gamer_first_name: string;
  gamer_date_of_birth: string | null;
  gamer_gender: GenderType | null;
  gamer_minecraft_username: string | null;
  gamer_minecraft_uuid: string | null;
  gamer_parent_first_name: string | null;
  gamer_parent_last_name: string | null;
  status: ParticipationStatus;
  signed_up_at: string;
}

export interface ProductGroupWithDetails {
  id: string;
  name: string;
  created_at: string;
  gedus: GroupGeduDetail[];
  participations: GroupParticipationDetail[];
}

export interface ProductGroupsSnapshot {
  product_id: string;
  groups: ProductGroupWithDetails[];
  unassigned: GroupParticipationDetail[];
}

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
  padlet_url: string | null;
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
// products columns that are actually nullable (start_date, end_date,
// padlet_url). It also degrades the jsonb arrays (product_translations,
// schedule_slots) to `Json`, which forces every consumer to cast. Tighten
// both: nullability matches the underlying products schema, and the
// arrays get structured shapes that mirror the jsonb_build_object calls in
// the RPC body. Keep this alias adjacent to its source in
// supabase/migrations/00061_get_my_assigned_products.sql.
type _MyAssignedProductGenerated =
  Database["public"]["Functions"]["get_my_assigned_products"]["Returns"][number];
export type MyAssignedProductRow = Omit<
  _MyAssignedProductGenerated,
  "start_date" | "end_date" | "padlet_url" | "product_translations" | "schedule_slots"
> & {
  start_date: string | null;
  end_date: string | null;
  padlet_url: string | null;
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
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface GamerLoginCredentials {
  username: string;
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
