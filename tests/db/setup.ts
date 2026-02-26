import { createClient } from "@supabase/supabase-js";
import { beforeAll } from "vitest";

/**
 * DB test setup — verifies local Supabase is running before any tests execute.
 * Uses the service role client (bypasses RLS) to check connectivity.
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

beforeAll(async () => {
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set.\n" +
        "Copy .env.test.local.example to .env.test.local and ensure local Supabase is running (supabase start)."
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Quick connectivity check — query a table that always exists
  const { error } = await admin.from("profiles").select("id").limit(1);

  if (error) {
    throw new Error(
      `Cannot connect to local Supabase at ${supabaseUrl}.\n` +
        `Is it running? Try: supabase start\n` +
        `Error: ${error.message}`
    );
  }
});
