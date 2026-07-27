import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { accessTokenFor, callRpcRaw, createAdminTestClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * The verification spine — docs/db-authorization-architecture.md §3.4.
 *
 * Four of the five checks live here (the write-path IDOR loop is check 3, in
 * write-idor.test.ts, because it needs table fixtures rather than catalog
 * introspection):
 *
 *   1. Static conformance — every plpgsql function reachable by `authenticated`
 *      guards first or is declared self-scoping; `sql`-language functions are
 *      self-scoping by construction; nothing is anon-reachable unguarded; no
 *      exposed function is STRICT.
 *   2. Behavioural role × RPC matrix — every role-gated RPC refuses every role
 *      it does not name, called with all-NULL arguments.
 *   4. Column-grant audit — no UPDATE privilege reaches a privilege-bearing
 *      column, and the column-level write surface is confined to `profiles`.
 *   5. Completeness — every exposed function is in exactly one of the two
 *      classifications, and every self-scoping entry names a real scope test.
 *
 * Checks 1, 2 and 5 interlock: 1 forces a guard to exist, 2 proves the guard
 * behaves as annotated, 5 guarantees nothing escapes both. They replace the
 * grant-level "is this function on the allowlist" test that access-control.test
 * .ts used to carry — that test proved someone had *meant* to expose a function,
 * not that its body enforced anything.
 */

const ROLES = ["admin", "customer", "gedu", "gamer"] as const;
type Role = (typeof ROLES)[number];

const CREDENTIALS: Record<Role, { email: string; password: string }> = {
  admin: TEST_CREDENTIALS.ADMIN,
  customer: TEST_CREDENTIALS.CUSTOMER,
  gedu: TEST_CREDENTIALS.GEDU,
  gamer: TEST_CREDENTIALS.GAMER,
};

/** The canonical forbidden SQLSTATE every guard primitive raises. */
const FORBIDDEN = "42501";

// ---------------------------------------------------------------------------
// Classification 1 of 2 — role-gated RPCs (check 2's annotations)
// ---------------------------------------------------------------------------

interface RoleGatedRpc {
  /** Roles whose calls get past the guard. Everyone else must get 42501. */
  permittedRoles: readonly Role[];
  /**
   * Set only when a permitted role ALSO hits a 42501 further down the body on
   * all-NULL arguments, which makes the positive half of the matrix
   * unassertable. The string is the reason, and it is deliberately narrow — the
   * positive assertion is what stops a permissive annotation from passing check
   * 2 vacuously, so opting out of it needs to be visible.
   */
  permittedAlsoForbiddenOnNullArgs?: string;
}

const ROLE_GATED_RPCS: Record<string, RoleGatedRpc> = {
  // --- admin-gated ---------------------------------------------------------
  apply_group_changes: { permittedRoles: ["admin"] },
  create_product: { permittedRoles: ["admin"] },
  update_product: { permittedRoles: ["admin"] },
  get_product_groups_with_details: { permittedRoles: ["admin"] },
  promote_from_waitlist: { permittedRoles: ["admin"] },
  demote_to_waitlist: { permittedRoles: ["admin"] },
  set_gedu_verified: { permittedRoles: ["admin"] },

  // --- customer-gated ------------------------------------------------------
  // Phase 3's grant-plus-guard conversion. Past the role guard, a customer
  // reaches the engine with a NULL product id and is refused with
  // `no_data_found` — an error, but not the forbidden one, which is exactly what
  // the positive half of the matrix asserts.
  join_product_waitlist: { permittedRoles: ["customer"] },

  // --- gedu-gated ----------------------------------------------------------
  get_my_assigned_products: { permittedRoles: ["gedu"] },
  get_gedu_assigned_product: {
    permittedRoles: ["gedu"],
    permittedAlsoForbiddenOnNullArgs:
      "past the role guard, a gedu with no assignment on the (NULL) product is " +
      "refused by a second 42501 — the ownership half of this RPC's gate. Its " +
      "positive path is covered by get-gedu-assigned-product.test.ts.",
  },

  // --- the guard primitives themselves -------------------------------------
  // Exposed to `authenticated` because create_product / update_product are
  // SECURITY INVOKER, so their guard runs as the caller (see migration 00120).
  // They are role-gated by definition, so the matrix covers them like any other.
  assert_admin: { permittedRoles: ["admin"] },
  // No role passes: the all-NULL convention hands it a NULL role name, which it
  // refuses outright rather than letting the comparison swallow it. That refusal
  // is the whole point of the NULL branch, so pinning it here is not a
  // technicality — it is the check.
  assert_role: { permittedRoles: [] },
};

// ---------------------------------------------------------------------------
// Classification 2 of 2 — self-scoping helpers (check 5's allowlist)
// ---------------------------------------------------------------------------

/**
 * Functions with no role gate *by design*: every read and write is keyed to
 * `auth.uid()`, so an authenticated caller getting an answer about themselves is
 * the intent. Their failure mode is not "wrong role got in" but *scope leakage* —
 * returning someone else's row — which no static check can see. So each entry
 * names the test that proves the scoping, and check 5 verifies that test exists
 * and mentions the function. An entry with no scope test is vetted by nothing;
 * allowlist growth is this design's failure mode.
 */
const SELF_SCOPING: Record<string, { scopeTest: string; why: string }> = {
  get_user_role: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "returns the caller's own role, read from their own profiles row",
  },
  is_admin: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "boolean about the caller; the named admin predicate for RLS policies",
  },
  is_parent_of: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "answers only 'am I the parent of X', bounded to the caller's uid",
  },
  can_read_product: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "read predicate behind the product policies; anon-reachable on purpose, and its anon branch returns true only for published+visible products",
  },
  get_my_gamers: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "the caller's own linked gamers",
  },
  get_my_parents: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "the caller's own linked parents",
  },
  is_voice_group_member: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "boolean about the caller's own membership of a voice group",
  },
  is_voice_group_moderator: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "boolean about the caller's own moderator standing in a voice group",
  },
  get_my_participation_subscription_states: {
    scopeTest: "tests/db/get-my-participation-subscription-states.test.ts",
    why: "billing-state signals for participations the caller is party to",
  },
  submit_my_feedback: {
    scopeTest: "tests/db/feedback-submission.test.ts",
    why: "writes a feedback row for auth.uid(); no parameter names a user, and every role may send feedback",
  },
  get_waitlist_position: {
    scopeTest: "tests/db/waitlist-admin.test.ts",
    why: "owner-authorized: returns NULL rather than a position for a row the caller neither purchased nor is the gamer on",
  },
  set_my_pin: {
    scopeTest: "tests/db/parent-pin.test.ts",
    why: "writes the caller's own customer_profiles.pin_hash",
  },
  verify_my_pin: {
    scopeTest: "tests/db/parent-pin.test.ts",
    why: "compares against the caller's own pin_hash; never returns it",
  },
  pin_is_set: {
    scopeTest: "tests/db/parent-pin.test.ts",
    why: "boolean about the caller's own PIN",
  },
};

