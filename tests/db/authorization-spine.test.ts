import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database.types";
import { accessTokenFor, callRpcRaw, createAdminTestClient } from "./helpers";
import { TEST_CREDENTIALS } from "./constants";

/**
 * The verification spine — docs/architecture/db-authorization.md §3.4.
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
 *      Views are held to the same requirement: a view has no body to guard, so
 *      the only classification open to it is self-scoping, and the scope test is
 *      the whole of its vetting.
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
  // The single writer of product_required_consents (00210). It exists as its own
  // RPC rather than as an inline INSERT because create_product is SECURITY
  // INVOKER: an inline write there would run as the admin's own session role and
  // would need a table write grant on the join table, which is the Data API
  // surface that migration keeps at zero. Exposed to `authenticated` for exactly
  // that reason, and guard-first like every other admin RPC. The positive half of
  // the matrix IS assertable with no fixture: an admin passes the guard and the
  // all-NULL call deletes nothing and inserts nothing rather than raising.
  set_product_required_consents: { permittedRoles: ["admin"] },
  // The single writer of product_marketing_consents (00220) — the revocable
  // consent system's mirror of the RPC directly above, and its own RPC for the
  // same reason: the admin product form reaches it as the admin's own session
  // role, and an inline INSERT would need a table write grant the migration
  // deliberately never issues. The positive half of the matrix IS assertable
  // with no fixture: an admin passes the guard and is then refused by the
  // product-existence check with `no_data_found`, which is an error but not the
  // forbidden one.
  admin_set_product_marketing_consents: { permittedRoles: ["admin"] },
  get_product_groups_with_details: { permittedRoles: ["admin"] },
  // The admin product page's whole session record (00200). Its second question
  // is "does this product exist", which a NULL id answers with P0002 rather
  // than a second 42501 — so unlike every gedu read below, the positive half of
  // the matrix IS assertable here with no fixture.
  get_admin_product_sessions: { permittedRoles: ["admin"] },
  // Takes no arguments at all, so the all-NULL convention hands it an empty
  // argument object and a permitted admin gets the whole document back — the
  // positive half of the matrix is assertable here without a fixture.
  get_admin_dashboard: { permittedRoles: ["admin"] },
  promote_from_waitlist: { permittedRoles: ["admin"] },
  demote_to_waitlist: { permittedRoles: ["admin"] },
  set_gedu_certified: { permittedRoles: ["admin"] },
  // Recording that an educator presented a criminal record extract (00213).
  // Same shape as the certification RPC beside it: past the admin guard, a NULL
  // target is nobody's account and the "is not a gedu" raise answers with P0001
  // rather than a second 42501 — so the positive half of the matrix is
  // assertable here with no fixture.
  set_gedu_criminal_record_check: { permittedRoles: ["admin"] },
  // Phase 3's new-RPC conversions. Past the admin guard, all-NULL arguments hit
  // "no such product" / "no such participation" — an error, but not 42501.
  admin_enroll_participant: { permittedRoles: ["admin"] },
  admin_remove_participation: { permittedRoles: ["admin"] },

  // --- customer-gated ------------------------------------------------------
  // Phase 3's grant-plus-guard conversion. Past the role guard, a customer
  // reaches the engine with a NULL product id and is refused with
  // `no_data_found` — an error, but not the forbidden one, which is exactly what
  // the positive half of the matrix asserts.
  join_product_waitlist: { permittedRoles: ["customer"] },
  // The one self-service writer of a marketing consent (00220). Role-gated
  // rather than self-scoping despite naming no subject — the same shape
  // `accept_gedu_contract` carries below, and the same reasoning: its first
  // statement IS a guard primitive, which is what check 1 reads, and the two
  // classifications are exclusive. The scoping property is real and is enforced
  // in the body rather than by this table (the row is keyed to auth.uid() and
  // there is no argument that could aim it at another family); the RLS scope
  // half is pinned by marketing-consents.test.ts.
  //
  // The role gate is the load-bearing half here and is why this is the right
  // classification of the two: a marketing consent belongs to the purchasing
  // customer, and a gamer, a gedu and an ADMIN are all refused — the admin
  // deliberately, because an admin who is also a parent toggles their consents
  // on that customer account rather than through this function. A self-scoping
  // classification would prove nothing about any of that.
  //
  // The positive half of the matrix IS assertable with no fixture: a customer
  // passes the guard and is then refused by the NULL consent type with
  // check_violation, which is not the forbidden error.
  set_marketing_consent: { permittedRoles: ["customer"] },

  // --- gedu-gated ----------------------------------------------------------
  get_my_assigned_products: { permittedRoles: ["gedu"] },
  // Accepting the gedu contract (00201). Role-gated rather than self-scoping
  // despite naming no subject: its first statement is the gedu role guard, which
  // is what check 1 reads, and the two classifications are exclusive. The
  // scoping property is still real and is enforced elsewhere — the row is keyed
  // to auth.uid() inside the body, and there is no argument that could aim it.
  // The positive half of the matrix IS assertable with no fixture: a gedu passes
  // the guard and is then refused by the version whitelist (a NULL version
  // matches nothing), which is 23503 rather than 42501.
  accept_gedu_contract: { permittedRoles: ["gedu"] },
  get_gedu_assigned_product: {
    permittedRoles: ["gedu"],
    permittedAlsoForbiddenOnNullArgs:
      "past the role guard, a gedu with no assignment on the (NULL) product is " +
      "refused by a second 42501 — the ownership half of this RPC's gate. Its " +
      "positive path is covered by get-gedu-assigned-product.test.ts.",
  },

  // --- the session feed ----------------------------------------------------
  //
  // Every one of these opens with a role guard admitting a gedu — and, on the
  // ones annotated below, an admin as well — and then asks a SECOND question:
  // "do you teach this group / run anything at this building / does this child
  // sit on your roster", which a NULL argument can only answer no to. So the
  // positive half of the matrix is unassertable here for the same
  // reason it is on get_gedu_assigned_product, and for the same reason it is
  // not a hole: each names the file that drives its permitted path against a
  // real fixture.
  // Widened to admins by 00204, and for the same reason the writers below were:
  // the admin product page's per-group GROUP DETAILS page renders the gedu
  // workspace's page body unchanged, so it has to be fed the same document. An
  // admin passes the role guard AND the assignment half outright — that half is
  // a statement about staff reach over one product and has never been one about
  // an admin. The negative half is untouched: a customer and a gamer are still
  // refused on the first statement, which is what keeps the gedu-only material
  // link and the three staff notes off every family surface.
  get_gedu_group_feed: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "past the role guard, a NULL group is a group no gedu teaches, so the " +
      "assignment half of the gate refuses one with a second 42501. An admin " +
      "passes that half and gets a null-shaped document back rather than a " +
      "refusal, so the annotation is carried for the gedu alone — it is per " +
      "function, not per role. Positive paths: gedu-session-feed.test.ts for " +
      "both roles.",
  },
  // The one that CAN be asserted positively: it takes no id at all, only the
  // enforcement epoch, so a gedu with no assignments gets an empty list rather
  // than a refusal.
  get_my_gedu_assignment_summaries: { permittedRoles: ["gedu"] },
  // Since 00200 the four writers below — and the site-notes writer further
  // down — admit an ADMIN beside the assigned gedu. The guard itself is one
  // call that asserts whichever of the two roles the caller holds, so the
  // negative half of the matrix is unchanged: a customer and a gamer are still
  // refused on the first statement. What an admin skips is only the SECOND
  // question each of these asks — "and do you teach this group / run something
  // at this building" — and nothing else about them.
  set_group_session_notes: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "for a gedu, the assignment half of the gate refuses a NULL group with a " +
      "second 42501; an admin passes that half and is then refused by the " +
      "writable-date check with check_violation, which is not 42501 but is not " +
      "assertable through this annotation either, since it is per function " +
      "rather than per role. Positive paths: gedu-session-feed.test.ts for the " +
      "gedu, admin-product-sessions.test.ts for the admin.",
  },
  record_attendance: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "refused twice over on NULL arguments, for BOTH permitted roles — a gedu " +
      "teaches no NULL group, and no NULL child is on any group's roster, which " +
      "is the target check an admin is deliberately still bound by. Positive " +
      "paths: gedu-session-feed.test.ts for the gedu, " +
      "admin-product-sessions.test.ts for the admin.",
  },
  // The send's claim (00197). Same two-part gate as the notes writer above, and
  // the claim is the send's authorization in its own right: succeeding is what
  // lets the route go on to resolve parents' addresses with the service role.
  claim_group_session_report_email: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "for a gedu, the assignment half of the gate refuses a NULL group with a " +
      "second 42501 before the body ever looks for a session to claim; an admin " +
      "passes that half and is refused by P0021, there being no session to send. " +
      "Positive paths: gedu-session-feed.test.ts for the gedu, " +
      "admin-product-sessions.test.ts for the admin.",
  },
  set_group_notes: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "the assignment half of the gate refuses a gedu's NULL group with a " +
      "second 42501. An admin passes it and updates zero rows, so the " +
      "annotation is carried for the gedu alone — it is per function, not per " +
      "role. Positive paths: gedu-session-feed.test.ts for the gedu, " +
      "admin-product-sessions.test.ts for the admin.",
  },
  set_site_notes: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "a gedu runs no product at a NULL location, so the site half of the gate " +
      "refuses them with a second 42501. An admin passes it and is refused by " +
      "the NOT NULL primary key of site_details instead, which is a different " +
      "error rather than a forbidden one. Positive paths: " +
      "gedu-session-feed.test.ts for the gedu, admin-product-sessions.test.ts " +
      "for the admin.",
  },
  // The two game-username writers, widened to admins by 00205 — the last pair
  // on this surface to be, and for the reason the rest were: the admin group
  // details page renders the gedu workspace's roster body unchanged, and that
  // roster carries an inline username editor. A surface that draws the control
  // has to serve it. The widening grants an admin nothing new — the same edit is
  // already theirs on /admin/users/[id], on any user and with no group involved
  // — so what moved is which surface the action is reachable from, not who may
  // take it.
  set_group_member_minecraft: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "no NULL child participates in a group the caller teaches, so for a gedu " +
      "the group half of the gate refuses with a second 42501. An admin passes " +
      "that half and is refused by the target-role check instead — no NULL " +
      "profile is a gamer — which is 23514 rather than a forbidden one, so the " +
      "annotation is carried for the gedu alone; it is per function, not per " +
      "role. Positive paths: gedu-session-feed.test.ts for both roles.",
  },
  // The Roblox twin (00195). Same guard, same scope check, same target role
  // check — and therefore the same reason its permitted half cannot be asserted
  // on NULL arguments. Widened in the same change as its twin, deliberately:
  // one roster editor serves both platforms, so widening one alone would ship a
  // control that saves on a Minecraft group and refuses on a Roblox one.
  set_group_member_roblox: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "no NULL child participates in a group the caller teaches, so for a gedu " +
      "the group half of the gate refuses with a second 42501. An admin passes " +
      "that half and is refused by the target-role check instead, which is " +
      "23514. Positive paths: gedu-session-feed.test.ts for both roles.",
  },

  // --- the member flair ----------------------------------------------------
  //
  // The two staff-only marks a gedu meets before a session starts (00203): the
  // newcomer badge's join stamp and the per-(group, member) note. Both admit an
  // ADMIN beside any gedu assigned to ANY group of the group's product, with
  // full read/write parity between the two — a substitute standing in for
  // another group is exactly the person who needs the note. So the negative
  // half of the matrix is the interesting one here: a customer and a gamer are
  // refused on the first statement, which is what makes the flair gated by data
  // access rather than by a viewer prop a refactor could drop.
  get_group_staff_overlay: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "a NULL group is a group no gedu teaches, so the ownership half of the " +
      "gate refuses one with a second 42501. An admin passes that half and gets " +
      "a null-shaped document back rather than a refusal, so the annotation is " +
      "carried for the gedu alone — it is per function, not per role. Positive " +
      "path, for both roles: member-flair.test.ts.",
  },
  set_gamer_group_note: {
    permittedRoles: ["gedu", "admin"],
    permittedAlsoForbiddenOnNullArgs:
      "refused twice over on NULL arguments, for BOTH permitted roles — no " +
      "gedu teaches the product of a NULL group, and no NULL participant sits " +
      "in a NULL group, which is the target check an admin is deliberately " +
      "still bound by. That target check is also what stands in for a " +
      "write-IDOR loop entry, the notes table carrying no write grant for any " +
      "client role. Positive path, for both roles: member-flair.test.ts.",
  },

  // --- the guard primitives themselves -------------------------------------
  // Exposed to `authenticated` because create_product is SECURITY INVOKER, so
  // its guard runs as the caller (see migration 00120; update_product was
  // elevated to DEFINER by 00171 and no longer needs the grant, but its
  // sibling still does). They are role-gated by definition, so the matrix
  // covers them like any other.
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
    why: "read predicate behind the product policies; anon-reachable on purpose, and its anon branch returns true only for products in a published status (pending/running). Since 00168 it does not ask about is_visible — that column decides whether a product is LISTED on the browse pages, and an unlisted product is deliberately readable by direct link, so the public branch is bounded by status alone",
  },
  has_active_participation_on_product: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "answers only 'am I a party to an active participation on X', bounded to the caller's uid; consumed by the customer-side assignment policy",
  },
  has_active_participation_in_group: {
    scopeTest: "tests/db/exposed-function-scope.test.ts",
    why: "the group-level sibling of the above; consumed by the customer- and gamer-side group policies",
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
  get_my_family_product_feed: {
    scopeTest: "tests/db/family-product-feed.test.ts",
    why: "the family club/camp/event page, keyed on ONE participation. Two roles reach the same document — the participation's participant, and any parent linked to them — so a role guard could only name both and would prove nothing; the real gate is the ownership predicate, which is keyed entirely to auth.uid(). Since 00173 that participant may be an adult holding a seat of their own, in which case the first arm of the same predicate matches directly and the parent-link fallback is never reached. A row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. The scope test is where the interesting half lives: a sibling in the SAME group is refused (the key is the participation, not the group), a parent of another family is refused, a child cannot read their own parent's seat in the group they share, and the document's attendance field carries one answer — the named participant's — rather than a roster map",
  },
  submit_my_feedback: {
    scopeTest: "tests/db/feedback-submission.test.ts",
    why: "writes a feedback row for auth.uid(); no parameter names a user, and every role may send feedback",
  },
  request_my_verification_email: {
    scopeTest: "tests/db/verification-email-rate-limit.test.ts",
    why: "the rate-limit gate on the verification-email send, and the same shape as submit_my_feedback one table over: it takes no argument at all, so the row it writes and the rows it counts are alike keyed to auth.uid() and a caller can neither spend nor clear anyone else's hourly allowance. No role gate by design — every role with a real inbox may ask for the mail, and the route is what excludes gamers, because the reason to exclude them is that nobody reads their synthetic address rather than anything about authority",
  },
  get_waitlist_position: {
    scopeTest: "tests/db/waitlist-admin.test.ts",
    why: "owner-authorized: returns NULL rather than a position for a row the caller neither purchased nor is the gamer on",
  },
  get_my_waitlist_positions: {
    scopeTest: "tests/db/waitlist-self-service.test.ts",
    why: "takes no argument at all: the set it answers with is defined by auth.uid() on the row's two owner columns, so rows ahead of the caller in a queue are counted but never returned",
  },
  leave_my_waitlist_spot: {
    scopeTest: "tests/db/waitlist-self-service.test.ts",
    why: "the only write here: both the lookup and the DELETE carry customer_id = auth.uid(), and a row belonging to someone else is answered identically to one that does not exist",
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
  search_locations: {
    scopeTest: "tests/db/location-search.test.ts",
    why: "SECURITY INVOKER over `locations` and, since 00165, `postal_codes` — two tables of public reference data whose policies grant every row to anon and authenticated alike, so the caller's own RLS decides every row it can see exactly as a direct select would. It cannot answer with anything a plain read of either table would not already return, and the scope test proves an anonymous caller and a privileged one get the identical answer. Self-scoping by the same reading as can_read_product: the scope is the caller's, not a uid the arguments could aim elsewhere. Its arguments — needle, levels, page size and, since 00155, an optional country — only ever NARROW that set; none of them names a user or widens what the caller's own RLS already permits",
  },
  // The three fold primitives below are a third shape the category has to
  // admit, and the widest reading of it: they read *no table at all*. Each is a
  // pure function of its arguments — strip diacritics, return a constant
  // separator, join a row's searchable strings — holding no privilege and
  // exposing nothing a caller did not pass in. There is no scope to escape
  // because there is no data behind them.
  //
  // They are granted rather than hidden because both paths that reach them are
  // privilege-checked as the *caller*: `search_locations` is SECURITY INVOKER
  // and folds its needle with them, and `locations.search_blob` is a generated
  // column whose expression Postgres evaluates under the privileges of whoever
  // writes the row. Revoking them does not hide anything; it only makes search
  // fail with 42501 and blocks every admin write to `locations`.
  immutable_unaccent: {
    scopeTest: "tests/db/search-fold-agreement.test.ts",
    why: "pure text→text fold, reads nothing; reachable because search_locations is SECURITY INVOKER and folds the needle with it",
  },
  location_search_separator: {
    scopeTest: "tests/db/search-fold-agreement.test.ts",
    why: "returns one constant control character, reads nothing; reachable because search_locations builds its LIKE patterns from it",
  },
  location_search_blob: {
    scopeTest: "tests/db/search-fold-agreement.test.ts",
    why: "folds the strings it is handed into one delimited blob, reads nothing; reachable because the locations.search_blob generated column evaluates it under the writing role's privileges, so an admin creating a venue needs it",
  },
};

/**
 * Views `authenticated` may select from, and why each is self-scoping.
 *
 * The same classification as SELF_SCOPING, one object class over. A view has no
 * body to guard and no arguments to aim, so "role-gated" has no meaning for one —
 * the only question it can be asked is whether the caller's own RLS decides its
 * rows, which is `security_invoker` plus the policies on everything it selects
 * from. access-control.test.ts pins the flag; that is the *intention*. This
 * registry is what pins the *property*, because it forces every view to arrive
 * named to a test that shows two callers getting the answers their own policies
 * allow and nothing more.
 */
