import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { familyListResponse } from "@/services/family/family.contracts";
import { resolveFamilyWithAdmin } from "@/services/family/family.server";

/**
 * GET /api/family/list
 *
 * Return every member of the caller's family unit (the caller themselves,
 * any linked parent(s), and every gamer linked to any of those parents).
 *
 * Used by the dashboard profile selector. Service-role read so a gamer can
 * see their siblings — RLS otherwise restricts gamers to seeing only their
 * own parent_gamer rows. The resolution lives in the shared family resolver;
 * identity is the gate-verified `user.id`, never request input.
 *
 * allowUnverified: the profile chooser and the lock gate both need the family
 * list while the customer session is still locked, so the parent can see and
 * switch to a gamer without first entering the PIN.
 *
 * The payload carries two things the switcher needs to know before a tile is
 * clicked, both about what a switch will *cost*: each gamer's `sign_in` mode,
 * and the provenance of the caller's own session. Leaving a gamer session is
 * gated — a linked parent's PIN from a switched-in session, the target's own
 * password from a session the child signed into — so the surface has to render
 * the right prompt, and mark a sibling that no password can reach. Answering it
 * here rather than from a second endpoint is what keeps the switcher one fetch.
 */
export const GET = defineRoute({
  posture: "role-gated",
  roles: ["customer", "gamer"],
  allowUnverified: true,
  response: familyListResponse,

  // A resolver failure was already answered generically here; it now goes
  // through the shared catch, which logs it with the route path attached.

  handler: async ({ user, profile }) => {
    const family = await resolveFamilyWithAdmin(
      createAdminClient(),
      user.id,
      profile.role,
    );
    // Off the verified JWT the gate already read, never off the request: this
    // decides which credential a switch out of here will demand.
    return { family, session_provenance: user.session.provenance };
  },
});