/**
 * Functions `anon` may execute. `can_read_product` is the sole member: the
 * product read policies are `TO anon, authenticated`, so anon evaluates the
 * predicate itself.
 */
const ANON_ALLOWLIST = new Set(["can_read_product"]);

/**
 * check 1 exempts `assert_role` from the guard-first rule: it *is* the guard.
 * Requiring the primitive to open by calling itself is circular. `assert_admin`
 * is deliberately not exempt — it delegates to `assert_role`, so it satisfies
 * the rule on its own merits and the check should keep saying so.
 */
const GUARD_PRIMITIVE_EXEMPT = new Set(["assert_role"]);

/**
 * Privilege-bearing columns: a column whose value decides what its own row's
 * owner is allowed to do, or that carries money / seats / enrollment state. No
 * UPDATE privilege may reach them, whether granted at table or column level —
 * a broad table grant must never quietly make a privilege column writable.
 */
const PRIVILEGE_COLUMN_DENYLIST: readonly (readonly [string, string])[] = [
  // The canonical one: writable `role` is self-promotion to admin.
  ["profiles", "role"],
  // Verification gates gedu group assignment and voice-room moderation; the
  // audit columns are stamped server-side by set_gedu_verified.
  ["gedu_profiles", "verified"],
  ["gedu_profiles", "verified_at"],
  ["gedu_profiles", "verified_by"],
  // Enrollment state — a writable status is a free seat.
  ["participations", "status"],
  ["participations", "customer_id"],
  ["participations", "gamer_id"],
  ["participations", "group_id"],
  // Money.
  ["payments", "amount_cents"],
  ["refunds", "amount_cents"],
  ["family_subscriptions", "status"],
  ["family_subscriptions", "current_period_end"],
  // Seat accounting — the rollup the capacity gate reads.
  ["product_seat_counts", "active_count"],
  ["product_seat_counts", "reserving_count"],
  ["product_seat_counts", "waitlist_count"],
  // The parent PIN hash.
  ["customer_profiles", "pin_hash"],
];

