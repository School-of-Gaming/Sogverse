import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type FamilyMember = {
  id: string;
  role: "customer" | "gamer";
  first_name: string;
};

/**
 * Return every member of the caller's family unit (the caller themselves,
 * any linked parent(s), and every gamer linked to any of those parents).
 *
 * Used by the dashboard profile selector. Service-role read so a gamer can
 * see their siblings — RLS otherwise restricts gamers to seeing only their
 * own parent_gamer rows.
 */
export async function GET() {
  const auth = await requireRole(["customer", "gamer"]);
  if (auth instanceof NextResponse) return auth;
  const { user, profile } = auth;

  const admin = createAdminClient();

  const parentIds: string[] =
    profile.role === "customer" ? [user.id] : await fetchParentIds(admin, user.id);

  if (profile.role === "gamer" && parentIds.length === 0) {
    // Orphaned gamer — only themselves visible.
    return NextResponse.json({ family: await fetchProfiles(admin, [user.id]) });
  }

  const { data: links, error: linkError } = await admin
    .from("parent_gamer")
    .select("parent_id, gamer_id")
    .in("parent_id", parentIds);

  if (linkError) {
    console.error("family/list: gamer lookup failed", linkError);
    return NextResponse.json({ error: "Failed to load family" }, { status: 500 });
  }

  const ids = new Set<string>([user.id, ...parentIds]);
  for (const link of links) ids.add(link.gamer_id);

  return NextResponse.json({ family: await fetchProfiles(admin, [...ids]) });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function fetchParentIds(admin: AdminClient, gamerId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("parent_gamer")
    .select("parent_id")
    .eq("gamer_id", gamerId);
  if (error) {
    console.error("family/list: parent lookup failed", error);
    return [];
  }
  return data.map((r) => r.parent_id);
}

async function fetchProfiles(admin: AdminClient, ids: string[]): Promise<FamilyMember[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, first_name")
    .in("id", ids);
  if (error) {
    console.error("family/list: profile lookup failed", error);
    return [];
  }
  return data.filter((p): p is FamilyMember =>
    (p.role === "customer" || p.role === "gamer") && typeof p.first_name === "string",
  );
}
