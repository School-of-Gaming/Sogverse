/**
 * Every reader of gedu assignments, and whether it means the staff now or the
 * staff at a session.
 *
 * An assignment (a `gedu_group_assignments` row) is a period that ends and
 * stays, so a read that never asks about `started_at` and `ended_at` sees the
 * gedus taken off a group as well as the ones still on it. This registry is
 * where each read says which of the two it means;
 * `tests/unit/assignment-reader-completeness.test.ts` fails on a read that is
 * missing from it and on an entry whose read is gone.
 *
 * - `current`: the gedus on the group now — only periods whose `ended_at` is
 *   null. An ended period read here keeps a removed gedu's access or shows them
 *   as staff.
 * - `at-session`: the gedus at a session — the period containing the session's
 *   start instant, through `group_assignments_at`, or every period handed out
 *   with its bounds for the reader to apply that rule per session.
 * - `writer`: starts, ends or guards periods; what it touches is decided by the
 *   caller or the row it was handed.
 * - `own-history`: a gedu's own rows, every period, ended ones included.
 */

export type AssignmentReadKind = "current" | "at-session" | "writer" | "own-history";

export interface AssignmentRead {
  kind: AssignmentReadKind;
  why: string;
}

/**
 * Database readers, keyed `function:<name>`, `view:<name>` or
 * `policy:<table>.<name>`: every one whose definition in `supabase/schema/`
 * names `gedu_group_assignments` or calls `group_assignments_at` outside a
 * comment, and every policy on `gedu_group_assignments` itself.
 */
