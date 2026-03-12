import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TEST_IDS, SEED } from "./constants";

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
 * Creates the seed enrollment via direct INSERT (no token deduction).
 * Use this in test files that need an enrollment to exist for read-only
 * assertions. Idempotent — safe to call even if the enrollment already exists.
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
 * Resets token-related test data between runs.
 */
export async function resetTokenState(
  admin: SupabaseClient<Database>
): Promise<void> {
  // Delete any token_transactions created during tests for test customers
  const testCustomerIds = [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2];

  for (const customerId of testCustomerIds) {
    await admin
      .from("token_transactions")
      .delete()
      .eq("user_id", customerId);
  }

  // Reset customer 1 token balance to seed value
  await admin
    .from("customer_profiles")
    .update({ token_balance: SEED.CUSTOMER_TOKEN_BALANCE })
    .eq("user_id", TEST_IDS.CUSTOMER);

  // Reset customer 2 token balance to 0 (seed default)
  await admin
    .from("customer_profiles")
    .update({ token_balance: 0 })
    .eq("user_id", TEST_IDS.CUSTOMER_2);
}

/**
 * Resets enrollment-related test data. Deletes all test enrollments
 * (which cascades to enrollment_charges), then resets token state
 * and product cost.
 */
export async function resetEnrollmentState(
  admin: SupabaseClient<Database>
): Promise<void> {
  // Delete enrollments first — CASCADE removes enrollment_charges,
  // which frees the FK references to token_transactions.
  await admin
    .from("group_enrollments")
    .delete()
    .in("enrolled_by", [TEST_IDS.CUSTOMER, TEST_IDS.CUSTOMER_2]);

  await resetTokenState(admin);

  // Restore the seeded enrollment (deleted above since enrolled_by = CUSTOMER)
  await admin.from("group_enrollments").upsert({
    id: TEST_IDS.ENROLLMENT,
    group_id: TEST_IDS.GROUP,
    gamer_id: TEST_IDS.GAMER,
    enrolled_by: TEST_IDS.CUSTOMER,
    status: "active",
  });

  // Reset product cost (some tests modify it)
  await admin
    .from("products")
    .update({ token_cost: SEED.PRODUCT_TOKEN_COST })
    .eq("id", TEST_IDS.PRODUCT);
}
