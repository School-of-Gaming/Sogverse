import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
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
 */
export const GET = defineRoute({
  posture: "role-gated",
  roles: ["customer", "gamer"],
  allowUnverified: true,

  // A resolver failure was already answered generically here; it now goes
  // through the shared catch, which logs it with the route path attached.

  handler: async ({ user, profile }) => {
    const family = await resolveFamilyWithAdmin(
      createAdminClient(),
      user.id,
      profile.role,
    );
    return { family };
  },
});
