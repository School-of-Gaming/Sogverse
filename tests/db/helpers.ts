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
 * Resets test data between runs. Only touches rows created by tests —
 * seed data is restored to its original state.
 *
 * Call this in afterEach/afterAll for tests that mutate shared state.
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
