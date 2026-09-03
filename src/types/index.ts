// Re-export the raw generated types (Database, Json, etc.)
// database.types.ts is auto-generated — do not hand-edit.
// After running `supabase gen types`, check whether new tables/enums
// need convenience aliases added below.
export type { Database, Json } from "./database.types";
export { Constants } from "./database.types";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
// The one definition of a creation entry (00227), imported rather than restated
// because the hand-written document interfaces below have to carry the same
// shape the zod contracts do. Re-exported further down with the rest of the
// member-flair types.
import type { GamerCreation } from "@/services/member-flair/member-flair.contracts";

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
 * filter (`customer_id = auth.uid()` vs. `participant_id = auth.uid()`) and the
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

// gedu_contract_versions / gedu_contract_acceptances
//
// No Insert/Update aliases for either: neither table carries a write grant for
// any Data API role. Versions arrive by migration, and an acceptance is written
// only by the RPC that stamps it, so an Insert type here would name a statement
// nothing in the app is allowed to make.
export type GeduContractVersion =
  Database["public"]["Tables"]["gedu_contract_versions"]["Row"];
export type GeduContractAcceptance =
  Database["public"]["Tables"]["gedu_contract_acceptances"]["Row"];

// consent_documents / consent_document_versions / product_required_consents /
// consent_acceptances (00210) — the enrolment-consent feature.
//
// Row aliases only, for the same reason the gedu contract has none: not one of
// these four tables carries a write grant for any Data API role. Documents and
// versions arrive by migration, a product's requirement set is written by
// `set_product_required_consents`, and an acceptance is written by
// `record_required_consents` from inside the two enrolment RPCs — so an Insert
// type here would name a statement nothing in the app is allowed to make.
//
// A ConsentAcceptance is a NON-REVOCABLE enrolment condition and carries no
// revoked state by design; the revocable marketing/media consents are a
// separate future system and must not be folded into these types.
export type ConsentDocument =
  Database["public"]["Tables"]["consent_documents"]["Row"];
export type ConsentDocumentVersion =
  Database["public"]["Tables"]["consent_document_versions"]["Row"];
export type ProductRequiredConsent =
  Database["public"]["Tables"]["product_required_consents"]["Row"];
export type ConsentAcceptance =
  Database["public"]["Tables"]["consent_acceptances"]["Row"];

// marketing_consents / marketing_consent_events / product_marketing_consents
// (00220) — the REVOCABLE marketing-consent feature, and deliberately not the
// same system as the four aliases above. A ConsentAcceptance is a
// non-revocable enrolment condition keyed per seat; a MarketingConsent is
// account-level, carries a current state, and can be switched off from
// settings at any time. Nothing should ever widen one set of types into the
// other — see 00210's header and 00220's.
//
// Row aliases only, on the same reasoning as the enrolment-consent block: none
// of these three tables carries a write grant for any Data API role. A parent's
// own answer is written by `set_marketing_consent` (or, at registration, by the
// register route's service-role client), and a product's ask set by
// `admin_set_product_marketing_consents` — so an Insert type here would name a
// statement nothing in the app is allowed to make.
export type MarketingConsentType =
  Database["public"]["Enums"]["marketing_consent_type"];
export type MarketingConsent =
  Database["public"]["Tables"]["marketing_consents"]["Row"];
export type MarketingConsentEvent =
  Database["public"]["Tables"]["marketing_consent_events"]["Row"];
export type ProductMarketingConsent =
  Database["public"]["Tables"]["product_marketing_consents"]["Row"];

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

// verification_email_requests — the rate-limit ledger behind the
// verification-email send, and the sibling of the table above in every respect
// but one: a feedback row is the feedback, while these rows exist only to be
// counted by `request_my_verification_email` (which prunes its own expired ones
// on the way past). No application surface reads them; the alias is here
// because the DB test asserts against the row shape.
export type VerificationEmailRequest = Database["public"]["Tables"]["verification_email_requests"]["Row"];

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

/**
 * A `postal_codes` row: the fact that one code reaches one municipality.
 *
 * The whole row is the key, so there is nothing to exclude the way `Location`
 * excludes the columns no surface renders. Nothing references this table, which
 * is why a refresh may rebuild it wholesale — see `src/services/locations/`.
 */
export type PostalCode = Database["public"]["Tables"]["postal_codes"]["Row"];

// gedu_locations (a gedu's coverage areas for substitute matching — rows
// can sit at any level of the location hierarchy)
export type GeduLocation = Database["public"]["Tables"]["gedu_locations"]["Row"];
export type GeduLocationInsert = Database["public"]["Tables"]["gedu_locations"]["Insert"];

