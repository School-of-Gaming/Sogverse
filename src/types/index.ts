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
export type TokenTransactionType = Database["public"]["Enums"]["token_transaction_type"];
export type GenderType = Database["public"]["Enums"]["gender_type"];
export type LocationType = Database["public"]["Enums"]["location_type"];

// profiles
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/** Profile narrowed for gamer context — username is always set */
export type GamerProfileRow = Profile & { username: string };

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

// token_transactions
export type TokenTransaction = Database["public"]["Tables"]["token_transactions"]["Row"];

// voice_rooms
export type VoiceRoom = Database["public"]["Tables"]["voice_rooms"]["Row"];
export type VoiceRoomInsert = Database["public"]["Tables"]["voice_rooms"]["Insert"];
export type VoiceRoomUpdate = Database["public"]["Tables"]["voice_rooms"]["Update"];

// get_available_voice_rooms RPC — the generated type marks nullable LEFT JOIN
// fields as non-nullable. Override to reflect that special rooms have null schedule data.
type _AvailableVoiceRoomGenerated = Database["public"]["Functions"]["get_available_voice_rooms"]["Returns"][number];
export type AvailableVoiceRoom = Omit<
  _AvailableVoiceRoomGenerated,
  "group_id" | "product_name" | "day_of_week" | "start_time" | "timezone" | "duration_minutes" | "gedu_display_name" | "gedu_id" | "enrolled_at"
> & {
  group_id: string | null;
  product_name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  timezone: string | null;
  duration_minutes: number | null;
  gedu_display_name: string | null;
  gedu_id: string | null;
  enrolled_at: string | null;
};

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

// enrollment_charges
export type EnrollmentCharge = Database["public"]["Tables"]["enrollment_charges"]["Row"];

// whatsapp_contacts
export type WhatsAppContact = Database["public"]["Tables"]["whatsapp_contacts"]["Row"];

// whatsapp_messages
export type WhatsAppMessage = Database["public"]["Tables"]["whatsapp_messages"]["Row"];

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
  | "enrollment_id" | "gamer_id" | "gamer_display_name" | "gamer_date_of_birth" | "gamer_gender"
  | "product_padlet_url" | "last_charge_session_date"
> & {
  enrollment_id: string | null;
  gamer_id: string | null;
  gamer_display_name: string | null;
  gamer_date_of_birth: string | null;
  gamer_gender: string | null;
  product_padlet_url: string | null;
  last_charge_session_date: string | null;
};

// get_product_groups_with_details RPC — the generated return type incorrectly
// marks LEFT JOIN fields as non-nullable. This override reflects that groups
// with no enrollments return null for all gamer-related columns.
type _GroupDetailsGenerated = Database["public"]["Functions"]["get_product_groups_with_details"]["Returns"][number];
export type ProductGroupWithDetails = Omit<
  _GroupDetailsGenerated,
  "enrollment_id" | "gamer_id" | "gamer_display_name" | "gamer_date_of_birth" | "gamer_gender"
> & {
  enrollment_id: string | null;
  gamer_id: string | null;
  gamer_display_name: string | null;
  gamer_date_of_birth: string | null;
  gamer_gender: Database["public"]["Enums"]["gender_type"] | null;
};

// ---------------------------------------------------------------------------
// Stripe-driven package types
// ---------------------------------------------------------------------------

import type { SupportedCurrency } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";

export interface StripePackage {
  stripeProductId: string;
  /** English name (base). Use `nameI18n[locale] ?? name` for display. */
  name: string;
  /** English description (base). Use `descriptionI18n[locale] ?? description` for display. */
  description: string | null;
  /** Localised names from Stripe metadata (`name_fi`, `name_sv`, ...). Sparse — missing locales fall back to `name`. */
  nameI18n?: Partial<Record<SupportedLocale, string>>;
  /** Localised descriptions from Stripe metadata (`description_fi`, `description_sv`, ...). Sparse — missing locales fall back to `description`. */
  descriptionI18n?: Partial<Record<SupportedLocale, string>>;
  tokenAmount: number;
  prices: Record<SupportedCurrency, { priceId: string; unitAmount: number }>;
  type: "one_time" | "subscription";
}

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
  username: string;
  password: string;
  displayName: string;
  dateOfBirth: string;
  gender: "boy" | "girl" | "non_binary";
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
  displayName?: string;
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