export const DB_ASSIGNMENT_READERS: Record<string, AssignmentRead> = {
  // --- current -------------------------------------------------------------
  "function:chat_channel_roster_ids": { kind: "current", why: "the chat roster is the staff on the product now: an ended period would keep a removed gedu in the channel" },
  "function:claim_group_session_report_email": { kind: "current", why: "the send gate admits the group's current gedus; an ended gedu's own windowed sessions come through the rule-6 arm, never through an unfiltered read of their ended period" },
  "function:gedu_assigned_products": { kind: "current", why: "My SOG's cards are the groups held now; an ended gedu's card comes from the rule-6 arm while its window is open, so an unfiltered read would keep it forever" },
  "function:gedu_assignment_summaries": { kind: "current", why: "the summaries follow the cards: current periods, plus the rule-6 arm for an ended gedu still in its window; an unfiltered read would never let the card leave" },
  "function:gedu_teaches_group": { kind: "current", why: "the group-wide staff gate: an ended period would keep a removed gedu in the workspace" },
  "function:gedu_teaches_group_product": { kind: "current", why: "the product-wide staff gate: an ended period would keep a removed gedu reaching every group of the product" },
  "function:get_admin_dashboard": { kind: "current", why: "the unstaffed-groups figures ask who staffs a group now: a group whose only gedu was removed would read as staffed" },
  "function:get_gedu_assigned_product": { kind: "current", why: "the caller's own group and each group's gedus are the staff now: an ended period would resolve a removed gedu to their old group" },
  "function:get_my_family_product_feed": { kind: "current", why: "a family's page names the group's gedus now: an ended period would show a gedu who left" },
  "function:get_product_groups_with_details": { kind: "current", why: "the admin groups panel edits who staffs a group now: an ended period would list a removed gedu as still on it" },
  "function:get_trainee_assigned_product": { kind: "current", why: "the trainee's product page names each group's gedus now: an ended period would show a gedu who left" },
  "function:is_voice_group_member": { kind: "current", why: "voice admits the staff on the product now: an ended period would let a removed gedu into the room" },
  "function:is_voice_group_moderator": { kind: "current", why: "voice moderation goes to the staff on the product now: an ended period would let a removed gedu moderate" },
  "function:set_group_member_minecraft": { kind: "current", why: "a gedu edits a gamer's account through a group they staff now: an ended period would let a removed gedu edit it" },
  "function:set_group_member_roblox": { kind: "current", why: "a gedu edits a gamer's account through a group they staff now: an ended period would let a removed gedu edit it" },
  "function:set_site_notes": { kind: "current", why: "a gedu writes a site's notes through a product they staff there now: an ended period would let a removed gedu write them" },
  "function:validate_one_gedu_seat_per_product": { kind: "current", why: "a trainee seat is refused beside a current assignment only: an ended period would bar a gedu taken off a product from shadowing it" },
  "view:product_list_facets": { kind: "current", why: "the product list's staff facet is who is on a product now: an ended period would list a removed gedu as one of its educators" },
  "policy:gedu_group_assignments.customers_read_assignments_via_gamers": { kind: "current", why: "a family reads who staffs their gamer's product now: an ended period would show a gedu who left" },
  "policy:product_groups.gedus_read_assigned_groups": { kind: "current", why: "a gedu reads the groups they staff now; the substitute arm carries rule 6 separately, so an ended period here would open the group for ever" },

  // --- at-session ----------------------------------------------------------
  "function:file_session_substitution_request": { kind: "at-session", why: "the role substituted is the filer's period containing the session; the current role would misprice a session taught before a role change" },
  "function:gedu_holds_seat_at_session": { kind: "at-session", why: "the derivation sentence itself: assigned to the group at that session, the period containing its start" },
  "function:gedu_invoicing_document": { kind: "at-session", why: "pay is per session, by the period containing it: current periods only would drop a removed gedu's past month, and periods unbounded would pay a gedu for sessions before they joined" },
  "function:get_admin_product_sessions": { kind: "at-session", why: "hands every period with its bounds, so each session shows who was assigned at it; current only would rewrite past sessions with today's staff" },
  "function:get_admin_session_feedback": { kind: "at-session", why: "the gedus owed feedback on a session are those assigned at it, with that period's role; current only would chase a gedu added after the session and drop one removed since" },
  "function:get_gedu_group_feed": { kind: "at-session", why: "hands every period with its bounds, so each session card shows who was assigned at it; current only would rewrite past sessions with today's staff" },
  "function:get_trainee_group_feed": { kind: "at-session", why: "hands every period with its bounds, so each session card shows who was assigned at it; current only would rewrite past sessions with today's staff" },
  "function:group_assignments_at": { kind: "at-session", why: "the one containment rule, started_at <= at < ended_at, that every at-session read goes through" },
  "function:set_session_substitution": { kind: "at-session", why: "the absent gedu must be assigned at the session, and the role substituted is that period's; the current period would refuse a past session or misprice it" },

  // --- writer --------------------------------------------------------------
  "function:apply_group_changes": { kind: "writer", why: "ends and starts periods, reading the current one of the (group, gedu) it was handed to decide between a no-op, a role change and a new period" },
  "function:validate_gedu_assignment_periods": { kind: "writer", why: "the trigger refusing overlapping periods of one (gedu, product): it reads every period, ended ones included, because overlap with history is the defect" },
  "policy:gedu_group_assignments.admin_full_access_gedu_assignments": { kind: "writer", why: "admits an admin to every row, any period: which periods a read means is the reader's own filter, each classified here" },

  // --- own-history ---------------------------------------------------------
  "policy:gedu_group_assignments.gedus_read_own_assignments": { kind: "own-history", why: "a gedu reads every period of their own, ended ones included: their history is theirs, and each reader on top says which periods it means" },
};

export interface TsAssignmentRead extends AssignmentRead {
  /** The function or handler the read sits in; it must appear before the read. */
  in: string;
}

/**
 * TypeScript readers under `src/`, by file, in the order they appear in it: every
 * `.from("gedu_group_assignments")` and embed of the table in a select string.
 */
export const TS_ASSIGNMENT_READERS: Record<string, readonly TsAssignmentRead[]> = {
  "src/app/api/voice/token/route.ts": [
    { in: "admitGedu", kind: "current", why: "voice admits the staff on the product now: an ended period would let a removed gedu into the room" },
  ],
  "src/services/admin-business/admin-business.service.ts": [
    { in: "readAssignments", kind: "current", why: "certified gedus assigned to a running product are counted now: an ended period would count a gedu taken off it" },
  ],
  "src/services/assignments/assignments.service.ts": [
    { in: "buildAdminAssignmentSeatsQuery", kind: "current", why: "the admin user page lists the groups a gedu holds now: an ended period would show every group they ever held as a seat" },
  ],
  "src/services/products/products.service.ts": [
    { in: "geduSeatProductIds", kind: "current", why: "the product list's gedu filter is who is on a product now: an ended period would list a removed gedu's old products" },
  ],
};