const SELF_SCOPING_VIEWS: Record<string, { scopeTest: string; why: string }> = {
  user_search_index: {
    scopeTest: "tests/db/user-search-index.test.ts",
    why: "security_invoker = true over `profiles`, `minecraft_accounts` and `roblox_accounts`, so the caller's own RLS decides every row exactly as a direct select of those three tables would. It cannot answer with anything a plain read of them would not already return — the search_blob is assembled from columns the caller can see or from nothing at all, because a row filtered out of a join contributes NULL rather than a leak. It carries no arguments at all, so there is nothing for a caller to aim at another user: the needle is an ordinary filter applied to whatever set RLS already handed them. The scope test is where the interesting half lives: from the identical query, a customer reaches their own linked gamer by that child's game handle and cannot reach another customer at all, and a second customer with no relationship to the child cannot find them by the same handle",
  },
};

/**
 * Functions `anon` may execute.
 *
 * `can_read_product` is the product read policies' own predicate — those
 * policies are `TO anon, authenticated`, so anon evaluates it itself.
 * `search_locations` is reached by the public educator registration page before
 * any account exists; it is SECURITY INVOKER over two tables anon already holds
 * SELECT on for every row — `locations`, and `postal_codes` since 00165 gave the
 * search a postal match arm — so it narrows that surface rather than widening it.
 * Migration 00155 replaced its three-argument signature with a four-argument
 * one (the optional country filter) — a new object with no privileges of its
 * own, which is why that migration re-issues this grant in full. The allowlist
 * keys on the name, so it covers whichever signature is live; the guarantee it
 * rests on is unchanged, because the new argument only narrows the result.
 *
 * `immutable_unaccent` and `location_search_separator` are here because
 * `search_locations` calls them and runs as its caller — granting the entry
 * point alone yields 42501 on the first anonymous search. Both are pure
 * functions over their arguments that read no table, so anon reaching them
 * exposes nothing; `location_search_blob` is deliberately *not* here, because
 * only the write path needs it and anon never writes to `locations`.
 */