/**
 * The only table whose UPDATE surface is column-scoped rather than table-wide.
 * Pinned exactly: these four are the safe profile fields a user may edit.
 */
const PROFILES_UPDATABLE_COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "spoken_languages",
];

// ---------------------------------------------------------------------------
// Catalog plumbing
// ---------------------------------------------------------------------------

const functionSurfaceRows = z.array(
  z.object({
    function_name: z.string(),
    function_language: z.string(),
    is_security_definer: z.boolean(),
    is_strict: z.boolean(),
    authenticated_access: z.boolean(),
    anon_access: z.boolean(),
    argument_names: z.array(z.string()),
    body: z.string(),
  })
);

type FunctionSurface = z.infer<typeof functionSurfaceRows>[number];

const columnGrantRows = z.array(
  z.object({
    table_name: z.string(),
    column_name: z.string(),
    privilege_type: z.string(),
  })
);

const tableGrantRows = z.array(
  z.object({ table_name: z.string(), privilege_type: z.string() })
);

/** Strips SQL comments so the first-statement scan can't be fooled by prose. */
function stripSqlComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/**
 * The first executable statement of a plpgsql body: everything between the
 * opening `BEGIN` (past any DECLARE section) and the first `;`.
 */
function firstStatementOf(body: string): string {
  const source = stripSqlComments(body);
  const begin = /\bBEGIN\b/i.exec(source);
  if (!begin) return "";

  const rest = source.slice(begin.index + begin[0].length);
  const terminator = rest.indexOf(";");
  return (terminator === -1 ? rest : rest.slice(0, terminator)).trim();
}

/**
 * The canonical guard call. Schema-qualified because every guarded function sets
 * an empty (or narrow) search_path, so an unqualified call would not resolve —
 * requiring the qualified form here keeps the one greppable shape §3.1 promises.
 */
