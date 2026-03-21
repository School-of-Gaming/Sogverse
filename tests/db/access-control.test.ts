import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";

/**
 * Allowlist of functions that authenticated users can call via PostgREST /rpc/.
 * If a new function should be public, add it here. Otherwise, REVOKE EXECUTE
 * from authenticated/anon/public in the migration.
 */
const AUTHENTICATED_ALLOWLIST = new Set([
  "get_user_role",
  "is_admin",
  "is_parent_of",
  "get_my_gamers",
  "get_my_parents",
  "get_visible_products",
  "get_available_voice_rooms",
  "get_product_groups_with_details",

  "get_enrollment_groups",
  "commit_group_changes",
  "get_my_groups",
]);

/**
 * Allowlist of functions that anonymous (unauthenticated) users can call.
 */
const ANON_ALLOWLIST = new Set([
  "get_visible_products",
]);

describe("Access Control", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
  });

  it("only allowlisted RPCs are callable by authenticated users", async () => {
    const { data, error } = await admin.rpc("_list_rpc_access");

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const authenticatedFunctions = (data as {
      function_name: string;
      authenticated_access: boolean;
      anon_access: boolean;
    }[])
      .filter((row) => row.authenticated_access)
      .map((row) => row.function_name);

    const unexpected = authenticatedFunctions.filter(
      (name) => !AUTHENTICATED_ALLOWLIST.has(name)
    );

    expect(unexpected).toEqual([]);
  });

  it("only allowlisted RPCs are callable by anon users", async () => {
    const { data, error } = await admin.rpc("_list_rpc_access");

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const anonFunctions = (data as {
      function_name: string;
      authenticated_access: boolean;
      anon_access: boolean;
    }[])
      .filter((row) => row.anon_access)
      .map((row) => row.function_name);

    const unexpected = anonFunctions.filter(
      (name) => !ANON_ALLOWLIST.has(name)
    );

    expect(unexpected).toEqual([]);
  });

  it("table-level grants match allowlist (no excess write privileges)", async () => {
    // Allowlist of write privileges per table. Tables not listed here
    // should only have SELECT. If a table needs INSERT/UPDATE/DELETE
    // for authenticated users, add it here with the specific privileges.
    const WRITE_GRANT_ALLOWLIST: Record<string, Set<string>> = {
      profiles: new Set(["UPDATE"]),
      parent_gamer: new Set(["DELETE"]),
      gamer_profiles: new Set(["UPDATE"]),
    };

    const { data, error } = await admin.rpc("_list_table_grants");

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const grants = data as { table_name: string; privilege_type: string }[];

    const unexpected = grants.filter((row) => {
      if (row.privilege_type === "SELECT") return false;
      const allowed = WRITE_GRANT_ALLOWLIST[row.table_name];
      return !allowed || !allowed.has(row.privilege_type);
    });

    expect(unexpected).toEqual([]);
  });

  it("all SECURITY DEFINER functions have SET search_path", async () => {
    const { data, error } = await admin.rpc(
      "_list_security_definer_without_search_path"
    );

    expect(error).toBeNull();

    const functions = (data as { function_name: string }[] | null) ?? [];

    expect(functions).toEqual([]);
  });

  it("all public tables have RLS enabled", async () => {
    const { data, error } = await admin.rpc("_list_tables_without_rls");

    expect(error).toBeNull();

    const tables = (data as { table_name: string }[] | null) ?? [];

    expect(tables).toEqual([]);
  });
});
