import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { createAdminTestClient } from "./helpers";

/**
 * Grant- and schema-level access control: which tables `authenticated` and
 * `anon` may write, that every SECURITY DEFINER function pins its search_path,
 * that every table has RLS, that no materialized view exists, and that every
 * view answers as its caller.
 *
 * The *function*-grant allowlists that used to live here are gone. They proved
 * someone had meant to expose a function, not that its body enforced anything —
 * an admin-only RPC with a forgotten role check passed them. They are superseded
 * by authorization-spine.test.ts (docs/db-authorization-architecture.md §3.4),
 * whose checks 1, 2 and 5 together require every function exposed to
 * `authenticated` to be classified as role-gated (and then behaviourally proven
 * to refuse every other role) or self-scoping (and then named to a scope test),
 * with the anon surface pinned the same way. That is a strict superset of what
 * the allowlists asserted, so keeping both would be two places to update and one
 * of them weaker.
 */
const tableGrantRows = z.array(
  z.object({
    table_name: z.string(),
    privilege_type: z.string(),
  })
);

/**
 * `kind` is an enum rather than a string on purpose: `_list_views` derives it
 * from `relkind` with a two-arm CASE and no ELSE, so a third relation class
 * arriving in its filter comes back NULL. Parsing that here fails loudly at the
 * one place that could otherwise treat an unknown class as a plain view.
 */
const viewRows = z.array(
  z.object({
    view_name: z.string(),
    kind: z.enum(["view", "materialized view"]),
    security_invoker: z.boolean(),
    authenticated_select: z.boolean(),
    anon_select: z.boolean(),
  })
);

