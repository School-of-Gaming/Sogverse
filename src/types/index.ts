// Re-export the raw generated types (Database, Json, etc.)
// database.types.ts is auto-generated — do not hand-edit.
// After running `supabase gen types`, check whether new tables/enums
// need convenience aliases added below.
export type { Database, Json } from "./database.types";
export { Constants } from "./database.types";

import type { User } from "@supabase/supabase-js";
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

// products
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

// games
export type Game = Database["public"]["Tables"]["games"]["Row"];
export type GameInsert = Database["public"]["Tables"]["games"]["Insert"];

// feedback_submissions
export type FeedbackSubmission = Database["public"]["Tables"]["feedback_submissions"]["Row"];

// spoken_languages (reference table — the human languages a person speaks /
// a club is delivered in). Distinct from `locale` (UI translation), which
// has no DB table and is constrained by SUPPORTED_LOCALES in code.
export type SpokenLanguage = Database["public"]["Tables"]["spoken_languages"]["Row"];

// locations
export type Location = Database["public"]["Tables"]["locations"]["Row"];
export type LocationInsert = Database["public"]["Tables"]["locations"]["Insert"];

// product_groups
export type ProductGroup = Database["public"]["Tables"]["product_groups"]["Row"];
export type ProductGroupInsert = Database["public"]["Tables"]["product_groups"]["Insert"];

// group_enrollments
export type GroupEnrollment = Database["public"]["Tables"]["group_enrollments"]["Row"];
export type GroupEnrollmentInsert = Database["public"]["Tables"]["group_enrollments"]["Insert"];

// gedu_locations (a gedu's coverage areas for substitute matching — rows
// can sit at any level of the location hierarchy)
export type GeduLocation = Database["public"]["Tables"]["gedu_locations"]["Row"];
export type GeduLocationInsert = Database["public"]["Tables"]["gedu_locations"]["Insert"];

// ---------------------------------------------------------------------------
// products v2 (parallel-phase schema — see docs/products-redesign.md)
// Suffixes are stripped at cutover (§9).
// ---------------------------------------------------------------------------

// Enums
export type ProductTypeV2 = Database["public"]["Enums"]["product_type_v2"];
export type BillingModeV2 = Database["public"]["Enums"]["billing_mode_v2"];
export type ProductStatusV2 = Database["public"]["Enums"]["product_status_v2"];
export type TopicKindV2 = Database["public"]["Enums"]["topic_kind_v2"];

// products_v2
export type ProductV2 = Database["public"]["Tables"]["products_v2"]["Row"];
export type ProductV2Insert = Database["public"]["Tables"]["products_v2"]["Insert"];
export type ProductV2Update = Database["public"]["Tables"]["products_v2"]["Update"];

// schedule_slots_v2
export type ScheduleSlotV2 = Database["public"]["Tables"]["schedule_slots_v2"]["Row"];
export type ScheduleSlotV2Insert = Database["public"]["Tables"]["schedule_slots_v2"]["Insert"];

// topics_v2
export type TopicV2 = Database["public"]["Tables"]["topics_v2"]["Row"];
export type TopicV2Insert = Database["public"]["Tables"]["topics_v2"]["Insert"];

// tags_v2
export type TagV2 = Database["public"]["Tables"]["tags_v2"]["Row"];
export type TagV2Insert = Database["public"]["Tables"]["tags_v2"]["Insert"];

// Translation tables — one row per (parent_id, locale). Parents (products_v2,
// topics_v2, tags_v2) no longer carry name/description directly; the reader
// resolves a locale via resolveTranslation() in src/lib/i18n/resolve-translation.ts.
export type ProductTranslationV2 = Database["public"]["Tables"]["product_translations_v2"]["Row"];
export type ProductTranslationV2Insert = Database["public"]["Tables"]["product_translations_v2"]["Insert"];
export type TopicTranslationV2 = Database["public"]["Tables"]["topic_translations_v2"]["Row"];
export type TopicTranslationV2Insert = Database["public"]["Tables"]["topic_translations_v2"]["Insert"];
export type TagTranslationV2 = Database["public"]["Tables"]["tag_translations_v2"]["Row"];
export type TagTranslationV2Insert = Database["public"]["Tables"]["tag_translations_v2"]["Insert"];

// product_tags_v2
export type ProductTagV2 = Database["public"]["Tables"]["product_tags_v2"]["Row"];
export type ProductTagV2Insert = Database["public"]["Tables"]["product_tags_v2"]["Insert"];

// product_prices_v2
export type ProductPriceV2 = Database["public"]["Tables"]["product_prices_v2"]["Row"];
export type ProductPriceV2Insert = Database["public"]["Tables"]["product_prices_v2"]["Insert"];
export type ProductPriceV2Update = Database["public"]["Tables"]["product_prices_v2"]["Update"];