// ---------------------------------------------------------------------------
// products (see docs/architecture/products.md)
// ---------------------------------------------------------------------------

// Enums
export type ProductType = Database["public"]["Enums"]["product_type"];
export type BillingMode = Database["public"]["Enums"]["billing_mode"];
export type ProductStatus = Database["public"]["Enums"]["product_status"];
// Fixed set of product topics — one flat axis, no game/subject split. Display
// labels and per-topic info live in src/lib/products/topics.ts (PRODUCT_TOPICS).
export type ProductTopic = Database["public"]["Enums"]["product_topic"];
// Who a product was *designed* for — a different question from the audience
// flags, which say who may hold a seat. At most one per product: the column is
// nullable and untagged is the ordinary state. This alias is the canonical type;
// the tag module under src/components/public/products/ re-exports it and owns the
// label-key resolution.
export type ProductTag = Database["public"]["Enums"]["product_tag"];
// A human language a club is delivered in / a person speaks — the value in
// `products.spoken_language_code` and each entry of `profiles.spoken_languages`.
// Deliberately NOT the UI locale, which is which translation of the app someone
// sees and is constrained by SUPPORTED_LOCALES in code; see the "Locale vs.
// Spoken Language" rule in CLAUDE.md. The ordered value list and the string
// guard live in src/lib/constants/spoken-languages.ts.
export type SpokenLanguageCode = Database["public"]["Enums"]["spoken_language"];

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
// (the optional marketing blurb rendered only on the shop detail page).
//
// `long_description` is **authored markdown** in a `text` column: written in the
// same rich editor the staff-authored feed fields use, read through the shared
// markdown renderer. NULL and the empty string both mean "this locale has no
// long description", and the page renders no card at all for either.
export type ProductTranslation = Database["public"]["Tables"]["product_translations"]["Row"];
export type ProductTranslationInsert = Database["public"]["Tables"]["product_translations"]["Insert"];

// product_prices
export type ProductPrice = Database["public"]["Tables"]["product_prices"]["Row"];
export type ProductPriceInsert = Database["public"]["Tables"]["product_prices"]["Insert"];
export type ProductPriceUpdate = Database["public"]["Tables"]["product_prices"]["Update"];

// product_images — the admin-owned catalogue a product's picture is chosen
// from. One row per distinct image, identified by the sha256 of its bytes;
// `path` is the object key in the public product-images bucket and never
// changes for a given row, so a bucket URL's bytes are immutable by
// construction. `label` is the only mutable column.
//
// A product points at an entry through `products.image_id`; `image_path` stays
// the column every reader paints and is DERIVED from the link by a trigger, so
// nothing in app code should ever write it.
export type ProductImage = Database["public"]["Tables"]["product_images"]["Row"];
export type ProductImageInsert = Database["public"]["Tables"]["product_images"]["Insert"];
export type ProductImageUpdate = Database["public"]["Tables"]["product_images"]["Update"];

// holiday_calendars + calendar_holidays + product_holiday_calendars
export type HolidayCalendar = Database["public"]["Tables"]["holiday_calendars"]["Row"];
export type HolidayCalendarInsert = Database["public"]["Tables"]["holiday_calendars"]["Insert"];
export type CalendarHoliday = Database["public"]["Tables"]["calendar_holidays"]["Row"];
export type CalendarHolidayInsert = Database["public"]["Tables"]["calendar_holidays"]["Insert"];
export type ProductHolidayCalendar = Database["public"]["Tables"]["product_holiday_calendars"]["Row"];
export type ProductHolidayCalendarInsert = Database["public"]["Tables"]["product_holiday_calendars"]["Insert"];

// One admin's editable fake family behind a calendar-feed URL. `definition` is
// `Json` here and is parsed through the sandbox schema at every boundary — the
// shape belongs to that schema, not to the column.
export type CalendarFeedSandbox =
  Database["public"]["Tables"]["calendar_feed_sandboxes"]["Row"];
export type CalendarFeedSandboxInsert =
  Database["public"]["Tables"]["calendar_feed_sandboxes"]["Insert"];

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
// See docs/architecture/products.md §§ 5.5, 5.7, 5.7a, 5.1a, 6.1.
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
 * See docs/architecture/products.md §3 "Participation state vocabulary":
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
// See docs/architecture/products.md §4.1, §5.4, §6.1a.
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

