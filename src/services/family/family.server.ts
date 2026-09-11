import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import type { AppSupabaseClient, GamerSignIn } from "@/types";
import type { FamilyMember } from "./family.contracts";

type AdminClient = ReturnType<typeof createAdminClient>;

type ProfileRow = { id: string; role: string | null; first_name: string | null };

/** A family member before their sign-in mode has been resolved. */
type NamedMember = Omit<FamilyMember, "sign_in">;

/**
 * Narrow raw `profiles` rows to switchable family members. The selector and My
 * Gamers grid only render customers and gamers that have a name — admins/gedus
 * and name-less rows are dropped.
 *
 * The sign-in mode lives on `gamer_profiles` rather than here, so it is
 * attached separately; a customer's is `null`, because a customer has no such
 * thing.
 */
function toNamedMembers(rows: ProfileRow[]): NamedMember[] {
  return rows.filter(
    (p): p is NamedMember =>
      (p.role === "customer" || p.role === "gamer") && typeof p.first_name === "string",
  );
}

/**
 * Stamp each member with their sign-in mode.
 *
 * A gamer with no `gamer_profiles` row cannot exist — the creation RPC writes it
 * in the same transaction as the promotion — but a missing one degrades to
 * `parent`, the switch-only mode, rather than to a mode that would advertise a
 * credential the account does not hold.
 */
function stampSignIn(
  members: NamedMember[],
  modes: Map<string, GamerSignIn>,
): FamilyMember[] {
  return members.map((member) => ({
    ...member,
    sign_in: member.role === "gamer" ? (modes.get(member.id) ?? "parent") : null,
  }));
}

/**
 * Read the sign-in modes for a set of gamers in one keyed lookup. Bounded by
 * construction: one row per id, and the ids are the family unit the caller has
 * already resolved.
 */
async function fetchSignInModes(
  admin: AdminClient,
  gamerIds: string[],
): Promise<Map<string, GamerSignIn>> {
  const modes = new Map<string, GamerSignIn>();
  if (gamerIds.length === 0) return modes;

  const { data, error } = await admin
    .from("gamer_profiles")
    .select("user_id, sign_in")
    .in("user_id", gamerIds);
  if (error) {
    console.error("resolveFamilyWithAdmin: sign-in lookup failed", error);
    return modes;
  }
  for (const row of data) modes.set(row.user_id, row.sign_in);
  return modes;
}

async function fetchParentIds(admin: AdminClient, gamerId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("parent_gamer")
    .select("parent_id")
    .eq("gamer_id", gamerId);
  if (error) {
    console.error("resolveFamilyWithAdmin: parent lookup failed", error);
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
    console.error("resolveFamilyWithAdmin: profile lookup failed", error);
    return [];
  }
  const members = toNamedMembers(data);
  const modes = await fetchSignInModes(
    admin,
    members.filter((m) => m.role === "gamer").map((m) => m.id),
  );
  return stampSignIn(members, modes);
}

/**
 * Resolve the caller's full family unit — themselves, any linked parent(s), and
 * every gamer linked to those parents — using the service-role admin client.
 *
 * The admin bypass exists for the *gamer* case: RLS otherwise restricts a gamer
 * to their own `parent_gamer` rows, so a gamer can't see siblings. Both the
 * /select-profile selector and /api/family/list need that sibling view, so they
 * share this resolver. For a customer-only view that doesn't need the bypass,
 * prefer {@link resolveCustomerFamilyViaRls}.
 *
 * SECURITY: `userId`/`role` MUST come from a server-verified source
 * (`getClaims()` / `requireRole()`), never request input. The admin client
 * bypasses RLS, so this function's own scoping (keyed on the verified `userId`)
 * is the only access gate — there is no caller-supplied identifier to tamper
 * with. Throws on the `parent_gamer` lookup failure so each caller maps it to
 * its own response (route → 500, RSC prefetch → []).
 */
export async function resolveFamilyWithAdmin(
  admin: AdminClient,
  userId: string,
  role: "customer" | "gamer",
): Promise<FamilyMember[]> {
  const parentIds = role === "customer" ? [userId] : await fetchParentIds(admin, userId);

  // Orphaned gamer (no linked parents) — only themselves is visible.
  if (role === "gamer" && parentIds.length === 0) {
    return fetchProfiles(admin, [userId]);
  }

  const { data: links, error: linkError } = await admin
    .from("parent_gamer")
    .select("parent_id, gamer_id")
    .in("parent_id", parentIds);

  if (linkError) {
    console.error("resolveFamilyWithAdmin: gamer lookup failed", linkError);
    throw new Error("Failed to load family");
  }

  const ids = new Set<string>([userId, ...parentIds]);
  for (const link of links) ids.add(link.gamer_id);

  return fetchProfiles(admin, [...ids]);
}

/**
 * Resolve a *customer's* family (themselves + their linked gamers) via the
 * caller's own RLS-scoped client — no admin bypass.
 *
 * The two `profiles` SELECT policies that apply to a customer —
 * `users_view_own_profile` (self) and `parents_view_linked_gamers` (their
 * linked gamers, see 00003_parent_gamer.sql) — OR together to exactly
 * {self, gamers}, which is what {@link resolveFamilyWithAdmin} returns for a
 * customer. So the /parent dashboard prefetch gets the same result without
 * touching the service-role key, letting Postgres RLS be the access gate.
 *
 * Customers ONLY: a gamer's RLS view hides siblings, so this would return an
 * incomplete family for them. The selector (which serves gamers) uses
 * {@link resolveFamilyWithAdmin}.
 */
export async function resolveCustomerFamilyViaRls(
  supabase: AppSupabaseClient,
): Promise<FamilyMember[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, first_name, gamer_profiles(sign_in)");
  if (error) {
    console.error("resolveCustomerFamilyViaRls: profile lookup failed", error);
    return [];
  }

  // The sign-in mode rides along as an embed on the one query the customer's own
  // policies already allow — `gamer_profiles` carries a parents-read policy over
  // the same link — so this needs neither a second round trip nor the admin
  // client, which is the whole point of this resolver existing beside the other.
  const modes = new Map<string, GamerSignIn>();
  for (const row of data) {
    if (row.gamer_profiles) modes.set(row.id, row.gamer_profiles.sign_in);
  }
  return stampSignIn(toNamedMembers(data), modes);
}