const ANON_ALLOWLIST = new Set([
  "can_read_product",
  "search_locations",
  "immutable_unaccent",
  "location_search_separator",
]);

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
  // Proof that an address reaches its owner. A marker its own subject can set
  // says only that they wanted it to say something, so the column is written
  // exclusively by the service-role verify route (00186).
  ["profiles", "email_verified_at"],
  // Certification gates gedu group assignment and voice-room moderation; the
  // audit columns are stamped server-side by set_gedu_certified.
  ["gedu_profiles", "certified"],
  ["gedu_profiles", "certified_at"],
  ["gedu_profiles", "certified_by"],
  // The criminal record check gates nothing, but it is an admin's statement
  // about the person whose row it sits on — writable, it would let an educator
  // certify their own background check to whoever reads the queue. Its audit
  // pair is stamped server-side by set_gedu_criminal_record_check.
  ["gedu_profiles", "criminal_record_check_passed"],
  ["gedu_profiles", "criminal_record_check_at"],
  ["gedu_profiles", "criminal_record_check_by"],
  // Enrollment state — a writable status is a free seat.
  ["participations", "status"],
  ["participations", "customer_id"],
  ["participations", "participant_id"],
  ["participations", "group_id"],
  // The Checkout Session that paid for the seat: writable, it would let one
  // family point a seat at another family's payment — and it is what the paid
  // confirmation page and the webhook's own replay check both key on.
  ["participations", "stripe_checkout_session_id"],
  // Money.
  ["payments", "amount_cents"],
  ["family_subscriptions", "status"],
  ["family_subscriptions", "current_period_end"],
  // Not money, but a capability: the billing-portal route turns this id into a
  // Stripe session with saved cards and invoice history, so a writable column
  // would let a parent repoint their own row at another family's customer.
  ["family_subscriptions", "stripe_customer_id"],
  // Seat accounting — the rollup the capacity gate reads.
  ["product_seat_counts", "active_count"],
  ["product_seat_counts", "waitlist_count"],
  // The parent PIN hash.
  ["customer_profiles", "pin_hash"],
];