// group_session_images — the photos attached to one session's report. Same
// posture as the two tables above (RLS on, zero policies, nothing granted to
// `authenticated`), so these aliases likewise serve the service-role side. The
// row's id is also the object's name in the public `session-images` bucket,
// which is why there is no path column to alias.
export type GroupSessionImage = Database["public"]["Tables"]["group_session_images"]["Row"];
export type GroupSessionImageInsert = Database["public"]["Tables"]["group_session_images"]["Insert"];

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
// member flair (00203) — the two staff-only marks a gedu reads off a roster
// before they read a single name: how new a member is to the group, and what
// the last person to run it wrote down about them.
// ---------------------------------------------------------------------------

// gamer_group_notes — one row per (group, member). No Data API role holds a
// grant on this table and RLS is on with no policy at all: every read rides a
// roster document or `get_group_staff_overlay`, every write goes through
// `set_gamer_group_note`, and all of those are SECURITY DEFINER. So these
// aliases exist for the service-role side (db tests, admin tooling) rather than
// for browser queries — the same arrangement as the session tables above.
//
// No Update alias: the write RPC upserts, and a trimmed-empty save deletes the
// row rather than updating it to an empty string, so nothing in the app makes a
// bare UPDATE statement for one to name.
export type GamerGroupNote = Database["public"]["Tables"]["gamer_group_notes"]["Row"];
export type GamerGroupNoteInsert = Database["public"]["Tables"]["gamer_group_notes"]["Insert"];

// get_group_staff_overlay / set_gamer_group_note — both return JSONB, so the
// generated types are `Json`. The structured shapes are derived from the zod
// contracts the service and the db tests both parse through. Re-exported here so
// consumers keep importing their types from "@/types".
export type {
  GamerGroupNoteResult,
  GroupStaffOverlay,
  GroupStaffOverlayMember,
} from "@/services/member-flair/member-flair.contracts";

// ---------------------------------------------------------------------------
// gamer creations (00227) — the things a member made during a group's run, as a
// list of {title, url}. The private note's structural twin, with one difference
// that decides nothing here and everything downstream: the gamer's own family
// reads this list, where the note is staff-only forever.
// ---------------------------------------------------------------------------

// gamer_group_creations — one row per (group, member), and the same access
// arrangement as gamer_group_notes above: no Data API role holds a grant, RLS is
// on with no policy at all, every read rides a document RPC and every write goes
// through `set_gamer_group_creations`. So these aliases exist for the
// service-role side (db tests, admin tooling), not for browser queries.
//
// `creations` types as `Json` — the generator cannot see the CHECK that makes it
// an array of {title, url}. The structured shape is the zod contract the service
// and the db tests parse through.
//
// No Update alias: the write RPC upserts, and an empty list deletes the row
// rather than storing [], so nothing in the app makes a bare UPDATE statement
// for one to name.
export type GamerGroupCreations = Database["public"]["Tables"]["gamer_group_creations"]["Row"];
export type GamerGroupCreationsInsert =
  Database["public"]["Tables"]["gamer_group_creations"]["Insert"];

// set_gamer_group_creations returns JSONB and every widened reader emits the
// list as JSONB too, so the generated types are `Json` throughout. The
// structured shapes are the zod contracts the service and the db tests both
// parse through — `GamerCreation` is the entry the four widened documents all
// carry, and its rules are the table's CHECK. Re-exported here so consumers keep
// importing their types from "@/types".
export type {
  GamerCreation,
  GamerCreationList,
  GamerGroupCreationsResult,
} from "@/services/member-flair/member-flair.contracts";

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

// chat (00228/00229) — persisted messaging in the scheduled voice rooms. Rows
// only; the transport-free UI shapes (`ChatMessage`, `ChatAccount`) live in
// src/components/chat/ and are deliberately not these.
export type ChatChannelType = Database["public"]["Enums"]["chat_channel_type"];
export type ChatChannel = Database["public"]["Tables"]["chat_channels"]["Row"];
export type ChatMessageRow = Database["public"]["Tables"]["chat_messages"]["Row"];
export type ChatReactionRow = Database["public"]["Tables"]["chat_reactions"]["Row"];
export type ChatChannelLockRow = Database["public"]["Tables"]["chat_channel_locks"]["Row"];

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

