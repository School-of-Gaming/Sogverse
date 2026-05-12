import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getUserWithProfile } from "@/lib/supabase/server";
import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS, type UserRole } from "@/lib/constants/roles";
import { SelectProfileHeader, SelectProfileView } from "@/components/select-profile";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("selectProfile");
  // `absolute` skips the root layout's "%s | Sogverse" template — the title
  // already contains "Sogverse", and the templated version reads as a stutter.
  return { title: { absolute: t("title") } };
}

/**
 * Post-sign-in interstitial for parents — "Who is entering Sogverse?"
 *
 * Lives at the top of the app tree (not inside any (group)) so it doesn't
 * inherit the standard `(public)` / `(dashboard)` chrome. The route renders
 * its own minimal header (no nav, non-clickable mark, locale picker, inert
 * avatar) — the same chrome-replacement pattern the `(voice)` group uses.
 *
 * Routing: the proxy already bounces unauthenticated visitors to /login. Here
 * we additionally short-circuit any non-customer role to their own dashboard,
 * since the family selector is parent-only in v1.
 */
export default async function SelectProfilePage() {
  const userWithProfile = await getUserWithProfile();
  const role = userWithProfile?.profile?.role as UserRole | undefined;

  if (role !== "customer") {
    redirect(role ? ROLE_DASHBOARD_PATHS[role] : ROUTES.customer.dashboard);
  }

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
        <SelectProfileView />
      </main>
    </>
  );
}