const GUARD_CALL = /^PERFORM\s+public\.assert_(role|admin|self)\s*\(/i;

describe("authorization spine (§3.4)", () => {
  let admin: SupabaseClient<Database>;
  let surface: FunctionSurface[];
  let exposed: FunctionSurface[];
  const tokens = new Map<Role, string>();

  /** The signed-in access token for a role, seeded in beforeAll. */
  function tokenFor(role: Role): string {
    const jwt = tokens.get(role);
    if (jwt === undefined) throw new Error(`no access token for ${role}`);
    return jwt;
  }

  beforeAll(async () => {
    admin = createAdminTestClient();

    const { data, error } = await admin.rpc(
      "_list_function_authorization_surface"
    );
    expect(error).toBeNull();
    surface = functionSurfaceRows.parse(data);
    exposed = surface.filter((fn) => fn.authenticated_access);

    for (const role of ROLES) {
      tokens.set(
        role,
        await accessTokenFor(
          CREDENTIALS[role].email,
          CREDENTIALS[role].password
        )
      );
    }
  });

  // -------------------------------------------------------------------------
  // Check 1 — static conformance
  // -------------------------------------------------------------------------

  describe("check 1 — static conformance", () => {
    it("every plpgsql function exposed to authenticated guards first or is declared self-scoping", () => {
      const offenders = exposed
        .filter((fn) => fn.function_language === "plpgsql")
        .filter((fn) => !(fn.function_name in SELF_SCOPING))
        .filter((fn) => !GUARD_PRIMITIVE_EXEMPT.has(fn.function_name))
        .filter((fn) => !GUARD_CALL.test(firstStatementOf(fn.body)))
        .map((fn) => `${fn.function_name}: ${firstStatementOf(fn.body)}`);

      expect(
        offenders,
        "a role-gated function must open with a §3.1 guard primitive — " +
          "add `PERFORM public.assert_…();` as its first statement, or classify " +
          "it as self-scoping with a scope test"
      ).toEqual([]);
    });

    it("every sql-language function exposed to authenticated is classified self-scoping", () => {
      // `LANGUAGE sql` has no statement order, so "guard first" is meaningless
      // there. That is only safe while every such function is self-scoping — at
      // which point check 5's scope-test requirement is what vets it.
      const offenders = exposed
        .filter((fn) => fn.function_language === "sql")
        .filter((fn) => !(fn.function_name in SELF_SCOPING))
        .map((fn) => fn.function_name);

      expect(
        offenders,
        "a role-gated function cannot be LANGUAGE sql — it has no first " +
          "statement to guard with; rewrite it as plpgsql"
      ).toEqual([]);
    });

    it("no function is reachable by anon unless allowlisted", () => {
      const offenders = surface
        .filter((fn) => fn.anon_access)
        .map((fn) => fn.function_name)
        .filter((name) => !ANON_ALLOWLIST.has(name));

      expect(offenders).toEqual([]);
    });

    it("no exposed function is declared STRICT", () => {
      // A STRICT function returns NULL on NULL input *without running its body*,
      // so its guard never executes and check 2's all-NULL calls would silently
      // pass against an unguarded function.
      const offenders = surface
        .filter((fn) => fn.authenticated_access || fn.anon_access)
        .filter((fn) => fn.is_strict)
        .map((fn) => fn.function_name);

      expect(offenders).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Check 2 — behavioural role × RPC matrix
  // -------------------------------------------------------------------------

  describe("check 2 — role × RPC matrix", () => {
    /** All-NULL argument object, built from the catalog's parameter names. */
    function nullArgsFor(functionName: string): Record<string, null> {
      const fn = exposed.find((row) => row.function_name === functionName);
      if (!fn) throw new Error(`${functionName} is not exposed to authenticated`);
      return Object.fromEntries(fn.argument_names.map((name) => [name, null]));
    }

    const pairs = Object.entries(ROLE_GATED_RPCS).flatMap(([name, annotation]) =>
      ROLES.map((role) => ({ name, role, annotation }))
    );

    const refusals = pairs.filter(
      ({ role, annotation }) => !annotation.permittedRoles.includes(role)
    );
    const passes = pairs.filter(
      ({ role, annotation }) =>
        annotation.permittedRoles.includes(role) &&
        !annotation.permittedAlsoForbiddenOnNullArgs
    );

    it.each(refusals.map(({ name, role }) => [name, role] as const))(
      "%s refuses a %s",
      async (name, role) => {
        const result = await callRpcRaw(tokenFor(role), name, nullArgsFor(name));

        expect(
          result.code,
          `${name} let a ${role} past its guard (status ${result.status}, ${result.message})`
        ).toBe(FORBIDDEN);
      }
    );

    it.each(passes.map(({ name, role }) => [name, role] as const))(
      "%s admits a %s past the guard",
      async (name, role) => {
        // The negative half alone would pass vacuously if every role were
        // annotated as permitted. This asserts the other direction: the named
        // role is *not* refused — it gets through the guard and fails (or
        // succeeds) on the merits of its NULL arguments instead.
        const result = await callRpcRaw(tokenFor(role), name, nullArgsFor(name));

        expect(
          result.code,
          `${name} refused a ${role}, which its annotation names as permitted`
        ).not.toBe(FORBIDDEN);
      }
    );
  });

  // -------------------------------------------------------------------------
  // Check 4 — column-grant audit
  // -------------------------------------------------------------------------

  describe("check 4 — column-grant audit", () => {
    async function columnGrants(grantee: string) {
      const { data, error } = await admin.rpc("_list_column_grants", {
        p_grantee: grantee,
      });
      expect(error).toBeNull();
      return columnGrantRows.parse(data);
    }

    it("no privilege-bearing column is updatable by authenticated or anon", async () => {
      const denied = new Set(
        PRIVILEGE_COLUMN_DENYLIST.map(([table, column]) => `${table}.${column}`)
      );

      for (const grantee of ["authenticated", "anon"]) {
        const offenders = (await columnGrants(grantee))
          .filter((row) => row.privilege_type === "UPDATE")
          .map((row) => `${row.table_name}.${row.column_name}`)
          .filter((key) => denied.has(key));

        expect(offenders, `${grantee} can UPDATE a privilege column`).toEqual(
          []
        );
      }
    });

    it("column-level UPDATE outside a table-level grant is confined to profiles", async () => {
      // information_schema.column_privileges is the union of table-level and
      // column-level ACLs, so subtracting the tables that hold a table-wide
      // UPDATE grant (already pinned by access-control.test.ts) leaves exactly
      // the column-scoped ones. `profiles` is the only intended member.
      const { data, error } = await admin.rpc("_list_table_grants", {
        p_grantee: "authenticated",
      });
      expect(error).toBeNull();

      const tableWideUpdate = new Set(
        tableGrantRows
          .parse(data)
          .filter((row) => row.privilege_type === "UPDATE")
          .map((row) => row.table_name)
      );

      const columnScoped = [
        ...new Set(
          (await columnGrants("authenticated"))
            .filter((row) => row.privilege_type === "UPDATE")
            .map((row) => row.table_name)
            .filter((table) => !tableWideUpdate.has(table))
        ),
      ].sort();

      expect(columnScoped).toEqual(["profiles"]);
    });

    it("profiles exposes exactly the safe columns for UPDATE", async () => {
      const updatable = (await columnGrants("authenticated"))
        .filter(
          (row) => row.table_name === "profiles" && row.privilege_type === "UPDATE"
        )
        .map((row) => row.column_name)
        .sort();

      expect(updatable).toEqual([...PROFILES_UPDATABLE_COLUMNS].sort());
    });

    it("anon holds no column-level write privilege anywhere", async () => {
      // The table-level sibling of this assertion lives in access-control.test
      // .ts; column privileges are invisible to it, which is the hole this
      // closes.
      const writes = (await columnGrants("anon")).filter(
        (row) => row.privilege_type !== "SELECT"
      );

      expect(writes).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Check 5 — completeness
  // -------------------------------------------------------------------------

  describe("check 5 — completeness", () => {
    it("every function exposed to authenticated is classified exactly once", () => {
      const unclassified = exposed
        .map((fn) => fn.function_name)
        .filter((name) => !(name in ROLE_GATED_RPCS) && !(name in SELF_SCOPING));

      expect(
        unclassified,
        "a newly exposed function must be annotated in ROLE_GATED_RPCS (with " +
          "its permitted roles) or in SELF_SCOPING (with a scope test)"
      ).toEqual([]);

      const both = Object.keys(ROLE_GATED_RPCS).filter(
        (name) => name in SELF_SCOPING
      );
      expect(both, "a function cannot be both role-gated and self-scoping").toEqual(
        []
      );
    });

    it("every classified function is actually exposed", () => {
      // The other direction: a stale annotation for a function that was dropped
      // or un-granted silently shrinks the matrix.
      const exposedNames = new Set(exposed.map((fn) => fn.function_name));
      const stale = [
        ...Object.keys(ROLE_GATED_RPCS),
        ...Object.keys(SELF_SCOPING),
      ].filter((name) => !exposedNames.has(name));

      expect(stale).toEqual([]);
    });

    it("every self-scoping entry names a scope test that exercises it", () => {
      const offenders: string[] = [];

      for (const [name, entry] of Object.entries(SELF_SCOPING)) {
        const file = join(process.cwd(), entry.scopeTest);
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is a repo-relative literal from the SELF_SCOPING table above, not input; reading it is the point of the check
        if (!existsSync(file)) {
          offenders.push(`${name}: ${entry.scopeTest} does not exist`);
          continue;
        }
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- same literal path, already proven to exist one line above
        if (!readFileSync(file, "utf8").includes(name)) {
          offenders.push(`${name}: ${entry.scopeTest} never mentions it`);
        }
      }

      expect(
        offenders,
        "a self-scoping function is vetted by its scope test and nothing else"
      ).toEqual([]);
    });
  });
});