// holiday_calendars_v2 + calendar_holidays_v2 + product_holiday_calendars_v2
export type HolidayCalendarV2 = Database["public"]["Tables"]["holiday_calendars_v2"]["Row"];
export type HolidayCalendarV2Insert = Database["public"]["Tables"]["holiday_calendars_v2"]["Insert"];
export type CalendarHolidayV2 = Database["public"]["Tables"]["calendar_holidays_v2"]["Row"];
export type CalendarHolidayV2Insert = Database["public"]["Tables"]["calendar_holidays_v2"]["Insert"];
export type ProductHolidayCalendarV2 = Database["public"]["Tables"]["product_holiday_calendars_v2"]["Row"];
export type ProductHolidayCalendarV2Insert = Database["public"]["Tables"]["product_holiday_calendars_v2"]["Insert"];

// site_details_v2 (member-visible) + site_staff_details_v2 (admin + Gedu only)
export type SiteDetailsV2 = Database["public"]["Tables"]["site_details_v2"]["Row"];
export type SiteDetailsV2Insert = Database["public"]["Tables"]["site_details_v2"]["Insert"];
export type SiteStaffDetailsV2 = Database["public"]["Tables"]["site_staff_details_v2"]["Row"];
export type SiteStaffDetailsV2Insert = Database["public"]["Tables"]["site_staff_details_v2"]["Insert"];

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
// (src/components/public/products-v2/product-browse-page.tsx). The card
// renderer expects everything it needs to draw itself in one row — topic
// label, all product translations, tag chips, prices per supported currency,
// weekly schedule slots, and the joined location for in-person products.
// Single source so the component props mirror the SELECT shape exactly.
export type ProductV2BrowseRow = ProductV2 & {
  topics_v2:
    | {
        slug: string;
        kind: TopicKindV2;
        icon_path: string | null;
        topic_translations_v2: TopicTranslationV2[];
      }
    | null;
  product_translations_v2: ProductTranslationV2[];
  product_tags_v2: {
    tags_v2:
      | {
          slug: string;
          tag_translations_v2: TagTranslationV2[];
        }
      | null;
  }[];
  product_prices_v2: ProductPriceV2[];
  schedule_slots_v2: Pick<
    ScheduleSlotV2,
    "weekday" | "start_time" | "duration_minutes"
  >[];
  locations: BrowseRowLocation | null;
};

// ---------------------------------------------------------------------------
// products v2 — participations, payments, family subs (00039)
// See docs/products-redesign.md §§ 5.5, 5.7, 5.7a, 5.1a, 6.1.
// ---------------------------------------------------------------------------

// Enums
export type ParticipationStatus = Database["public"]["Enums"]["participation_status_v2"];
export type SubscriptionFrequencyV2 = Database["public"]["Enums"]["subscription_frequency_v2"];
export type PaymentPurposeV2 = Database["public"]["Enums"]["payment_purpose_v2"];
export type RefundReasonV2 = Database["public"]["Enums"]["refund_reason_v2"];
export type EffectiveProductStatusV2DB = Database["public"]["Enums"]["effective_product_status_v2"];

// participations_v2
export type Participation = Database["public"]["Tables"]["participations_v2"]["Row"];
export type ParticipationInsert = Database["public"]["Tables"]["participations_v2"]["Insert"];

/**
 * Derived 3-state placement vocabulary for participations.
 * See products-redesign.md §3 "Participation state vocabulary":
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
 * pricing-v2 constants — clients never send amounts.
 */
export type PurchaseShape =
  | "bundle_1"
  | "bundle_4"
  | "bundle_10"
  | "subscription_monthly"
  | "subscription_quarterly"
  | "subscription_yearly"
  | "single_payment"
  | "free";

// payments_v2
export type Payment = Database["public"]["Tables"]["payments_v2"]["Row"];
export type PaymentInsert = Database["public"]["Tables"]["payments_v2"]["Insert"];

// refunds_v2
export type Refund = Database["public"]["Tables"]["refunds_v2"]["Row"];
export type RefundInsert = Database["public"]["Tables"]["refunds_v2"]["Insert"];

// family_subscriptions_v2 + family_subscription_items_v2
export type FamilySubscription = Database["public"]["Tables"]["family_subscriptions_v2"]["Row"];
export type FamilySubscriptionInsert = Database["public"]["Tables"]["family_subscriptions_v2"]["Insert"];
export type FamilySubscriptionItem = Database["public"]["Tables"]["family_subscription_items_v2"]["Row"];
export type FamilySubscriptionItemInsert = Database["public"]["Tables"]["family_subscription_items_v2"]["Insert"];

