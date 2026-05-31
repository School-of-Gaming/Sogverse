import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserWithProfile } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/constants/roles";
import { SelectProfileHeader, SelectProfileView } from "@/components/select-profile";
import { resolveFamilyWithAdmin } from "@/services/family/family.server";
import type { FamilyMember } from "@/services/family";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selectProfile");
  // `absolute` skips the root layout's "%s | Sogverse" template — the title
  // already contains "Sogverse", and the templated version reads as a stutter.
  return { title: { absolute: t("title") } };
}

/**
 * Family profile selector — "Who is entering Sogverse?"
 *
 * Two entry points share this page:
 *   1. Post-sign-in interstitial for parents (set by `ROLE_POST_LOGIN_PATHS`).
 *   2. In-session switcher for parents *and* gamers, reached by clicking the
 *      header avatar — lets a gamer hop to a sibling or back to the parent.
 *
 * Lives at the top of the app tree (not inside any (group)) so it doesn't
 * inherit the standard `(public)` / `(dashboard)` chrome. The route renders
 * its own minimal header (no nav, non-clickable mark, locale picker, inert
 * avatar) — the same chrome-replacement pattern the `(voice)` group uses.
 *
 * Routing: the proxy already bounces unauthenticated visitors to /login. Here
 * we additionally short-circuit admins/gedus to their own dashboards — the
 * family selector only makes sense for parent/gamer households.
 */
export default async function SelectProfilePage() {
  const userWithProfile = await getUserWithProfile();
  const role = userWithProfile?.profile?.role as UserRole | undefined;

  // The `!userWithProfile` arm is redundant at runtime (a null profile means
  // `role` is undefined, which already fails the role check) but it narrows
  // `userWithProfile` to non-null for the prefetch below.
  if (!userWithProfile || (role !== "customer" && role !== "gamer")) {
    redirect(role ? ROLE_DASHBOARD_PATHS[role] : ROUTES.customer.dashboard);
  }

  // "Continue as me" target: the viewer's own dashboard.
  const selfDashboardPath = ROLE_DASHBOARD_PATHS[role];
  const initialFamily = await getInitialFamily(userWithProfile.user.id, role);

  return (
    <>
      <SelectProfileHeader />
      {/* Pull main up under the sticky header so the centering math runs
          against the full viewport, not viewport-minus-header. Same trick
          the home hero uses (`src/app/(public)/page.tsx`) — visual center
          of the body lands at 50vh instead of below the header. Symmetric
          py-12 keeps the centering true; the body content is small enough
          (title + one row of tiles) that it never reaches the header zone. */}
      <main className="-mt-[var(--header-height)] flex min-h-screen items-center justify-center px-4 py-12 sm:py-16">
        <SelectProfileView selfDashboardPath={selfDashboardPath} initialFamily={initialFamily} />
      </main>
    </>
  );
}

/**
 * Server-prefetch the viewer's family so the selector paints fully populated
 * the instant the page loads — same hydrate-from-prefetch shape as the parent
 * dashboard. Uses the admin client because this page serves gamers too, and a
 * gamer must see siblings that RLS hides (see `resolveFamilyWithAdmin`).
 * Identity comes from the `getClaims()`-verified `getUserWithProfile()` above,
 * never request input. Returns `[]` on any failure; the client `useFamily`
 * refetches on mount, so the selector still renders.
 */
async function getInitialFamily(
  userId: string,
  role: "customer" | "gamer",
): Promise<FamilyMember[]> {
  try {
    return await resolveFamilyWithAdmin(createAdminClient(), userId, role);
  } catch {
    return [];
  }
}
