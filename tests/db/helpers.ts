import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TEST_IDS } from "./constants";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Service-role client — bypasses RLS. Use for setup/teardown and assertions.
 */
export function createAdminTestClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Signs in via Supabase Auth and returns a client that respects RLS.
 * Each call creates a fresh client instance (no shared session state).
 */
export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  }

  return client;
}

/**
 * Creates the seed enrollment via direct INSERT. Idempotent.
 */
export async function seedEnrollment(
  admin: SupabaseClient<Database>
): Promise<void> {
  await admin.from("group_enrollments").upsert({
    id: TEST_IDS.ENROLLMENT,
    group_id: TEST_IDS.GROUP,
    gamer_id: TEST_IDS.GAMER,
    enrolled_by: TEST_IDS.CUSTOMER,
    status: "active",
  });
}

/**
 * Resets enrollment-related test data. Deletes all test enrollments
 * for the seeded customers.
 */
export async function resetEnrollmentState(
  admin: SupabaseClient<Database>
): Promise<void> {
  await admin
    .from("group_enrollments")
    .delete()
    .in("enrolled_by", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);
}
