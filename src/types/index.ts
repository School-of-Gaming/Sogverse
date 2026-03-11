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

// profiles
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileInsert = Database["public"]["Tables"]["profiles"]["Insert"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

// customer_profiles
export type CustomerProfile = Database["public"]["Tables"]["customer_profiles"]["Row"];
export type CustomerProfileUpdate = Database["public"]["Tables"]["customer_profiles"]["Update"];

// gamer_profiles
export type GamerProfile = Database["public"]["Tables"]["gamer_profiles"]["Row"];
export type GamerProfileUpdate = Database["public"]["Tables"]["gamer_profiles"]["Update"];

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

// product_groups
export type ProductGroup = Database["public"]["Tables"]["product_groups"]["Row"];
export type ProductGroupInsert = Database["public"]["Tables"]["product_groups"]["Insert"];

// group_enrollments
export type GroupEnrollment = Database["public"]["Tables"]["group_enrollments"]["Row"];
export type GroupEnrollmentInsert = Database["public"]["Tables"]["group_enrollments"]["Insert"];

// enrollment_charges
export type EnrollmentCharge = Database["public"]["Tables"]["enrollment_charges"]["Row"];

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
