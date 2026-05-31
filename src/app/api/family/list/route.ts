import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFamilyWithAdmin } from "@/services/family/family.server";

/**
 * Return every member of the caller's family unit (the caller themselves,
 * any linked parent(s), and every gamer linked to any of those parents).
 *
 * Used by the dashboard profile selector. Service-role read so a gamer can
 * see their siblings — RLS otherwise restricts gamers to seeing only their
 * own parent_gamer rows. The resolution itself lives in
 * `resolveFamilyWithAdmin`, shared with the /select-profile RSC prefetch;
 * identity is the `requireRole`-verified `user.id`, never request input.
 */
export async function GET() {
  // allowUnverified: the profile chooser (/select-profile) and the lock gate
  // both need the family list while the customer session is still locked, so
  // the parent can see and switch to a gamer without first entering the PIN.
  const auth = await requireRole(["customer", "gamer"], { allowUnverified: true });
  if (auth instanceof NextResponse) return auth;
  const { user, profile } = auth;

  try {
    const family = await resolveFamilyWithAdmin(createAdminClient(), user.id, profile.role);
    return NextResponse.json({ family });
  } catch (error) {
    console.error("family/list: failed to resolve family", error);
    return NextResponse.json({ error: "Failed to load family" }, { status: 500 });
  }
}