// get_admin_dashboard — the single JSONB document behind the admin dashboard,
// generated as `Json` for the same reason. Same arrangement as above: the
// structured shape is derived from the adminDashboardSnapshot zod contract that
// the service and the db test both parse through.
export type {
  AdminDashboardAttentionProduct,
  AdminDashboardCertificationCandidate,
  AdminDashboardGroupWithoutGedu,
  AdminDashboardScheduleProduct,
  AdminDashboardScheduleSlot,
  AdminDashboardSnapshot,
  AdminDashboardUserStat,
  AdminDashboardWaitlistPressure,
} from "@/services/admin-dashboard/admin-dashboard.contracts";

// get_gedu_assigned_product — the JSONB document that backs the gedu's
// session-details page (entered from a dashboard session card, but
// product-scoped). Lives at /gedu/clubs/[id], /gedu/camps/[id], or
// /gedu/events/[id] depending on the product's type. The RPC raises 42501
// unless the caller has a gedu_group_assignments row on the product —
// hence the "assigned" name.
//
// Generated as `Json`; pin a structured shape here so consumers don't cast.
// Roster + parent_email are populated only on the caller's own group; sister
// groups carry just participant_count + gedus[] so a gedu can see who they're
// teaching alongside without leaking the sister-group roster.
export interface GeduAssignedProductRosterEntry {
  participant_id: string;
  first_name: string;
  /**
   * The child-shaped facts, null together on an adult seat: an adult has no
   * `gamer_profiles` row and no linked game account. Rendered as a deliberate
   * absence, not as missing data.
   */
  date_of_birth: string | null;
  minecraft_username: string | null;
  /** UUID present only when the account's Minecraft username is *verified*. */
  minecraft_uuid: string | null;
  roblox_username: string | null;
  /**
   * Roblox's int64 account id, present only when a lookup *verified* the
   * handle. A number where the Minecraft key is a string, because the columns
   * are `bigint` and `text` respectively — the two are not one value space.
   */
  roblox_user_id: number | null;
  gender: GenderType | null;
  parent_email: string | null;
  /**
   * The seat-holder's own address, and only theirs: emitted for an adult
   * participant (a parent occupying their own seat) and null for every child
   * row, because a gamer profile's email is the synthetic
   * `@gamer.sogverse.internal` handle rather than a mailbox.
   */
  participant_email: string | null;
  /**
   * When this seat entered **this group** — not when it was taken on the
   * product. A move between two groups of one product resets it, which is the
   * whole claim the newcomer badge makes. Null when the seat predates the
   * column: there was deliberately no backfill, so launch day is quiet.
   *
   * Emitted unconditionally, on camps and events too. The timestamp is a
   * **fact**; whether to draw a badge from it is a **presentation** rule, and
   * that rule lives in one place (`showsNewcomerBadge`) rather than in four
   * RPCs.
   */
  group_joined_at: string | null;
  /**
   * The staff-only note about this member **in this group**, and null when
   * nobody has written one — the absence of a row is what "no note" means
   * everywhere. It does not follow a member moved to another group.
   */
  note: string | null;
  /**
   * Who last wrote that note, for the "Last edited by {first name}" line. Null
   * with no note, and null alongside one only when the editor's account is gone
   * (the column is ON DELETE SET NULL) — the note stands and the surface shows
   * no editor line.
   */
  note_updated_by_first_name: string | null;
  /**
   * What this member made during the group's run (00227), in the order staff
   * arranged them. Always an array — `[]` is what "no creations" looks like, and
   * the absence of a row is what produces it.
   *
   * The one field on this row that is **not** staff-only: the member's own
   * family reads the same list on their product page. It rides the staff roster
   * because the roster row is where the per-gamer dialog is opened from.
   */
  creations: GamerCreation[];
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
  participant_count: number;
  gedus: GeduAssignedProductGroupGedu[];
  /** Populated only when `is_my_group` is true; null otherwise. */
  roster: GeduAssignedProductRosterEntry[] | null;
}

export interface GeduAssignedProductShell {
  id: string;
  product_type: Database["public"]["Enums"]["product_type"];
  /**
   * What the product is about, and therefore which game identity (if any) its
   * surfaces show — resolved through `platformForTopic` in
   * `src/lib/products/topics`. Non-nullable: every product carries a topic.
   */
  topic: ProductTopic;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  is_remote: boolean;
  /**
   * Does this product contractually require a creation from every member
   * (00227)? Staff-facing only, and carried in parity with the gedu group
   * feed's product shell — the page composes both documents.
   */
  requires_gamer_creations: boolean;
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
 * (see docs/architecture/performance.md) yields only the signed claims — `id` (`sub`) and
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
 * server path it fans out into the F1 auth-waterfall (see docs/architecture/performance.md).
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
