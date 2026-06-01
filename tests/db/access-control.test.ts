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
  // RLS predicate for product-scoped read policies (00069). Evaluated in the
  // caller's context by the read_*_via_product policies (TO anon,
  // authenticated), so the role must hold EXECUTE — same as get_user_role.
  "can_read_product",
  "get_my_gamers",
  "get_my_parents",

  "create_product",
  "update_product",

  "get_product_groups_with_details",
  "commit_group_changes",
  "get_gedu_assigned_product",
  "get_my_assigned_products",
]);

/**
 * Allowlist of functions that anonymous (unauthenticated) users can call.
 */
const ANON_ALLOWLIST = new Set([
  // See AUTHENTICATED_ALLOWLIST: the child-table read policies are
  // TO anon, authenticated, so anon evaluates can_read_product too (it
  // returns true only for the public visible-published branch).
  "can_read_product",
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

  it("table-level grants match allowlist (bidirectional: no excess, no missing)", async () => {
    // Allowlist of write privileges per table. Tables not listed here
    // should only have SELECT. If a table needs INSERT/UPDATE/DELETE
    // for authenticated users, add it here with the specific privileges.
    //
    // This test is bidirectional:
    //   - Tables with grants outside the allowlist fail ("excess").
    //   - Tables in the allowlist missing their declared grants fail ("missing").
    // The second direction matters because a dropped GRANT leaves the RLS
    // policy intact but silently breaks every authenticated write against
    // the table — exactly how products/games writes regressed in the past.
    // profiles is intentionally NOT in this allowlist: it uses column-level
    // UPDATE grants on (first_name, last_name, phone, spoken_languages) rather
    // than table-level UPDATE. Column privileges live in information_schema
    // .column_privileges and are out of scope for _list_table_grants.
    const WRITE_GRANT_ALLOWLIST = new Map<string, Set<string>>([
      ["parent_gamer", new Set(["DELETE"])],
      ["gamer_profiles", new Set(["UPDATE"])],
      ["whatsapp_contacts", new Set(["INSERT", "UPDATE"])],
      ["whatsapp_messages", new Set(["INSERT", "UPDATE"])],
      // Gedus write their own coverage rows directly from the browser
      // (setForGedu uses DELETE + INSERT). RLS enforces self-only access
      // and the role-is-gedu check on WITH CHECK.
      ["gedu_locations", new Set(["INSERT", "DELETE"])],
      // products admin UI writes tables directly from the browser via
      // `admin_full_access_*` RLS policies (mirrors how the Sorg-era products
      // table works). Grants enable the underlying commands; RLS restricts
      // authorisation. Stripped at cutover when the  suffix is removed.
      ["products", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["schedule_slots", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["topics", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["tags", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_tags", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_prices", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["holiday_calendars", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["calendar_holidays", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_holiday_calendars", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["site_details", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["site_staff_details", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_translations", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["topic_translations", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["tag_translations", new Set(["INSERT", "UPDATE", "DELETE"])],
    ]);

    const { data, error } = await admin.rpc("_list_table_grants");

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const grants = data as { table_name: string; privilege_type: string }[];

    const excess = grants.filter((row) => {
      if (row.privilege_type === "SELECT") return false;
      const allowed = WRITE_GRANT_ALLOWLIST.get(row.table_name);
      return !allowed || !allowed.has(row.privilege_type);
    });

    expect(excess, "tables have write grants not in the allowlist").toEqual([]);

    const actual = new Set(
      grants
        .filter((row) => row.privilege_type !== "SELECT")
        .map((row) => `${row.table_name}.${row.privilege_type}`)
    );

    const missing: string[] = [];
    for (const [table, privileges] of WRITE_GRANT_ALLOWLIST) {
      for (const privilege of privileges) {
        if (!actual.has(`${table}.${privilege}`)) {
          missing.push(`${table}.${privilege}`);
        }
      }
    }

    expect(missing, "allowlisted grants are missing from the database").toEqual(
      []
    );
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