// product_subscription_prices_v2 (Stripe Price ID cache; admin-only)
export type ProductSubscriptionPriceV2 = Database["public"]["Tables"]["product_subscription_prices_v2"]["Row"];
export type ProductSubscriptionPriceV2Insert = Database["public"]["Tables"]["product_subscription_prices_v2"]["Insert"];

// session_cancellations_v2 (ships now even though the cancel-session UI does not)
export type SessionCancellationV2 = Database["public"]["Tables"]["session_cancellations_v2"]["Row"];

// credit_deductions_v2 (cron audit ledger)
export type CreditDeductionV2 = Database["public"]["Tables"]["credit_deductions_v2"]["Row"];

// product_seat_counts_v2 (public-readable rollup feeding the realtime counter)
export type ProductSeatCountV2 = Database["public"]["Tables"]["product_seat_counts_v2"]["Row"];

// ---------------------------------------------------------------------------
// products v2 — groups & gedu assignments (00049)
// See docs/products-redesign.md §4.1, §5.4, §6.1a.
// ---------------------------------------------------------------------------

// product_groups_v2
export type ProductGroupV2 = Database["public"]["Tables"]["product_groups_v2"]["Row"];
export type ProductGroupV2Insert = Database["public"]["Tables"]["product_groups_v2"]["Insert"];
export type ProductGroupV2Update = Database["public"]["Tables"]["product_groups_v2"]["Update"];

// gedu_group_assignments_v2
export type GeduGroupAssignmentV2 = Database["public"]["Tables"]["gedu_group_assignments_v2"]["Row"];
export type GeduGroupAssignmentV2Insert = Database["public"]["Tables"]["gedu_group_assignments_v2"]["Insert"];

// get_product_groups_v2_with_details — returns JSONB, so the generated type is
// `Json`. Define a structured shape that mirrors what the RPC produces so the
// admin UI gets type safety without a Zod parse step.
export interface GroupV2GeduDetail {
  id: string;
  first_name: string;
  email: string | null;
}

export interface GroupV2ParticipationDetail {
  id: string;
  gamer_id: string;
  gamer_first_name: string;
  gamer_date_of_birth: string | null;
  gamer_gender: GenderType | null;
  status: ParticipationStatus;
  signed_up_at: string;
}

export interface ProductGroupV2WithDetails {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
  gedus: GroupV2GeduDetail[];
  participations: GroupV2ParticipationDetail[];
}

export interface ProductGroupsV2Snapshot {
  product_id: string;
  groups: ProductGroupV2WithDetails[];
  unassigned: GroupV2ParticipationDetail[];
}

// get_gedu_product_detail_v2 — same groups[] shape as the admin RPC, but no
// unassigned[] yet (see docs/products-v2-architecture.md "Gedu details page —
// unassigned-gamers tray" for the future-improvement entry).
export interface ProductGroupsV2GeduSnapshot {
  product_id: string;
  groups: ProductGroupV2WithDetails[];
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

// get_my_groups RPC — the generated type marks nullable LEFT JOIN fields as
// non-nullable. Override to reflect that groups with no enrollments return null
// for gamer-related columns (and gamer branch always returns null for DOB/gender).
// Also overrides product_padlet_url which is nullable in the products table but
// marked non-null by the type generator.
type _MyGroupGenerated = Database["public"]["Functions"]["get_my_groups"]["Returns"][number];
export type MyGroupWithDetails = Omit<
  _MyGroupGenerated,
  | "enrollment_id" | "gamer_id" | "gamer_first_name" | "gamer_date_of_birth" | "gamer_gender"
  | "product_padlet_url"
> & {
  enrollment_id: string | null;
  gamer_id: string | null;
  gamer_first_name: string | null;
  gamer_date_of_birth: string | null;
  gamer_gender: string | null;
  product_padlet_url: string | null;
};

// get_product_groups_with_details RPC — the generated return type incorrectly
// marks LEFT JOIN fields as non-nullable. This override reflects that groups
// with no enrollments return null for all gamer-related columns.
type _GroupDetailsGenerated = Database["public"]["Functions"]["get_product_groups_with_details"]["Returns"][number];
export type ProductGroupWithDetails = Omit<
  _GroupDetailsGenerated,
  "enrollment_id" | "gamer_id" | "gamer_first_name" | "gamer_date_of_birth" | "gamer_gender"
> & {
  enrollment_id: string | null;
  gamer_id: string | null;
  gamer_first_name: string | null;
  gamer_date_of_birth: string | null;
  gamer_gender: Database["public"]["Enums"]["gender_type"] | null;
};

// ---------------------------------------------------------------------------
// App-level types (not generated)
// ---------------------------------------------------------------------------

export interface AuthUser extends User {
  profile?: Profile;
}

export interface SessionUser {
  id: string;
  email: string | null;
  role: UserRole;
  profile: Profile;
}

export interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  error: Error | null;
}

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