describe("Access Control", () => {
  let admin: SupabaseClient<Database>;

  beforeAll(() => {
    admin = createAdminTestClient();
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
    // UPDATE grants on the safe self-editable fields rather than table-level
    // UPDATE. Column privileges live in information_schema
    // .column_privileges — out of scope for _list_table_grants, and covered by
    // the column-grant audit in authorization-spine.test.ts.
    //
    // Every table listed here also needs a write-IDOR case in
    // write-idor.test.ts; that file fails if one is missing.
    const WRITE_GRANT_ALLOWLIST = new Map<string, Set<string>>([
      ["parent_gamer", new Set(["DELETE"])],
      ["gamer_profiles", new Set(["UPDATE"])],
      ["whatsapp_contacts", new Set(["INSERT", "UPDATE"])],
      // INSERT only: the outbound-send route inserts and never updates, and the
      // dead UPDATE grant (no policy behind it) was revoked in 00123. Delivery
      // status is stamped by the inbound webhook on the service-role client.
      ["whatsapp_messages", new Set(["INSERT"])],
      // Admin-only reference data. The write policy was always there; the grant
      // that made it reachable arrived in 00123 when the locations routes moved
      // off the service-role client. No DELETE — there is no delete route.
      ["locations", new Set(["INSERT", "UPDATE"])],
      // Users link their own Minecraft account (00123). RLS derives the target
      // row from auth.uid(), so actor and target are the same check. No DELETE:
      // unlinking clears the columns rather than removing the row.
      ["minecraft_accounts", new Set(["INSERT", "UPDATE"])],
      // The same shape one platform over (00146). RLS derives the target row
      // from auth.uid(), so actor and target are the same check, and there is
      // no DELETE for the same reason: unlinking clears the columns.
      ["roblox_accounts", new Set(["INSERT", "UPDATE"])],
      // Gedus write their own coverage rows directly from the browser
      // (setForGedu uses DELETE + INSERT). RLS enforces self-only access
      // and the role-is-gedu check on WITH CHECK.
      ["gedu_locations", new Set(["INSERT", "DELETE"])],
      // products admin UI writes tables directly from the browser via
      // `admin_full_access_*` RLS policies (mirrors how the Sorg-era products
      // table works). Grants enable the underlying commands; RLS restricts
      // authorisation. Stripped at cutover when the  suffix is removed.
      ["products", new Set(["INSERT", "UPDATE", "DELETE"])],
      // The staff-only half of a product (the gedu lesson-material link), split
      // off `products` because that table is anon-readable by column selection.
      // create_product is SECURITY INVOKER, so the row is written by the
      // admin's own client and the grant has to be here; the admin-only RLS
      // policy is what actually authorizes it. (update_product writes the same
      // row but has been SECURITY DEFINER since 00171 — the grant stands on
      // create_product alone now.) DELETE because clearing the link removes the
      // row rather than storing a NULL.
      ["product_staff_details", new Set(["INSERT", "UPDATE", "DELETE"])],
      // The picture catalogue (00196). Admin-only end to end: one FOR ALL
      // policy on is_admin(), no anon grant and no anon policy, because nothing
      // family-facing reads it — a product's picture is served from the derived
      // products.image_path. The admin dialog uploads, renames, repoints and
      // removes entries on the admin's own session client, which is why all
      // four privileges are here rather than behind an RPC.
      ["product_images", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["schedule_slots", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_prices", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["holiday_calendars", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["calendar_holidays", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_holiday_calendars", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["site_details", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["site_staff_details", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["product_translations", new Set(["INSERT", "UPDATE", "DELETE"])],
      // Voice zones (00103, 00108). Moderators create/edit/delete custom zones
      // and write/clear private-zone occupancy directly from the browser under
      // RLS (is_voice_group_moderator). Occupancy is insert/delete only — no
      // UPDATE grant. RLS authorizes both actor and target.
      ["voice_zones", new Set(["INSERT", "UPDATE", "DELETE"])],
      ["voice_private_zone_occupants", new Set(["INSERT", "DELETE"])],
    ]);

    const { data, error } = await admin.rpc("_list_table_grants", {
      p_grantee: "authenticated",
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const grants = tableGrantRows.parse(data);

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

  it("anon has no write grants on any table", async () => {
    // anon's only legitimate table access is SELECT through the public
    // catalog policies (products, locations, holiday calendars, languages).
    // Write grants for anon are never acceptable: RLS default-deny is the
    // only thing between a standing grant and an unauthenticated write path,
    // and a single future policy written without a TO clause (which defaults
    // to PUBLIC, including anon) would arm it. 00097 revoked the legacy
    // auto-expose leftovers; this test keeps the surface at zero.
    const { data, error } = await admin.rpc("_list_table_grants", {
      p_grantee: "anon",
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const writeGrants = tableGrantRows
      .parse(data)
      .filter((row) => row.privilege_type !== "SELECT");

    expect(writeGrants, "anon must never hold table write grants").toEqual([]);
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

  // The view-shaped sibling of the RLS sweep above, and it has to be its own
  // pair of checks because pg_tables — which that one reads — does not list
  // views at all. They are two `it`s rather than one because the two classes of
  // relation `_list_views` returns have different remedies, and a single check
  // could only name one of them.

  it("no public relation is a materialized view", async () => {
    // A matview is the one member of this family with no safe form. It cannot
    // take `security_invoker` (there is no query left to re-run as the caller),
    // it cannot carry RLS, and its rows were computed under the role that
    // refreshed it — which holds BYPASSRLS, so what is stored is already every
    // row of everything it selected from, with no predicate left to narrow it.
    // Any Data API grant on one therefore hands every caller the lot, and the
    // only instruction that would be true is "delete it", which is why this is
    // a ban rather than a flag check.
    const { data, error } = await admin.rpc("_list_views");

    expect(error).toBeNull();

    const materialized = viewRows
      .parse(data)
      .filter((view) => view.kind === "materialized view")
      .map((view) => view.view_name);

    expect(
      materialized,
      "materialized views are banned in `public` — one can take neither " +
        "security_invoker nor RLS, and its rows were materialized under a " +
        "BYPASSRLS role; use a plain security_invoker view, or an indexed " +
        "table maintained by a trigger if the cost is real"
    ).toEqual([]);
  });

  it("all public views run as their caller (security_invoker)", async () => {
    // A view without `security_invoker` runs with its OWNER's rights, and the
    // owner is postgres, which holds BYPASSRLS: it would hand every caller every
    // row of everything it selects from, with a working feature on top and
    // nothing else in CI objecting. `security_invoker` is the structural switch
    // that decides this, exactly as `rowsecurity` is for a table.
    //
    // Scoped to plain views because the flag is meaningless on a matview — the
    // check above is what speaks to those, and a matview failing *this* one
    // would be told to set an option Postgres does not accept.
    //
    // Assert the offending list is empty rather than counting it, so a failure
    // names the view instead of reporting a number.
    const { data, error } = await admin.rpc("_list_views");

    expect(error).toBeNull();

    const ownerRights = viewRows
      .parse(data)
      .filter((view) => view.kind === "view")
      .filter((view) => !view.security_invoker)
      .map((view) => view.view_name);

    expect(
      ownerRights,
      "a view must be created WITH (security_invoker = true) or it returns rows " +
        "its caller's RLS forbids"
    ).toEqual([]);
  });
});