/**
 * The only table whose UPDATE surface is column-scoped rather than table-wide.
 * Pinned exactly: these are the safe profile fields a user may edit — identity
 * and presentation, nothing that decides what they may do. `locale` joined them
 * in Phase 3 when the locale route stopped writing through the service-role
 * client; `home_location_id` in 00137, and it stays on the safe side of that
 * line — it is a reference to public, anon-readable seeded geography, it gates
 * nothing, and its FK is the only thing constraining what it may hold.
 */
const PROFILES_UPDATABLE_COLUMNS = [
  "first_name",
  "last_name",
  "phone",
  "spoken_languages",
  "locale",
  "home_location_id",
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

/**
 * `kind` is carried here even though the completeness checks below never branch
 * on it: `_list_views` returns both plain and materialized views, and a matview
 * is *more* in need of a classification than a view, not less. Whether the ban
 * on them holds is access-control.test.ts's question; if one ever slipped past
 * that check while holding a Data API grant, this registry would still demand a
 * scope test for it rather than let the relkind decide who has to answer.
 *
 * The enum rather than a string is for the same reason as there — the column is
 * a two-arm CASE with no ELSE, so an unrecognised relation class arrives NULL
 * and fails the parse instead of being read as an ordinary view.
 */
const viewSurfaceRows = z.array(
  z.object({
    view_name: z.string(),
    kind: z.enum(["view", "materialized view"]),
    security_invoker: z.boolean(),
    authenticated_select: z.boolean(),
    anon_select: z.boolean(),
  })
);

type ViewSurface = z.infer<typeof viewSurfaceRows>[number];

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
  let exposedViews: ViewSurface[];
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

    const views = await admin.rpc("_list_views");
    expect(views.error).toBeNull();
    // `anon` counts as exposure just as it does for a function: a view either
    // Data API role can read is a view the caller's RLS has to be the only
    // thing standing between them and its rows.
    //
    // Both flags are measured per column by `_list_views`, which is what makes
    // this filter say what it means. `has_table_privilege` is false for a role
    // holding only `GRANT SELECT(col) ON v` — a grant PostgREST will happily
    // answer a read against — so measuring exposure that way would have let a
    // column-granted view arrive with no entry here and no scope test, which is
    // precisely the hole this registry exists to close.
    exposedViews = viewSurfaceRows
      .parse(views.data)
      .filter((view) => view.authenticated_select || view.anon_select);

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

    // The same three questions asked of views. They are separate `it`s rather
    // than extra branches inside the function trio because the two surfaces come
    // from different catalogs and fail for different reasons — a view that lost
    // its grant and a function that was dropped want to be told apart in the
    // report, not summed.

    it("every view exposed to authenticated is classified", () => {
      const unclassified = exposedViews
        .map((view) => view.view_name)
        .filter((name) => !(name in SELF_SCOPING_VIEWS));

      expect(
        unclassified,
        "a newly exposed view must be added to SELF_SCOPING_VIEWS with a scope " +
          "test — `security_invoker` says the author meant the caller's RLS to " +
          "decide the rows, and only a test shows that it does"
      ).toEqual([]);
    });

    it("every classified view is actually exposed", () => {
      // The reverse direction, and it is not bookkeeping: a view that was
      // dropped or had its SELECT grant revoked leaves an entry behind that
      // reads as coverage while covering nothing, so the next view added under
      // that name inherits a vetting it never earned.
      const exposedNames = new Set(exposedViews.map((view) => view.view_name));
      const stale = Object.keys(SELF_SCOPING_VIEWS).filter(
        (name) => !exposedNames.has(name)
      );

      expect(
        stale,
        "a classified view is gone or no longer readable by anon/authenticated"
      ).toEqual([]);
    });

    it("every classified view names a scope test that exercises it", () => {
      const offenders: string[] = [];

      for (const [name, entry] of Object.entries(SELF_SCOPING_VIEWS)) {
        const file = join(process.cwd(), entry.scopeTest);
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path is a repo-relative literal from the SELF_SCOPING_VIEWS table above, not input; reading it is the point of the check
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
        "a view is vetted by its scope test and nothing else"
      ).toEqual([]);
    });
  });
});
